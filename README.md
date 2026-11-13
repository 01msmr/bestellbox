# dinedeck

Group food ordering. One person opens an **order** at a restaurant, everyone adds items and marks themselves **ready**, later **paid**. Everyone sees the same state live.

Vanilla JS, no build step, no dependencies. Node ≥ 22.13 (`node:sqlite`), live updates via SSE.

## Features

- **Items:** article, variant, price, quantity. Own rows are editable until ready; deleting offers a 15 s undo. Items are grouped by name + variant + price, ignoring case, spacing, punctuation and umlaut spelling.
- **Catalog per restaurant:** names and variants from earlier orders are suggested. Prices are never prefilled; the last price is offered as an unchecked chip. Price deviations are flagged.
- **Tabs:** own items, everyone (one card per user), combined order (for phoning or copying, with menu link).
- **Status line:** `opened › ready › ordered › delivered › paid` with times; the latest step is highlighted. Banners for users not yet ready and for open amounts.
- **Ready and paid** are independent per-user flags. Any change to your items resets your ready flag. Only the user or the buyer can set paid. Ready is yellow, unready red, paid green.
- **Deadline** (default 20 min, `+5 min`). When it expires or an admin/creator/buyer closes the order, items of unready users stay visible but do not count. Optional auto-close once everyone is ready; new users then need approval.
- **Locked from "ordered":** no item or user changes, deadline and buyer data frozen; "take back ordered" reopens.
- **Buyer and payment:** buyer, PayPal address and delivery fee (split equally among users with items). PayPal address (per buyer) and fee (per restaurant) are remembered. The pay block offers a link with the user's amount and a QR code of it. The address is visible only to participants, buyer, creator and admins.
- **Navigation:** sidebar (open / unpaid / closed, live) from 700 px, list on the start page on phones. Each order has its own URL (`#/r/<id>`). Orders from today show only the time.
- **Statistics:** top restaurant, favourite dish per restaurant, average item price and order total. No per-user statistics. Admins can export all item rows as JSON.
- **Appearance:** light/dark/auto, colour themes, German/English.

## Run

```sh
npm start                  # http://127.0.0.1:3000
ADMINS=anna,ben npm start  # admins can manage every order
npm test
```

| Variable  | Default               | Meaning                   |
|-----------|-----------------------|---------------------------|
| `HOST`    | `127.0.0.1`           | Bind address              |
| `PORT`    | `3000`                | Port                      |
| `DB_FILE` | `./data/dinedeck.db`  | SQLite file               |
| `ADMINS`  | empty                 | Comma-separated usernames |
| `FRAME_ANCESTORS` | empty | Space/comma-separated origins (e.g. `https://l.example.org`) allowed to embed the app in an iframe; empty = embedding blocked |

Docker: `docker compose up -d` (data in volume `dinedeck-data`). The image copies `server.js`, `db.js`, `db/`, `security.js` and `public/`; add new source files in the `Dockerfile`.

Backup while running: `sqlite3 data/dinedeck.db ".backup backup.db"`.

## Structure

```
server.js            HTTP server, routes, SSE, static files
security.js          Security headers (CSP, nosniff, referrer policy, frame denial)
db.js                Business logic: writes, permissions, validation
db/                  schema.js, queries.js, read.js (reads, stats, export), helpers.js, errors.js
public/config.js     All tunable values (limits, defaults, lists, timings), shared by server and client
public/format.js     Pure helpers (times, payHref, round stage), unit-tested
public/qr.js         QR encoder (byte mode, ECC M, up to 106 bytes)
public/app.js        Entry: name prompt, router, live updates
public/views/        home, all, stats, round; round/ holds status, users, order, pay, qr-icon
public/i18n.js       Translations (German text is the key)
public/style.css     Colours via light-dark(), lengths in rem (1rem = 16 px)
test/                api, format, group, qr  (npm test)
```

Notes:

- The code still calls an order a **round** (`rounds` table, `/api/rounds`); the UI says "order".
- New UI text: use `t('German text')` and add the English entry to `public/i18n.js`.
- Limits appear as text in server errors in `db.js`; update them together with `config.js` and `i18n.js`.
- Amounts in the UI go through `money()` (decimal mark per language).

## Security

All responses carry security headers; static files are served with `Cache-Control: no-cache` and `index.html` adds a cache-busting `?v=`.

There is deliberately **no login**: the username comes from the browser and is trusted, so hiding the PayPal address is only a visibility rule. Intended for trusted networks (local, office, home). Do not expose it to the internet unprotected.
