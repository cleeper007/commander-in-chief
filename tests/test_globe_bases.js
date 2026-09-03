// ============================================================
// tests/test_globe_bases.js — Unit and integration test for
// global military bases on the world chart globe.
// ============================================================
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const vm = require('vm');

console.log('=== 1. Validating js/bases.js dataset ===');
const { US_BASES } = require('../js/bases.js');
assert.strictEqual(US_BASES.length, 343, 'Expected exactly 343 military installations');

const branchCounts = {};
const idSet = new Set();
const LON0 = 38.5, LAT0 = 39.5;
const DEG_X = 1000 / 30;
const DEG_Y = DEG_X / Math.cos(28 * Math.PI / 180);

for (const base of US_BASES) {
  assert(!idSet.has(base.id), `Duplicate ID found: ${base.id}`);
  idSet.add(base.id);

  assert(base.name, `Missing name for ${base.id}`);
  assert(base.short, `Missing short name for ${base.id}`);
  assert(base.branch, `Missing branch for ${base.id}`);
  assert(base.city, `Missing city for ${base.id}`);
  assert(base.state, `Missing state for ${base.id}`);

  // Numeric checks
  assert(typeof base.lat === 'number' && !isNaN(base.lat), `Invalid lat for ${base.id}`);
  assert(typeof base.lon === 'number' && !isNaN(base.lon), `Invalid lon for ${base.id}`);
  assert(base.lat >= -90 && base.lat <= 90, `Lat out of range for ${base.id}: ${base.lat}`);
  assert(base.lon >= -180 && base.lon <= 180, `Lon out of range for ${base.id}: ${base.lon}`);

  // Projection formula checks
  const expectedX = Math.round(((base.lon - LON0) * DEG_X) * 10) / 10;
  const expectedY = Math.round(((LAT0 - base.lat) * DEG_Y) * 10) / 10;
  assert.strictEqual(base.x, expectedX, `Mismatched x projection for ${base.id}: expected ${expectedX}, got ${base.x}`);
  assert.strictEqual(base.y, expectedY, `Mismatched y projection for ${base.id}: expected ${expectedY}, got ${base.y}`);

  branchCounts[base.branch] = (branchCounts[base.branch] || 0) + 1;
}

assert.strictEqual(branchCounts['Army'], 69, 'Army count mismatch');
assert.strictEqual(branchCounts['Air Force'], 78, 'Air Force count mismatch');
assert.strictEqual(branchCounts['Space Force'], 14, 'Space Force count mismatch');
assert.strictEqual(branchCounts['Navy'], 56, 'Navy count mismatch');
assert.strictEqual(branchCounts['Marine Corps'], 29, 'Marine Corps count mismatch');
assert.strictEqual(branchCounts['Coast Guard'], 15, 'Coast Guard count mismatch');
assert.strictEqual(branchCounts['ANG'], 56, 'ANG count mismatch');
assert.strictEqual(branchCounts['AF Reserve'], 26, 'AF Reserve count mismatch');
console.log('✓ All 343 installations verified with accurate projections and counts.');

console.log('=== 2. Validating world.html markup & css/world.css ===');
const worldHtml = fs.readFileSync(path.join(__dirname, '..', 'world.html'), 'utf8');
assert(worldHtml.includes('js/bases.js'), 'world.html must include js/bases.js');
assert(worldHtml.includes('id="bases"'), 'world.html must include #bases SVG group');
assert(worldHtml.includes('id="branch-filters"'), 'world.html must include #branch-filters');
assert(worldHtml.includes('id="base-tooltip"'), 'world.html must include #base-tooltip');
assert(worldHtml.includes('Globe.setBranchFilter'), 'world.html must hook up Globe.setBranchFilter');

const worldCss = fs.readFileSync(path.join(__dirname, '..', 'css', 'world.css'), 'utf8');
assert(worldCss.includes('.base-marker'), 'css/world.css must style .base-marker');
assert(worldCss.includes('.base-tooltip'), 'css/world.css must style .base-tooltip');
assert(worldCss.includes('#branch-filters'), 'css/world.css must style #branch-filters');
assert(worldCss.includes('.branch-army'), 'css/world.css must style .branch-army');
assert(worldCss.includes('.branch-space-force'), 'css/world.css must style .branch-space-force');
console.log('✓ world.html and css/world.css include all required elements and styles.');

