'use strict';

const assert = require('assert');
const ResolutionMachine = require('../js/resolution.js');

function fakeClock() {
  let time = 0;
  let seq = 0;
  const timers = new Map();
  return {
    now: () => time,
    setTimeout(fn, ms) { const id = ++seq; timers.set(id, { fn, at: time + ms }); return id; },
    clearTimeout(id) { timers.delete(id); },
    advance(ms) {
      time += ms;
      const due = [...timers.entries()].filter(([, timer]) => timer.at <= time);
      for (const [id, timer] of due) { timers.delete(id); timer.fn(); }
    },
  };
}

const stages = ResolutionMachine.ORDER.filter((stage) => stage !== 'idle');

function atStage(target, options) {
  const clock = fakeClock();
  const recoveries = [];
  const machine = ResolutionMachine.create({
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    now: clock.now,
    waitingOnPlayer: options && options.waitingOnPlayer || (() => false),
    onRecover: (error, status) => recoveries.push({ error, status }),
  });
  machine.begin();
  while (machine.diagnostics().stage !== target) {
    const next = machine.diagnostics().legalNext[0];
    machine.transition(next);
  }
  return { machine, clock, recoveries };
}

// Every named stage has an independently exercised completion, timeout, and
// error path. This loop is intentionally data-driven so adding a stage without
// all three behaviors makes the test fail automatically.
for (const stage of stages) {
  const complete = atStage(stage);
  const next = complete.machine.diagnostics().legalNext[0];
  complete.machine.transition(next);
  assert.strictEqual(complete.machine.diagnostics().stage, next, `${stage} completion`);

  const timeout = atStage(stage);
  const timeoutMs = ResolutionMachine.STAGES[stage].timeoutMs;
  timeout.clock.advance(timeoutMs);
  assert.strictEqual(timeout.machine.diagnostics().stage, 'idle', `${stage} timeout recovers`);
  assert.strictEqual(timeout.recoveries.length, 1, `${stage} timeout reports once`);
  assert.strictEqual(timeout.recoveries[0].status.failedAt, stage);

  const failed = atStage(stage);
  failed.machine.fail(new Error(`boom in ${stage}`), 'error');
  assert.strictEqual(failed.machine.diagnostics().stage, 'idle', `${stage} error recovers`);
  assert.strictEqual(failed.recoveries.length, 1, `${stage} error reports once`);
  assert.strictEqual(failed.recoveries[0].status.failedAt, stage);
}

const duplicate = atStage('opening-call');
let calls = 0;
const done = duplicate.machine.callback('opening-call', 'allied-missions', () => { calls++; });
assert.strictEqual(done(), true);
assert.strictEqual(done(), false);
assert.strictEqual(calls, 1, 'stage callback is idempotent');

const illegal = atStage('opening-call');
assert.throws(() => illegal.machine.transition('retaliation-report'), /illegal resolution transition/);

let playerIsReading = true;
const playerWait = atStage('retaliation-report', { waitingOnPlayer: () => playerIsReading });
playerWait.clock.advance(ResolutionMachine.STAGES['retaliation-report'].timeoutMs);
assert.strictEqual(playerWait.machine.diagnostics().stage, 'retaliation-report');
assert.strictEqual(playerWait.recoveries.length, 0, 'a player-held report defers recovery');
playerIsReading = false;
playerWait.clock.advance(ResolutionMachine.STAGES['retaliation-report'].timeoutMs);
assert.strictEqual(playerWait.machine.diagnostics().stage, 'idle');

console.log('resolution state machine: all stage tests passed');
