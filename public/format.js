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

/** Besitzform: „Klaus’“, „msmrs“ (de) bzw. „Anna’s“, „James’“ (en). */
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
