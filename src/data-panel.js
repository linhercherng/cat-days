import { $, el, link, button, download } from './dom.js';
import { makeBackup, parseBackup, mergeBackup, MAX_BACKUP_BYTES } from './backup.js';
export function createDataPanel(store, { ask, status }) {
  let generation = 0;
  function render() {
    const token = ++generation;
    const container = $('#data-content'); container.replaceChildren();
    const info = el('div', { class: 'data-card' }, el('h2', {}, '資料留在這裡'), el('p', {}, '記事與草稿只保存在目前瀏覽器／裝置，不會上傳或自動同步。清除網站資料、使用無痕模式或更換裝置，可能無法找回。'), el('p', {}, 'JSON 備份包含記事與草稿，沒有加密，請存放在自己的安全位置。還原舊備份可能重新加入曾經刪除的記事。'));
    container.append(info);
    let state;
    try { state = store.read(); }
    catch (e) {
      container.append(el('div', { class: 'data-card' }, el('h2', {}, '暫停資料操作'), el('p', { role: 'alert' }, e.message), button('下載本機原始資料', () => {
        try { const raw = store.raw(); if (raw === null) throw new Error('目前沒有可下載的資料。'); download(raw, 'cat-days-local-recovery.json', true); status('已產生原始資料檔，請保留供修復使用。'); } catch (err) { status(err.message); }
      }, 'primary')));
      return;
    }
    const exportCard = el('div', { class: 'data-card' }, el('h2', {}, '下載備份'), el('p', {}, `${state.notes.length} 筆記事 · ${state.drafts.length} 份草稿`), button('下載 JSON 備份', () => {
      try { download(makeBackup(store.read()), `cat-days-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`); status('備份檔已產生，請確認瀏覽器下載並保留檔案。'); } catch (e) { status(e.message); }
    }, 'primary'));
    const file = el('input', { id: 'backup-file', type: 'file', accept: '.json,application/json' });
    const preview = el('div', { id: 'restore-preview', 'aria-live': 'polite' });
    const importCard = el('div', { class: 'data-card' }, el('h2', {}, '還原備份'), el('p', {}, '先檢查、預覽，再確認合併。相同記事略過；衝突保留兩份並標示匯入副本。匯入草稿保留為可恢復副本，不覆蓋目前草稿。'), el('label', { for: 'backup-file', class: 'file-label' }, '選擇貓咪手帳 JSON 備份（最多 5 MB）'), file, preview);
    file.addEventListener('change', async () => {
      const selected = file.files[0]; preview.replaceChildren(); status('');
      if (!selected) return;
      try {
        if (selected.size > MAX_BACKUP_BYTES) throw new Error('備份檔不得超過 5 MB。');
        const incoming = parseBackup(await selected.text());
        if (token !== generation) return;
        const merged = mergeBackup(store.read(), incoming);
        const table = el('table', { class: 'backup-counts' }, el('caption', {}, '合併預覽'), el('thead', {}, el('tr', {}, ['類型', '新增', '略過', '衝突副本'].map(t => el('th', { scope: 'col' }, t)))), el('tbody', {}, ['notes', 'drafts'].map(key => el('tr', {}, el('th', { scope: 'row' }, key === 'notes' ? '記事' : '草稿'), ...['added', 'skipped', 'conflicts'].map(k => el('td', {}, String(merged.counts[key][k])))))));
        preview.append(el('p', {}, `備份時間：${new Date(incoming.exportedAt).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })}`), table, el('p', { class: 'small' }, '衝突副本已包含在新增數量中。草稿匯入後需自行選擇繼續，才會成為正式記事。'));
        const confirm = button('確認合併還原', async () => {
          if (!await ask('合併這份備份？', `將加入 ${merged.counts.notes.added} 筆記事與 ${merged.counts.drafts.added} 份草稿。現有內容會保留；舊備份可能找回曾刪除的記事。`, '確認還原')) return;
          confirm.disabled = true;
          try { await store.restore(merged); render(); status('備份已合併還原。請檢查記事與匯入草稿。'); }
          catch (e) { preview.append(el('p', { class: 'error-banner', role: 'alert' }, `${e.message} 現有記事與草稿未變更。`)); confirm.disabled = false; }
        }, 'primary');
        preview.append(confirm, button('取消預覽', () => { preview.replaceChildren(); file.value = ''; }));
      } catch (e) { if (token === generation) preview.replaceChildren(el('p', { class: 'error-banner', role: 'alert' }, `${e.message} 現有資料未變更。`)); }
    });
    container.append(exportCard, importCard);
    const drafts = el('div', { class: 'data-card' }, el('h2', {}, '尚未完成的草稿'));
    if (!state.drafts.length) drafts.append(el('p', {}, '目前沒有草稿。'));
    for (const draft of [...state.drafts].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))) {
      const url = draft.slot === 'new' ? '#editor' : draft.slot === 'edit' ? `#editor?id=${encodeURIComponent(draft.noteId)}` : `#editor?draft=${encodeURIComponent(draft.id)}`;
      drafts.append(el('div', { class: 'draft-item' }, el('p', {}, `${draft.date || '日期未選'} · ${draft.slot === 'recovery' ? '匯入草稿副本' : draft.slot === 'edit' ? '編輯草稿' : '新記事草稿'}`), el('p', { class: 'draft-excerpt' }, (draft.text || draft.moodText || draft.mood || '空白草稿').slice(0, 120)), link('查看／繼續草稿', url), button('捨棄', async () => {
        if (!await ask('捨棄草稿？', `${draft.date || '日期未選'}\n這份未完成內容會移除，正式記事仍保留。`, '捨棄草稿')) return;
        try { await store.discardDraft(draft); render(); status('草稿已捨棄。'); } catch (e) { status(e.message); }
      })));
    }
    container.append(drafts);
  }
  return { render };
}
