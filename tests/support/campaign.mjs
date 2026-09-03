import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { boot, stubPresentation, ready } = require('./headless.js');

export const SAVE_KEY = 'cic-save-v10';
export { boot, ready, stubPresentation };

export function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

export function start(seed = 1001, difficulty = 'normal') {
  const harness = ready();
  harness.api.Game.startCampaign(difficulty, seed);
  return harness;
}

export function targetState(target, hp) {
  target.hp = hp;
  target.status = hp <= 0 ? 'destroyed' : hp < 100 ? 'damaged' : 'intact';
  return target;
}

export function reveal(target) {
  target.released = true;
  target.found = true;
  target.dispersed = true;
  target.located = true;
  return target;
}

export function nextDraw(Random) {
  const state = Random.state();
  const draw = Random.float();
  Random.restore(state);
  return draw;
}

export function seedForDraw(Random, predicate = (draw) => draw < 0.01) {
  for (let seed = 1; seed < 100000; seed++) {
    Random.seed(seed);
    if (predicate(Random.float())) {
      Random.seed(seed);
      return seed;
    }
  }
  throw new Error('could not find a deterministic draw matching the predicate');
}

function safe(read) {
  try { return plain(read()); }
  catch (error) { return { threw: error.message }; }
}

export function observable(harness) {
  const { Game, IranAI, Random, TARGETS, UI } = harness.api;
  const G = Game.G;
  const targets = Object.fromEntries(TARGETS.map((target) => [target.id, {
    hp: target.hp,
    status: target.status,
    dispersed: !!target.dispersed,
    located: !!target.located,
    lastStruck: target.lastStruck || 0,
    killedOnce: !!target.killedOnce,
    found: !!target.found,
    suspected: !!target.suspected,
    leads: target.leads || 0,
    worked: target.worked || 0,
    released: !!target.released,
    packages: (target.packages || []).map((pkg) => ({
      asset: pkg.asset, qty: pkg.qty, weapon: pkg.weapon || '', escort: pkg.escort || '',
      sub: !!pkg.sub, joint: !!pkg.joint, label: pkg.label || '',
    })),
  }]));

  const actionRows = safe(() => UI.diploActions(G).map((action) => ({
    id: action.id,
    disabled: !!action.disabled,
    current: action.current || '',
  })));
  const packageGates = Object.fromEntries(TARGETS.map((target) => [target.id,
    (target.packages || []).map((pkg) => Game.pkgBlock(target, pkg) || null)]));
  // Building the briefing slate intentionally memoizes it for the rest of the
  // turn. Observe it before taking the save snapshot so both sides compare the
  // same legal, player-visible state rather than the test helper's call order.
  const coursesOfAction = safe(() => Game.coaOptions());

  return plain({
    save: Game.saveSnapshot(),
    targets,
    derived: {
      approval: G.approval,
      middleSize: G.middleSize,
      nuclearDegraded: G.nukeDegraded(),
      iranCapacity: G.iranCapacity(),
      warMachine: G.warMachine(),
      dealProgress: G.dealProgress(),
      dealOdds: G.dealOdds(),
      airSuperiority: Game.airSuperiority(),
      airPhase: Game.airPhase(),
      airDefenseWeight: Game.airDefenseWeight(),
      tankerCapacity: Game.tankerCapacity(),
      bmdRate: Game.bmdRate(),
      bmdFraction: Game.bmdFrac(),
      israel: Game.israelStatus(),
      israelEta: Game.israelEta(),
      gulfHawkEta: Game.gulfEta('hawk'),
      gulfDoveEta: Game.gulfEta('dove'),
      breakout: Game.breakoutEstimate(),
      missileStrength: IranAI.missileStrength(),
      navalStrength: IranAI.navalStrength(),
    },
    actions: {
      diplomacy: actionRows,
      intelligence: safe(() => UI.intelParts(G)),
      electronicWarfare: safe(() => Game.ewOrders()),
      coursesOfAction,
      nuclear: safe(() => Game.releaseOptions()),
      packageGates,
    },
    nextRandom: nextDraw(Random),
  });
}

export function savedRaw(harness) {
  const raw = harness.sandbox.localStorage.getItem(SAVE_KEY);
  assert.ok(raw, 'the game did not write a save at this legal save point');
  return raw;
}

export function writeSave(harness) {
  harness.sandbox.document.getElementById('btn-save-quit').click();
  return savedRaw(harness);
}

export function restore(raw) {
  const harness = boot();
  const presentation = stubPresentation(harness.api);
  harness.sandbox.localStorage.setItem(SAVE_KEY, raw);
  harness.sandbox.document.dispatchEvent({ type: 'DOMContentLoaded' });
  const button = harness.sandbox.document.getElementById('btn-continue');
  assert.equal(button.disabled, false, 'Continue was disabled for a current save');
  button.click();
  return Object.assign(harness, { presentation });
}

export function assertInvisibleRoundTrip(harness, label) {
  const before = observable(harness);
  const resumed = restore(writeSave(harness));
  assert.deepEqual(observable(resumed), before, `${label} changed across save/reload`);
  resumed.api.Game.assertInvariants(`round-trip: ${label}`);
  return resumed;
}

export function advanceTurn(harness, duration = 120000) {
  const before = harness.api.Game.G.turn;
  harness.api.Game.endTurn();
  harness.clock.advance(duration);
  return harness.api.Game.G.turn > before;
}
