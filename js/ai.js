// ============================================================
// ai.js — Iranian AI opponent, advisor recommendations, headlines
// ============================================================

const IranAI = (() => {
  const rand = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const chance = (p) => Math.random() < p;

  // How much of Iran's missile force still functions (scales retaliation).
  // Read off each base's condition track, so a brigade worn down to 30% throws
  // 30% of the salvo — the weight of what comes back at you falls in step with
  // the damage you do, rather than in two big steps.
  //
  // Dispersed launchers count exactly as much as the bases they drove out of,
  // whether or not anyone has found them. That is the point of the hunt: the
  // salvos do not get lighter because you destroyed the sheds, and a player who
  // stops at the fixed sites is fighting a missile force that is still there.
  // Reported as a FRACTION of what the missile force started as, scaled 0..2.
  //
  // This used to be a raw sum clamped at 2, and the clamp was binding on turn
  // one: three bases at full health sum to 3.0, so the first 1.0 of damage the
  // player did moved nothing at all. Worse, killing a base that disperses only
  // nets -0.45 (it loses 1.0 and hands 0.55 to the TELs), so a player could
  // destroy TWO missile bases and watch the capacity meter sit at exactly 100%.
  // The war's central feedback loop was dead for the first third of it.
  //
  // Normalising instead of clamping makes the number mean what the design says:
  // the denominator is the missile force at full strength, so 2.0 is "intact"
  // and 0.73 is "the 110 points of dispersed launchers that survived killing all
  // three bases" — which is 37% of 300, and reads as exactly that.
  //
  // TELs are in the numerator and NOT the denominator, deliberately. They are
  // not independent capacity: they are a reservoir that fills from bases as the
  // bases die (see DISPERSAL). Counting them below the line would put the force
  // at 50% on turn one with every launcher still in its shed.
  const wt = (t) => (t.weight != null ? t.weight : 1);

  // `legalOnly` drops whatever the War Powers resolution put off the list. It is
  // ONLY for scoring the victory condition (see Game.iranBroken) — every threat
  // reading takes the default, because a target the Hill barred is still out
  // there and still shooting.
  const outlawed = (t) => !!(Game.legallyBarred && Game.legallyBarred(t));

  function missileStrength(legalOnly) {
    let s = 0, max = 0;
    for (const t of TARGETS) {
      if (legalOnly && outlawed(t)) continue;
      if (t.type === 'missile') { max += wt(t); s += wt(t) * t.hp / 100; }
      else if (t.type === 'tel') { s += wt(t) * t.hp / 100; }
    }
    // the clamp stays as a backstop, but nothing in normal play reaches it now:
    // the numerator only ever falls, because dispersal moves 55 points out of a
    // base worth 100 rather than adding anything
    return max ? Math.min(2, (s / max) * 2) : 0; // 0..2
  }

  // The launcher groups actually in play — dispersed and not yet destroyed.
  // Undetected ones are in here too; they are shooting either way.
  const liveTels = () => TARGETS.filter(t => t.type === 'tel' && t.dispersed && t.hp > 0);

  // the war plan Tehran is actually running (see IRAN_POSTURES)
  const posture = () => IRAN_POSTURES[Game.G.iranPosture] || IRAN_POSTURES.attrition;

  // Iran's navy: the bases and the hulls that sail from them. Everything
  // downstream — carrier risk, the Hormuz reopening, the capacity meter, the
  // negotiation gate — is written against a 0..2 scale, so this reports the
  // surviving FRACTION of the fleet on that scale rather than a raw count.
  // Hulls can then be added or removed without re-tuning the whole sim.
  function navalStrength(legalOnly) {
    // A weighted mean rather than a flat one. This was already normalised — it
    // divided by fleet.length — but that meant adding any hull or base to the
    // roster silently made every existing one worth less, so a covert site
    // could not be added without quietly rebalancing the declared campaign.
    // Weighting fixes the same problem the honest way: a hidden forward base is
    // a real part of the fleet, and a smaller part than Bandar Abbas.
    let s = 0, max = 0;
    for (const t of TARGETS) {
      if (t.type !== 'naval' && t.type !== 'ship') continue;
      if (legalOnly && outlawed(t)) continue;
      max += wt(t); s += wt(t) * t.hp / 100;
    }
    return max ? (s / max) * 2 : 0; // 0..2
  }

  // Iran's third arm, and the only one with no target class of its own. The
  // militias in Iraq are an OUTPUT of the IRGC command complex that funds, arms
  // and tasks them — that complex is the thing a president can actually put a
  // package on, so it is the thing the proxy bill is denominated in. Reported on
  // the same 0..2 scale as the other two so bite() behaves identically across
  // all three: a whole IRGC is a full-price night, a flattened one pays the 0.25
  // floor. It repairs at the `command` rate, which is the fastest on the board —
  // so this is an arm that comes back if it is hit once and then forgotten,
  // which is the correct shape for a proxy network and not a reason to hit it
  // once.
  const proxyStrength = () => {
    const irgc = TARGETS.find(t => t.id === 'irgc-hq');
    return irgc ? 2 * (irgc.hp / 100) : 0;
  };

  // ---- event builders (return event objects consumed by game.js) ----
  //
  // RULE: if a number appears in both a field and the prose, `text` is a
  // FUNCTION of the event, never a string built beside it. Events are mutated
  // after they are built — aegisIntercept rescales casualties, oil and approval
  // on every strike inside the naval BMD umbrella — and a string baked at build
  // time keeps quoting the figure from before the interceptors flew. That bug
  // put three different casualty counts on the first screen a new player reads.
  // Anything appended after the fact goes in `ev.appended`; ui.js reads both
  // through one helper (`evBody`) and never touches `.text` directly.
  const { plural, pluralize, were, are } = Txt;

  // ---- WHAT AN ARM CAN STILL COST YOU ----
  // How hard an arm hits, as a multiplier on everything its events charge:
  // casualties, approval, and the barrel.
  //
  // The casualty figures always scaled with the arm's condition. The approval
  // and oil bills did not — they were flat literals — and that single omission
  // was the largest balance problem in the game. Measured over ~2,000 scripted
  // campaigns: Iranian events spent 69 points of approval per campaign while the
  // entire American air campaign returned about 24, and none of the 69 moved in
  // response to anything the president did. A war in which every brigade in Iran
  // had been destroyed still paid the full -4 approval and +8 on the barrel for
  // every salvo that flew, so counterforce bought lives and nothing else. It is
  // why a bot that did nothing at all survived six turns and the best line I
  // could write survived ten: the dominant clock in the game was not connected
  // to the game.
  //
  // Scaling the bill with the arm is what makes servicing missile brigades and
  // launcher groups a POLITICAL act as well as a defensive one — the thing the
  // design has always claimed about the missile hunt and never actually paid
  // out. The floor is deliberately not zero: a broken arm firing what it has
  // left is still a strike on an American base, and still a bad night.
  const bite = (str) => Math.max(0.25, str / 2);
  // What a salvo costs a HOST GOVERNMENT scales too — a broken arm dribbling
  // rounds at Al Udeid should not move Doha the way the opening barrage did, or
  // a president who has already won the missile war farms the coalition gauges
  // off Iran's last few launchers. But the curve is much shallower and the floor
  // is more than twice as high, because what Riyadh and Abu Dhabi are reacting to
  // is the fact of a missile landing on their territory, and that fact does not
  // decay to a quarter just because fewer of them arrived.
  const civilBite = (str) => Math.max(0.55, bite(str));
  const scaled = (ev, str) => {
    const k = bite(str);
    if (ev.dApproval) ev.dApproval = -Math.max(1, Math.round(Math.abs(ev.dApproval) * k));
    if (ev.dOil) ev.dOil = Math.max(1, Math.round(ev.dOil * k));
    const c = civilBite(str);
    if (ev.dResolve) ev.dResolve = Math.round(ev.dResolve * c);
    if (ev.dStrain) ev.dStrain = Math.round(ev.dStrain * c);
    return ev;
  };

  const EV = {
    cyber: () => ({
      title: 'Iranian cyber attack on US financial sector',
      text: 'IRGC-linked hackers briefly disrupted several regional banks and a pipeline operator. Damage contained, but markets noticed.',
      dApproval: -1, dOil: 2, approvalClass: 'news:cyber',
    }),
    harass: () => ({
      title: 'IRGC fast boats harass Gulf shipping',
      text: 'Swarm craft shadowed a US destroyer and boarded a tanker for "inspection." No shots fired — this time.',
      dOil: 3,
    }),
    propaganda: () => ({
      title: 'Tehran vows "measured but crushing" response',
      text: 'The Supreme Leader\'s office signals it does not seek all-out war, but promises retaliation for any further strikes.',
    }),
    proxyRockets: (str) => scaled({
      title: 'Proxy rocket fire near US positions in Iraq',
      text: 'Militia rockets landed near the Baghdad embassy compound and a base perimeter. No US casualties reported.',
      dOil: 2, flashAsset: 'asad', attack: { kind: 'drone', base: 'asad', count: 3 },
    }, str),
    // THE LARGEST SINGLE APPROVAL SINK IN THE GAME, and until v1.73 the last one
    // still exempt from the rule directly above. Measured over 200 campaigns it
    // charged -16.4 approval per campaign against a total charged bill of -77.3
    // — 24% of everything the president paid — as a flat -2 that no amount of
    // counterforce ever moved. Every other arm's bill scaled with its condition;
    // the biggest one did not, which is most of why servicing the IRGC read as a
    // diplomatic act with no domestic return, and why a scripted campaign that
    // fought well died on the same turn as one that did nothing.
    //
    // The casualty floor is 1 and not 0 on purpose: the prose names a number of
    // dead and has no zero branch the way missileBase does, because a militia
    // attack that makes the report at all killed somebody. A broken IRGC makes
    // these rarer and cheaper, never bloodless.
    proxyAttack: (str) => {
      const c = Math.max(1, Math.round(rand(1, 4) * bite(str)));
      return scaled({
        title: 'Militia attack on US forces in Iraq',
        text: (ev) => 'An Iranian-backed militia struck a US position with drones and rockets. ' +
          `${ev.casualties} American service ${pluralize(ev.casualties, 'member')} ` +
          `${were(ev.casualties)} killed.`,
        // -2 to -1 at v2.13, which is the largest single retune in this pass.
        // A militia rocket attack on a base in Iraq moving national approval by
        // two full points was always the wrong order of magnitude; against a
        // 42-point persuadable middle it is a twentieth of everyone who can be
        // moved, for an event that fires eight or nine times a campaign. It is
        // still the biggest line on the bill after this — see approval.js.
        casualties: c, dApproval: -1, dOil: 3, flashAsset: 'asad',
        approvalClass: 'news:proxy',
        attack: { kind: 'drone', base: 'asad', count: 5 },
      }, str);
    },
    shipping: (str) => scaled({
      title: 'Tanker struck by Iranian drone in Gulf of Oman',
      text: 'A commercial tanker was hit by a loitering munition. Crews survived; insurers are pulling coverage for Gulf transits.',
      dOil: 6,
    }, str),
    mineScare: (str) => scaled({
      title: 'Mines reported in the Strait of Hormuz',
      text: 'Two tankers reported near-misses with drifting mines. Fifth Fleet has begun minesweeping operations; transits are slowing.',
      hormuz: 'CONTESTED', dOil: 9,
    }, str),
    missileBase: (str) => {
      const base = pick(['udeid', 'asad', 'dhafra']);
      const names = { udeid: 'Al Udeid Air Base in Qatar', asad: 'Ain al-Asad Air Base in Iraq', dhafra: 'Al Dhafra Air Base in the UAE' };
      // Whose soil it landed on. The random pick was always choosing a host
      // government as well as a base and it never mattered before: a salvo on Al
      // Udeid is a Qatari problem and pushes Doha toward the exit, the same salvo
      // on Al Dhafra hardens Abu Dhabi, and Al Asad is in Iraq and moves neither.
      const host = { udeid: { dStrain: GULF.dove.struck }, dhafra: { dResolve: GULF.hawk.struck }, asad: {} }[base];
      const c = Math.round(rand(2, 8) * bite(str));
      return scaled({
        ...host,
        title: `Ballistic missile strike on ${names[base]}`,
        // the zero branch is reachable: a light salvo inside the Aegis basket
        // can be thinned to nothing, and "0 Americans were killed" is the wrong
        // way to report the night the screen worked
        text: (ev) => `Iranian missiles penetrated air defenses at ${names[base]}. ` +
          (ev.casualties
            ? `${plural(ev.casualties, 'American')} ${were(ev.casualties)} killed and ` +
              'aircraft were damaged on the ramp.'
            : 'Aircraft were damaged on the ramp. There were no American fatalities.'),
        casualties: c, dApproval: -2, dOil: 5, flashAsset: base,
        approvalClass: 'news:baseStrike',
        attack: { kind: 'missile', base, count: 4 },
      }, str);
    },
    hormuzClose: () => ({
      title: 'IRAN MOVES TO CLOSE THE STRAIT OF HORMUZ',
      text: 'Anti-ship missile batteries are active, minelayers are operating at night, and Tehran has declared the Strait closed to "hostile" shipping. A fifth of the world\'s oil is now blocked.',
      hormuz: 'CLOSED', dOil: 26,
    }),
    // The one Iranian event that chooses a CAPITAL rather than a target, and
    // since v1.72 that choice is a lever on the coalition rather than flavour.
    //
    // The interesting entry is Abqaiq, which moves both gauges at once: the
    // burning stabilisation towers harden Kuwait City and Abu Dhabi and terrify
    // Riyadh, because it is Riyadh's export that is on fire. That is Tehran
    // playing the split rather than playing the oil price, and it is the reason
    // the two gauges are separate numbers instead of one slider.
    allyStrike: (israelInPlay, str) => {
      const HAIFA = { name: 'Israeli port infrastructure at Haifa', dPressure: ISRAEL.westward };
      const ABQAIQ = {
        name: 'Saudi oil facilities at Abqaiq',
        // both, and the dove side larger: it is their plant
        dStrain: GULF.dove.struck, dResolve: Math.round(GULF.hawk.struck * 0.7),
      };
      const ABU_DHABI = { name: 'Emirati facilities near Abu Dhabi', dResolve: GULF.hawk.struck };
      const DOHA = { name: 'Qatari gas processing at Ras Laffan', dStrain: GULF.dove.struck };

      // Once Israel is in the war Tehran's salvos go there by preference. Failing
      // that, the plan decides: a STRAIT STRANGLER is fighting the war at the
      // pump and goes after Gulf energy, which is also the fastest way to break
      // the council; ATTRITION is playing for the American casualty count and
      // treats these as a sideshow. Reading the pool back is one of the tells
      // `assess-intent` is buying.
      const strangling = posture().hormuz > 1.2;
      const pool = israelInPlay ? [HAIFA, HAIFA, ABQAIQ]
        : strangling ? [ABQAIQ, DOHA, ABQAIQ, ABU_DHABI, HAIFA]
        : [ABQAIQ, HAIFA, ABU_DHABI, DOHA];
      const tgt = pick(pool);
      return scaled({
        title: `Iranian missiles strike ${tgt.name.split(' at ')[0].split(' near ')[0]}`,
        text: `A missile and drone salvo hit ${tgt.name}. Allied capitals are demanding either decisive US action or immediate de-escalation.`,
        dOil: 8, dWorld: -3, dApproval: -1,
        approvalClass: 'news:allySalvo',
        dPressure: tgt.dPressure || 0,
        dStrain: tgt.dStrain || 0,
        dResolve: tgt.dResolve || 0,
      }, str);
    },
    massBarrage: (str) => {
      const c = Math.round(rand(12, 30) * Math.max(0.35, bite(str)));
      return scaled({
        title: 'MASS MISSILE BARRAGE ACROSS THE THEATER',
        text: (ev) => 'Iran launched its largest salvo of the crisis at US bases and fleet units ' +
          'across the region. Defenses were saturated. ' +
          (ev.casualties
            ? `${plural(ev.casualties, 'American')} ${are(ev.casualties)} dead. `
            : 'Casualty reports are still coming in. ') +
          'CENTCOM assesses this as the opening of a general war.',
        // Habituating, and -4 to -3. It fires three times in a median campaign
        // and calls itself 'the largest salvo of the crisis' each time, which is
        // the definition of a story the coverage stops leading with.
        casualties: c, dApproval: -3, dOil: 12, flashAsset: 'udeid',
        approvalClass: 'news:barrage',
        // Everyone at once, and it argues in both directions in the same room:
        // the barrage is the hawks' whole case and the doves' whole case, which
        // is why it is the only event that fires both gauges hard.
        dStrain: GULF.dove.struck, dResolve: GULF.hawk.struck,
        attack: { kind: 'mixed', bases: ['udeid', 'asad', 'dhafra'], count: 4 },
      }, str);
    },
    // A two-front exchange. Iran throws a barrage at Israel and takes the
    // counter-strike: this is the one Iranian action that can cost Iran
    // capacity, because Israel is shooting back at launchers the US never
    // reached. Cuts both ways — and only a functioning Iran can sustain it.
    israelExchange: (str) => {
      // Only sites CENTCOM has. This event NAMES what the IAF caught and marks
      // it damaged — run against a covert brigade it would reveal the site by
      // name, for free, in a public event, and hand the player battle damage on
      // something that is not on their plot. (Israel telling Washington where a
      // site is would be a fine mechanic; it is not this one, and it should not
      // arrive by accident.)
      const live = TARGETS.filter(t => t.type === 'missile' && t.status !== 'destroyed'
        && Game.plotted(t));
      const hitBack = live.length > 0 && chance(0.4) ? pick(live) : null;
      const ev = scaled({
        title: 'MISSILE EXCHANGE BETWEEN IRAN AND ISRAEL',
        text: 'Iran fired a large ballistic and drone salvo at Israeli cities and airbases overnight; Arrow and David\'s Sling intercepted most of it. The IAF answered before dawn against launch sites in western Iran.',
        dOil: 6, dWorld: -4, dApproval: -1,
        approvalClass: 'news:israelExchange',
        // Israeli cities under fire is the single loudest argument for going in
        // properly, whatever Washington has asked for
        dPressure: ISRAEL.westward * 1.5,
      }, str);
      if (hitBack) {
        ev.degradeTarget = hitBack.id;
        ev.text += ` Israeli aircraft caught ${hitBack.name} in the open — the counter-strike did work CENTCOM had not scheduled.`;
      } else {
        ev.text += ' The counter-strike hit dispersal sites already abandoned. Both sides are now spending missiles to no decisive effect, and the war has a second front.';
      }
      return ev;
    },
    quiet: () => ({
      title: 'Tehran pauses',
      text: 'Intelligence reports internal debate in Tehran. No significant Iranian military action in the last 12 hours.',
    }),
    hostageParade: () => ({
      title: 'Captured Americans shown on Iranian state TV',
      text: 'Tehran airs new footage of the prisoners — coerced statements, flags, cameras. The families are watching. Congress is demanding to know the plan to bring them home.',
      dApproval: -2,
    }),
    backchannelFeeler: () => ({
      title: 'Quiet feeler through Oman',
      text: 'Muscat passes word that the pragmatists in Tehran are counting what remains of the missile force — and quietly asking what an end to the war would cost.',
    }),
  };

  // ============================================================
  // ADAPTATION
  // ------------------------------------------------------------
  // Every strike package flown is logged by platform. Past a threshold Iran
  // starts working the specific counter — hardened dispersal and decoy fields
  // against cruise missiles, massed mobile SAMs and fighter dispersal against
  // manned packages — and the base success rate of that platform drops. The
  // counter to the counter is variety, which is the whole point: a player who
  // finds one efficient package and flies it thirty times should meet an enemy
  // who noticed.
  const ADAPT_EVERY = 6;    // packages of one platform before the counter deepens
  const ADAPT_MAX = 3;      // and it stops deepening here — never impossible
  const ADAPT_PER_LEVEL = 0.05;

  const adaptLevel = (asset) => Math.min(ADAPT_MAX,
    Math.floor((Game.G.adapt[asset] || 0) / ADAPT_EVERY));

  // what computeStrike subtracts from a package's base odds
  const adaptPenalty = (asset) => adaptLevel(asset) * ADAPT_PER_LEVEL;

  const ADAPT_TEXT = {
    cruise: ['Overhead imagery shows the pattern CENTCOM has been flying being answered: inflatable decoys ' +
      'and corner reflectors going up around every site still standing, aimpoints shuffled inside the ' +
      'perimeters, and the high-value equipment moved out from under the roofs the targeting folders were ' +
      'built on. Tomahawk effectiveness is assessed down against everything on the list.',
      'Cruise-missile corridors are being seeded with barrage balloons and cabling, and the sites are ' +
      'running their generators from dispersed positions well off the surveyed coordinates. The salvos ' +
      'are still arriving. They are arriving on emptier ground.'],
    fighter: ['Iranian air defense has stopped defending places and started hunting packages: the ' +
      'surviving batteries are shooting and moving, the engagement radars come up late, and the fighter ' +
      'regiments have dispersed to highway strips. Manned strike packages are assessed to face a harder ' +
      'problem on every profile.',
      'The SAM belt is being run as an ambush rather than a barrier — emissions discipline, mobile ' +
      'launchers, and acquisition handed off from passive sensors. Our packages are flying into a threat ' +
      'that no longer sits where the last mission found it.'],
    stealth: ['Tehran has bought low-frequency early-warning radars into the approach corridors. They ' +
      'cannot generate a firing solution on a B-2 and they know it — what they can do is know a mission ' +
      'is coming and get the crews underground before it arrives.'],
    f35: ['The surviving batteries have stopped trying to track the fifth-generation packages and started ' +
      'timing them. Iranian air defense now goes to emissions silence on a schedule built from a month of ' +
      'our own tasking order, and comes up only in the terminal window — which is late enough to matter.',
      'Passive detection has improved: infrared search-and-track sets moved into the corridors, cued by ' +
      'the low-band radars. They still cannot lock an F-35. They can now put a fighter in front of one.'],
    heavy: ['The heavy cells fly the same profiles at the same altitudes because that is what a bomber ' +
      'cell does, and Tehran has been writing them down. Anything left of the mobile SAM force is being ' +
      'held back specifically for those tracks, and the aimpoints under them are being emptied first.'],
  };

  // Returns an event on the turn a platform's counter deepens, else null.
  function adaptStep(G) {
    const LABEL = { cruise: 'CRUISE MISSILE', f35: 'FIFTH-GENERATION', fighter: 'FOURTH-GENERATION',
      stealth: 'PENETRATOR', heavy: 'HEAVY BOMBER' };
    const NOUN = { cruise: 'cruise', f35: 'fifth-generation', fighter: 'fourth-generation',
      stealth: 'penetrator', heavy: 'heavy bomber' };
    for (const asset of ['cruise', 'f35', 'fighter', 'stealth', 'heavy']) {
      const lvl = adaptLevel(asset);
      if (lvl <= (G.adaptSeen[asset] || 0)) continue;
      G.adaptSeen[asset] = lvl;
      const pool = ADAPT_TEXT[asset];
      return {
        cls: 'iran', title: `IRAN ADAPTS — ${LABEL[asset]} EFFECTIVENESS DEGRADED`,
        text: pool[Math.min(lvl - 1, pool.length - 1)] +
          ` Assessed penalty to ${NOUN[asset]} packages is now ` +
          `−${Math.round(lvl * ADAPT_PER_LEVEL * 100)}%. Mixing the force is what keeps this shallow.`,
      };
    }
    return null;
  }

  // What a successful IADS network attack does to what Iran has LEARNED.
  //
  // Adaptation is a pattern built out of watching: six packages of one platform
  // and the counter deepens (ADAPT_EVERY). A command network that cannot hand a
  // track between sites cannot build that pattern either — the observations are
  // still made, but nothing correlates them — so a hit knocks every counter back
  // by one full level and takes G.adaptSeen down with it, or the next real step
  // would re-announce a level the president just paid a package to erase.
  //
  // This is the second currency the network attack pays in and the reason it is
  // worth taking EARLY rather than hoarding: adaptation is the only penalty in
  // the strike math that otherwise only ever goes up. Returns null when there is
  // nothing to relieve, which is the common case on turn 1 and is a real state
  // rather than a missing string — the caller simply has nothing to append.
  function ewNetworkHit(G) {
    const relieved = [];
    for (const asset of ['cruise', 'f35', 'fighter', 'stealth', 'heavy']) {
      const before = adaptLevel(asset);
      if (!G.adapt[asset]) continue;
      G.adapt[asset] = Math.max(0, G.adapt[asset] - EW.adaptRelief * ADAPT_EVERY);
      const after = adaptLevel(asset);
      if (after < before) {
        G.adaptSeen[asset] = after;
        relieved.push(asset);
      }
    }
    if (!relieved.length) return null;
    return {
      cls: 'friendly', title: 'IRANIAN AIR PICTURE DEGRADED — ADAPTATION SET BACK', internal: true,
      sum: `${Txt.plural(relieved.length, 'platform')} back off the counter`,
      text: (ev) => `Whatever the air defense staff had worked out about the way this campaign is being flown, ` +
        `they worked out by correlating what individual sites saw. With the network down they cannot, and the ` +
        `assessed counter against ${Txt.plural(relieved.length, 'American platform')} has come back a full ` +
        `level. It is not permanent — they will rebuild the picture from the same observations — but it is ` +
        `time, and it is the only thing in this war that has ever taken that penalty back down.`,
    };
  }

  // Bases the naval BMD umbrella actually covers — the Gulf states, not Iraq.
  // The SM-3/SM-6 shooters sit on the Gulf approaches and not over the Iraqi
  // interior, so Ain al-Asad is left to its own Patriots and is deliberately
  // outside this basket.
  const BASKET = ['udeid', 'dhafra'];
  const coveredBases = (ev) => {
    if (!ev.attack || ev.attack.kind === 'drone') return [];
    const a = ev.attack;
    const bases = a.bases || (a.base ? [a.base] : []);
    return bases.filter(b => BASKET.includes(b));
  };

  // How the escorts' night is read back to the president, by how much of the
  // raid they actually stopped. The old text said they "caught much of it in
  // the midcourse" at every rate there was, which was a lie the moment the
  // magazine could run down: at 15% the screen is not catching much of anything,
  // and a report that says otherwise beside a casualty count that says the
  // opposite teaches the player to stop reading it.
  // The bands are set against the rate this system actually produces —
  // NAVAL_BMD.peak down to NAVAL_BMD.floor — rather than against a tidy 0..1, so
  // the top line is only ever read on a full magazine and the bottom one only
  // when the cells are effectively gone.
  const AEGIS_TIERS = [
    [0.70, 'broke the raid up in the midcourse — SM-3 and SM-6 intercepts took down almost all of it well short of the coast.'],
    [0.45, 'caught much of it in the midcourse — SM-3 and SM-6 intercepts thinned the raid badly before it crossed the coast.'],
    [0.25, 'engaged what they could reach; a share of the raid went down over the water and the rest came through.'],
    [0.12, 'got shots off at the leaders and no further — the screen is firing single rounds now, and most of the salvo crossed the coast intact.'],
    [0.00, 'are down to the rounds they hold back for their own defence. A handful of terminal engagements is not an umbrella, and the raid came through essentially unopposed.'],
  ];
  const aegisLine = (frac) => (AEGIS_TIERS.find(t => frac >= t[0]) || AEGIS_TIERS[AEGIS_TIERS.length - 1])[1];

  // Thin a night's ballistic salvo by whatever the forward carrier group's Aegis
  // escorts can still intercept, and charge the rounds it took. What the screen
  // is worth tonight is a function of the magazine and of the deck's station —
  // Game owns both, so the rate and the drain are read through Game.bmdEngage
  // and nothing here touches the count (see NAVAL_BMD in data.js).
  //
  // Every qualifying strike is scaled down together, taking casualties, oil and
  // approval damage with it, and each one spends its own rounds — so a night of
  // two salvos costs twice what a night of one costs, which is the entire reason
  // suppressing the missile force is now also a defensive act.
  function aegisIntercept(events, fwd) {
    if (fwd <= 0) return;
    for (const ev of events) {
      const bases = coveredBases(ev);
      if (!bases.length) continue;
      // tracks the screen has to solve tonight: every inbound aimed at a base
      // inside the basket
      const tracks = bases.length * (ev.attack.count || 0);
      const shot = Game.bmdEngage(tracks);
      const frac = shot.frac;
      if (frac <= 0) continue;
      const before = ev.casualties || 0;
      if (before > 0) ev.casualties = Math.round(before * (1 - frac));
      if (ev.dOil) ev.dOil = Math.round(ev.dOil * (1 - frac));
      if (ev.dApproval) ev.dApproval = Math.round(ev.dApproval * (1 - frac));
      // A salvo the screen caught in the midcourse is a salvo the host government
      // did not photograph, so the coalition damage is scaled with everything
      // else. This is the umbrella's second job and the better argument for
      // keeping it up: the interceptors are holding the alliance together as well
      // as the ramp, and a war that lets the cells run dry loses both at once.
      if (ev.dResolve) ev.dResolve = Math.round(ev.dResolve * (1 - frac));
      if (ev.dStrain) ev.dStrain = Math.round(ev.dStrain * (1 - frac));
      const saved = before - (ev.casualties || 0);
      // read by the report's digest and by the campaign sim; the prose below is
      // what the president actually sees
      ev.bmdEngaged = tracks; ev.bmdFired = shot.fired; ev.bmdSaved = saved;
      // appended, not concatenated onto `text` — the builders write their prose
      // as a function of the event and this runs after them, so the casualty
      // figure above is already the post-intercept one by the time it renders
      // The tier line closes its own sentence and the lives saved open a new one:
      // at the bottom of the range the clause it used to hang off says the raid
      // came through, and "came through unopposed, and three lives were saved"
      // is a sentence that argues with itself. Zero is reachable at both ends —
      // a full magazine can leave nobody dead to save, and an empty one saves
      // nobody — so the clause is dropped rather than printed as a nought.
      ev.appended = (ev.appended || '') +
        ` Aegis destroyers of the carrier group standing off the Gulf ` + aegisLine(frac) +
        (saved > 0
          ? ` An estimated ${plural(saved, 'American life')} ${were(saved)} saved on the ramp.`
          : '') +
        (shot.fired > 0
          ? ` ${plural(shot.fired, 'interceptor')} expended; ${shot.left} left in the cells.`
          : ' The cells are empty.');
    }
  }

  // Decide Iran's response this turn. There is no abstract escalation ladder:
  // what Iran does is a function of what it has left (capacity), how far the
  // war machine has spun up (spool), and whether anyone is coordinating it.
  function respond(G) {
    const events = [];
    const mStr = missileStrength();
    const nStr = navalStrength();
    const pStr = proxyStrength();
    const cap = mStr + nStr; // 0..4
    const struckOil = G.struckThisTurn.some(id => ['kharg', 'abadan'].includes(id));
    const struckNuclear = G.struckThisTurn.some(id => ['natanz', 'fordow'].includes(id));
    const struckAny = G.struckThisTurn.length > 0;

    // coordination: killing command degrades the response machine
    const irgc = TARGETS.find(t => t.id === 'irgc-hq');
    let coord = (0.6 + 0.4 * (irgc.hp / 100)) * (DIFFICULTY[G.difficulty] || DIFFICULTY.normal).coord;
    if (G.regimeChaosTurns > 0) coord *= 0.55;                      // decapitated: paralysis
    else if (G.regimeErratic) coord = Math.min(1.15, coord + 0.25); // erratic remnant: lashing out
    // the war machine spins up over the first days, faster when provoked
    const spool = Math.min(1, 0.5 + 0.25 * (G.turn - 1) + (struckAny ? 0.25 : 0));
    // Israel in the war is a mobilizing argument in Tehran: whatever the
    // regime has left, more of it gets thrown, and some of it goes west
    const israelInPlay = G.israelPosture !== 'sidelined';
    const w = Math.min(1.3, coord * spool * (israelInPlay ? 1.2 : 1));
    // Carrier presence forward in the Gulf of Oman: a wall of Aegis on the Gulf
    // approaches and a standing threat to anything Iran sails at the strait.
    // hormuzGuard scales down every attempt to close Hormuz — 1.0 with the deck
    // back, ~0.65 with her forward. The 0.3 floor is dead code now and left
    // standing on purpose: only the Lincoln can earn this, so the term tops out
    // at one deck, and the strait stays closable even with her on station.
    const fwd = Game.navalForward();
    const hormuzGuard = Math.max(0.3, 1 - 0.35 * fwd);
    // Tehran's war plan, which the player cannot see until they buy it: the
    // same event pool, weighted toward the arm this regime has decided matters
    const P = posture();

    // Revenge logic: hitting oil draws shipping/economic retaliation
    if (struckOil && nStr > 0) events.push(chance(0.6) ? EV.shipping(nStr) : EV.mineScare(nStr));

    if (cap <= 1) {
      // capacity overrides intent: a broken Iran cannot sustain the war
      events.push(chance(0.6) ? EV.quiet() : EV.propaganda());
      if (chance(0.25)) events.push(EV.proxyRockets(pStr));
    } else {
      // the missile arm throws what it has — while it exists, it is lethal
      if (mStr > 0 && chance(0.95 * w * P.missile)) {
        events.push(mStr >= 1.5 && chance(0.6 * w * P.missile) ? EV.massBarrage(mStr) : EV.missileBase(mStr));
      } else {
        // cyber and harass take no strength and ignore the argument; the two
        // proxy builders need it, and handing it to all four keeps the pick a
        // pick rather than a switch.
        events.push(pick([EV.proxyAttack, EV.proxyRockets, EV.cyber, EV.harass])(pStr));
      }
      if (chance(0.35 * w * P.proxy)) events.push(EV.proxyAttack(pStr));
      // hitting the nuclear program draws a dedicated reprisal salvo
      if (struckNuclear && mStr > 0 && chance(0.5)) events.push(EV.missileBase(mStr));
      // the naval arm contests the strait — but not before the minelayers have
      // had time to sail, or the plan reads itself out on night one (NAVAL_SPINUP)
      if (nStr > 0 && G.turn >= NAVAL_SPINUP) {
        if (G.hormuz === 'OPEN' && nStr >= 1.5 && chance(0.2 * w * P.hormuz * hormuzGuard)) events.push(EV.hormuzClose());
        else if (G.hormuz === 'OPEN' && chance(0.3 * w * P.naval)) events.push(EV.mineScare(nStr));
        else if (G.hormuz === 'CONTESTED' && chance(0.35 * w * P.hormuz * hormuzGuard)) events.push(EV.hormuzClose());
      }
      if (chance((israelInPlay ? 0.5 : 0.3) * w * P.ally)) events.push(EV.allyStrike(israelInPlay, mStr));
      // a sustained two-front fight needs a missile force that still exists
      if (israelInPlay && mStr > 0 && chance(0.4 * w)) events.push(EV.israelExchange(mStr));
    }

    // ---- adaptation ----
    // An enemy that is hit the same way every night stops standing still for
    // it. Lean on one platform and Iran works the counter to that platform:
    // dispersal and decoys against the Tomahawk, massed and mobile SAMs against
    // the strike packages. It never becomes impossible, it becomes expensive —
    // and mixing the force keeps both counters shallow.
    const step = adaptStep(G);
    if (step) events.push(step);

    // Tehran only sues for peace when its ability to fight is actually shattered
    if (cap <= 1 && G.nukeDegraded() >= 75 && chance(0.35)) {
      events.push(EV.backchannelFeeler());
    }

    // A dispersal that has been located and then left alone does not wait to be
    // serviced. Finding them is not killing them.
    for (const t of liveTels()) {
      if (!t.located || G.struckThisTurn.includes(t.id)) continue;
      if (!chance(TEL_RELOCATE)) continue;
      t.located = false;
      MapView.updateTarget(t);
      events.push({
        cls: 'iran', title: `${t.short} HAS MOVED — TRACK LOST`, internal: true,
        text: `The launcher group in the ${t.name.split(' — ')[1] || 'interior'} broke hide overnight and ` +
          'is no longer where the targeting folder says it is. Nothing was struck there, so nothing held ' +
          'them. The fix is stale and the group is off the plot until ISR finds it again.',
      });
    }

    // Captured raid personnel are a recurring propaganda drumbeat — a standing
    // political cost, not a death spiral: often enough to stay a running sore,
    // rare enough that it cannot bleed a presidency out on its own.
    if (G.hostageCrisis && chance(0.22)) events.push(EV.hostageParade());

    // Aegis over the Gulf: a carrier group forward puts SM-3/SM-6 shooters on
    // the ballistic approaches to the Gulf-state bases, and they knock down part
    // of every salvo aimed there. Applied after the missile events are built so
    // it thins whatever Tehran actually threw tonight — fewer dead, less damage
    // on the ramp, a smaller political and economic bruise.
    aegisIntercept(events, fwd);

    // Hormuz reopens the war-sim way: break Iran's navy and the Fifth Fleet
    // clears the strait by force. While the navy fights, it mostly stays shut —
    // though a carrier group forward escorting the convoys hurries it along.
    // The escorted-convoy term was 0.12 + 0.12·fwd, which reads as "a deck
    // forward hurries it along" and was not one: one carrier moved a closed
    // strait from a 12% to a 24% chance of clearing, against a loss condition
    // that fires on SEVEN consecutive closed nights. When campaigns ended on
    // turn seven that wall was never reached and the weakness never showed; at
    // fifteen-plus turns it became the second most common way to lose, with the
    // only counter being a coin flip. Standing the deck on the strait is now
    // worth what the prose has always said it was worth.
    // Continuous in both levers rather than a binary on the navy plus a token
    // carrier term. The old shape was `nStr < 1 ? 0.65 : 0.18 + 0.22·fwd`, which
    // meant every point of damage short of breaking the navy outright bought
    // nothing at all, and a war with the fleet at 60% cleared the channel at the
    // same rate as a war that had not touched it. Now sinking hulls and standing
    // a deck on the strait both pay, and they compound: 0.15 with nothing done,
    // 0.40 with a deck forward, ~0.85 once the navy is finished.
    const clearOdds = 0.15 + 0.25 * fwd + 0.35 * Math.max(0, 1 - nStr / 2);
    if (G.hormuz !== 'OPEN' && chance(clearOdds)) {
      events.push({
        title: 'Strait of Hormuz reopened by force',
        text: nStr < 1
          ? 'With Iranian naval bases in ruins, minesweepers and escorts cleared the channel. Convoys are moving under Fifth Fleet guns, ' +
            'a fifth of the world\'s oil is flowing again, and allied capitals are exhaling.'
          : 'With minesweepers working and Iranian naval activity reduced, convoys are moving again under escort, and the shipping lanes are ' +
            'reopening to global traffic.',
        // reopening the strait is the de-escalation the whole world was waiting
        // on: the immediate war premium comes off the barrel and standing abroad
        // recovers as the shipping the closure threatened starts moving again.
        hormuz: 'OPEN', dOil: -26, dWorld: 6,
      });
    }

    return events;
  }

  // ---- Advisors ----
  // ============================================================
  // FOUR PEOPLE WHO HAVE READ THE SAME BOARD YOU HAVE
  // ------------------------------------------------------------
  // Each advisor used to be an if/else ladder: fifteen branches in a fixed
  // order, first match wins. That shape has one virtue — the order IS the
  // design, written down — and two failures that got worse every version.
  //
  // The order was fixed and the WAR is not. A ladder says "the force-flow
  // decision outranks the interceptor magazine" once, forever, when what is
  // actually true is that it outranks it on turn 2 and does not on turn 11 with
  // the cells at 12%. Every time a branch was added it went in at the position
  // that looked right on the night it was written, and nothing ever re-read the
  // ones above it.
  //
  // And the bottom of every ladder was a slogan. "Sustain the sortie rate."
  // "Tempo is mercy." "No talks while they can still shoot." Those are true of
  // every night of every campaign, which is another way of saying they tell a
  // president nothing about this one — and they fired constantly, because the
  // specific branches above them each needed a specific situation and the
  // generic one needed nothing.
  //
  // So an advisor is now a TABLE OF CANDIDATES scored against the same board
  // the staff writes the brief from (assess.js), and they say the one that
  // wants the floor most tonight.
  //
  //   when(b)   does this situation exist at all
  //   sev(b)    how loudly it wants the floor, 0..1
  //   make(b)   the line, the argument, and whether it is urgent
  //
  // `sev` IS THE OLD ORDERING, made explicit and then allowed to move. The base
  // numbers below reproduce the ladder each advisor used to be — that is
  // deliberate, and it is why this was a safe change to make — but they are now
  // functions, so a magazine at 12% climbs past the force-flow decision on its
  // own instead of waiting for someone to renumber the file. The scale is
  // shared with Assess.concerns and means the same thing: 0.9 is perishable
  // tonight, 0.7 decides the campaign, 0.5 wants a package this week, 0.3 is
  // the standing background of the war.
  //
  // Two rules for adding one.
  //
  // `urgent` means NEW TONIGHT AND PERISHABLE — a fix that expires, a clock
  // inside the time it takes to do anything else, a vote about to happen. It is
  // not "important": every candidate here is important or it would not have
  // been written. Mark sparingly; an urgent flag every turn is the wall again
  // with extra steps.
  //
  // And a candidate has to be able to say a NUMBER a player could not have got
  // from the top bar. That is the bar the slogans failed. If the argument reads
  // the same on turn 3 and turn 23, it belongs in the primer, not in the mouth
  // of somebody who is supposed to have read this morning's traffic.
  // ============================================================

  // ---- and nobody says the same thing four nights running ----
  // Severity alone picks the loudest STANDING condition, and a standing
  // condition is the one thing that never stops being true. Measured over 300
  // campaigns the first version of this table had SecState opening with "the
  // joint package is on the board, spend it" on 69% of all nights, CJCS with
  // "Gulf ramps lost" on a third of them, and SecDef with the counter-
  // infrastructure argument on 40% — every one of them a good argument, every
  // one of them correct, and none of them worth the floor for the eleventh
  // consecutive evening. That is the ladder's failure in a new costume: not a
  // slogan this time, but still the same sentence.
  //
  // So an argument that has already been made is damped, gently, and recovers
  // the moment somebody else takes the floor. The numbers are small on purpose:
  // 12% a night to a floor of 55% moves an argument down past its NEIGHBOURS,
  // which is the actual failure, while leaving the order of the table intact
  // everywhere the gap is real. What it produces is a rotation rather than a
  // reordering: the room comes back to the joint package, it just stops opening
  // with it every single night. At the first floor tried, 9% to 0.72, SecState
  // still led with it on 63% of nights — damped it was 0.403 against a 0.400
  // neighbour. A damper has to clear the gap to the next argument or it is
  // decoration.
  //
  // `heard` is committed at the TURN BOUNDARY and not on every call, because
  // renderAdvisors runs on every render and an advisor who changed their mind
  // between two draws of the same night would be worse than one who repeats.
  const DAMP_STEP = 0.12, DAMP_FLOOR = 0.55;
  const heard = new Map();          // "advisor|candidate" -> consecutive nights
  const lastPick = new Map();       // advisor -> candidate id, awaiting commit
  let heardTurn = -1;

  // Use costs a night, rest pays back half of one. The first version reset an
  // argument's counter to zero the moment somebody else took the floor, which
  // produced a three-on-one-off sawtooth and left the dominant line on 55% of
  // nights — a night off is not the same as never having said it. Accumulating
  // means an argument the room has leaned on all war sits near the floor and
  // has to be genuinely displaced for several nights to come back at full
  // weight, which is what "we covered this on Tuesday" actually behaves like.
  const DAMP_RECOVER = 0.5;
  function commitHeard(turn) {
    if (heardTurn === turn) return;
    // a new war rewinds the clock; nothing carries across campaigns
    if (turn < heardTurn) { heard.clear(); lastPick.clear(); }
    else if (heardTurn >= 0) {
      for (const k of [...heard.keys()]) {
        const name = k.slice(0, k.indexOf('|'));
        if (`${name}|${lastPick.get(name)}` !== k) heard.set(k, Math.max(0, heard.get(k) - DAMP_RECOVER));
      }
      for (const [name, id] of lastPick) {
        const k = `${name}|${id}`;
        heard.set(k, (heard.get(k) || 0) + 1);
      }
    }
    heardTurn = turn;
  }

  // The one that wants the floor most, out of the ones that apply.
  function speak(name, cls, table, b) {
    let best = null;
    for (const c of table) {
      if (c.when && !c.when(b)) continue;
      // `hold` exempts the four situations that are THEMSELVES expiring, and
      // the rule is exactly that: aircrew alive inside a closing cordon, a
      // breakout estimate inside single digits, a fix on a launcher group that
      // does not survive the night, and a negotiation window that shuts. None
      // of those is a standing condition being restated — each is a decision
      // that is live and new every evening until it resolves, and an advisor
      // who moved on from one after three nights would be describing a
      // different war than the one on the map. Everything else in these tables
      // is a state of the world, and a state of the world does not need saying
      // twice.
      const rep = c.hold ? 0 : (heard.get(`${name}|${c.id}`) || 0);
      const sev = c.sev(b) * Math.max(DAMP_FLOOR, 1 - rep * DAMP_STEP);
      if (!best || sev > best.sev) best = { sev, c };
    }
    // Every table ends in a candidate with no `when`, so this cannot happen —
    // but an advisor rendering as a blank row would be a silent failure, and a
    // visible one is cheaper to find.
    if (!best) return { name, cls, line: 'No change in my assessment tonight.', text: '' };
    lastPick.set(name, best.c.id);
    const said = best.c.make(b);
    return { name, cls, line: said.line, text: said.text, urgent: !!said.urgent };
  }

  // Shared readings the tables below argue from. `warStr` is the two arms on
  // their own 0..2 scales added together — a habit from the original ladder,
  // kept because three thresholds are written against it.
  const advWarStr = (b) => b.mStr + b.nStr;

  // Sites hit but not finished, worst first — the ones the repair crews own.
  // Sorted on the ASSESSED figure, because that is all anyone in this room
  // actually has; the true number is not available to the people talking.
  const repairing = () => TARGETS
    .filter(t => Game.wearsDown(t) && t.hp > 0 && t.hp < 100 && Game.plotted(t))
    .map(t => ({ t, e: Game.estimate(t) }))
    .sort((a, b) => a.e.mid - b.e.mid)
    .map(x => x.t);

  // ---- SecDef Whitfield: the hawk, and the one who reads the fires ----
  const SECDEF = [
    {
      // Launchers loose in the country outrank everything else on this table:
      // it is the one situation where the battle damage assessment is actively
      // lying to the player about how the war is going, and the one branch here
      // with an expiry date measured in one turn.
      id: 'telfix', hold: true,
      when: b => b.telsFound > 0,
      sev: b => 0.90 + Math.min(0.06, b.telsFound * 0.02),
      make: (b) => ({
        urgent: true,
        line: b.telsFound === 1
          ? 'Fix on a launcher group — service it tonight.'
          : `Fix on ${b.telsFound} launcher groups — service them tonight.`,
        text: `We have a fix on ${b.telsFound === 1 ? 'a launcher group' : `${b.telsFound} launcher groups`} ` +
          'and fixes on those do not keep. They shoot and move — service them tonight or spend another ' +
          'week of ISR earning the same fix twice. This is the part of the missile force that is still ' +
          'killing Americans, and it is the part that is not on any of the imagery you have been shown.',
      }),
    },
    {
      // The screen running out of interceptors is the one thing on this table
      // the player has no other way to find out about until the casualty list
      // tells them. It climbs on its own now rather than sitting at a fixed
      // rung: at 12% with salvos still coming it outranks everything except a
      // perishable fix, which is exactly the night the old ladder buried it
      // under a force-flow decision from turn 2.
      id: 'bmd',
      when: b => !b.bmdRearming && b.bmd <= NAVAL_BMD.warn && b.mStr > 0,
      sev: b => 0.50 + (1 - b.bmd / NAVAL_BMD.warn) * 0.40,
      make: (b) => {
        const pct = Math.round(b.bmd * 100);
        const crit = b.bmd <= NAVAL_BMD.crit;
        return {
          urgent: crit,
          line: crit
            ? 'The screen is out of interceptors. Rearm her or accept the salvos.'
            : `Interceptor magazine is down to ${pct}%. Decide before it is empty.`,
          text: `The Aegis screen is at ${pct}% of its war-load` +
            (b.forward > 0
              ? `, and stopping about ${Math.round(b.bmdRate * 100)}% of what they throw at Udeid and Dhafra. `
              : ', and she is not on station, so at the moment it is stopping nothing at all. ') +
            (crit
              ? 'The umbrella is a formality now — the next barrage lands on the ramp intact. '
              : 'Every salvo takes another bite out of it. ') +
            'There is no reloading a Mk 41 cell underway. If you want that magazine back she detaches to the ' +
            'ammunition ship, and you buy it with three nights of no Aegis, no weight on the strait and no lid ' +
            'on the barrel. The cheaper answer is the one you already have: every launcher and every brigade ' +
            'you service tonight is a salvo the screen does not have to shoot down next week.',
        };
      },
    },
    {
      // Early on, the force-flow decision outranks everything else SecDef has
      // to say — and it decays rather than switching off at turn 3, because
      // what makes it urgent is that the transit is long and the war is short,
      // and both of those are continuous.
      id: 'flow',
      when: b => !b.bombersOrdered && !Game.G.secondCarrierOrdered && b.deg < 100,
      sev: b => Math.max(0, 0.80 - b.turn * 0.06),
      make: () => ({
        urgent: true,
        line: 'The Ford or the B-2 fleet — bring one to theater.',
        text: 'Fifth Fleet runs one transit a night. The Ford is five turns out — worth double what one deck ' +
          'gives you. The B-2s are one turn out, and they are the only aircraft in the inventory that can put ' +
          'a penetrator through Fordow. One goes tonight, the other tomorrow. Decide which before the week ' +
          'decides for you.',
      }),
    },
    {
      id: 'beaten',
      when: b => b.deg >= 100 && advWarStr(b) <= 1.5,
      sev: () => 0.74,
      make: (b) => ({
        line: 'They are beaten. End it on our terms.',
        text: `They're beaten and they know it — ${b.gateDone} of the three gates are closed. Finish the ` +
          'missile force, the navy, and the IRGC command node, and end this on our terms, not theirs.',
      }),
    },
    {
      // Which of the three components of the victory condition is actually
      // holding the war open, named, with the number. Nothing in the old ladder
      // said this: the objectives panel draws warMachine() as three bars and
      // nobody in the room ever pointed at the short one. It is the single most
      // useful sentence SecDef has in the middle third of a campaign, which is
      // where the old table fell through to "sustain the sortie rate".
      id: 'gate',
      when: b => b.gateLag && !b.gateLag.done && b.turn >= 4,
      sev: b => 0.34 + (b.deg >= 100 ? 0.22 : 0) + (b.gateLag.pct < 40 ? 0.08 : 0),
      make: (b) => {
        const lag = b.gateLag;
        const others = b.gate.filter(g => g !== lag);
        return {
          line: `${lag.label} is the gate that is not moving — ${lag.pct}% of the way to the bar.`,
          text: `Understand how this war is scored, because it is not scored on tonnage. Three things have ` +
            `to be true at once: the missile force broken, the navy broken, IRGC command destroyed. ` +
            `${others.map(g => `${g.label[0].toUpperCase()}${g.label.slice(1)} ${g.done
              ? 'is there' : `is at ${g.pct}%`}`).join(', ')}. The ${lag.label} is at ${lag.pct}% and it is ` +
            `the one holding the rest of it open. ` +
            (lag.key === 'missiles'
              ? 'That means brigades and launcher groups, and it means the dispersed ones — the meter counts ' +
                'them whether we can see them or not.'
              : lag.key === 'navy'
                ? 'That means hulls and the bases they sail from. A damaged warship is not a partial credit; ' +
                  'she is on the bottom or she is still shooting.'
                : 'That is one building, it does not repair to anything useful once it is gone, and it is the ' +
                  'cheapest of the three to close.'),
        };
      },
    },
    {
      // The counter-infrastructure argument, made at the one moment it is
      // strongest: a battery this campaign already flattened is radiating
      // again, so the president is looking at proof that servicing a site is
      // damage they rented. It names the mechanism outright — INFRA_RESUPPLY is
      // not something a player can infer from a condition bar.
      id: 'infra',
      when: b => b.adBack > 0 && TARGETS.some(t => t.type === 'infra' && t.hp > 0) && b.turn >= 4,
      sev: b => 0.52 + Math.min(0.12, b.adBack * 0.05),
      make: (b) => ({
        line: 'Stop re-servicing the belt. Break what rebuilds it.',
        text: `We flattened ${b.adBack === 1 ? 'that battery' : `${b.adBack} of those batteries`} already and ` +
          `${b.adBack === 1 ? 'it is' : 'they are'} radiating again tonight, and it will happen a third time, ` +
          'because the ground was never the point — the reserve rolls a replacement in from the interior every ' +
          'time we look away. You can go back and keep the wreckage smoking every four nights for the rest of ' +
          'this war and pay for it in packages and aircrew, or you can go after what moves the replacement. ' +
          'The crossings and the switchyards are on the folder. Nothing in that country gets rebuilt without ' +
          'the railway and the grid, neither is hardened, neither is defended, and both are where they have ' +
          'been on the imagery for forty years. It slows every repair crew in Iran at once — the belt, the ' +
          'runways, the piers. Secretary Okafor will tell you what it costs abroad and she will not be wrong ' +
          'about a word of it. She is also not the one who reads the casualty list to the families.',
      }),
    },
    {
      // The BDA is lying, and the number it is lying by. Below the fix branch
      // because a fix expires tonight and this does not.
      id: 'hidden',
      when: b => b.telsHidden > 0,
      sev: b => 0.30 + Math.min(0.16, b.telsHidden * 0.04),
      make: (b) => ({
        line: 'The BDA is lying to you — launchers are still loose.',
        text: 'Understand what the battle damage assessment is not telling you: the bases are rubble and the ' +
          `brigade is not dead. ${b.telsHidden === 1 ? 'A launcher group is' : `${b.telsHidden} launcher groups are`} ` +
          'out in the country, they are still shooting, and the capacity meter is counting them whether we can ' +
          'see them or not. Put the collection assets on the hunt or accept the salvos indefinitely.',
      }),
    },
    {
      // The floor, and it is no longer a slogan: what it costs to have flown a
      // quiet night, priced off the repair the campaign is actually paying for.
      id: 'tempo',
      when: null,
      sev: () => 0.12,
      make: (b) => {
        const rep = repairing();
        return {
          line: rep.length
            ? `${Txt.plural(rep.length, 'site')} we have already hit ${Txt.are(rep.length)} repairing tonight.`
            : 'Nothing on the list is repairing. Press it.',
          text: rep.length
            ? `This is a war now, Mr. President — fight it like one. ${Txt.plural(rep.length, 'site')} we have ` +
              `already paid for ${Txt.are(rep.length)} working through the night, ` +
              `${rep.slice(0, 3).map(t => `${t.short} at ${Game.condition(t)}`).join(', ')}, and every one of ` +
              'them climbs back toward full while we service something else. Sustain the sortie rate and ' +
              'concentrate it. A quiet night is not a night off, it is a night we buy the same damage twice.'
            : 'Nothing on the target list is under repair tonight, which is the first time I have been able ' +
              'to say that. That is what a concentrated campaign looks like and it does not last — every site ' +
              'we leave wounded starts climbing again the moment we look away. Press it while the board is ' +
              'clean.',
        };
      },
    },
  ];
  // ---- SecState Okafor: the dove, and the one who pays the bill abroad ----
  const SECSTATE = [
    {
      // the window where a signed win exists at all — it does not stay open
      id: 'talks', hold: true,
      when: () => Game.G.negotiationReady(),
      sev: () => 0.88,
      make: () => ({
        urgent: true,
        line: `Tehran might sign — about ${Math.round(Game.G.dealOdds() * 100)}%. Authorize the channel.`,
        text: 'Tehran is broken — this is the rare moment a backchannel might actually close. My read is ' +
          `about ${Math.round(Game.G.dealOdds() * 100)}% tonight, and a rebuff is not a closed door: the ` +
          'channel stays warm and every attempt after one leaves them likelier to take the call. If you want ' +
          'the win signed instead of just shattered, authorize the Omani channel now.',
      }),
    },
    {
      // THE ON-RAMP, and it is the half that was missing. The line above fires
      // on the nights the window is open — median turn 29 of a campaign that
      // ends on 29, which is a recommendation arriving after the decision. This
      // one fires from the night the program finishes, median turn 15, and says
      // what the remaining fourteen turns are FOR. Not urgent and not held: it
      // is a standing condition and the damper is supposed to rotate it out.
      id: 'talks-coming',
      when: b => b.deal.program.done && !b.deal.open,
      sev: b => 0.44 + 0.22 * b.deal.machine.pct / 100,
      make: (b) => ({
        line: `A signed end is ${plural(100 - b.deal.machine.pct, 'point')} off — the ${b.deal.arm} is holding it.`,
        text: 'The halls are finished, which means the only thing between this war and a signature is how ' +
          `much of their war machine is still standing. We are at ${b.deal.machine.pct}% of what Tehran needs ` +
          `to lose before the pragmatists can move, and the ${b.deal.arm} is the heavier half of what is left. ` +
          'Service that and I can put something in front of them. Sanctions in the meantime — leverage is ' +
          'what the channel spends when it opens.',
      }),
    },
    {
      id: 'israel-alone',
      when: b => b.israel.posture === 'sidelined' && b.israel.eta !== null &&
        b.israel.eta <= 2 && b.deg < ISRAEL.standDown,
      sev: b => 0.82 - b.israel.eta * 0.04,
      make: (b) => ({
        urgent: true,
        line: `Jerusalem flies alone in ~${Txt.turns(b.israel.eta)} unless you move.`,
        text: `Jerusalem has stopped asking. My read is ${Txt.turns(b.israel.eta)} before they fly it ` +
          'themselves — and a unilateral Israeli strike is the worst version of this: the escalation without ' +
          'the results, and they will do it again. Bring them in on our terms, service the aimpoints they came ' +
          'for, or buy time and pay for it at home.',
      }),
    },
    {
      id: 'unilateral',
      when: b => b.israel.posture === 'unilateral',
      sev: () => 0.70,
      make: (b) => ({
        line: 'Coalition is bleeding out. Get me an end state.',
        text: 'The Israelis went without us and the world has decided we blessed it. I am losing basing rights ' +
          `and coalition partners by the hour — standing abroad is ${Math.round(b.world)} and falling — and ` +
          'they will go again. Nothing I say in New York lands until this war has an end state. Get me one.',
      }),
    },
    {
      // The council before it votes, and this is State's half of it: CJCS gets
      // the version where the ramps are already gone and the advice is "get the
      // number up", which is advice that arrives three turns too late. This is
      // the same fact while it is still a decision.
      id: 'basing',
      when: b => b.basing.gulf && b.world - b.foldAt <= 12,
      sev: b => 0.40 + (12 - (b.world - b.foldAt)) / 22,
      make: (b) => {
        const margin = Math.max(0, Math.round(b.world - b.foldAt));
        return {
          urgent: margin <= 4,
          line: `${Txt.plural(margin, 'point')} of standing between us and losing the Gulf ramps.`,
          text: `I want you to look at one number tonight and it is not the approval rating. Standing abroad ` +
            `is ${Math.round(b.world)}. The Gulf tier folds at ${b.foldAt}` +
            (b.gulf.caveats
              ? ` — not the ${BASING_TIERS.gulf.at} it started at, because Riyadh and Doha have filed ` +
                `${Txt.plural(b.gulf.caveats, 'caveat')} and every one of them walked that threshold up ` +
                'toward us. They do not walk it back down.'
              : ', and the council has not started filing caveats yet, which is the only reason it is still ' +
                'that low.') +
            ` That is ${Txt.plural(margin, 'point')}. It is one province going dark, or two bad nights in ` +
            'Manama, and then Al Udeid is a parking lot and the Chairman is explaining to you why nothing ' +
            'past the interior is reachable. ' +
            (b.gulf.corridor
              ? 'Amman and Kuwait City are holding the northern corridor open on their own account, so we keep ' +
                'the deep aimpoints when it goes. We keep nothing else.'
              : 'The hawks would hold a corridor for us if they were asked. They have not been asked.'),
        };
      },
    },
    {
      // The other side of the dual-use argument, in two tiers, because a cut
      // rail bridge and a dark province are not the same argument and must not
      // share a sentence. Both concede SecDef's point on the way past: an
      // objection that pretends the military value is not there is not an
      // argument, it is a mood, and the player would learn to skip it.
      id: 'grid',
      when: () => TARGETS.some(t => t.type === 'infra' && t.energy && t.hp <= 0),
      sev: () => 0.60,
      make: () => {
        const n = TARGETS.filter(t => t.type === 'infra' && t.energy && t.hp <= 0).length;
        return {
          urgent: n >= 2,
          line: n === 1
            ? 'A province is dark. Understand what that buys and what it costs.'
            : `${Txt.plural(n, 'grid')} are down. I have run out of things to say in New York.`,
          text: 'I want it on the record what a generating station is, because the folder calls it ' +
            'infrastructure and the wires abroad will not. It is the pumps that move water across a desert. ' +
            'It is the cold chain, the sewage plants, and every hospital past the day its generator runs dry — ' +
            'and the diesel for those generators comes up the roads we are also cutting. We did this to Iraq ' +
            'in 1991 and the argument over whether it was lawful is still running, which is exactly my point: ' +
            'it is not settled, it is arguable in both directions, and every foreign ministry I deal with has ' +
            'already chosen which direction it likes. ' +
            (n >= 2
              ? 'With the second one down, the speech I can still give is that we were right. The one I can no ' +
                'longer give is that we were proportionate, and that is the one that holds a coalition together.'
              : 'I can hold the line on one plant. I cannot hold it on a campaign, and Whitfield is going to ' +
                'ask you for the second one tomorrow night.'),
        };
      },
    },
    {
      id: 'spans',
      when: () => TARGETS.some(t => t.type === 'infra' && t.hp < 100),
      sev: () => 0.46,
      make: () => ({
        line: 'Those spans are dual-use, and the second use is a city.',
        text: 'I am not going to stand here and tell you the crossings are not military. They are, ' +
          'and Whitfield is right that most of what Tehran repairs goes over them — that is what makes this ' +
          'hard rather than what makes it easy. The same span carries the reload rounds and the water main, ' +
          'and there is no version of that strike that takes one and leaves the other; the law has been ' +
          'arguing about exactly that since before either of us was in government and it has not landed. ' +
          'What I can give you is the shape of the price, because the price is mine to pay. Hitting it is ' +
          'cheap. Cheaper abroad than a SAM battery — nobody files a protest over a cratered approach ramp — ' +
          'and it stays cheap for exactly as long as the crossing is still standing. The bill arrives the ' +
          'night it is actually out, all at once, and it is the largest single charge on the folder. That is ' +
          'the trap in this class: it costs nothing until it costs everything, so it is very easy to be most ' +
          'of the way into a campaign you never decided to fight. Decide to fight it or stop now, but do not ' +
          'drift into it a package at a time.',
      }),
    },
    {
      id: 'joint',
      when: b => b.israel.posture === 'coordinated' && b.israel.joint,
      sev: () => 0.56,
      make: () => ({
        line: 'The joint package is on the board. Spend it.',
        text: 'We own Israel\'s war now as well as our own, and the combined planning cell has a deep-strike ' +
          'package ready. That is real capability against the buried halls and I would rather we spend it than ' +
          'sit on it — understand that every hour it waits, Tehran is still shooting at Haifa on our account.',
      }),
    },
    {
      id: 'coordinated',
      when: b => b.israel.posture === 'coordinated',
      sev: () => 0.40,
      make: (b) => ({
        line: `IAF flies again in ~${b.israel.eta === null ? 'a while' : Txt.turns(b.israel.eta)}. Not all of it will be our list.`,
        text: 'The Israelis are inside our tasking order, which means their impatience is working for us for ' +
          'once: when Jerusalem reaches the end of it they fly our corridor' +
          (b.israel.eta === null ? '' : ` — my read is about ${Txt.turns(b.israel.eta)}`) +
          ', and the combined deep-strike slot comes back on the board when they do. What I cannot promise ' +
          'you is that they stop where we stopped. Half their nights end with a second element over the grid ' +
          'or the crossings, and when the province goes dark it is a photograph of an American tanker at the ' +
          'top of the story. The bill is standing, it is mine, and lately it is also yours.',
      }),
    },
    {
      // The coalition is the cheapest thing on her table and the easiest to
      // never get round to: it adds allied sorties, it widens the covert take,
      // and it is a permanent buy. Nobody in the room used to mention it, so a
      // campaign that simply forgot was never told.
      id: 'coalition',
      when: b => !Game.G.coalition && b.turn >= 3 && b.world >= 25,
      sev: b => 0.46 + Math.min(0.10, b.turn * 0.01),
      make: (b) => ({
        line: 'We are still flying this alone. Let me build the coalition.',
        text: `We are ${Txt.turns(b.turn)} into a war we are fighting on our own account and I have not been ` +
          'sent to build anything. A strike coalition is not a communiqué — it is allied aircraft on the ' +
          'tasking order, it is a wider intelligence take against the sites we have not found yet, and it ' +
          'spreads the political weight of every aimpoint you service after tonight. It is bought once and ' +
          `it does not expire. Standing abroad is ${Math.round(b.world)}, which is enough to get it done; ` +
          'below about twenty-five it stops being a phone call I can win.',
      }),
    },
    {
      // The barrel, and the one lever that moves it without a package. Scaled
      // off the price rather than fixed, because $95 is a headline and $170 is
      // the reason the presidency ends.
      id: 'barrel',
      when: b => b.oil >= 110 && Game.G.sprReleases < 2,
      sev: b => 0.34 + Math.min(0.34, (b.oil - 110) / 130),
      make: (b) => ({
        urgent: b.oil >= 200,
        line: `Brent at $${Math.round(b.oil)}. The Reserve takes ${Game.G.sprReleases === 0 ? '$20' : '$12'} off it tonight.`,
        text: `Brent is at $${Math.round(b.oil)} a barrel` +
          (b.hormuz === 'CLOSED' ? ' with the Strait shut, ' : ', ') +
          'and I want to be precise about who that hurts, because it is not Tehran. It is the pump price, it ' +
          'is every allied economy I am asking to hold the line, and at two hundred and forty this war ends ' +
          'in a recession rather than in Iran. A coordinated draw on the Strategic Petroleum Reserve takes ' +
          `about $${Game.G.sprReleases === 0 ? '20' : '12'} off it and costs you nothing abroad — ` +
          `${Txt.plural(2 - Game.G.sprReleases, 'release')} left, and the tanks do not refill inside this ` +
          'campaign. It is a painkiller, not a cure. The cure is the Strait.',
      }),
    },
    {
      // Never having spoken to the country is a specific, fixable omission that
      // the Hill reads out loud at the vote, and until v1.82 the only place it
      // appeared was inside NSA's war-powers paragraph, three turns before the
      // vote, which is far too late to have addressed the nation twice.
      id: 'address',
      when: b => b.addresses === 0 && b.turn >= 5 && Game.G.addressCooldown <= 0,
      sev: b => 0.40 + Math.min(0.20, (b.turn - 5) * 0.03),
      make: (b) => ({
        line: 'You have not spoken to the country once. That gets read out at the vote.',
        text: `${Txt.turns(b.turn)} of war and the President of the United States has not addressed the ` +
          'nation about it. I am not raising this for the approval bump, although there is one. The Hill ' +
          'reads the count out when the authorization comes up — how many times you went on television and ' +
          'explained why American aircrew are over Iran — and "not once" is the single easiest line for the ' +
          'other side of that vote to use. It costs you an evening.',
      }),
    },
    {
      id: 'too-early',
      when: b => b.deg >= 75 && advWarStr(b) <= 2,
      sev: () => 0.24,
      make: () => ({
        line: 'Too early to talk. Keep breaking things.',
        text: 'They\'re not ready to fold yet — an overture now would be read as weakness and spun against us. ' +
          'Keep destroying what they fight with; I\'ll be ready when they break.',
      }),
    },
    {
      // The floor, and it now carries the two numbers that decide whether State
      // has anything to work with at all: where standing abroad is, and whether
      // it has been moving.
      id: 'hold',
      when: null,
      sev: () => 0.12,
      make: (b) => ({
        line: `Standing abroad ${Math.round(b.world)}. No talks while they can still shoot.`,
        text: `No one in Tehran will talk while they can still shoot, so my job right now is holding the ` +
          `coalition together while you win it. Standing abroad is ${Math.round(b.world)}` +
          (b.basing.nato && b.basing.gulf
            ? ', both basing tiers are intact, and that is the whole inventory of things I am protecting. '
            : !b.basing.gulf
              ? ', the Gulf ramps are already gone, and what I am protecting now is the NATO tier. '
              : ', Incirlik is already closed to us, and the Gulf tier is what is left. ') +
          'Pair the strikes with UN pressure and sanctions, and give me something to point at that is not a ' +
          'crater.',
      }),
    },
  ];

  // ---- NSA Reyes: the one who reads the clocks against each other ----
  const NSA = [
    {
      // Americans on the ground outrank everything else on this table
      id: 'downed', hold: true,
      when: () => !!Game.G.downed,
      sev: () => 0.96,
      make: () => {
        const d = Game.G.downed;
        return {
          urgent: true,
          line: `${d.callsign} is alive on Iranian soil and the cordon is closing.`,
          text: `We have ${d.crew === 2 ? 'two aircrew' : 'an aviator'} alive on Iranian soil — ` +
            `${d.callsign}, ${d.loc} — and a search cordon closing on them. This is the decision that will ` +
            'define the news cycle either way, and it does not keep. Recovered, it is the best night of this ' +
            'war. Captured, it is a flight suit on their television for as long as they want it there, and ' +
            'every deal you ever sign runs through that cell.',
        };
      },
    },
    {
      // The clock the entire war is against.
      id: 'breakout', hold: true,
      when: b => !b.brk.halted && b.brk.hi <= 6 && b.deg < 100,
      sev: b => 0.86 + (6 - b.brk.hi) * 0.01,
      make: (b) => ({
        urgent: true,
        line: `${b.brk.lo}–${b.brk.hi} turns from a device. Everything else is a distraction.`,
        text: `This is the number that matters tonight: the Agency puts Iran ${b.brk.lo}–${b.brk.hi} turns ` +
          `from a device, ${b.brk.conf} confidence. ${b.brk.conf === 'low'
            ? 'That band is wide enough that the low end may already have passed. I would spend a slot ' +
              'narrowing it before I spent another one on anything else.'
            : 'That is inside the time it takes to do anything else on this list.'} ` +
          'Everything that is not enrichment is a distraction from here.',
      }),
    },
    {
      id: 'vote',
      when: b => b.voteIn !== null && b.voteIn <= 3,
      sev: b => 0.78 + (3 - b.voteIn) * 0.02,
      make: (b) => ({
        urgent: true,
        line: `The Hill votes in ${b.voteIn <= 0 ? 'hours' : Txt.turns(b.voteIn)}. Change the arithmetic now.`,
        text: `The authorization lapses in ${b.voteIn <= 0 ? 'a matter of hours' : Txt.turns(b.voteIn)} ` +
          'and the Hill will vote on whether this campaign continues. They will be voting on your approval ' +
          `number, which is ${Math.round(b.approval)}; on the casualty list, which is ${b.dead}; on whether ` +
          `we still have allies, and standing abroad is ${Math.round(b.world)}; and on whether you ever went ` +
          `on television to explain it — you have addressed the nation ${Txt.plural(b.addresses, 'time')}. ` +
          'A no vote ends the war where it stands. There is still time to change the arithmetic.',
      }),
    },
    {
      // THE TWO CLOCKS, READ AGAINST EACH OTHER. Nothing in this game said this
      // and it is the question a president actually asks in week two: not "how
      // bad is it" but "is this working". Both clocks look survivable on their
      // own — that is exactly why a campaign can be four turns from the program
      // and three turns from the country and have nothing on screen saying so.
      // Only fires when both are running; "we cannot tell" is the honest answer
      // otherwise and a confident wrong one here would be the worst line in the
      // game (see Assess.board).
      id: 'converge',
      when: b => b.converging !== null && b.runway !== null && b.turn >= 5,
      sev: b => b.converging ? 0.30 : 0.74,
      make: (b) => {
        const home = Math.round(b.runway);
        const prog = b.degEta === null ? null : Math.round(b.degEta);
        if (!b.converging) {
          return {
            urgent: home <= 5,
            line: `The program needs ${prog === null ? 'longer than we have' : Txt.turns(prog)}. You have ${Txt.turns(home)}.`,
            text: 'I want to put the two clocks side by side, because separately they both look survivable ' +
              'and together they do not. ' +
              (prog === null
                ? 'At the rate we have actually been degrading the enrichment program over the last few ' +
                  'nights, it does not finish inside this campaign at all — some nights it has not moved. '
                : `At the rate we have been degrading it, the program is ${Txt.turns(prog)} from finished. `) +
              `At the rate the country is leaving you, you have about ${Txt.turns(home)} of war left to ` +
              'fight. Those numbers are the wrong way round and no single gauge on your screen shows it. ' +
              'There are three answers and you will not like any of them: put more of the plan on the halls ' +
              'and less on everything else, spend political capital directly to buy turns, or take the ' +
              'armistice while the board still makes it look like a decision.',
          };
        }
        return {
          line: prog === null
            ? `The program is finished. About ${Txt.turns(home)} of patience left at home.`
            : `It converges — ${Txt.turns(prog)} on the program, ${Txt.turns(home)} of patience.`,
          text: 'The two clocks are the right way round tonight, which is not something I have been able to ' +
            'say every night of this war. ' +
            (prog === null
              ? 'The enrichment program is done. What is left is the war machine and an end state, and the ' +
                'only thing that can take this away from you now is time.'
              : `At the rate we are working it the program finishes in about ${Txt.turns(prog)}, and the ` +
                `country will carry you roughly ${Txt.turns(home)}. `) +
            'That margin is not wide and it is not owed to you. Every night we spend off the halls spends it, ' +
            'and so does every barrage that lands on a ramp because a brigade we could have serviced is still ' +
            'standing.',
        };
      },
    },
    {
      id: 'chaos',
      when: b => Game.G.regimeChaosTurns > 0,
      sev: () => 0.72,
      make: () => ({
        urgent: true,
        line: 'Command chain is decapitated. This window closes fast.',
        text: 'Tehran\'s command chain is decapitated and their retaliation is uncoordinated. This window ' +
          'closes fast — whoever consolidates power will need to look strong. Use it or lose it.',
      }),
    },
    {
      // The third way to lose the war, and the only one with a counter on it
      // that nobody in this room ever read out. `hormuzClosedTurns` ACCUMULATES
      // across closures — reopening the strait stops the clock, it does not
      // rewind it — so a campaign that has shut it twice for four nights each
      // is four nights from an economic collapse ending with nothing on screen
      // adding the two up. `hold` because that is a countdown, not a state.
      id: 'strait', hold: true,
      when: b => b.hormuzTurns > 0 && (b.hormuz === 'CLOSED' || b.hormuzTurns >= Game.HORMUZ_LIMIT - 5),
      sev: b => (b.hormuz === 'CLOSED' ? 0.56 : 0.34) +
        Math.min(0.24, (b.hormuzTurns / Game.HORMUZ_LIMIT) * 0.30),
      make: (b) => {
        const left = Math.max(0, Game.HORMUZ_LIMIT - b.hormuzTurns);
        const shut = b.hormuz === 'CLOSED';
        return {
          urgent: shut || left <= 3,
          line: shut
            ? `Strait shut ${b.hormuzTurns} of ${Game.HORMUZ_LIMIT} nights. Barrel at $${Math.round(b.oil)}.`
            : `${Txt.turns(left)} of closure left before the economy is the loss condition.`,
          text: (shut
            ? `The Strait is the whole ballgame right now. It has been shut ${Txt.turns(b.hormuzTurns)} of the ` +
              `${Game.HORMUZ_LIMIT} this economy survives, Brent is at $${Math.round(b.oil)}, and every turn ` +
              'it stays closed bleeds both. '
            : `It is open tonight, and I want to be clear that the counter did not go back to zero when it ` +
              `reopened. This war has spent ${Txt.turns(b.hormuzTurns)} with the Strait shut, the ledger is ` +
              `cumulative, and at ${Game.HORMUZ_LIMIT} the economy is the thing that ends this presidency ` +
              'rather than anything Tehran does with a missile. ') +
            'The answers are the ones you already have: their naval bases and the anti-ship batteries, a deck ' +
            `standing on the strait, or an end state. The one thing that does not work is waiting — ` +
            `${left <= 3 ? 'and there is no more waiting left in it.' : `there are ${Txt.turns(left)} in the account.`}`,
        };
      },
    },
    {
      id: 'israel-warn',
      when: b => b.israel.posture === 'sidelined' && b.israel.eta !== null &&
        b.israel.eta <= 2 && b.deg < ISRAEL.standDown,
      sev: () => 0.64,
      make: (b) => {
        // The one advisor line that names the mechanism, because the target list
        // is the lever and a player who has not noticed the flag has no way to
        // guess it.
        const want = b.israel.list.map(t => t.short);
        return {
          line: `Israeli readiness is unambiguous — they go in about ${Txt.turns(b.israel.eta)}.`,
          text: 'Israeli readiness indicators are unambiguous — tanker movements, reserve call-ups, the whole ' +
            `signature. They are going, with or without you, in roughly ${Txt.turns(b.israel.eta)}. ` +
            (want.length
              ? `What is driving it is a target list, and it is short: ${want.join(', ')}. Put ordnance on any ` +
                'of it tonight and their clock goes backwards — that is cheaper than the phone call and far ' +
                'cheaper than the strike. '
              : 'Their list is rubble already, which is the one thing that actually calms them down. ') +
            'If it happens on their timetable you get the blame and none of the targeting.',
        };
      },
    },
    {
      id: 'approval',
      when: b => b.approval < 35,
      sev: b => 0.50 + (35 - b.approval) / 100,
      make: (b) => ({
        line: `Approval ${Math.round(b.approval)}. Political capital nearly spent; drift is fatal.`,
        text: `Your political capital is nearly spent — ${Math.round(b.approval)}, and ` +
          (b.bleed > 0.15
            ? `falling about ${(Math.round(b.bleed * 10) / 10)} a turn. `
            : 'steady for now, which will not last. ') +
          'Congress smells blood. We need visible wins or visible peace, and the two things this room can ' +
          'actually produce on demand are a destroyed site with a name on it and an address to the nation. ' +
          'Drift is fatal.',
      }),
    },
    {
      id: 'casualties',
      when: b => b.dead >= b.deadCap * 0.6,
      sev: b => 0.44 + (b.dead / b.deadCap) * 0.14,
      make: (b) => ({
        line: `${b.dead} dead of the ${b.deadCap} this country will absorb.`,
        text: `${b.dead} dead and the country is counting. The home front will not fund this war past ` +
          `${b.deadCap}` +
          (b.deadRate > 0.15
            ? `, and at the last few nights' rate we reach that in about ${Txt.turns(Math.round((b.deadCap - b.dead) / b.deadRate))}. `
            : ', and the rate has flattened, which buys you time nobody will thank you for. ') +
          'Win it before the arithmetic wins it for them.',
      }),
    },
    {
      id: 'hostages',
      when: () => Game.G.hostageCrisis,
      sev: () => 0.42,
      make: () => ({
        line: 'Every deal now runs through that cell block.',
        text: 'Our people are in an IRGC prison and on their televisions. Every deal now runs through that ' +
          'cell block — no agreement survives politically unless it brings them home.',
      }),
    },
    {
      id: 'unilateral',
      when: b => b.israel.posture === 'unilateral',
      sev: () => 0.40,
      make: () => ({
        line: 'We inherited the escalation, and they will go again.',
        text: 'Israel struck on its own and Fordow is still under the mountain. We inherited the escalation ' +
          'without the result — and nothing about that arrangement is finished: they are still flying, still ' +
          'on their own timetable, and every salvo Tehran sends west shortens it. Expect the Gulf states to ' +
          'keep putting distance between themselves and our aircraft.',
      }),
    },
    {
      id: 'split',
      when: b => b.israel.posture === 'coordinated' && b.mStr > 0,
      sev: () => 0.30,
      make: () => ({
        line: 'Two enemies, one missile force — their fires are split.',
        text: 'With the Israelis in openly, Tehran is fighting two enemies with one missile force. That splits ' +
          'their fires — some of those launchers are now dying to the IAF instead of to us. It also means this ' +
          'war ends when both of our wars end, not just ours.',
      }),
    },
    {
      // The floor. It was "tempo is mercy", which is a fortune cookie; it now
      // prices the exchange rate the old line was gesturing at.
      id: 'exchange',
      when: null,
      sev: () => 0.12,
      make: (b) => ({
        line: `Their machine is at ${Math.round(Game.G.iranCapacity())}%. Watch the exchange rate.`,
        text: `Their war machine reads ${Math.round(Game.G.iranCapacity())}% of what it was, we have lost ` +
          `${Txt.plural(b.dead, 'American life')} getting it there, and ${Txt.plural(b.gateDone, 'gate')} of ` +
          'the three are closed. That is the only arithmetic that matters: their launchers and hulls have to ' +
          'die faster than our people do. The clock and the casualty count are the real enemies here, not ' +
          'anything Tehran is choosing to do.',
      }),
    },
  ];

  // ---- Gen. Halvorsen, CJCS: sequencing, and what the plan can physically do ----
  const CJCS = [
    {
      id: 'ramps-lost',
      when: b => !b.basing.gulf,
      sev: () => 0.82,
      make: (b) => ({
        urgent: true,
        line: 'Gulf ramps lost. This is diplomatic, not targeting.',
        text: 'We have lost the Gulf ramps and with them the northern tanker tracks. Al Udeid and Al ' +
          'Dhafra are parking lots for aircraft that are not allowed to fly, the nightly tanker plan is down ' +
          `to ${Txt.plural(b.tankers, 'track')}, and anything past the interior — Tabriz, the Caspian — is ` +
          'simply not reachable. This is not a targeting problem, Mr. President, it is a diplomatic one. ' +
          'Get the number up and I get the runways back.',
      }),
    },
    {
      // the single most important thing the staff can tell a player who is
      // wondering why two thirds of the air force will not fly
      id: 'sequence',
      when: b => b.phase === 'contested',
      sev: b => 0.72 + (1 - b.sup) * 0.08,
      make: (b) => ({
        urgent: true,
        line: `Kill the SAM belt first — ${Txt.plural(b.adLive, 'complex')} still active.`,
        text: 'Sequence, Mr. President. Two thirds of the air component is sitting on ramps, and I will ' +
          `not send it off them — ${Txt.plural(b.adLive, 'SAM complex')} still active, and an F-16 ` +
          'over that belt is a dead pilot on Iranian television. What we have tonight is F-35s and Tomahawks, ' +
          'and what they are for is not damage, it is taking the sky. Kill the air defense network first. ' +
          'Everything else in this war gets three times easier the moment it is down.',
      }),
    },
    {
      // The council before it votes. Above the tier warnings because it is the
      // one that is still actionable.
      id: 'caveats',
      when: b => b.basing.gulf && b.gulf.capped,
      sev: () => 0.74,
      make: (b) => ({
        urgent: true,
        line: `Gulf tier now folds at ${b.foldAt}, not ${BASING_TIERS.gulf.at}.`,
        text: 'The council has filed everything it is going to file. Riyadh and Doha have walked the ' +
          `Gulf basing threshold from ${BASING_TIERS.gulf.at} up to ${b.foldAt} — standing abroad is at ` +
          `${Math.round(b.world)}, and the next thing they pass is not a caveat, it is the withdrawal. ` +
          (b.gulf.corridor
            ? 'Amman and Kuwait City are holding the northern corridor open on their own account, so we keep ' +
              'the deep targets when it goes. We keep nothing else.'
            : 'If it goes we lose the northern tracks and everything past the interior with them. The hawks ' +
              'would hold a corridor for us — they have not been asked.'),
      }),
    },
    {
      // the un-ordered case is the one the player can still fix tonight
      id: 'b2',
      when: b => !b.bombers && b.deg < 100,
      sev: b => b.bombersOrdered ? 0.44 : 0.68,
      make: (b) => ({
        urgent: !b.bombersOrdered,
        line: b.bombersOrdered
          ? `509th airborne — ${Txt.turns(b.bomberEta)} to Diego Garcia.`
          : 'No B-2 within eight thousand miles. Fordow is untouchable.',
        text: b.bombersOrdered
          ? 'The 509th is airborne out of Whiteman with the tanker train strung out behind it — ' +
            `${Txt.turns(b.bomberEta)} to Diego Garcia. Until those aircraft are on that ramp, Fordow is a ` +
            'target we can photograph and not one we can service.'
          : 'Be clear on what you do not have: there is not a B-2 within eight thousand miles of this war. ' +
            'They are parked at Whiteman. One turn on the tankers puts them at Diego Garcia and puts the ' +
            'GBU-57 in play, and nothing else in the inventory touches Fordow — not a Tomahawk, not a ' +
            'fighter, nothing. The bill is one night of the naval transit: the turn they move, nothing else ' +
            'does.',
      }),
    },
    {
      // The munitions ledger, on the one level that keeps one. Reported in
      // NIGHTS OF FIGHTING and never in rounds, for the same reason the Aegis
      // line is tiered: a percentage of a number the player has never been
      // shown is not information.
      id: 'pgm',
      when: b => b.pgmLedger && b.pgmNights < 6,
      sev: b => 0.44 + (6 - b.pgmNights) * 0.06,
      make: (b) => {
        const n = Math.floor(b.pgmNights);
        return {
          urgent: b.pgmNights < 2,
          line: n <= 0
            ? 'The depots are empty. We are flying what is on the racks.'
            : `${Txt.plural(n, 'night')} of precision weapons left in theater.`,
          text: (n <= 0
            ? 'We are out of precision munitions in theater, Mr. President. What is hanging on the aircraft ' +
              'tonight is what we have; after that the staff starts refusing packages, and it will refuse the ' +
              'heavy ones first because they are the ones that carry the most. '
            : `The depots hold about ${Txt.plural(n, 'night')} of fighting at the rate you have been ` +
              'flying, and that is the whole theater stock — nothing regenerates overnight but the sorties. ') +
            'The only thing that refills it is a munitions ship on the force flow, those arrive on the ' +
            'schedule they arrive on, and they come into the same ramps world opinion is holding open. ' +
            'Losing standing abroad does not just cost us runways; it costs us the bombs.',
        };
      },
    },
    {
      // Halls we can see and cannot touch. The one number that says "this is a
      // force-flow or a diplomatic problem, not a targeting one" without the
      // player opening four dialogs to work it out.
      id: 'blocked',
      when: b => b.nukeBlocked > 0 && b.deg < 100,
      sev: b => 0.50 + Math.min(0.12, b.nukeBlocked * 0.06),
      make: (b) => ({
        line: `${Txt.plural(b.nukeBlocked, 'enrichment site')} on the plot ${Txt.are(b.nukeBlocked)} out of reach tonight.`,
        text: `There ${Txt.are(b.nukeBlocked)} ${Txt.plural(b.nukeBlocked, 'site')} in the nuclear set that we ` +
          'have located, plotted and cannot put a package on tonight — either the tanker plan does not stretch ' +
          'that far, the resolution took it off the list, or the only aircraft that can service it is not in ' +
          'theater. I raise it because none of those is a targeting problem and none of them gets solved by ' +
          'tonight\'s tasking order. Work out which one it is before you spend another week planning around a ' +
          'site you are never going to be allowed to hit.',
      }),
    },
    {
      id: 'heavies',
      when: b => b.phase === 'degraded' && !b.heavies,
      sev: () => 0.52,
      make: (b) => ({
        line: b.heaviesOrdered
          ? `Belt is broken and the heavies are moving — ${Txt.turns(b.heavyEta)} out.`
          : 'Belt is broken. Finish the network and I can call the heavies.',
        text: 'The belt is broken and the fourth-generation squadrons are flying — that is the volume ' +
          'you have been waiting for. The next step is the heavies. Take the rest of the air defense network ' +
          'and Tabriz down and I can put B-1s and B-52s over Iran, and a heavy cell takes a site apart in one ' +
          'night that a fighter package would work on for three. ' +
          (b.heaviesOrdered ? `They are already moving — ${Txt.turns(b.heavyEta)} out.`
            : 'They can be called forward now; they just cannot fly until the sky is ours.'),
      }),
    },
    {
      id: 'incirlik',
      when: b => !b.basing.nato,
      sev: () => 0.48,
      make: (b) => ({
        line: `Incirlik closed — down to ${Txt.plural(b.tankers, 'tanker track')} a night.`,
        text: 'Incirlik is closed to us and Riyadh has asked that Prince Sultan not be used offensively. ' +
          `That is two squadrons and two tanker tracks off tonight's plan — we are down to ` +
          `${Txt.plural(b.tankers, 'track')} a night, and the tanker plan is what caps the deep targets. It ` +
          'gets worse below fifteen.',
      }),
    },
    {
      id: 'rented',
      when: b => b.phase === 'superiority' && b.adLive >= 1,
      sev: b => 0.38 + (b.adBack ? 0.10 : 0),
      make: (b) => ({
        line: `Superiority is rented — ${Txt.plural(b.adLive, 'complex')} still out there.`,
        text: 'We hold air superiority tonight and we do not hold it permanently. Their crews are out ' +
          'there right now rolling spare launchers out of the revetments' +
          (b.adBack
            ? `, and ${Txt.plural(b.adBack, 'battery')} we already destroyed ${Txt.are(b.adBack)} back on the ` +
              'air, which is what that looks like when it has already happened. '
            : ', ') +
          'and the night that number crosses back the heavies come off the tasking order and the plan gets ' +
          'small again. Keep going back to the SAM sites. It is the least satisfying tasking in this war and ' +
          'it is the one holding the rest up.',
      }),
    },
    {
      // Crew rest is a real constraint the player pays for a night late and has
      // no other way to see coming: the plan is written at the turn boundary,
      // so last night's surge shows up here and nowhere else.
      id: 'fatigue',
      when: b => b.fatigue > 0,
      sev: b => 0.34 + Math.min(0.14, b.fatigue * 0.07),
      make: (b) => ({
        line: `Tonight's plan is ${Txt.plural(b.slots, 'package')} — last night's surge cost us the rest.`,
        text: `You flew past the tasking order last night and the bill for it is tonight's plan: ` +
          `${Txt.plural(b.slots, 'package')}, written at the turn boundary, and it is short by roughly ` +
          `${Txt.plural(Math.max(1, Math.round(b.fatigue)), 'package')} because of it. Crews who were briefed on the ramp ` +
          'at two in the morning are the crews who were going to fly tonight. You can surge again — I will ' +
          'write it and they will fly it — and the same thing happens tomorrow, one package deeper. It pays ' +
          'itself down on its own if you let it.',
      }),
    },
    {
      id: 'repairing',
      when: () => repairing().length >= 2,
      sev: () => 0.40,
      make: () => {
        const rep = repairing();
        return {
          line: `${Txt.plural(rep.length, 'hit site')} are repairing tonight. Concentrate the packages.`,
          text: `We are renting damage instead of buying it, Mr. President. ${Txt.plural(rep.length, 'site')} ` +
            'we have already hit are working through the night — ' +
            `${rep.slice(0, 3).map(t => `${t.short} at ${Game.condition(t)}`).join(', ')} — and every one of ` +
            'them climbs back toward full while we service something else. Concentrate the packages: two on ' +
            'target in the same turn finishes a site, one a turn just keeps it wounded.',
        };
      },
    },
    {
      id: 'blind',
      when: b => b.blind >= 3,
      sev: b => 0.30 + Math.min(0.12, b.blind * 0.02),
      make: (b) => ({
        line: `Stale picture — ${b.blind} assessments too soft to plan against. Buy a collection deck.`,
        text: `We are flying on a stale picture. ${b.blind} sites on the list have assessments wide ` +
          'enough to be useless — anywhere from "nearly finished" to "back at full" — and every package ' +
          'planned against a number that soft is a package we may be wasting on rubble or throwing at a ' +
          'target that needs three more. Buy a collection deck. Knowing costs a night; not knowing costs ' +
          'the ordnance.',
      }),
    },
    {
      id: 'fordow',
      when: b => b.deg < 100,
      sev: () => 0.20,
      make: () => ({
        line: 'Skies are permissive. Fordow needs a B-2; Natanz does not.',
        text: 'Skies are relatively permissive now. Fordow requires a B-2 with penetrators — nothing else ' +
          'touches it. Natanz we can service with either bombers or a heavy Tomahawk package.',
      }),
    },
    {
      id: 'remaining',
      when: null,
      sev: () => 0.14,
      make: (b) => {
        const open = b.gate.filter(g => !g.done);
        return {
          line: open.length
            ? `Nuclear set serviced. What is left: ${open.map(g => g.label).join(', ')}.`
            : 'Nuclear set serviced and the war machine is broken. There is nothing left to task.',
          text: open.length
            ? `Nuclear target set serviced. For decisive victory the remaining list is ` +
              `${open.map(g => `the ${g.label} at ${g.pct}%`).join(' and ')} — kill ` +
              `${open.length === 1 ? 'that' : 'those'} and Iran is out of the war. Everything else on the ` +
              'folder tonight is pressure, and pressure is not the victory condition.'
            : 'Nuclear target set serviced and all three components of their war machine are at the bar. ' +
              'Militarily this is finished, Mr. President. What happens next is decided in a room I am not ' +
              'in.',
        };
      },
    },
  ];

  function advise() {
    const b = Assess.board();
    commitHeard(b.turn);
    return [
      speak('SecDef Whitfield', 'hawk', SECDEF, b),
      speak('SecState Okafor', 'dove', SECSTATE, b),
      speak('NSA Reyes', '', NSA, b),
      speak('Gen. Halvorsen, CJCS', 'mil', CJCS, b),
    ];
  }

  // ---- Headlines for the ticker ----
  // The crawl is a wire feed, not the president's inbox. Most of what happens
  // in a night is public the moment it happens — a missile lands on Al Udeid
  // and the world knows — but the events the player's own staff produced are
  // not: a battle damage assessment, an intelligence product, the callsign of
  // an aviator on the ground. Those carry `internal`, and the ticker has its
  // own vaguer line for the ones the press would actually have (see the downed
  // aircrew headline below). Marking is opt-OUT: a new event reads as public
  // unless it says otherwise, which is the way round that keeps the feed alive.
  function headlines(G, events) {
    const h = [];
    for (const ev of events) if (!ev.internal) h.push(ev.title.toUpperCase());
    if (G.oil > 150) h.push(`OIL SHOCK: BRENT AT $${Math.round(G.oil)} — RECESSION FEARS MOUNT`);
    else if (G.oil > 110) h.push(`BRENT CRUDE TOPS $${Math.round(G.oil)} AS CRISIS PREMIUM GROWS`);
    if (G.approval < 35) h.push('POLL: PRESIDENT\'S CONDUCT OF THE WAR UNDERWATER, IMPEACHMENT TALK GROWS');
    else if (G.approval > 60) h.push('RALLY EFFECT: PUBLIC BACKS PRESIDENT\'S CONDUCT OF THE WAR');
    if (missileStrength() + navalStrength() <= 1) h.push('ANALYSTS: IRAN\'S MILITARY SHATTERED — HOW MUCH LONGER CAN TEHRAN FIGHT?');
    if (G.casualties.us >= 170) h.push('CASUALTY COUNT MOUNTS — CONGRESS DEBATES LIMITS ON THE WAR');
    if (G.hormuz === 'CLOSED') h.push('GAS LINES FORM AS HORMUZ CLOSURE CHOKES GLOBAL SUPPLY');
    // The southern front, and none of it is marked `internal` — a second front
    // is the most public thing that can happen to a war. The strait line names
    // the CAPE rather than a price, because that is the fact this closure
    // actually is: the cargo arrives, three weeks late, and the difference
    // between that and Hormuz is the whole reason this one cannot lose the war.
    if (G.mandab === 'CLOSED') {
      h.push('SHIPPING LINES ABANDON SUEZ FOR THE CAPE AS BAB AL-MANDAB STAYS SHUT');
    } else if (G.mandab === 'CONTESTED') {
      h.push('WAR-RISK PREMIUMS SPIKE ON RED SEA TRANSITS AS ESCORTED CONVOYS CRAWL THROUGH');
    }
    if (G.houthi && G.houthi.saudiIn) {
      h.push('RSAF BACK OVER YEMEN — RIYADH FIGHTING TWO WARS IT SPENT A DECADE TRYING TO LEAVE');
    } else if (G.houthi && G.houthi.entered) {
      h.push('ANSAR ALLAH WIDENS THE WAR — ANALYSTS ASK WHAT ELSE TEHRAN CAN STILL SWITCH ON');
    }
    if (G.regimeChaosTurns > 0) h.push('POWER VACUUM IN TEHRAN — INTELLIGENCE AGENCIES ASK: WHO IS IN CHARGE?');
    if (G.downed) h.push(`SEARCH UNDER WAY FOR US AIRCREW DOWN INSIDE IRAN — PENTAGON WILL NOT DISCUSS RECOVERY OPERATIONS`);
    if (G.hostageCrisis) h.push('VIGILS HELD FOR AMERICANS IN IRANIAN CUSTODY');
    if (G.israelPosture === 'unilateral') h.push('ARAB CAPITALS DEMAND ANSWERS: DID WASHINGTON GREEN-LIGHT THE ISRAELI STRIKE?');
    else if (G.israelPosture === 'coordinated') h.push('IAF SQUADRONS FLYING WITH CENTCOM AS ISRAEL JOINS THE CAMPAIGN OPENLY');
    if (!G.basing.gulf) h.push('GULF STATES CLOSE AIRSPACE TO US STRIKE OPERATIONS — "NOT FROM OUR SOIL"');
    else if (!G.basing.nato) h.push('ANKARA CLOSES INCIRLIK AS EUROPEAN ALLIES SUSPEND PARTICIPATION');
    // The council's argument is public — it is conducted in communiqués. What
    // the crawl reports is the split rather than the gauge: a press wire knows
    // which capitals walked out of a meeting, not how close either camp is to a
    // number the president is reading off a panel.
    if (G.gulf.caveats > 0 && G.basing.gulf) {
      h.push(`GCC COMMUNIQUÉ NARROWS US OPERATING RIGHTS FOR THE ${Txt.ordinal(G.gulf.caveats).toUpperCase()} TIME — KUWAIT AND UAE DISSENT`);
    }
    if (G.gulf.corridor) h.push('AMMAN AND KUWAIT CITY CONFIRM NORTHERN CORRIDOR STAYS OPEN TO US STRIKE PACKAGES');
    if (G.gulf.strain >= GULF.fly) h.push('RIYADH AND DOHA PRESS WASHINGTON FOR AN END STATE — "THIS CANNOT RUN ANOTHER MONTH"');
    else if (G.gulf.resolve >= GULF.fly * 0.8) h.push('GULF HAWKS URGE WASHINGTON TO FINISH THE MISSILE FORCE WHILE THE CARRIER IS THERE');
    if (!G.warPowers.done && G.turn >= Game.WAR_POWERS_TURN - 2) {
      h.push('WAR POWERS VOTE LOOMS: CONGRESS TO DECIDE WHETHER THE CAMPAIGN CONTINUES');
    } else if (G.warPowers.result === 'restricted') {
      h.push('CONGRESS BARS STRIKES ON IRANIAN ENERGY INFRASTRUCTURE IN NARROW AUTHORIZATION VOTE');
    }
    const brk = Game.breakoutEstimate();
    if (brk.halted) h.push('IAEA: IRANIAN ENRICHMENT CAPABILITY ASSESSED DESTROYED');
    else if (brk.hi <= 6) h.push('INTELLIGENCE LEAK: "WEEKS, NOT MONTHS" — ANALYSTS WARN BREAKOUT IS CLOSE');
    if (liveTels().some(t => !t.located)) {
      h.push('PENTAGON CONCEDES IRANIAN MOBILE LAUNCHERS REMAIN "UNLOCATED AND ACTIVE"');
    }
    const fillers = [...FILLER_HEADLINES].sort(() => Math.random() - 0.5).slice(0, 3);
    return [...h, ...fillers];
  }

  return { respond, advise, headlines, missileStrength, navalStrength,
    adaptPenalty, adaptLevel, ewNetworkHit, liveTels, posture };
})();
