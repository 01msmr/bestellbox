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
    const mk = await call('POST', '/api/rounds', 'alex', {
      restaurant: { name: 'Pizza Roma', url: 'https://roma.example', phone: '07531 123' },
      paypal: 'alex',
      delivery_fee: '3,00',
      minutes: 20,
    });
    assert.equal(mk.status, 201);
    const id = mk.body.id;

    await call('POST', `/api/rounds/${id}/items`, 'alex', { article: 'Margherita', price: '8,50', qty: 1 });
    await call('POST', `/api/rounds/${id}/items`, 'anna', { article: '  margherita ', price: 8.5, qty: 2 });
    await call('POST', `/api/rounds/${id}/items`, 'anna', { article: 'Cola', price: '2,50', qty: 1 });

    let d = (await call('GET', `/api/rounds/${id}`, 'alex')).body;
    const g = d.groups.find((x) => x.article.toLowerCase().trim() === 'margherita');
    assert.equal(g.qty, 3, 'gleiche Artikel gruppiert');
    assert.equal(d.items_total_cents, 3 * 850 + 250);
    assert.equal(d.users.reduce((a, u) => a + u.fee_cents, 0), 300, 'Liefergebühr komplett verteilt');
    assert.equal(d.ready.done, 0);
    assert.deepEqual(d.ready.not_ready.sort(), ['alex', 'anna']);

    // Fremde Position nicht änderbar
    const annaItem = d.users.find((u) => u.user === 'anna').items[0].id;
    assert.equal((await call('PATCH', `/api/items/${annaItem}`, 'alex', { qty: 5 })).status, 403);
    assert.equal((await call('PATCH', `/api/items/${annaItem}`, 'anna', { qty: 3 })).status, 200);

    // Fertig/Bezahlt unabhängig
    await call('POST', `/api/rounds/${id}/done`, 'anna', { value: true });
    d = (await call('GET', `/api/rounds/${id}`, 'anna')).body;
    const anna = d.users.find((u) => u.user === 'anna');
    assert.equal(anna.done, true);
    assert.equal(anna.paid, false);
    assert.equal((await call('POST', `/api/rounds/${id}/paid`, 'alex', { user: 'anna', value: true })).status, 200, 'Besteller darf bezahlt setzen');
    assert.equal((await call('POST', `/api/rounds/${id}/paid`, 'bob', { user: 'anna', value: false })).status, 403);

    // Sperre per Ablauf
    assert.equal((await call('POST', `/api/rounds/${id}/time`, 'anna', { action: 'lock' })).status, 403);
    assert.equal((await call('POST', `/api/rounds/${id}/time`, 'root', { action: 'lock' })).status, 200);
    assert.equal((await call('POST', `/api/rounds/${id}/items`, 'anna', { article: 'Tiramisu', price: 4, qty: 1 })).status, 423);

    d = (await call('GET', `/api/rounds/${id}`, 'alex')).body;
    assert.equal(d.locked, true);
    assert.equal(d.debts.length, 0, 'Besteller schuldet sich nichts, anna hat bezahlt');
    assert.equal(d.unpaid, false);

    // Wieder öffnen
    const re = await call('POST', `/api/rounds/${id}/time`, 'alex', { action: 'reopen', minutes: 5 });
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
    const id = (await call('POST', '/api/rounds', 'alex', { restaurant: { name: 'Burger Hub' } })).body.id;
    await call('POST', `/api/rounds/${id}/items`, 'anna', { article: 'Cheeseburger', price: 9, qty: 2 });
    await call('POST', `/api/rounds/${id}/items`, 'bob', { article: 'Cheeseburger', price: 9, qty: 1 });
    await call('POST', `/api/rounds/${id}/done`, 'anna', { value: true });
    await call('POST', `/api/rounds/${id}/done`, 'bob', { value: true });
    await call('POST', `/api/rounds/${id}/time`, 'alex', { action: 'lock' });

    const list = (await call('GET', '/api/rounds', 'alex')).body;
    assert.equal(list[0].unpaid, true);
    assert.equal(list[0].all_paid, false);
    assert.deepEqual(list[0].debts_users.sort(), ['anna', 'bob']);

    const st = (await call('GET', '/api/stats?scope=last30', 'alex')).body;
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
    const id = (await call('POST', '/api/rounds', 'alex', { restaurant: { name: 'X' } })).body.id;
    assert.equal((await call('POST', `/api/rounds/${id}/items`, 'alex', { article: '', price: 1 })).status, 400);
    assert.equal((await call('POST', `/api/rounds/${id}/items`, 'alex', { article: 'a', price: -1 })).status, 400);
    assert.equal((await call('POST', `/api/rounds/${id}/items`, 'alex', { article: 'a', price: 1, qty: 0 })).status, 400);
    assert.equal((await call('GET', '/api/rounds/999', 'alex')).status, 404);
  } finally {
    await close();
  }
});

