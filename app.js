import { $, button } from './src/dom.js';
import { createStore, KEY } from './src/store.js';
import { emptyState } from './src/schema.js';
import { isValidDate, taiwanToday, dateLabel } from './src/dates.js';
import { renderWeek, renderMonth, renderDay, dayURL } from './src/views.js';
import { createEditor } from './src/editor.js';
import { createDataPanel } from './src/data-panel.js';
import { createTools } from './src/tools-panel.js';
import { loadHolidays } from './src/holidays.js';
import { cloudConfig } from './cloud-config.js';
import { createSyncPanel } from './src/sync-panel.js';
import { createCloudDataPanel } from './src/cloud-data-panel.js';
// The storage getter can itself throw in restricted browser environments.
const storage = { getItem: key => window.localStorage.getItem(key), setItem: (key, value) => window.localStorage.setItem(key, value) };
const lock = task => navigator.locks ? navigator.locks.request(KEY, task) : Promise.resolve(task());
const localStore = createStore(storage, { lock });
let cloudStore = null;
const store = new Proxy({}, { get(_target, key) { const active = cloudStore || localStore; const value = active[key]; return typeof value === 'function' ? value.bind(active) : value; } });
history.scrollRestoration = 'manual';
window.addEventListener('load', () => requestAnimationFrame(() => window.scrollTo(0, 0)), { once: true });
let view = '', lastHash = '#home', week = taiwanToday(), month = week, selectedDay = week;
let dayBack = '#calendar', editorBack = '#home', navigation = Promise.resolve();
let holidays = null, holidayError = false, changingView = false;
const scrollPositions = new Map();
window.addEventListener('scroll', () => { if (!changingView && location.hash === lastHash) scrollPositions.set(lastHash, window.scrollY); }, { passive: true });
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
const go = hash => { scrollPositions.set(lastHash, window.scrollY); if (location.hash === hash) refresh(); else { changingView = true; location.hash = hash; } };
function replaceRoute(hash) {
  const position = (changingView ? scrollPositions.get(hash) : undefined) ?? scrollPositions.get(lastHash) ?? (changingView ? 0 : window.scrollY);
  history.replaceState(null, '', hash); lastHash = hash; scrollPositions.set(hash, position);
}
const editor = createEditor(store, { ask, status, go, today: taiwanToday });
const localData = createDataPanel(localStore, { ask, status });
const sync = createSyncPanel({config:cloudConfig,storage,localStore,ask,status,
  setCloud:value=>{cloudStore=value;updateModeCaption();},onUpdate:()=>{if(view==='editor')editor.notifyExternal();else if(view!=='data' && view!=='sync')refresh();},
  guard:async()=>{await editor.flush();if(editor.isBusy() || editor.hasUnsaved()){status('請先保留或完成目前輸入，再登入／登出。');return false;}return true;}});
