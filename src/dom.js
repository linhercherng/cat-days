export const $ = selector => document.querySelector(selector);
export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else if (value !== false && value !== null && value !== undefined) node.setAttribute(key, value === true ? '' : String(value));
  }
  for (const child of children.flat()) if (child !== null && child !== undefined) node.append(child);
  return node;
}
export function icon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'icon'); svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS(svg.namespaceURI, 'use');
  use.setAttribute('href', `./assets/icons.svg#${name}`); svg.append(use);
  return svg;
}
export const link = (text, href, className = '') => el('a', { href, class: className }, text);
export const button = (text, onclick, className = 'text-button', attrs = {}) => el('button', { type: 'button', class: className, onclick, ...attrs }, text);
export function download(value, filename, raw = false) {
  const url = URL.createObjectURL(new Blob([raw ? value : JSON.stringify(value, null, 2)], { type: 'application/json;charset=utf-8' }));
  const a = link('下載', url); a.download = filename; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
