import { el, icon, link, button } from './dom.js';
import { addDays, weekDates, monthCells, weekday, dateLabel } from './dates.js';
import { MOODS } from './schema.js';
import { holidayInfo } from './holidays.js';
export const dayURL = date => `#day?date=${date}`;
export const editorURL = date => `#editor?date=${date}`;
const notesFor = (state, date) => state.notes.filter(n => n.date === date).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
export function noteCard(note, detailed = false) {
  const card = link('', detailed ? `#editor?id=${encodeURIComponent(note.id)}` : dayURL(note.date), `note ${detailed ? 'day-note' : ''} ${note.mood || note.moodText ? 'note-peach' : ''}`);
  card.setAttribute('aria-label', `${detailed ? '編輯記事' : '查看這一天'}：${(note.text || note.moodText || MOODS[note.mood]).slice(0, 60)}`);
  if (note.mood) card.append(el('div', { class: 'note-meta' }, el('span', { class: 'mood-chip', 'aria-hidden': true }, note.mood), `${MOODS[note.mood]} · 心情記錄`));
  if (note.originId) card.append(el('span', { class: 'pill' }, '匯入副本'));
  const summary = value => !detailed && value.length > 160 ? `${value.slice(0, 160)}…` : value;
  if (note.text) card.append(el('p', {}, summary(note.text)));
  if (note.moodText) card.append(el('p', { class: note.text ? 'note-secondary' : '' }, summary(note.moodText)));
  if (detailed) card.append(el('div', { class: 'note-foot' }, el('span', {}, '點一下，修改或刪除'), icon('pen')));
  return card;
}
export function renderWeek(container, state, anchor, today, change) {
  const dates = weekDates(anchor);
  container.replaceChildren(el('div', { class: 'week-switch' },
    button(icon('left'), () => change(addDays(anchor, -7)), 'icon-button', { 'aria-label': '上一週', disabled: !addDays(anchor, -7) }),
    el('p', { class: 'week-label' }, `${dates[0].slice(5).replace('-', '/')} — ${dates.at(-1).slice(5).replace('-', '/')}`, el('span', {}, '星期一至星期日')),
    button(icon('right'), () => change(addDays(anchor, 7)), 'icon-button', { 'aria-label': '下一週', disabled: !addDays(anchor, 7) })),
    el('div', { class: 'week-return' }, button('回到本週', () => change(today))));
  const timeline = el('div', { class: 'timeline' });
  for (const date of dates) {
    const notes = notesFor(state, date);
    if (!notes.length && date !== today) continue;
    const heading = el('h2', { class: 'date-heading' }, el('strong', {}, date.slice(8)), `星期${weekday(date)}`, date === today ? el('span', { class: 'pill' }, '今天') : el('span', {}, `${Number(date.slice(5, 7))} 月`));
    const group = el('section', { class: `day-group ${date === today ? 'today-group' : ''}` }, heading);
    if (!notes.length) group.append(link('看看這一天', dayURL(date), 'day-overview'));
    group.append(...notes.map(n => noteCard(n)));
    if (!notes.length) group.append(el('p', { class: 'empty-message' }, '今天還是空白，留下一點小事吧。'));
    group.append(link('＋ 記在這一天', editorURL(date), 'inline-add')); timeline.append(group);
  }
  if (!timeline.children.length) timeline.append(el('p', { class: 'empty-message' }, '這一週還沒有記事。'));
  container.append(timeline);
}
export function renderMonth(container, state, anchor, today, change, holidays, holidayError) {
  const year = Number(anchor.slice(0, 4)), month = Number(anchor.slice(5, 7));
  const shift = amount => { const d = new Date(Date.UTC(year, month - 1 + amount, 1)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`; };
  container.replaceChildren(el('div', { class: 'month-switch' },
    button(icon('left'), () => change(shift(-1)), 'icon-button', { 'aria-label': '上一個月', disabled: year === 1900 && month === 1 }),
    el('div', { class: 'month-title' }, el('small', {}, String(year)), `${month} 月`),
    button(icon('right'), () => change(shift(1)), 'icon-button', { 'aria-label': '下一個月', disabled: year === 2100 && month === 12 })),
    el('div', { class: 'month-top' }, el('p', { class: 'muted' }, `今天 · ${dateLabel(today)}`), button('回到今天', () => change(today))));
  const yearInput = el('input', { id: 'calendar-year', type: 'number', min: 1900, max: 2100, step: 1, required: true, value: year, inputmode: 'numeric' });
  const monthInput = el('select', { id: 'calendar-month' }, Array.from({ length: 12 }, (_, i) => el('option', { value: i + 1, selected: month === i + 1 }, `${i + 1} 月`)));
  const picker = el('form', { class: 'month-picker', onsubmit: event => { event.preventDefault(); if (picker.reportValidity()) change(`${yearInput.value.padStart(4, '0')}-${monthInput.value.padStart(2, '0')}-01`); } },
    el('div', {}, el('label', { for: 'calendar-year' }, '年份'), yearInput), el('div', {}, el('label', { for: 'calendar-month' }, '月份'), monthInput), el('button', { type: 'submit', class: 'text-button' }, '前往月份'));
  container.append(picker);
  const grid = el('div', { class: 'calendar-grid' });
  for (const date of monthCells(anchor)) {
    if (!date) { grid.append(el('span')); continue; }
    const notes = notesFor(state, date);
    const info = holidayInfo(holidays, date);
    const special = info.available && ['holiday', 'replacement', 'adjusted', 'work'].includes(info.kind);
    const cell = link(String(Number(date.slice(8))), `${dayURL(date)}&back=${encodeURIComponent(`#calendar?month=${anchor}`)}`, `calendar-cell ${date.slice(0, 7) !== anchor.slice(0, 7) ? 'outside' : ''} ${info.weekend && info.kind !== 'work' ? 'weekend' : ''} ${date === today ? 'today' : ''} ${special ? 'special-day' : ''}`);
    cell.setAttribute('aria-label', `${dateLabel(date)}${date === today ? '，今天' : ''}，${notes.length} 筆記事${special ? `，${info.description || '調整放假'}` : ''}`);
    if (special) cell.append(el('span', { class: info.kind === 'work' ? 'work-mark' : 'holiday-mark', 'aria-hidden': true }, info.kind === 'work' ? '班' : ''));
    if (date === today) cell.setAttribute('aria-current', 'date');
    if (notes.length) cell.append(el('span', { class: 'date-dot', 'aria-hidden': true }));
    grid.append(cell);
  }
  container.append(el('div', { class: 'calendar-sheet', 'aria-label': `${year} 年 ${month} 月，星期一開始` }, el('div', { class: 'weekdays', 'aria-hidden': true }, [...'一二三四五六日'].map(day => el('span', { class: '六日'.includes(day) ? 'weekend' : '' }, day))), grid),
    el('div', { class: 'legend' }, el('span', {}, el('i', { class: 'legend-today' }), '今天'), el('span', {}, el('i', { class: 'legend-dot' }), '有記事'), el('span', {}, el('i', { class: 'legend-holiday' }), '節日／補假'), el('span', {}, '班＝調整上班')),
    el('p', { class: 'field-help' }, !infoYearAvailable(anchor) ? '節日僅收錄 2025～2027 年；日期與記事仍可使用。' : holidayError ? '節日資料載入失敗，可在單日畫面重試。' : !holidays ? '正在載入台灣節日…' : '節日依政府行政機關日曆，供查閱參考。'),
    link('找指定日期 ›', '#find?back=%23calendar', 'tool-row'), link('兩個日期，相隔幾天？ ›', '#interval', 'tool-row'));
}
const infoYearAvailable = date => ['2025', '2026', '2027'].includes(date.slice(0, 4));
function holidayPanel(date, holidays, holidayError, retry) {
  const info = holidayInfo(holidays, date);
  const panel = el('div', { class: 'holiday-panel' });
  if (!infoYearAvailable(date)) panel.append(el('p', {}, '這一年尚未收錄台灣節日。', el('span', { class: 'field-help' }, '目前收錄 2025～2027 年，日期與記事仍可使用。')));
  else if (holidayError) panel.append(el('p', { role: 'alert' }, '台灣節日資料載入失敗。'), button('重新載入節日', retry));
  else if (!info.available) panel.append(el('p', { role: 'status' }, '正在載入台灣節日…'));
  else {
    const labels = { holiday: '節日', replacement: '補假', work: '調整上班', adjusted: '調整放假', weekend: '週末', weekday: '一般上班日' };
    panel.append(el('p', {}, el('span', { class: 'pill' }, labels[info.kind]), info.description && info.description !== labels[info.kind] ? ` ${info.description}` : '',
      info.weekend && !['weekend', 'work'].includes(info.kind) ? el('span', { class: 'pill' }, '週末') : null));
  }
  panel.append(el('p', { class: 'field-help' }, '依政府行政機關日曆，實際休假請依個人班表。'),
    link('資料來源 · 人事行政總處（核對 2026-10-10）', 'https://data.gov.tw/dataset/14718', 'holiday-source'));
  return panel;
}
export function renderDay(container, state, date, today, change, holidays, holidayError, retry) {
  const notes = notesFor(state, date);
  container.replaceChildren(el('div', { class: 'day-date' }, el('span', { class: 'large-date', 'aria-hidden': true }, date.slice(8)), el('div', {}, el('p', { class: 'eyebrow' }, date.slice(0, 7)), el('h1', { id: 'day-title', tabindex: '-1' }, `${Number(date.slice(5, 7))} 月 ${Number(date.slice(8))} 日`), el('p', {}, `星期${weekday(date)}`, date === today ? el('span', { class: 'pill' }, '今天') : null))),
    holidayPanel(date, holidays, holidayError, retry),
    el('div', { class: 'day-switch' }, button('‹ 前一天', () => change(addDays(date, -1)), '', { disabled: !addDays(date, -1) }), button('後一天 ›', () => change(addDays(date, 1)), '', { disabled: !addDays(date, 1) })),
    el('div', { class: 'day-notes-heading' }, el('h2', {}, '這一天的記事'), el('span', {}, `${notes.length} 筆小事`)),
    ...notes.map(n => noteCard(n, true)),
    ...(notes.length ? [] : [el('p', { class: 'empty-message' }, '還沒有記事。準備做的事、發生過的小事，都可以記在這裡。')]),
    link('＋ 記在這一天', editorURL(date), 'day-add'));
}
