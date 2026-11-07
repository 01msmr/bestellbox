// Startseite: neue Bestellung anlegen, Listen offener/unbezahlter/abgeschlossener Bestellungen.
import { t } from '/i18n.js';
import { LIMITS, DEFAULTS, LISTS } from '/config.js';
import { app, eur, fmtDate, lc, h, api, act, me, parseMoney } from '/util.js';

export function homeView() {
  let restaurants = [];
  const datalist = h('datalist', { id: 'rest-list' });
  const f = {
    name: h('input', { list: 'rest-list', placeholder: t('z. B. Pizza Roma'), required: true, maxlength: LIMITS.restaurantName, autocomplete: 'off' }),
    url: h('input', { placeholder: 'https://…', maxlength: LIMITS.restaurantUrl }),
    phone: h('input', { type: 'tel', placeholder: '07531 …', maxlength: LIMITS.restaurantPhone }),
    buyer: h('input', { value: me, maxlength: LIMITS.userName, required: true }),
    paypal: h('input', { value: '', placeholder: t('paypal.me/name oder E-Mail'), maxlength: LIMITS.paypal }),
    fee: h('input', { inputmode: 'decimal', placeholder: '0,00' }),
    minutes: h('input', { type: 'number', min: LIMITS.deadlineMinMinutes, max: LIMITS.deadlineMaxMinutes, value: DEFAULTS.deadlineMinutes }),
  };
  f.name.addEventListener('change', () => {
    const r = restaurants.find((x) => lc(x.name) === lc(f.name.value.trim()));
    if (r) {
      f.url.value = r.url;
      f.phone.value = r.phone;
      if (!f.fee.value && r.last_delivery_fee_cents) f.fee.value = (r.last_delivery_fee_cents / 100).toFixed(2).replace('.', ',');
    }
  });
  api('GET', '/me/paypal').then((r) => {
    if (r.paypal && !f.paypal.value) f.paypal.value = r.paypal;
  }).catch(() => {});

  const form = h(
    'form',
    {
      onsubmit: async (e) => {
        e.preventDefault();
        const fee = f.fee.value.trim() === '' ? 0 : parseMoney(f.fee.value);
        const res = await act(() =>
          api('POST', '/rounds', {
            restaurant: { name: f.name.value, url: f.url.value, phone: f.phone.value },
            buyer: f.buyer.value,
            paypal: f.paypal.value,
            delivery_fee: fee,
            minutes: Number(f.minutes.value),
          })
        );
        if (res) {
          location.hash = `#/r/${res.id}`;
        }
      },
      class: 'grid2',
    },
    h('label', null, 'Restaurant', f.name, datalist),
    h('label', null, t('Telefon'), f.phone),
    h('label', null, t('Webadresse'), f.url),
    h('label', null, t('Lieferkosten (€)'), f.fee),
    h('label', null, t('Bestellt von'), f.buyer),
    h('label', null, t('PayPal (Adresse/Link)'), f.paypal),
    h('label', null, t('Frist (Minuten)'), f.minutes),
    h('div', { class: 'row', style: 'align-items:end' }, h('button', { class: 'btn', type: 'submit' }, t('Bestellung starten')))
  );

  const activeBox = h('div', { class: 'list' });
  const unpaidBox = h('div', { class: 'list' });
  const recentBox = h('div', { class: 'list' });
  const unpaidCard = h('section', { class: 'card hidden home-lists' }, h('h2', null, t('💸 Unbezahlte Bestellungen')), unpaidBox);

  app.replaceChildren(
    h('section', { class: 'card' }, h('details', { open: true }, h('summary', null, t('Neue Bestellung')), h('div', { style: 'margin-top:10px' }, form))),
    h('section', { class: 'card home-lists' }, h('h2', null, t('Laufende Bestellungen')), activeBox),
    unpaidCard,
    h('section', { class: 'card home-lists' }, h('h2', null, t('Letzte Bestellungen')), recentBox)
  );

  const roundItem = (r) => {
    const status = r.locked
      ? h('span', { class: 'badge mid' }, t('gesperrt'))
      : h('span', { class: 'badge on', 'data-expires': r.expires_at }, '…');
    return h(
      'a',
      { class: 'round-link', href: `#/r/${r.id}` },
      h(
        'div',
        { class: 'card', style: 'padding:10px' },
        h('div', { class: 'row between' }, h('strong', null, r.restaurant), status),
        h('div', { class: 'muted' }, `${fmtDate(r.created_at)} · ${r.creator} · ${t('bestellt von')} ${r.buyer}`),
        h(
          'div',
          { class: 'row between' },
          h('span', null, `${r.done}/${r.users} ${t('fertig')} · ${eur(r.total_cents)}`),
          r.unpaid ? h('span', { class: 'badge off' }, `${t('unbezahlt')}: ${eur(r.debts_total_cents)}`) : null
        )
      )
    );
  };
  const fill = (box, list, empty) =>
    box.replaceChildren(...(list.length ? list.map(roundItem) : [h('span', { class: 'muted' }, empty)]));

  return {
    async refresh() {
      const [rounds, rs] = await Promise.all([api('GET', '/rounds').catch(() => null), api('GET', '/restaurants').catch(() => null)]);
      if (rs) {
        restaurants = rs;
        datalist.replaceChildren(...rs.map((r) => h('option', { value: r.name })));
      }
      if (!rounds) return;
      const active = rounds.filter((r) => !r.locked);
      const unpaid = rounds.filter((r) => r.unpaid);
      const recent = rounds.filter((r) => r.locked && !r.unpaid).slice(0, LISTS.closedShown);
      fill(activeBox, active, t('Keine laufende Bestellung.'));
      fill(unpaidBox, unpaid, '');
      unpaidCard.classList.toggle('hidden', unpaid.length === 0);
      fill(recentBox, recent, t('Noch nichts abgeschlossen.'));
    },
    destroy() {},
  };
}

