import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { classify } from '../src/result.mjs';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
if (!process.env.PLAYWRIGHT_BROWSERS_PATH && existsSync(new URL('../.browser/', import.meta.url))) process.env.PLAYWRIGHT_BROWSERS_PATH = fileURLToPath(new URL('../.browser/', import.meta.url));
const { chromium } = await import('playwright');

test('offline form: fields, token, validation and changed markup', async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    let requests = 0;
    await page.route('**/*', route => { requests++; return route.abort(); });
    const html = await readFile(new URL('../pages/Rejestracja na parking - open.html', import.meta.url), 'utf8');
    // No external resources, scripts, or live action during fixture tests.
    const sanitized = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<link\b[^>]*>/gi, '').replace(/<img\b[^>]*>/gi, '');
    await page.setContent(sanitized);
    await page.addScriptTag({ path: fileURLToPath(new URL('../src/form.js', import.meta.url)) });
    const config = { expectedEdition: 'IMIO', consent: true, data: { firstname: 'Jan', lastName: 'Test', email: 'test@student.pg.edu.pl', albumNumber: '123456', phoneNumber: '123456789', faculty: 'WIMIO', plateNumber: 'TEST', carBrand: 'Test', carModel: 'Test' } };
    const token = await page.locator('[type=hidden]').inputValue();
    assert.equal((await page.evaluate(c => parkingFill(c, { offline: true }), config)).filled, 9);
    assert.equal(await page.locator('[type=hidden]').inputValue(), token);
    assert.equal(await page.locator('#rodo').isChecked(), true);
    assert.equal(await page.locator('select').inputValue(), 'WIMIO');
    for (const changed of [{ ...config, consent: false }, { ...config, expectedEdition: 'ETI' }, { ...config, data: { ...config.data, albumNumber: '123' } }, { ...config, data: { ...config.data, email: 'test@example.com' } }, { ...config, data: { ...config.data, firstname: '' } }]) {
      await assert.rejects(page.evaluate(c => parkingFill(c, { offline: true }), changed));
    }
    await page.locator('[type=hidden]').evaluate(e => e.remove());
    await assert.rejects(page.evaluate(c => parkingFill(c, { offline: true }), config));
    await page.setContent(await readFile(new URL('../pages/Rejestracja na parking - closed.html', import.meta.url), 'utf8').then(x => x.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<link\b[^>]*>/gi, '').replace(/<img\b[^>]*>/gi, '')));
    await assert.rejects(page.evaluate(c => parkingFill(c, { offline: true }), config));
    assert.equal(requests, 0);
  } finally { await browser.close(); }
});

test('result classification requires an explicit confirmation', () => {
  assert.equal(classify('Sukces! Twoje zgłoszenie zostało przyjęte i mieści się w limicie miejsc.'), 'accepted');
  assert.equal(classify('Twoje zgłoszenie trafiło na listę rezerwową.'), 'reserve');
  assert.equal(classify('Zgłoszenia trafiają na listę rezerwową.'), 'unknown');
  assert.equal(classify('HTTP 200'), 'unknown');
  assert.equal(classify('Błąd walidacji'), 'error');
});
