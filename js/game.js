// ============================================================
// game.js — core state, turn loop, strikes, diplomacy, win/lose
// ============================================================

const Game = (() => {
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  // A target's share of whatever aggregate its type feeds — the missile force,
  // the fleet, the enrichment program. Defaults to 1, so the declared roster is
  // unchanged and only sites that say otherwise weigh differently. It exists so
  // that a covert site can be added to an aggregate without either blowing past
  // its 0..2 contract or silently making every declared site worth less.
  const wt = (t) => (t.weight != null ? t.weight : 1);
  const rand = (a, b) => a + Math.floor(Math.random() * (b - a + 1));

  // Which aimpoints open the war off the tasking order (see JIPTL). Stamped
  // once, at module load rather than in newWar, because `held` is a property of
  // the ROSTER and not of a campaign — it must be true on every path that can
  // reach plotted(), including a page that loads straight into a saved war.
  // Only `released` is per-war state, and newWar clears that.
  (() => {
    const ids = new Set([...JIPTL.order, ...JIPTL.sortie]);
    // ...and the southern front, held for an unrelated reason and released on a
    // different clock. JIPTL.order is the document CENTCOM is working through
    // and Yemen is not in it: those two aimpoints are absent because three
    // campaigns in four never have a southern front at all, and houthiTurn puts
    // them on the plot the night Ansar Allah enters. Same flag, same absence,
    // separate cause — which is why it is ORed in here rather than appended to
    // the tasking order, where it would also start releasing on turn 2.
    //
    // This assignment is the only place `held` is decided. A `held: true` in
    // data.js would be overwritten by this loop on the next page load, which is
    // exactly the bug this comment exists to stop somebody re-introducing.
    for (const t of TARGETS) t.held = ids.has(t.id) || t.theater === 'yemen';
    // A typo in either list is otherwise silent and costs an afternoon: the id
    // never matches, the target is simply never held, and the ramp quietly has
    // one fewer step in it than the table says.
    for (const id of ids) {
      if (!TARGETS.some(t => t.id === id)) console.warn(`JIPTL: no such target "${id}"`);
    }
  })();

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

  // The campaign is PLANNED for thirty turns. It is no longer STOPPED at thirty.
  //
  // The hard cap was the only thing standing between this game and a guaranteed
  // win, because every other loss condition is one the player can switch off.
  // Breakout stops dead the moment Natanz and Fordow are rubble — enrichRate is
  // a function of their hp and nuclear sites never come back from zero. The
  // casualty ceiling and the oil economy are avoided by not flying and leaving
  // the strait alone. And the flat -0.5 weariness tick is outrun by the +1 a
  // night that cheap oil pays back, so a quiet war's approval RISES. Kill the
  // halls, hold the strait, and an uncapped campaign is an unlimited number of
  // free nights against a target list that cannot reconstitute past 60%. The
  // war becomes a patience test with a certain outcome.
  //
  // So the cap stays — as a curve instead of a wall. Past `softCap` the
  // country's patience runs out on an accelerating schedule and the war ends
  // politically, on a slope the president can read several nights ahead,
  // instead of the screen going dark at the end of turn 30 with the last
  // package still airborne. A war three turns from finishing the job gets those
  // three turns and pays for them; a war going nowhere is dead inside a week
  // either way.
  //
  // The drain is linear in turns over, so the approval it has SPENT is its
  // integral — quadratic. That is what makes the bound real without needing a
  // second wall behind it: roughly 25 points gone by eight turns over, 80 by
  // fifteen. Nobody sees turn 46 no matter how popular the war was at thirty.
  const OVERTIME_STEP = 0.75;

  // What tonight costs in approval for no reason other than that the war is
  // still on. Zero until the country notices, flat while the campaign is inside
  // its plan, climbing every night after that.
  function warWeariness() {
    if (G.turn <= WEARINESS_TURN) return 0;
    const over = G.turn - G.softCap;
    return over > 0 ? 0.5 + OVERTIME_STEP * over : 0.5;
  }

  // The drain is the only cost in the game that is nobody's decision, so it is
  // the one the player is most likely to miss on the bar — and it is the thing
  // now ending most long campaigns. It gets a report line every night it is
  // accelerating. The flat tick inside the plan stays silent: sixteen identical
  // events would be noise a player learns to skip past, which is exactly the
  // habit this one cannot afford. The poll number is in the headline so no two
  // nights read the same on the ticker.
  // ---- THE POLL ----
  // The one place the country explains itself, and the surface that teaches the
  // whole bloc model. It replaces wearinessEvent outright rather than standing
  // beside it: two separate events reporting on the same public, one of them
  // firing only past turn 30, is how the old build managed to run 540 campaigns
  // in which almost nobody was ever told what approval was made of.
  //
  // Two cadences, one builder. Every APPROVAL.pollEvery turns normally, and
  // EVERY turn once the campaign is past softCap — because that is when the
  // drain is accelerating and tonight's number is genuinely new information
  // rather than a restatement of the last one.
  //
  // `cost` is the weariness charge, already spent against the middle by the
  // caller. This event reports it and never carries it, exactly as the Hill's
  // vote does, so it must not reach applyEvent with a dApproval on it.
  function pollEvent(cost) {
    const over = G.turn - G.softCap;
    const due = over >= 1 || G.turn % APPROVAL.pollEvery === 0;
    if (!due || G.turn < 2) return null;

    const prev = G.lastPoll;
    const now = { base: G.base, middle: G.middleWith, opposed: G.opposed, approval: G.approval };
    G.lastPoll = now;

    // Past the plan the war itself is the story and the old weariness prose is
    // still the right prose for it — it is about a country following the
    // calendar rather than the target list, which is exactly what the blocs are
    // doing by then.
    let text;
    if (over >= 1) {
      text = over <= 3
        ? 'The networks have started running a day count in the corner of the screen. The war ' +
          'was sold as a fortnight and it is past a fortnight, and the coverage has quietly ' +
          'changed tense — this is no longer an operation with an end date, it is a situation. ' +
          'Nothing in particular happened today to cause any of it. That is the story.'
        : over <= 8
        ? 'Members of your own party are booking the Sunday shows to ask what winning looks like, ' +
          'and the answer coming back from the podium has not changed in a week. The country has ' +
          'stopped following the target list and started following the calendar. Every further ' +
          'night of this costs more than the night before it did, and the slope is steepening.'
        : 'There is no constituency left for this war. The coverage is wall to wall and uniformly ' +
          'hostile, the leadership has stopped returning calls, and the numbers are falling faster ' +
          'each night now on their own momentum. Whatever is going to be finished has to be ' +
          'finished with what is already in theater, and it has to be finished immediately.';
    } else {
      text = diff().pollDetail ? pollDetail(prev, now) : pollPlain(prev, now);
    }

    return {
      cls: 'world',
      title: `POLL: APPROVAL AT ${Math.round(G.approval)}% ON DAY ${Txt.day(G.turn)}`,
      text,
      sum: cost
        ? `Public patience: ${Txt.signed(-(Math.round(cost * 10) / 10))} approval`
        : `The country: ${Math.round(G.approval)}% approve`,
      // Deliberately no dApproval. Everything this reports has already been
      // charged by the caller — see the note above.
      internal: false,
    };
  }

  // What the split is doing, for the levels that are shown it. Three sentences
  // in a fixed order — the base, the middle, the opposition — because the order
  // is the argument: the first and last never move and the one in between is
  // the entire war.
  function pollDetail(prev, now) {
    const size = G.middleSize;
    const cracked = prev && now.base < prev.base;
    const moved = prev ? Math.round(now.middle - prev.middle) : 0;

    // The two fixed camps are stated in FULL the first time and then only when
    // they move, which for the base means a catastrophe and for the opposition
    // means the same catastrophe seen from the other end. Everything below was
    // written as three unconditional sentences first, and read as three
    // unconditional sentences: identical base and opposition lines under every
    // poll of every campaign, which is the "noise a player learns to skip past"
    // the old weariness event's own comment warns about — on the one event in
    // the game that cannot afford to be skipped, because it is the only place
    // the model is ever explained.
    const baseLine = cracked
      ? `Your own base moved — ${prev.base}% down to ${now.base}%, and the people who left are not ` +
        `undecided, they are gone. That is your floor falling, and your ceiling with it.`
      : !prev
        ? `Your base is ${now.base}% and it is not going to move, short of a catastrophe. That is your ` +
          `floor and it is the reason you are still here.`
        : '';

    const midLine = !prev
      ? `Of the ${size}% of the country that was ever going to decide this, ` +
        `${Txt.plural(Math.round(now.middle), 'point')} ${Txt.are(Math.round(now.middle))} ` +
        `with you tonight.`
      : moved === 0
        ? `The ${size}% in the middle has not moved since the last poll — ` +
          `${Txt.plural(Math.round(now.middle), 'point')} with you, ` +
          `and nothing this week shifted any of it either way.`
        : `The ${size}% in the middle is what moved: ` +
          `${Txt.plural(Math.round(prev.middle), 'point')} with you at the last poll, ` +
          `${Math.round(now.middle)} tonight.`;

    // Running out of country is a real state and the player is told about it
    // rather than watching gains silently vanish into a bound. This is the
    // sentence that makes the ceiling information instead of a bug.
    const roomLine = now.middle >= size - 0.5
      ? ' There is nobody left to persuade. Everyone in this country who can be brought to support this war ' +
        'already does, and further good news from the theater has nowhere to go.'
      : now.middle <= 0.5
        ? ' The middle is gone in its entirety. What is left on the board is your base and nothing else, and ' +
          'there is no further down that does not mean losing people who voted for you.'
        : '';

    const oppLine = !prev
      ? ` The ${now.opposed}% against you were against you on the first night and will be against you on ` +
        `the last; nothing in the theater has ever moved them and nothing will.`
      : cracked
        ? ` The bloc against you is ${now.opposed}% now, and it grew by taking people from your own side.`
        : '';

    return [baseLine, midLine].filter(Boolean).join(' ') + roomLine + oppLine;
  }

  // The same country, without the arithmetic. Easy runs the identical
  // simulation — see DIFFICULTY.pollDetail — and is told what it means rather
  // than what it is made of.
  function pollPlain(prev, now) {
    const moved = prev ? now.middle - prev.middle : 0;
    const frac = now.middle / G.middleSize;
    const where = frac >= 0.85
      ? 'The country is behind you about as far as a country gets behind a war.'
      : frac >= 0.6
        ? 'The country is still with you.'
        : frac >= 0.35
          ? 'The country is split, and the part that is wavering is the part that decides this.'
          : frac > 0.1
            ? 'You have lost most of the people who were ever persuadable. What is left is the people who would ' +
              'have stayed whatever you did.'
            : 'There is nobody left but your own base, and they are holding because they are your base.';
    const trend = !prev
      ? ''
      : moved > 1.5 ? ' It moved your way this week, and it moved on something specific you did.'
      : moved > 0 ? ' It drifted very slightly your way.'
      : moved < -3 ? ' It fell hard this week.'
      : moved < 0 ? ' It slipped a little.'
      : ' It has not moved since the last poll.';
    // Said once, and then only when it stops being true — same rule as
    // pollDetail's fixed camps, and the same reason. A closing sentence
    // identical under all eleven polls of a campaign is a sentence that trains
    // the player to stop reading the poll.
    const floor = !prev
      ? ` Roughly ${now.base} in a hundred will approve of you whatever this war does, and about ` +
        `${now.opposed} will not. Everything either side does is a fight over the rest.`
      : now.base < prev.base
        ? ` And something worse happened underneath it: people who were never going to leave you have ` +
          `left. That has not happened before in this war.`
        : '';
    return where + trend + floor;
  }

  const diff = () => DIFFICULTY[G.difficulty] || DIFFICULTY.normal;
  const casualtyLimit = () => diff().casualties;
  // Where the presidency falls. Derived from the country this level has
  // rather than being the flat 20 it was through v2.12 — see
  // APPROVAL.collapseErosion. Exported, because the objectives panel quotes
  // it to the player and must not carry a second copy of the number.
  const collapseAt = () => (diff().public || APPROVAL).base - APPROVAL.collapseErosion;

  // ============================================================
  // MOVING THE COUNTRY
  // ------------------------------------------------------------
  // Every write to approval in the game goes through one of the two functions
  // below, and there are no others. See APPROVAL in data.js for the model.
  // ============================================================

  // Push the persuadable middle. `n` is in points of the middle, which is to
  // say points of approval — the mapping is 1:1 until a bound is reached, so
  // every retuned literal in this codebase still means what it reads as.
  //
  // What it does NOT do is scale the push by remaining headroom. A saturating
  // curve was the obvious alternative and it is the wrong one: it makes every
  // hand-set number in six files mean something other than what it says, to
  // buy a softness the bounds are supposed to provide honestly. Running out of
  // country to persuade is a real thing that happens to real presidents, and
  // the poll SAYS so when it happens (see pollEvent) rather than hiding it in
  // a multiplier. A ceiling the player is told about is information; a ceiling
  // that silently eats two thirds of a gain is the bug the old clamp was.
  //
  // `cls` names the news story this is a repetition OF, and habituation applies
  // to it in whichever direction it runs. Passing one is opt-in and most
  // callers do not: an address, the Hill's vote, an objective met, a carrier on
  // the bottom are all singular events, and a thing that happens once has
  // nothing to habituate to.
  //
  // The direction rule was measured rather than assumed, and it is the one
  // thing in this rewrite that changed after the first sweep. Habituating good
  // news alone read as principled — people stop cheering victories long before
  // they stop counting the dead — and it broke the game: `CONGRESS CUTS OFF`
  // went from a minority ending to 41.7% of all campaigns, because the charged
  // bill is dominated by a DRUMBEAT. Measured over 60 campaigns, the militia
  // attack alone is -16.6 a campaign across ten firings of the identical
  // headline, and six recurring events together are -45 of a -60 bill.
  //
  // A country does habituate to that. The ninth rocket attack on the same base
  // genuinely is less news than the first, in a way the ninth dead American is
  // not — and the two are separate here, because casualties are counted in
  // `G.casualties` and crack the base through the erosion bands no matter how
  // bored the coverage gets. So the asymmetry survives exactly where it was
  // argued for: the war going badly still costs, and the specific complaint
  // "another rocket landed at Ain al-Asad" stops being front-page news around
  // the fifth time it is filed. See APPROVAL.habitBad.
  function movePublic(n, cls) {
    if (!n) return 0;
    // The unit conversion, applied once and in one place — see
    // APPROVAL.sensitivity. A caller's number is a push on a fully-fluid
    // country; what lands is that push against the share still in play.
    n *= APPROVAL.sensitivity;
    if (cls) {
      n *= habitMult(cls);
      G.habit[cls] = (G.habit[cls] || 0) + 1;
    }
    const before = G.middleWith;
    G.middleWith = clamp(G.middleWith + n, 0, G.middleSize);
    return G.middleWith - before;   // what actually landed, after the bounds
  }

  // How much of a payout against this class still registers. Falls with every
  // payout already collected and recovers on the nights the class is left
  // alone (see habitTick), never below APPROVAL.habitFloor.
  function habitMult(cls) {
    const n = G.habit[cls] || 0;
    return Math.max(APPROVAL.habitFloor, 1 - APPROVAL.habitStep * n);
  }

  // The country's attention coming back, one turn at a time, for every class at
  // once. A class struck tonight has just been incremented by movePublic and so
  // nets out ahead; a class left alone walks back toward full interest.
  function habitTick() {
    for (const k of Object.keys(G.habit)) {
      G.habit[k] = Math.max(0, G.habit[k] - APPROVAL.habitRecover / APPROVAL.habitStep);
      if (!G.habit[k]) delete G.habit[k];
    }
  }

  // A catastrophe cracking the loyal base. Those people do not become
  // persuadable — they move to `opposed`, so the ceiling comes down with the
  // floor. That is the only thing in the game that can lower either.
  //
  // Scaled by DIFFICULTY.public.erode, and floored at 1 for the same reason
  // `bite()` floors its charge: a carrier is on the bottom, and no setting
  // makes that cost nothing. `base` cannot go below zero, but long before it
  // gets there the campaign has ended on the collapse threshold, which is the
  // intended relationship between the two — the floor retreats toward the
  // losing line rather than the losing line being moved to meet it.
  // `whole` rounds to a legible integer and refuses to charge less than a
  // point, which is right for a catastrophe — a carrier sinks or it does not,
  // and "your base fell by 0.3" is not a thing to tell a president. The
  // overtime drain passes false, because that one is a slow leak and rounding
  // it up to 1 a turn would crack a base twice as fast as the table says.
  function erodeBase(n, whole = true) {
    if (!n) return 0;
    const e = (diff().public || APPROVAL).erode;
    const raw = n * (e == null ? 1 : e);
    const hit = Math.min(G.base, whole ? Math.max(1, Math.round(raw)) : raw);
    G.base -= hit;
    G.opposed += hit;
    // The middle cannot be wider than the country left over. It never is —
    // erosion moves base and opposed by the same amount and middleSize is
    // unchanged — but middleWith is clamped anyway so that a future edit to
    // this function cannot leave approval reading above its own ceiling.
    G.middleWith = clamp(G.middleWith, 0, G.middleSize);
    return hit;
  }

  // The rally expiring. Unconditional and on a fixed schedule: this is the
  // country getting over the attack, not an opinion about the campaign, so it
  // is charged on the nights it is charged whatever the president did with
  // them. It stops dead at APPROVAL.rallyTurns and never runs again.
  //
  // Deliberately NOT floored at the war-justified level — a president who has
  // already lost the middle by turn 4 does not get the rally back to spend.
  function rallyDecay() {
    if (G.rally <= 0) return 0;
    const before = G.rally;
    G.rally = Math.max(0, G.rally - APPROVAL.rallyPer);
    return G.rally - before;
  }

  // The news cycle forgetting, in both directions. Runs every turn, after the
  // night's events have been charged — see APPROVAL.revert for why this is the
  // load-bearing number in the whole model and why it is symmetric.
  //
  // Deliberately NOT routed through movePublic: this is not news, it is the
  // absence of news, and passing it through the habituation door would let a
  // stray class argument make the country forget at a rate that depended on
  // what was bombed last night.
  function revertTick() {
    const neutral = G.middleSize * APPROVAL.revertTo;
    const before = G.middleWith;
    G.middleWith = clamp(G.middleWith + (neutral - G.middleWith) * APPROVAL.revert, 0, G.middleSize);
    return G.middleWith - before;
  }

  // Does this decision arrive as a dialog rather than as a drawer in the
  // sidebar? One reader for DIFFICULTY.popups, exported, so that the four
  // places that ask (the staff's brief, a recovery, and the diplomatic and
  // intelligence briefs behind them) cannot each grow their own answer.
  const popup = (key) => (diff().popups || []).includes(key);

  // The congressional clock. Early in the second week the authorization the war
  // has been running on runs out and the Hill votes. Pulled forward from turn 13:
  // most campaigns were being decided before the old date, so the vote — and its
  // interesting middle outcome, a war that continues on a legally shortened
  // target list — was content most players never reached.
  const WAR_POWERS_TURN = 10;

  // Nights the Strait can stay shut before the world economy breaks. Quoted by
  // the HUD readout, so it lives here rather than in two places drifting apart.
  const HORMUZ_LIMIT = 12;

  // ---- game state ----
  const G = {
    // Fifteen days at two turns a day. Sites that wear down and repair take two
    // or three good packages apiece instead of one lucky roll, so the campaign
    // is a grind now and the clock is scaled to the grind — and so is what the
    // country will absorb while you run it (see CASUALTY_LIMIT).
    // `softCap` is where the plan ends, not where the war does: past it the
    // country's patience drains on an accelerating curve (see warWeariness).
    turn: 1, softCap: 30,
    // ---- the country ----
    // Three blocs, of which the war can move exactly one. See APPROVAL in
    // data.js for what each is and why. These are overwritten at kickoff from
    // DIFFICULTY.public — the literals here are normal's, so that a G inspected
    // before a level has been chosen reads as a country and not as zeroes.
    //
    // `approval` itself is DERIVED (below) and is not a field. It was one for
    // twelve versions and that is the whole bug: a running total that anything
    // could add to had no reason to stop at any particular number, so it was
    // clamped into 0..100 by force and nothing on the board explained either
    // end. Nothing may assign it now; `movePublic` is the one door.
    base: 28, opposed: 30, middleWith: APPROVAL.openMiddle,
    // The rally-round-the-flag term, which sits OUTSIDE the three blocs and
    // decays to nothing over the first week. See APPROVAL.rallyAt.
    rally: APPROVAL.rallyAt,
    // Payouts already collected against each target class, which is what dulls
    // the next one. Keyed on the target's own `type`. Good news only — see
    // APPROVAL.habitBad for why the bad half never fades.
    habit: {},
    // The last poll's split, so the next one can report what MOVED rather than
    // restating the same three numbers. Null until the first poll runs.
    lastPoll: null,
    oil: 84,               // $/bbl Brent
    world: 60,             // world opinion 0–100
    hormuz: 'OPEN', hormuzClosedTurns: 0,
    casualties: { us: 7 }, // the Al Asad missile strike that starts the crisis
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
    // ---- what the wing has left to drop ----
    // The theater precision-munitions stock, kept on hard and only on hard (see
    // THE PRECISION MUNITIONS STOCK). Set from DIFFICULTY.pgm at kickoff and
    // added to only by the force flow; zero everywhere else, where nothing
    // reads it and no package is ever charged against it.
    pgm: 0,
    // ---- the escort screen's interceptors ----
    // The other consumable magazine, and the defensive twin of tlamPool above:
    // SM-3/SM-6 rounds in the Aegis cells, spent against whatever Tehran throws
    // at the covered bases and never replaced except alongside an ammunition
    // ship. Set from NAVAL_BMD.load scaled by difficulty at kickoff (see
    // bmdCapacity); `bmdRearm` is turns left on a rearm detachment, and while it
    // is running the deck has no forward station to be ordered to.
    bmdPool: 0, bmdRearm: 0,
    // ---- and the screen's OFFENSIVE rounds ----
    // Deck canisters of NSM, which is the third magazine nobody reloads at sea
    // and the smallest of the three. It is separate from bmdPool because the two
    // are physically different launchers — canisters bolted amidships against
    // Mk 41 cells — and because keeping them apart is what lets the SM-6 shot be
    // the interesting one: firing NSM costs the screen nothing it needs for air
    // defense, and firing SM-6 costs it exactly that. Both refill alongside the
    // same ammunition ship (see orderRearm).
    nsmPool: NSM_LOAD,
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
    // crew-rest debt: packages the wing owes itself for the late frags it has
    // already flown. It is charged against the NEXT order written, not this one
    // — `atoPlan` is tonight's, fixed at the turn boundary (see ATO, atoSlots).
    fatigue: 0, atoPlan: 0,
    missions: [],          // strike packages in flight: {targetId, pkg, eta}
    sanctions: 0, coalition: false, addressCooldown: 0, sprReleases: 0,
    // the allied heads of government who ring once the coalition forms, in the
    // order they get through: [{who, tone, turn, answered}]. `turn` is the
    // earliest turn the call may come in, so Paris waits a night behind London.
    // Persisted so a war saved with the phone still ringing resumes with it
    // ringing (see leaderCall).
    leaderCalls: [],
    negotiationsAccepted: false, negotiationMomentum: 0,
    diploUsed: false, intelUsed: false, over: false,
    // Tonight's electromagnetic picture. `id`/`sup`/`hit` are TONIGHT's and are
    // cleared at the turn boundary — suppression is never anything but tonight,
    // which is the whole reason it is allowed to be as strong as it is (see EW
    // in data.js). `burn` is the campaign's and is cleared only in newWar: it
    // counts network attacks attempted, hit or miss, and it is what retires
    // that option rather than a rule saying it may only be used so often.
    ew: { id: null, sup: 0, hit: false, burn: 0 },
    // Israel: a semi-autonomous actor, not an American asset, live for all 30
    // turns. `israelPressure` is Jerusalem's patience as a gauge rather than a
    // countdown — see ISRAEL in data.js for what moves it and why the posture
    // decides whether a full gauge is a disaster or a free package.
    // `israelHolds` is how many times the president has asked them to wait;
    // `israelHold` is how many turns of that promise are left to run.
    israelPosture: 'sidelined', israelPressure: 20,
    israelSorties: 0, israelHolds: 0, israelHold: 0,
    israelJointAvailable: false,
    // special operations (see specops.js)
    raid: 'none', raidThisTurn: false, isrPrep: 0,
    regimeChaosTurns: 0, regimeErratic: false, hostageCrisis: false,
    // downed aircrew awaiting recovery, or null — the whole CSAR subsystem
    // (see csar.js) exists only while this does. `downed.crewIds` points into
    // the roster below rather than naming a stranger.
    downed: null,
    // The squadron: thirteen named aviators carried for the campaign, drawn onto
    // every package that flies and read in the sidebar before anything goes
    // wrong (see aircrew.js). Built in newWar; nothing in here simulates.
    aircrew: [],
    stats: { strikes: 0, destroyed: 0, aircraftLost: 0, peakOil: 84, backchannels: 0, carriersLost: 0,
      downedCrews: 0, aircrewRescued: 0, aircrewCaptured: 0, telsKilled: 0,
      // How many bands of the casualty ceiling the dead have already crossed.
      // Lives here rather than beside the blocs because `stats` is on FIELDS
      // and is the one bag of per-war counters that already round-trips; it is
      // a counter of something that happened, which is what stats are for.
      casualtyBands: 0 },

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

    // ---- and what happens the night that race is lost ----
    // `tested` is stamped by breakoutTick the turn progress crosses `need`, and
    // from that turn the campaign is on NUCLEAR.window. `used` is the ids
    // already spent off the release folder, in order, because the ladder is
    // walkable — a demonstration that fails to coerce leaves the tactical
    // option standing and the after-action has to be able to say so. `defused`
    // is the one thing that stops the window's ending, and only the tactical
    // strike sets it. See the NUCLEAR block in data.js.
    nuclear: { tested: false, testedTurn: -1, used: [], defused: false },

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

    // ---- the two arguments inside the coalition ----
    // See GULF in data.js. `resolve` is the hawks' appetite and `strain` is the
    // doves' patience running out; both climb, both fire at GULF.fly and rebuild
    // from GULF.after. `caveats` is how many times the doves have narrowed what
    // may be flown off their soil — it raises where the whole Gulf tier folds.
    // `tankers` is the NET of hawk gifts and dove caveats, folded into
    // tankerCapacity; `corridor` is the northwestern reach bought off the hawks,
    // which survives the bloc folding and is the only thing that does.
    gulf: {
      resolve: 18, strain: 24, caveats: 0, gifts: [], tankers: 0,
      corridor: false, summits: 0, patriots: 0,
    },

    // ---- the southern front ----
    // See HOUTHIS in data.js. `active` is the once-per-war roll and is false in
    // three campaigns out of four; `entered` is whether it has actually opened,
    // which is a different thing and happens on `enterTurn`. Nothing about this
    // is visible — there is no panel, no marker and no aimpoint — until the
    // night they announce themselves.
    //
    // `saudiStruck` is the counter the trigger reads and it only counts salvos
    // that landed on Saudi soil, never Emirati or Bahraini: what brings the RSAF
    // in is Saudi Arabia being hit, and the other capitals have their own gauge
    // for their own grievances. `saudiSince` is turns since Riyadh committed,
    // which is what flips the dove coupling from damping to dragging.
    houthi: {
      active: false, entered: false, enterTurn: 0,
      saudiStruck: 0, saudiIn: false, saudiSince: 0, saudiSorties: 0,
    },
    // The second strait. Same three states as Hormuz and deliberately NOT the
    // same consequences: this one has no loss condition attached, because it has
    // a detour and Hormuz does not (see HOUTHIS.oilClosed). `mandabClosedTurns`
    // is kept for the after-action record only — nothing reads it to end a war.
    mandab: 'OPEN', mandabClosedTurns: 0,

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

    // one row per reading the president paid for, for the believed-vs-actual
    // table on the same screen. Written only by logReading; read only by the
    // endgame. Not reset in newWar for the same reason `timeline` is not —
    // every path to a new campaign reloads the page, so G is already fresh.
    bdaLog: [],

    // Platforms flown, and the deepest counter Iran has been seen to develop
    // against each. See IranAI.adaptPenalty.
    adapt: { cruise: 0, f35: 0, fighter: 0, stealth: 0, heavy: 0 },
    adaptSeen: { cruise: 0, f35: 0, fighter: 0, stealth: 0, heavy: 0 },

    // ---- approval, which is the sum of the blocs and never a number of its own ----
    // The floor is `base` and the ceiling is `base + middleSize`, and neither is
    // a clamp — they are what the arithmetic can produce. That is the whole
    // point: through v2.12 this was a running total held inside 0..100 by a
    // clamp at every one of thirty write sites, so the model's answer to "why
    // can't approval be 100" was "because we said so at each till".
    //
    // Read everywhere and written nowhere. The setter throws rather than being
    // omitted, because these modules are not in strict mode and a getter-only
    // property would swallow a stray `G.approval = …` in silence — which is
    // exactly the drift this rewrite exists to make impossible. Anything that
    // moves the country goes through movePublic() or erodeBase().
    get approval() { return this.base + this.middleWith + this.rally; },
    set approval(v) {
      throw new Error('G.approval is derived from the blocs — use movePublic()/erodeBase()');
    },
    // The share actually in play, which is whatever the two fixed camps leave.
    // Never stored, so a difficulty cannot state three numbers that fail to add
    // up to a country.
    get middleSize() { return 100 - this.base - this.opposed; },

    // Is the flagship out of the anti-ship envelope? Derived rather than stored:
    // with two independently-stationed decks there is no single fleet posture,
    // and a stored copy of this would be one more thing to keep in sync.
    get csgPulledBack() {
      const cv = this.carriers[0];
      return !cv.lost && !cv.moving && cv.posture === 'back';
    },
    // How much of the enrichment program is gone, 0–100.
    //
    // Driven off an `enrichment` flag instead of two hardcoded ids, and weighted
    // by site, so a hall the folder does not have is a data-only addition rather
    // than a rewrite of the war's primary objective. Arak and Bushehr NPP are
    // type 'nuclear' and deliberately NOT flagged: they are reactors, they are on
    // the target list for other reasons, and they are not what this war is about.
    //
    // Read carefully before adding anything here. This number gates BOTH endings
    // the player can win — checkEnd's military victory and negotiationReady's
    // path to the table — so a site included in it is a site the campaign cannot
    // be won without. That is the intended weight of the covert hall, and it is
    // why that hall alone carries a `surfaceBy` guarantee (see COVERT).
    nukeDegraded() {
      let d = 0, max = 0;
      for (const t of TARGETS) {
        if (!t.enrichment) continue;
        max += wt(t);
        d += wt(t) * (100 - t.hp) / 100;
      }
      return max ? Math.round((d / max) * 100) : 0; // 0–100
    },
    // Iran's remaining ability to fight, 0–100, for the HUD meter:
    // missile force + navy + IRGC command, the set you must break to win.
    //
    // This is a THREAT reading — what is still out there tonight — so it counts
    // hulls the Hill has barred and brigades nobody has found, and it is the
    // right number for the bar under the map. It is NOT the victory test, and
    // the two used to be read as if they were: with the missile force, IRGC and
    // every enrichment hall on the bottom, this returns 40% while iranBroken()
    // is still false, because the navy alone is the whole remaining gate and the
    // blend hides that. The meter cannot say which of the three is lagging, so
    // warMachine() below does, and the objectives panel reads that instead.
    iranCapacity() {
      const irgc = TARGETS.find(t => t.id === 'irgc-hq');
      return Math.round(100 * (IranAI.missileStrength() + IranAI.navalStrength() + irgc.hp / 100) / 5);
    },
    // The victory gate, component by component, scored exactly the way
    // iranBroken() scores it. Anything that displays progress toward "break
    // Iran's war machine" reads this, so the panel and the win check cannot
    // drift — which is the failure this replaces.
    warMachine() {
      const irgc = TARGETS.find(t => t.id === 'irgc-hq');
      // pct is "how far to the bar", not "how much is destroyed": at the bar it
      // reads 100% and the line ticks over. A gate met is a gate met.
      const toward = (v, bar, full) => Math.max(0, Math.min(100,
        Math.round(100 * (full - v) / (full - bar))));
      return [
        { key: 'missiles', label: 'missile force',
          done: IranAI.missileStrength(true) <= 0.35, pct: toward(IranAI.missileStrength(true), 0.35, 2) },
        { key: 'navy', label: 'navy',
          done: IranAI.navalStrength(true) <= 0.8, pct: toward(IranAI.navalStrength(true), 0.8, 2) },
        { key: 'command', label: 'IRGC command',
          done: irgc.status === 'destroyed', pct: toward(irgc.hp, 0, 100) },
      ];
    },
    // warfighting capacity shattered: missile force and navy near zero, IRGC command gone
    //
    // The missile bar is 0.35 rather than 0.5 because missileStrength() changed
    // scale, not because the objective got harder. The old clamped function
    // needed a raw ≤0.5 against a maximum of 3.0 — 16.7% of the force left
    // standing. On the normalised 0..2 scale that same 16.7% is 0.33, so 0.35 is
    // the old requirement carried across, slightly rounded in the player's
    // favour.
    //
    // What that arithmetic buys, and the reason it is written down: a covert
    // missile brigade at weight 0.8 is 0.42 on this scale when it is the last
    // thing standing, which sits ABOVE the bar. So Iran cannot be declared
    // broken while a launcher force nobody has found is still shooting — and it
    // cannot be broken by accident either, because the margin is deliberate and
    // not a rounding artifact. Change either number and check the other.
    // Judged against what the president was ALLOWED to attack. The threat
    // functions are unchanged — a hull the Hill put off the list is still a hull
    // and still fights, so carrier risk, the oil premium and the capacity meter
    // all keep counting it. This gate does not, because the alternative is an
    // objective that cannot be met by any play at all.
    //
    // The bug this fixes: `ship-caspian` is the only naval target at depth 3, so
    // a RESTRICTED war powers vote with `noDeep` takes it off the list for the
    // rest of the war. Its weight of 1.0, standing beside an undiscovered
    // Abu Musa at 0.8, is 0.62 on the 0..2 scale — above the 0.5 bar with every
    // other hull on the bottom. naval-covert's own note reasons correctly that no
    // single hidden base can block this; what neither it nor the amendment
    // considered is the two of them stacking. Excluding the barred hull restores
    // exactly the property that note assumes, and does it for any future target
    // the resolution touches rather than for this one hull.
    iranBroken() {
      const irgc = TARGETS.find(t => t.id === 'irgc-hq');
      // The naval bar was 0.5 and it was the single reason this function had
      // never returned true. 0.5 is five of the six naval sites on the bottom AT
      // THE SAME INSTANT, while the missile bar holds the entire missile force
      // and every dispersed launcher group down, and all of it against overnight
      // repair. Measured: across ninety scripted campaigns with every political
      // clock disabled and sixty turns to work in, navalStrength reached 0.5 in
      // three of them and the three gates never once aligned. An objective the
      // simulation cannot produce is not a difficulty setting.
      //
      // 0.8 is four of six — "the navy is broken" in the same sense the other
      // two bars mean it, and still more work than the entire nuclear objective.
      // It does not weaken the covert case: Abu Musa's own note reasons that no
      // single hidden base should gate this, and at 0.276 on the scale it still
      // does not.
      return IranAI.missileStrength(true) <= 0.35 && IranAI.navalStrength(true) <= 0.8 &&
        irgc.status === 'destroyed';
    },
    // The leadership target died — whether or not the task force came home.
    // 'pyrrhic' bought the same decapitation at the price of the whole team.
    raidDecapitated() { return this.raid === 'success' || this.raid === 'pyrrhic'; },
    // Where the second half of the gate sits tonight — `DIFFICULTY.dealBar`, on
    // the 0..4 combined scale. One home, read by all three of the functions
    // below, because a bar that moved in the gate and not in the odds would open
    // the window onto a 3% chance and a progress readout that never reaches 100.
    dealBar() { return diff().dealBar != null ? diff().dealBar : 1.5; },
    negotiationReady() {
      // Tehran only talks when it is already losing the war: the program gone
      // AND its ability to fight visibly draining away. The raid does NOT
      // discount this gate — killing the leadership cannot substitute for
      // destroying the thing the war is about, or the raid becomes the game.
      // What it buys instead is a better chance at the table (see doDiplo).
      //
      // The PROGRAM half is not scaled and is not going to be. It is the thing
      // the war is about and there is no partial credit for it on any level;
      // what `dealBar` scales is only how much of the fighting has to be over
      // before the pragmatists can move, which is a judgement about Tehran's
      // politics rather than about the objective.
      const warStr = IranAI.missileStrength() + IranAI.navalStrength(); // 0..4
      return this.nukeDegraded() >= 100 && warStr <= this.dealBar();
    },
    // ---- HOW FAR TEHRAN IS FROM THE TABLE (v2.05) ----
    // The negotiation gate, component by component, scored exactly the way
    // negotiationReady() above scores it. Same invariant warMachine() carries
    // for the military victory and for the same reason: anything that displays
    // progress toward a signed end reads THIS, so the read line, the brief and
    // the gate cannot drift.
    //
    // It exists because this game has two victory conditions and only one of
    // them had a progress display. ARMISTICE is the most common win in the game
    // by a factor of five — 223 of 270 in the v2.04 sweep — and it is the only
    // ending a president has to ASK for; every other one arrives on its own.
    // Measured in `.claude/betatest/deal.js` over 120 easy campaigns: the
    // enrichment program finishes on turn 15 and this gate opens on turn 29,
    // and for the fourteen turns in between nothing on the board said the war
    // had a signable end or how far off it was. The order that ends it is
    // ranked correctly — `backchannel` leads TRACK ONE on 100% of the nights
    // the window is open — it simply opens after the campaign is over.
    //
    // So the deliverable was never the ranking. It is that the LAST THIRD OF
    // THE WAR HAS A STATED PURPOSE: the program is finished, and what is left
    // to do is a number with an arm's name on it.
    dealProgress() {
      const m = IranAI.missileStrength(), n = IranAI.navalStrength(); // each 0..2
      const deg = this.nukeDegraded();
      const bar = this.dealBar();
      // Same "how far to the bar" shape warMachine() uses, so a percentage here
      // and a percentage in the objectives panel mean the same thing — and it
      // reads against THIS level's bar, so 100% always means "the window is
      // open" rather than "the window would be open on normal".
      const pct = Math.max(0, Math.min(100, Math.round(100 * (4 - (m + n)) / (4 - bar))));
      return {
        open: this.negotiationReady(),
        program: { done: deg >= 100, pct: Math.min(100, Math.round(deg)) },
        machine: { done: m + n <= bar, pct },
        // The arm with the most left in it, because the bar is on the SUM of two
        // weighted means and there is no per-arm bar to clear — only the larger
        // of the two numbers to bring down. Measured over 40 shared seeds on
        // easy, a bot that re-sorts onto this the night the program finishes
        // opens the window on turn 25 against 28 and wins 75% against 65%.
        arm: m >= n ? 'missile force' : 'navy',
        doctrine: m >= n ? 'counterforce' : 'maritime',
      };
    },
    // The odds the Omani channel closes tonight, as `doDiplo` rolls them. One
    // home, because the panel quotes this number and the resolver spends it:
    // `current` on a diplomatic order is documented as "the odds, the price, the
    // countdown", and the backchannel was the only order in the game that named
    // none of the three on the night it mattered. Pure — no draw, no write —
    // because it is called during a render (see the purity section of
    // `.claude/betatest/state.js`).
    dealOdds() {
      const warStr = IranAI.missileStrength() + IranAI.navalStrength(); // 0..4
      const irgcDown = TARGETS.find(t => t.id === 'irgc-hq').status === 'destroyed';
      // MEASURED FROM THE BAR, not from a literal 1.5, and this is the half of
      // `dealBar` that is easy to miss. The term is what a president earns by
      // going on fighting after the window opens, so it has to be zero AT the
      // bar on every level: pinned to 1.5, an easy war opening at 2.5 would
      // arrive at −0.12 and clamp to a 3% chance, which is a window that is
      // open in name only and cannot be worked. Identical arithmetic on normal
      // and hard, where the bar IS 1.5.
      return clamp(0.08 + (this.dealBar() - warStr) * 0.12 + (irgcDown ? 0.08 : 0) +
        this.sanctions * 0.03 + this.negotiationMomentum +
        (this.raidDecapitated() && !this.regimeErratic ? 0.10 : 0) +
        (this.regimeChaosTurns > 0 ? 0.15 : 0) - (this.regimeErratic ? 0.15 : 0), 0.03, 0.65);
    },
  };

  // ---- save / continue (localStorage) ----
  const Save = (() => {
    // v13: the SAM belt stopped being a one-way ratchet. Air defense sites
    // reconstitute out of the national reserve after three quiet nights, capped
    // at 60% forever once killed, and targets carry the `lastStruck`/`killedOnce`
    // bookkeeping that decides both. A v12 save has neither and would resume with
    // a belt that comes back on the wrong schedule.
    // v12: the coalition rings twice. The single random `leaderCall` became a
    // two-entry `leaderCalls` queue — London on the cable, Paris the following
    // turn — each carrying which take of the call it is going to play. A v11
    // save holds one call, possibly already answered, with no way to say which
    // of the two it was or what the world looked like when it came in.
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
    // v15: Israel stopped being a switch. The one-shot `israelPatience` counter
    // and `israelStrikesUsed` flag became a pressure gauge that runs all 30 turns
    // (`israelPressure`), a sortie count, and the standing promise-to-hold state
    // the president can spend approval on. A v14 save holds a countdown whose
    // meaning is gone and no gauge to derive one from — and it was saved from a
    // war where the IAF flew at most once.
    const KEY = 'cic-save-v10';  // bump the version to invalidate old saves
    // v14: a package acquired a price. `strikesThisTurn` had been saved since v8
    // and read by nothing at all; it is now the night's position against a
    // tasking order, and `fatigue` is the crew-rest debt that order is written
    // against. A v13 save holds a count that meant nothing and no debt, so it
    // would resume as a war with a free surge — a different game than the one it
    // was saved from.
    // v16: the turn cap stopped being a wall. `maxTurns` was the turn the war
    // was taken away at; `softCap` is the turn the country starts running out
    // of patience, and the campaign continues past it on an accelerating
    // approval drain. Same number, opposite meaning — a v15 save resumed under
    // v16 would be a war whose ending it was never played against.
    // v17: the fleet's ballistic missile defense stopped being free. What was a
    // constant fraction of every covered salvo is now a magazine of interceptor
    // rounds that opens near-total, drains against what Tehran actually fires,
    // and is only refilled by sending the deck off station to do it. A v16 save
    // resumed under this rule would be a war carrying a full magazine it had
    // already spent — every round the screen fired in the first two weeks would
    // be handed back, which is a different game than the one it was saved from.
    // v1.63 bumps again on the same feature, and the reason is the rule about
    // CHANGING THE MEANING of existing state rather than adding to it: the same
    // Natanz and Fordow hp now produce a different nukeDegraded, because the
    // enrichment program has a third hall in it. A v18 save restored here would
    // read 80% on a program its player finished, with a victory condition that
    // no longer fires and nothing on screen to say why.
    // v20: the target list has a civil infrastructure class in it, and with it
    // a resupply modifier on the national repair effort. This is a bump on the
    // CHANGING THE MEANING rule rather than the adding-to-it one: the same
    // saved hp on the same SAM battery now evolves at a different rate
    // overnight, because how fast Iran rebuilds is a product the bridges and
    // the switchyards are now terms in. A v19 save restored here would resume a
    // campaign whose repair arithmetic it was never played under — with four
    // aimpoints at full condition that its player was never offered and never
    // declined, which is also the half of it the player would actually see.
    // v21: coordinating with Israel means something different than it did. The
    // same saved `israelPosture: 'coordinated'` now buys a wider night and a
    // standing bill at home, and roughly half of those nights end with an
    // element over the civil grid that the president answers for. This is the
    // CHANGING THE MEANING rule and not the adding-to-it one: a v20 save was
    // played by someone who accepted a bargain this build does not offer, and
    // would resume mid-war having bought something else. The folder rates and
    // the heavy bomber turnaround moved underneath it in the same build.
    // The Gulf is two camps with two gauges, and where the Gulf basing tier
    // folds is no longer a constant — a save written before the caveats existed
    // would resume with a threshold the rest of the state disagrees with.
    // And TARGETS itself is two aimpoints longer: a v23 save carries no record
    // of the southern front at all, so resuming one would restore a target list
    // the rest of the state cannot account for.
    // v25: the difficulty levels are now three different jobs rather than one
    // job at three prices (see DIFFICULTY). A v24 save carries no munitions
    // stock, and — worse — was played on a level whose name no longer describes
    // what it does: an EASY save would resume into a war that has taken the
    // target list away from a president who has been using it for nine turns.
    // v26: aircrew stopped being invented at the moment they were lost. The
    // campaign now carries a roster of named aviators with a sortie count each,
    // and `downed` points into it instead of minting a callsign. This is the
    // ADDING-TO-IT rule rather than the changing-the-meaning one — no v25 number
    // means anything different here — but a v25 save has no roster and no record
    // of who flew the first nine nights, and a squadron rebuilt from nothing on
    // load would hand the player thirteen strangers at zero sorties in a war
    // that has already lost two of them. There is no honest way to reconstruct
    // that, which is the same argument every bump above makes.
    // v27: the war now keeps a record of what it told the president. `bdaLog` is
    // every band a reading put in front of them beside what was actually
    // standing at the time, read back on the endgame screen (see logReading).
    // ADDING-TO-IT again — no v26 number changes meaning — but the table is a
    // claim about the whole campaign, and a v26 save carries no readings from
    // the nights already flown. Resuming one would end in a believed-vs-actual
    // section reporting that the president was never handed a wrong number for
    // the first half of their war, which is not a smaller record than the real
    // one. It is a different and flattering one, presented as the record.
    // 28: the escort screen shoots at ships now, so `nsmPool` is new state and a
    // v27 save restores with an undefined NSM magazine — which reads as zero and
    // silently refuses a package the war is supposed to offer.
    // 29: approval is no longer a field. It is derived from three bloc counts
    // that a v28 save does not carry, so a restored v28 war would come back
    // with an undefined base and an undefined middle — which reads as NaN
    // approval, and NaN fails every comparison, so the collapse check, the
    // Hill's vote and the grade all quietly stop firing. Nothing on screen
    // would say why.
    const VERSION = 31;
    const FIELDS = [
      // `approval` is absent on purpose and must stay absent — it is a getter
      // with a throwing setter, and read() assigns every name in this list
      // straight back onto G.
      'turn', 'softCap', 'base', 'opposed', 'middleWith', 'rally', 'habit', 'lastPoll',
      'oil', 'world',
      'hormuz', 'hormuzClosedTurns', 'casualties', 'res', 'caps',
      'strikesThisTurn', 'struckThisTurn', 'fatigue', 'atoPlan',
      'missions', 'sanctions', 'coalition', 'leaderCalls',
      'addressCooldown', 'sprReleases', 'negotiationsAccepted', 'negotiationMomentum',
      'diploUsed', 'intelUsed', 'over', 'raid', 'raidThisTurn', 'isrPrep', 'downed', 'aircrew',
      'israelPosture', 'israelPressure', 'israelSorties', 'israelHolds', 'israelHold',
      'israelJointAvailable',
      'regimeChaosTurns', 'regimeErratic', 'hostageCrisis', 'stats',
      'carriers', 'secondCarrierOrdered', 'secondCarrierEta', 'alliedFighters',
      'bombersOrdered', 'bomberEta', 'bombersArrived', 'deployTurn',
      'heaviesOrdered', 'heavyEta', 'heaviesArrived', 'forceFlow', 'airPhaseSeen',
      'milestones', 'difficulty', 'iranPosture', 'postureKnown', 'breakout', 'nuclear', 'intel',
      'tankers', 'tankerCap', 'basing', 'basingDebt', 'gulf', 'warPowers', 'addresses', 'threat',
      'timeline', 'bdaLog', 'adapt', 'adaptSeen', 'turnStartHp', 'tlamPool', 'torpedoes',
      'bmdPool', 'bmdRearm', 'nsmPool', 'pgm',
      'houthi', 'mandab', 'mandabClosedTurns',
      'ew',
    ];

    function write() {
      if (G.over) return;
      try {
        const data = { version: VERSION, muted: AudioSys.isMuted(), fields: {}, targets: {} };
        for (const f of FIELDS) data.fields[f] = G[f];
        // condition is the source of truth; status is derived from it on load.
        // Dispersal state travels with it — a launcher group that has driven out
        // into the country, and whether anyone currently knows where it is —
        // and so does the reconstitution bookkeeping: the night a site was last
        // serviced, and whether it has ever been finished. A war reloaded
        // without those has a SAM belt that comes back on the wrong schedule and
        // pays a first-kill bump twice.
        for (const t of TARGETS) {
          data.targets[t.id] = {
            hp: t.hp, dispersed: !!t.dispersed, located: !!t.located,
            lastStruck: t.lastStruck || 0, killedOnce: !!t.killedOnce,
            // and what the intelligence apparatus has managed to learn about a
            // site that was never in the folder: the leads accumulated, and
            // whether they have added up to a box on the plot or a target.
            // `worked` is how many collection decks have already been flown
            // against the box — a reload that dropped it would hand back every
            // night the player spent narrowing it (see workFolder).
            found: !!t.found, suspected: !!t.suspected, leads: t.leads || 0,
            worked: t.worked || 0,
            // and whether the tasking order has caught up with it yet. Without
            // this a reload hands back a board the player has already been
            // given — the JIPTL ramp restarting at turn 9 with the whole
            // interior off the plot again.
            released: !!t.released,
          };
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

  // ============================================================
  // WHAT THE PRESIDENT WAS TOLD, AND WHAT WAS TRUE
  // ------------------------------------------------------------
  // The band above is the entire point of the intelligence layer, and until now
  // the player never found out whether it was any good — they made thirty turns
  // of decisions on numbers with error bars and the war ended without ever
  // saying which of those numbers were lies. Every reading is written down here
  // beside the truth it was standing in front of, and the pair is read back
  // after the shooting stops (see the believed-vs-actual table in showEndgame).
  //
  // LOGGED ON LOOK, NOT ON TICK. The obvious implementation is a sweep of every
  // target at the turn boundary, and it is wrong twice: forty rows a night is a
  // save blob carrying a thousand rows of a table nobody scrolls, and — the part
  // that actually matters — most of those rows are beliefs the president never
  // formed. What goes in here is a reading they SPENT something on: an
  // intelligence slot on a BDA tasking, a slot on a collection deck against the
  // folder, or the deliberate act of opening a target's card while writing the
  // night. Those are the numbers they acted on, which is the only question the
  // table asks. The map tooltip is deliberately not one of them — a band that
  // appears because the cursor crossed an icon is not a decision.
  //
  // One row per target per turn, latest look wins, so a card opened four times
  // while building a package is one belief rather than four. And only readings
  // that are genuinely judgement calls are kept: a `known` estimate is one of
  // the two states that are never in doubt — untouched, or visibly collapsed —
  // so its band is the truth by construction and a row saying so teaches
  // nothing except that the table is padded.
  //
  // NOTHING READS THIS. It is a recorder and a display: no grade term, no
  // advisor input, no mechanic. If something here ever becomes an input, it
  // stops being a record of what the president believed and starts being a
  // second intelligence channel that reports the answer.
  function logReading(t) {
    const e = estimate(t);
    if (e.known) return;
    const row = { turn: G.turn, id: t.id, lo: e.lo, hi: e.hi, truth: Math.round(t.hp) };
    const i = G.bdaLog.findIndex(r => r.turn === row.turn && r.id === row.id);
    if (i >= 0) G.bdaLog[i] = row; else G.bdaLog.push(row);
  }

  // The sites a collection deck would actually be worth flying against: hit at
  // least once, still standing, and carrying a band wide enough that the number
  // is guesswork. Owned here rather than in the panel so the button that offers
  // the tasking and the code that runs it can never disagree about whether
  // there is anything to look at — an intelligence slot spent on "nothing worth
  // the sortie" is a night the player does not get back.
  const BDA_STALE_SPREAD = 6;   // wider than this and the estimate is guesswork
  function staleEstimates() {
    return TARGETS
      .filter(t => (wearsDown(t) || t.type === 'tel') && t.hp > 0 && G.intel[t.id])
      .map(t => ({ t, e: estimate(t) }))
      .filter(x => x.e.hi - x.e.lo > BDA_STALE_SPREAD)
      .sort((a, b) => (b.e.hi - b.e.lo) - (a.e.hi - a.e.lo))
      .slice(0, 3);
  }

  // ============================================================
  // THE GAPS IN THE FOLDER
  // ------------------------------------------------------------
  // The machinery behind COVERT in data.js — read the design note there first.
  // In short: a covert site is in the war from turn one and out of the folder
  // until intelligence earns it, through unknown → suspected → found.
  //
  // The thing that makes this a mechanic rather than a delay is that a hidden
  // site is NOT inert. It repairs on the same schedule as everything else and it
  // counts in every aggregate its type feeds. If hiding a target took it out of
  // the war, hiding it would be a discount — one fewer aimpoint to service — and
  // the correct play would be to never look. It has to cost something to not
  // know, and what it costs is a capacity meter that will not come down.
  // ============================================================

  // Every target the plot is allowed to draw, and — identically — every target
  // that can be planned against. A covert site is absent from the document
  // rather than hidden with a class, for the same reason a dispersal site is:
  // a class leaves the name and the true position sitting in the inspector, and
  // the whole point is that the player does not have them.
  // A held aimpoint is absent for a third reason, and a different one: nobody is
  // hiding it and nobody has to hunt it — CENTCOM has not finished staffing the
  // list yet (see JIPTL). Same absence, same reason for the absence being total
  // rather than a class on a visible element, and deliberately a separate clause
  // from the covert one so the two mechanics never get read as the same thing.
  const plotted = (t) => t.dispersal ? (t.dispersed && t.located && t.hp > 0)
    : t.covert ? !!t.found
    : t.held ? !!t.released
    : true;

  const covertGaps = () => TARGETS.filter(t => t.covert && !t.found && t.hp > 0);

  // ---- the tasking order grows ----
  //
  // Shaped like covertTurn() and called beside it at the turn boundary: it
  // mutates the targets and RETURNS events rather than writing to the report,
  // so the night's prose is assembled in one place.
  //
  // Both halves announce themselves. A target that simply materialises on the
  // plot between one turn and the next is invisible to a player who is reading
  // the report — which is every player, because the report is what the turn
  // hands them — and "the map has more things on it than it did" is not a
  // discovery a game should leave someone to make on their own.
  function releaseTurn() {
    const out = [];
    // updateTarget is what actually puts the marker on the plot — `released`
    // alone only makes it plannable. Same call damageTarget makes, and it is
    // safe against the stubbed MapView the harnesses install.
    const free = (t) => { t.released = true; MapView.updateTarget(t); return t; };

    // Half one: the navy sails. All of it, on one night, as one event.
    //
    // The `- 1` is the whole reason this reads as an offset: releaseTurn runs
    // at the END of turn N, so everything it frees is on the plot for turn
    // N+1. `sortieTurn` is stated as the turn the player can first PLAN
    // against the hulls, because that is the fact a designer tuning it cares
    // about — the alternative is a constant that says 3 and behaves like 4.
    if (G.turn >= JIPTL.sortieTurn - 1) {
      const sailed = JIPTL.sortie
        .map(id => TARGETS.find(t => t.id === id))
        .filter(t => t && t.held && !t.released)
        .map(free);
      if (sailed.length) {
        out.push({
          cls: 'iran',
          // NOT internal. A navy leaving harbour is the most public thing a
          // navy does — Tehran wants it seen, and the wire would have it
          // before CENTCOM finished the plot. Contrast the staff product
          // below, which is nobody's business but the president's.
          title: 'IRANIAN NAVY SORTIES — SURFACE FORCE PUTS TO SEA',
          sum: `${Txt.plural(sailed.length, 'hull')} at sea`,
          text: `Fifth Fleet reports the Iranian navy has left harbour. ` +
            `${Txt.plural(sailed.length, 'hull')} — ${sailed.map(t => t.name.split(' — ')[0]).join(', ')} — ` +
            `${Txt.are(sailed.length)} under way and outside the piers CENTCOM has been ` +
            `working. They are on the plot now, and they are shooting positions rather ` +
            `than buildings: nothing here repairs, and nothing here waits.`,
        });
      }
    }

    // Half two: the list itself. Two a night, plus whatever pushing the belt
    // down has bought — the floor is what stops a player who ignores air
    // defense from simply running out of war (see JIPTL).
    const phase = airPhase();
    const n = JIPTL.perTurn + (JIPTL.phaseBonus[phase] || 0);
    const added = [];
    for (const id of JIPTL.order) {
      if (added.length >= n) break;
      const t = TARGETS.find(x => x.id === id);
      if (t && t.held && !t.released) added.push(free(t));
    }
    if (added.length) {
      const earned = (JIPTL.phaseBonus[phase] || 0) > 0 && added.length > JIPTL.perTurn;
      out.push({
        cls: 'friendly',
        internal: true,   // a staff product, not news — see the headlines rule
        title: 'JIPTL UPDATE — AIMPOINTS ADDED TO THE TASKING ORDER',
        sum: `${Txt.plural(added.length, 'aimpoint')} added`,
        text: `The joint targeting cycle has released ${Txt.plural(added.length, 'new aimpoint')} ` +
          `to tonight's document: ${added.map(t => t.name.split(' — ')[0]).join(', ')}. ` +
          (earned
            ? `The extra work is the air picture paying for itself — with the belt ` +
              `where it is, collection is reaching further inland than the planners ` +
              `could task against a week ago.`
            : `Analysts are still working the interior; more will follow as the air ` +
              `picture allows.`),
      });
    }
    return out;
  }

  // What a box on the plot is allowed to say about itself. The type is a genuine
  // hint and it is meant to be — a box that says nothing is scenery, and the
  // decision the middle tier exists to create ("is closing this worth a slot
  // against a stale BDA?") needs the player to have some idea what they would be
  // buying.
  const COVERT_HINT = {
    command:    'command-and-control emissions',
    missile:    'missile-associated activity',
    naval:      'unlogged naval movement',
    airdefense: 'unlocated emitter',
    nuclear:    'undeclared nuclear-associated activity',
    airbase:    'unlogged air activity',
    oil:        'undeclared export activity',
  };

  // A stable offset per site, derived from the id rather than rolled. The box
  // must not walk across the map every time the panel re-renders, and deriving
  // it means there is nothing extra to persist.
  function fuzzOf(id) {
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
    return { dx: (Math.abs(h) % 37) - 18, dy: (Math.abs(h >> 5) % 37) - 18 };
  }

  // What the map draws for the middle tier: a position that is deliberately not
  // the site's, and a description of the problem instead of its name. The key is
  // an index rather than the target id — the id would put the answer in the DOM.
  function suspectedBoxes() {
    const out = [];
    covertGaps().forEach((t) => {
      if (!t.suspected) return;
      const f = fuzzOf(t.id);
      out.push({
        key: `sus-${out.length}`, x: t.x + f.dx, y: t.y + f.dy,
        region: t.region || 'unresolved',
        hint: COVERT_HINT[t.type] || 'unidentified activity',
      });
    });
    return out;
  }

  // Evidence against a gap. Returns an event only on the night the box appears:
  // a lead that does not change the picture is not worth a line in the report,
  // and a stream of "the analysts are still working" is noise the player learns
  // to skip past — which is exactly the report line they must not learn to skip.
  function addLead(t, n) {
    if (!t.covert || t.found) return null;
    t.leads = (t.leads || 0) + n;
    if (t.suspected || t.leads < COVERT.leadsToSuspect) return null;
    t.suspected = true;
    MapView.syncCovert();
    return {
      cls: 'friendly', title: 'ACTIVITY LOCALIZED — GAP IN THE TARGET FOLDER', internal: true,
      sum: 'Unidentified site localized',
      text: `The analysts have been carrying an anomaly for several days and have now put a box around ` +
        `it: ${t.region}, ${COVERT_HINT[t.type] || 'unidentified activity'}. It is on the plot as a box ` +
        `and that is all it is — there is no aimpoint in it yet, and nothing can be planned against a ` +
        `box. Closing it is a collection problem, and collection is a slot.`,
    };
  }

  // ---- channel 2: the campaign teaches you about itself ----
  // A package that goes in against a type a gap feeds off may come back with a
  // lead. This is the channel that makes the SHAPE of a campaign decide what it
  // learns: a president who works the command nodes finds what the command nodes
  // were talking to, and a president who never touches them does not.
  //
  // `feeds` is the second way in, and it is what the civil infrastructure class
  // contributes to the folder (see the design note above it in data.js). Nothing
  // hides behind a rail bridge — but cutting one is a collection event all the
  // same, because what re-routes around a broken line, and what moves to put the
  // line back, is the far end of it announcing itself. So a rail junction feeds
  // the naval gap and a power station feeds the enrichment gap, and an
  // infrastructure campaign ends the war holding a different picture than a
  // counterforce campaign does. The rate is unchanged: what this class buys is
  // WHICH gaps a president gets leads on, including types they may never bomb.
  function covertLead(struck) {
    const struckType = struck.feeds || struck.type;
    const gaps = covertGaps().filter(t => !t.suspected && t.leadFrom === struckType);
    if (!gaps.length) return null;
    if (Math.random() > COVERT.leadChance * diff().covert) return null;
    return addLead(gaps[Math.floor(Math.random() * gaps.length)], 1);
  }

  // ---- channel 3: the site gives itself away ----
  // Run at the turn boundary. Ambient for anything still in the war, faster once
  // the target it was built to replace is rubble — a war that stays coordinated
  // after its command node is gone is itself the tell. The floor at surfaceTurn
  // is the guarantee that no campaign can be locked out of an objective it
  // cannot see: by then a president who never spent a slot on the folder still
  // gets the box, having been fought by it for two weeks first.
  function covertTurn() {
    const out = [];
    for (const t of covertGaps()) {
      if (t.suspected) continue;
      const tell = t.tellAfter && TARGETS.find(x => x.id === t.tellAfter);
      const p = (tell && tell.status === 'destroyed') ? COVERT.tellLead : COVERT.ambientLead;
      let ev = null;
      if (Math.random() < p * diff().covert) ev = addLead(t, 1);
      // The floor, and a per-site override of it. A site the campaign cannot be
      // WON without needs a deadline early enough to leave room for the whole
      // remaining chain — resolve the box, order the aircraft, fly the mission,
      // miss, fly it again — not merely early enough to be found. That is the
      // covert enrichment hall and nothing else; see its `surfaceBy` in data.js.
      const floor = t.surfaceBy || COVERT.surfaceTurn;
      if (!ev && G.turn >= floor) ev = addLead(t, COVERT.leadsToSuspect);
      if (ev) out.push(ev);
    }
    return out;
  }

  // ---- channel 1: the collection deck, worked against the folder ----
  // Spends the intelligence slot. Against a box it resolves an aimpoint; working
  // blind against unknowns the best it can do is produce a lead, which is the
  // argument for letting the other two channels put a box up first.
  function workFolder() {
    const gaps = covertGaps();
    if (!gaps.length) return null;
    const scale = diff().covert * (G.coalition ? 1 + COVERT.coalitionBonus : 1);
    const falloff = COVERT.folderFalloff * (gaps.length - 1);
    const boxed = gaps.filter(t => t.suspected);

    if (boxed.length) {
      // The box the deck has already spent nights on, not whichever one is
      // first in the array. Working two boxes alternately would throw away the
      // persistence below on both, and a president who tasked the folder twice
      // running is asking for the same problem to be finished.
      const t = boxed.slice().sort((a, b) => (b.worked || 0) - (a.worked || 0))[0];
      // WHAT LAST NIGHT BOUGHT. A collection deck that comes back without an
      // aimpoint has still narrowed the problem — the cuts it flew are cuts the
      // next one does not have to fly. Without this the tasking is a coin flip
      // repeated until it lands, which is the shape a player reads as the game
      // wasting their slot; with it, committing to a box is a plan with an end.
      const p = clamp((COVERT.folderFind - falloff + COVERT.folderPersist * (t.worked || 0)) * scale,
        COVERT.folderFloor, 0.94);
      if (Math.random() < p) {
        t.found = true;
        t.suspected = false;
        t.worked = 0;
        G.stats.covertFound = (G.stats.covertFound || 0) + 1;
        // it goes onto the plot with a fresh, deliberate assessment rather than
        // as an unknown quantity — the deck that found it also looked at it,
        // and that look is a reading the slot was spent on like any other
        observe(t, true);
        logReading(t);
        MapView.syncCovert();
        MapView.updateTarget(t);
        return {
          cls: 'friendly', title: `AIMPOINT RESOLVED — ${t.short}`, internal: true,
          sum: `${t.short} resolved — now targetable`,
          text: `The box in ${t.region} has a name in it. ${t.name}: ${t.desc} It is on the plot, it is ` +
            `assessed at ${condition(t)}, and as of tonight it can be put on a tasking order. It has been ` +
            `there since the first night of this war.`,
        };
      }
      t.worked = (t.worked || 0) + 1;
      return {
        cls: 'friendly', title: 'COLLECTION AGAINST THE FOLDER — INCONCLUSIVE', internal: true,
        sum: 'Box narrowed, not closed',
        text: `A full collection deck worked the box in ${t.region} and came back with the same box. ` +
          `The activity is real and it did not resolve into an aimpoint tonight — but the cuts flown ` +
          `tonight are cuts the next deck does not have to fly, and the analysts are asking for it. ` +
          `Tasked again, they are markedly better placed than they were this evening.`,
      };
    }

    const t = gaps[Math.floor(Math.random() * gaps.length)];
    const p = clamp((COVERT.folderLead - falloff) * scale, COVERT.folderFloor, 0.95);
    if (Math.random() < p) {
      const ev = addLead(t, COVERT.folderLeadYield);
      if (ev) return ev;
      return {
        cls: 'friendly', title: 'FOLDER REVIEW — ANOMALY CARRIED FORWARD', internal: true,
        sum: 'Anomaly logged, not localized',
        text: 'Working the gaps blind, the deck has turned up something the analysts are not willing to ' +
          'call a site yet — a discrepancy in the order of battle that does not close. It goes in the ' +
          'file, and it goes in heavily annotated. One more night like this one and it becomes a box ' +
          'on the plot.',
      };
    }
    return {
      cls: 'friendly', title: 'FOLDER REVIEW — NOTHING TO REPORT', internal: true,
      sum: 'Folder worked, nothing found',
      text: 'The deck was flown against the holes in the order of battle and found nothing worth ' +
        'writing down. The analysts are confident the holes are there. Tonight they could not say where.',
    };
  }

  // The target blurb, plus anything true of this particular war rather than of
  // the target in general. Bandar Abbas is the only case so far: every war
  // opens with it already worked over, and a site sitting at 70% on turn one —
  // before the player has ordered a single package — reads as a bug unless
  // something says whose ordnance did it. The opening brief has already told
  // them Tehran is retaliating for "a covert action"; this is that action.
  function targetDesc(t) {
    if (t.id === 'ad-bandar') {
      return t.desc + ' Already worked over: the covert sweep Tehran is calling ' +
        'its casus belli went in against this belt before the shooting started, and the ' +
        'crews have been repairing it ever since.';
    }
    return t.desc;
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
  //
  // Driven off the `enrichment` flag and each hall's own `enrichShare`, not off
  // two hardcoded ids — the same fix nukeDegraded() got, for the same reason,
  // several versions late. Read the CLOCK IS NOT A SWITCH note above BREAKOUT
  // in data.js before touching any of this: it carries the measurement that
  // prompted it and the real assessments the two reflow terms are calibrated
  // against.
  //
  // Returns 0 only when EVERY hall is down, which is what makes `halted` an
  // honest word. Anything still standing is absorbing machines out of storage.
  function enrichRate() {
    let standing = 0, max = 0;
    for (const t of TARGETS) {
      if (!t.enrichment) continue;
      const share = t.enrichShare != null ? t.enrichShare : 1;
      max += share;
      standing += share * Math.max(0, t.hp) / 100;
    }
    if (!max || standing <= 0) return 0;
    standing /= max;
    // What Tehran reinstalls into the halls it still holds. Capped twice: at
    // the fraction of lost capacity that can be moved at all, and at what the
    // surviving floor space can physically take. The second clamp is why one
    // small undeclared hall runs a real race and not the whole program.
    const absorbed = Math.min((1 - standing) * BREAKOUT.reflow, standing * BREAKOUT.reflowCap);
    const cap = Math.min(1, standing + absorbed);
    return BREAKOUT.rate * cap * (IranAI.posture().enrich || 1) / diff().breakout;
  }

  // Returns the test event on the one night it crosses, and null every other
  // night. Through v2.17 this returned null always and checkEnd read the raw
  // progress, which meant the device being tested and the campaign ending were
  // the same instant. They are now four turns apart — see the NUCLEAR block in
  // data.js — and this is where the clock is stamped, because the crossing is
  // an event in the world and not a reading somebody took of it.
  function breakoutTick() {
    const rate = enrichRate();
    if (rate <= 0) return null;
    G.breakout.progress += rate;
    if (!G.nuclear.tested && G.breakout.progress >= G.breakout.need) {
      G.nuclear.tested = true;
      G.nuclear.testedTurn = G.turn;
      return nuclearTestEvent();
    }
    return null;
  }

  // ============================================================
  // NUCLEAR RELEASE
  // ------------------------------------------------------------
  // Read the NUCLEAR block in data.js before touching any of this; it carries
  // the argument for why the folder has three rows on it and why one of them
  // cannot be survived.
  // ============================================================

  // Is release authority unlocked, and how long is left on it? The one read
  // every other surface asks — the dialog, the session button, the HUD and the
  // after-action — so none of them can disagree about whether the war is in the
  // window. `left` counts the turns still to run: at 0 the ending fires from
  // checkEnd on this same turn's resolution.
  function nuclearState() {
    const n = G.nuclear;
    if (!n.tested) return { open: false, tested: false };
    return {
      open: !n.defused && !G.over,
      tested: true,
      defused: n.defused,
      testedTurn: n.testedTurn,
      left: Math.max(0, NUCLEAR.window - (G.turn - n.testedTurn)),
      used: n.used.slice(),
    };
  }

  // The rows, in ladder order, each carrying whether it has already been spent.
  // A spent row is returned rather than filtered out, on the same grounds the
  // brief's slot section says SLOT SPENT TONIGHT rather than vanishing: a row
  // that disappears on being used reads as one that was never offered, and this
  // is the last folder in the game where that ambiguity is affordable.
  function releaseOptions() {
    const st = nuclearState();
    if (!st.open) return [];
    return NUCLEAR.options.map(o => ({
      id: o.id, name: o.name, where: o.where, ends: !!o.ends,
      coerce: o.coerce, defuses: !!o.defuses, iranDead: o.iranDead,
      approval: o.approval, erode: o.erode, world: o.world,
      // Identity, carried through untouched so the dialog can film the order it
      // just gave — see the NUCLEAR feed note in data.js. Nothing below reads it.
      feed: o.feed || null,
      spent: G.nuclear.used.indexOf(o.id) >= 0,
    }));
  }

  // The order. Returns { events, result } — `result` non-null is the campaign
  // ending on this call rather than at the end of the turn, which is the
  // difference between this and every other order in the game.
  function releaseNuclear(id) {
    const st = nuclearState();
    if (!st.open) return null;
    const o = NUCLEAR.options.find(x => x.id === id);
    // A spent row cannot be re-ordered, terminal or not. The trap rung ends the
    // campaign on the press so in the real flow it can never come round twice —
    // but `G.over` is set by finish(), which is the UI's call and not this
    // function's, so the uniform guard is the one that is true of this function
    // read on its own.
    if (!o || G.nuclear.used.indexOf(id) >= 0) return null;
    G.nuclear.used.push(id);

    // The trap rung. It does not resolve against the board — there is no roll,
    // no bill and no tomorrow to charge one against — so it returns the ending
    // directly and everything below this line is skipped.
    if (o.ends) return { events: [], result: buildResult('defeat', 'tehran') };

    // Charged here rather than through applyEvent, so the event below reports a
    // bill already spent — pollEvent's rule, and the Hill's. It also keeps the
    // charge off DIFFICULTY.retaliation, which scales what IRAN costs the
    // president and has no business discounting what the president did.
    const dApproval = movePublic(o.approval);
    const eroded = erodeBase(o.erode);
    G.world = clamp(G.world + o.world, 0, 100);

    // The tactical shot is the only thing on this board that stops the window,
    // and it stops it by destroying the device rather than by un-enriching the
    // uranium: the halls under the assembly site come off with it, which is why
    // the deep program goes as well. Nothing here rewinds G.breakout.progress —
    // the race was lost, and the record of it should say so.
    if (o.defuses) {
      G.nuclear.defused = true;
      for (const t of TARGETS) {
        if (!t.enrichment) continue;
        damageTarget(t, 100);
        t.killedOnce = true;
        t.lastStruck = G.turn;
        // A sharp reading, not a band. Every other strike in this game leaves
        // CENTCOM guessing at what it did, and that is the right model for two
        // aircraft and a bomb load — it is not the model for this. Without it
        // the objectives panel goes on quoting a stale estimate of a program
        // that is now a hole.
        G.intel[t.id] = { hp: t.hp, turn: G.turn, sharp: true };
      }
    }

    // Whether Tehran folds. Rolled once, here, against the option's own number
    // — and it is the only thing either of these two rows is bought for, which
    // is why the demonstration's 30% is stated on its card in words a president
    // can weigh rather than left for them to discover.
    const folded = Math.random() < o.coerce;
    const events = [nuclearReleaseEvent(o, { dApproval, eroded, folded })];
    if (folded) return { events, result: buildResult('victory', 'capitulation') };
    return { events, result: null };
  }

  // The crossing, reported. This is the single worst piece of news in the game
  // and it is deliberately NOT the end of the game any more, so the prose has
  // to do a thing the old ending's prose never had to: say what is still true.
  // The last line is the whole feature — there is a folder, and it is open.
  //
  // The bill is charged the ordinary way, through applyEvent, because unlike a
  // release this is something that HAPPENED to the president rather than
  // something they did. It is sized to be survivable on purpose: a test that
  // collapsed the presidency on its own would hand the player a folder and end
  // the campaign before they could open it, which is the whole mechanic
  // arriving and leaving in the same report.
  function nuclearTestEvent() {
    const st = NUCLEAR.window;
    return {
      title: 'NUCLEAR TEST DETECTED — EASTERN DESERT',
      dApproval: -18, erode: 3, dWorld: -6,
      sum: 'Iran has tested a device',
      outcome: 'miss',
      text: () =>
        'At 0417 local the Kabul array registered a shallow body-wave magnitude 4.6 event in the '
        + 'Dasht-e Lut, with a signature that is not an earthquake. They did not bury it, and a '
        + 'reconnaissance aircraft on a standing track had the column on film inside four minutes — a '
        + 'device shot above ground is a device somebody wants photographed. This war was fought to '
        + 'prevent exactly this.\n\n'
        + 'A source inside the program confirmed the rest within the hour: the design works. But a '
        + 'working device is not a fielded one, and the assembly building is a place on a map. The '
        + 'estimate is ' + Txt.plural(st, 'day') + ' of work before the weapon is mated to something '
        + 'that can carry it.\n\n'
        + 'Release authority is unlocked. Three options in the folder, and the Chairman has declined '
        + 'to recommend any of them.',
    };
  }

  // What a release did, reported after the fact. `dApproval` and `erode` are
  // the amounts that ACTUALLY landed — handed in from releaseNuclear, which
  // already spent them — so the chips and the prose quote the same figures the
  // bar moved by. It must never reach applyEvent; that is why they are named
  // `spentApproval`/`spentErode` rather than the fields applyEvent looks for.
  function nuclearReleaseEvent(o, r) {
    const folded = r.folded;
    const bodies = {
      demo: () =>
        'A single weapon was put up off a boat on patrol in the North Arabian Sea and detonated at ' +
        'altitude over open water southeast of Socotra, six hundred miles from the nearest inhabited ' +
        'coast. The flash was visible from three continents. Nobody was killed, which is the entire ' +
        'point and is also the argument every critic of the decision will make against it for the ' +
        'rest of your life.\n\n' +
        (folded
          ? 'Tehran understood the sentence. Within nine hours the Swiss channel carried an offer of ' +
            'immediate and unconditional terms — the device surrendered, the program opened, the war ' +
            'over. They believed you would do it again over something inhabited. They were not going ' +
            'to find out.'
          : 'Tehran did not understand the sentence, or understood it and decided the answer was no. ' +
            'The statement out of the Supreme National Security Council called it an act of ' +
            'desperation by a government that had run out of conventional options, which is not a ' +
            'wholly unfair reading of it. The assembly clock is still running.'),
      tactical: () =>
        'One low-yield penetrating warhead, off a boat on patrol in the North Arabian Sea, on the ' +
        'assembly site and the halls beneath it. The device Iran spent thirty years building was ' +
        'destroyed roughly four hours before it would have been mated to a transporter erector ' +
        'launcher, along with what remained of the enrichment program underneath it and something ' +
        'on the order of ' +
        o.iranDead.toLocaleString() + ' ' + Txt.pluralize(o.iranDead, 'Iranian') + '.\n\n' +
        'The military problem this war existed to solve is solved. There is no device, there is no ' +
        'program, and there is no timeline. ' +
        (folded
          ? 'Tehran sued for terms before the fallout plume had finished mapping. What is being signed ' +
            'is not really an armistice — it is an acknowledgment by both governments that the thing ' +
            'they were fighting over no longer exists.'
          : 'Tehran has not asked for terms. The war goes on, against a country that no longer has a ' +
            'nuclear program and has just had one American nuclear weapon used on it, and there is no ' +
            'precedent anywhere for what the next week of that looks like.') + '\n\n' +
        'The United States is the first state to use a nuclear weapon in anger since 1945, and the ' +
        'second use is yours.',
    };
    return {
      title: folded ? `${o.name} — TEHRAN CAPITULATES` : `${o.name} — EXECUTED`,
      sum: folded ? 'Tehran accepts terms' : 'Weapon delivered',
      outcome: folded ? 'destroyed' : 'damaged',
      // reported, never carried — see the comment above this function
      spentApproval: r.dApproval, spentErode: r.eroded, spentWorld: o.world,
      text: bodies[o.id],
    };
  }

  // Turns remaining, as the IC would brief it: a band, not a number.
  //
  // `undeclared` is the v2.19 state and the one that needs explaining on screen:
  // every hall CENTCOM opened the war with is rubble and the clock is still
  // running, because what is still turning is the hall nobody declared. Without
  // a word for it the panel shows a live breakout timeline beside a nuclear
  // program assessed at 80% destroyed and no aimpoint to fly, which reads as a
  // bug rather than as the situation it is.
  //
  // It does not leak the folder. It says that enrichment continues, which the
  // clock beside it is already saying, and never how many gaps are left — the
  // rule the whole covert tier is written to. In practice the box is up long
  // before this can fire: the covert hall carries `surfaceBy: 8` and the
  // declared halls die around turn 12–21.
  function breakoutEstimate() {
    const rate = enrichRate();
    const left = G.breakout.need - G.breakout.progress;
    if (rate <= 0) return { halted: true };
    const turns = Math.max(0, left / rate);
    const age = G.turn - G.breakout.assessed;
    const conf = age <= BREAKOUT.decay ? G.breakout.conf : 'low';
    const band = BREAKOUT.band[conf];
    const declared = TARGETS.filter(t => t.enrichment && !t.covert);
    return {
      halted: false, conf,
      undeclared: declared.length > 0 && declared.every(t => t.hp <= 0),
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
    // the net of what the hawks have opened and what the doves have closed off,
    // and the one place either camp touches the nightly plan directly. Floored
    // against the tier itself: three caveats may take the Gulf's own tracks away
    // and no more, or the doves could reach past their own ramps into the deck's.
    n += Math.max(-BASING_TIERS.gulf.tankers, G.gulf.tankers);
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
  // Where the Gulf tier folds. The floor in BASING_TIERS is where it sits with
  // the doves quiet; every caveat Riyadh, Doha and Muscat file walks it up toward
  // wherever world opinion happens to be standing. This is the whole of what a
  // full dove gauge does to the campaign, and it is deliberately a threshold move
  // rather than a nightly tick: a cliff that is coming closer is something a
  // president can read off the same bar they were already reading.
  function gulfFoldThreshold(key) {
    const tier = BASING_TIERS[key];
    return key === 'gulf' ? tier.at + G.gulf.caveats * GULF.caveatStep : tier.at;
  }

  function syncBasing() {
    const events = [];
    for (const [key, tier] of Object.entries(BASING_TIERS)) {
      const should = G.world > gulfFoldThreshold(key);
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
          // Riyadh and Doha carry this sentence now, and the hawks are named as
          // having lost the argument rather than made it — the tier is bloc-wide,
          // and a GCC that has voted is a GCC the dissenters are inside.
          text: 'Riyadh and Doha have carried the council. American offensive operations are suspended from ' +
            'Gulf territory and the airspace is closed to strike packages; Kuwait City and Abu Dhabi argued ' +
            'against and are bound by it anyway. Al Udeid and Al Dhafra are hosting aircraft that are not ' +
            'permitted to fly. ' +
            (G.gulf.corridor
              ? 'The northwestern corridor stands — Amman and Kuwait City are holding it open on their own ' +
                'account, and it is the only reason there is still a way to put a package over Tabriz.'
              : 'Without the northern tanker tracks there is no longer a way to put a manned package over ' +
                'the far northwest of Iran at all — Tabriz and the Caspian are off the target list until ' +
                'this is repaired.'),
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

  // Deep strike needs the northern tracks, and those come with the Gulf ramps —
  // or with the corridor the hawks were paid to hold open regardless, which is
  // the entire point of banking their goodwill instead of spending it (see GULF).
  // ...and the southern front is a different question entirely, which is why it
  // gets its own clause rather than a depth. Sanaa and Hodeidah are in the wrong
  // OCEAN, not merely far: no tanker track out of Kuwait or Amman helps, and the
  // northwestern corridor the hawks were paid to hold open is a corridor into
  // Iran. What reaches Yemen is the Red Sea deck and nothing else on the board.
  //
  // Falling through to the generic rule was the first draft and it was wrong in
  // the most confusing possible way: banking hawk goodwill unlocked Sanaa, so a
  // player who bought the corridor to reach Tabriz found they could suddenly
  // strike a country the corridor does not point at.
  const reachesYemen = () => G.carriers.some(cv =>
    cv.id === 'csg-ford' && cv.arrived && !cv.lost);
  const canReach = (t) => t.theater === 'yemen'
    ? reachesYemen()
    : G.basing.gulf || G.gulf.corridor || (t.depth || 2) < 3;

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
        cls: 'iran', title: 'LAUNCHER SWEEP — NO FIX', internal: true,
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
      cls: 'friendly', title: `LAUNCHER GROUP LOCATED — ${found.short}`, internal: true,
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
  // ---- tonight's electromagnetic picture ----
  // How much of the belt is off the air tonight, 0..1. On hard this is whatever
  // the president ordered and nothing otherwise; on easy and normal it is the
  // standing jam CENTCOM flies without being asked (DIFFICULTY.ew).
  //
  // Cheap and side-effect free on purpose: airDefenseWeight() is on the hot
  // path — every package priced, every render of the air picture — and this is
  // read inside it.
  function ewSuppression() {
    if (G.ew && G.ew.id) return G.ew.sup || 0;
    const cfg = diff().ew;
    return (cfg && cfg.auto) || 0;
  }

  // `structural` asks what the belt IS, rather than what it can do tonight.
  // Same split, and for the same reason, as IranAI.missileStrength(legalOnly):
  // almost everything wants tonight's flying conditions, so that is the
  // default, and the exceptions have to ask.
  //
  // There are exactly THREE structural callers and all three are statements
  // about the CAMPAIGN rather than about tonight — airPhaseEvents(), which
  // announces the night the sky changes hands, and the two heavy-bomber
  // deployment gates in orderHeavies() and autoTheater(). Left on the default
  // reading, the first announces "AIR DEFENSES DEGRADED" every night a jam is
  // ordered and announces losing the sky back every night one is not, and the
  // other two let one night's jamming release a five-turn deployment out of
  // CONUS. Anything else added here almost certainly wants the default.
  function airDefenseWeight(structural) {
    let w = 0;
    for (const t of TARGETS) {
      if (t.type !== 'airdefense') continue;
      w += wt(t) * t.hp / 100;
    }
    // Suppression scales the SAM term and NOTHING else — never the airbase
    // term in airSuperiority() below. That restraint is what makes jamming
    // unable to reach superiority at any value (see EW in data.js), and it is
    // the property the design rests on rather than an oversight to tidy up.
    return structural ? w : w * (1 - ewSuppression()); // 0..AD_SITES
  }

  // The denominator that turns the weight above into a fraction. Summed rather
  // than counted so the two agree when a site weighs something other than 1 —
  // a count here against a weighted sum above reads every partial-weight site as
  // free damage the player never did. No covert air-defense site exists yet, but
  // this is the divisor one would land on, and it is the same shape as the
  // missile and naval denominators for the same reason.
  const AD_SITES = TARGETS.reduce((n, t) => t.type === 'airdefense' ? n + wt(t) : n, 0);

  // ============================================================
  // AIR SUPERIORITY
  // ------------------------------------------------------------
  // How much of the sky is actually American, 0..1. Three quarters of it is the
  // SAM belt and the rest is Iranian fighter basing — take both down and the
  // theater stops being contested airspace and starts being a range.
  //
  // Nothing about this is a one-way ratchet. Air defense sites repair overnight
  // like everything else, and — alone among the target types — they come back
  // even from zero, out of a national reserve that the target list never
  // covered (see AD_RECONSTITUTION). So a phase bought in week one is gone by
  // week two if nobody keeps going back. That is the intended shape of the
  // campaign: the heavy force is not a reward you unlock, it is a condition you
  // maintain, and the night you look away is the night the plan gets smaller.
  // ============================================================
  function airSuperiority(structural) {
    const sam = AD_SITES ? airDefenseWeight(structural) / AD_SITES : 0;
    let ab = 0, n = 0;
    for (const t of TARGETS) {
      if (t.type !== 'airbase') continue;
      ab += wt(t) * t.hp / 100; n += wt(t);
    }
    const iranian = AIR_WEIGHT.sam * sam + AIR_WEIGHT.airbase * (n ? ab / n : 0);
    return clamp(1 - iranian, 0, 1);
  }

  function airPhase(structural) {
    const s = airSuperiority(structural);
    return s >= AIR_PHASE.superiority ? 'superiority'
      : s >= AIR_PHASE.degraded ? 'degraded' : 'contested';
  }

  // ordering, so "is this phase at least that phase" is one comparison
  const PHASE_RANK = { contested: 0, degraded: 1, superiority: 2 };
  const phaseAtLeast = (need, structural) => PHASE_RANK[airPhase(structural)] >= PHASE_RANK[need || 'contested'];

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
    // STRUCTURAL. This is the night the sky changed hands, which is a fact
    // about the campaign — a jam ordered tonight is not the fourth-gen force
    // being released, and the night after it is not the sky being lost back.
    const now = airPhase(true);
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
        // No habituation class on any of the four milestones, and that is the
        // rule rather than an omission: these fire ONCE per campaign and the
        // flag above is what guarantees it. Habituation exists to stop the
        // twentieth repetition of a thing paying like the first, and something
        // that cannot repeat has nothing to habituate to.
        ev.dApproval = movePublic(4);
      }
      return [ev];
    }
    if (now === 'superiority' && rising) {
      const ev = {
        cls: 'friendly', title: 'AIR SUPERIORITY DECLARED OVER IRAN',
        text: 'Nothing is contesting the sky. The SAM network is rubble and the fighter bases are cratered, and ' +
          'for the first time American aircraft are operating over Iran on their own terms. The heavy bomber ' +
          'force can be called forward — B-1s and B-52s off RAF Fairford, which is the difference between ' +
          'raiding a country and dismantling one.',
      };
      if (!G.milestones.superiority) {
        G.milestones.superiority = true;
        ev.dApproval = movePublic(7);
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
          'over Iran. The B-1s and B-52s are on the ramp at Fairford and they are staying there until the ' +
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
      const nukeBump = movePublic(8);
      // The nuclear sites cost nothing to strike, and finishing them pays: the
      // capitals that spent a decade failing to negotiate this away are not
      // going to condemn the country that did it. This +5 is the entire
      // diplomatic story of the enrichment campaign, start to finish.
      G.world = clamp(G.world + 5, 0, 100);
      out.push({
        cls: 'friendly', title: 'OBJECTIVE MET — IRANIAN NUCLEAR PROGRAM DESTROYED',
        text: 'CENTCOM assesses the enrichment complex — Natanz and Fordow — as functionally destroyed. The ' +
          'centrifuge halls are collapsed and the breakout timeline is gone. The reason the country went to ' +
          'war has been achieved, and the country knows it. The capitals that spent twenty years failing to ' +
          'negotiate this away are not going to say so out loud, but the condemnations have stopped.',
        dApproval: nukeBump, dWorld: 5,
      });
    }
    if (!G.milestones.iranBroken && G.iranBroken()) {
      G.milestones.iranBroken = true;
      const brokenBump = movePublic(6);
      out.push({
        cls: 'friendly', title: 'OBJECTIVE MET — IRAN\'S WAR MACHINE BROKEN',
        text: 'The missile force is spent, the navy is on the bottom, and the IRGC command structure is rubble. ' +
          'Iran can no longer wage the war it started. The threat to the Gulf and to American forces in theater ' +
          'has been dismantled.',
        dApproval: brokenBump,
      });
    }
    return out;
  }

  // ============================================================
  // CARRIER STRIKE GROUPS
  // ------------------------------------------------------------
  // Every fighter sortie and every Tomahawk in this war comes off a deck, so
  // where the decks sit is the standing decision underneath all the others.
  // FORWARD is the Gulf of Oman: a hull inside everything Iran shoots at ships,
  // but Aegis on the Gulf approaches, weight on the strait, and a lid on the oil
  // premium. BACK is the middle of the Arabian Sea, halfway from the northern
  // tip of Somalia to the Indian coast: untouchable at that range, and none of
  // those forward effects. The air wing flies at full rate
  // from either station — the move between them takes a turn, and buys the
  // worst of both: exposed on the way, without the presence effects yet.
  //
  // This is a two-station decision for the Lincoln and not one at all for the
  // Ford, who works the Red Sea and stays there (CARRIER_STATIONS `fixed`).
  // She is out of Iran's reach and out of the forward-presence business at the
  // same time: what the second deck buys is sorties, full stop.
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
  // a deck with one station and no posture order — the Ford in the Red Sea
  const cvFixed = (cv) => !!(CARRIER_STATIONS[cv.id] || {}).fixed;
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
  // The strategic weight of a deck sitting forward in the Gulf of Oman, over and
  // above the sorties it flies. A CSG that far up is a wall of Aegis escorts on
  // the Gulf approaches and a standing threat to anything Iran sails at the
  // strait — which reassures the oil market, makes the strait harder to close,
  // and shoots down part of the ballistic salvo aimed at the Gulf-state bases —
  // how much of it depends on what is left in the escorts' cells, which is a
  // magazine that runs down (see bmdRate, and NAVAL_BMD in data.js).
  // A damaged deck counts half — she is still there, she is just fighting her
  // own fires. Read by the economy (game.js oil model) and by Tehran's naval and
  // missile decisions (ai.js).
  //
  // The ceiling is one, not two, because only one deck can earn this: the Ford
  // is in the Red Sea with the Sinai between her and the Gulf, and an escort
  // screen behind Suez covers nothing here. She is skipped explicitly rather
  // than left to fall out of the posture test, so that a future deck given a
  // real forward station reads as the exception and not the rule.
  function navalForward() {
    let n = 0;
    for (const cv of G.carriers) {
      if (cv.lost || !cv.arrived || cv.moving || cvFixed(cv)) continue;
      if (cv.posture !== 'forward') continue;
      n += cv.damaged ? 0.5 : 1;
    }
    return n;
  }

  // ============================================================
  // THE ESCORT SCREEN'S MAGAZINE
  // ------------------------------------------------------------
  // What the forward deck's Aegis escorts can still do about a ballistic salvo,
  // and how much of it is left. The argument for every number is in NAVAL_BMD
  // (data.js); what lives here is the state and the three readings taken off it.
  //
  // The rate is a function of the magazine and of nothing else — not of the turn
  // number, which would decay the shield on rails no matter how the campaign was
  // fought. Rounds come out of it in proportion to what Tehran actually fires at
  // the covered bases, so the missile hunt the player already runs is also the
  // thing that decides whether there is still a screen in week three.
  // ============================================================
  const bmdCapacity = () => Math.round(NAVAL_BMD.load * diff().bmd);
  const bmdFrac = () => clamp((G.bmdPool || 0) / bmdCapacity(), 0, 1);
  const bmdRearming = () => (G.bmdRearm || 0) > 0;

  // 0 with no deck forward, and halved for a deck fighting her own fires — the
  // same forward-presence term everything else on this station reads.
  function bmdRate() {
    const fwd = navalForward();
    if (fwd <= 0) return 0;
    return fwd * (NAVAL_BMD.floor + (NAVAL_BMD.peak - NAVAL_BMD.floor) *
      Math.pow(bmdFrac(), NAVAL_BMD.curve));
  }

  // Fire on `tracks` inbound. The rate is read BEFORE the rounds come off the
  // count, on purpose: tonight's salvo is engaged by the magazine that existed
  // when it was detected, and the bill for it lands on tomorrow night. Firing is
  // capped by what is actually in the cells, so a raid that arrives against an
  // empty screen simply costs nothing to not shoot at.
  function bmdEngage(tracks) {
    const frac = bmdRate();
    const before = G.bmdPool || 0;
    if (frac <= 0 || tracks <= 0) return { frac: 0, fired: 0, before, left: before };
    const fired = Math.min(before, Math.round(tracks * NAVAL_BMD.perTrack));
    G.bmdPool = Math.max(0, before - fired);
    return { frac, fired, before, left: G.bmdPool };
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
  //
  // Raised from 4 with the turnaround below. Measured across 1,256 turns of
  // scripted play: 75% of nights ended because the magazine was empty and only
  // 21% because the tasking order was spent, and the plan was filled on 46.6% of
  // nights. So the ATO — the constraint the whole design is built around, the
  // one the primer teaches on the first screen ("THREE PACKAGES A NIGHT") and
  // the one the late-frag and crew-rest systems price — was not the thing the
  // player was actually running into. They were running into an empty ramp, on a
  // night the staff had already told them held three packages. The tier has to
  // be able to fill the opening plan for any of that to be true.
  const F35_BASE = 6;

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
      repF35: 3 + Math.floor(ff.f35 / 2),
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
      // the weapons that came with it — the only thing that ever refills the
      // stock, and only where a stock is being kept at all
      const rounds = pgmLedger() ? (w.pgm || 0) : 0;
      if (rounds) G.pgm = (G.pgm ?? 0) + rounds;
      events.push({
        cls: 'friendly', title: w.title, text: w.text,
        dTanker: w.tanker,
        // Appended rather than written into the wave's own prose, because that
        // prose is shared with the two levels that keep no ledger and would be
        // quoting a number nothing on their screen shows.
        appended: rounds
          ? `The tranche brought its own weapons: ${Txt.plural(rounds, 'precision munition')} into the ` +
            `theater depots, against ${Txt.plural(G.pgm, 'round')} now on hand.`
          : undefined,
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

  // ---- the watch-floor arrival calls ----
  // Ford checking in with Fifth Fleet and the 509th on the ramp are voice
  // traffic, and they arrive at the noisiest point of the turn: the BDA readout
  // is already talking, and Tehran's salvo and the retaliation alert are right
  // behind it. Played where the arrival actually happens they talk over all of
  // it, so they are queued here instead and read out at the one point in the
  // turn the room is quiet — after the president closes the night's last report.
  // Transient by design: a queue that survived a reload would announce a ship
  // that checked in yesterday, so it never goes near FIELDS.
  let arrivalCalls = [];

  // Read the queue back, one clip at a time — playThen chains them so a night
  // that brings in two forces takes turns instead of stacking two voices. `done`
  // runs after the last one, and immediately when there is nothing to play or
  // nothing can play (muted, audio still locked), so a caller can hand its
  // continuation straight through.
  function flushArrivalCalls(done) {
    const queue = arrivalCalls;
    arrivalCalls = [];
    const next = () => {
      const clip = queue.shift();
      if (clip) AudioSys.playThen(clip, next);
      else if (done) done();
    };
    next();
  }

  // Call the 509th forward. One turn wingtip-to-wingtip across the Pacific with
  // the whole tanker force behind it — and for that turn, nothing else moves.
  function orderBombers() {
    if (G.over || G.bombersOrdered || transitCommitted() || busy()) return;
    G.bombersOrdered = true;
    G.bomberEta = B2_TRANSIT_TURNS;
    G.deployTurn = G.turn;
    cable();
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
    arrivalCalls.push('b2Arrival');   // read out once the night's reports are closed
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
  // very expensive aircraft parked in Gloucestershire doing nothing.
  //
  // They stage out of RAF Fairford rather than Diego Garcia — the atoll is the
  // 509th's — and they do not compete with it: neither field is anywhere Iran
  // can reach, and the transit that matters is Fifth Fleet's, which is why this
  // one takes a slot too.
  // ============================================================
  function orderHeavies() {
    if (G.over || G.heaviesOrdered || transitCommitted() || busy()) return;
    // STRUCTURAL: a five-turn deployment out of CONUS is not unlocked by one
    // night's jamming. The belt has to actually be broken.
    if (!phaseAtLeast('degraded', true)) return;
    G.heaviesOrdered = true;
    G.heavyEta = HEAVY_TRANSIT_TURNS;
    G.deployTurn = G.turn;
    cable();
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
    cable();
    return {
      cls: 'friendly', title: 'HEAVY BOMBER FORCE IN THEATER — RAF FAIRFORD',
      text: 'B-1Bs out of Dyess and B-52s out of Barksdale are on the ramp at RAF Fairford, and the munitions ' +
        'yard has been working around the clock to meet them. A single one of these aircraft carries more ' +
        'ordnance than a four-ship of Strike Eagles. They cannot penetrate anything, they cannot survive a ' +
        'SAM belt, and against fixed targets in an empty sky they will take Iran\'s ability to fight apart ' +
        'faster than anything else in the inventory.',
    };
  }

  // ---- the two fleet commands ----

  // Surging a second deck is a five-turn decision. She is in the eastern
  // Mediterranean when the order goes out, with the canal in the middle of the
  // trip, and no amount of wanting moves her faster — the cost of the second
  // carrier is paid in the turns before it.
  function orderCarrier() {
    if (G.over || G.secondCarrierOrdered || transitCommitted() || busy()) return;
    G.secondCarrierOrdered = true;
    G.secondCarrierEta = FORD_TRANSIT_TURNS;
    G.deployTurn = G.turn;
    syncCarrierMap();
    underwayCall('fordOrdered');   // replaces the cable chirp, same as repositionCall
    UI.renderAll(G);
    Save.write();
  }

  // Order a deck between stations. Takes effect at the end of the turn — the
  // order is given now, the ship is somewhere in between until then. A fixed
  // deck has nowhere to be ordered to; the sidebar does not offer the order, and
  // this refuses it anyway so no caller can put the Ford in a posture her
  // station table has no coordinates for.
  function toggleCarrierPosture(id) {
    if (G.over || busy()) return;
    const cv = carrierById(id);
    if (!cv || !cv.arrived || cv.lost || cv.moving || cvFixed(cv)) return;
    // a deck alongside an ammunition ship has no station to be ordered to. This
    // is the price of the rearm and it is enforced here rather than only hidden
    // in the panel, so nothing can hand the umbrella back before the cells are
    // loaded (see orderRearm).
    if (bmdRearming()) return;
    cv.moving = cv.posture === 'forward' ? 'back' : 'forward';
    syncFleetCaps();
    MapView.setCarrierPosture(cv);
    repositionCall();
    UI.renderAll(G);
    Save.write();
  }

  // Send the screen to reload. Nobody reloads a Mk 41 cell underway — the strike
  // group detaches to an ammunition anchorage and the missiles go in one at a
  // time under a crane — so the order is not "spend money on interceptors", it
  // is "give up the forward station for three nights". The Aegis umbrella, the
  // weight on the strait and the lid on the oil premium all hang off that same
  // posture and all three come off together. Only the deck with a forward
  // station to lose can be sent: the Ford's escorts are behind Suez and are not
  // shooting at anything aimed at the Gulf.
  function orderRearm() {
    if (G.over || busy() || bmdRearming()) return;
    const cv = G.carriers.find(c => !cvFixed(c) && c.arrived && !c.lost);
    if (!cv) return;
    // she comes off station tonight, whichever way she was pointed
    if (cv.posture === 'forward' || cv.moving === 'forward') cv.moving = 'back';
    G.bmdRearm = NAVAL_BMD.rearmTurns;
    syncFleetCaps();
    MapView.setCarrierPosture(cv);
    cable();
    UI.renderAll(G);
    Save.write();
  }

  // ============================================================
  // CENTCOM MAKES THE THEATER CALLS — DIFFICULTY.autoTheater
  // ------------------------------------------------------------
  // The force flow is the one part of THEATER FORCES that a staffed level could
  // not simply stop offering. Fordow has exactly one key and it is at Whiteman
  // until somebody sends for it, so a president who never opens that panel
  // cannot finish the enrichment program — the war's whole objective — at any
  // skill level. Taking the panel away without taking the DECISION away does
  // not simplify the level, it makes it unwinnable.
  //
  // So on easy the staff makes these calls, and the order below is the argument
  // for what "optimal" means here rather than a preference:
  //
  //   1. The 509th first, always, and on night one. It is a one-turn transit
  //      against a fifteen-day war and it is the only thing on this list that
  //      unlocks a target rather than adding weight to targets already reachable.
  //   2. The screen's magazine before the second deck. A dry Aegis screen is
  //      casualties on the ramps at Al Udeid and Al Dhafra tonight, and the
  //      rearm costs three nights whenever it is taken — so it is taken while
  //      there are still rounds to fight with rather than after.
  //   3. The Ford, which is a second air wing and five turns of waiting.
  //   4. The heavies, the moment the belt is breaking enough for Air Combat
  //      Command to release them. They cannot fly until the sky is taken, so
  //      calling them at `degraded` is the earliest a real staff would.
  //
  // Fifth Fleet cuts ONE transit plan a night (see transitCommitted), which is
  // what makes this a priority list rather than four independent yes/nos — the
  // order above IS the decision the panel was asking for.
  //
  // Posture is separate from the transit slot and is decided every night: the
  // deck sits forward, because the Aegis umbrella, the weight on the strait and
  // the lid on the oil premium all hang off that station and a president who is
  // not managing the fleet is not managing the anti-ship threat either. She
  // comes back only to reload, which is the one thing that cannot be done on
  // station.
  //
  // Everything here goes through the SAME order functions the panel's buttons
  // call. Nothing in this block may write G directly — same rule takeCoa follows
  // for the tasking order, and for the same reason: an automatic call that took
  // a shortcut around orderBombers would be a second force-flow path to keep in
  // step with the first.
  const AUTO_REARM_AT = 0.25;   // fraction of the magazine left before she reloads

  // ---- what the staff will stand her into ----
  // The floor is the nightly chance of taking a weapon that Fifth Fleet will
  // accept for a station that is buying nothing tonight — which is not zero,
  // because a deck that never comes north is a deck the president paid for and
  // never sees. The ceiling is what the umbrella over Al Udeid and Al Dhafra is
  // worth on a night Tehran is still shooting and there are still rounds in the
  // cells to meet it. Between them, `forwardWorth` decides.
  //
  // Both are chances of losing or wrecking a supercarrier, so they are small
  // numbers and they should look small: 3% a night over a fifteen-day war is
  // already about one campaign in ten. Anything looser than this and the
  // measurement below stops holding.
  const AUTO_RISK_FLOOR = 0.03;
  const AUTO_RISK_CEIL = 0.10;
  const riskTolerance = () => AUTO_RISK_FLOOR + (AUTO_RISK_CEIL - AUTO_RISK_FLOOR) * forwardWorth();

  // Hysteresis, and it is not decoration. A deck under way is HALF EXPOSED
  // (carrierExposure) whichever way she is pointed, so crossing this line costs
  // the same as standing on the wrong side of it for a night — and a call that
  // sat on the line would send her back and forth across the Ra's al Hadd line
  // for the whole war, exposed every single night, which is precisely the state
  // v1.93 left her in. Going north asks for real margin; staying north does not.
  const standForward = (cv) =>
    antiShipRisk() <= riskTolerance() * (cv.posture === 'forward' ? 1 : 0.6);

  // What the staff did tonight, in the president's words, for the brief dialog
  // to read back. Transient by design — a note that survived a reload would
  // report an order given yesterday as tonight's news — so it never goes near
  // FIELDS. Read and cleared by UI.openBrief.
  let theaterNotes = [];
  const takeTheaterNotes = () => { const n = theaterNotes; theaterNotes = []; return n; };

  // The opening is ONE sound. autoTheater's orders each chirp a cable, and on
  // night one that run happens inside start() — so the war opened on the sting
  // and then a beep on top of it, which reads as two openings rather than one.
  // Held down for that run only: every other night the cable is the only thing
  // that says CENTCOM moved something, and it stays.
  let quietOrders = false;
  const cable = () => { if (!quietOrders) AudioSys.play('cable'); };

  // ...and the one order that gets more than the chirp. A deck changing station
  // is the only thing on the force flow that MOVES on the map, so it is
  // announced the way the board announces a move: the sea alongside her as she
  // comes about, and the floor reading the order back over it. It REPLACES the
  // cable rather than stacking on it — the beep means "CENTCOM moved
  // something", and these two say which thing and where it is going, so both is
  // the same sentence twice with a beep in front of it.
  //
  // The read-back OVERLAPS the wash rather than waiting it out, and the offset
  // is what makes this sound like a bridge instead of two files in a row.
  // Measured, the wave is in at -40 dB, crests around -23 across its middle two
  // seconds and is decaying from 3.0; chained on `ended` the voice landed at
  // 5.1, which is a second of near-silence after the sea has gone and reads as
  // a duty officer in a quiet room. At 3.5 it lands in the decay with the swell
  // still under it.
  //
  // A literal rather than something derived off `duration`: what this number
  // tracks is where THIS recording crests, and a fraction of the length would
  // put the voice in the wrong place on any clip with a different envelope
  // just as surely. Re-cut the wash and re-measure it — the second-by-second
  // figures above are the whole argument for 3.5.
  //
  // Same quietOrders gate as cable() for the same reason: autoTheater stands
  // her forward inside start(), and five seconds of sea under the opening sting
  // reads as two openings rather than one. play() judges a delayed clip against
  // the room it lands in, so a call placed while the secure line is open is
  // dropped rather than talking over the Prime Minister.
  //
  // Two orders take this shape, which is why the wash is a parameterless
  // helper and the voice is its argument: a deck changing station, and the
  // Ford being surged out of the Mediterranean. They are the same act — an
  // order to Fifth Fleet that moves a hull on the map — and reading one of
  // them back over the sea and the other over the cable beep would say the
  // two were different kinds of thing.
  const REPOSITION_READBACK_MS = 3500;
  const underwayCall = (clip) => {
    if (quietOrders) return;
    AudioSys.play('shipUnderway');
    AudioSys.play(clip, REPOSITION_READBACK_MS);
  };
  const repositionCall = () => underwayCall('carrierReposition');

  // The two halves of the standing posture call, in the president's words.
  //
  // The south note has to name what would bring her back, or the automation is
  // just a thing that happened to the fleet in the night. On this level the
  // coast is the only lever the president has on their own carrier's station —
  // and it is three depth-1 aimpoints they can put on tonight's tasking order,
  // which makes "there needs to be a reason" a decision rather than a mood.
  const coastList = () => {
    const names = liveShooters().map(t => t.name.split(' — ')[0]);
    if (!names.length) return 'the coast';
    if (names.length === 1) return names[0];
    return names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1];
  };

  function southNote(cv, held) {
    if (held) {
      const src = TARGETS.find(t => t.id === G.threat.srcId);
      return `An anti-ship brigade${src ? ` at ${src.name.split(' — ')[0]}` : ''} is holding a firing ` +
        `solution on ${cvName(cv)}. Fifth Fleet has taken her south out of the envelope — a day of ` +
        `reduced sorties, no Aegis over the Gulf bases, and the lid off the barrel. She is under way ` +
        `when the weapons arrive rather than clear of them, which is half an answer and the only one ` +
        `left this late.`;
    }
    const n = liveShooters().length;
    return `Fifth Fleet is not standing ${cvShort(cv)} in the envelope tonight. ${coastList()} ` +
      `${Txt.are(n)} still able to run a targeting cycle on her, and the forward station is not ` +
      `buying enough tonight to be worth a carrier. She works the war from south of the Ra's al Hadd ` +
      `line — no Aegis over the Gulf bases, no weight on the strait, no lid on the barrel. She comes ` +
      `back north when ${n === 1 ? 'that shooter is' : 'those shooters are'} dead.`;
  }

  function northNote(cv) {
    const n = liveShooters().length;
    // one of these clauses opens on a place name and the other on a pronoun, so
    // the capital goes on here rather than being baked into either
    const reason = forwardReason();
    const why = !n
      ? 'nothing on that coast can run a targeting cycle on her any more'
      : `${coastList()} ${Txt.are(n)} still on the coast, but ` + (reason ||
        `not enough of ${n === 1 ? 'a shooter' : 'a threat between them'} to hold a deck out of ` +
        'the carrier box');
    return `${why.charAt(0).toUpperCase()}${why.slice(1)}. ${cvShort(cv)} is moving back up into the ` +
      `Gulf of Oman — Aegis over the Gulf bases, weight on the strait, and a lid on the barrel.`;
  }

  function autoTheater() {
    // Tonight's notes are tonight's. The brief is now armed rather than opened
    // (see openBrief below), so a president who never asked for the folder
    // leaves last night's notes sitting in this buffer — and read back a turn
    // later, "the 509th is moving tonight" is a lie about a transit that landed
    // yesterday. Cleared here rather than in takeTheaterNotes because this is
    // the one function that writes them, and it runs once a turn.
    theaterNotes = [];
    if (G.over || !diff().autoTheater) return;

    // ---- posture, which does not spend the transit plan ----
    // v1.93 pulled her south when a solution was HELD on her, and that reads
    // right and is a night too late. The order is given at this turn boundary,
    // carrierExposure counts a deck UNDER WAY as half exposed, and carrierRisk
    // rolls the shot at the end of the same turn — before checkCarrierTransit
    // puts her on the new station. So the answer halved the odds and could never
    // remove them, and the next night she walked back into the envelope to be
    // warned again.
    //
    // Measured over 160 easy campaigns at v1.98: a workup on 27.1% of nights
    // against 9.9% on normal, every one of the 1,181 of them rolled at half
    // exposure and not one at zero, the Lincoln struck in 100% of campaigns and
    // SUNK in 33.8% — worse than hard, on the level where the president may not
    // touch the fleet at all. The staff was reacting to the warning, and Fifth
    // Fleet does not run a carrier by reacting to the warning.
    //
    // So the call is a STANDING one, and the held solution is the last resort it
    // always was rather than the whole policy. A deck on her southern station
    // with no transit ordered has exposure 0, which means raiseThreat cannot
    // raise a workup against her at all — that, and not a faster reaction, is
    // the only thing on this board that actually keeps her afloat.
    //
    // And it gives the president the reason the automation owes them: the coast
    // is three depth-1 aimpoints, and killing them is what brings her north.
    const cv = G.carriers.find(c => c.arrived && !c.lost && !cvFixed(c));
    if (cv && !bmdRearming()) {
      const held = !!(G.threat && G.threat.cvId === cv.id);
      // a solution already in the system overrides the standing call: half an
      // answer is still better than none on the one night it is all there is
      const want = held || !standForward(cv) ? 'back' : 'forward';
      if (bmdFrac() < AUTO_REARM_AT && IranAI.missileStrength() > 0) {
        orderRearm();
        theaterNotes.push(`The escort screen is down to ${Math.round(bmdFrac() * 100)}% of its ` +
          `interceptors. ${cvShort(cv)} is detaching to the ammunition ship to reload — no umbrella ` +
          `over the Gulf bases for ${Txt.turns(NAVAL_BMD.rearmTurns)}.`);
      } else if (!cv.moving && want !== cv.posture) {
        // a deck already under way is committed — toggleCarrierPosture refuses
        // her anyway, and there is nothing to report that was not reported the
        // night the order went out
        toggleCarrierPosture(cv.id);
        theaterNotes.push(want === 'back' ? southNote(cv, held) : northNote(cv));
      }
    }

    // ---- the transit plan, one a night ----
    if (transitCommitted()) return;
    if (!G.bombersOrdered) {
      orderBombers();
      theaterNotes.push('The 509th is moving Whiteman to Diego Garcia tonight. Until those aircraft ' +
        'are on the ramp the GBU-57 is not in theater, and Fordow is a briefing slide.');
    } else if (!G.secondCarrierOrdered) {
      orderCarrier();
      theaterNotes.push(`${cvShort(G.carriers.find(c => !c.arrived) || G.carriers[0])} has been surged ` +
        'out of the Mediterranean and down through the canal. Five turns out, and a second air wing ' +
        'when she gets there.');
    } else if (!G.heaviesOrdered && phaseAtLeast('degraded', true)) {   // structural, as orderHeavies
      orderHeavies();
      theaterNotes.push('The belt is breaking, so Air Combat Command has released the heavies. B-1s ' +
        'and B-52s are moving to RAF Fairford against the night the sky is finally ours.');
    }
  }

  // Where tonight's decision arrives. Two shapes of the same brief: a dialog
  // the president has to answer before the room moves on, or the sidebar panel
  // that has always held it. The level decides (see DIFFICULTY.popups), and this
  // is the only thing that stages either — nextTurn and start both come here so
  // the first night and the twenty-ninth are staged identically.
  //
  // The dialog is ARMED here, not opened. A brief that threw itself across the
  // board the instant the turn rolled over asked the president to choose between
  // three courses of action before they had looked at the map those courses are
  // about — which, on the one level where signing an option is the whole night,
  // is the wrong order to read a war in. The night now opens on the map and the
  // brief waits behind READY FOR OPTIONS.
  //
  // That button STANDS IN the end-turn button's place rather than sitting beside
  // it, the same swap SKIP TO RESULTS makes. The reason is the reason the brief
  // was a dialog in the first place: a president must not be able to end a turn
  // without knowing they were asked anything. Beside END TURN the prompt is
  // ignorable and the hole is back; in front of it the cost is one press and the
  // map time is free. Nothing else about the brief changes — same options, same
  // notes, same dialog, one press later.
  let briefPending = false;

  function openBrief() {
    if (popup('brief')) {
      // Nothing to sign and nothing to report is not a button either — the same
      // test UI.openBrief makes before it declines to open an empty dialog.
      // A free action slot still holding its order counts as something to sign:
      // on this level the folder is the only place that slot appears, so a night
      // where the staff has nothing to brief is exactly the night the president
      // most needs the door to it. UI owns the list (see BRIEF_SLOTS) so the two
      // tests cannot drift into arming a button over an empty dialog.
      briefPending = !G.over && (coaOptions().length > 0 || theaterNotes.length > 0 ||
        UI.briefSlotPending());
      UI.syncBriefButton();
      return;
    }
    const list = diff().coa ? coaOptions() : [];
    if (list.length) UI.openPanel('coa', true);
  }

  // The president asking for the folder: READY FOR OPTIONS while the brief is
  // armed, BRIEF ME afterwards. One entry point for both, because they open the
  // identical dialog and differ only in whether tonight's theater notes are
  // still news — they were news the first time the room read them and are not
  // news twice, so a reopened brief carries the options alone.
  function showBrief() {
    if (G.over || busy()) return;
    const armed = briefPending;
    briefPending = false;      // clearing first is what puts END TURN back
    // `armed` is the READY FOR OPTIONS press and only that press: the two
    // buttons are never both live (see syncBriefButton), so BRIEF ME can only
    // arrive here with it already false. That is also what gates the clip to
    // easy without a difficulty test — briefPending is written by openBrief,
    // which returns early unless popup('brief'), and easy is the only level
    // that carries it. The G.over/busy() gate above stands in front of both,
    // so a press the game refuses does not get a voice either.
    if (armed) AudioSys.play('briefReady');
    // briefOptions, not coaOptions: pressing BRIEF ME after the night is signed
    // is the other door to the surge, and it must show the same slate the folder
    // would have walked into (see surgeOption).
    UI.openBrief(diff().coa ? briefOptions() : [], armed ? takeTheaterNotes() : null);
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
        cls: 'friendly', title: `${cvShort(cv)} ON STATION — GULF OF OMAN`,
        text: `${cvName(cv)} has come north through the Ra's al Hadd line and taken station in the Gulf of Oman, a hundred miles off the Makran coast. Her air wing was flying full from standoff and flies full here — what she adds on station is her Aegis escorts over the Gulf bases, her weight on the strait, and a lid on the oil premium. She is also, from tonight, inside every anti-ship weapon Iran owns, and inside most of them by a wide margin.`,
      } : bmdRearming() ? {
        // same movement, different reason, and the reason is the whole point of
        // the order — so it is read back as a rearm and not as a withdrawal
        cls: 'friendly', title: `${cvShort(cv)} DETACHED TO REARM — ARABIAN SEA`,
        text: `${cvName(cv)} has cleared the Gulf of Oman and gone alongside the ammunition ship in the open Arabian Sea. The escorts strike down SM-3 and SM-6 rounds one cell at a time under a crane, in a seaway, and it is the only way it can be done — there is no reloading a Mk 41 on station. She flies her full air wing from out there. What she is not doing for the next ${Txt.plural(NAVAL_BMD.rearmTurns, 'night')} is holding an umbrella over Al Udeid and Al Dhafra, leaning on the strait, or keeping a lid on the barrel.`,
      } : {
        cls: 'friendly', title: `${cvShort(cv)} WITHDRAWN TO THE OPEN ARABIAN SEA`,
        text: `${cvName(cv)} has cleared the Gulf of Oman and run south into the middle of the Arabian Sea, halfway between the northern tip of Somalia and the coast of India — five hundred miles of nothing in every direction, and off the plot unless you go looking for her. She keeps her full sortie rate from out there on the tankers. What she gives up is the forward presence: no Aegis over the Gulf bases, no pressure on the strait, no lid on the oil premium.`,
      });
    }
    if (events.length) syncFleetCaps();
    return events;
  }

  // The rearm detachment, ticked once a night with the rest of the fleet
  // movement. It ends with full cells and nothing else: she is still in the
  // Arabian Sea, and putting her back on station is a separate order and another
  // night. That gap is the price, and it is charged in salvos nobody shot at.
  function checkRearm() {
    if (!bmdRearming()) return null;
    G.bmdRearm--;
    if (G.bmdRearm > 0) return null;
    const cv = G.carriers.find(c => !cvFixed(c) && c.arrived && !c.lost);
    const before = G.bmdPool || 0;
    G.bmdPool = bmdCapacity();
    const taken = G.bmdPool - before;
    // The deck canisters go back at the same time, off the same ship, by the
    // same working party. It is one replenishment and it should read as one —
    // but the NSM line is only written when rounds actually went back in, or a
    // player who has never fired one gets told about a magazine they did not
    // know they had, in the middle of the sentence about the one they care
    // about.
    const nsmBack = NSM_LOAD - (G.nsmPool ?? NSM_LOAD);
    G.nsmPool = NSM_LOAD;
    return {
      cls: 'friendly', title: `${cv ? cvShort(cv) : 'ESCORT SCREEN'} REARMED — CELLS FULL`,
      sum: `Interceptors: ${Txt.signed(taken)} ${Txt.pluralize(taken, 'round')}`,
      text: `The screen has struck down ${Txt.plural(taken, 'round')} and broken away from the ammunition ship. ` +
        `${G.bmdPool} SM-3 and SM-6 ${Txt.pluralize(G.bmdPool, 'interceptor')} in the cells — a full magazine, ` +
        `and the last one the theater has cued up for a while.` +
        (nsmBack > 0
          ? ` ${Txt.plural(nsmBack, 'Naval Strike Missile')} went into the deck canisters with them.`
          : '') +
        ` She is still in the open Arabian Sea: ` +
        `the umbrella over the Gulf bases does not come back until she is ordered north and gets there.`,
    };
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
    arrivalCalls.push('fordArrival');   // read out once the night's reports are closed
    return {
      cls: 'friendly', title: 'FORD ON STATION — RED SEA',
      text: 'The USS Gerald R. Ford Carrier Strike Group cleared the Suez Canal southbound overnight and is on station in the Red Sea abeam Yanbu, checked in with Fifth Fleet. Her full air wing is available from there and it is the whole of what she brings: the Sinai is between her and the Gulf, so her escorts are not shooting down anything aimed at Al Udeid and her presence is not being priced into a barrel of Brent. She stays where she is — there is no station forward for her, and the sortie rate is the point.',
    };
  }

  // ============================================================
  // IRANIAN ANTI-SHIP FIRES — TELEGRAPHED, THEN ROLLED
  // ------------------------------------------------------------
  // The reason a carrier forward in the Gulf of Oman is a decision and not
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

  // the brigades and the hull that can still run a targeting cycle tonight
  const liveShooters = () => THREAT_SOURCES
    .map(id => TARGETS.find(t => t.id === id))
    .filter(t => t && t.hp > 0);

  // ============================================================
  // THE STAFF'S READ OF THE SAME BOARD — Game.antiShipRisk / forwardWorth
  // ------------------------------------------------------------
  // What CENTCOM assesses it costs to keep a deck in the Gulf of Oman tonight,
  // and what it buys. Read only by autoTheater, which is to say by the level
  // where the president is not allowed to touch the fleet — but written HERE,
  // beside the mechanic, because the whole point is that the staff is reading
  // the same board the shot is rolled off and not a second copy of it.
  //
  // The risk is raiseThreat's own arithmetic run forward: a workup on
  // `0.30 * naval` of nights, a shot on `p` of those, and the shooter's own
  // condition on top of that. Nothing here invents a number — change the
  // mechanic and the assessment moves with it, which is the only way an
  // automatic posture call can stay honest.
  // ============================================================
  function antiShipRisk() {
    const naval = IranAI.navalStrength();          // 0..2
    if (naval <= 0) return 0;
    const live = liveShooters();
    if (!live.length) return 0;                    // nobody left to hold a solution
    const coast = live.reduce((s, t) => s + t.hp / 100, 0) / live.length;
    return 0.30 * naval * clamp(0.22 * naval, 0.1, 0.5) * coast;
  }

  // What the forward station is worth tonight — the three things that hang off
  // it, none of which matters on every night of every war. The Aegis umbrella is
  // worth nothing with an empty magazine or a dead missile force, the weight on
  // the strait is worth nothing while it is open, and the lid on the barrel is
  // worth most when the barrel is already up.
  //
  // Built once and read twice: `forwardWorth` is the number the posture call
  // uses and `forwardReason` is the words the president is given for it. Same
  // rule the sidebar and the brief follow for a course of action — a decision
  // and its stated reason cannot come from two different computations, or the
  // night the two disagree is the night nobody can tell which one was the war.
  const FORWARD_TERMS = [
    ['umbrella', () => (IranAI.missileStrength() > 0 ? bmdFrac() : 0),
      () => 'the Gulf bases still need the Aegis umbrella and the cells still have rounds in them'],
    ['strait', () => (G.hormuz === 'OPEN' ? 0 : 1),
      () => `the strait is ${G.hormuz.toLowerCase()} and a carrier in the Gulf of Oman is the weight on it`],
    ['barrel', () => clamp((G.oil - 95) / 35, 0, 1),
      () => `Brent is at $${Math.round(G.oil)} and her presence is the lid on it`],
  ];
  // the best of the three, not their sum: any one on its own is a reason to be there
  const forwardWorth = () => clamp(Math.max(...FORWARD_TERMS.map(([, v]) => v())), 0, 1);
  // ...and null on a night none of the three is worth anything, which is a real
  // state and not a missing string: she also goes north when the risk has simply
  // fallen away under her, and a sentence claiming the barrel or the strait sent
  // her would be the staff inventing a reason it does not have.
  function forwardReason() {
    let best = null;
    for (const term of FORWARD_TERMS) if (!best || term[1]() > best[1]()) best = term;
    return best && best[1]() > 0 ? best[2]() : null;
  }

  // Warn for NEXT turn's fires, at the end of this one. Stored on G so the
  // sidebar, the map and the fires themselves all read the same object.
  function raiseThreat() {
    const naval = IranAI.navalStrength();
    const exposed = G.carriers.filter(cv => carrierExposure(cv) > 0 && !cv.lost);
    if (naval <= 0 || !exposed.length) { G.threat = null; return null; }
    // a workup needs a shooter: the surviving bases and the hull at sea
    const live = liveShooters();
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
        // A supercarrier on the bottom, on television, for the first time in
        // the country's history. This is the largest single erosion in the
        // game and the only one that is not about Americans in enemy hands:
        // what it costs the president is not sympathy, it is the assumption
        // that they know what they are doing. See APPROVAL.erode.
        erode: APPROVAL.erode.carrierLost,
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
      text: `An Iranian anti-ship missile got through the screen and hit ${cvName(cv)} above the waterline, starting fires on the hangar deck. Damage control has the ship, but her flight deck is fouled and her catapults are down. She is retiring south out of the Gulf of Oman into open water and will fly at a fraction of her rate for the rest of this war. Fifth Fleet did not order the withdrawal — the damage did.`,
      // -7 to -5: a damaged carrier is a real event and not a catastrophe —
      // she is afloat, under way and still flying — and it fires in a third of
      // campaigns. The SUNK branch above is the one that keeps its full weight
      // and takes the base with it.
      casualties: rand(8, 25), dApproval: -5, dOil: 6,
      flashAsset: cv.id, attack: { kind: 'missile', base: cv.id, count: 4 },
    };
  }

  // ---- Israel: the joint deep-strike option ----
  // Coordinating with Israel buys one combined package against a buried site —
  // IAF F-35I escort and SEAD opening the corridor for US penetrators. It is the
  // only path to Fordow that isn't a B-2, and it costs more abroad than an
  // American strike does: everyone reads it as the war widening.
  //
  // It is no longer once per war. Every time Jerusalem's gauge fills while they
  // are coordinated, the IAF flies its own night AND the joint option comes back
  // on the board (see israelTurn). That is the payoff that makes letting pressure
  // build a strategy rather than a mistake: an ally you keep inside the tasking
  // order regenerates the deep-strike capability a B-2 otherwise monopolizes.
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

  // ---- Jerusalem's clock ----
  // The aimpoints Israel came for. A live one left alone tonight is what pushes
  // the gauge; one CENTCOM serviced is what pulls it down. Everything here reads
  // the flag off TARGETS rather than a hardcoded id list, so adding an aimpoint
  // to Israel's war is a one-word edit in data.js.
  // Jerusalem's list, restricted to sites CENTCOM can actually service. A gap in
  // the folder must not drive the gauge: `ignored` is charged per priority target
  // left standing tonight, and charging it for a site the president has no
  // aimpoint against is charging them for a decision they were never offered.
  // No current priority target is covert, so this filter changes nothing today —
  // it is here so that adding one later cannot quietly turn the Israel clock
  // into a penalty for imperfect intelligence. (The interesting version runs the
  // other way: coordinated posture buys an aimpoint off Mossad. Not built.)
  const israelPriorities = () => TARGETS.filter(t => t.israelPriority && plotted(t));

  // Tonight's movement on the gauge, as a list of [amount, why] so the panel and
  // the report can both explain a number the player is being judged on rather
  // than just showing it climb. Pressure is only ever changed through this.
  // `hold` defaults to the promise actually in force. israelEta passes an
  // explicit 0 to ask what the climb looks like once that promise has run out —
  // the projection has to know both rates, and there is no second copy of this
  // arithmetic anywhere for them to disagree across.
  function israelDrivers(hold) {
    const d = [];
    const k = diff().israel;
    const held = hold === undefined ? G.israelHold : hold;
    const live = israelPriorities().filter(t => t.hp > 0);
    const hit = israelPriorities().filter(t => G.struckThisTurn.includes(t.id));

    // A gutted program is the one argument that actually works in Jerusalem. It
    // outranks everything else on the list — including their own target list,
    // because a hall that is already rubble is not an aimpoint any more.
    if (G.nukeDegraded() >= ISRAEL.standDown) {
      d.push([ISRAEL.cooling, 'enrichment program assessed gutted']);
      return d;
    }

    d.push([ISRAEL.ambient * k, 'Israeli readiness cycle']);
    const brk = Math.min(1, G.breakout.progress / G.breakout.need);
    if (brk > 0.15) d.push([ISRAEL.breakout * brk * k, 'their read on the breakout clock']);
    const unserviced = live.filter(t => !G.struckThisTurn.includes(t.id));
    if (unserviced.length) {
      d.push([ISRAEL.ignored * unserviced.length * k,
        `${Txt.plural(unserviced.length, 'priority aimpoint')} left standing`]);
    }

    // A promise to hold damps EVERY impatience driver, not just the ambient one.
    // The first version scaled only `ambient`, which made the whole order very
    // nearly decorative: ambient is ~3.5 of a ~16-point climb, so a president who
    // spent approval on the call watched the gauge slow from 18 a turn to 16 and
    // correctly concluded the lever did nothing. Standing down means standing down
    // — for as long as it lasts, Jerusalem is not acting on its target list either.
    // What it cannot damp is `serviced` below (a promise should never make an
    // American strike on their list count for less) or a salvo landing on Israeli
    // cities, which arrives through applyEvent and outruns any assurance.
    if (held > 0) {
      for (const row of d) row[0] *= ISRAEL.holdFactor;
      d.push([0, `standing down on your assurance — ${Txt.turns(held)} left`]);
    }

    for (const t of hit) d.push([ISRAEL.serviced, `${t.short} serviced by CENTCOM`]);
    return d;
  }

  // How many turns until they fly. Estimated rather than stored: the gauge is the
  // state and the ETA is a reading off it, so the number the advisors quote can
  // never disagree with the number driving the sim. Null when the gauge is not
  // rising — there is no honest countdown on a cooling ally.
  //
  // PROJECTED FORWARD, not divided. A promise to hold damps the climb by two
  // thirds but only lasts three turns, and a single division by tonight's damped
  // rate reported "airborne in ~18 turns" on a war that had eight — the panel
  // sold the player a reprieve three times longer than the one they bought. So
  // the hold is walked down turn by turn and the undamped rate takes over when it
  // expires. Everything else is assumed to hold still, which is the honest
  // meaning of an estimate: it is what happens if the president changes nothing.
  const rateOf = (hold) => israelDrivers(hold).reduce((n, [amt]) => n + amt, 0);

  function israelEta() {
    const after = rateOf(0);
    let p = G.israelPressure, hold = G.israelHold;
    // Projected across the planned campaign rather than the war's true length,
    // which no longer has one. Thirty turns out is already further than any
    // estimate on this screen deserves to be trusted.
    for (let n = 1; n <= G.softCap; n++) {
      const rate = hold > 0 ? rateOf(hold) : after;
      if (rate <= 0 && after <= 0) return null;   // cooling, and nothing ahead changes that
      p += rate;
      if (hold > 0) hold--;
      if (p >= ISRAEL.fly) return n;
    }
    return null;   // not inside this campaign
  }

  // How the clock reads in one phrase. A null ETA has two completely different
  // meanings and they must not share a sentence: the gauge FALLING (their list is
  // rubble, or the program is gutted) is a war where Israel has stood down, while
  // a gauge still creeping up too slowly to launch inside 30 turns is a war where
  // the president is holding them off by servicing the list — an achievement, and
  // a reversible one. Both used to print "standing down", which told a player who
  // had earned the second that they had earned the first.
  function israelClock() {
    const eta = israelEta();
    if (eta !== null) return `airborne in ~${Txt.turns(eta)}`;
    return rateOf() > 0 ? 'held short of launch at this tempo' : 'standing down — the gauge is falling';
  }

  // one-line posture summary used by map tooltips and the ALLIES panel
  function israelStatus() {
    const p = Math.round(G.israelPressure);
    const clock = israelClock();
    if (G.israelPosture === 'coordinated') return `COORDINATED WITH CENTCOM — pressure ${p}%, ${clock}`;
    if (G.israelPosture === 'unilateral') return `ACTING UNILATERALLY — pressure ${p}%, ${clock}`;
    return `SIDELINED — pressure ${p}%, ${clock}`;
  }

  // The same line for the other ally with a ramp on this board. Riyadh has no
  // gauge of its own — it has a threshold, and the honest thing to report is
  // where the counter stands against it, because that counter is the whole
  // trigger. The dove gauge already speaks for Saudi patience and this must not
  // duplicate it: what this says is whether the RSAF is flying, never how the
  // council feels about it.
  function saudiStatus() {
    const H = G.houthi;
    if (!H || !H.entered) return 'NOT ENGAGED — no southern front';
    if (!H.saudiIn) {
      // The count goes in front of the noun, not behind it: "1 salvo onto Saudi
      // soil of 3" parses as "of 3 soil" on the way past.
      return `HOLDING — ${H.saudiStruck} of ${Txt.plural(HOUTHIS.saudiStrikes, 'salvo')} ` +
        `onto Saudi soil, strait ${G.mandab.toLowerCase()}`;
    }
    return `COMMITTED OVER YEMEN — ${Txt.plural(H.saudiSorties, 'night')} flown, ` +
      (H.saudiSince <= HOUTHIS.saudiGrace
        ? 'the council is quiet while they fly'
        : 'and the council is counting the cost');
  }

  // what the president is spending, and what it buys, on the NEXT ask
  function israelHoldCost() {
    const n = G.israelHolds;
    return {
      approval: Math.round(ISRAEL.holdApproval * Math.pow(ISRAEL.holdRamp, n)),
      relief: Math.round(-ISRAEL.holdRelief * Math.pow(ISRAEL.holdDecay, n)),
      left: Math.max(0, ISRAEL.holdMax - n),
    };
  }

  // ============================================================
  // THE TWO ARGUMENTS INSIDE THE COALITION
  // ------------------------------------------------------------
  // See the design note above GULF in data.js. Two camps, two gauges, and the
  // same shape as Jerusalem's clock throughout — drivers are a list of
  // [amount, why] so the panel can explain a number the president is being
  // judged on, and the gauges are ONLY ever moved through them.
  // ============================================================
  const gulfStates = (camp) => GULF.states.filter(s => s.camp === camp);

  // What the hawks want serviced: the arm that can reach them. Read off the type
  // rather than a per-target flag, so a missile site added to data.js later is on
  // their list the day it lands. Restricted to what CENTCOM can actually plot —
  // charging the president for leaving a covert box alone is charging them for a
  // decision they were never offered, which is the same rule israelPriorities
  // documents one screen up.
  const gulfPriorities = () => TARGETS.filter(t =>
    (GULF.priorityTypes.includes(t.type) || GULF.priorityIds.includes(t.id)) && plotted(t));

  // Tonight's movement on the hawks' gauge. Everything here is something a
  // capital in the region can see from its own territory: what Iran did to them,
  // what American ordnance landed on, and whether the strait is shut.
  function gulfHawkDrivers() {
    const d = GULF.hawk;
    const out = [[d.ambient, 'The threat next door has not moved']];

    const serviced = gulfPriorities().filter(t => G.struckThisTurn.includes(t.id)).length;
    if (serviced) {
      out.push([d.serviced * serviced,
        `${Txt.plural(serviced, 'missile-force aimpoint')} serviced tonight`]);
    }
    if (G.hormuz !== 'OPEN') out.push([d.strait, 'The strait is their sea lane too']);
    // A night with nothing on the tasking order reads in Kuwait City and Abu
    // Dhabi as a president losing their nerve, and it is the only term here the
    // president controls completely.
    if (!G.strikesThisTurn) out.push([d.idle, 'Nothing flew tonight']);
    return out;
  }

  // ...and the doves'. The barrel, the strait, the calendar, and the photographs.
  function gulfDoveDrivers() {
    const d = GULF.dove;
    const out = [
      [d.ambient, 'Nobody has told them how this ends'],
      [Math.min(d.grindMax, d.grind * G.turn),
        'Every night this runs is a night they are asked about it'],
    ];

    if (G.oil > d.oilFloor) {
      out.push([d.oil * (G.oil - d.oilFloor), `The barrel is at $${Math.round(G.oil)}`]);
    }
    if (G.hormuz !== 'OPEN') {
      out.push([d.hormuzShut * (G.hormuz === 'CLOSED' ? 2 : 1),
        `The strait is ${G.hormuz.toLowerCase()}`]);
    }
    // The southern one, which two of the three doves have a coastline on. Named
    // explicitly rather than folded into the line above: "the strait" means
    // Hormuz to everyone reading this panel, and a president who saw that line
    // creep up would go looking at the wrong waterway.
    if (G.mandab !== 'OPEN') {
      out.push([d.mandabShut * (G.mandab === 'CLOSED' ? 2 : 1),
        `Bab al-Mandab is ${G.mandab.toLowerCase()}`]);
    }
    // The dual-use class, and deliberately not restricted to the sites CENTCOM
    // chose: a coordinated Israel's wildcard nights land on this same list, which
    // is the second consequence that surcharge always should have had. What
    // Riyadh is reacting to is the photograph, not the tasking order behind it.
    const civil = TARGETS.filter(t => t.type === 'infra' && t.hp <= 0).length;
    if (civil) {
      out.push([d.civil * civil, `${Txt.plural(civil, 'civil site')} down inside Iran`]);
    }
    if (G.oil <= d.calmOil && G.hormuz === 'OPEN') {
      out.push([d.calm, 'The barrel is calm and the tankers are moving']);
    }

    // ---- and the war Riyadh is fighting on its own account ----
    // The southern front's one lasting mark on this gauge, and it changes sign.
    // See HOUTHIS in data.js: a council cannot file a caveat about a war its own
    // air force is flying, so committing the RSAF buys real quiet — and then it
    // stops, because what this gauge measures was never approval of the war. It
    // is how long Riyadh will keep paying for it, and the answer gets shorter
    // once they are paying for two.
    //
    // The ramp matters. A term that flipped from −3.5 to +2.5 in one turn reads
    // on the panel as the council changing its mind overnight for no stated
    // reason; walked up over four turns it reads as patience running out, which
    // is the thing actually being modelled.
    const H = G.houthi;
    if (H && H.saudiIn) {
      if (H.saudiSince <= HOUTHIS.saudiGrace) {
        out.push([HOUTHIS.saudiDamp, 'Riyadh is flying its own war in the south']);
      } else {
        const over = H.saudiSince - HOUTHIS.saudiGrace;
        out.push([Math.min(HOUTHIS.saudiDragMax, HOUTHIS.saudiDrag * over),
          'Riyadh is fighting two wars and wanted neither']);
      }
    }
    return out;
  }

  const gulfRate = (drivers) => drivers.reduce((n, [amt]) => n + amt, 0);

  // Turns until this gauge fires at tonight's rate, or null if it is falling or
  // creeping too slowly to matter. Same rule as israelEta and for the same
  // reason: a null means two different things and they must not share a sentence.
  function gulfEta(which) {
    const rate = gulfRate(which === 'hawk' ? gulfHawkDrivers() : gulfDoveDrivers());
    if (rate <= 0.4) return null;
    const left = GULF.fly - (which === 'hawk' ? G.gulf.resolve : G.gulf.strain);
    const n = Math.ceil(left / rate);
    return n > 30 ? null : Math.max(1, n);
  }

  // What the next summit costs and buys. Depreciating on both sides, exactly
  // like asking Jerusalem to hold — the second reassurance is worth less than the
  // first and both capitals know it.
  function gulfSummitCost() {
    const n = G.gulf.summits;
    return {
      approval: Math.round(GULF.summitApproval * Math.pow(GULF.summitRamp, n)),
      relief: Math.round(-GULF.summitRelief * Math.pow(GULF.summitDecay, n)),
      left: Math.max(0, GULF.summitMax - n),
    };
  }

  // ---- the camps act ----
  // Called once a turn, after Tehran's salvo has been applied so tonight's
  // strike on Abqaiq is in tonight's argument, and before syncBasing so a caveat
  // filed tonight is checked against the tier tonight.
  function gulfTurn() {
    const events = [];
    G.gulf.resolve = clamp(G.gulf.resolve + gulfRate(gulfHawkDrivers()), 0, GULF.fly);
    G.gulf.strain = clamp(G.gulf.strain + gulfRate(gulfDoveDrivers()), 0, GULF.fly);

    // The doves file a caveat. Not a walkout — a narrowing, which takes a track
    // tonight and moves the cliff the whole tier stands on.
    if (G.gulf.strain >= GULF.fly && G.gulf.caveats < GULF.caveatMax) {
      G.gulf.caveats++;
      G.gulf.strain = GULF.doveAfter;
      G.gulf.tankers -= GULF.caveatTankers;
      const n = G.gulf.caveats;
      events.push({
        cls: 'world',
        title: `GULF PARTNERS FILE ${Txt.ordinal(n).toUpperCase()} OPERATING CAVEAT`,
        sum: `${Txt.plural(n, 'caveat')} on the ramps`,
        text: `Riyadh, Doha and Muscat have jointly narrowed what may be flown off their territory. ` +
          `It is not a withdrawal and they are careful to say so: the ramps stay open, the aircraft stay ` +
          `bedded down, and one more tanker track comes off tonight's plan. What it actually costs is ` +
          `further out. Gulf basing now falls the moment American standing abroad drops below ` +
          `${gulfFoldThreshold('gulf')} rather than ${BASING_TIERS.gulf.at}` +
          (n >= GULF.caveatMax
            ? ' — and that is as far as this council will go. There is no fourth caveat; the next thing they file is the withdrawal itself.'
            : ', and the council meets again.'),
        dTanker: -GULF.caveatTankers,
      });
    } else if (G.gulf.strain >= GULF.fly) {
      // Capped out. The gauge stays pinned rather than discharging into nothing,
      // so the panel keeps reading FULL and the president is not told an
      // argument was settled when it was only exhausted.
      G.gulf.strain = GULF.fly;
    }

    // The hawks pay. A ladder, once each, then a smaller standing dividend.
    if (G.gulf.resolve >= GULF.fly) {
      G.gulf.resolve = GULF.after;
      const gift = GULF.gifts.find(g => !G.gulf.gifts.includes(g.id));
      if (gift) {
        G.gulf.gifts.push(gift.id);
        if (gift.tankers) G.gulf.tankers += gift.tankers;
        if (gift.fighters) { G.alliedFighters += gift.fighters; syncFleetCaps(); }
        if (gift.bmd) G.bmdPool = Math.min(bmdCapacity(), G.bmdPool + Math.round(bmdCapacity() * gift.bmd));
        events.push({
          cls: 'friendly', title: gift.title, sum: 'Hawks commit',
          text: gift.text, dTanker: gift.tankers || 0,
        });
      } else {
        G.bmdPool = Math.min(bmdCapacity(), G.bmdPool + Math.round(bmdCapacity() * GULF.giftRepeat.bmd));
        events.push({
          cls: 'friendly', title: 'GULF PARTNERS RELEASE FURTHER INTERCEPTOR STOCK',
          sum: 'Hawks resupply the screen',
          text: 'Kuwait City and Abu Dhabi have released another tranche of interceptors to the theater ' +
            'stock. There is nothing ceremonial left to give and both governments know it; what they have ' +
            'is rounds, and rounds are what the screen is short of.',
        });
      }
    }
    return events;
  }

  // ============================================================
  // THE SOUTHERN FRONT
  // ------------------------------------------------------------
  // See HOUTHIS in data.js. Same shape as israelTurn and gulfTurn: a second
  // actor with its own clock, called once a turn, which mutates state and
  // RETURNS events rather than writing to the report, so the night's prose is
  // assembled in one place.
  //
  // The one structural difference from Jerusalem is that this whole function is
  // a no-op in three campaigns out of four, and has to be — a front that opens
  // every time is a difficulty setting, not a complication.
  // ============================================================
  const yemenTargets = () => TARGETS.filter(t => t.theater === 'yemen');

  // What the front can still do, on the 0..2 scale every arm in this game
  // reports on. It reads the two aimpoints and nothing else, which is the whole
  // of the counterplay: a night spent on Hodeidah has to be felt in tomorrow's
  // shipping roll or servicing it is decoration.
  function houthiStrength() {
    const y = yemenTargets();
    if (!y.length) return 0;
    return 2 * y.reduce((n, t) => n + t.hp / 100, 0) / y.length;
  }

  // Same curve and the same floor as bite() in ai.js, and here for the same
  // reason: through v1.63 an arm's casualties scaled with its condition and its
  // approval and oil bills did not, which made counterforce buy lives and
  // nothing else. A wrecked launch cell firing what it has left is still a hull
  // on fire and is never free.
  const houthiBite = (str) => Math.max(0.25, str / 2);
  const houthiScaled = (ev, str) => {
    const k = houthiBite(str);
    if (ev.dApproval) ev.dApproval = -Math.max(1, Math.round(Math.abs(ev.dApproval) * k));
    if (ev.dOil) ev.dOil = Math.max(1, Math.round(ev.dOil * k));
    if (ev.dStrain) ev.dStrain = Math.round(ev.dStrain * Math.max(0.55, k));
    return ev;
  };

  // Riyadh's own war, once it has one. Modelled on israelTurn's `service` and
  // deliberately better at it: an air force that has been flying this exact
  // campaign since 2015 finishes aimpoints a carrier air wing arriving cold does
  // not. The BDA is sharp because CENTCOM watched it happen.
  function rsafService(t, out) {
    const roll = Math.random();
    if (roll < HOUTHIS.saudiKill) damageTarget(t, 100);
    else if (roll < HOUTHIS.saudiDamage) damageTarget(t, wearsDown(t) ? PKG_DAMAGE : 50);
    else return false;
    out.push(`${t.name} ${t.status}`);
    G.intel[t.id] = { hp: t.hp, turn: G.turn, sharp: true };
    return true;
  }

  function houthiTurn() {
    const H = G.houthi;
    if (!H.active) return [];
    const events = [];

    // ---- whether they come in at all ----
    if (!H.entered) {
      if (G.turn < H.enterTurn) return [];
      // The one thing that stops this front existing, and it is counterforce
      // rather than luck: Ansar Allah is armed and targeted through the same
      // IRGC complex the proxy bill is denominated in. Checked once, tonight —
      // an IRGC rebuilt next week does not summon a war that already declined
      // to start, and one flattened next week does not end one that did.
      const irgc = TARGETS.find(t => t.id === 'irgc-hq');
      if (irgc && irgc.hp / 100 < HOUTHIS.entryIrgc) { H.active = false; return []; }

      H.entered = true;
      for (const t of yemenTargets()) { t.released = true; MapView.updateTarget(t); }
      // Reveals the strait indicator and the bottom-edge cue. Called with a
      // strait that is still OPEN on purpose: what the marker appearing says is
      // that this war has a second waterway in it now, which is a fact about
      // tonight and not a prediction about the lane.
      MapView.setMandab(G.mandab);
      // They announce themselves the way they actually would: with a salvo, and
      // onto Saudi soil. That is the first of the three the trigger counts, and
      // it is charged here rather than rolled so the entry night is never a
      // press release — the president learns what this front is by being shown
      // it working.
      H.saudiStruck = 1;
      events.push({
        cls: 'world',
        title: 'ANSAR ALLAH ENTERS THE WAR — SALVO INTO SOUTHERN SAUDI ARABIA',
        sum: 'A second front opens',
        text: 'Ansar Allah has declared itself a belligerent and opened with ballistic missiles and one-way ' +
          'drones into Jizan and the Asir highlands. Two Saudi air defense batteries engaged; the rest got ' +
          'through. CENTCOM assesses the launch cells are Iranian-supplied and Iranian-targeted, and that ' +
          'the movement has been waiting for a war large enough to join. Two aimpoints have been added to ' +
          'the plot — the strike cell above Sanaa and the port complex at Hodeidah — and both are in the ' +
          'wrong ocean for the Lincoln. The Red Sea deck is the only thing in range.',
        dOil: 4, dApproval: -1,
      });
      return events;   // they announce themselves, and nothing else tonight
    }

    const str = houthiStrength();

    // Both aimpoints on the bottom. The front does not surrender and it is not
    // deleted — it goes quiet, and `active` stays true so the panel keeps
    // reading rather than the whole thing vanishing from a war it was in. What
    // stops is the shooting, which is what servicing it was for.
    const spent = str <= 0;

    // ---- what they do while nobody is stopping them ----
    if (!spent) {
      if (Math.random() < HOUTHIS.shipping * houthiBite(str)) {
        // Zero has to be a real branch here: most of these are a hull holed and
        // a crew that got off, and a casualty count is the exception rather
        // than the rule. A prose function, not a string, because the number
        // appears in both places (see the rule above EV in ai.js).
        const dead = Math.random() < 0.35 ? Math.max(1, Math.round(rand(1, 4) * houthiBite(str))) : 0;
        events.push(houthiScaled({
          cls: 'world',
          title: 'MERCHANT HULL STRUCK IN THE BAB AL-MANDAB APPROACHES',
          sum: 'Another hull hit',
          text: (ev) => 'An anti-ship missile out of the Yemeni coast hit a bulk carrier in the southern Red Sea. ' +
            (ev.casualties
              ? `${Txt.plural(ev.casualties, 'crewman')} ${Txt.were(ev.casualties)} killed and the ship is ` +
                'under tow. '
              : 'The crew got off and the hull is under tow. ') +
            'Three more operators have suspended Red Sea transits and are routing round the Cape, which is ' +
            'three weeks and a war-risk premium on every barrel that takes the long way.',
          casualties: dead, dOil: 5, dApproval: dead ? -2 : 0, dStrain: 3,
        }, str));
      }

      if (Math.random() < HOUTHIS.saudi * houthiBite(str)) {
        H.saudiStruck++;
        const place = ['Jizan', 'Abha', 'Najran', 'Khamis Mushait'][rand(0, 3)];
        events.push(houthiScaled({
          cls: 'world',
          title: `HOUTHI SALVO INTO ${place.toUpperCase()}`,
          sum: 'Saudi soil hit again',
          // The counter is stated because it is the trigger, and a threshold the
          // player cannot see is a threshold that reads as the game deciding
          // things on its own.
          text: () => `Ballistic missiles and drones into ${place}, in the south of the kingdom. Saudi Patriot ` +
            'batteries took some of it. This is the ' + Txt.ordinal(H.saudiStruck) + ' salvo onto Saudi ' +
            'territory since Ansar Allah entered, and the Saudi defence ministry has stopped describing them ' +
            'as isolated.',
          dOil: 3, dStrain: 4,
        }, str));
      }

      // The strait, in two steps like Hormuz. Contested first — nobody shuts a
      // waterway with one missile — and the second step is deliberately the
      // easier of the two, because a lane insurers have already started pricing
      // out of is most of the way shut before anybody declares it.
      if (G.mandab !== 'CLOSED' && Math.random() < HOUTHIS.strait * houthiBite(str)) {
        const closing = G.mandab === 'CONTESTED';
        events.push(houthiScaled({
          cls: 'world',
          title: closing ? 'BAB AL-MANDAB CLOSED TO COMMERCIAL TRAFFIC' : 'BAB AL-MANDAB CONTESTED',
          sum: closing ? 'The southern strait is shut' : 'The southern strait is contested',
          text: closing
            ? 'The underwriters have withdrawn cover for the strait entirely and the major lines have stopped ' +
              'booking it. Bab al-Mandab is shut in every sense that matters commercially. It is not Hormuz — ' +
              'there is a way round the bottom of Africa and the cargo will get there — but it will get there ' +
              'three weeks late, and Suez is now a canal with nothing to feed it.'
            : 'Two more attempts on shipping in the strait, one of them on a US-flagged hull. Transits are ' +
              'continuing under naval escort and at a quarter of the usual rate. The lane is not shut. It is ' +
              'also not open in any way an underwriter recognises.',
          mandab: closing ? 'CLOSED' : 'CONTESTED',
          dOil: closing ? 9 : 4, dStrain: closing ? 6 : 3,
        }, str));
      }
    }

    // ---- the strait comes back ----
    // Only once the launch cells have actually been worked over. There is no
    // negotiated reopening here the way there is with Hormuz: nobody in this war
    // has a phone number for Sanaa, so the lane reopens when the thing shooting
    // at it stops and not before.
    if (G.mandab !== 'OPEN' && (spent || str < 1) && Math.random() < HOUTHIS.reopen) {
      events.push({
        cls: 'friendly',
        title: 'BAB AL-MANDAB REOPENS TO COMMERCIAL TRAFFIC',
        sum: 'The southern strait reopens',
        text: 'With the coastal launch cells worked over and the attack tempo down, the underwriters have ' +
          'restored cover for the strait and the first convoys are through. The lines are booking Suez again. ' +
          'The rates are not what they were and will not be for months, but the cargo is moving the short way.',
        mandab: 'OPEN', dOil: -7,
      });
    }

    // ---- Riyadh decides it is their war ----
    if (!H.saudiIn && (H.saudiStruck >= HOUTHIS.saudiStrikes || G.mandab === 'CLOSED')) {
      H.saudiIn = true;
      H.saudiSince = 0;
      const why = G.mandab === 'CLOSED' && H.saudiStruck < HOUTHIS.saudiStrikes
        ? 'with the strait shut and the kingdom\'s own Red Sea ports behind it'
        : `after ${Txt.plural(H.saudiStruck, 'salvo')} onto its own territory`;
      events.push({
        cls: 'friendly',
        title: 'SAUDI ARABIA COMMITS THE RSAF AGAINST ANSAR ALLAH',
        sum: 'Riyadh joins the southern war',
        text: `Riyadh has ordered the Royal Saudi Air Force back over Yemen ${why}. F-15S and Typhoon ` +
          'squadrons are generating out of King Khalid at Khamis Mushait, forty miles off the border, and ' +
          'they will fly the southern aimpoints without asking CENTCOM for a slot on the tasking order. ' +
          'This is the government that has spent the whole war telling you to end it, and it has just ' +
          'opened a second one. Nobody in the council believes that costs nothing — least of all Riyadh, ' +
          'which spent nine years in this war and got out of it exactly once.',
        dApproval: HOUTHIS.saudiApproval, dWorld: HOUTHIS.saudiWorld,
      });
    }

    // ---- and then flies it ----
    if (H.saudiIn) {
      H.saudiSince++;
      const avail = yemenTargets().filter(t => t.hp > 0)
        .sort((a, b) => a.hp - b.hp)
        .slice(0, HOUTHIS.saudiAimpoints);
      // Every other night, and only if there is something left standing. The
      // cadence is what keeps this an ally rather than a second American
      // squadron the president got for free.
      if (avail.length && H.saudiSince % HOUTHIS.saudiEvery === 0) {
        H.saudiSorties++;
        const hits = [];
        for (const t of avail) rsafService(t, hits);
        const nth = H.saudiSorties > 1 ? ` — ${Txt.ordinal(H.saudiSorties).toUpperCase()} NIGHT` : '';
        events.push({
          cls: 'friendly',
          title: `RSAF PACKAGE FLOWN AGAINST THE SOUTHERN AIMPOINTS${nth}`,
          sum: hits.length ? 'Riyadh works the south' : 'Riyadh flew, and missed',
          outcome: hits.length ? 'damaged' : 'miss',
          text: hits.length
            ? `Saudi aircraft worked the Yemeni coast overnight out of Khamis Mushait. Assessed effects: ` +
              `${hits.join('; ')}. It is effects CENTCOM did not spend a package to buy, on a front the ` +
              `Lincoln cannot reach.`
            : 'Saudi aircraft worked the Yemeni coast overnight out of Khamis Mushait and came off the ' +
              'aimpoints without assessable effect. They will go again.',
          alliedStrike: hits.length > 0, allyOf: 'saudi',
          alliedTargets: avail.map(t => t.id),
        });
      }
    }

    return events;
  }

  const resKey = (asset) => asset === 'fighter' ? 'fighters' : asset;
  const assetProfile = (asset) => AIR_ASSETS[asset] || AIR_ASSETS.cruise;

  // What a package is actually drawn from. Everything on the board comes out of
  // a ready magazine indexed by tier — except the submarine shot, which comes
  // out of the boat's own torpedo room and touches no theater stock at all.
  // It still flies as `cruise` for the strike math: an Mk-48 against a hull is
  // the same arithmetic as a maritime-strike Tomahawk, unseen and unopposed.
  //
  // The escort screen's rounds are the third case. An escort package IS a
  // `cruise` package for every purpose the strike math has — it leaves a deck,
  // nobody is aboard it, and the SAM belt does not touch it — but the round
  // comes out of a magazine of its own rather than out of the Tomahawk
  // reservoir, and which magazine is the entire decision:
  //   sm6 — the Mk 41 cells, which is to say `bmdPool`, which is to say the
  //         umbrella over Al Udeid and Al Dhafra. One magazine, two missions,
  //         and the president chooses tonight which one it is for.
  //   nsm — eight deck canisters and nothing after that until the ammunition
  //         ship, which is a smaller number than it looks next to a four-shot
  //         package.
  // Neither is bounded by `res.cruise`, and that is deliberate rather than an
  // oversight. `res.cruise` is not "the screen can shoot tonight" — it is what
  // is CANISTER-LOADED WITH TOMAHAWKS (see the note on tlamPool, and the clamp
  // in syncFleetCaps that pins it to the reservoir). Reading it here would mean
  // a war that has fired its last Tomahawk cannot fire an interceptor either,
  // which is two different magazines wearing one number. The magazine IS the
  // limiter for these: eight canisters for the whole campaign, and for SM-6 an
  // umbrella the president is going to want back.
  const escortPool = (pkg) => pkg.escort === 'sm6' ? (G.bmdPool ?? 0)
    : pkg.escort === 'nsm' ? (G.nsmPool ?? 0) : Infinity;

  const pkgStock = (pkg) => pkg.sub ? (G.torpedoes ?? 0)
    : pkg.escort ? escortPool(pkg)
    : (G.res[resKey(pkg.asset)] ?? 0);

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
  // THE PRECISION MUNITIONS STOCK
  // ------------------------------------------------------------
  // What the theater has left to drop, as opposed to what it has left to fly.
  // Until v1.77 those were the same question: the ready magazine topped itself
  // off every night, so a wing that had been fighting for three weeks was as
  // well supplied as one that had been fighting for one, and the only weapons
  // in the game with a campaign floor were the ones fired by ships.
  //
  // IT IS KEPT ON HARD AND NOWHERE ELSE, and `pgmLedger` is the switch rather
  // than a very large number, so easy and normal are not "a war with a stock
  // too big to bind" — they are a war with no stock at all, byte for byte the
  // same simulation they were before this existed. That is a testable claim
  // and it is meant to be tested.
  //
  // The stock only ever refills off FORCE_FLOW: weapons arrive in ships, in
  // bulk, on a schedule the president does not set. What that buys is a second
  // reason the buildup matters and a real cost to the heavy bomber — a B-1 is
  // the cheapest aimpoint in the game measured in packages and the dearest by
  // six times measured in bombs.
  const pgmLedger = () => (diff().pgm || 0) > 0;
  const pgmCost = (pkg) => pkg.sub ? 0 : (assetProfile(pkg.asset).pgm || 0) * pkg.qty;

  // Why this package cannot be built up tonight, or null. Same contract as
  // pkgBlock — one sentence the dialog and the panel both print.
  function pgmBlock(pkg) {
    if (!pgmLedger()) return null;
    const need = pgmCost(pkg);
    if (need <= (G.pgm ?? 0)) return null;
    return `Insufficient precision munitions in theater — this package needs ${Txt.plural(need, 'weapon')} ` +
      `and the depots hold ${G.pgm ?? 0}. The next munitions shipment is on the force flow.`;
  }

  // How thin the stock is, for the panel and the advisors. Measured against
  // what a single night of fighting actually costs rather than against the
  // opening load, because "34% remaining" says nothing and "two nights"
  // is the sentence a logistician would say out loud.
  const pgmNights = () => {
    if (!pgmLedger()) return Infinity;
    const perNight = Math.max(1, atoSlots() * PGM_NIGHT);
    return (G.pgm ?? 0) / perNight;
  };

  // ============================================================
  // THE TASKING ORDER
  // ------------------------------------------------------------
  // How many packages tonight's plan holds, and what it costs to fly past it.
  // See ATO in data.js for why any of this exists — the short version is that
  // until v1.28 a package was the only thing in the game with no price on it.
  //
  // The plan grows with the force flow and shrinks with crew-rest debt, and it
  // never reaches zero: a president who surged four nights running still gets
  // to hit something tonight. A plan of nothing is a turn the player watches.
  //
  // THE PLAN IS A DOCUMENT, NOT A RUNNING TOTAL. It is written once, at the turn
  // boundary, against the debt as it stands then — and it does not move again
  // until tomorrow. Computing it live off `G.fatigue` looks equivalent and is
  // not: the fourth package accrues debt, which shrinks the plan it is being
  // measured against, so the fifth is suddenly three past a plan of two instead
  // of two past a plan of three. The surge accelerates mid-night, the wall
  // arrives four packages early, and the planning modal quotes the player a
  // multiplier that is wrong by the time they authorize the next one. The bill
  // for a late frag lands on TOMORROW's plan. That is the whole mechanic.
  // ============================================================
  // An Israel inside the tasking order is worth half a package a night: IAF
  // escort and SEAD flying the corridor is work the CAOC otherwise has to frag
  // American aircraft for. It is the only ally contribution that touches the
  // plan rather than the magazine, which is why coordinating is a decision about
  // tempo and not just about capability.
  function planSize(fatigue) {
    const flown = G.forceFlow.landed.length;
    const ally = G.israelPosture === 'coordinated' ? ISRAEL.coordSlots : 0;
    return Math.max(1, Math.floor(ATO.base + flown * ATO.perFlow + ally - (fatigue || 0)));
  }

  // Tonight's plan as written. The fallback covers the opening turn, before any
  // turn boundary has run to write one.
  function atoSlots() {
    return G.atoPlan || planSize(G.fatigue);
  }

  // How far past the plan the NEXT package would be: 0 inside the tasking order,
  // 1 for the first late frag, and up from there. Everything that prices a surge
  // reads this one function, so the number in the planning modal and the number
  // in the strike math cannot drift apart.
  //
  // The boat is not on the tasking order. A submarine attack is planned aboard
  // the submarine: it spends no theater magazine, books no fuel, and teaches
  // Iran nothing (see executeStrike). The CAOC does not frag her, so the CAOC's
  // plan does not bind her — and her torpedo room is its own hard limit anyway.
  function atoOver(pkg) {
    if (pkg && (pkg.sub || pkg.asset === 'cruise')) return 0;
    return Math.max(0, G.strikesThisTurn - atoSlots() + 1);
  }

  // The wall above the plan. Not a refusal to fly a surge — the surge is the
  // whole point — but the end of the surge: at some hour the wing has no rested
  // crew and no turned aircraft left, and the answer is tomorrow.
  function atoWall() {
    const slots = atoSlots();
    if (G.strikesThisTurn < slots + ATO.ceiling) return null;
    return `TASKING ORDER CLOSED — ${G.strikesThisTurn} packages have gone out tonight against a plan ` +
      `of ${slots}. Everything past the plan has been flown by crews who were briefed on the ramp, ` +
      `and there is nothing left to turn around. The staff is writing tomorrow's ATO; the rest of ` +
      `this target list is on it.`;
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
    // The tasking order is checked first because it is the answer for every
    // tier equally — a plan that is spent is spent whether the belt is up or
    // down and whether the 509th is on the ramp or in Missouri. It is also the
    // only one of these that fixes itself by ending the turn, which is exactly
    // what the player should do about it.
    if (!pkg.sub && pkg.asset !== 'cruise') {
      const wall = atoWall();
      if (wall) return wall;
    }
    // ---- the escort screen's own shot ----
    // Everything the screen fires is a short-legged weapon off a deck that has
    // to be forward to fire it: NSM is a 100 nm round and SM-6 an air-defense
    // interceptor being used out to about 200. A deck standing off in the Arabian
    // Sea has the reach for none of it, which is the same forward-presence term
    // bmdRate already reads — so posture buys the umbrella and the offensive
    // rounds together, and the rearm order takes both away for the same three
    // nights. Each refusal names its own cause: an empty magazine waits for the
    // ammunition ship, a deck standing off waits for an ORDER, and those are
    // different problems with different answers.
    if (pkg.escort) {
      const w = MARITIME_WEAPONS[pkg.weapon] || {};
      if (bmdRearming()) {
        return `SCREEN ALONGSIDE THE AMMUNITION SHIP — the escorts are rearming and off station. ` +
          `${w.name || 'The round'} is a deck-launched weapon and there is no deck on station to launch it from.`;
      }
      if (navalForward() <= 0) {
        return `NO DECK FORWARD — ${w.name || 'this round'} is fired by the escort screen, and the screen ` +
          'is standing off with the carrier. Order the deck forward from THEATER FORCES; the round has ' +
          'neither the legs nor the datalink to reach from the Arabian Sea.';
      }
      if (escortPool(pkg) < pkg.qty) {
        return pkg.escort === 'sm6'
          ? 'INTERCEPTOR CELLS SHORT — an SM-6 surface engagement comes out of the same magazine that ' +
            'covers Al Udeid and Al Dhafra, and there are not enough rounds left in the cells to build ' +
            'this shot. Rearming is the only way to put them back.'
          : 'NSM CANISTERS EMPTY — the screen sailed with eight rounds in the deck launchers and nobody ' +
            'reloads a canister underway. They come back alongside the ammunition ship and not before.';
      }
    }
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
        ? `HEAVY BOMBER FORCE EN ROUTE — ${G.heavyEta} turn${G.heavyEta === 1 ? '' : 's'} from the Fairford ramp.`
        : 'HEAVY BOMBER FORCE NOT IN THEATER — the B-1s and B-52s are in CONUS and have to be called forward.';
    }
    // The 509th needs the same sentence the heavies get, and needs it more. A
    // B-2 package with nothing behind it otherwise falls through to the strike
    // modal's bare "MAGAZINE SHORT", which is true and useless: an empty
    // magazine waits for the turn, but a wing still sitting in Missouri waits
    // for an ORDER, and it is the only thing on the board that opens Fordow.
    // This is the first wall a new player hits — the primary objective is a
    // penetrator target, so the very first click of the campaign lands here.
    if (pkg.asset === 'stealth' && !G.bombersArrived) {
      return G.bombersOrdered
        ? `B-2 FORCE EN ROUTE — ${G.bomberEta} turn${G.bomberEta === 1 ? '' : 's'} from Diego Garcia.`
        : 'B-2 FORCE NOT IN THEATER — the 509th is at Whiteman AFB and has to be called forward. ' +
          'Order it from THEATER FORCES; it is one turn out, and the GBU-57 is the only weapon in ' +
          'the inventory that reaches a buried hall.';
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

  // ---- WHAT A PACKAGE IS WORTH ON THIS LEVEL — DIFFICULTY.strike ----
  // Only easy sets it, and the argument for it is written out at length beside
  // the table in data.js. The short version is that this is the level where one
  // signature IS the night: a president who signs one course of action and can
  // sign no second one has to get a night's work out of it, and through v1.92
  // they got exactly what a hard player got out of a package they could freely
  // fly a fourth of. It scales with the force flow because that is the one place
  // the buildup can be FELT on a level with no tasking-order gauge to read it
  // off — six waves take a package from 1.45× to a little under 2×, which is the
  // same shape ATO.perFlow gives every other level and paid in weight rather
  // than in slots.
  //
  // Two rules. It multiplies `damage` and lifts the success band and touches
  // nothing else, so a heavier package is still flown into the same SAM belt at
  // the same risk to the same aircrew and costs the same abroad — what changed
  // is what it does to the building. And it never reads `G.turn`: a war that
  // lost the ramps and stalled the force flow does not get the heavier packages
  // either, which keeps world opinion the thing paying for the buildup.
  function strikeScale() {
    const s = diff().strike;
    if (!s) return { dmg: 1, edge: 0 };
    const flown = G.forceFlow.landed.length;
    return { dmg: s.base + flown * (s.perFlow || 0), edge: s.edge || 0 };
  }

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
    // What it costs to fly outside the tasking order (see ATO in data.js). A
    // late frag is a package the staff had thirty-six hours less to plan: a
    // hasty target study, whatever tanker happens to be airborne, and a crew
    // that was briefed on the ramp. Kept as its own term rather than folded
    // into adPenalty, because the planning modal names each penalty out loud
    // and "air defenses degrade this package" is the wrong sentence for it.
    const over = atoOver(pkg);
    const surge = over * ATO.surgeEffects;
    const surgeLoss = 1 + over * ATO.surgeLoss;
    const dmgBonus = target.hp < 100 ? 0.15 : 0;
    // What Iran has learned about the way this campaign is being flown. Fly one
    // platform into the ground and this is the bill for it (see IranAI.adaptStep).
    // Nothing is learned from a submarine attack: decoys and dispersal are an
    // answer to weapons somebody saw coming, and nobody has ever seen this one.
    const adaptPenalty = pkg.sub ? 0 : IranAI.adaptPenalty(pkg.asset);
    // what a package is worth on this level (see strikeScale). `edge` goes in
    // beside dmgBonus rather than onto pkg.base, so it is still bounded by the
    // same clamp and a package flown raw into a live belt does not get it back.
    const lvl = strikeScale();
    const success = clamp(pkg.base - adPenalty - adaptPenalty - surge + dmgBonus + lvl.edge, 0.05, 0.95);
    // A packed bomber cell over a live SAM belt is not a risk, it is a funeral —
    // hence the higher cap when the tier is being flown outside its phase.
    //
    // The `attrition` term is added OUTSIDE the air-defense multiplier on
    // purpose: it is the floor, the part of the risk that suppressing the belt
    // does not buy back (see AIR_ASSETS). Without it this whole expression
    // multiplies by ad and a campaign that has taken the SAM sites down is
    // flying unmanned aircraft with people in them.
    //
    // The surge multiplier is applied to the WHOLE expression, attrition floor
    // included. A late frag does not only fly into more missiles — it flies
    // tired, at the end of a cycle, off a plan written in an hour, and the
    // things that kill aircrew with the belt already down are exactly the
    // things fatigue makes worse.
    const lossRisk = clamp(((prof.attrition || 0) + prof.loss * ad * (raw ? RAW_LOSS : 1)) * surgeLoss,
      0, raw ? 0.70 : 0.35);
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
      over, surge, surgeLoss, slots: atoSlots(),
      fullOdds: success * (oneShot ? 1 : gradual ? 0.5 : 0.6),
      // Scaled only for sites that wear down. A buried hall moves in whole steps
      // and a hull is on the bottom or she is not, so there is no such thing as
      // a heavier package against either — multiplying `50` there would be a
      // number nothing reads pretending to be firepower.
      damage: gradual ? pkgDamage(pkg) * lvl.dmg : 50,
      tanker: tankerCost(target, pkg),
    };
  }

  // Strikes take time. Authorizing a package commits the assets and puts the
  // mission IN FLIGHT: fighter and TLAM packages arrive at the end of this
  // turn; B-2s transiting from Diego Garcia take two turns. BDA comes back
  // with the battle report — you commit, then you wait.
  //
  // v1.19: the heavies came off the two-turn clock and now land the same night
  // they are tasked. The Fairford leg is real, but it was buying the wrong
  // thing. A B-2 costs two turns because it is the *only* key for Fordow — the
  // wait is the price of the one weapon that has no substitute, and the player
  // is meant to feel it. The heavies are tonnage, and tonnage that answers two
  // turns after you ask for it is tonnage the player stops asking for: by the
  // time the cell arrived the air picture had moved, the target had been
  // re-serviced by fighters, and the reward for winning air superiority read as
  // a delay. Same-turn TOT makes the heavies what phase three is supposed to
  // feel like — you say flatten it, and tonight it is flat.
  //
  // v1.79: the submarine shot came off its own two-turn clock for the same
  // reason. Toledo is already trailing the hull; the transit was the only price
  // attached to a weapon that spends no magazine, no fuel and no aircrew, and a
  // price with nothing on the other side of it is a tax. The B-2 is now the
  // only package in the game that costs a turn.
  const MISSION_ETA = { f35: 1, fighter: 1, cruise: 1, stealth: 2, heavy: 1 };

  // `coaId` is set only when the package is a leg of a staffed course of action
  // (see takeCoa). It is carried on the mission so the panel can say which
  // option is already flying and so scrubbing the last leg puts that option
  // back on the table — nothing about the strike itself reads it.
  function executeStrike(target, pkg, coaId) {
    if (G.over || busy()) return;
    if (pkgStock(pkg) < pkg.qty) return;
    // ...and a package nobody can build up is not a package
    if (pgmBlock(pkg)) return;
    // a launcher group nobody has found is not a target, and a deep target is
    // not reachable without the northern tanker tracks
    if (target.type === 'tel' && (!target.dispersed || !target.located)) return;
    // ...and a site that is still a box on the plot is not an aimpoint
    if (target.covert && !target.found) return;
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
    } else if (pkg.escort === 'sm6') {
      // The interesting one. No Tomahawk left the ship and no ready launcher was
      // spent — what came out is the umbrella over Al Udeid and Al Dhafra, two
      // rounds of it, at the shoot-shoot rate the screen engages everything else
      // at (NAVAL_BMD.perTrack). One magazine, two missions.
      G.bmdPool = Math.max(0, (G.bmdPool || 0) - pkg.qty);
    } else if (pkg.escort === 'nsm') {
      G.nsmPool = Math.max(0, (G.nsmPool || 0) - pkg.qty);
    } else {
      G.res[resKey(pkg.asset)] -= pkg.qty;
      if (pkg.asset === 'cruise') G.tlamPool = Math.max(0, (G.tlamPool || 0) - pkg.qty);
    }
    // the bombs themselves, where anyone is counting them
    if (pgmLedger()) G.pgm = Math.max(0, (G.pgm ?? 0) - pgmCost(pkg));
    G.tankers -= cost;

    // the joint option is one-shot: committing it against either site spends it
    if (pkg.joint) { G.israelJointAvailable = false; syncJointPackages(); }

    // every package is logged by platform: this is what Iran adapts to. The
    // submarine shot is not logged at all — she is never held on sonar, and a
    // pattern nobody can observe is a pattern nobody can counter.
    if (!pkg.sub) G.adapt[pkg.asset] = (G.adapt[pkg.asset] || 0) + 1;

    // The bill for a late frag lands on tomorrow's plan, not tonight's: the
    // crews flying it are the crews who were going to fly tomorrow. Read BEFORE
    // the counter moves, so it is the same `over` computeStrike just priced and
    // the same one the planning modal warned about.
    if (atoOver(pkg) > 0) {
      G.fatigue = Math.min(ATO.maxFatigue, (G.fatigue || 0) + ATO.fatiguePerSurge);
    }
    if (pkg.asset !== 'cruise') G.strikesThisTurn++;
    G.stats.strikes++;
    // `turn` and the two charges are carried on the mission so a recall can hand
    // back exactly what this package cost rather than what a package costs
    // tonight — the tanker plan and the tasking order are both rewritten at the
    // turn boundary, and a refund computed later would be a different number.
    // and who is flying it. Drawn here rather than at time-on-target because
    // the whole point of the roster is that the player reads the names on the
    // ORDER — a crew assigned at resolution is a crew nobody ever saw. The ids
    // ride on the mission for the same reason `tanker` and `surge` do: a recall
    // hands back exactly what this package booked (see recallMission), and the
    // shootdown needs to know who was actually up there.
    const crew = Aircrew.frag(G, pkg);
    G.missions.push({
      targetId: target.id, pkg: { ...pkg }, eta: pkg.eta || MISSION_ETA[pkg.asset],
      turn: G.turn, tanker: cost, surge: atoOver(pkg) > 0, coa: coaId || null,
      crew,
    });
    AudioSys.play('targetMarked');
    UI.renderAll(G);
    Save.write();
  }

  // ============================================================
  // SCRUBBING A PACKAGE
  // ------------------------------------------------------------
  // Until the turn is ended, tonight's order is a document. The frag has been
  // written, the crews have been briefed, and nothing has rolled — so a package
  // can be struck off it and everything it booked comes back whole: the
  // airframes, the fuel, the crew-rest debt a late frag accrued, the slot on the
  // tasking order, and the joint option if it was committed. The aircraft was
  // never launched, so Iran never saw it either and the adaptation counter that
  // logs platforms is rolled back with the rest.
  //
  // The line is the TURN, not the ETA, and it is a real line rather than a
  // convenience. A B-2 fragged last night is nine hours into the Indian Ocean
  // with a tanker plan built around it; that mission is airborne and it is not
  // coming back because the president changed their mind. What this exists for
  // is the misclick and the reconsidered order — which, on a board where a
  // package is the scarcest thing there is, should not cost a night.
  function recallMission(idx) {
    if (G.over || busy()) return false;
    const m = G.missions[idx];
    if (!m || m.turn !== G.turn) return false;
    const pkg = m.pkg;

    // The magazine goes back exactly as it was drawn. No clamp against `caps`:
    // capacity is only ever rewritten at the turn boundary, so anything handed
    // back this turn came out of this turn's pool, and a clamp here could only
    // ever destroy sorties the player still owns.
    if (pkg.sub) G.torpedoes = (G.torpedoes ?? 0) + pkg.qty;
    // ...and the escort's rounds go back in the cells they came out of. These
    // two ARE clamped, unlike everything else here, because they are the only
    // magazines on the board that something other than the turn boundary can
    // fill: the rearm order tops both to capacity, so a scrub after a rearm
    // could otherwise hand rounds back into a full screen and leave the
    // umbrella reading over 100%.
    else if (pkg.escort === 'sm6') G.bmdPool = Math.min(bmdCapacity(), (G.bmdPool || 0) + pkg.qty);
    else if (pkg.escort === 'nsm') G.nsmPool = Math.min(NSM_LOAD, (G.nsmPool || 0) + pkg.qty);
    else {
      G.res[resKey(pkg.asset)] += pkg.qty;
      if (pkg.asset === 'cruise') G.tlamPool = (G.tlamPool || 0) + pkg.qty;
    }
    // weapons that were never built up go back on the rack. No clamp against
    // the opening load for the same reason the magazine has none: the stock is
    // only ever added to at the turn boundary, so anything handed back tonight
    // came out of tonight's holding.
    if (pgmLedger()) G.pgm = (G.pgm ?? 0) + pgmCost(pkg);
    G.tankers = Math.min(G.tankerCap || tankerCapacity(), G.tankers + (m.tanker || 0));
    if (pkg.joint) { G.israelJointAvailable = true; syncJointPackages(); }
    if (!pkg.sub) G.adapt[pkg.asset] = Math.max(0, (G.adapt[pkg.asset] || 0) - 1);
    // the debt this package charged against tomorrow, and only this one: a
    // surge flown earlier tonight was still flown
    if (m.surge) G.fatigue = Math.max(0, (G.fatigue || 0) - ATO.fatiguePerSurge);
    if (pkg.asset !== 'cruise') G.strikesThisTurn = Math.max(0, G.strikesThisTurn - 1);
    G.stats.strikes = Math.max(0, G.stats.strikes - 1);
    // nobody flew a package that never launched, so the sortie comes back off
    // their count too — the panel must not credit a night that did not happen
    Aircrew.unfrag(G, m.crew);

    G.missions.splice(idx, 1);
    AudioSys.play('cable');
    UI.renderAll(G);
    Save.write();
    return true;
  }

  // ============================================================
  // THE ELECTROMAGNETIC HALF OF THE NIGHT
  // ------------------------------------------------------------
  // See EW in data.js for the design and DIFFICULTY.ew for who is offered it.
  // What lives here is the ORDER — the three profiles, their price, and the
  // one roll the network attack makes.
  //
  // A JAM IS NOT ON G.missions AND CANNOT BE SCRUBBED, and that is a
  // deliberate exception to the invariant that tonight's order is a document
  // until the turn ends. recallMission exists to hand back exactly what a
  // package booked; a jam books something no refund can reach. It is not an
  // aircraft flying to an aimpoint, it is the electromagnetic condition of the
  // night, and every other package on tonight's order was planned and priced
  // against a suppressed belt. Handing it back would silently re-price
  // missions already fragged. So it resolves immediately, the panel says
  // plainly that it cannot be recalled, and the price is stated before the
  // press rather than discovered after it.
  //
  // THERE IS NO SEQUENCING TRAP AND NOTHING HERE GUARDS AGAINST ONE.
  // resolveImpact calls computeStrike at RESOLUTION, so tonight's suppression
  // covers every package landing tonight whatever order they were fragged in.
  // The only thing read at frag time is pkgBlock's gate — and hard is the only
  // level with these orders and hard sets softGate, so that gate never refuses
  // anything here anyway.
  // ============================================================
  const ewSpec = (id) => EW.missions.find(m => m.id === id) || null;

  // Is this level doing its own jamming? The others have it flown for them and
  // are never offered the orders (DIFFICULTY.ew).
  function ewOrders() {
    const cfg = diff().ew;
    return !!(cfg && cfg.orders);
  }

  // The odds a network attack lands, given what has already been burned. Read
  // during a render — see the purity note on ewState — so it must never roll.
  function ewNetworkOdds() {
    const spec = ewSpec('network');
    if (!spec) return 0;
    const burn = (G.ew && G.ew.burn) || 0;
    return Math.max(spec.floor, spec.odds - burn * spec.burnStep);
  }

  // What the panel reads.
  //
  // PURE. This runs on every renderSidebar draw, so a Math.random() in here
  // makes the campaign depend on how many times the player opened a drawer,
  // and a write to G makes it depend on how many times it was DRAWN. That is
  // not a hypothetical: coaScore called carrierRisk() — the resolver — from
  // v1.77 to v1.81, rolling and consuming the telegraphed anti-ship shot during
  // a render, and nothing caught it because nothing looked. ew.js asserts a
  // signature of G and TARGETS either side of twenty-five calls and a counter
  // round Math.random.
  function ewState() {
    const flown = ewSpec(G.ew && G.ew.id);
    const belt = airDefenseWeight(true);
    const wall = atoWall();
    return {
      orders: ewOrders(),
      // the standing jam, on the levels that fly one without being asked
      auto: ewOrders() ? 0 : ewSuppression(),
      flown: flown ? { id: flown.id, name: flown.name, short: flown.short,
        sup: G.ew.sup, hit: G.ew.hit } : null,
      burn: (G.ew && G.ew.burn) || 0,
      belt,
      missions: EW.missions.map(m => {
        const tanker = m.tanker || 0;
        // Each refusal names its own cause, because they are three different
        // problems and the player fixes them three different ways: the wall
        // waits for tomorrow, the fuel waits for the turn, and a jam already
        // flown waits for nothing at all.
        const blocked = !ewOrders() ? 'Not this level\'s decision — CENTCOM flies the jamming.'
          : G.ew.id ? 'ONE ELECTRONIC WARFARE MISSION A NIGHT — the Growlers are already committed.'
          : wall ? wall
          : G.tankers < tanker ? 'TANKER PLAN SPENT — there is no fuel left airborne to hold a jamming orbit.'
          : null;
        return {
          id: m.id, name: m.name, short: m.short, desc: m.desc,
          sup: m.sup, tanker,
          // the loss roll the escort jam would actually make tonight, off the
          // belt that is STANDING — a jammer is not protected by its own jamming
          loss: m.loss ? m.loss * (AD_SITES ? belt / AD_SITES : 0) : 0,
          odds: m.id === 'network' ? ewNetworkOdds() : 1,
          failSup: m.failSup || 0,
          blocked,
        };
      }),
    };
  }

  // The order. The only impure thing in here.
  function orderEw(id) {
    if (G.over || busy()) return;
    if (!ewOrders()) return;
    if (G.ew.id) return;                       // one a night
    const spec = ewSpec(id);
    if (!spec) return;
    const tanker = spec.tanker || 0;
    if (G.tankers < tanker) return;
    if (atoWall()) return;

    // The price. A slot off the tasking order — read by atoOver, so a jam
    // genuinely pushes the rest of the night toward the late-frag penalties
    // and the wall — and fuel in the air, booked like any other package.
    G.tankers -= tanker;
    G.strikesThisTurn++;

    const events = [];
    let sup = spec.sup, hit = true;

    if (id === 'network') {
      // Rolled ONCE, here, at the order — never in ewState. The access is
      // spent whether or not it worked, which is what `burn` counts.
      const p = ewNetworkOdds();
      hit = Math.random() < p;
      G.ew.burn++;
      sup = hit ? spec.sup : spec.failSup;
      if (hit) {
        const relief = IranAI.ewNetworkHit(G);
        if (relief) events.push(relief);
      }
    }

    G.ew.id = id;
    G.ew.sup = sup;
    G.ew.hit = hit;

    events.unshift(ewReport(spec, sup, hit));

    // The escort jam is the one with people inside the rings. The roll is off
    // the belt that is STANDING rather than the suppressed reading — a jammer
    // does not shelter under its own jamming — and the loss goes through the
    // same csar.js path a shot-down strike aircraft does, because a roster
    // entry is a SEAT and the two-seat pairing is what csar's partial-recovery
    // branch is built on. Inventing a second casualty path here would break it.
    if (spec.loss > 0) {
      const risk = spec.loss * (AD_SITES ? airDefenseWeight(true) / AD_SITES : 0);
      if (risk > 0 && Math.random() < risk) {
        // an escort jammer goes down over the belt it was penetrating, which
        // also gives the recovery somewhere real to run to
        const site = TARGETS.filter(t => t.type === 'airdefense' && t.hp > 0)
          .sort((a, b) => (wt(b) * b.hp) - (wt(a) * a.hp))[0];
        if (site) {
          const pkg = { asset: 'fighter', qty: 1, label: 'EA-18G Growler' };
          const crew = Aircrew.frag(G, pkg);
          const loss = CSAR.aircraftDown(site, { pkg, crew });
          G.stats.aircraftLost++;
          const ev = {
            cls: 'iran', title: 'ELECTRONIC ATTACK AIRCRAFT LOST', internal: true,
            sum: 'Growler down over the belt', outcome: 'miss',
            aircraftLost: true,
            dApproval: movePublic(-4),
            text: 'The jamming aircraft was inside the engagement rings when the shot came. ' + loss.text,
          };
          if (loss.casualties) {
            G.casualties.us += loss.casualties;
            ev.casualties = loss.casualties;
          }
          events.push(ev);
          AudioSys.play('aircraftLost', 600);
        }
      }
    }

    G.stats.ewMissions = (G.stats.ewMissions || 0) + 1;
    UI.showReport('ELECTRONIC WARFARE', events);
    UI.renderAll(G);
    Save.write();
  }

  // What the president is told. Internal traffic in every branch — a jamming
  // orbit is not something CENTCOM announces and not something Iran admits to,
  // so none of this belongs on the press ticker (see headlines in ai.js).
  function ewReport(spec, sup, hit) {
    const pct = Math.round(sup * 100);
    if (spec.id === 'network' && !hit) {
      return {
        cls: 'iran', title: 'NETWORK ATTACK — ACCESS COLD', internal: true,
        sum: 'Access burned, little suppression', outcome: 'miss',
        text: (ev) => 'The access was not there. Either they had already closed it or they were waiting to see ' +
          'who walked through it, and the effects never reached the engagement radars. The aircraft went in ' +
          'configured to exploit a network that stayed up, which is worth less tonight than if they had simply ' +
          `been jamming: the belt is degraded ${pct}%. The access is spent either way, and they will harden ` +
          'behind it.',
      };
    }
    if (spec.id === 'network') {
      return {
        cls: 'friendly', title: 'NETWORK ATTACK — IADS BLINDED', internal: true,
        sum: `Command network down, belt −${pct}%`, outcome: 'destroyed',
        text: (ev) => 'The command network is not passing tracks. Individual sites still have their own radars ' +
          'and their own crews, but nothing is handing an engagement between them and nothing is telling them ' +
          `what is coming — the belt is degraded ${pct}% until they get it back. They will, and they will be ` +
          'harder to reach next time.',
      };
    }
    if (spec.id === 'escort') {
      return {
        cls: 'friendly', title: 'ESCORT JAMMING — GROWLERS INSIDE THE RINGS', internal: true,
        sum: `Escort jam on station, belt −${pct}%`, outcome: 'destroyed',
        text: (ev) => 'The Growlers are flying the package in and jamming the engagement radars from inside ' +
          `their own coverage. It is the deepest suppression that can be relied on — the belt is degraded ` +
          `${pct}% tonight — and the aircraft doing it are in the threat for as long as the package is.`,
      };
    }
    return {
      cls: 'friendly', title: 'BARRIER JAM ESTABLISHED', internal: true,
      sum: `Standoff jam up, belt −${pct}%`, outcome: 'destroyed',
      text: (ev) => 'A barrier orbit is up outside the engagement rings, burning through from standoff. ' +
        `Nobody is in the threat and nothing has been destroyed: the belt is degraded ${pct}% until sunrise, ` +
        'and in the morning it is exactly what it was.',
    };
  }

  // ============================================================
  // COURSES OF ACTION — THE STAFF WRITES THE NIGHT
  // ------------------------------------------------------------
  // See COA in data.js for why this exists. The short version: on easy and
  // normal the CAOC has already done the targeting by the time the president
  // walks in, and what is on the table is two or three staffed options with a
  // doctrine behind each one.
  //
  // THIS IS A FRONT END, NOT A SECOND STRIKE PATH. Every package a course of
  // action flies goes through executeStrike, one at a time, exactly as if the
  // player had opened the dialog and authorized it — so a COA cannot get around
  // the magazine, the tanker plan, the air-superiority gate, the adaptation
  // counter, the crew-rest debt or the wall, and every package it flies can be
  // scrubbed off tonight's order individually like any other. A version that
  // resolved COAs on their own would have been half the code and would have
  // needed every one of those invariants re-implemented and kept in step
  // forever, which is the same bargain MapView.alliedStrike declined.
  //
  // THE BRIEF IS PURE AND CACHED BY TURN. Nothing here rolls a die: the same
  // board produces the same three options, which is what lets the menu be
  // rebuilt after a reload instead of persisted into the save. It is cached
  // anyway, because it is read once per render and the panel re-renders on
  // every click — and because on normal a hand-fragged package changes the
  // magazine underneath it, and an option that quietly rewrites itself while
  // the player is reading it is worse than one that goes grey.
  let coaCache = { turn: -1, list: null };

  // How badly tonight wants each doctrine, 0..1, before the table's own
  // standing appetite for it. Every branch reads the same functions the HUD and
  // the advisors read — there is no private assessment in here, and the staff is
  // never allowed to score off something the president cannot also see. Since
  // v1.82 that shared read is `Assess.board()` (assess.js), passed in rather
  // than taken here, so the number that ranks an option and the sentence that
  // argues for it are computed off one snapshot and cannot describe two
  // different nights.
  function coaScore(intent, b) {
    switch (intent.id) {
      case 'rollback': {
        // the one doctrine that prices itself out: at superiority there is
        // nothing left up there worth a package
        return clamp((1 - b.sup) + (b.adBack ? 0.18 : 0), 0, 1);
      }
      case 'counterforce': {
        // a fix on a launcher group does not keep — same fact SecDef leads with
        // `mFrac`, not `mStr`: the strength readings are 0..2 and this
        // coefficient was written for a fraction, so the raw scale clamped this
        // whole expression at 1 from turn 1 to about turn 20 (see assess.js).
        return clamp(b.mFrac * 0.55 + (1 - b.bmd) * 0.30 + (b.telsFound ? 0.40 : 0), 0, 1);
      }
      case 'objective': {
        // urgency is the clock, permission is the sky. The halls are deep,
        // hardened and the far side of a belt, so this doctrine is discounted
        // while the sky is contested rather than ruled out — the stealth
        // packages fly at any phase, and they are the only key Fordow has.
        //
        // The floor is the load-bearing part and it was 0.35 for exactly one
        // measurement pass. Every other doctrine on this table scores off a
        // threat that DECAYS as it is worked, so the program — the one thing
        // the war is actually scored on — finished behind the missile force and
        // the SAM belt on essentially every night of every campaign, and a bot
        // that took the staff's leading recommendation thirty nights running
        // never once flew the enrichment halls and could not win at all. A
        // doctrine that is never briefed is not a doctrine. It leads whenever
        // the program is substantially intact, and it goes on leading until it
        // is finished, which is what "this is what the war is for" has to mean
        // if it means anything.
        const near = b.brk.halted ? 0 : clamp(1 - (b.brk.mid || 30) / 18, 0, 1);
        const left = 1 - b.deg / 100;
        const sky = phaseAtLeast('superiority') ? 1 : phaseAtLeast('degraded') ? 0.85 : 0.55;
        return clamp((0.55 + near * 0.45) * left * sky, 0, 1);
      }
      case 'maritime': {
        // `b.risk` is the telegraphed anti-ship shot READ off G.threat, not
        // rolled. From v1.77 to v1.81 this line called carrierRisk() — the
        // resolver — which returns an events array (so `.risk` was undefined and
        // the whole score was NaN) and, far worse, clears G.threat on its way
        // out. Ranking the maritime option therefore consumed tonight's warning
        // before the turn resolved, and telegraphed anti-ship fires simply did
        // not happen on any difficulty that briefs a course of action. Anything
        // that wants to know how exposed a deck is asks the board (assess.js);
        // carrierRisk is called once a turn, by the resolution, and by nothing
        // else.
        return clamp(b.nFrac * 0.55 + b.risk * 0.25 + (b.hormuz === 'CLOSED' ? 0.35 : 0), 0, 1);
      }
      case 'pressure': {
        // never urgent and never worthless. It scores off the fact that the
        // war has run long without the gate moving, which is exactly when a
        // president starts reaching for the other kind of target.
        const stall = clamp(b.turn / 20, 0, 1);
        return clamp(0.30 + stall * 0.45 - (b.world < 40 ? 0.30 : 0), 0, 1);
      }
      case 'jerusalem': {
        // the gauge, not the ETA: a null ETA means two different things and
        // neither of them is a number this can multiply (see israelEta)
        if (b.israel.posture === 'coordinated') return 0.15;
        return clamp(b.israel.pressure / ISRAEL.fly, 0, 1);
      }
      case 'southern': {
        // `entered`, not the once-per-war roll: a front that has not announced
        // itself has no aimpoints on the plot and cannot be a course of action
        return b.houthi.active ? clamp(b.houthi.strength * 0.8 + 0.2, 0, 1) : 0;
      }
      default: return 0;
    }
  }

  // The aimpoints the staff would put under an intent, best first. `finish what
  // is started` is the sort, because it is what a targeteer actually does and
  // because the alternative — spreading three packages across three intact
  // sites — is the exact play that loses this game slowly.
  function coaTargets(intent) {
    const live = TARGETS.filter((t) => {
      if (t.hp <= 0 || t.status === 'destroyed') return false;
      if (!plotted(t)) return false;               // a box on the plot is not an aimpoint
      if (t.type === 'tel' && (!t.dispersed || !t.located)) return false;
      if (!canReach(t)) return false;
      if (legallyBarred(t)) return false;          // the Hill took it off the list
      if (intent.id === 'jerusalem') return !!t.israelPriority;
      return intent.types ? intent.types.includes(t.type) : false;
    });
    return live.sort((a, b) => {
      const ad = a.hp < 100 ? 0 : 1, bd = b.hp < 100 ? 0 : 1;
      if (ad !== bd) return ad - bd;               // finish the wounded first
      if (ad === 0) return a.hp - b.hp;            // and the most wounded of those
      return TARGETS.indexOf(a) - TARGETS.indexOf(b);  // otherwise file order
    });
  }

  // What the CAOC would actually frag against a site tonight, or null. Reads
  // exactly the gate the strike dialog reads, so the staff can never brief a
  // package the player would have been refused.
  //
  // The preference against the finite reservoirs SCALES WITH WHAT IS LEFT OF
  // THEM, and a flat discount was wrong in a way that only showed on a live
  // board. A Tomahawk beats an F-35 package on the staff's own arithmetic —
  // higher base odds and nobody aboard to lose — so with a fixed penalty the
  // first brief of the war was three TLAM salvos, which is nine rounds of a
  // thirty-round campaign reservoir spent on night one, every campaign, before
  // the president had been told there was a reservoir. Weighted against what
  // remains, the staff spends freely while the cells are full and starts
  // husbanding exactly when a planner would, which is also the behaviour that
  // leaves the boat's four torpedoes for the hulls they are the answer to.
  // ...and it does not fly the whole night on one platform. `flownTonight`
  // counts what this option has already committed, and a tier already on it is
  // damped for the next leg. That was not a polish pass either: without it
  // every leg solves the same arithmetic against the same board and returns the
  // same answer, so the opening brief of every campaign was three identical
  // TLAM salvos — nine rounds of a thirty-round campaign reservoir, on night
  // one, before the player had been told a reservoir existed. Mixing is also
  // what the rest of the game already rewards: IranAI.adaptPenalty charges a
  // campaign that flies one platform into the ground, and a staff that hands
  // the president a single-platform night is walking them into that bill.
  function coaPackage(target, flownTonight) {
    let best = null;
    for (const pkg of target.packages) {
      if (pkgStock(pkg) < pkg.qty) continue;
      if (pkgBlock(target, pkg)) continue;
      if (!tankersFor(target, pkg).ok) continue;
      if (pgmBlock(pkg)) continue;
      const c = computeStrike(target, pkg);
      // What a round out of a campaign reservoir is worth, as opposed to a
      // sortie that regenerates at the turn: the share of everything REMAINING
      // that this package would spend. It self-sharpens as the cells empty,
      // which is the whole behaviour — spend freely while there is depth,
      // husband the last few for the targets nothing else can reach.
      // An escort shot is a `cruise` package that does not touch the Tomahawk
      // reservoir, so pricing it against tlamPool husbands the wrong magazine
      // twice over — it makes an SM-6 look cheap when the Tomahawks are deep,
      // and it never makes the staff reluctant about the one thing it should be
      // reluctant about, which is firing the interceptor cells that cover the
      // Gulf bases at a frigate.
      const pool = pkg.sub ? (G.torpedoes ?? 0)
        : pkg.escort ? escortPool(pkg)
        : pkg.asset === 'cruise' ? (G.tlamPool ?? 0) : 0;
      const finite = pool > 0 ? clamp(1 - 2.2 * pkg.qty / pool, 0.2, 1) : 1;
      const rep = Math.pow(0.72, (flownTonight && flownTonight[pkg.asset]) || 0);
      const val = (c.fullOdds * (c.gradual ? c.damage : 100) * finite - c.lossRisk * 40) * rep;
      if (!best || val > best.val) best = { pkg, val };
    }
    return best && best.pkg;
  }

  // ============================================================
  // WHAT AN OPTION IS ACTUALLY WORTH, AND WHAT IT LEAVES
  // ------------------------------------------------------------
  // The half of the brief that is not a target list. Through v1.81 an option
  // carried a name, a fixed one-line slogan, a fixed paragraph and a package
  // count — so ROLLBACK made the identical argument on turn 2 and turn 27, and
  // the only thing that moved between two nights was which sites were listed
  // behind the caret. That is a menu of doctrines, not a brief on tonight.
  //
  // Three things are computed here and each answers a different question a
  // president would actually ask.
  //
  //   `effect`  what the packages are expected to do, ON THE STAFF'S OWN
  //             NUMBERS. Every leg goes through `computeStrike` — the same
  //             function the strike dialog prints odds from — so the brief can
  //             never be more optimistic than the dialog would have been. The
  //             kill estimate is the three-band roll `resolveImpact` actually
  //             performs, read against the site's current condition, which is
  //             why "five packages" and "expect to finish two" are different
  //             numbers and both true.
  //
  //   `bill`    what signing it spends: plan, aircrew, standing abroad, and
  //             whichever finite magazine it reaches into. Costs the player
  //             would otherwise only discover by opening five dialogs, or on
  //             hard by running out.
  //
  //   `defers`  what tonight will NOT do. This is the load-bearing one and the
  //             reason the menu is a decision rather than a queue: it is the
  //             top-ranked concern (assess.js) that this option does not
  //             service, phrased in the same words the option that WOULD
  //             service it uses to argue for itself. Without it the staff was
  //             only ever selling, three times, and the correct play was to
  //             take whichever pitch was longest.
  // ============================================================

  // The surge is tracked leg by leg rather than priced once, because it is not
  // a property of the option — it is a property of the ORDER the packages are
  // signed in, and `computeStrike` reads it live off G.strikesThisTurn. So the
  // counter is walked forward exactly as `takeCoa` will walk it and restored in
  // a finally. Nothing else in computeStrike writes state; this is the one
  // input it takes from the board rather than from its arguments, and the
  // alternative — re-deriving atoOver here — is a second copy of the surge math
  // that would drift from the modal's within a version.
  function coaEffect(legs) {
    const before = G.strikesThisTurn;
    const out = {
      n: legs.length, kill: 0, loss: 0, tanker: 0, world: 0, onKill: 0,
      cruise: 0, torpedoes: 0, interceptors: 0, nsm: 0, pgm: 0, over: 0, classes: new Map(),
    };
    let safe = 1;
    try {
      for (const leg of legs) {
        const t = TARGETS.find(x => x.id === leg.targetId);
        if (!t) continue;
        const c = computeStrike(t, leg.pkg);
        out.classes.set(t.type, (out.classes.get(t.type) || 0) + 1);
        // The same three bands resolveImpact rolls: full effect below fullOdds,
        // half effect below success, nothing above it. What makes this worth
        // computing rather than quoting `fullOdds` is the comparison against
        // the site's own condition — a half-effect roll finishes a battery
        // already down to 30 and does nothing to one at full.
        const full = c.gradual ? c.damage : 100;
        const half = full * 0.5;
        out.kill += c.oneShot ? c.success
          : (full >= t.hp ? c.fullOdds : 0) + (half >= t.hp ? c.success - c.fullOdds : 0);
        safe *= 1 - c.lossRisk;
        out.tanker += c.tanker;
        out.over += c.over > 0 ? 1 : 0;
        out.world += (t.world || 0) + (leg.pkg.extraWorld || 0);
        if (t.worldOnKill) out.onKill += t.worldOnKill;
        if (leg.pkg.sub) out.torpedoes += leg.pkg.qty;
        // An escort shot is an `asset: 'cruise'` package that fires no Tomahawk,
        // so counting it here would put "TOMAHAWK — 2 of 20 left" on the bill of
        // an option that spends no Tomahawks at all, and leave the magazine it
        // DOES spend — the interceptor cells covering Al Udeid — off the brief
        // entirely. The president would sign an option that quietly took the
        // umbrella down and be shown a line about a reservoir it never touched.
        else if (leg.pkg.escort === 'sm6') out.interceptors += leg.pkg.qty;
        else if (leg.pkg.escort === 'nsm') out.nsm += leg.pkg.qty;
        else if (leg.pkg.asset === 'cruise') out.cruise += leg.pkg.qty;
        out.pgm += pgmCost(leg.pkg);
        if (leg.pkg.asset !== 'cruise') G.strikesThisTurn++;
      }
    } finally {
      G.strikesThisTurn = before;
    }
    out.loss = 1 - safe;
    return out;
  }

  // "three on the SAM belt, one on the enrichment halls" — the shape of the
  // night, biggest first. Aimpoints by name are behind the caret; this is what
  // a player comparing three options at a glance is comparing.
  function coaShape(classes) {
    return [...classes.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([type, n]) => `${n} on ${COA.className[type] || type}`)
      .join(', ');
  }

  // The estimate, in the voice of the people who produced it. Two clauses and
  // both of them are hedged on purpose: this is a staff opinion about a die
  // roll, and a brief that reads like a guarantee is worse than no brief at
  // all the first night it is wrong. Under half an expected kill it says so in
  // words rather than printing a zero — "damage on the board and a return trip"
  // is the honest description of most nights in this war and it is the sentence
  // that teaches a new player why concentrating packages matters.
  function coaEstimate(e) {
    const kill = Math.round(e.kill);
    const eff = e.kill < 0.5
      ? `On our own numbers nothing on this list falls tonight — it is damage on the board and a return trip`
      : `On our own numbers expect ${kill} of the ${e.n} to come off the board tonight`;
    const risk = e.loss < 0.005
      ? 'nothing manned goes over the target'
      : `roughly a ${Math.max(1, Math.round(e.loss * 100))}% chance the night costs an aircraft`;
    return `${eff}, and ${risk}.`;
  }

  // The cost chips. Only what this option actually charges — an empty bill is
  // a real answer (a night of Tomahawks off a full reservoir with the belt
  // already down genuinely costs nothing anyone in the room can name) and
  // padding it with zeroes would train the player to stop reading the row.
  function coaBill(e) {
    const bill = [];
    const slots = atoSlots(), spent = G.strikesThisTurn;
    if (e.over > 0) bill.push({ k: 'PLAN', v: `${e.over} past it`, warn: true });
    else bill.push({ k: 'PLAN', v: `${Math.min(e.n, Math.max(0, slots - spent))} of ${Math.max(0, slots - spent)} left` });
    if (e.loss >= 0.02) {
      bill.push({ k: 'AIRCREW', v: `${Math.round(e.loss * 100)}% chance of a loss`, warn: e.loss >= 0.2 });
    }
    const abroad = e.world + e.onKill;
    if (abroad <= -1) {
      bill.push({
        k: 'ABROAD',
        v: e.onKill ? `${Txt.signed(Math.round(e.world))} now, ${Txt.signed(Math.round(e.onKill))} more if they fall`
          : `${Txt.signed(Math.round(e.world))} standing`,
        warn: abroad <= -8,
      });
    }
    if (e.cruise) bill.push({ k: 'TOMAHAWK', v: `${e.cruise} of ${G.tlamPool} left`, warn: e.cruise * 3 > G.tlamPool });
    if (e.torpedoes) bill.push({ k: 'TORPEDOES', v: `${e.torpedoes} of ${G.torpedoes} aboard`, warn: true });
    // The escort screen's two magazines. The interceptor line ALWAYS warns —
    // unlike the Tomahawk line, which warns on depth — because the thing being
    // spent is not a reservoir the war can run down cheaply, it is the air
    // defense of Al Udeid and Al Dhafra, and an option that reaches for it
    // should look like it is reaching for something even when the cells are
    // full.
    if (e.interceptors) {
      bill.push({ k: 'INTERCEPTORS', v: `${e.interceptors} of ${G.bmdPool} in the cells — off the Gulf umbrella`, warn: true });
    }
    if (e.nsm) bill.push({ k: 'NSM', v: `${e.nsm} of ${G.nsmPool} in the deck canisters`, warn: true });
    if (pgmLedger() && e.pgm) {
      bill.push({ k: 'MUNITIONS', v: `${Txt.plural(e.pgm, 'weapon')} of ${G.pgm ?? 0}`, warn: e.pgm * 3 > (G.pgm ?? 0) });
    }
    if (e.tanker) bill.push({ k: 'TANKERS', v: `${e.tanker} of ${G.tankers} tracks`, warn: e.tanker >= G.tankers });
    return bill;
  }

  // Tonight's brief. Deterministic, so a reload rebuilds the same menu.
  function coaOptions() {
    const d = diff();
    if (!d.coa || G.over) return [];
    if (coaCache.turn === G.turn && coaCache.list) return coaCache.list;

    // One read of the board for the whole brief, so the three options are
    // ranked against each other on the same snapshot and every sentence in
    // them is argued from it (see assess.js).
    const b = Assess.board();
    const worries = Assess.concerns(b);

    // how many packages one option is allowed to be worth. On easy an option
    // IS the night; on normal it is deliberately short of it, and the shortfall
    // is what the map is for.
    const size = Math.max(1, Math.round(atoSlots() * (COA.fill[d.coaFill] ?? 1)));

    const ranked = COA.intents
      .map(intent => ({ intent, urgency: coaScore(intent, b) }))
      .map(o => ({ ...o, rank: o.intent.weight * (0.3 + o.intent.scale * o.urgency) }))
      .sort((x, y) => y.rank - x.rank);

    // ---- who is on the brief, decided BEFORE anything is filled ----
    // Two passes, and the split is what makes the menu a decision. Under one
    // pass each option was built in isolation and topped up from the same
    // globally-ranked leftovers, so ALPHA, BRAVO and CHARLIE converged on the
    // same night: the main effort is one to three aimpoints and everything
    // after it came out of one shared pile. Measured against a bot that picks
    // uniformly at random, taking the staff's leading recommendation was worth
    // nothing at all — 76% against 76% — which is the arithmetic proof that
    // three options that fly the same packages are one option printed three
    // times.
    //
    // So the slate is settled first, and then each option's supporting effort
    // AVOIDS the other briefed options' own aimpoints. Picking ALPHA now means
    // genuinely not getting BRAVO's targets, which is the only condition under
    // which the pick can be right or wrong. The exclusion is a preference and
    // not a law — an option that cannot reach `fillFloor` without poaching gets
    // a second, unrestricted pass, because an option that arrives half empty
    // was the worse failure and is the one the supporting effort exists to fix.
    const slate = [];
    for (const r of ranked) {
      if (slate.length >= d.coa) break;
      if (coaTargets(r.intent).length < r.intent.min) continue;
      slate.push(r);
    }
    // Each slate member's claim: the aimpoints its own doctrine would lead
    // with. By target id rather than by class, because JERUSALEM'S LIST has no
    // class — its pool is wherever the israelPriority flags happen to be — and
    // a type-based exclusion would silently fail to protect the one option
    // whose whole identity is a list.
    const claim = new Map();
    for (const r of slate) {
      claim.set(r.intent.id, new Set(coaTargets(r.intent).slice(0, size).map(t => t.id)));
    }

    const out = [];
    for (const { intent, urgency, rank } of slate) {
      const pool = coaTargets(intent);
      // aimpoints another briefed option is leading with
      const spokenFor = new Set();
      for (const [id, ids] of claim) if (id !== intent.id) for (const x of ids) spokenFor.add(x);
      // fill the option, one aimpoint at a time. `taken` stops the same site
      // being briefed twice inside one option; nothing stops two OPTIONS naming
      // the same site, because two doctrines wanting the same aimpoint is a
      // real thing and hiding it would misrepresent the choice.
      const legs = [], taken = new Set(), mix = {};
      const fill = (list, main, avoid) => {
        for (const t of list) {
          if (legs.length >= size) break;
          if (taken.has(t.id)) continue;
          if (avoid && spokenFor.has(t.id)) continue;
          const pkg = coaPackage(t, mix);
          if (!pkg) continue;
          taken.add(t.id);
          mix[pkg.asset] = (mix[pkg.asset] || 0) + 1;
          legs.push({ targetId: t.id, pkg: { ...pkg }, main });
        }
      };
      fill(pool, true, false);
      // ...and then the SUPPORTING effort. An intent almost never has enough
      // live aimpoints to fill a plan by itself — three SAM sites is a whole
      // doctrine and a five-package night — so an option built only out of its
      // own class went out at half strength and left the rest of the tasking
      // order unflown. Measured, that was the entire difference between easy
      // and a hand-played campaign: 61 packages against 126, which is not a
      // difficulty setting, it is half a war. A real ATO has a main effort and
      // then it fills the night, and so does this: the option keeps its name
      // and its argument, and the capacity its own class cannot use goes to the
      // next-ranked doctrines that can. `main` is carried per leg so the brief
      // can show the two apart — what the president is choosing is still the
      // main effort, and it would be a lie to bury that in a list.
      const floor = Math.max(1, Math.ceil(size * COA.fillFloor));
      for (const avoid of [true, false]) {
        if (legs.length >= size) break;
        // the relaxed pass runs only to save an option that would otherwise be
        // dropped, never to top a healthy one up out of a rival's list
        if (!avoid && legs.length >= floor) break;
        for (const other of ranked) {
          if (legs.length >= size) break;
          if (other.intent.id === intent.id) continue;
          fill(coaTargets(other.intent), false, avoid);
        }
      }
      if (legs.length < floor) continue;
      // an option whose own class contributed nothing is not that option
      if (!legs.some(l => l.main)) continue;

      const e = coaEffect(legs);
      // WHY TONIGHT. The concern this doctrine is the answer to, in the same
      // words the concern uses everywhere else. Two concerns point at
      // counterforce and which one is speaking changes every few nights, which
      // is most of why the same option reads differently across a campaign.
      // The fallback is not decoration: a doctrine can be worth flying with
      // nothing going wrong — finishing a belt that is already broken, working
      // a program on a board where nothing is on fire — and saying "nothing
      // urgent, and it is still the best use of the night" is a real brief.
      const mine = Assess.forDoctrine(worries, intent.id);
      const read = mine ? mine.now
        : `Nothing on the board is forcing this tonight. It is what the plan calls for next, and a night ` +
          `spent on it is a night the list gets shorter without anything else getting worse.`;
      // WHAT IT LEAVES. The worst thing tonight will not touch — skipping
      // anything the legs already service, which is the whole reason the
      // supporting effort exists and would be a lie to ignore. Political
      // concerns carry no doctrine and are not eligible: "this option does not
      // fix your approval rating" is true of every option ever briefed.
      const serviced = new Set(legs.map(l => {
        const t = TARGETS.find(x => x.id === l.targetId);
        return t ? t.type : null;
      }));
      const israelServiced = legs.some(l => {
        const t = TARGETS.find(x => x.id === l.targetId);
        return t && t.israelPriority;
      });
      const answers = (c) => {
        if (!c.doctrine) return false;
        if (c.doctrine === intent.id) return true;
        if (c.doctrine === 'jerusalem') return israelServiced;
        const other = COA.intents.find(i => i.id === c.doctrine);
        return !!(other && other.types && other.types.some(ty => serviced.has(ty)));
      };
      const gap = worries.find(c => !answers(c));

      out.push({
        id: intent.id, name: intent.name, line: intent.line, why: intent.why,
        slot: COA.slots[out.length] || `OPTION ${out.length + 1}`,
        urgency, rank, legs,
        read, shape: coaShape(e.classes), bill: coaBill(e), est: coaEstimate(e),
        kill: e.kill, loss: e.loss,
        defers: gap ? gap.left : null,
      });
    }

    coaCache = { turn: G.turn, list: out };
    return out;
  }

  // Which options have already gone out tonight. Read off the missions rather
  // than off a counter, so scrubbing the last package of a course of action
  // puts it back on the table — the same rule every other refund follows.
  function coaFlown() {
    const s = new Set();
    for (const m of G.missions) if (m.turn === G.turn && m.coa) s.add(m.coa);
    return s;
  }

  // How many of tonight's options the president may actually sign. 0 means no
  // cap, which is normal and hard: there an option is deliberately short of the
  // plan and the leftover is the whole reason the map is still live.
  //
  // On easy it is one, and the reason is arithmetic rather than taste. An option
  // there is sized to the WHOLE tasking order, so a second signature is not a
  // heavier night — it is a second complete plan flown as late frags: every
  // package at degraded effects, the aircrew roll multiplied, and up to four
  // packages of crew-rest debt charged against tomorrow. On the one level with
  // no ATO gauge, no strike dialog and no late-frag warning anywhere on screen,
  // that is a cliff a president can walk off by pressing BRIEF ME again and
  // signing the option they liked second best. Kept as a number rather than a
  // boolean because the shape of the rule is a budget, and because a level that
  // briefed half-plan options would want two.
  //
  // Read off the missions like coaFlown, so scrubbing the packages of the option
  // that was signed hands the signature back with them.
  const coaSigns = () => diff().coaSigns || 0;
  function coaSignsLeft() {
    const cap = coaSigns();
    if (!cap) return Infinity;
    // The surge is not one of the night's signatures — it is what happens after
    // they are spent — so it must not eat the budget it is gated behind. Counted
    // out here rather than kept in a second set, because coaFlown() is read off
    // the missions on purpose and scrubbing the surge has to hand it back too.
    let n = 0;
    for (const id of coaFlown()) if (id !== SURGE_ID) n++;
    return Math.max(0, cap - n);
  }

  // ============================================================
  // THE SURGE — the reach easy did not have (v2.01)
  // ------------------------------------------------------------
  // See the coaSurge block in data.js for the measurement and the argument. In
  // short: every other level can frag past the written plan to `atoWall`, easy
  // could not, and the gap is a third of the war per night. This is that reach,
  // at the late-frag price, briefed.
  //
  // Built LIVE and deliberately outside coaOptions()' per-turn cache: a surge
  // exists only once the night has been signed, which is a state that changes
  // inside a turn and that the cache cannot see.
  const SURGE_ID = 'surge';
  const coaSurgeMax = () => diff().coaSurge || 0;

  // The option object, or null. Same shape every other briefed option has, so
  // coaRows draws it, the room walks to it and takeCoa flies it with no second
  // copy of any of that.
  function surgeOption() {
    const d = diff();
    if (!d.coa || G.over || !coaSurgeMax()) return null;
    // the plan first — a surge before the plan is just the plan
    if (coaSignsLeft() > 0) return null;
    const flown = coaFlown();
    if (flown.has(SURGE_ID)) return null;        // one a night
    if (atoWall()) return null;                  // no rested crew left to brief
    // AND THE WING HAS TO BE RESTED, which is the difference between a decision
    // and a trap. Measured at n=60 without this line: the surge was offered on
    // 21.5 of ~25 nights, a bot took every one of them, and easy's win rate fell
    // 85% → 68%. That is not the late-frag price being felt, it is a spiral —
    // `fatiguePerSurge` is charged per package and `planSize` subtracts fatigue
    // straight off tomorrow's plan, so surging nightly walks the tasking order
    // from three packages down to the floor of one and never lets it back up.
    // An affordance the staff offers every night, on the level built for
    // first-time players, cannot be one whose obvious use loses the war.
    //
    // Gated on the debt being CLEAR rather than on a ceiling, because that is
    // the rhythm the numbers already describe: a two-package surge books two
    // nights of debt against `fatigueDecay` of one, so the wing surges, rests,
    // and surges again. The president gets the reach roughly every third night
    // and the plan underneath it is never eroded.
    if ((G.fatigue || 0) > 0) return null;

    // WHOSE aimpoints. The doctrine that was signed, falling through to the
    // next-ranked only when its own list is finished — see data.js for why this
    // is the load-bearing half and not a flourish.
    const signedId = [...flown].find(id => id !== SURGE_ID);
    const signed = COA.intents.find(i => i.id === signedId);
    if (!signed) return null;

    // What tonight has already booked. A surge is the NEXT aimpoints, not a
    // second pass over the ones already on the order.
    const done = new Set(G.struckThisTurn);
    const flownTonight = {};
    for (const m of G.missions) {
      if (m.turn !== G.turn) continue;
      done.add(m.targetId);
      if (m.pkg) flownTonight[m.pkg.asset] = (flownTonight[m.pkg.asset] || 0) + 1;
    }

    // One read of the board for the whole fallback ranking, per rule 2 in
    // assess.js — and hoisted out of the sort because board() is not cached and
    // scoring seven doctrines against seven separate reads is both wasteful and
    // a ranking of nights that never existed together.
    const b = Assess.board();
    const order = [signed].concat(
      COA.intents.filter(i => i.id !== signed.id)
        .map(i => ({ i, u: coaScore(i, b) }))
        .sort((x, y) => y.u - x.u).map(x => x.i));

    const legs = [];
    const room = Math.min(coaSurgeMax(), ATO.ceiling);
    for (const intent of order) {
      for (const t of coaTargets(intent)) {
        if (legs.length >= room) break;
        if (done.has(t.id)) continue;
        const pkg = coaPackage(t, flownTonight);
        if (!pkg) continue;
        done.add(t.id);
        flownTonight[pkg.asset] = (flownTonight[pkg.asset] || 0) + 1;
        legs.push({ targetId: t.id, pkg, main: intent.id === signed.id });
      }
      if (legs.length >= room) break;
    }
    if (!legs.length) return null;

    const e = coaEffect(legs);
    // How many of these legs actually cost tomorrow. See the LEAVES line below:
    // `atoOver` returns 0 for cruise and for the boat, so those legs are neither
    // degraded as late frags nor charged crew-rest debt.
    const charged = legs.filter(l => !l.pkg.sub && l.pkg.asset !== 'cruise').length;
    return {
      id: SURGE_ID, surge: true,
      // The slot chip already says SURGE and it is rendered immediately to the
      // left of this, so naming the word twice reads as a stutter. Plain and
      // imperative like the seven doctrines it sits under.
      name: 'FLY MORE TONIGHT',
      slot: 'SURGE',
      // Deliberately does not name tomorrow: which price this surge carries
      // depends on what the staff could fill it with, and the LEAVES line below
      // is where that is answered honestly.
      line: `More weight on tonight, past the written plan, at a price.`,
      why: 'The tasking order for tonight is signed and flown. This is what the wing can still ' +
        'put in the air on top of it: crews briefed on the ramp against a hasty target study, ' +
        'on whatever tanker happens to be airborne. It is real weight and it arrives tonight — ' +
        'and every hour of it comes out of tomorrow, when the same crews are the ones who were ' +
        'going to fly the plan.',
      read: `Tonight is signed and there ${Txt.are(legs.length)} still ` +
        `${Txt.plural(legs.length, 'aimpoint')} the wing can reach before dawn. Nothing about ` +
        `the night gets easier by waiting for it.`,
      urgency: 0, rank: 0, legs,
      shape: coaShape(e.classes), bill: coaBill(e), est: coaEstimate(e),
      kill: e.kill, loss: e.loss,
      // A surge has no rival to defer to — it is the last thing offered — so
      // the LEAVES line carries its price instead, which is the whole reason
      // this card is a decision rather than a bonus.
      //
      // And it has to name the price this surge actually has. `atoOver` exempts
      // cruise and the boat — a Tomahawk is not on the tasking order, spends no
      // crew rest and books no debt — so a surge the staff filled with TLAM
      // costs nothing tomorrow and everything in the reservoir. The first
      // version of this line said "every package here is charged against the
      // plan the same crews fly next" unconditionally, which on those nights is
      // simply false, and a false LEAVES line is worse than none: it is the one
      // clause the president is meant to be able to trust.
      defers: charged === legs.length
        ? `Tomorrow. Every package here is a late frag, and the crews flying it are the crews who fly the plan tomorrow.`
        : charged > 0
          ? `Tomorrow, in part — ${Txt.plural(charged, 'package')} of ${legs.length} ${Txt.are(charged)} late frags charged against the crews who fly the plan tomorrow. The rest comes out of the reservoir.`
          : `Not the crews — nothing here is on the tasking order. It comes out of the reservoir instead, and the reservoir does not refill.`,
    };
  }

  // ...and the same offer as the president is shown it BEFORE it exists (v2.07).
  // The surge was the one decision in this game that arrived AFTER a click: it
  // does not exist until the signature that creates it, so the folder answered
  // the night's question by putting a fourth card on the table. A decision that
  // materialises on top of the one just made reads as a pop-up rather than as
  // part of the night. The room now draws it as a bar under the options from the
  // moment it opens, and this is what that bar says on the nights it cannot be
  // taken yet.
  //
  // Null means this LEVEL has no surge (normal and hard frag past the plan on
  // the map instead), which is the only state in which nothing is drawn at all.
  // Every other answer is a sentence, because an affordance the president cannot
  // see is one they do not know they are holding — and "sign the plan first" is
  // the rhythm of the mechanic rather than an error message.
  //
  // The gates are surgeOption's own, read in a different order: the states that
  // answer something the president DID come first, so a night already surged
  // says so rather than reporting the crew rest that surge booked.
  function surgeState() {
    if (!diff().coa || G.over || !coaSurgeMax()) return null;
    const opt = surgeOption();
    if (opt) return { ready: true, opt };
    return { ready: false, why:
      coaFlown().has(SURGE_ID) ? 'FLOWN TONIGHT — the wing is already up on top of the plan'
      : atoWall() ? 'NOT TONIGHT — no rested crews left to brief'
      : (G.fatigue || 0) > 0 ? 'NOT TONIGHT — the crews are owed rest from last night'
      : coaSignsLeft() > 0 ? 'SIGN TONIGHT\'S PLAN FIRST'
      : 'NOTHING LEFT the wing can reach before dawn' };
  }

  // The three doctrines plus the surge, which is what the folder, the panel and
  // the walkthrough all actually brief. One call so those three can never show
  // different slates.
  function briefOptions() {
    const s = surgeOption();
    return s ? coaOptions().concat([s]) : coaOptions();
  }

  // Sign one. Each leg is authorized exactly as the dialog would authorize it,
  // and a leg that can no longer fly — the magazine went on something else, the
  // site died to an earlier package tonight — is simply skipped. The staff does
  // not get a refusal it can argue with either.
  function takeCoa(id) {
    if (G.over || busy()) return 0;
    const coa = briefOptions().find(c => c.id === id);
    if (!coa || coaFlown().has(id)) return 0;
    // Enforced here and not only greyed in the two places the cards are drawn:
    // the panel and the dialog render the same rows through coaRows, and the
    // walkthrough opens the real folder on the real board.
    //
    // The surge is exempt because it is gated on the budget being SPENT — see
    // surgeOption, which refuses to exist until coaSignsLeft() hits zero. Asking
    // it to pass a cap it is downstream of would mean it could never fly.
    if (!coa.surge && coaSignsLeft() <= 0) return 0;
    let flown = 0;
    for (const leg of coa.legs) {
      const t = TARGETS.find(x => x.id === leg.targetId);
      if (!t || t.hp <= 0 || t.status === 'destroyed') continue;
      if (atoWall()) break;
      const before = G.missions.length;
      executeStrike(t, leg.pkg, id);
      if (G.missions.length > before) flown++;
    }
    UI.renderAll(G);
    Save.write();
    return flown;
  }

  // Whether the president is allowed to write orders on the map at all. One
  // answer, read by map.js for the click and by ui.js for the tooltip, so the
  // two can never disagree about whether tapping a site does anything.
  const freeTargeting = () => diff().freeTargeting !== false;

  // resolve one mission at time-on-target; returns the BDA event
  // `mission` is the frag this impact came from, carried in only so the loss
  // path can name the crew that was on it (see aircrew.js). Nothing about the
  // strike arithmetic reads it, and it is optional — a caller without one gets
  // the anonymous shootdown csar.js has always written.
  function resolveImpact(target, pkg, mission) {
    if (target.status === 'destroyed') {
      // an earlier package in the same volley (or turn) already finished it
      const wasted = platformTag(pkg);
      return {
        cls: 'friendly', title: `BDA: ${target.name}`, internal: true,
        sum: (wasted ? `${wasted} · ` : '') + `${target.short} — already destroyed, sortie wasted`,
        text: 'The package arrived over a target already destroyed. Aircraft and missiles expended against rubble — coordination cost, nothing gained.',
      };
    }

    // Second (or third) package onto the same site tonight. The diplomatic bill
    // for hitting a place is charged for the DECISION to hit it, not per sortie
    // — stacking two packages on one aimpoint is a targeting choice, and paying
    // `world` twice for it quietly taxed the one thing a hard target requires.
    const repeatTonight = G.struckThisTurn.includes(target.id);
    G.struckThisTurn.push(target.id);
    // The night this site last had ordnance on it. struckThisTurn is cleared at
    // the turn boundary and only answers "tonight?"; reconstitution needs to
    // know how many nights of quiet a wrecked SAM site has actually had.
    target.lastStruck = G.turn;
    // a joint strike carries its own diplomatic surcharge on top of the target's
    // (the big economic aimpoints charge nothing here — see worldOnKill below)
    // ...the joint surcharge still rides every package, because that one is
    // charged for flying an allied element, not for the aimpoint.
    const worldCost = (repeatTonight ? 0 : target.world) + (pkg.extraWorld || 0);
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

    // What flew, and it leads the line. See platformTag in data.js: a third of
    // every campaign was being flown by an aircraft the report never named
    // anywhere, which on easy — where the president opens no strike dialog —
    // made the fourth-generation force indistinguishable from absent. The
    // platform goes FIRST rather than after the verdict so the mix is readable
    // straight down the left edge of the night without opening a single row;
    // the full package, with its sortie count and its weapon, is one caret away
    // in the title.
    const flew = platformTag(pkg);
    const ev = { cls: 'friendly',
      // `·` and not an em dash: most labels already contain one, and
      // "Bandar Abbas Coastal Defense — F-35 SEAD package — 2 sorties" reads as
      // three things at the same level rather than a target and its package.
      title: `BDA: ${target.name}${pkg.label ? ` · ${pkg.label}` : ''}`,
      dWorld: worldCost, internal: true };
    ev.hit = outcome === 'destroyed' || outcome === 'damaged';
    // The whole assessment in four words, for the report's scan line. The prose
    // below is the same finding written out; a player who reads only this one
    // still knows what tonight's package did (see showReport in ui.js).
    ev.outcome = outcome;
    const verdict = outcome === 'destroyed'
      ? `${target.short} DESTROYED`
      : outcome === 'damaged'
        ? `${target.short} damaged — now ${condition(target)}`
        : `${target.short} — no effect`;
    ev.sum = flew ? `${flew} · ${verdict}` : verdict;

    if (outcome === 'destroyed') {
      // A site that has already been destroyed once and came back out of the
      // reserve is not a new headline and not a new line on the campaign
      // scoreboard. Without this, reconstitution is an approval farm: flatten
      // the same battery every four nights forever at +3 a time. Only the SAM
      // belt can reach this branch twice — nothing else returns from zero.
      const firstKill = !target.killedOnce;
      target.killedOnce = true;
      if (firstKill) G.stats.destroyed++;
      if (target.type === 'tel') G.stats.telsKilled++;
      // The number is unchanged from v2.12 and the mechanic around it is not.
      // A flat +3 for a destroyed target was right for the first SAM site and
      // absurd for the ninth: it said the country reacts to the twentieth night
      // of a bombing campaign exactly as it reacted to the first. It now pays
      // against APPROVAL's habituation, keyed on the target's own class — so
      // the first battery is news, the ninth is a Tuesday, and a class left
      // alone for four nights is news again. The `firstKill` halving below is a
      // different and narrower rule that stays: it stops SAM reconstitution
      // being an approval farm even when the country HAS lost interest.
      // Charged HERE and not via applyEvent — battle damage is a self-applying
      // event, as it was before this change, so `ev.dApproval` is the receipt
      // and never a second instruction. `approvalClass` is deliberately not set
      // on these for that reason: it is applyEvent's parameter, and a field
      // that looks like one on an event nothing hands to applyEvent is an
      // invitation to charge this twice.
      //
      // The value recorded is what LANDED, not what was asked for, so the
      // report chip cannot claim +3 on a night the middle had two points left
      // in it. Same rule aegisIntercept follows when it rescales a salvo.
      const bump = firstKill ? 3 : 1;
      ev.dApproval = movePublic(bump, target.type);
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
      // The whole diplomatic bill for a target that only makes news when it
      // stops working — paid here, once, and never for the packages that got
      // it this far. Same event that wrecks what pays for the war moves Tehran
      // fractionally toward the table: not a door, a thumb on the scale for
      // whenever the nuclear gate finally opens (see doDiplo).
      if (target.worldOnKill) {
        G.world = clamp(G.world + target.worldOnKill, 0, 100);
        ev.dWorld = (ev.dWorld || 0) + target.worldOnKill;
        text += ' The site is off the board, and so is the argument that this was a ' +
          'limited campaign — the protests abroad start with the morning wires.';
      }
      if (target.momentumOnKill) {
        G.negotiationMomentum += target.momentumOnKill;
        text += ' Tehran is now fighting a war it cannot pay for.';
      }
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
      ev.dApproval = movePublic(1, target.type);
      text = est.gradual
        ? `Partial effects on target. BDA assesses the site at ${condition(target)} — down from ` +
          `${beforeBand}, and both of those are estimates with real error in them. It is damaged, not ` +
          'finished, and it is still fighting. Every night it is left alone, crews put some of that back.'
        : 'Partial effects on target. Significant damage, but the site retains residual capability. A follow-up strike would likely finish it.';
    } else {
      // A wasted package, and it does NOT habituate — no class is passed. The
      // country never gets bored of the war going badly, which is APPROVAL's
      // central asymmetry and the reason a long campaign is a losing one: the
      // good nights fade into wallpaper and the bad nights all still count.
      ev.dApproval = movePublic(-2);
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
      ev.dApproval = (ev.dApproval || 0) + movePublic(-4);
      ev.aircraftLost = true;   // reported as a chip on the report line, not in the summary
      const loss = CSAR.aircraftDown(target, mission);
      text += ' ' + loss.text;
      if (loss.casualties) {
        G.casualties.us += loss.casualties;
        ev.casualties = loss.casualties;
      }
      AudioSys.play('aircraftLost', 600);
    }

    if (pkg.joint) {
      ev.title = `BDA: ${target.name} — JOINT US–ISRAELI STRIKE`;
      ev.sum += ' · joint with Israel';
      text += ' Israeli aircraft flew the escort and SEAD package. Tehran is telling the region this was a Zionist–American operation, and the region is inclined to believe it.';
    }

    ev.text = text;
    MapView.updateTarget(target);
    G.stats.peakOil = Math.max(G.stats.peakOil, G.oil);
    return ev;
  }

  // How many packages are in the air at once, and how far the second one steps
  // off behind the first. TWO, because the wall has two feeds — see the note
  // above #strike-wall in index.html, which says outright that FEED 02 is "the
  // package behind it, at the same time". It never was: this function laid on
  // the next batch only once the last one had resolved, so the second screen
  // only ever caught a card running out its egress beat, and the two feeds were
  // showing one strike and one afterthought.
  //
  // The stagger exists because a simultaneous start is worse than a serial one.
  // Two launch clips firing on the same frame is one loud noise rather than two
  // packages, and both cards then walk their run in lockstep — same phase
  // changes, same SAM break, same impact, which reads as a rendering artifact.
  // Two seconds is enough offset that each card's beats land in the gaps of the
  // other's and the wall reads as two crews on two problems.
  const STRIKE_CONCURRENCY = 2;
  const STRIKE_STAGGER_MS = 2000;

  // advance the mission clock and resolve everything reaching time-on-target.
  // Missions still resolve in the order they were laid on — a SEAD sweep queued
  // first clears the air for packages behind it — but no longer ONE AT A TIME:
  // up to STRIKE_CONCURRENCY batches fly together, STRIKE_STAGGER_MS apart.
  //
  // Nothing downstream had to change for that. Every scope run in map.js keeps
  // its state on its own card and in its own closure, each batch already owned
  // its own guard, watchdog re-arm and stall fallback, and the clip duck holds
  // and the jet chatter are both refcounted (see overlayScopeClip's per-clip
  // duckKey and missionMusicStart). What DID have to change is on either side
  // of the pump: batches now finish out of order, so the report is assembled
  // from ordered slots rather than by append order, and a batch does not free
  // its place until its hit clip has played out rather than the instant BDA
  // resolves. Both are argued where they happen below.
  function resolveMissions(done) {
    const due = [];
    for (const m of G.missions) { m.eta--; if (m.eta <= 0) due.push(m); }
    G.missions = G.missions.filter(m => m.eta > 0);
    // One slot per batch, filled when that batch resolves and flattened in
    // LAID-ON order at the end. Appending to a shared array would hand the BDA
    // report back sorted by flight time — a TLAM that launched second and
    // arrived first would print above the bomber it was sequenced behind, and
    // the night would read back in an order the player never planned in.
    const slots = [];
    let live = 0;             // batches currently on the wall
    const liveTargets = new Set();
    let lastLaunch = 0;       // when the last package stepped off, for the stagger
    let pumpTimer = 0;
    let finished = false;

    // Fill every free slot the stagger allows, then stop. Re-entered when a
    // batch frees its place, and on its own timer while the stagger is holding
    // a package back.
    const pump = () => {
      // Supersede a stagger timer that is still pending: a batch freeing its
      // place re-enters here directly, and the two must not both launch.
      clearTimeout(pumpTimer); pumpTimer = 0;
      if (finished) return;
      if (!due.length) {
        // The night's last package is off the wall: hand the whole report back,
        // in the order the packages were laid on.
        if (live === 0) { finished = true; done(slots.flat()); }
        return;
      }
      if (live >= STRIKE_CONCURRENCY) return;
      // A target already flying waits for its own card, however free the wall
      // is. playStrikeHit finds its card by target id (there is no other handle
      // on it), so a second card over the same aimpoint would send the hit clip
      // to whichever of the two matched first — and the two batches would be
      // drawn onto the same ring on the plot besides. Rare (it takes two
      // different assets tasked against one target on one night) and cheap: the
      // package flies next, exactly as it used to.
      if (liveTargets.has(due[0].targetId)) return;
      // The stagger is a piece of staging, so a skip does not pay for it: with
      // fast-forward up there is no footage and no run to offset, and holding
      // the last packages of a big night on a two-second clock each would be
      // the skip visibly failing to land.
      const wait = lastLaunch && !MapView.isFastForward()
        ? lastLaunch + STRIKE_STAGGER_MS - Date.now() : 0;
      if (wait > 0) { pumpTimer = setTimeout(pump, wait); return; }
      launch();
      pump();   // the wall may have another screen; the stagger will hold it
    };

    const launch = () => {
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
      const slot = slots.length;
      slots.push([]);
      live++;
      liveTargets.add(head.targetId);
      lastLaunch = Date.now();
      // watchdog: if the animation frame loop is throttled (background tab),
      // resolve anyway — a stalled animation must never hold up the war
      let resolved = false;
      // This batch's place on the wall, given back ONCE — and given back when
      // its footage is finished, not when its BDA resolves. With both feeds
      // busy, the card that follows takes its screen from wallScreen(), which
      // is allowed to force a card out from under a clip that is still playing.
      // Releasing on BDA would hand that screen away in the same tick the hit
      // clip started, so every strike but the last would be cut at its
      // detonation. playStrikeHit's onDone fires whenever the clip leaves the
      // screen — natural end, decode error, stall timeout or a skip — so this
      // cannot strand the pump.
      let released = false;
      const release = () => {
        if (released) return;
        released = true;
        live = Math.max(0, live - 1);
        liveTargets.delete(head.targetId);
        pump();
      };
      // A BATCH IS A HOP, and it has to be, for two reasons that are really one.
      //
      // The resolution watchdog gives each leg RESOLVE_TIMEOUT and re-arms on
      // every guard() — but until this wrapper existed there was no guard
      // between `resolveTurn` and `bda`, so the whole night's footage shared one
      // 45s budget. Every package's launch clip GATES its flight (see
      // overlayScopeClip's onEnd in map.js), so the cost is serial WITHIN a
      // card and it is large: a TLAM is 10.7s, a fighter off a deck 14.6s, a
      // BUFF 19.5s, and whenFootageDone then holds for the last hit clip's
      // tail — up to 8s. At ATO.base alone that is ~48s for three carrier
      // sorties, and the plan grows. A player who watched the footage instead
      // of skipping it was shown TURN RESOLUTION FAULT on most nights of most
      // campaigns, for a turn that was resolving perfectly well. Flying two
      // cards at once shortens the night but does not change this: the budget
      // is per hop either way. The modal escape in armWatchdog could never
      // cover it: a scope card lives in #flight-status and is not an .overlay,
      // because it is not something the turn is waiting on a person to
      // dismiss — it is the turn happening.
      //
      // And this is the one part of the night that ran OUTSIDE the boundary at
      // all. finishBatch is called from map.js's rAF frame, so a throw in
      // resolveImpact, covertLead or renderAll unwound into the browser's event
      // loop past every catch there is — the exact strand-forever failure the
      // boundary below exists to have deleted, in the one place it wasn't.
      const finishBatch = guard(`strike:${head.targetId}`, () => {
        if (resolved) return;
        resolved = true;
        AudioSys.play('impact');
        const batchEvents = batch.map(bm => resolveImpact(target, bm.pkg, bm));
        const out = [...batchEvents];
        // The packages looked at more than the target on the way through. A
        // strike on a type some gap in the folder feeds off can come back with a
        // lead — rolled once per target per night rather than once per weapon,
        // because what produces the intelligence is the visit, not the tonnage.
        const lead = covertLead(target);
        if (lead) out.push(lead);
        slots[slot] = out;
        // a successful hit plays the strike clip in the target's radar window —
        // the package decides which clip, so a torpedo lands as a torpedo, and
        // the batch's verdict decides whether a site with kill footage gets it.
        // Read off `outcome` rather than hp: a target already flat when the
        // package arrived resolves to a wasted sortie carrying neither field, so
        // a second formation over rubble cannot replay the site's death.
        if (batchEvents.some(ev => ev.hit)) {
          MapView.playStrikeHit(target, head.pkg,
            batchEvents.some(ev => ev.outcome === 'destroyed'), release);
        } else {
          release();   // nothing to watch: the screen is free now
        }
        UI.renderAll(G);
      });
      const scopeExtra = MapView.animateStrike(head.pkg.asset, target, finishBatch, count, head.pkg) || 0;
      // The stall fallback, and it must land BEHIND the animation for every
      // asset that has one — a fallback that fires first is not a safety net,
      // it is the primary path, and it resolves the batch while the formation
      // is still inbound. playStrikeHit is called from finishBatch, so the
      // explosion goes onto a scope card whose aircraft have not arrived yet.
      //
      // A launch clip plays in full before the run and gates it, so the
      // allowance has to cover the clip: TLAMs always (4.2s), fighters and
      // F-35s off a deck (4.1s), and a heavy package flying the BUFF (5.5s).
      // The first cut listed cruise and fighter only, which is right for the
      // one it was written for and wrong twice — `f35` is its own asset key,
      // not a kind of fighter, and the B-52 roll is the longest clip in the
      // game. Both fell 0.6s and 2.0s short, on every package they flew.
      // Whether a given sortie actually launches off a deck cannot be told
      // apart here, so the allowance goes to the whole tier; it only ever
      // delays the fallback, and being late is this timer's whole job.
      // The submarine shot runs on its own (longer) clock and plays no launch
      // clip — a torpedo swims out of the tube, it doesn't breach and boost.
      const launchClip = head.pkg.sub ? 0
        : head.pkg.asset === 'heavy' ? 6000
        : head.pkg.asset === 'cruise' || head.pkg.asset === 'fighter' ||
          head.pkg.asset === 'f35' ? 5000 : 0;
      // And the card is allowed to be longer than its tier. animateStrike hands
      // back whatever THIS card is going to spend that FLIGHT_DUR does not know
      // about — today that is the air-to-air merge, which stops the ingress
      // clock for nine seconds on one fighter sortie in fifty. Read off the
      // return rather than added to the tier: charging every fighter package
      // for a thing that almost never happens would push the safety net nine
      // seconds late on every sortie in the war to cover one of them.
      const runDur = FLIGHT_DUR[head.pkg.sub ? 'sub' : head.pkg.asset] || 1000;
      setTimeout(finishBatch, runDur + launchClip + scopeExtra + 3500);
    };

    pump();
  }

  // ============================================================
  // OVERNIGHT REPAIR
  // ------------------------------------------------------------
  // What Iran does with the turns you spend somewhere else. Anything still
  // standing works its way back toward full; anything you finished stays
  // finished, and anything you put ordnance on tonight is too busy burning to
  // start. This is the whole reason a half-serviced target list is worse than a
  // short one — damage you don't follow up on is damage you rent, not own.
  //
  // One exception, and it is the load-bearing one: a SAM site that has been at
  // zero and unvisited for AD_RECONSTITUTION.quiet nights comes back from the
  // national reserve. Everything else that reaches zero stays there. Returns an
  // ARRAY — the reserve moving is its own headline and does not belong buried in
  // the nightly work-parties line.
  // ============================================================
  // How far back up a site can be worked. Full, for anything that has never
  // been finished — but a SAM site the campaign once took to zero never returns
  // to what it was, because what stands there now is the reserve and the
  // reserve is the second team. This is what makes killing air defense worth
  // doing in a world where it comes back: the work is not undone, it is
  // permanently capped. Finish a battery once and that ground never carries
  // more than 60% of the threat it opened the war at, however many nights
  // Tehran is given to work on it.
  const repairCeiling = (t) =>
    (t.type === 'airdefense' && t.killedOnce) ? AD_RECONSTITUTION.cap : 100;

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
    // Transport and power (see INFRA_RESUPPLY). The same argument one line up
    // and a different half of it: oil starves the machines, this breaks the way
    // parts and crews reach them. Counted off the whole class rather than off
    // named ids so adding a fifth bridge is a data change, and denominated on
    // the class size for the same reason — a hardcoded /4 becomes a silent
    // rebalance of every other entry the day someone adds one.
    const infra = TARGETS.filter(t => t.type === 'infra');
    if (infra.length) {
      const left = infra.reduce((n, t) => n + t.hp / 100, 0) / infra.length;
      eff *= 1 - INFRA_RESUPPLY.weight * (1 - left);
    }
    // The northern lifeline (see CASPIAN_REPAIR). Spares that cannot come
    // overland through a war zone come across the Caspian, and the night the
    // flotilla goes down at Bandar-e Anzali the berths go with it and Moscow
    // discovers the closed sea is not closed. Permanent — a hull is on the
    // bottom or it is not, so this never comes back.
    const caspian = TARGETS.find(t => t.id === 'ship-caspian');
    if (caspian && caspian.hp <= 0) eff *= CASPIAN_REPAIR;

    const back = [];
    const returned = [];
    for (const t of TARGETS) {
      if (!wearsDown(t) || t.hp >= repairCeiling(t)) continue;
      if (G.struckThisTurn.includes(t.id)) continue;   // still burning
      // ---- the reserve moves ----
      // Rubble does not repair; a destroyed site is replaced. The `quiet` window
      // is the decision: go back and keep the wreckage smoking and it stays
      // wreckage, because the reserve will not roll a battery into a place that
      // is still being serviced nightly. This runs on the national repair
      // effort like everything else, so a decapitated command chain and a
      // wrecked fuel network slow it down too.
      if (t.hp <= 0) {
        if (t.type !== 'airdefense') continue;
        if (G.turn - (t.lastStruck || 0) < AD_RECONSTITUTION.quiet) continue;
        const wasDown = t.status === 'destroyed';
        t.hp = Math.min(AD_RECONSTITUTION.cap,
          t.hp + Math.max(1, Math.round(AD_RECONSTITUTION.rate * eff)));
        syncStatus(t);
        MapView.updateTarget(t);
        // The player is told the belt is back, and NOT told how strong it is —
        // observe() is deliberately not called. The stale intel record from
        // before the site died is what the estimate keeps working from, which
        // means the band opens up over exactly the nights the threat is
        // returning. That is the collection tasking earning its slot.
        if (wasDown) returned.push(t.short);
        continue;
      }
      const rate = Math.max(1, Math.round(TARGET_REPAIR[t.type] * eff));
      t.hp = Math.min(repairCeiling(t), t.hp + rate);
      syncStatus(t);
      MapView.updateTarget(t);
      // Note what is happening, not by how much: nobody is standing over these
      // sites with a clipboard. The player knows the crews are working and can
      // see their own estimate widen — the exact number is the thing they are
      // being asked to buy with an ISR tasking.
      back.push(t.short);
    }

    const out = [];
    if (back.length) {
      out.push({
        cls: 'iran', title: 'DAMAGED SITES RECONSTITUTING OVERNIGHT', internal: true,
        text: 'Overhead imagery shows work parties at every site CENTCOM did not revisit — craters filled, ' +
          'spare radars trucked out of the dispersal revetments, generators and crews moved in from the ' +
          `interior. Work assessed under way at: ${back.join(' · ')}. How much of it they got back is a ` +
          'question for the analysts, and the longer nobody looks, the wider that answer gets. Damage that ' +
          'is not followed up is damage that does not stay done.',
      });
    }
    // A battery returning to a site the campaign wrote off is not a repair
    // report, it is a change to the threat — and the player has been planning
    // against a map that says that place is dead. It gets its own line, and it
    // is not marked internal: engagement radars coming back up over a country
    // full of Western aircraft is not a secret, it is the news.
    if (returned.length) {
      out.push({
        cls: 'iran', title: `AIR DEFENSES RETURN — ${returned.join(' · ')}`,
        sum: `SAM coverage restored at ${returned.length} site${returned.length === 1 ? '' : 's'}`,
        text: 'Sites CENTCOM assessed as destroyed are radiating again. This is not the work parties ' +
          'patching craters — the launchers and the engagement radars that died there are still dead. ' +
          'What has happened is that Tehran has moved batteries forward out of the national reserve and ' +
          'put them on the same ground, because the ground was never the point and the country has more ' +
          'systems than the target list has lines. They are older, the crews are worse, and there is less ' +
          'of it than there was. It is also enough to start killing aircraft again. The belt was never ' +
          'something the campaign finished; it is something the campaign holds down, and it has not been ' +
          'held down for three nights.',
      });
    }
    return out;
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
  //
  // It is NOT read back inside the retaliation report. The vote is the one event
  // in the campaign that rewrites the rules for the remaining fifteen turns, and
  // stacked eleventh in a list of battle damage assessments it read as one more
  // line to collapse — players finished the night not knowing the oil complex
  // had just come off the list by law. It gets its own dialog
  // (`UI.showWarPowers`), which is why the event carries `record` and `bars`:
  // what the floor was weighing, and what it took away.
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

    // What the floor was weighing, as the president can check it afterwards. The
    // score itself stays off screen — a number would turn the vote into a dial to
    // farm. These are the facts it is made of, in the order the score reads them.
    const record = [
      ['PUBLIC APPROVAL', Math.round(G.approval) + '%'],
      ['AMERICAN DEAD', `${G.casualties.us} against ${casualtyLimit()} the country will bear`],
      ['STANDING ABROAD', Math.round(G.world) + (G.coalition ? ' — coalition flying with us' : ' — no coalition')],
      ['THE CASE MADE TO THE COUNTRY', G.addresses
        ? Txt.plural(G.addresses, 'address') + ' from the Oval Office'
        : 'never — no address to the nation'],
      ['SOMETHING TO SHOW FOR IT', 'nuclear program ' + Math.round(G.nukeDegraded()) + '% degraded'],
    ];
    if (G.hostageCrisis) record.push(['HOSTAGES', 'Americans still held in Iran']);

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
      movePublic(8);
      return {
        cls: 'friendly', title: 'CONGRESS AUTHORIZES THE USE OF FORCE',
        text: 'The joint resolution passed both chambers with votes to spare. The campaign has a legal ' +
          'mandate through its conclusion, the supplemental is attached, and the leadership of both ' +
          'parties stood behind the podium to say so. Members who spent last week briefing against this ' +
          'war spent this morning explaining that they always supported it. Whatever happens now, it is ' +
          'the country\'s war and not just yours.',
        dApproval: 8,
        record, bars: [],
      };
    }

    if (score >= 28) {
      // what gets restricted is what the Hill is angriest about
      G.warPowers.result = 'restricted';
      G.warPowers.noOil = true;
      G.warPowers.noDeep = G.world < 45;
      movePublic(-3);
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
        record,
        // Worded as the target classes appear on the board, not as the amendment
        // reads: this is the list the president has to plan around tomorrow, and
        // it has to match what the strike modal will refuse (see legallyBarred).
        bars: ['Iranian energy infrastructure — refineries, terminals, the export system, the oil lid.']
          .concat(G.warPowers.noDeep
            ? ['Anything outside the declared theater — the far northwest and the Caspian littoral.']
            : []),
      };
    }

    G.warPowers.result = 'cutoff';
    return { cutoff: true };
  }

  // What the Hill has taken off the table. Checked in the strike path and shown
  // in the planning modal, so a barred target reads as barred rather than broken.
  // What the RESOLUTION took off the table, as opposed to what tonight's plan or
  // the tanker tracks did. Split out from barred() because the two answer
  // different questions and one of them outlives the turn: the ATO wall clears
  // when the night ends, an amendment does not. iranBroken() reads this one so
  // the victory condition is scored against the target list the president was
  // legally left with (see the note there).
  function legallyBarred(t) {
    if (!G.warPowers || !G.warPowers.result) return null;
    if (G.warPowers.noOil && (t.type === 'oil' || t.energy)) return 'Prohibited by the War Powers resolution — no strikes on Iranian energy infrastructure.';
    if (G.warPowers.noDeep && (t.depth || 2) >= 3) return 'Prohibited by the War Powers resolution — outside the declared theater.';
    return null;
  }

  function barred(t) {
    // The night's plan is spent. Shown here rather than only on the package rows
    // so the map itself says it — a player clicking around a board where every
    // target answers "click to plan strike" and every modal then refuses is
    // being made to discover the rule one target at a time.
    //
    // Except against a hull the boat can shoot at: she is not on the tasking
    // order (see atoOver), so a target holding a submarine option is still a
    // target, and the air packages inside it carry the refusal themselves.
    if (!t.packages.some(p => p.sub)) {
      const wall = atoWall();
      if (wall) return wall;
    }
    // The amendment the Hill actually passed says "Iranian energy
    // infrastructure", and a two-thousand-megawatt power station is that in
    // every sense a member of Congress means it. So the bar reads the `energy`
    // flag as well as the oil type: the restricted vote takes the generating
    // plants off the list along with the refineries and leaves the rail
    // crossings on it, which is what the text of the resolution says and not a
    // separate rule. A president who has built a campaign on the grid loses
    // half of it mid-war — telegraphed by the amendment's own wording, and one
    // more reason the vote is worth working before it happens.
    const law = legallyBarred(t);
    if (law) return law;
    // Two different unreachables, and they must not share a sentence: one is a
    // permission that was withdrawn and can be won back, the other is a hull
    // that is in the wrong ocean and can be sent for. A player told the second
    // problem in the first problem's words goes looking at world opinion.
    if (!canReach(t)) {
      return t.theater === 'yemen'
        ? 'Out of range: the Lincoln is in the Gulf of Oman and this is the Red Sea. Nothing in theater ' +
          'reaches the Yemeni coast except the Ford — order the second carrier group from THEATER FORCES, ' +
          'or leave this front to Riyadh.'
        : 'Unreachable: with Gulf basing and overflight revoked there is no tanker track that puts a package this deep.';
    }
    if (t.type === 'tel' && !t.located) return 'No fix. Dispersed launchers cannot be planned against until ISR finds them.';
    // A box is not an aimpoint. This is reachable from the picker sheet and from
    // a suspected box the player clicks on, and it has to say which of the two
    // problems it is — there is nothing wrong with the weapon or the tanker plan.
    if (t.covert && !t.found) return 'No aimpoint. The analysts have activity in this area and nothing precise enough to task a package against. Work the target folder from the Intelligence panel.';
    // Belt, not braces. `plotted` already keeps a held aimpoint off the board and
    // out of every caller's hands, so nothing should arrive here holding one —
    // but every OTHER absence on the list routes its refusal through this
    // function, and leaving the one gap is how the next entry point re-opens it.
    // Tour.demoTarget was that entry point once already.
    if (t.held && !t.released) return 'Not on the tasking order. The joint targeting cycle has not released this aimpoint yet — it is being staffed, and it will appear on the plot when it is.';
    return null;
  }

  // ---- diplomacy ----
  // Intelligence taskings and diplomacy draw from two separate one-per-turn
  // slots: knowing and doing no longer compete for the same action.
  // Which slot an order spends. A tasking missing from this list silently spends
  // the DIPLOMATIC slot instead — it still runs, the panel still renders it under
  // Intelligence, and the only symptom is that State lost its night. Anything
  // added to the intel panel goes in here too.
  const INTEL_ACTIONS = ['bda', 'hunt', 'assess-nuclear', 'assess-intent', 'isr-prep', 'folder'];
  function doDiplo(action) {
    if (G.over || busy()) return;
    const isIntel = INTEL_ACTIONS.includes(action);
    if (isIntel ? G.intelUsed : G.diploUsed) return;
    const events = [];

    switch (action) {
      case 'backchannel': {
        G.stats.backchannels++;
        if (G.negotiationReady()) {
          // Odds are driven by how badly Iran is losing, not by how calm things
          // are, and they live on G.dealOdds() rather than here because the
          // panel quotes them before the president spends the slot. A dead
          // leadership is leverage at the table rather than a shortcut to it: a
          // lasting bonus while the pragmatists hold on, plus the sharper
          // temporary one during the immediate power vacuum.
          const p = G.dealOdds();
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
          movePublic(-2);
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
          text: 'US diplomats rally broad condemnation of the attack on Al Asad. Russia and China block binding action but the diplomatic cover is valuable.',
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
        // allied squadrons fly from land — they survive whatever happens afloat.
        // Whose squadrons depends on the world: above the line the RAF is flying
        // your missions, below it London has refused offensive operations and
        // these are Gulf airframes off Gulf runways. France sends nothing either
        // way. The capacity is deliberately identical across both — the reward
        // for keeping the world on side is which war you are seen to be fighting
        // and who says so out loud, not two extra sorties a night.
        G.alliedFighters += 2;
        syncFleetCaps();
        G.res.fighters = Math.min(G.res.fighters + 2, G.caps.fighters);
        // Read after the +5 above, so the number the player is looking at on the
        // cable is the same number that decided what the cable says and which
        // version of each call they are about to get.
        const tone = G.world > LEADER_STRONG_WORLD ? 'strong' : 'standard';
        events.push({
          cls: 'world', title: 'Strike coalition assembled',
          text: tone === 'strong'
            ? 'The UK and the Gulf partners formally join the operation, with the RAF committed to joint strikes. France signs the political declaration without committing aircraft. Allied squadrons add sortie capacity and share the political burden.'
            : 'The Gulf partners join the operation and open their bases. London contributes basing, intelligence and sanctions but will not fly offensive missions; Paris signs the declaration and nothing else. Allied squadrons add sortie capacity and share the political burden.',
          dWorld: 5,
        });
        // The two capitals whose answer is worth hearing ring the White House,
        // in the order the alliance actually works: London is on the line before
        // the cable has finished going out, Paris comes the following night once
        // the Élysée has read the room. How much either one is bringing depends
        // on the world — see WORLD_LEADERS.
        //
        // What they say is fixed here rather than at pickup: they are reacting
        // to the world as it stood the moment the coalition formed, and a war
        // that turns ugly overnight should not retroactively cool a call that
        // was already placed.
        //
        // Appended rather than assigned: the queue is no longer only the
        // coalition's, and Jerusalem's warning may already be in it — answered
        // or still ringing. Overwriting it would drop the record that the call
        // was placed, which is the once-a-campaign guard warningCall() reads.
        G.leaderCalls = (G.leaderCalls || []).concat([
          { who: 'uk', tone, turn: G.turn, answered: false },
          { who: 'france', tone, turn: G.turn + 1, answered: false },
        ]);
        break;
      }
      case 'israel': {
        if (G.israelPosture !== 'sidelined') return;
        G.israelPosture = 'coordinated';
        G.israelJointAvailable = true;
        syncJointPackages();
        G.world = clamp(G.world - 8, 0, 100);
        G.oil += 5;
        G.alliedFighters += 2;
        syncFleetCaps();
        G.res.fighters = Math.min(G.res.fighters + 2, G.caps.fighters);
        events.push({
          cls: 'world', title: 'Israel brought into the operation',
          text: 'Jerusalem folds its strike planning into CENTCOM\'s. IAF squadrons add sortie capacity, the tasking order grows by half a package a night on their escort and SEAD, and a combined deep-strike package is available against Natanz or Fordow — the first path to the buried halls that does not require a B-2. From here their impatience works FOR you: every time Jerusalem reaches the end of it they fly inside your plan and the joint option comes back on the board. The price is paid abroad, nightly. Arab partners who were quietly helping now have to be publicly seen not to, standing abroad will not recover as far as it did, and Tehran has been handed the war it wants to fight — Israel is a legitimate target in every Iranian broadcast from tonight.',
          dWorld: -8, dOil: 5,
        });
        break;
      }
      // Asking Jerusalem to wait. The only lever on the gauge that does not
      // involve flying, and the only diplomatic action in the game billed to
      // approval instead of standing abroad: restraining Israel in public is a
      // domestic cost for a wartime president, and it lands on the Hill's
      // arithmetic when the authorization comes up. It is deliberately a
      // depreciating asset — the third promise buys a third of the first one at
      // three times the price, and there is no fourth.
      case 'restrain': {
        if (G.israelPosture !== 'sidelined' || G.israelHolds >= ISRAEL.holdMax) return;
        const cost = israelHoldCost();
        G.israelHolds++;
        G.israelHold = ISRAEL.holdTurns;
        G.israelPressure = clamp(G.israelPressure - cost.relief, 0, ISRAEL.fly);
        movePublic(-cost.approval);
        events.push({
          cls: 'friendly', title: 'Jerusalem agrees to hold',
          text: `You call the Prime Minister and ask for time. You get it — ${Txt.turns(ISRAEL.holdTurns)} of it, ` +
            `on your word that the program will be dealt with. Israeli readiness comes off the boil and the ` +
            `pressure for a unilateral strike falls ${cost.relief} points. ` +
            (cost.left - 1 <= 0
              ? 'It is also the last time this call works. Jerusalem has extended the last of its credit; there is no further extension to ask for.'
              : `The call leaked before you hung up, and the coverage at home is that the President was told no and asked twice. ` +
                `${Txt.plural(cost.left - 1, 'further request')} would be entertained, each worth less than this one.`),
          dApproval: -cost.approval,
        });
        break;
      }
      // ---- the Gulf council ----
      // Three orders, all on the diplomatic slot, and each one buys from a
      // different camp at a price that camp can actually charge. Deliberately
      // NOT a second budget — see the DIPLOMATIC ACTIONS note above renderDiplo
      // in ui.js, which applies here word for word.

      // The dove-facing lever, billed at home for the same reason asking
      // Jerusalem to hold is — a week of the president reassuring Gulf monarchies
      // is a week of coverage about what Gulf monarchies want out of an American
      // war. Depreciating, and there is no fourth.
      case 'gcc': {
        const cost = gulfSummitCost();
        if (cost.left <= 0) return;
        G.gulf.summits++;
        G.gulf.strain = clamp(G.gulf.strain - cost.relief, 0, GULF.fly);
        movePublic(-cost.approval);
        events.push({
          cls: 'friendly', title: 'GCC summit — the council is held together',
          text: `You fly to Riyadh and sit through two days of it. What you get is real: the caveat papers ` +
            `already drafted go back in the folder, the pressure for an American end state comes off ` +
            `${cost.relief} points, and Doha stops briefing against the campaign for a while. What it costs ` +
            `is the photograph — an American president in a Gulf palace explaining a war, at home, in week ` +
            `two. ` +
            (cost.left - 1 <= 0
              ? 'It is also the last one that works. There is no third summit; the next council meets without you.'
              : `${Txt.plural(cost.left - 1, 'further summit')} would be worth having, each less than this one.`),
          dApproval: -cost.approval,
        });
        break;
      }

      // The hawk-facing lever, and the only order in the game priced in the
      // fleet's own magazine. That is the honest bill: there is one interceptor
      // stock in the theater, and putting it over Manama and Abu Dhabi is taking
      // it off Al Udeid and Al Dhafra. It buys the hawks outright and it makes
      // the next Iranian salvo worse — which is exactly the trade a president
      // makes when they decide the alliance matters more than tonight.
      case 'patriots': {
        if (G.gulf.patriots >= GULF.patriotMax) return;
        const spend = Math.round(bmdCapacity() * GULF.patriotBmd);
        if (G.bmdPool < spend) return;
        G.gulf.patriots++;
        G.bmdPool -= spend;
        G.gulf.resolve = clamp(G.gulf.resolve + GULF.patriotResolve, 0, GULF.fly);
        events.push({
          cls: 'friendly', title: 'Patriot batteries released to Manama and Abu Dhabi',
          text: `Two batteries and the rounds behind them come off the American track and go to the hosts. ` +
            `${Txt.plural(spend, 'interceptor')} out of the theater stock, which is the screen's stock — ` +
            `Al Udeid and Al Dhafra are thinner tonight than they were this morning, and Tehran does not ` +
            `have to be told. What you have bought is the hawks: Manama and Abu Dhabi have what they have ` +
            `been asking twenty years for, and they will spend the rest of this war remembering who gave ` +
            `it to them.`,
        });
        break;
      }

      // The order the whole hawk gauge exists to make possible. Deep reach dies
      // with the bloc — canReach is one boolean — and this is the insurance
      // against that, bought with the goodwill the gift ladder would otherwise
      // have spent on tankers and interceptors. Spending the gauge to zero is the
      // point: it is a real choice against the ladder and not a thing collected
      // on the way past.
      case 'corridor': {
        if (G.gulf.corridor || G.gulf.resolve < GULF.corridorAt) return;
        G.gulf.corridor = true;
        G.gulf.resolve = 0;
        movePublic(GULF.corridorApproval);
        events.push({
          cls: 'friendly', title: 'Amman and Kuwait City guarantee the northern corridor',
          text: 'Jordan and Kuwait have signed a bilateral arrangement outside the council: the ' +
            'northwestern tanker tracks and the overflight behind them stay open to American strike ' +
            'packages regardless of what the GCC files. It is not popular in either capital and both ' +
            'governments will spend something at home for it. What it means for this campaign is that ' +
            'Tabriz and the Caspian stay on the target list even if Riyadh and Doha close the Gulf — the ' +
            'one thing the council can take away that you have now bought back in advance. Their goodwill ' +
            'is spent to the last point. They will rebuild it; they have not got it now.',
          dApproval: GULF.corridorApproval,
        });
        break;
      }

      case 'address': {
        if (G.addressCooldown > 0) return;
        G.addressCooldown = 2;
        G.addresses++;
        // THE COUNTRY STOPS TUNING IN, and this was the single largest hole in
        // the old model. A flat +6 on a two-turn cooldown, unlimited, made the
        // Oval Office address worth +23.2 a campaign measured over 200 — more
        // than four times what destroying the entire Iranian nuclear program
        // paid, and about a third of everything a president earned all war. It
        // was not a decision, it was a button, and the optimal line in a game
        // about running a war was to go on television every other night.
        //
        // The ladder is steep on purpose: the first address is a real event and
        // the fifth is a president with nothing new to say, which is the thing
        // the networks notice first. It never reaches zero — there is always
        // somebody watching — but at 1 it has stopped being a strategy.
        //
        // It stays worth giving for two reasons that are not approval at all:
        // `G.addresses` is +5 apiece in the War Powers score, and the after-
        // action grade scores the case made to the country on its own row.
        const ADDRESS_LADDER = [6, 4, 2, 1];
        const gain = ADDRESS_LADDER[Math.min(G.addresses - 1, ADDRESS_LADDER.length - 1)];
        const landed = movePublic(gain);
        events.push({
          cls: 'friendly', title: 'Oval Office address',
          text: 'You lay out the stakes to the American people: the attack, the objectives, and what victory ' +
            'requires. ' + (G.addresses === 1
              ? 'The networks carried it live and the country watched. The rally effect is real, for now — ' +
                'and every one of these is a vote on the floor when the authorization comes up.'
              : G.addresses <= 3
                ? 'The audience is smaller than last time and the coverage afterwards is shorter. It still ' +
                  'moves people, and it is still a vote on the floor when the authorization comes up.'
                : 'Two networks took it live and the third stayed with its schedule. There is nothing in the ' +
                  'speech the country has not already heard from you, and the panels afterwards say so. It ' +
                  'is a vote on the floor when the authorization comes up, which is now most of what it is for.'),
          dApproval: landed,
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
        movePublic(2);
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
        // sharpen the picture on whatever the analysts are least sure about.
        // The panel disables this tasking when the list is empty, so the guard
        // below is a backstop rather than a path the player can normally reach.
        const stale = staleEstimates();
        if (!stale.length) {
          events.push({
            cls: 'friendly', title: 'BDA tasking — nothing worth the sortie', internal: true,
            text: 'The analysts report the current picture is as good as overhead can make it. There is ' +
              'nothing on the list stale enough to be worth a collection deck tonight.',
          });
          break;
        }
        // logged after the observe, because what goes in the record is the
        // number the event text below is about to read out — not the stale one
        // that made the site worth the sortie
        for (const { t } of stale) { observe(t, true); logReading(t); }
        events.push({
          cls: 'friendly', title: 'BATTLE DAMAGE REASSESSMENT COMPLETE', internal: true,
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
          cls: 'friendly', title: 'ENRICHMENT ASSESSMENT UPDATED', internal: true,
          text: est.halted
            ? 'The IC has worked the problem with everything it has. The judgement is unanimous and it is ' +
              'the one you wanted: enrichment capability is destroyed. There is no breakout timeline ' +
              'because there is no longer a program to time.'
            : est.undeclared
              ? `Every hall on the declared program is rubble and the centrifuges are still turning. ` +
                `Revised judgement: Iran is ${est.lo}–${est.hi} turns from a device, ${est.conf} ` +
                `confidence, and none of that capacity is at Natanz or Fordow. The Director put it ` +
                `plainly — we are now timing a program we never had a declaration for.`
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
      case 'folder': {
        // the collection deck worked against the holes in the order of battle
        // rather than against a site. The panel drops the tasking when there is
        // nothing outstanding, so the guard is a backstop.
        const ev = workFolder();
        if (!ev) return;
        events.push(ev);
        break;
      }
      case 'assess-intent': {
        if (G.postureKnown) return;
        G.postureKnown = true;
        const P = IranAI.posture();
        events.push({
          cls: 'friendly', title: `IRANIAN WAR PLAN ASSESSED — ${P.name}`, internal: true,
          text: `${P.brief} The tell the analysts built this on: ${P.tell}. Knowing it does not make any ` +
            'of it stop — what it does is tell you which of their arms is the one worth spending the ' +
            'campaign on.',
        });
        break;
      }
      default: return;
    }

    if (isIntel) G.intelUsed = true; else G.diploUsed = true;
    // TONIGHT'S BRIEF IS RESTAGED, because the answer to a slot order is the one
    // thing the rest of the folder should have been argued from. coaOptions() is
    // cached by turn (see coaCache) so the menu cannot rewrite itself under a
    // president who is reading it — but that rule was written about their own
    // STRIKE orders, which move the magazine and nothing else. A slot order moves
    // the BOARD: a hunt fixes a launcher group that was not an aimpoint an hour
    // ago and whose own prose promises it "can be serviced — tonight", a worked
    // folder puts a covert box on the plot, and coordinating with Jerusalem
    // re-arms the joint deep-strike package against the buried halls. Without
    // this the staff briefs the pre-tasking night, which makes the intelligence
    // room coming first in the folder (v1.91) decorative — resumeBrief already
    // re-reads the slate for exactly this reason and was being handed the cached
    // one back.
    //
    // Unconditional, and safe to be: the brief is PURE, so a tasking that moved
    // nothing rebuilds the identical three options and the president sees no
    // rewrite at all. And it lands behind a dialog either way — the product or
    // the cable is on screen, and on easy the folder has stood itself down and
    // walks back in through resumeBrief once that is read.
    coaCache = { turn: -1, list: null };
    G.stats.peakOil = Math.max(G.stats.peakOil, G.oil);
    AudioSys.play('cable');
    UI.renderAll(G);
    // the coalition cable is the one that leaves a phone ringing behind it —
    // the call goes in front of afterAction rather than instead of it
    const after = () => maybeLeaderCall(afterAction);
    // an intelligence tasking comes back as a product, not a cable — it spends
    // the intel slot rather than the diplomatic one, and the player should be
    // able to tell at a glance which of the two they spent
    UI.showReport(isIntel ? 'INTELLIGENCE PRODUCT' : 'DIPLOMATIC CABLE',
      events, after);
  }

  // ---- the head-of-government call ----
  // One popup, two occasions. The coalition's two allies ring to thank the
  // president: taking it is +1 world opinion, refusing it -1, and the swing is
  // deliberately trivial — that is a courtesy, not a lever, and a president who
  // cannot spare ninety seconds for an ally who just committed their own
  // aircrew should pay for it in exactly the currency the snub is denominated
  // in and nothing else. Jerusalem rings for the opposite reason, the night
  // before it goes alone. What each answer is worth is on the leader
  // (`stakes` in WORLD_LEADERS), because those two calls have nothing in
  // common but the telephone.

  // A call nobody has answered yet whose turn has come round. The queue is in
  // order, so this is always the earliest one outstanding.
  const pendingLeaderCall = () =>
    (G.leaderCalls || []).find(c => !c.answered && G.turn >= c.turn) || null;

  // Nobody in the situation room is put through the instant the president stops
  // reading. The pause is the switchboard: the cable goes out, or the night's
  // damage is acknowledged, and then — a beat later — the phone rings.
  const CALL_DELAY = 3000;

  // Fire the outstanding call, if there is one, CALL_DELAY after whatever the
  // player was just looking at. `done` runs either way and exactly once, so a
  // caller can hand its continuation straight through.
  //
  // KNOWN, PRE-EXISTING, AND DELIBERATELY LEFT ALONE HERE. The board under the
  // pause is live — the popup is modal, the three seconds in front of it are
  // not — so a president who spends a free action inside the window ends that
  // action's report on a second maybeLeaderCall against the same unanswered
  // call, and the popup owns one set of DOM nodes. Jerusalem's warning makes
  // that window reachable in about a third of campaigns rather than only off
  // the coalition cable. It wants a fix and the fix is not free: guarding it
  // with a "already ringing" flag moves 654 of 1440 campaigns and swings easy
  // by 8-30 points of win rate, because the continuations that pile up behind
  // the call are the brief chain on the one level that is played through it.
  // That is a measured change to how the game plays and it does not belong in
  // the same commit as a phone call.
  function maybeLeaderCall(done) {
    if (!pendingLeaderCall()) { if (done) done(); return; }
    setTimeout(() => leaderCall(done), CALL_DELAY);
  }

  function leaderCall(done) {
    const call = pendingLeaderCall();
    const L = call && WORLD_LEADERS.find(l => l.id === call.who);
    if (!L) { if (done) done(); return; }
    // which take of the call this is — see WORLD_LEADERS in data.js. Falls back
    // to the hedged one, which is the version that is always safe to play.
    const V = L[call.tone] || L.standard;
    UI.openLeaderCall(L, V,
      // banked the instant they answer, not when the popup closes: the call
      // itself runs the better part of ten seconds and a tab closed mid-sentence
      // must not lose a decision the player already made
      (accepted) => {
        call.answered = true;
        // What answering was worth comes off the leader, not off this function:
        // the coalition's two ring to thank the president and Jerusalem's rings
        // to warn them, and those cannot share a pair of literals. Unscaled by
        // difficulty on purpose — `applyEvent`'s retaliation multiplier is for
        // what Tehran does to the country, and a president declining to pick up
        // the phone costs the same on every setting.
        const s = (L.stakes && L.stakes[accepted ? 'accept' : 'decline']) || {};
        if (s.world) G.world = clamp(G.world + s.world, 0, 100);
        if (s.approval) movePublic(s.approval);
        UI.renderAll(G);
        Save.write();
      },
      () => { UI.renderAll(G); if (done) done(); });
  }

  // ---- Israel's own clock ----
  // Runs every turn for the whole campaign. The gauge moves first, then it is
  // tested — so a night that services Jerusalem's list can pull them back off a
  // launch they were one turn from, which is the entire point of giving the
  // player a target list they can read.
  //
  // The promise to hold is paid down here rather than in the diplomacy handler,
  // for the same reason crew-rest debt is: a countdown that only ticks on turns
  // the player did something is not a countdown, it is a trap.

  // ---- the night before ----
  // Jerusalem does not go up out of a clear sky at a president they are still
  // talking to. One turn out from a unilateral launch the Prime Minister rings
  // the White House personally and says so — the only call in the game that is
  // not a courtesy, placed through the same secure-line popup as London's and
  // Paris's (see the Israeli entry in WORLD_LEADERS).
  //
  // Read off israelEta() rather than a second threshold of its own, so the
  // night the Prime Minister says "tomorrow" is the same night the ALLIES panel
  // and every advisor line are already saying it: eta 1 IS tomorrow night. A
  // warning with its own cut could tell the president one thing while the gauge
  // beside it told them another, which is the bug the ETA projection exists to
  // have stopped.
  //
  // Only from SIDELINED, and it is checked here rather than being folded into
  // the eta because the two facts mean different things: a coordinated Israel
  // is already inside the tasking order and has nothing to threaten, and a
  // unilateral one carried the threat out the first time the gauge filled.
  //
  // Once a campaign, guarded off the QUEUE rather than a new flag on G. An
  // entry in `leaderCalls` is already the record that this call was placed, it
  // is already on FIELDS, and a president who saved the war with the phone
  // ringing resumes with it ringing — none of which a second field would do
  // better, and it would need a VERSION bump to do at all.
  //
  // Nothing here is guaranteed: a salvo that lands on Israel is worth 8 on a
  // gauge whose ambient climb is 3.5, so a bad night can carry Jerusalem from
  // two turns out to airborne without ever standing on one. That is honest —
  // the night Iranian warheads land in Tel Aviv is not the night the Prime
  // Minister calls to discuss coordination — and it is the reason the call is a
  // warning rather than a promise.
  function warningCall() {
    if (G.israelPosture !== 'sidelined') return;
    if ((G.leaderCalls || []).some(c => c.who === 'israel')) return;
    if (israelEta() !== 1) return;
    // Queued for tonight, which means it rings after the night's reports at the
    // turn boundary — the president reads what the war did, and then the phone
    // goes. `tone` is the only take there is: this call does not soften with
    // world opinion, because it is not about the United States' standing.
    G.leaderCalls.push({ who: 'israel', tone: 'standard', turn: G.turn, answered: false });
  }

  function israelTurn() {
    if (G.israelHold > 0) G.israelHold--;

    for (const [amt] of israelDrivers()) G.israelPressure += amt;
    G.israelPressure = clamp(G.israelPressure, 0, ISRAEL.fly);

    // An ally in the war keeps its own calendar. Past `earlyFloor` they may
    // simply go tonight — not from a standing start, so a president reading the
    // gauge can see the weather turning even though they cannot know the day.
    // A sidelined Israel is held by the gauge and nothing else: they are not in
    // this war yet, and there is no ally to be unpredictable about.
    const early = G.israelPosture !== 'sidelined' &&
      G.israelPressure >= ISRAEL.earlyFloor && Math.random() < ISRAEL.earlyFly;
    if (G.israelPressure < ISRAEL.fly && !early) { warningCall(); return null; }

    // They are going. Posture decides whose war it is — and a sidelined Israel
    // that reaches this point is a sidelined Israel no longer: the first
    // unilateral sortie moves them there permanently, and the world never gets
    // over it (see the news-cycle drift, which stops recovering entirely).
    if (G.israelPosture === 'sidelined') G.israelPosture = 'unilateral';
    const coordinated = G.israelPosture === 'coordinated';
    const E = ISRAEL.effect[coordinated ? 'coordinated' : 'unilateral'];
    G.israelPressure = ISRAEL.after;
    G.israelSorties++;
    G.israelHold = 0;   // whatever was promised is moot; they flew

    // One aimpoint, worked over by somebody else's air force. Returns true if
    // anything came of it; the BDA is sharp either way, because CENTCOM watched
    // this happen and an ally's battle damage is not an estimate.
    const service = (t, out) => {
      const kill = t.hardened ? E.hardKill : E.kill;
      const dmg = t.hardened ? E.hardDamage : E.damage;
      const roll = Math.random();
      if (roll < kill) damageTarget(t, 100);
      else if (roll < dmg) damageTarget(t, wearsDown(t) ? PKG_DAMAGE : 50);
      else return false;
      out.push(`${t.name} ${t.status}`);
      G.intel[t.id] = { hp: t.hp, turn: G.turn, sharp: true };
      return true;
    };

    // What they hit: their own list, worst-condition-first among what is still
    // standing, because a half-wrecked hall is where an air force with one night
    // and no penetrators can actually finish something. Nothing here consults the
    // American target list — that is the difference between an ally and an asset.
    // Inside the tasking order they fly a wider night: American tankers and
    // American SEAD are the difference between two aimpoints and three.
    const avail = israelPriorities().filter(t => t.hp > 0)
      .sort((a, b) => a.hp - b.hp)
      .slice(0, coordinated ? ISRAEL.coordAimpoints : ISRAEL.aimpoints);
    const hits = [];
    for (const t of avail) service(t, hits);

    // ---- and the part nobody agreed to ----
    // The civil infrastructure class, serviced by an ally who has decided that
    // breaking Iran's ability to move and to generate is part of the war whether
    // Washington signed off or not. The military effect is real and it is the
    // same one the class always had (INFRA_RESUPPLY: Iran rebuilds slower after
    // a night like this). The bill is a flat surcharge below rather than each
    // site's own `worldOnKill`, because what is being charged for is not the
    // building — it is an American president having refuelled the aircraft.
    const civil = TARGETS.filter(t => t.type === 'infra' && t.hp > 0)
      .sort((a, b) => a.hp - b.hp).slice(0, ISRAEL.wildcardAimpoints);
    const wildHits = [];
    const wild = civil.length > 0 && Math.random() < ISRAEL.wildcard;
    if (wild) for (const t of civil) service(t, wildHits);

    const bda = hits.length
      ? `Assessed effects: ${hits.join('; ')}.`
      : 'Assessed effects: negligible. They spent the sortie and bought nothing.';
    // What the second half of the night did, in the language the wire will use.
    // Zero has to read as its own outcome here: a package that went for the grid
    // and missed is still a package that went for the grid.
    const civilBda = !wild ? ''
      : wildHits.length
        ? ` A second element went to targets that were on nobody's agreed list: ${wildHits.join('; ')}. ` +
          `Jerusalem's position is that a grid running centrifuges and a railway carrying reload rounds ` +
          `are military objects, and that they did not need to be asked.`
        : ` A second element went to the grid and the crossings — targets that were on nobody's agreed ` +
          `list — and came off them without effect. The intent is the story regardless; the imagery of ` +
          `the run is already on every network in the region.`;
    const nth = G.israelSorties > 1 ? ` — ${Txt.ordinal(G.israelSorties).toUpperCase()} ISRAELI NIGHT` : '';
    // Going early is a separate fact from going wide, and the report says which
    // it was: the gauge the player has been reading did not predict this one.
    const earlyNote = early
      ? ` The gauge in the Situation Room had them days out. Nobody in Washington was told this was tonight.`
      : '';

    // Coordinated, the night also puts the joint deep-strike option back on the
    // board. This is the payoff for keeping them inside the plan and it is
    // deliberately generous: it is the only renewable path into Fordow.
    let rearmed = false;
    if (coordinated && !G.israelJointAvailable) {
      G.israelJointAvailable = true;
      syncJointPackages();
      rearmed = true;
    }

    // The surcharge for a night that went past the list, on top of whatever the
    // posture already costs. It is the largest single approval charge any ally
    // can hand the president, and that is the honest size of it: the networks
    // will run the dark province against a White House that armed the aircraft.
    const wWorld = wild ? ISRAEL.wildcardWorld : 0;
    const wApproval = wild ? ISRAEL.wildcardApproval : 0;
    const wOil = wild ? ISRAEL.wildcardOil : 0;
    const landed = hits.length + wildHits.length;

    const ev = coordinated ? {
      cls: wild ? 'world' : 'friendly',
      title: wild
        ? `IAF PACKAGE FLOWN UNDER CENTCOM TASKING — AND PAST IT${nth}`
        : `IAF DEEP-STRIKE PACKAGE FLOWN UNDER CENTCOM TASKING${nth}`,
      sum: wild ? 'Israel went off the list' : 'Israel flew the plan',
      outcome: landed ? 'damaged' : 'miss',
      text: `The IAF flew a long-range package overnight against aimpoints on Jerusalem's list, fragged into the tasking order and refuelled off American tankers.${earlyNote} ${bda}${civilBda} It is a night of effects CENTCOM did not spend a package to buy — and the region has watched Israeli aircraft transit Arab airspace with American permission, which is the part that gets read out in every capital tomorrow.` +
        (rearmed ? ' The combined planning cell is warm again: one joint US–Israeli deep-strike package is back on the board.' : ''),
      dWorld: E.world + wWorld, dOil: E.oil + wOil, dApproval: E.approval + wApproval,
      israelSortie: true, alliedStrike: landed > 0,
    } : {
      cls: 'world',
      title: wild ? `ISRAEL STRIKES IRANIAN CITIES AND INFRASTRUCTURE${nth}` : `ISRAEL STRIKES IRAN UNILATERALLY${nth}`,
      sum: wild ? 'Israel hit the grid alone' : 'Israel flew alone',
      outcome: landed ? 'damaged' : 'miss',
      text: `Without notifying Washington, the Israeli Air Force flew a long-range package against ${G.israelSorties > 1 ? 'the target set again' : 'the enrichment sites'} overnight. The first CENTCOM knew of it was the radar picture. ${bda}${civilBda} Jerusalem's statement thanks the United States for its support. Every capital in the region believes you authorized this, and Tehran has said so on every frequency it owns. You no longer control the escalation — you only answer for it.`,
      dWorld: E.world + wWorld, dOil: E.oil + wOil, dApproval: E.approval + wApproval,
      israelSortie: true, alliedStrike: landed > 0,
    };
    // the aimpoints the strike actually reached, so the map can fly it — both
    // halves of the night, because the plot should show where they actually went
    ev.alliedTargets = avail.concat(wild ? civil : []).map(t => t.id);
    return ev;
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
    // WHAT THE COUNTRY WILL FORGIVE, which is the one thing difficulty never
    // scaled and the one clock that decides how much of the game anybody sees.
    // Measured at v1.72: 64% of all campaigns ended on DEFEAT — PRESIDENCY
    // COLLAPSES and 63% were over by turn 10 of 30, and easy bought about one
    // turn over hard because the table scaled the war (repair, coord, breakout,
    // interceptors) and never the domestic bill the war was actually lost on.
    //
    // This is deliberately a different axis from `scaled()` in ai.js and stacks
    // with it. That one asks how hard the ARM that fired can still hit — a fact
    // about Iran, true at every difficulty. This asks how much patience the
    // country has for the answer, which is the only honest thing an EASY setting
    // can mean in a game whose losing condition is political.
    //
    // Charged events only. The positive side is the president's own work — the
    // Oval Office address, a confirmed kill, an objective met — and a difficulty
    // that handed out cheaper wins as well as cheaper losses would be scaling
    // the scoreboard rather than the war. The floor of 1 holds at every level
    // for the same reason it holds in `bite()`: an American base was hit, and no
    // setting makes that cost nothing.
    //
    // `ev.dApproval` is REWRITTEN rather than the charge being scaled on the way
    // past, because the report chips and any prose function read the field. A
    // version that scaled only the arithmetic would show -2 on the line and take
    // -1 off the bar — the same class of bug aegisIntercept's rescale exists to
    // prevent.
    if (ev.dApproval < 0) {
      const r = diff().retaliation;
      if (r != null && r !== 1) ev.dApproval = -Math.max(1, Math.round(Math.abs(ev.dApproval) * r));
    }
    // The middle, and then — for the handful of events that are catastrophes
    // rather than setbacks — the base underneath it. `ev.erode` is opt-in and
    // rare by design: if ordinary bad news could reach the base there would be
    // no floor, and the floor is the whole model. It is applied AFTER the
    // charge so the night's push lands against the country that was there when
    // the news broke, not against the one it leaves behind.
    // REWRITTEN to what actually landed, for the same reason the retaliation
    // scaling above rewrites rather than scaling on the way past: the report
    // chips and any prose function read this field. Habituation and the bounds
    // both make the real move smaller than the asking price, and an event that
    // showed -2 on the line while taking -0.5 off the bar is precisely the bug
    // aegisIntercept's rescale exists to prevent.
    if (ev.dApproval) ev.dApproval = movePublic(ev.dApproval, ev.approvalClass);
    if (ev.erode) ev.erodedBase = erodeBase(ev.erode);
    if (ev.dOil) G.oil = Math.max(60, G.oil + ev.dOil);
    if (ev.dWorld) G.world = clamp(G.world + ev.dWorld, 0, 100);
    // An Iranian salvo that landed on Israel is an argument in Jerusalem, and
    // the events that carry one say so rather than the gauge trying to infer it.
    // Applied here so it lands whether the salvo was written by the AI or by a
    // set piece, and after the night's own climb — Tehran's answer moves TOMORROW
    // night's launch decision, not the one that already flew.
    if (ev.dPressure) G.israelPressure = clamp(G.israelPressure + ev.dPressure, 0, ISRAEL.fly);
    // Whose soil the salvo landed on. Same rule as dPressure — the event that
    // knows carries it, rather than the gauges trying to infer it from a title —
    // and applied here so a set piece and an AI-written salvo move the coalition
    // identically. A strike on Abqaiq or Doha is the one that carries BOTH: it
    // hardens the room and it frightens the host, which is exactly the argument
    // Tehran is trying to start.
    if (ev.dResolve) G.gulf.resolve = clamp(G.gulf.resolve + ev.dResolve, 0, GULF.fly);
    if (ev.dStrain) G.gulf.strain = clamp(G.gulf.strain + ev.dStrain, 0, GULF.fly);
    if (ev.hormuz) { G.hormuz = ev.hormuz; MapView.setHormuz(G.hormuz); }
    if (ev.mandab) { G.mandab = ev.mandab; MapView.setMandab(G.mandab); }
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

  // ---- the error boundary ----
  // The lock above has exactly ONE release site: setResolving(false) inside
  // close(), at the bottom of a callback chain five hops deep —
  //
  //   endTurn → playThen('strikeForce') → resolveTurn → resolveMissions
  //     → whenFootageDone → alliedStrike → [BDA report] → iranianResponse
  //     → animateIranianAttacks → [retaliation report] → close
  //
  // — and until this boundary existed there was not a single try in any of it.
  // So one throw anywhere in the night left `resolving` true forever: END TURN
  // hidden, the board inert under .turn-resolving, SKIP TO RESULTS useless
  // (it only cuts audio and fast-forwards, then leans on the same broken chain
  // to finish), and — because saving is gated on busy() — no way to even write
  // the save and reload out of it. One exception cost a 30-turn campaign, and
  // took away the one thing that would have salvaged it. That was the worst
  // single failure mode in the game.
  //
  // Every hop is wrapped in guard(). It has to be every hop, not one try/catch
  // around resolveTurn(): each of those arrows is a setTimeout, a rAF or a
  // click handler, so the callback unwinds into the browser's event loop, not
  // into its caller. A try around the outside would catch essentially nothing.
  let resolveGuard = false;    // a turn is inside the boundary right now
  let resolveWatchdog = 0;
  // Deliberately NOT on G and NOT in FIELDS: both are true only between END TURN
  // and close(), and busy() makes writing a save in that window impossible by
  // construction. A save can never observe them set.

  // A throw is not the only way this chain fails to reach close() — a callback
  // that simply never fires strands the lock in exactly the same way, and there
  // is nothing to catch. map.js already carries its own 9s and 12s watchdogs on
  // the two animation hops for the throttled-tab case; this one covers the legs
  // between them, and anything they miss.
  //
  // It cannot be one flat timeout from END TURN, because two hops wait on the
  // PLAYER: both reports sit open until dismissed, and a president who reads
  // slowly is not a stall. So it re-arms while any dialog is on screen, and
  // guard() re-arms it on every hop — each leg gets the full budget rather than
  // the whole night sharing one.
  const RESOLVE_TIMEOUT = 45000;

  function armWatchdog() {
    clearTimeout(resolveWatchdog);
    resolveWatchdog = setTimeout(() => {
      if (!resolveGuard) return;
      // a modal is up: the turn is waiting on a person, not stuck
      if (document.querySelector('.overlay:not(.hidden) .modal')) { armWatchdog(); return; }
      recoverFromResolution(new Error(`turn resolution stalled for ${RESOLVE_TIMEOUT}ms`));
    }, RESOLVE_TIMEOUT);
  }

  // Turns "campaign destroyed" into "strange turn, keep playing."
  function recoverFromResolution(err) {
    if (!resolveGuard) return;   // already recovered, or the turn handed on cleanly
    resolveGuard = false;
    clearTimeout(resolveWatchdog);
    console.error('CIC: turn resolution failed, recovering', err);

    // The map first, and through the teardown that already exists for this
    // rather than a second one written here. Raising fast-forward runs every
    // clipEnder and skipEnder in map.js — which is what sweeps alliedStrike's
    // `litter` set and closes any live scope or sonar card — and lowering it
    // takes the frozen salvo sprites back off the plot. It is the exact path
    // SKIP TO RESULTS uses, so it cannot drift out of step with map.js the way
    // a bespoke sweep here would.
    try { MapView.setFastForward(true); } catch (e) { console.error(e); }
    try { MapView.setFastForward(false); } catch (e) { console.error(e); }

    // the lock, unconditionally, before anything below can throw again — this
    // is the whole point of the boundary
    setResolving(false);

    // The turn ADVANCES; it is not retried. Every event the player has already
    // been shown tonight was spent against G before it was rendered — applyEvent
    // runs before the retaliation report is built, and strike effects land back
    // inside resolveMissions — so re-resolving would double-apply everything
    // that got as far as landing: damage, casualties, approval, the oil shock.
    // A turn that resolved strangely once is a bad night. A turn whose effects
    // are applied twice is a corrupted campaign that looks fine.
    try { nextTurn(); }
    catch (e) { console.error('CIC: turn advance failed after resolution error', e); }

    // Told plainly, in the register of the rest of the game, and named as what
    // it is: a fault in the software. Dressing a JavaScript exception up as a
    // comms failure over Iran would teach the player something false about the
    // simulation they are spending fifteen days trying to read.
    if (!G.over) {
      try {
        UI.showReport('TURN RESOLUTION FAULT', [{
          title: 'The turn did not resolve cleanly',
          cls: 'mil',
          text: 'A fault in the game itself interrupted resolution partway through ' +
            'this turn. Some of tonight’s results may be missing from the assessments ' +
            'you were shown; everything that did resolve has been applied, and the campaign has ' +
            'moved on to the next turn rather than replay a night that was already ' +
            'half spent. The board is yours again — and you can save. If this ' +
            'keeps happening, the browser console has the details worth reporting.',
        }], null, { prose: true });
      } catch (e) { console.error('CIC: could not show the fault report', e); }
    }
  }

  // One hop of the resolution chain. `label` names the hop so a console trace
  // says where the night came apart.
  const guard = (label, fn) => function () {
    if (resolveGuard) armWatchdog();   // this leg started; give it a fresh budget
    try { return fn.apply(this, arguments); }
    catch (err) {
      // Surfaced, never swallowed. A recovered freeze that leaves no stack is a
      // frozen game traded for an invisible one — and a bug report that says
      // "it printed the fault card" is worth far less than one with the throw in it.
      console.error(`CIC: throw during turn resolution (${label})`, err);
      recoverFromResolution(err);
    }
  };

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
    resolveGuard = true;      // from here to close(), the boundary is live
    armWatchdog();
    AudioSys.playThen('strikeForce', guard('resolveTurn', resolveTurn));   // the night steps off
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
    resolveMissions(guard('bda', (bda) => {
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

      // and whatever Tehran gave away tonight simply by running the war with it
      const gaps = covertTurn();

      // the tasking order grows — read AFTER tonight's BDA and tonight's repair
      // crews, so a belt pushed down tonight pays for the extra aimpoints in
      // the same report that shows it coming down
      const staffed = releaseTurn();

      // fleet movement closes the allied half: decks that spent it repositioning
      // are on their new stations, and the second carrier is one leg closer
      const fleet = checkCarrierTransit();
      // ticked after the transit so the night she leaves reads as a departure and
      // the night she finishes reads as a full magazine
      const rearmed = checkRearm();
      if (rearmed) fleet.push(rearmed);
      const arrival = checkCarrierArrival();
      if (arrival) fleet.push(arrival);
      const bombers = checkBomberArrival();
      if (bombers) fleet.push(bombers);
      const heavies = checkHeavyArrival();
      if (heavies) fleet.push(heavies);

      // and the coast works up tomorrow night's shot, in the open, on purpose —
      // read after carrierRisk consumed tonight's, and shown with Tehran's half
      const threat = raiseThreat();

      const day = Txt.day(G.turn);
      const ours = [...bda, ...(israeli ? [israeli] : []), ...dispersals,
        ...repairs, ...phase, ...objectives, ...gaps, ...staffed, ...fleet];

      MapView.whenFootageDone(guard('footage', () => {
        // An ally's package flies on the strategic plot before the report that
        // explains it, in the same order the watch floor got it: tracks inbound
        // from the west first, prose afterwards. Nothing here can change an
        // outcome — israelTurn already resolved the damage — so a player who
        // skips the animation loses only the picture.
        const allied = israeli && israeli.alliedStrike ? israeli.alliedTargets : null;
        MapView.alliedStrike(allied, guard('alliedStrike', () => {
          if (!ours.length) { iranianResponse(); return; }
          AudioSys.play('bdaReport');   // the watch floor reads the night back to you
          UI.showReport(`BATTLE DAMAGE ASSESSMENT — DAY ${day}, TURN ${G.turn}`, ours,
            guard('iranianResponse', iranianResponse));
        }));
      }));

      // ---- half two: Tehran answers ----
      function iranianResponse() {
        for (const ev of shipRisk) events.unshift(ev);
        if (threat) events.push(threat);

        // The southern front answers on the same page Tehran does, and its
        // events go into THIS list rather than beside gulfTurn's. That is not a
        // presentation choice: everything gulfTurn returns has already been
        // spent against G by the time it is returned, so those events only
        // report — while these carry casualties, the barrel and a strait state,
        // and the only thing that spends them is the applyEvent loop below.
        // Appended beside Tehran's salvo because it IS Tehran's salvo: Ansar
        // Allah is the third arm of the same war plan.
        const south = houthiTurn();
        for (const ev of south) events.push(ev);

        if (events.some(ev => ev.casualties || ev.hormuz === 'CLOSED')) AudioSys.play('retaliation');

        // Riyadh's package flies the way Jerusalem's does and for the same
        // reason — an ally's night is something the president is TOLD about, so
        // it is a radar picture on the strategic plot rather than a targeting
        // pod. It launches from Khamis Mushait, which is what `allyOf` is for.
        const rsaf = south.find(ev => ev.alliedStrike);
        MapView.alliedStrike(rsaf ? rsaf.alliedTargets : null, guard('rsaf', () => {

        // Iran's salvos fly on the map — missiles, drone swarms, intercepts —
        // before the damage assessment lands and covers the screen
        MapView.animateIranianAttacks(events, guard('retaliation', () => {
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
          // ~3 off the barrel, and only the Lincoln can shave it: the Ford is
          // behind Suez and the market prices what is in the Gulf of Oman, not
          // what is in the Red Sea. It does not fight the strait-closure premium below,
          // which is a separate, larger shock; it just keeps the ambient fear down.
          const carrierReassurance = navalForward() * 3;
          // The second strait is added to the same target rather than shocking
          // the price on its own, so two closed waterways cannot double-count a
          // single panic — and it is worth about a third of Hormuz, because it
          // has a detour and Hormuz does not. Shutting Bab al-Mandab does not
          // strand a cargo; it sends it round the Cape, which is three weeks and
          // a war-risk premium rather than a supply shock. That difference is
          // the whole reason this front has no loss condition attached to it.
          const mandabPremium = G.mandab === 'CONTESTED' ? HOUTHIS.oilContested
            : G.mandab === 'CLOSED' ? HOUTHIS.oilClosed : 0;
          const oilTarget = 88 + Math.max(0, warPremium - carrierReassurance) +
            (G.hormuz === 'CONTESTED' ? 14 : G.hormuz === 'CLOSED' ? 55 : 0) +
            mandabPremium;
          // The market eases toward the target one night at a time, but not
          // symmetrically: a fear premium spikes slowly and collapses fast. When
          // the price is above target — the threat easing rather than building —
          // it falls quicker, and quickest of all once the strait is reopened and
          // the tankers are moving again. That is what lets reopening Hormuz
          // actually be felt at the pump instead of bleeding off over a week.
          // The easing rates used to lose to the event shocks outright. Measured
          // over ~2,000 campaigns: Iranian events added ~26 a turn to the barrel
          // and the market took ~12 of it back, so the price ratcheted up ~14 a
          // turn no matter how the war was fought — 84% of campaigns peaked over
          // $150 and half over $190, INCLUDING the ones that never struck an oil
          // target or went near the strait. A ratchet is not a market and it is
          // not a lever: it made the ECONOMIC DAMAGE grade an F for everybody
          // and charged -2 approval a night for something the player could not
          // affect. With the shocks themselves cut back (see ai.js) these rates
          // let a theater the president has actually calmed be felt at the pump
          // inside two or three nights, which is what makes reopening Hormuz and
          // hunting the launchers worth doing twice over.
          const gap = oilTarget - G.oil;
          const ease = gap >= 0 ? 0.16
            : G.hormuz === 'OPEN' ? 0.52
            : 0.34;
          G.oil = Math.max(60, G.oil + gap * ease);
          G.stats.peakOil = Math.max(G.stats.peakOil, G.oil);

          if (G.hormuz === 'CLOSED') G.hormuzClosedTurns++;
          else G.hormuzClosedTurns = 0;

          // Counted for the after-action record and for nothing else. Note this
          // one ACCUMULATES rather than resetting on reopening: HORMUZ_LIMIT is
          // a loss condition and needs consecutive nights, while this is a
          // tally of how long the president let the southern lane stay shut
          // across the whole war. Nothing reads it to end a campaign, and
          // nothing should — see the detour note above the premium.
          if (G.mandab === 'CLOSED') G.mandabClosedTurns++;

          // domestic drift: the country reacts to the price at the pump. Expensive
          // gas and a long war bleed approval; cheap, calm markets let it recover a
          // little on its own — the one lever the president can always turn.
          // The lines moved out from 150/125. A Gulf war with the strait
          // contested prices the barrel around $112 on its own, so charging
          // approval from $125 was charging the president for the war existing
          // rather than for letting the economy get away from them. These mark a
          // genuine shock instead of the baseline.
          if (G.oil >= 165) movePublic(-2);
          else if (G.oil >= 135) movePublic(-1);
          else if (G.oil <= 95) movePublic(1);
          const weary = warWeariness();
          if (weary) movePublic(-weary);
          // ...and past the plan it takes the president's own coalition with
          // it, which is the bound that keeps a floor from making a do-nothing
          // war immortal. See APPROVAL.overtimeBase.
          // Linear in turns-over, so the base lost is quadratic — exactly the
          // shape OVERTIME_STEP gives the middle, and for the same reason. A
          // flat rate here was measured and is not enough: at 0.4 a turn an
          // easy war needs twenty turns past its plan to crack a 32-point base
          // down to the collapse threshold, so 9.4% of campaigns still simply
          // ran out of turns. Accelerating it puts the end at roughly turn 40
          // on easy, 36 on normal and 33 on hard, in that order, always.
          if (G.turn > G.softCap) {
            erodeBase(APPROVAL.overtimeBase * (G.turn - G.softCap), false);
          }

          // The rally expiring, and the country's attention coming back to the
          // classes the campaign left alone tonight. Both are unconditional and
          // both run AFTER the night's events have been charged — habitTick in
          // particular has to, or a class struck tonight would have its own
          // payout discounted by a recovery that has not happened yet.
          rallyDecay();
          revertTick();
          habitTick();

          // The dead crossing a band of what the country said it would bear.
          // This is the one erosion that is not a single televised catastrophe
          // — it is the cumulative one, and it is charged once per band rather
          // than per casualty so that a war which has already crossed a line
          // does not go on paying for crossing it. `casualtyBands` records
          // which bands are spent; it is per-war state and rides in `stats`,
          // which is already on FIELDS and already cleared by newWar.
          const deadFrac = G.casualties.us / casualtyLimit();
          G.stats.casualtyBands = G.stats.casualtyBands || 0;
          while (G.stats.casualtyBands < APPROVAL.erodeBands.length &&
                 deadFrac >= APPROVAL.erodeBands[G.stats.casualtyBands]) {
            G.stats.casualtyBands++;
            erodeBase(APPROVAL.erode.casualtyBand);
          }

          // built after the drain lands so the headline quotes tonight's number,
          // and self-applied like the Hill's vote — it reports a cost already
          // charged rather than carrying one, so it never reaches applyEvent
          const wearyEv = pollEvent(weary);

          // The centrifuges ran again tonight, whatever else happened — and on
          // exactly one night of exactly some campaigns, this is the night they
          // finish. Charged through applyEvent because unlike a release it is
          // something that happened TO the president; it rides in the
          // retaliation report with the rest of the night's bad news and then
          // gets a dialog of its own behind it.
          const nukeTest = breakoutTick();
          if (nukeTest) applyEvent(nukeTest);

          // ---- the news cycle moves on ----
          // Standing abroad has to recover on its own or it is not a resource, it
          // is a ratchet: every strike costs a point or two, so without drift the
          // basing tiers are not consequences a player can manage, they are a
          // schedule. Recovery is real but slow, it pulls toward a baseline rather
          // than toward full, and it stops entirely while Israel is in the war on
          // its own account — that is the one thing the world does not get over.
          //
          // A COORDINATED Israel does not stop the recovery; it lowers the ceiling
          // the recovery pulls toward. That is the standing rent on the bargain,
          // and it is charged as a ceiling rather than a nightly tick because a
          // ceiling is something a player can plan against: it says "this is as
          // popular as this war gets while they are flying with us", and it is
          // what eventually costs a basing tier. A drip would be the same
          // arithmetic and unreadable on the bar.
          if (G.israelPosture !== 'unilateral') {
            const baseline = (G.coalition ? 58 : 50) -
              (G.israelPosture === 'coordinated' ? ISRAEL.coordWorldFloor : 0);
            if (G.world < baseline) G.world = Math.min(baseline, G.world + 2.5);
          }

          // the two arguments inside the coalition. Run BEFORE syncBasing, so a
          // caveat filed tonight is checked against tonight's world opinion and
          // not tomorrow's — and after the salvo above, so tonight's strike on
          // Abqaiq is in tonight's argument rather than next week's.
          const gulf = gulfTurn();

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
          // out from under the campaign — the basing is here because it is
          // reading the damage on this page. The vote is NOT: it comes after this
          // report, in a dialog of its own, because a resolution that shortens the
          // target list for the rest of the war cannot be the eleventh collapsed
          // line under nine battle damage assessments.
          const theirs = [...events, ...gulf, ...basing, ...flow, ...(wearyEv ? [wearyEv] : [])];
          // the ticker and the after-action record still see the whole night —
          // the split is only in how it is read back to the president
          const all = [...ours, ...theirs, ...(nukeTest ? [nukeTest] : []),
            ...(vote && !cutoff ? [vote] : [])];
          UI.setTicker(IranAI.headlines(G, all));
          recordTurn(all);
          const result = cutoff ? buildResult('defeat', 'cutoff') : checkEnd();

          const close = guard('close', () => {
            // the turn is over: the map animates at speed again and the button
            // goes back to END TURN for the next one
            MapView.setFastForward(false);
            setResolving(false);
            // a war that ended tonight has its own music: the arrival calls are
            // dropped rather than played under the endgame screen
            if (result) { arrivalCalls = []; resolveGuard = false; clearTimeout(resolveWatchdog); finish(result); return; }
            nextTurn();
            // The turn is safely handed on, so the boundary stands down HERE and
            // not at the top of close(): a throw between setResolving(false) and
            // nextTurn() must still be recovered, or the lock is released onto a
            // turn that never advanced. Anything that throws below this line has
            // already cost the player nothing but a leader call.
            resolveGuard = false;
            clearTimeout(resolveWatchdog);
            // This is the quiet the arrival calls were held for — the reports are
            // closed and nothing else is talking (see arrivalCalls). Paris was
            // always going to be a night behind London, so the second coalition
            // call queues up behind them rather than over them: a beat after the
            // president has finished reading what Tehran did overnight.
            flushArrivalCalls(() => { if (!G.over) maybeLeaderCall(null); });
          });
          // The test falls last of all, behind even the gavel. It outranks
          // everything else that happened tonight, so it is read last rather
          // than first: the president finishes the night's accounting, hears the
          // Hill, and is then pulled into the one meeting with nothing else left
          // to read. Whatever is at the end of it holds `close`, so the turn does
          // not hand on until the folder is shut.
          //
          // FOUR BEATS, and they are four because the third one is a bill. The
          // alarm and the footage are theatre; the assessment is where the
          // −18 approval, the −6 abroad and the three points off the base that
          // applyEvent has ALREADY charged get said out loud, in the report
          // renderer that draws every other bill in this game. Without it the
          // most expensive single event in the campaign lands with nothing on
          // screen accounting for it. The test event is out of the retaliation
          // report above for the same reason the vote is: an alarm that goes
          // off after the president has already read "Iran has tested a device"
          // as line eleven of the night's traffic is announcing something they
          // were told twenty seconds ago.
          const nuke = nukeTest
            ? guard('nuclear', () => UI.showNsaAlert(
                () => UI.showNuclearTest(
                  () => UI.showReport('NUCLEAR TEST DETECTED — EASTERN DESERT', [nukeTest],
                    () => UI.showNuclear(close), { prose: true }))))
            : close;
          // The gavel falls before it. The vote is scored on tonight's dead, so
          // the president reads the salvo first and the roll call after it, and
          // whichever dialog is last in the chain is the one holding `close`.
          const gavel = (vote && !cutoff)
            ? guard('warpowers', () => UI.showWarPowers(vote, nuke))
            : nuke;
          if (!theirs.length) { gavel(); return; }
          UI.showReport(`IRANIAN RETALIATION — DAY ${day}, TURN ${G.turn}`, theirs, gavel);
        }));
        }));
      }
    }));
  }

  function nextTurn() {
    G.turn++;
    // Nothing ends here any more. The campaign culminates through the country
    // rather than through the calendar — see warWeariness and checkEnd, which
    // still hand back exhaustion and time, just some nights later and only once
    // the president has watched the approval bar pay for them.

    // replenish — what the decks can turn around depends on where they are
    syncFleetCaps();
    const cap = fleetCapacity();
    G.res.f35 = Math.min(G.res.f35 + cap.repF35, G.caps.f35);
    G.res.fighters = Math.min(G.res.fighters + cap.repFighters, G.caps.fighters);
    // ready launchers reload at the same rate as ever — but never past what is
    // still in the theater reservoir, so a drained magazine cannot be topped off
    G.res.cruise = Math.min(G.res.cruise + cap.repCruise, G.caps.cruise, G.tlamPool);
    // the bombers only regenerate once there are bombers — turnaround on the
    // ramp is three turns per airframe, and an empty ramp turns nothing around
    if (G.bombersArrived && G.turn % 3 === 0) {
      G.res.stealth = Math.min(G.res.stealth + 1, G.caps.stealth);
    }
    // the heavies turn faster than the B-2s do: no low-observable coatings to
    // repair between sorties, just fuel, bombs and crew rest, and a NATO main
    // operating base with a munitions yard behind them. See HEAVY_REGEN — at
    // one a night, phase three delivered a heavy package every OTHER night.
    if (G.heaviesArrived) {
      G.res.heavy = Math.min(G.res.heavy + HEAVY_REGEN, G.caps.heavy);
    }

    // tonight's tanker plan is written fresh: fuel in the air does not bank
    G.tankerCap = tankerCapacity();
    G.tankers = G.tankerCap;

    if (G.addressCooldown > 0) G.addressCooldown--;
    if (G.regimeChaosTurns > 0) G.regimeChaosTurns--;
    // a recovered aviator goes back on the flight schedule. No RNG and no
    // event: it is the squadron panel quietly filling back in.
    Aircrew.turnTick(G);
    // Crew rest pays back one package a night, unconditionally, against the
    // accrual each late frag already booked. So a late frag costs exactly one
    // package-night of future tempo and no more: surge four past the plan and
    // the wing is +4 −1 = three packages in debt tomorrow and climbing out from
    // there, while flying the plan as written is a clean −1.
    //
    // This decay used to be conditional — only a night that stayed inside the
    // plan paid anything down. It produced a trap. A wing at maximum debt has a
    // plan of one (the floor in planSize), flying two is one package over, and
    // one package over paid back nothing, so a single greedy night locked the
    // campaign at one package a night for the remaining twenty-nine turns. A
    // bot doing nothing but "fly the best package available" pinned there on
    // turn one and never recovered. That cliff is invisible — nothing on the
    // screen distinguishes flying one from flying two on a plan of one — and an
    // unstated rule should not be able to decide a campaign in its first hour.
    // Unconditional decay keeps the debt real without making it permanent.
    if (G.fatigue > 0) G.fatigue = Math.max(0, G.fatigue - ATO.fatigueDecay);
    // and the staff writes tomorrow's order against what the debt is now. Like
    // the tanker plan two lines up, this is written fresh and does not bank.
    G.atoPlan = planSize(G.fatigue);
    G.diploUsed = false;
    G.intelUsed = false;
    // Suppression is tonight's and only tonight's. `burn` is deliberately not
    // cleared here — it is the campaign's, and it is what retires the network
    // attack (see EW in data.js).
    G.ew.id = null; G.ew.sup = 0; G.ew.hit = false;
    G.strikesThisTurn = 0;
    G.struckThisTurn = [];
    G.raidThisTurn = false;

    // the sidebar closes overnight: whatever was open for last night's decision
    // is not what tonight's is, and an open section scrolls the rest past the fold
    UI.closeAllPanels();

    // Before the brief rather than after it: the theater calls are part of what
    // the staff has to report, and the dialog below reads their notes back.
    autoTheater();

    UI.renderAll(G);
    // ...except the staff's brief, which is not "a section the player might
    // want" — on easy it is the entire night's decision, and a shut panel over
    // the words "3 OPTIONS" is the one arrangement of this sidebar where the
    // player can end a turn without knowing they were asked anything. Opened
    // AFTER renderAll, because renderCoa is what decides whether the panel
    // exists tonight at all.
    openBrief();
    Save.write();
  }

  // ---- the after-action record ----
  // One line a turn, written as the turn closes, so the endgame screen can show
  // the shape of the whole campaign rather than just its final numbers.
  // What made a night worth remembering, most historically interesting first.
  // This used to be a chain of `find`s that took the first match and stopped —
  // which meant a war where Tehran threw a heavy salvo every other night read
  // MASS MISSILE BARRAGE, MASS MISSILE BARRAGE, MASS MISSILE BARRAGE down the
  // endgame screen, with the strikes that actually decided the campaign sitting
  // in the same reports, outranked. So: rank every candidate, then take the
  // best one that has not already been said.
  const NOTABLE = [
    (e) => e.casualties >= 10,
    (e) => !!e.hormuz,
    (e) => /DESTROYED|SUNK|LOST|CAPTURED|AUTHORIZ|REVOKED|DISPERSE/i.test(e.title || ''),
    (e) => e.cls === 'iran',
  ];

  function recordTurn(events) {
    const ranked = [];
    for (const test of NOTABLE) {
      for (const e of events) if (test(e) && !ranked.includes(e)) ranked.push(e);
    }

    const said = G.timeline.map(r => r.title).filter(Boolean);
    // the best thing that has not been said yet; failing that, the best thing
    const notable = ranked.find(e => !said.includes(e.title)) || ranked[0] || null;

    let text = 'No significant developments.';
    if (notable) {
      text = notable.title;
      // Nothing new happened tonight that has not happened before. Say it
      // again, but say which time it is — a barrage on the fourth consecutive
      // night is a different fact about the war than the first one was.
      const n = said.filter(t => t === notable.title).length + 1;
      if (n > 1) text += ` — ${Txt.ordinal(n).toUpperCase()} NIGHT`;
    }

    G.timeline.push({
      turn: G.turn,
      approval: Math.round(G.approval),
      dead: G.casualties.us,
      deg: G.nukeDegraded(),
      // the raw title is kept beside the rendered line so the next turn can
      // tell "said already" from "said already, with an ordinal glued on"
      title: notable ? notable.title : null,
      text,
    });
  }

  // ---- endings ----
  function checkEnd() {
    if (G.over) return null;
    // primary win: the nuclear program is gone and Iran can no longer fight
    if (G.nukeDegraded() >= 100 && G.iranBroken()) return buildResult('victory', 'military');
    // The race the whole war was against: they got there first. Through v2.17
    // this fired on the tick the progress crossed, so the test and the ending
    // were the same instant. They are now NUCLEAR.window turns apart — the
    // crossing is stamped in breakoutTick and this reads the clock it started —
    // and what the ending describes is the weapon leaving the assembly building
    // rather than the test itself. A tactical release defuses it; nothing else
    // does, and running out the window is the default because doing nothing is
    // what most presidents in this position would in fact do.
    if (G.nuclear.tested && !G.nuclear.defused &&
        G.turn - G.nuclear.testedTurn >= NUCLEAR.window) return buildResult('defeat', 'breakout');
    // the losses are military and political:
    if (G.casualties.us >= casualtyLimit()) return buildResult('defeat', 'casualties');
    // An approval collapse means two different things depending on when it
    // happens, and they are not the same ending. Inside the plan the country
    // turned on the president over how the war was being fought — impeachment.
    // Past the plan it simply outlasted the country's patience, which is what
    // the old turn-30 wall used to model, so the wall's two endings live here
    // now: culminated for nothing, or frozen with the program mostly gone.
    if (G.approval <= collapseAt()) {
      if (G.turn <= G.softCap) return buildResult('defeat', 'impeachment');
      return G.nukeDegraded() < 50
        ? buildResult('defeat', 'exhaustion')
        : buildResult('stalemate', 'time');
    }
    // The strait wall was 7 and it was calibrated against a game whose campaigns
    // ended on turn 7 — it could barely fire, so nobody noticed it was brittle.
    // With v1.65's campaigns running to twenty turns it became the single most
    // common way competent play lost: HALF of scripted campaigns died here, and
    // the median longest closed run was exactly 7, i.e. wars ran up to the wall
    // and stopped on it. A closure is already punished hard and continuously —
    // a $55 premium on the barrel, and the approval that costs every night — so
    // the instant loss on top of it was charging twice for one Iranian decision.
    // Twelve is still a strait shut for most of a week and a half, which is a
    // genuine economic catastrophe rather than a bad fortnight.
    if (G.hormuzClosedTurns >= HORMUZ_LIMIT || G.oil >= 240) return buildResult('defeat', 'economy');
    return null;
  }

  // ---- grading ----
  //
  // Every row on the after-action screen is a 0–100 SCORE first and a letter
  // second, and the total is the weighted mean of the same scores put back
  // through the same band table (see WAR_GRADE in data.js for the argument and
  // the weights). Nothing here reads a letter to compute anything.
  //
  // `bandScore` maps a raw reading onto that scale so it lands inside the band
  // its OWN cutoffs put it in: the cutoffs are still the thresholds these
  // letters have always used — the interpolation between them is only what buys
  // resolution — so a row and the number underneath it can never tell different
  // stories. `cuts` are the four ascending-badness cutoffs [A,B,C,D]; `worst` is
  // the reading that scores zero, which for most rows is the value at which the
  // campaign is already lost. That is what keeps an F a range and not a cliff.
  const SCORE_EDGES = [100, 85, 70, 55, 40, 0];

  function bandScore(value, cuts, worst) {
    if (!(value > 0)) return 100;
    const edges = [0, cuts[0], cuts[1], cuts[2], cuts[3], Math.max(worst, cuts[3] + 1)];
    for (let i = 1; i < edges.length; i++) {
      if (value <= edges[i]) {
        const span = edges[i] - edges[i - 1];
        if (span <= 0) return SCORE_EDGES[i];
        return SCORE_EDGES[i - 1] +
          (SCORE_EDGES[i] - SCORE_EDGES[i - 1]) * (value - edges[i - 1]) / span;
      }
    }
    return 0;
  }

  // The same, for readings where MORE is better — world opinion, approval, the
  // share of the program that is gone. `cuts` descend; `best` is a perfect
  // reading, and zero is the floor.
  function bandScoreUp(value, cuts, best) {
    return bandScore(best - value, cuts.map(c => best - c), best);
  }

  const clamp100 = (v) => Math.max(0, Math.min(100, v));

  function letterFor(score) {
    for (const [letter, floor] of WAR_GRADE.bands) if (score >= floor) return letter;
    return 'F';
  }

  // A total is a summary of thirty turns and deserves more resolution than five
  // letters, so it carries a suffix. The suffix is nothing but the position
  // inside its own band and therefore needs no thresholds of its own. F has
  // none: there is no such thing as a good F.
  function letterWithMark(score) {
    const letter = letterFor(score);
    if (letter === 'F') return 'F';
    const i = WAR_GRADE.bands.findIndex(b => b[0] === letter);
    const lo = WAR_GRADE.bands[i][1];
    const hi = i === 0 ? 100 : WAR_GRADE.bands[i - 1][1];
    const t = (score - lo) / (hi - lo);
    return letter + (t >= 2 / 3 ? '+' : t < 1 / 3 ? Txt.MINUS : '');
  }

  const TOTAL_BLURB = {
    A: 'A campaign that met its objectives and could still be defended afterwards. This is the war the plan was written for.',
    B: 'The objectives that mattered were served, and the country was made to pay for them. A good war, not a clean one.',
    C: 'Real damage done and real bills run up, with the ledger close to even. History will argue about this one.',
    D: 'The objectives slipped and the costs did not. Whatever was bought here, it was not bought cheaply.',
    F: 'By the measures this administration set for itself, almost none of it worked.',
  };

  // Rows carry their own weight so the screen can show what it weighted, and so
  // a row that does not apply is simply absent rather than scored as a zero.
  function row(key, label, score, note) {
    const s = clamp100(score);
    return { key, label, score: Math.round(s), letter: letterFor(s), weight: WAR_GRADE.weights[key], note };
  }

  function totalGrade(rows, kind, reason) {
    let sum = 0, wsum = 0;
    for (const r of rows) { sum += r.score * r.weight; wsum += r.weight; }
    let score = wsum ? sum / wsum : 0;
    score += WAR_GRADE.outcome[kind] || 0;
    // The device was tested and then fielded. Everything above this line is a
    // footnote — the war existed to prevent exactly one thing.
    if (reason === 'breakout') score = Math.min(score, WAR_GRADE.breakoutCap);
    // An American nuclear release caps the total wherever the rest of it landed,
    // at the WORST cap among the rows spent — a president who demonstrated and
    // then struck is graded on the strike. This is deliberately not an F: unlike
    // a breakout these campaigns can have achieved the objective, and a grade
    // that could not tell "prevented it at a monstrous price" from "did not
    // prevent it" would be scoring the same thing twice with the wrong answer.
    // Tehran needs no cap of its own — that ending is a defeat with a hard floor
    // under every row and the outcome adjustment on top of it.
    for (const id of G.nuclear.used) {
      const o = NUCLEAR.options.find(x => x.id === id);
      if (o && o.gradeCap != null) score = Math.min(score, o.gradeCap);
    }
    score = clamp100(score);
    const letter = letterFor(score);
    return { score: Math.round(score), letter, mark: letterWithMark(score), blurb: TOTAL_BLURB[letter] };
  }

  function buildResult(kind, reason) {
    const deg = G.nukeDegraded();

    // MILITARY SUCCESS — the heaviest row on the screen. The old letter was
    // `deg >= 100 && destroyed >= 5`, which handed an A to campaigns that had
    // gutted the halls and left the missile force, the navy and the IRGC
    // untouched: measured over 900 scripted campaigns it awarded 213 A's
    // against 22 in which Iran was actually broken. Half the victory condition
    // was not in the grade at all. `machine` reads warMachine() — the win
    // check's own scoring, per its invariant — so the heaviest row and the
    // condition for victory are now the same arithmetic.
    const machine = G.warMachine();
    const machinePct = machine.reduce((s, m) => s + m.pct, 0) / machine.length;
    const milScore =
      WAR_GRADE.mil.nuke * bandScoreUp(deg, [100, 80, 55, 30], 100) +
      WAR_GRADE.mil.machine * bandScoreUp(machinePct, [100, 80, 60, 35], 100) +
      WAR_GRADE.mil.effects * bandScoreUp(G.stats.destroyed, WAR_GRADE.effectsCuts, 20) -
      G.stats.carriersLost * WAR_GRADE.carrierPenalty;

    // graded against what THIS country would bear, so the letter means the same
    // thing on every difficulty
    const lim = casualtyLimit();
    const livesScore = bandScore(G.casualties.us, [lim * 0.1, lim * 0.2, lim * 0.4, lim * 0.8], lim * 1.6);

    // DIPLOMATIC STANDING was world opinion and nothing else, which scored the
    // thermometer and ignored every institution the number is supposed to
    // represent. Who is still flying with you, off whose soil, is the part of a
    // coalition a president can actually point at.
    const allies = (G.coalition ? 34 : 0) + (G.basing.nato ? 22 : 0) +
      (G.basing.gulf ? 30 : G.gulf.corridor ? 14 : 0) +
      (G.israelPosture === 'coordinated' ? 14 : G.israelPosture === 'unilateral' ? 0 : 8);
    const diploScore = 0.70 * bandScoreUp(G.world, [60, 48, 36, 25], 100) +
      0.30 * bandScoreUp(allies, [80, 60, 40, 20], 100);

    // ECONOMIC DAMAGE: the peak of the barrel, plus the nights the strait was
    // shut. The second is not implied by the first — Tehran can close Hormuz
    // and take the premium back off the table by reopening it, and a fortnight
    // of closed shipping lanes is a fact about the world economy either way.
    const econScore = 0.75 * bandScore(G.stats.peakOil, [100, 125, 155, 190], 240) +
      0.25 * bandScore(G.hormuzClosedTurns, [0, 2, 4, 7], HORMUZ_LIMIT);

    // THE HOME FRONT is new, and it is the row the campaign most often ends on:
    // almost every defeat in this game is an approval collapse, and approval
    // appeared nowhere in the grades. The vote is here rather than under
    // DIPLOMATIC STANDING because the Hill is domestic politics, and the
    // addresses are here because going on television is the only lever the
    // president has over it.
    const wp = G.warPowers.result;
    const wpScore = wp === 'authorized' ? 100 : wp === 'restricted' ? 55 : wp === 'cutoff' ? 0 : 72;
    // a ladder rather than a curve: the interesting step is the first one, from
    // a president who never explained the war to one who did it once
    const addrScore = [0, 55, 78, 92, 100][Math.min(G.addresses, 4)];
    // The approval cuts are expressed as a FRACTION OF THE MIDDLE the president
    // still held, not as raw points, for the same reason the HUD's colour bands
    // are (see renderHUD). Raw cuts of [55,45,35,25] were written against a
    // 0..100 accumulator; against blocs they grade three different countries on
    // one ruler — a hard war whose ceiling is 66 could not reach the A band at
    // all while holding every persuadable voter in it, and an easy war starts
    // 8 points closer to every cut. What is being graded is how much of the
    // country that could be held WAS held, which is the same question on every
    // level.
    //
    // The cuts are the old ones re-expressed: 55 of 100 against a normal war's
    // 28..70 band is 0.64 of the middle, and 25 is 0. They land in the same
    // place for normal and are now reachable on hard and honest on easy.
    const heldFrac = G.middleSize ? G.middleWith / G.middleSize : 0;
    const homeScore = 0.60 * bandScoreUp(heldFrac, [0.64, 0.45, 0.26, 0.10], 1) +
      0.25 * wpScore + 0.15 * addrScore;

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
      tehran: 'DEFEAT — THE PRESIDENCY IS OVER',
      capitulation: 'VICTORY — TEHRAN CAPITULATES UNDER NUCLEAR THREAT',
    };
    const verdicts = {
      military: 'VICTORY. The nuclear program is destroyed and Iran\'s ability to wage war — its missile force, its navy, its command structure — has been dismantled. The objectives are achieved by force of arms.',
      deal: 'VICTORY. With its war machine breaking apart, Tehran took the off-ramp and accepted terms. The objectives are achieved — signed rather than shattered.',
      casualties: 'The casualty count crossed what the country would bear. Congress moved to cut off funding for the operation, and the campaign ends with its objectives unmet and its dead counted in the hundreds.',
      impeachment: 'With approval in ruins, your own party abandoned you. The House opened impeachment proceedings over the conduct of the war; the presidency is effectively over.',
      economy: 'The prolonged closure of Hormuz broke the global economy. Fuel rationing, a market crash, and allied governments falling — the war was lost at the gas pump.',
      exhaustion: 'The force culminated with the objectives nowhere in sight. Magazines empty, crews exhausted, Iran\'s program still standing, and a country that had stopped believing any of it was going anywhere. The campaign ran out of ammunition, and then it ran out of the public\'s patience.',
      time: 'The war outlasted the country\'s willingness to fight it. Real damage was done — most of the program is gone — but Iran\'s capacity to fight survives, and the operation is being wound down with the last objectives still on the list. The problem is handed to the next news cycle, and perhaps the next president.',
      breakout: 'The war was fought to prevent exactly one thing, and it did not prevent it. Seismic sensors registered a test in the eastern desert while American aircraft were still flying. Every other number on this page is now a footnote.',
      cutoff: 'The authorization lapsed and the Hill declined to renew it. With funding cut off mid-campaign the force is being recovered rather than employed, and the war ends by act of Congress with its objectives unmet.',
      tehran: 'You ordered a countervalue strike on a capital city. The Vice President and a majority of the Cabinet invoked the Twenty-Fifth Amendment before the aircraft had cleared Iranian airspace; the House drew up a single article of impeachment the same afternoon and the Senate convicted inside a week, with your own party voting to remove. There is no argument about the merits of the war left to have.',
      capitulation: 'Tehran accepted terms rather than find out whether the next weapon would be aimed at something inhabited. The nuclear crisis is over and the objectives are met — by a threat the United States had not made since 1962 and had to demonstrate to make credible.',
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
      tehran: `The strike killed on the order of ${NUCLEAR.options.find(o => o.id === 'tehran').iranDead
        .toLocaleString()} people in an afternoon. ` +
        `Whatever the war was about stopped mattering at the moment the order was authenticated, and ` +
        `every institution that could stop what happened next has now done so. History will record ` +
        `${G.casualties.us} American dead in the campaign and will not lead with the figure.`,
      capitulation: `The program is finished, the war is over on American terms, and the United States ` +
        `used a nuclear weapon to get there. It took ${G.turn} turns and ${G.casualties.us} American ` +
        `lives, and the argument about whether there had been another way is one that will outlive ` +
        `everyone who was in the room.`,
      cutoff: `The vote was ${G.approval < 35 ? 'not close' : 'close, and it went the wrong way'}. ` +
        `${G.casualties.us} dead, an ally count in single figures, and ${G.addresses === 0
          ? 'a president who never once went on television to explain what any of it was for'
          : 'a case the country had stopped listening to'}.`,
    };

    const brokenGates = machine.filter(m => m.done).length;
    const grades = [
      row('military', 'MILITARY SUCCESS', milScore,
        `Nuclear program ${deg}% degraded · Iran's war machine ${brokenGates}/3 broken · ` +
        `${Txt.plural(G.stats.destroyed, 'target')} destroyed · ${Txt.plural(G.stats.aircraftLost, 'aircraft')} lost`),
      row('lives', 'AMERICAN LIVES', livesScore,
        `${G.casualties.us} of ${lim} tolerated US dead` +
        (G.stats.carriersLost ? ` · ${Txt.plural(G.stats.carriersLost, 'carrier')} lost` : '')),
      row('diplomatic', 'DIPLOMATIC STANDING', diploScore,
        `World opinion ${Math.round(G.world)}/100 · ` +
        (G.coalition ? 'coalition held' : 'no coalition') + ' · ' +
        (G.basing.nato && G.basing.gulf ? 'all basing intact'
          : G.basing.gulf ? 'NATO basing withdrawn'
          : G.basing.nato ? 'Gulf basing withdrawn'
          : G.gulf.corridor ? 'basing lost, northern corridor held' : 'basing lost')),
      row('economic', 'ECONOMIC DAMAGE', econScore,
        `Peak oil price $${Math.round(G.stats.peakOil)}/bbl · ` +
        (G.hormuzClosedTurns ? `Hormuz shut ${Txt.plural(G.hormuzClosedTurns, 'turn')}` : 'Hormuz never closed')),
      row('home', 'THE HOME FRONT', homeScore,
        `Approval ${Math.round(G.approval)}% · ` +
        (wp === 'authorized' ? 'Congress authorized the war'
          : wp === 'restricted' ? 'Congress restricted the target list'
          : wp === 'cutoff' ? 'Congress cut off the war'
          : 'the vote never came') + ' · ' +
        (G.addresses ? `${Txt.plural(G.addresses, 'address')} to the country` : 'never addressed the country')),
    ];
    // Personnel recovery is only graded if the war ever put aircrew on the
    // ground — a campaign that never lost an aircraft is not scored on it.
    if (G.stats.downedCrews > 0) {
      const crews = G.stats.downedCrews;
      const saved = G.stats.aircrewRescued, taken = G.stats.aircrewCaptured;
      // the ladder is the letter this row has always given; the ratio is only
      // the resolution inside it
      const prBase = taken === 0 && saved > 0 ? 92 : taken === 0 ? 76
        : saved > 0 ? 62 : G.downed ? 47 : 20;
      grades.splice(1, 0, row('recovery', 'PERSONNEL RECOVERY',
        prBase + 8 * (saved / crews) - 8 * (taken / crews),
        `${saved} of ${Txt.plural(crews, 'downed crew')} recovered · ${taken} taken into Iranian custody` +
        (G.downed ? ' · 1 crew still evading when the war ended' : '')));
    }
    if (G.raid !== 'none') {
      grades.splice(1, 0, G.raid === 'success'
        ? row('specops', 'SPECIAL OPERATIONS', 96,
          'Leadership decapitation raid succeeded — regime command chain shattered')
        : G.raid === 'pyrrhic'
          ? row('specops', 'SPECIAL OPERATIONS', 60,
            'Leadership target killed — the entire task force was lost taking him')
        : row('specops', 'SPECIAL OPERATIONS', G.hostageCrisis ? 6 : 14, G.hostageCrisis
          ? 'Leadership raid failed — operators captured and paraded on Iranian state TV'
          : 'Leadership raid failed — the task force was lost on Iranian soil'));
    }

    G.over = true;
    return {
      kind, title: titles[reason], verdict: verdicts[reason], narrative: narratives[reason],
      grades, total: totalGrade(grades, kind, reason),
      timeline: G.timeline,
      // Every band a reading put in front of the president, beside what was
      // actually standing when they were shown it. DISPLAY ONLY, on the same
      // terms as the roster below — see logReading. Resolved to names here so
      // the endgame screen never has to reach into TARGETS to draw a table.
      bdaLog: G.bdaLog.map((r) => {
        const t = TARGETS.find((x) => x.id === r.id);
        return { turn: r.turn, name: t ? t.short : r.id, lo: r.lo, hi: r.hi, truth: r.truth };
      }),
      // The squadron, as the war left it. DISPLAY ONLY — it is deliberately not
      // a grade row and not a term in one: PERSONNEL RECOVERY above already
      // scores what happened to aircrew, and WAR_GRADE is a closed system
      // measured over 1,440 campaigns. What this carries is the part a score
      // cannot — which name it was, and how many nights they had flown first.
      aircrew: Aircrew.roster(G).map((a) => ({ ...a })),
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
    // which sections this level has at all, before anything is opened or shut.
    // First thing in start() because the difficulty is only settled now — the
    // title screen is where it is chosen, and a resumed save carries its own.
    UI.applyPanelTrim();
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
      // On a level where the staff writes the tasking order the plot is a
      // reading surface, not an ordering one. The gate is here rather than
      // inside the dialog so there is exactly one answer to "does tapping a
      // site do anything" and the tooltip in map.js is reading the same one.
      if (!freeTargeting()) { UI.openTargetCard(G, t); return; }
      UI.openStrikeModal(G, t);
    });
    // The strait does not always open quiet (see newWar), so the marker is
    // synced on every boot rather than only on a resume — otherwise a war that
    // starts CONTESTED shows a green OPEN pin over an amber HUD readout.
    MapView.setHormuz(G.hormuz);
    // ...and the second one, but only if this war has one. setMandab REVEALS the
    // indicator, so calling it unconditionally would put a strait marker on the
    // three campaigns in four that never have a southern front — which is the
    // one thing the roll is supposed to keep quiet. A resumed war that had
    // already opened its front gets both the marker and the edge cue back.
    if (G.houthi.entered) MapView.setMandab(G.mandab);
    MapView.syncSouthCue();
    if (resume) {
      // rebuild map state from the restored targets
      for (const t of TARGETS) MapView.updateTarget(t);
      UI.setTicker(IranAI.headlines(G, [{ title: 'SITUATION ROOM RECONVENES — THE WAR CONTINUES' }]));
    } else {
      UI.setTicker(IranAI.headlines(G, [{ title: 'AL ASAD AIR BASE STRUCK BY IRANIAN MISSILES — SEVEN AMERICANS DEAD' }]));
    }
    UI.renderAll(G);
    // First-war primer: the single most common way a new player loses is by
    // fighting this as a pure targeting game and never touching the free action
    // slots that actually hold approval, oil and the coalition together. Auto-
    // shown once at the top of a fresh war; the HOW TO PLAY button in the
    // sidebar brings it back for the rest of the campaign.
    if (!resume) {
      // The theater calls run before either dialog: night one is the night the
      // 509th moves, and the brief is where the president is told so.
      // ...quietly: the sting is the opening sound and it is the only one.
      quietOrders = true;
      autoTheater();
      quietOrders = false;
      // Chained rather than stacked. Both of these are dialogs, and opening the
      // night's decision on top of the how-to-play screen puts the one thing
      // the player must answer behind the one thing they are still reading.
      UI.showPrimer(false, () => {
      // Turn one, fresh war only. The sidebar's own opening-night content IS the
      // tutorial: two advisors start the campaign flagged URGENT and between
      // them they name the first move — kill the SAM belt, and move either the
      // Ford or the 509th tonight, because Fifth Fleet only cuts one transit
      // plan a night (on a level with `autoTheater` that second half is already
      // done and the brief has said so). Shipping that behind a shut drawer
      // meant the last thing a new player saw before their first order was seven
      // closed panels and a row of badges. This does not reverse the
      // shut-sidebar policy in ui.js: nextTurn's closeAllPanels shuts it again
      // at the top of turn 2, and a resumed save never sees it at all.
      //
      // ONE panel, not two. Opening the objectives checklist as well sounds
      // helpful and is not: together they overrun the scroll pane at every
      // screen size — and on a landscape phone the checklist alone overruns it —
      // so the advisors have to be scrolled to, which leaves the checklist open
      // above the fold and invisible. The war aim is already carried three other
      // ways: the title screen states it, the primer restates it, and the
      // OBJECTIVES badge shows the breakout clock while the panel is shut. The
      // turn-one tasking is carried nowhere else, so it is the one that opens.
      // ...unless the staff is briefing, in which case that outranks it: on
      // easy the options ARE turn one, and the advisors argue for the same
      // doctrines one panel down.
      // ...which on a level that ARMS the brief rather than opening it is both:
      // openBrief puts READY FOR OPTIONS in the primary slot and nothing on
      // screen, so the panel that would have been outranked is free to open
      // after all — and on turn one the advisors are the only thing naming a
      // first move while the president looks the board over.
        openBrief();
        if (!briefPending && diff().coa && coaOptions().length) return;
        UI.openPanel('advisors', true);
      });
    }
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
    // the munitions stock is gated by VERSION, so this can only fire on a blob
    // written by a build between the field landing and the bump. Restore the
    // opening load rather than zero: a war that resumes with empty depots and
    // no way to explain them is worse than one that resumes over-supplied.
    if (typeof G.pgm !== 'number') G.pgm = diff().pgm || 0;
    // and the same for the screen's deck canisters, for the same reason: VERSION
    // gates this, so it can only fire on a blob written between the field
    // landing and the bump. A full rack rather than an empty one — a war that
    // resumes with a magazine it cannot explain being empty is the worse bug.
    if (typeof G.nsmPool !== 'number') G.nsmPool = NSM_LOAD;
    // the brief is rebuilt against the board rather than restored with it
    coaCache = { turn: -1, list: null };
    for (const t of TARGETS) {
      const rec = data.targets[t.id] || {};
      t.hp = typeof rec.hp === 'number' ? rec.hp : (t.dispersal ? 0 : 100);
      t.dispersed = !!rec.dispersed;
      t.located = !!rec.located;
      t.lastStruck = rec.lastStruck || 0;
      t.killedOnce = !!rec.killedOnce;
      t.found = !!rec.found;
      t.suspected = !!rec.suspected;
      t.leads = rec.leads || 0;
      t.worked = rec.worked || 0;
      t.released = !!rec.released;
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
    maybeLeaderCall(null);
  }

  // ============================================================
  // Is this session rigged for the breakout branch? Read fresh rather than
  // cached at load: a player who starts a rigged war, then a normal one from
  // the endgame screen, has not changed the URL and should still get the rig —
  // and one who edits it out and reloads has.
  const nukeRig = () => typeof location !== 'undefined' &&
    /[?&]nuke\b/.test(location.search || '');

  // KICKOFF
  // ------------------------------------------------------------
  // What is randomized, and why. A war that opens identically every time is a
  // war with an opening book, and an opening book is the death of a strategy
  // game — so the enrichment head start, Tehran's war plan, Israel's patience
  // and the state of the coastal SAM belt are all rolled here. None of it is
  // shown to the player; all of it is discoverable.
  // ============================================================
  function newWar(difficulty) {
    G.difficulty = DIFFICULTY[difficulty] ? difficulty : DIFFICULTY_DEFAULT;

    // The country this president has, which is the first thing a level decides
    // and the only place the blocs are ever set. Same leak class as the TARGETS
    // loop below: `habit` and `lastPoll` are per-war and G outlives a campaign
    // in every harness, so a second campaign would otherwise open with the last
    // one's boredom already accrued and a poll comparing against another war.
    //
    // The middle opens at APPROVAL.rallyAt rather than at half, because the war
    // opens four days after Iran killed seven Americans at Al Asad. It is spent
    // by turn 7 whatever happens — see rallyDecay.
    const pub = diff().public || APPROVAL;
    G.base = pub.base;
    G.opposed = pub.opposed;
    G.middleWith = Math.min(APPROVAL.openMiddle, 100 - pub.base - pub.opposed);
    G.rally = APPROVAL.rallyAt;
    G.habit = {};
    G.lastPoll = null;

    // launcher groups start off the board entirely. TARGETS is a module-level
    // constant that outlives a war, so every per-war field on it is cleared
    // here or it leaks into the next campaign.
    for (const t of TARGETS) {
      t.hp = t.dispersal ? 0 : 100;
      t.dispersed = false;
      t.located = false;
      t.lastStruck = 0;
      t.killedOnce = false;
      // what the folder does not have this time round. A covert site that was
      // found last war is back off the plot for this one — TARGETS outlives the
      // campaign and these three fields leak into the next war if they are not
      // cleared here, which would hand the player a second campaign with no
      // mid-game in it at all.
      t.found = false;
      t.suspected = false;
      t.leads = 0;
      t.worked = 0;
      // and the tasking order is short again. Same leak, same fix: a second
      // campaign would otherwise open with the whole interior already staffed
      // and no ramp in it at all.
      t.released = false;
      syncStatus(t);
    }

    // A new squadron. Same leak class as the TARGETS loop above and it is
    // cleared for the same reason — a second campaign must not open with the
    // last one's sortie counts, or with two of its aviators still in Iranian
    // custody. `downed` points into this array, so the two are reset together.
    G.aircrew = Aircrew.newRoster();
    G.downed = null;

    // Tehran's war plan, and how far along the centrifuges already are
    const plans = Object.keys(IRAN_POSTURES);
    G.iranPosture = plans[Math.floor(Math.random() * plans.length)];
    G.postureKnown = false;
    G.breakout = {
      progress: rand(0, 18),   // the program did not start the day the war did
      need: rand(BREAKOUT.needMin, BREAKOUT.needMax),
      conf: 'low', assessed: -99,
    };
    // Same leak class as the per-war fields on TARGETS: `used` is an array and
    // a campaign that inherited the last one's would open with the release
    // folder already half spent.
    G.nuclear = { tested: false, testedTurn: -1, used: [], defused: false };

    // ---- the rig: ?nuke on the URL ----
    // Breakout is the one branch of this game that is hard to reach on purpose
    // and impossible to reach at all on hard (0 of 144 campaigns — see the
    // NUCLEAR block in CLAUDE.md), so the four beats after the test, the
    // release folder and everything the window changes are the least-played
    // and least-checked screens in the build. This puts the clock one tick
    // short of the device, which fires the whole chain on the first END TURN.
    //
    // Deliberately a URL flag and not a difficulty knob or a saved field:
    // nothing in a normal campaign can reach it, it does not survive being
    // typed out of the address bar, and the harness — which has no `location`
    // at all — cannot see it either, so no probe's numbers move because this
    // exists.
    if (nukeRig()) G.breakout.progress = G.breakout.need - 1;

    // Jerusalem's temper is not a constant either. What is rolled is where the
    // gauge STARTS, not how long it takes — the rate comes off the target list
    // and the breakout clock, so an impatient Israel is a war that opens with
    // less room rather than a war on a shorter fuse.
    G.israelPosture = 'sidelined';
    G.israelPressure = rand(ISRAEL.startMin, ISRAEL.startMax);
    G.israelSorties = 0;
    G.israelHolds = 0;
    G.israelHold = 0;
    G.israelJointAvailable = false;
    syncJointPackages();   // TARGETS outlives the war; the joint option must not

    // The council's temper is not a constant either, and the two camps are rolled
    // independently: a war can open with the hawks already leaning in and Riyadh
    // still calm, or the reverse, and those are different opening problems.
    G.gulf = {
      resolve: rand(GULF.hawkStart[0], GULF.hawkStart[1]),
      strain: rand(GULF.dovStart[0], GULF.dovStart[1]),
      caveats: 0, gifts: [], tankers: 0, corridor: false, summits: 0, patriots: 0,
    };

    // Whether this war has a southern front, and when. Both rolled here and
    // neither shown: the entry turn is picked even on the 75% of campaigns that
    // never use it, so the roll is one branch rather than two and a save written
    // on turn 3 of a quiet war cannot be read to find out what is coming.
    // See HOUTHIS in data.js — the IRGC check happens on the entry turn itself,
    // not here, because what it asks is what the president has done by then.
    G.houthi = {
      active: Math.random() < HOUTHIS.chance,
      entered: false,
      enterTurn: rand(HOUTHIS.enterMin, HOUTHIS.enterMax),
      saudiStruck: 0, saudiIn: false, saudiSince: 0, saudiSorties: 0,
    };
    G.mandab = 'OPEN';
    G.mandabClosedTurns = 0;

    // The coastal SAM belt is never found at full strength. The sweep that put
    // it there IS the "covert action" Tehran is retaliating for in the opening
    // brief, and targetDesc says so wherever Bandar Abbas is read: a site
    // sitting at 70% on turn one, before the player has ordered anything, is
    // otherwise just an unexplained amber ring. This used to be a coin flip,
    // which meant half of all wars opened with an intact belt contradicting the
    // brief the player had just finished reading. How hard it was hit is still
    // rolled — the opening state of the strait approaches is worth reading off
    // the map, the existence of the raid is not.
    const opener = TARGETS.find(t => t.id === 'ad-bandar');
    opener.hp = rand(55, 85);
    syncStatus(opener);
    G.intel[opener.id] = { hp: opener.hp, turn: 1, sharp: true };

    // and the Strait does not always open quiet
    if (Math.random() < 0.25) G.hormuz = 'CONTESTED';

    // nothing has deployed yet and nobody owns the sky
    G.forceFlow = { landed: [], f35: 0, fighters: 0, tanker: 0, rep: 0 };
    G.heaviesOrdered = false; G.heavyEta = 0; G.heaviesArrived = false;
    G.caps.heavy = 0; G.res.heavy = 0;
    // the Lincoln's war-load of Tomahawks; the Ford adds 10 more if she is sent for
    G.tlamPool = 20;
    G.torpedoes = TORPEDO_LOAD;   // Toledo sails with her tubes full
    // and the screen sails with full cells — how many is a difficulty knob, so
    // this is read off the table rather than written twice (see NAVAL_BMD)
    G.bmdPool = bmdCapacity();
    G.bmdRearm = 0;
    // ...and with her deck canisters full. Flat rather than difficulty-scaled,
    // unlike the cells above it: `DIFFICULTY.bmd` exists to change how long the
    // screen can keep DEFENDING, and eight offensive rounds is a hull or two
    // either way on every level.
    G.nsmPool = NSM_LOAD;
    // what the depots opened the war holding, on the one level that counts it
    G.pgm = diff().pgm || 0;
    // and nobody has jammed anything yet. `burn` above all: a campaign that
    // inherited the last one's would open with the network attack already
    // spent, the same leak class as the per-war fields on TARGETS.
    G.ew = { id: null, sup: 0, hit: false, burn: 0 };
    // and last night's brief belongs to last night's war
    coaCache = { turn: -1, list: null };
    syncFleetCaps();
    G.res.f35 = G.caps.f35;
    G.airPhaseSeen = airPhase(true);

    G.tankerCap = tankerCapacity();
    G.tankers = G.tankerCap;

    // night one: no debt, and the opening tasking order is the base plan
    G.fatigue = 0;
    G.atoPlan = planSize(0);
  }

  // The three difficulty options, built from the tuning table rather than
  // written out again in index.html. The descriptions used to live in both
  // places and had already drifted apart — the title screen was offering a
  // shorter NORMAL and a differently-worded HARD than the table it selects.
  // `tag` sits beside the name rather than at the head of the description,
  // because it is a recommendation about WHO should pick this and not a fact
  // about the war it produces — a player scanning three headings should be able
  // to take it without reading a paragraph, which is the whole point of it.
  // A level marked `soon` is drawn but not offered: the radio is `disabled`, so
  // it cannot be clicked, cannot be arrowed onto out of the radio group, and
  // cannot be the `:checked` one `btn-start` reads — the greyed look is the
  // consequence of that rather than a decoration over a live control. It is
  // never handed the `checked` attribute even if it is the default, which is
  // the one way this could ship a title screen whose START button reads null.
  function buildDifficultyOptions() {
    const box = document.getElementById('difficulty-select');
    if (!box) return;
    for (const key of ['easy', 'normal', 'hard']) {
      const d = DIFFICULTY[key];
      const label = document.createElement('label');
      label.className = 'diff-option' + (d.soon ? ' diff-soon' : '');
      label.innerHTML =
        `<input type="radio" name="difficulty" value="${key}"` +
        `${d.soon ? ' disabled' : ''}` +
        `${key === DIFFICULTY_DEFAULT && !d.soon ? ' checked' : ''}>` +
        `<span class="diff-name">${d.name}` +
        (d.soon ? `<span class="diff-tag soon">COMING SOON</span>`
                : d.tag ? `<span class="diff-tag">${d.tag}</span>` : '') + `</span>` +
        `<span class="diff-desc">${d.desc}</span>`;
      box.appendChild(label);
    }
  }

  function init() {
    for (const t of TARGETS) { t.hp = t.dispersal ? 0 : 100; syncStatus(t); }
    AudioSys.init();
    UI.init();
    SpecOps.init();
    CSAR.init();
    buildDifficultyOptions();

    document.getElementById('btn-start').addEventListener('click', () => {
      const sel = document.querySelector('input[name="difficulty"]:checked');
      newWar(sel ? sel.value : DIFFICULTY_DEFAULT);
      // The board coming up. Fired here rather than inside start() because a
      // resumed war is not an opening — it is the same night continuing.
      AudioSys.play('gameStart');
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
    // Passed `true` so the brief opens at every difficulty: it is suppressed at
    // boot on hard, but a player who asks for it is asking, not being tutored.
    document.getElementById('btn-primer').addEventListener('click', () => {
      if (busy()) return;   // never over a resolving turn or an open set piece
      UI.showPrimer(true);
    });
    // The two doors into the same folder: the gate in front of END TURN while
    // tonight's brief is unread, and the way back in after it has been read and
    // dismissed. Both go through showBrief, which decides which of the two this
    // is — see the note above openBrief.
    document.getElementById('btn-brief-ready').addEventListener('click', showBrief);
    document.getElementById('btn-brief').addEventListener('click', showBrief);
  }

  document.addEventListener('DOMContentLoaded', init);

  // airDefenseWeight is exported read-only for the tactical scope's threat ring —
  // the scope dramatizes the number, it never feeds back into the strike math.
  return { computeStrike, executeStrike, recallMission, doDiplo, endTurn, afterAction,
    // The country, and the only two doors into it. csar.js and specops.js both
    // write approval and both live in their own IIFE, so without these they
    // would each need a private copy of the bloc arithmetic — which is how the
    // old model came to have thirty independent clamps and no single answer to
    // what approval was allowed to be. `G.approval` is a getter that throws on
    // assignment; these are what it throws you toward.
    movePublic, erodeBase, habitMult, collapseAt,
    // the turn lock, read-only: anything that reaches for the board — the
    // walkthrough, the primer — has to answer to it (see Tour.start)
    busy,
    // Jerusalem: the gauge is state, the ETA and the drivers are readings off it,
    // so the panel, the advisors and the sim can never quote different numbers.
    israelStatus, israelEta, israelClock, israelDrivers, israelHoldCost, israelPriorities,
    saudiStatus,
    // the two camps, on the same terms: the gauges are state, everything here is
    // a reading off them, and the panel is not allowed a second copy of any of it
    gulfHawkDrivers, gulfDoveDrivers, gulfEta, gulfSummitCost, gulfPriorities,
    gulfStates, gulfFoldThreshold,
    airDefenseWeight, orderCarrier, toggleCarrierPosture, carrierFactor, carrierExposure, navalForward,
    // electronic warfare: the suppression is state, everything else here is a
    // reading off it, and orderEw is the one door that may write any of it
    ewSuppression, ewOrders, ewState, orderEw,
    // exported for .claude/betatest/lincoln.js, which is the only thing that can
    // see whether the standing posture call ever uses the middle of its band
    antiShipRisk, forwardWorth,
    carrierFixed: cvFixed,
    // the escort screen's interceptor magazine: ai.js fires it, the panel and
    // the advisors read it, and nothing else may touch G.bmdPool directly
    bmdEngage, bmdRate, bmdCapacity, bmdFrac, bmdRearming, orderRearm,
    orderBombers, orderHeavies, transitCommitted, wearsDown,
    // the gaps in the target folder: the map asks what it may draw, the intel
    // panel asks what is outstanding. Nothing outside game.js writes them.
    plotted, covertGaps, suspectedBoxes,
    // what the resolution took off the list, as opposed to what tonight's plan
    // did — ai.js scores the victory gate against it
    legallyBarred,
    // the air-superiority ladder: what the sky is worth tonight, and what that
    // releases. pkgBlock is the single answer to "why can't I fly this".
    airSuperiority, airPhase, phaseAtLeast, pkgBlock, PHASE_LABEL, minPackage, resKey, pkgStock,
    // the tasking order: how many packages tonight's plan holds, and how far
    // past it the next one would be. The panel and the modal both read these.
    atoSlots, atoOver,
    // the staff's own work: what it briefed tonight, what has already gone out,
    // and whether the president is writing orders on the map at all. takeCoa is
    // the only way in — every leg still goes through executeStrike.
    coaOptions, coaFlown, takeCoa, coaSignsLeft, freeTargeting,
    surgeOption, surgeState, briefOptions,
    // the precision-munitions stock. pgmBlock is the one sentence for "we
    // cannot build this package up", the same contract pkgBlock has.
    pgmLedger, pgmBlock, pgmCost, pgmNights,
    // the uncertainty layer: everything the player sees goes through these.
    // logReading is the write side of it — the panels that show a band call it
    // so the after-action screen can say how good the band was.
    estimate, condition, logReading, staleEstimates, targetDesc, breakoutEstimate, barred, canReach, tankersFor, tankerCapacity,
    nuclearState, releaseOptions, releaseNuclear, finish,
    casualtyLimit, difficulty: diff,
    // where a decision arrives on this level — a dialog, or a drawer. ui.js and
    // csar.js both ask; neither is allowed its own answer (see DIFFICULTY.popups)
    popup,
    // ...and WHEN, for the brief: armed but unread is the one state in which the
    // primary slot holds READY FOR OPTIONS instead of END TURN. Read-only —
    // syncBriefButton draws it, showBrief is the only thing that clears it.
    briefPending: () => briefPending, showBrief,
    // A LOOK at tonight's theater notes that does not take them. showBrief
    // drains the buffer, which is right for the room reading them once and wrong
    // for the walkthrough, which opens the same dialog as a demonstration and
    // must hand the president a folder that is still complete when they open it
    // for real a minute later. A copy, so nothing outside can empty it either.
    peekTheaterNotes: () => theaterNotes.slice(),
    // the southern front, for the council panel — `houthiStrength` is what the
    // readout draws and `reachesYemen` is why the aimpoints are greyed out
    houthiStrength, reachesYemen, yemenTargets,
    FORD_TRANSIT_TURNS, B2_TRANSIT_TURNS, HEAVY_TRANSIT_TURNS, WAR_POWERS_TURN, HORMUZ_LIMIT, G };
})();
