// Bestellseite: Frist, Banner, Bezahlen, Tabs (Nach Usern / Meine / Bestellen), offene Beträge.
import { t } from '/i18n.js';
import { LIMITS, DEFAULTS, LISTS, TIMING } from '/config.js';
import { app, eur, fmtDate, lc, h, toast, api, act, me, telHref, payHref, contactLinks, fmtRemaining, fold, parseMoney, nav } from '/util.js';

export function roundView(id) {
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
  const inArticle = h('input', { placeholder: t('Artikel'), maxlength: LIMITS.article, required: true, autocomplete: 'off' });
  const inVariant = h('input', { placeholder: t('z. B. 26 cm, Fladenbrot, scharf'), maxlength: LIMITS.variant, autocomplete: 'off' });
  const inPrice = h('input', { placeholder: t('Preis €'), inputmode: 'decimal', required: true });
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
          nav.current.refresh();
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
    nav.current.refresh();
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
    const editBuyer = h('input', { value: d.buyer, maxlength: LIMITS.userName });
    const editPaypal = h('input', { value: d.paypal, maxlength: LIMITS.paypal });
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
                  nav.current.refresh();
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
      buttons.push(h('button', { class: 'btn small', onclick: () => timeAction('extend', DEFAULTS.extendMinutes) }, `+${DEFAULTS.extendMinutes} min`));
      if (!d.locked) buttons.push(h('button', { class: 'btn small ghost', onclick: () => timeAction('lock') }, t('Jetzt sperren')));
      else buttons.push(h('button', { class: 'btn small ghost', onclick: () => timeAction('extend', DEFAULTS.extendMinutes) }, t('Wieder öffnen')));
    }
    if (d.viewer.can_manage) {
      const cb = h('input', { type: 'checkbox', onchange: () => act(() => api('PATCH', `/rounds/${id}`, { close_when_ready: cb.checked })).then(() => nav.current.refresh()) });
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
    nav.current.refresh();
  }

  function renderBanners() {
    const b = [];
    if (d.ready.total === 0) {
      b.push(h('div', { class: 'banner warn' }, t('Piep! Noch keine Artikel – trag deine ein.')));
    } else if (d.ready.not_ready.length) {
      b.push(h('div', { class: 'banner warn' }, t('⚠ Noch nicht alle fertig ({done}/{total}): {names}', { done: d.ready.done, total: d.ready.total, names: d.ready.not_ready.join(', ') })));
    } else {
      b.push(h('div', { class: 'banner ok' }, t('✓ Alle fertig ({total}/{total}) – Bestellbot meldet: kann bestellt werden', { total: d.ready.total })));
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
          disabled: locked || i.qty + delta < LIMITS.qtyMin || i.qty + delta > LIMITS.qtyMax,
          onclick: async () => {
            await act(() => api('PATCH', `/items/${i.id}`, { qty: i.qty + delta }));
            nav.current.refresh();
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
                          nav.current.refresh();
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

