import assert from 'node:assert/strict';
import test from 'node:test';
import {
  advanceTurn, plain, reveal, seedForDraw, start, targetState,
} from '../support/campaign.mjs';

test('a real strike damages a target and keeps status synchronized', () => {
  const harness = start(1201, 'normal');
  const { Game, Random, TARGETS } = harness.api;
  const target = TARGETS.find((item) => item.id === 'ad-tehran');
  const pkg = target.packages.find((item) => item.asset === 'f35');
  seedForDraw(Random, (draw) => draw < 0.01);
  Game.executeStrike(target, pkg);
  assert.equal(Game.G.missions.length, 1);
  assert.equal(advanceTurn(harness), true);
  assert.ok(target.hp < 100, `strike left target at ${target.hp}`);
  assert.equal(target.status, target.hp <= 0 ? 'destroyed' : 'damaged');
});

test('ships are destroyed in one successful hit and never become damaged', () => {
  const harness = start(1202, 'normal');
  const { Game, Random, TARGETS } = harness.api;
  const target = reveal(TARGETS.find((item) => item.id === 'ship-mahdavi'));
  const pkg = target.packages.find((item) => item.sub);
  seedForDraw(Random, (draw) => draw < 0.01);
  Game.executeStrike(target, pkg);
  assert.equal(advanceTurn(harness), true);
  assert.equal(target.hp, 0);
  assert.equal(target.status, 'destroyed');
});

test('damaged targets repair when left alone', () => {
  const harness = start(1203, 'normal');
  const { Game, TARGETS } = harness.api;
  const target = targetState(TARGETS.find((item) => item.id === 'irgc-hq'), 40);
  target.lastStruck = 0;
  const before = target.hp;
  assert.equal(advanceTurn(harness), true);
  assert.ok(target.hp > before, `target did not repair above ${before}`);
  assert.equal(target.status, 'damaged');
});

test('destroyed air defenses reconstitute only as a capped damaged site', () => {
  const harness = start(1204, 'normal');
  const { Game, TARGETS } = harness.api;
  Game.G.turn = 6;
  const target = targetState(TARGETS.find((item) => item.id === 'ad-tehran'), 0);
  target.killedOnce = true;
  target.lastStruck = 1;
  assert.equal(advanceTurn(harness), true);
  assert.ok(target.hp > 0 && target.hp <= 60, `reconstituted hp was ${target.hp}`);
  assert.equal(target.status, 'damaged');
});

test('approval is exactly the sum of its blocs and only public-movement APIs change it', () => {
  const { api } = start(1205, 'normal');
  const { Game } = api;
  const before = Game.G.approval;
  const moved = Game.movePublic(-7);
  assert.equal(Game.G.approval, before + moved);
  assert.equal(Game.G.approval, Game.G.base + Game.G.middleWith + Game.G.rally);
  const base = Game.G.base;
  Game.erodeBase(2);
  assert.ok(Game.G.base < base);
  assert.equal(Game.G.approval, Game.G.base + Game.G.middleWith + Game.G.rally);
  assert.throws(() => { Game.G.approval = 99; }, /derived from the blocs/);
  Game.assertInvariants('approval arithmetic');
});

test('missile and naval strength are normalized to 0..2 and respond to weighted losses', () => {
  const { api } = start(1206, 'normal');
  const { Game, IranAI, TARGETS } = api;
  assert.equal(IranAI.missileStrength(), 2);
  assert.equal(IranAI.navalStrength(), 2);

  const missile = TARGETS.find((item) => item.type === 'missile');
  targetState(missile, 0);
  const missileAfter = IranAI.missileStrength();
  assert.ok(missileAfter >= 0 && missileAfter < 2);

  const naval = TARGETS.find((item) => item.type === 'naval');
  targetState(naval, 0);
  const navalAfter = IranAI.navalStrength();
  assert.ok(navalAfter >= 0 && navalAfter < 2);
  assert.notEqual(navalAfter, missileAfter, 'different weighted rosters collapsed to one raw count');
  Game.assertInvariants('normalized strength');
});

test('BDA uncertainty widens with age and collection narrows it', () => {
  const harness = start(1207, 'normal');
  const { Game, TARGETS } = harness.api;
  const target = targetState(TARGETS.find((item) => item.id === 'ad-tehran'), 55);
  Game.G.intel[target.id] = { hp: 55, turn: Game.G.turn, sharp: false };
  const fresh = plain(Game.estimate(target));
  Game.G.turn += 3;
  const stale = plain(Game.estimate(target));
  assert.ok(stale.hi - stale.lo > fresh.hi - fresh.lo);
  Game.doDiplo('bda');
  const collected = plain(Game.estimate(target));
  assert.ok(collected.hi - collected.lo <= 6, `collection left a ${collected.hi - collected.lo}-point band`);
});
