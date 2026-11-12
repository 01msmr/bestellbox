// Alle Bestellungen: Historie nach Monaten (letzte 12), ältere nach Jahren.
import { t } from '/i18n.js';
import { LISTS } from '/config.js';
import { groupHistory, isCurrentRound } from '/group.js';
import { app, h, api } from '/util.js';
import { roundItem } from '/views/home.js';
import { groupTitle } from '/side.js';

export function allView() {
  const body = h('div', { class: 'hist' });
  app.replaceChildren(h('h2', null, t('Alle Bestellungen')), body);
  return {
    async refresh() {
      const rounds = await api('GET', '/rounds?all=1').catch(() => null);
      if (!rounds) return;
      const now = Date.now();
      const today = rounds.filter((r) => isCurrentRound(r, now));
      const rest = rounds.filter((r) => !isCurrentRound(r, now));
      body.replaceChildren(
        ...(today.length ? [h('h3', null, t('Heute')), h('div', { class: 'list' }, ...today.map((r) => roundItem(r, true)))] : []),
        ...(rest.length ? groupHistory(rest, now, LISTS.historyMonths).flatMap((g) => [h('h3', null, groupTitle(g)), h('div', { class: 'list' }, ...g.items.map((r) => roundItem(r)))]) : []),
        ...(rounds.length ? [] : [h('span', { class: 'muted' }, t('Noch nichts abgeschlossen.'))])
      );
    },
    destroy() {},
  };
}
