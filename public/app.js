// dinedock – Frontend (Vanilla JS, ES-Module, keine Build-Schritte)
// Einstieg: Name wählen, Router (#/ Start, #/new, #/r/<Nr>, #/all, #/stats), Live-Updates per SSE.
import { t } from '/i18n.js';
import { LIMITS, TIMING } from '/config.js';
import { app, h, me, setMe, nav, api, isGuest, homeName } from '/util.js';
import { isCurrentRound } from '/group.js';
import { loadSide } from '/side.js';
import { homeView } from '/views/home.js';
import { roundView } from '/views/round.js';
import { statsView } from '/views/stats.js';
import { allView } from '/views/all.js';

const whoBtn = document.getElementById('who');

function askName() {
  return new Promise((resolve) => {
    const known = h('datalist', { id: 'known-users' });
    api('GET', '/users').then((n) => known.replaceChildren(...n.map((x) => h('option', { value: x })))).catch(() => {});
    const input = h('input', { placeholder: t('Dein Name'), maxlength: LIMITS.userName, autofocus: true, value: me, list: 'known-users', autocomplete: 'off' });
    const done = (guest) => {
      if (!input.value.trim()) return input.focus();
      setMe(input.value, { guest });
      resolve();
    };
    const form = h(
      'form',
      {
        class: 'card',
        onsubmit: (e) => {
          e.preventDefault();
          done(false);
        },
      },
      h('h2', null, t('Wie heißt du?')),
      h('p', { class: 'muted' }, t('Der Name erscheint bei deinen Positionen. Gleicher Name = gleiche Person, bitte konsistent verwenden.')),
      h('div', { class: 'grow' }, input, known),
      h(
        'div',
        { class: 'form-actions', style: 'margin-top:10px; gap:8px; flex-wrap:wrap' },
        isGuest && homeName()
          ? h('button', { class: 'btn ghost', type: 'button', onclick: () => { setMe(homeName()); resolve(); } }, `${t('Zurück zu')} ${homeName()}`)
          : null,
        h('button', { class: 'btn ghost', type: 'button', title: t('Name gilt nur in diesem Tab, der gespeicherte Name des Rechners bleibt'), onclick: () => done(true) }, t('Nur in diesem Tab')),
        h('button', { class: 'btn', type: 'submit' }, t('Los'))
      )
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

// Start: die aktuelle Bestellung öffnen; gibt es keine, „Alle Bestellungen“; ganz ohne Bestellungen das Formular für eine neue.
function startView() {
  let view = null;
  return {
    async refresh() {
      if (view) return view.refresh();
      const rounds = (await api('GET', '/rounds').catch(() => [])) ?? [];
      if ((location.hash || '#/') !== '#/') return;
      const cur = rounds.filter((r) => isCurrentRound(r, Date.now()));
      const pick = cur.find((r) => !r.locked) ?? cur[0];
      if (pick) return location.replace(`#/r/${pick.id}`);
      if (rounds.length) return location.replace('#/all'); // nichts Aktuelles: Übersicht aller Bestellungen
      view = homeView();
      return view.refresh();
    },
    destroy() {
      view?.destroy?.();
    },
  };
}

function route() {
  nav.current?.destroy?.();
  nav.current = null;
  app.classList.remove('wide');
  if (!me) {
    askName().then(route);
    return;
  }
  const hash = location.hash || '#/';
  let m;
  if ((m = hash.match(/^#\/r\/(\d+)$/))) nav.current = roundView(Number(m[1]));
  else if (hash === '#/stats') nav.current = statsView();
  else if (hash === '#/all') nav.current = allView();
  else if (hash === '#/new') nav.current = homeView();
  else nav.current = startView();
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

// ---------- Handy-Menü (Sidebar als Drawer) ----------
const menuBtn = document.getElementById('menu');
const setNav = (open) => {
  document.body.classList.toggle('nav-open', open);
  menuBtn.setAttribute('aria-expanded', String(open));
};
menuBtn.addEventListener('click', () => setNav(!document.body.classList.contains('nav-open')));
document.getElementById('scrim').addEventListener('click', () => setNav(false));
document.getElementById('side').addEventListener('click', (e) => e.target.closest('a') && setNav(false));
window.addEventListener('hashchange', () => setNav(false));
document.addEventListener('keydown', (e) => e.key === 'Escape' && setNav(false));

// ---------- Start ----------
setMe(me, { guest: isGuest });
route();
