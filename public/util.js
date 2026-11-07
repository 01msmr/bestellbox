// Gemeinsame Helfer des Frontends: DOM-Builder, API, Name, Formatierung.
import { t, locale } from '/i18n.js';
import { LIMITS, TIMING } from '/config.js';

export const app = document.getElementById('app');
const whoBtn = document.getElementById('who');
const toastEl = document.getElementById('toast');

/** Aktuell angezeigte Ansicht ({ refresh, destroy }) – vom Router gesetzt. */
export const nav = { current: null };

const eurFmt = new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR' });
export const eur = (c) => eurFmt.format((c ?? 0) / 100);
export const fmtDate = (ms) => new Date(ms).toLocaleString(locale, { dateStyle: 'short', timeStyle: 'short' });
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
export let me = localStorage.getItem('bb_user') ?? '';

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

export function setMe(name) {
  me = name.trim().slice(0, LIMITS.userName);
  localStorage.setItem('bb_user', me);
  whoBtn.textContent = me ? `👤 ${me}` : t('Name wählen');
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
export function payHref(addr, cents) {
  const a = String(addr ?? '').trim();
  let base = null;
  if (/^https?:\/\/(www\.)?paypal\.me\/[\w.-]+\/?$/i.test(a)) base = a.replace(/\/$/, '');
  else if (/^(www\.)?paypal\.me\/[\w.-]+\/?$/i.test(a)) base = 'https://' + a.replace(/\/$/, '');
  else if (/^[\w.-]+$/.test(a)) base = 'https://paypal.me/' + a;
  return base ? `${base}/${(cents / 100).toFixed(2)}EUR` : null;
}
export function contactLinks(r) {
  const tel = telHref(r.phone);
  const web = webHref(r.url);
  return h(
    'div',
    { class: 'row' },
    tel ? h('a', { href: tel }, '📞 ' + r.phone) : h('span', { class: 'muted' }, t('keine Telefonnummer')),
    web ? h('a', { href: web, target: '_blank', rel: 'noopener noreferrer' }, '🌐 ' + r.url.replace(/^https?:\/\//i, '')) : null
  );
}
export function fmtRemaining(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const p = (n) => String(n).padStart(2, '0');
  return hh ? `${hh}:${p(mm)}:${p(ss)}` : `${p(mm)}:${p(ss)}`;
}
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