test('Katalog, Varianten, Preishinweis', async () => {
  const { call, close } = await boot();
  try {
    const add = (id, user, article, price, variant) =>
      call('POST', `/api/rounds/${id}/items`, user, { article, price, qty: 1, ...(variant === undefined ? {} : { variant }) });
    const r1 = (await call('POST', '/api/rounds', 'alex', { restaurant: { name: 'Roma' } })).body.id;
    await add(r1, 'alex', 'Pizza Margherita', '8,50', '26 cm');
    await add(r1, 'anna', 'pizza  margherita', '8,50', '26 CM');
    await add(r1, 'bob', 'Pizza Margherita', '10,50', '32 cm');
    await add(r1, 'clara', 'Pizza Margarita', '8,50');

    // Einmalig genutzte Namen (auch Tippfehler) werden nicht vorgeschlagen
    const cat = (await call('GET', `/api/rounds/${r1}/catalog`, 'alex')).body;
    assert.deepEqual(cat.map((e) => e.article), ['Pizza Margherita']);
    assert.equal(cat[0].uses, 3);
    const v26 = cat[0].variants.find((v) => v.variant.toLowerCase() === '26 cm');
    assert.equal(v26.count, 2);
    assert.equal(v26.last_price_cents, 850);

    // Gruppierung: gleicher Name + gleiche Variante + gleicher Preis. 26 ≠ 32 cm, Margherita ≠ Margarita.
    const d = (await call('GET', `/api/rounds/${r1}`, 'alex')).body;
    assert.equal(d.groups.length, 3);
    assert.equal(d.groups.find((g) => g.variant.toLowerCase() === '26 cm').qty, 2);

    // Nächste Runde: Preisabweichung wird markiert, nichts wird automatisch gesetzt
    await call('POST', `/api/rounds/${r1}/time`, 'alex', { action: 'lock' });
    await call('PATCH', `/api/rounds/${r1}`, 'alex', { ordered: true });
    const r2 = (await call('POST', '/api/rounds', 'alex', { restaurant: { name: 'roma' } })).body.id;
    await add(r2, 'alex', 'Pizza Margherita', '9,00', '26 cm');
    await add(r2, 'anna', 'Pizza Margherita', '8,50', '26 cm');
    const d2 = (await call('GET', `/api/rounds/${r2}`, 'alex')).body;
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
    const r1 = (await call('POST', '/api/rounds', 'alex', { restaurant: { name: 'Roma' }, paypal: 'paypal.me/alex', delivery_fee: '2,50' })).body.id;
    await call('POST', `/api/rounds/${r1}/items`, 'anna', { article: 'Cola', price: 2, qty: 1 });

    // Sichtbarkeit: Teilnehmer/Besteller ja, Fremde und anonym nein, nie in Listen
    assert.equal((await call('GET', `/api/rounds/${r1}`, 'anna')).body.paypal, 'paypal.me/alex');
    assert.equal((await call('GET', `/api/rounds/${r1}`, 'alex')).body.paypal, 'paypal.me/alex');
    const stranger = (await call('GET', `/api/rounds/${r1}`, 'eve')).body;
    assert.equal(stranger.paypal, '');
    assert.equal(stranger.paypal_visible, false);
    assert.equal((await call('GET', `/api/rounds/${r1}`)).body.paypal, '');
    assert.ok(!JSON.stringify((await call('GET', '/api/rounds', 'eve')).body).includes('paypal.me'));
    assert.ok(!JSON.stringify((await call('GET', '/api/restaurants', 'eve')).body).includes('paypal.me'));
    assert.equal((await call('GET', '/api/me/paypal', 'eve')).body.paypal, '');

    // Gemerkt: Adresse je Besteller, Lieferkosten je Restaurant
    assert.equal((await call('GET', '/api/me/paypal', 'alex')).body.paypal, 'paypal.me/alex');
    assert.equal((await call('GET', '/api/restaurants', 'x')).body[0].last_delivery_fee_cents, 250);
    await call('POST', `/api/rounds/${r1}/time`, 'alex', { action: 'lock' });
    await call('PATCH', `/api/rounds/${r1}`, 'alex', { ordered: true });
    const r2 = (await call('POST', '/api/rounds', 'alex', { restaurant: { name: 'Roma' } })).body.id;
    assert.equal((await call('GET', `/api/rounds/${r2}`, 'alex')).body.paypal, 'paypal.me/alex', 'Adresse wird übernommen');
  } finally {
    await close();
  }
});

