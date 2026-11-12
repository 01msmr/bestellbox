// „Alle“-Liste: Karten je User mit Artikeln, Ready-/Bezahlt-Marken
import { t } from '/i18n.js';
import { eur, h, lc, me } from '/util.js';

export function flagBadge(d, toggle, u, flag) {
  const on = u[flag];
  const label = flag === 'done' ? (on ? t('✓ ready') : t('unready')) : on ? t('✓ bezahlt') : t('nicht bezahlt');
  const cls = on ? (flag === 'done' && d.ordered_at ? 'idle' : 'on') : flag === 'done' ? 'pale' : 'off'; // nach Bestellt: ready nur noch grau
  const editable = lc(u.user) === lc(me) || (flag === 'paid' && d.viewer.is_buyer);
  if (!editable || flag === 'done') return h('span', { class: `badge ${cls}` }, label); // ready wird nur über den Button gesetzt
  return h('button', { class: `badge ${cls}`, title: t('Umschalten'), onclick: () => toggle(flag, { user: u.user, value: !on }) }, label);
}

function itemsTable(u, asSum) {
  return h(
    'table',
    { class: 'user-items' },
    h(
      'tbody',
      null,
      u.items.map((i) => h('tr', null, h('td', { class: 'num' }, `${i.qty}×`), h('td', null, i.article, i.variant ? h('div', { class: 'muted' }, i.variant) : null), h('td', { class: 'num' }, asSum ? h('strong', { class: 'text-fg' }, eur(i.price_cents * i.qty)) : eur(i.price_cents * i.qty))))
    )
  );
}

// „Alle“: ready-User oben; nicht ready deutlich abgesetzt ganz unten (zählen nicht in der Bestellung)
export function renderUsers(d, toggle, usersPane) {
  if (!d.users.length) {
    usersPane.replaceChildren(h('div', { class: 'card muted' }, t('Noch niemand dabei.')));
    return;
  }
  const card = (u) => {
    const count = u.items.reduce((a, i) => a + i.qty, 0);
    return h(
      'section',
      { class: `card user-card ${u.done ? (u.paid || lc(u.user) === lc(d.buyer) ? 'paid' : 'unpaid') : 'unready'}` },
      h('div', { class: 'row between card-head' }, h('strong', null, u.user + (lc(u.user) === lc(d.buyer) ? t(' (Besteller)') : '')), h('div', { class: 'row' }, flagBadge(d, toggle, u, 'done'), lc(u.user) === lc(d.buyer) ? h('span', { class: 'badge idle', title: t('Der Besteller zahlt bei der Bestellung und bekommt das Geld von den anderen.') }, t('ist Besteller')) : null, !u.done || lc(u.user) === lc(d.buyer) ? null : flagBadge(d, toggle, u, 'paid'))),
      u.items.length ? itemsTable(u, u.done && count === 1 && !u.fee_cents) : h('div', { class: 'muted' }, t('noch nichts')),
      u.done && (count > 1 || u.fee_cents) // bei nur 1 Artikel ohne Lieferanteil wäre die Summe doppelt
        ? h(
            'div',
            { class: 'row end muted mt-2 gap-5' },
            h('span', null, `${count === 1 ? t('1 Artikel') : t('{n} Artikel', { n: count })}${u.fee_cents ? ` · ${t('Lieferanteil')} ${eur(u.fee_cents)}` : ''}`),
            h('strong', { class: 'text-fg' }, eur(u.total_cents))
          )
        : null
    );
  };
  const ready = d.users.filter((u) => u.done);
  const unready = d.users.filter((u) => !u.done);
  usersPane.replaceChildren(
    ...ready.map(card),
    ...(unready.length ? [h('div', { class: 'unready-gap' }), h('div', { class: 'unready-block' }, h('div', { class: 'unready-sep' }, t('Noch nicht ready – zählt nicht in der Bestellung')), ...unready.map(card))] : [])
  );
}
