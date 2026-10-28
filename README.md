# Szybki zapis na parking SSPG

Narzędzie dla jednego zgłoszenia. Korzysta z aktualnego formularza i jego tokena. Nie gwarantuje miejsca.

## Instalacja (PowerShell)

```powershell
npm.cmd install
npx.cmd playwright install chromium
Copy-Item config.example.json config.local.json
```

Jeśli katalog systemowy przeglądarek jest niedostępny, przed instalacją ustaw `$env:PLAYWRIGHT_BROWSERS_PATH = "$PWD/.browser"`. Program i testy wykrywają ten lokalny katalog automatycznie.

Uzupełnij `config.local.json`. Indeks musi być tekstem z sześcioma cyframi, e-mail w domenie `@student.pg.edu.pl`. Dla Wydziału Elektroniki, Telekomunikacji i Informatyki zarówno kod wydziału, jak i edycji to `ETI`. Szablon wskazuje 24.10.2026 17:00 czasu polskiego (`+02:00`). Dla IMIO kod wydziału to `WIMIO`, a nazwa edycji `IMIO`. Program uruchomiony po terminie zaczyna od razu; kończy oczekiwanie na formularz po pięciu minutach. Nie nadpisuj już uzupełnionej konfiguracji szablonem.

Przeczytaj oświadczenia na stronie oraz [regulamin](https://cdn.files.pg.edu.pl/main/SSPG/Regulaminy/Regulamin%20Parkingi.pdf). Dopiero po zaakceptowaniu oświadczeń ustaw `consent: true`. Nie udało się potwierdzić zasad automatyzacji z tekstu PDF — przed użyciem automatycznego wysyłania sprawdź ten dokument. Brak odczytu nie oznacza zgody organizatora.

## Próba offline

```powershell
npm.cmd test
npm.cmd run offline
# Sprawdzenie własnej konfiguracji, bez przeglądarki i bez sieci:
npm.cmd run check
# Wypełnienie lokalnego formularza własnymi danymi, z blokadą wszystkich żądań sieciowych:
npm.cmd run offline:config
```

Próba używa fikcyjnych danych i lokalnego HTML. Żądania sieciowe są blokowane, formularz nie jest wysyłany. Token zapisanej kopii służy wyłącznie próbie offline.

`offline:config` używa Twojej konfiguracji i lokalnie dostosowuje nagłówek kopii do wybranego wydziału. Sprawdza też zapisany walidator jQuery. Nie potwierdza otwarcia rzeczywistej edycji. Zrzut w `artifacts/` zawiera Twoje dane. Opcji testowych nie można łączyć z `--submit`.

## Uruchomienie

```powershell
npm.cmd start
# Automatyczne pojedyncze wysłanie zamiast ręcznego kliknięcia:
npm.cmd start -- --submit
```

Uruchom kilka minut przed startem. W ustawieniach Windows sprawdź synchronizację zegara; program nie zmienia czasu systemowego. Używaj jednej instancji i stabilnego połączenia. Nie uruchamiaj obu wariantów równocześnie.

Program otwiera Chromium przed terminem i blokuje wysyłanie. Po osiągnięciu godziny startu od razu pobiera świeżą stronę — również wtedy, gdy wcześniej widział formularz poprzedniego wydziału. Jeśli widzi zamknięte zapisy lub inną edycję, ponawia tylko odczyt z sekundową przerwą. Błędy pobierania przed wysyłką też są ponawiane, do limitu pięciu minut. Nie obiecuje dokładności do milisekundy: wpływ mają zegar komputera, planowanie procesu i czas odpowiedzi serwera.

Po wykryciu właściwej edycji sprawdza adres, pola i token, wypełnia dane i odblokowuje jedno wysłanie. Domyślnie kliknij „Zapisz” ręcznie. Z `--submit` kliknie program. Każdy POST przed terminem, przed weryfikacją formularza, na inny adres lub po pierwszej próbie jest blokowany na poziomie żądań przeglądarki. Po wysłaniu program niczego nie ponawia, nawet po timeout lub błędzie HTTP.

`artifacts/live.lock` blokuje równoległe uruchomienie. Zamknięcie okna lub Ctrl+C zwalnia blokadę. Po awarii procesu może pozostać: usuń ją dopiero po upewnieniu się, że poprzedni proces nie działa. Plik `artifacts/<identyfikator>.attempt.json` powstaje przed dopuszczeniem POST i zapobiega ponownemu wysłaniu po restarcie dla tych samych danych identyfikujących i terminu. Nie usuwaj go bez sprawdzenia statusu zgłoszenia; zawiera odnośnik do katalogu wyniku. Nie ma automatycznego ponowienia po niepewnym wyniku.

`artifacts/` zawiera zrzuty i wynik, które mogą zawierać dane osobowe. Katalog i konfiguracja są ignorowane przez Git. Wynik `accepted` oznacza przyjęcie w limicie, nie końcowe przyznanie miejsca; `reserve` oznacza listę rezerwową, `error` błąd, a `unknown` wymaga ręcznej oceny komunikatu. Nieznane sformułowania odpowiedzi nie są traktowane jako sukces.

## Zapasowy skrypt w przeglądarce

Gotowy plik `console-ready.local.js` zawiera Twoje dane: skopiuj całą jego zawartość, wklej do konsoli (`F12` → Console) na otwartej stronie `https://e.sspg.pl/parking/formularz-rejestracji` i naciśnij Enter. Niczego nie doklejaj. Skrypt sprawdzi adres, godzinę i edycję, wypełni formularz i przewinie do przycisku „Zapisz”. Nie odświeża strony i nie czeka samodzielnie: przed terminem lub przy niewłaściwej edycji wyświetla błąd; po otwarciu właściwego formularza wklej ponownie. Ten wariant tylko wypełnia pola, wysyłasz przyciskiem „Zapisz”.

Plik jest generowany z `config.local.json` i ignorowany przez Git. Po zmianie danych zaktualizuj go poleceniem:

```powershell
npm.cmd run console
# Opcjonalnie skopiuj całość do schowka w PowerShell:
Get-Content -Raw -Encoding UTF8 .\console-ready.local.js | Set-Clipboard
```

Skrypt zawiera dane osobowe, nie udostępniaj go. Korzystaj z awaryjnego wysyłania dopiero po upewnieniu się, że automat nie wysłał zgłoszenia. Zakończ działanie automatu przed użyciem wariantu awaryjnego.

## Wariant ręczny

Przygotuj kolejno: imię, nazwisko, studencki e-mail, indeks, telefon, wydział, rejestrację, markę i model. O godzinie startu odśwież stronę, wypełnij formularz, zaakceptuj przeczytane oświadczenia i wyślij. Zachowaj komunikat końcowy; sam kod HTTP 200 nie potwierdza przyjęcia.
