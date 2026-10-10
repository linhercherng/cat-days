import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore, KEY } from '../src/store.js';
import { parseBackup, makeBackup, mergeBackup } from '../src/backup.js';
const input = { date: '2026-10-10', text: '牛奶', mood: '', moodText: '' };
function fixture() {
  let raw = null, fail = false, id = 0, tick = 0;
  const storage = { getItem: () => raw, setItem: (_, value) => { if (fail) throw new Error('quota'); raw = value; } };
  const store = createStore(storage, { id: () => `id-${++id}`, now: () => new Date(Date.UTC(2026, 9, 10, 0, 0, tick++)).toISOString() });
  return { store, storage, raw: () => raw, fail: () => { fail = true; }, corrupt: value => { raw = value; } };
}
test('new browser starts empty; multiple notes, mood-only, edits, moves and deletion persist', async () => {
  const {store, storage} = fixture();
  assert.equal(store.read().notes.length, 0);
  const first = await store.saveNote(input);
  await store.saveNote({ ...input, text: '', mood: '😌' });
  assert.equal(createStore(storage).read().notes.length, 2);
  const changed = await store.saveNote({ ...input, date: '2026-10-11', text: '已買牛奶' }, first);
  assert.equal(changed.createdAt, first.createdAt);
  assert.equal(store.read().notes[0].date, '2026-10-11');
  await store.deleteNote(changed);
  assert.equal(store.read().notes.length, 1);
});
test('empty notes and invalid dates are rejected; write failure leaves original bytes unchanged', async () => {
  const f = fixture();
  await assert.rejects(f.store.saveNote({ ...input, text: ' ' }));
  await assert.rejects(f.store.saveNote({ ...input, date: '2025-02-29' }));
  await f.store.saveNote(input);
  const before = f.raw(); f.fail();
  await assert.rejects(f.store.saveNote(input), /儲存/);
  assert.equal(f.raw(), before);
});
test('drafts are separate; save clears only its matching draft and delete clears edit draft', async () => {
  const {store} = fixture();
  const note = await store.saveNote(input);
  const draft = await store.saveDraft({ ...input, text: '未完成', id: 'new', slot: 'new', noteId: null });
  await store.saveDraft({ ...input, id: `edit:${note.id}`, slot: 'edit', noteId: note.id });
  assert.equal(store.read().notes[0].text, '牛奶');
  await store.saveNote({ ...input, text: '完成' }, null, draft);
  assert.equal(store.read().drafts.length, 1);
  await store.deleteNote(note);
  assert.equal(store.read().drafts.length, 0);
});
test('fresh reads preserve other tabs; stale edits and drafts cannot overwrite newer data', async () => {
  const {store, storage} = fixture();
  const other = createStore(storage);
  const note = await store.saveNote(input);
  await other.saveNote({ ...input, text: '其他分頁' }, note);
  await assert.rejects(store.saveNote(input, note), /其他分頁/);
  await assert.rejects(store.deleteNote(note), /其他分頁/);
  const draft = await store.saveDraft({ ...input, id: 'new', slot: 'new', noteId: null });
  await other.saveDraft({ ...draft, text: '新草稿' }, draft);
  await assert.rejects(store.saveDraft({ ...draft, text: '舊草稿' }, draft), /其他分頁/);
  await store.saveNote(input);
  assert.equal(store.read().notes.length, 2);
});
test('corrupt storage is never silently replaced and blocked storage is reported', async () => {
  const f = fixture(); f.corrupt('{broken');
  await assert.rejects(f.store.saveNote(input), /損壞/);
  assert.equal(f.raw(), '{broken');
  assert.throws(() => createStore({ getItem() { throw new Error('denied'); } }).read(), /讀取/);
  assert.equal(KEY, 'cat-days:data:v1');
});
test('backup validates version, date, duplicate IDs, size and edit references before changing data', async () => {
  const {store} = fixture(); await store.saveNote(input);
  const backup = makeBackup(store.read());
  assert.equal(parseBackup(JSON.stringify(backup)).notes.length, 1);
  for (const value of [ { ...backup, version: 2 }, { ...backup, notes: [...backup.notes, ...backup.notes] }, { ...backup, notes: [{ ...backup.notes[0], date: '2100-02-29' }] }, { ...backup, drafts: [{ ...input, id: 'edit:x', slot: 'edit', noteId: 'x', updatedAt: backup.exportedAt }] } ]) assert.throws(() => parseBackup(JSON.stringify(value)));
  assert.throws(() => parseBackup('x'.repeat(5 * 1024 * 1024 + 1)));
});
test('restore round trip, conflicts preserve both, repeat import is idempotent, drafts are recovery copies', async () => {
  const a = fixture(), b = fixture();
  const note = await a.store.saveNote(input);
  await a.store.saveDraft({ ...input, text: '草稿', id: 'new', slot: 'new', noteId: null });
  const backup = makeBackup(a.store.read());
  let merge = mergeBackup(b.store.read(), backup);
  assert.equal(merge.counts.notes.added, 1);
  await b.store.restore(merge);
  assert.equal(b.store.read().notes[0].text, '牛奶');
  assert.equal(b.store.read().drafts[0].slot, 'recovery');
  const imported = b.store.read().notes[0];
  await b.store.saveNote({ ...input, text: '已改' }, imported);
  merge = mergeBackup(b.store.read(), backup);
  assert.equal(merge.counts.notes.conflicts, 1);
  await b.store.restore(merge);
  assert.equal(b.store.read().notes.length, 2);
  const repeat = mergeBackup(b.store.read(), backup);
  assert.equal(repeat.counts.notes.added, 0);
  assert.equal(repeat.counts.drafts.added, 0);
  assert.equal(note.id, imported.id);
});
test('restore checks stale preview and failed writes leave notes and drafts unchanged', async () => {
  const f = fixture(), donor = fixture(); await donor.store.saveNote(input);
  const backup = makeBackup(donor.store.read());
  const stale = mergeBackup(f.store.read(), backup);
  await f.store.saveNote({ ...input, text: '後來新增' });
  await assert.rejects(f.store.restore(stale), /重新預覽/);
  const fresh = mergeBackup(f.store.read(), backup), before = f.raw(); f.fail();
  await assert.rejects(f.store.restore(fresh));
  assert.equal(f.raw(), before);
});
test('an imported future timestamp can still be edited after a device clock rollback', async () => {
  const f = fixture();
  const future = { ...makeBackup(f.store.read()), notes: [{ ...input, id: 'future', createdAt: '2027-01-01T00:00:00.000Z', updatedAt: '2027-01-02T00:00:00.000Z' }] };
  await f.store.restore(mergeBackup(f.store.read(), future));
  const saved = await f.store.saveNote({ ...input, text: '可編輯' }, f.store.read().notes[0]);
  assert.ok(saved.updatedAt > future.notes[0].updatedAt);
});
test('empty date drafts preserve incomplete input; failed autosave and discard keep previous draft', async () => {
  const f = fixture();
  const d = await f.store.saveDraft({ ...input, date: '', text: '還沒選日期', id: 'new', slot: 'new', noteId: null });
  assert.equal(f.store.read().drafts[0].date, '');
  const before = f.raw(); f.fail();
  await assert.rejects(f.store.saveDraft({ ...d, text: '新輸入' }, d));
  await assert.rejects(f.store.discardDraft(d));
  assert.equal(f.raw(), before);
});
test('restore retains an active draft while importing different content as a recoverable copy', async () => {
  const f = fixture(), donor = fixture();
  await f.store.saveDraft({ ...input, id: 'new', slot: 'new', noteId: null });
  await donor.store.saveDraft({ ...input, text: '匯入', id: 'new', slot: 'new', noteId: null });
  await f.store.restore(mergeBackup(f.store.read(), makeBackup(donor.store.read())));
  assert.equal(f.store.read().drafts.find(d => d.id === 'new').text, '牛奶');
  assert.equal(f.store.read().drafts.filter(d => d.slot === 'recovery').length, 1);
});
test('a backup with existing imported copies preserves note IDs on a clean-device round trip', async () => {
  const a = fixture(), b = fixture();
  const original = await a.store.saveNote(input);
  const source = makeBackup(a.store.read());
  source.notes.push({ ...original, id: 'already-a-copy', text: '不同內容', originId: original.id });
  const merge = mergeBackup(b.store.read(), source);
  assert.equal(merge.counts.notes.conflicts, 0);
  assert.deepEqual(merge.state.notes, source.notes);
});
test('distinct notes and drafts in one backup are retained even when a copy was edited to identical content', async () => {
  const f = fixture();
  const first = await f.store.saveNote(input);
  const source = makeBackup(f.store.read());
  const copy = { ...first, id: 'copy', originId: first.id };
  const fresh = fixture();
  for (const notes of [[first, copy], [copy, first]]) {
    const result = mergeBackup(fresh.store.read(), { ...source, notes });
    assert.equal(result.state.notes.length, 2);
    assert.deepEqual(result.state.notes.map(n => n.id), notes.map(n => n.id));
  }
  const d = { ...input, id: 'new', slot: 'new', noteId: null, updatedAt: first.updatedAt };
  const drafts = [d, { ...d, id: 'draft-copy', slot: 'recovery', originId: 'new' }];
  const merged = mergeBackup(fresh.store.read(), { ...source, drafts });
  assert.equal(merged.state.drafts.length, 2);
  await fresh.store.restore(merged);
  const repeated = mergeBackup(fresh.store.read(), { ...source, drafts });
  assert.equal(repeated.counts.drafts.added, 0);
  assert.equal(repeated.counts.notes.added, 0);
});
