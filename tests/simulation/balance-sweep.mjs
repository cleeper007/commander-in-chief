import { ready } from '../support/campaign.mjs';

const RUNS_PER_DIFFICULTY = Number(process.env.CIC_SWEEP_RUNS || 30);
const MAX_TURNS = Number(process.env.CIC_SWEEP_TURNS || 45);
const DIFFICULTIES = ['easy', 'normal', 'hard'];
const POLICIES = ['victory', 'counterforce', 'economic'];
const RESOURCE_KEYS = [
  'f35Sorties', 'fighterSorties', 'tomahawks', 'b2Missions', 'heavyBombers',
  'submarineTorpedoes', 'carrierNsm', 'carrierSm6', 'tankerPlan',
  'precisionMunitions', 'bmdInterceptors',
];
const SYSTEM_KEYS = [
  'intelligenceTasking', 'diplomacy', 'staffedPlans', 'manualTargeting',
  'manualElectronicWarfare', 'manualDeployment', 'automaticForceFlow',
  'carrierPosture', 'specialOperations', 'personnelRecovery', 'nuclearRelease',
];

// This is a workload sweep, not an optimizer. Each mode receives the same three
// strategic policies, but the bot must express them through that mode's actual
// decision surface: a staffed plan on easy, a plan plus manual target fragments
// on normal, and manual packages/EW on hard.
function decisionSurface(Game) {
  const d = Game.difficulty();
  return {
    strikePlanning: d.coa === 0 ? 'manual-packages'
      : d.freeTargeting ? 'staffed-plan-plus-manual-packages' : 'staffed-plan',
    theaterFlow: d.autoTheater ? 'automatic' : 'manual-deployment-orders',
    electronicWarfare: d.ew.orders ? 'manual-mission-order' : 'staff-managed',
    munitions: Game.pgmLedger() ? 'finite-player-ledger' : 'staff-managed',
  };
}

function strategyForTarget(target) {
  if (target.type === 'airdefense' || target.type === 'airbase') return 'air-control';
  if (target.type === 'missile' || target.type === 'tel') return 'counterforce';
  if (target.enrichment) return 'nuclear-objective';
  if (target.type === 'ship' || target.type === 'naval') return 'maritime-control';
  return 'regime-pressure';
}

const POLICY_WEIGHTS = {
  victory: {
    'air-control': 5, 'nuclear-objective': 4, counterforce: 3,
    'maritime-control': 2, 'regime-pressure': 1,
  },
  counterforce: {
    'air-control': 5, counterforce: 4, 'maritime-control': 3,
    'nuclear-objective': 2, 'regime-pressure': 1,
  },
  economic: {
    'air-control': 5, 'regime-pressure': 4, 'maritime-control': 3,
    counterforce: 2, 'nuclear-objective': 1,
  },
};

const COA_PREFERENCE = {
  victory: ['rollback', 'objective', 'counterforce', 'maritime', 'pressure', 'jerusalem'],
  counterforce: ['rollback', 'counterforce', 'maritime', 'objective', 'pressure', 'jerusalem'],
  economic: ['rollback', 'pressure', 'maritime', 'counterforce', 'objective', 'jerusalem'],
};

function blankUsage(keys) {
  return Object.fromEntries(keys.map((key) => [key, false]));
}

function recordMission(row, target, mission, Game) {
  const pkg = mission.pkg;
  row.strategyCounts[strategyForTarget(target)]++;
  row.resources.tankerPlan ||= (mission.tanker || 0) > 0;
  row.resources.precisionMunitions ||= Game.pgmLedger() && Game.pgmCost(pkg) > 0;
  if (pkg.sub) row.resources.submarineTorpedoes = true;
  else if (pkg.escort === 'nsm') row.resources.carrierNsm = true;
  else if (pkg.escort === 'sm6') row.resources.carrierSm6 = true;
  else if (pkg.asset === 'f35') row.resources.f35Sorties = true;
  else if (pkg.asset === 'fighter') row.resources.fighterSorties = true;
  else if (pkg.asset === 'cruise') row.resources.tomahawks = true;
  else if (pkg.asset === 'stealth') row.resources.b2Missions = true;
  else if (pkg.asset === 'heavy') row.resources.heavyBombers = true;
}

