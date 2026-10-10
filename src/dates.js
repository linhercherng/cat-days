export const MIN_DATE = '1900-01-01';
export const MAX_DATE = '2100-12-31';
const DAY = 86400000;
export function isValidDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value < MIN_DATE || value > MAX_DATE) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}
export function dateObject(value) {
  if (!isValidDate(value)) throw new Error('日期必須介於 1900-01-01 與 2100-12-31。');
  return new Date(`${value}T00:00:00Z`);
}
export function addDays(value, count) {
  if (!Number.isInteger(count)) throw new Error('天數必須為整數。');
  const next = new Date(dateObject(value).valueOf() + count * DAY).toISOString().slice(0, 10);
  return isValidDate(next) ? next : null;
}
export function taiwanToday(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const get = type => parts.find(part => part.type === type).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}
export function weekDates(value) {
  const offset = (dateObject(value).getUTCDay() + 6) % 7;
  return Array.from({ length: 7 }, (_, index) => addDays(value, index - offset)).filter(Boolean);
}
export function monthCells(value) {
  const first = `${value.slice(0, 7)}-01`;
  const day = dateObject(first);
  const offset = (day.getUTCDay() + 6) % 7;
  const last = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth() + 1, 0)).getUTCDate();
  return Array.from({ length: Math.ceil((last + offset) / 7) * 7 }, (_, index) => addDays(first, index - offset));
}
export function weekday(value) { return '日一二三四五六'[dateObject(value).getUTCDay()]; }
export function dateLabel(value) { dateObject(value); return `${Number(value.slice(5, 7))} 月 ${Number(value.slice(8))} 日・星期${weekday(value)}`; }
