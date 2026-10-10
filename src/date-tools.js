import { isValidDate, dateObject } from './dates.js';

export function findDate(date) {
  if (!isValidDate(date)) throw new Error('請選擇有效日期，範圍為 1900-01-01～2100-12-31。');
  return { date, month: `${date.slice(0, 7)}-01` };
}
export function intervalDays(start, end) {
  findDate(start); findDate(end);
  if (end < start) return { reversed: true };
  const elapsed = (dateObject(end).valueOf() - dateObject(start).valueOf()) / 86400000;
  return { reversed: false, elapsed, inclusive: elapsed + 1 };
}
