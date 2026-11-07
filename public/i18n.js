// Mini-i18n: Der deutsche Text ist der Schlüssel, nur Englisch wird übersetzt.
// Sprache: Auswahl im ◐-Panel (auto | de | en); „auto“ folgt der Browsersprache (de → Deutsch, sonst Englisch).
const EN = {
  // Allgemein / Namensabfrage
  'Name wählen': 'Choose name',
  'Dein Name': 'Your name',
  'Wie heißt du?': 'What is your name?',
  'Der Name erscheint bei deinen Positionen. Gleicher Name = gleiche Person, bitte konsistent verwenden.':
    'Your name appears on your items. Same name = same person, please use it consistently.',
  'Los': 'Go',
  // Neue Runde / Übersicht
  'keine Telefonnummer': 'no phone number',
  'z. B. Pizza Roma': 'e.g. Pizza Roma',
  'paypal.me/name oder E-Mail': 'paypal.me/name or email',
  'Telefon': 'Phone',
  'Webadresse': 'Website',
  'Lieferkosten (€)': 'Delivery fee (€)',
  'Bestellt von': 'Ordered by',
  'PayPal (Adresse/Link)': 'PayPal (address/link)',
  'Frist (Minuten)': 'Deadline (minutes)',
  'Runde starten': 'Start round',
  '💸 Unbezahlte Runden': '💸 Unpaid rounds',
  'Neue Runde': 'New round',
  'Laufende Runden': 'Open rounds',
  'Letzte Runden': 'Recent rounds',
  'Keine laufende Runde.': 'No open round.',
  'Noch nichts abgeschlossen.': 'Nothing finished yet.',
  'bestellt von': 'ordered by',
  'fertig': 'done',
  'unbezahlt': 'unpaid',
  'noch': 'left:',
  'abgelaufen': 'expired',
  'gesperrt': 'locked',
  // Eingabe
  'Artikel': 'Item',
  'z. B. 26 cm, Fladenbrot, scharf': 'e.g. 26 cm, flatbread, spicy',
  'Preis €': 'Price €',
  'Hinzufügen': 'Add',
  'Artikel eintragen': 'Add item',
  'Variante (optional)': 'Variant (optional)',
  'Preis': 'Price',
  'Menge': 'Qty',
  '⚠ Preis selbst prüfen. ': '⚠ Check the price yourself. ',
  'Du bist für deine Angaben verantwortlich. Vorgeschlagene Preise stammen aus früheren Bestellungen und können veraltet oder falsch sein.':
    'You are responsible for your entries. Suggested prices come from earlier orders and may be outdated or wrong.',
  'zuletzt {p} (ungeprüft) – übernehmen': 'last {p} (unverified) – use it',
  'Preis weicht ab – zuletzt {p}': 'Price differs – last {p}',
  // Runde
  'Nach Usern': 'By user',
  'Meine': 'Mine',
  'Bestellen': 'Order',
  '✓ fertig': '✓ done',
  'in Arbeit': 'in progress',
  '✓ bezahlt': '✓ paid',
  'nicht bezahlt': 'not paid',
  'Umschalten': 'Toggle',
  '← Alle Runden': '← All rounds',
  'Gestartet {date} von {creator} · bestellt von ': 'Started {date} by {creator} · ordered by ',
  ' · Lieferkosten: {fee}': ' · Delivery fee: {fee}',
  'Runde bearbeiten': 'Edit round',
  'Speichern': 'Save',
  'Bestellfrist abgelaufen – Runde gesperrt': 'Deadline passed – round locked',
  'Bestellfrist': 'Order deadline',
  'Jetzt sperren': 'Lock now',
  'Wieder öffnen': 'Reopen',
  'GESPERRT': 'LOCKED',
  'Noch keine Bestellungen – trag deine ein.': 'No orders yet – add yours.',
  '⚠ Noch nicht alle fertig ({done}/{total}): {names}': '⚠ Not everyone is done yet ({done}/{total}): {names}',
  '✓ Alle fertig ({total}/{total}) – kann bestellt werden': '✓ Everyone is done ({total}/{total}) – ready to order',
  '💸 Runde unbezahlt: {sum} offen ({names})': '💸 Round unpaid: {sum} open ({names})',
  'Noch niemand dabei.': 'Nobody yet.',
  ' (Besteller)': ' (buyer)',
  'noch nichts': 'nothing yet',
  'Lieferanteil': 'delivery share',
  'Meine Bestellung': 'My order',
  'Runde ist gesperrt.': 'Round is locked.',
  'Noch nichts eingetragen.': 'Nothing added yet.',
  'Entfernen': 'Remove',
  'Fertig = deine Bestellung ist komplett. Bezahlt = du hast dem Besteller dein Geld gegeben.':
    'Done = your order is complete. Paid = you have given the buyer your money.',
  // Bestellen
  'Sammelbestellung': 'Combined order',
  'Einzel': 'Each',
  'Summe': 'Total',
  'Summe Artikel': 'Items total',
  'Bestellung': 'Order',
  'Lieferkosten': 'Delivery fee',
  'Gesamt': 'Grand total',
  'Noch keine Positionen.': 'No items yet.',
  '⚠ Preise sind Angaben der User und nicht geprüft. ': '⚠ Prices are entered by users and not verified. ',
  'Vor dem Bestellen mit der Karte abgleichen.': 'Check against the menu before ordering.',
  '⚠ Preis prüfen – zuletzt {p}': '⚠ Check price – last {p}',
  'Bestelltext kopiert': 'Order text copied',
  'Kopieren nicht möglich': 'Copying not possible',
  'Text kopieren': 'Copy text',
  'Anrufen': 'Call',
  // Offene Beträge
  'Offene Beträge': 'Open amounts',
  'Offene Beträge (vorläufig)': 'Open amounts (preliminary)',
  '✓ Alles bezahlt': '✓ All paid',
  'bezahlt': 'paid',
  '💳 Bezahlen an {buyer}': '💳 Pay {buyer}',
  'PayPal-Adresse ist nur für Teilnehmer der Runde sichtbar.': 'The PayPal address is only visible to participants of the round.',
  'Keine PayPal-Adresse hinterlegt.': 'No PayPal address set.',
  'Kopieren': 'Copy',
  'Adresse kopiert': 'Address copied',
  'Du bist Besteller – die anderen zahlen an dich.': 'You are the buyer – the others pay you.',
  '✓ Du hast bezahlt': '✓ You have paid',
  '{amount} per PayPal zahlen': 'Pay {amount} via PayPal',
  'Dein Betrag: {amount}': 'Your amount: {amount}',
  '← Zurück': '← Back',
  // Statistik
  'Statistik': 'Statistics',
  'Letzte 30 Bestellungen': 'Last 30 orders',
  'Alle': 'All',
  'Noch keine Daten.': 'No data yet.',
  'Runden': 'Rounds',
  'Ø Preis Artikel': 'Ø item price',
  'Ø Bestellung/User': 'Ø order/user',
  'Beliebtestes Gericht': 'Most popular dish',
  // Kopfzeile / Darstellung
  'Username ändern': 'Change username',
  'Darstellung': 'Appearance',
  'Modus': 'Mode',
  'Farbe': 'Colour',
  'Sprache': 'Language',
  'Hell': 'Light',
  'Dunkel': 'Dark',
  'S/W': 'B/W',
  'Beere': 'Berry',
  // Fehlermeldungen des Servers
  'Username fehlt oder ist zu lang (max. 32)': 'Username missing or too long (max. 32)',
  'Restaurantname fehlt oder ist zu lang': 'Restaurant name missing or too long',
  'Ablaufzeit 1–240 Minuten': 'Deadline 1–240 minutes',
  'Nur Ersteller, Besteller oder Admins': 'Only creator, buyer or admins',
  'Verlängerung 1–120 Minuten': 'Extension 1–120 minutes',
  'Unbekannte Aktion': 'Unknown action',
  'Artikel fehlt oder ist zu lang': 'Item missing or too long',
  'Menge 1–99': 'Quantity 1–99',
  'Ungültiger Betrag': 'Invalid amount',
  'Runde ist gesperrt': 'Round is locked',
  'Position nicht gefunden': 'Item not found',
  'Nur eigene Positionen': 'Only your own items',
  'Runde nicht gefunden': 'Round not found',
  'Nur für sich selbst (oder als Ersteller/Besteller/Admin)': 'Only for yourself (or as creator/buyer/admin)',
  'Nicht gefunden': 'Not found',
  'Zu groß': 'Too large',
  'Ungültiges JSON': 'Invalid JSON',
  'Methode nicht erlaubt': 'Method not allowed',
  'Interner Fehler': 'Internal error',
};

function detect() {
  let v = null;
  try {
    v = localStorage.getItem('bb_lang');
  } catch {
    /* Speicher gesperrt */
  }
  if (v === 'de' || v === 'en') return v;
  return (navigator.language || 'de').toLowerCase().startsWith('de') ? 'de' : 'en';
}

export const lang = detect();
export const locale = lang === 'de' ? 'de-DE' : 'en-GB';

export function t(key, vars) {
  let s = lang === 'en' ? (EN[key] ?? key) : key;
  if (vars) s = s.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
  return s;
}

// Statische Texte in index.html: data-i18n="…", data-i18n-title="…"
document.documentElement.lang = lang;
for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
for (const el of document.querySelectorAll('[data-i18n-title]')) {
  const v = t(el.dataset.i18nTitle);
  el.title = v;
  el.setAttribute('aria-label', v);
}
