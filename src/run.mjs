import { readFile, mkdir, writeFile, open, unlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { classify } from './result.mjs';
import { parseConfig, FORM_URL } from './config.mjs';
import { waitForEdition, submissionGuard, submitOnce } from './flow.mjs';

const args = process.argv.slice(2);
if (args.some(x => !['--offline', '--offline-config', '--check-config', '--submit'].includes(x))) throw new Error('Nieznana opcja');
const offline = args.includes('--offline') || args.includes('--offline-config');
const submit = args.includes('--submit');
if ((offline || args.includes('--check-config')) && submit) throw new Error('Test konfiguracji i tryb offline nie mogą wysyłać zgłoszeń');
const sample = { startAt: new Date().toISOString(), expectedEdition: 'IMIO', consent: true, data: { firstname: 'Test', lastName: 'Offline', email: 'test@student.pg.edu.pl', albumNumber: '123456', phoneNumber: '123456789', faculty: 'WIMIO', plateNumber: 'TEST123', carBrand: 'Test', carModel: 'Test' } };
const config = args.includes('--offline') ? sample : parseConfig(await readFile(new URL('../config.local.json', import.meta.url), 'utf8'));
const start = Date.parse(config.startAt);
console.log('Termin:', new Date(start).toLocaleString('pl-PL', { timeZone: 'Europe/Warsaw' }), '(Europe/Warsaw), wydział:', config.data.faculty, 'edycja:', config.expectedEdition);
if (args.includes('--check-config')) {
  console.log('Konfiguracja poprawna. Nie uruchomiono przeglądarki ani połączeń sieciowych.');
  if (Date.now() >= start) console.log('UWAGA: termin już minął; uruchomienie live zacznie od razu.');
  process.exit(0);
}
if (!process.env.PLAYWRIGHT_BROWSERS_PATH && existsSync(new URL('../.browser/', import.meta.url))) process.env.PLAYWRIGHT_BROWSERS_PATH = fileURLToPath(new URL('../.browser/', import.meta.url));
const { chromium } = await import('playwright');
const artifacts = new URL('../artifacts/', import.meta.url);
await mkdir(artifacts, { recursive: true });
const key = createHash('sha256').update(config.data.albumNumber + '|' + start + '|' + config.expectedEdition).digest('hex').slice(0, 24);
const marker = new URL(key + '.attempt.json', artifacts);
const lockPath = new URL('live.lock', artifacts);
let lock, browser, page, guard;
const stop = () => { browser?.close().catch(() => {}); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
const directory = new URL(new Date().toISOString().replace(/[:.]/g, '-') + '/', artifacts);
await mkdir(directory, { recursive: true });
try {
  if (!offline) {
    if (existsSync(marker)) throw new Error('Wykryto wcześniejszą próbę dla tej osoby i edycji. Sprawdź wynik przed ponowieniem.');
    try { lock = await open(lockPath, 'wx'); }
    catch { throw new Error('Istnieje artifacts/live.lock — inna instancja może działać. Sprawdź ją przed uruchomieniem.'); }
    await lock.writeFile(JSON.stringify({ pid: process.pid, started: new Date().toISOString() }));
  }
  browser = await chromium.launch({ headless: offline });
  const context = await browser.newContext({ serviceWorkers: 'block' });
  page = await context.newPage();
  guard = submissionGuard({ start, enabled: !offline, beforeSend: async sentAt => {
    const attempt = { sentAt, status: 'attempting', directory: fileURLToPath(directory) };
    await writeFile(marker, JSON.stringify(attempt, null, 2), { flag: 'wx' });
    await writeFile(new URL('attempt.json', directory), JSON.stringify(attempt, null, 2));
  } });
  await context.route('**/*', route => offline ? route.abort() : guard.route(route));
  if (offline) {
    // Adapt only the fixture heading. This does not verify the live edition.
    const fixture = await readFile(new URL('../pages/Rejestracja na parking - open.html', import.meta.url), 'utf8');
    const html = fixture.replace('Edycja Parkingi 2026 - IMIO', 'Edycja Parkingi 2026 - ' + config.expectedEdition)
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<link\b[^>]*>/gi, '').replace(/<img\b[^>]*>/gi, '');
    await page.setContent(html);
    for (const name of ['jquery-1.12.2.min.js.pobrane', 'jquery.validate.js.pobrane']) await page.addScriptTag({ content: await readFile(new URL('../pages/Rejestracja na parking - open_files/' + name, import.meta.url), 'utf8') });
    const inline = [...fixture.matchAll(/<script type="text\/javascript">([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n');
    await page.evaluate(inline);
    await page.waitForFunction(() => !!globalThis.jQuery('#esspg_news_parking_application_form').data('validator'));
  } else {
    console.log(submit ? 'TRYB AUTOMATYCZNY: pojedyncza wysyłka po terminie.' : 'TRYB RĘCZNY: po wypełnieniu kliknij Zapisz.');
    console.log('Do terminu wysyłanie zablokowane. O godzinie startu pobiorę świeży formularz.');
    if (Date.now() < start) await page.goto(FORM_URL, { waitUntil: 'domcontentloaded', timeout: Math.min(10000, Math.max(1, start - Date.now())) }).catch(() => {});
    await waitForEdition(page, config);
  }
  const tokenBefore = await page.locator('[type=hidden]').inputValue();
  await page.evaluate(await readFile(new URL('./form.js', import.meta.url), 'utf8'));
  const filled = await page.evaluate(({ config, offline }) => globalThis.parkingFill(config, { offline }), { config, offline });
  if (await page.locator('[type=hidden]').inputValue() !== tokenBefore) throw new Error('Token formularza został zmieniony');
  console.log('Wypełniono i zweryfikowano', filled.filled, 'pól.');
  if (offline) {
    console.log('Próba offline OK; żadnego POST. Test lokalnej kopii nie potwierdza dostępności serwera.');
  } else {
    guard.state.armed = true;
    if (submit) {
      const httpStatus = await submitOnce(page, guard);
      const message = await page.locator('body').innerText();
      const status = httpStatus >= 400 ? 'error' : classify(message);
      await writeFile(new URL('result.json', directory), JSON.stringify({ ...guard.state, httpStatus, status, receivedAt: new Date().toISOString(), message }, null, 2));
      console.log('Wynik:', status, '— sprawdź komunikat i artifacts. Brak automatycznych ponowień.');
    } else console.log('Sprawdź dane i kliknij Zapisz ręcznie (jedno wysłanie).');
  }
  await page.screenshot({ path: fileURLToPath(new URL('page.png', directory)), fullPage: true });
  if (!offline && browser.isConnected()) {
    console.log('Przeglądarka pozostaje otwarta do zamknięcia okna.');
    await new Promise(resolve => browser.on('disconnected', resolve));
  }
} catch (error) {
  console.error(guard?.state.sent ? 'Wynik niepewny — sprawdź zgłoszenie przed ponowieniem.' : 'Zatrzymano; brak dozwolonej wysyłki.', error.message);
  await writeFile(new URL('error.json', directory), JSON.stringify({ ...guard?.state, error: error.message }, null, 2));
  await page?.screenshot({ path: fileURLToPath(new URL('error.png', directory)), fullPage: true }).catch(() => {});
  process.exitCode = 1;
} finally {
  await browser?.close();
  if (lock) { await lock.close(); await unlink(lockPath).catch(() => {}); }
  process.off('SIGINT', stop);
  process.off('SIGTERM', stop);
}