function recordNewMissions(row, before, Game, TARGETS, manual) {
  const missions = Game.G.missions.slice(before);
  for (const mission of missions) {
    const target = TARGETS.find((candidate) => candidate.id === mission.targetId);
    if (target) recordMission(row, target, mission, Game);
  }
  if (missions.length && manual) row.systems.manualTargeting = true;
  if (missions.some((mission) => mission.coa)) row.systems.staffedPlans = true;
  return missions.length;
}

function useIntel(row, Game) {
  const G = Game.G;
  const candidates = G.turn === 1
    ? ['assess-nuclear', 'assess-intent', 'folder', 'hunt', 'bda']
    : [
      ...(Game.covertGaps().length ? ['folder'] : []),
      ...(!G.postureKnown ? ['assess-intent'] : []),
      'hunt', 'bda', 'assess-nuclear',
    ];
  for (const action of candidates) {
    Game.doDiplo(action);
    if (G.intelUsed) {
      row.systems.intelligenceTasking = true;
      return;
    }
  }
}

function useDiplomacy(row, Game) {
  const G = Game.G;
  const candidates = [
    ...(!G.coalition ? ['coalition'] : []),
    ...(G.oil >= 135 && G.sprReleases < 2 ? ['spr'] : []),
    ...(G.negotiationReady() ? ['backchannel'] : []),
    ...(G.addressCooldown === 0 && G.approval < 48 ? ['address'] : []),
    ...(G.world < 48 ? ['un'] : []),
    'sanctions', 'un',
  ];
  for (const action of candidates) {
    Game.doDiplo(action);
    if (G.diploUsed || G.over) {
      row.systems.diplomacy = true;
      return;
    }
  }
}

function orderTheater(row, Game) {
  const G = Game.G;
  const before = [G.bombersOrdered, G.secondCarrierOrdered, G.heaviesOrdered].join(':');
  if (!G.bombersOrdered) Game.orderBombers();
  else if (!G.secondCarrierOrdered) Game.orderCarrier();
  else if (!G.heaviesOrdered && Game.phaseAtLeast('degraded', true)) Game.orderHeavies();
  const after = [G.bombersOrdered, G.secondCarrierOrdered, G.heaviesOrdered].join(':');
  if (after !== before) row.systems.manualDeployment = true;
}

function orderElectronicWarfare(row, Game) {
  if (!Game.ewOrders()) return;
  const order = ['network', 'barrier', 'escort'];
  const choices = Game.ewState().missions
    .filter((mission) => !mission.blocked)
    .sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  if (!choices.length) return;
  Game.orderEw(choices[0].id);
  if (Game.G.ew.id) row.systems.manualElectronicWarfare = true;
}

function chooseStaffPlan(policy, Game) {
  const options = Game.coaOptions();
  const preference = COA_PREFERENCE[policy];
  return options.slice().sort((a, b) => {
    const ai = preference.indexOf(a.intent || a.doctrine || a.id);
    const bi = preference.indexOf(b.intent || b.doctrine || b.id);
    return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
  })[0];
}

function packageScore(Game, target, pkg) {
  if (Game.pkgStock(pkg) < pkg.qty || Game.pgmBlock(pkg) || Game.pkgBlock(target, pkg)) return -Infinity;
  if (!Game.tankersFor(target, pkg).ok) return -Infinity;
  const estimate = Game.computeStrike(target, pkg);
  const resourceBias = pkg.sub ? 0.09 : pkg.asset === 'cruise' ? 0.04 : 0;
  return estimate.success + resourceBias - estimate.lossRisk * 0.35;
}

function targetScore(policy, Game, target) {
  const strategy = strategyForTarget(target);
  const phaseUrgency = strategy === 'air-control' && !Game.phaseAtLeast('degraded', true) ? 100 : 0;
  const damagedFinish = target.hp < 100 ? 4 : 0;
  const enrichmentClock = target.enrichment
    ? Game.G.breakout.progress / Math.max(1, Game.G.breakout.need) * 5 : 0;
  return phaseUrgency + POLICY_WEIGHTS[policy][strategy] * 10 + damagedFinish + enrichmentClock;
}

function bestManualMission(policy, Game, TARGETS) {
  const candidates = [];
  for (const target of TARGETS) {
    if (target.hp <= 0 || target.status === 'destroyed' || !Game.plotted(target) || !Game.canReach(target)) continue;
    if (target.type === 'tel' && (!target.dispersed || !target.located)) continue;
    if (target.covert && !target.found) continue;
    for (const pkg of target.packages || []) {
      const pkgScore = packageScore(Game, target, pkg);
      if (Number.isFinite(pkgScore)) {
        candidates.push({ target, pkg, score: targetScore(policy, Game, target) + pkgScore });
      }
    }
  }
  candidates.sort((a, b) => b.score - a.score || a.target.id.localeCompare(b.target.id));
  return candidates[0] || null;
}

