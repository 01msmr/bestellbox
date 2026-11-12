import { LIMITS, DEFAULTS, LISTS } from './public/config.js';
import { medianMinutes } from './public/format.js';
import { HttpError } from './db/errors.js';
import { prepareQueries } from './db/queries.js';
import { createReads } from './db/read.js';
import { openDb } from './db/schema.js';
import { collapse, lower, foldKey, parseVariant, parseMoneyToCents, cleanUser } from './db/helpers.js';

export { HttpError, openDb, foldKey, parseVariant };

export function createLogic(db, { admins = [] } = {}) {
  const adminSet = new Set(admins.map(lower));
  const isAdmin = (u) => adminSet.has(lower(u));

  const q = prepareQueries(db);

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

  const isBuyer = (r, user) => !!user && lower(user) === lower(r.buyer);
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
    if (r.ordered_at && body.ordered !== false && (body.buyer !== undefined || body.paypal !== undefined || body.delivery_fee !== undefined)) throw new HttpError(400, 'Erst „Bestellt“ zurücknehmen');
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
    if (body.approve) {
      if (r.ordered_at) throw new HttpError(400, 'Bestellt – keine neuen User mehr');
      q.partApprove.run(r.id, cleanUser(body.approve));
      autoLock(r.id);
    }
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
      if (r.ordered_at) throw new HttpError(400, 'Erst „Bestellt“ zurücknehmen');
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
    if (!self && !isBuyer(r, user)) throw new HttpError(403, 'Bezahlt setzt nur der User selbst oder der Besteller');
    const value = body.value ? 1 : 0;
    if (flag === 'done' && !value && isLocked(r, Date.now())) throw new HttpError(423, 'Bestellung ist geschlossen');
    if (r.ordered_at && !q.partGet.get(r.id, target)?.approved) throw new HttpError(423, 'Bestellt – keine neuen User mehr');
    if (self) admit(r, target);
    q.partUpsert.run(r.id, target);
    (flag === 'done' ? q.partSetDone : q.partSetPaid).run(value, r.id, target);
    if (flag === 'done' && value) autoLock(r.id);
    return r.id;
  }

  const { roundDetail, users, exportRows, listRounds, catalog, stats } = createReads({ db, q, getRound, isLocked, isAdmin, canManage, isBuyer, deliveryStats });

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
