import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { buildConsoleScript } from '../src/console-script.mjs';
import { FORM_URL } from '../src/config.mjs';
if (!process.env.PLAYWRIGHT_BROWSERS_PATH && existsSync(new URL('../.browser/', import.meta.url))) process.env.PLAYWRIGHT_BROWSERS_PATH = fileURLToPath(new URL('../.browser/', import.meta.url));
const { chromium } = await import('playwright');

test('single paste fills ETI, preserves token, validates locally, never submits; blocks early and wrong edition', async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    let requests = 0, submissions = 0;
    const fixture = await readFile(new URL('../pages/Rejestracja na parking - open.html', import.meta.url), 'utf8');
    const html = fixture.replace('Edycja Parkingi 2026 - IMIO', 'Edycja Parkingi 2026 - ETI').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<link\b[^>]*>/gi, '').replace(/<img\b[^>]*>/gi, '');
    await page.route('**/*', route => {
      requests++;
      if (route.request().method() !== 'GET') { submissions++; return route.abort(); }
      return route.fulfill({ contentType: 'text/html; charset=utf-8', body: html });
    });
    await page.goto(FORM_URL);
    for (const file of ['jquery-1.12.2.min.js.pobrane', 'jquery.validate.js.pobrane']) await page.addScriptTag({ content: await readFile(new URL('../pages/Rejestracja na parking - open_files/' + file, import.meta.url), 'utf8') });
    await page.evaluate([...fixture.matchAll(/<script type="text\/javascript">([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n'));
    await page.waitForFunction(() => !!window.jQuery('#esspg_news_parking_application_form').data('validator'));
    const source = await readFile(new URL('../src/form.js', import.meta.url), 'utf8');
    const config = { startAt: new Date(Date.now() - 1000).toISOString(), expectedEdition: 'ETI', consent: true, data: { firstname: 'Test', lastName: 'Próba', email: 'test@student.pg.edu.pl', albumNumber: '123456', phoneNumber: '123456789', faculty: 'ETI', plateNumber: 'TEST123', carBrand: 'Test', carModel: 'Test' } };
    const early = await page.evaluate(buildConsoleScript({ ...config, startAt: new Date(Date.now() + 60000).toISOString() }, source));
    assert.equal(early.filled, false);
    assert.equal(await page.locator('input[type=text]').first().inputValue(), '');
    const wrong = await page.evaluate(buildConsoleScript({ ...config, expectedEdition: 'IMIO' }, source));
    assert.equal(wrong.filled, false);
    const token = await page.locator('[type=hidden]').inputValue();
    for (let i = 0; i < 2; i++) {
      const result = await page.evaluate(buildConsoleScript(config, source));
      assert.deepEqual(result, { filled: 9, submitted: false });
    }
    assert.equal(await page.locator('select').inputValue(), 'ETI');
    assert.equal(await page.locator('#rodo').isChecked(), true);
    assert.equal(await page.locator('[type=hidden]').inputValue(), token);
    assert.equal(await page.evaluate(() => window.jQuery('#esspg_news_parking_application_form').valid()), true);
    assert.equal(submissions, 0);
    assert.equal(requests, 1); // Only the mocked initial GET, nothing from the pasted script.
    assert.equal(await page.evaluate(() => typeof window.parkingFill), 'undefined');
  } finally { await browser.close(); }
});
