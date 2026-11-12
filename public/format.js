// Reine Format-Helfer (ohne DOM, testbar).
import { TIMING } from './config.js';

const p2 = (n) => String(n).padStart(2, '0');

/** Restzeit: Minuten (ab 1 h „H:MM h“); Sekunden erst in den letzten Minuten vor Ablauf. */
export function fmtRemaining(ms) {
  if (ms <= 0) return '00:00';
  if (ms < TIMING.showSecondsMs) {
    const s = Math.ceil(ms / 1000);
    return `${p2(Math.floor(s / 60))}:${p2(s % 60)}`;
  }
  const m = Math.ceil(ms / 60000);
  return m >= 60 ? `${Math.floor(m / 60)}:${p2(m % 60)} h` : `${m} min`;
}

/** Besitzform: „Klaus’“, „marias“ (de) bzw. „Anna’s“, „James’“ (en). */
export function genitive(name, lang = 'de') {
  const end = name.slice(-1).toLowerCase();
  if (lang === 'de') return 'sßxz'.includes(end) ? `${name}’` : `${name}s`;
  return end === 's' ? `${name}’` : `${name}’s`;
}

/** Median einer Liste von Dauern (ms) in ganzen Minuten; leer = null. */
export function medianMinutes(durationsMs) {
  if (!durationsMs.length) return null;
  const s = [...durationsMs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  const ms = s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  return Math.round(ms / 60000);
}

/** PayPal-Link aus Adresse; mit Betrag (Cent) wenn > 0, sonst nur die Adresse. Keine PayPal-Adresse → null. */
export function payHref(addr, cents) {
  const a = String(addr ?? '').trim();
  let base = null;
  if (/^https?:\/\/(www\.)?paypal\.me\/[\w.-]+\/?$/i.test(a)) base = a.replace(/\/$/, '');
  else if (/^(www\.)?paypal\.me\/[\w.-]+\/?$/i.test(a)) base = 'https://' + a.replace(/\/$/, '');
  else if (/^[\w.-]+$/.test(a)) base = 'https://paypal.me/' + a;
  if (!base) return null;
  return cents > 0 ? `${base}/${(cents / 100).toFixed(2)}EUR` : base;
}

/** „A, B und C“ – Komma-Liste mit Bindewort vor dem letzten Eintrag. */
export function joinList(items, and) {
  if (items.length < 2) return items.join('');
  return `${items.slice(0, -1).join(', ')} ${and} ${items[items.length - 1]}`;
}

/** „Heute“: gleicher Kalendertag, oder (in der Nacht vor `nightEndHour`) noch der Abend davor. */
export function isToday(ms, now, nightEndHour) {
  const key = (t) => `${new Date(t).getFullYear()}-${new Date(t).getMonth()}-${new Date(t).getDate()}`;
  return key(ms) === key(now) || key(ms - nightEndHour * 3600000) === key(now - nightEndHour * 3600000);
}

/** Cent als Eingabetext („1300“ → „13,00“); Dezimalzeichen je Sprache wählbar. */
export const centsToInput = (cents, decimal = ',') => (cents / 100).toFixed(2).replace('.', decimal);

/** Stand einer geschlossenen Bestellung für die Listen: alles bezahlt > geliefert > bestellt > geschlossen; offen = null. */
export function roundStage(r) {
  if (!r.locked) return null;
  if (r.all_paid) return 'alles bezahlt';
  if (r.delivered) return 'geliefert';
  return r.ordered ? 'bestellt' : 'geschlossen';
}
