# bestellbox

Gemeinsame Essensbestellung für die Toolbox Bodensee. Eine Person startet eine **Bestellung** bei einem Restaurant,
alle tragen Artikel ein, markieren sich als **fertig** und später als **bezahlt**. Alle sehen live denselben Stand.

## Funktionen

- **Restaurant** (Name, Webadresse, Telefon) wird gespeichert und bei der nächsten Runde per Auswahl wieder angeboten.
- **Eingabe** pro User: Artikel, Variante (Freitext, z. B. `26 cm`, `Fladenbrot, scharf`), Preis, Menge.
  Gruppiert wird nach Name + Variante + Preis (Groß/Klein, Leerzeichen, Satzzeichen, Umlaut-Schreibweisen egal;
  ähnliche Namen werden nie automatisch zusammengeführt).
- **Katalog pro Restaurant:** Namen und Varianten aus früheren Bestellungen werden ab der 2. Nutzung vorgeschlagen.
  Der **Preis wird nie vorausgefüllt**; ein Chip „zuletzt X € (ungeprüft)“ muss aktiv übernommen werden.
  Preisabweichungen werden beim Eintragen und im Bestell-Tab markiert. Die Verantwortung für den Preis liegt beim User.
- **Drei Tabs:** *Nach Usern*, *Meine*, *Bestellen* (gebündelte Sammelliste zum Telefonieren/Kopieren).
- **Status:** `fertig` und `bezahlt` sind zwei unabhängige Häkchen pro User, für alle sichtbar.
- **Warnbanner**, solange nicht alle fertig sind.
- **Frist** (Standard 20 min, beim Anlegen einstellbar, `+5 min`). Nach Ablauf ist die Runde gesperrt;
  Ersteller, Besteller und Admins können sie wieder öffnen.
- **Bestellt von** + PayPal-Adresse/Link und **Lieferkosten** (anteilig nach Artikelsumme verteilt).
- **Bezahlen:** Block mit PayPal-Adresse des Bestellers (kopierbar) und, bei paypal.me-Adressen, einem Link mit dem
  eigenen Betrag. PayPal-Adresse (je Besteller) und Lieferkosten (je Restaurant) werden gemerkt und bei der nächsten
  Runde vorgeschlagen. Die Adresse erscheint nie in Listen, nur in der Runde für Teilnehmer, Besteller, Ersteller und Admins.
- **Navigation:** oben „Bestellungen“ und „Statistik“. Ab ca. 1000 px zusätzlich eine Sidebar links mit allen Bestellungen
  (Offen / Unbezahlt / Abgeschlossen, live) und „Neue Bestellung“; auf schmalen Bildschirmen steht die Liste auf der Startseite.
  Jede Bestellung hat eine eigene Seite/Adresse (`#/r/<Nr>`).
- **Layout:** mobil einspaltig, Tablet breiter, sehr breite Desktops zweispaltig (links Tabs, rechts Frist/Banner/Bezahlen).
- **Offene Beträge:** eine Zeile pro User. Runden mit offenen Beträgen erscheinen separat als *unbezahlt*.
- **Statistik** (letzte 30 / alle): meistbestelltes Restaurant, beliebtestes Gericht je Restaurant,
  Ø Artikelpreis und Ø Bestellsumme. Es gibt bewusst keine Auswertung nach einzelnen Usern.
- **Darstellung:** Hell/Dunkel automatisch nach System, manuell überschreibbar; Themen S/W, Ozean, Beere.
- **Sprache:** Deutsch/Englisch, automatisch nach Browsersprache, manuell umschaltbar (◐-Panel).
  Neue Texte: deutscher Text ist der Schlüssel, Englisch steht in `public/i18n.js`.

## Start

Node ≥ 22.13, keine Abhängigkeiten (nutzt `node:sqlite`).

```sh
npm start                 # http://127.0.0.1:3000
ADMINS=uli,max npm start  # Admins (dürfen jede Runde verwalten)
npm test
```

| Variable  | Standard               | Bedeutung                     |
|-----------|------------------------|-------------------------------|
| `HOST`    | `127.0.0.1`            | Bind-Adresse                  |
| `PORT`    | `3000`                 | Port                          |
| `DB_FILE` | `./data/bestellbox.db` | SQLite-Datei                  |
| `ADMINS`  | leer                   | Usernamen, kommagetrennt      |

Docker: `docker compose up -d` (Daten im Volume `bestellbox-data`).

## Hinweis zur Sicherheit

Es gibt bewusst **keine Anmeldung**: Der Username kommt vom Browser und wird vertraut. Der „Schutz“ der PayPal-Adresse
ist daher nur eine Sichtbarkeitsbeschränkung (kein Login, wer sich als Teilnehmer ausgibt, sieht sie). Das ist für ein
vertrauenswürdiges Netz (lokal/Toolbox-LAN) gedacht. Nicht ungeschützt ins Internet stellen.
