import { backup, state, sameFields } from './schema.js';
export const MAX_BACKUP_BYTES = 5 * 1024 * 1024;
export function assertBackupSize(raw, message = '備份檔不得超過 5 MB。') {
  if (typeof raw !== 'string' || raw.length > MAX_BACKUP_BYTES || new TextEncoder().encode(raw).length > MAX_BACKUP_BYTES) throw new Error(message);
}
export function serializeBackup(value) {
  const message = '備份超過 5 MiB，未產生下載檔案。原資料仍保留；請先整理記事與草稿後再重試。';
  let stringBytes = 0;
  // Stop large exports before building the full JSON; strings alone are a lower
  // bound. The final check also counts indentation, keys and punctuation.
  const raw = JSON.stringify(value, (_key, item) => {
    if (typeof item === 'string') {
      stringBytes += new TextEncoder().encode(JSON.stringify(item)).length;
      if (stringBytes > MAX_BACKUP_BYTES) throw new Error(message);
    }
    return item;
  }, 2);
  assertBackupSize(raw, message);
  return raw;
}
export function parseBackup(raw) {
  assertBackupSize(raw);
  let value;
  try { value = JSON.parse(raw); } catch { throw new Error('無法讀取 JSON 備份，請確認檔案完整。'); }
  return backup(value);
}
export function makeBackup(current) {
  const data = state(current);
  const result = backup({ app: 'cat-days', version: 1, exportedAt: new Date().toISOString(), notes: data.notes, drafts: data.drafts });
  serializeBackup(result);
  return result;
}
export function mergeBackup(current, incoming, newId = () => crypto.randomUUID()) {
  const merged = state(current), source = backup(incoming);
  const counts = { notes: { added: 0, skipped: 0, conflicts: 0 }, drafts: { added: 0, skipped: 0, conflicts: 0 } };
  const map = new Map();
  const noteIds = new Set(source.notes.map(n => n.id));
  const draftIds = new Set(source.drafts.map(d => d.id));
  // Explicitly distinct records inside the incoming file must stay distinct,
  // even if an imported copy later acquired the same text as its original.
  const relatedTo = (items, item, incomingIds) => items.filter(n => n.id === item.id || (n.originId === item.id && !incomingIds.has(n.id)));
  for (const item of source.notes) {
    const related = relatedTo(merged.notes, item, noteIds);
    const match = related.find(n => sameFields(n, item));
    if (match) { counts.notes.skipped++; map.set(item.id, match.id); continue; }
    const collision = merged.notes.some(n => n.id === item.id);
    const added = collision ? { ...item, id: newId(), originId: item.id } : { ...item };
    merged.notes.push(added); map.set(item.id, added.id);
    counts.notes.added++; if (collision) counts.notes.conflicts++;
  }
  for (const item of source.drafts) {
    const noteId = item.noteId ? map.get(item.noteId) || item.noteId : null;
    const related = relatedTo(merged.drafts, item, draftIds);
    if (related.some(d => sameFields(d, item) && d.noteId === noteId)) { counts.drafts.skipped++; continue; }
    const preserveId = item.slot === 'recovery' && !merged.drafts.some(d => d.id === item.id);
    merged.drafts.push({ ...item, id: preserveId ? item.id : newId(), slot: 'recovery', noteId, originId: preserveId ? item.originId || item.id : item.id });
    counts.drafts.added++; if (related.length) counts.drafts.conflicts++;
  }
  return { revision: current.revision, state: state(merged), counts };
}
