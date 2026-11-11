import { DatabaseSync } from 'node:sqlite';
import { LIMITS, DEFAULTS, LISTS } from './public/config.js';
import { medianMinutes } from './public/format.js';

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS restaurants (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  name_key TEXT NOT NULL UNIQUE,
  url TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS rounds (
  id INTEGER PRIMARY KEY,
  restaurant_id INTEGER NOT NULL REFERENCES restaurants(id),
  creator TEXT NOT NULL,
  buyer TEXT NOT NULL,
  paypal TEXT NOT NULL DEFAULT '',
  delivery_fee_cents INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  close_when_ready INTEGER NOT NULL DEFAULT 0,
  ordered_at INTEGER,
  eta_at INTEGER,
  delivered_at INTEGER
);
CREATE TABLE IF NOT EXISTS participants (
  round_id INTEGER NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  user TEXT NOT NULL,
  done INTEGER NOT NULL DEFAULT 0,
  paid INTEGER NOT NULL DEFAULT 0,
  approved INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (round_id, user)
);
CREATE TABLE IF NOT EXISTS items (
  id INTEGER PRIMARY KEY,
  round_id INTEGER NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  user TEXT NOT NULL,
  article TEXT NOT NULL,
  akey TEXT NOT NULL,
  variant TEXT NOT NULL DEFAULT '',
  vkey TEXT NOT NULL DEFAULT '',
  price_cents INTEGER NOT NULL,
  qty INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS payment_profiles (
  user_key TEXT PRIMARY KEY,
  paypal TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS items_round ON items(round_id);
CREATE INDEX IF NOT EXISTS rounds_created ON rounds(created_at);
`;

export function openDb(file = ':memory:') {
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA);
  // Migration älterer Datenbanken (vor Einführung der Varianten)
  const cols = db.prepare('PRAGMA table_info(items)').all().map((c) => c.name);
  if (!cols.includes('variant')) db.exec("ALTER TABLE items ADD COLUMN variant TEXT NOT NULL DEFAULT ''");
  if (!cols.includes('vkey')) db.exec("ALTER TABLE items ADD COLUMN vkey TEXT NOT NULL DEFAULT ''");
  const rcols = db.prepare('PRAGMA table_info(rounds)').all().map((c) => c.name);
  if (!rcols.includes('close_when_ready')) db.exec('ALTER TABLE rounds ADD COLUMN close_when_ready INTEGER NOT NULL DEFAULT 0');
  if (!rcols.includes('ordered_at')) db.exec('ALTER TABLE rounds ADD COLUMN ordered_at INTEGER');
  if (!rcols.includes('eta_at')) db.exec('ALTER TABLE rounds ADD COLUMN eta_at INTEGER');
  if (!rcols.includes('delivered_at')) db.exec('ALTER TABLE rounds ADD COLUMN delivered_at INTEGER');
  const scols = db.prepare('PRAGMA table_info(restaurants)').all().map((c) => c.name);
  if (!scols.includes('address')) db.exec("ALTER TABLE restaurants ADD COLUMN address TEXT NOT NULL DEFAULT ''");
  const pcols = db.prepare('PRAGMA table_info(participants)').all().map((c) => c.name);
  if (!pcols.includes('approved')) db.exec('ALTER TABLE participants ADD COLUMN approved INTEGER NOT NULL DEFAULT 1');
  return db;
}

const collapse = (s) => String(s ?? '').trim().replace(/\s+/g, ' ');
const lower = (s) => collapse(s).toLocaleLowerCase('de');

/**
 * Vergleichsschlüssel für Artikelnamen. Gleicht NUR sichere Unterschiede aus:
 * Groß/Klein, Leerzeichen, Satzzeichen, Akzente, ä=ae/ö=oe/ü=ue, ß=ss.
 * Es wird bewusst nichts „ähnliches“ zusammengeführt (Cola ≠ Cola Zero, Nr. 12 ≠ Nr. 21).
 */
export function foldKey(s) {
  return String(s ?? '')
    .toLocaleLowerCase('de')
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** Variante ist Freitext (z. B. „26 cm“, „Fladenbrot, scharf“); verglichen wird nur Schreibweise-bereinigt. */
export function parseVariant(v) {
  const variant = collapse(v).slice(0, LIMITS.variant);
  return { variant, vkey: foldKey(variant) };
}

function parseMoneyToCents(v, { max = LIMITS.priceMaxEuro } = {}) {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').trim().replace(',', '.'));
  if (!Number.isFinite(n) || n < 0 || n > max) throw new HttpError(400, 'Ungültiger Betrag');
  return Math.round(n * 100);
}

function cleanUser(u) {
  const name = collapse(u);
  if (!name || name.length > LIMITS.userName) throw new HttpError(400, 'Username fehlt oder ist zu lang (max. 32)');
  return name;
}

/** Verteilt `total` Cents proportional zu `weights` (Largest Remainder). */
function distribute(total, weights) {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (!total || !sum) return weights.map(() => 0);
  const raw = weights.map((w) => (total * w) / sum);
  const out = raw.map(Math.floor);
  let rest = total - out.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => [r - Math.floor(r), i]).sort((a, b) => b[0] - a[0]);
  for (const [, i] of order) {
    if (rest <= 0) break;
    out[i] += 1;
    rest -= 1;
  }
  return out;
}

export function createLogic(db, { admins = [] } = {}) {
  const adminSet = new Set(admins.map(lower));
  const isAdmin = (u) => adminSet.has(lower(u));

  const q = {
    restByKey: db.prepare('SELECT * FROM restaurants WHERE name_key = ?'),
    restInsert: db.prepare('INSERT INTO restaurants (name, name_key, url, phone, address) VALUES (?, ?, ?, ?, ?)'),
    restUpdate: db.prepare('UPDATE restaurants SET url = ?, phone = ?, address = ? WHERE id = ?'),
    deliveries: db.prepare('SELECT ordered_at, delivered_at FROM rounds WHERE restaurant_id = ? AND ordered_at IS NOT NULL AND delivered_at IS NOT NULL ORDER BY delivered_at DESC LIMIT ?'),
    restAll: db.prepare(
      `SELECT s.id, s.name, s.url, s.phone, s.address,
        (SELECT r.delivery_fee_cents FROM rounds r WHERE r.restaurant_id = s.id ORDER BY r.id DESC LIMIT 1) AS last_delivery_fee_cents
       FROM restaurants s ORDER BY s.name COLLATE NOCASE`
    ),
    profGet: db.prepare('SELECT paypal FROM payment_profiles WHERE user_key = ?'),
    profSet: db.prepare('INSERT INTO payment_profiles (user_key, paypal) VALUES (?, ?) ON CONFLICT(user_key) DO UPDATE SET paypal = excluded.paypal'),
    roundInsert: db.prepare(
      'INSERT INTO rounds (restaurant_id, creator, buyer, paypal, delivery_fee_cents, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ),
    roundGet: db.prepare(
      `SELECT r.*, s.name AS rname, s.url AS rurl, s.phone AS rphone, s.address AS raddress
       FROM rounds r JOIN restaurants s ON s.id = r.restaurant_id WHERE r.id = ?`
    ),
    knownUsers: db.prepare('SELECT user AS name FROM participants UNION SELECT user FROM items UNION SELECT creator FROM rounds UNION SELECT buyer FROM rounds'),
    roundList: db.prepare('SELECT id FROM rounds ORDER BY created_at DESC, id DESC LIMIT ?'),
    roundsOfRestaurant: db.prepare('SELECT created_at, expires_at, ordered_at FROM rounds WHERE restaurant_id = ?'),
    roundOrder: db.prepare('UPDATE rounds SET ordered_at = ?, eta_at = ?, expires_at = ?, delivered_at = ? WHERE id = ?'),
    roundUpdate: db.prepare('UPDATE rounds SET buyer = ?, paypal = ?, delivery_fee_cents = ? WHERE id = ?'),
    roundCwr: db.prepare('UPDATE rounds SET close_when_ready = ? WHERE id = ?'),
    roundExpiry: db.prepare('UPDATE rounds SET expires_at = ? WHERE id = ?'),
    partUpsert: db.prepare('INSERT OR IGNORE INTO participants (round_id, user) VALUES (?, ?)'),
    partAll: db.prepare('SELECT user, done, paid FROM participants WHERE round_id = ? AND approved = 1 ORDER BY rowid'),
    partPending: db.prepare('SELECT user FROM participants WHERE round_id = ? AND approved = 0 ORDER BY rowid'),
    partGet: db.prepare('SELECT approved FROM participants WHERE round_id = ? AND user = ?'),
    partAskJoin: db.prepare('INSERT OR IGNORE INTO participants (round_id, user, approved) VALUES (?, ?, 0)'),
    partApprove: db.prepare('UPDATE participants SET approved = 1 WHERE round_id = ? AND user = ?'),
    partDrop: db.prepare('DELETE FROM participants WHERE round_id = ? AND user = ? AND approved = 0'),
    partSetDone: db.prepare('UPDATE participants SET done = ? WHERE round_id = ? AND user = ?'),
    partSetPaid: db.prepare('UPDATE participants SET paid = ? WHERE round_id = ? AND user = ?'),
    itemAll: db.prepare('SELECT * FROM items WHERE round_id = ? ORDER BY id'),
    itemGet: db.prepare('SELECT * FROM items WHERE id = ?'),
    itemInsert: db.prepare(
      'INSERT INTO items (round_id, user, article, akey, variant, vkey, price_cents, qty) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ),
    itemUpdate: db.prepare('UPDATE items SET article = ?, akey = ?, variant = ?, vkey = ?, price_cents = ?, qty = ? WHERE id = ?'),
    catalogRows: db.prepare(
      `SELECT i.id, i.round_id, i.user, i.article, i.akey, i.variant, i.vkey, i.price_cents, r.created_at
       FROM items i JOIN rounds r ON r.id = i.round_id WHERE r.restaurant_id = ? ORDER BY i.id`
    ),

    itemDelete: db.prepare('DELETE FROM items WHERE id = ?'),
  };

  function upsertRestaurant({ name, url = '', phone = '', address = '' }) {
    const n = collapse(name);
    if (!n || n.length > LIMITS.restaurantName) throw new HttpError(400, 'Restaurantname fehlt oder ist zu lang');
    const u = collapse(url).slice(0, LIMITS.restaurantUrl);
    const p = collapse(phone).slice(0, LIMITS.restaurantPhone);
    const ad = collapse(address).slice(0, LIMITS.restaurantAddress);
    const existing = q.restByKey.get(lower(n));
    if (existing) {
      // Leere Eingaben überschreiben gespeicherte Werte nicht.
      q.restUpdate.run(u || existing.url, p || existing.phone, ad || existing.address, existing.id);
      return existing.id;
    }
    return Number(q.restInsert.run(n, lower(n), u, p, ad).lastInsertRowid);
  }

  // Statistische Lieferzeit: Median der letzten Lieferungen (Bestellt → Geliefert)
  function deliveryStats(restaurantId) {
    const rows = q.deliveries.all(restaurantId, LISTS.deliveryStatsLast);
    return { delivery_minutes: medianMinutes(rows.map((x) => x.delivered_at - x.ordered_at)), delivery_count: rows.length };
  }

  function getRound(id) {
    const r = q.roundGet.get(Number(id));
    if (!r) throw new HttpError(404, 'Bestellung nicht gefunden');
    return r;
  }

  const canManage = (r, user) => !!user && (isAdmin(user) || lower(user) === lower(r.creator) || lower(user) === lower(r.buyer));

  function createRound(user, body) {
    user = cleanUser(user);
    const restaurantId = upsertRestaurant(body.restaurant ?? {});
    const buyer = cleanUser(body.buyer || user);
    const paypal = collapse(body.paypal).slice(0, LIMITS.paypal) || (q.profGet.get(lower(buyer))?.paypal ?? '');
    const fee = body.delivery_fee === undefined || body.delivery_fee === '' ? 0 : parseMoneyToCents(body.delivery_fee, { max: LIMITS.feeMaxEuro });
    const minutes = body.minutes === undefined || body.minutes === '' ? DEFAULTS.deadlineMinutes : Number(body.minutes);
    if (!Number.isFinite(minutes) || minutes < LIMITS.deadlineMinMinutes || minutes > LIMITS.deadlineMaxMinutes) throw new HttpError(400, 'Ablaufzeit 1–240 Minuten');
    const now = Date.now();
    // Pro Restaurant nur eine Bestellung gleichzeitig: offen, oder geschlossen aber noch nicht bestellt (nur kürzlich)
    const pending = q.roundsOfRestaurant.all(restaurantId).some((x) => now < x.expires_at || (!x.ordered_at && now - x.created_at < LIMITS.unorderedBlockHours * 3600000));
    if (pending) throw new HttpError(409, 'Für dieses Restaurant läuft bereits eine Bestellung');
    const id = Number(q.roundInsert.run(restaurantId, user, buyer, paypal, fee, now, now + minutes * 60000).lastInsertRowid);
    if (paypal) q.profSet.run(lower(buyer), paypal);
    return id;
  }

  function updateRound(user, id, body) {
    user = cleanUser(user);
    const r = getRound(id);
    if (!canManage(r, user)) throw new HttpError(403, 'Nur Ersteller, Besteller oder Admins');
    const buyer = body.buyer !== undefined ? cleanUser(body.buyer) : r.buyer;
    const paypal = body.paypal !== undefined ? collapse(body.paypal).slice(0, LIMITS.paypal) : r.paypal;
    const fee = body.delivery_fee !== undefined ? parseMoneyToCents(body.delivery_fee, { max: LIMITS.feeMaxEuro }) : r.delivery_fee_cents;
    let orderedAt = r.ordered_at ?? null;
    let etaAt = r.eta_at ?? null;
    let deliveredAt = r.delivered_at ?? null;
    let expires = r.expires_at;
    const now = Date.now();
    if (body.ordered !== undefined) {
      if (body.ordered) {
        if (now < expires) throw new HttpError(400, 'Erst die Bestellung schließen');
        orderedAt = orderedAt ?? now;
      } else {
        orderedAt = null;
        etaAt = null;
        deliveredAt = null;
      }
    }
    if (body.delivered !== undefined) {
      if (body.delivered && !orderedAt) throw new HttpError(400, 'Erst als bestellt melden');
      deliveredAt = body.delivered ? (deliveredAt ?? now) : null;
    }
    if (body.eta_minutes !== undefined && body.eta_minutes !== null && body.eta_minutes !== '') {
      const m = Number(body.eta_minutes);
      if (!Number.isFinite(m) || m < 1 || m > LIMITS.etaMaxMinutes) throw new HttpError(400, 'Lieferzeit 1–240 Minuten');
      if (!orderedAt) throw new HttpError(400, 'Erst als bestellt melden');
      etaAt = now + Math.round(m) * 60000;
    }
    q.roundUpdate.run(buyer, paypal, fee, r.id);
    q.roundOrder.run(orderedAt, etaAt, expires, deliveredAt, r.id);
    if (body.approve) { q.partApprove.run(r.id, cleanUser(body.approve)); autoLock(r.id); }
    if (body.reject) q.partDrop.run(r.id, cleanUser(body.reject));
    if (body.close_when_ready !== undefined) {
      if (isLocked(r, now)) throw new HttpError(400, 'Bestellung ist geschlossen');
      q.roundCwr.run(body.close_when_ready ? 1 : 0, r.id);
      if (body.close_when_ready) autoLock(r.id);
    }
    if (paypal) q.profSet.run(lower(buyer), paypal);
  }

  // „Schließen, wenn alle fertig“: schließt, sobald alle echten User (mit mindestens einem Artikel) fertig sind.
  function autoLock(roundId) {
    const r = getRound(roundId);
    const now = Date.now();
    if (!r.close_when_ready || isLocked(r, now)) return;
    const d = roundDetail(roundId, '', now);
    const actual = d.users.filter((u) => u.subtotal_cents > 0);
    if (actual.length && actual.every((u) => u.done)) q.roundExpiry.run(now, r.id);
  }

  function changeTime(user, id, { action, minutes }) {
    user = cleanUser(user);
    const r = getRound(id);
    if (!canManage(r, user)) throw new HttpError(403, 'Nur Ersteller, Besteller oder Admins');
    const now = Date.now();
    if (action === 'lock') {
      q.roundExpiry.run(now, r.id);
    } else if (action === 'extend' || action === 'reopen') {
      const m = minutes === undefined ? DEFAULTS.extendMinutes : Number(minutes);
      if (!Number.isFinite(m) || m < LIMITS.deadlineMinMinutes || m > LIMITS.extendMaxMinutes) throw new HttpError(400, 'Verlängerung 1–120 Minuten');
      if (r.ordered_at) throw new HttpError(400, 'Erst „Bestellt“ zurücknehmen');
      const closed = isLocked(r, now);
      if (action === 'extend' && closed) throw new HttpError(400, 'Erst wieder öffnen');
      if (action === 'reopen' && !closed) throw new HttpError(400, 'Die Bestellung ist noch offen');
      q.roundExpiry.run(Math.max(now, r.expires_at) + m * 60000, r.id);
    } else if (action === 'set') {
      const m = Number(minutes);
      if (!Number.isFinite(m) || m < LIMITS.deadlineMinMinutes || m > LIMITS.deadlineMaxMinutes) throw new HttpError(400, 'Ablaufzeit 1–240 Minuten');
      q.roundExpiry.run(now + m * 60000, r.id);
    } else {
      throw new HttpError(400, 'Unbekannte Aktion');
    }
  }

  function parseItem(body) {
    const article = collapse(body.article);
    if (!article || article.length > LIMITS.article) throw new HttpError(400, 'Artikel fehlt oder ist zu lang');
    const price = parseMoneyToCents(body.price);
    const qty = body.qty === undefined || body.qty === '' ? 1 : Number(body.qty);
    if (!Number.isInteger(qty) || qty < LIMITS.qtyMin || qty > LIMITS.qtyMax) throw new HttpError(400, 'Menge 1–10');
    const akey = foldKey(article);
    if (!akey) throw new HttpError(400, 'Artikel fehlt oder ist zu lang');
    const { variant, vkey } = parseVariant(body.variant);
    return { article, akey, variant, vkey, price, qty };
  }

  const isLocked = (r, now) => now >= r.expires_at;

  // Bei „Schließen, wenn alle fertig“ kommen neue User nur nach Freigabe durch Ersteller/Besteller/Admin hinein.
  function admit(r, user) {
    if (!r.close_when_ready || canManage(r, user)) return;
    const p = q.partGet.get(r.id, user);
    if (p && p.approved) return;
    q.partAskJoin.run(r.id, user);
    throw new HttpError(403, 'Wartet auf Freigabe durch den Besteller');
  }

  function addItem(user, roundId, body) {
    user = cleanUser(user);
    const r = getRound(roundId);
    if (isLocked(r, Date.now())) throw new HttpError(423, 'Bestellung ist geschlossen');
    const it = parseItem(body);
    admit(r, user);
    q.partUpsert.run(r.id, user);
    q.partSetDone.run(0, r.id, user);
    return Number(q.itemInsert.run(r.id, user, it.article, it.akey, it.variant, it.vkey, it.price, it.qty).lastInsertRowid);
  }

  function ownItem(user, itemId) {
    user = cleanUser(user);
    const item = q.itemGet.get(Number(itemId));
    if (!item) throw new HttpError(404, 'Position nicht gefunden');
    if (lower(item.user) !== lower(user)) throw new HttpError(403, 'Nur eigene Positionen');
    const r = getRound(item.round_id);
    if (isLocked(r, Date.now())) throw new HttpError(423, 'Bestellung ist geschlossen');
    return item;
  }

  function updateItem(user, itemId, body) {
    const item = ownItem(user, itemId);
    const it = parseItem({
      article: body.article ?? item.article,
      variant: body.variant ?? item.variant,
      price: body.price ?? item.price_cents / 100,
      qty: body.qty ?? item.qty,
    });
    q.itemUpdate.run(it.article, it.akey, it.variant, it.vkey, it.price, it.qty, item.id);
    q.partSetDone.run(0, item.round_id, item.user);
    return item.round_id;
  }

  function deleteItem(user, itemId) {
    const item = ownItem(user, itemId);
    q.itemDelete.run(item.id);
    q.partSetDone.run(0, item.round_id, item.user);
    return item.round_id;
  }

  function setFlag(user, roundId, flag, body) {
    user = cleanUser(user);
    const r = getRound(roundId);
    const target = cleanUser(body.user || user);
    const self = lower(target) === lower(user);
    if (flag === 'done' && !self) throw new HttpError(403, 'Nur du selbst kannst deine Artikel als ready bestätigen');
    if (!self && !canManage(r, user)) throw new HttpError(403, 'Nur für sich selbst (oder als Ersteller/Besteller/Admin)');
    const value = body.value ? 1 : 0;
    if (self) admit(r, target);
    q.partUpsert.run(r.id, target);
    (flag === 'done' ? q.partSetDone : q.partSetPaid).run(value, r.id, target);
    if (flag === 'done' && value) autoLock(r.id);
    return r.id;
  }

  function roundDetail(id, viewer = '', now = Date.now(), { withPrices = true } = {}) {
    const r = getRound(id);
    const items = q.itemAll.all(r.id);
    const parts = q.partAll.all(r.id);
    const names = new Map(); // lower -> display
    const state = new Map();
    for (const p of parts) {
      names.set(lower(p.user), p.user);
      state.set(lower(p.user), { done: !!p.done, paid: !!p.paid });
    }
    for (const it of items) if (!names.has(lower(it.user))) names.set(lower(it.user), it.user);

    const locked = isLocked(r, now);
    const users = [...names.entries()].map(([k, display]) => {
      const mine = items.filter((i) => lower(i.user) === k);
      const st = state.get(k) ?? { done: false, paid: false };
      // Geschlossen: Artikel nicht fertiger User bleiben sichtbar, zählen aber nicht (Wieder öffnen bringt sie zurück)
      const excluded = locked && !st.done && mine.length > 0;
      const subtotal = excluded ? 0 : mine.reduce((a, i) => a + i.price_cents * i.qty, 0);
      return {
        user: display,
        done: st.done,
        paid: st.paid,
        excluded,
        items: mine.map((i) => ({ id: i.id, article: i.article, variant: i.variant, price_cents: i.price_cents, qty: i.qty })),
        subtotal_cents: subtotal,
        fee_cents: 0,
        total_cents: subtotal,
      };
    });

    const shares = distribute(r.delivery_fee_cents, users.map((u) => u.subtotal_cents));
    users.forEach((u, i) => {
      u.fee_cents = shares[i];
      u.total_cents = u.subtotal_cents + shares[i];
    });

    // Zuletzt bekannter Preis aus früheren Runden desselben Restaurants (nie aus dieser Runde)
    const known = new Map();
    if (withPrices) {
      for (const row of q.catalogRows.all(r.restaurant_id)) {
        if (row.round_id !== r.id) known.set(`${row.akey}|${row.vkey}`, row.price_cents);
      }
    }

    const excludedUsers = new Set(users.filter((u) => u.excluded).map((u) => lower(u.user)));
    const groupMap = new Map();
    for (const it of items) {
      if (excludedUsers.has(lower(it.user))) continue;
      const key = `${it.akey}|${it.vkey}|${it.price_cents}`;
      let g = groupMap.get(key);
      if (!g) groupMap.set(key, (g = { article: it.article, variant: it.variant, ak: `${it.akey}|${it.vkey}`, price_cents: it.price_cents, qty: 0, sum_cents: 0, users: new Map() }));
      g.qty += it.qty;
      g.sum_cents += it.price_cents * it.qty;
      g.users.set(it.user, (g.users.get(it.user) ?? 0) + it.qty);
    }
    const groups = [...groupMap.values()]
      .map(({ ak, users: gu, ...g }) => {
        const k = known.get(ak) ?? null;
        return { ...g, users: [...gu.entries()].map(([user, qty]) => ({ user, qty })), known_price_cents: k, price_differs: k !== null && k !== g.price_cents };
      })
      .sort((a, b) => a.article.localeCompare(b.article, 'de') || a.variant.localeCompare(b.variant, 'de') || a.price_cents - b.price_cents);

    // Bezahladresse nur für Teilnehmer der Runde, Besteller, Ersteller und Admins – nie in Listen.
    const canSeePay = !!viewer && (canManage(r, viewer) || names.has(lower(viewer)));
    const withOrders = users.filter((u) => u.subtotal_cents > 0);
    const notReady = users.filter((u) => !u.done).map((u) => u.user);
    const debts = withOrders
      .filter((u) => !u.paid && lower(u.user) !== lower(r.buyer))
      .map((u) => ({ user: u.user, amount_cents: u.total_cents }));
    const itemsTotal = users.reduce((a, u) => a + u.subtotal_cents, 0);

    return {
      id: r.id,
      restaurant: { name: r.rname, url: r.rurl, phone: r.rphone, address: r.raddress, ...deliveryStats(r.restaurant_id) },
      creator: r.creator,
      buyer: r.buyer,
      paypal: canSeePay ? r.paypal : '',
      paypal_visible: canSeePay,
      delivery_fee_cents: r.delivery_fee_cents,
      created_at: r.created_at,
      expires_at: r.expires_at,
      close_when_ready: !!r.close_when_ready,
      ordered_at: r.ordered_at ?? null,
      eta_at: r.eta_at ?? null,
      delivered_at: r.delivered_at ?? null,
      pending: r.close_when_ready && viewer && canManage(r, viewer) ? q.partPending.all(r.id).map((x) => x.user) : [],
      viewer_pending: !!(r.close_when_ready && viewer && !canManage(r, viewer) && q.partGet.get(r.id, viewer)?.approved === 0),
      server_now: now,
      locked,
      users,
      groups,
      items_total_cents: itemsTotal,
      grand_total_cents: itemsTotal + r.delivery_fee_cents,
      ready: { total: users.length, done: users.length - notReady.length, not_ready: notReady },
      debts,
      debts_total_cents: debts.reduce((a, d) => a + d.amount_cents, 0),
      unpaid: locked && debts.length > 0,
      viewer: viewer
        ? { user: viewer, can_manage: canManage(r, viewer), is_admin: isAdmin(viewer) }
        : { user: '', can_manage: false, is_admin: false },
    };
  }

  // Bekannte Namen (für Vorschläge bei der Namenswahl), ohne Groß/Klein-Duplikate
  function users() {
    const seen = new Map();
    for (const { name } of q.knownUsers.all()) if (name && !seen.has(lower(name))) seen.set(lower(name), name);
    return [...seen.values()].sort((a, b) => a.localeCompare(b, 'de'));
  }

  // Export aller Artikelzeilen (Admin): eine Zeile je Artikel mit Bestell- und Lieferdaten
  function exportRows() {
    const iso = (ms) => (ms ? new Date(ms).toISOString() : null);
    return db
      .prepare(
        `SELECT r.id, r.created_at, s.name AS restaurant, r.creator, r.buyer, r.delivery_fee_cents, r.ordered_at, r.delivered_at,
                i.user, i.article, i.variant, i.price_cents, i.qty, COALESCE(p.done, 0) AS done, COALESCE(p.paid, 0) AS paid
         FROM items i JOIN rounds r ON r.id = i.round_id JOIN restaurants s ON s.id = r.restaurant_id
         LEFT JOIN participants p ON p.round_id = r.id AND lower(p.user) = lower(i.user)
         ORDER BY r.created_at, r.id, i.id`
      )
      .all()
      .map((x) => ({
        Datum: iso(x.created_at),
        Bestellung: x.id,
        Restaurant: x.restaurant,
        Ersteller: x.creator,
        Besteller: x.buyer,
        User: x.user,
        Artikel: x.article,
        Variante: x.variant,
        Menge: x.qty,
        Einzelpreis: x.price_cents / 100,
        Summe: (x.price_cents * x.qty) / 100,
        Ready: !!x.done,
        Bezahlt: !!x.paid,
        Lieferkosten: x.delivery_fee_cents / 100,
        Bestellt: iso(x.ordered_at),
        Geliefert: iso(x.delivered_at),
        Lieferzeit_min: x.ordered_at && x.delivered_at ? Math.round((x.delivered_at - x.ordered_at) / 60000) : null,
      }));
  }

  function listRounds(viewer = '', limit = LISTS.rounds) {
    const now = Date.now();
    return q.roundList.all(limit).map(({ id }) => {
      const d = roundDetail(id, viewer, now, { withPrices: false });
      return {
        id: d.id,
        restaurant: d.restaurant.name,
        creator: d.creator,
        buyer: d.buyer,
        created_at: d.created_at,
        expires_at: d.expires_at,
        locked: d.locked,
        ordered: !!d.ordered_at,
        delivered: !!d.delivered_at,
        unpaid: d.unpaid,
        users: d.ready.total,
        done: d.ready.done,
        total_cents: d.grand_total_cents,
        debts_total_cents: d.debts_total_cents,
        debts_users: d.debts.map((x) => x.user),
      };
    });
  }

  /**
   * Katalog je Restaurant, gelernt aus bisherigen Bestellungen. Ein Name wird erst ab 2 Nutzungen vorgeschlagen,
   * damit sich einmalige Tippfehler nicht festsetzen. Der Preis wird nur als Hinweis geliefert, nie automatisch gesetzt.
   */
  function catalog(roundId) {
    const r = getRound(roundId);
    const entries = new Map();
    // Häufigste Schreibweise gewinnt; bei Gleichstand die zuletzt verwendete.
    const top = (spell, last) => [...spell.entries()].sort((x, y) => y[1] - x[1] || (x[0] === last ? -1 : y[0] === last ? 1 : 0))[0][0];

    for (const row of q.catalogRows.all(r.restaurant_id)) {
      let e = entries.get(row.akey);
      if (!e) entries.set(row.akey, (e = { spell: new Map(), last: row.article, uses: 0, variants: new Map() }));
      e.spell.set(row.article, (e.spell.get(row.article) ?? 0) + 1);
      e.last = row.article;
      e.uses += 1;
      let v = e.variants.get(row.vkey);
      if (!v) e.variants.set(row.vkey, (v = { spell: new Map(), last: row.variant, count: 0, price_cents: null }));
      v.spell.set(row.variant, (v.spell.get(row.variant) ?? 0) + 1);
      v.last = row.variant;
      v.count += 1;
      v.price_cents = row.price_cents; // nach id sortiert → zuletzt gesetzter Preis
    }
    return [...entries.values()]
      .filter((e) => e.uses >= LISTS.catalogMinUses)
      .map((e) => ({
        article: top(e.spell, e.last),
        uses: e.uses,
        variants: [...e.variants.values()]
          .map((v) => ({ variant: top(v.spell, v.last), count: v.count, last_price_cents: v.price_cents }))
          .sort((a, b) => b.count - a.count),
      }))
      .sort((a, b) => b.uses - a.uses || a.article.localeCompare(b.article, 'de'))
      .slice(0, LISTS.catalogMax);
  }

  function stats(scope = 'all') {
    const limitSql = scope === 'last30' ? `ORDER BY created_at DESC, id DESC LIMIT ${LISTS.statsLast}` : '';
    const ids = db.prepare(`SELECT id FROM rounds ${limitSql}`).all().map((r) => r.id);
    if (!ids.length) return { scope, rounds: 0, restaurants: [], avg_item_cents: 0, avg_order_cents: 0 };
    const ph = ids.map(() => '?').join(',');
    const rows = db
      .prepare(
        `SELECT i.round_id, i.user, i.article, i.akey, i.price_cents, i.qty, r.restaurant_id, s.name AS rname
         FROM items i JOIN rounds r ON r.id = i.round_id JOIN restaurants s ON s.id = r.restaurant_id
         WHERE i.round_id IN (${ph})`
      )
      .all(...ids);
    const roundRest = db
      .prepare(`SELECT r.id, s.id AS sid, s.name FROM rounds r JOIN restaurants s ON s.id = r.restaurant_id WHERE r.id IN (${ph})`)
      .all(...ids);

    const rest = new Map();
    for (const { name, sid } of roundRest) {
      const e = rest.get(name) ?? { name, sid, rounds: 0, items: 0, dishes: new Map() };
      e.rounds += 1;
      rest.set(name, e);
    }
    let units = 0;
    let money = 0;
    const orders = new Map(); // round|user -> cents
    for (const it of rows) {
      const e = rest.get(it.rname);
      e.items += it.qty;
      const d = e.dishes.get(it.akey) ?? { article: it.article, qty: 0 };
      d.qty += it.qty;
      e.dishes.set(it.akey, d);
      units += it.qty;
      money += it.price_cents * it.qty;
      const uk = lower(it.user);
      const ok = `${it.round_id}|${uk}`;
      orders.set(ok, (orders.get(ok) ?? 0) + it.price_cents * it.qty);
    }
    const orderVals = [...orders.values()];
    return {
      scope,
      rounds: ids.length,
      avg_item_cents: units ? Math.round(money / units) : 0,
      avg_order_cents: orderVals.length ? Math.round(orderVals.reduce((a, b) => a + b, 0) / orderVals.length) : 0,
      restaurants: [...rest.values()]
        .map((e) => {
          const top = [...e.dishes.values()].sort((a, b) => b.qty - a.qty || a.article.localeCompare(b.article, 'de'))[0];
          return { name: e.name, rounds: e.rounds, items: e.items, top_dish: top ? top.article : null, top_dish_qty: top ? top.qty : 0, delivery_minutes: deliveryStats(e.sid).delivery_minutes };
        })
        .sort((a, b) => b.rounds - a.rounds || b.items - a.items)
    };
  }

  return {
    isAdmin,
    cleanUser,
    restaurants: () => q.restAll.all().map((x) => ({ ...x, ...deliveryStats(x.id) })),
    createRound,
    updateRound,
    myPaypal: (user) => (user ? (q.profGet.get(lower(user))?.paypal ?? '') : ''),
    changeTime,
    addItem,
    updateItem,
    deleteItem,
    setFlag,
    roundDetail,
    listRounds,
    exportRows,
    users,
    catalog,
    stats,
  };
}