test('Schließen, wenn alle fertig', async () => {
  const { call, close } = await boot();
  try {
    const id = (await call('POST', '/api/rounds', 'alex', { restaurant: { name: 'Roma' }, minutes: 20 })).body.id;
    await call('POST', `/api/rounds/${id}/items`, 'alex', { article: 'Pizza', price: '8' });
    await call('POST', `/api/rounds/${id}/items`, 'anna', { article: 'Cola', price: '2' });
    let r = await call('PATCH', `/api/rounds/${id}`, 'anna', { close_when_ready: true });
    assert.equal(r.status, 403, 'nur Verwalter');
    r = await call('PATCH', `/api/rounds/${id}`, 'alex', { close_when_ready: true });
    assert.equal(r.body.close_when_ready, true);
    assert.equal(r.body.locked, false);
    await call('POST', `/api/rounds/${id}/done`, 'alex', { value: true });
    assert.equal((await call('GET', `/api/rounds/${id}`, 'alex')).body.locked, false, 'anna noch nicht fertig');
    await call('POST', `/api/rounds/${id}/done`, 'anna', { value: true });
    assert.equal((await call('GET', `/api/rounds/${id}`, 'alex')).body.locked, true, 'alle fertig -> gesperrt');
  } finally { await close(); }
});

test('Schließen-wenn-fertig: neue User brauchen Freigabe', async () => {
  const { call, close } = await boot();
  try {
    const id = (await call('POST', '/api/rounds', 'alex', { restaurant: { name: 'Roma' }, minutes: 20 })).body.id;
    await call('POST', `/api/rounds/${id}/items`, 'anna', { article: 'Cola', price: '2' });
    await call('PATCH', `/api/rounds/${id}`, 'alex', { close_when_ready: true });
    let r = await call('POST', `/api/rounds/${id}/items`, 'ben', { article: 'Pizza', price: '8' });
    assert.equal(r.status, 403, 'ben wartet');
    let d = (await call('GET', `/api/rounds/${id}`, 'alex')).body;
    assert.deepEqual(d.pending, ['ben']);
    assert.equal(d.users.some((u) => u.user === 'ben'), false);
    assert.equal((await call('GET', `/api/rounds/${id}`, 'ben')).body.viewer_pending, true);
    assert.deepEqual((await call('GET', `/api/rounds/${id}`, 'anna')).body.pending, [], 'nur Verwalter sehen es');
    assert.equal((await call('POST', `/api/rounds/${id}/items`, 'anna', { article: 'Wasser', price: '1' })).status, 201, 'bestehende User weiter ok');
    await call('PATCH', `/api/rounds/${id}`, 'alex', { approve: 'ben' });
    r = await call('POST', `/api/rounds/${id}/items`, 'ben', { article: 'Pizza', price: '8' });
    assert.equal(r.status, 201);
    d = (await call('GET', `/api/rounds/${id}`, 'alex')).body;
    assert.deepEqual(d.pending, []);
  } finally { await close(); }
});

test('Geschlossene Runde: Artikel nicht fertiger User zählen nicht, Wieder öffnen bringt sie zurück', async () => {
  const { call, close } = await boot();
  try {
    const { id } = (await call('POST', '/api/rounds', 'alex', { restaurant: { name: 'Pizza' }, buyer: 'alex', paypal: '', delivery_fee: '0', minutes: 20 })).body;
    await call('POST', `/api/rounds/${id}/items`, 'anna', { article: 'Cola', price: '2,50', qty: 1 });
    await call('POST', `/api/rounds/${id}/items`, 'bob', { article: 'Pizza', price: '9', qty: 1 });
    await call('POST', `/api/rounds/${id}/done`, 'anna', { value: true });
    await call('POST', `/api/rounds/${id}/time`, 'alex', { action: 'lock' });
    let d = (await call('GET', `/api/rounds/${id}`, 'alex')).body;
    assert.deepEqual(d.groups.map((g) => g.article), ['Cola']);
    assert.equal(d.items_total_cents, 250);
    assert.deepEqual(d.debts.map((x) => x.user), ['anna']);
    const bob = d.users.find((u) => u.user === 'bob');
    assert.equal(bob.excluded, true);
    assert.equal(bob.items.length, 1, 'Artikel bleiben sichtbar');
    await call('POST', `/api/rounds/${id}/time`, 'alex', { action: 'reopen', minutes: 5 });
    d = (await call('GET', `/api/rounds/${id}`, 'alex')).body;
    assert.equal(d.items_total_cents, 1150);
  } finally {
    await close();
  }
});

