'use strict';

const assert = require('assert');
const Rules = require('../js/rules.js');

const approvalConfig = {
  sensitivity: 0.5, habitFloor: 0.25, habitStep: 0.2, habitRecover: 0.1,
  rallyPer: 2, revertTo: 0.5, revert: 0.1,
};
const publicState = { base: 28, opposed: 30, middleWith: 21, rally: 8, habit: { missile: 2 } };
assert.strictEqual(Rules.Politics.approval(publicState), 57);
assert.strictEqual(Rules.Politics.middleSize(publicState), 42);
const moved = Rules.Politics.movePublic(publicState, -10, 'missile', approvalConfig);
assert.strictEqual(moved.delta, -3);
assert.deepStrictEqual(moved.habit, { missile: 3 });
assert.deepStrictEqual(publicState.habit, { missile: 2 }, 'political calculation must not mutate input');
const eroded = Rules.Politics.erodeBase(publicState, 3, 0.5, true);
assert.deepStrictEqual(eroded, { base: 26, opposed: 32, middleWith: 21, delta: 2 });

assert.strictEqual(Rules.Targets.status(100), 'intact');
assert.strictEqual(Rules.Targets.status(50), 'damaged');
assert.strictEqual(Rules.Targets.status(0), 'destroyed');
assert.deepStrictEqual(Rules.Targets.damage({ hp: 20 }, 25), { hp: 0, status: 'destroyed' });
const rebuilt = Rules.Targets.repair({
  target: { hp: 0, type: 'airdefense', status: 'destroyed', killedOnce: true, lastStruck: 2 },
  repairRates: { airdefense: 5 }, reconstitution: { cap: 60, quiet: 4, rate: 5 },
  turn: 6, struck: false, efficiency: 0.5,
});
assert.deepStrictEqual(rebuilt, {
  hp: 3, status: 'damaged', reconstituted: true, returned: true,
});

const estimate = Rules.Assessment.estimate({
  target: { hp: 40, type: 'airdefense' }, record: { hp: 35, turn: 3, sharp: false }, turn: 5,
  repairRates: { airdefense: 5 }, freshSpread: 8, sharpSpread: 3, ageSpread: 6,
});
assert.deepStrictEqual(estimate, { lo: 15, hi: 65, mid: 40, known: false, age: 2 });

const strike = Rules.Strike.estimate({
  profile: { ad: 0.4, attrition: 0.01, loss: 0.1 }, airDefense: 0.5,
  raw: false, rawPenalty: 0.22, rawLossMultiplier: 3, over: 1,
  surgeEffects: 0.08, surgeLoss: 0.5, base: 0.8, adaptPenalty: 0.05,
  damageBonus: 0.15, levelEdge: 0, gradual: true, oneShot: false,
});
assert.strictEqual(strike.success, 0.62);
assert.strictEqual(strike.fullOdds, 0.31);
assert(Math.abs(strike.lossRisk - 0.09) < 1e-12);

assert.deepStrictEqual(
  Rules.Resources.strikeBill({ asset: 'cruise', qty: 2 }, { resourceKey: 'cruise', tankers: 0, pgm: 0 }),
  { magazine: null, magazineAmount: 0, readyAsset: 'cruise', readyAmount: 2, tlam: 2,
    pgm: 0, tankers: 0, joint: false, adaptation: 'cruise', tasking: 0, surge: false }
);

const targets = [
  { enrichment: true, hp: 0, weight: 2 },
  { enrichment: true, hp: 50, weight: 1 },
  { enrichment: false, hp: 0 },
];
assert.strictEqual(Rules.Victory.degradation(targets), 83);
assert.strictEqual(Rules.Victory.ending({
  over: false, degradation: 100, iranBroken: true, nuclearTested: false, nuclearDefused: false,
  turn: 4, nuclearTestedTurn: -1, nuclearWindow: 3, casualties: 0, casualtyLimit: 100,
  approval: 50, collapseAt: 20, softCap: 30, hormuzClosedTurns: 0, hormuzLimit: 12, oil: 90,
}).reason, 'military');

const state = { turn: 2, res: { f35: 1 } };
const saved = Rules.Save.serialize({
  version: 1, seed: 77, random: { seed: 77, state: 88, calls: 2 }, muted: false,
  coaCache: { turn: 2, list: [] }, state, fieldNames: ['turn', 'res'],
  targets: [{ id: 'a', hp: 80, dispersed: true }],
});
assert.strictEqual(saved.seed, 77);
assert.deepStrictEqual(saved.random, { seed: 77, state: 88, calls: 2 });
assert(Rules.Save.validate(saved, {
  version: 1, fieldNames: ['turn', 'res'], targetIds: ['a'], requireRandom: true,
}).ok);
saved.targets.a.hp = 101;
assert(!Rules.Save.validate(saved, { version: 1, fieldNames: ['turn', 'res'], targetIds: ['a'] }).ok);

console.log('pure rules: all tests passed');
