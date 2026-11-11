import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupHistory } from '../public/group.js';

const at = (y, m, d) => new Date(y, m - 1, d, 12).getTime();
const now = at(2026, 11, 7);

test('groupHistory: Monate für die letzten 12 Monate, danach Jahre, neueste zuerst', () => {
  const rounds = [
    { id: 1, created_at: at(2024, 5, 3) },
    { id: 2, created_at: at(2026, 11, 2) },
    { id: 3, created_at: at(2025, 11, 30) },
    { id: 4, created_at: at(2025, 12, 15) },
    { id: 5, created_at: at(2026, 11, 5) },
    { id: 6, created_at: at(2024, 1, 9) },
  ];
  const g = groupHistory(rounds, now, 12);
  assert.deepEqual(
    g.map((x) => [x.kind, x.year, x.month, x.items.map((r) => r.id)]),
    [
      ['month', 2026, 10, [5, 2]],
      ['month', 2025, 11, [4]],
      ['year', 2025, null, [3]],
      ['year', 2024, null, [1, 6]],
    ]
  );
});

test('groupHistory: leere Liste', () => {
  assert.deepEqual(groupHistory([], now, 12), []);
});
