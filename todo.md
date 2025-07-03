# TODO

Ovo je popis zadataka i prijedloga za daljnji razvoj aplikacije.

## Poboljšanja Internal Browser / Local Link Manager funkcionalnosti

### Poboljšanje UI-a Local Link Manager-a
- **Što to znači:** Vizualne i interaktivne nadogradnje korisničkog sučelja "lokalne" početne stranice (`LinkManagerView`).
- **Konkretni prijedlozi:**
    - Bolji izgled liste linkova: Koristiti kartice, ikone (favicon) web stranica, ili grupacije (npr. AI chatovi, rječnici, dokumentacija).
    - Naprednije upravljanje formom: Dodati validaciju URL-a, automatsko popunjavanje naziva stranice na temelju URL-a (zahtijeva server-side).
    - Opcija "Otvori u novom tabu" u formi: Dodati checkbox za ručni odabir ponašanja linka.
    - Drag-and-drop za sortiranje linkova: Omogućiti preuređivanje linkova povlačenjem i ispuštanjem.
    - Traženje linkova: Dodati polje za pretraživanje/filtriranje popisa linkova.
    - Vizualni feedback: Prikazivanje poruka o uspjehu/grešci (npr. koristeći Toast).

### Dodavanje funkcionalnosti pretraživanja na "lokalnoj" stranici
- **Što to znači:** Omogućiti korisniku da direktno pretražuje web putem input polja na "lokalnoj" stranici.
- **Konkretni prijedlozi:**
    - Dodati gumb "Traži" pored input polja za URL.
    - Logika za formiranje URL-a za pretraživanje (npr. za Google: `https://www.google.com/search?q=tvoj+tekst+ovdje`).
    - Otvaranje rezultata pretraživanja (vjerojatno u novom tabu).
    - Implementacija logike u `handleNavigate` funkciju u `InternalBrowserView` za razlikovanje URL-a i pojma za pretraživanje.

### Implementacija osnovnih navigacijskih gumba (back/forward/refresh) za iframe (pazi na CORS ograničenja)
- **Što to znači:** Dodati gumbe za natrag, naprijed i osvježavanje koji rade unutar `<iframe>`.
- **Konkretni prijedlozi:**
    - Dodati gumbe (<Button>) s odgovarajućim ikonama (npr. `ArrowLeft`, `ArrowRight`, `RefreshCw`) pored URL input polja u `InternalBrowserView.tsx`.
    - Implementirati handlere za klikove na te gumbe.
    - **Povezivanje s `iframeRef.current.contentWindow.history` (Ograničeno zbog CORS-a):** Standardni način za kontrolu navigacije unutar iframe-a. **Radi samo za stranice na istom domenu.**
    - **Alternative za navigaciju (ako CORS blokira):** Samostalno praćenje povijesti URL-ova koje korisnik unese/klikne i ponovno učitavanje iframe-a s odgovarajućim URL-om. Gumb refresh bi samo ponovno postavio `iframeRef.current.src` na trenutni URL.

### Daljnje poboljšanje logike resize-a
- **Što to znači:** Fino podešavanje implementacije resize-a za prostor urednika i preglednika.
- **Konkretni prijedlozi:**
    - Bolje upravljanje granicama: Prilagoditi minimalne i maksimalne širine (`Math.max`, `Math.min`).
    - Debouncing/Throttling MouseMove: Optimizacija performansi rukovanja pomicanjem miša tijekom resize-a.
    - Vizualni feedback tijekom resize-a: Promijeniti stil kursora ili dodati vizualnu liniju koja prati poziciju resizera.
