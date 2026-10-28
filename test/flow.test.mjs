import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { parseConfig, FORM_URL } from '../src/config.mjs';
import { waitForEdition, submissionGuard, submitOnce } from '../src/flow.mjs';
import { classify } from '../src/result.mjs';
if (!process.env.PLAYWRIGHT_BROWSERS_PATH && existsSync(new URL('../.browser/', import.meta.url))) process.env.PLAYWRIGHT_BROWSERS_PATH = fileURLToPath(new URL('../.browser/', import.meta.url));
const { chromium } = await import('playwright');
const config = { startAt: '2026-10-24T17:00:00+02:00', expectedEdition: 'ETI', consent: true, data: { firstname: 'Test', lastName: 'Test', email: 'test@student.pg.edu.pl', albumNumber: '123456', phoneNumber: '123456789', faculty: 'ETI', plateNumber: 'TEST123', carBrand: 'Test', carModel: 'Test' } };

test('config accepts ETI and BOM, rejects invalid fields without exposing their values', () => {
  assert.equal(parseConfig('\uFEFF' + JSON.stringify(config)).data.faculty, 'ETI');
  for (const changed of [{ ...config, startAt: '2026-10-24T17:00:00' }, { ...config, consent: false }, { ...config, expectedEdition: 'IMIO' }, { ...config, data: { ...config.data, faculty: 'WETI' } }, { ...config, data: { ...config.data, albumNumber: 123456 } }]) assert.throws(() => parseConfig(JSON.stringify(changed)));
});

test('first refresh at start, previous edition ignored, exact time gate', async () => {
  let clock = 0;
  const times = [];
  const states = [{ hasForm: true, heading: 'Edycja Parkingi 2026 - IMIO' }, { hasForm: true, heading: 'Edycja Parkingi 2026 - ETI' }];
  const fake = { waitForTimeout: async ms => { clock += ms; }, goto: async () => { times.push(clock); return { status: () => 200 }; }, evaluate: async () => states.shift(), isClosed: () => false };
  await waitForEdition(fake, { ...config, startAt: new Date(1000).toISOString() }, { now: () => clock, pollMs: 1000, log: () => {} });
  assert.deepEqual(times, [1000, 2000]);
});

test('temporary read error retries only GET; missing edition eventually times out', async () => {
  let clock = 1000, calls = 0;
  const fake = { waitForTimeout: async ms => { clock += ms; }, goto: async () => { calls++; throw new Error('offline'); }, isClosed: () => false };
  await assert.rejects(waitForEdition(fake, { ...config, startAt: new Date(0).toISOString() }, { now: () => clock, pollMs: 100, timeoutMs: 300, log: () => {} }), /limit/);
  assert.equal(calls, 3);
});

function mockRoute(method = 'POST', url = FORM_URL) {
  const frame = { page: () => ({ mainFrame: () => frame }) };
  const result = { continued: 0, aborted: 0 };
  return { result, request: () => ({ method: () => method, url: () => url, isNavigationRequest: () => true, frame: () => frame }), continue: async () => { result.continued++; }, abort: async () => { result.aborted++; } };
}

test('network guard blocks early, unarmed, foreign and duplicate POST, even concurrently', async () => {
  let clock = 999;
  let records = 0;
  const guard = submissionGuard({ start: 1000, enabled: true, now: () => clock, beforeSend: async () => { records++; await Promise.resolve(); } });
  guard.state.armed = true;
  const early = mockRoute(); await guard.route(early); assert.equal(early.result.aborted, 1);
  clock = 1000;
  const foreign = mockRoute('POST', 'https://example.invalid'); await guard.route(foreign); assert.equal(foreign.result.aborted, 1);
  guard.state.armed = false;
  const unarmed = mockRoute(); await guard.route(unarmed); assert.equal(unarmed.result.aborted, 1);
  guard.state.armed = true;
  const first = mockRoute(), second = mockRoute();
  await Promise.all([guard.route(first), guard.route(second)]);
  assert.equal(first.result.continued, 1); assert.equal(second.result.aborted, 1); assert.equal(records, 1);
  const broken = submissionGuard({ start: 0, enabled: true, beforeSend: async () => { throw new Error('disk error'); } });
  broken.state.armed = true;
  const request = mockRoute(); await broken.route(request); assert.equal(request.result.aborted, 1); assert.equal(broken.state.sent, true);
});