test('Änderung der eigenen Artikel setzt den User wieder auf „nicht fertig“', async () => {
  const { call, close } = await boot();
  try {
    const { id } = (await call('POST', '/api/rounds', 'alex', { restaurant: { name: 'Pizza' }, minutes: 20 })).body;
    const state = async () => (await call('GET', `/api/rounds/${id}`, 'alex')).body;
    const anna = async () => (await state()).users.find((u) => u.user === 'anna').done;
    await call('POST', `/api/rounds/${id}/items`, 'anna', { article: 'Cola', price: '2,50' });
    await call('POST', `/api/rounds/${id}/done`, 'anna', { value: true });
    assert.equal(await anna(), true);
    await call('POST', `/api/rounds/${id}/items`, 'anna', { article: 'Pizza', price: '9' });
    assert.equal(await anna(), false, 'neuer Artikel');
    const itemId = (await state()).users.find((u) => u.user === 'anna').items[0].id;
    await call('POST', `/api/rounds/${id}/done`, 'anna', { value: true });
    await call('PATCH', `/api/items/${itemId}`, 'anna', { qty: 2 });
    assert.equal(await anna(), false, 'Menge geändert');
    await call('POST', `/api/rounds/${id}/done`, 'anna', { value: true });
    await call('DELETE', `/api/items/${itemId}`, 'anna');
    assert.equal(await anna(), false, 'Artikel gelöscht');
    assert.equal((await state()).ready.done, 0);
  } finally {
    await close();
  }
});

test('Pro Restaurant nur eine Bestellung gleichzeitig; Bestellt + Lieferzeit', async () => {
  const { call, close } = await boot();
  try {
    const mk = (name) => call('POST', '/api/rounds', 'alex', { restaurant: { name }, minutes: 20 });
    const a = (await mk('Pizza Roma')).body.id;
    assert.equal((await mk('pizza roma')).status, 409, 'offen -> gesperrt');
    assert.equal((await mk('Burger Hub')).status, 201, 'anderes Restaurant geht');
    await call('POST', `/api/rounds/${a}/time`, 'alex', { action: 'lock' });
    assert.equal((await mk('Pizza Roma')).status, 409, 'geschlossen, aber nicht bestellt');

    assert.equal((await call('PATCH', `/api/rounds/${a}`, 'anna', { ordered: true })).status, 403);
    assert.equal((await call('PATCH', `/api/rounds/${a}`, 'alex', { ordered: true, eta_minutes: 999 })).status, 400);
    const r = await call('PATCH', `/api/rounds/${a}`, 'alex', { ordered: true, eta_minutes: 40 });
    assert.equal(r.status, 200);
    assert.ok(r.body.ordered_at > 0);
    assert.ok(Math.abs(r.body.eta_at - (Date.now() + 40 * 60000)) < 5000);
    assert.equal((await mk('Pizza Roma')).status, 201, 'geschlossen + bestellt -> neue Bestellung möglich');

    const open = (await call('POST', '/api/rounds', 'alex', { restaurant: { name: 'Sushi' } })).body.id;
    assert.equal((await call('PATCH', `/api/rounds/${open}`, 'alex', { ordered: true })).status, 400, 'bestellt nur nach dem Schließen');
    await call('POST', `/api/rounds/${open}/time`, 'alex', { action: 'lock' });
    assert.equal((await call('PATCH', `/api/rounds/${open}`, 'alex', { ordered: true })).status, 200);
    assert.equal((await call('GET', '/api/rounds', 'alex')).body.find((x) => x.id === open).ordered, true);
  } finally {
    await close();
  }
});

test('„ready“ kann nur der User selbst setzen, auch nicht Ersteller/Admin', async () => {
  const { call, close } = await boot();
  try {
    const { id } = (await call('POST', '/api/rounds', 'alex', { restaurant: { name: 'Pizza' }, minutes: 20 })).body;
    await call('POST', `/api/rounds/${id}/items`, 'anna', { article: 'Cola', price: '2,50' });
    for (const who of ['alex', 'root']) {
      assert.equal((await call('POST', `/api/rounds/${id}/done`, who, { user: 'anna', value: true })).status, 403, `${who} darf nicht`);
    }
    assert.equal((await call('POST', `/api/rounds/${id}/done`, 'anna', { value: true })).status, 200);
    assert.equal((await call('POST', `/api/rounds/${id}/paid`, 'alex', { user: 'anna', value: true })).status, 200, 'bezahlt setzt weiter der Besteller');
  } finally {
    await close();
  }
});

