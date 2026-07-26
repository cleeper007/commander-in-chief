// ============================================================
// game.js — core state, turn loop, strikes, diplomacy, win/lose
// ============================================================

const Game = (() => {
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const rand = (a, b) => a + Math.floor(Math.random() * (b - a + 1));

  // ---- how long the country lets you fight ----
  // The turn cap is not what ends most campaigns — this is. Iran kills Americans
  // every night its missile force is alive, so the casualty ceiling is the real
  // clock, and it is scaled to a war that now runs fifteen days rather than ten.
  // Both numbers are quoted to the player (objectives panel, NSA, headlines), so
  // they live here rather than being written into four files by hand.
  //
  // The ceiling is no longer a constant: it is what THIS country will absorb,
  // set by difficulty at kickoff (see DIFFICULTY). Everything that quotes it
  // reads casualtyLimit() rather than baking a number in.
  const WEARINESS_TURN = 14;    // after this, a long war bleeds approval on its own

  const diff = () => DIFFICULTY[G.difficulty] || DIFFICULTY.normal;
  const casualtyLimit = () => diff().casualties;

  // The congressional clock. Early in the second week the authorization the war
  // has been running on runs out and the Hill votes. Pulled forward from turn 13:
  // most campaigns were being decided before the old date, so the vote — and its
  // interesting middle outcome, a war that continues on a legally shortened
  // target list — was content most players never reached.
  const WAR_POWERS_TURN = 10;

  // ---- game state ----
  const G = {
    // Fifteen days at two turns a day. Sites that wear down and repair take two
    // or three good packages apiece instead of one lucky roll, so the campaign
    // is a grind now and the clock is scaled to the grind — and so is what the
    // country will absorb while you run it (see CASUALTY_LIMIT).
    turn: 1, maxTurns: 30,
    approval: 58,          // %
    oil: 84,               // $/bbl Brent
    world: 60,             // world opinion 0–100
    hormuz: 'OPEN', hormuzClosedTurns: 0,
    casualties: { us: 7 }, // the destroyer attack that starts the crisis
    // Fighter and TLAM capacity is DERIVED from where the carriers are (see
    // fleetCapacity) — these are the opening values with the Lincoln alone,
    // forward. The SOF task force is not carrier-based, and the B-2s are not
    // in theater at all: they sit at Whiteman until they are sent for.
    // Three manned tiers, and only one of them can fly tonight. The fourth-gen
    // force is aboard and on the ramps from the first turn — it is simply not
    // going into a live SAM belt (see airPhase). What the player has on night
    // one is F-35s, Tomahawks, and a decision about how fast to spend them.
    res: { f35: 2, fighters: 3, cruise: 6, stealth: 0, heavy: 0, specops: 1 },
    caps: { f35: 2, fighters: 4, cruise: 8, stealth: 0, heavy: 0, specops: 1 },
    // ---- the theater Tomahawk magazine ----
    // res.cruise is what is CANISTER-LOADED and launchable tonight; this is the
    // whole war's supply behind it. The Lincoln sails with 20 rounds aboard, the
    // Ford brings 10 more when she arrives — 30 for the campaign, and no more.
    // Nightly turnaround (repCruise) still tops the ready launchers off at the
    // same rate, so the opening weeks feel unchanged; but the reservoir does not
    // refill, so the Tomahawk stops being the free answer to every aimpoint and
    // becomes a thing that has to be rationed once the war runs long.
    tlamPool: 20,
    // ---- USS Toledo's war shots ----
    // The submarine attack is the one package that spends nothing off the
    // theater magazine: the Mk-48s are already in her tubes. Four of them, and
    // nobody reloads a boat on patrol — see TORPEDO_LOAD.
    torpedoes: TORPEDO_LOAD,
    // The fleet. One deck to start; the second has to be sent for. Only mutable
    // state lives here — names come from CARRIER_INFO by id, so a restored save
    // can never carry a stale ship name back into the war.
    carriers: [
      { id: 'csg-lincoln', arrived: true, posture: 'forward', moving: null, damaged: false, lost: false },
      { id: 'csg-ford', arrived: false, posture: 'back', moving: null, damaged: false, lost: false },
    ],
    secondCarrierOrdered: false, secondCarrierEta: 0,
    // the 509th Bomb Wing: at Whiteman AFB, Missouri, until called forward
    bombersOrdered: false, bomberEta: 0, bombersArrived: false,
    // the heavy bomber force — B-1s and B-52s, called forward once the sky is
    // being taken and not before (see orderHeavies)
    heaviesOrdered: false, heavyEta: 0, heaviesArrived: false,
    // ---- the theater buildup ----
    // Waves already landed (by index into FORCE_FLOW) and the running total they
    // have added. Capacity is derived from this, never mutated in place, so a
    // wave can never be double-counted and a restored save needs no migration.
    forceFlow: { landed: [], f35: 0, fighters: 0, tanker: 0, rep: 0 },
    // the air-superiority phase as of the last turn boundary, so the report can
    // tell the player the night it changed — in either direction
    airPhaseSeen: 'contested',
    // one-time campaign milestones the country rallies behind — each pays an
    // approval bump exactly once, tracked here so a phase that is lost and
    // retaken, or a program re-degraded past 100, does not pay twice.
    milestones: { superiority: false, degraded: false, nukeGutted: false, iranBroken: false },
    // the turn a deployment order was cut, so only one goes out a night
    deployTurn: 0,
    alliedFighters: 0,     // coalition and IAF squadrons folded into the fighter cap
    strikesThisTurn: 0, struckThisTurn: [],
    missions: [],          // strike packages in flight: {targetId, pkg, eta}
    sanctions: 0, coalition: false, addressCooldown: 0, sprReleases: 0,
    // the allied head of government who rings once the coalition forms:
    // {who, answered} or null. Persisted so a war saved with the phone still
    // ringing resumes with it ringing (see leaderCall).
    leaderCall: null,
    negotiationsAccepted: false, negotiationMomentum: 0,
    diploUsed: false, intelUsed: false, over: false,
    // Israel: a semi-autonomous actor, not an American asset. Sidelined by
    // default; coordinate with them and the war widens, ignore them and they
    // eventually go alone on a timetable you do not control.
    israelPosture: 'sidelined', israelPatience: 4,
    israelStrikesUsed: false, israelJointAvailable: false,
    // special operations (see specops.js)
    raid: 'none', raidThisTurn: false, isrPrep: 0,
    regimeChaosTurns: 0, regimeErratic: false, hostageCrisis: false,
    // downed aircrew awaiting recovery, or null — the whole CSAR subsystem
    // (see csar.js) exists only while this does
    downed: null,
    stats: { strikes: 0, destroyed: 0, aircraftLost: 0, peakOil: 84, backchannels: 0, carriersLost: 0,
      downedCrews: 0, aircrewRescued: 0, aircrewCaptured: 0, telsKilled: 0 },

    // ---- what THIS war is ----
    // Set once at kickoff and never during. Difficulty scales the three numbers
    // that matter (see DIFFICULTY); the Iranian war plan is chosen at random and
    // hidden until the analysts are asked for it.
    difficulty: 'normal',
    iranPosture: 'attrition', postureKnown: false,

    // ---- the enrichment race ----
    // The reason the war exists. `progress` climbs every turn the halls are
    // still turning; `need` is randomized per war so the number the player is
    // shown is a genuine estimate. See breakoutTick / breakoutEstimate.
    breakout: { progress: 0, need: 100, conf: 'low', assessed: -99 },

    // ---- what CENTCOM believes, as opposed to what is true ----
    // targetId -> { hp, turn }: the last assessed condition and when it was
    // assessed. Every display in the game reads this; nothing outside the
    // simulation reads t.hp directly. Confidence decays with age.
    intel: {},

    // ---- fuel in the air ----
    // Rebuilt every turn from the fleet and the basing picture, spent by
    // fighter and bomber packages, never by Tomahawks.
    tankers: 0, tankerCap: 0,

    // ---- permission slips ----
    // Withdrawn in two steps as world opinion falls (see BASING_TIERS), and
    // handed back if it recovers.
    basing: { nato: true, gulf: true },
    // squadrons actually withdrawn per tier, so recovery returns exactly those
    basingDebt: { nato: 0, gulf: 0 },

    // ---- the Hill ----
    // One vote, mid-war, on whether this campaign continues and on what terms.
    warPowers: { done: false, result: null, noOil: false, noDeep: false },
    addresses: 0,

    // The anti-ship threat the fleet has been warned about this turn, or null.
    // Telegraphed before it is rolled, so posture is a read and not a tax.
    threat: null,

    // Target condition as it stood when tonight's packages began arriving.
    // Dispersal is measured against this — see endTurn.
    turnStartHp: {},

    // one line per turn, for the after-action recap on the endgame screen
    timeline: [],

    // Platforms flown, and the deepest counter Iran has been seen to develop
    // against each. See IranAI.adaptPenalty.
    adapt: { cruise: 0, f35: 0, fighter: 0, stealth: 0, heavy: 0 },
    adaptSeen: { cruise: 0, f35: 0, fighter: 0, stealth: 0, heavy: 0 },

    // Is the flagship out of the anti-ship envelope? Derived rather than stored:
    // with two independently-stationed decks there is no single fleet posture,
    // and a stored copy of this would be one more thing to keep in sync.
    get csgPulledBack() {
      const cv = this.carriers[0];
      return !cv.lost && !cv.moving && cv.posture === 'back';
    },
    nukeDegraded() {
      let d = 0;
      for (const id of ['natanz', 'fordow']) {
        const t = TARGETS.find(x => x.id === id);
        d += (100 - t.hp) / 2;
      }
      return Math.round(d); // 0–100
    },
    // Iran's remaining ability to fight, 0–100, for the HUD meter:
    // missile force + navy + IRGC command, the set you must break to win
    iranCapacity() {
      const irgc = TARGETS.find(t => t.id === 'irgc-hq');
      return Math.round(100 * (IranAI.missileStrength() + IranAI.navalStrength() + irgc.hp / 100) / 5);
    },
    // warfighting capacity shattered: missile force and navy near zero, IRGC command gone
    iranBroken() {
      const irgc = TARGETS.find(t => t.id === 'irgc-hq');
      return IranAI.missileStrength() <= 0.5 && IranAI.navalStrength() <= 0.5 &&
        irgc.status === 'destroyed';
    },
    // The leadership target died — whether or not the task force came home.
    // 'pyrrhic' bought the same decapitation at the price of the whole team.
    raidDecapitated() { return this.raid === 'success' || this.raid === 'pyrrhic'; },
    negotiationReady() {
      // Tehran only talks when it is already losing the war: the program gone
      // AND its ability to fight visibly draining away. The raid does NOT
      // discount this gate — killing the leadership cannot substitute for
      // destroying the thing the war is about, or the raid becomes the game.
      // What it buys instead is a better chance at the table (see doDiplo).
      const warStr = IranAI.missileStrength() + IranAI.navalStrength(); // 0..4
      return this.nukeDegraded() >= 100 && warStr <= 1.5;
    },
  };

  // ---- save / continue (localStorage) ----
  const Save = (() => {
    // v9: the air campaign became three campaigns in sequence. Strike assets
    // split into 5th-gen, 4th-gen and heavy bombers behind an air-superiority
    // gate, and theater capacity now grows all war off the force flow. A v8
    // save has one undifferentiated fighter pool, no phase, and no buildup —
    // there is no honest way to decide what it should become.
    // v8: the war stopped being fully observable. Target condition is now
    // something CENTCOM estimates rather than reads, Iran runs one of three
    // hidden war plans, enrichment is a race against a hidden number, and
    // tanker capacity, congressional authorization and dispersed launchers are
    // all live state. A v7 save has none of it and would load into a war whose
    // rules it was never played under.
    // v7: targets stopped being a three-state enum and became a 0–100 condition
    // track that repairs overnight, and the campaign runs to 30 turns against
    // rescaled loss thresholds. A v6 save carries neither, and dropping it into
    // this balance would be a different war than the one it was saved from.
    // v6: two IRGC hulls joined the target list and naval strength became a
    // fraction of the fleet. A v5 save would load with both ships untouched and
    // a capacity meter that no longer means what it meant when it was written.
    // v5: downed aircrew and their recovery counters became state. A v4 save has
    // no `downed` field and a stats block missing three counters — retired
    // rather than migrated, the same as every version before it.
    // Branch-isolated slot. The UI overhaul will eventually add trend history to
    // FIELDS and bump VERSION, and read() rejects on a strict version mismatch —
    // so a save written here would be refused by main, and main's save refused
    // here. Different key, no collision: a war in progress on either branch
    // survives switching between them. Fold this back to the shared key when the
    // overhaul merges.
    const KEY = 'cic-save-c';    // bump the version to invalidate old saves
    const VERSION = 11;
    const FIELDS = [
      'turn', 'maxTurns', 'approval', 'oil', 'world',
      'hormuz', 'hormuzClosedTurns', 'casualties', 'res', 'caps',
      'strikesThisTurn', 'struckThisTurn', 'missions', 'sanctions', 'coalition', 'leaderCall',
      'addressCooldown', 'sprReleases', 'negotiationsAccepted', 'negotiationMomentum',
      'diploUsed', 'intelUsed', 'over', 'raid', 'raidThisTurn', 'isrPrep', 'downed',
      'israelPosture', 'israelPatience', 'israelStrikesUsed', 'israelJointAvailable',
      'regimeChaosTurns', 'regimeErratic', 'hostageCrisis', 'stats',
      'carriers', 'secondCarrierOrdered', 'secondCarrierEta', 'alliedFighters',
      'bombersOrdered', 'bomberEta', 'bombersArrived', 'deployTurn',
      'heaviesOrdered', 'heavyEta', 'heaviesArrived', 'forceFlow', 'airPhaseSeen',
      'milestones', 'difficulty', 'iranPosture', 'postureKnown', 'breakout', 'intel',
      'tankers', 'tankerCap', 'basing', 'basingDebt', 'warPowers', 'addresses', 'threat',
      'timeline', 'adapt', 'adaptSeen', 'turnStartHp', 'tlamPool', 'torpedoes',
    ];

    function write() {
      if (G.over) return;
      try {
        const data = { version: VERSION, muted: AudioSys.isMuted(), fields: {}, targets: {} };
        for (const f of FIELDS) data.fields[f] = G[f];
        // condition is the source of truth; status is derived from it on load.
        // Dispersal state travels with it — a launcher group that has driven out
        // into the country, and whether anyone currently knows where it is.
        for (const t of TARGETS) {
          data.targets[t.id] = { hp: t.hp, dispersed: !!t.dispersed, located: !!t.located };
        }
        localStorage.setItem(KEY, JSON.stringify(data));
      } catch (e) { /* storage unavailable — play without saves */ }
    }

    function read() {
      try {
        const data = JSON.parse(localStorage.getItem(KEY));
        return data && data.version === VERSION ? data : null;
      } catch (e) { return null; }
    }

    function clear() {
      try { localStorage.removeItem(KEY); } catch (e) {}
    }

    return { write, read, clear };
  })();

  // ============================================================
  // TARGET CONDITION
  // ------------------------------------------------------------
  // Every target carries hp 0–100 and its status is DERIVED from it, so the map,
  // the capacity meter, the Iranian AI, the objectives and the raid math all go
  // on reading t.status and never have to know which damage model applies.
  // wearsDown() is the dividing line: sites in TARGET_REPAIR take proportional
  // damage and repair overnight, while ships and the nuclear sites move in whole
  // steps — 100 → 50 → 0 — and never come back.
  // ============================================================
  const wearsDown = (t) => TARGET_REPAIR[t.type] !== undefined;

  function syncStatus(t) {
    t.status = t.hp <= 0 ? 'destroyed' : t.hp < 100 ? 'damaged' : 'intact';
  }

  function damageTarget(t, amount) {
    t.hp = clamp(t.hp - amount, 0, 100);
    syncStatus(t);
    MapView.updateTarget(t);
  }

  // ============================================================
  // WHAT CENTCOM BELIEVES
  // ------------------------------------------------------------
  // t.hp is the truth and nothing outside this simulation is allowed to read
  // it. What the player sees is an ASSESSMENT: the last number battle damage
  // assessment produced, how old it is, and how far it could have drifted since
  // — because the site has been repairing the whole time and nobody has looked.
  //
  // Two states are never in doubt, because they are not judgement calls: a
  // target nobody has touched is intact, and a hall that has visibly collapsed
  // is destroyed. Everything between those is an estimate with a band on it,
  // and the band is where the decision lives — "somewhere between 20 and 45"
  // is a genuinely different problem than "37".
  // ============================================================
  const FRESH_SPREAD = 8;    // ± on a brand-new assessment
  const SHARP_SPREAD = 3;    // ± when ISR has been tasked onto it
  const AGE_SPREAD = 6;      // ± added per turn since anyone last looked

  // Record an assessment. `sharp` is a deliberate ISR tasking rather than the
  // incidental look a strike package gets on its way through.
  function observe(t, sharp) {
    if (!wearsDown(t) && t.type !== 'tel') return;   // step-damage sites read true
    const spread = sharp ? SHARP_SPREAD : FRESH_SPREAD;
    G.intel[t.id] = {
      hp: clamp(Math.round(t.hp + rand(-spread, spread)), 0, 100),
      turn: G.turn, sharp: !!sharp,
    };
  }

  // The band the player is shown. Widens with age, and widens UPWARD faster
  // than down, because the thing that happens to an unobserved site is repair.
  function estimate(t) {
    if (t.hp <= 0) return { lo: 0, hi: 0, mid: 0, known: true, age: 0 };
    if (!wearsDown(t) && t.type !== 'tel') return { lo: t.hp, hi: t.hp, mid: t.hp, known: true, age: 0 };
    const rec = G.intel[t.id];
    if (!rec) return { lo: 100, hi: 100, mid: 100, known: true, age: 0 };  // never touched
    const age = Math.max(0, G.turn - rec.turn);
    const spread = (rec.sharp ? SHARP_SPREAD : FRESH_SPREAD) + AGE_SPREAD * age;
    const growth = (TARGET_REPAIR[t.type] || 0) * age;
    return {
      lo: clamp(Math.round(rec.hp - spread), 0, 100),
      hi: clamp(Math.round(rec.hp + spread + growth), 0, 100),
      mid: clamp(Math.round(rec.hp + growth / 2), 0, 100),
      known: false, age,
    };
  }

  // one-line condition string for tooltips, panels and advisor text
  function condition(t) {
    if (t.hp <= 0) return 'destroyed';
    const e = estimate(t);
    if (e.known) return `${Math.round(e.mid)}% operational`;
    if (e.lo === e.hi) return `${e.lo}% operational`;
    return `${e.lo}–${e.hi}% operational`;
  }

  // ============================================================
  // THE ENRICHMENT RACE
  // ------------------------------------------------------------
  // Iran is not waiting for this war to end. The halls run every turn they are
  // standing, and `need` is rolled fresh for every war, so the estimate the
  // player is handed is an actual estimate — narrow it by spending an action
  // slot on it, or fly the campaign on a number that could be five turns wrong.
  // ============================================================
  function enrichRate() {
    const natanz = TARGETS.find(t => t.id === 'natanz');
    const fordow = TARGETS.find(t => t.id === 'fordow');
    // Fordow is the survivable half of the program: buried, and worth more of
    // the remaining capability than the surface halls at Natanz.
    const cap = (natanz.hp / 100) * 0.4 + (fordow.hp / 100) * 0.6;
    return BREAKOUT.rate * cap * (IranAI.posture().enrich || 1) / diff().breakout;
  }

  function breakoutTick() {
    const rate = enrichRate();
    if (rate <= 0) return null;
    G.breakout.progress += rate;
    return null;
  }

  // Turns remaining, as the IC would brief it: a band, not a number.
  function breakoutEstimate() {
    const rate = enrichRate();
    const left = G.breakout.need - G.breakout.progress;
    if (rate <= 0) return { halted: true };
    const turns = Math.max(0, left / rate);
    const age = G.turn - G.breakout.assessed;
    const conf = age <= BREAKOUT.decay ? G.breakout.conf : 'low';
    const band = BREAKOUT.band[conf];
    return {
      halted: false, conf,
      lo: Math.max(1, Math.floor(turns - band)),
      hi: Math.ceil(turns + band),
    };
  }

  // ============================================================
  // TANKER TRACKS
  // ------------------------------------------------------------
  // Rebuilt every turn. Decks generate their own tanking; the basing tiers add
  // the land-based tanker wings, which is why losing a ramp costs reach and not
  // just sorties. Tomahawks book nothing — a missile does not refuel.
  // ============================================================
  function tankerCapacity() {
    let n = TANKER_BASE;
    for (const cv of G.carriers) {
      if (cv.lost || !cv.arrived) continue;
      n += (cv.moving || cv.posture === 'back') ? 1 : 2;
    }
    if (G.basing.nato) n += BASING_TIERS.nato.tankers;
    if (G.basing.gulf) n += BASING_TIERS.gulf.tankers;
    if (G.coalition) n += 1;
    // the tanker wings that came in with the force flow. This is the single
    // biggest reason a war in week three is heavier than a war in week one:
    // the plan stops being written around four tracks a night.
    n += G.forceFlow.tanker;
    return n;
  }

  const tankerCost = (t, pkg) => (TANKER_COST[pkg.asset] || (() => 0))(t.depth || 2);

  // Can this package physically be flown tonight? Separate from whether the
  // magazine holds it — the two run out at different times and the player needs
  // to be told which one is the problem.
  function tankersFor(t, pkg) {
    const cost = tankerCost(t, pkg);
    return { cost, ok: cost <= G.tankers };
  }

  // ============================================================
  // BASING — WHAT WORLD OPINION ACTUALLY BUYS
  // ------------------------------------------------------------
  // Two thresholds, both recoverable. Crossing one costs squadrons, tanker
  // tracks, and — at the bottom — the reach to touch anything deep at all.
  // ============================================================
  function syncBasing() {
    const events = [];
    for (const [key, tier] of Object.entries(BASING_TIERS)) {
      const should = G.world > tier.at;
      if (should === G.basing[key]) continue;
      G.basing[key] = should;
      if (!should) {
        // Give back exactly what was taken, and no more. Squadrons that were
        // never in theater cannot be lost — without recording the actual
        // deduction, a player could tank world opinion and then recover it to
        // conjure allied fighters out of nothing, repeatedly.
        const taken = Math.min(G.alliedFighters, tier.fighters);
        G.basingDebt[key] = taken;
        G.alliedFighters -= taken;
        events.push(key === 'nato' ? {
          cls: 'world', title: 'NATO AND SAUDI BASING WITHDRAWN',
          text: 'With world opinion at ' + Math.round(G.world) + ', the political cover is gone. Ankara has ' +
            'closed Incirlik to strike operations, two European governments have suspended their squadrons ' +
            'rather than fall with them, and Riyadh has quietly asked that Prince Sultan not be used for ' +
            'offensive sorties. The aircraft are still ours. The runways are not.',
          dTanker: -tier.tankers,
        } : {
          cls: 'world', title: 'GULF STATES REVOKE ACCESS AND OVERFLIGHT',
          text: 'Doha, Abu Dhabi and Manama have jointly suspended American offensive operations from their ' +
            'territory and closed their airspace to strike packages. Al Udeid and Al Dhafra are hosting ' +
            'aircraft that are not permitted to fly. Without the northern tanker tracks there is no longer ' +
            'a way to put a manned package over the far northwest of Iran at all — Tabriz and the Caspian ' +
            'are off the target list until this is repaired.',
          dTanker: -tier.tankers,
        });
      } else {
        G.alliedFighters += (G.basingDebt[key] || 0);
        G.basingDebt[key] = 0;
        events.push({
          cls: 'friendly', title: key === 'nato' ? 'NATO AND SAUDI BASING RESTORED' : 'GULF ACCESS RESTORED',
          text: 'With American standing recovering, ' + tier.name + ' has been quietly restored. The ramps ' +
            'are open again and the tanker plan can be written the way CENTCOM wanted it written.',
          dTanker: tier.tankers,
        });
      }
    }
    if (events.length) syncFleetCaps();
    return events;
  }

  // Deep strike needs the northern tracks, and those come with the Gulf ramps.
  const canReach = (t) => G.basing.gulf || (t.depth || 2) < 3;

  // ============================================================
  // DISPERSAL — THE MISSILE HUNT
  // ------------------------------------------------------------
  // Killing a missile base does not kill the brigade. The launchers that were
  // always the point drive out into the country, and from that moment the
  // missile war is a hunt: they cannot be planned against until ISR finds them,
  // they move again if they are found and not serviced, and the whole time they
  // are still shooting.
  // ============================================================
  // `frac` is how much of the brigade was still alive when the killing blow
  // landed. This matters: the launchers that drive away are the ones that were
  // still there to drive, so a base ground down to 20% over three nights leaks
  // a fifth of what a base flattened at full strength does. Without this the
  // arithmetic runs backwards and destroying a worn-down base RAISES Iranian
  // missile strength, which is both wrong and the opposite of a reward.
  function disperseFrom(baseId, frac) {
    const plan = DISPERSAL[baseId];
    if (!plan) return null;
    const moved = [];
    let total = 0;
    for (const [telId, hp] of plan) {
      const tel = TARGETS.find(t => t.id === telId);
      if (!tel) continue;
      const escaped = Math.round(hp * clamp(frac, 0, 1));
      if (escaped <= 0) continue;
      tel.dispersed = true;
      tel.hp = clamp(tel.hp + escaped, 0, 100);
      tel.located = false;
      total += escaped;
      syncStatus(tel);
      MapView.updateTarget(tel);
      moved.push(tel.short);
    }
    if (!moved.length) {
      return {
        cls: 'friendly', title: 'BRIGADE DESTROYED IN PLACE — NOTHING GOT OUT',
        text: 'The base had been worked over so thoroughly before the final package that there was no ' +
          'longer a brigade to disperse. Overhead shows burned revetments and launchers that never ' +
          'moved. This is what grinding a site down before finishing it buys: the launchers die with ' +
          'the base instead of driving out of it.',
      };
    }
    return {
      cls: 'iran', title: 'BRIGADE SURVIVORS DISPERSE — LAUNCHERS IN THE OPEN COUNTRY',
      text: 'The base is gone and the brigade is not. Overhead caught transporter-erector-launchers ' +
        'leaving the wire under the smoke — the garrison, the sheds and the fuel farm died on that ' +
        'target, and the launchers, which were always the thing that mattered, drove out into the ' +
        `country. Roughly ${total} launchers' worth got clear, into the ` +
        `${moved.length > 1 ? 'interior' : 'hills'}. They are still shooting, and they cannot be ` +
        'planned against until ISR finds them. Missile strength did not fall as far as the battle ' +
        'damage assessment suggests — and the more of this brigade you had already destroyed before ' +
        'tonight, the less of it got away.',
    };
  }

  // ISR sweep for dispersed launchers — the standing use of the action slot
  // once the fixed bases are gone.
  function huntTels() {
    const hidden = IranAI.liveTels().filter(t => !t.located);
    if (!hidden.length) return null;
    // a sweep is worth more when there is less country left to search
    const p = clamp(0.55 - 0.08 * (hidden.length - 1) + (G.coalition ? 0.05 : 0), 0.2, 0.7);
    if (Math.random() >= p) {
      return {
        cls: 'iran', title: 'LAUNCHER SWEEP — NO FIX',
        text: 'Twelve hours of Reaper and Global Hawk time, every signals platform in the theater, and ' +
          'the sweep came up with culverts, decoys and cold engines. They are moving at night, shooting ' +
          'from prepared hides and going dark inside fifteen minutes. The country is very large.',
      };
    }
    const found = hidden[Math.floor(Math.random() * hidden.length)];
    found.located = true;
    observe(found, true);
    MapView.updateTarget(found);
    return {
      cls: 'friendly', title: `LAUNCHER GROUP LOCATED — ${found.short}`,
      text: `A pattern-of-life fix has finally closed on ${found.name}. Thermal signatures off the ` +
        'launchers at last light, a resupply convoy tracked back to the hide, and a signals cut that ' +
        'confirms the unit. The group is on the plot and can be serviced — tonight. Left alone it will ' +
        'move, and the fix will be worth nothing by morning.',
    };
  }

  // ---- strike math ----
  // Air defense degrades in proportion to what is still standing, so a SAM belt
  // worn down to 40% screens the skies at 40% — there is no cliff between
  // "damaged" and "destroyed" for the player to game.
  function airDefenseWeight() {
    let w = 0;
    for (const t of TARGETS) {
      if (t.type !== 'airdefense') continue;
      w += t.hp / 100;
    }
    return w; // 0..3
  }

  // number of air-defense targets, so the weight above can be read as a fraction
  const AD_SITES = TARGETS.filter(t => t.type === 'airdefense').length;

  // ============================================================
  // AIR SUPERIORITY
  // ------------------------------------------------------------
  // How much of the sky is actually American, 0..1. Three quarters of it is the
  // SAM belt and the rest is Iranian fighter basing — take both down and the
  // theater stops being contested airspace and starts being a range.
  //
  // Nothing about this is a one-way ratchet. Air defense sites repair overnight
  // like everything else, so a phase that was bought in week one is gone by
  // week two if nobody keeps going back. That is the intended shape of the
  // campaign: the heavy force is not a reward you unlock, it is a condition you
  // maintain, and the night you look away is the night the plan gets smaller.
  // ============================================================
  function airSuperiority() {
    const sam = AD_SITES ? airDefenseWeight() / AD_SITES : 0;
    let ab = 0, n = 0;
    for (const t of TARGETS) {
      if (t.type !== 'airbase') continue;
      ab += t.hp / 100; n++;
    }
    const iranian = AIR_WEIGHT.sam * sam + AIR_WEIGHT.airbase * (n ? ab / n : 0);
    return clamp(1 - iranian, 0, 1);
  }

  function airPhase() {
    const s = airSuperiority();
    return s >= AIR_PHASE.superiority ? 'superiority'
      : s >= AIR_PHASE.degraded ? 'degraded' : 'contested';
  }

  // ordering, so "is this phase at least that phase" is one comparison
  const PHASE_RANK = { contested: 0, degraded: 1, superiority: 2 };
  const phaseAtLeast = (need) => PHASE_RANK[airPhase()] >= PHASE_RANK[need || 'contested'];

  const PHASE_LABEL = {
    contested: 'AIRSPACE CONTESTED',
    degraded: 'AIR DEFENSES DEGRADED',
    superiority: 'AIR SUPERIORITY',
  };

  // The night the sky changes hands, in either direction. Reported at the turn
  // boundary rather than the moment a package lands, because that is when the
  // player is actually reading — and because losing it back is the event that
  // has to land hardest.
  function airPhaseEvents() {
    const now = airPhase();
    const was = G.airPhaseSeen;
    G.airPhaseSeen = now;
    if (now === was) return [];
    const rising = PHASE_RANK[now] > PHASE_RANK[was];
    if (now === 'degraded' && rising) {
      // the country reads "our planes are getting through" as the war being won,
      // and rewards it — but only the first time the belt comes down, not every
      // time it is retaken after Iran patches it back together.
      const ev = {
        cls: 'friendly', title: 'AIR DEFENSES DEGRADED — FOURTH-GEN FORCE RELEASED',
        text: 'The SAM belt is broken enough to fly into. CENTCOM has released the F-15E, F-16 and Super Hornet ' +
          'squadrons to the nightly tasking order, which roughly triples the number of aimpoints that can be ' +
          'serviced in a night. They carry far more than the F-35s do and they survive far less — the belt is ' +
          'broken, not gone, and every night it is left alone the crews put some of it back.',
      };
      if (!G.milestones.degraded) {
        G.milestones.degraded = true;
        G.approval = clamp(G.approval + 4, 0, 100);
        ev.dApproval = 4;
      }
      return [ev];
    }
    if (now === 'superiority' && rising) {
      const ev = {
        cls: 'friendly', title: 'AIR SUPERIORITY DECLARED OVER IRAN',
        text: 'Nothing is contesting the sky. The SAM network is rubble and the fighter bases are cratered, and ' +
          'for the first time American aircraft are operating over Iran on their own terms. The heavy bomber ' +
          'force can be called forward — B-1s and B-52s off Diego Garcia, which is the difference between ' +
          'raiding a country and dismantling one.',
      };
      if (!G.milestones.superiority) {
        G.milestones.superiority = true;
        G.approval = clamp(G.approval + 7, 0, 100);
        ev.dApproval = 7;
      }
      return [ev];
    }
    // falling — the repair crews took it back
    return [{
      cls: 'iran', title: now === 'contested'
        ? 'AIRSPACE CONTESTED AGAIN — SAM BELT RECONSTITUTED'
        : 'AIR SUPERIORITY LOST — DEFENSES BACK UP',
      text: now === 'contested'
        ? 'While the campaign was somewhere else, Iran rolled spare launchers and engagement radars out of ' +
          'the dispersal revetments and put the belt back together. The fourth-generation squadrons are off ' +
          'tonight\'s tasking order and the aimpoints they were servicing go with them. The door has to be ' +
          'kicked a second time.'
        : 'Enough of the air defense network is back on the air that CENTCOM will no longer put heavy bombers ' +
          'over Iran. The B-1s and B-52s are on the ramp at Diego Garcia and they are staying there until the ' +
          'belt is taken down again.',
    }];
  }

  // The war's stated objectives, paid out the night they are first met. Unlike
  // the sky, these do not come back: a destroyed program stays destroyed and a
  // shattered military stays shattered, so each pays its approval bump once and
  // the milestone flag makes sure of it. This is where "the target is fully
  // destroyed" stops being a line on a BDA and becomes a political win.
  function objectiveMilestones() {
    const out = [];
    if (!G.milestones.nukeGutted && G.nukeDegraded() >= 100) {
      G.milestones.nukeGutted = true;
      G.approval = clamp(G.approval + 8, 0, 100);
      G.world = clamp(G.world + 4, 0, 100);
      out.push({
        cls: 'friendly', title: 'OBJECTIVE MET — IRANIAN NUCLEAR PROGRAM DESTROYED',
        text: 'CENTCOM assesses the enrichment complex — Natanz and Fordow — as functionally destroyed. The ' +
          'centrifuge halls are collapsed and the breakout timeline is gone. The reason the country went to ' +
          'war has been achieved, and the country knows it.',
        dApproval: 8, dWorld: 4,
      });
    }
    if (!G.milestones.iranBroken && G.iranBroken()) {
      G.milestones.iranBroken = true;
      G.approval = clamp(G.approval + 6, 0, 100);
      out.push({
        cls: 'friendly', title: 'OBJECTIVE MET — IRAN\'S WAR MACHINE BROKEN',
        text: 'The missile force is spent, the navy is on the bottom, and the IRGC command structure is rubble. ' +
          'Iran can no longer wage the war it started. The threat to the Gulf and to American forces in theater ' +
          'has been dismantled.',
        dApproval: 6,
      });
    }
    return out;
  }

  // ============================================================
  // CARRIER STRIKE GROUPS
  // ------------------------------------------------------------
  // Every fighter sortie and every Tomahawk in this war comes off a deck, so
  // where the decks sit is the standing decision underneath all the others.
  // FORWARD is the North Arabian Sea box east of Oman: a hull inside the
  // longest-legged anti-ship weapons Iran has left, but Aegis on the Gulf
  // approaches, weight on the strait, and a lid on the oil premium. BACK is the
  // deep Arabian Sea, down toward the Indian Ocean approaches: untouchable at
  // that range, and none of those forward effects. The air wing flies at full
  // rate from either station — the move between them takes a turn, and buys the
  // worst of both: exposed on the way, without the presence effects yet.
  //
  // Nothing here mutates G.caps directly. Capacity is recomputed from the
  // fleet's disposition (see fleetCapacity), so a posture change can never
  // leak a permanent bonus and a restored save needs no migration.
  // ============================================================

  // per-deck contribution, flown at full rate from either station now. The Ford
  // is the newer and larger ship and generates the heavier sortie rate.
  // repFighters keeps pace with what a fourth-gen package actually costs: those
  // are three-sortie packages, so a deck turning two a night can never sustain
  // one. Three is the number that makes the tier read as volume, which is the
  // entire reason it exists.
  const CARRIER_BASE = {
    'csg-lincoln': { fighters: 4, cruise: 8, repFighters: 3, repCruise: 2 },
    'csg-ford':    { fighters: 6, cruise: 8, repFighters: 3, repCruise: 2 },
  };
  const FORD_TRANSIT_TURNS = 5;

  // ============================================================
  // THE NAVAL TRANSIT
  // ------------------------------------------------------------
  // Neither the second deck nor the bomber force is in this theater when the
  // war opens, and Fifth Fleet writes the naval transit — escorts, oilers, the
  // tanker tracks hung off them — once a night. So only one force flow is cut
  // per turn: order the Ford tonight and the 509th waits for tomorrow's plan,
  // and the reverse. The Ford is five turns away and doubles what you can throw
  // in a day; the bombers are one turn away and are the only key that fits
  // Fordow. You can have both — the cost is the night you spend choosing which
  // one goes first, and the war does not wait while you do.
  // ============================================================
  const B2_TRANSIT_TURNS = 1;
  const BOMBER_CAP = 2;     // sustainable missions off the Diego Garcia ramp
  const BOMBER_READY = 1;   // generated and ready the turn they land

  // has tonight's transit plan already been cut? Only the turn the order goes
  // out is blocked — a deployment still crossing does not hold the next plan,
  // or ordering the Ford would lock the bombers out for her whole five turns.
  function transitCommitted() {
    return G.deployTurn === G.turn;
  }

  const carrierById = (id) => G.carriers.find(c => c.id === id);
  const cvName = (cv) => CARRIER_INFO[cv.id].name;    // "USS Abraham Lincoln"
  const cvShort = (cv) => CARRIER_INFO[cv.id].short;  // "LINCOLN"

  // how much of a deck's air wing is actually in the fight. Station no longer
  // costs sorties: a deck flies its full air wing forward OR back — the tanker
  // distance is absorbed, and the whole tradeoff of posture lives in exposure
  // and the forward-presence effects (Aegis, the strait, the oil premium), not
  // in strike volume. Only loss and battle damage take capability off the deck.
  function carrierFactor(cv) {
    if (cv.lost || !cv.arrived) return 0;
    return cv.damaged ? 0.5 : 1;   // fires out, catapults down, flying a fraction of her rate
  }

  // exposure to Iranian anti-ship fires, 0..1 — the mirror of the capability above
  function carrierExposure(cv) {
    if (cv.lost || !cv.arrived) return 0;
    if (cv.moving) return 0.5;                    // clearing the area, or closing back in
    return cv.posture === 'forward' ? 1 : 0;
  }

  // ============================================================
  // FORWARD PRESENCE
  // ------------------------------------------------------------
  // The strategic weight of a deck sitting forward in the North Arabian Sea,
  // over and above the sorties it flies. A CSG that far up is a wall of Aegis
  // escorts on the Gulf approaches and a standing threat to anything Iran sails
  // at the strait — which reassures the oil market, makes the strait harder to
  // close, and shoots down some of the ballistic salvo aimed at the Gulf-state
  // bases. Zero when both decks are back, in transit, or gone; up to 2 with the
  // whole fleet on station. A damaged deck counts half — she is still there,
  // she is just fighting her own fires. Read by the economy (game.js oil model)
  // and by Tehran's naval and missile decisions (ai.js).
  function navalForward() {
    let n = 0;
    for (const cv of G.carriers) {
      if (cv.lost || !cv.arrived || cv.moving) continue;
      if (cv.posture !== 'forward') continue;
      n += cv.damaged ? 0.5 : 1;
    }
    return n;
  }

  // The theater's air order of battle: the decks, plus every land-based wing
  // the force flow has put on a ramp. The decks can be sunk or pulled back and
  // the land-based force cannot — which is why a war that runs long stops being
  // a carrier war and becomes an Air Force one.
  // Al Dhafra's resident squadron, the carrier's F-35C detachment and the
  // Raptors. This number carries the ENTIRE opening phase now — it is the only
  // manned tier that flies before the SAM belt comes down — so it has to
  // sustain about a package a night on its own. At anything less the war opens
  // with a magazine that reads full and cannot be tasked.
  const F35_BASE = 4;

  function fleetCapacity() {
    let fighters = 0, cruise = 0, repFighters = 0, repCruise = 0;
    for (const cv of G.carriers) {
      const f = carrierFactor(cv);
      if (!f) continue;
      const b = CARRIER_BASE[cv.id];
      fighters += b.fighters * f;
      cruise += b.cruise * f;
      repFighters += b.repFighters * f;
      repCruise += b.repCruise * f;
    }
    const ff = G.forceFlow;
    return {
      // allied squadrons and the deployed wings fly from land and survive the
      // loss of every deck
      f35: F35_BASE + ff.f35,
      fighters: Math.round(fighters) + G.alliedFighters + ff.fighters,
      cruise: Math.round(cruise),
      // The 5th-gen force turns slower than the fourth-generation fleet does —
      // low-observable maintenance is the reason there are never many of them
      // ready on any given night — but it has to turn fast enough to put a
      // package up most nights, because in the opening phase it is the only
      // manned option there is.
      repF35: 2 + Math.floor(ff.f35 / 2),
      repFighters: Math.round(repFighters) + ff.rep,
      repCruise: Math.round(repCruise),
    };
  }

  // push the derived caps into G and clamp any stock that no longer fits under
  // them — pulling back doesn't just cap the magazine, it empties what the
  // deck can no longer hold ready
  function syncFleetCaps() {
    const cap = fleetCapacity();
    G.caps.f35 = cap.f35;
    G.caps.fighters = cap.fighters;
    G.caps.cruise = cap.cruise;
    G.res.f35 = Math.min(G.res.f35, G.caps.f35);
    G.res.fighters = Math.min(G.res.fighters, G.caps.fighters);
    G.res.cruise = Math.min(G.res.cruise, G.caps.cruise, G.tlamPool ?? Infinity);
  }

  // ============================================================
  // THE FORCE FLOW
  // ------------------------------------------------------------
  // Called once a turn. A wave lands when its turn comes up AND the basing tier
  // it needs is still open — squadrons need a ramp, and ramps are what world
  // opinion buys. A wave that has nowhere to land is not lost, it holds at its
  // staging field and tries again next turn, so tanking the politics does not
  // permanently delete the buildup; it stalls it for exactly as long as the
  // politics stay tanked.
  // ============================================================
  function forceFlowTick() {
    const events = [];
    FORCE_FLOW.forEach((w, i) => {
      if (G.turn < w.at || G.forceFlow.landed.includes(i)) return;
      if (!G.basing[w.needs]) {
        // announce the stall once, on the turn it was due, and then stay quiet
        if (G.turn === w.at) events.push({
          cls: 'world', title: 'FORCE FLOW HELD — NO RAMP TO LAND ON',
          text: `The next tranche of deploying squadrons is sitting at its staging field with nowhere to go. ` +
            `${BASING_TIERS[w.needs].name} is suspended, and aircraft cannot be bedded down on runways ` +
            `whose governments will not have them. They will close as soon as that is repaired — the ` +
            `buildup is not cancelled, it is waiting on the State Department.`,
        });
        return;
      }
      G.forceFlow.landed.push(i);
      G.forceFlow.f35 += w.f35;
      G.forceFlow.fighters += w.fighters;
      G.forceFlow.tanker += w.tanker;
      G.forceFlow.rep += w.rep;
      events.push({
        cls: 'friendly', title: w.title, text: w.text,
        dTanker: w.tanker,
      });
    });
    if (events.length) syncFleetCaps();
    return events;
  }

  // put every deck where its state says it is (also used on load/restore)
  function syncCarrierMap() {
    for (const cv of G.carriers) {
      if (cv.id === 'csg-ford' && !cv.arrived) {
        // still crossing: place her along the run-in, or nowhere at all
        MapView.setCarrierIngress(cv.id, G.secondCarrierOrdered
          ? 1 - G.secondCarrierEta / FORD_TRANSIT_TURNS : -1);
        continue;
      }
      MapView.setCarrierPosture(cv);
    }
  }

  // the Diego Garcia marker is only on the plot once there is something on it
  function syncBomberMap() {
    MapView.setAssetActive('diego', G.bombersArrived);
  }

  // Call the 509th forward. One turn wingtip-to-wingtip across the Pacific with
  // the whole tanker force behind it — and for that turn, nothing else moves.
  function orderBombers() {
    if (G.over || G.bombersOrdered || transitCommitted() || busy()) return;
    G.bombersOrdered = true;
    G.bomberEta = B2_TRANSIT_TURNS;
    G.deployTurn = G.turn;
    AudioSys.play('cable');
    UI.renderAll(G);
    Save.write();
  }

  // tick the bomber deployment; on arrival the ramp at Diego Garcia goes live
  function checkBomberArrival() {
    if (!G.bombersOrdered || G.bombersArrived || G.bomberEta <= 0) return null;
    G.bomberEta--;
    if (G.bomberEta > 0) return null;

    G.bombersArrived = true;
    G.caps.stealth = BOMBER_CAP;
    G.res.stealth = BOMBER_READY;
    syncBomberMap();
    AudioSys.play('b2Arrival');
    return {
      cls: 'friendly', title: 'B-2 FORCE IN THEATER — DIEGO GARCIA',
      text: 'The 509th Bomb Wing flew from Whiteman with the tanker force strung out behind it across the Pacific, and the aircraft are on the ramp at Diego Garcia under cover. Munitions handlers are building up GBU-57s tonight. From here the Massive Ordnance Penetrator is on the table — which means Fordow is finally a target and not a briefing slide.',
    };
  }

  // ============================================================
  // THE HEAVY BOMBER FORCE
  // ------------------------------------------------------------
  // Two gates, deliberately separated. Calling the heavies forward only needs
  // the belt to be BREAKING — you can see air superiority coming and start the
  // two-turn transit against it, which is exactly the call a real staff makes.
  // Actually flying them needs the sky to be taken (see pkgBlock), so a player
  // who calls them early and then lets the SAM belt come back has a squadron of
  // very expensive aircraft parked on an atoll doing nothing.
  //
  // They come off the same ramp as the 509th and they do not compete with it —
  // Diego Garcia is a long way from anything Iran can reach, and the transit
  // that matters is Fifth Fleet's, which is why this one takes a slot too.
  // ============================================================
  function orderHeavies() {
    if (G.over || G.heaviesOrdered || transitCommitted() || busy()) return;
    if (!phaseAtLeast('degraded')) return;
    G.heaviesOrdered = true;
    G.heavyEta = HEAVY_TRANSIT_TURNS;
    G.deployTurn = G.turn;
    AudioSys.play('cable');
    UI.renderAll(G);
    Save.write();
  }

  function checkHeavyArrival() {
    if (!G.heaviesOrdered || G.heaviesArrived || G.heavyEta <= 0) return null;
    G.heavyEta--;
    if (G.heavyEta > 0) return null;

    G.heaviesArrived = true;
    G.caps.heavy = HEAVY_CAP;
    G.res.heavy = HEAVY_READY;
    AudioSys.play('cable');
    return {
      cls: 'friendly', title: 'HEAVY BOMBER FORCE IN THEATER — DIEGO GARCIA',
      text: 'B-1Bs out of Dyess and B-52s out of Barksdale are on the ramp at Diego Garcia, and the munitions ' +
        'yard has been working around the clock to meet them. A single one of these aircraft carries more ' +
        'ordnance than a four-ship of Strike Eagles. They cannot penetrate anything, they cannot survive a ' +
        'SAM belt, and against fixed targets in an empty sky they will take Iran\'s ability to fight apart ' +
        'faster than anything else in the inventory.',
    };
  }

  // ---- the two fleet commands ----

  // Surging a second deck is a five-turn decision. She is somewhere in the
  // Indian Ocean when the order goes out and no amount of wanting moves her
  // faster — the cost of the second carrier is paid in the turns before it.
  function orderCarrier() {
    if (G.over || G.secondCarrierOrdered || transitCommitted() || busy()) return;
    G.secondCarrierOrdered = true;
    G.secondCarrierEta = FORD_TRANSIT_TURNS;
    G.deployTurn = G.turn;
    syncCarrierMap();
    AudioSys.play('cable');
    UI.renderAll(G);
    Save.write();
  }

  // Order a deck between stations. Takes effect at the end of the turn — the
  // order is given now, the ship is somewhere in between until then.
  function toggleCarrierPosture(id) {
    if (G.over || busy()) return;
    const cv = carrierById(id);
    if (!cv || !cv.arrived || cv.lost || cv.moving) return;
    cv.moving = cv.posture === 'forward' ? 'back' : 'forward';
    syncFleetCaps();
    MapView.setCarrierPosture(cv);
    AudioSys.play('cable');
    UI.renderAll(G);
    Save.write();
  }

  // ---- end-of-turn fleet movement ----

  // a deck that spent this turn repositioning is now on its new station
  function checkCarrierTransit() {
    const events = [];
    for (const cv of G.carriers) {
      if (!cv.moving) continue;
      cv.posture = cv.moving;
      cv.moving = null;
      MapView.setCarrierPosture(cv);
      events.push(cv.posture === 'forward' ? {
        cls: 'friendly', title: `${cvShort(cv)} ON STATION — NORTH ARABIAN SEA`,
        text: `${cvName(cv)} has closed northwest into the North Arabian Sea box. Her air wing was flying full from standoff and flies full here — what she adds on station is her Aegis escorts over the Gulf bases, her weight on the strait, and a lid on the oil premium. And she is now inside everything Iran can range that far out.`,
      } : {
        cls: 'friendly', title: `${cvShort(cv)} WITHDRAWN TO THE DEEP ARABIAN SEA`,
        text: `${cvName(cv)} has steamed southeast into the deep Arabian Sea, clear of the anti-ship envelope and out toward the Indian Ocean approaches. She keeps her full sortie rate from out here — what she gives up is the forward presence: no Aegis over the Gulf bases, no pressure on the strait, no lid on the oil premium.`,
      });
    }
    if (events.length) syncFleetCaps();
    return events;
  }

  // tick the second carrier's transit; on arrival she joins at safe standoff
  function checkCarrierArrival() {
    if (!G.secondCarrierOrdered || G.secondCarrierEta <= 0) return null;
    G.secondCarrierEta--;
    const ford = carrierById('csg-ford');

    if (G.secondCarrierEta > 0) {
      MapView.setCarrierIngress(ford.id, 1 - G.secondCarrierEta / FORD_TRANSIT_TURNS);
      return null;
    }

    ford.arrived = true;
    ford.posture = 'back';
    ford.moving = null;
    // she comes with her own war-load: another 10 Tomahawks into the theater
    // reservoir, the only replenishment the campaign ever gets
    G.tlamPool = (G.tlamPool || 0) + 10;
    syncFleetCaps();
    MapView.setCarrierPosture(ford);
    AudioSys.play('fordArrival');
    return {
      cls: 'friendly', title: 'FORD ON STATION — DEEP ARABIAN SEA',
      text: 'The USS Gerald R. Ford Carrier Strike Group has come up out of the Indian Ocean into the deep Arabian Sea and checked in with Fifth Fleet. Her full air wing is available from standoff — bring her northwest into the North Arabian Sea box and she flies the same sorties, now with her Aegis escorts over the Gulf bases, weight on the strait, and a lid on the oil premium, on the same terms as every other hull that far forward.',
    };
  }

  // ============================================================
  // IRANIAN ANTI-SHIP FIRES — TELEGRAPHED, THEN ROLLED
  // ------------------------------------------------------------
  // The reason a carrier forward in the North Arabian Sea is a decision and not
  // scenery. It used to be a silent tax on the correct posture, which made the
  // posture not a decision at all: the expected cost of standing forward was
  // always smaller than the sorties it bought, so nobody ever pulled back.
  //
  // Now the threat is announced before it is rolled. Somewhere on the coast a
  // brigade works up a firing solution, national assets see it happen, and the
  // player is told — which turns one silent die into three real options: ride
  // it out, spend a turn withdrawing, or go kill the brigade that is holding
  // the solution. The odds are much higher than they were, because they are now
  // avoidable.
  // ============================================================
  const THREAT_SOURCES = ['naval-bandar', 'naval-bushehr', 'ship-mahdavi'];

  // Warn for NEXT turn's fires, at the end of this one. Stored on G so the
  // sidebar, the map and the fires themselves all read the same object.
  function raiseThreat() {
    const naval = IranAI.navalStrength();
    const exposed = G.carriers.filter(cv => carrierExposure(cv) > 0 && !cv.lost);
    if (naval <= 0 || !exposed.length) { G.threat = null; return null; }
    // a workup needs a shooter: the surviving bases and the hull at sea
    const live = THREAT_SOURCES
      .map(id => TARGETS.find(t => t.id === id))
      .filter(t => t && t.hp > 0);
    if (!live.length) { G.threat = null; return null; }
    // A workup on roughly three nights in five at full Iranian naval strength,
    // and a shot on a little under half of those. Ignore every warning at full
    // strength and a deck is lost about one turn in twenty — enough that the
    // decision is real, not so much that standing forward is a slow suicide.
    if (Math.random() >= 0.30 * naval) { G.threat = null; return null; }

    const src = live[Math.floor(Math.random() * live.length)];
    const cv = exposed[Math.floor(Math.random() * exposed.length)];
    G.threat = { srcId: src.id, cvId: cv.id, p: clamp(0.22 * naval, 0.1, 0.5) };
    return {
      cls: 'iran', title: `ANTI-SHIP WORKUP DETECTED — ${cvShort(cv)} HELD AT RISK`,
      text: `National assets have watched an anti-ship brigade at ${src.name.split(' — ')[0]} come up on ` +
        `the air, run a targeting cycle and go quiet holding a firing solution on ${cvName(cv)}. They have ` +
        'her. Fifth Fleet assesses roughly ' + Math.round(G.threat.p * 100) + '% that they shoot before the ' +
        'next report. There are three answers and all of them cost something: leave her forward and accept ' +
        'it, pull her back and lose a day of her air wing, or kill the shooter tonight.',
    };
  }

  // Resolve the warned threat. Nothing fires that was not announced first.
  function carrierRisk() {
    const events = [];
    const th = G.threat;
    if (!th) return events;
    G.threat = null;
    const src = TARGETS.find(t => t.id === th.srcId);
    const cv = carrierById(th.cvId);
    if (!cv || cv.lost) return events;

    // killing or hurting the shooter is the whole point of telegraphing it
    const surviving = src ? src.hp / 100 : 0;
    if (surviving <= 0) {
      events.push({
        cls: 'friendly', title: 'ANTI-SHIP THREAT REMOVED BEFORE IT FIRED',
        text: `The brigade holding the firing solution on ${cvName(cv)} was destroyed with the solution ` +
          'still in the system. Nothing left the coast. This is what the warning was for.',
      });
      return events;
    }
    // and so is moving her: exposure is read fresh, at the moment of the shot
    const exposure = carrierExposure(cv);
    if (!exposure) {
      events.push({
        cls: 'friendly', title: `${cvShort(cv)} CLEAR OF THE ENGAGEMENT ENVELOPE`,
        text: `The salvo was launched against ${cvName(cv)}'s last known position and found empty water — ` +
          'she was already south and outside the envelope when the weapons arrived. The day of reduced ' +
          'sortie generation bought exactly this.',
      });
      return events;
    }
    if (Math.random() >= th.p * surviving * exposure) {
      events.push({
        cls: 'friendly', title: `ANTI-SHIP SALVO DEFEATED — ${cvShort(cv)} UNHARMED`,
        text: `The brigade shot. The screen's SM-6s and the ship's own defenses took the salvo apart well ` +
          `short of ${cvName(cv)} and she is undamaged. It will not go that way every night.`,
      });
      return events;
    }
    events.push(strikeCarrier(cv, IranAI.navalStrength()));
    return events;
  }

  // Resolve a hit. The event carries the numbers; applyEvent spends them, so
  // nothing here touches approval or the casualty count directly.
  function strikeCarrier(cv, naval) {
    // an unlucky hit hurts; only a coordinated salvo from an intact navy has
    // any real chance of putting a supercarrier under
    const sunk = Math.random() < (naval >= 1 ? 0.18 : 0.06);
    AudioSys.play('aircraftLost', 600);

    if (sunk) {
      cv.lost = true;
      cv.moving = null;
      G.stats.carriersLost++;
      syncFleetCaps();
      MapView.setCarrierPosture(cv);
      return {
        cls: 'iran', title: `${cvName(cv).toUpperCase()} LOST`,
        text: `A coordinated Iranian salvo — anti-ship ballistic missiles from the coast, cruise missiles from the islands, and small craft coming in underneath the engagement envelope — saturated the strike group's defenses and put multiple weapons into ${cvName(cv)}. Flooding was uncontrolled. The order to abandon ship was given four hours later and her escorts recovered the great majority of her ship's company; the rest are dead or unaccounted for. The United States has lost a nuclear aircraft carrier for the first time in its history, on television, and Tehran is claiming the largest naval victory since the age of sail.`,
        casualties: rand(45, 85), dApproval: -20, dOil: 16, dWorld: -3,
        flashAsset: cv.id, attack: { kind: 'missile', base: cv.id, count: 6 },
      };
    }

    cv.damaged = true;
    cv.moving = null;
    cv.posture = 'back';   // she comes off the line whether you ordered it or not
    syncFleetCaps();
    MapView.setCarrierPosture(cv);
    return {
      cls: 'iran', title: `${cvShort(cv)} STRUCK — WITHDRAWING TO STANDOFF`,
      text: `An Iranian anti-ship missile got through the screen and hit ${cvName(cv)} above the waterline, starting fires on the hangar deck. Damage control has the ship, but her flight deck is fouled and her catapults are down. She is retiring southeast into the deep Arabian Sea and will fly at a fraction of her rate for the rest of this war. Fifth Fleet did not order the withdrawal — the damage did.`,
      casualties: rand(8, 25), dApproval: -7, dOil: 6,
      flashAsset: cv.id, attack: { kind: 'missile', base: cv.id, count: 4 },
    };
  }

  // ---- Israel: the joint deep-strike option ----
  // Coordinating with Israel buys exactly one combined package against a buried
  // site — IAF F-35I escort and SEAD opening the corridor for US penetrators.
  // It is the only path to Fordow that isn't a B-2, and it costs more abroad
  // than an American strike does: everyone reads it as the war widening.
  // Flown as 5th-gen on both sides — Israeli F-35I Adirs with an American
  // package alongside them. That matters mechanically as well as narratively:
  // the joint option is Israel's alternative to a B-2 and it has to stay
  // available in the opening phase, which it would not be if it were tasked as
  // fourth-generation. The bill is the whole night's 5th-gen magazine.
  const JOINT_PKGS = {
    natanz: {
      asset: 'f35', qty: 2, base: 0.78, eta: 2, joint: true, extraWorld: -6,
      label: 'JOINT US–ISRAELI PACKAGE — F-35I escort + penetrators',
    },
    fordow: {
      asset: 'f35', qty: 2, base: 0.62, eta: 2, joint: true, extraWorld: -8,
      label: 'JOINT US–ISRAELI PACKAGE — the only alternative to a B-2',
    },
  };

  // TARGETS is static data rebuilt on load, so the joint option is derived from
  // saved state rather than stored — call this whenever that state changes.
  function syncJointPackages() {
    for (const [id, pkg] of Object.entries(JOINT_PKGS)) {
      const t = TARGETS.find(x => x.id === id);
      t.packages = t.packages.filter(p => !p.joint);
      if (G.israelJointAvailable) t.packages.push(pkg);
    }
  }

  // one-line posture summary used by map tooltips and the diplomacy panel
  function israelStatus() {
    if (G.israelPosture === 'coordinated') return 'COORDINATED WITH CENTCOM';
    if (G.israelPosture === 'unilateral') return 'ACTING UNILATERALLY';
    return `SIDELINED — patience ${G.israelPatience}`;
  }

  const resKey = (asset) => asset === 'fighter' ? 'fighters' : asset;
  const assetProfile = (asset) => AIR_ASSETS[asset] || AIR_ASSETS.cruise;

  // What a package is actually drawn from. Everything on the board comes out of
  // a ready magazine indexed by tier — except the submarine shot, which comes
  // out of the boat's own torpedo room and touches no theater stock at all.
  // It still flies as `cruise` for the strike math: an Mk-48 against a hull is
  // the same arithmetic as a maritime-strike Tomahawk, unseen and unopposed.
  const pkgStock = (pkg) => pkg.sub ? (G.torpedoes ?? 0) : (G.res[resKey(pkg.asset)] ?? 0);

  // The smallest package a tier can be tasked in, anywhere on the board.
  // The assets panel counts SORTIES and the strike modal spends PACKAGES, and
  // the two are not the same number: a magazine holding two sorties against a
  // three-sortie package reads perfectly healthy in the sidebar and refuses
  // every target on the map. That gap is a bug report waiting to happen, so
  // the panel is given the means to say "short of a package" out loud.
  function minPackage(asset) {
    let n = Infinity;
    for (const t of TARGETS) {
      for (const p of t.packages) if (p.asset === asset) n = Math.min(n, p.qty);
    }
    return isFinite(n) ? n : 0;
  }

  // ============================================================
  // THE GATE
  // ------------------------------------------------------------
  // Why a package the player can see is not a package the player can fly. This
  // is separate from the magazine and separate from the tanker plan, because
  // all three run out at different times and the answer to each is different:
  // an empty magazine waits for the turn, an empty tanker plan waits for the
  // night, and a live SAM belt waits for the player to go and kill it.
  //
  // On hard the staff does not refuse (see DIFFICULTY.softGate) — the package
  // flies, and computeStrike prices what it costs to fly it into a threat that
  // has not been taken down.
  // ============================================================
  function pkgBlock(target, pkg) {
    const need = assetProfile(pkg.asset).needs;
    if (need && !phaseAtLeast(need) && !diff().softGate) {
      return need === 'degraded'
        ? 'SAM BELT INTACT — fourth-generation aircraft are not being tasked into this threat. ' +
          'Take the air defense network down with F-35s and Tomahawks first; the squadrons are ' +
          'on the ramp and they are not going anywhere.'
        : 'NO AIR SUPERIORITY — heavy bombers are not released over defended airspace. They are the ' +
          'least survivable aircraft in the theater and they will not be tasked until nothing is ' +
          'contesting the sky.';
    }
    if (pkg.asset === 'heavy' && !G.heaviesArrived) {
      return G.heaviesOrdered
        ? `HEAVY BOMBER FORCE EN ROUTE — ${G.heavyEta} turn(s) from the Diego Garcia ramp.`
        : 'HEAVY BOMBER FORCE NOT IN THEATER — the B-1s and B-52s are in CONUS and have to be called forward.';
    }
    return null;
  }

  // is this package being flown into airspace nobody has taken? Only possible
  // at all on hard, and it is the most expensive thing a player can choose to do
  const unsuppressed = (pkg) => {
    const need = assetProfile(pkg.asset).needs;
    return !!(need && !phaseAtLeast(need));
  };

  // Why a TLAM salvo comes up short — weather, bad targeting data, or a launch/
  // booster fault. Air defense is never the cause.
  const TLAM_MISS_REASONS = [
    'Strike failed to achieve desired effects. Assessed cause: heavy weather over the target degraded terminal guidance and the missiles went long.',
    'Strike failed to achieve desired effects. Assessed cause: the targeting package was bad — the aimpoint coordinates were off and the warheads fell on open ground.',
    'Strike failed to achieve desired effects. Assessed cause: booster and launch faults — several birds failed to reach the target after leaving the rail.',
  ];

  // How much condition one package takes off a site that wears down. This is
  // where the tiers actually differ: an F-35 carries two weapons in a bay, a
  // Strike Eagle carries a wing full, and a B-52 carries more than both put
  // together twice over. Individual packages still override with `dmg`.
  const pkgDamage = (pkg) => pkg.dmg || assetProfile(pkg.asset).weight || PKG_DAMAGE;

  // Why a shot at a hull comes up dry. A ship is a small thing on a big ocean
  // that does not stay where you last saw it — the misses are about the target
  // moving, not about the weapon failing.
  const SHIP_MISS_REASONS = [
    'The weapon ran out to the datum and found empty water. She had moved off the last known position before it arrived — a hull at sea is a target with a shelf life measured in minutes.',
    'Terminal seeker acquired the wrong return and went after a merchant transiting nearby. The shot was broken off; she is still afloat and now she knows she is being hunted.',
    'Hard maneuver and a full decoy spread — chaff and corner reflectors in the air — and the weapon took the false picture. No damage assessed.',
  ];

  // Why a heavyweight comes up dry. Nothing here is about air defense — a
  // torpedo is beaten by the water, by the target's own wake, or by a can of
  // noise dropped over the side at the right moment.
  const TORPEDO_MISS_REASONS = [
    'The weapon enabled on a knuckle. She went to flank and put her rudder over the moment the seeker went active, and the torpedo ran through the churn where she had been. It ran to fuel exhaustion and sank; she is still afloat, and now she knows there is a boat out there.',
    'Countermeasures defeated the shot — a noisemaker over the side and a hard turn away, and the seeker took the false target. No detonation on the hull.',
    'The wire parted early and the weapon enabled on the last solution instead of the current one. She had drawn off the datum by then. No damage assessed.',
  ];

  // Flying a tier into airspace it was never meant to see. Only reachable on
  // hard, where the gate is advice rather than law — and the price is set so
  // that doing it is a real decision and not a free shortcut past two phases of
  // campaign. The aircrew number is the one that should stop the player.
  const RAW_PENALTY = 0.22;   // straight off the probability of effects
  const RAW_LOSS = 3;         // multiplier on the aircrew loss roll

  function computeStrike(target, pkg) {
    const ad = airDefenseWeight();
    const prof = assetProfile(pkg.asset);
    const raw = unsuppressed(pkg);
    // TLAMs fly under the SAM belt — air defense doesn't degrade a Tomahawk.
    // Its misses come from weather, targeting, or launch faults, not the threat.
    const adPenalty = prof.ad * ad + (raw ? RAW_PENALTY : 0);
    const dmgBonus = target.hp < 100 ? 0.15 : 0;
    // What Iran has learned about the way this campaign is being flown. Fly one
    // platform into the ground and this is the bill for it (see IranAI.adaptStep).
    // Nothing is learned from a submarine attack: decoys and dispersal are an
    // answer to weapons somebody saw coming, and nobody has ever seen this one.
    const adaptPenalty = pkg.sub ? 0 : IranAI.adaptPenalty(pkg.asset);
    const success = clamp(pkg.base - adPenalty - adaptPenalty + dmgBonus, 0.05, 0.95);
    // A packed bomber cell over a live SAM belt is not a risk, it is a funeral —
    // hence the higher cap when the tier is being flown outside its phase.
    const lossRisk = clamp(prof.loss * ad * (raw ? RAW_LOSS : 1), 0, raw ? 0.70 : 0.35);
    // What the player is buying: full effects on the good half of the success
    // band, half effects on the rest of it. Sites that wear down lose condition;
    // the buried nuclear sites take a whole step.
    //
    // Ships are neither. A warship that takes a weapon is not "damaged" in any
    // sense the war cares about — she is on the bottom, or she is still shooting
    // at you. So the whole success band kills, there is no partial result to
    // follow up, and nothing about a sunk hull ever comes back.
    const gradual = wearsDown(target);
    const oneShot = target.type === 'ship';
    return {
      success, adPenalty, adaptPenalty, lossRisk, gradual, oneShot, raw,
      fullOdds: success * (oneShot ? 1 : gradual ? 0.5 : 0.6),
      damage: gradual ? pkgDamage(pkg) : 50,
      tanker: tankerCost(target, pkg),
    };
  }

  // Strikes take time. Authorizing a package commits the assets and puts the
  // mission IN FLIGHT: fighter and TLAM packages arrive at the end of this
  // turn; B-2s transiting from Diego Garcia take two turns. BDA comes back
  // with the battle report — you commit, then you wait.
  // the heavies stage off Diego Garcia like the B-2s do, and the flight time
  // from an atoll 2,900 nm south is the same for a Bone as it is for a Spirit
  const MISSION_ETA = { f35: 1, fighter: 1, cruise: 1, stealth: 2, heavy: 2 };

  function executeStrike(target, pkg) {
    if (G.over || busy()) return;
    if (pkgStock(pkg) < pkg.qty) return;
    // a launcher group nobody has found is not a target, and a deep target is
    // not reachable without the northern tanker tracks
    if (target.type === 'tel' && (!target.dispersed || !target.located)) return;
    if (!canReach(target)) return;
    // and a tier that has not been released is not a package
    if (pkgBlock(target, pkg)) return;
    // fuel in the air is booked before anything leaves the deck
    const { cost, ok } = tankersFor(target, pkg);
    if (!ok) return;
    // The boat pays for her own shot out of her tubes; everything else comes off
    // the theater magazine. Tomahawks come out of the finite reservoir as well
    // as the ready launchers — every round fired is one the war never gets back.
    if (pkg.sub) {
      G.torpedoes = Math.max(0, (G.torpedoes ?? 0) - pkg.qty);
    } else {
      G.res[resKey(pkg.asset)] -= pkg.qty;
      if (pkg.asset === 'cruise') G.tlamPool = Math.max(0, (G.tlamPool || 0) - pkg.qty);
    }
    G.tankers -= cost;

    // the joint option is one-shot: committing it against either site spends it
    if (pkg.joint) { G.israelJointAvailable = false; syncJointPackages(); }

    // every package is logged by platform: this is what Iran adapts to. The
    // submarine shot is not logged at all — she is never held on sonar, and a
    // pattern nobody can observe is a pattern nobody can counter.
    if (!pkg.sub) G.adapt[pkg.asset] = (G.adapt[pkg.asset] || 0) + 1;
    G.strikesThisTurn++;
    G.stats.strikes++;
    G.missions.push({ targetId: target.id, pkg: { ...pkg }, eta: pkg.eta || MISSION_ETA[pkg.asset] });
    AudioSys.play('targetMarked');
    UI.renderAll(G);
    Save.write();
  }

  // resolve one mission at time-on-target; returns the BDA event
  function resolveImpact(target, pkg) {
    if (target.status === 'destroyed') {
      // an earlier package in the same volley (or turn) already finished it
      return {
        cls: 'friendly', title: `BDA: ${target.name}`,
        text: 'The package arrived over a target already destroyed. Aircraft and missiles expended against rubble — coordination cost, nothing gained.',
      };
    }

    G.struckThisTurn.push(target.id);
    // a joint strike carries its own diplomatic surcharge on top of the target's
    const worldCost = target.world + (pkg.extraWorld || 0);
    G.world = clamp(G.world + worldCost, 0, 100);
    const est = computeStrike(target, pkg);
    const roll = Math.random();
    let text;

    // One roll, three bands: full effects, half effects, nothing. A site that
    // wears down loses condition off its track; a buried hall takes a whole
    // step. For a ship the middle band does not exist — est.fullOdds is the
    // whole success band, so the roll either sinks her or it doesn't.
    const dmg = roll < est.fullOdds ? (est.gradual ? est.damage : 100)
      : roll < est.success ? (est.gradual ? est.damage * 0.5 : 50)
      : 0;

    const beforeBand = condition(target);
    const beforeHp = target.hp;   // what was left to disperse, if this kills it
    damageTarget(target, dmg);
    // the package looked at what it hit on the way through — a fresh assessment,
    // not a good one. It is the strike that produces the number, and the number
    // has a band on it from the moment it is written down.
    observe(target, false);
    const outcome = target.hp <= 0 ? 'destroyed' : dmg > 0 ? 'damaged' : 'miss';

    const ev = { cls: 'friendly', title: `BDA: ${target.name}`, dWorld: worldCost };
    ev.hit = outcome === 'destroyed' || outcome === 'damaged';

    if (outcome === 'destroyed') {
      G.stats.destroyed++;
      if (target.type === 'tel') G.stats.telsKilled++;
      G.approval = clamp(G.approval + 3, 0, 100);
      ev.dApproval = 3;
      text = est.oneShot
        ? `Battle damage assessment confirms ${target.name.split(' — ')[0]} is sunk. She broke up and went down inside ` +
          'twenty minutes; the P-8 on station counted survivors in the water and Iranian craft recovering them. ' +
          'There is nothing here to follow up and nothing to repair.'
        : target.type === 'tel'
          ? 'Battle damage assessment confirms the launcher group is destroyed — vehicles burning in the ' +
            'hide and secondary explosions off the reload rounds. That is a piece of the missile force that ' +
            'does not come back and does not move again.'
          : 'Battle damage assessment confirms the target is destroyed. Functional capability eliminated.';
      if (target.type === 'oil') { G.oil += 6; ev.dOil = 6; }
      // The sheds die, and whatever was still alive when the night started
      // drives away. Measured from the turn-start snapshot rather than from
      // beforeHp, so packing three packages onto one base in a single turn
      // does not quietly delete the brigade along with the buildings.
      if (target.type === 'missile') {
        ev.disperse = target.id;
        const atDusk = (G.turnStartHp && G.turnStartHp[target.id]);
        ev.disperseFrac = (typeof atDusk === 'number' ? atDusk : beforeHp) / 100;
      }
    } else if (outcome === 'damaged') {
      G.approval = clamp(G.approval + 1, 0, 100);
      ev.dApproval = 1;
      text = est.gradual
        ? `Partial effects on target. BDA assesses the site at ${condition(target)} — down from ` +
          `${beforeBand}, and both of those are estimates with real error in them. It is damaged, not ` +
          'finished, and it is still fighting. Every night it is left alone, crews put some of that back.'
        : 'Partial effects on target. Significant damage, but the site retains residual capability. A follow-up strike would likely finish it.';
    } else {
      G.approval = clamp(G.approval - 2, 0, 100);
      ev.dApproval = -2;
      text = pkg.sub
        ? TORPEDO_MISS_REASONS[Math.floor(Math.random() * TORPEDO_MISS_REASONS.length)]
        : est.oneShot
        ? SHIP_MISS_REASONS[Math.floor(Math.random() * SHIP_MISS_REASONS.length)]
        : pkg.asset === 'cruise'
          ? TLAM_MISS_REASONS[Math.floor(Math.random() * TLAM_MISS_REASONS.length)]
          : 'Strike failed to achieve desired effects. Weather, decoys, and hardening are assessed as contributing factors.';
    }

    // Aircrew attrition vs the SAMs still standing at time-on-target. Losing the
    // aircraft is where this ends; whether it costs two names on a casualty list
    // or puts living Americans on the ground belongs to csar.js.
    if (est.lossRisk > 0 && Math.random() < est.lossRisk) {
      G.stats.aircraftLost++;
      G.approval = clamp(G.approval - 4, 0, 100);
      ev.dApproval = (ev.dApproval || 0) - 4;
      const loss = CSAR.aircraftDown(target);
      text += ' ' + loss.text;
      if (loss.casualties) {
        G.casualties.us += loss.casualties;
        ev.casualties = loss.casualties;
      }
      AudioSys.play('aircraftLost', 600);
    }

    if (pkg.joint) {
      ev.title = `BDA: ${target.name} — JOINT US–ISRAELI STRIKE`;
      text += ' Israeli aircraft flew the escort and SEAD package. Tehran is telling the region this was a Zionist–American operation, and the region is inclined to believe it.';
    }

    ev.text = text;
    MapView.updateTarget(target);
    G.stats.peakOil = Math.max(G.stats.peakOil, G.oil);
    return ev;
  }

  // advance the mission clock and resolve everything reaching time-on-target,
  // animating each impact in sequence. Missions resolve in the order they were
  // laid on — a SEAD sweep queued first clears the air for packages behind it.
  function resolveMissions(done) {
    const due = [];
    for (const m of G.missions) { m.eta--; if (m.eta <= 0) due.push(m); }
    G.missions = G.missions.filter(m => m.eta > 0);
    const events = [];

    const next = () => {
      if (due.length === 0) { done(events); return; }
      // Batch adjacent same-target same-asset missions into one scope run so the
      // formation flies together with one silhouette per package. BDA still
      // resolves per-mission — the batching is purely an animation grouping.
      const head = due.shift();
      const batch = [head];
      // same target, same asset AND the same shooter — a submarine shot flies
      // its own card, or it would be drawn coming off the carrier with the salvo
      while (due.length && due[0].targetId === head.targetId &&
             due[0].pkg.asset === head.pkg.asset && !!due[0].pkg.sub === !!head.pkg.sub) {
        batch.push(due.shift());
      }
      const target = TARGETS.find(t => t.id === head.targetId);
      const count = batch.reduce((n, m) => n + (m.pkg.qty || 1), 0);
      // watchdog: if the animation frame loop is throttled (background tab),
      // resolve anyway — a stalled animation must never hold up the war
      let resolved = false;
      const finishBatch = () => {
        if (resolved) return;
        resolved = true;
        AudioSys.play('impact');
        const batchEvents = batch.map(bm => resolveImpact(target, bm.pkg));
        for (const ev of batchEvents) events.push(ev);
        // a successful hit plays the strike clip in the target's radar window —
        // the package decides which clip, so a torpedo lands as a torpedo
        if (batchEvents.some(ev => ev.hit)) MapView.playStrikeHit(target, head.pkg);
        UI.renderAll(G);
        next();
      };
      MapView.animateStrike(head.pkg.asset, target, finishBatch, count, head.pkg);
      // watchdog window must clear the whole run; a launch clip plays before the
      // flight (TLAMs always, carrier fighter sorties sometimes), so allow extra
      // time before force-resolving. Fighters can't be told apart here, so the
      // allowance is applied to all of them — it only delays the stall fallback.
      // the submarine shot runs on its own (longer) clock and plays no launch
      // clip — a torpedo swims out of the tube, it doesn't breach and boost
      const launchClip = head.pkg.sub ? 0
        : head.pkg.asset === 'cruise' || head.pkg.asset === 'fighter' ? 5000 : 0;
      const runDur = FLIGHT_DUR[head.pkg.sub ? 'sub' : head.pkg.asset] || 1000;
      setTimeout(finishBatch, runDur + launchClip + 3500);
    };
    next();
  }

  // ============================================================
  // OVERNIGHT REPAIR
  // ------------------------------------------------------------
  // What Iran does with the turns you spend somewhere else. Anything still
  // standing works its way back toward full; anything you finished stays
  // finished, and anything you put ordnance on tonight is too busy burning to
  // start. This is the whole reason a half-serviced target list is worse than a
  // short one — damage you don't follow up on is damage you rent, not own.
  // ============================================================
  function repairTargets() {
    // a decapitated command chain cannot organize a national repair effort:
    // parts, crews and priorities all come down the same wire you just cut
    const hq = TARGETS.find(t => t.id === 'irgc-hq');
    let eff = (0.4 + 0.6 * (hq.hp / 100)) * diff().repair * (IranAI.posture().repair || 1);
    // A repair effort runs on diesel. Wrecking the refining and export
    // infrastructure does not win the war on its own — what it does is starve
    // the generators, the cranes and the truck fleet that put everything else
    // back together, which is the reason to accept the diplomatic bill for it.
    const oilLeft = TARGETS.filter(t => t.type === 'oil').reduce((n, t) => n + t.hp / 100, 0) / 2;
    eff *= 0.55 + 0.45 * oilLeft;

    const back = [];
    for (const t of TARGETS) {
      if (!wearsDown(t) || t.hp <= 0 || t.hp >= 100) continue;
      if (G.struckThisTurn.includes(t.id)) continue;   // still burning
      const rate = Math.max(1, Math.round(TARGET_REPAIR[t.type] * eff));
      t.hp = Math.min(100, t.hp + rate);
      syncStatus(t);
      MapView.updateTarget(t);
      // Note what is happening, not by how much: nobody is standing over these
      // sites with a clipboard. The player knows the crews are working and can
      // see their own estimate widen — the exact number is the thing they are
      // being asked to buy with an ISR tasking.
      back.push(t.short);
    }
    if (!back.length) return null;

    return {
      cls: 'iran', title: 'DAMAGED SITES RECONSTITUTING OVERNIGHT',
      text: 'Overhead imagery shows work parties at every site CENTCOM did not revisit — craters filled, ' +
        'spare radars trucked out of the dispersal revetments, generators and crews moved in from the ' +
        `interior. Work assessed under way at: ${back.join(' · ')}. How much of it they got back is a ` +
        'question for the analysts, and the longer nobody looks, the wider that answer gets. Damage that ' +
        'is not followed up is damage that does not stay done.',
    };
  }

  // ran after any resolved action: persist, then check for an ending
  function afterAction() {
    G.stats.peakOil = Math.max(G.stats.peakOil, G.oil);
    Save.write();
    const result = checkEnd();
    if (result) finish(result);
  }

  // ============================================================
  // THE WAR POWERS VOTE
  // ------------------------------------------------------------
  // Approval used to be a meter that drifted until it killed you. This is the
  // turn it becomes an actor: the authorization the campaign has been running
  // on lapses, the Hill votes, and the vote is scored on everything the player
  // has actually been doing — how the country feels, how many are dead, whether
  // the war has any friends left abroad, whether the president ever bothered to
  // explain it, and whether there is anything to show for it.
  //
  // Three outcomes. The middle one is the interesting one: the war continues
  // with the target list legally shortened.
  // ============================================================
  function warPowersVote() {
    if (G.warPowers.done || G.turn < WAR_POWERS_TURN) return null;
    G.warPowers.done = true;

    const score = G.approval
      + G.world * 0.35
      - (G.casualties.us / casualtyLimit()) * 45
      + G.addresses * 5
      + G.nukeDegraded() * 0.12
      + (G.hostageCrisis ? -8 : 0)
      + (G.coalition ? 5 : 0);

    // Calibration. A strong war (approval 60, allies, few dead, the case made
    // on television) scores in the 80s and is authorized outright. An ugly but
    // recognisable war — approval 40, a hundred dead, one address — scores in
    // the high 30s and survives with a shortened target list, which is the
    // interesting outcome and therefore the one that should be common. Only a
    // genuinely collapsed position scores under 28. Losing the war outright on
    // this roll would be redundant: approval at or below 20 is already its own
    // defeat, and two ways to lose to the same number is one too many.
    if (score >= 62) {
      G.warPowers.result = 'authorized';
      G.approval = clamp(G.approval + 8, 0, 100);
      return {
        cls: 'friendly', title: 'CONGRESS AUTHORIZES THE USE OF FORCE',
        text: 'The joint resolution passed both chambers with votes to spare. The campaign has a legal ' +
          'mandate through its conclusion, the supplemental is attached, and the leadership of both ' +
          'parties stood behind the podium to say so. Members who spent last week briefing against this ' +
          'war spent this morning explaining that they always supported it. Whatever happens now, it is ' +
          'the country\'s war and not just yours.',
        dApproval: 8,
      };
    }

    if (score >= 28) {
      // what gets restricted is what the Hill is angriest about
      G.warPowers.result = 'restricted';
      G.warPowers.noOil = true;
      G.warPowers.noDeep = G.world < 45;
      G.approval = clamp(G.approval - 3, 0, 100);
      return {
        cls: 'world', title: 'CONGRESS AUTHORIZES — WITH CONDITIONS',
        text: 'The resolution passed, narrowly, with the amendments that were the price of passage. ' +
          'Strikes on Iranian energy infrastructure are prohibited outright — the argument that won the ' +
          'floor was that the president has been raising the price of gasoline to punish Tehran and ' +
          'charging it to American drivers.' +
          (G.warPowers.noDeep
            ? ' A second amendment bars strikes outside the declared theater, which the conference report ' +
              'defines narrowly enough to put the far northwest of Iran and the Caspian off the list.'
            : '') +
          ' The war continues. The target list is now shorter than CENTCOM would like, and it is shorter ' +
          'by law rather than by choice.',
        dApproval: -3,
      };
    }

    G.warPowers.result = 'cutoff';
    return { cutoff: true };
  }

  // What the Hill has taken off the table. Checked in the strike path and shown
  // in the planning modal, so a barred target reads as barred rather than broken.
  function barred(t) {
    if (G.warPowers.noOil && t.type === 'oil') return 'Prohibited by the War Powers resolution — no strikes on Iranian energy infrastructure.';
    if (G.warPowers.noDeep && (t.depth || 2) >= 3) return 'Prohibited by the War Powers resolution — outside the declared theater.';
    if (!canReach(t)) return 'Unreachable: with Gulf basing and overflight revoked there is no tanker track that puts a package this deep.';
    if (t.type === 'tel' && !t.located) return 'No fix. Dispersed launchers cannot be planned against until ISR finds them.';
    return null;
  }

  // ---- diplomacy ----
  // Intelligence taskings and diplomacy draw from two separate one-per-turn
  // slots: knowing and doing no longer compete for the same action.
  const INTEL_ACTIONS = ['bda', 'hunt', 'assess-nuclear', 'assess-intent', 'isr-prep'];
  function doDiplo(action) {
    if (G.over || busy()) return;
    const isIntel = INTEL_ACTIONS.includes(action);
    if (isIntel ? G.intelUsed : G.diploUsed) return;
    const events = [];

    switch (action) {
      case 'backchannel': {
        G.stats.backchannels++;
        if (G.negotiationReady()) {
          // odds are driven by how badly Iran is losing, not by how calm things are
          const warStr = IranAI.missileStrength() + IranAI.navalStrength(); // 0..4
          const irgcDown = TARGETS.find(t => t.id === 'irgc-hq').status === 'destroyed';
          // A dead leadership is leverage at the table rather than a shortcut to
          // it: a lasting bonus while the pragmatists hold on, plus the sharper
          // temporary one during the immediate power vacuum.
          const p = clamp(0.08 + (1.5 - warStr) * 0.12 + (irgcDown ? 0.08 : 0) +
            G.sanctions * 0.03 + G.negotiationMomentum +
            (G.raidDecapitated() && !G.regimeErratic ? 0.10 : 0) +
            (G.regimeChaosTurns > 0 ? 0.15 : 0) - (G.regimeErratic ? 0.15 : 0), 0.03, 0.65);
          if (Math.random() < p) {
            G.negotiationsAccepted = true;
            G.diploUsed = true;
            UI.renderAll(G);
            finish(buildResult('victory', 'deal'));
            return;
          }
          G.negotiationMomentum += 0.1;
          events.push({
            cls: 'world', title: 'Backchannel: Tehran not broken enough — yet',
            text: 'The Omanis report the pragmatists are listening but the hardliners still believe they can absorb the damage. Keep destroying what they fight with and the calculus changes.',
          });
        } else {
          // Tehran can still fight — the overture reads as American hesitation
          G.approval = clamp(G.approval - 2, 0, 100);
          events.push({
            cls: 'world', title: 'Backchannel rebuffed',
            text: 'Muscat relays Tehran\'s answer: no talks while the Islamic Republic can still fight. The overture is spun as American weakness on state TV, and hardliners at home ask why you\'re suing for peace mid-war.',
            dApproval: -2,
          });
        }
        break;
      }
      case 'un': {
        G.world = clamp(G.world + 8, 0, 100);
        events.push({
          cls: 'world', title: 'UN Security Council session',
          text: 'US diplomats rally broad condemnation of the attack on USS Milius. Russia and China block binding action but the diplomatic cover is valuable.',
          dWorld: 8,
        });
        break;
      }
      case 'sanctions': {
        G.sanctions++;
        G.world = clamp(G.world - 2, 0, 100);
        G.oil += 4;
        events.push({
          cls: 'world', title: 'Snap-back sanctions imposed',
          text: 'Sweeping secondary sanctions hit Iranian oil sales and finance. Tehran\'s economy contracts further — negotiation leverage improves.',
          dWorld: -2, dOil: 4,
        });
        break;
      }
      case 'coalition': {
        if (G.coalition) return;
        G.coalition = true;
        G.world = clamp(G.world + 5, 0, 100);
        // allied squadrons fly from land — they survive whatever happens afloat
        G.alliedFighters += 2;
        syncFleetCaps();
        G.res.fighters = Math.min(G.res.fighters + 2, G.caps.fighters);
        events.push({
          cls: 'world', title: 'Strike coalition assembled',
          text: 'The UK, France, and Gulf partners formally join the operation. Allied squadrons add sortie capacity and share the political burden.',
          dWorld: 5,
        });
        // One of the two capitals that just put its own aircrew over Iran rings
        // the White House. Coin flip which one — both are in it, and which one
        // reaches you first is not something a president schedules.
        G.leaderCall = { who: WORLD_LEADERS[Math.random() < 0.5 ? 0 : 1].id, answered: false };
        break;
      }
      case 'israel': {
        if (G.israelPosture !== 'sidelined') return;
        G.israelPosture = 'coordinated';
        G.israelPatience = 0;      // they are in the war now; nothing left to wait for
        G.israelJointAvailable = true;
        syncJointPackages();
        G.world = clamp(G.world - 8, 0, 100);
        G.oil += 5;
        G.alliedFighters += 2;
        syncFleetCaps();
        G.res.fighters = Math.min(G.res.fighters + 2, G.caps.fighters);
        events.push({
          cls: 'world', title: 'Israel brought into the operation',
          text: 'Jerusalem folds its strike planning into CENTCOM\'s. IAF squadrons add sortie capacity, and one combined deep-strike package is now available against Natanz or Fordow — the first path to the buried halls that does not require a B-2. The price is paid abroad: Arab partners who were quietly helping now have to be publicly seen not to, and Tehran has been handed the war it wants to fight — Israel is now a legitimate target in every Iranian broadcast.',
          dWorld: -8, dOil: 5,
        });
        break;
      }
      case 'address': {
        if (G.addressCooldown > 0) return;
        G.addressCooldown = 2;
        G.addresses++;
        G.approval = clamp(G.approval + 6, 0, 100);
        events.push({
          cls: 'friendly', title: 'Oval Office address',
          text: 'You lay out the stakes to the American people: the attack, the objectives, and what victory ' +
            'requires. The rally effect is real, for now — and every one of these is a vote on the floor ' +
            'when the authorization comes up.',
          dApproval: 6,
        });
        break;
      }
      case 'spr': {
        // The one lever that pushes the pump price DOWN. Coordinated reserve
        // draws — the SPR plus allied stocks under the IEA — put barrels on the
        // market the war is taking off it. It is finite: two meaningful releases
        // and the tanks are low enough that a third would be political theater.
        if (G.sprReleases >= 2) return;
        G.sprReleases++;
        const drop = G.sprReleases === 1 ? 20 : 12; // the second draw moves less
        G.oil = Math.max(60, G.oil - drop);
        G.approval = clamp(G.approval + 2, 0, 100);
        G.stats.peakOil = Math.max(G.stats.peakOil, G.oil);
        events.push({
          cls: 'friendly', title: 'Strategic Petroleum Reserve released',
          text: `You order a coordinated draw from the Strategic Petroleum Reserve, with allied ` +
            `stocks released in parallel. Crude falls roughly $${drop} a barrel as the barrels hit ` +
            `the market, and the price at the pump follows it down — relief the country feels this week. ` +
            (G.sprReleases >= 2
              ? 'The tanks are running low now; there is no third draw of this size to give.'
              : 'The reserve is deep, but not bottomless — one more release of this scale is all it holds.'),
          dOil: -drop, dApproval: 2,
        });
        break;
      }

      // ---- intelligence taskings ----
      // These share the intelligence slot with the raid's ISR prep and a
      // recovery push — one intel tasking per turn, run independently of
      // whatever State is doing with the diplomatic slot.
      case 'bda': {
        // sharpen the picture on whatever the analysts are least sure about
        const stale = TARGETS
          .filter(t => (wearsDown(t) || t.type === 'tel') && t.hp > 0 && G.intel[t.id])
          .map(t => ({ t, e: estimate(t) }))
          .filter(x => x.e.hi - x.e.lo > 6)
          .sort((a, b) => (b.e.hi - b.e.lo) - (a.e.hi - a.e.lo))
          .slice(0, 3);
        if (!stale.length) {
          events.push({
            cls: 'friendly', title: 'BDA tasking — nothing worth the sortie',
            text: 'The analysts report the current picture is as good as overhead can make it. There is ' +
              'nothing on the list stale enough to be worth a collection deck tonight.',
          });
          break;
        }
        for (const { t } of stale) observe(t, true);
        events.push({
          cls: 'friendly', title: 'BATTLE DAMAGE REASSESSMENT COMPLETE',
          text: 'A full collection deck — overhead passes, a Global Hawk orbit and the signals picture — ' +
            `has been worked against the sites the analysts were least sure of. Reassessed: ` +
            stale.map(({ t }) => `${t.short} at ${condition(t)}`).join(' · ') + '. Those numbers are as ' +
            'firm as this war gets, and they start going stale again tonight.',
        });
        break;
      }
      case 'hunt': {
        const ev = huntTels();
        if (!ev) {
          events.push({
            cls: 'friendly', title: 'No dispersed launchers to hunt',
            text: 'Every launcher group known to have left a base is either on the plot or destroyed. ' +
              'There is nothing out there for the sweep to find.',
          });
          break;
        }
        events.push(ev);
        break;
      }
      case 'assess-nuclear': {
        G.breakout.conf = G.breakout.conf === 'low' ? 'medium' : 'high';
        G.breakout.assessed = G.turn;
        const est = breakoutEstimate();
        events.push({
          cls: 'friendly', title: 'ENRICHMENT ASSESSMENT UPDATED',
          text: est.halted
            ? 'The IC has worked the problem with everything it has. The judgement is unanimous and it is ' +
              'the one you wanted: enrichment capability is destroyed. There is no breakout timeline ' +
              'because there is no longer a program to time.'
            : `Centrifuge counts off the last overhead pass, the procurement picture, and two human ` +
              `sources the Agency will not discuss. Revised judgement: Iran is ${est.lo}–${est.hi} turns ` +
              `from a device, ${est.conf} confidence. The Director was careful to say that the band is ` +
              `the honest part of the answer.`,
        });
        break;
      }
      case 'isr-prep': {
        // pattern-of-life ISR feeding the leadership raid; logic lives in
        // SpecOps, but it spends the intel slot like any other tasking
        if (!SpecOps.runIsrPrep(G, events)) return;
        break;
      }
      case 'assess-intent': {
        if (G.postureKnown) return;
        G.postureKnown = true;
        const P = IranAI.posture();
        events.push({
          cls: 'friendly', title: `IRANIAN WAR PLAN ASSESSED — ${P.name}`,
          text: `${P.brief} The tell the analysts built this on: ${P.tell}. Knowing it does not make any ` +
            'of it stop — what it does is tell you which of their arms is the one worth spending the ' +
            'campaign on.',
        });
        break;
      }
      default: return;
    }

    if (isIntel) G.intelUsed = true; else G.diploUsed = true;
    G.stats.peakOil = Math.max(G.stats.peakOil, G.oil);
    AudioSys.play('cable');
    UI.renderAll(G);
    // the coalition cable is the one that leaves a phone ringing behind it —
    // the call goes in front of afterAction rather than instead of it
    const after = pendingLeaderCall() ? () => leaderCall(afterAction) : afterAction;
    // an intelligence tasking comes back as a product, not a cable — it spends
    // the intel slot rather than the diplomatic one, and the player should be
    // able to tell at a glance which of the two they spent
    UI.showReport(isIntel ? 'INTELLIGENCE PRODUCT' : 'DIPLOMATIC CABLE',
      events, after);
  }

  // ---- the allied call ----
  // Taking it is +1 world opinion, refusing it -1. The swing is deliberately
  // trivial: this is a courtesy, not a lever, and a president who cannot spare
  // ninety seconds for an ally who just committed their own aircrew should pay
  // for it in exactly the currency the snub is denominated in — nothing else.
  const pendingLeaderCall = () => !!(G.leaderCall && !G.leaderCall.answered);

  function leaderCall(done) {
    const L = WORLD_LEADERS.find(l => l.id === (G.leaderCall || {}).who);
    if (!L) { if (done) done(); return; }
    UI.openLeaderCall(L,
      // banked the instant they answer, not when the popup closes: the call
      // itself runs eleven seconds and a tab closed mid-sentence must not lose
      // a decision the player already made
      (accepted) => {
        G.leaderCall.answered = true;
        G.world = clamp(G.world + (accepted ? 1 : -1), 0, 100);
        UI.renderAll(G);
        Save.write();
      },
      () => { UI.renderAll(G); if (done) done(); });
  }

  // ---- Israel's own clock ----
  // Israel is not waiting on American permission indefinitely. While they are
  // sidelined and the program is still substantially intact, their patience
  // runs down; at zero they fly the mission themselves. It is a worse strike
  // than one you would have run — no penetrators, partial results — and you
  // own the escalation without having chosen it.
  function israelTurn() {
    if (G.israelStrikesUsed || G.israelPosture !== 'sidelined') return null;
    if (G.nukeDegraded() >= 50) return null; // program already gutted: they stand down
    if (--G.israelPatience > 0) return null;

    G.israelPosture = 'unilateral';
    G.israelStrikesUsed = true;

    // what they actually achieve: real damage at Natanz, little at Fordow,
    // which is buried under rock only a GBU-57 reaches
    const hits = [];
    for (const [id, killP, dmgP] of [['natanz', 0.30, 0.75], ['fordow', 0, 0.40]]) {
      const t = TARGETS.find(x => x.id === id);
      if (t.hp <= 0) continue;
      const roll = Math.random();
      if (roll < killP) damageTarget(t, 100);
      else if (roll < dmgP) damageTarget(t, 50);
      else continue;
      hits.push(`${t.name} ${t.status}`);
    }

    const bda = hits.length
      ? `Assessed effects: ${hits.join('; ')}.`
      : 'Assessed effects: negligible. They spent the surprise and bought nothing.';

    return {
      cls: 'world', title: 'ISRAEL STRIKES IRAN UNILATERALLY',
      text: `Without notifying Washington, the Israeli Air Force flew a long-range package against the enrichment sites overnight. The first CENTCOM knew of it was the radar picture. ${bda} Jerusalem's statement thanks the United States for its support. Every capital in the region now believes you authorized this, and Tehran has said so on every frequency it owns. You no longer control the escalation — you only answer for it.`,
      dWorld: -14, dOil: 16, dApproval: -3,
    };
  }

  // ---- Iranian phase / end turn ----
  function applyEvent(ev) {
    // an outside actor working over a target CENTCOM never scheduled — an
    // Israeli counter-strike lands like a strike package, not like a switch
    if (ev.degradeTarget) {
      const t = TARGETS.find(x => x.id === ev.degradeTarget);
      if (t && t.hp > 0) damageTarget(t, wearsDown(t) ? PKG_DAMAGE * 0.6 : 50);
    }
    if (ev.casualties) G.casualties.us += ev.casualties;
    if (ev.dApproval) G.approval = clamp(G.approval + ev.dApproval, 0, 100);
    if (ev.dOil) G.oil = Math.max(60, G.oil + ev.dOil);
    if (ev.dWorld) G.world = clamp(G.world + ev.dWorld, 0, 100);
    if (ev.hormuz) { G.hormuz = ev.hormuz; MapView.setHormuz(G.hormuz); }
    if (ev.flashAsset) MapView.flashAsset(ev.flashAsset);
  }

  // ---- the turn lock ----
  // A turn is ended once. From the order until the battle report is dismissed
  // the war is resolving: the sidebar and the map go inert, and the end-turn
  // button is replaced by SKIP TO RESULTS, which collapses the animation without
  // touching a single outcome — everything below has already been decided.
  let resolving = false;
  const busy = () => resolving || SpecOps.busy() || CSAR.busy();

  function setResolving(on) {
    resolving = on;
    document.getElementById('app').classList.toggle('turn-resolving', on);
    document.getElementById('btn-end-turn').classList.toggle('hidden', on);
    const skip = document.getElementById('btn-skip-turn');
    skip.classList.toggle('hidden', !on);
    skip.disabled = false;
    skip.textContent = 'SKIP TO RESULTS ▸';
  }

  function skipToResults() {
    if (!resolving) return;
    const skip = document.getElementById('btn-skip-turn');
    if (skip.disabled) return;      // already skipping; the report is on its way
    skip.disabled = true;
    skip.textContent = 'RESOLVING…';
    // Flag first, clip second: cutting the call hands straight on to
    // resolveTurn, and fast-forward has to already be up when it does or the
    // first animation it starts plays at full length before the flag lands.
    MapView.setFastForward(true);
    // The night's opening call may still be holding the turn — a skip cuts it
    // rather than making the player sit through five seconds they've heard
    // every turn of the war.
    AudioSys.cut('strikeForce');
  }

  // Pressing END TURN opens with the watch floor's call, and nothing flies
  // until it has finished. Resolution below fills the map with launch clips,
  // missile runs and impacts within the first second; stacked underneath the
  // voice that was just noise, so the call gets the room to itself and the war
  // starts when it ends. The board is already locked by setResolving, and
  // playThen falls straight through when the clip can't play — a muted game
  // resolves with no pause at all.
  function endTurn() {
    // a task force or a recovery package is still on the objective — nothing
    // else moves until the mission resolves, or the sequencing of its debrief
    // and the turn breaks
    if (G.over || busy()) return;
    setResolving(true);
    AudioSys.playThen('strikeForce', resolveTurn);   // the night steps off
  }

  function resolveTurn() {
    // How much of each brigade was alive when tonight's packages started
    // arriving. Dispersal is measured against THIS, not against what the third
    // package in the same volley found: launchers scatter when the base becomes
    // untenable, not between two Tomahawks ninety seconds apart. Without the
    // snapshot, concentrating three packages on one base in one turn deletes
    // the brigade outright and the whole launcher hunt can simply be skipped.
    G.turnStartHp = {};
    for (const t of TARGETS) G.turnStartHp[t.id] = t.hp;

    // The night comes back in two halves, and the player answers for each one
    // separately. First the allied side of it: what tonight's packages did to
    // the target set, what Israel did, and what the machine around the campaign
    // did in response. Only once that has been read and dismissed does Tehran
    // get to answer — the salvo flies on the map, and a second report assesses
    // the damage it did to us.
    //
    // Everything Tehran's answer feeds — standing abroad, the basing tiers the
    // force flow depends on, and the Hill's count of the dead — is deliberately
    // still resolved in the second half, after the salvo lands. Iran hitting
    // Haifa tonight has to be able to cost you Incirlik tonight, not next turn.
    resolveMissions((bda) => {
      // Israel moves between the BDA and Iran's answer — if they went tonight,
      // Tehran is responding to their strike as much as to yours
      const israeli = israelTurn();
      // Tehran's answer is written now, against the state tonight's packages
      // left, and held until the first report is closed. Generating it here and
      // firing it later is what keeps the split cosmetic: the salvo is not
      // decided by anything the player reads in between.
      const events = IranAI.respond(G);
      // any aircrew still on the ground get another night of being hunted —
      // resolved after the BDA that may have just put them there
      const csar = CSAR.turnTick(G);
      if (csar) events.unshift(csar);
      // anti-ship fires are resolved against wherever the decks sat THIS turn,
      // before any repositioning ordered this turn completes below. The hit
      // itself lands here — carriers are marked lost as the salvo is resolved,
      // not when the report is read — so the transits below see the real fleet.
      const shipRisk = carrierRisk();

      // ---- half one: the allied night ----
      // repair runs before the night's events land, so anything an Israeli
      // counter-strike catches in the open stays caught for the turn
      const repairs = repairTargets();
      // an ally's strike package lands like a strike package, with the rest of
      // the allied action rather than inside Tehran's answer to it
      if (israeli) applyEvent(israeli);

      // launchers scatter out of the bases the BDA just confirmed destroyed
      const dispersals = [];
      for (const ev of bda) {
        if (!ev.disperse) continue;
        const d = disperseFrom(ev.disperse, ev.disperseFrac);
        if (d) dispersals.push(d);
      }

      // the sky changes hands, in whichever direction tonight's BDA and
      // tonight's repair crews left it
      const phase = airPhaseEvents();

      // campaign objectives crossed tonight pay their one-time approval bump
      const objectives = objectiveMilestones();

      // fleet movement closes the allied half: decks that spent it repositioning
      // are on their new stations, and the second carrier is one leg closer
      const fleet = checkCarrierTransit();
      const arrival = checkCarrierArrival();
      if (arrival) fleet.push(arrival);
      const bombers = checkBomberArrival();
      if (bombers) fleet.push(bombers);
      const heavies = checkHeavyArrival();
      if (heavies) fleet.push(heavies);

      // and the coast works up tomorrow night's shot, in the open, on purpose —
      // read after carrierRisk consumed tonight's, and shown with Tehran's half
      const threat = raiseThreat();

      const day = Math.ceil(G.turn / 2);
      const ours = [...bda, ...(israeli ? [israeli] : []), ...dispersals,
        ...(repairs ? [repairs] : []), ...phase, ...objectives, ...fleet];

      MapView.whenFootageDone(() => {
        if (!ours.length) { iranianResponse(); return; }
        AudioSys.play('bdaReport');   // the watch floor reads the night back to you
        UI.showReport(`BATTLE DAMAGE ASSESSMENT — DAY ${day}, TURN ${G.turn}`, ours, iranianResponse);
      });

      // ---- half two: Tehran answers ----
      function iranianResponse() {
        for (const ev of shipRisk) events.unshift(ev);
        if (threat) events.push(threat);
        if (events.some(ev => ev.casualties || ev.hormuz === 'CLOSED')) AudioSys.play('retaliation');

        // Iran's salvos fly on the map — missiles, drone swarms, intercepts —
        // before the damage assessment lands and covers the screen
        MapView.animateIranianAttacks(events, () => {
          for (const ev of events) applyEvent(ev);

          // economy: oil carries a war premium set by Iran's remaining ability
          // to threaten the Gulf, plus the state of the strait. The premium scales
          // with what Iran can still do rather than snapping between two values, so
          // grinding the missile and naval forces down is visible at the pump — and
          // the market eases toward the new target slowly, one night at a time.
          const warStr = IranAI.missileStrength() + IranAI.navalStrength(); // 0..4
          const warPremium = 3 + warStr * 2.5; // ~3 when Iran is finished, ~13 at full strength
          // A carrier group forward on the Gulf approaches is the market's
          // reassurance that the shipping lanes are held and escorted — it shaves
          // the crisis premium off the barrel, ~3 a deck, up to ~6 with the whole
          // fleet on station. It does not fight the strait-closure premium below,
          // which is a separate, larger shock; it just keeps the ambient fear down.
          const carrierReassurance = navalForward() * 3;
          const oilTarget = 88 + Math.max(0, warPremium - carrierReassurance) +
            (G.hormuz === 'CONTESTED' ? 14 : G.hormuz === 'CLOSED' ? 55 : 0);
          // The market eases toward the target one night at a time, but not
          // symmetrically: a fear premium spikes slowly and collapses fast. When
          // the price is above target — the threat easing rather than building —
          // it falls quicker, and quickest of all once the strait is reopened and
          // the tankers are moving again. That is what lets reopening Hormuz
          // actually be felt at the pump instead of bleeding off over a week.
          const gap = oilTarget - G.oil;
          const ease = gap >= 0 ? 0.16
            : G.hormuz === 'OPEN' ? 0.38
            : 0.24;
          G.oil = Math.max(60, G.oil + gap * ease);
          G.stats.peakOil = Math.max(G.stats.peakOil, G.oil);

          if (G.hormuz === 'CLOSED') G.hormuzClosedTurns++;
          else G.hormuzClosedTurns = 0;

          // domestic drift: the country reacts to the price at the pump. Expensive
          // gas and a long war bleed approval; cheap, calm markets let it recover a
          // little on its own — the one lever the president can always turn.
          if (G.oil >= 150) G.approval = clamp(G.approval - 2, 0, 100);
          else if (G.oil >= 125) G.approval = clamp(G.approval - 1, 0, 100);
          else if (G.oil <= 95) G.approval = clamp(G.approval + 1, 0, 100);
          if (G.turn > WEARINESS_TURN) G.approval = clamp(G.approval - 0.5, 0, 100);

          // the centrifuges ran again tonight, whatever else happened
          breakoutTick();

          // ---- the news cycle moves on ----
          // Standing abroad has to recover on its own or it is not a resource, it
          // is a ratchet: every strike costs a point or two, so without drift the
          // basing tiers are not consequences a player can manage, they are a
          // schedule. Recovery is real but slow, it pulls toward a baseline rather
          // than toward full, and it stops entirely while Israel is in the war on
          // its own account — that is the one thing the world does not get over.
          if (G.israelPosture !== 'unilateral') {
            const baseline = G.coalition ? 58 : 50;
            if (G.world < baseline) G.world = Math.min(baseline, G.world + 2.5);
          }

          // standing abroad is a permission slip, and it is checked nightly
          const basing = syncBasing();

          // the machine spins up: deploying squadrons close on whatever ramps the
          // politics have left open. Checked after basing, so a wave that arrives
          // the same night access is revoked correctly finds nowhere to land.
          const flow = forceFlowTick();

          // the Hill votes once, in the middle of the second week — after the
          // salvo, so it is counting tonight's dead and not last night's
          const vote = warPowersVote();
          const cutoff = vote && vote.cutoff;

          // What the night cost us. Tehran's salvo, what it did to the fleet and
          // to the aircrew still on the ground, and the political ground it took
          // out from under the campaign — the basing and the Hill are here
          // because they are reading the damage on this page.
          const theirs = [...events, ...basing, ...flow, ...(vote && !cutoff ? [vote] : [])];
          // the ticker and the after-action record still see the whole night —
          // the split is only in how it is read back to the president
          const all = [...ours, ...theirs];
          UI.setTicker(IranAI.headlines(G, all));
          recordTurn(all);
          const result = cutoff ? buildResult('defeat', 'cutoff') : checkEnd();

          const close = () => {
            // the turn is over: the map animates at speed again and the button
            // goes back to END TURN for the next one
            MapView.setFastForward(false);
            setResolving(false);
            if (result) { finish(result); return; }
            nextTurn();
          };
          if (!theirs.length) { close(); return; }
          UI.showReport(`IRANIAN RETALIATION — DAY ${day}, TURN ${G.turn}`, theirs, close);
        });
      }
    });
  }

  function nextTurn() {
    G.turn++;
    if (G.turn > G.maxTurns) {
      // the campaign has culminated: if the objectives are nowhere near met,
      // the force is spent for nothing — that is a defeat, not a draw
      finish(G.nukeDegraded() < 50
        ? buildResult('defeat', 'exhaustion')
        : buildResult('stalemate', 'time'));
      return;
    }

    // replenish — what the decks can turn around depends on where they are
    syncFleetCaps();
    const cap = fleetCapacity();
    G.res.f35 = Math.min(G.res.f35 + cap.repF35, G.caps.f35);
    G.res.fighters = Math.min(G.res.fighters + cap.repFighters, G.caps.fighters);
    // ready launchers reload at the same rate as ever — but never past what is
    // still in the theater reservoir, so a drained magazine cannot be topped off
    G.res.cruise = Math.min(G.res.cruise + cap.repCruise, G.caps.cruise, G.tlamPool);
    // the bombers only regenerate once there are bombers — turnaround at Diego
    // Garcia is three turns per airframe, and an empty ramp turns nothing around
    if (G.bombersArrived && G.turn % 3 === 0) {
      G.res.stealth = Math.min(G.res.stealth + 1, G.caps.stealth);
    }
    // the heavies turn faster than the B-2s do: no low-observable coatings to
    // repair between sorties, just fuel, bombs and crew rest. One a night
    // against two-sortie packages is a heavy cell every other night, which is
    // the tempo an atoll 2,900 nm from the target can actually sustain.
    if (G.heaviesArrived) {
      G.res.heavy = Math.min(G.res.heavy + 1, G.caps.heavy);
    }

    // tonight's tanker plan is written fresh: fuel in the air does not bank
    G.tankerCap = tankerCapacity();
    G.tankers = G.tankerCap;

    if (G.addressCooldown > 0) G.addressCooldown--;
    if (G.regimeChaosTurns > 0) G.regimeChaosTurns--;
    G.diploUsed = false;
    G.intelUsed = false;
    G.strikesThisTurn = 0;
    G.struckThisTurn = [];
    G.raidThisTurn = false;

    // the sidebar closes overnight: whatever was open for last night's decision
    // is not what tonight's is, and an open section scrolls the rest past the fold
    UI.closeAllPanels();

    UI.renderAll(G);
    Save.write();
  }

  // ---- the after-action record ----
  // One line a turn, written as the turn closes, so the endgame screen can show
  // the shape of the whole campaign rather than just its final numbers.
  function recordTurn(events) {
    const notable = events.find(e => e.casualties >= 10) ||
      events.find(e => e.hormuz) ||
      events.find(e => /DESTROYED|SUNK|LOST|CAPTURED|AUTHORIZ|REVOKED|DISPERSE/i.test(e.title)) ||
      events.find(e => e.cls === 'iran');
    G.timeline.push({
      turn: G.turn,
      approval: Math.round(G.approval),
      dead: G.casualties.us,
      deg: G.nukeDegraded(),
      text: notable ? notable.title : 'No significant developments.',
    });
  }

  // ---- endings ----
  function checkEnd() {
    if (G.over) return null;
    // primary win: the nuclear program is gone and Iran can no longer fight
    if (G.nukeDegraded() >= 100 && G.iranBroken()) return buildResult('victory', 'military');
    // the race the whole war was against: they got there first
    if (G.breakout.progress >= G.breakout.need) return buildResult('defeat', 'breakout');
    // the losses are military and political:
    if (G.casualties.us >= casualtyLimit()) return buildResult('defeat', 'casualties');
    if (G.approval <= 20) return buildResult('defeat', 'impeachment');
    if (G.hormuzClosedTurns >= 7 || G.oil >= 240) return buildResult('defeat', 'economy');
    return null;
  }

  function gradeFor(value, thresholds) {
    // thresholds: [A,B,C,D] cutoffs, ascending badness
    const letters = ['A', 'B', 'C', 'D'];
    for (let i = 0; i < thresholds.length; i++) if (value <= thresholds[i]) return letters[i];
    return 'F';
  }

  function buildResult(kind, reason) {
    const deg = G.nukeDegraded();
    const milGrade = deg >= 100 && G.stats.destroyed >= 5 ? 'A'
      : deg >= 100 ? 'B' : deg >= 50 ? 'C' : deg >= 25 ? 'D' : 'F';
    // graded against what THIS country would bear, so the letter means the same
    // thing on every difficulty
    const lim = casualtyLimit();
    const livesGrade = gradeFor(G.casualties.us, [lim * 0.1, lim * 0.2, lim * 0.4, lim * 0.8]);
    const worldGrade = G.world >= 60 ? 'A' : G.world >= 48 ? 'B' : G.world >= 36 ? 'C' : G.world >= 25 ? 'D' : 'F';
    const econGrade = gradeFor(G.stats.peakOil, [100, 125, 155, 190]);

    const titles = {
      military: 'DECISIVE VICTORY — IRAN\'S WAR MACHINE BROKEN',
      deal: 'ARMISTICE — TEHRAN SUES FOR PEACE',
      casualties: 'DEFEAT — UNSUSTAINABLE LOSSES',
      impeachment: 'DEFEAT — PRESIDENCY COLLAPSES',
      economy: 'DEFEAT — ECONOMIC COLLAPSE',
      exhaustion: 'DEFEAT — CAMPAIGN CULMINATED',
      time: 'WAR FROZEN — OBJECTIVES INCOMPLETE',
      breakout: 'DEFEAT — IRAN GOES NUCLEAR',
      cutoff: 'DEFEAT — CONGRESS CUTS OFF THE WAR',
    };
    const verdicts = {
      military: 'VICTORY. The nuclear program is destroyed and Iran\'s ability to wage war — its missile force, its navy, its command structure — has been dismantled. The objectives are achieved by force of arms.',
      deal: 'VICTORY. With its war machine breaking apart, Tehran took the off-ramp and accepted terms. The objectives are achieved — signed rather than shattered.',
      casualties: 'The casualty count crossed what the country would bear. Congress moved to cut off funding for the operation, and the campaign ends with its objectives unmet and its dead counted in the hundreds.',
      impeachment: 'With approval in ruins, your own party abandoned you. The House opened impeachment proceedings over the conduct of the war; the presidency is effectively over.',
      economy: 'The prolonged closure of Hormuz broke the global economy. Fuel rationing, a market crash, and allied governments falling — the war was lost at the gas pump.',
      exhaustion: 'The force culminated with the objectives nowhere in sight. Magazines empty, crews exhausted, and Iran\'s program still standing — the campaign simply ran out of ammunition and time.',
      time: 'Fifteen days of war ended in an armed standoff. Real damage was done, but Iran\'s capacity to fight survives; the problem is handed to the next news cycle, and perhaps the next president.',
      breakout: 'The war was fought to prevent exactly one thing, and it did not prevent it. Seismic sensors registered a test in the eastern desert while American aircraft were still flying. Every other number on this page is now a footnote.',
      cutoff: 'The authorization lapsed and the Hill declined to renew it. With funding cut off mid-campaign the force is being recovered rather than employed, and the war ends by act of Congress with its objectives unmet.',
    };
    const narratives = {
      military: `CENTCOM's assessment is unambiguous: enrichment halted, missile brigades combat-ineffective, the IRGC command chain severed.` +
        (G.hostageCrisis ? ' The American prisoners were recovered in the final hours as the regime\'s prison apparatus dissolved.' : '') +
        ` It took ${G.turn} turns and ${G.casualties.us} American lives.`,
      deal: `Backchannel talks in Muscat produced a framework: verified dismantlement against phased sanctions relief — terms dictated by the battlefield.` +
        (G.hostageCrisis ? ' The final sticking point was the American prisoners — their release is written into the first annex.' : '') +
        ` It took ${G.turn} turns and ${G.casualties.us} American lives.`,
      casualties: 'The war was winnable on the map. It was lost in the arrival ceremonies at Dover.',
      impeachment: 'The objectives, whatever their merits, could not survive the politics.',
      economy: 'Military dominance meant little once the strait stayed shut.',
      exhaustion: 'Historians will note the sorties flown and the little they changed.',
      time: `The nuclear program stands at ${deg}% degraded. The fleet remains on station. Nothing is settled.`,
      breakout: `The program stood at ${deg}% degraded when the device was tested — close enough that the ` +
        `argument about which turn lost this war will run for a generation. It took ${G.turn} turns and ` +
        `${G.casualties.us} American lives to not quite get there.`,
      cutoff: `The vote was ${G.approval < 35 ? 'not close' : 'close, and it went the wrong way'}. ` +
        `${G.casualties.us} dead, an ally count in single figures, and ${G.addresses === 0
          ? 'a president who never once went on television to explain what any of it was for'
          : 'a case the country had stopped listening to'}.`,
    };

    const grades = [
      ['MILITARY SUCCESS', milGrade, `Nuclear program ${deg}% degraded · ${G.stats.destroyed} targets destroyed · ${G.stats.aircraftLost} aircraft lost`],
      ['AMERICAN LIVES', livesGrade, `${G.casualties.us} US service members killed` +
        (G.stats.carriersLost ? ` · ${G.stats.carriersLost} carrier${G.stats.carriersLost > 1 ? 's' : ''} lost` : '')],
      ['DIPLOMATIC STANDING', worldGrade, `World opinion ${Math.round(G.world)}/100`],
      ['ECONOMIC DAMAGE', econGrade, `Peak oil price $${Math.round(G.stats.peakOil)}/bbl`],
    ];
    // Personnel recovery is only graded if the war ever put aircrew on the
    // ground — a campaign that never lost an aircraft is not scored on it.
    if (G.stats.downedCrews > 0) {
      const saved = G.stats.aircrewRescued, taken = G.stats.aircrewCaptured;
      const prGrade = taken === 0 && saved > 0 ? 'A'
        : taken === 0 ? 'B'
        : saved > 0 ? 'C'
        : G.downed ? 'D' : 'F';
      grades.splice(1, 0, ['PERSONNEL RECOVERY', prGrade,
        `${saved} aircrew recovered · ${taken} taken into Iranian custody` +
        (G.downed ? ' · 1 crew still evading when the war ended' : '')]);
    }
    if (G.raid !== 'none') {
      grades.splice(1, 0,
        G.raid === 'success'
          ? ['SPECIAL OPERATIONS', 'A', 'Leadership decapitation raid succeeded — regime command chain shattered']
        : G.raid === 'pyrrhic'
          ? ['SPECIAL OPERATIONS', 'C', 'Leadership target killed — the entire task force was lost taking him']
        : ['SPECIAL OPERATIONS', 'F', G.hostageCrisis
          ? 'Leadership raid failed — operators captured and paraded on Iranian state TV'
          : 'Leadership raid failed — the task force was lost on Iranian soil']);
    }

    G.over = true;
    return {
      kind, title: titles[reason], verdict: verdicts[reason], narrative: narratives[reason],
      grades,
      timeline: G.timeline,
      // the war plan Tehran was actually running, revealed at the end whether or
      // not the player ever paid to find out during it
      posture: IranAI.posture(),
      postureKnown: G.postureKnown,
      stats: {
        approval: G.approval, oil: G.oil,
        casualties: G.casualties.us, destroyed: G.stats.destroyed, turns: G.turn,
        limit: casualtyLimit(), difficulty: diff().name,
      },
    };
  }

  function finish(result) {
    G.over = true;
    Save.clear(); // the crisis is over, one way or another
    AudioSys.play(result.kind === 'victory' ? 'victory' : result.kind === 'defeat' ? 'defeat' : 'cable');
    UI.renderAll(G);
    UI.showEndgame(result);
  }

  // ---- boot ----
  function start(resume) {
    document.getElementById('title-screen').classList.add('hidden');
    document.getElementById('app').classList.remove('hidden');
    // a war opens — and a save resumes — with every sidebar section shut
    UI.closeAllPanels();
    MapView.render();
    syncFleetCaps();
    syncCarrierMap();   // the decks are only where the fleet state says they are
    syncBomberMap();    // and Diego Garcia is only on the plot once it is manned
    CSAR.syncMap(G);    // and downed aircrew are on it only while they are down
    MapView.setTargetClickHandler((t) => {
      if (G.over || busy()) return;
      if (t.status === 'destroyed') return;
      UI.openStrikeModal(G, t);
    });
    if (resume) {
      // rebuild map state from the restored targets/Hormuz status
      for (const t of TARGETS) MapView.updateTarget(t);
      MapView.setHormuz(G.hormuz);
      UI.setTicker(IranAI.headlines(G, [{ title: 'SITUATION ROOM RECONVENES — THE WAR CONTINUES' }]));
    } else {
      UI.setTicker(IranAI.headlines(G, [{ title: 'USS MILIUS STRUCK IN STRAIT OF HORMUZ — SEVEN SAILORS DEAD' }]));
    }
    UI.renderAll(G);
    // First-war primer: the single most common way a new player loses is by
    // fighting this as a pure targeting game and never touching the free action
    // slots that actually hold approval, oil and the coalition together. Shown
    // once, ever — dismissed and never seen again.
    if (!resume) UI.showPrimer();
  }

  function restoreAndStart(data) {
    for (const [f, v] of Object.entries(data.fields)) G[f] = v;
    // a save written before the levels were renamed still restores at the level
    // it was actually played at
    G.difficulty = DIFFICULTY_ALIAS[G.difficulty] || G.difficulty;
    // a save written before the Tomahawk reservoir existed restores with a full
    // war-load, plus the Ford's tranche if she is already on station
    if (typeof G.tlamPool !== 'number') {
      const ford = G.carriers && G.carriers.find(c => c.id === 'csg-ford');
      G.tlamPool = 20 + (ford && ford.arrived ? 10 : 0);
    }
    // a save written while the submarine shot was still a Tomahawk restores
    // with the boat's tubes full — she was never spending torpedoes before
    if (typeof G.torpedoes !== 'number') G.torpedoes = TORPEDO_LOAD;
    for (const t of TARGETS) {
      const rec = data.targets[t.id] || {};
      t.hp = typeof rec.hp === 'number' ? rec.hp : (t.dispersal ? 0 : 100);
      t.dispersed = !!rec.dispersed;
      t.located = !!rec.located;
      syncStatus(t);
    }
    syncJointPackages(); // packages live on static TARGETS — rebuild from saved state
    // caps are derived, never stored: rebuild them from the restored fleet and
    // the restored force flow rather than trusting the numbers in the save
    syncFleetCaps();
    G.caps.heavy = G.heaviesArrived ? HEAVY_CAP : 0;
    G.res.heavy = Math.min(G.res.heavy, G.caps.heavy);
    AudioSys.setMuted(!!data.muted);
    start(true);
    // saved between the coalition cable and answering the phone: it is still
    // ringing when the situation room reconvenes
    if (pendingLeaderCall()) leaderCall(null);
  }

  // ============================================================
  // KICKOFF
  // ------------------------------------------------------------
  // What is randomized, and why. A war that opens identically every time is a
  // war with an opening book, and an opening book is the death of a strategy
  // game — so the enrichment head start, Tehran's war plan, Israel's patience
  // and the state of the coastal SAM belt are all rolled here. None of it is
  // shown to the player; all of it is discoverable.
  // ============================================================
  function newWar(difficulty) {
    G.difficulty = DIFFICULTY[difficulty] ? difficulty : 'normal';

    // launcher groups start off the board entirely
    for (const t of TARGETS) {
      t.hp = t.dispersal ? 0 : 100;
      t.dispersed = false;
      t.located = false;
      syncStatus(t);
    }

    // Tehran's war plan, and how far along the centrifuges already are
    const plans = Object.keys(IRAN_POSTURES);
    G.iranPosture = plans[Math.floor(Math.random() * plans.length)];
    G.postureKnown = false;
    G.breakout = {
      progress: rand(0, 18),   // the program did not start the day the war did
      need: rand(BREAKOUT.needMin, BREAKOUT.needMax),
      conf: 'low', assessed: -99,
    };

    // Jerusalem's patience is not a constant either
    G.israelPatience = rand(3, 6);

    // the coastal SAM belt is not always found at full strength — sometimes an
    // opening-night sweep has already been flown, sometimes it hasn't
    const opener = TARGETS.find(t => t.id === 'ad-bandar');
    if (Math.random() < 0.5) {
      opener.hp = rand(55, 85);
      syncStatus(opener);
      G.intel[opener.id] = { hp: opener.hp, turn: 1, sharp: true };
    }

    // and the Strait does not always open quiet
    if (Math.random() < 0.25) G.hormuz = 'CONTESTED';

    // nothing has deployed yet and nobody owns the sky
    G.forceFlow = { landed: [], f35: 0, fighters: 0, tanker: 0, rep: 0 };
    G.heaviesOrdered = false; G.heavyEta = 0; G.heaviesArrived = false;
    G.caps.heavy = 0; G.res.heavy = 0;
    // the Lincoln's war-load of Tomahawks; the Ford adds 10 more if she is sent for
    G.tlamPool = 20;
    G.torpedoes = TORPEDO_LOAD;   // Toledo sails with her tubes full
    syncFleetCaps();
    G.res.f35 = G.caps.f35;
    G.airPhaseSeen = airPhase();

    G.tankerCap = tankerCapacity();
    G.tankers = G.tankerCap;
  }

  function init() {
    for (const t of TARGETS) { t.hp = t.dispersal ? 0 : 100; syncStatus(t); }
    AudioSys.init();
    UI.init();
    SpecOps.init();
    CSAR.init();

    document.getElementById('btn-start').addEventListener('click', () => {
      const sel = document.querySelector('input[name="difficulty"]:checked');
      newWar(sel ? sel.value : 'normal');
      start(false);
    });
    document.getElementById('btn-end-turn').addEventListener('click', endTurn);
    document.getElementById('btn-skip-turn').addEventListener('click', skipToResults);

    // continue / save & quit / new game
    const saved = Save.read();
    const btnContinue = document.getElementById('btn-continue');
    btnContinue.disabled = !saved;
    if (saved) btnContinue.addEventListener('click', () => restoreAndStart(saved));

    document.getElementById('btn-save-quit').addEventListener('click', () => {
      Save.write();
      window.location.reload();
    });
    document.getElementById('btn-new-game').addEventListener('click', () => {
      if (!confirm('Abandon the current war? The save will be erased.')) return;
      Save.clear();
      window.location.reload();
    });
  }

  document.addEventListener('DOMContentLoaded', init);

  // airDefenseWeight is exported read-only for the tactical scope's threat ring —
  // the scope dramatizes the number, it never feeds back into the strike math.
  return { computeStrike, executeStrike, doDiplo, endTurn, afterAction, israelStatus,
    airDefenseWeight, orderCarrier, toggleCarrierPosture, carrierFactor, carrierExposure, navalForward,
    orderBombers, orderHeavies, transitCommitted, wearsDown,
    // the air-superiority ladder: what the sky is worth tonight, and what that
    // releases. pkgBlock is the single answer to "why can't I fly this".
    airSuperiority, airPhase, phaseAtLeast, pkgBlock, PHASE_LABEL, minPackage, resKey, pkgStock,
    // the uncertainty layer: everything the player sees goes through these
    estimate, condition, breakoutEstimate, barred, canReach, tankersFor, tankerCapacity,
    casualtyLimit, difficulty: diff,
    FORD_TRANSIT_TURNS, B2_TRANSIT_TURNS, HEAVY_TRANSIT_TURNS, WAR_POWERS_TURN, G };
})();