function flyManualPlan(row, policy, Game, TARGETS) {
  // Stay within the staffed tasking order. The sweep is measuring the choices
  // a mode exposes, not the exploitability of unlimited late fragments.
  let attempts = 0;
  while (!Game.G.over && Game.G.strikesThisTurn < Game.atoSlots() && attempts++ < 24) {
    const choice = bestManualMission(policy, Game, TARGETS);
    if (!choice) break;
    const before = Game.G.missions.length;
    Game.executeStrike(choice.target, choice.pkg);
    if (!recordNewMissions(row, before, Game, TARGETS, true)) break;
  }
}

function applicableSystems(row) {
  return {
    intelligenceTasking: true,
    diplomacy: true,
    staffedPlans: row.surface.strikePlanning !== 'manual-packages',
    manualTargeting: row.surface.strikePlanning !== 'staffed-plan',
    manualElectronicWarfare: row.surface.electronicWarfare === 'manual-mission-order',
    manualDeployment: row.surface.theaterFlow === 'manual-deployment-orders',
    automaticForceFlow: row.surface.theaterFlow === 'automatic',
    carrierPosture: true,
    specialOperations: true,
    personnelRecovery: row.downedCrews > 0,
    nuclearRelease: row.nuclearTested,
  };
}

function applicableResources(row) {
  return Object.fromEntries(RESOURCE_KEYS.map((key) => [
    key,
    key !== 'precisionMunitions' || row.surface.munitions === 'finite-player-ledger',
  ]));
}

function campaignDominantStrategy(counts) {
  return Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
}

const results = [];
for (const [difficultyIndex, difficulty] of DIFFICULTIES.entries()) {
  for (let run = 0; run < RUNS_PER_DIFFICULTY; run++) {
    const harness = ready();
    const { Game, TARGETS } = harness.api;
    const seed = 700000 + difficultyIndex * 10000 + run;
    const policy = POLICIES[run % POLICIES.length];
    Game.startCampaign(difficulty, seed);
    const row = {
      difficulty, seed, policy, surface: decisionSurface(Game),
      resources: blankUsage(RESOURCE_KEYS),
      systems: blankUsage(SYSTEM_KEYS),
      strategyCounts: {
        'air-control': 0, counterforce: 0, 'nuclear-objective': 0,
        'maritime-control': 0, 'regime-pressure': 0,
      },
    };
    if (row.surface.theaterFlow === 'automatic' && Game.G.bombersOrdered) {
      row.systems.automaticForceFlow = true;
    }

    while (!Game.G.over && Game.G.turn <= MAX_TURNS) {
      useIntel(row, Game);
      if (!Game.G.over) useDiplomacy(row, Game);
      if (Game.G.over) break;

      if (row.surface.theaterFlow === 'manual-deployment-orders') orderTheater(row, Game);
      orderElectronicWarfare(row, Game);

      if (row.surface.strikePlanning !== 'manual-packages') {
        const plan = chooseStaffPlan(policy, Game);
        if (plan) {
          const before = Game.G.missions.length;
          Game.takeCoa(plan.id);
          recordNewMissions(row, before, Game, TARGETS, false);
        }
      }
      if (row.surface.strikePlanning !== 'staffed-plan') flyManualPlan(row, policy, Game, TARGETS);

      const bmdBefore = Game.G.bmdPool;
      const flowBefore = Game.G.forceFlow.landed.length;
      const before = Game.G.turn;
      Game.endTurn();
      row.resources.bmdInterceptors ||= Game.G.bmdPool < bmdBefore;
      row.systems.automaticForceFlow ||= row.surface.theaterFlow === 'automatic' &&
        Game.G.forceFlow.landed.length > flowBefore;
      if (Game.busy() || (!Game.G.over && Game.G.turn === before)) {
        throw new Error(`sweep stalled: ${difficulty} seed ${seed} turn ${before}`);
      }
      Game.assertInvariants(`balance sweep ${difficulty} seed ${seed}`);
    }

    const ending = harness.presentation.getEndgame();
    Object.assign(row, {
      turn: Game.G.turn,
      over: Game.G.over,
      outcome: ending ? ending.kind : 'ongoing',
      ending: ending ? ending.title : 'TURN LIMIT REACHED',
      approval: +Game.G.approval.toFixed(2),
      world: +Game.G.world.toFixed(2),
      destroyed: Game.G.stats.destroyed,
      casualties: Game.G.casualties.us,
      downedCrews: Game.G.stats.downedCrews,
      nuclearTested: Game.G.nuclear.tested,
    });
    row.dominantStrategy = campaignDominantStrategy(row.strategyCounts);
    row.applicableSystems = applicableSystems(row);
    row.applicableResources = applicableResources(row);
    results.push(row);
  }
}

