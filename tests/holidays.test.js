import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateCatalog, holidayInfo } from '../src/holidays.js';
const catalog = JSON.parse(readFileSync(new URL('../assets/holidays/taiwan.json', import.meta.url)));

test('all 1095 dates match official CSV status, weekday and note, including latest 2025 revisions', () => {
  validateCatalog(catalog);
  let count = 0;
  for (const year of [2025, 2026, 2027]) {
    const bytes = readFileSync(new URL(`../assets/holidays/source/${year}.csv`, import.meta.url));
    const text = new TextDecoder(year === 2025 ? 'big5' : 'utf-8').decode(bytes).replace(/^\uFEFF/, '');
    const rows = text.trim().split(/\r?\n/).slice(1);
    for (const row of rows) {
      const [raw, weekday, off, note] = row.split(',');
      const date = `${raw.slice(0,4)}-${raw.slice(4,6)}-${raw.slice(6)}`;
      assert.equal('日一二三四五六'[new Date(`${date}T00:00:00Z`).getUTCDay()], weekday);
      assert.deepEqual(catalog.days[date], [Number(off), note]); count++;
    }
  }
  assert.equal(count, 1095);
  assert.equal(Object.keys(catalog.days).length, 1095);
});
test('distinguishes holiday, replacement leave, adjusted work, ordinary weekends and absent years', () => {
  assert.equal(holidayInfo(catalog, '2025-02-08').kind, 'work');
  assert.equal(holidayInfo(catalog, '2026-10-09').kind, 'replacement');
  assert.equal(holidayInfo(catalog, '2026-10-10').kind, 'holiday');
  assert.equal(holidayInfo(catalog, '2026-05-01').kind, 'holiday');
  assert.equal(holidayInfo(catalog, '2025-05-01').kind, 'weekday');
  assert.equal(holidayInfo(catalog, '2027-12-31').kind, 'replacement');
  assert.equal(holidayInfo(catalog, '2026-10-11').kind, 'weekend');
  assert.equal(holidayInfo(catalog, '2024-02-29').available, false);
  assert.throws(() => holidayInfo(catalog, '2025-02-29'));
});
test('rejects incomplete or corrupt holiday files instead of claiming no holiday', () => {
  const missing = structuredClone(catalog); delete missing.days['2026-01-02'];
  assert.throws(() => validateCatalog(missing));
  const invalid = structuredClone(catalog); invalid.days['2026-01-02'][0] = 1;
  assert.throws(() => validateCatalog(invalid));
});
