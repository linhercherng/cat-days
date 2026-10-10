import { $, button } from './src/dom.js';
import { createStore, KEY } from './src/store.js';
import { emptyState } from './src/schema.js';
import { isValidDate, taiwanToday, dateLabel } from './src/dates.js';
import { renderWeek, renderMonth, renderDay, dayURL } from './src/views.js';
import { createEditor } from './src/editor.js';
import { createDataPanel } from './src/data-panel.js';
// The storage getter can itself throw in restricted browser environments.
const storage = { getItem: key => window.localStorage.getItem(key), setItem: (key, value) => window.localStorage.setItem(key, value) };
const lock = task => navigator.locks ? navigator.locks.request(KEY, task) : Promise.resolve(task());
const store = createStore(storage, { lock });
history.scrollRestoration = 'manual';
window.addEventListener('load', () => requestAnimationFrame(() => window.scrollTo(0, 0)), { once: true });
let view = '', lastHash = '#home', week = taiwanToday(), month = week, selectedDay = week;
let dayBack = '#calendar', editorBack = '#home', navigation = Promise.resolve();
function status(message) { $('#app-status').textContent = message; $('#app-status').hidden = !message; }
let resolveDialog;
function ask(title, message, confirm = '知道了') {
  const dialog = $('#app-dialog');
  if (dialog.open) return Promise.resolve(false);
  $('#dialog-title').textContent = title; $('#dialog-message').textContent = message;
  $('#dialog-actions').replaceChildren(button(confirm, () => dialog.close('yes'), 'primary'));
  if (confirm !== '知道了') $('#dialog-actions').append(button('取消', () => dialog.close('no')));
  return new Promise(resolve => { resolveDialog = resolve; dialog.showModal(); });
}
$('#app-dialog').addEventListener('close', () => { resolveDialog?.($('#app-dialog').returnValue === 'yes'); resolveDialog = null; });
const go = hash => { if (location.hash === hash) refresh(); else location.hash = hash; };
const pending = text => ask('下一個製作關卡', text);
const editor = createEditor(store, { ask, status, go, today: taiwanToday });
const data = createDataPanel(store, { ask, status });
function read() {
  try { const value = store.read(); $('#storage-error').hidden = true; return value; }
  catch (e) { $('#storage-error').textContent = e.message; $('#storage-error').hidden = false; return emptyState(); }
}
function refresh() {
  const state = read(), today = taiwanToday();
  if (view === 'home') {
    $('#home-month').textContent = today.slice(0, 7); $('#home-today').textContent = `今天是 ${dateLabel(today)}。`;
    renderWeek($('#week-content'), state, week, today, date => { week = date; refresh(); });
  } else if (view === 'calendar') {
    renderMonth($('#month-content'), state, month, today, date => { month = date; refresh(); }, () => pending('算天數會在資料驗收確認後製作，會同時顯示「相隔天數」與「頭尾都算」。'));
  } else if (view === 'day') renderDay($('#day-content'), state, selectedDay, today, date => go(dayURL(date)));
  else if (view === 'data') data.render();
}
async function navigate() {
  const targetHash = location.hash || '#home';
  await editor.flush();
  if (editor.isBusy()) {
    history.replaceState(null, '', lastHash);
    status('正在處理記事，完成後即可離開。');
    return;
  }
  if (editor.hasUnsaved()) {
    history.replaceState(null, '', lastHash);
    status('草稿暫存失敗，已保留目前輸入。請先複製內容、重試儲存，或明確捨棄草稿後離開。');
    return;
  }
  const [name, query = ''] = targetHash.slice(1).split('?');
  if (name === 'main-content') { $('#main-content').focus(); return; }
  const next = ['home', 'calendar', 'day', 'editor', 'data'].includes(name) ? name : 'home';
  const params = new URLSearchParams(query);
  if (next === 'editor') status('');
  const requestedDate = params.get('date');
  if (requestedDate && !isValidDate(requestedDate)) status('網址日期無效，已改為台灣今天；支援 1900～2100 年。');
  if (next === 'day') {
    if (view === 'home' || view === 'calendar') dayBack = `#${view}`;
    selectedDay = isValidDate(requestedDate) ? requestedDate : taiwanToday(); month = selectedDay;
    $('#day-back').href = dayBack; $('#day-back').textContent = dayBack === '#home' ? '‹ 本週記事' : '‹ 回月曆';
  }
  if (next === 'editor') {
    editorBack = view === 'day' ? dayURL(selectedDay) : view === 'data' ? '#data' : view === 'calendar' ? '#calendar' : '#home';
    editor.open(params, read(), editorBack);
  }
  view = next; lastHash = targetHash;
  document.querySelectorAll('[data-view]').forEach(section => { section.hidden = section.id !== view; });
  $('#main-dock').hidden = view === 'editor'; $('#editor-dock').hidden = view !== 'editor';
  refresh();
  const title = $(`#${view} h1`); document.title = `貓咪手帳 · ${title.textContent}`;
  window.scrollTo(0, 0); title.focus({ preventScroll: true });
}
window.addEventListener('hashchange', () => { navigation = navigation.then(navigate).catch(e => status(e.message)); });
window.addEventListener('storage', event => { if (event.key !== KEY && event.key !== null) return; if (view === 'editor') editor.notifyExternal(); else { refresh(); status('已更新其他分頁的資料。'); } });
window.addEventListener('beforeunload', event => { if (editor.hasUnsaved()) { event.preventDefault(); event.returnValue = ''; } });
window.addEventListener('pageshow', event => { if (event.persisted && view !== 'editor') refresh(); });
$('#find-date').addEventListener('click', () => pending('找日期會在資料驗收確認後製作；目前可從月曆選一天，或在記事中指定日期。'));
$('#cat-button').addEventListener('click', () => { const message = $('#cat-message'); message.hidden = !message.hidden; $('#cat-button').setAttribute('aria-expanded', String(!message.hidden)); });
// Refresh Taiwan's date after midnight or returning to the tab without touching editor input.
let knownToday = taiwanToday();
function updateToday() {
  const today = taiwanToday(); if (today === knownToday) return;
  if (week === knownToday) week = today; if (month.slice(0, 7) === knownToday.slice(0, 7)) month = today;
  knownToday = today; if (view !== 'editor') refresh();
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) updateToday(); });
setInterval(updateToday, 60000);
navigation = navigate().catch(e => status(e.message));
