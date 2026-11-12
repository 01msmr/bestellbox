// Reine Hilfsfunktionen der Logik: Normalisierung, Beträge, Verteilung
import { LIMITS } from '../public/config.js';
import { HttpError } from './errors.js';

export const collapse = (s) => String(s ?? '').trim().replace(/\s+/g, ' ');
export const lower = (s) => collapse(s).toLocaleLowerCase('de');

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

export function parseMoneyToCents(v, { max = LIMITS.priceMaxEuro } = {}) {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').trim().replace(',', '.'));
  if (!Number.isFinite(n) || n < 0 || n > max) throw new HttpError(400, 'Ungültiger Betrag');
  return Math.round(n * 100);
}

export function cleanUser(u) {
  const name = collapse(u);
  if (!name || name.length > LIMITS.userName) throw new HttpError(400, 'Username fehlt oder ist zu lang (max. 32)');
  return name;
}

/** Verteilt `total` Cents nach `weights` (Largest Remainder); Lieferkosten: Gewicht 1 je Besteller. */
export function distribute(total, weights) {
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