const cloudData = createCloudDataPanel(store, {ask,status,onBusy:sync.setBusy});
const data = { render:()=>cloudStore ? cloudData.render() : localData.render() };
const tools = createTools({ go, replaceRoute, today: taiwanToday });
async function fetchHolidays() {
  holidayError = false;
  try { holidays = await loadHolidays(); } catch { holidayError = true; }
  if (view === 'calendar' || view === 'day') refresh();
}
function read() {
  try { const value = store.read(); $('#storage-error').hidden = true; return value; }
  catch (e) { $('#storage-error').textContent = e.message; $('#storage-error').hidden = false; return emptyState(); }
}
function updateModeCaption() {
  $('.prototype-strip').textContent = cloudStore ? '雲端記事 · 草稿只留在這台裝置' : '本機記事 · 可從「帳號與同步」設定跨裝置保存';
}
function refresh() {
  const state = read(), today = taiwanToday();
  updateModeCaption();
  if (view === 'home') {
    $('#home-month').textContent = today.slice(0, 7); $('#home-today').textContent = `今天是 ${dateLabel(today)}。`;
    renderWeek($('#week-content'), state, week, today, date => { week = date; replaceRoute(`#home?week=${week}`); refresh(); });
  } else if (view === 'calendar') {
    renderMonth($('#month-content'), state, month, today, date => { month = date; replaceRoute(`#calendar?month=${month}`); refresh(); }, holidays, holidayError);
  } else if (view === 'day') renderDay($('#day-content'), state, selectedDay, today, date => go(`${dayURL(date)}&back=${encodeURIComponent(dayBack)}`), holidays, holidayError, fetchHolidays);
  else if (view === 'data') data.render();
  else if (view === 'sync') sync.render();
}
async function navigate() {
  const targetHash = location.hash || '#home';
  await editor.flush();
  if (editor.isBusy() || sync.isBusy()) {
    changingView = false;
    history.replaceState(null, '', lastHash);
    status('正在處理記事，完成後即可離開。');
    return;
  }
  if (editor.hasUnsaved()) {
    changingView = false;
    history.replaceState(null, '', lastHash);
    status('草稿暫存失敗，已保留目前輸入。請先複製內容、重試儲存，或明確捨棄草稿後離開。');
    return;
  }
  const [name, query = ''] = targetHash.slice(1).split('?');
  if (name === 'main-content') { changingView = false; $('#main-content').focus(); return; }
  const next = ['home', 'calendar', 'day', 'editor', 'data', 'find', 'interval', 'sync'].includes(name) ? name : 'home';
  const params = new URLSearchParams(query);
  if (next === 'editor') status('');
  const requestedDate = params.get('date');
  if (['day', 'editor'].includes(next) && requestedDate && !isValidDate(requestedDate)) status('網址日期無效，已改為台灣今天；支援 1900～2100 年。');
  if (next === 'home' && isValidDate(params.get('week'))) week = params.get('week');
  if (next === 'calendar' && isValidDate(params.get('month'))) month = params.get('month');
  if (next === 'day') {
    if (view === 'home') dayBack = `#home?week=${week}`;
    if (view === 'calendar') dayBack = `#calendar?month=${month}`;
    const back = params.get('back');
    if (back === '#home' || back === '#calendar' || /^#home\?week=\d{4}-\d{2}-\d{2}$/.test(back || '') || /^#calendar\?month=\d{4}-\d{2}-\d{2}$/.test(back || '') || /^#interval(?:\?[^#]*)?$/.test(back || '')) dayBack = back;
    selectedDay = isValidDate(requestedDate) ? requestedDate : taiwanToday(); month = selectedDay;
    if (dayBack === '#calendar') dayBack = `#calendar?month=${month}`;
    $('#day-back').href = dayBack; $('#day-back').textContent = dayBack.startsWith('#home') ? '‹ 本週記事' : dayBack.startsWith('#interval') ? '‹ 回算天數' : '‹ 回月曆';
  }
  if (next === 'editor') {
    editorBack = view === 'day' ? `${dayURL(selectedDay)}&back=${encodeURIComponent(dayBack)}` : view === 'data' ? '#data' : view === 'calendar' ? '#calendar' : '#home';
    editor.open(params, read(), editorBack);
  }
  changingView = true;
  view = next; lastHash = targetHash;
  if (next === 'home') replaceRoute(`#home?week=${week}`);
  if (next === 'calendar') replaceRoute(`#calendar?month=${month}`);
  if (next === 'day') replaceRoute(`${dayURL(selectedDay)}&back=${encodeURIComponent(dayBack)}`);
  if (next === 'find') tools.openFind(params);
  if (next === 'interval') tools.openInterval(params);
  document.querySelectorAll('[data-view]').forEach(section => { section.hidden = section.id !== view; });
  $('#main-dock').hidden = view === 'editor'; $('#editor-dock').hidden = view !== 'editor';
  refresh();
  const title = $(`#${view} h1`); document.title = `貓咪手帳 · ${title.textContent}`;
  title.focus({ preventScroll: true });
  const restoreY = scrollPositions.get(lastHash) || 0;
  requestAnimationFrame(() => {
    window.scrollTo(0, restoreY);
    requestAnimationFrame(() => { changingView = false; });
  });
}
window.addEventListener('hashchange', () => { navigation = navigation.then(navigate).catch(e => status(e.message)); });
window.addEventListener('storage', event => { if (event.key !== KEY && event.key !== sync.storageKey() && event.key !== null) return; if (view === 'editor') editor.notifyExternal(); else { refresh(); status('已更新其他分頁的資料。'); } });
window.addEventListener('cat-days:saved',()=>sync.changed());
window.addEventListener('beforeunload', event => { if (editor.hasUnsaved()) { event.preventDefault(); event.returnValue = ''; } });
window.addEventListener('pageshow', event => { if (event.persisted && view !== 'editor') refresh(); });
$('#find-date').addEventListener('click', () => go(`#find?back=${encodeURIComponent(view === 'calendar' ? '#calendar' : '#home')}`));
document.addEventListener('click', event => { const anchor = event.target.closest('a[href^="#"]'); if (anchor) { scrollPositions.set(lastHash, window.scrollY); if (anchor.getAttribute('href') !== location.hash) changingView = true; } }, { capture: true });
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
navigation = sync.initialize().then(navigate).catch(e => status(e.message));
fetchHolidays();
