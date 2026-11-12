// Lesende Abfragen: Rundendetail, Listen, Export, Statistik, Katalog
import { LISTS } from '../public/config.js';
import { HttpError } from './errors.js';
import { collapse, lower, foldKey, parseVariant, parseMoneyToCents, distribute } from './helpers.js';

export function createReads({ db, q, getRound, isLocked, isAdmin, canManage, isBuyer, deliveryStats }) {
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

    const shares = distribute(r.delivery_fee_cents, users.map((u) => (u.subtotal_cents > 0 ? 1 : 0)));
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
        ? { user: viewer, can_manage: canManage(r, viewer), is_buyer: isBuyer(r, viewer), is_admin: isAdmin(viewer) }
        : { user: '', can_manage: false, is_buyer: false, is_admin: false },
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

  return { roundDetail, users, exportRows, listRounds, catalog, stats };
}
