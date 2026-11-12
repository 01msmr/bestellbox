// Gemeinsame Helfer des Frontends: DOM-Builder, API, Name, Formatierung.
import { t, locale, lang } from '/i18n.js';
import { LIMITS, TIMING, DEFAULTS } from '/config.js';
import { isToday, centsToInput } from '/format.js';

// Betrag als Zahl (ohne €) im Dezimalzeichen der Sprache: de 9,00 · en 9.00
export const money = (c) => centsToInput(c, lang === 'en' ? '.' : ',');

export const app = document.getElementById('app');
const whoBtn = document.getElementById('who');
const toastEl = document.getElementById('toast');

/** Aktuell angezeigte Ansicht ({ refresh, destroy }) – vom Router gesetzt. */
export const nav = { current: null };

const eurFmt = new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR' });
export const eur = (c) => eurFmt.format((c ?? 0) / 100);
// „Sa., 7. 11. 2026“ (ohne Jahr: „Sa., 7. 11.“)
export const fmtDay = (ms, year = true) =>
  new Date(ms).toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'numeric', ...(year ? { year: 'numeric' } : {}) }).replace(/\.(?=\d)/g, '. ');
export const fmtDate = (ms) => `${fmtDay(ms)}, ${new Date(ms).toLocaleTimeString(locale, { timeStyle: 'short' })}`;
export const fmtClock = (ms) => new Date(ms).toLocaleTimeString(locale, { timeStyle: 'short' });
// Heute (bis 4 Uhr nachts noch der Abend davor): nur Uhrzeit; sonst Datum mit Wochentag + Uhrzeit (mehrere Bestellungen eines Restaurants pro Tag unterscheidbar)
export const fmtWhen = (ms) => (isToday(ms, Date.now(), DEFAULTS.nightEndHour) ? fmtClock(ms) : `${fmtDay(ms, false)}, ${fmtClock(ms)}`);
export const lc = (s) => String(s ?? '').toLocaleLowerCase('de');

export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props ?? {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'value') el.value = v;
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

let toastTimer;
export function toast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), TIMING.toastMs);
}

// ---------- State & API ----------
// Gast = Name nur für diesen Tab (sessionStorage); der gespeicherte Name des Rechners bleibt unberührt
const guestStored = () => {
  try {
    return sessionStorage.getItem('bb_guest') ?? '';
  } catch {
    return '';
  }
};
export const homeName = () => localStorage.getItem('bb_user') ?? '';
export let isGuest = !!guestStored();
export let me = guestStored() || homeName();

export async function api(method, path, body) {
  const res = await fetch('/api' + path, {
    method,
    headers: { 'content-type': 'application/json', 'x-user': encodeURIComponent(me) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(t(data.error || res.statusText));
  return data;
}

// Führt eine Aktion aus und zeigt Fehler als Toast.
export async function act(fn) {
  try {
    return await fn();
  } catch (e) {
    toast(e.message);
    return null;
  }
}

export function setMe(name, { guest = false } = {}) {
  me = name.trim().slice(0, LIMITS.userName);
  isGuest = guest;
  if (guest) sessionStorage.setItem('bb_guest', me);
  else {
    sessionStorage.removeItem('bb_guest');
    localStorage.setItem('bb_user', me);
  }
  whoBtn.replaceChildren(userIcon(), me ? `${me}${guest ? ` (${t('dieser Tab')})` : ''}` : t('Name wählen'));
  whoBtn.classList.toggle('guest', guest);
}

// Einfaches Personen-Symbol (Kopf und Schultern) in Schriftgröße und Textfarbe
function userIcon() {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  for (const [k, v] of Object.entries({ viewBox: '0 0 24 24', width: '1em', height: '1em', fill: 'none', stroke: 'currentColor', 'stroke-width': '2.2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', class: 'user-icon' })) svg.setAttribute(k, v);
  const head = document.createElementNS(ns, 'circle');
  for (const [k, v] of Object.entries({ cx: '12', cy: '8', r: '4' })) head.setAttribute(k, v);
  const body = document.createElementNS(ns, 'path');
  body.setAttribute('d', 'M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7');
  svg.append(head, body);
  return svg;
}

// ---------- Helpers ----------
export function webHref(u) {
  if (!u) return null;
  return /^https?:\/\//i.test(u) ? u : 'https://' + u;
}
export function telHref(p) {
  const d = String(p ?? '').replace(/[^\d+]/g, '');
  return d ? 'tel:' + d : null;
}
// PayPal-Link mit Betrag (nur für paypal.me-Adressen möglich; E-Mail-Adressen werden nur angezeigt)
// Pfeil „öffnet extern“ (nach rechts oben), in Schriftgröße (1em) und Textfarbe
function extArrow() {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  for (const [k, v] of Object.entries({ viewBox: '0 0 24 24', width: '1em', height: '1em', fill: 'none', stroke: 'currentColor', 'stroke-width': '2.4', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', class: 'ext-arrow' })) svg.setAttribute(k, v);
  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', 'M6 18L18 6M8 6h10v10');
  svg.append(path);
  return svg;
}
export function contactLinks(r, { pill = false, linkPill = false } = {}) {
  const tel = telHref(r.phone);
  const web = webHref(r.url);
  const noTel = h('span', { class: 'muted' }, pill ? `(${t('keine Telefonnummer')})` : t('keine Telefonnummer'));
  const telEl = tel ? (pill ? h('span', null, '(', h('a', { href: tel }, '' + r.phone), ')') : h('a', { href: tel }, '' + r.phone)) : noTel;
  return h(
    'div',
    { class: 'row' },
    telEl,
    web ? h('a', { class: pill ? 'link-pill' : linkPill ? 'link-pill colored' : null, title: pill || linkPill ? r.url : null, href: web, target: '_blank', rel: 'noopener noreferrer' }, ...(pill ? [] : [extArrow()]), '' + r.url.replace(/^https?:\/\//i, '')) : null
  );
}
export { fmtRemaining } from '/format.js';
export function fold(s) {
  return String(s ?? '')
    .toLocaleLowerCase('de')
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .normalize('NFKD').replace(/\p{M}+/gu, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}
export function parseMoney(v) {
  const n = Number(String(v).trim().replace(',', '.'));
  return Number.isFinite(n) ? n : NaN;
}

