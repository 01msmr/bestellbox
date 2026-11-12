// Sammelbestellung: Gruppentabelle, Summen und Text zum Kopieren
import { t } from '/i18n.js';
import { eur, h, toast, telHref, contactLinks } from '/util.js';

export function orderText(d) {
  const lines = [`${t('Bestellung')} ${d.restaurant.name}`];
  for (const g of d.groups) lines.push(`${g.qty}× ${g.article}${g.variant ? ` – ${g.variant}` : ''} (${eur(g.price_cents)})`);
  lines.push('', `${t('Summe Artikel')}: ${eur(d.items_total_cents)}`);
  return lines.join('\n');
}

export function orderContent(d) {
  const tel = telHref(d.restaurant.phone);
  return [
    h('div', { class: 'order-head' },
      h('h3', { class: 'flush' }, t('Sammelbestellung'), ' ', h('span', { class: 'plain' }, t('bei')), ` ${d.restaurant.name} `, h('span', { class: 'plain' }, t('durch')), ` ${d.buyer}`),
      contactLinks(d.restaurant, { pill: true })),
    d.groups.length
      ? h(
          'table',
          { class: 'order-table mt-3' },
          h('thead', null, h('tr', null, h('th', { class: 'num' }, t('Menge')), h('th', null, t('Artikel')), h('th', { class: 'num' }, t('Einzel')), h('th', { class: 'num' }, t('Summe')))),
          h(
            'tbody',
            null,
            d.groups.map((g) =>
              h(
                'tr',
                null,
                h('td', { class: 'num qty-cell' }, `${g.qty}×`),
                h('td', null, g.article, g.variant ? ` · ${g.variant}` : '', h('div', { class: 'muted' }, g.users.map((x) => (x.qty > 1 ? `${x.user} ${x.qty}×` : x.user)).join(', ')), g.price_differs ? h('div', { class: 'warn-text' }, t('Preis prüfen – zuletzt {p}', { p: eur(g.known_price_cents) })) : null),
                h('td', { class: 'num' }, g.qty > 1 ? eur(g.price_cents) : ''), // bei 1× wäre Einzel = Summe: nur rechts
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
    h('div', { class: 'notice mt-4' }, h('strong', null, t('Preise sind Angaben der User und nicht geprüft. ')), t('Vor dem Bestellen mit der Karte abgleichen.')),
    h(
      'div',
      { class: 'row mt-4' },
      h(
        'button',
        {
          class: 'btn small',
          onclick: async () => {
            try {
              await navigator.clipboard.writeText(orderText(d));
              toast(t('Bestelltext kopiert'));
            } catch {
              toast(t('Kopieren nicht möglich'));
            }
          },
        },
        t('Text kopieren')
      ),
      tel ? h('a', { class: 'btn small no-underline', href: tel }, t('Anrufen')) : null
    )
  ];
}
