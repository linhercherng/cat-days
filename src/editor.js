import { $, el, button } from './dom.js';
import { MOODS, fields } from './schema.js';
import { isValidDate } from './dates.js';
import { dayURL } from './views.js';
export function createEditor(store, { ask, status, go, today }) {
  let context = null, mood = '';
  const error = message => { $('#editor-error').textContent = message; $('#editor-error').hidden = !message; };
  function setMood(value) {
    mood = value;
    document.querySelectorAll('[data-mood]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mood === value)));
    $('#mood-status').textContent = value ? `已選：${MOODS[value]}` : '還沒有選心情';
  }
  function fill(value) {
    $('#note-date').value = value.date; $('#note-text').value = value.text;
    $('#mood-text').value = value.moodText; setMood(value.mood);
  }
  const input = () => ({ date: $('#note-date').value, text: $('#note-text').value, mood, moodText: $('#mood-text').value });
  function busy(ctx, value) {
    ctx.busy = value;
    if (context !== ctx) return;
    $('#editor-fields').disabled = value || !ctx.ready;
    $('#save-note').disabled = value || !ctx.ready;
    $('#discard-draft').disabled = value;
    $('#delete-note').disabled = value;
  }
  function queueDraft() {
    const ctx = context;
    if (!ctx || !ctx.ready || ctx.busy) return;
    const value = input(); ctx.unsaved = true;
    const sequence = ++ctx.sequence;
    $('#draft-status').textContent = '正在暫存草稿…';
    ctx.queue = ctx.queue.then(async () => {
      try {
        ctx.draft = await store.saveDraft({ id: ctx.draftId, slot: ctx.slot, noteId: ctx.noteId, ...value, ...(ctx.originId ? { originId: ctx.originId } : {}) }, ctx.draft);
        if (ctx.sequence === sequence) ctx.unsaved = false;
        if (context === ctx && ctx.sequence === sequence) { $('#draft-status').textContent = '草稿已暫存 · 尚未儲存為記事'; error(''); }
      } catch (e) {
        ctx.unsaved = true;
        if (context === ctx && ctx.sequence === sequence) { error(e.message); $('#draft-status').textContent = '草稿尚未暫存，請保留或複製輸入'; }
      }
    });
  }
  $('#note-form').addEventListener('input', queueDraft);
  document.querySelectorAll('[data-mood]').forEach(b => b.addEventListener('click', () => { setMood(b.dataset.mood); queueDraft(); }));
  $('#clear-mood').addEventListener('click', () => { setMood(''); queueDraft(); });
  $('#note-form').addEventListener('submit', async event => {
    event.preventDefault();
    const ctx = context;
    if (!ctx?.ready || ctx.busy) return;
    try { fields(input()); } catch (e) { error(e.message); if (!isValidDate(input().date)) $('#note-date').focus(); else $('#note-text').focus(); return; }
    busy(ctx, true);
    await ctx.queue;
    try {
      const first = !store.read().noticeShown;
      const saved = await store.saveNote(input(), ctx.note, ctx.draft);
      ctx.unsaved = false; context = null;
      status(first ? '記事已儲存。資料只在目前瀏覽器，更換裝置不會自動同步；可從「資料與備份」下載備份。' : '記事已儲存。');
      go(dayURL(saved.date));
    } catch (e) { error(e.message); }
    finally { busy(ctx, false); }
  });
  $('#discard-draft').addEventListener('click', async () => {
    const ctx = context;
    if (!ctx || ctx.busy) return;
    if (!await ask('捨棄草稿？', '這次尚未正式儲存的內容會移除，原本的記事仍會保留。', '捨棄草稿')) return;
    busy(ctx, true); await ctx.queue;
    try {
      if (ctx.draft) await store.discardDraft(ctx.draft);
      ctx.unsaved = false; context = null; status('草稿已捨棄。'); go(ctx.back);
    } catch (e) { error(e.message); } finally { busy(ctx, false); }
  });
  $('#delete-note').addEventListener('click', async () => {
    const ctx = context;
    if (!ctx?.note || ctx.busy) return;
    const excerpt = (ctx.note.text || ctx.note.moodText || MOODS[ctx.note.mood]).slice(0, 120);
    if (!await ask('刪除這筆記事？', `${ctx.note.date}\n${excerpt}\n\n刪除後無法復原，這筆記事的編輯草稿也會移除。`, '刪除記事')) return;
    busy(ctx, true); await ctx.queue;
    try {
      await store.deleteNote(ctx.note); ctx.unsaved = false; context = null;
      status('記事已刪除。'); go(dayURL(ctx.note.date));
    } catch (e) { error(e.message); } finally { busy(ctx, false); }
  });
  return {
    async flush() { if (context) await context.queue; },
    isBusy() { return Boolean(context?.busy); },
    hasUnsaved() { return Boolean(context?.unsaved); },
    notifyExternal() { if (context) error('其他分頁的資料已有變動。目前輸入保留在畫面中；儲存前會檢查是否衝突。'); },
    open(params, state, back) {
      error('');
      const noteId = params.get('id'), recoveryId = params.get('draft');
      const note = noteId ? state.notes.find(n => n.id === noteId) : null;
      const recovery = recoveryId ? state.drafts.find(d => d.id === recoveryId && d.slot === 'recovery') : null;
      const invalid = (noteId && !note) || (recoveryId && !recovery);
      const draftId = recovery?.id || (note ? `edit:${note.id}` : 'new');
      const savedDraft = invalid ? null : state.drafts.find(d => d.id === draftId) || null;
      const date = isValidDate(params.get('date')) ? params.get('date') : today();
      const original = note || { date, text: '', mood: '', moodText: '' };
      context = { note, noteId: recovery?.noteId || note?.id || null, draftId, slot: recovery ? 'recovery' : note ? 'edit' : 'new', originId: recovery?.originId, draft: savedDraft, queue: Promise.resolve(), sequence: 0, ready: !savedDraft && !invalid, unsaved: false, busy: false, back };
      fill(original);
      $('#editor-title').textContent = note ? '編輯記事' : recovery ? '恢復匯入草稿' : '記一筆';
      $('#editor-back').href = back;
      $('#delete-note').hidden = !note;
      $('#delete-note').disabled = false; $('#discard-draft').disabled = Boolean(invalid);
      $('#draft-status').textContent = savedDraft ? '有尚未完成的草稿' : '尚未輸入';
      $('#editor-fields').disabled = !context.ready;
      $('#save-note').disabled = !context.ready;
      const choice = $('#draft-choice'); choice.hidden = !savedDraft;
      choice.replaceChildren();
      if (invalid) { error('找不到這筆記事或草稿，可能已在其他分頁刪除。請返回查看。'); return; }
      if (!savedDraft) return;
      const ctx = context;
      const enable = () => { ctx.ready = true; choice.hidden = true; $('#editor-fields').disabled = false; $('#save-note').disabled = false; };
      choice.append(el('strong', {}, recovery ? '有一份匯入的草稿' : '上次還沒寫完，要繼續嗎？'), el('p', {}, `${savedDraft.date || '日期未選'} · ${new Date(savedDraft.updatedAt).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })}`), el('p', { class: 'draft-excerpt' }, (savedDraft.text || savedDraft.moodText || savedDraft.mood || '空白草稿').slice(0, 120)),
        ...(recovery ? [el('p', {}, '繼續後將儲存為一筆新記事。')] : []),
        button('繼續草稿', () => { fill(savedDraft); enable(); $('#draft-status').textContent = '草稿已恢復 · 尚未儲存為記事'; $('#note-text').focus(); }, 'primary'),
        button('捨棄這份草稿', async () => {
          if (!await ask('捨棄這份草稿？', '草稿會移除，已儲存的記事仍會保留。', '捨棄草稿')) return;
          busy(ctx, true);
          try { await store.discardDraft(savedDraft); ctx.draft = null; fill(original); enable(); $('#draft-status').textContent = '草稿已捨棄'; } catch (e) { error(e.message); }
          finally { busy(ctx, false); }
        }));
    }
  };
}