console.log('=== 3. Testing Globe rendering and interaction in headless DOM ===');
const elements = {};
function makeEl(tag, id) {
  const listeners = {};
  const children = [];
  const el = {
    tagName: tag.toUpperCase(),
    id: id || '',
    style: {},
    classList: {
      _classes: new Set(),
      add: function(c) { this._classes.add(c); },
      remove: function(c) { this._classes.delete(c); },
      contains: function(c) { return this._classes.has(c); },
      toggle: function(c, force) { if (force !== undefined ? force : !this._classes.has(c)) this._classes.add(c); else this._classes.delete(c); }
    },
    dataset: {},
    children,
    parentNode: null,
    appendChild: function(c) { children.push(c); c.parentNode = this; return c; },
    replaceChild: function(newC, oldC) {
      const idx = children.indexOf(oldC);
      if (idx !== -1) children[idx] = newC;
      newC.parentNode = this;
      return newC;
    },
    querySelector: function(sel) {
      if (sel.startsWith('#')) return elements[sel.slice(1)] || null;
      return null;
    },
    querySelectorAll: function() { return []; },
    setAttribute: function(k, v) { this[k] = v; },
    getAttribute: function(k) { return this[k] || null; },
    addEventListener: function(evt, fn) { listeners[evt] = listeners[evt] || []; listeners[evt].push(fn); },
    dispatchEvent: function(evt) { (listeners[evt.type] || []).forEach(fn => fn(evt)); },
    getBoundingClientRect: () => ({ width: 1000, height: 760, left: 0, top: 0, right: 1000, bottom: 760 })
  };
  if (id) elements[id] = el;
  return el;
}

const ctx = {
  document: {
    getElementById: (id) => elements[id] || null,
    createElement: (tag) => makeEl(tag),
    createElementNS: (ns, tag) => makeEl(tag),
    head: makeEl('head')
  },
  window: {
    innerWidth: 1000,
    innerHeight: 760,
    addEventListener: () => {}
  },
  requestAnimationFrame: (cb) => setTimeout(cb, 16),
  cancelAnimationFrame: (id) => clearTimeout(id),
  performance: { now: () => 100 },
  console: console,
  Math: Math,
  Float32Array: Float32Array,
  Set: Set,
  Map: Map,
  Array: Array,
  isNaN: isNaN,
  isFinite: isFinite,
  parseFloat: parseFloat
};
ctx.window.requestAnimationFrame = ctx.requestAnimationFrame;
ctx.window.cancelAnimationFrame = ctx.cancelAnimationFrame;

// Build DOM hierarchy
const world = makeEl('svg', 'world');
const cam = makeEl('g', 'cam');
const space = makeEl('rect', 'space');
const atmosphere = makeEl('circle', 'atmosphere');
const disc = makeEl('circle', 'disc');
const graticule = makeEl('path', 'graticule');
const countries = makeEl('g', 'countries');
const seaLabels = makeEl('g', 'sea-labels');
const labels = makeEl('g', 'labels');
const bases = makeEl('g', 'bases');
const tooltip = makeEl('div', 'base-tooltip');

world.appendChild(space);
world.appendChild(atmosphere);
world.appendChild(disc);
cam.appendChild(graticule);
cam.appendChild(countries);
world.appendChild(cam);
world.appendChild(seaLabels);
world.appendChild(labels);
world.appendChild(bases);

vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'worldgeo.js'), 'utf8'), ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'bases.js'), 'utf8'), ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'globe.js'), 'utf8') + '; globalThis.Globe = Globe;', ctx);

const Globe = vm.runInContext('Globe', ctx);
const initInfo = Globe.init();
assert.strictEqual(initInfo.bases, 343, 'Globe.init should report 343 bases loaded');
console.log('✓ Globe.init() initialized successfully with 343 bases');

// Initial view facing Middle East
Globe.render();
const initialBases = Globe.getBases();
const visibleFacingMiddleEast = initialBases.filter(b => b.on).length;
assert(visibleFacingMiddleEast > 0 && visibleFacingMiddleEast < 343,
  `Expected partial visibility on globe face, got ${visibleFacingMiddleEast}`);
console.log(`✓ Front-face culling works: ${visibleFacingMiddleEast} bases visible facing Middle East`);

// Rotate camera to USA
Globe.goto(-98, 38, 0.2);
Globe.render();
const visibleFacingUSA = initialBases.filter(b => b.on).length;
assert(visibleFacingUSA > visibleFacingMiddleEast,
  `Expected more bases visible facing USA, got ${visibleFacingUSA} vs ${visibleFacingMiddleEast}`);
console.log(`✓ Camera rotation works: ${visibleFacingUSA} bases visible facing North America`);

// Test branch filter
Globe.setBranchFilter('space-force');
Globe.render();
const spaceBasesVisible = initialBases.filter(b => b.on).length;
assert(spaceBasesVisible > 0 && spaceBasesVisible <= 14,
  `Space force filter failed: got ${spaceBasesVisible}`);
console.log(`✓ Branch filter works: ${spaceBasesVisible} Space Force bases visible`);

// Reset filter
Globe.setBranchFilter('all');
Globe.render();
assert.strictEqual(initialBases.filter(b => b.on).length, visibleFacingUSA);
console.log('✓ Branch filter reset works');

console.log('=== ALL TESTS PASSED! ===');
