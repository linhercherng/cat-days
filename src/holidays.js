import { isValidDate, addDays, weekday } from './dates.js';
export const HOLIDAY_YEARS = [2025, 2026, 2027];
export function validateCatalog(data) {
  const invalid = () => { throw new Error('台灣節日資料格式不完整。'); };
  if (!data || data.version !== 1 || !data.days || !data.sources) invalid();
  let count = 0;
  for (const year of HOLIDAY_YEARS) {
    if (!data.sources[year]?.url?.startsWith('https://www.dgpa.gov.tw/')) invalid();
    for (let date = `${year}-01-01`; date <= `${year}-12-31`; date = addDays(date, 1)) {
      const row = data.days[date];
      if (!Array.isArray(row) || row.length !== 2 || ![0, 2].includes(row[0]) || typeof row[1] !== 'string' || row[1].length > 200) invalid();
      count++;
    }
  }
  if (Object.keys(data.days).length !== count) invalid();
  return data;
}
export function holidayInfo(data, date) {
  if (!isValidDate(date)) throw new Error('日期無效。');
  const weekend = '六日'.includes(weekday(date));
  if (!HOLIDAY_YEARS.includes(Number(date.slice(0, 4)))) return { available: false, weekend };
  if (!data) return { available: false, weekend, loading: true };
  const [off, description] = data.days[date];
  const kind = description.includes('補行上班') || (off === 0 && weekend) ? 'work'
    : description.includes('補假') ? 'replacement'
    : description ? 'holiday' : off === 2 ? (weekend ? 'weekend' : 'adjusted') : 'weekday';
  return { available: true, weekend, kind, description, off: off === 2 };
}
export async function loadHolidays() {
  const response = await fetch(new URL('../assets/holidays/taiwan.json', import.meta.url));
  if (!response.ok) throw new Error('台灣節日資料載入失敗。');
  return validateCatalog(await response.json());
}
