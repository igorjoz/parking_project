import { FORM_URL, FORM_ID } from './config.mjs';

export async function waitForEdition(page, config, { pollMs = 1000, timeoutMs = 300000, now = Date.now, log = console.log } = {}) {
  const start = Date.parse(config.startAt);
  while (now() < start) await page.waitForTimeout(Math.min(200, start - now()));
  const deadline = now() + timeoutMs;
  let lastState;
  // Always get a fresh page at start, even if the previous edition's form was open.
  while (now() < deadline) {
    try {
      const response = await page.goto(FORM_URL, { waitUntil: 'domcontentloaded', timeout: Math.min(10000, Math.max(1, deadline - now())) });
      if (response && response.status() >= 400) throw new Error('HTTP ' + response.status());
      const state = await page.evaluate(id => ({
        heading: [...document.querySelectorAll('h2')].map(x => x.textContent.trim()).find(x => x.includes('Edycja')) || '',
        hasForm: !!document.getElementById(id)
      }), FORM_ID);
      if (state.hasForm && state.heading.endsWith(' - ' + config.expectedEdition)) return state;
      const label = state.hasForm ? 'Czekam na edycję ' + config.expectedEdition : 'Zapisy zamknięte lub brak formularza';
      if (label !== lastState) { log(label); lastState = label; }
    } catch (error) {
      if (page.isClosed()) throw error;
      log('Błąd pobrania przed wysłaniem — ponawiam tylko odczyt strony.');
    }
    await page.waitForTimeout(Math.min(pollMs, Math.max(0, deadline - now())));
  }
  throw new Error('Nie pojawił się formularz właściwej edycji w ciągu limitu oczekiwania');
}

export function submissionGuard({ start, enabled, beforeSend = async () => {}, now = Date.now }) {
  const state = { armed: false, sent: false, blocked: 0, sentAt: null, failure: null };
  return {
    state,
    async route(route) {
      const request = route.request();
      if (['GET', 'HEAD', 'OPTIONS'].includes(request.method())) return route.continue();
      if (!enabled || !state.armed || now() < start || state.sent || request.method() !== 'POST' || request.url() !== FORM_URL || !request.isNavigationRequest() || request.frame() !== request.frame().page().mainFrame()) {
        state.blocked++;
        return route.abort();
      }
      state.sent = true; // Reserve synchronously before disk I/O to block parallel requests.
      state.sentAt = new Date(now()).toISOString();
      try { await beforeSend(state.sentAt); return await route.continue(); }
      catch (error) { state.failure = error.message; return route.abort(); }
    }
  };
}

export async function submitOnce(page, guard, timeout = 30000) {
  const responsePromise = page.waitForResponse(r => r.request().method() === 'POST' && r.url() === FORM_URL, { timeout });
  const navigationPromise = page.waitForEvent('framenavigated', { predicate: frame => frame === page.mainFrame(), timeout });
  responsePromise.catch(() => {});
  navigationPromise.catch(() => {});
  await page.locator('#' + FORM_ID + ' [type=submit]').click({ timeout: 5000 });
  const response = await responsePromise;
  await navigationPromise;
  await page.waitForLoadState('domcontentloaded', { timeout });
  if (!guard.state.sent) throw new Error('Wysyłka została zablokowana');
  return response.status();
}
