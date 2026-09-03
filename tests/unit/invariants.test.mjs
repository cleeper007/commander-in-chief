import assert from 'node:assert/strict';
import test from 'node:test';
import { start } from '../support/campaign.mjs';

function quietStart(seed) {
  const harness = start(seed);
  // These cases deliberately trip the production fail-fast boundary. Keep the
  // expected diagnostic out of compact CI logs; the assertion still verifies it.
  harness.sandbox.console = { ...console, error() {} };
  return harness;
}

function violation(run, rule) {
  assert.throws(run, (error) => {
    assert.equal(error.name, 'StateInvariantError');
    assert.equal(error.rule, rule);
    assert.match(error.message, new RegExp(rule));
    return true;
  });
}

test('invariant failures are fail-fast and name the violated rule', () => {
  const { api } = quietStart(1101);
  api.Game.G.res.f35 = Number.NaN;
  violation(() => api.Game.assertInvariants('test transition'), 'FINITE_NUMBERS');
  assert.equal(api.Game.G.over, true, 'an invalid campaign remained playable');
});

test('target condition and status cannot disagree', () => {
  const { api } = quietStart(1102);
  const target = api.TARGETS.find((item) => item.id === 'ad-tehran');
  target.hp = 0;
  target.status = 'intact';
  violation(() => api.Game.assertInvariants('bad target'), 'TARGET_STATUS');
});

test('missions must reference a real target and a valid package', () => {
  const { api } = quietStart(1103);
  api.Game.G.missions.push({ targetId: 'missing-target', pkg: { asset: 'f35', qty: 1 }, eta: 1 });
  violation(() => api.Game.assertInvariants('bad mission'), 'MISSION_TARGET');
});

test('missions cannot name a package the target does not offer', () => {
  const { api } = quietStart(1108);
  api.Game.G.missions.push({
    targetId: 'ad-tehran', pkg: { asset: 'imaginary-aircraft', qty: 1 }, eta: 1,
  });
  violation(() => api.Game.assertInvariants('bad package reference'), 'MISSION_PACKAGE_REFERENCE');
});

test('downed aircrew cannot also be available, captured, or dead', () => {
  const { api } = quietStart(1104);
  const crew = api.Game.G.aircrew[0];
  api.Game.G.downed = { crewIds: [crew.id] };
  crew.status = 'active';
  violation(() => api.Game.assertInvariants('bad crew state'), 'AIRCREW_EXCLUSIVE');
});

test('saved fields reject values JSON cannot round-trip', () => {
  const { api } = start(1105);
  violation(() => api.StateInvariants.assert(api.Game.G, api.TARGETS, {
    phase: 'save probe',
    serializable: { valid: 1, invalid: undefined },
  }), 'SAVE_SERIALIZATION');
});

test('a live turn lock always has a guard and watchdog back to player control', () => {
  const { api } = start(1106);
  violation(() => api.StateInvariants.assert(api.Game.G, api.TARGETS, {
    phase: 'orphaned lock',
    runtime: { resolving: true, resolveGuard: false, watchdogArmed: false },
  }), 'PLAYER_CONTROL_PATH');
});

test('exclusive resolution dialogs cannot be active together', () => {
  const { api } = start(1107);
  violation(() => api.StateInvariants.assert(api.Game.G, api.TARGETS, {
    phase: 'dialog probe',
    runtime: { openExclusiveDialogs: ['report-modal', 'warpowers-modal'] },
  }), 'DIALOG_EXCLUSIVITY');
});

test('turn, special-operations, and recovery locks cannot overlap', () => {
  const { api } = start(1109);
  violation(() => api.StateInvariants.assert(api.Game.G, api.TARGETS, {
    phase: 'lock probe',
    runtime: {
      resolving: true, resolveGuard: true, watchdogArmed: true,
      specialOpsBusy: true, csarBusy: false,
    },
  }), 'LOCK_EXCLUSIVITY');
});
