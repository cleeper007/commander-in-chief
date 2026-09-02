// ============================================================
// csar.js — combat search and rescue: getting downed aircrew back
// ============================================================
// A shootdown is the only thing in this war that puts living Americans on
// Iranian soil by accident. When aircrew get out of the aircraft they become
// isolated personnel: a beacon, a voice on guard frequency, and a clock.
//
// Nothing here exists until that happens. The panel, the map marker and the
// mission are all created by the shootdown and destroyed by its resolution —
// there is no standing "rescue" button, because there is nothing to rescue.
//
// The mission itself follows the specops model exactly: the branch is decided
// BEFORE the first line of the script plays, and the timeline is a
// dramatization of a roll that has already happened.

const CSAR = (() => {
  const $ = (id) => document.getElementById(id);
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const rand = Random.int;
  const easyText = (value) => Game.difficulty().plainLanguage ? Txt.plain(value) : value;

  let running = false;   // recovery in progress: the war is locked out

  // ---- who was flying ----
  // The airframe used to be rolled here off a weighted table, which meant the
  // jet that went down had no connection to the package that flew. It now comes
  // off the roster (see aircrew.js): the aircraft is whatever the aviator the
  // player watched get fragged is qualified in, and `ANON` is the fallback for
  // a package with nobody named on it — a Tomahawk salvo, or a squadron with
  // nothing left on status.
  const ANON = { air: 'strike aircraft', short: 'strike aircraft', flight: 'a strike aircraft', crew: 1, aboard: [] };
  const DIRS = ['east', 'south-east', 'north-east', 'south', 'north'];

  // The flight callsign the jet checked in under — the roster carries the
  // squadron's, this puts the two-digit tail on it. Distinct from the personal
  // callsigns the aircrew themselves are known by.
  const flightCallsign = (lost) => `${lost.flight} ${rand(1, 7)}${rand(1, 9)}`;

  // ---- the crew, named ----
  // `who` is the sentence the prose uses for the people. It is built from the
  // roster wherever there is one, so the report names aviators the player has
  // been reading in the sidebar for nine nights, and falls back to the old
  // anonymous wording where there is not.
  const crewNoun = (d) => d.crew === 2 ? 'Both crew' : 'The pilot';
  const crewNames = (d) => {
    const G = Game.G;
    const list = (d.crewIds || []).map((id) => Aircrew.byId(G, id)).filter(Boolean);
    return list.length ? Aircrew.names(list) : null;
  };
  // "Maj. Hollis “TWITCH” and Capt. Ueda “SPUD”" where the roster has them,
  // "both crew" where it does not.
  const crewPhrase = (d, capitalized) => {
    const named = crewNames(d);
    if (named) return named;
    return capitalized ? crewNoun(d) : (d.crew === 2 ? 'both crew' : 'the pilot');
  };

  // ============================================================
  // THE SHOOTDOWN — called by game.js when a strike package loses an aircraft
  // ============================================================
  // Returns the sentence the BDA report appends and the casualties it costs.
  // Most crews get out; the ones who do are alive until proven otherwise, so
  // no one is counted dead here. Only one recovery situation runs at a time —
  // a second shootdown while a crew is still on the ground is a crew nobody
  // could have reached.
  //
  // `mission` is the frag this loss came out of, and it carries the roster ids
  // of the crew that flew it. Optional: without one the aircraft and the people
  // in it are anonymous, exactly as they were before v1.83.
  function aircraftDown(target, mission) {
    const G = Game.G;
    const lost = Aircrew.crewLost(G, mission) || ANON;
    const callsign = lost === ANON ? 'callsign unknown' : flightCallsign(lost);
    const aboard = lost.aboard;
    // the sentence naming the people, for the two branches where they die in
    // the aircraft and there is no roster entry left to point at
    const named = aboard.length ? Aircrew.names(aboard) : null;
    const crewWord = lost.crew === 2 ? 'Both crew' : 'The pilot';
    // "One strike aircraft — DUDE 61, F-15E Strike Eagle —" : the callsign and
    // the type in apposition, which is how the watch floor says it and how this
    // line has read since v5. The roster changed where the type comes from, not
    // the shape of the sentence.
    const ident = lost === ANON
      ? 'One strike aircraft'
      : `One strike aircraft — ${callsign}, ${lost.air} —`;

    if (G.downed) {
      Aircrew.setStatus(G, aboard, 'kia', G.turn);
      return {
        casualties: lost.crew,
        text: `A second aircraft — ${callsign}, ${lost.air} — was lost to surface-to-air fire in the ` +
          `same package. ${named || crewWord} died in the aircraft. With a recovery already pending ` +
          `there was nothing airborne that could have reached them.`,
      };
    }

    // Ejection: modern seats work more often than not, and a working seat is
    // what turns a casualty report into a rescue problem.
    if (Random.float() >= 0.62) {
      Aircrew.setStatus(G, aboard, 'kia', G.turn);
      return {
        casualties: lost.crew,
        text: `${ident} was lost to surface-to-air fire. No chutes were seen. ` +
          `${named || crewWord} died in the aircraft; footage of the wreckage is already on ` +
          `Iranian state TV.`,
      };
    }

    const km = rand(18, 70);
    const dir = Random.pick(DIRS);
    G.downed = {
      callsign, type: lost.air, crew: lost.crew,
      // the roster entries for the people on the ground. `crew` stays a count
      // because the recovery set piece — the survivor markers, the partial
      // branch — has been built around one or two since v5.
      crewIds: aboard.map((a) => a.id),
      targetId: target.id,
      loc: `${km} km ${dir} of ${target.name}`,
      x: target.x + rand(-26, 26), y: target.y + rand(-22, 22),
      turn: G.turn, turnsOut: 0, isr: false,
    };
    Aircrew.setStatus(G, aboard, 'mia', G.turn);
    G.stats.downedCrews++;
    syncMap(G);

    // The sortie count, which is the whole reason the roster exists — but hung
    // off the end of the sentence that already named them rather than repeating
    // the name, and phrased as the night it was for THEM rather than as a
    // statistic. A player who has been reading the squadron panel recognises
    // the number; one who has not is being told why it matters.
    const flownFor = aboard.length
      ? ` — ${Txt.ordinal(aboard[0].sorties)} sortie of the war for ${aboard[0].cs}`
      : '';
    return {
      casualties: 0,
      text: `${ident} was lost to surface-to-air fire. ` +
        // "both beacons" was written when every shootdown was a two-seater and
        // said so over a single chute for half of them. Counted, but with the
        // article rather than the numeral — a bare "1 beacon" in the middle of
        // a sentence reads like a field on a form.
        `${lost.crew === 2 ? 'Two good chutes' : 'One good chute'} came off the aircraft and ` +
        `${lost.crew === 2 ? 'both beacons are' : 'the beacon is'} transmitting from broken ground ` +
        `${G.downed.loc}. ` +
        `${named ? `${named} ${Txt.are(aboard.length)}` : (lost.crew === 2 ? 'The crew is' : 'The pilot is')} ` +
        `alive, on the ground, and being hunted${flownFor}. Personnel recovery is now a decision on your desk.`,
    };
  }

  // ---- the strategic-map marker: Americans on the ground, in amber ----
  function syncMap(G) {
    const d = G.downed;
    MapView.setSurvivor(d ? { x: d.x, y: d.y } : null,
      d ? `${d.callsign} — ${crewNames(d) || Txt.plural(d.crew, 'aviator')} evading, ${d.loc}` : '');
  }

  // ============================================================
  // ODDS
  // ============================================================
  // Everything that matters is something the player controls or has already
  // spent: darkness, the state of the SAM belt, whether they pushed ISR, and
  // above all how long the crew has been on the ground.
  function odds(G) {
    const d = G.downed;
    const parts = [];
    let p = 0.44;
    parts.push(['Baseline — alert package, hostile ground', 0.44]);

    // Dark over the target, which is Tehran's clock and not the bar's — the
    // ODD turns are the night ones now. Asked of Txt rather than restated
    // here, because the parity this used to hardcode was a copy of the clock
    // and went stale the first time the clock moved.
    if (Txt.night(G.turn)) { p += 0.12; parts.push(['Night recovery — they own the dark', 0.12]); }

    // the helicopters fly through whatever is left of the SAM belt, so this is
    // worth exactly what has been shot off it
    let adBonus = 0;
    for (const t of TARGETS) {
      if (t.type !== 'airdefense') continue;
      adBonus += 0.06 * (1 - t.hp / 100);
    }
    if (adBonus > 0.005) { p += adBonus; parts.push(['Air defenses degraded', adBonus]); }

    if (d.isr) { p += 0.10; parts.push(['ISR pushed — position locked', 0.10]); }
    if (G.coalition) { p += 0.05; parts.push(['Coalition tankers and basing', 0.05]); }
    if (G.carriers.some(cv => cv.arrived && !cv.lost && !cv.moving && cv.posture === 'forward')) {
      p += 0.05; parts.push(['Deck forward — alert helos closer', 0.05]);
    }
    if (d.turnsOut > 0) {
      const cost = -0.14 * d.turnsOut;
      p += cost;
      parts.push([`Time on the ground — ${Txt.turns(d.turnsOut)} hunted`, cost]);
    }

    return { p: clamp(p, 0.10, 0.90), parts };
  }

  // Risk that the search parties get to them before your next order does.
  function captureRisk(G) {
    const d = G.downed;
    let p = 0.18 + 0.24 * d.turnsOut;
    if (d.isr) p -= 0.08;
    if (G.regimeChaosTurns > 0) p -= 0.10;  // nobody is coordinating the search
    return clamp(p, 0.05, 0.92);
  }

  // ============================================================
  // THE CLOCK — one roll per turn the player does not go
  // ============================================================
  function turnTick(G) {
    const d = G.downed;
    if (!d || running) return null;

    // the night they went down is yours: no roll before the player has had a
    // single chance to launch
    if (d.turn === G.turn) {
      return {
        cls: 'friendly', title: `SURVIVAL RADIO CONTACT — ${d.callsign}`, internal: true,
        text: `The rescue coordination center has two-way contact with ${d.callsign} and has ` +
          `authenticated ${crewPhrase(d, false)} against the ISOPREP file. ` +
          `They are ${d.loc}, in broken ground, moving away from the wreck. Alert helicopters and ` +
          `their escort are cocked on the ramp. Every hour they spend down there makes the ` +
          `recovery harder and the search parties closer.`,
      };
    }

    d.turnsOut++;
    if (Random.float() < captureRisk(G)) return capture(G, 'timeout');

    return {
      cls: 'iran', title: `${d.callsign} STILL EVADING — SEARCH TIGHTENING`, internal: true,
      text: `${crewPhrase(d, true)} ${d.crew === 2 ? 'have' : 'has'} moved again and ${Txt.are(d.crew)} still up on the ` +
        `radio, but the picture is getting worse: IRGC ground units have cordoned the area, ` +
        `helicopters are working a search pattern over it, and Iranian state media is promising ` +
        `the country an American in custody by morning. The recovery force is standing by. ` +
        `The odds will not improve on their own.`,
      dApproval: -1,
    };
  }

  // ---- taken alive: the outcome the whole panel exists to prevent ----
  function capture(G, how) {
    const d = G.downed;
    const who = crewPhrase(d, true);
    G.stats.aircrewCaptured += d.crew;
    G.hostageCrisis = true;
    // the roster is stamped before `downed` is cleared — after it there is
    // nothing left pointing at who this was
    Aircrew.setStatus(G, (d.crewIds || []).map((id) => Aircrew.byId(G, id)), 'pow', G.turn);
    G.downed = null;
    syncMap(G);
    AudioSys.play('retaliation');
    return {
      cls: 'iran', title: `${d.callsign} CAPTURED — AMERICAN AIRCREW IN IRGC CUSTODY`,
      text: `The beacon stopped. ${who} ${Txt.were(d.crew)} taken alive ${d.loc} and ` +
        `${Txt.are(d.crew)} being moved to Tehran. Within the hour Iranian state ` +
        `television is airing the footage: a flight suit, a blindfold, a name read aloud in English. ` +
        (how === 'timeout'
          ? 'No recovery was attempted. That is the sentence every network is running under the picture, '
          : 'The recovery force could not reach them, ') +
        `and the family has learned it from a broadcast. The country has watched this before and ` +
        `remembers exactly how long it lasted.`,
      dApproval: -10, dWorld: -4,
    };
  }

  // ============================================================
  // SIDEBAR PANEL — exists only while there is someone to go get
  // ============================================================
  // ============================================================
  // WHERE A RECOVERY IS READ — DIFFICULTY.popups
  // ------------------------------------------------------------
  // Two homes for the same three lines and two orders: the sidebar section, or
  // a dialog on a level that pops it. The dialog is the better fit for what this
  // actually is — Americans on the ground in Iran is the one thing in the game
  // that is genuinely an interruption, and the panel has always had to fake that
  // by opening itself. A pop-up does not have to fake it.
  //
  // The pop-up is a BRIEF, not the authorization. LAUNCH THE RECOVERY still
  // hands off to the mission modal below, with the odds broken out row by row,
  // because that dialog is the one that spends the sortie and there is one
  // attempt ever. Two dialogs is right here and nowhere else in this file.
  const popped = () => Game.popup('recovery');

  // Opened once per arrival, not once per render. renderPanel runs several times
  // inside a turn — every strike redraws the sidebar — and a dialog that
  // reopened on each of them would be unclosable for as long as the crew is out.
  let briefShown = false;

  // RECOVERY sits beside BRIEF ME in the session buttons, on for exactly as long
  // as there is somebody on the ground to go and get.
  function syncButton(on) {
    const btn = $('btn-recovery');
    if (btn) btn.classList.toggle('hidden', !on);
  }

  function renderPanel(G) {
    const panel = $('csar-panel');
    if (!panel) return;
    const d = G.downed;
    syncButton(popped() && !!d && !running);
    if (!d && !running) {
      panel.classList.add('hidden');
      briefShown = false;   // the next crew down is news again
      if (popped()) closeBrief();
      return;
    }
    const wasHidden = panel.classList.contains('hidden');
    // On a level that pops the recovery the panel is trimmed out of the sidebar
    // entirely (see DIFFICULTY.railPanels) and openPanel refuses it, so leaving
    // `hidden` off would put a section on the rail that CSS has already hidden.
    if (!popped()) panel.classList.remove('hidden');

    if (popped()) {
      renderBrief(G);
      // Americans on the ground do not wait behind a caret, and they do not wait
      // behind a dismissed dialog either: the brief opens on the turn the crew
      // goes down, and after that it is the player's to reopen.
      if (!briefShown) { briefShown = true; $('recovery-modal').classList.remove('hidden'); }
      return;
    }

    // The sidebar is shut at the top of every turn and opens only when clicked
    // — with this one exception. Americans on the ground in Iran is not news
    // that waits behind a caret for the player to go looking for it, so the
    // section arrives already open on the turn it arrives at all.
    if (wasHidden) UI.openPanel('csar');

    const status = $('csar-status');
    const brief = $('csar-brief');
    const box = $('csar-buttons');

    if (running) {
      status.textContent = '— RECOVERY IN PROGRESS';
      status.style.color = 'var(--amber)';
      brief.innerHTML = '';
      box.innerHTML = '<div class="dim" style="font-size:11px">The recovery force is on the objective. ' +
        'Watch the feed. Nothing else happens until they are out — with our people or without them.</div>';
      return;
    }

    status.textContent = `— ${d.callsign} DOWN`;
    status.style.color = 'var(--amber)';

    brief.innerHTML = briefLines(G);
    box.innerHTML = orderRows(G);
    wireOrders(box);
  }

  // The five lines and the two orders, built once for both homes. Same argument
  // as coaRows in ui.js: a second copy of this markup is a second place for the
  // capture-risk line to fall out of, and that line is the whole reason the
  // player is being asked to decide tonight rather than tomorrow.
  function briefLines(G) {
    const d = G.downed;
    const risk = Math.round(captureRisk(G) * 100);
    // Named, and with the sortie count beside the name. The player has been
    // reading these two facts in the squadron panel all campaign; the whole
    // point of the roster is that this line is not the first time.
    const down = (d.crewIds || []).map((id) => Aircrew.byId(Game.G, id)).filter(Boolean);
    return `<div class="csar-line"><span class="csar-key">AIRCREW</span>` +
      `<span>${down.length
        ? down.map((a) => `${Aircrew.label(a)} <span class="dim">· ${easyText(Txt.plural(a.sorties, 'sortie'))}</span>`).join('<br>')
        : `${Txt.plural(d.crew, 'aviator')}`}</span></div>` +
      `<div class="csar-line"><span class="csar-key">AIRFRAME</span><span>${d.type}</span></div>` +
      `<div class="csar-line"><span class="csar-key">POSITION</span><span>${d.loc}</span></div>` +
      `<div class="csar-line"><span class="csar-key">STATUS</span>` +
      `<span class="csar-evading">EVADING — ${d.turnsOut === 0 ? 'first hours' : `${Txt.turns(d.turnsOut)} on the ground`}</span></div>` +
      `<div class="csar-line"><span class="csar-key">CAPTURE RISK</span>` +
      `<span class="${risk >= 55 ? 'est-bad' : risk >= 30 ? 'est-warn' : 'est-good'}">${risk}% before your next order</span></div>`;
  }

  function orderRows(G) {
    const d = G.downed;
    const { p } = odds(G);
    const noEscort = G.res.fighters < 1;
    const buttons = [
      {
        id: 'isr', name: Game.difficulty().plainLanguage
          ? 'USE INTELLIGENCE TO LOCATE THE CREW'
          : 'Push ISR — lock the position',
        desc: d.isr
          ? 'The position is locked and the on-scene commander has the picture.'
          : G.intelUsed
            ? 'Uses this turn\'s intelligence slot — already spent.'
            : 'Spend this turn\'s intelligence slot retasking national assets onto the survivors. Recovery +10%, capture risk −8%.',
        disabled: d.isr || G.intelUsed,
      },
      {
        id: 'go', name: Game.difficulty().plainLanguage
          ? 'LAUNCH THE RESCUE MISSION'
          : 'LAUNCH THE RECOVERY — MQ-9 overwatch + Jolly package',
        desc: noEscort
          ? 'No fighter sorties left to escort the package in. Nothing goes in over that ground unescorted.'
          : `Costs 1 fighter sortie. Current recovery estimate: ${Math.round(p * 100)}%. ` +
            `Waiting makes it worse — and the alternative to going is a broadcast.`,
        disabled: noEscort,
        danger: true,
      },
    ];
    return buttons.map(b =>
      `<button data-csar="${b.id}" ${b.disabled ? 'disabled' : ''} class="${b.danger ? 'specops-danger' : ''}">` +
      `${easyText(b.name)}<span class="diplo-desc">${easyText(b.desc)}</span></button>`).join('');
  }

  function wireOrders(box) {
    for (const btn of box.querySelectorAll('button')) {
      btn.addEventListener('click', () => {
        // Either order closes the brief. ISR resolves into a report of its own,
        // and LAUNCH hands off to the authorization dialog — in both cases the
        // next thing on screen is the answer to the question this dialog asked.
        if (popped()) closeBrief();
        btn.dataset.csar === 'isr' ? doIsr() : openModal();
      });
    }
  }

  // ---- the recovery, as a dialog ----
  function renderBrief(G) {
    const body = $('recovery-brief');
    const box = $('recovery-buttons');
    if (!body || !box) return;
    if (running) {
      body.innerHTML = '<div class="dim">The recovery force is on the objective. Watch the feed. ' +
        'Nothing else happens until they are out — with our people or without them.</div>';
      box.innerHTML = '';
      return;
    }
    $('recovery-modal-who').textContent = `${G.downed.callsign} DOWN`;
    body.innerHTML = briefLines(G);
    box.innerHTML = orderRows(G);
    wireOrders(box);
  }

  function closeBrief() {
    const m = $('recovery-modal');
    if (m) m.classList.add('hidden');
  }

  // ---- ISR push (spends the turn's intelligence slot) ----
  function doIsr() {
    const G = Game.G;
    if (G.over || running || !G.downed || G.downed.isr || G.intelUsed) return;
    G.intelUsed = true;
    G.downed.isr = true;
    AudioSys.play('cable');
    UI.renderAll(G);
    UI.showReport('PERSONNEL RECOVERY — ISR TASKING', [{
      cls: 'friendly', title: 'National assets retasked onto the survivors', internal: true,
      text: `A Reaper is overhead and an RC-135 is working the search parties' radios. ${G.downed.callsign} ` +
        `has been moved to a covered position and given a pickup point they can reach. The rescue force ` +
        `now knows what is between them and the survivors instead of guessing at it.`,
    }], () => Game.afterAction());
  }

  // ---- mission modal ----
  function openModal() {
    const G = Game.G;
    if (G.over || running || !G.downed || G.res.fighters < 1) return;
    const d = G.downed;
    const { p, parts } = odds(G);
    const pct = Math.round(p * 100);
    const sCls = pct >= 60 ? 'est-good' : pct >= 40 ? 'est-warn' : 'est-bad';
    const easy = Game.difficulty().plainLanguage;
    const modalTitle = $('csar-modal-title');
    if (easy && modalTitle) modalTitle.textContent = 'PERSONNEL RECOVERY — RESCUE DOWNED AIRCREW';
    $('csar-brief-text').textContent = easy
      ? `${d.callsign} — ${d.type} — went down ${d.loc}. ${crewPhrase(d, true)} ${Txt.are(d.crew)} on the ground. The rescue uses helicopters, a pararescue team, an armed drone, fighter escorts, and refueling aircraft. It is dangerous, and waiting increases the chance that Iran captures the crew.`
      : `${d.callsign} — ${d.type} — went down ${d.loc}. ${crewPhrase(d, true)} ${Txt.are(d.crew)} ` +
        `on the ground and authenticated. The package is a pair of HH-60W Jolly Green IIs with a ` +
        `pararescue team aboard, an armed MQ-9 Reaper flying overwatch and precision fires, and tankers holding off the ` +
        `coast. It is the most exposed thing the Air Force does, it is flown into an alerted area, and ` +
        `nobody in this building will tell you not to go.`;
    // Row 0 is the baseline the rest modify, so it carries no sign; the
    // modifiers do, and a negative one is typeset with a real minus rather than
    // the hyphen a raw number interpolates as.
    let html = parts.map(([label, v], i) => {
      const n = Math.round(v * 100);
      const body = !i ? `${n}%` : `${n >= 0 ? '+' : '−'}${Math.abs(n)}%`;
      return `${easyText(label)}: <span class="${v >= 0 ? 'est-good' : 'est-bad'}">${body}</span><br>`;
    }).join('');
    html += `EST. PROBABILITY OF RECOVERY: <span class="${sCls}">${pct}%</span><br>` +
      `<span class="dim">The recovery runs about seventy seconds. It is narrated live in the tactical panel.</span><br>` +
      `<span class="est-good">Bringing them home is worth more at home than any target on the map.</span><br>` +
      `<span class="est-warn">Costs 1 fighter sortie for the escort. There is one attempt.</span><br>` +
      `<span class="est-bad">Short of success, aircrew — and possibly a rescue crew — go into IRGC custody.</span>`;
    $('csar-estimate').innerHTML = easyText(html);
    $('csar-modal').classList.remove('hidden');
  }

  function closeModal() { $('csar-modal').classList.add('hidden'); }

  // ============================================================
  // BRANCHES
  // ============================================================
  // clean    — everyone comes home, nothing goes wrong
  // costly   — everyone comes home; the rescue force pays for it
  // partial  — the recovery force gets out without all of them
  // disaster — the rescue becomes the story
  function pickBranch(G) {
    const { p } = odds(G);
    if (Random.float() < p) {
      const cleanOdds = 0.45 + (G.downed.isr ? 0.15 : 0);
      return Random.float() < cleanOdds ? 'clean' : 'costly';
    }
    return Random.float() < 0.5 ? 'partial' : 'disaster';
  }

  // ============================================================
  // THE SCRIPT
  // ============================================================
  // Same grammar as the raid: { t, text, kind, phase, contested, audio, fx }.
  // {cs} is substituted with the callsign at run time.

  const INGRESS = [
    { t: 0, phase: 'ALERT LAUNCH', audio: 'launch',
      text: 'JOLLY 51 and 52 off the alert pad — REAPER 01 already on station overhead',
      fx: (v) => v.ingress(26000) },
    { t: 4500, text: '{cs} is up on guard — survival radio contact, weak but readable' },
    { t: 9000, kind: 'good', text: 'Authentication passed against the ISOPREP file. It is them.',
      fx: (v) => v.beacon() },
    { t: 13500, text: 'REAPER 01 holds the wheel overhead — sparkling the position with its targeting pod' },
    { t: 18000, kind: 'problem', contested: true,
      text: 'Vehicles on the track east of the position — dismounts, moving to search',
      fx: (v) => v.searchers(30000) },
    { t: 22000, phase: 'ON-SCENE', text: 'Two minutes. JOLLY 51 is committing.' },
  ];

  const BRANCHES = {
    // ---- everyone comes home ----
    clean: [
      { t: 26000, phase: 'RECOVERY', audio: 'impact',
        text: 'REAPER 01 in hot — Hellfire between the search party and the survivors',
        fx: (v) => v.gunRun(true) },
      { t: 30000, kind: 'good', contested: false,
        text: 'Search party broken up. Nobody is walking onto that position now.' },
      { t: 34000, text: 'JOLLY 51 flaring into the wadi — brownout, going in on instruments',
        fx: (v) => v.land(4000) },
      { t: 39000, text: 'PJs off the ramp. Thirty seconds on the ground.',
        fx: (v) => v.pickup(9) },
      { t: 44000, kind: 'good', audio: 'impact', text: 'ALL SURVIVORS ABOARD — nobody left in that wadi' },
      { t: 48000, phase: 'EGRESS', text: 'JOLLY 51 off the deck — nose down, running for the coast',
        fx: (v) => v.egress(11000) },
      { t: 53000, text: 'REAPER 01 covering the egress. Nothing coming off the track behind them.' },
      { t: 58000, kind: 'good', text: 'Feet wet. Both engines good, no holes worth counting.' },
      { t: 63000, phase: 'RECOVERY COMPLETE', text: 'Aircrew recovered. Medical is meeting them on the ramp.' },
    ],

    // ---- everyone comes home and the rescue force pays for it ----
    costly: [
      { t: 26000, phase: 'RECOVERY', audio: 'impact', text: 'REAPER 01 in hot — Hellfire short of the position',
        fx: (v) => v.gunRun(false) },
      { t: 30000, kind: 'problem', text: 'They went to ground and kept shooting. This is not a clean pattern.' },
      { t: 34000, kind: 'bad', audio: 'aircraftLost',
        text: 'JOLLY 51 TAKING 23MM ON SHORT FINAL — hits through the cabin',
        fx: (v) => { v.heloHit('jolly1'); v.land(4000); } },
      { t: 39000, kind: 'bad', text: 'One pararescueman down on the ramp before they reached the survivors',
        fx: (v) => { v.crewHit(); v.pickup(9); } },
      { t: 44000, kind: 'good', audio: 'impact', text: 'SURVIVORS ABOARD — thirty-one seconds on the ground' },
      { t: 48000, phase: 'EGRESS', kind: 'problem', text: 'JOLLY 51 lifting heavy — number two engine degraded',
        fx: (v) => v.egress(12000) },
      { t: 53000, kind: 'problem', text: 'Trailing fuel and losing pressure. REAPER 01 is walking them out.' },
      { t: 58000, kind: 'good', text: 'Feet wet — they made the water and put down on a destroyer\'s deck.' },
      { t: 63000, phase: 'RECOVERY COMPLETE — CASUALTIES',
        text: 'Aircrew recovered. The pararescueman who went out first did not come back.' },
    ],

    // ---- the recovery force comes out without all of them ----
    // The night forks on how many people were down there to begin with.
    partial: (d) => d.crew === 2 ? [
      { t: 26000, phase: 'RECOVERY', text: 'REAPER 01 in hot — Hellfire on the track',
        fx: (v) => v.gunRun(false) },
      { t: 30000, kind: 'bad', text: 'Second element on foot from the north. They had this position before we did.',
        fx: (v) => v.searchers(26000, 'north') },
      { t: 34000, kind: 'bad', text: 'The survivors are separated — four hundred metres between the beacons' },
      { t: 38000, text: 'JOLLY 51 going for the closer beacon first', fx: (v) => v.land(3500) },
      { t: 43000, kind: 'good', text: 'Pilot is aboard.', fx: (v) => v.pickup(1) },
      { t: 47000, kind: 'bad', text: 'Second beacon has stopped. The voice answering on it is not his.',
        fx: (v) => v.taken() },
      { t: 52000, kind: 'bad', audio: 'aircraftLost', text: 'Ground fire walking onto the aircraft — JOLLY 51 is hit',
        fx: (v) => v.heloHit('jolly1') },
      { t: 56000, phase: 'EGRESS', kind: 'bad',
        text: 'On-scene commander calls it. They are leaving with one man and not two.',
        fx: (v) => v.egress(11000) },
      { t: 61000, kind: 'bad', text: 'Nothing further from the second beacon. It is in their hands now.' },
      { t: 66000, phase: 'RECOVERY ENDED', text: 'One aircrew aboard. One on that hillside.' },
    ] : [
      { t: 26000, phase: 'RECOVERY', text: 'REAPER 01 in hot — Hellfire on the track',
        fx: (v) => v.gunRun(false) },
      { t: 30000, kind: 'bad', text: 'Second element on foot from the north. They had this position before we did.',
        fx: (v) => v.searchers(26000, 'north') },
      { t: 35000, kind: 'bad', text: 'The beacon is moving fast and in the wrong direction — that is not him walking' },
      { t: 40000, kind: 'bad', text: 'Voice on the survival radio answering in Farsi. The radio has changed hands.',
        fx: (v) => v.taken() },
      { t: 45000, kind: 'bad', audio: 'aircraftLost', text: 'JOLLY 51 taking fire in the hold — no hover, no hoist',
        fx: (v) => v.heloHit('jolly1') },
      { t: 50000, phase: 'EGRESS', kind: 'bad',
        text: 'On-scene commander calls it. There is nothing down there left to recover.',
        fx: (v) => v.egress(11000) },
      { t: 56000, kind: 'bad', text: 'Search parties are on the position the aircrew held forty minutes ago.' },
      { t: 61000, phase: 'RECOVERY ENDED', text: 'Recovery force is out. The aviator is not with them.' },
    ],

    // ---- the rescue becomes the story ----
    disaster: [
      { t: 26000, phase: 'RECOVERY', kind: 'bad', audio: 'retaliation',
        text: 'The wadi is a killing zone. This was laid on the beacon and we flew into it.',
        fx: (v) => v.gunRun(false) },
      { t: 30000, kind: 'bad', audio: 'aircraftLost',
        text: 'JOLLY 51 HIT ON SHORT FINAL — going in hard, north of the position',
        fx: (v) => v.heloDown('jolly1', true) },
      { t: 35000, kind: 'bad', text: 'Rescue crew is out of the wreck and pinned in the open',
        fx: (v) => v.crewHit() },
      { t: 39000, kind: 'bad', text: 'REAPER 01 knocked down as well — MANPADS off the ridge line',
        fx: (v) => v.mq9Down() },
      { t: 44000, kind: 'bad', text: 'JOLLY 52 is taking fire in the hold and cannot get in' },
      { t: 49000, phase: 'DANGER CLOSE', kind: 'bad',
        text: 'Aircrew, pararescuemen and a helicopter crew are all on that ground now' },
      { t: 54000, kind: 'bad', text: 'The beacons are going off the air one at a time',
        fx: (v) => v.taken() },
      { t: 59000, phase: 'EGRESS', kind: 'bad',
        text: 'JOLLY 52 is winchester and bingo fuel. On-scene commander pulls them out.',
        fx: (v) => v.egress(10000) },
      { t: 64000, kind: 'bad', text: 'Iranian television crews are already at the wreck of JOLLY 51.' },
      { t: 69000, phase: 'MISSION ENDED', text: 'Nothing further from the objective. Standing by for debrief.' },
    ],
  };

  // ============================================================
  // OUTCOMES — applied when the timeline finishes, never during it
  // ============================================================
  // Who was on the ground, as roster entries. `d` is a detached copy by the time
  // these run — executeRescue clears G.downed before the timeline plays — so the
  // ids are the only way back to the people.
  const aboardOf = (G, d) => (d.crewIds || []).map((id) => Aircrew.byId(G, id)).filter(Boolean);

  const OUTCOMES = {
    clean(G, d, events) {
      G.stats.aircrewRescued += d.crew;
      // back on the flight schedule after REST turns, which is the only good
      // news this subsystem ever posts to the squadron panel
      Aircrew.setStatus(G, aboardOf(G, d), 'recovering', G.turn);
      // No habituation class on any outcome in this file. A recovery is not a
      // repetition of anything — the whole subsystem fires a handful of times
      // in a campaign at most — and a country that got bored of rescued
      // aircrew would be a country this game has no business modelling.
      const cleanGain = Game.movePublic(8);
      G.world = clamp(G.world + 3, 0, 100);
      events.push({
        cls: 'friendly', title: `RECOVERY COMPLETE — ${d.callsign} IS OUT`,
        text: `${crewPhrase(d, true)} ${Txt.are(d.crew)} aboard the recovery ship, dehydrated ` +
          `and intact, ${Math.round(4 + Random.float() * 6)} hours after ejecting over hostile ground. ` +
          `Nobody in the rescue package was hurt. The footage Tehran was preparing to run tonight does ` +
          `not exist, and the picture the country gets instead is a flight suit walking off a ramp under ` +
          `its own power. There is no target on that map worth what this is worth at home.`,
        dApproval: cleanGain, dWorld: 3,
      });
    },

    costly(G, d, events) {
      G.stats.aircrewRescued += d.crew;
      Aircrew.setStatus(G, aboardOf(G, d), 'recovering', G.turn);
      G.casualties.us += 1;
      const costlyGain = Game.movePublic(5);
      events.push({
        cls: 'friendly', title: `RECOVERY COMPLETE — ONE PARARESCUEMAN KILLED`,
        text: `${crewPhrase(d, true)} ${Txt.are(d.crew)} out. It cost a pararescueman, ` +
          `killed on the ground covering the pickup, and an airframe that will not fly again without a ` +
          `depot. The aircraft came off the objective heavy, on one good engine, trailing fuel, and put ` +
          `down on a destroyer with the survivors alive in the back. Everyone in that squadron would ` +
          `fly it again tomorrow. That is the part that is hard to explain to the family.`,
        casualties: 1, dApproval: costlyGain,
      });
    },

    partial(G, d, events) {
      G.hostageCrisis = true;
      const saved = d.crew === 2 ? 1 : 0;
      const taken = d.crew - saved;
      G.stats.aircrewRescued += saved;
      G.stats.aircrewCaptured += taken;
      // The branch that splits a crew splits the roster with it: the front
      // seater comes home and the back seater does not, and both names stay on
      // the panel saying so for the rest of the war. This is the whole reason
      // the two of them were separate entries rather than one "crew" record.
      const on = aboardOf(G, d);
      Aircrew.setStatus(G, on.slice(0, saved), 'recovering', G.turn);
      Aircrew.setStatus(G, on.slice(saved), 'pow', G.turn);
      // An American in IRGC custody is one of the four things in this game that
      // reaches past the persuadable middle and cracks the president's own
      // base. It is not that the news is bad — plenty of news is bad — it is
      // that a prisoner on television is the specific image that makes people
      // who voted for you stop defending you. See APPROVAL.erode.
      //
      // Charged even when one crew came home: `saved` softens the push on the
      // middle, because half a recovery is half a story, and does not soften
      // the erosion at all, because the half that is on television is the half
      // that does this.
      const partialCost = Game.movePublic(saved ? -6 : -9);
      Game.erodeBase(APPROVAL.erode.aircrewTaken);
      G.world = clamp(G.world - 3, 0, 100);
      const out = on[0], left = on[1];
      events.push({
        cls: 'iran', title: saved
          ? 'PARTIAL RECOVERY — ONE AIRCREW ABOARD, ONE IN IRGC HANDS'
          : `RECOVERY FAILED — ${d.callsign} TAKEN ALIVE`,
        text: saved
          ? `${out ? Aircrew.label(out) : 'The pilot'} is out. ` +
            `${left ? Aircrew.label(left) : 'The weapons systems officer'} was four hundred metres away ` +
            `when the second search element came over the ridge, and the aircraft was taking fire it ` +
            `could not sit through. The on-scene commander made the call that everyone in that cockpit ` +
            `will spend the rest of their life defending. By morning Iranian television has the ` +
            `prisoner they took, blindfolded, named — and the one who came home has to watch it too.`
          : `The recovery force reached the position and found the search parties already on it. The ` +
            `survival radio changed hands while the helicopters were in the hold. ` +
            `${out ? Aircrew.label(out) : d.callsign} is in IRGC custody, on television by morning, ` +
            `and the aircraft that went in came back shot up and empty. ` +
            `Nothing about this reads as anything but a failure, because it was one.`,
        dApproval: partialCost, dWorld: -3,
      });
    },

    disaster(G, d, events) {
      G.hostageCrisis = true;
      G.stats.aircrewCaptured += d.crew;
      Aircrew.setStatus(G, aboardOf(G, d), 'pow', G.turn);
      G.stats.aircraftLost += 2;
      const c = rand(4, 9);
      G.casualties.us += c;
      // The worst single event in the game, and the only one that cracks the
      // base twice over: prisoners on television AND a task force that did not
      // come out. Both are charged, because they are two different failures and
      // the country is told about both — the rescue was a decision the
      // president made, on top of the shootdown that was not.
      const disasterCost = Game.movePublic(-15);
      Game.erodeBase(APPROVAL.erode.hostages + APPROVAL.erode.raidLost);
      G.world = clamp(G.world - 8, 0, 100);
      events.push({
        cls: 'iran', title: 'RECOVERY FORCE DESTROYED — THE RESCUE IS NOW THE STORY',
        text: `The beacon was a trap and the package flew into it. A Jolly went in on short final with a ` +
          `pararescue team aboard, the MQ-9 flying overwatch was knocked out of the sky by a shoulder-launched missile ` +
          `over the ridge, and the second helicopter could not get in to either of them. ` +
          `${Txt.plural(c, 'American')} ${Txt.are(c)} dead. ${crewPhrase(d, true)} and the survivors of the ` +
          `helicopter crew are in IRGC custody — more prisoners than the shootdown created, taken by the ` +
          `operation launched to prevent it. Iranian state television is running the wreckage on a loop ` +
          `with the prisoners intercut. Every network at home is running it too, and the question under ` +
          `it is who ordered the rescue.`,
        casualties: c, dApproval: disasterCost, dWorld: -8,
      });
    },
  };

  // ============================================================
  // THE RUNNER
  // ============================================================
  function lock(on) {
    running = on;
    const app = $('app');
    if (app) app.classList.toggle('raid-running', on);
  }

  function runMission(branch, d, onDone) {
    const tail = BRANCHES[branch];
    const steps = INGRESS.concat(typeof tail === 'function' ? tail(d) : tail);
    const total = steps[steps.length - 1].t + 2500;
    const view = MapView.csarOpen(
      `${d.callsign} RECOVERY · JOLLY 51 — ${d.loc.toUpperCase()}`, d.crew, () => finish(true), total);

    let phase = 'ALERT LAUNCH', contested = false, done = false;
    const timers = [];

    const t0 = performance.now();
    (function tick(now) {
      if (done) return;
      view.phase(Math.min(1, (now - t0) / total), phase, contested);
      requestAnimationFrame(tick);
    })(t0);

    for (const step of steps) {
      timers.push(setTimeout(() => {
        if (done) return;
        if (step.phase) phase = step.phase;
        if (step.contested !== undefined) contested = step.contested;
        view.log(step.text.replace('{cs}', d.callsign), step.kind || 'status', step.t);
        if (step.audio) AudioSys.play(step.audio);
        if (step.fx) { try { step.fx(view); } catch (e) { console.error('csar fx failed', e); } }
      }, step.t));
    }

    // Skipping cuts the theatre, never the result.
    function finish(skipped) {
      if (done) return;
      done = true;
      for (const id of timers) clearTimeout(id);
      view.phase(1, skipped ? 'SKIPPED' : phase, false);
      view.close(skipped ? 300 : 4500);
      onDone();
    }

    timers.push(setTimeout(() => finish(false), total));
  }

  // ---- resolution ----
  function executeRescue() {
    const G = Game.G;
    if (G.over || running || !G.downed || G.res.fighters < 1) return;
    closeModal();

    const d = G.downed;
    const branch = pickBranch(G);   // decided here, before anything is drawn

    G.res.fighters -= 1;            // the fighter escort is a real sortie
    G.downed = null;                // one attempt: the situation resolves tonight
    syncMap(G);
    lock(true);
    UI.renderAll(G);

    runMission(branch, d, () => {
      const events = [];
      OUTCOMES[branch](G, d, events);
      lock(false);
      UI.renderAll(G);
      UI.showReport('PERSONNEL RECOVERY — MISSION DEBRIEF', events, () => Game.afterAction(), { prose: true });
    });
  }

  // ---- wiring ----
  function init() {
    $('btn-confirm-rescue').addEventListener('click', executeRescue);
    // The way back into a dismissed recovery brief, and the reason the brief is
    // allowed to be dismissed at all. Waiting a night is a real option here —
    // the capture risk on the card is the price of it — so this cannot be a
    // dialog with no close, the way the allied call is.
    $('btn-recovery').addEventListener('click', () => {
      if (Game.busy() || running || !Game.G.downed) return;
      renderBrief(Game.G);
      $('recovery-modal').classList.remove('hidden');
    });
  }

  return { init, renderPanel, aircraftDown, turnTick, syncMap, busy: () => running };
})();
