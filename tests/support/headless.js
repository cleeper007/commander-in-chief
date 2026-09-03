'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { install } = require('./dom');

const ROOT = path.resolve(__dirname, '../..');
// Browser order, minus globe.js (MapView is replaced before it renders).
const FILES = [
  'js/random.js', 'js/text.js', 'js/geodata.js', 'js/data.js', 'js/assess.js',
  'js/map.js', 'js/ai.js', 'js/audio.js', 'js/ui.js', 'js/tour.js',
  'js/specops.js', 'js/aircrew.js', 'js/csar.js', 'js/invariants.js', 'js/game.js', 'js/replay.js',
];

function clock() {
  let now = 0;
  let sequence = 0;
  const timers = new Map();
  const add = (fn, delay, repeat) => {
    const id = ++sequence;
    timers.set(id, { id, fn, at: now + (delay || 0), repeat: repeat || 0 });
    return id;
  };
  return {
    setTimeout: (fn, delay) => add(fn, delay, 0),
    clearTimeout: (id) => timers.delete(id),
    setInterval: (fn, delay) => add(fn, delay, delay || 1),
    clearInterval: (id) => timers.delete(id),
    now: () => now,
    pending: () => [...timers.values()].map((timer) => ({ ...timer })),
    advance(duration, budget) {
      const end = now + duration;
      let count = 0;
      for (;;) {
        let next = null;
        for (const timer of timers.values()) {
          if (timer.at <= end && (!next || timer.at < next.at ||
              (timer.at === next.at && timer.id < next.id))) next = timer;
        }
        if (!next || count++ >= (budget || 5000)) break;
        now = next.at;
        if (next.repeat) next.at += next.repeat; else timers.delete(next.id);
        next.fn();
      }
      now = end;
      return count;
    },
  };
}

function boot() {
  const time = clock();
  const sandbox = {
    console, JSON, Math, Date, parseInt, parseFloat, isNaN, isFinite,
    String, Number, Boolean, Array, Object, Set, Map, WeakMap, WeakSet,
    Promise, Symbol, RegExp, Error, TypeError, RangeError,
    encodeURIComponent, decodeURIComponent,
  };
  sandbox.setTimeout = time.setTimeout;
  sandbox.clearTimeout = time.clearTimeout;
  sandbox.setInterval = time.setInterval;
  sandbox.clearInterval = time.clearInterval;
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;
  sandbox.innerWidth = 1280;
  sandbox.innerHeight = 800;
  install(sandbox);
  sandbox.performance = { now: time.now };

  const context = vm.createContext(sandbox);
  for (const file of FILES) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), context, { filename: file });
  }

  const api = vm.runInContext(
    '({Random, CosmeticRandom, CampaignReplay, Game, UI, MapView, IranAI, AudioSys, ' +
    'SpecOps, CSAR, Aircrew, StateInvariants, Txt, Tour, Assess, TARGETS, DIFFICULTY, AIR_ASSETS})',
    context,
  );
  return { api, sandbox, context, clock: time };
}

function stubPresentation(api) {
  const { Game, UI, MapView, AudioSys, SpecOps, CSAR } = api;
  const noop = () => {};
  const reports = [];
  let endgame = null;

  const keepMap = new Set([
    'animateStrike', 'whenFootageDone', 'alliedStrike', 'animateIranianAttacks',
    'playStrikeHit', 'isFastForward', 'raidOpen', 'csarOpen',
  ]);
  MapView.animateStrike = (mission, target, done) => { if (done) done(); };
  MapView.whenFootageDone = (done) => { if (done) done(); };
  MapView.alliedStrike = (targets, done) => { if (done) done(); };
  MapView.animateIranianAttacks = (events, done) => { if (done) done(); };
  MapView.playStrikeHit = (target, pkg, killed, done) => { if (done) done(); };
  // Headless replays skip staging delays but still execute every already-decided
  // outcome. This is the same path as the in-game SKIP TO RESULTS button.
  MapView.isFastForward = () => true;
  const fakeView = () => new Proxy({}, { get: () => () => fakeView() });
  MapView.raidOpen = MapView.csarOpen = fakeView;
  for (const key of Object.keys(MapView)) {
    if (typeof MapView[key] === 'function' && !keepMap.has(key)) MapView[key] = noop;
  }

  AudioSys.playThen = (key, done) => { if (done) done(); };
  for (const key of Object.keys(AudioSys)) {
    if (typeof AudioSys[key] === 'function' && key !== 'playThen') AudioSys[key] = noop;
  }
  AudioSys.isMuted = () => true;
  AudioSys.isMusicOff = () => true;

  UI.showReport = (title, events, done, options) => {
    Game.noteReport(title);
    reports.push({ title, events: events || [], options: options || {} });
    if (done) done();
  };
  UI.showWarPowers = (vote, done) => { Game.noteReport('WAR POWERS VOTE'); if (done) done(); };
  UI.showNuclear = UI.showNsaAlert = UI.showNuclearTest = (done) => { if (done) done(); };
  UI.showPrimer = (manual, done) => { if (done) done(); };
  UI.openLeaderCall = (leader, take, decide, close) => {
    if (decide) decide(true);
    if (close) close();
  };
  const keepUi = new Set([
    'showReport', 'showWarPowers', 'showNuclear', 'showNsaAlert',
    'showNuclearTest', 'showPrimer', 'openLeaderCall', 'stateOptions',
    'diploActions', 'intelParts', 'coaRows', 'nuclearBody',
  ]);
  for (const key of Object.keys(UI)) {
    if (typeof UI[key] === 'function' && !keepUi.has(key)) UI[key] = noop;
  }
  UI.showEndgame = (result) => { endgame = result; };

  for (const key of ['renderPanel', 'openModal', 'closeModal']) {
    if (typeof SpecOps[key] === 'function') SpecOps[key] = noop;
  }
  for (const key of ['syncMap', 'renderPanel', 'openModal', 'closeModal']) {
    if (typeof CSAR[key] === 'function') CSAR[key] = noop;
  }

  return { reports, getEndgame: () => endgame };
}

function ready() {
  const harness = boot();
  const presentation = stubPresentation(harness.api);
  harness.sandbox.document.dispatchEvent({ type: 'DOMContentLoaded' });
  return Object.assign(harness, { presentation });
}

module.exports = { ROOT, FILES, boot, stubPresentation, ready };
