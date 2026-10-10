import test from 'node:test';
import assert from 'node:assert/strict';
import { isValidDate, addDays, taiwanToday, weekDates, monthCells } from '../src/dates.js';

test('accepts inclusive bounds but rejects malformed, nonexistent and out-of-range dates', () => {
  for (const value of ['1900-01-01', '2100-12-31', '2024-02-29']) assert.equal(isValidDate(value), true);
  for (const value of ['', null, '2026-2-01', '2025-02-29', '1900-02-29', '2100-02-29', '2026-04-31', '1899-12-31', '2101-01-01']) assert.equal(isValidDate(value), false);
});
test('adds calendar days without DST or leap-year errors and refuses crossing bounds', () => {
  assert.equal(addDays('2024-02-28', 2), '2024-03-01');
  assert.equal(addDays('2025-02-28', 1), '2025-03-01');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('1900-01-01', -1), null);
  assert.equal(addDays('2100-12-31', 1), null);
  assert.throws(() => addDays('2026-02-30', 1));
});
test('Taiwan today changes at UTC 16:00 regardless of host timezone', () => {
  assert.equal(taiwanToday(new Date('2026-10-10T15:59:59Z')), '2026-10-10');
  assert.equal(taiwanToday(new Date('2026-10-10T16:00:00Z')), '2026-10-11');
});
test('week starts Monday and clamps to the supported range', () => {
  assert.deepEqual(weekDates('2026-10-10'), ['2026-10-05','2026-10-06','2026-10-07','2026-10-08','2026-10-09','2026-10-10','2026-10-11']);
  assert.equal(weekDates('2100-12-31').at(-1), '2100-12-31');
});
test('month cells have Monday alignment and do not expose unsupported dates', () => {
  const cells = monthCells('2026-10-10');
  assert.equal(cells[0], '2026-09-28');
  assert.equal(cells.length, 35);
  assert.equal(cells.at(-1), '2026-11-01');
  assert.equal(monthCells('2100-12-31').filter(Boolean).at(-1), '2100-12-31');
});
