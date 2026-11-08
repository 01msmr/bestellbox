// bestellbot – Frontend (Vanilla JS, ES-Module, keine Build-Schritte)
// Einstieg: Name wählen, Router (#/, #/r/<Nr>, #/stats), Live-Updates per SSE.
import { t } from '/i18n.js';
import { LIMITS, TIMING } from '/config.js';
import { app, h, me, setMe, nav, BOT_SVG } from '/util.js';
import { loadSide } from '/side.js';
import { homeView } from '/views/home.js';
import { roundView } from '/views/round.js';
import { statsView } from '/views/stats.js';

const whoBtn = document.getElementById('who');

function askName() {
  return new Promise((resolve) => {
    const input = h('input', { placeholder: t('Dein Name'), maxlength: LIMITS.userName, autofocus: true, value: me });
    const form = h(
      'form',
      {
        class: 'card',
        onsubmit: (e) => {
          e.preventDefault();
          if (!input.value.trim()) return;
          setMe(input.value);
          resolve();
        },
      },
      h('h2', null, t('Wie heißt du?')),
      h('p', { class: 'muted' }, t('Der Name erscheint bei deinen Positionen. Gleicher Name = gleiche Person, bitte konsistent verwenden.')),
      h('div', { class: 'row' }, h('div', { class: 'grow' }, input), h('button', { class: 'btn', type: 'submit' }, t('Los')))
    );
    app.replaceChildren(form);
    input.focus();
  });
}

whoBtn.addEventListener('click', async () => {
  await askName();
  route();
});

// ---------- Router ----------

let refreshTimer;

function route() {
  nav.current?.destroy?.();
  nav.current = null;
  app.classList.remove('wide');
  for (const a of document.querySelectorAll('.top nav a')) a.classList.toggle('active', a.dataset.nav === ((location.hash || '#/') === '#/stats' ? 'stats' : 'orders'));
  if (!me) {
    askName().then(route);
    return;
  }
  const hash = location.hash || '#/';
  let m;
  if ((m = hash.match(/^#\/r\/(\d+)$/))) nav.current = roundView(Number(m[1]));
  else if (hash === '#/stats') nav.current = statsView();
  else nav.current = homeView();
  loadSide();
  nav.current.refresh();
}
window.addEventListener('hashchange', route);

function scheduleRefresh() {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => {
    nav.current?.refresh?.();
    loadSide();
  }, TIMING.refreshDebounceMs);
}
const es = new EventSource('/api/events');
es.onmessage = scheduleRefresh;
es.onopen = scheduleRefresh;
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) scheduleRefresh();
});

// ---------- Start ----------
document.getElementById('logo').innerHTML = BOT_SVG;
setMe(me);
route();
