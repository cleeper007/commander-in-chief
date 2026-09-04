import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  advanceTurn, boot, observable, reveal, restore, savedRaw, start,
} from '../support/campaign.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = path.resolve(HERE, '../fixtures');
const FIXTURES = fs.readdirSync(FIXTURE_DIR)
  .filter((name) => /^issue-.*\.json$/.test(name))
  .map((name) => JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, name), 'utf8')));
const fixture = (id) => FIXTURES.find((item) => item.id === id);

test('every historical regression fixture names its tracking issue', () => {
  assert.equal(FIXTURES.length, 7);
  for (const item of FIXTURES) {
    assert.match(item.issue, /^#\d+$/);
    assert.match(item.issueUrl, /\/issues\/\d+$/);
    assert.ok(item.regression.length > 20);
  }
});

test('submarine strike footage does not block progression', () => {
  const data = fixture('issue-1-submarine-strike-footage');
  const harness = start(data.seed, 'normal');
  const ship = reveal(harness.api.TARGETS.find((target) => target.id === 'ship-mahdavi'));
  const torpedo = ship.packages.find((pkg) => pkg.sub);
  const before = harness.api.Game.G.torpedoes;
  harness.api.Game.executeStrike(ship, torpedo);
  assert.equal(advanceTurn(harness), true);
  assert.equal(harness.api.Game.G.torpedoes, before - torpedo.qty);
  assert.equal(harness.api.Game.busy(), false);
});

test('turn-resolution exceptions release the UI lock', () => {
  const data = fixture('issue-2-turn-resolution-lock');
  const harness = start(data.seed, 'normal');
  harness.sandbox.console = { ...console, error() {} };
  const before = harness.api.Game.G.turn;
  harness.api.IranAI.respond = () => { throw new Error('fixture-injected resolution fault'); };
  harness.api.Game.endTurn();
  harness.clock.advance(120000);
  assert.equal(harness.api.Game.busy(), false);
  assert.equal(harness.api.Game.G.over, false);
  assert.equal(harness.api.Game.G.turn, before + 1);
  assert.ok(harness.presentation.reports.some((report) => /TURN RESOLUTION FAULT/.test(report.title)));
});

test('stalled media reaches its timeout path', () => {
  const data = fixture('issue-2-stalled-media-timeout');
  const harness = start(data.seed, 'normal');
  const target = harness.api.TARGETS.find((item) => item.id === 'ad-tehran');
  const pkg = target.packages.find((item) => item.asset === 'f35');
  harness.api.MapView.animateStrike = () => 8000; // never calls its completion callback
  harness.api.Game.executeStrike(target, pkg);
  assert.equal(advanceTurn(harness, 180000), true);
  assert.equal(harness.api.Game.busy(), false);
});

test('fast-forward closes strike-wall and live mission artifacts exactly once', () => {
  const data = fixture('issue-2-fast-forward-artifacts');
  const harness = boot();
  harness.api.Random.seed(data.seed);
  const wall = harness.sandbox.document.getElementById('strike-wall');
  wall.classList.remove('hidden');
  const fx = harness.sandbox.document.getElementById('fx-layer');
  let completed = 0;
  harness.api.MapView.alliedStrike(['ad-tehran'], () => { completed++; }, 'israel');
  harness.clock.advance(0);
  assert.ok(fx.children.length > 0, 'fixture did not create live flight artifacts');
  harness.api.MapView.setFastForward(true);
  assert.equal(wall.classList.contains('hidden'), true);
  assert.equal(fx.children.length, 0);
  assert.equal(completed, 1);
  harness.clock.advance(20000);
  assert.equal(completed, 1, 'watchdog completed the skipped mission twice');
});

test('backgrounding the tab completes presentation callbacks exactly once', () => {
  const harness = boot();
  harness.api.Random.seed(24004);
  const fx = harness.sandbox.document.getElementById('fx-layer');
  let completed = 0;
  harness.api.MapView.alliedStrike(['ad-tehran'], () => { completed++; }, 'israel');
  harness.clock.advance(0);
  assert.ok(fx.children.length > 0, 'fixture did not create live flight artifacts');

  harness.sandbox.document.hidden = true;
  harness.sandbox.document.dispatchEvent({ type: 'visibilitychange' });
  assert.equal(completed, 1);
  assert.equal(fx.children.length, 0);
  harness.clock.advance(20000);
  assert.equal(completed, 1, 'presentation watchdog completed the hidden-tab mission twice');
});

test('overlapping strike feeds complete every mission once', () => {
  const data = fixture('issue-2-overlapping-strike-feeds');
  const harness = start(data.seed, 'normal');
  const targets = ['ad-tehran', 'ad-isfahan'].map((id) => harness.api.TARGETS.find((t) => t.id === id));
  const callbacks = [];
  harness.api.MapView.animateStrike = (asset, target, done) => {
    callbacks.push(target.id);
    harness.sandbox.setTimeout(done, target.id === 'ad-tehran' ? 20 : 10);
    return 20;
  };
  for (const target of targets) {
    const pkg = target.packages.find((item) => item.asset === 'cruise');
    harness.api.Game.executeStrike(target, { ...pkg, qty: 3 });
  }
  const before = harness.api.Game.G.turn;
  harness.api.Game.endTurn();
  harness.clock.advance(180000);
  assert.equal(harness.api.Game.G.turn, before + 1);
  assert.deepEqual(callbacks.sort(), targets.map((target) => target.id).sort());
  const bda = harness.presentation.reports.find((report) => /BATTLE DAMAGE ASSESSMENT/.test(report.title));
  assert.ok(bda);
  assert.equal(bda.events.filter((event) => /^BDA:/.test(event.title)).length, 2);
});

test('a report waiting for the player does not trigger the watchdog', () => {
  const data = fixture('issue-2-report-watchdog');
  const harness = start(data.seed, 'normal');
  const target = harness.api.TARGETS.find((item) => item.id === 'ad-tehran');
  harness.api.Game.executeStrike(target, target.packages.find((pkg) => pkg.asset === 'f35'));

  let waiting = true;
  let release = null;
  const originalQuery = harness.sandbox.document.querySelector.bind(harness.sandbox.document);
  harness.sandbox.document.querySelector = (selector) =>
    selector === '.overlay:not(.hidden) .modal' && waiting ? {} : originalQuery(selector);
  harness.api.UI.showReport = (title, events, done) => {
    harness.api.Game.noteReport(title);
    if (waiting && !release) release = done;
    else if (done) done();
  };

  const before = harness.api.Game.G.turn;
  harness.api.Game.endTurn();
  harness.clock.advance(10000);
  assert.equal(typeof release, 'function');
  harness.clock.advance(100000);
  assert.equal(harness.api.Game.G.turn, before, 'watchdog advanced through an open report');
  assert.equal(harness.api.Game.busy(), true);
  waiting = false;
  release();
  harness.clock.advance(180000);
  assert.equal(harness.api.Game.G.turn, before + 1);
  assert.equal(harness.api.Game.busy(), false);
});

test('restoring cannot duplicate damage, approval, or resource spending', () => {
  const data = fixture('issue-2-restore-idempotence');
  const original = start(data.seed, 'normal');
  const target = original.api.TARGETS.find((item) => item.id === 'ad-tehran');
  const pkg = target.packages.find((item) => item.asset === 'f35');
  original.api.Game.executeStrike(target, pkg);
  const ordered = {
    approval: original.api.Game.G.approval,
    sortie: original.api.Game.G.res.f35,
    tanker: original.api.Game.G.tankers,
    pgm: original.api.Game.G.pgm,
    hp: target.hp,
  };
  original.sandbox.document.getElementById('btn-save-quit').click();
  const resumed = restore(savedRaw(original));
  const restoredTarget = resumed.api.TARGETS.find((item) => item.id === target.id);
  assert.deepEqual({
    approval: resumed.api.Game.G.approval,
    sortie: resumed.api.Game.G.res.f35,
    tanker: resumed.api.Game.G.tankers,
    pgm: resumed.api.Game.G.pgm,
    hp: restoredTarget.hp,
  }, ordered);

  assert.equal(advanceTurn(original), true);
  assert.equal(advanceTurn(resumed), true);
  assert.deepEqual(observable(resumed), observable(original));
});
