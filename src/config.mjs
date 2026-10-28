export const FORM_URL = 'https://e.sspg.pl/parking/formularz-rejestracji';
export const FORM_ID = 'esspg_news_parking_application_form';
export function parseConfig(text) {
  let c;
  try { c = JSON.parse(text.replace(/^\uFEFF/, '')); } catch { throw new Error('Niepoprawny JSON w config.local.json'); }
  if (typeof c.startAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(c.startAt) || !Number.isFinite(Date.parse(c.startAt))) throw new Error('startAt: wymagana data ISO z godziną i strefą');
  if (c.consent !== true) throw new Error('Przeczytaj oświadczenia i ustaw consent: true');
  for (const key of ['firstname', 'lastName', 'email', 'albumNumber', 'phoneNumber', 'faculty', 'plateNumber', 'carBrand', 'carModel']) {
    if (typeof c.data?.[key] !== 'string' || !c.data[key].trim()) throw new Error(`${key}: wymagany niepusty tekst`);
    if (c.data[key] !== c.data[key].trim()) throw new Error(`${key}: usuń spacje na początku lub końcu`);
  }
  if (!/^[^\s@]+@student\.pg\.edu\.pl$/.test(c.data.email)) throw new Error('email: wymagana domena @student.pg.edu.pl');
  if (!/^\d{6}$/.test(c.data.albumNumber)) throw new Error('albumNumber: wymagane sześć cyfr jako tekst');
  if (!['ARCH', 'FTIMS', 'CHEM', 'WILIŚ', 'EIA', 'WIMIO', 'ETI', 'ZIE'].includes(c.data.faculty)) throw new Error('faculty: nieznany kod wydziału (dla WETI użyj ETI)');
  const expected = c.data.faculty === 'WIMIO' ? 'IMIO' : c.data.faculty;
  if (c.expectedEdition !== expected) throw new Error(`expectedEdition musi być ${expected} dla wybranego wydziału`);
  return c;
}
