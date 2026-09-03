import assert from 'node:assert/strict';
import test from 'node:test';
import { advanceTurn, seedForDraw, start, targetState } from '../support/campaign.mjs';

test('EW suppression opens only tonight\'s degraded-airspace gate and resets at dawn', () => {
  const harness = start(1401, 'hard');
  const { Game, TARGETS } = harness.api;
  for (const target of TARGETS) {
    if (target.type === 'airdefense' || target.type === 'airbase') targetState(target, 100);
  }
  assert.equal(Game.airPhase(), 'contested');
  Game.orderEw('escort');
  assert.equal(Game.G.ew.id, 'escort');
  assert.ok(Game.ewSuppression() >= 0.53);
  assert.equal(Game.airPhase(), 'degraded');
  assert.equal(Game.phaseAtLeast('superiority'), false, 'suppression alone released heavy bombers');
  assert.equal(advanceTurn(harness), true);
  assert.deepEqual({ id: Game.G.ew.id, sup: Game.G.ew.sup, hit: Game.G.ew.hit },
    { id: null, sup: 0, hit: false });
});

test('destroying the SAM belt and fighter bases releases air superiority', () => {
  const { api } = start(1402, 'normal');
  for (const target of api.TARGETS) {
    if (target.type === 'airdefense' || target.type === 'airbase') targetState(target, 0);
  }
  assert.equal(api.Game.airSuperiority(), 1);
  assert.equal(api.Game.airPhase(), 'superiority');
  assert.equal(api.Game.phaseAtLeast('superiority'), true);
  api.Game.assertInvariants('air superiority gate');
});

test('Israel pressure is a live clock that can trigger a unilateral sortie', () => {
  const harness = start(1403, 'hard');
  const { Game } = harness.api;
  Game.G.israelPressure = 100;
  assert.equal(advanceTurn(harness), true);
  assert.equal(Game.G.israelPosture, 'unilateral');
  assert.ok(Game.G.israelSorties >= 1);
});

test('the Gulf hawk and dove clocks fire benefits and caveats at their thresholds', () => {
  const hawk = start(1404, 'normal');
  hawk.api.Game.G.gulf.resolve = 100;
  hawk.api.Game.G.gulf.strain = 0;
  hawk.api.Game.G.strikesThisTurn = 1;
  hawk.api.Game.G.struckThisTurn = ['msl-kermanshah'];
  assert.equal(advanceTurn(hawk), true);
  assert.ok(hawk.api.Game.G.gulf.gifts.length >= 1, 'hawk clock produced no commitment');

  const dove = start(1405, 'normal');
  dove.api.Game.G.gulf.resolve = 0;
  dove.api.Game.G.gulf.strain = 100;
  // Civil-site photographs are a durable dove driver; oil and strait state can
  // both be repriced by the retaliation phase before this clock is evaluated.
  for (const target of dove.api.TARGETS.filter((item) => item.type === 'infra')) {
    targetState(target, 0);
  }
  assert.equal(advanceTurn(dove), true);
  assert.ok(dove.api.Game.G.gulf.caveats >= 1, 'dove clock produced no caveat');
});

test('War Powers votes once when the campaign reaches the vote turn', () => {
  const harness = start(1406, 'easy');
  const { Game } = harness.api;
  Game.G.turn = Game.WAR_POWERS_TURN;
  assert.equal(Game.G.warPowers.done, false);
  advanceTurn(harness);
  assert.equal(Game.G.warPowers.done, true);
  assert.ok(['authorized', 'restricted', 'cutoff'].includes(Game.G.warPowers.result));
});

test('breakout progress opens the nuclear decision window on the crossing turn', () => {
  const harness = start(1407, 'normal');
  const { Game } = harness.api;
  Game.G.breakout.progress = Game.G.breakout.need - 0.1;
  assert.equal(advanceTurn(harness), true);
  assert.equal(Game.G.nuclear.tested, true);
  assert.equal(Game.nuclearState().open, true);
  assert.equal(Game.releaseOptions().length, 3);
});

test('the negotiation window requires a destroyed program and a broken missile/naval sum', () => {
  const { api } = start(1408, 'normal');
  const { Game, TARGETS } = api;
  assert.equal(Game.G.negotiationReady(), false);
  for (const target of TARGETS) {
    if (target.enrichment || ['missile', 'tel', 'naval', 'ship'].includes(target.type)) targetState(target, 0);
  }
  assert.equal(Game.G.nukeDegraded(), 100);
  assert.equal(Game.G.negotiationReady(), true);
  assert.equal(Game.G.dealProgress().open, true);
  Game.assertInvariants('negotiation gate');
});

function finishFrom(setup, expectedKind, title) {
  const harness = start(1450 + title.length, 'normal');
  setup(harness.api);
  harness.api.Game.afterAction();
  const result = harness.presentation.getEndgame();
  assert.ok(result, `${title} did not produce an ending`);
  assert.equal(result.kind, expectedKind);
  return result;
}

test('victory, defeat, armistice, and stalemate gates remain distinct', async (t) => {
  await t.test('decisive victory', () => {
    const result = finishFrom(({ TARGETS }) => {
      for (const target of TARGETS) {
        if (target.enrichment || ['missile', 'tel', 'naval', 'ship'].includes(target.type) || target.id === 'irgc-hq') {
          targetState(target, 0);
        }
      }
    }, 'victory', 'victory');
    assert.match(result.title, /VICTORY/);
  });

  await t.test('approval defeat', () => {
    const result = finishFrom(({ Game }) => {
      Game.G.base = 10;
      Game.G.opposed = 50;
      Game.G.middleWith = 0;
      Game.G.rally = 0;
    }, 'defeat', 'defeat');
    assert.match(result.title, /PRESIDENCY|DEFEAT/);
  });

  await t.test('negotiated armistice', () => {
    const harness = start(1461, 'normal');
    const { Game, Random, TARGETS } = harness.api;
    for (const target of TARGETS) {
      if (target.enrichment || ['missile', 'tel', 'naval', 'ship'].includes(target.type)) targetState(target, 0);
    }
    seedForDraw(Random, (draw) => draw < Game.G.dealOdds());
    Game.doDiplo('backchannel');
    const result = harness.presentation.getEndgame();
    assert.ok(result, 'armistice did not produce an ending');
    assert.equal(result.kind, 'victory');
    assert.match(result.title, /ARMISTICE/);
  });

  await t.test('overtime stalemate', () => {
    const result = finishFrom(({ Game, TARGETS }) => {
      for (const target of TARGETS.filter((item) => item.enrichment)) targetState(target, 0);
      Game.G.turn = Game.G.softCap + 1;
      Game.G.base = 10;
      Game.G.opposed = 50;
      Game.G.middleWith = 0;
      Game.G.rally = 0;
    }, 'stalemate', 'stalemate');
    assert.match(result.title, /STALEMATE|CULMINATES|WAR FROZEN/);
  });
});
