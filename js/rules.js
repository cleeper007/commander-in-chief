// ============================================================
// rules.js — pure campaign calculations
// ============================================================
// Every function in this file accepts its complete input and returns data. It
// does not read Game.G, TARGETS, the DOM, audio, timers, or browser storage.
// game.js remains the orchestration and mutation boundary for now.

const GameRules = (() => {
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  const Politics = {
    middleSize: (state) => 100 - state.base - state.opposed,
    approval: (state) => state.base + state.middleWith + state.rally,

    habitMultiplier(state, cls, config) {
      const count = state.habit[cls] || 0;
      return Math.max(config.habitFloor, 1 - config.habitStep * count);
    },

    movePublic(state, amount, cls, config) {
      if (!amount) return { middleWith: state.middleWith, habit: state.habit, delta: 0 };
      let adjusted = amount * config.sensitivity;
      const habit = cls ? { ...state.habit } : state.habit;
      if (cls) {
        adjusted *= Politics.habitMultiplier(state, cls, config);
        habit[cls] = (habit[cls] || 0) + 1;
      }
      const middleWith = clamp(state.middleWith + adjusted, 0, Politics.middleSize(state));
      return { middleWith, habit, delta: middleWith - state.middleWith };
    },

    recoverHabits(state, config) {
      const habit = { ...state.habit };
      for (const key of Object.keys(habit)) {
        habit[key] = Math.max(0, habit[key] - config.habitRecover / config.habitStep);
        if (!habit[key]) delete habit[key];
      }
      return habit;
    },

    erodeBase(state, amount, erosionScale, whole) {
      if (!amount) return { base: state.base, opposed: state.opposed, middleWith: state.middleWith, delta: 0 };
      const raw = amount * (erosionScale == null ? 1 : erosionScale);
      const hit = Math.min(state.base, whole === false ? raw : Math.max(1, Math.round(raw)));
      const base = state.base - hit;
      const opposed = state.opposed + hit;
      const middleWith = clamp(state.middleWith, 0, 100 - base - opposed);
      return { base, opposed, middleWith, delta: hit };
    },

    decayRally(state, config) {
      const rally = Math.max(0, state.rally - config.rallyPer);
      return { rally, delta: rally - state.rally };
    },

    revert(state, config) {
      const neutral = Politics.middleSize(state) * config.revertTo;
      const middleWith = clamp(
        state.middleWith + (neutral - state.middleWith) * config.revert,
        0,
        Politics.middleSize(state)
      );
      return { middleWith, delta: middleWith - state.middleWith };
    },
  };

  const Targets = {
    wearsDown(target, repairRates) {
      return repairRates[target.type] !== undefined;
    },

    status(hp) {
      return hp <= 0 ? 'destroyed' : hp < 100 ? 'damaged' : 'intact';
    },

    damage(target, amount) {
      const hp = clamp(target.hp - amount, 0, 100);
      return { hp, status: Targets.status(hp) };
    },

    repairCeiling(target, reconstitution) {
      return target.type === 'airdefense' && target.killedOnce ? reconstitution.cap : 100;
    },

    repair(input) {
      const { target, repairRates, reconstitution, turn, struck, efficiency } = input;
      if (!Targets.wearsDown(target, repairRates) || struck) return null;
      const ceiling = Targets.repairCeiling(target, reconstitution);
      if (target.hp >= ceiling) return null;

      if (target.hp <= 0) {
        if (target.type !== 'airdefense') return null;
        if (turn - (target.lastStruck || 0) < reconstitution.quiet) return null;
        const hp = Math.min(reconstitution.cap,
          target.hp + Math.max(1, Math.round(reconstitution.rate * efficiency)));
        return { hp, status: Targets.status(hp), reconstituted: true,
          returned: target.status === 'destroyed' };
      }

      const amount = Math.max(1, Math.round(repairRates[target.type] * efficiency));
      const hp = Math.min(ceiling, target.hp + amount);
      return { hp, status: Targets.status(hp), reconstituted: false, returned: false };
    },
  };

  const Assessment = {
    observe(hp, spread, randomInt) {
      return clamp(Math.round(hp + randomInt(-spread, spread)), 0, 100);
    },

    estimate(input) {
      const { target, record, turn, repairRates, freshSpread, sharpSpread, ageSpread } = input;
      if (target.hp <= 0) return { lo: 0, hi: 0, mid: 0, known: true, age: 0 };
      if (!Targets.wearsDown(target, repairRates) && target.type !== 'tel') {
        return { lo: target.hp, hi: target.hp, mid: target.hp, known: true, age: 0 };
      }
      if (!record) return { lo: 100, hi: 100, mid: 100, known: true, age: 0 };

      const age = Math.max(0, turn - record.turn);
      const spread = (record.sharp ? sharpSpread : freshSpread) + ageSpread * age;
      const growth = (repairRates[target.type] || 0) * age;
      return {
        lo: clamp(Math.round(record.hp - spread), 0, 100),
        hi: clamp(Math.round(record.hp + spread + growth), 0, 100),
        mid: clamp(Math.round(record.hp + growth / 2), 0, 100),
        known: false,
        age,
      };
    },
  };

  const Strike = {
    estimate(input) {
      const adPenalty = input.profile.ad * input.airDefense + (input.raw ? input.rawPenalty : 0);
      const surge = input.over * input.surgeEffects;
      const surgeLoss = 1 + input.over * input.surgeLoss;
      const success = clamp(
        input.base - adPenalty - input.adaptPenalty - surge + input.damageBonus + input.levelEdge,
        0.05,
        0.95
      );
      const lossRisk = clamp(
        ((input.profile.attrition || 0) + input.profile.loss * input.airDefense *
          (input.raw ? input.rawLossMultiplier : 1)) * surgeLoss,
        0,
        input.raw ? 0.70 : 0.35
      );
      const fullOdds = success * (input.oneShot ? 1 : input.gradual ? 0.5 : 0.6);
      return { success, adPenalty, lossRisk, fullOdds, surge, surgeLoss };
    },
  };

  const Resources = {
    strikeBill(pkg, input) {
      const magazine = pkg.sub ? 'torpedoes'
        : pkg.escort === 'sm6' ? 'bmdPool'
        : pkg.escort === 'nsm' ? 'nsmPool' : null;
      return {
        magazine,
        magazineAmount: magazine ? pkg.qty : 0,
        readyAsset: magazine ? null : input.resourceKey,
        readyAmount: magazine ? 0 : pkg.qty,
        tlam: !magazine && pkg.asset === 'cruise' ? pkg.qty : 0,
        pgm: input.pgm || 0,
        tankers: input.tankers || 0,
        joint: !!pkg.joint,
        adaptation: pkg.sub ? null : pkg.asset,
        tasking: pkg.asset === 'cruise' ? 0 : 1,
        surge: !!input.surge,
      };
    },

    spend(value, amount) {
      return Math.max(0, value - amount);
    },

    refill(value, amount, capacity) {
      return Math.min(capacity, value + amount);
    },
  };

  const Victory = {
    degradation(targets) {
      let damaged = 0;
      let total = 0;
      for (const target of targets) {
        if (!target.enrichment) continue;
        const weight = target.weight == null ? 1 : target.weight;
        total += weight;
        damaged += weight * (100 - target.hp) / 100;
      }
      return total ? Math.round(damaged / total * 100) : 0;
    },

    progressToward(value, bar, full) {
      return clamp(Math.round(100 * (full - value) / (full - bar)), 0, 100);
    },

    warMachine(input) {
      return [
        { key: 'missiles', label: 'missile force', done: input.missiles <= input.missileBar,
          pct: Victory.progressToward(input.missiles, input.missileBar, 2) },
        { key: 'navy', label: 'navy', done: input.navy <= input.navyBar,
          pct: Victory.progressToward(input.navy, input.navyBar, 2) },
        { key: 'command', label: 'IRGC command', done: input.irgcDestroyed,
          pct: Victory.progressToward(input.irgcHp, 0, 100) },
      ];
    },

    dealProgress(input) {
      const strength = input.missiles + input.navy;
      const pct = Victory.progressToward(strength, input.bar, 4);
      return {
        open: input.degradation >= 100 && strength <= input.bar,
        program: { done: input.degradation >= 100, pct: Math.min(100, Math.round(input.degradation)) },
        machine: { done: strength <= input.bar, pct },
        arm: input.missiles >= input.navy ? 'missile force' : 'navy',
        doctrine: input.missiles >= input.navy ? 'counterforce' : 'maritime',
      };
    },

    ending(input) {
      if (input.over) return null;
      if (input.degradation >= 100 && input.iranBroken) return { kind: 'victory', reason: 'military' };
      if (input.nuclearTested && !input.nuclearDefused &&
          input.turn - input.nuclearTestedTurn >= input.nuclearWindow) {
        return { kind: 'defeat', reason: 'breakout' };
      }
      if (input.casualties >= input.casualtyLimit) return { kind: 'defeat', reason: 'casualties' };
      if (input.approval <= input.collapseAt) {
        if (input.turn <= input.softCap) return { kind: 'defeat', reason: 'impeachment' };
        return input.degradation < 50
          ? { kind: 'defeat', reason: 'exhaustion' }
          : { kind: 'stalemate', reason: 'time' };
      }
      if (input.hormuzClosedTurns >= input.hormuzLimit || input.oil >= 240) {
        return { kind: 'defeat', reason: 'economy' };
      }
      return null;
    },
  };

  const TARGET_SAVE_FIELDS = [
    'hp', 'dispersed', 'located', 'lastStruck', 'killedOnce',
    'found', 'suspected', 'leads', 'worked', 'released',
  ];

  const Save = {
    serialize(input) {
      const fields = {};
      for (const name of input.fieldNames) fields[name] = input.state[name];
      const targets = {};
      for (const target of input.targets) {
        const saved = {};
        for (const name of TARGET_SAVE_FIELDS) {
          if (name === 'hp') saved[name] = target[name];
          else if (['dispersed', 'located', 'killedOnce', 'found', 'suspected', 'released'].includes(name)) {
            saved[name] = !!target[name];
          } else {
            saved[name] = target[name] || 0;
          }
        }
        targets[target.id] = saved;
      }
      const data = { version: input.version };
      if (Object.prototype.hasOwnProperty.call(input, 'seed')) data.seed = input.seed;
      if (Object.prototype.hasOwnProperty.call(input, 'random')) data.random = input.random;
      data.muted = !!input.muted;
      if (Object.prototype.hasOwnProperty.call(input, 'coaCache')) data.coaCache = input.coaCache;
      data.fields = fields;
      data.targets = targets;
      return data;
    },

    validate(data, input) {
      const errors = [];
      if (!data || typeof data !== 'object') return { ok: false, errors: ['save is not an object'] };
      if (data.version !== input.version) errors.push('save version is not supported');
      if (input.requireRandom && (!data.random || typeof data.random !== 'object')) {
        errors.push('random state is missing');
      }
      if (!data.fields || typeof data.fields !== 'object') errors.push('save fields are missing');
      if (!data.targets || typeof data.targets !== 'object') errors.push('save targets are missing');
      if (data.fields) {
        for (const name of input.fieldNames) {
          if (!Object.prototype.hasOwnProperty.call(data.fields, name)) errors.push(`missing field: ${name}`);
        }
      }
      if (data.targets) {
        for (const id of input.targetIds) {
          const target = data.targets[id];
          if (!target || typeof target !== 'object') errors.push(`missing target: ${id}`);
          else if (!Number.isFinite(target.hp) || target.hp < 0 || target.hp > 100) {
            errors.push(`invalid target condition: ${id}`);
          }
        }
      }
      return { ok: errors.length === 0, errors };
    },
  };

  return { Politics, Targets, Assessment, Strike, Resources, Victory, Save };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = GameRules;
