// Bestellseite: Frist, Banner, Bezahlen, Tabs (Nach Usern / Meine / Bestellen), offene Beträge.
import { t, lang } from '/i18n.js';
import { LIMITS, DEFAULTS, LISTS, TIMING } from '/config.js';
import { isCurrentRound } from '/group.js';
import { genitive, payHref, joinList } from '/format.js';
import { app, eur, fmtDate, fmtWhen, fmtClock, lc, h, toast, api, act, me, telHref, contactLinks, fmtRemaining, fold, parseMoney, nav } from '/util.js';

export function roundView(id) {
  let d = null;
  let skew = 0;
  let expiredRefreshed = false;
  let catalogLoaded = false;
  let tab = sessionStorage.getItem('bb_tab') || 'mine';

  const head = h('section', { class: 'card' });
  const timerNum = h('div', { class: 'timer' }, '--:--');
  const timerLabel = h('div', { class: 'muted' });
  const timerBtns = h('div', { class: 'row' });
  const timerCard = h('section', { class: 'card row between' }, h('div', null, timerLabel, timerNum), timerBtns);
  // Status-Zeilen (nicht ready, unbezahlt, Freigaben) als markante Leiste unter dem Kopf
  const banners = h('div', { class: 'status-lines' });
  document.getElementById('statusbar').replaceChildren(banners);
  const tabsEl = h('div', { class: 'tabs', role: 'tablist' });
  const usersPane = h('div', { class: 'users-pane' });
  const minePane = h('div', { style: 'display:grid;gap:10px' });
  const orderPane = h('div', { class: 'card' });
  const debtsCard = h('section', { class: 'card debts' });
  const payCard = h('section', { class: 'card pay hidden' });
  const inEta = h('input', { type: 'number', min: 1, max: LIMITS.etaMaxMinutes, value: DEFAULTS.etaMinutes, inputmode: 'numeric', style: 'width:84px' });
  const etaText = h('div', { style: 'font-weight:600' });
  const orderCard = h('section', { class: 'card order-card hidden' });
  let wasOrdered = null;
  let etaPrefilled = false;

  // Persistente Eingabezeile (wird bei Live-Updates nicht neu gebaut)
  const inArticle = h('input', { placeholder: t('Artikel'), maxlength: LIMITS.article, required: true, autocomplete: 'off' });
  const inVariant = h('input', { placeholder: t('z. B. 26 cm, Fladenbrot, scharf'), maxlength: LIMITS.variant, autocomplete: 'off' });
  const inPrice = h('input', { placeholder: '0,00', inputmode: 'decimal', required: true });
  const inQty = h('input', { type: 'number', min: LIMITS.qtyMin, max: LIMITS.qtyMax, value: 1 });
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
      for (const c of catalog.filter((c) => fold(c.article).includes(q)).slice(0, LISTS.suggestMax)) {
        parts.push(h('button', { type: 'button', class: 'pill', onmousedown: (ev) => ev.preventDefault(), onclick: () => { inArticle.value = c.article; updateAssist(); inVariant.focus(); } }, c.article));
      }
    }
    if (e) {
      for (const v of e.variants.filter((v) => v.variant).slice(0, LISTS.suggestMax)) {
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

  const col = (cls, ...kids) => h('div', { class: 'c-' + cls }, ...kids);
  const addForm = h(
    'form',
    {
      class: 'card item-card add-card',
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
          nav.current.refresh();
        }
      },
    },
    h('h3', null, t('+ Artikel')),
    h('div', { class: 'item-row item-labels muted' }, col('qty', t('Menge')), col('art', t('Artikel')), col('var', t('Variante (optional)')), col('price', t('Preis')), col('act')),
    h('div', { class: 'item-row' }, col('qty', inQty), col('art', inArticle), col('var', inVariant), col('price', h('div', { class: 'price-in' }, inPrice, h('span', { class: 'eur-box' }, '€'))), col('act', addBtn)),
    sugBox,
    h('div', { class: 'price-hint' }, h('strong', null, t('Preise selbst prüfen. ')), t('Vorgeschlagene Preise stammen aus früheren Bestellungen und können veraltet sein.'))
  );
  const mineList = h('div', { class: 'card item-card mine-card' });
  mineList.addEventListener('focusout', () => { if (mineDeferred) setTimeout(renderMine, 0); });
  minePane.append(addForm, mineList);

  const panes = { users: usersPane, mine: minePane, order: orderPane };
  const tabDefs = [
    ['mine', lang === 'de' ? `${genitive(me, 'de')} Artikel` : `${genitive(me, 'en')} items`],
    ['users', t('Alle')],
    ['order', t('Sammelbestellung')],
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
  const roundMain = h('div', { class: 'round-main' }, tabsEl, usersPane, minePane, orderPane, debtsCard);
  const roundGrid = h('div', { class: 'round-grid' }, head, roundMain);
  app.replaceChildren(roundGrid);
  showTab(tab);

  const toggle = async (path, body) => {
    await act(() => api('POST', `/rounds/${id}/${path}`, body));
    nav.current.refresh();
  };

  function flagBadge(u, flag) {
    const on = u[flag];
    const label = flag === 'done' ? (on ? t('✓ ready') : t('unready')) : on ? t('✓ bezahlt') : t('nicht bezahlt');
    const cls = on ? 'on' : flag === 'done' ? 'pale' : 'off';
    const editable = lc(u.user) === lc(me) || (flag === 'paid' && d.viewer.is_buyer);
    if (!editable || flag === 'done') return h('span', { class: `badge ${cls}` }, label); // ready wird nur über den Button gesetzt
    return h('button', { class: `badge ${cls}`, title: t('Umschalten'), onclick: () => toggle(flag, { user: u.user, value: !on }) }, label);
  }

  // Dauerhaftes Formular (Besteller, PayPal, Lieferkosten): wird bei Live-Updates nicht neu gebaut; ungespeicherte Eingaben bleiben
  const eBuyer = h('input', { maxlength: LIMITS.userName });
  const ePaypal = h('input', { maxlength: LIMITS.paypal });
  const eFee = h('input', { inputmode: 'decimal' });
  const editInputs = [eBuyer, ePaypal, eFee];
  const saveBtn = h('button', { class: 'btn small', type: 'submit', disabled: true }, t('Speichern'));
  const editFill = h('i');
  const editBar = h('div', { class: 'edit-bar hidden' }, h('span', null, t('Nicht gespeichert – wird zurückgenommen')), h('div', { class: 'edit-track' }, editFill));
  let saved = ['', '', ''];
  let deadline = 0;
  let editTick = null;
  const stopEdit = () => {
    clearInterval(editTick);
    editTick = null;
    editBar.classList.add('hidden');
  };
  // Speichern nur bei Änderung; ohne Bestätigung nach editRevertMs wird zurückgesetzt (Balken in den letzten editWarnMs)
  function tickEdit() {
    const left = deadline - Date.now();
    if (left <= 0) {
      editInputs.forEach((i, n) => (i.value = saved[n]));
      syncEdit(false);
      toast(t('Änderung zurückgenommen'));
      return;
    }
    editBar.classList.toggle('hidden', left > TIMING.editWarnMs);
    editFill.style.width = `${Math.min(100, (left / TIMING.editWarnMs) * 100)}%`;
  }
  function syncEdit(restart) {
    editInputs.forEach((i, n) => (i.dataset.dirty = i.value !== saved[n] ? '1' : ''));
    const dirty = editInputs.some((i) => i.dataset.dirty);
    saveBtn.disabled = !dirty;
    if (!dirty) return stopEdit();
    if (restart) deadline = Date.now() + TIMING.editRevertMs;
    editTick ??= setInterval(tickEdit, TIMING.barTickMs);
    tickEdit();
  }
  for (const i of editInputs) i.addEventListener('input', () => syncEdit(true));
  const headPick = h('nav', { class: 'head-pick' });
  const headTop = h('div');
  const headMeta = h('div', { class: 'muted', style: 'margin-top:6px' });
  const headForm = h(
    'form',
    {
      class: 'grid2',
      style: 'margin-top:10px',
      onsubmit: async (e) => {
        e.preventDefault();
        const ok = await act(() => api('PATCH', `/rounds/${id}`, { buyer: eBuyer.value, paypal: ePaypal.value, delivery_fee: parseMoney(eFee.value) }));
        if (ok) {
          saved = editInputs.map((i) => i.value);
          syncEdit(false);
        }
        nav.current.refresh();
      },
    },
    h('label', null, t('Bestellt von'), eBuyer),
    h('label', null, 'PayPal', ePaypal),
    h('label', null, t('Lieferkosten (€)'), eFee),
    editBar,
    h('div', { class: 'form-actions' }, saveBtn)
  );
  head.append(headPick, h('div', { class: 'head-main' }, headTop, headMeta, headForm), h('div', { class: 'head-side' }, timerCard, orderCard, payCard));

  // Wechsel zwischen den heutigen/offenen Bestellungen (nur sichtbar, wenn es mehrere gibt)
  function renderPick(list) {
    const cur = (list ?? []).filter((x) => isCurrentRound(x, Date.now()));
    // Stack nur bei mehreren Bestellungen heute (bei einer steht sie direkt in der Sidebar)
    const show = cur.length > 1;
    head.classList.toggle('has-pick', show);
    headPick.replaceChildren(
      ...(show
        ? cur.map((x) => h('a', { class: 'pick-item' + (x.id === id ? ' active' : ''), href: `#/r/${x.id}` }, h('strong', null, x.restaurant), h('span', { class: 'muted' }, `${fmtWhen(x.created_at)} · ${x.creator}`)))
        : [])
    );
  }

  function renderHead() {
    headTop.replaceChildren(
      h('h2', { style: 'margin:0' }, d.restaurant.name, h('span', { class: 'muted', style: 'font-weight:400;margin-left:8px' }, fmtWhen(d.created_at))),
      contactLinks(d.restaurant),
      ...(d.restaurant.address ? [h('div', { class: 'muted' }, d.restaurant.address)] : [])
    );
    const manage = d.viewer.can_manage;
    headMeta.replaceChildren(
      ...(manage
        ? [t('Gestartet {date} von {creator}', { date: fmtDate(d.created_at), creator: d.creator })]
        : [
            t('Gestartet {date} von {creator} · bestellt von ', { date: fmtDate(d.created_at), creator: d.creator }),
            h('strong', null, d.buyer),
            t(' · Lieferkosten: {fee}', { fee: eur(d.delivery_fee_cents) }),
          ])
    );
    headForm.classList.toggle('hidden', !manage);
    const vals = [d.buyer, d.paypal, (d.delivery_fee_cents / 100).toFixed(2).replace('.', ',')];
    saved = vals;
    editInputs.forEach((i, n) => {
      if (!i.dataset.dirty) i.value = vals[n];
    });
    syncEdit(false);
    const locked = !!d.ordered_at; // ab „Bestellt“ nicht mehr änderbar
    for (const i of editInputs) i.disabled = locked;
    saveBtn.classList.toggle('hidden', locked);
    editBar.classList.toggle('hidden', locked || editBar.classList.contains('hidden'));
  }

  // Bestellt-Meldung und geschätzte Lieferzeit (Ersteller/Besteller/Admins setzen, alle sehen live)
  function renderOrderStatus() {
    const manage = d.viewer.can_manage;
    const ordered = !!d.ordered_at;
    if (!etaPrefilled) {
      etaPrefilled = true;
      if (d.restaurant.delivery_minutes >= 1) inEta.value = d.restaurant.delivery_minutes;
    }
    orderCard.classList.toggle('hidden', !ordered && !manage);
    const patch = (body) => act(() => api('PATCH', `/rounds/${id}`, body)).then(() => nav.current.refresh());
    const eta = inEta.value === '' ? {} : { eta_minutes: Number(inEta.value) };
    const kids = [];
    if (ordered && !d.delivered_at) kids.push(etaText);
    if (manage) {
      kids.push(
        d.delivered_at ? null : h('label', { class: 'row muted' }, t('Lieferzeit (Minuten, geschätzt)'), inEta, d.restaurant.delivery_count ? h('span', null, t('Ø {n} min bei diesem Restaurant', { n: d.restaurant.delivery_minutes })) : null),
        h(
          'div',
          { class: 'form-actions', style: 'gap:8px' },
          !ordered && !d.locked ? h('span', { class: 'warn-text' }, t('Erst schließen, dann bestellen')) : null,
          ordered ? h('button', { class: 'btn small ghost', type: 'button', onclick: () => patch({ ordered: false }) }, t('Bestellt zurücknehmen')) : null,
          ordered && !d.delivered_at ? h('button', { class: 'btn small', type: 'button', onclick: () => patch({ delivered: true }) }, t('Geliefert')) : null,
          ordered
            ? d.delivered_at ? null : h('button', { class: 'btn small', type: 'button', onclick: () => patch(eta) }, t('Lieferzeit aktualisieren'))
            : h('button', { class: 'btn small', type: 'button', disabled: !d.locked, onclick: () => patch({ ordered: true, ...eta }) }, t('Als bestellt melden'))
        )
      );
    }
    orderCard.replaceChildren(...kids.filter(Boolean));
    if (wasOrdered === false && ordered) toast(d.eta_at ? t('✓ Bestellt – Lieferung ca. {time}', { time: fmtClock(d.eta_at) }) : t('✓ Bestellt'));
    wasOrdered = ordered;
    updateEta();
  }
  function updateEta() {
    if (!d?.eta_at) {
      etaText.textContent = '';
      return;
    }
    const left = d.eta_at - (Date.now() + skew);
    etaText.textContent = `${t('Lieferung ca. {time}', { time: fmtClock(d.eta_at) })} · ${left > 0 ? `${t('noch')} ${fmtRemaining(left)}` : t('sollte da sein')}`;
  }

  function renderTimerControls() {
    timerLabel.textContent = d.locked ? t('Bestellfrist abgelaufen – Bestellung geschlossen') : t('Bestellfrist');
    const buttons = [];
    if (d.viewer.can_manage) {
      const ordered = !!d.ordered_at;
      const reason = ordered ? t('Erst „Bestellt“ zurücknehmen') : d.locked ? t('Zum Verlängern erst wieder öffnen') : null;
      if (reason) buttons.push(h('span', { class: 'warn-text', style: 'width:100%' }, reason));
      buttons.push(h('button', { class: 'btn small', disabled: d.locked, onclick: () => timeAction('extend', DEFAULTS.extendMinutes) }, `+${DEFAULTS.extendMinutes} min`));
      if (!d.locked) buttons.push(h('button', { class: 'btn small ghost', onclick: () => timeAction('lock') }, t('Jetzt schließen')));
      else buttons.push(h('button', { class: 'btn small ghost', disabled: ordered, onclick: () => timeAction('reopen', DEFAULTS.extendMinutes) }, t('Wieder öffnen')));
    }
    if (d.viewer.can_manage) {
      const cb = h('input', { type: 'checkbox', onchange: () => act(() => api('PATCH', `/rounds/${id}`, { close_when_ready: cb.checked })).then(() => nav.current.refresh()) });
      cb.checked = d.close_when_ready;
      cb.disabled = d.locked;
      buttons.push(h('label', { class: 'row muted', style: 'gap:6px;width:100%' }, cb, t('Schließen, wenn alle ready')));
    } else if (d.close_when_ready && !d.locked) {
      buttons.push(h('div', { class: 'muted' }, t('Schließt, sobald alle ready sind')));
    }
    timerBtns.replaceChildren(...buttons);
  }
  async function timeAction(action, minutes) {
    await act(() => api('POST', `/rounds/${id}/time`, { action, minutes }));
    expiredRefreshed = false;
    nav.current.refresh();
  }

  function renderBanners() {
    const b = [];
    const allReady = d.ready.total > 0 && !d.ready.not_ready.length;
    const step = (cls, text, time) => h('span', { class: `step ${cls}` }, text, time ? [' \u00A0\u00A0', h('span', { class: 'step-time' }, time)] : null);
    const sep = () => h('span', { class: 'step-sep' }, '›');
    const readyTxt = d.ready.total ? t('ready {done}/{total}', { done: d.ready.done, total: d.ready.total }) : t('ready');
    const opened = step('done', `✓ ${t('eröffnet')}`, fmtClock(d.created_at));
    const ordTxt = `✓ ${t('bestellt')}`;
    const flow = d.delivered_at
      ? [opened, step('done', `✓ ${t('ready')}`), step('done', ordTxt, fmtClock(d.ordered_at)), step('now', `✓ ${t('geliefert')}`, t('{time} Uhr', { time: fmtClock(d.delivered_at) }))]
      : d.ordered_at
        ? [opened, step('done', `✓ ${t('ready')}`), step('now', ordTxt, fmtClock(d.ordered_at)), step('todo', t('geliefert'))]
        : allReady
          ? [opened, step('now', `✓ ${readyTxt}`), step('todo', t('bestellt')), step('todo', t('geliefert'))]
          : null;
    if (flow) b.push(h('div', { class: 'status-flow' }, ...flow.flatMap((x, n) => (n ? [sep(), x] : [x]))));
    else if (d.ready.total) b.push(h('div', { class: 'banner warn' }, t('Noch nicht alle ready ({done}/{total}): {names}', { done: d.ready.done, total: d.ready.total, names: d.ready.not_ready.join(', ') })));
    if (d.unpaid) b.push(h('div', { class: 'banner bad' }, t(d.debts.length === 1 ? '{n} Nutzer hat noch nicht bezahlt: {names} ({sum} offen)' : '{n} Nutzer haben noch nicht bezahlt: {names} ({sum} offen)', { n: d.debts.length, names: joinList(d.debts.map((x) => x.user), t('und')), sum: eur(d.debts_total_cents) })));
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
    nav.current.refresh();
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

  // „Alle“: ready-User oben; nicht ready deutlich abgesetzt ganz unten (zählen nicht in der Bestellung)
  function renderUsers() {
    if (!d.users.length) {
      usersPane.replaceChildren(h('div', { class: 'card muted' }, t('Noch niemand dabei.')));
      return;
    }
    const card = (u) =>
      h(
        'section',
        { class: `card user-card ${u.done ? (u.paid || lc(u.user) === lc(d.buyer) ? 'paid' : 'unpaid') : 'unready'}` },
        h('div', { class: 'row between' }, h('strong', null, u.user + (lc(u.user) === lc(d.buyer) ? t(' (Besteller)') : '')), h('div', { class: 'row' }, flagBadge(u, 'done'), !u.done || lc(u.user) === lc(d.buyer) ? null : flagBadge(u, 'paid'))),
        u.items.length ? itemsTable(u) : h('div', { class: 'muted' }, t('noch nichts')),
        u.done
          ? h(
              'div',
              { class: 'row between muted', style: 'margin-top:6px' },
              h('span', null, `${t('Artikel')} ${eur(u.subtotal_cents)}${u.fee_cents ? ` + ${t('Lieferanteil')} ${eur(u.fee_cents)}` : ''}`),
              h('strong', { style: 'color:var(--fg)' }, eur(u.total_cents))
            )
          : null
      );
    const ready = d.users.filter((u) => u.done);
    const unready = d.users.filter((u) => !u.done);
    usersPane.replaceChildren(
      ...ready.map(card),
      ...(unready.length ? [h('div', { class: 'unready-gap' }), h('div', { class: 'unready-block' }, h('div', { class: 'unready-sep' }, t('Noch nicht ready – zählt nicht in der Bestellung')), ...unready.map(card))] : [])
    );
  }

  let undo = null;
  function showUndo(item) {
    clearTimeout(undo?.timer);
    undo = { item, timer: setTimeout(() => { undo = null; renderMine(); }, TIMING.undoMs) };
  }
  async function doUndo() {
    const { item } = undo;
    clearTimeout(undo.timer);
    undo = null;
    await act(() => api('POST', `/rounds/${id}/items`, { article: item.article, variant: item.variant, price: item.price_cents / 100, qty: item.qty }));
    nav.current.refresh();
  }
  let mineDeferred = false;
  function renderMine() {
    if (mineList.contains(document.activeElement) && document.activeElement.tagName === 'INPUT') { mineDeferred = true; return; }
    mineDeferred = false;
    const locked = d.locked;
    for (const el of [inArticle, inVariant, inPrice, inQty, addBtn]) el.disabled = locked;
    const mineU = d.users.find((u) => lc(u.user) === lc(me));
    if (!mineU) {
      mineList.replaceChildren(h('h3', null, t('Meine Artikel')), h('div', { class: 'muted' }, locked ? t('Bestellung ist geschlossen.') : t('Noch nichts eingetragen.')));
      return;
    }
    const stepper = (i, delta) =>
      h(
        'button',
        {
          class: 'btn small ghost',
          disabled: locked || mineU.done || i.qty + delta < LIMITS.qtyMin || i.qty + delta > LIMITS.qtyMax,
          onclick: async () => {
            await act(() => api('PATCH', `/items/${i.id}`, { qty: i.qty + delta }));
            nav.current.refresh();
          },
        },
        delta > 0 ? '+' : '−'
      );
    const closed = locked || mineU.done;
    const money = (c) => (c / 100).toFixed(2).replace('.', ',');
    const priceCell = (c) => h('div', { class: 'price-in' }, h('span', { class: 'num-box' }, money(c)), h('span', { class: 'eur-box' }, '€'));
    const sumRow = (label, cents, cls = '') => h('div', { class: `sum-row ${cls}` }, h('div', { class: 'c-lbl' }, label), h('div', { class: 'c-amt' }, priceCell(cents)));
    const counted = d.users.filter((u) => u.subtotal_cents > 0).length;
    const itemRow = (i) => {
      const qtyCol = col('qty', h('div', { class: 'row', style: 'flex-wrap:nowrap;gap:4px' }, stepper(i, -1), h('strong', null, String(i.qty)), stepper(i, 1)));
      const del = h('button', { class: 'btn small danger', disabled: closed, title: t('Entfernen'), onclick: async () => { if ((await act(() => api('DELETE', `/items/${i.id}`))) !== null) showUndo(i); nav.current.refresh(); } }, '✕');
      if (closed) return h('div', { class: 'item-row item-line' }, qtyCol, col('art', i.article), col('var', h('span', { class: 'muted' }, i.variant)), col('price', priceCell(i.price_cents)));
      const field = (key, value, max, extra) => h('input', { value, maxlength: max, autocomplete: 'off', ...extra, onchange: async (e) => { await act(() => api('PATCH', `/items/${i.id}`, { [key]: e.target.value })); nav.current.refresh(); } });
      return h('div', { class: 'item-row item-line' }, qtyCol, col('art', field('article', i.article, LIMITS.article, { required: true })), col('var', field('variant', i.variant || '', LIMITS.variant)), col('price', h('div', { class: 'price-in' }, field('price', money(i.price_cents), 12, { inputmode: 'decimal' }), h('span', { class: 'eur-box' }, '€'))), col('act', del));
    };
    mineList.replaceChildren(
      h('div', { class: 'ready-strip ' + (mineU.done ? 'on' : 'pale') }, mineU.done ? t('✓ ready') : t('unready – Artikel zählen nicht')),
      h('div', { class: 'row between' }, h('h3', { style: 'margin:0' }, t('Meine Artikel')), h('div', { class: 'row' }, lc(mineU.user) === lc(d.buyer) ? null : flagBadge(mineU, 'paid'))),
      ...(undo ? [h('div', { class: 'row between undo-row' }, h('span', { class: 'muted' }, t('Gelöscht: {name}', { name: undo.item.article })), h('button', { class: 'btn small', type: 'button', onclick: doUndo }, t('Rückgängig')))] : []),
      mineU.items.length
        ? h(
            'div',
            { class: 'item-list' },
            mineU.items.map(itemRow)
          )
        : h('div', { class: 'muted' }, t('Noch nichts eingetragen.')),
      h('div', { style: 'margin-top:10px;display:grid;gap:4px' },
        sumRow(t('Summe Artikel'), mineU.subtotal_cents),
        mineU.fee_cents ? sumRow(`${t('Lieferanteil')} (${t('{fee} / {n} Besteller', { fee: eur(d.delivery_fee_cents), n: counted })})`, mineU.fee_cents) : null,
        sumRow(t('Summe'), mineU.total_cents, 'total')),
      h('div', { class: 'row', style: 'margin-top:8px' }, h('span', { class: 'muted' }, t('Ready = deine Bestellung ist komplett. Bezahlt = du hast dem Besteller dein Geld gegeben.'))),
      h(
        'div',
        { class: 'ready-bar' + (mineU.done ? ' is-done' : '') },
        mineU.done ? h('span', null, t('✓ Ready')) : null,
        h('button', { class: 'btn ready', type: 'button', onclick: () => toggle('done', { user: mineU.user, value: !mineU.done }) }, mineU.done ? t('Artikel ändern') : t('✓ Ich bin ready'))
      )
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
                  h('td', null, g.article, g.variant ? ` · ${g.variant}` : '', h('div', { class: 'muted' }, g.users.map((x) => (x.qty > 1 ? `${x.user} ${x.qty}×` : x.user)).join(', ')), g.price_differs ? h('div', { class: 'warn-text' }, t('Preis prüfen – zuletzt {p}', { p: eur(g.known_price_cents) })) : null),
                  h('td', { class: 'num' }, eur(g.price_cents)),
                  h('td', { class: 'num' }, eur(g.sum_cents))
                )
              )
            ),
            h(
              'tfoot',
              null,
              h('tr', null, h('td', { colspan: 3, class: 'foot-lbl' }, t('Summe Artikel')), h('td', { class: 'num' }, eur(d.items_total_cents))),
              d.delivery_fee_cents ? h('tr', null, h('td', { colspan: 3, class: 'foot-lbl' }, t('Lieferkosten')), h('td', { class: 'num' }, eur(d.delivery_fee_cents))) : null,
              h('tr', null, h('td', { colspan: 3, class: 'foot-lbl' }, t('Gesamt')), h('td', { class: 'num' }, eur(d.grand_total_cents)))
            )
          )
        : h('p', { class: 'muted' }, t('Noch keine Positionen.')),
      h('div', { class: 'notice', style: 'margin-top:10px' }, h('strong', null, t('Preise sind Angaben der User und nicht geprüft. ')), t('Vor dem Bestellen mit der Karte abgleichen.')),
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
    const rows = [h('h3', null, t('Bezahlen an {buyer}', { buyer: d.buyer }))];
    if (!d.paypal_visible) rows.push(h('div', { class: 'muted' }, t('PayPal-Adresse ist nur für Teilnehmer der Bestellung sichtbar.')));
    else if (!d.paypal) rows.push(h('div', { class: 'muted' }, t('Keine PayPal-Adresse hinterlegt.')));
    else {
      rows.push(
        h(
          'div',
          { class: 'row between' },
          !isBuyer && payHref(d.paypal, meU && !meU.paid ? meU.total_cents : 0)
            ? h('a', { class: 'payaddr', href: payHref(d.paypal, meU && !meU.paid ? meU.total_cents : 0), target: '_blank', rel: 'noopener noreferrer' }, d.paypal)
            : h('strong', { class: 'payaddr' }, d.paypal),
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
    else if (meU && meU.subtotal_cents > 0 && meU.paid) rows.unshift(h('div', { class: 'ready-strip on' }, t('✓ Du hast bezahlt')));
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

  let payConfirm = null; // {user, timer}: Rückfrage im Button vor „bezahlt“
  function renderDebts() {
    if (!d.users.some((u) => u.subtotal_cents > 0)) {
      debtsCard.classList.add('hidden');
      return;
    }
    debtsCard.classList.remove('hidden');
    const top = !!(d.ordered_at && d.delivered_at); // fertig und geliefert: Beträge oben unter den Hinweisen
    debtsCard.classList.toggle('debts-top', top);
    if (top && debtsCard.parentNode !== roundGrid) roundGrid.prepend(debtsCard);
    else if (!top && debtsCard.parentNode !== roundMain) roundMain.append(debtsCard);
    debtsCard.replaceChildren(
      d.debts.length
        ? h('div', { class: 'ready-strip pale' }, d.locked ? t('Offene Beträge') : t('Offene Beträge (vorläufig)'))
        : h('div', { class: 'ready-strip on', style: 'margin:-14px' }, t('✓ Alles bezahlt')),
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
                  lc(x.user) === lc(me) || d.viewer.is_buyer
                    ? h('button', {
                      class: payConfirm?.user === x.user ? 'btn small' : 'btn small ghost',
                      onclick: () => {
                        if (payConfirm?.user === x.user) {
                          clearTimeout(payConfirm.timer);
                          payConfirm = null;
                          toggle('paid', { user: x.user, value: true });
                          return;
                        }
                        clearTimeout(payConfirm?.timer);
                        payConfirm = { user: x.user, timer: setTimeout(() => { payConfirm = null; renderDebts(); }, TIMING.confirmMs) };
                        renderDebts();
                      },
                    }, payConfirm?.user === x.user ? t('ist bezahlt?') : t('als bezahlt markieren'))
                    : null
                )
              )
            )
          )
        : ''
    );
  }

  function updateTimer() {
    if (!d) return;
    updateEta();
    const left = d.expires_at - (Date.now() + skew);
    if (left <= 0) {
      timerNum.textContent = t('GESCHLOSSEN');
      timerNum.className = 'timer done';
      if (!d.locked && !expiredRefreshed) {
        expiredRefreshed = true;
        nav.current.refresh();
      }
    } else {
      timerNum.textContent = fmtRemaining(left);
      timerNum.className = 'timer' + (left < TIMING.lowTimeMs ? ' low' : '');
    }
  }
  const tick = setInterval(updateTimer, TIMING.tickMs);

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
      api('GET', '/rounds').then(renderPick).catch(() => {});
      renderHead();
      renderTimerControls();
      renderOrderStatus();
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
      stopEdit();
      document.getElementById('statusbar').replaceChildren();
    },
  };
}

