// Vorbereitete SQL-Anweisungen
export function prepareQueries(db) {
  return {
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
}
