import { backup, state, sameFields } from './schema.js';
export const MAX_BACKUP_BYTES = 5 * 1024 * 1024;
export function parseBackup(raw) {
  if (typeof raw !== 'string' || new TextEncoder().encode(raw).length > MAX_BACKUP_BYTES) throw new Error('備份檔不得超過 5 MB。');
  let value;
  try { value = JSON.parse(raw); } catch { throw new Error('無法讀取 JSON 備份，請確認檔案完整。'); }
  return backup(value);
}
export function makeBackup(current) {
  const data = state(current);
  return backup({ app: 'cat-days', version: 1, exportedAt: new Date().toISOString(), notes: data.notes, drafts: data.drafts });
}
const root = item => item.originId || item.id;
export function mergeBackup(current, incoming, newId = () => crypto.randomUUID()) {
  const merged = state(current), source = backup(incoming);
  const counts = { notes: { added: 0, skipped: 0, conflicts: 0 }, drafts: { added: 0, skipped: 0, conflicts: 0 } };
  const map = new Map();
  for (const item of source.notes) {
    const related = merged.notes.filter(n => root(n) === root(item));
    const match = related.find(n => sameFields(n, item));
    if (match) { counts.notes.skipped++; map.set(item.id, match.id); continue; }
    const collision = merged.notes.some(n => n.id === item.id);
    const added = collision ? { ...item, id: newId(), originId: root(item) } : { ...item };
    merged.notes.push(added); map.set(item.id, added.id);
    counts.notes.added++; if (collision) counts.notes.conflicts++;
  }
  for (const item of source.drafts) {
    const noteId = item.noteId ? map.get(item.noteId) || item.noteId : null;
    const related = merged.drafts.filter(d => root(d) === root(item));
    if (related.some(d => sameFields(d, item) && d.noteId === noteId)) { counts.drafts.skipped++; continue; }
    merged.drafts.push({ ...item, id: newId(), slot: 'recovery', noteId, originId: root(item) });
    counts.drafts.added++; if (related.length) counts.drafts.conflicts++;
  }
  return { revision: current.revision, state: state(merged), counts };
}