test('Bekannte Namen: eindeutig, ohne Groß/Klein-Duplikate', async () => {
  const { call, close } = await boot();
  try {
    const { id } = (await call('POST', '/api/rounds', 'Alex', { restaurant: { name: 'Pizza' }, minutes: 20 })).body;
    await call('POST', `/api/rounds/${id}/items`, 'anna', { article: 'Cola', price: '2,50' });
    await call('POST', `/api/rounds/${id}/items`, 'ANNA', { article: 'Pizza', price: '9' });
    await call('POST', `/api/rounds/${id}/items`, 'bob', { article: 'Cola', price: '2,50' });
    const names = (await call('GET', '/api/users', 'alex')).body;
    assert.deepEqual(names.map((n) => n.toLowerCase()).sort(), ['alex', 'anna', 'bob']);
  } finally {
    await close();
  }
});

test('Restaurant merkt Adresse/Web/Telefon (leer überschreibt nicht); Geliefert und Lieferzeit', async () => {
  const { call, close } = await boot();
  try {
    const mk = (restaurant) => call('POST', '/api/rounds', 'alex', { restaurant, minutes: 20, delivery_fee: '2,50' });
    const a = (await mk({ name: 'Roma', url: 'https://roma.example', phone: '07531 1', address: 'Hafenstr. 1, Konstanz' })).body.id;
    await call('POST', `/api/rounds/${a}/time`, 'alex', { action: 'lock' });
    await call('PATCH', `/api/rounds/${a}`, 'alex', { ordered: true });
    assert.equal((await call('PATCH', `/api/rounds/${a}`, 'anna', { delivered: true })).status, 403);
    await call('PATCH', `/api/rounds/${a}`, 'alex', { ordered: false });
    assert.equal((await call('PATCH', `/api/rounds/${a}`, 'alex', { delivered: true })).status, 400, 'erst bestellt melden');
    await call('PATCH', `/api/rounds/${a}`, 'alex', { ordered: true });
    const done = await call('PATCH', `/api/rounds/${a}`, 'alex', { delivered: true });
    assert.equal(done.status, 200);
    assert.ok(done.body.delivered_at > 0);

    await mk({ name: 'roma' }); // leere Felder überschreiben nichts
    const r = (await call('GET', '/api/restaurants', 'alex')).body.find((x) => x.name === 'Roma');
    assert.equal(r.address, 'Hafenstr. 1, Konstanz');
    assert.equal(r.url, 'https://roma.example');
    assert.equal(r.phone, '07531 1');
    assert.equal(r.last_delivery_fee_cents, 250);
    assert.equal(r.delivery_count, 1);
    assert.equal(r.delivery_minutes, 0);
  } finally {
    await close();
  }
});

test('Export: nur Admin, JSON mit Artikelzeilen', async () => {
  const { call, close } = await boot();
  try {
    const { id } = (await call('POST', '/api/rounds', 'alex', { restaurant: { name: 'Pizza Roma' }, minutes: 20, delivery_fee: '3' })).body;
    await call('POST', `/api/rounds/${id}/items`, 'anna', { article: 'Margherita', variant: '26 cm', price: '8,50', qty: 2 });
    await call('POST', `/api/rounds/${id}/done`, 'anna', { value: true });
    assert.equal((await call('GET', '/api/export', 'alex')).status, 403);
    const js = await call('GET', '/api/export', 'root');
    assert.equal(js.status, 200);
    assert.equal(js.body.length, 1);
    assert.equal(js.body[0].Restaurant, 'Pizza Roma');
    assert.equal(js.body[0].User, 'anna');
    assert.equal(js.body[0].Menge, 2);
    assert.equal(js.body[0].Summe, 17);
    assert.equal(js.body[0].Ready, true);
  } finally {
    await close();
  }
});

test('Verlängern nur bei offener Runde; Wieder öffnen nur geschlossen und nicht bestellt', async () => {
  const { call, close } = await boot();
  try {
    const { id } = (await call('POST', '/api/rounds', 'alex', { restaurant: { name: 'Pizza' }, minutes: 20 })).body;
    const time = (action) => call('POST', `/api/rounds/${id}/time`, 'alex', { action, minutes: 5 });
    assert.equal((await time('reopen')).status, 400, 'offen: nichts wieder zu öffnen');
    assert.equal((await time('extend')).status, 200, 'offen: verlängern');
    await time('lock');
    assert.equal((await time('extend')).status, 400, 'geschlossen: erst wieder öffnen');
    assert.equal((await time('reopen')).status, 200);
    assert.equal((await call('GET', `/api/rounds/${id}`, 'alex')).body.locked, false);
    await time('lock');
    await call('PATCH', `/api/rounds/${id}`, 'alex', { ordered: true });
    assert.equal((await time('reopen')).status, 400, 'bestellt: erst zurücknehmen');
    assert.equal((await time('extend')).status, 400);
    await call('PATCH', `/api/rounds/${id}`, 'alex', { ordered: false });
    assert.equal((await time('reopen')).status, 200);
  } finally {
    await close();
  }
});

