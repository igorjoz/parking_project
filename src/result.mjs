export function classify(text) {
  const s = text.toLowerCase();
  if (/sukces/.test(s) && /zgłoszenie zostało przyjęte/.test(s) && /mieści się w limicie miejsc/.test(s)) return 'accepted';
  if (/twoje zgłoszenie/.test(s) && /(?:zostało|trafiło|znajduje się).{0,80}(?:list[ęaęy]|rezerwow)/s.test(s) && /rezerwow/.test(s)) return 'reserve';
  if (/wymagane|niepoprawny|błąd|nieprawidłowy|odrzucon/.test(s)) return 'error';
  return 'unknown';
}
