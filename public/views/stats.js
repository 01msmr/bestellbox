// Statistik: global (letzte N / alle), bewusst ohne Auswertung je User.
import { t } from '/i18n.js';
import { app, eur, h, api, act, nav } from '/util.js';

export function statsView() {
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
            nav.current.refresh();
          },
        },
        label
      )
    );
  }
  // Export aller Artikelzeilen als JSON-Datei (nur Admins)
  const exportBtn = h(
    'button',
    {
      class: 'btn small ghost hidden',
      type: 'button',
      onclick: async () => {
        const rows = await act(() => api('GET', '/export'));
        if (!rows) return;
        const a = h('a', { href: URL.createObjectURL(new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json' })), download: `dinedock-export-${new Date().toISOString().slice(0, 10)}.json` });
        a.click();
        URL.revokeObjectURL(a.href);
      },
    },
    t('Export (JSON)')
  );
  api('GET', '/me').then((m) => exportBtn.classList.toggle('hidden', !m.is_admin)).catch(() => {});
  app.replaceChildren(h('div', { class: 'row between' }, h('h2', { style: 'margin:0' }, t('Statistik')), exportBtn), scopeBtns, body);

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
            h('thead', null, h('tr', null, h('th', null, 'Restaurant'), h('th', { class: 'num' }, t('Bestellungen')), h('th', { class: 'num' }, t('Artikel')), h('th', null, t('Beliebtestes Gericht')), h('th', { class: 'num' }, t('Ø Lieferzeit')))),
            h(
              'tbody',
              null,
              s.restaurants.map((r) =>
                h('tr', null, h('td', null, r.name), h('td', { class: 'num' }, String(r.rounds)), h('td', { class: 'num' }, String(r.items)), h('td', null, r.top_dish ? `${r.top_dish} (${r.top_dish_qty}×)` : '—'), h('td', { class: 'num' }, r.delivery_minutes == null ? '—' : `${r.delivery_minutes} min`))
              )
            )
          )
        )
      );
    },
    destroy() {},
  };
}

