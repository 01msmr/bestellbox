# dinedeck

Gemeinsame Essensbestellung für Gruppen. Eine Person startet eine **Bestellung** bei einem Restaurant,
alle tragen Artikel ein, markieren sich als **ready** und später als **bezahlt**. Alle sehen live denselben Stand.

## Funktionen

- **Restaurant** (Name, Webadresse, Telefon) wird gespeichert und bei der nächsten Runde per Auswahl wieder angeboten.
- **Eingabe** pro User: Artikel, Variante (Freitext, z. B. `26 cm`, `Fladenbrot, scharf`), Preis, Menge. Die eigenen Zeilen sind
  bis „ready“ direkt in der Zeile editierbar (speichert beim Verlassen des Feldes); nach dem Löschen bleibt 15 s ein „Rückgängig“.
  Gruppiert wird nach Name + Variante + Preis (Groß/Klein, Leerzeichen, Satzzeichen, Umlaut-Schreibweisen egal;
  ähnliche Namen werden nie automatisch zusammengeführt).
- **Katalog pro Restaurant:** Namen und Varianten aus früheren Bestellungen werden ab der 2. Nutzung vorgeschlagen.
  Der **Preis wird nie vorausgefüllt**; ein Chip „zuletzt X € (ungeprüft)“ muss aktiv übernommen werden.
  Preisabweichungen werden beim Eintragen und im Bestell-Tab markiert. Die Verantwortung für den Preis liegt beim User.
- **Drei Tabs** (gleich breit, an die Karte darunter angedockt, beim Scrollen haftend): *<Name>s Artikel*, *Alle*, *Sammelbestellung*
  (gebündelt zum Telefonieren/Kopieren, mit Link zur Speisekarte).
- **Statuszeile oben** (haftet unter dem Kopf): `eröffnet › ready › bestellt › geliefert` mit Uhrzeiten; der zuletzt erreichte Schritt ist
  grün, spätere sind dünn und kursiv. Davor ein gelber Hinweis, wer noch nicht ready ist. Darunter, falls nötig, der rote Hinweis
  mit den offenen Beträgen (Knopf „als bezahlt markieren“ mit Rückfrage „ist bezahlt?“).
- **„Alle“-Liste:** pro User eine Karte mit abgesetzter Kopfzeile (Name, ready-/bezahlt-Marke; der Besteller trägt zusätzlich die Marke
  *ist Besteller* mit Erläuterung als Hinweistext). Unter den Artikeln stehen „N Artikel“ und die Summe (inkl. Lieferanteil);
  bei nur einem Artikel ohne Lieferanteil entfällt die Zeile, der Preis steht dann fett als Summe in der Artikelzeile.
- **Bestellkopf:** Titel mit Restaurant und „<Besteller> bestellt“; Webadresse des Restaurants als schmale Pille mit Pfeil nach außen;
  der eigene Name oben rechts als getönte Pille. Solange Beträge offen sind, bleibt unter der Statuszeile ein roter Rand mit Schatten sichtbar.
- **Status:** `ready` und `bezahlt` sind zwei unabhängige Häkchen pro User, für alle sichtbar. Jeder User muss seine Artikel insgesamt als `ready` setzen; jede Änderung an den eigenen Artikeln setzt ihn wieder auf „nicht ready“. Solange ein User nicht ready ist, ist auch die Gesamtbestellung nicht ready (Warnbanner).
- **Geschlossen:** Artikel von Usern, die nicht „ready“ sind, bleiben sichtbar, zählen aber nicht (Sammelbestellung, Summen, Schulden); „Wieder öffnen“ bringt sie zurück.
- **Frist** (Standard 20 min, beim Anlegen einstellbar, `+5 min`). Nach Ablauf ist die Runde geschlossen;
  Ersteller, Besteller und Admins können sie wieder öffnen.
