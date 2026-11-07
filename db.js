import { DatabaseSync } from 'node:sqlite';

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
  phone TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS rounds (
  id INTEGER PRIMARY KEY,
  restaurant_id INTEGER NOT NULL REFERENCES restaurants(id),
  creator TEXT NOT NULL,
  buyer TEXT NOT NULL,
  paypal TEXT NOT NULL DEFAULT '',
  delivery_fee_cents INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS participants (
  round_id INTEGER NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  user TEXT NOT NULL,
  done INTEGER NOT NULL DEFAULT 0,
  paid INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (round_id, user)
);
CREATE TABLE IF NOT EXISTS items (
  id INTEGER PRIMARY KEY,
  round_id INTEGER NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  user TEXT NOT NULL,
  article TEXT NOT NULL,
  akey TEXT NOT NULL,
  price_cents INTEGER NOT NULL,
  qty INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS items_round ON items(round_id);
CREATE INDEX IF NOT EXISTS rounds_created ON rounds(created_at);
`;

export function openDb(file = ':memory:') {
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA);
  return db;
}

const collapse = (s) => String(s ?? '').trim().replace(/\s+/g, ' ');
const lower = (s) => collapse(s).toLocaleLowerCase('de');

function parseMoneyToCents(v, { max = 1000 } = {}) {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').trim().replace(',', '.'));
  if (!Number.isFinite(n) || n < 0 || n > max) throw new HttpError(400, 'Ungültiger Betrag');
  return Math.round(n * 100);
}

function cleanUser(u) {
  const name = collapse(u);
  if (!name || name.length > 32) throw new HttpError(400, 'Username fehlt oder ist zu lang (max. 32)');
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
    restInsert: db.prepare('INSERT INTO restaurants (name, name_key, url, phone) VALUES (?, ?, ?, ?)'),
    restUpdate: db.prepare('UPDATE restaurants SET url = ?, phone = ? WHERE id = ?'),
    restAll: db.prepare('SELECT id, name, url, phone FROM restaurants ORDER BY name COLLATE NOCASE'),
    roundInsert: db.prepare(
      'INSERT INTO rounds (restaurant_id, creator, buyer, paypal, delivery_fee_cents, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ),
    roundGet: db.prepare(
      `SELECT r.*, s.name AS rname, s.url AS rurl, s.phone AS rphone
       FROM rounds r JOIN restaurants s ON s.id = r.restaurant_id WHERE r.id = ?`
    ),
    roundList: db.prepare('SELECT id FROM rounds ORDER BY created_at DESC, id DESC LIMIT ?'),
    roundUpdate: db.prepare('UPDATE rounds SET buyer = ?, paypal = ?, delivery_fee_cents = ? WHERE id = ?'),
    roundExpiry: db.prepare('UPDATE rounds SET expires_at = ? WHERE id = ?'),
    partUpsert: db.prepare('INSERT OR IGNORE INTO participants (round_id, user) VALUES (?, ?)'),
    partAll: db.prepare('SELECT user, done, paid FROM participants WHERE round_id = ? ORDER BY rowid'),
    partSetDone: db.prepare('UPDATE participants SET done = ? WHERE round_id = ? AND user = ?'),
    partSetPaid: db.prepare('UPDATE participants SET paid = ? WHERE round_id = ? AND user = ?'),
    itemAll: db.prepare('SELECT * FROM items WHERE round_id = ? ORDER BY id'),
    itemGet: db.prepare('SELECT * FROM items WHERE id = ?'),
    itemInsert: db.prepare(
      'INSERT INTO items (round_id, user, article, akey, price_cents, qty) VALUES (?, ?, ?, ?, ?, ?)'
    ),
    itemUpdate: db.prepare('UPDATE items SET article = ?, akey = ?, price_cents = ?, qty = ? WHERE id = ?'),
    itemDelete: db.prepare('DELETE FROM items WHERE id = ?'),
  };

  function upsertRestaurant({ name, url = '', phone = '' }) {
    const n = collapse(name);
    if (!n || n.length > 80) throw new HttpError(400, 'Restaurantname fehlt oder ist zu lang');
    const u = collapse(url).slice(0, 300);
    const p = collapse(phone).slice(0, 40);
    const existing = q.restByKey.get(lower(n));
    if (existing) {
      // Leere Eingaben überschreiben gespeicherte Werte nicht.
      q.restUpdate.run(u || existing.url, p || existing.phone, existing.id);
      return existing.id;
    }
    return Number(q.restInsert.run(n, lower(n), u, p).lastInsertRowid);
  }

  function getRound(id) {
    const r = q.roundGet.get(Number(id));
    if (!r) throw new HttpError(404, 'Runde nicht gefunden');
    return r;
  }

  const canManage = (r, user) => !!user && (isAdmin(user) || lower(user) === lower(r.creator) || lower(user) === lower(r.buyer));

  function createRound(user, body) {
    user = cleanUser(user);
    const restaurantId = upsertRestaurant(body.restaurant ?? {});
    const buyer = cleanUser(body.buyer || user);
    const paypal = collapse(body.paypal).slice(0, 120);
    const fee = body.delivery_fee === undefined || body.delivery_fee === '' ? 0 : parseMoneyToCents(body.delivery_fee, { max: 100 });
    const minutes = body.minutes === undefined || body.minutes === '' ? 20 : Number(body.minutes);
    if (!Number.isFinite(minutes) || minutes < 1 || minutes > 240) throw new HttpError(400, 'Ablaufzeit 1–240 Minuten');
    const now = Date.now();
    const id = Number(q.roundInsert.run(restaurantId, user, buyer, paypal, fee, now, now + minutes * 60000).lastInsertRowid);
    return id;
  }

  function updateRound(user, id, body) {
    user = cleanUser(user);
    const r = getRound(id);
    if (!canManage(r, user)) throw new HttpError(403, 'Nur Ersteller, Besteller oder Admins');
    const buyer = body.buyer !== undefined ? cleanUser(body.buyer) : r.buyer;
    const paypal = body.paypal !== undefined ? collapse(body.paypal).slice(0, 120) : r.paypal;
    const fee = body.delivery_fee !== undefined ? parseMoneyToCents(body.delivery_fee, { max: 100 }) : r.delivery_fee_cents;
    q.roundUpdate.run(buyer, paypal, fee, r.id);
  }

  function changeTime(user, id, { action, minutes }) {
    user = cleanUser(user);
    const r = getRound(id);
    if (!canManage(r, user)) throw new HttpError(403, 'Nur Ersteller, Besteller oder Admins');
    const now = Date.now();
    if (action === 'lock') {
      q.roundExpiry.run(now, r.id);
    } else if (action === 'extend') {
      const m = minutes === undefined ? 5 : Number(minutes);
      if (!Number.isFinite(m) || m < 1 || m > 120) throw new HttpError(400, 'Verlängerung 1–120 Minuten');
      // Bei abgelaufener Runde (Wieder-Öffnen) ab jetzt rechnen.
      q.roundExpiry.run(Math.max(now, r.expires_at) + m * 60000, r.id);
    } else if (action === 'set') {
      const m = Number(minutes);
      if (!Number.isFinite(m) || m < 1 || m > 240) throw new HttpError(400, 'Ablaufzeit 1–240 Minuten');
      q.roundExpiry.run(now + m * 60000, r.id);
    } else {
      throw new HttpError(400, 'Unbekannte Aktion');
    }
  }

  function parseItem(body) {
    const article = collapse(body.article);
    if (!article || article.length > 80) throw new HttpError(400, 'Artikel fehlt oder ist zu lang');
    const price = parseMoneyToCents(body.price);
    const qty = body.qty === undefined || body.qty === '' ? 1 : Number(body.qty);
    if (!Number.isInteger(qty) || qty < 1 || qty > 99) throw new HttpError(400, 'Menge 1–99');
    return { article, akey: lower(article), price, qty };
  }

  const isLocked = (r, now) => now >= r.expires_at;

  function addItem(user, roundId, body) {
    user = cleanUser(user);
    const r = getRound(roundId);
    if (isLocked(r, Date.now())) throw new HttpError(423, 'Runde ist gesperrt');
    const it = parseItem(body);
    q.partUpsert.run(r.id, user);
    return Number(q.itemInsert.run(r.id, user, it.article, it.akey, it.price, it.qty).lastInsertRowid);
  }

  function ownItem(user, itemId) {
    user = cleanUser(user);
    const item = q.itemGet.get(Number(itemId));
    if (!item) throw new HttpError(404, 'Position nicht gefunden');
    if (lower(item.user) !== lower(user)) throw new HttpError(403, 'Nur eigene Positionen');
    const r = getRound(item.round_id);
    if (isLocked(r, Date.now())) throw new HttpError(423, 'Runde ist gesperrt');
    return item;
  }

  function updateItem(user, itemId, body) {
    const item = ownItem(user, itemId);
    const it = parseItem({ article: body.article ?? item.article, price: body.price ?? item.price_cents / 100, qty: body.qty ?? item.qty });
    q.itemUpdate.run(it.article, it.akey, it.price, it.qty, item.id);
    return item.round_id;
  }

  function deleteItem(user, itemId) {
    const item = ownItem(user, itemId);
    q.itemDelete.run(item.id);
    return item.round_id;
  }

  function setFlag(user, roundId, flag, body) {
    user = cleanUser(user);
    const r = getRound(roundId);
    const target = cleanUser(body.user || user);
    const self = lower(target) === lower(user);
    if (!self && !canManage(r, user)) throw new HttpError(403, 'Nur für sich selbst (oder als Ersteller/Besteller/Admin)');
    const value = body.value ? 1 : 0;
    q.partUpsert.run(r.id, target);
    (flag === 'done' ? q.partSetDone : q.partSetPaid).run(value, r.id, target);
    return r.id;
  }

  function roundDetail(id, viewer = '', now = Date.now()) {
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

    const users = [...names.entries()].map(([k, display]) => {
      const mine = items.filter((i) => lower(i.user) === k);
      const subtotal = mine.reduce((a, i) => a + i.price_cents * i.qty, 0);
      const st = state.get(k) ?? { done: false, paid: false };
      return {
        user: display,
        done: st.done,
        paid: st.paid,
        items: mine.map((i) => ({ id: i.id, article: i.article, price_cents: i.price_cents, qty: i.qty })),
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

    const groupMap = new Map();
    for (const it of items) {
      const key = `${it.akey}|${it.price_cents}`;
      let g = groupMap.get(key);
      if (!g) groupMap.set(key, (g = { article: it.article, price_cents: it.price_cents, qty: 0, sum_cents: 0, users: new Map() }));
      g.qty += it.qty;
      g.sum_cents += it.price_cents * it.qty;
      g.users.set(it.user, (g.users.get(it.user) ?? 0) + it.qty);
    }
    const groups = [...groupMap.values()]
      .map((g) => ({ ...g, users: [...g.users.entries()].map(([user, qty]) => ({ user, qty })) }))
      .sort((a, b) => a.article.localeCompare(b.article, 'de'));

    const withOrders = users.filter((u) => u.subtotal_cents > 0);
    const notReady = users.filter((u) => !u.done).map((u) => u.user);
    const locked = isLocked(r, now);
    const debts = withOrders
      .filter((u) => !u.paid && lower(u.user) !== lower(r.buyer))
      .map((u) => ({ user: u.user, amount_cents: u.total_cents }));
    const itemsTotal = users.reduce((a, u) => a + u.subtotal_cents, 0);

    return {
      id: r.id,
      restaurant: { name: r.rname, url: r.rurl, phone: r.rphone },
      creator: r.creator,
      buyer: r.buyer,
      paypal: r.paypal,
      delivery_fee_cents: r.delivery_fee_cents,
      created_at: r.created_at,
      expires_at: r.expires_at,
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

  function listRounds(viewer = '', limit = 60) {
    const now = Date.now();
    return q.roundList.all(limit).map(({ id }) => {
      const d = roundDetail(id, viewer, now);
      return {
        id: d.id,
        restaurant: d.restaurant.name,
        creator: d.creator,
        buyer: d.buyer,
        created_at: d.created_at,
        expires_at: d.expires_at,
        locked: d.locked,
        unpaid: d.unpaid,
        users: d.ready.total,
        done: d.ready.done,
        total_cents: d.grand_total_cents,
        debts_total_cents: d.debts_total_cents,
        debts_users: d.debts.map((x) => x.user),
      };
    });
  }

  function stats(scope = 'all') {
    const limitSql = scope === 'last30' ? 'ORDER BY created_at DESC, id DESC LIMIT 30' : '';
    const ids = db.prepare(`SELECT id FROM rounds ${limitSql}`).all().map((r) => r.id);
    if (!ids.length) return { scope, rounds: 0, restaurants: [], users: [], avg_item_cents: 0, avg_order_cents: 0 };
    const ph = ids.map(() => '?').join(',');
    const rows = db
      .prepare(
        `SELECT i.round_id, i.user, i.article, i.akey, i.price_cents, i.qty, r.restaurant_id, s.name AS rname
         FROM items i JOIN rounds r ON r.id = i.round_id JOIN restaurants s ON s.id = r.restaurant_id
         WHERE i.round_id IN (${ph})`
      )
      .all(...ids);
    const roundRest = db
      .prepare(`SELECT r.id, s.name FROM rounds r JOIN restaurants s ON s.id = r.restaurant_id WHERE r.id IN (${ph})`)
      .all(...ids);

    const rest = new Map();
    for (const { name } of roundRest) {
      const e = rest.get(name) ?? { name, rounds: 0, items: 0, dishes: new Map() };
      e.rounds += 1;
      rest.set(name, e);
    }
    const users = new Map();
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
      const u = users.get(uk) ?? { user: it.user, units: 0, money: 0, orders: new Set() };
      u.units += it.qty;
      u.money += it.price_cents * it.qty;
      u.orders.add(it.round_id);
      users.set(uk, u);
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
          return { name: e.name, rounds: e.rounds, items: e.items, top_dish: top ? top.article : null, top_dish_qty: top ? top.qty : 0 };
        })
        .sort((a, b) => b.rounds - a.rounds || b.items - a.items),
      users: [...users.values()]
        .map((u) => ({
          user: u.user,
          orders: u.orders.size,
          avg_item_cents: Math.round(u.money / u.units),
          avg_order_cents: Math.round(u.money / u.orders.size),
        }))
        .sort((a, b) => b.orders - a.orders || a.user.localeCompare(b.user, 'de')),
    };
  }

  return {
    isAdmin,
    cleanUser,
    restaurants: () => q.restAll.all(),
    createRound,
    updateRound,
    changeTime,
    addItem,
    updateItem,
    deleteItem,
    setFlag,
    roundDetail,
    listRounds,
    stats,
  };
}
