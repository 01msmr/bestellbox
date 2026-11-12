// Datenbankschema, Öffnen und Migration älterer Datenbanken
import { DatabaseSync } from 'node:sqlite';

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
