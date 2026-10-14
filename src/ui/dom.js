/** Helpers mínimos de DOM (sem framework). */

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value == null || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key === 'dataset') Object.assign(el.dataset, value);
    else if (key === 'html') el.innerHTML = value;
    else if (key.startsWith('on') && typeof value === 'function') {
      el.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key === 'value') el.value = value;
    else if (key === 'checked' || key === 'disabled' || key === 'selected') el[key] = Boolean(value);
    else el.setAttribute(key, String(value));
  }
  append(el, children);
  return el;
}

export function append(parent, children) {
  for (const child of children.flat(Infinity)) {
    if (child == null || child === false) continue;
    parent.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return parent;
}

export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}

export function card(title, ...children) {
  return h('section', { class: 'card' }, title ? h('h2', {}, title) : null, ...children);
}

export function badge(text, kind = 'neutral') {
  return h('span', { class: `badge badge-${kind}` }, text);
}

export function bar(percent, label = '') {
  return h(
    'div',
    { class: 'bar', role: 'progressbar', 'aria-valuenow': Math.round(percent), 'aria-valuemin': 0, 'aria-valuemax': 100 },
    h('div', { class: 'bar-fill', style: `width:${Math.max(0, Math.min(100, percent))}%` }),
    label ? h('span', { class: 'bar-label' }, label) : null,
  );
}

export function field(label, control, hint = '') {
  return h('label', { class: 'field' }, h('span', { class: 'field-label' }, label), control,
    hint ? h('small', { class: 'hint' }, hint) : null);
}

export function select(options, value, onChange, { id } = {}) {
  const el = h('select', { id, onChange: (e) => onChange(e.target.value) },
    ...options.map((o) => {
      const val = typeof o === 'string' ? o : o.value;
      const lab = typeof o === 'string' ? o : o.label;
      return h('option', { value: val, selected: val === value }, lab);
    }));
  return el;
}

export function button(label, onClick, { kind = 'primary', disabled = false, title = '' } = {}) {
  return h('button', { class: `btn btn-${kind}`, onClick, disabled, title }, label);
}

export function emptyNote(text) {
  return h('p', { class: 'empty' }, text);
}

export function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function formatDateTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

/** Dispara o download de um arquivo gerado no browser. */
export function downloadText(filename, text, mime = 'text/plain;charset=utf-8') {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
