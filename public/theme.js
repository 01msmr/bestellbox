// Darstellung: Modus (auto | light | dark), Farbthema (mono | ozean | gruen | orange | mais) und Sprache (auto | de | en).
// Wird synchron im <head> geladen, damit beim Laden nichts aufblitzt.
(() => {
  const root = document.documentElement;
  const MODES = ['auto', 'light', 'dark'];
  const THEMES = ['mono', 'ozean', 'gruen', 'orange', 'mais'];
  const LANGS = ['auto', 'de', 'en'];
  const read = (k, allowed, fallback) => {
    try {
      const v = localStorage.getItem(k);
      return allowed.includes(v) ? v : fallback;
    } catch {
      return fallback;
    }
  };
  const save = (k, v) => {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* Speicher gesperrt – Einstellung gilt nur für diese Sitzung */
    }
  };

  let mode = read('bb_mode', MODES, 'auto');
  let theme = read('bb_theme', THEMES, 'mono');
  let lang = read('bb_lang', LANGS, 'auto');
  const apply = () => {
    root.dataset.mode = mode; // auto = folgt dem System via color-scheme: light dark
    root.dataset.theme = theme;
  };
  apply();

  document.addEventListener('DOMContentLoaded', () => {
    const panel = document.getElementById('look');
    if (!panel) return;
    const sync = () => {
      for (const b of panel.querySelectorAll('[data-mode]')) b.setAttribute('aria-pressed', String(b.dataset.mode === mode));
      for (const b of panel.querySelectorAll('[data-theme]')) b.setAttribute('aria-pressed', String(b.dataset.theme === theme));
      for (const b of panel.querySelectorAll('[data-lang]')) b.setAttribute('aria-pressed', String(b.dataset.lang === lang));
    };
    // Ein Klick schaltet die Gruppe auf den nächsten Zustand weiter; sichtbar ist nur der aktive
    const next = (list, cur) => list[(list.indexOf(cur) + 1) % list.length];
    panel.addEventListener('click', (e) => {
      const kind = e.target.closest('.seg')?.dataset.cycle;
      if (kind === 'lang') {
        lang = next(LANGS, lang);
        save('bb_lang', lang);
        location.reload(); // Sprache wird beim Laden angewendet
        return;
      }
      if (kind === 'mode') {
        mode = next(MODES, mode);
        save('bb_mode', mode);
      } else if (kind === 'theme') {
        theme = next(THEMES, theme);
        save('bb_theme', theme);
      } else return;
      apply();
      sync();
    });
    sync();
  });
})();
