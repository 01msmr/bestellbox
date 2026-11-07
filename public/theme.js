// Darstellung: Modus (auto | light | dark) und Farbthema (mono | ozean | beere).
// Wird synchron im <head> geladen, damit beim Laden nichts aufblitzt.
(() => {
  const root = document.documentElement;
  const MODES = ['auto', 'light', 'dark'];
  const THEMES = ['mono', 'ozean', 'beere'];
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
    };
    panel.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.mode) {
        mode = b.dataset.mode;
        save('bb_mode', mode);
      } else if (b.dataset.theme) {
        theme = b.dataset.theme;
        save('bb_theme', theme);
      }
      apply();
      sync();
    });
    // Panel schließen bei Klick daneben / Escape
    document.addEventListener('click', (e) => {
      if (panel.open && !panel.contains(e.target)) panel.open = false;
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') panel.open = false;
    });
    sync();
  });
})();
