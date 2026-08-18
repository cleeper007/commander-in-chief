// ============================================================
// assess.js — the read of the board that everyone argues from
// ============================================================
// Two things in this game have to have an opinion about tonight: the staff,
// which writes the courses of action (COA in data.js, coaOptions in game.js),
// and the four people in the situation room (advise in ai.js). Through v1.81
// they each assembled their own facts and then said something largely fixed
// about them — `coaScore` computed a number and threw the reasoning away, so
// ROLLBACK's argument was the same four sentences on turn 2 and turn 27, and
// the advisor ladder bottomed out in slogans ("Tempo is mercy", "Sustain the
// sortie rate") that are true of every night of every campaign and therefore
// tell a president nothing about this one.
//
// The fix is not more prose. It is that a brief and a recommendation are both
// arguments, an argument is made FROM something, and the something has to be
// written down once. `board()` is that: every reading the staff and the
// advisors are allowed to reason from, in one struct, computed the same way for
// both of them. `concerns()` is the judgement on top of it — what is going
// wrong tonight, ranked, each tied to the doctrine that answers it.
//
// THREE RULES, and all three are the reason this is a module and not a pile of
// helpers.
//
// 1. NOTHING IN HERE MAY READ WHAT THE PRESIDENT CANNOT. The staff is not
//    allowed a private assessment: everything below goes through the same
//    functions the HUD, the objectives panel and the intel panel already draw
//    from — `Game.estimate` rather than `t.hp` for anything that wears down,
//    `warMachine()` rather than the win check's internals, `breakoutEstimate()`
//    rather than `G.breakout`. A recommendation the player could not have
//    reached from their own screen is not advice, it is the game cheating in
//    the player's favour, and it teaches them to stop reading the board.
//
// 2. IT IS NOT CACHED. The obvious optimisation — memoise on the turn — is
//    wrong twice over: the advisors re-render inside a turn (a package flies,
//    a diplomatic action lands, a collection deck comes back) and would go on
//    quoting a board that has moved, and any signature cheap enough to be worth
//    computing would miss one of the dozen things that can change mid-night.
//    It is fifteen passes over forty targets. `coaOptions` caches its own
//    output by turn for its own reasons and is unaffected either way.
//
// 3. THE FACTS AND THE PROSE ARE THE SAME OBJECT. A concern carries `now` (the
//    clause that says why it matters tonight) and `left` (the clause for when
//    the night went elsewhere), so the brief that recommends servicing it and
//    the brief that admits it is being deferred cannot describe two different
//    wars. That symmetry is the whole point of the ranking: what makes the menu
//    a decision rather than a queue is that every option is visibly leaving
//    something undone, named, in the same words the option that would have done
//    it uses.
const Assess = (() => {
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const pc = (v) => Math.round(v * 100);

  // ============================================================
  // THE BOARD
  // ------------------------------------------------------------
  // Grouped the way the situation room is: the sky, the fires, the program,
  // home, abroad, tonight's capacity, what we know, and — last, because it is
  // the only derived judgement in here — whether the campaign is converging.
  // ============================================================
  function board() {
    const G = Game.G;
    const d = Game.difficulty();

    const ad = TARGETS.filter(t => t.type === 'airdefense');
    const nuke = TARGETS.filter(t => t.type === 'nuclear');
    const tels = TARGETS.filter(t => t.type === 'tel' && t.dispersed && t.hp > 0);

    // An aimpoint the CAOC could actually put a package on tonight: on the
    // plot, in range, not barred by the resolution. Everything that counts
    // "what is left to do" counts THIS, because a site the president cannot
    // reach is not a task they are failing to perform.
    const workable = (t) => t.hp > 0 && Game.plotted(t) && Game.canReach(t) && !Game.legallyBarred(t);

    const brk = Game.breakoutEstimate();
    const gate = G.warMachine();

    // ---- the telegraphed anti-ship shot, READ rather than resolved ----
    // `Game.carrierRisk()` is not a reading. It is the resolver: it rolls
    // tonight's shot, clears `G.threat` and returns the events. Calling it to
    // find out how exposed the deck is both returns the wrong thing — an array,
    // whose `.risk` is undefined, so any arithmetic on it is NaN — and consumes
    // the warning, which is the entire mechanic. `coaScore` did exactly that
    // from v1.77 to v1.81 and so quietly disabled telegraphed anti-ship fires on
    // every difficulty that briefs a course of action.
    //
    // The reading is `G.threat` itself, which is where raiseThreat leaves it for
    // the sidebar and the map, scaled the same three ways carrierRisk scales the
    // roll: the announced probability, whether the shooter is still alive, and
    // whether the deck is still in the envelope. Those are the three things the
    // warning event tells the player outright, so this is not a private number.
    const th = G.threat;
    const thCv = th ? G.carriers.find(c => c.id === th.cvId) : null;
    const thSrc = th ? TARGETS.find(t => t.id === th.srcId) : null;
    const risk = th && thCv && thSrc
      ? th.p * (thSrc.hp / 100) * Game.carrierExposure(thCv) : 0;

    // ---- the trend, off the record the endgame screen already keeps ----
    // G.timeline is one row a turn: approval, dead, program degraded. It is the
    // only history the game stores, it is already saved, and it is the only way
    // to answer the question a president actually asks in week two — not "how
    // bad is it" but "is this working". A window rather than the whole war:
    // four turns is two days, long enough to survive one quiet night and short
    // enough that a campaign which turned around three turns ago reads as
    // turned around.
    const tl = G.timeline || [];
    const win = tl.slice(-5);
    const span = win.length >= 2 ? win[win.length - 1].turn - win[0].turn : 0;
    const rateOf = (key, from) => (span > 0 ? (win[win.length - 1][key] - win[0][key]) / span : null);
    // approval per turn, signed the way the number moves; bleed is the positive
    // magnitude of it falling, because "runway" only means anything downhill
    const dApproval = rateOf('approval');
    const bleed = dApproval !== null && dApproval < 0 ? -dApproval : 0;
    const degRate = rateOf('deg');
    const deadRate = rateOf('dead');

    const deg = G.nukeDegraded();
    const dead = G.casualties.us;
    const deadCap = Game.casualtyLimit();

    // Turns of runway on each of the two clocks the country holds, and they are
    // deliberately computed the same way: current margin over current rate. A
    // null means the clock is not running, which is a completely different
    // state from "a long time" and must not collapse into a large number.
    const runwayApproval = bleed > 0.15 ? G.approval / bleed : null;
    const runwayDead = deadRate > 0.15 ? (deadCap - dead) / deadRate : null;
    const runway = runwayApproval === null ? runwayDead
      : runwayDead === null ? runwayApproval
        : Math.min(runwayApproval, runwayDead);

    // How long the program takes at the rate it is actually being worked, which
    // is not the same question as how much of it is gone. A campaign 60% of the
    // way through the halls that has not touched one in six turns has no ETA at
    // all, and saying so is worth more than any percentage.
    const degEta = deg >= 100 ? 0 : degRate > 0.2 ? (100 - deg) / degRate : null;

    const b = {
      turn: G.turn, day: Math.ceil(G.turn / 2),
      horizon: Math.max(0, G.softCap - G.turn),
      diff: d,

      // ---- the sky ----
      phase: Game.airPhase(),
      sup: Game.airSuperiority(),
      adLive: ad.filter(t => t.hp > 0).length,
      adTotal: ad.length,
      // a battery this campaign already flattened that is radiating again. The
      // sharpest single fact on the board for the counter-infrastructure
      // argument, and the reason superiority is described as rented.
      adBack: ad.filter(t => t.killedOnce && t.hp > 0).length,
      heavies: G.heaviesArrived, heaviesOrdered: G.heaviesOrdered, heavyEta: G.heavyEta,
      bombers: G.bombersArrived, bombersOrdered: G.bombersOrdered, bomberEta: G.bomberEta,

      // ---- the fires ----
      // Both of these are on a 0..2 scale — see the comments on
      // IranAI.missileStrength and navalStrength, where 2 is an untouched arm.
      // The fractions are the same readings as 0..1, and they exist because
      // every coefficient anyone has ever written against these was written for
      // a fraction: `coaScore` multiplied the raw 0..2 by 0.55 and clamped at 1,
      // which pinned counterforce AND maritime at maximum urgency from turn 1
      // until the arm was more than half destroyed. Measured, that is why the
      // leading doctrine on 59% of all briefed nights was counterforce and the
      // enrichment program — the only thing the war is scored on — led on 5%.
      // Anything scoring off "how much of this arm is left" takes the fraction;
      // the raw scale stays for the things genuinely written against it.
      mStr: IranAI.missileStrength(), mFrac: IranAI.missileStrength() / 2,
      nStr: IranAI.navalStrength(), nFrac: IranAI.navalStrength() / 2,
      telsFound: tels.filter(t => t.located).length,
      telsHidden: tels.filter(t => !t.located).length,
      bmd: Game.bmdFrac(), bmdRate: Game.bmdRate(), bmdRearming: Game.bmdRearming(),
      forward: Game.navalForward(),
      risk,
      // The STANDING anti-ship picture, as against `risk` above, which is
      // tonight's telegraphed shot and is null on most nights. These are two
      // different questions and the difference is the whole of v1.99: a deck
      // held south by a live coast never gets a workup raised against her at
      // all, so `risk` reads 0 on exactly the nights the coast is the reason
      // the barrel has no lid on it.
      antiShip: Game.antiShipRisk(),
      threat: th && thCv && thSrc
        ? { cv: thCv, src: thSrc, p: th.p, name: CARRIER_INFO[thCv.id].short } : null,

      // ---- the program ----
      deg, brk,
      nukeLive: nuke.filter(t => t.hp > 0).length,
      nukeWorkable: nuke.filter(workable).length,
      // the halls that exist, are known about, and still cannot be touched —
      // the one number that says "this is a force-flow problem, not a targeting
      // problem" without the player having to open four dialogs to find out
      nukeBlocked: nuke.filter(t => t.hp > 0 && Game.plotted(t) && !workable(t)).length,

      // ---- home ----
      approval: G.approval, dead, deadCap,
      room: Math.max(0, deadCap - dead),
      addresses: G.addresses,
      bleed, deadRate, runway,
      vote: G.warPowers, voteIn: G.warPowers.done ? null : Game.WAR_POWERS_TURN - G.turn,

      // ---- abroad ----
      world: G.world,
      basing: G.basing,
      // where the Gulf tier actually folds tonight, which the doves have been
      // walking upward all war — the constant in BASING_TIERS is the floor and
      // has not been the answer since v1.71
      foldAt: Game.gulfFoldThreshold ? Game.gulfFoldThreshold('gulf') : BASING_TIERS.gulf.at,
      israel: {
        posture: G.israelPosture, pressure: G.israelPressure,
        eta: Game.israelEta(), hold: G.israelHold,
        joint: G.israelJointAvailable,
        list: Game.israelPriorities().filter(t => t.hp > 0),
      },
      gulf: {
        caveats: G.gulf.caveats, capped: G.gulf.caveats >= GULF.caveatMax,
        corridor: G.gulf.corridor, gifts: G.gulf.gifts.length,
      },
      houthi: {
        active: !!(G.houthi && G.houthi.entered),
        strength: G.houthi && G.houthi.entered ? Game.houthiStrength() : 0,
        saudi: !!(G.houthi && G.houthi.saudiIn),
        mandab: G.mandab,
        reach: Game.reachesYemen(),
      },
      hormuz: G.hormuz, hormuzTurns: G.hormuzClosedTurns, oil: G.oil,

      // ---- tonight's capacity ----
      slots: Game.atoSlots(), spent: G.strikesThisTurn,
      left: Math.max(0, Game.atoSlots() - G.strikesThisTurn),
      fatigue: G.fatigue, tankers: Game.tankerCapacity(),
      tlam: G.tlamPool, torpedoes: G.torpedoes,
      pgmNights: Game.pgmNights(), pgmLedger: Game.pgmLedger(),

      // ---- what we actually know ----
      // the same "too soft to plan against" test CJCS has always used, kept
      // here so the brief can use it too
      blind: TARGETS
        .filter(t => (Game.wearsDown(t) || t.type === 'tel') && t.hp > 0)
        .map(t => Game.estimate(t))
        .filter(e => !e.known && e.hi - e.lo >= 30).length,
      boxes: Game.suspectedBoxes().length,

      // ---- the other way this ends ----
      // Read through Game.dealProgress() for the same reason `gate` goes
      // through warMachine(): it is scored exactly as negotiationReady() scores
      // it, so nothing in here can tell the president they are closer to the
      // table than the gate thinks they are. Rule 1 — the president sees this
      // number, because the clauses below are where it is displayed.
      deal: G.dealProgress(),

      // ---- is this working ----
      gate, gateDone: gate.filter(g => g.done).length,
      gateLag: gate.slice().sort((a, b) => a.pct - b.pct)[0],
      degRate, degEta,
      // The strategic read, and the only place in the codebase where the two
      // clocks are compared to each other. A war that finishes the program on
      // turn 19 and runs out of country on turn 14 is losing, and it is losing
      // in a way that no single gauge on the screen shows — both of them look
      // survivable on their own. Null when either clock is not running, because
      // "we cannot tell" is the honest answer and a false confident one here
      // would be the worst line in the game.
      converging: null,
    };
    if (b.degEta !== null && b.runway !== null) b.converging = b.degEta <= b.runway;
    // a program already finished converges by definition, however bad the room
    if (deg >= 100) b.converging = true;

    return b;
  }

  // ============================================================
  // WHAT IS GOING WRONG TONIGHT
  // ------------------------------------------------------------
  // Ranked, and each one tied to the doctrine that answers it (see COA in
  // data.js) or to no doctrine at all, which is itself information — an
  // undoctrinal concern is one the tasking order cannot fix and the diplomatic
  // panel can.
  //
  // `sev` is 0..1 and the scale is shared, which is the part that took the
  // measurement to get right: these numbers are compared ACROSS categories, so
  // "the launcher fix expires tonight" and "the country stops paying in three
  // turns" have to be on the same ruler or the ranking is noise. The anchors
  // are 0.9 = perishable tonight, 0.7 = decides the campaign, 0.5 = wants a
  // package this week, 0.3 = standing background of the war.
  //
  // `now` is the clause used when a doctrine is being recommended FOR this, and
  // `left` is the clause used when tonight went somewhere else. Same fact,
  // stated from the two sides, which is what stops the brief being a sales
  // pitch — see the note at the top of this file.
  // A deck standing off BECAUSE OF THE COAST, which is not the same as a deck
  // standing off. She is also south alongside the ammunition ship, and a rearm
  // is a three-night bill the president already agreed to — a staff that briefed
  // "no deck forward" at a magazine reload would be selling a maritime package
  // against a condition the maritime package cannot fix. `antiShip` is what
  // makes the difference: it is the standing risk off the surviving coast, and
  // it is zero when there is nothing out there to kill.
  const offStation = (b) => b.forward <= 0 && b.antiShip > 0 && !b.bmdRearming;

  const CONCERNS = [
    {
      id: 'telfix', doctrine: 'counterforce',
      when: b => b.telsFound > 0,
      // the only genuinely perishable thing on the board: they shoot and move
      sev: b => 0.88 + clamp(b.telsFound * 0.03, 0, 0.1),
      now: b => `Fix on ${Txt.plural(b.telsFound, 'launcher group')} — fixes on those do not survive to tomorrow.`,
      left: b => `the fix on ${Txt.plural(b.telsFound, 'launcher group')} expires overnight`,
    },
    {
      id: 'breakout', doctrine: 'objective',
      when: b => !b.brk.halted && b.deg < 100,
      // the clock the whole war is against. Floors high on purpose: every other
      // concern here decays as it is worked and this one does not, which is why
      // it outranks a comfortable-looking board (see the objective floor note
      // in coaScore).
      sev: b => clamp(0.42 + 0.5 * clamp(1 - (b.brk.mid || 30) / 14, 0, 1), 0.42, 0.95),
      // Two clauses, because from v2.19 these are two different wars. The
      // declared halls standing is a targeting problem with the aimpoints on
      // the plot. The declared halls gone and the clock still running is a
      // COLLECTION problem, and the president who is told the first thing on
      // that night goes looking at a target list that has nothing left on it.
      // Written to the read cell's WIDTH, like the two `deal` arms: brief.js
      // measures `phase.name + ' — ' + now` and the box is a fixed two lines.
      // The first draft of this clause ran to 133 characters on its own.
      now: b => b.brk.undeclared
        ? `A device ${b.brk.lo}–${b.brk.hi} turns out, and none of it at Natanz or Fordow any more.`
        : `A device ${b.brk.lo}–${b.brk.hi} turns out, ${b.brk.conf} confidence, ` +
          `${100 - b.deg}% of the program still turning.`,
      left: b => b.brk.undeclared
        ? 'the undeclared halls run another night and no aimpoint on the plot reaches them'
        : `the centrifuges run another night ${b.brk.hi <= 8 ? `inside a ${b.brk.lo}–${b.brk.hi} turn band` : 'unmolested'}`,
    },
    {
      id: 'belt', doctrine: 'rollback',
      when: b => b.adLive > 0,
      // contested is the whole air component sitting on ramps; past that the
      // belt is maintenance, and reconstitution is what makes it urgent again
      sev: b => b.phase === 'contested' ? 0.62 + 0.25 * (1 - b.sup)
        : b.phase === 'degraded' ? 0.40 + (b.adBack ? 0.12 : 0)
          : 0.22 + (b.adBack ? 0.22 : 0),
      now: b => b.phase === 'contested'
        ? `${Txt.plural(b.adLive, 'SAM complex')} radiating, and two thirds of the wing grounded until they are not.`
        : b.adBack
          ? `${Txt.plural(b.adBack, 'battery')} we already flattened ${Txt.are(b.adBack)} back on the air out of the reserve.`
          : `${Txt.plural(b.adLive, 'complex')} left in the belt, and tonight's sky is rented from them.`,
      left: b => b.phase === 'contested'
        ? `the belt holds and the fourth-generation force stays on the ramp`
        : `${Txt.plural(b.adLive, 'SAM complex')} ${Txt.are(b.adLive)} left standing`,
    },
    {
      id: 'salvo', doctrine: 'counterforce',
      when: b => b.mStr > 0.2,
      // pays twice — fewer inbound tonight, and rounds still in the cells in
      // week three — so a thin magazine is part of this concern and not its own
      sev: b => clamp(0.30 + b.mStr * 0.22 + (1 - b.bmd) * 0.30, 0, 0.86),
      now: b => b.bmd < NAVAL_BMD.warn
        ? `The brigades are still firing and the screen is down to ${pc(b.bmd)}% of its interceptors.`
        : `The brigades are still firing; every one serviced tonight is a salvo the screen need not answer.`,
      left: b => b.bmd < NAVAL_BMD.warn
        ? `the brigades shoot again tonight against a screen at ${pc(b.bmd)}%`
        : `the missile force goes unserviced`,
    },
    {
      id: 'strait', doctrine: 'maritime',
      // A deck standing off because the coast can still shoot at her is a
      // maritime problem whoever made the call — the president on the levels
      // with a fleet panel, Fifth Fleet on the one without. It is in `when`
      // explicitly because the two terms already there can both be quiet while
      // it is true: a worked navy puts `nStr` under the bar, and a deck south is
      // exactly the state in which no workup is ever raised, so `risk` is 0.
      when: b => b.hormuz !== 'OPEN' || b.nStr > 0.3 || b.risk > 0.3 || offStation(b),
      // The severities are deliberately almost untouched. What a deck held south
      // changes is what this concern SAYS and whether it is raised at all, not
      // where it ranks: these numbers were calibrated against the read line's
      // red/amber bands (v1.83), and two cuts that put a real off-station term
      // on the open arm (+0.14, cap 0.78) and the shut arm (+0.08) took
      // `sev >= 0.8` from 14–26% of turns to 31–44% on every persona and every
      // difficulty. A condition flagged amber on two nights in five is not a
      // signal. The one number that moves is +0.02 on the shut arm, which exists
      // only to keep the ordering honest — a strait shut with nothing forward
      // must not score under a strait open with nothing forward.
      sev: b => b.hormuz === 'CLOSED'
        ? 0.72 + clamp(b.hormuzTurns * 0.01, 0, 0.1) + (offStation(b) ? 0.02 : 0)
        : clamp(0.24 + b.nStr * 0.20 + b.risk * 0.26, 0, 0.72),
      now: b => b.hormuz === 'CLOSED'
        ? `Hormuz shut ${Txt.turns(b.hormuzTurns)}, barrel at $${Math.round(b.oil)}` +
          (offStation(b) ? ', and no deck forward to lean on it.' : '.')
        : b.threat && b.risk > 0.05
          ? `${b.threat.src.short} is holding a firing solution on ${b.threat.name} — ${pc(b.risk)}% before dawn.`
          // The actionable one, and it names the price rather than the risk: a
          // deck off station is no Aegis, no weight on the strait and no lid on
          // the barrel, and the barrel is what ends these campaigns.
          : offStation(b)
            ? `No deck forward while that coast can shoot — no Aegis, no lid on the barrel at ` +
              `$${Math.round(b.oil)}.`
            : `Their navy and the coastal batteries are why the strait is a premium and not a shipping lane.`,
      // `left` names the same price `now` does, from the other side — an option
      // that defers this has to say what it is deferring, and on a shut strait
      // with nothing forward that is two facts and not one.
      left: b => b.hormuz === 'CLOSED'
        ? (offStation(b) ? 'the strait stays shut with no deck forward to lean on it'
          : 'the strait stays shut and the barrel stays where it is')
        : offStation(b) ? 'the coast keeps the deck south and the barrel unlidded'
          : 'the anti-ship threat is untouched',
    },
    {
      id: 'israel', doctrine: 'jerusalem',
      when: b => b.israel.posture !== 'coordinated' && b.israel.list.length > 0,
      sev: b => clamp(b.israel.pressure / ISRAEL.fly, 0, 1) * 0.82,
      now: b => b.israel.eta === null
        ? `Jerusalem is not launching inside this campaign, and ${Txt.plural(b.israel.list.length, 'aimpoint')} ` +
          `on their list ${Txt.are(b.israel.list.length)} what is holding it.`
        : `Jerusalem goes in about ${Txt.turns(b.israel.eta)}; their list is ` +
          `${b.israel.list.slice(0, 3).map(t => t.short).join(', ')}.`,
      left: b => b.israel.eta === null ? "Jerusalem's list goes another night"
        : `Jerusalem's clock runs on with ${Txt.turns(b.israel.eta)} left on it`,
    },
    {
      id: 'houthi', doctrine: 'southern',
      when: b => b.houthi.active && b.houthi.strength > 0,
      sev: b => clamp(0.26 + b.houthi.strength * 0.24 + (b.houthi.mandab === 'CLOSED' ? 0.16 : 0), 0, 0.66),
      // Trimmed to the read cell's budget at v2.19, and the reason is worth
      // keeping: this clause did not change and did not need to. The breakout
      // clock staying alive (see enrichRate) made the RACE phase reachable on
      // nights the southern front leads, and phase + clause is what the cell
      // renders — at 101 characters under a 22-character phase name it was the
      // first line in the game to reach 127 and wrap onto a third row. Every
      // arm now fits under GAINING AIR SUPERIORITY, the longest name there is.
      now: b => `Ansar Allah unopposed on the Red Sea coast` +
        (b.houthi.mandab === 'CLOSED' ? ', Bab al-Mandab shut' : '') +
        ` — ${b.houthi.reach ? 'the Ford reaches them tonight' : 'nothing out there reaches them'}.`,
      left: b => 'the Red Sea coast goes unanswered for another night',
    },
    {
      // ---- THE OTHER WAY THIS ENDS (v2.05) ----
      // Two arms, the way `strait` has two, and they are two different pieces
      // of news rather than one on a dial. Before the window: the war the
      // president is still flying has a stated destination and a number on it.
      // After it opens: the war can simply be ended tonight.
      //
      // DOCTRINE IS DYNAMIC, and that is the point of putting this here rather
      // than writing it into the diplomatic panel. With the window OPEN there is
      // no doctrine at all — no package opens a channel, and a course of action
      // offered as the answer to this would be selling a target list on the one
      // night the war does not need one. Before it opens the doctrine is
      // whichever arm is still holding the gate shut, so the staff starts
      // briefing the thing that actually opens it. Measured over 40 shared seeds
      // on easy, that re-sort alone is 65% → 75% win and the window on turn
      // 28 → 25; expert never makes it, because until now nothing said to.
      id: 'deal', doctrine: b => (b.deal.open ? null : b.deal.doctrine),
      // The program is the price of admission and there is no partial credit for
      // it: negotiationReady() is an AND, so a war 90% through the halls is at
      // zero on this concern however broken Tehran's navy is.
      when: b => b.deal.program.done,
      // OPEN sits above `home` (0.94) and below a launcher fix, and it is
      // perishable in the same sense `telfix` is — they repair, the sum climbs
      // back over the bar and the window shuts again. The approaching arm tops
      // out at 0.70, the ruler's own "decides the campaign" anchor and
      // deliberately under the 0.8 the read cell paints amber at: this is the
      // last third of the war having a purpose, not an alarm.
      sev: b => (b.deal.open ? 0.95 : clamp(0.32 + 0.38 * b.deal.machine.pct / 100, 0, 0.70)),
      // BOTH CLAUSES ARE WRITTEN TO A WIDTH. The read cell is a fixed two-line
      // box (v1.83) sized against a rendered `phase — clause` that has never
      // exceeded 122 characters, and every cell in that flex row is as tall as
      // the tallest, so a third line steps the whole bottom bar and the map's
      // edge with it. The longest phase this concern can appear under is
      // GAINING AIR SUPERIORITY at 23, which leaves 96: the first draft of these
      // two ran to 113 and 108 and took the measured maximum to 137.
      now: b => b.deal.open
        ? `Tehran is ready to talk — the channel ends this at about ` +
          `${pc(Game.G.dealOdds())}%, and it shuts as they repair.`
        : `Halls finished. A signed end needs their war machine at 100% — ` +
          `${b.deal.machine.pct}%, the ${b.deal.arm} lagging.`,
      left: b => b.deal.open
        ? 'the channel stays shut on a night Tehran would have taken the call'
        : `the ${b.deal.arm} keeps Tehran ${Txt.plural(100 - b.deal.machine.pct, 'point')} off the table`,
    },
    {
      id: 'stall', doctrine: 'pressure',
      // the argument for the other kind of target: the war has run long, the
      // gate has not moved, and what is left is the regime's own machinery
      when: b => b.turn >= 6 && b.gateDone < 3,
      sev: b => clamp(0.16 + b.turn / 42 + (b.converging === false ? 0.18 : 0) - (b.world < 40 ? 0.24 : 0), 0, 0.6),
      now: b => `${Txt.turns(b.turn)} in, ${b.gateDone} of 3 gates closed` +
        (b.gateLag ? `, the ${b.gateLag.label} lagging at ${b.gateLag.pct}%.` : '.'),
      left: b => 'the regime keeps its command, its revenue and its power',
    },
    // ---- concerns no tasking order can answer ----
    {
      id: 'home', doctrine: null,
      when: b => b.runway !== null && b.runway < 12,
      sev: b => clamp(1 - b.runway / 14, 0, 0.94),
      now: b => `The country stops paying for this in about ${Txt.turns(Math.round(b.runway))}` +
        (b.converging === false && b.degEta !== null
          ? `, and the program needs ${Txt.turns(Math.round(b.degEta))}.`
          : '.'),
      left: b => `the number at home has about ${Txt.turns(Math.round(b.runway))} left in it`,
    },
    {
      id: 'basing', doctrine: null,
      when: b => b.basing.gulf && b.world - b.foldAt <= 12,
      sev: b => clamp(0.30 + (12 - (b.world - b.foldAt)) / 18, 0, 0.9),
      now: b => `Standing abroad ${Math.round(b.world)}, and the Gulf tier folds at ${b.foldAt}` +
        (b.gulf.caveats ? `, walked up ${Txt.plural(b.gulf.caveats, 'time')} by the council.` : '.'),
      left: b => `the ramps are ${Txt.plural(Math.max(0, Math.round(b.world - b.foldAt)), 'point')} off folding`,
    },
    {
      id: 'blind', doctrine: null,
      when: b => b.blind >= 3,
      sev: b => clamp(0.20 + b.blind * 0.05, 0, 0.55),
      now: b => `${b.blind} assessments too soft to plan against — anywhere from nearly finished to back at full.`,
      left: b => `${b.blind} assessments stay too soft to plan against`,
    },
    {
      id: 'vote', doctrine: null,
      when: b => b.voteIn !== null && b.voteIn <= 3,
      sev: b => clamp(0.55 + (4 - b.voteIn) * 0.08, 0, 0.9),
      now: b => `The Hill votes in ${b.voteIn <= 0 ? 'hours' : Txt.turns(b.voteIn)} on whether this campaign continues.`,
      left: b => `the vote is ${b.voteIn <= 0 ? 'hours' : Txt.turns(b.voteIn)} out and the arithmetic is unchanged`,
    },
  ];

  // Everything live tonight, worst first. Built objects rather than the table
  // rows themselves — the prose is evaluated here, once, so a caller can sort,
  // slice and print without ever holding a function it might call against a
  // board that has since moved.
  function concerns(b) {
    b = b || board();
    const out = [];
    for (const c of CONCERNS) {
      if (!c.when(b)) continue;
      const sev = clamp(c.sev(b), 0, 1);
      if (sev <= 0.02) continue;
      // `doctrine` may be a function of the board, because one concern's answer
      // genuinely changes with it: which arm is holding the negotiation gate
      // shut is whichever of the two is larger tonight, and once the window is
      // open no tasking order answers it at all. Everything else is a literal.
      const doctrine = typeof c.doctrine === 'function' ? c.doctrine(b) : c.doctrine;
      out.push({ id: c.id, doctrine, sev, now: c.now(b), left: c.left(b) });
    }
    return out.sort((x, y) => y.sev - x.sev);
  }

  // The worst thing a given doctrine is the answer to, or null. Two concerns
  // point at counterforce (a perishable fix and the standing salvo problem) and
  // which one is being argued from changes every few nights, which is most of
  // why the brief reads differently turn to turn.
  const forDoctrine = (list, id) => list.find(c => c.doctrine === id) || null;

  // ============================================================
  // THE PHASE OF THE WAR
  // ------------------------------------------------------------
  // Not the air phase — that is a fact about the sky and `Game.airPhase` owns
  // it. This is what the campaign is FOR tonight, which is the frame both the
  // brief and the advisors argue inside, and it is deliberately a short list:
  // five states a president could name out loud. Ordered by precedence, first
  // match wins, and the emergencies come first because a war that is about to
  // be taken away from you is not also about sequencing.
  // ============================================================
  const PHASES = [
    { id: 'collapse', name: 'HOLDING THE PRESIDENCY',
      when: b => b.runway !== null && b.runway <= 4,
      line: 'The war ends at home before it ends in Iran unless something visible changes tonight.' },
    // Above `race` and below `collapse` — and it can never actually contend
    // with `race`, because the window requires the program at 100% and that
    // phase requires it under. It sits this high because it is the only frame
    // in the list under which the correct night may involve no strike at all.
    // 20 characters, inside the 23 the read cell's label slot is sized for.
    { id: 'deal', name: 'A SIGNED END IS OPEN',
      when: b => b.deal.open,
      line: 'Tehran is broken enough to take the call. The channel is the shortest road left to a win.' },
    { id: 'race', name: 'RACING THE CENTRIFUGES',
      when: b => !b.brk.halted && b.brk.hi <= 6 && b.deg < 100,
      line: 'The breakout estimate is now inside the time it takes to do anything else on the list.' },
    // Named for the doctrine rather than for the image. "TAKING THE SKY" is what
    // this phase is, and it is also a phrase a player has to translate before it
    // means anything — the ladder in STRIKE ASSETS, the gate on every fourth-gen
    // package and the reason ROLLBACK leads the brief are all called AIR
    // SUPERIORITY, in those words, everywhere else in the game. One name.
    // 23 characters, one over HOLDING THE PRESIDENCY, which is what the read
    // cell's label slot is already sized against.
    { id: 'opening', name: 'GAINING AIR SUPERIORITY',
      when: b => b.phase === 'contested',
      line: 'Nothing else on the list gets cheaper until the belt is down.' },
    { id: 'closing', name: 'CLOSING THE GATES',
      when: b => b.deg >= 100 || b.gateDone >= 2,
      line: 'The program is finished or nearly so; what is left is the war machine and an end state.' },
    { id: 'exploit', name: 'WORKING THE LIST',
      when: () => true,
      line: 'The sky is open, the halls are reachable, and the constraint is how many packages a night buys.' },
  ];
  function phase(b) {
    b = b || board();
    const p = PHASES.find(x => x.when(b));
    return { id: p.id, name: p.name, line: p.line };
  }

  return { board, concerns, forDoctrine, phase };
})();
