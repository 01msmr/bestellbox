# bestellbox

Gemeinsame Essensbestellung für die Toolbox Bodensee. Eine Person startet eine **Runde** für ein Restaurant,
alle tragen Artikel ein, markieren sich als **fertig** und später als **bezahlt**. Alle sehen live denselben Stand.

## Funktionen

- **Restaurant** (Name, Webadresse, Telefon) wird gespeichert und bei der nächsten Runde per Auswahl wieder angeboten.
- **Eingabe** pro User: Artikel, Preis, Menge. Gleiche Artikel (gleicher Name, gleicher Preis) werden gruppiert.
- **Drei Tabs:** *Nach Usern*, *Meine*, *Bestellen* (gebündelte Sammelliste zum Telefonieren/Kopieren).
- **Status:** `fertig` und `bezahlt` sind zwei unabhängige Häkchen pro User, für alle sichtbar.
- **Warnbanner**, solange nicht alle fertig sind.
- **Frist** (Standard 20 min, beim Anlegen einstellbar, `+5 min`). Nach Ablauf ist die Runde gesperrt;
  Ersteller, Besteller und Admins können sie wieder öffnen.
- **Bestellt von** + PayPal-Adresse/Link und **Lieferkosten** (anteilig nach Artikelsumme verteilt).
- **Offene Beträge:** eine Zeile pro User. Runden mit offenen Beträgen erscheinen separat als *unbezahlt*.
- **Statistik** (letzte 30 / alle): meistbestelltes Restaurant, beliebtestes Gericht je Restaurant,
  Ø Artikelpreis und Ø Bestellsumme pro User.
- **Darstellung:** Hell/Dunkel automatisch nach System, manuell überschreibbar; Themen S/W, Ozean, Beere.

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

Es gibt bewusst **keine Anmeldung**: Der Username kommt vom Browser und wird vertraut. Das ist für ein
vertrauenswürdiges Netz (lokal/Toolbox-LAN) gedacht. Nicht ungeschützt ins Internet stellen.
