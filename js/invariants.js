// ============================================================
// invariants.js — fail-fast contracts for every campaign transition
// ============================================================
// This module deliberately knows only the shape of campaign state. Game owns
// the transitions; this file owns the rules every transition must preserve.

const StateInvariants = (() => {
  class StateInvariantError extends Error {
    constructor(rule, detail, phase) {
      super(`State invariant ${rule} failed${phase ? ` after ${phase}` : ''}: ${detail}`);
      this.name = 'StateInvariantError';
      this.rule = rule;
      this.phase = phase || '';
    }
  }

  const ownValue = (object, key) => {
    const descriptor = Object.getOwnPropertyDescriptor(object, key);
    return descriptor && Object.prototype.hasOwnProperty.call(descriptor, 'value')
      ? descriptor.value : undefined;
  };

  function assert(G, targets, options) {
    options = options || {};
    const phase = options.phase || 'state transition';
    const fail = (rule, detail) => { throw new StateInvariantError(rule, detail, phase); };
    const range = (rule, label, value, low, high) => {
      if (typeof value !== 'number' || !Number.isFinite(value) || value < low || value > high) {
        fail(rule, `${label} is ${String(value)}; expected ${low}..${high}`);
      }
    };

    // Numeric state must never acquire JSON's silent null representation for
    // NaN or Infinity. Inspect data properties only: derived methods are read
    // explicitly below, while getters must remain side-effect free.
    const seen = new Set();
    const finiteTree = (value, path) => {
      if (typeof value === 'number' && !Number.isFinite(value)) {
        fail('FINITE_NUMBERS', `${path} is ${String(value)}`);
      }
      if (!value || typeof value !== 'object' || seen.has(value)) return;
      seen.add(value);
      for (const key of Object.keys(value)) {
        const child = ownValue(value, key);
        if (child === undefined && !Object.prototype.hasOwnProperty.call(value, key)) continue;
        if (typeof child !== 'function') finiteTree(child, `${path}.${key}`);
      }
    };
    finiteTree(G, 'G');
    finiteTree(targets, 'TARGETS');

    for (const key of ['world', 'base', 'opposed', 'middleWith', 'rally']) {
      range('PERCENT_RANGE', `G.${key}`, G[key], 0, 100);
    }
    range('PERCENT_RANGE', 'G.approval', G.approval, 0, 100);
    if (G.israelPressure !== undefined) range('PERCENT_RANGE', 'G.israelPressure', G.israelPressure, 0, 100);
    if (G.gulf) {
      range('PERCENT_RANGE', 'G.gulf.resolve', G.gulf.resolve, 0, 100);
      range('PERCENT_RANGE', 'G.gulf.strain', G.gulf.strain, 0, 100);
    }

    const expectedApproval = G.base + G.middleWith + G.rally;
    if (Math.abs(G.approval - expectedApproval) > 1e-9) {
      fail('APPROVAL_BLOCS', `approval ${G.approval} != base + middle + rally (${expectedApproval})`);
    }
    const middleSize = 100 - G.base - G.opposed;
    if (middleSize < 0 || G.middleWith > middleSize + 1e-9) {
      fail('APPROVAL_BLOCS', `middleWith ${G.middleWith} exceeds the ${middleSize}-point persuadable bloc`);
    }

    const targetIds = new Set();
    const targetById = new Map();
    for (const target of targets || []) {
      if (!target || typeof target.id !== 'string' || !target.id) fail('TARGET_ID', 'a target has no stable id');
      if (targetIds.has(target.id)) fail('TARGET_ID', `duplicate target id ${target.id}`);
      targetIds.add(target.id);
      targetById.set(target.id, target);
      range('TARGET_HP_RANGE', `${target.id}.hp`, target.hp, 0, 100);
      const expected = target.hp <= 0 ? 'destroyed' : target.hp < 100 ? 'damaged' : 'intact';
      if (target.status !== expected) {
        fail('TARGET_STATUS', `${target.id} is ${target.status} at ${target.hp} hp; expected ${expected}`);
      }
    }

    const resources = G.res || {};
    const capacities = G.caps || {};
    for (const [key, value] of Object.entries(resources)) {
      range('RESOURCE_RANGE', `G.res.${key}`, value, 0, Number.MAX_SAFE_INTEGER);
      if (typeof capacities[key] === 'number' && value > capacities[key] + 1e-9) {
        fail('RESOURCE_RANGE', `G.res.${key} ${value} exceeds cap ${capacities[key]}`);
      }
    }
    for (const [key, value] of Object.entries(capacities)) {
      range('RESOURCE_RANGE', `G.caps.${key}`, value, 0, Number.MAX_SAFE_INTEGER);
    }
    for (const key of ['tlamPool', 'torpedoes', 'bmdPool', 'nsmPool', 'pgm', 'tankers', 'tankerCap']) {
      if (G[key] !== undefined) range('RESOURCE_RANGE', `G.${key}`, G[key], 0, Number.MAX_SAFE_INTEGER);
    }
    if (G.tankers > G.tankerCap + 1e-9) {
      fail('RESOURCE_RANGE', `G.tankers ${G.tankers} exceeds nightly cap ${G.tankerCap}`);
    }
    if (typeof options.bmdCapacity === 'number' && G.bmdPool > options.bmdCapacity + 1e-9) {
      fail('RESOURCE_RANGE', `G.bmdPool ${G.bmdPool} exceeds magazine ${options.bmdCapacity}`);
    }
    if (typeof options.nsmCapacity === 'number' && G.nsmPool > options.nsmCapacity + 1e-9) {
      fail('RESOURCE_RANGE', `G.nsmPool ${G.nsmPool} exceeds magazine ${options.nsmCapacity}`);
    }

    for (let index = 0; index < (G.missions || []).length; index++) {
      const mission = G.missions[index];
      if (!mission || !targetIds.has(mission.targetId)) {
        fail('MISSION_TARGET', `mission ${index} references missing target ${mission && mission.targetId}`);
      }
      if (!mission.pkg || typeof mission.pkg.asset !== 'string' || !mission.pkg.asset ||
          !Number.isFinite(mission.pkg.qty) || mission.pkg.qty <= 0) {
        fail('MISSION_PACKAGE', `mission ${index} has no valid package`);
      }
      const target = targetById.get(mission.targetId);
      if (!target || !(target.packages || []).some((pkg) => pkg.asset === mission.pkg.asset)) {
        fail('MISSION_PACKAGE_REFERENCE',
          `mission ${index} references unavailable ${mission.pkg.asset} package on ${mission.targetId}`);
      }
    }

    const crewIds = new Set();
    const validCrewStates = new Set(['active', 'recovering', 'mia', 'pow', 'kia']);
    const downedIds = new Set((G.downed && G.downed.crewIds) || []);
    for (const crew of G.aircrew || []) {
      if (!crew || !crew.id || crewIds.has(crew.id)) fail('AIRCREW_ID', `duplicate or missing aircrew id ${crew && crew.id}`);
      crewIds.add(crew.id);
      if (!validCrewStates.has(crew.status)) fail('AIRCREW_STATUS', `${crew.id} has status ${crew.status}`);
      if (downedIds.has(crew.id) && crew.status !== 'mia') {
        fail('AIRCREW_EXCLUSIVE', `${crew.id} is in the downed-aircrew record and marked ${crew.status}`);
      }
      if (!downedIds.has(crew.id) && crew.status === 'mia') {
        fail('AIRCREW_EXCLUSIVE', `${crew.id} is marked downed but absent from the downed-aircrew record`);
      }
    }
    for (const id of downedIds) if (!crewIds.has(id)) fail('AIRCREW_ID', `downed-aircrew record references missing ${id}`);

    const runtime = options.runtime || {};
    if (!G.over && runtime.resolving && (!runtime.resolveGuard || !runtime.watchdogArmed)) {
      fail('PLAYER_CONTROL_PATH', 'turn is locked without an active resolution guard and watchdog');
    }
    if (!G.over && runtime.controlPath === false) {
      fail('PLAYER_CONTROL_PATH', 'campaign has no direct, guarded, or player-driven route back to control');
    }
    if ((runtime.resolving && (runtime.specialOpsBusy || runtime.csarBusy)) ||
        (runtime.specialOpsBusy && runtime.csarBusy)) {
      fail('LOCK_EXCLUSIVITY', 'turn resolution, special operations, and recovery locks overlap');
    }
    if (runtime.openExclusiveDialogs && runtime.openExclusiveDialogs.length > 1) {
      fail('DIALOG_EXCLUSIVITY', `exclusive dialogs open together: ${runtime.openExclusiveDialogs.join(', ')}`);
    }

    if (options.serializable !== undefined) assertSerializable(options.serializable, fail);
    return true;
  }

  function assertSerializable(root, fail) {
    const active = new Set();
    const visit = (value, path) => {
      const kind = typeof value;
      if (value === undefined || kind === 'function' || kind === 'symbol' || kind === 'bigint') {
        fail('SAVE_SERIALIZATION', `${path} contains ${kind}`);
      }
      if (!value || kind !== 'object') return;
      if (active.has(value)) fail('SAVE_SERIALIZATION', `${path} contains a cycle`);
      active.add(value);
      if (Array.isArray(value)) value.forEach((child, index) => visit(child, `${path}[${index}]`));
      else for (const [key, child] of Object.entries(value)) visit(child, `${path}.${key}`);
      active.delete(value);
    };
    visit(root, 'save');
    let encoded;
    try { encoded = JSON.stringify(root); }
    catch (error) { fail('SAVE_SERIALIZATION', error.message); }
    try {
      const decoded = JSON.parse(encoded);
      if (JSON.stringify(decoded) !== encoded) fail('SAVE_ROUND_TRIP', 'JSON decode changed the saved payload');
    } catch (error) {
      fail('SAVE_ROUND_TRIP', error.message);
    }
  }

  return { assert, StateInvariantError };
})();
