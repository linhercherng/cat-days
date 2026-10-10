import { isValidDate } from './dates.js';
export const MOODS = { '🙂': '開心', '😌': '平靜', '😐': '普通', '😔': '低落', '😣': '疲累' };
export const LIMIT = 5000;
export const MAX_TEXT = 20000;
function check(ok, message = '資料格式不正確。') { if (!ok) throw new Error(message); }
function record(value) { check(value && typeof value === 'object' && !Array.isArray(value)); }
function id(value, max = 256) { check(typeof value === 'string' && value.length > 0 && value.length <= max); return value; }
function text(value) { check(typeof value === 'string' && value.length <= MAX_TEXT, '文字不得超過 20,000 字。'); return value; }
function timestamp(value) { check(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString() === value); return value; }
export function fields(value, draft = false) {
  record(value);
  check(isValidDate(value.date) || (draft && value.date === ''), '日期必須有效，且介於 1900-01-01 與 2100-12-31。');
  check(value.mood === '' || Object.hasOwn(MOODS, value.mood), '心情表情不在支援清單內。');
  const result = { date: value.date, text: text(value.text), mood: value.mood, moodText: text(value.moodText) };
  check(draft || result.text.trim() || result.mood || result.moodText.trim(), '寫一點事情或心情，再儲存吧。');
  return result;
}
export function note(value) {
  const result = { id: id(value.id, 128), ...fields(value), createdAt: timestamp(value.createdAt), updatedAt: timestamp(value.updatedAt) };
  check(result.updatedAt >= result.createdAt);
  if (value.originId !== undefined) result.originId = id(value.originId, 128);
  return result;
}
export function draft(value) {
  record(value);
  check(['new', 'edit', 'recovery'].includes(value.slot));
  const result = { id: id(value.id), slot: value.slot, noteId: value.noteId === null ? null : id(value.noteId, 128), ...fields(value, true), updatedAt: timestamp(value.updatedAt) };
  check(value.slot !== 'new' || (value.id === 'new' && value.noteId === null));
  check(value.slot !== 'edit' || value.id === `edit:${value.noteId}`);
  if (value.originId !== undefined) result.originId = id(value.originId);
  return result;
}
export function collections(value) {
  record(value);
  const result = {};
  for (const [key, parse] of [['notes', note], ['drafts', draft]]) {
    check(Array.isArray(value[key]) && value[key].length <= LIMIT, '每種記錄最多 5,000 筆；請先備份並整理資料。');
    result[key] = value[key].map(parse);
    check(new Set(result[key].map(item => item.id)).size === result[key].length, '檔案有重複的記錄編號。');
  }
  for (const item of result.drafts) check(item.slot !== 'edit' || result.notes.some(n => n.id === item.noteId), '編輯草稿找不到對應記事。');
  return result;
}
export function emptyState() { return { app: 'cat-days', version: 1, revision: 0, notes: [], drafts: [], noticeShown: false }; }
export function state(value) {
  record(value);
  check(value.app === 'cat-days' && value.version === 1, '資料版本不支援。');
  check(Number.isSafeInteger(value.revision) && value.revision >= 0 && typeof value.noticeShown === 'boolean');
  return { app: 'cat-days', version: 1, revision: value.revision, ...collections(value), noticeShown: value.noticeShown };
}
export function backup(value) {
  record(value);
  check(value.app === 'cat-days' && value.version === 1, '這不是支援的貓咪手帳 V1 備份。');
  return { app: 'cat-days', version: 1, exportedAt: timestamp(value.exportedAt), ...collections(value) };
}
export function sameFields(a, b) { return ['date', 'text', 'mood', 'moodText'].every(key => a[key] === b[key]); }
