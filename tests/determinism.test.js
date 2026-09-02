'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { ROOT, boot, stubPresentation, ready } = require('./support/headless');

const fixture = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/fixtures/phase1-smoke.json'), 'utf8'));
let passed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`ok ${passed} - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

function json(value) { return JSON.stringify(value); }

test('Random implements a reproducible stateful API', () => {
  const { Random } = ready().api;
  Random.seed(99);
  const first = [Random.float(), Random.int(2, 7), Random.pick(['a', 'b', 'c']), Random.chance(0.4)];
  const state = Random.state();
  const next = Random.float();
  Random.seed(99);
  assert.strictEqual(json([Random.float(), Random.int(2, 7), Random.pick(['a', 'b', 'c']), Random.chance(0.4)]), json(first));
  Random.restore(state);
  assert.strictEqual(Random.float(), next);
});

test('identical seed and decisions produce an identical campaign state', () => {
  const a = ready().api.CampaignReplay.run(fixture);
  const b = ready().api.CampaignReplay.run(fixture);
  assert.strictEqual(json(a), json(b));
  const digest = crypto.createHash('sha256').update(json(a)).digest('hex');
  assert.strictEqual(digest, fixture.expectedDigest);
});

test('save/reload preserves the exact next gameplay draw', () => {
  const a = ready();
  a.api.Game.startCampaign('normal', 77123);
  a.api.Game.doDiplo('assess-nuclear');
  const key = 'cic-save-v10';
  const raw = a.sandbox.localStorage.getItem(key);
  assert.ok(raw, 'game did not write a save');
  const saved = JSON.parse(raw);
  assert.strictEqual(saved.seed, 77123);
  assert.deepStrictEqual(saved.random, JSON.parse(json(a.api.Game.randomState())));
  a.api.Random.restore(saved.random);
  const expectedNext = a.api.Random.float();

  const b = boot();
  stubPresentation(b.api);
  b.sandbox.localStorage.setItem(key, raw);
  b.sandbox.document.dispatchEvent({ type: 'DOMContentLoaded' });
  const button = b.sandbox.document.getElementById('btn-continue');
  assert.strictEqual(button.disabled, false, 'continue was disabled for a current save');
  button.click();
  assert.strictEqual(b.api.Random.float(), expectedNext);
});

test('re-rendering the same panel does not advance campaign RNG', () => {
  const harness = boot();
  const renderAll = harness.api.UI.renderAll;
  stubPresentation(harness.api);
  harness.sandbox.document.dispatchEvent({ type: 'DOMContentLoaded' });
  harness.api.Game.startCampaign('easy', 456789);
  const before = json(harness.api.Random.state());
  renderAll(harness.api.Game.G);
  renderAll(harness.api.Game.G);
  renderAll(harness.api.Game.G);
  assert.strictEqual(json(harness.api.Random.state()), before);
});

test('cosmetic draws do not affect campaign results', () => {
  const control = ready();
  control.api.Game.startCampaign(fixture.difficulty, fixture.seed);
  control.api.CampaignReplay.applyTurn(fixture.turns[0]);
  control.api.Game.endTurn();
  const expected = control.api.CampaignReplay.summary();

  const animated = ready();
  animated.api.Game.startCampaign(fixture.difficulty, fixture.seed);
  animated.api.CampaignReplay.applyTurn(fixture.turns[0]);
  for (let i = 0; i < 2000; i++) animated.api.CosmeticRandom.float();
  animated.api.Game.endTurn();
  assert.strictEqual(json(animated.api.CampaignReplay.summary()), json(expected));
});

test('gameplay modules contain no direct Math.random calls', () => {
  const files = fs.readdirSync(path.join(ROOT, 'js')).filter((name) => name.endsWith('.js') && name !== 'random.js');
  const offenders = files.filter((name) => /Math\.random\s*\(/.test(fs.readFileSync(path.join(ROOT, 'js', name), 'utf8')));
  assert.deepStrictEqual(offenders, []);
});

test('feedback diagnostics include the reproducibility fields', () => {
  const source = fs.readFileSync(path.join(ROOT, 'js/ui.js'), 'utf8');
  for (const label of ['save ver:', 'seed:', 'replay:', 'stage:', 'missions:', 'fast-fwd:', 'report:']) {
    assert.ok(source.includes(label), `missing diagnostic ${label}`);
  }
});

console.log(`1..${passed}`);