test('„Schließen, wenn alle ready“ nur bei offener Runde änderbar', async () => {
  const { call, close } = await boot();
  try {
    const { id } = (await call('POST', '/api/rounds', 'alex', { restaurant: { name: 'Pizza' }, minutes: 20 })).body;
    assert.equal((await call('PATCH', `/api/rounds/${id}`, 'alex', { close_when_ready: true })).status, 200);
    await call('POST', `/api/rounds/${id}/time`, 'alex', { action: 'lock' });
    assert.equal((await call('PATCH', `/api/rounds/${id}`, 'alex', { close_when_ready: false })).status, 400);
  } finally {
    await close();
  }
});

test('Eigene Position inhaltlich ändern: Name, Beigabe, Preis; Fremde/Ungültiges abgelehnt', async () => {
  const { call, close } = await boot();
  try {
    const { id } = (await call('POST', '/api/rounds', 'alex', { restaurant: { name: 'Pizza' }, delivery_fee: '0', minutes: 20 })).body;
    await call('POST', `/api/rounds/${id}/items`, 'anna', { article: 'Pizza', price: '8,00', qty: 2 });
    let d = (await call('GET', `/api/rounds/${id}`, 'anna')).body;
    const item = d.users.find((u) => u.user === 'anna').items[0];
    const r = await call('PATCH', `/api/items/${item.id}`, 'anna', { article: 'Diavola', variant: '32 cm', price: '9,50' });
    assert.equal(r.status, 200);
    d = (await call('GET', `/api/rounds/${id}`, 'anna')).body;
    const changed = d.users.find((u) => u.user === 'anna').items[0];
    assert.deepEqual([changed.article, changed.variant, changed.price_cents, changed.qty], ['Diavola', '32 cm', 950, 2]);
    assert.equal(d.items_total_cents, 1900);
    assert.equal((await call('PATCH', `/api/items/${item.id}`, 'alex', { article: 'X' })).status, 403);
    assert.equal((await call('PATCH', `/api/items/${item.id}`, 'anna', { article: '' })).status, 400);
    assert.equal((await call('PATCH', `/api/items/${item.id}`, 'anna', { price: '-1' })).status, 400);
  } finally {
    await close();
  }
});

test('Lieferkosten werden gleichmäßig auf alle Besteller verteilt, nicht nach Artikelwert', async () => {
  const { call, close } = await boot();
  try {
    const { id } = (await call('POST', '/api/rounds', 'alex', { restaurant: { name: 'Pizza' }, delivery_fee: '3,00', minutes: 20 })).body;
    await call('POST', `/api/rounds/${id}/items`, 'alex', { article: 'Pizza', price: '14', qty: 1 });
    await call('POST', `/api/rounds/${id}/items`, 'anna', { article: 'Cola', price: '2', qty: 1 });
    await call('POST', `/api/rounds/${id}/items`, 'bob', { article: 'Pizza', price: '10', qty: 1 });
    await call('POST', `/api/rounds/${id}/items`, 'clara', { article: 'Tiramisu', price: '5', qty: 1 });
    let d = (await call('GET', `/api/rounds/${id}`, 'alex')).body;
    assert.deepEqual(d.users.map((u) => u.fee_cents), [75, 75, 75, 75], '3,00 € / 4 = 0,75 €');
    assert.equal(d.users.find((u) => u.user === 'anna').total_cents, 275);
    // 1,00 € auf 3 Besteller: Cent-Rest deterministisch, Summe stimmt
    await call('PATCH', `/api/rounds/${id}`, 'alex', { delivery_fee: '1,00' });
    await call('DELETE', `/api/items/${d.users.find((u) => u.user === 'clara').items[0].id}`, 'clara');
    d = (await call('GET', `/api/rounds/${id}`, 'alex')).body;
    const fees = d.users.filter((u) => u.subtotal_cents > 0).map((u) => u.fee_cents);
    assert.equal(fees.length, 3);
    assert.equal(fees.reduce((a, b) => a + b, 0), 100);
    assert.ok(Math.max(...fees) - Math.min(...fees) <= 1);
  } finally {
    await close();
  }
});

