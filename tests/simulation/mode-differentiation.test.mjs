import assert from 'node:assert/strict';
import test from 'node:test';
import { plain, start } from '../support/campaign.mjs';

function profile(Game) {
  const difficulty = Game.difficulty();
  return {
    strikeDecision: difficulty.coa === 0 ? 'manual-packages'
      : difficulty.freeTargeting ? 'staff-plan-plus-player-frag' : 'staff-plan',
    forceDecision: difficulty.autoTheater ? 'automatic-flow' : 'player-deployment-order',
    ewDecision: difficulty.ew.orders ? 'player-mission-order' : 'staff-managed',
    munitionDecision: Game.pgmLedger() ? 'finite-ledger' : 'staff-managed',
  };
}

test('easy, normal, and hard expose different kinds of decisions', () => {
  const campaigns = Object.fromEntries(['easy', 'normal', 'hard'].map((difficulty, index) => {
    const harness = start(1550 + index, difficulty);
    return [difficulty, { harness, profile: profile(harness.api.Game) }];
  }));

  assert.deepEqual(plain(campaigns.easy.profile), {
    strikeDecision: 'staff-plan',
    forceDecision: 'automatic-flow',
    ewDecision: 'staff-managed',
    munitionDecision: 'staff-managed',
  });
  assert.deepEqual(plain(campaigns.normal.profile), {
    strikeDecision: 'staff-plan-plus-player-frag',
    forceDecision: 'player-deployment-order',
    ewDecision: 'staff-managed',
    munitionDecision: 'staff-managed',
  });
  assert.deepEqual(plain(campaigns.hard.profile), {
    strikeDecision: 'manual-packages',
    forceDecision: 'player-deployment-order',
    ewDecision: 'player-mission-order',
    munitionDecision: 'finite-ledger',
  });

  assert.equal(new Set(Object.values(campaigns).map((entry) => JSON.stringify(entry.profile))).size, 3);

  assert.equal(campaigns.easy.harness.api.Game.coaOptions().length, 3);
  assert.equal(campaigns.easy.harness.api.Game.freeTargeting(), false);
  assert.equal(campaigns.easy.harness.api.Game.G.bombersOrdered, true,
    'easy did not automate its opening force-flow decision');

  assert.equal(campaigns.normal.harness.api.Game.coaOptions().length, 2);
  assert.equal(campaigns.normal.harness.api.Game.freeTargeting(), true);
  assert.equal(campaigns.normal.harness.api.Game.G.bombersOrdered, false,
    'normal silently automated a player deployment decision');

  assert.equal(campaigns.hard.harness.api.Game.coaOptions().length, 0);
  assert.equal(campaigns.hard.harness.api.Game.ewOrders(), true);
  assert.equal(campaigns.hard.harness.api.Game.pgmLedger(), true);
});
