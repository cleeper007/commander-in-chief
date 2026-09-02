// ============================================================
// replay.js — data-driven campaign decisions
// ============================================================
// Loaded after game.js. The browser exposes this for diagnostics; the command-
// line runner uses the same object against the same public Game actions.

const CampaignReplay = (() => {
  const INTEL_ALIASES = {
    enrichment: 'assess-nuclear',
    intent: 'assess-intent',
    launchers: 'hunt',
  };

  const DEPLOY = {
    carrier: () => Game.orderCarrier(),
    bombers: () => Game.orderBombers(),
    heavies: () => Game.orderHeavies(),
    rearm: () => Game.orderRearm(),
  };

  function fail(message) {
    throw new Error(`Invalid campaign decision script: ${message}`);
  }

  function validate(script) {
    if (!script || typeof script !== 'object' || Array.isArray(script)) fail('root must be an object');
    if (!Number.isInteger(script.seed) || script.seed < 0 || script.seed > 0xFFFFFFFF) {
      fail('seed must be an unsigned 32-bit integer');
    }
    if (!['easy', 'normal', 'hard'].includes(script.difficulty)) fail('difficulty must be easy, normal, or hard');
    if (!Array.isArray(script.turns)) fail('turns must be an array');
    script.turns.forEach((turn, i) => {
      if (!turn || typeof turn !== 'object' || Array.isArray(turn)) fail(`turns[${i}] must be an object`);
      if (turn.strikes !== undefined && !Array.isArray(turn.strikes)) fail(`turns[${i}].strikes must be an array`);
      if (turn.deploy !== undefined && !Array.isArray(turn.deploy) && typeof turn.deploy !== 'string') {
        fail(`turns[${i}].deploy must be a string or array`);
      }
    });
    return script;
  }

  function strike(order) {
    if (!order || typeof order !== 'object') fail('a strike order must be an object');
    const target = TARGETS.find((t) => t.id === order.target);
    if (!target) fail(`unknown strike target "${order.target}"`);
    const asset = order.asset || order.package;
    const options = target.packages || [];
    const pkg = options.find((p) => p.asset === asset &&
      (order.label === undefined || p.label === order.label));
    if (!pkg) fail(`target "${order.target}" has no package for asset "${asset}"`);
    const before = Game.G.missions.length;
    Game.executeStrike(target, pkg);
    if (Game.G.missions.length === before) {
      fail(`strike on "${order.target}" with "${asset}" was not accepted on turn ${Game.G.turn}`);
    }
  }

  function applyTurn(turn) {
    if (turn.intel) Game.doDiplo(INTEL_ALIASES[turn.intel] || turn.intel);
    if (turn.diplo) Game.doDiplo(turn.diplo);

    const deployments = turn.deploy === undefined ? []
      : Array.isArray(turn.deploy) ? turn.deploy : [turn.deploy];
    for (const id of deployments) {
      if (!DEPLOY[id]) fail(`unknown deployment "${id}"`);
      DEPLOY[id]();
    }

    if (turn.ew) Game.orderEw(turn.ew);
    if (turn.coa) Game.takeCoa(turn.coa);
    for (const order of turn.strikes || []) strike(order);
  }

  function summary() {
    const G = Game.G;
    return {
      seed: G.campaignSeed,
      difficulty: G.difficulty,
      turn: G.turn,
      over: G.over,
      rng: Game.randomState(),
      stage: G.lastResolutionStage,
      approval: +G.approval.toFixed(3),
      world: +G.world.toFixed(3),
      oil: +G.oil.toFixed(3),
      casualties: G.casualties.us,
      destroyed: G.stats.destroyed,
      aircraftLost: G.stats.aircraftLost,
      nuclearDegraded: G.nukeDegraded(),
      targetHp: Object.fromEntries(TARGETS.map((t) => [t.id, +t.hp.toFixed(3)])),
    };
  }

  function run(raw) {
    const script = validate(raw);
    Game.startCampaign(script.difficulty, script.seed);
    for (let i = 0; i < script.turns.length && !Game.G.over; i++) {
      const before = Game.G.turn;
      applyTurn(script.turns[i]);
      Game.endTurn();
      if (Game.busy()) {
        throw new Error(`Replay runner requires synchronous presentation adapters (turn ${before} is still resolving)`);
      }
      if (!Game.G.over && Game.G.turn === before) {
        throw new Error(`Replay stalled on turn ${before}`);
      }
    }
    return summary();
  }

  return { validate, applyTurn, run, summary };
})();
