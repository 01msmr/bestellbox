// Zentrale Werte – von Server (db.js, server.js) und Frontend gemeinsam genutzt.
// Hinweis: Fehlermeldungen in db.js nennen Grenzen im Text („1–240 Minuten“); bei Änderung dort und in i18n.js mitziehen.

/** Grenzen für Eingaben (Zeichen, Anzahl, Minuten, Euro). */
export const LIMITS = {
  userName: 32,
  restaurantName: 80,
  restaurantUrl: 300,
  restaurantPhone: 40,
  restaurantAddress: 160,
  article: 80,
  variant: 80,
  paypal: 120,
  qtyMin: 1,
  qtyMax: 10,
  deadlineMinMinutes: 1,
  deadlineMaxMinutes: 240,
  extendMaxMinutes: 120,
  etaMaxMinutes: 240,
  unorderedBlockHours: 12, // geschlossen, aber nicht bestellt: blockiert neue Bestellung so lange
  priceMaxEuro: 1000,
  feeMaxEuro: 100,
  requestBodyBytes: 64 * 1024,
};

/** Voreinstellungen. */
export const DEFAULTS = {
  deadlineMinutes: 20,
  extendMinutes: 5,
  etaMinutes: 40, // vorbelegte geschätzte Lieferzeit
};

/** Listen und Auswertungen. */
export const LISTS = {
  rounds: 60, // Bestellungen in Sidebar/Startseite
  closedShown: 10, // abgeschlossene Bestellungen auf der Startseite (mobil)
  sideWeeks: 12, // Zeitraum abgeschlossener Bestellungen in der Sidebar
  historyMonths: 12, // so viele Monate einzeln gruppiert, ältere je Jahr
  statsLast: 30, // „letzte N Bestellungen“ in der Statistik
  catalogMax: 300, // Katalogeinträge je Restaurant
  catalogMinUses: 2, // ab so vielen Bestellungen wird ein Artikel vorgeschlagen
  deliveryStatsLast: 10, // so viele letzte Lieferungen bilden die statistische Lieferzeit
  suggestMax: 5, // Vorschläge im Eingabefeld
};

/** Zeiten in Millisekunden. */
export const TIMING = {
  toastMs: 2600,
  confirmMs: 4000, // so lange bleibt die Rückfrage „ist bezahlt?“ im Button
  undoMs: 15 * 1000, // so lange bleibt „Rückgängig“ nach dem Löschen einer Zeile
  refreshDebounceMs: 150,
  tickMs: 1000,
  lowTimeMs: 2 * 60 * 1000, // darunter wird der Countdown rot
  editRevertMs: 30 * 1000, // ungespeicherte Änderung im Bestellkopf wird danach zurückgenommen
  editWarnMs: 10 * 1000, // so lange läuft der Warnbalken rückwärts
  barTickMs: 100,
  showSecondsMs: 3 * 60 * 1000, // Sekunden erst in den letzten 3 Minuten
  sseHeartbeatMs: 25000,
  sseRetryMs: 2000,
};
