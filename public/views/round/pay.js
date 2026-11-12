// Bezahlbereich: Adresse des Bestellers, Betrag, Link
import { t } from '/i18n.js';
import { eur, h, toast, lc, me } from '/util.js';
import { payHref } from '/format.js';
import { qrIcon } from './qr-icon.js';

export function payRows(d) {
  const hasOrders = d.users.some((u) => u.subtotal_cents > 0);
  if (!hasOrders) return null;
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
  if (isBuyer) {
    // Besteller zahlt nicht an sich selbst: nur die Adresse zum Kopieren
  } else if (meU && meU.subtotal_cents > 0 && meU.paid) rows.unshift(h('div', { class: 'ready-strip on' }, t('✓ Du hast bezahlt')));
  else if (meU && meU.subtotal_cents > 0) {
    const href = d.paypal ? payHref(d.paypal, meU.total_cents) : null;
    rows.push(
      href
        ? h('div', { class: 'row pay-row' }, qrIcon(href), h('a', { class: 'btn grow', href, target: '_blank', rel: 'noopener noreferrer' }, t('{amount} per PayPal zahlen', { amount: eur(meU.total_cents) })))
        : h('div', { class: 'muted' }, t('Dein Betrag: {amount}', { amount: eur(meU.total_cents) }))
    );
  }
  return rows;
}
