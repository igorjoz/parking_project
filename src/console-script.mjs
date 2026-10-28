// The resulting script is standalone: one paste, no imports and no network calls.
export function buildConsoleScript(config, fillSource) {
  return `// Zawiera dane osobowe. Wklejaj wyłącznie na stronie formularza SSPG.
// Tylko wypełnia formularz; NIE wysyła zgłoszenia.
(() => {
  const config = ${JSON.stringify(config, null, 2)};
  try {
    if (location.origin !== 'https://e.sspg.pl' || location.pathname !== '/parking/formularz-rejestracji') throw new Error('Otwórz właściwą stronę formularza SSPG');
    if (Date.now() < Date.parse(config.startAt)) throw new Error('Jeszcze przed godziną zapisów. Wklej skrypt ponownie po terminie startu i otwarciu właściwej edycji.');
    // Keep the shared helper local to this invocation.
    const globalThis = { jQuery: window.jQuery };
    ${fillSource}
    const result = globalThis.parkingFill(config);
    document.querySelector('#esspg_news_parking_application_form [type=submit]').scrollIntoView({ block: 'center' });
    console.info('Wypełniono ' + result.filled + ' pól. Sprawdź dane i kliknij Zapisz. Zgłoszenie NIE zostało wysłane przez skrypt.');
    return { filled: result.filled, submitted: false };
  } catch (error) {
    console.error('Nie wypełniono formularza: ' + error.message);
    return { filled: false, submitted: false };
  }
})();
`;
}