- **Schließen, wenn alle ready:** Option im Zeitfeld (Ersteller/Besteller/Admins); schließt automatisch, sobald alle User mit Artikeln „ready“ sind. Solange die Option aktiv ist, kommen neue User nur nach Freigabe hinein: ihr Versuch erscheint als Hinweis bei Ersteller/Besteller/Admins (Freigeben / Ablehnen), bestehende User sind nicht betroffen.
- **Bestellt von** + PayPal-Adresse/Link und **Lieferkosten** (gleichmäßig auf alle Besteller mit Artikeln verteilt, nicht nach Artikelwert).
- **Sperren ab „Bestellt“:** keine Artikeländerung, keine neuen User, Frist nicht neu setzbar, Bestellkopf (Besteller, PayPal, Lieferkosten)
  nicht mehr änderbar; „Bestellt zurücknehmen“ öffnet alles wieder. Nach dem Schließen kann niemand „ready“ zurücknehmen.
- **Bezahlt** setzen dürfen nur der User selbst oder der Besteller.
- **Bezahlen:** Block mit PayPal-Adresse des Bestellers (kopierbar) und, bei paypal.me-Adressen, einem Link mit dem
  eigenen Betrag. PayPal-Adresse (je Besteller) und Lieferkosten (je Restaurant) werden gemerkt und bei der nächsten
  Runde vorgeschlagen. Die Adresse erscheint nie in Listen, nur in der Runde für Teilnehmer, Besteller, Ersteller und Admins.
- **Navigation:** oben „Bestellungen“ und „Statistik“. Ab ca. 700 px (Tablet, Desktop) zusätzlich eine immer sichtbare Sidebar links (schmal bis 1000 px) mit allen Bestellungen
  (Offen / Unbezahlt / Abgeschlossen, live) und „Neue Bestellung“; auf dem Handy steht die Liste auf der Startseite.
  Jede Bestellung hat eine eigene Seite/Adresse (`#/r/<Nr>`).
- **Layout:** mobil einspaltig, Tablet breiter, sehr breite Desktops zweispaltig (links Tabs, rechts Frist/Banner/Bezahlen).
- **Offene Beträge:** eine Zeile pro User direkt unter dem roten Hinweis, zweispaltig bei breitem Fenster. Runden mit offenen Beträgen
  erscheinen in der Sidebar separat als *unbezahlt*.
- **Heute:** Bestellungen von heute (bis 4 Uhr nachts zählt der Abend davor noch als heute) zeigen nur die Uhrzeit, ältere Datum und Uhrzeit;
  in „Alle Bestellungen“ stehen sie hervorgehoben im Abschnitt *Heute* vor der Monatsliste.
- **Statistik** (letzte 30 / alle): meistbestelltes Restaurant, beliebtestes Gericht je Restaurant,
  Ø Artikelpreis und Ø Bestellsumme. Es gibt bewusst keine Auswertung nach einzelnen Usern.
- **Export:** Admins (Umgebungsvariable `ADMINS`) laden in der Statistik alle Artikelzeilen als JSON-Datei (`/api/export`).
- **Darstellung:** Hell/Dunkel automatisch nach System, manuell überschreibbar; Themen S/W, Ozean, Grün, Orange, Mais.
- **Sprache:** Deutsch/Englisch, automatisch nach Browsersprache, manuell umschaltbar (Knopf oben rechts; der Hinweis am Knopf nennt den aktuellen Zustand, z. B. „Sprache: automatisch = Deutsch“).
  Neue Texte: deutscher Text ist der Schlüssel, Englisch steht in `public/i18n.js`.

## Code-Struktur

