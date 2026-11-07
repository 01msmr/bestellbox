// Sidebar mit allen Bestellungen (ab 700 px sichtbar) und globale Countdown-Badges.
import { t, locale } from '/i18n.js';
import { LISTS, TIMING } from '/config.js';
import { eur, h, api, me, fmtRemaining } from '/util.js';

const sideEl = document.getElementById('side');

let sideRounds = [];
export async function loadSide() {
  if (!me) return;
  const r = await api('GET', '/rounds').catch(() => null);
  if (r) {
    sideRounds = r;
    renderSide();
  }
}
export function renderSide() {
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
    ...group(t('Abgeschlossen'), sideRounds.filter((r) => r.locked && !r.unpaid).slice(0, LISTS.closedShown))
  );
  tickCountdowns();
}
// Countdown-Badges (Sidebar und Startseite) – einmal global, nicht je Ansicht
export function tickCountdowns() {
  for (const el of document.querySelectorAll('[data-expires]')) {
    const left = Number(el.dataset.expires) - Date.now();
    el.textContent = left > 0 ? `${t('noch')} ${fmtRemaining(left)}` : t('abgelaufen');
    el.className = 'badge ' + (left > 0 ? (left < TIMING.lowTimeMs ? 'off' : 'on') : 'mid');
  }
}
setInterval(tickCountdowns, TIMING.tickMs);

