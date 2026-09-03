import assert from 'node:assert/strict';
import test from 'node:test';
import {
  advanceTurn, assertInvisibleRoundTrip, reveal, start, targetState,
} from '../support/campaign.mjs';

test('fixed seeds round-trip at the start of every sampled turn', async (t) => {
  for (const seed of [21001, 21017, 21103]) {
    await t.test(`seed ${seed}`, () => {
      let harness = start(seed, 'normal');
      for (let turn = 1; turn <= 5 && !harness.api.Game.G.over; turn++) {
        assert.equal(harness.api.Game.G.turn, turn);
        harness = assertInvisibleRoundTrip(harness, `seed ${seed}, turn ${turn} start`);
        assert.equal(advanceTurn(harness), true);
      }
    });
  }
});

const ACTIONS = [
  ['sanctions'], ['coalition'], ['israel'], ['restrain'], ['gcc'], ['patriots'],
  ['corridor', ({ Game }) => { Game.G.gulf.resolve = 100; }],
  ['address'], ['spr'], ['backchannel'],
  ['assess-nuclear'], ['assess-intent'], ['isr-prep'], ['folder'],
  ['bda', ({ Game, TARGETS }) => {
    const target = targetState(TARGETS.find((item) => item.id === 'ad-tehran'), 50);
    Game.G.intel[target.id] = { hp: 45, turn: Game.G.turn - 3, sharp: false };
  }],
  ['hunt', ({ TARGETS }) => {
    const tel = reveal(TARGETS.find((item) => item.type === 'tel'));
    targetState(tel, 55);
    tel.located = false;
  }],
];

test('every diplomacy and intelligence action is behaviorally invisible across reload', async (t) => {
  for (let index = 0; index < ACTIONS.length; index++) {
    const [action, setup] = ACTIONS[index];
    await t.test(action, () => {
      const harness = start(22000 + index, 'normal');
      if (setup) setup(harness.api);
      harness.api.Game.doDiplo(action);
      const isIntel = ['assess-nuclear', 'assess-intent', 'isr-prep', 'folder', 'bda', 'hunt'].includes(action);
      assert.equal(isIntel ? harness.api.Game.G.intelUsed : harness.api.Game.G.diploUsed, true,
        `${action} did not consume its action slot`);
      assertInvisibleRoundTrip(harness, `action ${action}`);
    });
  }
});

test('mission order and recall both round-trip without changing the next outcome', () => {
  let harness = start(23001, 'normal');
  const target = harness.api.TARGETS.find((item) => item.id === 'ad-tehran');
  const pkg = target.packages.find((item) => item.asset === 'f35');
  harness.api.Game.executeStrike(target, pkg);
  assert.equal(harness.api.Game.G.missions.length, 1);
  harness = assertInvisibleRoundTrip(harness, 'ordered mission');
  assert.equal(harness.api.Game.recallMission(0), true);
  assert.equal(harness.api.Game.G.missions.length, 0);
  assertInvisibleRoundTrip(harness, 'recalled mission');
});

test('carrier, bomber, rearm, and force-flow decisions round-trip', async (t) => {
  const cases = [
    ['carrier ordered', (harness) => harness.api.Game.orderCarrier()],
    ['carrier reposition ordered', (harness) => harness.api.Game.toggleCarrierPosture('csg-lincoln')],
    ['bombers ordered', (harness) => harness.api.Game.orderBombers()],
    ['heavies ordered', (harness) => {
      for (const target of harness.api.TARGETS) {
        if (target.type === 'airdefense' || target.type === 'airbase') targetState(target, 0);
      }
      harness.api.Game.orderHeavies();
    }],
    ['BMD rearm ordered', (harness) => {
      harness.api.Game.G.bmdPool = 0;
      harness.api.Game.orderRearm();
    }],
  ];
  for (let index = 0; index < cases.length; index++) {
    const [label, action] = cases[index];
    await t.test(label, () => {
      const harness = start(23100 + index, 'normal');
      action(harness);
      assertInvisibleRoundTrip(harness, label);
    });
  }

  let flow = start(23150, 'normal');
  while (flow.api.Game.G.turn < 4 && !flow.api.Game.G.over) advanceTurn(flow);
  assert.ok(flow.api.Game.G.forceFlow.landed.length > 0, 'force flow never landed');
  assertInvisibleRoundTrip(flow, 'landed force-flow wave');
});

test('post-BDA and post-retaliation state round-trips at the next legal save point', () => {
  const harness = start(23200, 'normal');
  const target = harness.api.TARGETS.find((item) => item.id === 'ad-tehran');
  const pkg = target.packages.find((item) => item.asset === 'f35');
  harness.api.Game.executeStrike(target, pkg);
  assert.equal(advanceTurn(harness), true);
  assert.ok(harness.presentation.reports.some((report) => /BATTLE DAMAGE ASSESSMENT/.test(report.title)));
  assert.ok(harness.presentation.reports.some((report) => /IRANIAN RETALIATION/.test(report.title)));
  assertInvisibleRoundTrip(harness, 'completed BDA and retaliation');
});

test('high-risk persistent states survive the save matrix', async (t) => {
  const cases = [
    ['downed aircrew', ({ Game, TARGETS }) => {
      const crew = Game.G.aircrew[0];
      crew.status = 'mia';
      crew.since = Game.G.turn;
      Game.G.downed = {
        callsign: 'TEST 01', type: crew.air, crew: 1, crewIds: [crew.id],
        targetId: TARGETS[0].id, loc: 'test location', x: 100, y: 100,
        turn: Game.G.turn, turnsOut: 0, isr: false,
      };
    }],
    ['resolved active raid', ({ Game }) => { Game.G.raid = 'success'; Game.G.raidThisTurn = true; }],
    ['Israeli pressure', ({ Game }) => { Game.G.israelPressure = 94; Game.G.israelHold = 1; }],
    ['pending War Powers vote', ({ Game }) => {
      Game.G.turn = Game.WAR_POWERS_TURN - 1;
      Game.G.warPowers = { done: false, result: null, noOil: false, noDeep: false };
    }],
    ['open negotiation window', ({ Game, TARGETS }) => {
      for (const target of TARGETS) {
        if (target.enrichment || ['missile', 'tel', 'naval', 'ship'].includes(target.type)) targetState(target, 0);
      }
      assert.equal(Game.G.negotiationReady(), true);
    }],
  ];
  for (let index = 0; index < cases.length; index++) {
    const [label, setup] = cases[index];
    await t.test(label, () => {
      const harness = start(23300 + index, 'normal');
      setup(harness.api);
      assertInvisibleRoundTrip(harness, label);
    });
  }
});
