// ============================================================
// resolution.js — explicit turn-resolution state machine
// ============================================================
// This controller owns sequencing diagnostics, legal transitions, per-stage
// timeouts, and stale-callback suppression. Stage bodies remain in game.js so
// this extraction changes orchestration without changing campaign arithmetic.

const ResolutionMachine = (() => {
  const STAGES = Object.freeze({
    idle: Object.freeze({ next: ['opening-call'], wait: 'none', timeoutMs: 0,
      recovery: 'none', commit: false }),
    'opening-call': Object.freeze({ next: ['allied-missions'], wait: 'media', timeoutMs: 45000,
      recovery: 'advance-with-committed-effects', commit: false }),
    'allied-missions': Object.freeze({ next: ['bda'], wait: 'media-or-timer', timeoutMs: 180000,
      recovery: 'advance-with-committed-effects', commit: true }),
    bda: Object.freeze({ next: ['allied-event'], wait: 'media', timeoutMs: 90000,
      recovery: 'advance-with-committed-effects', commit: true }),
    'allied-event': Object.freeze({ next: ['iranian-response'], wait: 'media-or-player', timeoutMs: 1800000,
      recovery: 'advance-with-committed-effects', commit: false }),
    'iranian-response': Object.freeze({ next: ['retaliation-report'], wait: 'media', timeoutMs: 120000,
      recovery: 'advance-with-committed-effects', commit: true }),
    'retaliation-report': Object.freeze({ next: ['close'], wait: 'player', timeoutMs: 1800000,
      recovery: 'advance-with-committed-effects', commit: true }),
    close: Object.freeze({ next: ['idle'], wait: 'none', timeoutMs: 45000,
      recovery: 'advance-with-committed-effects', commit: true }),
  });

  const ORDER = Object.freeze(Object.keys(STAGES));

  function create(options) {
    const setTimer = options && options.setTimeout || setTimeout;
    const clearTimer = options && options.clearTimeout || clearTimeout;
    const now = options && options.now || Date.now;
    const waitingOnPlayer = options && options.waitingOnPlayer || (() => false);
    const onRecover = options && options.onRecover || (() => {});
    const onTransition = options && options.onTransition || (() => {});

    let current = 'idle';
    let lastCommitted = 'idle';
    let startedAt = now();
    let timer = 0;
    let cycle = 0;
    let lastError = null;
    let history = [];

    function descriptor(stage) {
      return STAGES[stage];
    }

    function clearStageTimer() {
      if (timer) clearTimer(timer);
      timer = 0;
    }

    function arm() {
      clearStageTimer();
      const stage = descriptor(current);
      if (!stage || !stage.timeoutMs) return;
      const token = cycle;
      const expected = current;
      timer = setTimer(() => {
        if (cycle !== token || current !== expected) return;
        if ((stage.wait === 'player' || stage.wait === 'media-or-player') && waitingOnPlayer()) {
          history.push({ type: 'timeout-deferred', stage: current, at: now() });
          arm();
          return;
        }
        fail(new Error(`turn resolution timed out in ${current} after ${stage.timeoutMs}ms`), 'timeout');
      }, stage.timeoutMs);
    }

    function snapshot() {
      const stage = descriptor(current);
      return {
        cycle,
        stage: current,
        wait: stage.wait,
        timeoutMs: stage.timeoutMs,
        recovery: stage.recovery,
        startedAt,
        elapsedMs: Math.max(0, now() - startedAt),
        lastCommitted,
        lastError,
        legalNext: stage.next.slice(),
        history: history.slice(-20),
      };
    }

    function fail(error, reason) {
      if (current === 'idle') return false;
      const failedAt = current;
      clearStageTimer();
      lastError = {
        stage: failedAt,
        reason: reason || 'error',
        message: error && error.message ? error.message : String(error),
        at: now(),
      };
      history.push({ type: reason || 'error', stage: failedAt, at: now() });
      current = 'idle';
      startedAt = now();
      cycle++;
      try { onRecover(error, { failedAt, lastCommitted, reason: reason || 'error' }); }
      catch (recoveryError) { lastError.recoveryError = String(recoveryError); }
      onTransition(snapshot());
      return true;
    }

    function transition(next, onEnter) {
      const stage = descriptor(current);
      if (!descriptor(next)) throw new Error(`unknown resolution stage: ${next}`);
      if (!stage.next.includes(next)) {
        throw new Error(`illegal resolution transition: ${current} -> ${next}`);
      }

      clearStageTimer();
      if (stage.commit) lastCommitted = current;
      history.push({ type: 'complete', stage: current, next, at: now() });
      current = next;
      startedAt = now();
      arm();
      onTransition(snapshot());
      if (onEnter) {
        try { onEnter(); }
        catch (error) { fail(error, 'error'); }
      }
      return true;
    }

    function begin(onEnter) {
      if (current !== 'idle') return false;
      cycle++;
      lastCommitted = 'idle';
      lastError = null;
      history = [];
      return transition('opening-call', onEnter);
    }

    function callback(expected, next, onEnter) {
      const token = cycle;
      let called = false;
      return function () {
        if (called || token !== cycle || current !== expected) return false;
        called = true;
        const self = this;
        const args = arguments;
        return transition(next, () => { if (onEnter) onEnter.apply(self, args); });
      };
    }

    function heartbeat(expected) {
      if (current === 'idle' || (expected && expected !== current)) return false;
      arm();
      return true;
    }

    function finish(onIdle) {
      if (current !== 'close') return false;
      return transition('idle', onIdle);
    }

    function reset(error) {
      clearStageTimer();
      if (error) {
        lastError = { stage: current, reason: 'watchdog', message: error.message || String(error), at: now() };
      }
      current = 'idle';
      startedAt = now();
      cycle++;
      onTransition(snapshot());
    }

    return { begin, transition, callback, heartbeat, finish, fail, reset, diagnostics: snapshot };
  }

  return { STAGES, ORDER, create };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = ResolutionMachine;