const surfaceSignatures = new Set(DIFFICULTIES.map((difficulty) => JSON.stringify(
  results.find((row) => row.difficulty === difficulty).surface,
)));
if (surfaceSignatures.size !== DIFFICULTIES.length) {
  throw new Error('difficulty modes do not expose three distinct decision surfaces');
}

const pct = (count, total) => total ? +(count / total * 100).toFixed(1) : null;
const distribution = (rows, key) => Object.fromEntries(
  [...new Set(rows.map((row) => row[key]))].sort().map((value) => {
    const count = rows.filter((row) => row[key] === value).length;
    return [value, { campaigns: count, ratePct: pct(count, rows.length) }];
  }),
);
function unusedFrequency(rows, keys, applicability, usage) {
  return Object.fromEntries(keys.map((name) => {
    const applicable = rows.filter((row) => row[applicability][name]);
    const neverUsed = applicable.filter((row) => !row[usage][name]);
    return [name, {
      applicableCampaigns: applicable.length,
      neverUsedCampaigns: neverUsed.length,
      neverUsedRatePct: pct(neverUsed.length, applicable.length),
    }];
  }));
}

function winLossDistribution(rows) {
  const buckets = {
    wins: rows.filter((row) => row.outcome === 'victory').length,
    losses: rows.filter((row) => row.outcome === 'defeat').length,
    stalemates: rows.filter((row) => row.outcome === 'stalemate').length,
    ongoing: rows.filter((row) => row.outcome === 'ongoing').length,
  };
  return Object.fromEntries(Object.entries(buckets).map(([name, campaigns]) => [
    name, { campaigns, ratePct: pct(campaigns, rows.length) },
  ]));
}

const grouped = Object.fromEntries(DIFFICULTIES.map((difficulty) => {
  const rows = results.filter((row) => row.difficulty === difficulty);
  const mean = (key) => +(rows.reduce((sum, row) => sum + row[key], 0) / rows.length).toFixed(2);
  const dominantDistribution = distribution(rows, 'dominantStrategy');
  const topDominant = Object.entries(dominantDistribution)
    .sort((a, b) => b[1].campaigns - a[1].campaigns || a[0].localeCompare(b[0]))[0];
  return [difficulty, {
    runs: rows.length,
    decisionSurface: rows[0].surface,
    policyMix: distribution(rows, 'policy'),
    winLossDistribution: winLossDistribution(rows),
    outcomeDistribution: distribution(rows, 'outcome'),
    endingDistribution: distribution(rows, 'ending'),
    dominantStrategy: {
      strategy: topDominant[0],
      campaigns: topDominant[1].campaigns,
      ratePct: topDominant[1].ratePct,
      distribution: dominantDistribution,
    },
    unusedResourceFrequency: unusedFrequency(rows, RESOURCE_KEYS, 'applicableResources', 'resources'),
    systemsNeverUsed: unusedFrequency(rows, SYSTEM_KEYS, 'applicableSystems', 'systems'),
    meanTurn: mean('turn'),
    meanApproval: mean('approval'),
    meanWorld: mean('world'),
    meanDestroyed: mean('destroyed'),
    totalCasualties: rows.reduce((sum, row) => sum + row.casualties, 0),
  }];
}));

process.stdout.write(`${JSON.stringify({
  generatedAt: new Date().toISOString(),
  runsPerDifficulty: RUNS_PER_DIFFICULTY,
  maxTurns: MAX_TURNS,
  definitions: {
    unusedFrequency: 'Share of campaigns where an applicable resource or system was never used.',
    dominantStrategy: 'Most common campaign-level plurality of struck target categories.',
    outcomeDistribution: 'Victory, defeat, stalemate, or still ongoing at the configured turn limit.',
  },
  grouped,
})}\n`);
