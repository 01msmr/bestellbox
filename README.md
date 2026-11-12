# dinedock

Gemeinsame Essensbestellung für die Toolbox Bodensee. Eine Person startet eine **Bestellung** bei einem Restaurant,
alle tragen Artikel ein, markieren sich als **ready** und später als **bezahlt**. Alle sehen live denselben Stand.

## Funktionen

- **Restaurant** (Name, Webadresse, Telefon) wird gespeichert und bei der nächsten Runde per Auswahl wieder angeboten.
- **Eingabe** pro User: Artikel, Variante (Freitext, z. B. `26 cm`, `Fladenbrot, scharf`), Preis, Menge.
  Gruppiert wird nach Name + Variante + Preis (Groß/Klein, Leerzeichen, Satzzeichen, Umlaut-Schreibweisen egal;
  ähnliche Namen werden nie automatisch zusammengeführt).
- **Katalog pro Restaurant:** Namen und Varianten aus früheren Bestellungen werden ab der 2. Nutzung vorgeschlagen.
  Der **Preis wird nie vorausgefüllt**; ein Chip „zuletzt X € (ungeprüft)“ muss aktiv übernommen werden.
  Preisabweichungen werden beim Eintragen und im Bestell-Tab markiert. Die Verantwortung für den Preis liegt beim User.
- **Drei Tabs:** *Nach Usern*, *Meine*, *Bestellen* (gebündelte Sammelbestellung zum Telefonieren/Kopieren).
- **Status:** `ready` und `bezahlt` sind zwei unabhängige Häkchen pro User, für alle sichtbar. Jeder User muss seine Artikel insgesamt als `ready` setzen; jede Änderung an den eigenen Artikeln setzt ihn wieder auf „nicht ready“. Solange ein User nicht ready ist, ist auch die Gesamtbestellung nicht ready (Warnbanner).
- **Geschlossen:** Artikel von Usern, die nicht „ready“ sind, bleiben sichtbar, zählen aber nicht (Sammelbestellung, Summen, Schulden); „Wieder öffnen“ bringt sie zurück.
- **Warnbanner**, solange nicht alle ready sind.
- **Frist** (Standard 20 min, beim Anlegen einstellbar, `+5 min`). Nach Ablauf ist die Runde geschlossen;
  Ersteller, Besteller und Admins können sie wieder öffnen.
- **Schließen, wenn alle ready:** Option im Zeitfeld (Ersteller/Besteller/Admins); schließt automatisch, sobald alle User mit Artikeln „ready“ sind. Solange die Option aktiv ist, kommen neue User nur nach Freigabe hinein: ihr Versuch erscheint als Hinweis bei Ersteller/Besteller/Admins (Freigeben / Ablehnen), bestehende User sind nicht betroffen.
- **Bestellt von** + PayPal-Adresse/Link und **Lieferkosten** (gleichmäßig auf alle Besteller mit Artikeln verteilt).
- **Bezahlen:** Block mit PayPal-Adresse des Bestellers (kopierbar) und, bei paypal.me-Adressen, einem Link mit dem
  eigenen Betrag. PayPal-Adresse (je Besteller) und Lieferkosten (je Restaurant) werden gemerkt und bei der nächsten
  Runde vorgeschlagen. Die Adresse erscheint nie in Listen, nur in der Runde für Teilnehmer, Besteller, Ersteller und Admins.
- **Navigation:** oben „Bestellungen“ und „Statistik“. Ab ca. 700 px (Tablet, Desktop) zusätzlich eine immer sichtbare Sidebar links (schmal bis 1000 px) mit allen Bestellungen
  (Offen / Unbezahlt / Abgeschlossen, live) und „Neue Bestellung“; auf dem Handy steht die Liste auf der Startseite.
  Jede Bestellung hat eine eigene Seite/Adresse (`#/r/<Nr>`).
- **Layout:** mobil einspaltig, Tablet breiter, sehr breite Desktops zweispaltig (links Tabs, rechts Frist/Banner/Bezahlen).
- **Offene Beträge:** eine Zeile pro User. Runden mit offenen Beträgen erscheinen separat als *unbezahlt*.
- **Statistik** (letzte 30 / alle): meistbestelltes Restaurant, beliebtestes Gericht je Restaurant,
  Ø Artikelpreis und Ø Bestellsumme. Es gibt bewusst keine Auswertung nach einzelnen Usern.
- **Export:** Admins (`ADMINS` in `compose.yaml`) laden in der Statistik alle Artikelzeilen als JSON-Datei (`/api/export`).
- **Darstellung:** Hell/Dunkel automatisch nach System, manuell überschreibbar; Themen S/W, Ozean, Grün, Orange, Mais.
- **Sprache:** Deutsch/Englisch, automatisch nach Browsersprache, manuell umschaltbar (◐-Panel).
  Neue Texte: deutscher Text ist der Schlüssel, Englisch steht in `public/i18n.js`.

## Code-Struktur

```
server.js            HTTP-Server, Routen, SSE (/api/events), statische Dateien
db.js                SQLite-Schema, Geschäftslogik (createLogic), Rechte, Validierung
public/config.js     ZENTRALE WERTE: Grenzen (LIMITS), Voreinstellungen (DEFAULTS), Listen (LISTS), Zeiten (TIMING)
                     – von Server und Frontend gemeinsam genutzt
public/index.html    Gerüst: Header/Navi, Sidebar, Hauptbereich
public/app.js        Einstieg: Namensabfrage, Router (#/, #/r/<Nr>, #/stats), Live-Updates
public/util.js       Helfer: DOM-Builder h(), api(), Formatierung, Name (me)
public/side.js       Sidebar mit allen Bestellungen, Countdown-Badges
public/views/        home.js (Start), round.js (Bestellseite), stats.js (Statistik)
public/i18n.js       Übersetzungen (deutscher Text = Schlüssel, EN-Tabelle)
public/theme.js      Modus (Auto/Hell/Dunkel), Farbthema, Sprache
public/style.css     Styles; Farben als CSS-Variablen mit light-dark()
test/api.test.js     API-Tests (node --test)
```

Hinweise für Weiterentwicklung:

- Im Code heißt eine Bestellung noch **round** (Tabelle `rounds`, `/api/rounds`); im Frontend heißt sie „Bestellung“.
- Neuer Text im Frontend: immer `t('Deutscher Text')` verwenden und die EN-Übersetzung in `public/i18n.js` ergänzen.
- Fehlertexte in `db.js` nennen Grenzen als Text („1–240 Minuten“); bei Änderung in `config.js` dort und in `i18n.js` mitziehen.
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
| `DB_FILE` | `./data/dinedock.db` | SQLite-Datei                  |
| `ADMINS`  | leer                   | Usernamen, kommagetrennt      |

Docker: `docker compose up -d` (Daten im Volume `dinedock-data`).

## Hinweis zur Sicherheit

Es gibt bewusst **keine Anmeldung**: Der Username kommt vom Browser und wird vertraut. Der „Schutz“ der PayPal-Adresse
ist daher nur eine Sichtbarkeitsbeschränkung (kein Login, wer sich als Teilnehmer ausgibt, sieht sie). Das ist für ein
vertrauenswürdiges Netz (lokal/Toolbox-LAN) gedacht. Nicht ungeschützt ins Internet stellen.
