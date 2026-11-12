import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fmtRemaining, genitive, payHref, joinList } from '../public/format.js';
import { isCurrentRound } from '../public/group.js';

const MIN = 60000;

test('fmtRemaining: Minuten, Sekunden erst in den letzten 3 Minuten', () => {
  assert.equal(fmtRemaining(28 * MIN + 10000), '29 min');
  assert.equal(fmtRemaining(3 * MIN), '3 min');
  assert.equal(fmtRemaining(3 * MIN - 1000), '02:59');
  assert.equal(fmtRemaining(2 * MIN), '02:00');
  assert.equal(fmtRemaining(5000), '00:05');
  assert.equal(fmtRemaining(-5), '00:00');
  assert.equal(fmtRemaining(3 * 60 * MIN + 49 * MIN + 55000), '3:50 h');
  assert.equal(fmtRemaining(60 * MIN), '1:00 h');
});

test('genitive: Apostroph bei Namen auf s/ß/x/z, sonst s', () => {
  assert.equal(genitive('maria', 'de'), 'marias');
  assert.equal(genitive('Klaus', 'de'), 'Klaus’');
  assert.equal(genitive('Max', 'de'), 'Max’');
  assert.equal(genitive('Moritz', 'de'), 'Moritz’');
  assert.equal(genitive('Voß', 'de'), 'Voß’');
  assert.equal(genitive('SCHULZ', 'de'), 'SCHULZ’');
  assert.equal(genitive('Anna', 'en'), 'Anna’s');
  assert.equal(genitive('James', 'en'), 'James’');
});

test('isCurrentRound: offen oder heute angelegt', () => {
  const now = new Date(2026, 10, 7, 14).getTime();
  const at = (d, h) => new Date(2026, 10, d, h).getTime();
  assert.equal(isCurrentRound({ locked: false, created_at: at(1, 9) }, now), true);
  assert.equal(isCurrentRound({ locked: true, created_at: at(7, 9) }, now), true);
  assert.equal(isCurrentRound({ locked: true, created_at: at(6, 23) }, now), false);
});

import { medianMinutes } from '../public/format.js';

test('medianMinutes: Median in ganzen Minuten, leer = null', () => {
  assert.equal(medianMinutes([]), null);
  assert.equal(medianMinutes([40 * MIN]), 40);
  assert.equal(medianMinutes([50 * MIN, 30 * MIN, 40 * MIN]), 40);
  assert.equal(medianMinutes([30 * MIN, 41 * MIN]), 36);
});

import { pendingRound } from '../public/group.js';

test('pendingRound: offen oder geschlossen-unbestellt (12 h) blockiert, bestellt nicht', () => {
  const now = Date.now();
  const mk = (o) => ({ id: 1, restaurant: 'Pizza Roma', locked: false, ordered: false, created_at: now - 60000, ...o });
  assert.equal(pendingRound([mk({})], ' pizza  roma ', now, 12).id, 1);
  assert.equal(pendingRound([mk({ locked: true, ordered: true })], 'Pizza Roma', now, 12), null);
  assert.equal(pendingRound([mk({ locked: true })], 'Pizza Roma', now, 12).id, 1);
  assert.equal(pendingRound([mk({ locked: true, created_at: now - 13 * 3600000 })], 'Pizza Roma', now, 12), null);
  assert.equal(pendingRound([mk({})], 'Burger', now, 12), null);
  assert.equal(pendingRound([mk({})], '', now, 12), null);
});

test('payHref: PayPal-Name/-Link, Betrag optional, sonst kein Link', () => {
  assert.equal(payHref('alex', 1250), 'https://paypal.me/alex/12.50EUR');
  assert.equal(payHref('https://paypal.me/alex/', 500), 'https://paypal.me/alex/5.00EUR');
  assert.equal(payHref('paypal.me/alex'), 'https://paypal.me/alex', 'ohne Betrag nur die Adresse');
  assert.equal(payHref('paypal.me/alex', 0), 'https://paypal.me/alex');
  assert.equal(payHref('DE12 3456 7890'), null, 'keine PayPal-Adresse');
  assert.equal(payHref(''), null);
});

test('joinList: Komma-Liste mit „und“ vor dem letzten Eintrag', () => {
  assert.equal(joinList([], 'und'), '');
  assert.equal(joinList(['A'], 'und'), 'A');
  assert.equal(joinList(['A', 'B'], 'und'), 'A und B');
  assert.equal(joinList(['darkc', 'mister H', 'David'], 'und'), 'darkc, mister H und David');
  assert.equal(joinList(['A', 'B', 'C'], 'and'), 'A, B and C');
});
