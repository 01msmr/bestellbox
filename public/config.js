// Zentrale Werte – von Server (db.js, server.js) und Frontend gemeinsam genutzt.
// Hinweis: Fehlermeldungen in db.js nennen Grenzen im Text („1–240 Minuten“); bei Änderung dort und in i18n.js mitziehen.

/** Grenzen für Eingaben (Zeichen, Anzahl, Minuten, Euro). */
export const LIMITS = {
  userName: 32,
  restaurantName: 80,
  restaurantUrl: 300,
  restaurantPhone: 40,
  article: 80,
  variant: 80,
  paypal: 120,
  qtyMin: 1,
  qtyMax: 99,
  deadlineMinMinutes: 1,
  deadlineMaxMinutes: 240,
  extendMaxMinutes: 120,
  priceMaxEuro: 1000,
  feeMaxEuro: 100,
  requestBodyBytes: 64 * 1024,
};

/** Voreinstellungen. */
export const DEFAULTS = {
  deadlineMinutes: 20,
  extendMinutes: 5,
};

/** Listen und Auswertungen. */
export const LISTS = {
  rounds: 60, // Bestellungen in Sidebar/Startseite
  closedShown: 10, // abgeschlossene Bestellungen in den Listen
  statsLast: 30, // „letzte N Bestellungen“ in der Statistik
  catalogMax: 300, // Katalogeinträge je Restaurant
  catalogMinUses: 2, // ab so vielen Bestellungen wird ein Artikel vorgeschlagen
  suggestMax: 5, // Vorschläge im Eingabefeld
};

/** Zeiten in Millisekunden. */
export const TIMING = {
  toastMs: 2600,
  refreshDebounceMs: 150,
  tickMs: 1000,
  lowTimeMs: 2 * 60 * 1000, // darunter wird der Countdown rot
  sseHeartbeatMs: 25000,
  sseRetryMs: 2000,
};
