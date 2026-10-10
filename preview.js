// Preview-only navigation and visual control states. No data persistence.
const views = [...document.querySelectorAll('[data-view]')];
const titles = { home: '本週記事', calendar: '月曆', day: '單日資訊', editor: '記事編輯' };
const dialog = document.querySelector('#preview-dialog');
const positions = new Map();
let currentView;
let dayOrigin = 'calendar';
let editorOrigin = 'home';

function showMessage(message) {
  document.querySelector('#dialog-message').textContent = message;
  dialog.showModal();
}

function showView() {
  const requested = window.location.hash.slice(1);
  // The skip link targets main without changing the current view.
  if (requested === 'main-content') return;
  const next = Object.hasOwn(titles, requested) ? requested : 'home';
  if (currentView === next) return;
  if (currentView) positions.set(currentView, window.scrollY);
  if (next === 'day' && ['home', 'calendar'].includes(currentView)) dayOrigin = currentView;
  if (next === 'editor' && currentView) editorOrigin = currentView;
  const dayBack = document.querySelector('#day-back');
  dayBack.href = `#${dayOrigin}`;
  dayBack.querySelector('span').textContent = dayOrigin === 'home' ? '回本週記事' : '回月曆';
  document.querySelector('#editor-back').href = `#${editorOrigin}`;
  views.forEach(view => { view.hidden = view.id !== next; });
  document.querySelector('#main-dock').hidden = next === 'editor';
  document.querySelector('#editor-dock').hidden = next !== 'editor';
  document.title = `貓咪手帳 · ${titles[next]}`;
  const previous = currentView;
  currentView = next;
  window.scrollTo({ top: positions.get(next) ?? 0, behavior: 'instant' });
  if (previous) document.querySelector(`#${next} h1`).focus({ preventScroll: true });
}

document.querySelectorAll('[data-preview]').forEach(button => {
  button.addEventListener('click', () => showMessage(button.dataset.preview));
});
document.querySelector('#dialog-close').addEventListener('click', () => dialog.close());
document.querySelector('#note-form').addEventListener('submit', event => {
  event.preventDefault();
  showMessage('這是記事編輯的畫面樣稿。內容尚未儲存；正式保存、修改與草稿功能會在你確認畫面後接續製作。');
});

const moods = [...document.querySelectorAll('.mood-option')];
function selectMood(selected) {
  moods.forEach(button => button.setAttribute('aria-pressed', String(button === selected)));
  document.querySelector('#mood-status').textContent = selected ? `已選${selected.textContent.trim().replace(/\s+/g, '')}，也可以不選。` : '不選也沒關係。';
}
moods.forEach(button => button.addEventListener('click', () => {
  selectMood(button.getAttribute('aria-pressed') === 'true' ? null : button);
}));
document.querySelector('#clear-mood').addEventListener('click', () => selectMood(null));
document.querySelector('#cat-button').addEventListener('click', event => {
  const message = document.querySelector('#cat-message');
  message.hidden = !message.hidden;
  event.currentTarget.setAttribute('aria-expanded', String(!message.hidden));
});
window.addEventListener('hashchange', showView);
showView();
