import { emptyState, state, note, draft, fields } from './schema.js';
export const KEY = 'cat-days:data:v1';
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const conflict = () => { throw new Error('其他分頁已修改這筆資料。請保留輸入，重新開啟確認後再操作。'); };
export function createStore(storage, options = {}) {
  const now = options.now || (() => new Date().toISOString());
  const id = options.id || (() => crypto.randomUUID());
  const lock = options.lock || (async task => task());
  function read() {
    let raw;
    try { raw = storage.getItem(KEY); } catch { throw new Error('無法讀取瀏覽器儲存空間；請檢查瀏覽器設定。輸入仍可複製。'); }
    if (raw === null) return emptyState();
    try { return state(JSON.parse(raw)); } catch { throw new Error('本機資料損壞或版本不支援，已停止寫入。請到資料與備份下載原始資料。'); }
  }
  async function transaction(change) {
    return lock(() => {
      const current = read();
      const result = change(current);
      current.revision += 1;
      const next = state(current);
      try { storage.setItem(KEY, JSON.stringify(next)); } catch { throw new Error('儲存失敗，可能是空間不足或瀏覽器禁止保存。內容尚未儲存，請複製文字或下載備份。'); }
      return result;
    });
  }
  const removeDraft = (s, expected) => {
    if (!expected) return;
    const current = s.drafts.find(d => d.id === expected.id);
    if (!same(current, expected)) conflict();
    s.drafts = s.drafts.filter(d => d.id !== expected.id);
  };
  return {
    read,
    raw() { return storage.getItem(KEY); },
    saveNote(input, expected = null, expectedDraft = null) {
      return transaction(s => {
        const content = fields(input);
        let saved;
        if (expected) {
          const index = s.notes.findIndex(n => n.id === expected.id);
          if (!same(s.notes[index], expected)) conflict();
          saved = note({ ...expected, ...content, updatedAt: now() });
          s.notes[index] = saved;
        } else {
          const at = now();
          saved = note({ id: id(), ...content, createdAt: at, updatedAt: at });
          s.notes.push(saved);
        }
        removeDraft(s, expectedDraft);
        s.noticeShown = true;
        return saved;
      });
    },
    deleteNote(expected) {
      return transaction(s => {
        if (!same(s.notes.find(n => n.id === expected.id), expected)) conflict();
        s.notes = s.notes.filter(n => n.id !== expected.id);
        s.drafts = s.drafts.filter(d => !(d.slot === 'edit' && d.noteId === expected.id));
      });
    },
    saveDraft(input, expected = null) {
      return transaction(s => {
        if (!same(s.drafts.find(d => d.id === input.id), expected)) conflict();
        const saved = draft({ ...input, updatedAt: now() });
        s.drafts = s.drafts.filter(d => d.id !== saved.id);
        s.drafts.push(saved);
        return saved;
      });
    },
    discardDraft(expected) { return transaction(s => removeDraft(s, expected)); },
    restore(preview) {
      return transaction(s => {
        if (s.revision !== preview.revision) throw new Error('預覽後資料已有變動，請重新預覽備份。');
        const next = state(preview.state);
        s.notes = next.notes;
        s.drafts = next.drafts;
      });
    }
  };
}