test('„Bezahlt“ setzt nur der User selbst oder der Besteller – nicht Ersteller oder Admin', async () => {
  const { call, close } = await boot();
  try {
    const { id } = (await call('POST', '/api/rounds', 'alex', { restaurant: { name: 'Pizza' }, buyer: 'bob', minutes: 20 })).body;
    await call('POST', `/api/rounds/${id}/items`, 'anna', { article: 'Cola', price: '2' });
    const paid = (who, user, value = true) => call('POST', `/api/rounds/${id}/paid`, who, { user, value });
    assert.equal((await paid('alex', 'anna')).status, 403, 'Ersteller (nicht Besteller) nicht');
    assert.equal((await paid('root', 'anna')).status, 403, 'Admin nicht');
    assert.equal((await paid('clara', 'anna')).status, 403, 'Fremde nicht');
    assert.equal((await paid('bob', 'anna')).status, 200, 'Besteller darf');
    assert.equal((await paid('anna', 'anna', false)).status, 200, 'User selbst darf');
    const d = (await call('GET', `/api/rounds/${id}`, 'alex')).body;
    assert.equal(d.viewer.is_buyer, false);
    assert.equal((await call('GET', `/api/rounds/${id}`, 'bob')).body.viewer.is_buyer, true);
    assert.equal(d.users.find((u) => u.user === 'anna').paid, false);
  } finally {
    await close();
  }
});

test('Ab „Bestellt“: keine Artikeländerung, keine neuen User, Frist nicht neu setzbar', async () => {
  const { call, close } = await boot();
  try {
    const { id } = (await call('POST', '/api/rounds', 'alex', { restaurant: { name: 'Pizza' }, minutes: 20 })).body;
    await call('PATCH', `/api/rounds/${id}`, 'alex', { close_when_ready: true });
    await call('POST', `/api/rounds/${id}/items`, 'anna', { article: 'Cola', price: '2' }); // Freigabe nötig
    await call('PATCH', `/api/rounds/${id}`, 'alex', { approve: 'anna' });
    await call('POST', `/api/rounds/${id}/items`, 'anna', { article: 'Cola', price: '2' });
    await call('POST', `/api/rounds/${id}/items`, 'alex', { article: 'Pizza', price: '8' });
    const wait = await call('POST', `/api/rounds/${id}/items`, 'ben', { article: 'Wasser', price: '1' });
    assert.equal(wait.status, 403, 'ben wartet auf Freigabe');
    await call('POST', `/api/rounds/${id}/time`, 'alex', { action: 'lock' });
    assert.equal((await call('PATCH', `/api/rounds/${id}`, 'alex', { ordered: true })).status, 200);

    const d = (await call('GET', `/api/rounds/${id}`, 'alex')).body;
    const item = d.users.find((u) => u.user === 'alex').items[0].id;
    assert.equal((await call('POST', `/api/rounds/${id}/items`, 'alex', { article: 'X', price: '1' })).status, 423, 'hinzufügen');
    assert.equal((await call('PATCH', `/api/items/${item}`, 'alex', { qty: 3 })).status, 423, 'ändern');
    assert.equal((await call('DELETE', `/api/items/${item}`, 'alex')).status, 423, 'löschen');
    assert.equal((await call('POST', `/api/rounds/${id}/time`, 'alex', { action: 'set', minutes: 30 })).status, 400, 'Frist neu setzen');
    assert.equal((await call('PATCH', `/api/rounds/${id}`, 'alex', { approve: 'ben' })).status, 400, 'Freigabe neuer User');
    assert.equal((await call('POST', `/api/rounds/${id}/done`, 'zoe', { value: true })).status >= 400, true, 'neuer User per Ready');
    assert.equal((await call('POST', `/api/rounds/${id}/paid`, 'alex', { user: 'zoe', value: true })).status >= 400, true, 'neuer User per Bezahlt');
    assert.equal((await call('POST', `/api/rounds/${id}/paid`, 'alex', { user: 'anna', value: true })).status, 200, 'bestehende User weiter bezahlbar');

    // Zurücknehmen öffnet wieder
    await call('PATCH', `/api/rounds/${id}`, 'alex', { ordered: false });
    assert.equal((await call('POST', `/api/rounds/${id}/time`, 'alex', { action: 'reopen' })).status, 200);
    assert.equal((await call('POST', `/api/rounds/${id}/items`, 'alex', { article: 'X', price: '1' })).status, 201);
  } finally {
    await close();
  }
});

