import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../server.js';

async function boot(opts = {}) {
  const server = createApp({ admins: ['root'], ...opts });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, path, user, body) => {
    const res = await fetch(base + path, {
      method,
      headers: { 'content-type': 'application/json', ...(user ? { 'x-user': encodeURIComponent(user) } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, body: await res.json() };
  };
  return { server, call, close: () => new Promise((r) => { server.closeAllConnections(); server.close(r); }) };
}

test('Runde: Gruppierung, Liefergebühr, Schulden, Rechte', async () => {
  const { call, close } = await boot();
  try {
    const mk = await call('POST', '/api/rounds', 'uli', {
      restaurant: { name: 'Pizza Roma', url: 'https://roma.example', phone: '07531 123' },
      paypal: 'uli',
      delivery_fee: '3,00',
      minutes: 20,
    });
    assert.equal(mk.status, 201);
    const id = mk.body.id;

    await call('POST', `/api/rounds/${id}/items`, 'uli', { article: 'Margherita', price: '8,50', qty: 1 });
    await call('POST', `/api/rounds/${id}/items`, 'anna', { article: '  margherita ', price: 8.5, qty: 2 });
    await call('POST', `/api/rounds/${id}/items`, 'anna', { article: 'Cola', price: '2,50', qty: 1 });

    let d = (await call('GET', `/api/rounds/${id}`, 'uli')).body;
    const g = d.groups.find((x) => x.article.toLowerCase().trim() === 'margherita');
    assert.equal(g.qty, 3, 'gleiche Artikel gruppiert');
    assert.equal(d.items_total_cents, 3 * 850 + 250);
    assert.equal(d.users.reduce((a, u) => a + u.fee_cents, 0), 300, 'Liefergebühr komplett verteilt');
    assert.equal(d.ready.done, 0);
    assert.deepEqual(d.ready.not_ready.sort(), ['anna', 'uli']);

    // Fremde Position nicht änderbar
    const annaItem = d.users.find((u) => u.user === 'anna').items[0].id;
    assert.equal((await call('PATCH', `/api/items/${annaItem}`, 'uli', { qty: 5 })).status, 403);
    assert.equal((await call('PATCH', `/api/items/${annaItem}`, 'anna', { qty: 3 })).status, 200);

    // Fertig/Bezahlt unabhängig
    await call('POST', `/api/rounds/${id}/done`, 'anna', { value: true });
    d = (await call('GET', `/api/rounds/${id}`, 'anna')).body;
    const anna = d.users.find((u) => u.user === 'anna');
    assert.equal(anna.done, true);
    assert.equal(anna.paid, false);
    assert.equal((await call('POST', `/api/rounds/${id}/paid`, 'uli', { user: 'anna', value: true })).status, 200, 'Besteller darf bezahlt setzen');
    assert.equal((await call('POST', `/api/rounds/${id}/paid`, 'bob', { user: 'anna', value: false })).status, 403);

    // Sperre per Ablauf
    assert.equal((await call('POST', `/api/rounds/${id}/time`, 'anna', { action: 'lock' })).status, 403);
    assert.equal((await call('POST', `/api/rounds/${id}/time`, 'root', { action: 'lock' })).status, 200);
    assert.equal((await call('POST', `/api/rounds/${id}/items`, 'anna', { article: 'Tiramisu', price: 4, qty: 1 })).status, 423);

    d = (await call('GET', `/api/rounds/${id}`, 'uli')).body;
    assert.equal(d.locked, true);
    assert.equal(d.debts.length, 0, 'Besteller schuldet sich nichts, anna hat bezahlt');
    assert.equal(d.unpaid, false);

    // Wieder öffnen
    const re = await call('POST', `/api/rounds/${id}/time`, 'uli', { action: 'extend', minutes: 5 });
    assert.equal(re.body.locked, false);

    // Restaurant gespeichert
    const rs = (await call('GET', '/api/restaurants')).body;
    assert.equal(rs[0].phone, '07531 123');
  } finally {
    await close();
  }
});

test('Unbezahlte Runde und Statistik', async () => {
  const { call, close } = await boot();
  try {
    const id = (await call('POST', '/api/rounds', 'uli', { restaurant: { name: 'Burger Hub' } })).body.id;
    await call('POST', `/api/rounds/${id}/items`, 'anna', { article: 'Cheeseburger', price: 9, qty: 2 });
    await call('POST', `/api/rounds/${id}/items`, 'bob', { article: 'Cheeseburger', price: 9, qty: 1 });
    await call('POST', `/api/rounds/${id}/time`, 'uli', { action: 'lock' });

    const list = (await call('GET', '/api/rounds', 'uli')).body;
    assert.equal(list[0].unpaid, true);
    assert.deepEqual(list[0].debts_users.sort(), ['anna', 'bob']);

    const st = (await call('GET', '/api/stats?scope=last30', 'uli')).body;
    assert.equal(st.restaurants[0].name, 'Burger Hub');
    assert.equal(st.restaurants[0].top_dish, 'Cheeseburger');
    assert.equal(st.avg_item_cents, 900);
    assert.equal(st.avg_order_cents, 1350);
    assert.equal(st.users, undefined, 'keine Statistik nach User');
  } finally {
    await close();
  }
});

test('Validierung', async () => {
  const { call, close } = await boot();
  try {
    assert.equal((await call('POST', '/api/rounds', '', { restaurant: { name: 'X' } })).status, 400);
    const id = (await call('POST', '/api/rounds', 'uli', { restaurant: { name: 'X' } })).body.id;
    assert.equal((await call('POST', `/api/rounds/${id}/items`, 'uli', { article: '', price: 1 })).status, 400);
    assert.equal((await call('POST', `/api/rounds/${id}/items`, 'uli', { article: 'a', price: -1 })).status, 400);
    assert.equal((await call('POST', `/api/rounds/${id}/items`, 'uli', { article: 'a', price: 1, qty: 0 })).status, 400);
    assert.equal((await call('GET', '/api/rounds/999', 'uli')).status, 404);
  } finally {
    await close();
  }
});

test('Katalog, Varianten, Preishinweis', async () => {
  const { call, close } = await boot();
  try {
    const add = (id, user, article, price, variant) =>
      call('POST', `/api/rounds/${id}/items`, user, { article, price, qty: 1, ...(variant === undefined ? {} : { variant }) });
    const r1 = (await call('POST', '/api/rounds', 'uli', { restaurant: { name: 'Roma' } })).body.id;
    await add(r1, 'uli', 'Pizza Margherita', '8,50', '26 cm');
    await add(r1, 'anna', 'pizza  margherita', '8,50', '26 CM');
    await add(r1, 'bob', 'Pizza Margherita', '10,50', '32 cm');
    await add(r1, 'clara', 'Pizza Margarita', '8,50');

    // Einmalig genutzte Namen (auch Tippfehler) werden nicht vorgeschlagen
    const cat = (await call('GET', `/api/rounds/${r1}/catalog`, 'uli')).body;
    assert.deepEqual(cat.map((e) => e.article), ['Pizza Margherita']);
    assert.equal(cat[0].uses, 3);
    const v26 = cat[0].variants.find((v) => v.variant.toLowerCase() === '26 cm');
    assert.equal(v26.count, 2);
    assert.equal(v26.last_price_cents, 850);

    // Gruppierung: gleicher Name + gleiche Variante + gleicher Preis. 26 ≠ 32 cm, Margherita ≠ Margarita.
    const d = (await call('GET', `/api/rounds/${r1}`, 'uli')).body;
    assert.equal(d.groups.length, 3);
    assert.equal(d.groups.find((g) => g.variant.toLowerCase() === '26 cm').qty, 2);

    // Nächste Runde: Preisabweichung wird markiert, nichts wird automatisch gesetzt
    const r2 = (await call('POST', '/api/rounds', 'uli', { restaurant: { name: 'roma' } })).body.id;
    await add(r2, 'uli', 'Pizza Margherita', '9,00', '26 cm');
    await add(r2, 'anna', 'Pizza Margherita', '8,50', '26 cm');
    const d2 = (await call('GET', `/api/rounds/${r2}`, 'uli')).body;
    const g9 = d2.groups.find((g) => g.price_cents === 900);
    const g85 = d2.groups.find((g) => g.price_cents === 850);
    assert.equal(g9.price_differs, true);
    assert.equal(g9.known_price_cents, 850);
    assert.equal(g85.price_differs, false);
  } finally {
    await close();
  }
});

test('Gemerkte Lieferkosten/PayPal, PayPal geschützt', async () => {
  const { call, close } = await boot();
  try {
    const r1 = (await call('POST', '/api/rounds', 'uli', { restaurant: { name: 'Roma' }, paypal: 'paypal.me/uli', delivery_fee: '2,50' })).body.id;
    await call('POST', `/api/rounds/${r1}/items`, 'anna', { article: 'Cola', price: 2, qty: 1 });

    // Sichtbarkeit: Teilnehmer/Besteller ja, Fremde und anonym nein, nie in Listen
    assert.equal((await call('GET', `/api/rounds/${r1}`, 'anna')).body.paypal, 'paypal.me/uli');
    assert.equal((await call('GET', `/api/rounds/${r1}`, 'uli')).body.paypal, 'paypal.me/uli');
    const stranger = (await call('GET', `/api/rounds/${r1}`, 'eve')).body;
    assert.equal(stranger.paypal, '');
    assert.equal(stranger.paypal_visible, false);
    assert.equal((await call('GET', `/api/rounds/${r1}`)).body.paypal, '');
    assert.ok(!JSON.stringify((await call('GET', '/api/rounds', 'eve')).body).includes('paypal.me'));
    assert.ok(!JSON.stringify((await call('GET', '/api/restaurants', 'eve')).body).includes('paypal.me'));
    assert.equal((await call('GET', '/api/me/paypal', 'eve')).body.paypal, '');

    // Gemerkt: Adresse je Besteller, Lieferkosten je Restaurant
    assert.equal((await call('GET', '/api/me/paypal', 'uli')).body.paypal, 'paypal.me/uli');
    assert.equal((await call('GET', '/api/restaurants', 'x')).body[0].last_delivery_fee_cents, 250);
    const r2 = (await call('POST', '/api/rounds', 'uli', { restaurant: { name: 'Roma' } })).body.id;
    assert.equal((await call('GET', `/api/rounds/${r2}`, 'uli')).body.paypal, 'paypal.me/uli', 'Adresse wird übernommen');
  } finally {
    await close();
  }
});

test('Schließen, wenn alle fertig', async () => {
  const { call, close } = await boot();
  try {
    const id = (await call('POST', '/api/rounds', 'uli', { restaurant: { name: 'Roma' }, minutes: 20 })).body.id;
    await call('POST', `/api/rounds/${id}/items`, 'uli', { article: 'Pizza', price: '8' });
    await call('POST', `/api/rounds/${id}/items`, 'anna', { article: 'Cola', price: '2' });
    let r = await call('PATCH', `/api/rounds/${id}`, 'anna', { close_when_ready: true });
    assert.equal(r.status, 403, 'nur Verwalter');
    r = await call('PATCH', `/api/rounds/${id}`, 'uli', { close_when_ready: true });
    assert.equal(r.body.close_when_ready, true);
    assert.equal(r.body.locked, false);
    await call('POST', `/api/rounds/${id}/done`, 'uli', { value: true });
    assert.equal((await call('GET', `/api/rounds/${id}`, 'uli')).body.locked, false, 'anna noch nicht fertig');
    await call('POST', `/api/rounds/${id}/done`, 'anna', { value: true });
    assert.equal((await call('GET', `/api/rounds/${id}`, 'uli')).body.locked, true, 'alle fertig -> gesperrt');
  } finally { await close(); }
});
