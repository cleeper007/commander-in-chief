// ============================================================
// specops.js — special forces: leadership raid (its ISR prep is rendered as an
// intelligence tasking in the Intelligence Tasking panel; state lives here)
// ============================================================
// One Tier-1 task force for the whole game (G.res.specops, never
// replenished). The raid is not a strike: no package math, no strike
// animation. It is a scripted mission roughly two minutes long, narrated
// live in the tactical panel, that ends in one of four branches.
//
// The branch is decided BEFORE the first line of the script plays — the
// timeline is a dramatization of a roll that has already happened, exactly
// like the strike scope. Nothing on screen changes an outcome.

const SpecOps = (() => {
  const $ = (id) => document.getElementById(id);
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const rand = Random.int;

  const ISR_CAP = 2;

  let running = false;   // mission in progress: the war is locked out

  // ---- odds ----
  // Base is deliberately low: this is the best-protected target in the
  // country. Patience (ISR prep) and prior strikes on air defense and
  // command nodes are what make it survivable.
  function odds(G) {
    const parts = [];
    let p = 0.25;
    parts.push(['Baseline — hardest target in Iran', 0.25]);

    if (G.isrPrep > 0) {
      const bonus = Math.min(G.isrPrep, ISR_CAP) * 0.12;
      p += bonus;
      parts.push([`ISR preparation ×${Math.min(G.isrPrep, ISR_CAP)}`, bonus]);
    }

    // the corridor in is worth whatever the SAM belt has actually lost, not
    // whatever bracket it happens to sit in
    let adBonus = 0;
    for (const t of TARGETS) {
      if (t.type !== 'airdefense') continue;
      adBonus += 0.06 * (1 - t.hp / 100);
    }
    if (adBonus > 0.005) { p += adBonus; parts.push(['Air defenses degraded', adBonus]); }

    const hq = TARGETS.find(t => t.id === 'irgc-hq');
    const hqBonus = 0.10 * (1 - hq.hp / 100);
    if (hqBonus > 0.005) {
      p += hqBonus;
      parts.push([hq.hp <= 0 ? 'IRGC command destroyed' : 'IRGC command degraded', hqBonus]);
    }

    p = clamp(p, 0.05, 0.75);
    return { p, parts };
  }

  // ---- sidebar panel ----
  function renderPanel(G) {
    const status = $('specops-status');
    const box = $('specops-buttons');
    if (!box) return;

    if (running) {
      status.textContent = '— MISSION IN PROGRESS';
      status.style.color = 'var(--amber)';
      box.innerHTML = '<div class="dim" style="font-size:11px">The task force is on the objective. ' +
        'Watch the feed. Nothing else happens until they are out — one way or the other.</div>';
      return;
    }

    if (G.raid !== 'none') {
      const st = G.raid === 'success' ? '— MISSION COMPLETE'
        : G.raid === 'pyrrhic' ? '— OBJECTIVE MET · TASK FORCE LOST'
        : '— TASK FORCE LOST';
      status.textContent = st;
      status.style.color = G.raid === 'success' ? 'var(--green)'
        : G.raid === 'pyrrhic' ? 'var(--amber)' : 'var(--red)';
      const note = G.raid === 'success'
        ? 'The task force is out. Its work echoes through everything Tehran does now.'
        : G.raid === 'pyrrhic'
          ? 'They killed him and they did not come home. Both facts are permanent.'
          : 'There will be no second attempt. The families have been notified.';
      box.innerHTML = `<div class="dim" style="font-size:11px">${note}</div>`;
      return;
    }

    status.textContent = '';
    status.style.color = '';
    const { p } = odds(G);
    // The raid is the only order given from this panel now; its ISR prep is an
    // intelligence tasking and lives in the Intelligence Tasking panel, but the
    // odds it buys are shown here where the raid is launched.
    const isrNote = G.isrPrep >= ISR_CAP
      ? `Pattern-of-life ISR complete (${ISR_CAP}/${ISR_CAP}) — odds are as good as they get.`
      : `Pattern-of-life ISR run ${G.isrPrep}/${ISR_CAP} times. Run more from the Intelligence Tasking panel — each adds +12%.`;
    const buttons = [
      {
        id: 'raid', name: 'LEADERSHIP DECAPITATION — launch raid',
        desc: `One task force, one attempt, ever. Current success estimate: ${Math.round(p * 100)}%. Win or lose, the world will know — and Tehran will answer.`,
        disabled: G.res.specops < 1,
        danger: true,
      },
    ];
    box.innerHTML = buttons.map(b =>
      `<button data-specops="${b.id}" ${b.disabled ? 'disabled' : ''} class="${b.danger ? 'specops-danger' : ''}">` +
      `${b.name}<span class="diplo-desc">${b.desc}</span></button>`).join('') +
      `<div class="dim" style="font-size:11px;margin-top:6px">${isrNote}</div>`;
    for (const btn of box.querySelectorAll('button')) {
      btn.addEventListener('click', openModal);
    }
  }

  // ---- ISR prep ----
  // Now an intelligence tasking: the Intelligence Tasking panel renders the
  // button (via isrTasking) and Game.doDiplo spends the intel slot, but the
  // state and its raid payoff stay here with the mission they feed.
  // Returns the button descriptor, or null when there is no raid left to prep.
  function isrTasking(G) {
    if (running || G.raid !== 'none') return null;
    const done = G.isrPrep >= ISR_CAP;
    return {
      id: 'isr-prep', name: 'Shadow the leadership — pattern-of-life',
      current: done
        ? `Pattern-of-life picture complete (${ISR_CAP}/${ISR_CAP}).`
        : `${G.isrPrep}/${ISR_CAP} taskings run — each adds +12% to a leadership raid.`,
      desc: done
        ? 'As good as overhead and the source network can make it. No further ISR will improve the raid.'
        : 'National assets shadow the leadership\'s movements, comms and security rotations. Builds the ' +
          'picture a decapitation raid needs to bring the operators home.',
      disabled: done,
    };
  }

  // Runs the tasking itself, called from Game.doDiplo on the intel slot.
  function runIsrPrep(G, events) {
    if (G.isrPrep >= ISR_CAP) return false;
    G.isrPrep++;
    events.push({
      cls: 'friendly', title: 'Pattern-of-life surveillance expanded', internal: true,
      text: 'National assets are retasked against the leadership\'s movements, communications, and security detail rotations. The picture sharpens. If the raid ever goes, this is what brings the operators home.',
    });
    return true;
  }

  // ---- mission modal ----
  function openModal() {
    const G = Game.G;
    if (G.over || running || G.res.specops < 1 || G.raid !== 'none') return;
    const { p, parts } = odds(G);
    const pct = Math.round(p * 100);
    const sCls = pct >= 60 ? 'est-good' : pct >= 40 ? 'est-warn' : 'est-bad';
    // The first row is the baseline the rest modify, not a bonus on top of it —
    // signing it "+25%" reads as though something is being added to something
    // else. Only the modifiers carry a sign.
    let html = parts.map(([label, v], i) =>
      `${label}: <span class="est-good">${i ? '+' : ''}${Math.round(v * 100)}%</span><br>`).join('');
    html += `EST. PROBABILITY OF SUCCESS: <span class="${sCls}">${pct}%</span><br>` +
      `<span class="dim">The mission runs about two minutes. It is narrated live in the tactical panel.</span><br>` +
      `<span class="est-good">Success buys a window of Iranian paralysis and a weaker Tehran at the table.</span><br>` +
      `<span class="est-warn">It does not destroy the nuclear program. Nothing here wins the war for you.</span><br>` +
      `<span class="est-bad">Attempting the raid costs world opinion — success or failure.</span><br>` +
      `<span class="est-bad">Short of success, operators will be killed or captured on Iranian soil.</span>`;
    $('specops-estimate').innerHTML = html;
    $('specops-modal').classList.remove('hidden');
  }

  function closeModal() { $('specops-modal').classList.add('hidden'); }

  // ============================================================
  // BRANCHES
  // ============================================================
  // clean     — success, nothing goes wrong
  // heloDown  — success, a bird is lost on the objective; the assault presses
  // mixed     — the Supreme Leader dies; the task force does not come home
  // failure   — everything goes wrong
  function pickBranch(G) {
    const { p } = odds(G);
    if (Random.float() < p) {
      // a better intel picture is what buys a quiet night rather than a loud one
      const cleanOdds = 0.34 + Math.min(G.isrPrep, ISR_CAP) * 0.13;
      return Random.float() < cleanOdds ? 'clean' : 'heloDown';
    }
    // failing to get out is not the same as failing to kill him: often enough
    // the team trades itself for the target
    return Random.float() < 0.42 ? 'mixed' : 'failure';
  }

  // ============================================================
  // THE SCRIPT
  // ============================================================
  // Each step: { t (ms from launch), text, kind, phase, contested, audio, fx, clip }
  //   kind      'status' | 'problem' | 'good' | 'bad' — colours the feed line
  //   phase     progress-bar label; sticky until the next step sets one
  //   contested amber progress bar; sticky
  //   fx        (view) => … drives the tactical display
  //   clip      footage for the feed pane; sticky until another step sets one,
  //             and null parks the pane on NO VISUAL
  // Edit freely — nothing here is load-bearing except the timings' ordering.

  // Footage lives beside the strike clips, in two folders: the infil (shared by
  // every branch) and the assault (reused across branches, since all four nights
  // fast-rope, breach, and clear the same compound). Exfil is not shot yet and
  // runs NO VISUAL. Adding a clip is one `clip:` field on the step it belongs
  // to — nothing else changes.
  //
  // The assault set is small on purpose: seven clips cover 40+ beats because the
  // branches differ in *what the feed says*, not in what the camera sees. A clip
  // is sticky until another step sets one, so a beat with no footage of its own
  // holds the last cut rather than dropping to black — which reads as a
  // continuous feed instead of a slideshow.
  //
  // Every clip here must be H.264 in an MP4, muxed with `-movflags +faststart`.
  // This is not a preference. These thirteen shipped for months as the phone's
  // native output — HEVC in a QuickTime container, moov atom at the tail — and
  // the whole set piece was a black pane for everyone not on Safari: Firefox
  // will not decode hvc1 at all, and Chrome's HEVC path is gated on a platform
  // hardware decoder that plenty of Windows and Linux machines do not expose.
  // The tail moov cost the rest: no frame renders until the entire file has
  // arrived, which on a phone is the difference between a cut and a stall. The
  // strike clips beside them were always correct, so the raid failed alone and
  // quietly. Re-encode new footage before dropping it in:
  //   ffmpeg -i in.mov -c:v libx264 -preset slow -crf 21 -profile:v high \
  //          -pix_fmt yuv420p -movflags +faststart out.mp4
  //
  // Hyphens, not spaces, and no %20 anywhere. These folders were named with
  // spaces and reached by pre-encoding them here, which held up on Pages but
  // put a literal space in the path the moment anything else touched it — zip
  // rebuilds, CDN rewrites, an itch upload. Keep new asset paths ASCII and
  // unescaped so the string in the source is the string on disk.
  const FOOTAGE = 'video/spec-ops-infil/';
  const ASSAULT = 'video/spec-ops-assault/';

  // `static` is signal snow, not a scene. It is the loss-of-feed card: once the
  // net goes silent it stays up through the state-TV beat and the end of the
  // mission, because from the situation room there is genuinely nothing left to
  // see. Never cut away from it — the branches that reach it are already over.
  const LOST_FEED = ASSAULT + 'static.mp4';

  // Every branch flies the same infil: the night is identical until the team
  // is on the ground, which is what makes the divergence land.
  const INFIL = [
    { t: 0, phase: 'INFIL', audio: 'launch', text: 'Flight of two off the deck — task force is airborne',
      clip: FOOTAGE + '1takeoff.mp4', fx: (v) => v.infil(30000) },
    { t: 4500, text: 'MH-47G carrying the assault element, MH-60M riding overwatch',
      clip: FOOTAGE + '2twohelicopterformation.mp4' },
    { t: 9000, text: 'Feet dry south of Bushehr — nap-of-the-earth, terrain masking the run',
      clip: FOOTAGE + '3inheloenroute.mp4' },
    { t: 14000, text: 'RC-135 on station: compound security posture unchanged',
      clip: FOOTAGE + 'staticoverhead.mp4' },
    { t: 19000, text: 'Crossing the Zagros in the dark. No radar tracks on the corridor.',
      clip: FOOTAGE + '5ridgelineterrain.mp4' },
    { t: 24000, text: 'Ten minutes. Assault element moving to the ramp.',
      clip: FOOTAGE + '6Missionisgomov.mp4' },
    { t: 28000, text: 'One minute. Green light.' },
  ];

  const BRANCHES = {
    // ---- SUCCESS: the night everyone planned for ----
    clean: [
      { t: 30000, phase: 'ACTIONS ON OBJECTIVE', text: 'Fast rope — team on the deck outside the south wall',
        clip: ASSAULT + 'fastrope.mp4', fx: (v) => v.fastrope(6000, 6) },
      // No cut here: the fast-rope clip holding is the point. This is the beat
      // where nothing happens, and a feed that keeps running says that better
      // than a new angle would.
      { t: 35000, text: 'No reaction from the guard barracks. They are asleep.' },
      { t: 39000, audio: 'impact', text: 'Charge on the south wall — through the breach',
        clip: ASSAULT + 'Breachcharge.mp4', fx: (v) => v.breach() },
      { t: 43500, kind: 'problem', contested: true, text: 'Two guards in the courtyard — suppressed, down',
        clip: ASSAULT + 'Courtyardsupressedcontact.mp4',
        fx: (v) => { v.firefight(3500); v.enter(7000); } },
      { t: 48500, contested: false, text: 'Ground floor clear. Stack moving to the stairs.',
        clip: ASSAULT + 'Interiorstackmovement.mp4' },
      { t: 53000, kind: 'good', audio: 'impact', text: 'JACKPOT — target down on the third floor',
        clip: ASSAULT + 'roomentry-jackpot.mp4', fx: (v) => v.jackpot() },
      // PID has no clip of its own; holding the room entry keeps the camera in
      // the room where it happened.
      { t: 58000, kind: 'good', text: 'Positive identification. Two minutes on the objective.' },
      { t: 63000, text: 'Sensitive site exploitation — hard drives, courier bags, phones',
        clip: ASSAULT + 'sse-documents.mp4' },
      { t: 68000, text: 'Non-combatants moved to the courtyard, secured, unhurt' },
      { t: 73000, phase: 'EXFIL', clip: null, text: 'Team collapsing to the LZ with the body and the material',
        fx: (v) => v.teamOut(6000) },
      { t: 79000, kind: 'good', text: 'Both birds off the deck. All operators accounted for.',
        fx: (v) => v.exfil(9000) },
      { t: 84000, text: 'Feet wet. No pursuit, no tracks behind them.' },
      { t: 89000, kind: 'good', text: 'Recovery ship has them. Nobody was ever there.' },
      { t: 94000, phase: 'MISSION COMPLETE', text: 'Task force is off Iranian soil. Standing by for debrief.' },
    ],

    // ---- SUCCESS: a bird goes in and the assault presses anyway ----
    heloDown: [
      { t: 30000, phase: 'ACTIONS ON OBJECTIVE', text: 'Fast rope — team on the deck outside the south wall',
        clip: ASSAULT + 'fastrope.mp4', fx: (v) => v.fastrope(6000, 6) },
      // The bird goes in off-camera as far as the feed is concerned — the assault
      // element's sensor is still looking at the rope. The tactical pane carries
      // the crash; the feed catches up at the breach.
      { t: 33000, kind: 'problem', contested: true, text: 'Overwatch bird losing tail rotor authority in the compound air' },
      { t: 36000, kind: 'bad', audio: 'aircraftLost', text: 'OVERWATCH BIRD IS DOWN — hard landing inside the wire',
        fx: (v) => v.heloDown('over') },
      { t: 40500, kind: 'good', text: 'Crew is out and moving under their own power. No fatalities.' },
      { t: 44000, text: 'Ground force commander is pressing. The assault goes.' },
      { t: 48000, audio: 'impact', text: 'Charge on the south wall — through',
        clip: ASSAULT + 'Breachcharge.mp4',
        fx: (v) => { v.breach(); v.firefight(11000); } },
      { t: 52000, kind: 'problem', text: 'Heavy contact from the barracks — the crash woke the whole compound',
        clip: ASSAULT + 'Courtyardsupressedcontact.mp4' },
      { t: 57000, text: 'Suppressing. Assault element into the main house.',
        clip: ASSAULT + 'Interiorstackmovement.mp4', fx: (v) => v.enter(7000) },
      { t: 62000, kind: 'good', audio: 'impact', text: 'JACKPOT — target down on the third floor',
        clip: ASSAULT + 'roomentry-jackpot.mp4', fx: (v) => v.jackpot() },
      { t: 67000, kind: 'bad', text: 'One operator killed clearing the barracks',
        fx: (v) => v.teamHit(1) },
      { t: 72000, contested: false, text: 'SSE bags loaded. Thermite charges set on the downed airframe.',
        clip: ASSAULT + 'sse-documents.mp4' },
      { t: 77000, phase: 'EXFIL', clip: null, text: 'Everyone onto the surviving bird — assault force and downed crew',
        fx: (v) => v.teamOut(6000) },
      { t: 83000, kind: 'problem', text: 'Airframe destroyed in place. She is still burning.',
        fx: (v) => v.exfil(9000) },
      { t: 88000, text: 'Feet wet. Overloaded and slow, but they are out.' },
      { t: 93000, kind: 'problem', text: 'Recovery ship has them. The wreckage will be on state TV by dawn.' },
      { t: 98000, phase: 'MISSION COMPLETE', text: 'Task force is off Iranian soil. Standing by for debrief.' },
    ],

    // ---- MIXED: they get him, and they do not come home ----
    mixed: [
      { t: 30000, phase: 'ACTIONS ON OBJECTIVE', text: 'Fast rope — team on the deck outside the south wall',
        clip: ASSAULT + 'fastrope.mp4', fx: (v) => v.fastrope(6000, 6) },
      { t: 34000, kind: 'problem', contested: true, audio: 'retaliation', text: 'Compound floodlights come on. They were waiting.' },
      { t: 38000, kind: 'bad', text: 'Charge on the south wall — through, into heavy fire',
        clip: ASSAULT + 'Breachcharge.mp4',
        fx: (v) => { v.breach(); v.firefight(34000); } },
      // The courtyard clip carries the whole loud middle of this branch — the
      // IRGC company, both birds going in, the men down at the door. Cutting a
      // new angle onto each of those would make the compound feel bigger than it
      // is; holding one two-way fight makes it feel surrounded.
      { t: 42500, kind: 'bad', text: 'This is not a guard detachment. Reinforced IRGC company.',
        clip: ASSAULT + 'Courtyardsupressedcontact.mp4' },
      { t: 46500, kind: 'bad', audio: 'aircraftLost', text: 'OVERWATCH BIRD DOWN — RPG off the north roofline',
        fx: (v) => v.heloDown('over') },
      { t: 51000, kind: 'bad', text: 'LZ bird destroyed on the ground. There is no ride home.',
        fx: (v) => v.heloDown('assault', true) },
      { t: 55000, text: 'Ground force commander on the net: they are going to finish it.' },
      { t: 59000, kind: 'bad', text: 'Two operators down at the courtyard door',
        clip: ASSAULT + 'Interiorstackmovement.mp4',
        fx: (v) => { v.teamHit(2); v.enter(6000); } },
      { t: 65000, kind: 'good', audio: 'impact', text: 'JACKPOT — target down on the third floor',
        clip: ASSAULT + 'roomentry-jackpot.mp4', fx: (v) => v.jackpot() },
      { t: 70000, kind: 'good', text: 'Positive identification. The Supreme Leader is dead.' },
      { t: 75000, phase: 'DANGER CLOSE', kind: 'bad', text: 'Team is surrounded in the main house. QRF is forty minutes out.' },
      { t: 80000, kind: 'bad', text: 'Ammunition low. They are burning the exploitation material.',
        clip: ASSAULT + 'sse-documents.mp4', fx: (v) => v.teamHit(2) },
      { t: 85500, kind: 'bad', text: 'Last transmission from the ground force commander.' },
      { t: 91000, phase: 'NO COMMS', kind: 'bad', text: 'The net has gone silent.',
        clip: LOST_FEED, fx: (v) => v.teamCaptured() },
      { t: 97000, kind: 'bad', text: 'Iranian state television is broadcasting from inside the compound.' },
      { t: 102000, phase: 'MISSION ENDED', text: 'Nothing further from the objective. Standing by for debrief.' },
    ],

    // ---- FAILURE: everything ----
    failure: [
      { t: 30000, phase: 'ACTIONS ON OBJECTIVE', text: 'Fast rope — team going in short of the south wall',
        clip: ASSAULT + 'fastrope.mp4', fx: (v) => v.fastrope(6000, 6) },
      { t: 33000, kind: 'bad', contested: true, audio: 'aircraftLost',
        text: 'ASSAULT BIRD TAKES A ZU-23 BURST ON SHORT FINAL — DOWN',
        fx: (v) => v.heloDown('assault', true) },
      { t: 37500, kind: 'bad', text: 'Two crew dead in the wreck. The team is on the ground and pinned.' },
      { t: 41500, kind: 'bad', text: 'Ambush. Interlocking fire from three sides — this position was known.',
        clip: ASSAULT + 'Courtyardsupressedcontact.mp4', fx: (v) => v.firefight(42000) },
      { t: 46000, kind: 'bad', text: 'Overwatch bird down. Both airframes are gone.',
        fx: (v) => v.heloDown('over') },
      { t: 50000, kind: 'bad', text: 'Two operators down in the open short of the wall',
        fx: (v) => v.teamHit(2) },
      { t: 55000, text: 'They get through the wall. The house is empty.',
        clip: ASSAULT + 'Breachcharge.mp4', fx: (v) => { v.breach(); v.enter(6000); } },
      // This branch never reaches the room entry — there is nobody in the room.
      // The interior clip runs under the empty-house beats instead, which is the
      // same men doing the same job with nothing at the end of it.
      { t: 60000, kind: 'bad', text: 'No target. No family. No papers. The compound was dressed.',
        clip: ASSAULT + 'Interiorstackmovement.mp4' },
      { t: 65000, phase: 'BROKEN CONTACT', kind: 'bad', text: 'They were expecting us. Somebody talked.' },
      { t: 70000, kind: 'bad', text: 'Ground force commander is hit. Element is combat ineffective.',
        fx: (v) => v.teamHit(2) },
      { t: 75000, kind: 'bad', text: 'QRF launched from the Gulf — forty-five minutes out. Too far.' },
      { t: 80500, kind: 'bad', text: 'Sporadic fire from the compound. Then nothing.' },
      { t: 86000, phase: 'NO COMMS', kind: 'bad', text: 'The net has gone silent.',
        clip: LOST_FEED, fx: (v) => v.teamCaptured() },
      { t: 92000, kind: 'bad', text: 'Iranian state television is already live from the wreckage.' },
      { t: 97000, phase: 'MISSION ENDED', text: 'Nothing further from the objective. Standing by for debrief.' },
    ],
  };

  // ============================================================
  // OUTCOMES — applied when the timeline finishes, never during it
  // ============================================================

  // Both success branches roll the same question: who picks up the pieces.
  function successAftermath(G, events) {
    if (Random.float() < 0.45) {
      const c = rand(4, 10);
      G.casualties.us += c;
      G.oil += 8;
      events.push({
        cls: 'iran', title: 'Leaderless IRGC units lash out',
        text: `Before the paralysis sets in, a rogue missile brigade empties its launchers at US positions on standing orders no one is alive to countermand. ${c} Americans are dead in a retaliation nobody in Tehran ordered.`,
        casualties: c, dOil: 8,
      });
    }
    if (Random.float() < 0.5) {
      G.negotiationMomentum += 0.15;
      events.push({
        cls: 'world', title: 'Succession faction signals interest in an off-ramp',
        text: 'CIA assesses the pragmatists are consolidating control. Muscat reports the first serious feeler of the crisis: they want to know what a ceasefire would cost. The window you wanted may be opening.',
      });
    } else {
      G.regimeErratic = true;
      events.push({
        cls: 'iran', title: 'Hardline remnant seizes the security organs',
        text: 'CIA assesses the wrong faction won the scramble. What is left of the regime is erratic, paranoid, and un-deterred — diplomatic contact will be harder, not easier, until the dust settles. Decapitation cuts both ways.',
      });
    }
  }

  const OUTCOMES = {
    clean(G, events) {
      G.raid = 'success';
      // A decapitation raid happens once. No habituation class anywhere in this
      // file, for the same reason csar.js passes none: there is nothing here
      // the country could have got bored of, because there is nothing here it
      // has seen before.
      const cleanGain = Game.movePublic(8);
      G.regimeChaosTurns = 2;
      events.push({
        cls: 'friendly', title: 'OBJECTIVE SECURED — LEADERSHIP TARGET ELIMINATED',
        text: 'The task force is feet-dry, feet-wet, and aboard the recovery ship before Tehran state media finishes denying it. Not one American was hurt. The top of the regime\'s command chain is gone, and retaliation orders are not being issued — no one is sure who has the authority to issue them. CENTCOM\'s caution is in the last line of the assessment: this buys a window and a weaker Tehran at the table. It does not destroy a single centrifuge.',
        dApproval: cleanGain,
      });
      successAftermath(G, events);
    },

    heloDown(G, events) {
      G.raid = 'success';
      const heloGain = Game.movePublic(6);
      G.world = clamp(G.world - 3, 0, 100);
      G.casualties.us += 1;
      G.stats.aircraftLost++;
      G.regimeChaosTurns = 2;
      events.push({
        cls: 'friendly', title: 'OBJECTIVE SECURED — ONE AIRFRAME LOST ON THE OBJECTIVE',
        text: 'The overwatch helicopter went in inside the compound wall and the assault went anyway. The target is dead, the exploitation material is aboard the recovery ship, and one operator is coming home in a transfer case. The airframe was destroyed in place — badly enough to deny the technology, publicly enough that Tehran has wreckage to photograph.',
        casualties: 1, dApproval: heloGain, dWorld: -3,
      });
      successAftermath(G, events);
    },

    mixed(G, events) {
      G.raid = 'pyrrhic';
      const mixedCost = Game.movePublic(-3);
      G.world = clamp(G.world - 5, 0, 100);
      const c = rand(10, 16);
      G.casualties.us += c;
      G.stats.aircraftLost += 2;
      G.hostageCrisis = true;
      G.regimeChaosTurns = 2;
      events.push({
        cls: 'iran', title: 'TARGET ELIMINATED — TASK FORCE DID NOT COME OUT',
        text: `They killed him. Positive identification was passed before the net went quiet. Then both helicopters were destroyed, the assault element was surrounded in the main house, and it ended the way it was always going to end without a ride home. ${c} Americans are dead; the survivors are in IRGC custody. The Supreme Leader is dead and so is the task force, and the country will spend a generation arguing about whether that was a trade worth making.`,
        casualties: c, dApproval: mixedCost, dWorld: -5,
      });
      if (Random.float() < 0.55) {
        G.regimeErratic = true;
        events.push({
          cls: 'iran', title: 'Hardline remnant seizes the security organs',
          text: 'With the top of the chain gone and American prisoners to parade, the most vengeful faction in Tehran has the strongest hand. What is left of the regime is erratic and un-deterred. The bodies gave them a martyr and the prisoners gave them a stage.',
        });
      } else {
        G.negotiationMomentum += 0.1;
        events.push({
          cls: 'world', title: 'Succession scramble opens a narrow channel',
          text: 'CIA assesses no one has consolidated control. Muscat reports quiet contact from figures who want to know what the prisoners are worth. It is not an off-ramp yet, but it is a door.',
        });
      }
    },

    failure(G, events) {
      G.raid = 'failed';
      // A task force sent in on the president's signature that did not come
      // out. One of the four catastrophes that reach the base itself — the
      // objection is not to the war going badly, it is to this specific
      // decision, and it is the president's alone. See APPROVAL.erode.
      const failCost = Game.movePublic(-9);
      Game.erodeBase(APPROVAL.erode.raidLost);
      G.world = clamp(G.world - 7, 0, 100);
      const c = rand(9, 14);
      G.casualties.us += c;
      G.stats.aircraftLost += 2;
      G.hostageCrisis = true;
      events.push({
        cls: 'iran', title: 'RAID COMPROMISED — TASK FORCE DESTROYED',
        text: `The compound was dressed and the ambush was laid. The assault helicopter was shot down on short final, the overwatch bird followed it, and the house was empty — no target, no family, no papers. ${c} Americans are dead and the survivors are in IRGC custody. Within hours Iranian state television is airing footage of captured Americans and burning stealth helicopters. It is the worst night for American special operations since Desert One, the pattern-of-life picture was wrong or leaked, and now Tehran holds hostages.`,
        casualties: c, dApproval: failCost, dWorld: -7,
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

  function runMission(branch, onDone) {
    const steps = INFIL.concat(BRANCHES[branch]);
    const total = steps[steps.length - 1].t + 2500;
    const view = MapView.raidOpen('NEPTUNE 01 · TF-11 — LEADERSHIP COMPOUND, TEHRAN', () => finish(true));
    // Rotor wash and interphone under the whole infil. Started here rather than
    // as a step `audio:` so a skip can cut it — the clip outlives the takeoff
    // beat it belongs to, and would otherwise keep flying over the debrief.
    AudioSys.play('raidInfil');
    // every clip in this branch starts buffering now, in script order, so the
    // beats cut to footage that has already arrived
    view.preload(steps.map(s => s.clip));

    let phase = 'INFIL', contested = false, done = false;
    const timers = [];

    // The bar runs on wall-clock time, not on steps: the mission is a timeline,
    // so the fill IS the clock. Steps only change the label and the colour.
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
        view.log(step.text, step.kind || 'status', step.t);
        // a step without a clip field leaves the pane on whatever is running
        if ('clip' in step) view.clip(step.clip);
        if (step.audio) AudioSys.play(step.audio);
        if (step.fx) { try { step.fx(view); } catch (e) { console.error('raid fx failed', e); } }
      }, step.t));
    }

    // Skipping cuts the theatre, never the result — the branch was decided
    // before the first line played, and the debrief is the same either way.
    function finish(skipped) {
      if (done) return;
      done = true;
      for (const id of timers) clearTimeout(id);
      AudioSys.cut('raidInfil');
      view.phase(1, skipped ? 'SKIPPED' : phase, false);
      view.close(skipped ? 300 : 4500);
      onDone();
    }

    timers.push(setTimeout(() => finish(false), total));
  }

  // ---- resolution ----
  function executeRaid() {
    const G = Game.G;
    if (G.over || running || G.res.specops < 1 || G.raid !== 'none') return;
    closeModal();

    // The night is decided here, before anything is drawn.
    const branch = pickBranch(G);

    G.res.specops = 0;
    G.raidThisTurn = true;
    // the insert is an act the world sees, whatever happens on the objective
    G.world = clamp(G.world - 4, 0, 100);
    lock(true);
    UI.renderAll(G);

    runMission(branch, () => {
      const events = [];
      OUTCOMES[branch](G, events);
      lock(false);
      UI.renderAll(G);
      UI.showReport('SPECIAL OPERATIONS — MISSION DEBRIEF', events, () => Game.afterAction(), { prose: true });
    });
  }

  // ---- wiring ----
  function init() {
    $('btn-confirm-raid').addEventListener('click', executeRaid);
  }

  return { init, renderPanel, odds, isrTasking, runIsrPrep, busy: () => running };
})();
