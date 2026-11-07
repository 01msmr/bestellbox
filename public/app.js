// bestellbox – Frontend (Vanilla JS, keine Build-Schritte)

import { t, locale } from '/i18n.js';

const app = document.getElementById('app');
const whoBtn = document.getElementById('who');
const toastEl = document.getElementById('toast');

const eurFmt = new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR' });
const eur = (c) => eurFmt.format((c ?? 0) / 100);
const fmtDate = (ms) => new Date(ms).toLocaleString(locale, { dateStyle: 'short', timeStyle: 'short' });
const lc = (s) => String(s ?? '').toLocaleLowerCase('de');

function h(tag, props, ...kids) {
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
function toast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2600);
}

// ---------- State & API ----------
let me = localStorage.getItem('bb_user') ?? '';

async function api(method, path, body) {
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
async function act(fn) {
  try {
    return await fn();
  } catch (e) {
    toast(e.message);
    return null;
  }
}

function setMe(name) {
  me = name.trim().slice(0, 32);
  localStorage.setItem('bb_user', me);
  whoBtn.textContent = me ? `👤 ${me}` : t('Name wählen');
}

function askName() {
  return new Promise((resolve) => {
    const input = h('input', { placeholder: t('Dein Name'), maxlength: 32, autofocus: true, value: me });
    const form = h(
      'form',
      {
        class: 'card',
        onsubmit: (e) => {
          e.preventDefault();
          if (!input.value.trim()) return;
          setMe(input.value);
          resolve();
        },
      },
      h('h2', null, t('Wie heißt du?')),
      h('p', { class: 'muted' }, t('Der Name erscheint bei deinen Positionen. Gleicher Name = gleiche Person, bitte konsistent verwenden.')),
      h('div', { class: 'row' }, h('div', { class: 'grow' }, input), h('button', { class: 'btn', type: 'submit' }, t('Los')))
    );
    app.replaceChildren(form);
    input.focus();
  });
}

whoBtn.addEventListener('click', async () => {
  await askName();
  route();
});

// ---------- Helpers ----------
function webHref(u) {
  if (!u) return null;
  return /^https?:\/\//i.test(u) ? u : 'https://' + u;
}
function telHref(p) {
  const d = String(p ?? '').replace(/[^\d+]/g, '');
  return d ? 'tel:' + d : null;
}
// PayPal-Link mit Betrag (nur für paypal.me-Adressen möglich; E-Mail-Adressen werden nur angezeigt)
function payHref(addr, cents) {
  const a = String(addr ?? '').trim();
  let base = null;
  if (/^https?:\/\/(www\.)?paypal\.me\/[\w.-]+\/?$/i.test(a)) base = a.replace(/\/$/, '');
  else if (/^(www\.)?paypal\.me\/[\w.-]+\/?$/i.test(a)) base = 'https://' + a.replace(/\/$/, '');
  else if (/^[\w.-]+$/.test(a)) base = 'https://paypal.me/' + a;
  return base ? `${base}/${(cents / 100).toFixed(2)}EUR` : null;
}
function contactLinks(r) {
  const tel = telHref(r.phone);
  const web = webHref(r.url);
  return h(
    'div',
    { class: 'row' },
    tel ? h('a', { href: tel }, '📞 ' + r.phone) : h('span', { class: 'muted' }, t('keine Telefonnummer')),
    web ? h('a', { href: web, target: '_blank', rel: 'noopener noreferrer' }, '🌐 ' + r.url.replace(/^https?:\/\//i, '')) : null
  );
}
function fmtRemaining(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const p = (n) => String(n).padStart(2, '0');
  return hh ? `${hh}:${p(mm)}:${p(ss)}` : `${p(mm)}:${p(ss)}`;
}
function fold(s) {
  return String(s ?? '')
    .toLocaleLowerCase('de')
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .normalize('NFKD').replace(/\p{M}+/gu, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}
function parseMoney(v) {
  const n = Number(String(v).trim().replace(',', '.'));
  return Number.isFinite(n) ? n : NaN;
}

// ---------- Sidebar (Bestellungen zum Springen, Statistik unten) ----------
const sideEl = document.getElementById('side');

let sideRounds = [];
async function loadSide() {
  if (!me) return;
  const r = await api('GET', '/rounds').catch(() => null);
  if (r) {
    sideRounds = r;
    renderSide();
  }
}
function renderSide() {
  const hash = location.hash || '#/';
  const item = (r) =>
    h(
      'a',
      { class: 'side-item' + (hash === `#/r/${r.id}` ? ' active' : ''), href: `#/r/${r.id}` },
      h('div', null, r.restaurant),
      h(
        'div',
        { class: 'sub' },
        h('span', null, `${new Date(r.created_at).toLocaleDateString(locale, { day: '2-digit', month: '2-digit' })} · ${r.creator}`),
        r.unpaid
          ? h('span', { class: 'badge off' }, eur(r.debts_total_cents))
          : r.locked
            ? h('span', null, t('gesperrt'))
            : h('span', { class: 'badge on', 'data-expires': r.expires_at }, '…')
      )
    );
  const group = (title, list) => (list.length ? [h('h4', null, title), ...list.map(item)] : []);
  sideEl.replaceChildren(
    h('a', { class: 'btn side-new', href: '#/' }, t('+ Neue Bestellung')),
    ...group(t('Offen'), sideRounds.filter((r) => !r.locked)),
    ...group(t('Unbezahlt'), sideRounds.filter((r) => r.unpaid)),
    ...group(t('Abgeschlossen'), sideRounds.filter((r) => r.locked && !r.unpaid).slice(0, 10))
  );
  tickCountdowns();
}
// Countdown-Badges (Sidebar und Startseite) – einmal global, nicht je Ansicht
function tickCountdowns() {
  for (const el of document.querySelectorAll('[data-expires]')) {
    const left = Number(el.dataset.expires) - Date.now();
    el.textContent = left > 0 ? `${t('noch')} ${fmtRemaining(left)}` : t('abgelaufen');
    el.className = 'badge ' + (left > 0 ? (left < 120000 ? 'off' : 'on') : 'mid');
  }
}
setInterval(tickCountdowns, 1000);

// ---------- Router ----------
let current = null;
let refreshTimer;

function route() {
  current?.destroy?.();
  current = null;
  app.classList.remove('wide');
  for (const a of document.querySelectorAll('.top nav a')) a.classList.toggle('active', a.dataset.nav === ((location.hash || '#/') === '#/stats' ? 'stats' : 'orders'));
  if (!me) {
    askName().then(route);
    return;
  }
  const hash = location.hash || '#/';
  let m;
  if ((m = hash.match(/^#\/r\/(\d+)$/))) current = roundView(Number(m[1]));
  else if (hash === '#/stats') current = statsView();
  else current = homeView();
  loadSide();
  current.refresh();
}
window.addEventListener('hashchange', route);

function scheduleRefresh() {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => {
    current?.refresh?.();
    loadSide();
  }, 150);
}
const es = new EventSource('/api/events');
es.onmessage = scheduleRefresh;
es.onopen = scheduleRefresh;
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) scheduleRefresh();
});

// ---------- Home ----------
function homeView() {
  let restaurants = [];
  const datalist = h('datalist', { id: 'rest-list' });
  const f = {
    name: h('input', { list: 'rest-list', placeholder: t('z. B. Pizza Roma'), required: true, maxlength: 80, autocomplete: 'off' }),
    url: h('input', { placeholder: 'https://…', maxlength: 300 }),
    phone: h('input', { type: 'tel', placeholder: '07531 …', maxlength: 40 }),
    buyer: h('input', { value: me, maxlength: 32, required: true }),
    paypal: h('input', { value: '', placeholder: t('paypal.me/name oder E-Mail'), maxlength: 120 }),
    fee: h('input', { inputmode: 'decimal', placeholder: '0,00' }),
    minutes: h('input', { type: 'number', min: 1, max: 240, value: 20 }),
  };
  f.name.addEventListener('change', () => {
    const r = restaurants.find((x) => lc(x.name) === lc(f.name.value.trim()));
    if (r) {
      f.url.value = r.url;
      f.phone.value = r.phone;
      if (!f.fee.value && r.last_delivery_fee_cents) f.fee.value = (r.last_delivery_fee_cents / 100).toFixed(2).replace('.', ',');
    }
  });
  api('GET', '/me/paypal').then((r) => {
    if (r.paypal && !f.paypal.value) f.paypal.value = r.paypal;
  }).catch(() => {});

  const form = h(
    'form',
    {
      onsubmit: async (e) => {
        e.preventDefault();
        const fee = f.fee.value.trim() === '' ? 0 : parseMoney(f.fee.value);
        const res = await act(() =>
          api('POST', '/rounds', {
            restaurant: { name: f.name.value, url: f.url.value, phone: f.phone.value },
            buyer: f.buyer.value,
            paypal: f.paypal.value,
            delivery_fee: fee,
            minutes: Number(f.minutes.value),
          })
        );
        if (res) {
          location.hash = `#/r/${res.id}`;
        }
      },
      class: 'grid2',
    },
    h('label', null, 'Restaurant', f.name, datalist),
    h('label', null, t('Telefon'), f.phone),
    h('label', null, t('Webadresse'), f.url),
    h('label', null, t('Lieferkosten (€)'), f.fee),
    h('label', null, t('Bestellt von'), f.buyer),
    h('label', null, t('PayPal (Adresse/Link)'), f.paypal),
    h('label', null, t('Frist (Minuten)'), f.minutes),
    h('div', { class: 'row', style: 'align-items:end' }, h('button', { class: 'btn', type: 'submit' }, t('Bestellung starten')))
  );

  const activeBox = h('div', { class: 'list' });
  const unpaidBox = h('div', { class: 'list' });
  const recentBox = h('div', { class: 'list' });
  const unpaidCard = h('section', { class: 'card hidden home-lists' }, h('h2', null, t('💸 Unbezahlte Bestellungen')), unpaidBox);

  app.replaceChildren(
    h('section', { class: 'card' }, h('details', { open: true }, h('summary', null, t('Neue Bestellung')), h('div', { style: 'margin-top:10px' }, form))),
    h('section', { class: 'card home-lists' }, h('h2', null, t('Laufende Bestellungen')), activeBox),
    unpaidCard,
    h('section', { class: 'card home-lists' }, h('h2', null, t('Letzte Bestellungen')), recentBox)
  );

  const roundItem = (r) => {
    const status = r.locked
      ? h('span', { class: 'badge mid' }, t('gesperrt'))
      : h('span', { class: 'badge on', 'data-expires': r.expires_at }, '…');
    return h(
      'a',
      { class: 'round-link', href: `#/r/${r.id}` },
      h(
        'div',
        { class: 'card', style: 'padding:10px' },
        h('div', { class: 'row between' }, h('strong', null, r.restaurant), status),
        h('div', { class: 'muted' }, `${fmtDate(r.created_at)} · ${r.creator} · ${t('bestellt von')} ${r.buyer}`),
        h(
          'div',
          { class: 'row between' },
          h('span', null, `${r.done}/${r.users} ${t('fertig')} · ${eur(r.total_cents)}`),
          r.unpaid ? h('span', { class: 'badge off' }, `${t('unbezahlt')}: ${eur(r.debts_total_cents)}`) : null
        )
      )
    );
  };
  const fill = (box, list, empty) =>
    box.replaceChildren(...(list.length ? list.map(roundItem) : [h('span', { class: 'muted' }, empty)]));

  return {
    async refresh() {
      const [rounds, rs] = await Promise.all([api('GET', '/rounds').catch(() => null), api('GET', '/restaurants').catch(() => null)]);
      if (rs) {
        restaurants = rs;
        datalist.replaceChildren(...rs.map((r) => h('option', { value: r.name })));
      }
      if (!rounds) return;
      const active = rounds.filter((r) => !r.locked);
      const unpaid = rounds.filter((r) => r.unpaid);
      const recent = rounds.filter((r) => r.locked && !r.unpaid).slice(0, 10);
      fill(activeBox, active, t('Keine laufende Bestellung.'));
      fill(unpaidBox, unpaid, '');
      unpaidCard.classList.toggle('hidden', unpaid.length === 0);
      fill(recentBox, recent, t('Noch nichts abgeschlossen.'));
    },
    destroy() {},
  };
}

// ---------- Round ----------
function roundView(id) {
  let d = null;
  let skew = 0;
  let expiredRefreshed = false;
  let catalogLoaded = false;
  let tab = sessionStorage.getItem('bb_tab') || 'users';

  const head = h('section', { class: 'card' });
  const timerNum = h('div', { class: 'timer' }, '--:--');
  const timerLabel = h('div', { class: 'muted' });
  const timerBtns = h('div', { class: 'row' });
  const timerCard = h('section', { class: 'card row between' }, h('div', null, timerLabel, timerNum), timerBtns);
  const banners = h('div', { style: 'display:grid;gap:8px' });
  const tabsEl = h('div', { class: 'tabs', role: 'tablist' });
  const usersPane = h('div', { style: 'display:grid;gap:10px' });
  const minePane = h('div', { style: 'display:grid;gap:10px' });
  const orderPane = h('div', { class: 'card' });
  const debtsCard = h('section', { class: 'card' });
  const payCard = h('section', { class: 'card pay hidden' });

  // Persistente Eingabezeile (wird bei Live-Updates nicht neu gebaut)
  const inArticle = h('input', { placeholder: t('Artikel'), maxlength: 80, required: true, autocomplete: 'off' });
  const inVariant = h('input', { placeholder: t('z. B. 26 cm, Fladenbrot, scharf'), maxlength: 80, autocomplete: 'off' });
  const inPrice = h('input', { placeholder: t('Preis €'), inputmode: 'decimal', required: true });
  const inQty = h('input', { type: 'number', min: 1, max: 99, value: 1 });
  const addBtn = h('button', { class: 'btn', type: 'submit' }, t('Hinzufügen'));
  const sugBox = h('div', { class: 'assist' });
  let catalog = []; // gelernte Namen dieses Restaurants (nur Vorschläge, nichts wird automatisch gesetzt)

  const loadCatalog = async () => {
    catalog = (await api('GET', `/rounds/${id}/catalog`).catch(() => null)) ?? catalog;
    updateAssist();
  };
  const knownEntry = () => catalog.find((e) => fold(e.article) === fold(inArticle.value));
  const knownVariant = (e) => e?.variants.find((v) => fold(v.variant) === fold(inVariant.value));

  function updateAssist() {
    const q = fold(inArticle.value);
    const e = knownEntry();
    const parts = [];
    if (q && !e) {
      for (const c of catalog.filter((c) => fold(c.article).includes(q)).slice(0, 5)) {
        parts.push(h('button', { type: 'button', class: 'pill', onmousedown: (ev) => ev.preventDefault(), onclick: () => { inArticle.value = c.article; updateAssist(); inVariant.focus(); } }, c.article));
      }
    }
    if (e) {
      for (const v of e.variants.filter((v) => v.variant).slice(0, 5)) {
        parts.push(h('button', { type: 'button', class: 'pill', onclick: () => { inVariant.value = v.variant; updateAssist(); } }, v.variant));
      }
      const kv = knownVariant(e);
      // Preis wird NIE vorausgefüllt – nur als Hinweis angeboten, damit er bewusst geprüft wird.
      if (kv?.last_price_cents != null) {
        parts.push(h('button', { type: 'button', class: 'pill price', onclick: () => { inPrice.value = (kv.last_price_cents / 100).toFixed(2).replace('.', ','); inPrice.focus(); } }, t('zuletzt {p} (ungeprüft) – übernehmen', { p: eur(kv.last_price_cents) })));
      }
    }
    sugBox.replaceChildren(...parts);
  }
  inArticle.addEventListener('input', updateAssist);
  inVariant.addEventListener('input', updateAssist);

  const addForm = h(
    'form',
    {
      class: 'card',
      onsubmit: async (e) => {
        e.preventDefault();
        const price = parseMoney(inPrice.value);
        const kv = knownVariant(knownEntry());
        const ok = await act(() => api('POST', `/rounds/${id}/items`, { article: inArticle.value, variant: inVariant.value, price, qty: Number(inQty.value) || 1 }));
        if (ok) {
          if (kv?.last_price_cents != null && Math.round(price * 100) !== kv.last_price_cents) toast(t('Preis weicht ab – zuletzt {p}', { p: eur(kv.last_price_cents) }));
          inArticle.value = '';
          inVariant.value = '';
          inPrice.value = '';
          inQty.value = 1;
          inArticle.focus();
          updateAssist();
          loadCatalog();
          current.refresh();
        }
      },
    },
    h('h3', null, t('Artikel eintragen')),
    h('div', { style: 'display:grid;gap:10px' },
      h('label', null, t('Artikel'), inArticle),
      h('label', null, t('Variante (optional)'), inVariant),
      sugBox,
      h('div', { class: 'grid2', style: 'grid-template-columns:2fr 1fr' }, h('label', null, t('Preis'), inPrice), h('label', null, t('Menge'), inQty)),
      h('div', { class: 'notice' }, h('strong', null, t('⚠ Preis selbst prüfen. ')), t('Du bist für deine Angaben verantwortlich. Vorgeschlagene Preise stammen aus früheren Bestellungen und können veraltet oder falsch sein.'))
    ),
    h('div', { style: 'margin-top:10px' }, addBtn)
  );
  const mineList = h('div', { class: 'card' });
  minePane.append(addForm, mineList);

  const panes = { users: usersPane, mine: minePane, order: orderPane };
  const tabDefs = [
    ['users', t('Nach Usern')],
    ['mine', t('Meine')],
    ['order', t('Bestellen')],
  ];
  function showTab(t) {
    tab = t;
    sessionStorage.setItem('bb_tab', t);
    for (const [k, p] of Object.entries(panes)) p.classList.toggle('hidden', k !== t);
    for (const b of tabsEl.children) b.setAttribute('aria-selected', String(b.dataset.tab === t));
  }
  for (const [k, label] of tabDefs) tabsEl.append(h('button', { 'data-tab': k, role: 'tab', onclick: () => showTab(k) }, label));

  // Mobil untereinander; ab Desktop-Breite: links Tabs, rechts Frist/Banner/Bezahlen (siehe style.css)
  app.classList.add('wide');
  head.classList.add('round-head');
  app.replaceChildren(
    h('div', { class: 'round-grid' }, head, h('div', { class: 'round-side' }, timerCard, banners, payCard), h('div', { class: 'round-main' }, tabsEl, usersPane, minePane, orderPane, debtsCard))
  );
  showTab(tab);

  const toggle = async (path, body) => {
    await act(() => api('POST', `/rounds/${id}/${path}`, body));
    current.refresh();
  };

  function flagBadge(u, flag) {
    const on = u[flag];
    const label = flag === 'done' ? (on ? t('✓ fertig') : t('in Arbeit')) : on ? t('✓ bezahlt') : t('nicht bezahlt');
    const cls = on ? 'on' : flag === 'done' ? 'mid' : 'off';
    const editable = lc(u.user) === lc(me) || d.viewer.can_manage;
    if (!editable) return h('span', { class: `badge ${cls}` }, label);
    return h('button', { class: `badge ${cls}`, title: t('Umschalten'), onclick: () => toggle(flag, { user: u.user, value: !on }) }, label);
  }

  function renderHead() {
    const editBuyer = h('input', { value: d.buyer, maxlength: 32 });
    const editPaypal = h('input', { value: d.paypal, maxlength: 120 });
    const editFee = h('input', { value: (d.delivery_fee_cents / 100).toFixed(2).replace('.', ','), inputmode: 'decimal' });
    head.replaceChildren(
      ...[
      h('div', { class: 'row between' }, h('h2', { style: 'margin:0' }, d.restaurant.name), h('a', { href: '#/' }, t('← Alle Bestellungen'))),
      contactLinks(d.restaurant),
      h(
        'div',
        { class: 'muted', style: 'margin-top:6px' },
        t('Gestartet {date} von {creator} · bestellt von ', { date: fmtDate(d.created_at), creator: d.creator }),
        h('strong', null, d.buyer),
        t(' · Lieferkosten: {fee}', { fee: eur(d.delivery_fee_cents) })
      ),
      d.viewer.can_manage
        ? h(
            'details',
            { style: 'margin-top:8px' },
            h('summary', null, t('Bestellung bearbeiten')),
            h(
              'form',
              {
                class: 'grid2',
                style: 'margin-top:8px',
                onsubmit: async (e) => {
                  e.preventDefault();
                  await act(() => api('PATCH', `/rounds/${id}`, { buyer: editBuyer.value, paypal: editPaypal.value, delivery_fee: parseMoney(editFee.value) }));
                  current.refresh();
                },
              },
              h('label', null, t('Bestellt von'), editBuyer),
              h('label', null, 'PayPal', editPaypal),
              h('label', null, t('Lieferkosten (€)'), editFee),
              h('div', { class: 'row', style: 'align-items:end' }, h('button', { class: 'btn small', type: 'submit' }, t('Speichern')))
            )
          )
        : null
      ].filter(Boolean)
    );
  }

  function renderTimerControls() {
    timerLabel.textContent = d.locked ? t('Bestellfrist abgelaufen – Bestellung gesperrt') : t('Bestellfrist');
    const buttons = [];
    if (d.viewer.can_manage) {
      buttons.push(h('button', { class: 'btn small', onclick: () => timeAction('extend', 5) }, '+5 min'));
      if (!d.locked) buttons.push(h('button', { class: 'btn small ghost', onclick: () => timeAction('lock') }, t('Jetzt sperren')));
      else buttons.push(h('button', { class: 'btn small ghost', onclick: () => timeAction('extend', 5) }, t('Wieder öffnen')));
    }
    if (d.viewer.can_manage) {
      const cb = h('input', { type: 'checkbox', onchange: () => act(() => api('PATCH', `/rounds/${id}`, { close_when_ready: cb.checked })).then(() => current.refresh()) });
      cb.checked = d.close_when_ready;
      buttons.push(h('label', { class: 'row muted', style: 'gap:6px;width:100%' }, cb, t('Schließen, wenn alle fertig')));
    } else if (d.close_when_ready && !d.locked) {
      buttons.push(h('div', { class: 'muted' }, t('Schließt, sobald alle fertig sind')));
    }
    timerBtns.replaceChildren(...buttons);
  }
  async function timeAction(action, minutes) {
    await act(() => api('POST', `/rounds/${id}/time`, { action, minutes }));
    expiredRefreshed = false;
    current.refresh();
  }

  function renderBanners() {
    const b = [];
    if (d.ready.total === 0) {
      b.push(h('div', { class: 'banner warn' }, t('Noch keine Artikel – trag deine ein.')));
    } else if (d.ready.not_ready.length) {
      b.push(h('div', { class: 'banner warn' }, t('⚠ Noch nicht alle fertig ({done}/{total}): {names}', { done: d.ready.done, total: d.ready.total, names: d.ready.not_ready.join(', ') })));
    } else {
      b.push(h('div', { class: 'banner ok' }, t('✓ Alle fertig ({total}/{total}) – kann bestellt werden', { total: d.ready.total })));
    }
    if (d.unpaid) b.push(h('div', { class: 'banner bad' }, t('💸 Bestellung unbezahlt: {sum} offen ({names})', { sum: eur(d.debts_total_cents), names: d.debts.map((x) => x.user).join(', ') })));
    for (const u of d.pending) {
      b.unshift(h('div', { class: 'banner bad row between' },
        h('span', null, t('Neu: {user} möchte mitbestellen', { user: u })),
        h('span', { class: 'row' },
          h('button', { class: 'btn small', onclick: () => decide({ approve: u }) }, t('Freigeben')),
          h('button', { class: 'btn small ghost', onclick: () => decide({ reject: u }) }, t('Ablehnen')))));
    }
    if (d.viewer_pending) b.unshift(h('div', { class: 'banner warn' }, t('Wartet auf Freigabe durch den Besteller')));
    banners.replaceChildren(...b);
  }
  async function decide(body) {
    await act(() => api('PATCH', `/rounds/${id}`, body));
    current.refresh();
  }

  function itemsTable(u) {
    return h(
      'table',
      null,
      h(
        'tbody',
        null,
        u.items.map((i) => h('tr', null, h('td', { class: 'num' }, `${i.qty}×`), h('td', null, i.article, i.variant ? h('div', { class: 'muted' }, i.variant) : null), h('td', { class: 'num' }, eur(i.price_cents * i.qty))))
      )
    );
  }

  function renderUsers() {
    if (!d.users.length) {
      usersPane.replaceChildren(h('div', { class: 'card muted' }, t('Noch niemand dabei.')));
      return;
    }
    usersPane.replaceChildren(
      ...d.users.map((u) =>
        h(
          'section',
          { class: `card user-card ${u.paid || lc(u.user) === lc(d.buyer) ? 'paid' : 'unpaid'}` },
          h('div', { class: 'row between' }, h('strong', null, u.user + (lc(u.user) === lc(d.buyer) ? t(' (Besteller)') : '')), h('div', { class: 'row' }, flagBadge(u, 'done'), lc(u.user) === lc(d.buyer) ? null : flagBadge(u, 'paid'))),
          u.items.length ? itemsTable(u) : h('div', { class: 'muted' }, t('noch nichts')),
          h(
            'div',
            { class: 'row between muted', style: 'margin-top:6px' },
            h('span', null, `${t('Artikel')} ${eur(u.subtotal_cents)}${u.fee_cents ? ` + ${t('Lieferanteil')} ${eur(u.fee_cents)}` : ''}`),
            h('strong', { style: 'color:var(--fg)' }, eur(u.total_cents))
          )
        )
      )
    );
  }

  function renderMine() {
    const locked = d.locked;
    for (const el of [inArticle, inVariant, inPrice, inQty, addBtn]) el.disabled = locked;
    const mineU = d.users.find((u) => lc(u.user) === lc(me));
    if (!mineU) {
      mineList.replaceChildren(h('h3', null, t('Meine Artikel')), h('div', { class: 'muted' }, locked ? t('Bestellung ist gesperrt.') : t('Noch nichts eingetragen.')));
      return;
    }
    const stepper = (i, delta) =>
      h(
        'button',
        {
          class: 'btn small ghost',
          disabled: locked || i.qty + delta < 1 || i.qty + delta > 99,
          onclick: async () => {
            await act(() => api('PATCH', `/items/${i.id}`, { qty: i.qty + delta }));
            current.refresh();
          },
        },
        delta > 0 ? '+' : '−'
      );
    mineList.replaceChildren(
      h('div', { class: 'row between' }, h('h3', { style: 'margin:0' }, t('Meine Artikel')), h('div', { class: 'row' }, flagBadge(mineU, 'done'), lc(mineU.user) === lc(d.buyer) ? null : flagBadge(mineU, 'paid'))),
      mineU.items.length
        ? h(
            'table',
            null,
            h(
              'tbody',
              null,
              mineU.items.map((i) =>
                h(
                  'tr',
                  null,
                  h('td', null, i.article, i.variant ? ` · ${i.variant}` : '', h('div', { class: 'muted' }, `à ${eur(i.price_cents)}`)),
                  h('td', { class: 'num' }, h('div', { class: 'row', style: 'justify-content:flex-end;flex-wrap:nowrap' }, stepper(i, -1), h('strong', null, String(i.qty)), stepper(i, 1))),
                  h('td', { class: 'num' }, eur(i.price_cents * i.qty)),
                  h(
                    'td',
                    null,
                    h(
                      'button',
                      {
                        class: 'btn small danger',
                        disabled: locked,
                        title: t('Entfernen'),
                        onclick: async () => {
                          await act(() => api('DELETE', `/items/${i.id}`));
                          current.refresh();
                        },
                      },
                      '✕'
                    )
                  )
                )
              )
            )
          )
        : h('div', { class: 'muted' }, t('Noch nichts eingetragen.')),
      h(
        'div',
        { class: 'row between', style: 'margin-top:8px' },
        h('span', { class: 'muted' }, `${t('Artikel')} ${eur(mineU.subtotal_cents)}${mineU.fee_cents ? ` + ${t('Lieferanteil')} ${eur(mineU.fee_cents)}` : ''}`),
        h('strong', null, `${t('Summe')} ${eur(mineU.total_cents)}`)
      ),
      h('div', { class: 'row', style: 'margin-top:8px' }, h('span', { class: 'muted' }, t('Fertig = deine Bestellung ist komplett. Bezahlt = du hast dem Besteller dein Geld gegeben.')))
    );
  }

  function orderText() {
    const lines = [`${t('Bestellung')} ${d.restaurant.name}`];
    for (const g of d.groups) lines.push(`${g.qty}× ${g.article}${g.variant ? ` – ${g.variant}` : ''} (${eur(g.price_cents)})`);
    lines.push('', `${t('Summe Artikel')}: ${eur(d.items_total_cents)}`);
    return lines.join('\n');
  }

  function renderOrder() {
    const tel = telHref(d.restaurant.phone);
    orderPane.replaceChildren(
      h('div', { class: 'row between' }, h('h3', { style: 'margin:0' }, t('Sammelbestellung')), contactLinks(d.restaurant)),
      d.groups.length
        ? h(
            'table',
            { style: 'margin-top:8px' },
            h('thead', null, h('tr', null, h('th', { class: 'num' }, t('Menge')), h('th', null, t('Artikel')), h('th', { class: 'num' }, t('Einzel')), h('th', { class: 'num' }, t('Summe')))),
            h(
              'tbody',
              null,
              d.groups.map((g) =>
                h(
                  'tr',
                  null,
                  h('td', { class: 'num' }, `${g.qty}×`),
                  h('td', null, g.article, g.variant ? ` · ${g.variant}` : '', h('div', { class: 'muted' }, g.users.map((x) => (x.qty > 1 ? `${x.user} ${x.qty}×` : x.user)).join(', ')), g.price_differs ? h('div', { class: 'warn-text' }, t('⚠ Preis prüfen – zuletzt {p}', { p: eur(g.known_price_cents) })) : null),
                  h('td', { class: 'num' }, eur(g.price_cents)),
                  h('td', { class: 'num' }, eur(g.sum_cents))
                )
              )
            ),
            h(
              'tfoot',
              null,
              h('tr', null, h('td', { colspan: 3 }, t('Summe Artikel')), h('td', { class: 'num' }, eur(d.items_total_cents))),
              d.delivery_fee_cents ? h('tr', null, h('td', { colspan: 3 }, t('Lieferkosten')), h('td', { class: 'num' }, eur(d.delivery_fee_cents))) : null,
              h('tr', null, h('td', { colspan: 3 }, t('Gesamt')), h('td', { class: 'num' }, eur(d.grand_total_cents)))
            )
          )
        : h('p', { class: 'muted' }, t('Noch keine Positionen.')),
      h('div', { class: 'notice', style: 'margin-top:10px' }, h('strong', null, t('⚠ Preise sind Angaben der User und nicht geprüft. ')), t('Vor dem Bestellen mit der Karte abgleichen.')),
      h(
        'div',
        { class: 'row', style: 'margin-top:10px' },
        h(
          'button',
          {
            class: 'btn small',
            onclick: async () => {
              try {
                await navigator.clipboard.writeText(orderText());
                toast(t('Bestelltext kopiert'));
              } catch {
                toast(t('Kopieren nicht möglich'));
              }
            },
          },
          t('Text kopieren')
        ),
        tel ? h('a', { class: 'btn small', style: 'text-decoration:none', href: tel }, t('Anrufen')) : null
      )
    );
  }

  function renderPay() {
    const hasOrders = d.users.some((u) => u.subtotal_cents > 0);
    payCard.classList.toggle('hidden', !hasOrders);
    if (!hasOrders) return;
    const meU = d.users.find((u) => lc(u.user) === lc(me));
    const isBuyer = lc(me) === lc(d.buyer);
    const rows = [h('h3', null, t('💳 Bezahlen an {buyer}', { buyer: d.buyer }))];
    if (!d.paypal_visible) rows.push(h('div', { class: 'muted' }, t('PayPal-Adresse ist nur für Teilnehmer der Bestellung sichtbar.')));
    else if (!d.paypal) rows.push(h('div', { class: 'muted' }, t('Keine PayPal-Adresse hinterlegt.')));
    else {
      rows.push(
        h(
          'div',
          { class: 'row between' },
          h('strong', { class: 'payaddr' }, d.paypal),
          h(
            'button',
            {
              class: 'btn small ghost',
              onclick: async () => {
                try {
                  await navigator.clipboard.writeText(d.paypal);
                  toast(t('Adresse kopiert'));
                } catch {
                  toast(t('Kopieren nicht möglich'));
                }
              },
            },
            t('Kopieren')
          )
        )
      );
    }
    if (isBuyer) rows.push(h('div', { class: 'muted' }, t('Du bist Besteller – die anderen zahlen an dich.')));
    else if (meU && meU.subtotal_cents > 0 && meU.paid) rows.push(h('div', { class: 'banner ok' }, t('✓ Du hast bezahlt')));
    else if (meU && meU.subtotal_cents > 0) {
      const href = d.paypal ? payHref(d.paypal, meU.total_cents) : null;
      rows.push(
        href
          ? h('a', { class: 'btn', href, target: '_blank', rel: 'noopener noreferrer' }, t('{amount} per PayPal zahlen', { amount: eur(meU.total_cents) }))
          : h('div', { class: 'muted' }, t('Dein Betrag: {amount}', { amount: eur(meU.total_cents) }))
      );
    }
    payCard.replaceChildren(...rows);
  }

  function renderDebts() {
    if (!d.users.some((u) => u.subtotal_cents > 0)) {
      debtsCard.classList.add('hidden');
      return;
    }
    debtsCard.classList.remove('hidden');
    debtsCard.replaceChildren(
      h('h3', null, d.locked ? t('Offene Beträge') : t('Offene Beträge (vorläufig)')),
      d.debts.length
        ? h(
            'ul',
            { class: 'list' },
            d.debts.map((x) =>
              h(
                'li',
                null,
                h('span', null, x.user),
                h(
                  'span',
                  { class: 'row' },
                  h('strong', null, eur(x.amount_cents)),
                  lc(x.user) === lc(me) || d.viewer.can_manage
                    ? h('button', { class: 'btn small ghost', onclick: () => toggle('paid', { user: x.user, value: true }) }, t('bezahlt'))
                    : null
                )
              )
            )
          )
        : h('div', { class: 'banner ok' }, t('✓ Alles bezahlt'))
    );
  }

  function updateTimer() {
    if (!d) return;
    const left = d.expires_at - (Date.now() + skew);
    if (left <= 0) {
      timerNum.textContent = t('GESPERRT');
      timerNum.className = 'timer done';
      if (!d.locked && !expiredRefreshed) {
        expiredRefreshed = true;
        current.refresh();
      }
    } else {
      timerNum.textContent = fmtRemaining(left);
      timerNum.className = 'timer' + (left < 120000 ? ' low' : '');
    }
  }
  const tick = setInterval(updateTimer, 1000);

  return {
    async refresh() {
      try {
        d = await api('GET', `/rounds/${id}`);
      } catch (e) {
        app.replaceChildren(h('div', { class: 'card' }, h('p', null, e.message), h('a', { href: '#/' }, t('← Zurück'))));
        clearInterval(tick);
        return;
      }
      skew = d.server_now - Date.now();
      if (!catalogLoaded) {
        catalogLoaded = true;
        loadCatalog();
      }
      renderHead();
      renderTimerControls();
      renderBanners();
      renderUsers();
      renderMine();
      renderOrder();
      renderPay();
      renderDebts();
      updateTimer();
    },
    destroy() {
      clearInterval(tick);
    },
  };
}

// ---------- Statistik ----------
function statsView() {
  let scope = sessionStorage.getItem('bb_scope') || 'last30';
  const body = h('div', { style: 'display:grid;gap:14px' });
  const scopeBtns = h('div', { class: 'tabs' });
  for (const [k, label] of [
    ['last30', t('Letzte 30 Bestellungen')],
    ['all', t('Alle')],
  ]) {
    scopeBtns.append(
      h(
        'button',
        {
          'data-scope': k,
          onclick: () => {
            scope = k;
            sessionStorage.setItem('bb_scope', k);
            current.refresh();
          },
        },
        label
      )
    );
  }
  app.replaceChildren(h('h2', { style: 'margin:0' }, t('Statistik')), scopeBtns, body);

  return {
    async refresh() {
      for (const b of scopeBtns.children) b.setAttribute('aria-selected', String(b.dataset.scope === scope));
      const s = await act(() => api('GET', `/stats?scope=${scope}`));
      if (!s) return;
      if (!s.rounds) {
        body.replaceChildren(h('div', { class: 'card muted' }, t('Noch keine Daten.')));
        return;
      }
      body.replaceChildren(
        h(
          'section',
          { class: 'card grid3', style: 'grid-template-columns:1fr 1fr 1fr' },
          h('div', null, h('div', { class: 'muted' }, t('Bestellungen')), h('strong', null, String(s.rounds))),
          h('div', null, h('div', { class: 'muted' }, t('Ø Preis Artikel')), h('strong', null, eur(s.avg_item_cents))),
          h('div', null, h('div', { class: 'muted' }, t('Ø Betrag/User')), h('strong', null, eur(s.avg_order_cents)))
        ),
        h(
          'section',
          { class: 'card' },
          h('h3', null, 'Restaurants'),
          h(
            'table',
            null,
            h('thead', null, h('tr', null, h('th', null, 'Restaurant'), h('th', { class: 'num' }, t('Bestellungen')), h('th', { class: 'num' }, t('Artikel')), h('th', null, t('Beliebtestes Gericht')))),
            h(
              'tbody',
              null,
              s.restaurants.map((r) =>
                h('tr', null, h('td', null, r.name), h('td', { class: 'num' }, String(r.rounds)), h('td', { class: 'num' }, String(r.items)), h('td', null, r.top_dish ? `${r.top_dish} (${r.top_dish_qty}×)` : '—'))
              )
            )
          )
        )
      );
    },
    destroy() {},
  };
}

// ---------- Start ----------
setMe(me);
route();
