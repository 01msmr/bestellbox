// Statusleiste oben: Ablaufzeile, Hinweise, offene Beträge
import { t } from '/i18n.js';
import { TIMING } from '/config.js';
import { joinList } from '/format.js';
import { eur, fmtWhen, h, lc, me } from '/util.js';

export function createStatus({ banners, toggle, decide }) {
  let d = null;
  let payConfirm = null; // {user, timer}: Rückfrage im Button vor „bezahlt“
  const debtRow = (x) =>
    h('div', { class: 'debt-row' },
      h('span', null, x.user),
      h('span', { class: 'row' },
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
                payConfirm = { user: x.user, timer: setTimeout(() => { payConfirm = null; render(d); }, TIMING.confirmMs) };
                render(d);
              },
            }, payConfirm?.user === x.user ? t('ist bezahlt?') : t('als bezahlt markieren'))
          : null));

  function render(data) {
    d = data;
    const b = [];
    const allReady = d.ready.total > 0 && !d.ready.not_ready.length;
    const step = (cls, text, time) => h('span', { class: `step ${cls}` }, text, time ? [' \u00A0\u00A0', h('span', { class: 'step-time' }, time)] : null);
    const sep = () => h('span', { class: 'step-sep' }, '›');
    const readyTxt = d.ready.total ? t('ready {done}/{total}', { done: d.ready.done, total: d.ready.total }) : t('ready');
    const opened = step('done', `✓ ${t('eröffnet')}`, fmtWhen(d.created_at));
    const ordTxt = `✓ ${t('bestellt')}`;
    const flow = d.delivered_at
      ? [opened, step('done', `✓ ${t('ready')}`), step('done', ordTxt, fmtWhen(d.ordered_at)), step('now', `✓ ${t('geliefert')}`, t('{time} Uhr', { time: fmtWhen(d.delivered_at) }))]
      : d.ordered_at
        ? [opened, step('done', `✓ ${t('ready')}`), step('now', ordTxt, fmtWhen(d.ordered_at)), step('todo', t('geliefert'))]
        : allReady
          ? [opened, step('now', `✓ ${readyTxt}`), step('todo', t('bestellt')), step('todo', t('geliefert'))]
          : null;
    if (flow) b.push(h('div', { class: 'status-flow' + (d.unpaid ? ' unpaid' : '') }, ...flow.flatMap((x, n) => (n ? [sep(), x] : [x]))));
    else if (d.ready.total) b.push(h('div', { class: 'banner warn' }, t('Noch nicht alle ready ({done}/{total}): {names}', { done: d.ready.done, total: d.ready.total, names: d.ready.not_ready.join(', ') })));
    if (d.unpaid) b.push(h('div', { class: 'banner bad' }, t(d.debts.length === 1 ? '{n} hat noch nicht bezahlt: {names} ({sum} offen)' : '{n} haben noch nicht bezahlt: {names} ({sum} offen)', { n: d.debts.length, names: joinList(d.debts.map((x) => x.user), t('und')), sum: eur(d.debts_total_cents) })));
    if (d.debts.length) b.push(h('div', { class: 'status-debts' }, ...d.debts.map(debtRow)));
    else if (d.ordered_at && d.users.some((u) => u.subtotal_cents > 0)) b.push(h('div', { class: 'banner ok' }, t('✓ Alles bezahlt')));
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

  return { render };
}
