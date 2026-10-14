/**
 * DOM mínimo em memória, suficiente para renderizar as telas nos testes.
 * Não é um browser: cobre apenas o que src/ui usa (criação de elementos,
 * classes, eventos e leitura de texto).
 */

class ClassList {
  constructor(el) {
    this.el = el;
  }
  get set() {
    return new Set(this.el.className.split(/\s+/).filter(Boolean));
  }
  #write(set) {
    this.el.className = [...set].join(' ');
  }
  add(...names) {
    const s = this.set;
    names.forEach((n) => s.add(n));
    this.#write(s);
  }
  remove(...names) {
    const s = this.set;
    names.forEach((n) => s.delete(n));
    this.#write(s);
  }
  contains(name) {
    return this.set.has(name);
  }
  toggle(name) {
    const s = this.set;
    if (s.has(name)) s.delete(name);
    else s.add(name);
    this.#write(s);
    return s.has(name);
  }
}

class FakeNode {
  constructor() {
    this.childNodes = [];
    this.parentNode = null;
  }
  get firstChild() {
    return this.childNodes[0] || null;
  }
  removeChild(child) {
    const i = this.childNodes.indexOf(child);
    if (i >= 0) this.childNodes.splice(i, 1);
    child.parentNode = null;
    return child;
  }
  append(...nodes) {
    for (const n of nodes) {
      const node = n instanceof FakeNode ? n : new FakeText(String(n));
      node.parentNode = this;
      this.childNodes.push(node);
    }
  }
  replaceChildren(...nodes) {
    this.childNodes = [];
    this.append(...nodes);
  }
  remove() {
    this.parentNode?.removeChild(this);
  }
  get textContent() {
    return this.childNodes.map((c) => c.textContent).join('');
  }
  /**
   * Busca o nó mais profundo que satisfaz o predicado (pós-ordem).
   * Importante para `byText`: queremos o botão, não o container que o contém.
   */
  find(predicate) {
    for (const child of this.childNodes) {
      const deep = child.find?.(predicate);
      if (deep) return deep;
      if (child instanceof FakeElement && predicate(child)) return child;
    }
    return null;
  }
  findAll(predicate, out = []) {
    for (const child of this.childNodes) {
      if (child instanceof FakeElement && predicate(child)) out.push(child);
      child.findAll?.(predicate, out);
    }
    return out;
  }
}

class FakeText extends FakeNode {
  constructor(text) {
    super();
    this.text = text;
  }
  get textContent() {
    return this.text;
  }
}

class FakeElement extends FakeNode {
  constructor(tag) {
    super();
    this.tagName = tag.toUpperCase();
    this.className = '';
    this.attributes = {};
    this.dataset = {};
    this.listeners = {};
    this.value = '';
    this.checked = false;
    this.disabled = false;
    this.classList = new ClassList(this);
    this.innerHTMLValue = '';
  }
  set textContent(v) {
    this.childNodes = v === '' ? [] : [new FakeText(String(v))];
  }
  get textContent() {
    return this.childNodes.map((c) => c.textContent).join('');
  }
  set innerHTML(v) {
    this.innerHTMLValue = v;
    this.childNodes = [new FakeText(String(v).replace(/<[^>]*>/g, ''))];
  }
  get innerHTML() {
    return this.innerHTMLValue;
  }
  setAttribute(k, v) {
    this.attributes[k] = v;
  }
  getAttribute(k) {
    return this.attributes[k];
  }
  addEventListener(type, fn) {
    (this.listeners[type] ||= []).push(fn);
  }
  /** Dispara um evento sincronicamente. */
  dispatch(type, event = {}) {
    const ev = { target: this, ...event };
    for (const fn of this.listeners[type] || []) fn(ev);
    return ev;
  }
  click() {
    return this.dispatch('click');
  }
  /** Simula digitação: ajusta o valor e dispara input/change. */
  type(value) {
    this.value = value;
    this.dispatch('input');
    this.dispatch('change');
  }
}

export function installDom() {
  const listeners = {};
  const document = {
    createElement: (tag) => new FakeElement(tag),
    createTextNode: (text) => new FakeText(text),
    body: new FakeElement('body'),
    elements: new Map(),
    getElementById(id) {
      if (!this.elements.has(id)) this.elements.set(id, new FakeElement('div'));
      return this.elements.get(id);
    },
    /** Ouvintes de documento (o app registra o atalho de teclado aqui). */
    addEventListener(type, fn) {
      (listeners[type] ||= []).push(fn);
    },
    removeEventListener(type, fn) {
      listeners[type] = (listeners[type] || []).filter((f) => f !== fn);
    },
    /** Dispara um evento de documento nos testes. */
    dispatch(type, event = {}) {
      const ev = { preventDefault() {}, target: null, ...event };
      for (const fn of listeners[type] || []) fn(ev);
      return ev;
    },
  };
  globalThis.document = document;
  globalThis.Node = FakeNode;
  globalThis.window = { scrollTo() {}, addEventListener() {} };
  globalThis.location = { hash: '' };
  globalThis.confirm = () => true;
  return document;
}

export function text(node) {
  return node.textContent;
}

export const byClass = (cls) => (el) => el.classList.contains(cls);
export const byTag = (tag) => (el) => el.tagName === tag.toUpperCase();
export const byText = (needle) => (el) => el.textContent.includes(needle);

/** Botão cujo texto visível é exatamente `label` (evita acertar títulos). */
export const byButton = (label) => (el) =>
  el.tagName === 'BUTTON' && el.textContent.trim() === label;

/** Botão cujo texto contém `needle`. */
export const byButtonLike = (needle) => (el) =>
  el.tagName === 'BUTTON' && el.textContent.includes(needle);