test('Ab „Bestellt“: Bestellkopf (Besteller, PayPal, Lieferkosten) nicht mehr änderbar', async () => {
  const { call, close } = await boot();
  try {
    const { id } = (await call('POST', '/api/rounds', 'alex', { restaurant: { name: 'Pizza' }, delivery_fee: '3,00', paypal: 'paypal.me/alex', minutes: 20 })).body;
    await call('POST', `/api/rounds/${id}/time`, 'alex', { action: 'lock' });
    assert.equal((await call('PATCH', `/api/rounds/${id}`, 'alex', { delivery_fee: '4,00' })).status, 200, 'vor Bestellt änderbar');
    await call('PATCH', `/api/rounds/${id}`, 'alex', { ordered: true });
    for (const body of [{ delivery_fee: '5,00' }, { buyer: 'anna' }, { paypal: 'paypal.me/anna' }]) {
      assert.equal((await call('PATCH', `/api/rounds/${id}`, 'alex', body)).status, 400, JSON.stringify(body));
    }
    const d = (await call('GET', `/api/rounds/${id}`, 'alex')).body;
    assert.deepEqual([d.buyer, d.paypal, d.delivery_fee_cents], ['alex', 'paypal.me/alex', 400]);
    assert.equal((await call('PATCH', `/api/rounds/${id}`, 'alex', { eta_minutes: 30 })).status, 200, 'Lieferzeit bleibt änderbar');
    assert.equal((await call('PATCH', `/api/rounds/${id}`, 'alex', { delivered: true })).status, 200);
    await call('PATCH', `/api/rounds/${id}`, 'alex', { ordered: false });
    assert.equal((await call('PATCH', `/api/rounds/${id}`, 'alex', { delivery_fee: '5,00' })).status, 200, 'nach Zurücknehmen wieder änderbar');
  } finally {
    await close();
  }
});

test('Nach dem Schließen kann niemand „ready“ zurücknehmen (Artikel ändern nicht mehr möglich)', async () => {
  const { call, close } = await boot();
  try {
    const { id } = (await call('POST', '/api/rounds', 'alex', { restaurant: { name: 'Pizza' }, minutes: 20 })).body;
    await call('POST', `/api/rounds/${id}/items`, 'anna', { article: 'Cola', price: '2' });
    await call('POST', `/api/rounds/${id}/done`, 'anna', { value: true });
    assert.equal((await call('POST', `/api/rounds/${id}/done`, 'anna', { value: false })).status, 200, 'offen: zurücknehmen erlaubt');
    await call('POST', `/api/rounds/${id}/done`, 'anna', { value: true });
    await call('POST', `/api/rounds/${id}/time`, 'alex', { action: 'lock' });
    assert.equal((await call('POST', `/api/rounds/${id}/done`, 'anna', { value: false })).status, 423, 'geschlossen: nicht mehr');
    const d = (await call('GET', `/api/rounds/${id}`, 'anna')).body;
    assert.equal(d.users.find((u) => u.user === 'anna').done, true);
    assert.equal(d.items_total_cents, 200, 'Artikel zählen weiter');
  } finally {
    await close();
  }
});

test('Sicherheits- und Cache-Header auf Seiten und API', async () => {
  const { server, close } = await boot();
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    for (const url of ['/', '/style.css', '/api/rounds']) {
      const res = await fetch(base + url, { headers: { 'x-user': 'alex' } });
      assert.equal(res.headers.get('x-content-type-options'), 'nosniff', url);
      assert.equal(res.headers.get('referrer-policy'), 'no-referrer', url);
      assert.equal(res.headers.get('x-frame-options'), 'DENY', url);
      const csp = res.headers.get('content-security-policy') ?? '';
      assert.ok(csp.includes("default-src 'self'") && csp.includes("frame-ancestors 'none'") && csp.includes("script-src 'self'"), `CSP ${url}`);
      await res.arrayBuffer();
    }
    assert.equal((await fetch(base + '/style.css')).headers.get('cache-control'), 'no-cache');
  } finally {
    await close();
  }
});

test('index.html: Cache-Version (?v=) an Stylesheet und Skripten', async () => {
  const { server, close } = await boot();
  try {
    const html = await (await fetch(`http://127.0.0.1:${server.address().port}/`)).text();
    for (const f of ['style.css', 'theme.js', 'i18n.js', 'app.js']) assert.match(html, new RegExp(`/${f.replace('.', '\\.')}\\?v=\\d+`), f);
    assert.ok(!html.includes('__VERSION__'));
  } finally {
    await close();
  }
});
