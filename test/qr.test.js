import { test } from 'node:test';
import assert from 'node:assert/strict';
import { qrMatrix, formatBits } from '../public/qr.js';

test('formatBits: ECC M, Maske 0 laut Norm-Tabelle', () => {
  assert.equal(formatBits(0).toString(2).padStart(15, '0'), '101010000010010');
});

test('qrMatrix: Größe nach Version, Suchmuster in drei Ecken', () => {
  const m = qrMatrix('https://paypal.me/x'); // 19 Byte -> Version 2
  assert.equal(m.length, 25);
  const finder = (x, y) => m[y][x] && m[y][x + 6] && m[y + 6][x] && m[y + 6][x + 6] && !m[y + 1][x + 1] && m[y + 3][x + 3];
  assert.ok(finder(0, 0) && finder(18, 0) && finder(0, 18));
  assert.equal(m[17][8], true); // dunkles Einzelmodul
});

test('qrMatrix: wächst mit dem Text, zu langer Text wirft', () => {
  assert.equal(qrMatrix('a'.repeat(60)).length, 33); // Version 4
  assert.throws(() => qrMatrix('a'.repeat(107)));
});
