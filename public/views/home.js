// Startseite: neue Bestellung anlegen, Listen offener/unbezahlter/abgeschlossener Bestellungen.
import { t } from '/i18n.js';
import { LIMITS, DEFAULTS } from '/config.js';
import { pendingRound } from '/group.js';
import { roundStage } from '/format.js';
import { tickCountdowns } from '/side.js';
import { app, eur, fmtDate, lc, h, api, act, me, parseMoney, money } from '/util.js';

export const roundItem = (r, highlight = false) => {
  const stage = roundStage(r);
  const status = stage
    ? h('span', { class: 'badge ' + (stage === 'alles bezahlt' ? 'on' : 'mid') }, t(stage))
    : h('span', { class: 'badge on', 'data-expires': r.expires_at }, '…');
  return h(
    'a',
    { class: 'round-link' + (highlight === true ? ' today' : ''), href: `#/r/${r.id}` },
    h(
      'div',
      { class: 'card pad-4' },
      h('div', { class: 'row between' }, h('strong', null, r.restaurant), status),
      h('div', { class: 'muted' }, `${fmtDate(r.created_at)} · ${r.creator} · ${t('bestellt von')} ${r.buyer}`),
      h(
        'div',
        { class: 'row between' },
        h('span', null, `${r.done}/${r.users} ${t('ready')} · ${eur(r.total_cents)}`),
        r.unpaid ? h('span', { class: 'badge off' }, `${t('unbezahlt')}: ${eur(r.debts_total_cents)}`) : null
      )
    )
  );
};

export function homeView() {
  let restaurants = [];
  let knownRounds = [];
  const datalist = h('datalist', { id: 'rest-list' });
  const f = {
    name: h('input', { list: 'rest-list', placeholder: t('z. B. Pizza Roma'), required: true, maxlength: LIMITS.restaurantName, autocomplete: 'off' }),
    url: h('input', { placeholder: 'https://…', maxlength: LIMITS.restaurantUrl }),
    phone: h('input', { type: 'tel', placeholder: '07531 …', maxlength: LIMITS.restaurantPhone }),
    address: h('input', { placeholder: t('Straße Nr., Ort'), maxlength: LIMITS.restaurantAddress, autocomplete: 'off' }),
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
      f.address.value = r.address ?? '';
      if (!f.fee.value && r.last_delivery_fee_cents) f.fee.value = money(r.last_delivery_fee_cents);
    }
  });
  api('GET', '/me/paypal').then((r) => {
    if (r.paypal && !f.paypal.value) f.paypal.value = r.paypal;
  }).catch(() => {});

  const startBtn = h('button', { class: 'btn', type: 'submit' }, t('Bestellung starten'));
  const blockReason = h('span', { class: 'block-reason hidden' });
  // Pro Restaurant nur eine Bestellung gleichzeitig: Button inaktiv, Grund steht links davor
  function updateBlock() {
    const p = pendingRound(knownRounds, f.name.value, Date.now(), LIMITS.unorderedBlockHours);
    startBtn.disabled = !!p;
    blockReason.classList.toggle('hidden', !p);
    blockReason.replaceChildren(
      ...(p
        ? [
            p.locked ? t('Bestellung geschlossen, aber noch nicht als bestellt gemeldet:') : t('Es läuft bereits eine Bestellung:'),
            h(
              'a',
              { class: 'btn ghost block-go', href: `#/r/${p.id}` },
              h('strong', null, p.restaurant),
              p.locked ? h('span', { class: 'badge mid' }, t('geschlossen')) : h('span', { class: 'badge on', 'data-expires': p.expires_at }, '…')
            ),
          ]
        : [])
    );
    tickCountdowns();
  }
  f.name.addEventListener('input', updateBlock);

  const form = h(
    'form',
    {
      onsubmit: async (e) => {
        e.preventDefault();
        const fee = f.fee.value.trim() === '' ? 0 : parseMoney(f.fee.value);
        const res = await act(() =>
          api('POST', '/rounds', {
            restaurant: { name: f.name.value, url: f.url.value, phone: f.phone.value, address: f.address.value },
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
      class: 'form-wide',
    },
    h('label', null, 'Restaurant', f.name, datalist),
    h('label', null, t('Telefon'), f.phone),
    h('label', null, t('Webadresse'), f.url),
    h('label', null, t('Adresse'), f.address),
    h('label', null, t('Lieferkosten (€)'), f.fee),
    h('label', null, t('Bestellt von'), f.buyer),
    h('label', null, t('PayPal (Adresse/Link)'), f.paypal),
    h('label', null, t('Frist (Minuten)'), f.minutes),
    h('div', { class: 'form-actions gap-5' }, blockReason, startBtn)
  );

  const head = h('section', { class: 'card' }, h('h2', { class: 'flush mb-4' }, t('Neue Bestellung')), form);
  app.classList.add('wide');
  app.replaceChildren(h('div', { class: 'round-grid' }, head));

  return {
    async refresh() {
      const [rounds, rs] = await Promise.all([api('GET', '/rounds').catch(() => null), api('GET', '/restaurants').catch(() => null)]);
      if (rs) {
        restaurants = rs;
        datalist.replaceChildren(...rs.map((r) => h('option', { value: r.name })));
      }
      if (!rounds) return;
      knownRounds = rounds;
      updateBlock();
    },
    destroy() {},
  };
}

