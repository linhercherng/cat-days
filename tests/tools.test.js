import test from 'node:test';
import assert from 'node:assert/strict';
import { findDate, intervalDays } from '../src/date-tools.js';

test('date lookup returns the exact day and its month, with strict range validation', () => {
  assert.deepEqual(findDate('2024-02-29'), { date: '2024-02-29', month: '2024-02-01' });
  for (const date of ['', '2025-02-29', '2100-02-29', '1899-12-31', '2101-01-01']) assert.throws(() => findDate(date));
  assert.equal(findDate('1900-01-01').date, '1900-01-01');
  assert.equal(findDate('2100-12-31').date, '2100-12-31');
});
test('interval counts endpoints explicitly across leaps, years and DST', () => {
  for (const [start, end, expected] of [
    ['2026-10-10','2026-10-10',0], ['2024-02-28','2024-03-01',2],
    ['2025-02-28','2025-03-01',1], ['2026-12-31','2027-01-01',1],
    ['2026-03-07','2026-03-09',2], ['1900-01-01','2100-12-31',73413],
  ]) assert.deepEqual(intervalDays(start, end), { reversed: false, elapsed: expected, inclusive: expected + 1 });
  assert.deepEqual(intervalDays('2026-10-11','2026-10-10'), { reversed: true });
  assert.throws(() => intervalDays('', '2026-10-10'));
  assert.throws(() => intervalDays('2026-10-10', '2100-02-29'));
});