test('full browser flow with mocked responses: closed -> IMIO -> ETI -> one POST; no real network', async () => {
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ serviceWorkers: 'block' });
    const page = await context.newPage();
    const fixture = (await readFile(new URL('../pages/Rejestracja na parking - open.html', import.meta.url), 'utf8')).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<link\b[^>]*>/gi, '').replace(/<img\b[^>]*>/gi, '');
    let gets = 0, posts = 0, persisted = 0;
    const active = { ...config, startAt: new Date(Date.now() - 100).toISOString() };
    const guard = submissionGuard({ start: Date.parse(active.startAt), enabled: true, beforeSend: async () => { persisted++; } });
    await context.route('**/*', async route => {
      // Every request is fulfilled or aborted locally. No route.continue reaches the Internet.
      await guard.route({ request: () => route.request(), abort: () => route.abort(), continue: async () => {
        if (route.request().url() !== FORM_URL) return route.abort();
        if (route.request().method() === 'GET') {
          gets++;
          return route.fulfill({ contentType: 'text/html; charset=utf-8', body: gets === 1 ? '<h2>Edycja Parkingi 2026 - IMIO</h2><p>Zamknięte</p>' : gets === 2 ? fixture : fixture.replace('Edycja Parkingi 2026 - IMIO', 'Edycja Parkingi 2026 - ETI') });
        }
        posts++;
        const body = new URLSearchParams(route.request().postData());
        assert.equal(body.get('esspg_news_parking_application_form[faculty]'), 'ETI');
        assert.ok(body.get('esspg_news_parking_application_form[_token]'));
        assert.equal(body.get('rodo'), 'on');
        return route.fulfill({ contentType: 'text/html; charset=utf-8', body: '<p>Sukces! Twoje zgłoszenie zostało przyjęte i mieści się w limicie miejsc.</p>' });
      } });
    });
    await waitForEdition(page, active, { pollMs: 10, log: () => {} });
    assert.equal(gets, 3); assert.equal(posts, 0);
    await page.evaluate(await readFile(new URL('../src/form.js', import.meta.url), 'utf8'));
    await page.evaluate(c => parkingFill(c), active);
    guard.state.armed = true;
    assert.equal(await submitOnce(page, guard), 200);
    assert.equal(classify(await page.locator('body').innerText()), 'accepted');
    assert.equal(posts, 1); assert.equal(persisted, 1);
  } finally { await browser.close(); }
});

test('HTTP 500 and lost POST response never cause a second submission', async () => {
  const browser = await chromium.launch();
  try {
    for (const lostResponse of [false, true]) {
      const context = await browser.newContext({ serviceWorkers: 'block' });
      const page = await context.newPage();
      let posts = 0;
      const guard = submissionGuard({ start: 0, enabled: true });
      guard.state.armed = true;
      await context.route('**/*', route => guard.route({ request: () => route.request(), abort: () => route.abort(), continue: async () => {
        if (route.request().url() !== FORM_URL) return route.abort();
        if (route.request().method() === 'GET') return route.fulfill({ contentType: 'text/html', body: '<form method="POST" action="' + FORM_URL + '" id="esspg_news_parking_application_form"><input type="submit"></form>' });
        posts++;
        if (lostResponse) return route.abort();
        return route.fulfill({ status: 500, contentType: 'text/html', body: 'Server error' });
      } }));
      await page.goto(FORM_URL);
      if (lostResponse) await assert.rejects(submitOnce(page, guard, 1000));
      else assert.equal(await submitOnce(page, guard, 1000), 500);
      assert.equal(posts, 1);
      assert.equal(guard.state.sent, true);
      await context.close();
    }
  } finally { await browser.close(); }
});
