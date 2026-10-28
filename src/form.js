// Shared by Playwright and the browser-console fallback. Never submits.
globalThis.parkingFill = function (config, options = {}) {
  const prefix = 'esspg_news_parking_application_form';
  if (!options.offline && (location.origin !== 'https://e.sspg.pl' || location.pathname !== '/parking/formularz-rejestracji')) throw new Error('Niewłaściwy adres strony');
  const form = document.getElementById(prefix);
  if (!form) throw new Error('Brak otwartego formularza');
  if (form.method.toLowerCase() !== 'post' || form.action !== 'https://e.sspg.pl/parking/formularz-rejestracji') throw new Error('Zmiana adresu wysyłania formularza');
  const heading = [...document.querySelectorAll('h2')].map(x => x.textContent.trim()).find(x => x.includes('Edycja'));
  if (!heading || !heading.endsWith(' - ' + config.expectedEdition)) throw new Error('Niewłaściwa edycja: ' + heading);
  const fields = ['firstname', 'lastName', 'email', 'albumNumber', 'phoneNumber', 'faculty', 'plateNumber', 'carBrand', 'carModel'];
  const elements = fields.map(key => {
    const element = document.getElementById(prefix + '_' + key);
    if (!element || element.form !== form || element.disabled) throw new Error('Zmiana formularza: ' + key);
    const value = config.data?.[key];
    if (typeof value !== 'string' || !value.trim()) throw new Error('Brak danych: ' + key);
    if (key === 'faculty' && ![...element.options].some(o => o.value === value)) throw new Error('Nieznany wydział');
    return [element, value];
  });
  if (!/^[^\s@]+@student\.pg\.edu\.pl$/.test(config.data.email)) throw new Error('Niepoprawny email');
  if (!/^\d{6}$/.test(config.data.albumNumber)) throw new Error('Indeks musi mieć 6 cyfr');
  const token = document.getElementById(prefix + '__token');
  const consent = document.getElementById('rodo');
  if (!token?.value || token.form !== form || !consent || consent.form !== form || !form.querySelector('[type=submit]')) throw new Error('Niekompletny formularz');
  if (config.consent !== true) throw new Error('Przeczytaj oświadczenia i ustaw consent: true');
  for (const [element, value] of elements) {
    element.value = value;
    for (const event of ['input', 'change', 'blur']) element.dispatchEvent(new Event(event, { bubbles: true }));
  }
  consent.checked = true;
  consent.dispatchEvent(new Event('change', { bubbles: true }));
  if (globalThis.jQuery?.fn?.valid && !globalThis.jQuery(form).valid()) throw new Error('Walidacja formularza nie powiodła się');
  return { edition: heading, filled: fields.length };
};