```
server.js            HTTP-Server, Routen, SSE (/api/events), statische Dateien
security.js          Sicherheits-Header (CSP, nosniff, Referrer-Policy, X-Frame-Options)
db.js                Geschäftslogik (createLogic): Schreibaktionen, Rechte, Validierung
db/schema.js         SQLite-Schema, Öffnen, Migration älterer Datenbanken
db/queries.js        vorbereitete SQL-Anweisungen
db/read.js           lesende Abfragen: Rundendetail, Listen, Export, Statistik, Katalog
db/helpers.js        reine Helfer: Normalisierung, Beträge, Verteilung der Lieferkosten
db/errors.js         HttpError
public/config.js     ZENTRALE WERTE: Grenzen (LIMITS), Voreinstellungen (DEFAULTS), Listen (LISTS), Zeiten (TIMING)
                     – von Server und Frontend gemeinsam genutzt
public/format.js     reine Formatierung und Regeln (testbar): Zeiten, payHref, joinList, isToday, Beträge
public/index.html    Gerüst: Header/Navi, Sidebar, Statusleiste, Hauptbereich (Cache-Version __VERSION__ wird vom Server gesetzt)
public/app.js        Einstieg: Namensabfrage, Router (#/, #/r/<Nr>, #/stats), Live-Updates
public/util.js       Helfer: DOM-Builder h(), api(), Formatierung, Name (me)
public/side.js       Sidebar mit allen Bestellungen, Countdown-Badges
public/views/        home.js (Start), all.js (Alle Bestellungen), stats.js (Statistik), round.js (Bestellseite)
public/views/round/  Teile der Bestellseite: status.js (Statuszeile, Hinweise, Beträge), users.js („Alle“-Liste),
                     order.js (Sammelbestellung), pay.js (Bezahlbereich)
public/i18n.js       Übersetzungen (deutscher Text = Schlüssel, EN-Tabelle)
public/theme.js      Modus (Auto/Hell/Dunkel), Farbthema, Sprache
public/style.css     Styles; Farben als CSS-Variablen mit light-dark(); Maße in rem
test/                api.test.js (API und Header), format.test.js, group.test.js  (npm test)
```

Hinweise für Weiterentwicklung:

- Im Code heißt eine Bestellung noch **round** (Tabelle `rounds`, `/api/rounds`); im Frontend heißt sie „Bestellung“.
- Neuer Text im Frontend: immer `t('Deutscher Text')` verwenden und die EN-Übersetzung in `public/i18n.js` ergänzen.
- Fehlertexte in `db.js` nennen Grenzen als Text („1–240 Minuten“); bei Änderung in `config.js` dort und in `i18n.js` mitziehen.
- Maße im CSS in `rem`: Startwert ist `html { font-size: 16px }` (1rem = 16 px), nur 1-px-Linien bleiben px. Abstände als Hilfsklassen
  (`mt-3`, `gap-2`, `stack-4` …) statt Inline-Styles.
- Beträge in der Oberfläche über `money()` (Dezimalzeichen je Sprache: de 9,00 · en 9.00).
- Jede Ansicht liefert `{ refresh(), destroy() }`; der Router ruft `refresh()` auch bei Live-Updates auf.

## Start

Node ≥ 22.13, keine Abhängigkeiten (nutzt `node:sqlite`).

```sh
npm start                 # http://127.0.0.1:3000
ADMINS=anna,ben npm start  # Admins (dürfen jede Runde verwalten)
npm test
```

| Variable  | Standard               | Bedeutung                     |
|-----------|------------------------|-------------------------------|
| `HOST`    | `127.0.0.1`            | Bind-Adresse                  |
| `PORT`    | `3000`                 | Port                          |
| `DB_FILE` | `./data/dinedeck.db` | SQLite-Datei                  |
| `ADMINS`  | leer                   | Usernamen, kommagetrennt      |

Docker: `docker compose up -d` (Daten im Volume `dinedeck-data`; Admins per `ADMINS=anna,ben docker compose up -d` oder `.env`).
Das Image kopiert `server.js`, `db.js`, `db/`, `security.js` und `public/` – neue Quelldateien dort ergänzen (`Dockerfile`).

**Sicherung:** Die Daten liegen in `data/` (nicht im Repo). Konsistente Kopie bei laufendem Betrieb: `sqlite3 data/dinedeck.db ".backup sicherung.db"`.

## Hinweis zur Sicherheit

Alle Antworten tragen Sicherheits-Header (`security.js`: Content-Security-Policy, `nosniff`, `no-referrer`, kein Einbetten); Dateien werden
mit `Cache-Control: no-cache` ausgeliefert, `index.html` hängt eine Cache-Version (`?v=`) an Stylesheet und Skripte.

Es gibt bewusst **keine Anmeldung**: Der Username kommt vom Browser und wird vertraut. Der „Schutz“ der PayPal-Adresse
ist daher nur eine Sichtbarkeitsbeschränkung (kein Login, wer sich als Teilnehmer ausgibt, sieht sie). Das ist für ein
vertrauenswürdiges Netz (lokales Netz, z. B. Büro- oder Heimnetz) gedacht. Nicht ungeschützt ins Internet stellen.
