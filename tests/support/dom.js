'use strict';

// Minimal DOM used by deterministic campaign tests and tools/replay.js. It is
// presentation-only: the real game modules and public action methods still run.
function classList() {
  const values = new Set();
  return {
    add: (...names) => names.forEach((n) => values.add(n)),
    remove: (...names) => names.forEach((n) => values.delete(n)),
    contains: (name) => values.has(name),
    toggle(name, force) {
      const on = force === undefined ? !values.has(name) : !!force;
      if (on) values.add(name); else values.delete(name);
      return on;
    },
  };
}

function element(tag, id) {
  const listeners = Object.create(null);
  const queries = new Map();
  const el = {
    tagName: String(tag || 'div').toUpperCase(), id: id || '', nodeType: 1,
    style: new Proxy({}, { get: (o, k) =>
      (k === 'setProperty' || k === 'removeProperty') ? () => {} : o[k] }),
    dataset: {}, classList: classList(), className: '', children: [], childNodes: [],
    parentNode: null, firstChild: null, innerHTML: '', textContent: '', value: '',
    checked: false, disabled: false, hidden: false, scrollTop: 0, scrollHeight: 0,
    clientHeight: 0, scrollLeft: 0, scrollWidth: 0, clientWidth: 0,
    offsetWidth: 800, offsetHeight: 600,
    addEventListener(type, fn) { (listeners[type] = listeners[type] || []).push(fn); },
    removeEventListener(type, fn) {
      if (listeners[type]) listeners[type] = listeners[type].filter((f) => f !== fn);
    },
    dispatchEvent(event) {
      (listeners[event && event.type] || []).slice().forEach((fn) => fn(event));
      return true;
    },
    click() { this.dispatchEvent({ type: 'click', target: this, preventDefault() {}, stopPropagation() {} }); },
    focus() {}, blur() {}, scrollIntoView() {}, setPointerCapture() {}, releasePointerCapture() {},
    setAttribute(key, value) { this[key] = value; },
    getAttribute(key) { return this[key] === undefined ? null : this[key]; },
    removeAttribute(key) { delete this[key]; }, hasAttribute(key) { return this[key] !== undefined; },
    toggleAttribute(key, force) { if (force) this[key] = ''; else delete this[key]; },
    appendChild(child) {
      this.children.push(child); this.childNodes.push(child);
      if (child) child.parentNode = this;
      return child;
    },
    removeChild(child) {
      this.children = this.children.filter((x) => x !== child);
      this.childNodes = this.childNodes.filter((x) => x !== child);
      return child;
    },
    insertBefore(child) {
      this.children.unshift(child); this.childNodes.unshift(child);
      if (child) child.parentNode = this;
      return child;
    },
    replaceChild(child) { return child; },
    remove() { if (this.parentNode) this.parentNode.removeChild(this); },
    querySelector(selector) {
      if (!queries.has(selector)) queries.set(selector, element('div'));
      return queries.get(selector);
    },
    querySelectorAll() { return []; }, closest() { return null; },
    contains() { return false; },
    getBoundingClientRect: () => ({ x: 0, y: 0, top: 0, left: 0, right: 800, bottom: 600, width: 800, height: 600 }),
    getScreenCTM: () => null,
    createSVGPoint: () => ({ x: 0, y: 0, matrixTransform: () => ({ x: 0, y: 0 }) }),
    getComputedTextLength: () => 10, getTotalLength: () => 100,
    getPointAtLength: () => ({ x: 0, y: 0 }),
    animate: () => ({ cancel() {}, finish() {}, onfinish: null }),
    play: () => Promise.resolve(), pause() {}, load() {},
    cloneNode() { return element(tag, id); },
  };
  return el;
}

function install(global) {
  const byId = new Map();
  const listeners = Object.create(null);
  const document = {
    nodeType: 9, readyState: 'complete', hidden: false, documentElement: element('html'),
    head: element('head'), body: element('body'), activeElement: null,
    getElementById(id) {
      if (!byId.has(id)) byId.set(id, element('div', id));
      return byId.get(id);
    },
    createElement: (tag) => element(tag), createElementNS: (ns, tag) => element(tag),
    createTextNode(text) { const node = element('#text'); node.textContent = text; return node; },
    createDocumentFragment: () => element('#fragment'),
    querySelector(selector) {
      if (typeof selector === 'string' && selector.includes('difficulty')) {
        return { value: global.__difficulty || 'normal', checked: true };
      }
      const panel = typeof selector === 'string' && /\.panel\[data-panel="([^"]+)"\]/.exec(selector);
      if (panel) return this.getElementById(`panel-${panel[1]}`);
      if (selector === '.version-badge') return this.getElementById('version-badge');
      return null;
    },
    querySelectorAll: () => [],
    addEventListener(type, fn) { (listeners[type] = listeners[type] || []).push(fn); },
    removeEventListener() {},
    dispatchEvent(event) { (listeners[event.type] || []).slice().forEach((fn) => fn(event)); return true; },
  };

  const values = new Map();
  global.document = document;
  global.localStorage = {
    getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key), clear: () => values.clear(),
    key: (index) => [...values.keys()][index] || null,
    get length() { return values.size; },
  };
  global.navigator = { userAgent: 'node-replay', maxTouchPoints: 0, vibrate: () => {} };
  global.performance = { now: () => Date.now() };
  global.requestAnimationFrame = () => 0;
  global.cancelAnimationFrame = () => {};
  global.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
  global.getComputedStyle = () => new Proxy({}, { get: () => '' });
  global.Audio = function () { return element('audio'); };
  global.Image = function () { return element('img'); };
  global.MutationObserver = function () { return { observe() {}, disconnect() {}, takeRecords: () => [] }; };
  global.IntersectionObserver = global.ResizeObserver = function () {
    return { observe() {}, disconnect() {}, unobserve() {} };
  };
  global.confirm = () => true;
  global.alert = () => {};
  global.location = { reload() {}, href: 'http://localhost/', search: '' };
  global.screen = { width: 1280, height: 800, orientation: { type: 'landscape-primary', lock: () => Promise.resolve() } };
  global.SVGElement = global.Element = global.Node = function () {};
  global.CustomEvent = global.Event = function (type, init) { return Object.assign({ type }, init); };
  global.__store = values;
  return { document, values };
}

module.exports = { install, element };
