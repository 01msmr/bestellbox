// Alle Bestellungen: Historie nach Monaten (letzte 12), ältere nach Jahren.
import { t } from '/i18n.js';
import { LISTS } from '/config.js';
import { groupHistory } from '/group.js';
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
      body.replaceChildren(
        ...(rounds.length
          ? groupHistory(rounds, Date.now(), LISTS.historyMonths).flatMap((g) => [h('h3', null, groupTitle(g)), h('div', { class: 'list' }, ...g.items.map(roundItem))])
          : [h('span', { class: 'muted' }, t('Noch nichts abgeschlossen.'))])
      );
    },
    destroy() {},
  };
}
