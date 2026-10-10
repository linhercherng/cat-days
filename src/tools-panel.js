import { $, el, link } from './dom.js';
import { dateLabel, isValidDate } from './dates.js';
import { findDate, intervalDays } from './date-tools.js';

export function createTools({ go, replaceRoute, today }) {
  let findBack = '#home';
  const date = $('#lookup-date'), error = $('#lookup-error');
  const start = $('#interval-start'), end = $('#interval-end');
  const intervalURL = () => `#interval?${new URLSearchParams({ start: start.value, end: end.value })}`;
  function updateFind() {
    error.hidden = true; date.removeAttribute('aria-invalid');
    $('#lookup-preview').textContent = isValidDate(date.value) ? dateLabel(date.value) : '';
    replaceRoute(`#find?${new URLSearchParams({ date: date.value, back: findBack })}`);
  }
  date.addEventListener('input', updateFind);
  $('#lookup-today').addEventListener('click', () => { date.value = today(); updateFind(); });
  $('#find-form').addEventListener('submit', event => {
    event.preventDefault();
    try {
      const found = findDate(date.value);
      go(`#day?${new URLSearchParams({ date: found.date, back: '#calendar' })}`);
    } catch (e) { error.textContent = e.message; error.hidden = false; date.setAttribute('aria-invalid', 'true'); date.focus(); }
  });
  function updateInterval() {
    replaceRoute(intervalURL());
    const error = $('#interval-error'), result = $('#interval-result'), days = $('#interval-days');
    error.hidden = true; $('#swap-dates').hidden = true; result.replaceChildren(); days.replaceChildren();
    start.removeAttribute('aria-invalid'); end.removeAttribute('aria-invalid');
    for (const input of [start, end]) {
      if ((input.value && !isValidDate(input.value)) || input.validity.badInput) {
        error.textContent = '請選擇有效日期，範圍為 1900-01-01～2100-12-31。'; error.hidden = false; input.setAttribute('aria-invalid', 'true');
      }
    }
    if (!error.hidden) return;
    if (!start.value || !end.value) { result.append(el('p', { class: 'empty-message' }, '選擇開始與結束日期，就能看到兩種算法。')); return; }
    const counts = intervalDays(start.value, end.value);
    if (counts.reversed) {
      error.textContent = '結束日期比開始日期早。可修改日期，或交換兩個日期。'; error.hidden = false; $('#swap-dates').hidden = false; return;
    }
    result.append(el('div', { class: 'count-grid' },
      el('section', { class: 'count-card' }, el('h2', {}, '相隔天數'), el('p', { class: 'count-number' }, String(counts.elapsed), el('span', {}, ' 天')), el('p', {}, '不計開始日，計入結束日。', counts.elapsed === 0 ? '同一天為 0 天。' : '')),
      el('section', { class: 'count-card' }, el('h2', {}, '頭尾都算'), el('p', { class: 'count-number' }, String(counts.inclusive), el('span', {}, ' 天')), el('p', {}, '開始日、結束日都計入。', counts.elapsed === 0 ? '同一天為 1 天。' : ''))));
    for (const [label, value] of [['開始日', start.value], ['結束日', end.value]]) {
      days.append(link(`查看${label} · ${dateLabel(value)}`, `#day?${new URLSearchParams({ date: value, back: intervalURL() })}`, 'tool-day-link'));
    }
  }
  for (const input of [start, end]) input.addEventListener('input', updateInterval);
  $('#swap-dates').addEventListener('click', () => { [start.value, end.value] = [end.value, start.value]; updateInterval(); });
  return {
    openFind(params) {
      findBack = params.get('back') === '#calendar' ? '#calendar' : '#home';
      $('#find-back').href = findBack; $('#find-back').textContent = findBack === '#calendar' ? '‹ 回月曆' : '‹ 本週記事';
      date.value = params.has('date') ? params.get('date') : today(); updateFind();
    },
    openInterval(params) {
      start.value = params.has('start') ? params.get('start') : today();
      end.value = params.has('end') ? params.get('end') : today(); updateInterval();
    },
  };
}
