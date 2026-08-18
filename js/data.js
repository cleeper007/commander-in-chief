// ============================================================
// data.js — static game data: targets, US assets, geography refs
// ============================================================

// ---- Iranian strategic targets ----
// world: world-opinion cost per strike
// worldOnKill: world-opinion cost paid ONCE, the night the site is finished,
//          instead of per strike. The distinction is about what the world is
//          actually reacting to. Nobody abroad files a protest over the third
//          package into an oil terminal — the story is "the Americans have
//          taken Iran's oil export off the board", and that story does not
//          exist until the thing is off the board. Charging it per strike also
//          punished the player twice for a target the game itself says needs
//          several packages to finish. So the big economic aimpoints cost
//          nothing to chip at and the whole bill lands on the last hit.
// momentumOnKill: added to negotiationMomentum when the site is finished.
//          Wrecking what pays for the war is leverage at the table (see doDiplo
//          in game.js) — it does not open the door, but it helps once the
//          nuclear gate is met.
// packages: valid strike options {asset, qty, base (success), label}
// feeds:   which covert gap type a package landed here throws leads off, when
//          that is NOT simply the target's own type. Only the infrastructure
//          class uses it — nothing hides behind a bridge, but a bridge is how
//          you learn what was crossing it. See covertLead in game.js.
// depth:   how far inside Iran the target sits, which is what a strike package
//          actually costs in tanker tracks (see TANKER_COST). 1 = the Gulf
//          littoral, a short leg fighters fly unrefuelled; 2 = the interior;
//          3 = the far northwest and the Caspian, the longest legs in the
//          theater. Fighters only book tankers at depth 2+ — deep, past Abadan
//          and Nojeh; the bombers book them everywhere.
const TARGETS = [
  {
    id: 'ad-tehran', name: 'Tehran Air Defense Network', short: 'AD TEHRAN',
    type: 'airdefense', x: 417, y: 130, depth: 2,
    desc: 'Long-range SAM belt covering the capital region. Degrading it improves survivability of all non-stealth strikes.',
    world: -1,
    packages: [
      { asset: 'f35', qty: 2, base: 0.75, label: 'F-35 SEAD package — 2 sorties' },
      { asset: 'fighter', qty: 3, base: 0.70, label: 'Wild Weasel sweep — 3 F-16CM sorties, AGM-88 HARM' },
      { asset: 'cruise', qty: 3, base: 0.85, label: 'TLAM salvo — 3 cruise missiles' },
    ],
  },
  {
    id: 'ad-isfahan', name: 'Isfahan Air Defense Complex', short: 'AD ISFAHAN',
    type: 'airdefense', x: 439, y: 259, depth: 2,
    desc: 'Central SAM network screening the nuclear sites. Degrading it improves survivability of all non-stealth strikes.',
    world: -1,
    packages: [
      { asset: 'f35', qty: 2, base: 0.77, label: 'F-35 SEAD package — 2 sorties' },
      { asset: 'fighter', qty: 3, base: 0.72, label: 'Wild Weasel sweep — 3 F-16CM sorties, AGM-88 HARM' },
      { asset: 'cruise', qty: 3, base: 0.85, label: 'TLAM salvo — 3 cruise missiles' },
    ],
  },
  {
    id: 'ad-bandar', name: 'Bandar Abbas Coastal Defense', short: 'AD BANDAR',
    type: 'airdefense', x: 563, y: 449, depth: 1, label: { dy: -14 },
    desc: 'Coastal radar and SAM coverage over the Strait of Hormuz approaches.',
    world: -1,
    packages: [
      { asset: 'f35', qty: 2, base: 0.79, label: 'F-35 SEAD package — 2 sorties' },
      { asset: 'fighter', qty: 3, base: 0.74, label: 'Wild Weasel sweep — 3 F-16CM sorties, AGM-88 HARM' },
      { asset: 'cruise', qty: 3, base: 0.86, label: 'TLAM salvo — 3 cruise missiles' },
    ],
  },
  {
    id: 'natanz', name: 'Natanz Enrichment Facility', short: 'NATANZ',
    // `enrichment` is what nukeDegraded() counts — the program the war is about.
    // Arak and Bushehr NPP are type 'nuclear' and are NOT flagged: they are
    // reactors, on the list for other reasons, and destroying them has never
    // counted toward the primary objective.
    //
    // `enrichShare` is a SECOND question and must not be confused with `weight`.
    // Weight is what nukeDegraded scores a hall at — how much of the objective
    // it represents. This is how many machines are actually turning in it, which
    // is what feeds the breakout clock. The two genuinely differ: the covert
    // hall's weight is argued down to 0.5 so the declared program can still
    // reach 80% without it, and that argument says nothing whatever about how
    // much uranium it enriches. Shares are renormalised against their own sum in
    // enrichRate, so adding a fourth hall is a data-only change here too.
    type: 'nuclear', x: 441, y: 218, depth: 2, israelPriority: true, enrichment: true,
    enrichShare: 0.32,
    desc: 'Primary enrichment site. Partially buried — cruise missiles can damage surface halls but only penetrators guarantee destruction. PRIMARY OBJECTIVE.',
    // The enrichment program is the stated reason the country went to war and
    // the one thing no capital will defend out loud. Hitting it costs nothing
    // abroad; finishing it is worth a bump (see objectiveMilestones in game.js).
    world: 0,
    packages: [
      { asset: 'stealth', qty: 1, base: 0.90, label: 'B-2 mission — GBU-57 penetrators' },
      { asset: 'cruise', qty: 5, base: 0.48, label: 'Saturation TLAM strike — limited vs buried halls' },
    ],
  },
  {
    id: 'fordow', name: 'Fordow Enrichment Plant', short: 'FORDOW',
    type: 'nuclear', x: 416, y: 174, depth: 2, hardened: true, israelPriority: true, enrichment: true,
    // The survivable half of the program, and worth more of the remaining
    // capability than the surface halls at Natanz — which is the split the old
    // hardcoded enrichRate carried as 0.4/0.6 and the reason it is preserved
    // here rather than set from cascade counts. Real Fordow holds far fewer
    // machines than real Natanz; game Fordow is the one that lives through the
    // opening week, and the clock should reflect what is still turning in week
    // three rather than what was installed on night one.
    enrichShare: 0.44,
    desc: 'Enrichment halls buried under 80m of rock. ONLY a B-2 with GBU-57 penetrators has any chance. PRIMARY OBJECTIVE.',
    world: 0,
    packages: [
      { asset: 'stealth', qty: 1, base: 0.80, label: 'B-2 mission — GBU-57 penetrators (only viable option)' },
    ],
  },
  {
    id: 'irgc-hq', name: 'IRGC Command Complex — Tehran', short: 'IRGC HQ',
    type: 'command', x: 447, y: 157, depth: 2,
    desc: 'Revolutionary Guard national command node. Striking it disrupts coordination of retaliation but is highly provocative.',
    world: -2,
    packages: [
      { asset: 'cruise', qty: 2, base: 0.80, label: 'TLAM decapitation strike — 2 missiles' },
      { asset: 'f35', qty: 2, base: 0.75, label: 'F-35 precision strike — 2 sorties' },
      { asset: 'fighter', qty: 3, base: 0.70, label: 'Precision air strike — 3 F-15E sorties, GBU-31 JDAM' },
      { asset: 'heavy', qty: 2, base: 0.74, label: 'HEAVY BOMBER STRIKE — 2 B-1B sorties, JASSM' },
    ],
  },
  // ---- the covert roster ----
  // Three sites that carry weight in an aggregate, added only once those
  // aggregates were renormalised to admit them (see missileStrength and
  // navalStrength in ai.js, nukeDegraded in game.js). `weight` is each one's
  // share of its type's total; the declared roster is all weight 1.
  //
  // Every one of these is in the war from turn one. They repair, they count,
  // and they are the reason the capacity meter will not bottom out for a
  // president who never looks.
  {
    id: 'msl-covert', name: 'Concealed Missile Brigade — Semnan Corridor', short: 'MSL SEMNAN',
    type: 'missile', x: 535, y: 165, depth: 2, covert: true,
    // 0.8 rather than 1: a brigade operating out of prepared hides is a real
    // part of the missile force and a smaller part than a national base. The
    // number is load-bearing — at 0.8 it is 0.42 on missileStrength's 0..2 scale
    // when it is the last thing standing, which sits above iranBroken's 0.35
    // bar. Drop it below ~0.7 and Iran can be declared broken with an undiscovered
    // launcher force still shooting, which is the whole thing this prevents.
    weight: 0.8,
    // surfaceBy 12 — not the usual 20, for the same reason the covert hall gets
    // 8. The weight note above is explicit that this brigade sits ABOVE
    // iranBroken's bar when it is the last thing standing, which means it gates
    // the military victory exactly as much as Fordow does, and COVERT's own rule
    // is that anything gating an ending needs a deadline with room for the whole
    // remaining chain: resolve the box, task a package, miss, task it again. It
    // is not buried and needs no B-2, so it can afford four turns more runway
    // than the hall — but not eight more than the campaign has.
    surfaceBy: 12,
    leadFrom: 'missile',
    tellAfter: 'msl-shiraz',
    region: 'Semnan corridor — Dasht-e Kavir margin',
    desc: 'A brigade that never operated from a declared garrison — prepared hides and buried cabling. Firing since night one from an address CENTCOM did not have.',
    world: -2,
    packages: [
      { asset: 'f35', qty: 2, base: 0.70, label: 'F-35 strike package — 2 sorties' },
      { asset: 'fighter', qty: 3, base: 0.65, label: 'Air strike — 3 F-15E sorties, GBU-31 JDAM' },
      { asset: 'cruise', qty: 3, base: 0.72, label: 'TLAM salvo — 3 cruise missiles' },
      { asset: 'heavy', qty: 2, base: 0.70, label: 'HEAVY BOMBER STRIKE — 2 B-52H sorties, JDAM' },
    ],
  },
  {
    id: 'naval-covert', name: 'Forward Swarm Base — Abu Musa', short: 'ABU MUSA',
    type: 'naval', x: 520, y: 498, depth: 1, covert: true, label: { dy: -14 },
    // Deliberately NOT sized to gate iranBroken. navalStrength is a mean over
    // six sites, so no plausible weight puts one hidden base above the 0.5 bar —
    // forcing it would mean tightening the naval requirement to "sink literally
    // everything", which is a worse objective than the one that exists. Its job
    // is that carrier risk and the strait stay live past the point the visible
    // roster explains, which it does at any weight.
    weight: 0.8,
    leadFrom: 'naval',
    tellAfter: 'naval-bandar',
    region: 'Lower Gulf islands — Abu Musa and the Tunbs',
    desc: 'Fast-attack craft, mines and anti-ship launchers dispersed onto the disputed islands, inside the shipping lanes. Where the hulls come from after Bandar Abbas stops sailing.',
    world: -2,
    packages: [
      { asset: 'f35', qty: 2, base: 0.80, label: 'F-35 strike package — 2 sorties' },
      { asset: 'fighter', qty: 3, base: 0.75, label: 'Air strike — 3 F/A-18E sorties, GBU-32 JDAM' },
      { asset: 'cruise', qty: 2, base: 0.80, label: 'TLAM salvo — 2 cruise missiles' },
      // Sixty miles from the shipping lane and well inside the screen's reach —
      // the shortest-legged round on the board finally has something to shoot
      // at. NSM emits nothing on the way in, which against a dispersed island
      // base means the launch crews get no warning order at all.
      { asset: 'cruise', qty: 2, base: 0.77, escort: 'nsm', weapon: 'nsm',
        label: 'NSM ENGAGEMENT — 2 rounds off the escort screen' },
    ],
  },
  {
    id: 'nuc-covert', name: 'Undeclared Enrichment Hall — Kuh-e Siah', short: 'KUH-E SIAH',
    // sited out toward Yazd rather than due east of Isfahan: at the closer
    // position the box (drawn at +8,+11 from here) landed around the IRAN
    // country label and read as though the chart had circled the whole country
    type: 'nuclear', x: 545, y: 290, depth: 2, covert: true, enrichment: true,
    // A QUARTER OF THE PROGRAM, and this is the number that makes the desc below
    // true. It was written at v1.66 claiming enrichment continues here every
    // night of the war, and until v2.19 enrichRate read two hardcoded ids and
    // this hall fed the clock nothing at all: in 98.3% of the campaigns where
    // the race stopped, it stopped with this site standing at full condition.
    //
    // Deliberately well under either declared hall. It is a hedge built in a
    // hurry under shallower cover — that is already why it is not `hardened` and
    // why the saturation package exists — and a hedge is not a second Natanz.
    // What makes it matter is not its size but that it is the LAST one standing,
    // where BREAKOUT.reflow is pushing everything Tehran has left in storage.
    enrichShare: 0.24,
    // The one that reframes the campaign, and the one that needed the most care.
    // It is counted by nukeDegraded, which gates BOTH victory conditions, so:
    //
    //   weight 0.5 — the declared program (Natanz + Fordow) reaches 80% without
    //     it. High enough that Israel still stands down at ISRAEL.standDown 65
    //     and the advisors still read the program as mostly gone; short enough
    //     that the milestone, the military victory and the table all stay shut.
    //
    //   surfaceBy 8 — not the usual 20. This gates the only endings there are,
    //     so the deadline has to leave room for the whole remaining chain and
    //     not merely for the discovery: resolve the box, order the B-2 (two
    //     turns out), fly it, miss at ~20%, fly it again. Twenty would leave a
    //     hard war unwinnable through no fault of the player.
    //
    //   not `hardened` — unlike Fordow. It is a hall built in a hurry under
    //     shallower cover, which is both why it could be hidden and why the
    //     saturation option exists at all. That cruise package is the safety
    //     valve: it is bad, and it means the sole victory condition never rests
    //     on the player having exactly one airframe available.
    weight: 0.5,
    surfaceBy: 8,
    leadFrom: 'nuclear',
    tellAfter: 'natanz',
    region: 'Kuh-e Siah ridge — east of Isfahan',
    desc: 'Undeclared centrifuge halls cut into a ridge line. Enrichment has continued here every night of the war — the breakout clock was never counting only Natanz and Fordow.',
    world: 0,
    packages: [
      { asset: 'stealth', qty: 1, base: 0.80, label: 'B-2 mission — GBU-57 penetrators' },
      { asset: 'cruise', qty: 5, base: 0.42, label: 'Saturation TLAM strike — limited against the halls' },
    ],
  },
  // ---- the first covert aimpoint ----
  // Not in the folder CENTCOM opens the war with. `covert` means the site is not
  // on the plot, is not in the DOM, and cannot be planned against until the
  // intelligence apparatus earns it (see WHAT IS NOT IN THE FOLDER in game.js).
  //
  // A second command node is the right target to prove the mechanism on, and the
  // reason is arithmetic rather than fiction: every aggregate in this game reads
  // the primary by id — iranCapacity, iranBroken and the advisor recs all say
  // `find(t => t.id === 'irgc-hq')` — and nothing anywhere iterates type
  // 'command' except the map's icon switch. So this site can exist, be hidden,
  // repair and be struck without moving a single balance number. The covert
  // missile brigade and the island swarm base cannot: missileStrength() clamps at
  // Math.min(2, s) and navalStrength() divides by fleet length, so adding hidden
  // targets to either silently changes what the declared ones are worth. Those
  // land with that renormalization, not before it.
  {
    id: 'cmd-alt', name: 'Alternate National Command Post — Abyek', short: 'ALT NCP',
    // Sited far enough west of the Tehran SAM belt that the BOX clears it too:
    // the suspected-tier ellipse is drawn at a fuzzed offset from this point
    // (+7,+11 for this id), and at the original position its UNRESOLVED label
    // landed on AD TEHRAN's. The fuzz is deterministic, so this clears once and
    // stays clear — but any covert site added later has to be checked against
    // its own offset, not against its true coordinates.
    type: 'command', x: 356, y: 106, depth: 2, covert: true,
    label: { dy: -14 },
    // packages against command nodes are what turn up traces of this one: the
    // primary's destroyed comms hut is where you learn what it was talking to
    leadFrom: 'command',
    // and it starts giving itself away once the primary is rubble, because the
    // war does not stop being coordinated and something is doing the coordinating
    tellAfter: 'irgc-hq',
    region: 'Alborz foothills — Qazvin corridor',
    desc: 'Hardened continuity-of-government site in the Alborz, built to run the war after Tehran stops answering. Killing it takes Iranian coordination away for good.',
    world: -2,
    packages: [
      { asset: 'stealth', qty: 1, base: 0.82, label: 'B-2 mission — GBU-57 penetrators' },
      { asset: 'f35', qty: 2, base: 0.66, label: 'F-35 precision strike — 2 sorties' },
      { asset: 'cruise', qty: 3, base: 0.62, label: 'TLAM salvo — 3 missiles (partially buried)' },
      { asset: 'heavy', qty: 2, base: 0.68, label: 'HEAVY BOMBER STRIKE — 2 B-1B sorties, JASSM' },
    ],
  },
  {
    id: 'msl-kermanshah', name: 'Kermanshah Missile Base', short: 'MSL KERMANSHAH',
    // stays below, but pulled left so the long label clears Khorramabad's icon
    // down-right of it; above would put it into Nojeh AB
    type: 'missile', x: 285, y: 196, depth: 2, israelPriority: true,
    label: { dx: 8, dy: 20, anchor: 'end' },
    desc: 'Ballistic missile brigade in range of US bases in Iraq. Destroying it reduces the weight of Iranian missile retaliation.',
    world: -2,
    packages: [
      { asset: 'f35', qty: 2, base: 0.75, label: 'F-35 strike package — 2 sorties' },
      { asset: 'fighter', qty: 3, base: 0.70, label: 'Air strike — 3 F-15E sorties, GBU-31 JDAM' },
      { asset: 'cruise', qty: 3, base: 0.80, label: 'TLAM salvo — 3 cruise missiles' },
      { asset: 'heavy', qty: 2, base: 0.74, label: 'HEAVY BOMBER STRIKE — 2 B-52H sorties, JDAM' },
    ],
  },
  {
    id: 'msl-shiraz', name: 'Shiraz Missile Base', short: 'MSL SHIRAZ',
    type: 'missile', x: 469, y: 374, depth: 1,
    desc: 'Missile brigade covering the Gulf littoral and US bases in Qatar/UAE. Destroying it reduces Iranian retaliation weight.',
    world: -2,
    packages: [
      { asset: 'f35', qty: 2, base: 0.77, label: 'F-35 strike package — 2 sorties' },
      { asset: 'fighter', qty: 3, base: 0.72, label: 'Air strike — 3 F-15E sorties, GBU-31 JDAM' },
      { asset: 'cruise', qty: 3, base: 0.80, label: 'TLAM salvo — 3 cruise missiles' },
      { asset: 'heavy', qty: 2, base: 0.76, label: 'HEAVY BOMBER STRIKE — 2 B-52H sorties, JDAM' },
    ],
  },
  {
    id: 'naval-bandar', name: 'Bandar Abbas Naval Base', short: 'NAV BANDAR',
    type: 'naval', x: 590, y: 467, depth: 1,
    desc: 'Home port of the fast-attack craft and midget submarines threatening Hormuz shipping. Key to keeping the Strait open.',
    world: -2,
    packages: [
      { asset: 'f35', qty: 2, base: 0.81, label: 'F-35 strike package — 2 sorties' },
      { asset: 'fighter', qty: 3, base: 0.76, label: 'Air strike — 3 F/A-18E sorties, GBU-32 JDAM' },
      // A naval base is piers, cranes and fuel — but it is also whatever is
      // alongside them, and that is the one thing a coordinate-guided weapon
      // cannot pick out. SLAM-ER's man in the loop can: this is the package that
      // puts the warhead into the hull tied up at berth four rather than into
      // the concrete beside it.
      { asset: 'fighter', qty: 2, base: 0.79, weapon: 'slamer',
        label: 'SLAM-ER STRIKE — 2 F/A-18E sorties, AGM-84K onto the berths' },
      { asset: 'cruise', qty: 2, base: 0.82, label: 'TLAM salvo — 2 cruise missiles' },
      { asset: 'heavy', qty: 2, base: 0.80, label: 'HEAVY BOMBER STRIKE — 2 B-1B sorties, naval mining and JDAM' },
    ],
  },
  {
    id: 'naval-bushehr', name: 'Bushehr Naval Base', short: 'NAV BUSHEHR',
    type: 'naval', x: 411, y: 398, depth: 1, label: { dx: -13, dy: 4, anchor: 'end' },
    desc: 'IRGC-Navy swarm-boat base in the central Gulf. Threatens the carrier strike group.',
    world: -2,
    packages: [
      { asset: 'f35', qty: 2, base: 0.81, label: 'F-35 strike package — 2 sorties' },
      { asset: 'fighter', qty: 3, base: 0.76, label: 'Air strike — 3 F/A-18E sorties, GBU-32 JDAM' },
      { asset: 'fighter', qty: 2, base: 0.79, weapon: 'slamer',
        label: 'SLAM-ER STRIKE — 2 F/A-18E sorties, AGM-84K onto the berths' },
      { asset: 'cruise', qty: 2, base: 0.82, label: 'TLAM salvo — 2 cruise missiles' },
      { asset: 'heavy', qty: 2, base: 0.80, label: 'HEAVY BOMBER STRIKE — 2 B-1B sorties, naval mining and JDAM' },
    ],
  },
  {
    id: 'ship-mahdavi', name: 'IRIS Shahid Mahdavi — Gulf of Oman', short: 'MAHDAVI',
    type: 'ship', x: 703, y: 586, depth: 1,
    desc: 'IRGC-Navy forward base ship outside the Strait, carrying anti-ship missiles and drones — the closest Iranian shooter to the carrier box. A hull at sea: one weapon that finds her ends her, and nothing repairs afterwards.',
    world: -2,
    // A converted container ship with launchers bolted to the deck: enormous,
    // slow, no self-defense worth the name, and sitting in blue water where
    // everything in the inventory can reach her. So this is the target that
    // shows the player the whole maritime menu at once — every round works, and
    // the question is only which magazine they want to spend.
    packages: [
      { asset: 'f35', qty: 2, base: 0.85, weapon: 'jsm',
        label: 'F-35C MARITIME STRIKE — 2 sorties, Joint Strike Missile' },
      { asset: 'fighter', qty: 2, base: 0.84, weapon: 'lrasm',
        label: 'LRASM SHOOT — 2 F/A-18E sorties, 8 AGM-158C' },
      { asset: 'fighter', qty: 2, base: 0.76, weapon: 'harpoon',
        label: 'HARPOON STRIKE — 2 F/A-18E sorties, 8 AGM-84D' },
      // Twenty-four LRASM off a two-ship of Lancers is the largest anti-ship
      // salvo the United States can generate from anything, and against one
      // unescorted hull it is overwhelming to the point of absurdity. Priced
      // accordingly: it wants air superiority and it costs thirteen weapons a
      // sortie off the ledger on hard.
      { asset: 'heavy', qty: 2, base: 0.92, weapon: 'lrasm',
        label: 'HEAVY BOMBER SHOOT — 2 B-1B sorties, 24 AGM-158C each' },
      { asset: 'cruise', qty: 2, base: 0.84, weapon: 'mst',
        label: 'MARITIME STRIKE TOMAHAWK — 2 RGM-109E Block Va' },
      // The trade this whole class exists for. She is inside the screen's reach
      // and an SM-6 arrives faster than she can react to it — but the round is
      // an interceptor, the warhead is built for aircraft, and it comes out of
      // the cells covering Al Udeid. High odds of a hit, and the bill is the
      // umbrella.
      { asset: 'cruise', qty: 2, base: 0.72, escort: 'sm6', weapon: 'sm6',
        label: 'SM-6 SURFACE ENGAGEMENT — 2 RIM-174 off the escort screen' },
      // The cheapest shot in the game: one weapon out of the boat's own tubes,
      // no aircrew, nothing on anyone's radar, nothing off the theater magazine.
      // She is already trailing the hull, so she shoots tonight like everyone
      // else — the transit turn was a price the player paid for a shot they had
      // no other reason not to take, which made it a tax rather than a tradeoff.
      { asset: 'cruise', qty: 1, base: 0.88, sub: true, weapon: 'mk48',
        label: 'SUBMARINE ATTACK — 1 Mk 48 ADCAP heavyweight torpedo' },
    ],
  },
  {
    id: 'ship-caspian', name: 'IRGC Caspian Flotilla — Bandar-e Anzali', short: 'CASPIAN FLOT',
    type: 'ship', x: 392, y: 72, depth: 3,
    desc: 'Missile craft in the Caspian, 900 nm from the fight but a live hull all the same. A closed sea with Moscow on the far shore: heavy diplomatic cost, no submarine reach, aircraft and cruise missiles only. Anzali is also the Iranian end of the Astrakhan barge traffic — sinking it slows Russian spares for the rest of the war.',
    // Was -8, which priced a handful of missile craft like an oil terminal and
    // made the flotilla a target nobody sane ever took. It is a real hull in a
    // sea Moscow watches, so it still costs more than any other warship on the
    // list — but it is warships, and warships are what this war is about.
    world: -3,
    // The one naval target with no maritime-strike menu at all, and the reason
    // is geography rather than balance. The escort screen's rounds are 100–200
    // nm weapons fired from a deck in the Gulf of Oman, which is 900 nm and two
    // countries away; Toledo cannot reach a closed sea at all. What is left is
    // what can fly there — and the craft are alongside at Anzali, so the round
    // that works is a LAND-attack weapon aimed at a berth, not a maritime seeker
    // hunting a hull. This is the one place where "TLAM salvo" was always the
    // right sentence.
    packages: [
      { asset: 'f35', qty: 2, base: 0.67, weapon: 'jsm',
        label: 'F-35 MARITIME STRIKE — 2 sorties, JSM (deep, the whole tanker plan)' },
      { asset: 'fighter', qty: 2, base: 0.62,
        label: 'Air strike — 2 F-15E sorties, JSOW and JDAM onto the berths (deep, unrefuelled leg)' },
      { asset: 'cruise', qty: 3, base: 0.76,
        label: 'TLAM SALVO — 3 RGM-109E land-attack (they are alongside, not underway)' },
    ],
  },
  {
    id: 'tabriz-ab', name: 'Tabriz Air Base', short: 'TABRIZ AB',
    type: 'airbase', x: 260, y: 54, depth: 3,
    desc: 'MiG-29 and F-5 squadrons covering the northwest, and the dispersal field aircraft are flown to when the interior is hit. Far from the Gulf: a long way in and back out.',
    world: -2,
    packages: [
      { asset: 'f35', qty: 2, base: 0.71, label: 'F-35 strike package — 2 sorties (deep)' },
      { asset: 'fighter', qty: 3, base: 0.66, label: 'Air strike — 3 F-15E sorties (deep, unrefuelled leg)' },
      { asset: 'cruise', qty: 3, base: 0.80, label: 'TLAM salvo — 3 cruise missiles' },
      { asset: 'heavy', qty: 2, base: 0.70, label: 'HEAVY BOMBER STRIKE — 2 B-52H sorties, runway and ramp' },
    ],
  },
  {
    id: 'kharg', name: 'Kharg Island Oil Terminal', short: 'KHARG OIL',
    type: 'oil', x: 394, y: 387, depth: 1, label: { dy: -14 },
    desc: 'Handles ~90% of Iranian crude exports. Crippling it strangles Tehran\'s economy — and spikes global oil prices. Heavy diplomatic cost paid the night the terminal stops loading, not before.',
    world: 0, worldOnKill: -8, momentumOnKill: 0.08,
    packages: [
      { asset: 'cruise', qty: 3, base: 0.86, label: 'TLAM salvo — 3 cruise missiles' },
      { asset: 'f35', qty: 2, base: 0.77, label: 'F-35 strike package — 2 sorties' },
      { asset: 'fighter', qty: 3, base: 0.72, label: 'Air strike — 3 F-15E sorties, GBU-31 JDAM' },
      { asset: 'heavy', qty: 2, base: 0.76, label: 'HEAVY BOMBER STRIKE — 2 B-52H sorties, loading berths and tank farm' },
    ],
  },
  {
    id: 'abadan', name: 'Abadan Refinery', short: 'ABADAN REF',
    type: 'oil', x: 327, y: 346, depth: 1,
    desc: 'Iran\'s largest domestic fuel refinery. An economic pressure target: the diplomatic bill comes due when the refinery train stops, not for the craters along the way.',
    world: 0, worldOnKill: -8, momentumOnKill: 0.06,
    packages: [
      { asset: 'cruise', qty: 3, base: 0.86, label: 'TLAM salvo — 3 cruise missiles' },
      { asset: 'f35', qty: 2, base: 0.77, label: 'F-35 strike package — 2 sorties' },
      { asset: 'fighter', qty: 3, base: 0.72, label: 'Air strike — 3 F-15E sorties, GBU-31 JDAM' },
      { asset: 'heavy', qty: 2, base: 0.76, label: 'HEAVY BOMBER STRIKE — 2 B-52H sorties, the whole refinery train' },
    ],
  },
  {
    id: 'arak', name: 'Arak Heavy-Water Reactor', short: 'ARAK IR-40',
    type: 'nuclear', x: 363, y: 199, depth: 2, hardened: true, israelPriority: true,
    desc: 'The plutonium road to a bomb — a heavy-water reactor breeding material no centrifuge produces. Cruise missiles scar the hall; only a penetrator reaches the core. Killing it closes the second path to a weapon.',
    // Unfuelled and unambiguously weapons-related — the same free pass as the
    // enrichment halls. Bushehr NPP below is the exception that proves it.
    world: 0,
    packages: [
      { asset: 'stealth', qty: 1, base: 0.86, label: 'B-2 mission — GBU-57 penetrator into the reactor hall' },
      { asset: 'f35', qty: 2, base: 0.60, label: 'F-35 strike — 2 sorties (limited vs the hardened core)' },
      { asset: 'cruise', qty: 4, base: 0.55, label: 'Saturation TLAM strike — surface plant only' },
    ],
  },
  {
    id: 'bushehr-npp', name: 'Bushehr Nuclear Power Plant', short: 'BUSHEHR NPP',
    type: 'nuclear', x: 430, y: 415, depth: 1,
    desc: 'A live civilian reactor with Russian technicians on site. It makes no bomb fuel — cracking a fuelled core seeds a plume across the Gulf and kills Russians. The most diplomatically ruinous aimpoint in Iran, and the least worth it.',
    // The one nuclear-typed site that still costs: it is a civil power plant
    // with foreign nationals in it, not a weapons program. Cratering the
    // switchyard is survivable abroad; killing the plant is the plume, and the
    // plume is the whole bill. Heavier than the oil targets, and it always was.
    world: 0, worldOnKill: -10, momentumOnKill: 0.04,
    packages: [
      { asset: 'cruise', qty: 3, base: 0.80, label: 'TLAM salvo — switchyard and auxiliaries, not the core' },
      { asset: 'f35', qty: 2, base: 0.75, label: 'F-35 strike package — 2 sorties' },
      { asset: 'fighter', qty: 3, base: 0.70, label: 'Air strike — 3 F-15E sorties, GBU-31 JDAM' },
    ],
  },
  {
    id: 'naval-chabahar', name: 'Chabahar Naval Base — Konarak', short: 'NAV CHABAHAR',
    type: 'naval', x: 680, y: 540, depth: 1, label: { dy: -14 },
    desc: 'Iran\'s deep-water port on the Gulf of Oman — where the surface fleet runs when the Gulf ports are held at risk, and the one base that reaches blue water. Far east, but inside the carrier\'s reach.',
    world: -2,
    packages: [
      { asset: 'f35', qty: 2, base: 0.80, label: 'F-35 strike package — 2 sorties' },
      { asset: 'fighter', qty: 2, base: 0.75, label: 'Air strike — 2 F/A-18E sorties, GBU-32 JDAM' },
      { asset: 'fighter', qty: 2, base: 0.78, weapon: 'slamer',
        label: 'SLAM-ER STRIKE — 2 F/A-18E sorties, AGM-84K onto the berths' },
      { asset: 'cruise', qty: 2, base: 0.82, label: 'TLAM salvo — 2 cruise missiles' },
      { asset: 'heavy', qty: 2, base: 0.79, label: 'HEAVY BOMBER STRIKE — 2 B-1B sorties, naval mining and JDAM' },
    ],
  },
  {
    id: 'nojeh-ab', name: 'Shahid Nojeh Air Base — Hamadan', short: 'NOJEH AB',
    type: 'airbase', x: 327, y: 159, depth: 2,
    desc: 'F-4 and Su-24 squadrons covering the approaches from Iraq, and a primary dispersal field for aircraft flown out of the interior. Cratering the runways grounds the wing until the fill sets.',
    world: -2,
    packages: [
      { asset: 'f35', qty: 2, base: 0.74, label: 'F-35 strike package — 2 sorties' },
      { asset: 'fighter', qty: 3, base: 0.69, label: 'Air strike — 3 F-15E sorties, GBU-31 JDAM' },
      { asset: 'cruise', qty: 3, base: 0.80, label: 'TLAM salvo — 3 cruise missiles' },
      { asset: 'heavy', qty: 2, base: 0.72, label: 'HEAVY BOMBER STRIKE — 2 B-52H sorties, runway and ramp' },
    ],
  },
  {
    id: 'msl-khorramabad', name: 'Khorramabad Missile Base', short: 'MSL KHORRAMABAD',
    type: 'missile', x: 321, y: 221, depth: 2, israelPriority: true,
    desc: 'An underground "missile city" in the Zagros, ranging every US base in Iraq and the northern Gulf. Only the tunnel portals can be hit, which buries launchers rather than destroying them. Reduces the weight of Iranian retaliation.',
    world: -2,
    packages: [
      { asset: 'f35', qty: 2, base: 0.72, label: 'F-35 strike package — 2 sorties (tunnel portals)' },
      { asset: 'fighter', qty: 3, base: 0.67, label: 'Air strike — 3 F-15E sorties, GBU-31 JDAM' },
      { asset: 'cruise', qty: 3, base: 0.78, label: 'TLAM salvo — 3 cruise missiles' },
      { asset: 'heavy', qty: 2, base: 0.72, label: 'HEAVY BOMBER STRIKE — 2 B-52H sorties, portals and support area' },
    ],
  },

  // ============================================================
  // CIVIL INFRASTRUCTURE — THE DUAL-USE CLASS
  // ------------------------------------------------------------
  // The first aimpoints on this list where the militarily correct answer and
  // the morally correct answer are not the same answer. Everything above is
  // either unambiguously military — a SAM battery, a missile brigade, a
  // frigate — or unambiguously ruinous, which is Bushehr NPP and is priced to
  // be refused. These are neither. A rail bridge carries reload rounds to the
  // brigades and it carries the city's water main. A power station runs the
  // enrichment spur and it runs the dialysis ward. Both statements are true at
  // once, both are true of the same building, and there is a live body of law
  // and sixty years of argument about where the line sits. The 1991 Iraqi
  // electrical campaign is the case study and it is still contested.
  //
  // That tension IS the feature. Nothing here resolves it for the player: the
  // `desc` strings state the military value and the human cost in the same
  // breath and stop, SecState Okafor argues one side of it and SecDef
  // Whitfield the other (see advise() in ai.js), and the decision stays with
  // the person it belongs to.
  //
  // WHAT THEY DO, in three parts, none of which needed a new system:
  //
  //   1. They cost abroad, through the existing `world` and `worldOnKill`
  //      fields, and HOW that bill is split was the one number here that had to
  //      be measured rather than argued. The obvious pricing is a heavy
  //      per-strike charge — every span dropped is its own story — and it is
  //      wrong, because this class takes two to three packages a target across
  //      four targets, so a per-strike charge is paid eight to twelve times.
  //      Measured by playing the real turn loop — twenty-five campaigns
  //      spending one package a night here, against twenty-five identical ones
  //      that never touched the class — a -3 charge roughly doubled how often a
  //      war fell below the Gulf basing tier AND left it there: the median such
  //      campaign was still under the tier when it ended, and the runs below it
  //      lasted turns rather than a turn. That is not a price, it is a refusal
  //      written to look like a choice, because losing the Gulf ramps takes
  //      every deep target off the list at once.
  //
  //      So the per-package charge is -1 — the same as a SAM battery, the
  //      cheapest thing on the folder — and the real bill lands on
  //      `worldOnKill`, where the oil terminals already put theirs and for the
  //      same reason. Nobody abroad files a protest over a cratered approach
  //      ramp. They file it over a crossing that is out and a province that has
  //      been dark for a week. Rail pays -4 there and the generating plants pay
  //      -8, the same one-time bill as Kharg, because a stopped refinery and a
  //      dark province are the same kind of photograph.
  //
  //      Re-measured at -1 the same way, the tier still gets crossed more often
  //      than in the control — it should, it is a real cost — but the longest
  //      unbroken run beneath it is under a single turn in both arms. A dip the
  //      drift pulls back, not a collapse the campaign never returns from.
  //
  //      Which leaves this class the CHEAPEST thing on the folder to chip at
  //      and the most expensive thing on it to finish. That asymmetry is the
  //      whole design, and it is precisely what SecState warns about: the bill
  //      arrives all at once, so a president can be most of the way into a
  //      campaign they never decided to fight. Re-measure before retuning any
  //      of these four numbers — the spreadsheet version of this question gives
  //      the wrong answer, because most of what moves standing abroad over
  //      thirty turns is Jerusalem and the basing tiers, not the target list.
  //
  //   2. They break Iran's will through `momentumOnKill`, which feeds
  //      negotiationMomentum and therefore the odds Tehran signs (see doDiplo).
  //      This is the honest reading of what a counter-infrastructure campaign
  //      is actually for. It does not open the door — the nuclear gate still
  //      does that — it changes what is on the other side of it.
  //
  //   3. They break Iran's ability to put things back together, which is the
  //      one genuinely new mechanic and lives in INFRA_RESUPPLY below. Measured
  //      against identical counterforce play — same packages, same aimpoints,
  //      differing only in whether the class is standing — it holds mean
  //      surviving SAM coverage roughly a fifth lower across a campaign. That
  //      is the intended size: a second, indirect way to suppress air defense,
  //      and never a substitute for going back to the site.
  //
  // DELIBERATELY NOT COVERT, and the comment is here because the reflex after
  // v1.63 is to reach for the newest system. A rail bridge is the least
  // concealable object a state owns. The imagery has existed for decades,
  // every crossing of the Karun is in an atlas, and no collection deck is
  // required to find a two-thousand-megawatt power station. The four covert
  // sites are a dispersal brigade, an island swarm base, an undeclared
  // enrichment hall and a continuity-of-government bunker — things a country
  // actually hides. Filling the folder with gaps that have no intelligence
  // story behind them would cheapen the tier that took v1.63 to build.
  //
  // What they are instead is a lead SOURCE, via `feeds`. Channel 2 of
  // discovery is leads thrown off by strikes on RELATED targets, and breaking
  // a line is exactly how that works in life: you drop the span, you watch
  // what moves to repair it and what re-routes around it, and you learn where
  // the thing on the far end was. Each of the four feeds a different gap, and
  // the mapping is geographic rather than decorative — the Khuzestan
  // crossings supply the western brigades, the Kerman trunk line supplies the
  // fleet, the central grid runs the enrichment belt, the northern grid runs
  // the Alborz. So an infrastructure campaign and a counterforce campaign come
  // out of the same thirty turns holding different intelligence pictures,
  // which is the point: this class is not four expensive buildings, it is a
  // different way to fight the war.
  //
  // This turned out to be the biggest of the three, which was not obvious in
  // advance. Across twenty-five campaigns a president spending one package a
  // night here resolved close to twice as many covert sites as one who never
  // touched the class, and finished with the enrichment program several points
  // further gone — because the undeclared hall is one of the four gaps this
  // feeds, and a counterforce campaign only ever gets leads on the types it is
  // already bombing. The gaps such a campaign is worst placed to find are
  // exactly the ones it never hears about. This is the way in.
  // ============================================================
  {
    id: 'rail-karun', name: 'Karun River Crossings — Ahvaz', short: 'KARUN XINGS',
    // Ahvaz, Khuzestan: the Trans-Iranian Railway's crossing of the Karun and
    // the road bridges beside it. North of Abadan and well clear of it on the
    // plot; the nearest icon is 40 units away, wider than any pair on the
    // Bushehr coast already ships with.
    type: 'infra', x: 339, y: 307, depth: 1,
    // the western brigades — Kermanshah, Khorramabad — are supplied through
    // Khuzestan, and what moves to keep them supplied is what gives away the
    // one nobody has found
    feeds: 'missile',
    desc: 'The Trans-Iranian Railway where it crosses the Karun. Everything the western brigades are resupplied with crosses here; the detour costs four days. The same spans carry Ahvaz\'s water mains, and a city of a million drinks from the far end of them. Cheap to drop, and Iranian engineers rebuild bridges fast.',
    // -1 a package — a cratered approach is not news anywhere — and the bill on
    // the night the crossing is actually out. See the pricing note above the
    // class: a heavy per-strike charge here is paid three times over per target
    // and costs the Gulf ramps outright.
    world: -1, worldOnKill: -4, momentumOnKill: 0.05,
    packages: [
      { asset: 'f35', qty: 2, base: 0.82, label: 'F-35 strike package — 2 sorties, the rail spans' },
      { asset: 'fighter', qty: 3, base: 0.80, label: 'Air strike — 3 F-15E sorties, spans and approaches' },
      { asset: 'cruise', qty: 3, base: 0.84, label: 'TLAM salvo — 3 cruise missiles' },
      { asset: 'heavy', qty: 2, base: 0.84, label: 'HEAVY BOMBER STRIKE — 2 B-52H sorties, the whole crossing' },
    ],
  },
  {
    id: 'rail-sirjan', name: 'Sirjan Rail Junction — Kerman', short: 'SIRJAN JCT',
    // where the Bandar Abbas trunk line turns inland for Kerman and Yazd.
    // Open country: 70 units to the nearest icon and clear of every covert box.
    type: 'infra', x: 571, y: 379, depth: 2,
    // mines, torpedo bodies and anti-ship rounds come up this line from the
    // deep-water port, and the traffic that re-routes when it is cut is how
    // the island base stops being invisible
    feeds: 'naval',
    desc: 'The only rail artery between Bandar Abbas and everything north of it. Mines, torpedoes and anti-ship rounds move up this line — so does the grain feeding three provinces. Open desert, undefended: the cheapest package on the list.',
    world: -1, worldOnKill: -4, momentumOnKill: 0.05,
    packages: [
      { asset: 'f35', qty: 2, base: 0.83, label: 'F-35 strike package — 2 sorties, yards and depot' },
      { asset: 'fighter', qty: 3, base: 0.81, label: 'Air strike — 3 F-15E sorties, GBU-31 JDAM' },
      { asset: 'cruise', qty: 3, base: 0.85, label: 'TLAM salvo — 3 cruise missiles' },
      { asset: 'heavy', qty: 2, base: 0.85, label: 'HEAVY BOMBER STRIKE — 2 B-52H sorties, the whole junction' },
    ],
  },
  {
    id: 'power-yazd', name: 'Shahid Mofatteh Power Station — Yazd', short: 'YAZD POWER',
    // on the Isfahan–Yazd road, northwest of the city where the plant actually
    // sits. Sited 41 units off Kuh-e Siah and clear of that site's suspected
    // box at (553,301) — checked against the fuzzed position, not the true one.
    // label above the icon: centred, it grazed the east side of Kuh-e Siah's
    // UNRESOLVED box, which is drawn at a fuzzed offset and so does not move
    // when that site is finally resolved
    type: 'infra', x: 505, y: 280, depth: 2, label: { dy: -14 },
    // the covert hall's own desc says it is "fed by a power spur that goes
    // nowhere else". This is where that spur comes from, and cutting it is how
    // the analysts find out the spur exists.
    feeds: 'nuclear',
    energy: true,
    desc: 'The eastern anchor of the central grid, including the spur that runs to the enrichment belt. The switchyard is the whole plant — foreign-built transformers standing in the open, unreplaceable. Burn them and generation here is finished for the war. So is the province: the water pumps stop, and it is July.',
    // The same one-time bill as Kharg, and deliberately: a stopped refinery and
    // a dark province are the same kind of photograph, and neither of them is
    // news until it happens.
    world: -1, worldOnKill: -8, momentumOnKill: 0.06,
    packages: [
      { asset: 'f35', qty: 2, base: 0.84, label: 'F-35 strike package — 2 sorties, the switchyard' },
      { asset: 'fighter', qty: 3, base: 0.82, label: 'Air strike — 3 F-15E sorties, GBU-31 JDAM' },
      { asset: 'cruise', qty: 3, base: 0.86, label: 'TLAM salvo — 3 cruise missiles' },
      { asset: 'heavy', qty: 2, base: 0.86, label: 'HEAVY BOMBER STRIKE — 2 B-52H sorties, switchyard and turbine hall' },
    ],
  },
  {
    id: 'power-neka', name: 'Shahid Salimi Power Station — Neka', short: 'NEKA POWER',
    // Mazandaran, on the Caspian shore. Walked ~25 units west of the true plant
    // to clear the MSL SEMNAN suspected box at (548,149) — that box is drawn at
    // a fuzzed offset and it and this label would otherwise sit on each other.
    // Still inside the right province and on the right coast.
    // and above the icon for the same reason: the centred label sat inside the
    // vertical band of MSL SEMNAN's box
    type: 'infra', x: 512, y: 116, depth: 3, label: { dy: -14 },
    // the northern grid crosses the Alborz into the capital region, and a
    // continuity bunker in the Qazvin corridor that has to start its own
    // generators is a continuity bunker that starts radiating
    feeds: 'command',
    energy: true,
    desc: 'Iran\'s largest thermal plant, carrying the northern grid over the Alborz into Tehran. Take it down and the capital runs on what the south can push north, which is not enough. The longest leg in the theater, on the shore Moscow watches — and below it a town of forty thousand that exists because the plant does.',
    world: -1, worldOnKill: -8, momentumOnKill: 0.06,
    packages: [
      { asset: 'f35', qty: 2, base: 0.72, label: 'F-35 strike package — 2 sorties (deep, the whole tanker plan)' },
      { asset: 'fighter', qty: 3, base: 0.68, label: 'Air strike — 3 F-15E sorties (deep, unrefuelled leg)' },
      { asset: 'cruise', qty: 3, base: 0.82, label: 'TLAM salvo — 3 cruise missiles' },
      { asset: 'heavy', qty: 2, base: 0.80, label: 'HEAVY BOMBER STRIKE — 2 B-52H sorties, switchyard and boiler house' },
    ],
  },

  // ---- dispersed missile brigades (TELs) ----
  // These are not on the map when the war opens and they cannot be planned
  // against. Flattening a missile base does not kill the brigade — it kills the
  // garrison and the sheds, and the transporter-erector-launchers that were
  // always the point drive out into the country and keep shooting. They appear
  // only when a base is destroyed (dispersal), and they can only be struck once
  // ISR has actually found them. Left alone, they move again and go dark.
  //
  // This is why killing both missile bases does not end the missile war: the
  // strength that leaves a base mostly survives it. See DISPERSAL below.
  {
    id: 'tel-west', name: 'Dispersed TEL Group — Zagros Foothills', short: 'TEL WEST',
    type: 'tel', x: 330, y: 245, depth: 2, dispersal: true,
    desc: 'Launchers hiding in culverts and road tunnels in the western highlands. They shoot and move inside fifteen minutes — find them tonight and kill them tonight, or find them again next week.',
    world: -1,
    packages: [
      { asset: 'f35', qty: 2, base: 0.73, label: 'Armed reconnaissance — 2 F-35 sorties' },
      { asset: 'fighter', qty: 2, base: 0.68, label: 'Armed reconnaissance — 2 F-16CM sorties, GBU-12' },
      { asset: 'cruise', qty: 2, base: 0.58, label: 'TLAM salvo — 2 missiles (they will have moved)' },
    ],
  },
  {
    id: 'tel-central', name: 'Dispersed TEL Group — Central Plateau', short: 'TEL CENTRAL',
    type: 'tel', x: 470, y: 285, depth: 2, dispersal: true,
    desc: 'The strategic reserve, dispersed into the desert interior — hardened shelters cut into rock, and hides the IRGC prepared years ago for exactly this. The furthest inland of the launcher groups and the hardest to hold a fix on.',
    world: -1,
    packages: [
      { asset: 'f35', qty: 2, base: 0.71, label: 'Armed reconnaissance — 2 F-35 sorties' },
      { asset: 'fighter', qty: 2, base: 0.66, label: 'Armed reconnaissance — 2 F-16CM sorties, GBU-12' },
      { asset: 'cruise', qty: 2, base: 0.56, label: 'TLAM salvo — 2 missiles (they will have moved)' },
    ],
  },
  {
    id: 'tel-south', name: 'Dispersed TEL Group — Fars Highlands', short: 'TEL SOUTH',
    type: 'tel', x: 432, y: 340, depth: 1, dispersal: true,
    desc: 'Launchers scattered through the valleys north of the Gulf littoral, ranging every American base on the Arabian side. Close enough to reach quickly, mobile enough that quickly is the only way it works.',
    world: -1,
    packages: [
      { asset: 'f35', qty: 2, base: 0.75, label: 'Armed reconnaissance — 2 F-35 sorties' },
      { asset: 'fighter', qty: 2, base: 0.70, label: 'Armed reconnaissance — 2 F-16CM sorties, GBU-12' },
      { asset: 'cruise', qty: 2, base: 0.60, label: 'TLAM salvo — 2 missiles (they will have moved)' },
    ],
  },

  // ============================================================
  // THE SORTIE — three hulls that are not at sea on night one
  // ------------------------------------------------------------
  // Released together on JIPTL.sortieTurn (see below), not drip-fed with the
  // rest of the list. The IRIN does not surge its surface force the hour the
  // first TLAM lands; it waits to see what kind of war this is, and then it
  // sails. Making that one event rather than three arrivals is the point — the
  // player should get a night where the Iranian navy visibly puts to sea, not
  // three shrugs on three different turns.
  //
  // WEIGHTS. These are 0.4–0.5 rather than the 1.0 every declared naval site
  // carries, and the reason is the victory gate. navalStrength() is a weighted
  // mean, so three full-weight hulls would take the roster from 5.8 to 8.8 and
  // quietly demand two more sites destroyed for the same `iranBroken` bar — on
  // the component that is ALREADY the binding one (see the 0.5→0.8 note in
  // game.js, and the ninety campaigns where the three gates never aligned).
  // At 0.4–0.5 the gate moves by about one extra site, which is a fair price
  // for three more hulls and not a silent re-tuning of the win condition.
  {
    id: 'ship-dena', name: 'IRIS Dena — Moudge-class frigate', short: 'DENA',
    type: 'ship', x: 570, y: 520, depth: 1, weight: 0.5,
    desc: 'The only Iranian surface combatant that looks like a warship to a targeteer — anti-ship missiles, a helicopter deck, a practiced crew. A hull at sea: one weapon that finds her ends her, and nothing repairs afterwards.',
    world: -2,
    // The only target on the board that fights the weapon rather than just
    // absorbing it. Dena has a search radar, an EW suite and a chaff fit, which
    // is what separates the rounds here: LRASM does its own discrimination and
    // does not care what her picture looks like, while a Harpoon's active seeker
    // is exactly the thing a decoy spread is built to fool. Eight points of
    // difference between those two lines is the entire argument for buying the
    // expensive missile, and it is the one place on the board where the player
    // can see it.
    packages: [
      { asset: 'f35', qty: 2, base: 0.86, weapon: 'jsm',
        label: 'F-35C MARITIME STRIKE — 2 sorties, Joint Strike Missile' },
      { asset: 'fighter', qty: 2, base: 0.85, weapon: 'lrasm',
        label: 'LRASM SHOOT — 2 F/A-18E sorties, 8 AGM-158C' },
      { asset: 'fighter', qty: 2, base: 0.71, weapon: 'harpoon',
        label: 'HARPOON STRIKE — 2 F/A-18E sorties, 8 AGM-84D (she has a decoy fit)' },
      { asset: 'cruise', qty: 2, base: 0.83, weapon: 'mst',
        label: 'MARITIME STRIKE TOMAHAWK — 2 RGM-109E Block Va' },
      { asset: 'cruise', qty: 2, base: 0.70, escort: 'sm6', weapon: 'sm6',
        label: 'SM-6 SURFACE ENGAGEMENT — 2 RIM-174 off the escort screen' },
      { asset: 'cruise', qty: 1, base: 0.88, sub: true, weapon: 'mk48',
        label: 'SUBMARINE ATTACK — 1 Mk 48 ADCAP heavyweight torpedo' },
    ],
  },
  {
    id: 'ship-tareq', name: 'IRIS Tareq — Kilo-class submarine', short: 'TAREQ (SSK)',
    // Out in the Gulf of Oman rather than up in the Strait: at the obvious
    // position she plotted 31 map units from Toledo, which is inside the 44px
    // hit disc at every zoom (see syncHitDiscs) and put the Iranian submarine
    // visually on top of the American one.
    type: 'ship', x: 660, y: 600, depth: 1, weight: 0.5,
    desc: 'A Russian-built diesel boat, quiet on the battery and the one Iranian platform that can reach the carrier unseen. Off the pier she is an ASW problem — and the answer to a submarine is another submarine.',
    world: -2,
    // THE TARGET WITH NO ANTI-SHIP MISSILE ON IT, and that is the point rather
    // than an omission. Every round in MARITIME_WEAPONS — Harpoon, NSM, LRASM,
    // Maritime Strike Tomahawk, SM-6 — is a sea-skimmer with a seeker that looks
    // at the surface of the water. Against a boat sitting at 200 metres on the
    // battery they are not poor weapons, they are not weapons at all. What kills
    // a submarine is a torpedo, put in the water either by another submarine or
    // by an aircraft that has first solved the much harder problem of finding
    // her. So the menu here is deliberately the inverse of every other hull on
    // the list: the aircraft are the bad option and the boat is the good one,
    // and a player who has kept Toledo unspent has an answer nobody else does.
    packages: [
      { asset: 'cruise', qty: 1, base: 0.86, sub: true, weapon: 'mk48',
        label: 'SUBMARINE ATTACK — 1 Mk 48 ADCAP heavyweight torpedo' },
      { asset: 'f35', qty: 2, base: 0.44, weapon: 'mk54',
        label: 'ASW SWEEP — 2 F-35 sorties, sonobuoys and Mk 54 (she will be deep)' },
      { asset: 'fighter', qty: 2, base: 0.40, weapon: 'mk54',
        label: 'ASW SWEEP — 2 F/A-18E sorties, sonobuoys and Mk 54 (she will be deep)' },
    ],
  },
  {
    id: 'ship-sina', name: 'IRGC-N Missile Boat Squadron — Sina class', short: 'SINA SQN',
    type: 'ship', x: 470, y: 455, depth: 1, weight: 0.4,
    desc: 'Fast attack craft out of the island bases, hiding among the shipping. Individually trivial and collectively the reason the Strait is a problem — worked as a squadron or not at all.',
    world: -1,
    // THE DISCRIMINATION PROBLEM, which is the other half of maritime strike and
    // the half no other target on this board asks about. A Sina is 275 tons of
    // fibreglass and aluminium sitting in a traffic separation scheme carrying
    // four thousand merchant transits a year. Nothing here is hard to KILL; the
    // entire difficulty is being sure which return is the one you meant, and the
    // rounds sort themselves by exactly that:
    //   SLAM-ER — a weapons officer watching the seeker video picks the boat.
    //   JSM/NSM — passive imaging infrared, which classifies before it commits.
    //   Harpoon — an active radar seeker in a shipping lane takes the biggest
    //             return in the basket, and the biggest return is a tanker.
    // So the cheapest weapon is the worst one here and the most expensive one
    // (LRASM) is simply not offered — nobody spends a 1,000 lb penetrator and a
    // scarce round on a fibreglass boat.
    packages: [
      { asset: 'fighter', qty: 2, base: 0.80, weapon: 'slamer',
        label: 'SLAM-ER STRIKE — 2 F/A-18E sorties, AGM-84K (man in the loop)' },
      { asset: 'f35', qty: 2, base: 0.78, weapon: 'jsm',
        label: 'F-35C MARITIME STRIKE — 2 sorties, Joint Strike Missile' },
      { asset: 'cruise', qty: 2, base: 0.72, escort: 'nsm', weapon: 'nsm',
        label: 'NSM ENGAGEMENT — 2 rounds off the escort screen' },
      { asset: 'cruise', qty: 2, base: 0.66, weapon: 'mst',
        label: 'MARITIME STRIKE TOMAHAWK — 2 RGM-109E (they scatter and re-form)' },
      { asset: 'fighter', qty: 2, base: 0.58, weapon: 'harpoon',
        label: 'HARPOON STRIKE — 2 F/A-18E sorties, AGM-84D (a seeker in a shipping lane)' },
    ],
  },

  // ---- the southern front ----
  // The only two aimpoints on this list that are not in Iran. See HOUTHIS below
  // for the front they belong to; what matters here is that they are ordinary
  // targets in every mechanical respect — hp, packages, repair, BDA — and are
  // fenced off from Iran by `theater: 'yemen'` alone.
  //
  // They are HELD at H-hour, which is the same absence a JIPTL aimpoint has and
  // for a better reason: on 75% of campaigns this front never opens and these
  // two never appear at all. houthiTurn releases them the night Ansar Allah
  // enters, so the plot gains them with the report that explains them. The flag
  // itself is stamped in game.js off `theater` and is deliberately NOT written
  // here — that loop runs on every load and would overwrite a literal.
  //
  // TRUE COORDINATES, and they are off the bottom of the opening frame — Sanaa
  // sits 150 units below it and Hodeidah 170. That is not a placement problem to
  // solve; it is the fact the whole front is about. The war the president is
  // fighting is north of the frame and this one is south of it, and the map
  // already has the idiom (the Lincoln's BACK station is off the chart too).
  // MapView draws an edge cue rather than moving the geography.
  //
  // NOT Aden. Aden is the internationally recognised government's seat and has
  // been since 2015 — an American package into it would be a strike on the side
  // Washington backs. Hodeidah and Ras Isa are the Houthi-held ports the
  // anti-ship missiles actually stage from, which is also why the humanitarian
  // bill on the second one is the largest `worldOnKill` outside the oil list.
  {
    id: 'houthi-sanaa', name: 'Sanaa Missile and UAV Command', short: 'SANAA CMD',
    type: 'houthi', theater: 'yemen', x: 190, y: 912, depth: 3,
    desc: 'Ansar Allah\'s strike cell in the highlands above the capital — targeting, launch orders and the workshops that mate Iranian seekers to locally built airframes. The men who decide which hull gets shot at, and the sheds where the thing that shoots at it is assembled.',
    world: -1,
    packages: [
      { asset: 'f35', qty: 2, base: 0.70, label: 'F-35 strike package — 2 sorties off the Ford' },
      { asset: 'fighter', qty: 3, base: 0.66, label: 'Air strike — 3 F/A-18E sorties off the Ford' },
      { asset: 'cruise', qty: 3, base: 0.74, label: 'TLAM salvo — 3 cruise missiles' },
    ],
  },
  {
    id: 'houthi-hodeidah', name: 'Hodeidah and Ras Isa Port Complex', short: 'HODEIDAH',
    // 46 units off SANAA CMD, which is inside a 44px hit disc at most zooms.
    // Same overlap Kharg and Bushehr NPP have and handled the same way — nearest
    // centre, picker sheet on a genuinely ambiguous tap — but the label is pushed
    // clear so the two names never stack.
    type: 'houthi', theater: 'yemen', x: 148, y: 932, depth: 3,
    label: { dy: -14 },
    desc: 'The Red Sea coast the anti-ship missiles are trucked to and fired from, and the berths and oil terminal behind them. It is also the way seventy per cent of Yemen\'s food arrives. Both of those are true of the same quay, which is the entire difficulty of the target.',
    // The humanitarian bill lands on the last hit, where the oil terminals put
    // theirs and for the same reason: nobody abroad files a protest over the
    // second package into a berth. The story is the port being shut, and that
    // story does not exist until it is.
    world: -1, worldOnKill: -7,
    packages: [
      { asset: 'f35', qty: 2, base: 0.72, label: 'F-35 strike package — 2 sorties off the Ford' },
      { asset: 'fighter', qty: 3, base: 0.68, label: 'Air strike — 3 F/A-18E sorties off the Ford' },
      { asset: 'cruise', qty: 3, base: 0.78, label: 'TLAM salvo — 3 cruise missiles' },
    ],
  },
];

// Where a destroyed missile base's surviving launchers go, and how much of the
// brigade drives away. A base is worth 100 points of missile strength; killing
// it converts 55 of those into TELs rather than deleting them. The player trades
// a fixed target they can always find for a mobile one they usually cannot —
// which is the actual history of every missile hunt ever attempted.
const DISPERSAL = {
  'msl-kermanshah': [['tel-west', 30], ['tel-central', 25]],
  'msl-shiraz': [['tel-south', 30], ['tel-central', 25]],
};

// Chance per turn that a located TEL group that was NOT struck picks up and
// moves, going dark again. Finding them is not the same as killing them.
const TEL_RELOCATE = 0.45;

// ---- durability model ----
// Fixed installations are worn down rather than switched off. Every target
// carries a 0–100 condition track; a package takes a bite out of it and the
// site keeps fighting on whatever is left. What a site does with the nights you
// spend somewhere else is repair — spare radars rolled out of the dispersal
// revetments, craters filled, a replacement crane barged in — so anything left
// standing at 20% is back at 60% in a few days if you look away. Zero is
// permanent for almost everything: nobody reconstitutes rubble in the middle of
// a war. The one exception is the SAM belt — see AD_RECONSTITUTION below.
//
// Two kinds of target sit outside this and take damage in whole steps the way
// they always have. A hull is afloat or it is on the bottom and it never comes
// back up; and the buried enrichment halls are all-or-nothing by design.
// Types absent from this table are the ones that neither wear down nor repair.
const TARGET_REPAIR = {
  command:    14,   // radios and staff officers — a command node reconstitutes fastest
  airdefense: 12,   // spare launchers and engagement radars rolled out of dispersal
  airbase:    12,   // fill the craters, sweep the ramp, fly again by morning
  missile:    10,   // the TELs were always hidden; the brigade rebuilds around them
  naval:       8,   // piers, cranes and fuel farms take longer than a runway does
  // Bridges and switchyards. Slower than a naval base and faster than a
  // refinery train, and the average hides two very different things: Iranian
  // engineers throw a temporary span over a dropped bridge in days — they did
  // it for eight years against a larger air force — while a burnt 400 kV
  // transformer is a foreign order nobody will fill for a country under
  // sanctions. One number covers both because the player is not being asked to
  // learn a repair table, only that this class stays down longer than the
  // military list does.
  infra:       7,
  oil:         5,   // refinery trains and loading berths are the slowest of all
  // Ansar Allah, and the fastest repair on the board after a command node. This
  // is the one number in the table that is not about engineering: a movement
  // that spent nine years being bombed by a Gulf air force with American
  // munitions rebuilds a launch cell in days because the cell was never a
  // building. It repairs off the same national effort as everything else (see
  // eff() in game.js), which means a flattened IRGC slows the southern front
  // down too — the resupply is real and it comes from the same place.
  houthi:     11,
};

// ============================================================
// WHAT IS NOT YET ON THE TASKING ORDER
// ------------------------------------------------------------
// A target list of two dozen aimpoints on night one is not a decision, it is a
// wall. Every one of them is orderable, three packages a night can service
// three of them, and a new player reads the whole board looking for the thread
// to pull. There isn't one visible, so they pull at random and lose.
//
// So the JIPTL opens SHORT. What is on it at H-hour is the air campaign's
// actual opening move — the SAM belt, the airfields, the naval bases, the
// enrichment halls the war is nominally about — and the rest is added as
// CENTCOM works the list. The player's first night has one obvious answer and
// enough room to see why it is the answer.
//
// THIS IS NOT THE COVERT TIER, and the two must not be confused by anyone
// reading either one. A covert site is a thing Tehran is HIDING and the player
// HUNTS: leads, boxes, an intelligence slot, a folder that can be worked. A
// held aimpoint is a thing CENTCOM simply has not finished staffing, it costs
// the player nothing, and no play makes it arrive faster except the one below.
// Different fiction, different vocabulary, different code path (`held`/
// `released` here, `found`/`suspected`/`leads`/`worked` there).
//
// WHY THE BELT ACCELERATES IT. `perTurn` alone is a calendar — it declutters
// night one and means nothing afterwards. `phaseBonus` is what makes the
// opening a rule rather than a layout: targeting-quality intelligence on the
// interior is something rollback BUYS. Push the belt down and the list opens
// faster. That is the doctrine the whole air campaign is built on, and it is
// worth more said in a mechanic than in another paragraph of advisor text.
//
// The floor is unconditional on purpose. A pure rollback gate would starve a
// player who ignores air defense — nothing new to strike, no way to earn it —
// which is a hard-lock dressed as a difficulty curve. Two a night regardless,
// faster if you earn it.
const JIPTL = {
  // Everything NOT named here is on the board at H-hour. This list is the
  // order the rest join it, front first — one place to read the whole ramp,
  // and one place to edit it.
  //
  // The order is the priority a targeteer would actually work: what shoots at
  // the fleet, then what the war is about, then the economy, then the civil
  // grid. Fixed rather than shuffled, because random order swings the nuclear
  // objective by six turns between campaigns and reads as noise in the harness
  // rather than as difficulty.
  order: [
    'msl-khorramabad',  // finishes the missile picture; an Israeli priority
    'arak',             // the nuclear objective needs it, and so does Jerusalem
    'abadan',           // the economic lever's second half
    'bushehr-npp',      // the politically expensive one
    'rail-sirjan',
    'power-yazd',
    'power-neka',       // the civil grid last, which is also the right order
  ],
  perTurn: 2,
  // Extra aimpoints per night once the sky is going your way. Keyed by
  // airPhase(), so this reads the same number the HUD and the package picker
  // read and cannot drift from them.
  phaseBonus: { contested: 0, degraded: 1, superiority: 2 },

  // The turn the Iranian navy is first on the plot — the night it sails is the
  // one before, which is where the report announces it. Released as one event
  // rather than through `order`, because four hulls sailing together is a beat
  // and four hulls arriving on four different turns is bookkeeping.
  sortieTurn: 3,
  sortie: ['ship-mahdavi', 'ship-dena', 'ship-tareq', 'ship-sina'],
};

// ============================================================
// WHAT IS NOT IN THE FOLDER
// ------------------------------------------------------------
// A `covert` target exists from turn one — it repairs, it counts, it is part of
// the war — but CENTCOM does not know about it. Discovery moves it through three
// states, and the middle one is the whole point:
//
//   unknown    not in the document at all, per the launcher-hunt precedent
//   suspected  a dashed box at a fuzzed position with a type guess. You know
//              something is there. You still cannot plan against it.
//   found      an ordinary target
//
// A straight hidden/visible flip would be a wait-for-RNG button. The suspected
// tier is what makes it a decision: the box appears, and the player spends the
// next several turns deciding whether resolving it is worth an intelligence slot
// against a stale BDA, a loose launcher group and the enrichment estimate.
//
// Three channels feed it, deliberately, so discovery is never one button:
//   1. the collection deck, tasked at the folder (spends the intel slot)
//   2. leads thrown off by strikes on RELATED targets — so the shape of the
//      campaign decides what you learn, and flying aggressively pays in intel
//   3. the site giving itself away by being used
//
// Channel 3 is the anti-hard-lock backstop and it is the reason `surfaceTurn`
// exists: a president who never spends a slot on the folder still finds
// everything eventually, having been hit by it first. That is a worse campaign,
// not an impossible one — the objective must always be reachable.
// v1.66 RESCALE — THE FOLDER WAS PRICED AGAINST A WAR NOBODY PLAYS.
// Measured with .claude/betatest/covert.js over 180 campaigns of the three
// personas that actually spend the intel slot here: the median site was a box
// on turn 11–14 and an aimpoint on turn 14–18. That is a defensible schedule
// against the 30-turn plan and an indefensible one against the war as played,
// which ends around turn 12–14 on the approval floor — so the mid-game this
// tier exists to create was landing after the campaign it belonged to. Worse,
// the chain was FOUR uninterrupted slots deep at the old rates (three blind
// decks to raise a box, one or two more to close it) against one slot a night
// shared with BDA, the launcher hunt and the raid's ISR prep.
//
// So the rates below are raised, the crowding penalty is cut, and two new
// mechanics do most of the work — both aimed at the same complaint, which was
// never "the odds are low", it was "the slot vanished and nothing happened":
//
//   folderLeadYield  a blind deck that hits carries TWO leads out, so the box
//                    goes up on the second good night rather than the third
//   folderPersist    a deck that fails against a box leaves the next one
//                    better placed. Analysts do not start over — they start
//                    from last night's cut. This is the important one: it makes
//                    a spent slot always worth something, and it means a
//                    president who commits to a box closes it on a schedule
//                    they can plan around instead of one they can only survive.
const COVERT = {
  leadsToSuspect: 3,     // leads that promote a gap from unknown to a box on the plot
  leadChance: 0.36,      // per package landed on a target whose type a gap feeds off
  ambientLead: 0.16,     // per turn, a covert site simply being in the war
  tellLead: 0.40,        // ...once its `tellAfter` target is destroyed and it takes over

  // The collection deck worked against the folder rather than against a site.
  // Falls off with the number of outstanding gaps for the same reason the
  // launcher hunt does: analysts split across four problems solve none of them.
  // The falloff is halved from v1.65 — at 0.10 across four live gaps it was
  // taking 30 points off the top of every roll, which is most of what made the
  // opening fortnight feel like the deck was not flying at all.
  folderFind: 0.70,      // resolving a SUSPECTED site — the deck knows where to look
  folderLead: 0.88,      // working blind against unknowns, it produces a lead at best
  folderFalloff: 0.05,   // per outstanding gap beyond the first
  folderFloor: 0.40,
  folderLeadYield: 2,    // leads a successful blind deck carries out
  folderPersist: 0.18,   // ...and what last night's failed cut is worth tonight
  coalitionBonus: 0.05,  // partner services and their take on the same problem

  // By this turn anything still hiding has been fighting long enough to be at
  // least a box. Late enough that a player who works the problem beats it by a
  // wide margin; early enough that the objective stays reachable regardless.
  //
  // A target may override it with its own `surfaceBy`, and one has to. The rule
  // is: if a site gates something the campaign cannot be WON without, its
  // deadline has to leave room for the entire remaining chain rather than just
  // for the discovery — resolve the box (a tasking, sometimes two), order the
  // aircraft (the B-2 is two turns out), fly it, miss, fly it again.
  //
  // It was 20 through v1.65, and 20 was a backstop that never fired: under
  // scripted play the median campaign is over before it, so the guarantee that
  // "no campaign can be locked out of an objective it cannot see" was being
  // made to a war that had already ended. Fourteen is still late enough that
  // working the problem beats waiting for it by a week.
  surfaceTurn: 14,
};

// DIFFICULTY.covert scales how HARD the gaps are to close, never how many of
// them there are. A roster that changed size with the difficulty would change
// what every aggregate in the game divides by — AD_SITES, navalStrength's fleet
// count — so the hard war would be quietly rebalancing the normal one's targets
// rather than being harder. What a harder war takes away is how fast the picture
// fills in, which is the same shape as DIFFICULTY.bmd taking away how long the
// screen keeps shooting rather than how well it shoots.

// ============================================================
// THE SAM BELT COMES BACK
// ------------------------------------------------------------
// The one target type that reconstitutes from zero, and the reason is that a
// SAM "site" is a LOCATION, not an order of battle. Flattening it kills the
// launchers and the engagement radars that happened to be parked there. It does
// not kill the air defense force of a country that fields hundreds of systems,
// keeps most of them mobile, and has spent twenty years planning to fight this
// exact war out of dispersal. Left alone long enough, the reserve moves in.
//
// This exists because airSuperiority() has always CLAIMED it: "the heavy force
// is not a reward you unlock, it is a condition you maintain, and the night you
// look away is the night the plan gets smaller." That was true of the airbases
// and false of the SAM belt, because the belt is three targets and a player
// takes all three to zero by the end of the first week — after which
// airDefenseWeight() is zero forever, every strike is free forever, and the
// campaign is a checklist. Three sites deep is not a threat model.
//
// It never comes back to full and it never comes back fast. What returns is
// what the reserve can field: older systems, worse crews, less of it.
// `quiet` is what makes this a decision rather than a tax — go back and keep
// the rubble smoking and it stays rubble. Look away for three nights and it
// doesn't.
const AD_RECONSTITUTION = {
  // quiet was 3 and rate was 7, which together made the SAM belt an unbounded
  // tax rather than a maintenance cost. Measured over scripted campaigns run to
  // forty turns: HALF of every package the war produced went back into air
  // defense, forever, and the rest of the target list — the missile force, the
  // navy, the halls the war is actually about — split what was left. The belt is
  // supposed to be a condition you maintain, not the campaign.
  //
  // Four nights and five a night is the same mechanic with the dial turned to
  // where the arithmetic works: a site left alone for a week is meaningfully
  // back, a site serviced every third or fourth night stays down, and the belt
  // costs roughly a third of the plan instead of half of it. The 60% ceiling is
  // untouched — that is what makes killing a battery permanent progress, and it
  // was never the part that was wrong.
  quiet: 4,    // nights of being left alone before the reserve starts moving
  rate: 5,     // condition per night once it does — slower than a live site repairs
  // PERMANENT ceiling on a site that has been finished once, enforced by
  // repairCeiling() in game.js against the ordinary overnight repair as well as
  // against the return itself. Without it the reserve arrives at 7% and then
  // repairs to 100% like any other damaged site, and destroying air defense
  // buys the player nothing that lasts. With it, killing a battery is permanent
  // progress that is simply not permanent REMOVAL — which is the whole point.
  cap: 60,
};

// ============================================================
// THE FLEET'S OWN MAGAZINE — NAVAL BALLISTIC MISSILE DEFENSE
// ------------------------------------------------------------
// The mirror of the block above. That one is the enemy's shield coming back;
// this is ours running down.
//
// The umbrella used to be a constant: ~30% of every salvo aimed at the Gulf
// bases knocked down, forever, for free, as long as a deck sat forward. It
// depended on nothing — not on how much had already been fired, not on how long
// the war had run — so it was the one system in the game with no tradeoff
// attached to it at all, and the war it defended was equally hard on night one
// and on night thirty.
//
// It is a magazine now. The screen opens the war with nearly everything: `peak`
// is what a full set of cells does to a raid, and it is deliberately far above
// the old flat rate, because a decline the player never sees the top of is not a
// mechanic, it is a nerf. What it falls to is `floor` — well below where the old
// constant sat, and attributable: an escort with its BMD cells empty is not
// defenceless, it is down to what the screen keeps back for its own terminal
// defence, which stops a little and covers nothing.
//
// WHAT DRAINS IT IS ROUNDS FIRED, NOT THE CALENDAR. This is the whole design.
// A turn counter would decay the shield on rails no matter what the president
// did with the campaign; a magazine makes Tehran's salvo tempo the thing that
// empties it. Which means servicing TELs and missile brigades now pays twice —
// fewer inbound tonight, AND a screen that still has rounds in week three — and
// an existing mechanic the player already owns becomes a defensive strategy at
// no extra cost. A war that leaves the missile force alone burns through the
// cells around the middle of the second week and spends the rest of the campaign
// bare; a war that hunts launchers can carry the umbrella most of the way to the
// end. Those two campaigns have to look different or none of this landed.
//
// `perTrack` is shoot-shoot doctrine: two interceptors at every track the screen
// engages, because a leaker is a hangar full of dead maintainers and the second
// round is cheap by comparison. It is what converts a salvo into rounds, so it
// is also the exchange rate the whole feature is tuned on.
//
// `curve` bends the rate against the magazine: slightly convex, so the first
// quarter of the cells is worth more than the last quarter. A full screen can
// afford to re-engage a leaker; a screen down to its last rounds is firing once
// and hoping.
//
// Rearming is the counterplay, and its price is the true one: nobody reloads a
// VLS cell underway. The deck goes off station to do it — which costs the Aegis
// umbrella for the duration AND the weight on the strait AND the lid on the oil
// premium, all of which already hang off the same forward posture. Three nights
// of a thinner war for a full magazine is a presidential decision, not a button.
const NAVAL_BMD = {
  // SM-3 and SM-6 rounds in the escort screen's cells at the start of the war.
  // Sized against what a campaign actually throws at the covered bases, measured
  // over the real salvo generator: a war that never services the missile force
  // puts ~220 ballistic tracks into the basket across thirty turns, a war that
  // works the launcher list puts in ~85. At two rounds a track this covers all
  // of the second kind of war and under half of the first, which is the whole
  // point — the same magazine lasts the campaign or runs out in twelve nights,
  // and which one happens is a decision the president has been making all along.
  load: 200,
  perTrack: 2,      // interceptors committed per engaged track (shoot-shoot)
  peak: 0.88,       // fraction of a covered salvo killed on a full magazine
  floor: 0.08,      // ...and on an empty one, off the screen's self-defence rounds
  curve: 1.6,       // rate = floor + (peak-floor) * (rounds left / load) ^ curve
  // Where the picture stops being comfortable. `warn` is where SecDef raises it
  // in the situation room and the panel goes amber; `crit` is where the sentence
  // changes from "running down" to "effectively gone". They are not arbitrary:
  // on the curve above, `warn` is the magazine level at which the screen is
  // stopping almost exactly 30% of a salvo — the flat rate this whole system
  // replaced. It is worth telling the president the night the umbrella stops
  // being better than the one every previous war had for free.
  warn: 0.45,
  crit: 0.18,
  // Turns alongside the ammunition ship. Ordered tonight, she is off station
  // tonight — so the real bill is this plus the night she spends steaming back
  // up, and it is paid in unthinned salvos.
  rearmTurns: 2,
};

// ============================================================
// THE NORTHERN LIFELINE
// ------------------------------------------------------------
// Multiplier on the national repair effort once the Caspian flotilla is on the
// bottom. Bandar-e Anzali is the Iranian end of the cross-Caspian traffic out
// of Astrakhan, and the Caspian is the one approach to Iran no American weapon
// has ever reached — which is exactly why the spares that matter come that way.
// Sinking the flotilla wrecks the berths and the cranes with it, and does
// something the tonnage does not explain: it tells Moscow that a closed sea is
// no longer a safe one. The barges keep running. They run slower, lighter, and
// with less on them that anyone will sign for.
//
// Small on purpose. This is a reason to take a hull that costs world opinion
// and sits 900 nm from the fight, not a war-winner — a tenth off every repair
// roll for the rest of the campaign is worth roughly one extra night of
// servicing the list, compounding, which is about what a diplomatic bill of
// -3 should buy. Anything larger and the flotilla stops being a hard call and
// becomes the opening move.
const CASPIAN_REPAIR = 0.9;

// ============================================================
// RESUPPLY — WHAT THE INFRASTRUCTURE CLASS ACTUALLY BUYS
// ------------------------------------------------------------
// The one new mechanic in the dual-use class, and it is deliberately a
// modifier on something that already exists rather than a system of its own.
// Iran's national repair effort (see repairTargets in game.js) is already a
// product of what the campaign has taken away — the command chain that sets
// priorities, the fuel that runs the generators and the truck fleet, the
// Caspian barges that bring the spares. Transport and power belong in exactly
// that product: the airbase whose runway is filled by morning takes longer
// when the line feeding it is down, and the SAM belt reconstitutes slower with
// the grid out.
//
// AD_RECONSTITUTION is the specific reason this hook and not another one. The
// belt coming back out of the national reserve after three quiet nights is the
// invariant the whole air campaign is built on, and it runs on the same repair
// effort as everything else. So breaking what rebuilds air defense is a second,
// indirect way to suppress it — and the president now chooses between servicing
// the site tonight and making every future site harder to bring back. Those are
// different campaigns and they should not cost the same.
//
// MODEST ON PURPOSE. `weight` is the fraction shaved off the national effort
// when the entire class is rubble: four targets, roughly six points each. A
// steep modifier would make infrastructure the mandatory opening move, which
// is the exact opposite of the point — this class only means anything if
// declining it is a live option. At 0.25 the SAM belt reconstitutes at 5 a
// night instead of 7 and damaged sites repair at three quarters speed: worth
// something, worth roughly one extra night of servicing the list per week,
// and never worth the world-opinion bill on its own.
//
// NO SEPARATE DIFFICULTY KNOB, and this is a decision rather than an
// oversight. `diff().repair` already multiplies the same product, so a second
// read through diff() here would scale the effect twice — on hard the harder
// repair rate and a harder resupply penalty compounding into a number neither
// was tuned for. What difficulty changes is how fast Iran rebuilds; what this
// changes is how much of that Iran gets to do. One knob, applied once.
const INFRA_RESUPPLY = {
  // national repair effort *= 1 - weight * (fraction of the class destroyed)
  weight: 0.25,
};

// Fallback full-effect damage for anything not carrying its own weight in
// AIR_ASSETS. Individual packages override with `dmg`.
const PKG_DAMAGE = 55;

// ============================================================
// THE AIR CAMPAIGN, IN THE ORDER IT IS ACTUALLY FLOWN
// ------------------------------------------------------------
// An American air war against a defended country is not one force applied
// evenly for thirty nights. It is three forces applied in sequence, and the
// sequence is the doctrine:
//
//   1. The door is kicked by things that survive a live SAM belt — F-35s and
//      F-22s, and Tomahawks that fly under it. Small magazines, light bomb
//      loads, expensive per aimpoint. This phase is slow and it is supposed to
//      be slow: what it is buying is not damage, it is the next phase.
//   2. Once the belt is broken, the fourth-generation force is released —
//      F-15Es, F-16s, the carrier's Super Hornets. There are far more of them
//      and each one carries far more, but they are 1980s airframes and they
//      die in defended airspace. Volume, not survivability.
//   3. Once nobody is contesting the sky at all, the heavies come — B-1s and
//      B-52s off RAF Fairford, which is what it looks like when the United
//      States stops raiding and starts flattening. One heavy package does the
//      work of two nights of fighters. They are also the most helpless thing
//      in the inventory if the belt comes back up.
//
// `ad`     — success penalty per point of surviving SAM coverage (0..3)
// `loss`   — aircrew loss risk per point of the same
// `weight` — condition taken off a site that wears down, on full effects
// `tanker` — tracks booked, as a function of target depth
// `needs`  — the air-superiority phase this platform will not be tasked below
//
// TANKER RULE. Fighters fly the Gulf littoral (depth 1 — the coast up to
// Abadan) unrefuelled: a Strike Eagle or a Hornet has the legs to hit Bandar
// Abbas, Bushehr or Kharg off the deck or the Gulf ramps and come home dry.
// They only book tankers once the target sits deep — the interior and the
// northwest, everything north of Abadan and west of Nojeh (depth 2+). The
// bombers are the opposite: a B-1, B-52 or B-2 is on the tanker every night, at
// every depth, because it is staging from Fairford or Diego Garcia in the first
// place and neither of those is anywhere near Iran.
//
// v1.19 RESCALE. These numbers used to be 2+d for fighters and 3+d for the
// heavies, against a night-one capacity of ten. That made fuel the only thing
// the player was ever actually deciding about: two deep packages a night, every
// night, for thirty turns, and the answer to every question was "wait for the
// tanker wing." The war it produced was the same war every time. The charge is
// now roughly a quarter of what it was at the fighter end, which takes fuel out
// of the role of universal brake and leaves it as what it should have been — the
// thing that makes the far northwest expensive and the littoral cheap. What
// binds instead is the magazine and, more to the point, world opinion: with the
// tracks no longer rationing sorties, a player who flies everything at
// everything now runs the standing down through the basing tiers (see
// BASING_TIERS) and loses the ramps that the deep targets are only reachable
// from. The constraint moved from fuel to politics on purpose.
//
// ATTRITION — the loss rate that has nothing to do with the SAM belt, and
// therefore the one the player cannot bomb away. Shoulder-launched missiles in
// the target area. Triple-A nobody bothers to target and nobody can suppress. A
// hydraulic failure nine hundred miles from a divert field. A bad night trap on
// a pitching deck at the end of a six-hour cycle. Desert Storm went on losing
// aircraft to exactly these for six weeks after the Iraqi IADS was dead.
//
// `loss` is multiplied by surviving SAM coverage and goes to zero when the belt
// does; `attrition` is added flat and never goes anywhere. It is small — one
// airframe roughly every twelve nights of fighter packages — and it is the
// difference between an air campaign where aircrew are people and one where
// they stop existing after night eight. It is also the only thing that keeps
// csar.js reachable in a war the player is winning.
//
// `pgm` — guided weapons expended per sortie, drawn against the theater stock
// (see DIFFICULTY.pgm, which is what decides whether that stock is finite). It
// is NOT another balance dial: it is the bomb count a real sortie of that type
// carries, and the whole reason it exists is that it prices the tiers against
// each other in a second currency that runs the other way from every currency
// already here. A B-1 is the cheapest thing in the game per aimpoint measured
// in packages, tankers and risk, and the most expensive thing by a factor of
// six measured in weapons — which is exactly right, and it means a president
// running dry cannot simply escalate their way out of it. The Tomahawk is
// zero because the Tomahawk IS the munition and `tlamPool` already counts it;
// charging it twice would make the one weapon with a real campaign floor look
// like it had two.
const AIR_ASSETS = {
  f35:     { ad: 0.02, loss: 0.015, attrition: 0.004, weight: 45, pgm: 2,  tanker: (d) => d >= 2 ? d - 1 : 0 },
  fighter: { ad: 0.11, loss: 0.060, attrition: 0.013, weight: 62, pgm: 4,  tanker: (d) => d >= 2 ? d - 1 : 0, needs: 'degraded' },
  heavy:   { ad: 0.20, loss: 0.090, attrition: 0.010, weight: 92, pgm: 13, tanker: (d) => 1 + d, needs: 'superiority' },
  // the B-2 flies one aircraft at a time, at night, from Missouri or Diego
  // Garcia, with the whole Air Force arranged around getting it home
  stealth: { ad: 0.02, loss: 0,     attrition: 0.002, weight: 55, pgm: 12, tanker: () => 4 },
  // nobody is aboard a Tomahawk, and nobody is aboard an Mk-48
  cruise:  { ad: 0,    loss: 0,     attrition: 0,     weight: 55, pgm: 0,  tanker: () => 0 },
};

// ============================================================
// WHAT FLEW, ON THE LINE THE PRESIDENT ACTUALLY READS (v2.01)
// ------------------------------------------------------------
// The complaint that produced this was "I barely see the fourth-generation
// fighters", and the obvious reading of it — that the staff does not task them
// — is false and was measured false before anything was changed. Off the
// folder on easy the fighter tier is 34.0% of every package flown, the LARGEST
// single share, ahead of the F-35's 31.9%; the air-superiority gate opens by
// turn 2–4 in 100% of campaigns and 0% of campaigns fly none. They were never
// missing. They were never NAMED.
//
// Every strike came back as `BDA: <target name>` over `<SHORT> destroyed`, and
// the platform appeared nowhere in the title, the summary or the prose — the
// one place in the entire game the string "F-16CM" existed was dim grey text
// after a `·`, behind a disclosure caret, in the courses-of-action folder. On
// easy the president never opens a strike dialog, so that caret was the whole
// of it. A third of the war was flown by an aircraft the player was never told
// about, which is indistinguishable from its not being there.
//
// This is IDENTITY, exactly as MARITIME_WEAPONS is identity: nothing in the
// strike math reads it, and `asset`/`base`/`qty` still carry all of it.
//
// Two rules. The tag is DERIVED from the label rather than duplicated into a
// second field on all 134 packages, because the labels already carry the
// airframe and two homes for one fact drift within a version — a package may
// still override with an explicit `tag`, which is the escape hatch for a label
// that cannot state its own platform. And the fallbacks are keyed on what
// FIRES rather than on `asset`: an escort round and a Tomahawk are both
// `asset: 'cruise'` for flight and animation, but "NSM" and "TLAM" are not the
// same news, and the boat is not on the tasking order at all.
const PLATFORM_TAG = {
  sub: 'Mk 48', nsm: 'NSM', sm6: 'SM-6',
  cruise: 'TLAM', f35: 'F-35A', fighter: '4th gen', heavy: 'bomber', stealth: 'B-2',
};

// F-16CM, F-15E, F/A-18E, B-1B, B-52H, B-2 — and deliberately NOT RGM-109E or
// GBU-57, whose three-letter roots fall outside the class. Where a label names
// a weapon and no airframe the fallback above is the honest answer anyway.
const AIRFRAME_RE = /\b(?:F\/A-\d+[A-Z]*|[A-Z]{1,2}-\d+[A-Z]*)\b/;

function platformTag(pkg) {
  if (!pkg) return '';
  if (pkg.tag) return pkg.tag;
  if (pkg.sub) return PLATFORM_TAG.sub;
  if (pkg.escort) return PLATFORM_TAG[pkg.escort] || PLATFORM_TAG.cruise;
  const m = pkg.label && pkg.label.match(AIRFRAME_RE);
  return m ? m[0] : (PLATFORM_TAG[pkg.asset] || '');
}

// Weapons an average package spends, used only to turn the precision-munitions
// stock into the sentence a logistician would actually say — "four nights of
// fighting left" rather than "34% remaining". A display constant, not a balance
// dial: nothing about the war reads it.
const PGM_NIGHT = 11;

// How much of the sky Iran still owns, and what that permits. Air superiority
// is not a switch the player throws — it is computed off what is left of the
// SAM belt and the fighter bases, which means it can be LOST again by looking
// away while the repair crews work. The whole late-war force structure rests
// on a number that has to be maintained.
//   0.00 — opening night: the belt is whole
//   0.40 — DEGRADED: the belt is broken enough to fly fourth-gen into
//   0.80 — AIR SUPERIORITY: nobody is contesting the sky; bring the heavies
const AIR_PHASE = { degraded: 0.40, superiority: 0.80 };
// what the number is built from: the SAM belt is three quarters of the problem,
// Iranian fighter basing the rest
const AIR_WEIGHT = { sam: 0.75, airbase: 0.25 };

// ============================================================
// THEATER FORCE FLOW
// ------------------------------------------------------------
// The other half of why an American war gets heavier rather than lighter. The
// carriers are what is there on night one; everything else is a machine that
// takes weeks to spin up and then does not stop. Squadrons come out of CONUS
// and USAFE, the tanker wings come with them, and by the third week there is
// simply more of everything than there was.
//
// It is not free and it is not automatic in the way a resource tick is: every
// wave needs a ramp to land on, and ramps are what world opinion buys. Lose
// the basing tier a wave needs and the wave holds at its staging field until
// the politics are repaired — the buildup stalls exactly when the player has
// spent the standing that pays for it.
//
// `pgm` is the guided weapons that came with the wave — the only thing that
// ever refills the theater stock on hard, and the reason the force flow is now
// a logistics clock as well as a capability one. It is loaded onto the waves
// rather than paid as a nightly trickle because that is how it actually
// arrives: in ships, in bulk, on a schedule the president does not control.
// The turn-11 tranche is the big one, which its own text has claimed since it
// was written — the munitions ships catching up with the squadrons.
const FORCE_FLOW = [
  { at: 3, needs: 'nato', f35: 1, fighters: 2, tanker: 1, rep: 1, pgm: 70,
    title: 'AIR EXPEDITIONARY WING CLOSES — AL DHAFRA',
    text: 'The first tranche out of the CONUS force flow is on the ramp: an F-35A squadron off Hill and two F-16CM squadrons out of Spangdahlem, with the KC-135 element that brought them. They are combat-ready in the morning.' },
  { at: 5, needs: 'gulf', f35: 1, fighters: 3, tanker: 1, rep: 1, pgm: 70,
    title: 'SECOND TRANCHE ON THE RAMP — AL UDEID',
    text: 'F-15E Strike Eagles out of Seymour Johnson and a second F-35A squadron closed overnight. Air Mobility Command has been running a bridge across the Atlantic for four days to do it — the aircraft are the easy part.' },
  { at: 8, needs: 'gulf', f35: 2, fighters: 3, tanker: 2, rep: 1, pgm: 85,
    title: 'KC-46 TANKER WING ESTABLISHED IN THEATER',
    text: 'Two tanker squadrons and their maintenance tail are established at Al Udeid and Prince Sultan. This is the wave that actually matters: fuel in the air is what has been capping the plan, and tonight there is meaningfully more of it.' },
  { at: 11, needs: 'gulf', f35: 1, fighters: 3, tanker: 2, rep: 2, pgm: 150,
    title: 'THIRD TRANCHE — PRINCE SULTAN AND ALI AL SALEM',
    text: 'Another four squadrons are on the ramps and the munitions ships have caught up with them. Weapons handlers are building up JDAM in numbers nobody in this theater has seen since 2003.' },
  { at: 15, needs: 'nato', f35: 2, fighters: 4, tanker: 2, rep: 2, pgm: 100,
    title: 'USAFE SQUADRONS ARRIVE — MUWAFFAQ SALTI AND ERBIL',
    text: 'The European theater has been stripped to reinforce this one. F-16s from Aviano and F-15Es from Lakenheath are flying out of Jordan and northern Iraq, which puts the western axis in the plan for the first time.' },
  { at: 19, needs: 'gulf', f35: 1, fighters: 4, tanker: 2, rep: 2, pgm: 100,
    title: 'SUSTAINED SURGE RATE ACHIEVED — CENTCOM AIR FORCES',
    text: 'The last of the deploying wings is in place and the theater has reached its sustained surge rate. From tonight the plan is limited by what the tankers can carry and by nothing else — this is the whole weight of American air power, and it is now simply present.' },
];

// ============================================================
// THE AIR TASKING ORDER
// ------------------------------------------------------------
// What a package COSTS. For six versions the answer was nothing. The magazine
// refills every night, the tanker charge was cut to roughly a quarter of what
// it had been (see the v1.19 rescale note above, and it was the right call),
// and there was never a third thing. A player who simply flew the
// highest-value package at every surviving target, eight times a night, won on
// hard by turn eight of thirty.
//
// No single model was wrong. The problem is that every interesting decision in
// this game is priced in packages — grind a missile base down over four nights
// or kill it in one, chase dispersed launchers or service fixed targets, buy
// air superiority or fly fourth-gen raw into the belt — and packages were free.
// A tradeoff whose currency is free is not a tradeoff, it is a checklist.
//
// The obvious fix is a hard cap: three packages a night, one line, done. DO NOT
// DO THIS. It is the fuel brake of v1.19 wearing a different hat, and it
// produces the same war it did — "wait for the tanker wing" becomes "wait for
// tomorrow" and the answer to every question is the same answer. The surge has
// to stay available. It just has to cost.
//
// So: a night's flying is planned about thirty-six hours out. Packages inside
// the plan get the full intel cycle, real mission planning, rested crews, and
// the tankers they were promised. Anything past it is a LATE FRAG — it flies,
// because the President said so, and it flies worse. Then the bill lands on
// tomorrow's plan, because the crews who flew it tonight are the crews who were
// going to fly tomorrow.
//
// `base`    — packages in the plan on night one.
// `perFlow` — planned packages bought by each landed FORCE_FLOW wave. Six waves
//             across the campaign takes the plan from three a night to six:
//             this is the buildup being felt in the currency that actually
//             binds, rather than as sortie counts nobody was spending.
// `ceiling` — the wall ABOVE the plan. Past this the staff does not write the
//             frag at all. There is no quantity of presidential insistence that
//             turns aircraft around faster than they can be turned around, and
//             a game that lets the player fly the twelfth package is back to
//             where it started.
// `surge*`  — what each package past the plan pays, and it compounds. The
//             seventh package on a three-package night flies at −36% effects
//             with the aircrew bill more than tripled. That number is meant to
//             be the one that stops the player, not the effects number.
// `fatigue*`— crew-rest debt. Each late frag books one package against future
//             plans, up to `maxFatigue`, and the wing pays back `fatigueDecay`
//             a night no matter what it flew. So one late frag costs exactly
//             one package-night and no more, while a seven-package night on a
//             plan of three books four and claws out of it over four turns.
//             The decay is deliberately unconditional: a version that only paid
//             down on nights inside the plan let a single greedy night pin the
//             campaign at one package for the rest of the war, off a cliff the
//             player had no way to see.
const ATO = {
  base: 3,
  perFlow: 0.5,
  ceiling: 4,
  surgeEffects: 0.09,
  surgeLoss: 0.55,
  fatiguePerSurge: 1,
  fatigueDecay: 1,
  maxFatigue: 4,
};

// ============================================================
// JERUSALEM'S CLOCK
// ------------------------------------------------------------
// Israel is a second actor with its own war aims, not an American asset — and
// until v1.31 it was a switch. One diplomatic action bought one joint package,
// one hidden counter ran down to one unilateral strike, and by turn 5 of 30
// Israel was spent and spent the remaining 25 turns as advisor flavour text.
//
// What replaces the counter is a pressure gauge that runs the whole campaign. It
// climbs off what Jerusalem is actually watching: the centrifuges turning,
// Iranian salvos landing on Israeli cities, and above all the aimpoints on THEIR
// list that CENTCOM keeps not servicing (`israelPriority` on TARGETS — the
// enrichment halls, Arak, and the two western missile bases that range Israel).
// At `fly` they go, and what that means depends entirely on posture:
//
//   SIDELINED    they go alone. Poor BDA, ruinous abroad, and you answer for it
//                anyway. Pressure here is a fuse you can only slow.
//   COORDINATED  they go inside the tasking order. Real damage on a target you
//                did not spend a package to reach, and it RE-ARMS the joint
//                deep-strike option — the only path into the buried halls that
//                is not a B-2. Pressure here is a tempo you profit from, priced
//                abroad rather than in the magazine.
//
// That inversion is the design. Coordinating stops being a turn-2 checkbox and
// becomes a standing bargain: more war tonight, fewer friends by Friday. And a
// president who ignores Jerusalem's target list has chosen to be surprised by it.
//
// Firing does not stop the clock. It discharges to `after` and starts climbing
// again — the campaign is 30 turns and Israel should be live in all of them.
//
// ---- v1.66: AN ALLY, NOT A SUBCONTRACTOR ----
// Coordinated Israel was, through v1.65, the safe half of the bargain: better
// numbers than a unilateral night, a re-armed joint package, and a bill of
// −5 abroad and nothing at all at home. The gauge asked one question at the
// start of the war and never asked it again, because the answer was always yes.
//
// What is wrong with that is not the balance, it is the fiction. An air force
// flying its own war aims off your tankers is not a squadron you have tasked.
// It picks its own aimpoints, it briefs them to its own cabinet, and the first
// CENTCOM hears of the ones that were not on the agreed list is the imagery.
// So the coordinated numbers below go UP — meaningfully; three aimpoints a
// night at close to a package's effect is the biggest single non-American
// contribution in the game — and three prices come with them:
//
//   1. A standing bill at HOME as well as abroad. Every Israeli night now
//      costs the president approval, because every Israeli night is an American
//      president answering for a decision an American president did not make.
//   2. `wildcard` — the nights they go past the agreed list. Roughly half of
//      them, and what they hit when they do is the civil infrastructure class:
//      the grid, the crossings. It is a genuine military effect (those four
//      aimpoints run INFRA_RESUPPLY, so Iran rebuilds slower after one) bought
//      at a price the president never agreed to pay, in the currency that is
//      hardest to earn back. The dual-use class was built to be a decision;
//      this is the one way it gets made FOR you.
//   3. `earlyFly` — they do not always wait for the gauge. An ally with its own
//      clock sometimes goes tonight, and the reason the floor exists is that
//      a launch out of nowhere would be a dice roll rather than a risk: past
//      `earlyFloor` the president can see the weather coming.
//
// The net is deliberately a real question rather than a trap. Bringing them in
// is still the largest force multiplier available and still the only renewable
// path into the buried halls. It now costs a war's worth of standing to keep,
// and the president who takes it has to fly a campaign that can afford it.
const ISRAEL = {
  fly: 100,                     // pressure at which the IAF goes, posture regardless
  startMin: 12, startMax: 30,   // rolled per war: Jerusalem's temper is not a constant
  after: 34,                    // discharged, not reset — the next one is already building

  // ---- what makes the gauge climb, per turn ----
  ambient: 3.5,        // the program exists and they are watching it
  breakout: 7,         // × how far along Iran's device actually is
  ignored: 2.6,        // per LIVE israelPriority target left unserviced tonight
  serviced: -13,       // per priority target CENTCOM actually put ordnance on
  westward: 8,         // an Iranian salvo that landed on Israel
  holdFactor: 0.35,    // what the ambient climb is worth while a promise is in force

  // The one thing that genuinely cools Jerusalem: what they are impatient about
  // is the enrichment, not the war. Past this much damage across the nuclear
  // target set the gauge falls instead of climbing. This is both the honest
  // answer to "why would they ever stand down" and the reason finishing the
  // halls early is a diplomatic win and not only a military one.
  standDown: 65,
  cooling: -7,

  // ---- asking them to wait ----
  // The president's only lever, and it is paid at home rather than abroad:
  // leaning on Jerusalem in public costs a wartime president with the Hill
  // already counting votes. It gets dearer and weaker every time, because the
  // second promise is worth less than the first and both capitals know it.
  holdTurns: 3,
  holdApproval: 4,     // × the ramp, per ask
  holdRamp: 1.7,
  holdRelief: -26,     // × the decay
  holdDecay: 0.6,
  holdMax: 3,          // after the third, Jerusalem stops taking the call

  // ---- coordinated: the standing bargain ----
  coordSlots: 0.5,      // IAF escort and SEAD freeing American packages off the ATO
  coordWorldFloor: 8,   // how much lower standing abroad recovers to while they fly with us

  // What an Israeli package achieves, by posture. Coordinated, they fly inside
  // an American plan with American tankers, American SEAD and — against the
  // buried halls — American penetrators, so the numbers approach a package the
  // player would have paid for. Alone, they are at the end of their range with
  // what they can carry: real damage to surface plant, nothing whatever under
  // the rock at Fordow. `hard*` applies to `hardened` sites.
  //
  // The coordinated `approval` charge is the one line here with no military
  // counterpart, and it is the point: the president is not paying for the
  // sortie, they are paying for having been the one who let it happen.
  effect: {
    coordinated: { kill: 0.42, damage: 0.95, hardKill: 0.16, hardDamage: 0.55, world: -8, oil: 7, approval: -3 },
    unilateral:  { kill: 0.22, damage: 0.66, hardKill: 0,    hardDamage: 0.34, world: -15, oil: 15, approval: -5 },
  },
  aimpoints: 2,        // how many of their priorities one Israeli night services
  coordAimpoints: 3,   // ...inside the tasking order, with tankers and SEAD

  // ---- the nights that were not on the agreed list ----
  // Charged on TOP of the posture's own bill, and deliberately steep at home:
  // the photograph of a dark province is an American problem the moment an
  // American president is known to have refuelled the aircraft. `wildcard` is
  // near a coin flip because an occasional surprise is flavour and a frequent
  // one is a mechanic — this has to be something the president plans around.
  wildcard: 0.45,
  wildcardAimpoints: 2,   // civil sites serviced on such a night
  wildcardWorld: -10,
  // -6 to -4 at v2.13. Unchanged in what it MEANS — this is still the
  // steepest single ally charge in the game and still the largest term in a
  // coordinated night's bill — but the country it is charged against is now
  // 42 points wide rather than 100, so the old number was a tenth of every
  // persuadable voter for one night's photographs. Measured, it was -5.27 a
  // campaign against a total charged bill of -56.
  wildcardApproval: -4,
  wildcardOil: 6,

  // ...and the nights they simply do not wait. Only once they are in the war —
  // a sidelined Israel is held by the gauge and nothing else — and never from a
  // standing start, so a president watching the bar knows when the weather has
  // turned even if they cannot know the day.
  earlyFly: 0.16,
  earlyFloor: 62,
};

// ============================================================
// THE HEAVY BOMBER FORCE
// ------------------------------------------------------------
// B-1Bs and B-52s off the RAF Fairford ramp — a different field from the 509th
// and a completely different weapon. Fairford is where the Air Force has always
// bedded heavies down for a Middle East war: it is a real ramp with real
// munitions storage, it is inside NATO, and it puts the cells over Iran from the
// northwest rather than up out of the Indian Ocean. Diego Garcia stays the
// B-2's. A B-2 is a key cut for one lock; the heavies
// are tonnage, and tonnage is what actually takes a country's ability to fight
// away from it. They cannot penetrate anything and they will not be tasked
// into contested airspace, which is why they are the reward for the first two
// phases rather than a substitute for them.
const HEAVY_TRANSIT_TURNS = 2;
const HEAVY_CAP = 4;        // sustainable missions off the ramp
const HEAVY_READY = 3;      // generated and ready the turn they land
// Turnaround, in sorties regenerated per night. There is nothing to repair
// between sorties on a B-1 or a B-52 — no low-observable coatings, no
// atoll — just fuel, bombs and crew rest, and Fairford is a NATO main
// operating base with a munitions yard and a full complement of ground crew
// standing behind it. One a night was the B-2's tempo written onto the wrong
// aircraft: it made phase three, the phase the whole air campaign is a
// sequence TOWARD, arrive as a single heavy package every other night, which
// is slower than the fourth-generation force it is supposed to eclipse. At two
// the ramp sustains a heavy package a night against a two-sortie frag and
// still cannot bank more than the CAP, so the reward for taking the sky is
// something the player can actually feel in the target list.
const HEAVY_REGEN = 2;

// ============================================================
// TANKER TRACKS
// ------------------------------------------------------------
// An air campaign flown from the sea against a country the size of Iran runs on
// fuel in the air. Deep packages book tanker tracks out of a nightly theater
// total; Tomahawks book none, because a missile does not refuel — and fighters
// on the littoral book none either, because they have the legs to reach the
// coast and come home dry. It is depth that starts the meter: fighters pay once
// the target is past Abadan and Nojeh, the bombers pay everywhere. What this
// buys the war is geography — the far northwest costs real fuel and the coast
// costs none, so "the littoral or the Caspian" stays a live question.
//
// What it deliberately no longer buys is the campaign's only limit. Through
// v1.18 the tracks rationed the entire war down to two deep packages a night
// and every other system was decoration; the charges were cut hard in v1.19 (see
// the rescale note above AIR_ASSETS) so that the ceiling on how hard a player
// can hit is the political one instead. The heavies still book the most of
// anyone — longest legs in the theater, a tanker apiece — which keeps the
// tonnage phase feeling like something you staged for rather than something you
// switched on.
const TANKER_COST = Object.fromEntries(
  Object.entries(AIR_ASSETS).map(([k, a]) => [k, a.tanker]));

// theater baseline before any deck or basing is counted
const TANKER_BASE = 4;

// ============================================================
// WORLD OPINION — WHAT IT ACTUALLY BUYS
// ------------------------------------------------------------
// Standing abroad is not a scoreboard. It is the permission slip for the ramps
// and the tanker tracks the whole campaign is flown off, and it is withdrawn in
// two steps. Losing NATO and Saudi basing costs squadrons and tankers. Losing
// the Gulf states costs the rest of the tanker plan and the reach to touch
// anything deep — Tabriz and the Caspian come off the target list entirely,
// because there is no longer an airfield within range that will take the
// mission. Both are recoverable: get the number back up and the ramps reopen.
const BASING_TIERS = {
  nato: { at: 30, tankers: 2, fighters: 2, name: 'NATO and Saudi basing' },
  // `at` is the FLOOR, not the whole story: the doves raise it every time they
  // file a caveat, so where this tier folds is something the war negotiates
  // rather than something world opinion decides on its own. See GULF below and
  // gulfFoldThreshold in game.js.
  gulf: { at: 15, tankers: 2, fighters: 2, name: 'Gulf state basing and overflight' },
};

// ============================================================
// THE GULF IS NOT ONE CAPITAL
// ------------------------------------------------------------
// Through v1.71 the whole Gulf was a boolean. BASING_TIERS.gulf flipped off a
// single world-opinion threshold and the event prose said "Doha, Abu Dhabi and
// Manama have jointly suspended..." — seven governments, one switch, thrown by a
// number that has nothing to do with any of them. They were a CONSEQUENCE of
// standing abroad and never an actor in the war.
//
// They are two camps now, and the split is the one the region actually has.
//
// The HAWKS (Kuwait City, Manama, Abu Dhabi, Amman) want Iran's ability to
// reach them taken away while an American carrier is in the water to do it.
// Kuwait remembers 1990 and sits inside the missile brigades' range; Manama is a
// Sunni monarchy over a Shia majority with the Fifth Fleet alongside; Abu Dhabi
// has spent twenty years buying the air defenses this war is a test of. Amman is
// not GCC at all — its stake is the western corridor through Muwaffaq Salti and
// a drone route it wants closed.
//
// The DOVES (Riyadh, Doha, Muscat) want it over. Riyadh has a détente with
// Tehran it is not eager to burn and the export terminal that gets hit when it
// does. Doha shares the largest gas field on earth WITH Iran and hosts the
// largest American base in the theater, which is a sentence that explains the
// whole of Qatari policy. Muscat is the channel, and a channel that takes sides
// stops being one.
//
// The gift in that split — and the reason it is worth building — is that the
// doves hold the big ramps. Al Udeid is Qatari, Prince Sultan is Saudi. The
// hawks hold the near ones: Ali Al Salem, the Bahraini waterfront, Al Dhafra,
// Salti. So the camp that wants the war shortest is the camp that can shorten
// it, and the camp that wants it fought is the camp with less to fight from.
//
// TWO GAUGES, NOT SEVEN. Nobody reads seven bars on a landscape phone, and the
// interesting unit was never the country — it was the argument. Both climb, both
// discharge at 100 and rebuild from `after` the way Jerusalem's does, because a
// coalition that has spent its patience once is not a coalition with none left.
//
// NEITHER GAUGE MAY READ world opinion. That was the first draft and it was
// wrong: world is already the master variable, already drives BASING_TIERS, and
// keying the camps off it too would have been the same number wearing a second
// hat — more arithmetic, no more decisions, and a campaign that fails in one
// direction faster. These read what the capitals can actually see: the barrel,
// the strait, whose soil the salvo landed on, what the tasking order has been
// servicing, and how long this has gone on.
const GULF = {
  // ---- the roster ----
  // `country` matches COUNTRY_PATHS in geodata.js exactly — it is what the map
  // tints. `holds` is what they can withdraw, and is prose, not a mechanic: the
  // tiers stay bloc-wide (per-state basing is a bigger change than this one).
  //
  // Keep `holds` under ~26 characters. The roster row is name-left / holding-
  // right on one line and the holding ellipsises rather than wrapping, and the
  // width that has to survive is a landscape phone's ~217px scroll pane. The
  // first draft gave Kuwait "Ali Al Salem, Arifjan and Buehring" and Jordan
  // "Muwaffaq Salti and the western corridor", both of which clipped there — an
  // ellipsised holding is the one fact the roster exists to carry, cut off.
  states: [
    { id: 'kuwait', name: 'Kuwait', capital: 'Kuwait City', camp: 'hawk',
      country: 'Kuwait', holds: 'Ali Al Salem, two camps' },
    { id: 'bahrain', name: 'Bahrain', capital: 'Manama', camp: 'hawk',
      country: 'Bahrain', holds: 'the Fifth Fleet waterfront' },
    { id: 'uae', name: 'the UAE', capital: 'Abu Dhabi', camp: 'hawk',
      country: 'United Arab Emirates', holds: 'Al Dhafra' },
    { id: 'jordan', name: 'Jordan', capital: 'Amman', camp: 'hawk',
      country: 'Jordan', holds: 'Muwaffaq Salti, the west' },
    { id: 'saudi', name: 'Saudi Arabia', capital: 'Riyadh', camp: 'dove',
      country: 'Saudi Arabia', holds: 'Prince Sultan', energy: true },
    { id: 'qatar', name: 'Qatar', capital: 'Doha', camp: 'dove',
      country: 'Qatar', holds: 'Al Udeid', energy: true },
    { id: 'oman', name: 'Oman', capital: 'Muscat', camp: 'dove',
      country: 'Oman', holds: 'the channel to Tehran' },
  ],

  fly: 100,          // both gauges resolve here
  after: 30,         // discharged, not reset — the next argument is already running
  // ...but the doves discharge FURTHER, and the reason is the difference between
  // the two things being measured. The hawks' gauge is appetite, and an appetite
  // that has just been fed is back within sight of full. A caveat is a decision
  // the council actually took after weeks of argument, and a council that has
  // just decided something does not reopen it next Tuesday. Measured: at the
  // shared 30 a thirty-turn war filed 2.8 caveats and lost Gulf basing in ~95% of
  // long campaigns against a 60% baseline with the mechanic switched off, which
  // made a full-length war a scheduled loss of the ramps rather than a risk.
  doveAfter: 10,

  // ---- the hawks: what makes them buy in ----
  // The trap this shape avoids: a gauge that climbed when the president NEGLECTED
  // the missile force would have paid the player for leaving TELs alive, which is
  // a farm and not a mechanic. So it climbs off two things they can see and the
  // president cannot fake — Iran shooting at THEM, and American ordnance actually
  // landing on the arm that does the shooting.
  hawkStart: [10, 26],
  hawk: {
    ambient: 2,        // the threat is next door and it has not moved
    struck: 13,        // a salvo that landed on hawk soil
    serviced: 6,       // per priority aimpoint CENTCOM actually killed this turn
    strait: 2,         // their sea lane too
    idle: -4,          // a night the tasking order flew nothing at all
  },
  // What they want serviced. Derived from type rather than flagged per target
  // (unlike israelPriority) so a missile target added later inherits it — what
  // the hawks care about is the CLASS, not a list somebody maintained once.
  priorityTypes: ['missile', 'tel'],
  priorityIds: ['irgc-hq'],

  // ---- the doves: what makes them want out ----
  // These are the retuned numbers, and the first draft is worth recording
  // because the failure was the one this project keeps re-learning. At
  // ambient 2.2 / grind 0.35 / oil 0.09, measured over 150 campaigns: the median
  // competent campaign filed 2.7 caveats out of a possible 3 and lost Gulf basing
  // 100% of the time. That is not a pressure a president manages, it is a
  // schedule with a gauge drawn on it — the exact complaint the comment above
  // syncBasing already makes about world opinion without drift.
  //
  // The compounding term was most of it. `grind` is multiplied by the turn count,
  // so it was worth +7/turn by turn 20 on its own and pinned every long war at
  // the cap regardless of how it was fought. It is capped now: the council gets
  // more impatient as the war runs long and then stops getting more impatient,
  // because past a point the argument is already fully made.
  //
  // Target shape, and what it now measures: one caveat in a typical competent
  // campaign, two in a long ugly one, three rare. That keeps the fold threshold
  // near where good play leaves standing abroad, which is what makes it a live
  // question instead of an outcome.
  dovStart: [14, 34],
  dove: {
    ambient: 1.6,      // it is week two and nobody has said how this ends
    grind: 0.18,       // × turns elapsed: the argument gets louder on its own...
    grindMax: 4,       // ...up to here, and then it is simply the standing view
    struck: 12,        // a salvo that landed on dove soil — their war now
    oil: 0.06,         // × dollars over `oilFloor`
    oilFloor: 110,
    hormuzShut: 5,     // × 1 contested, × 2 closed
    // ...and the southern one, at a third of it, for the same reason its oil
    // premium is a third (see HOUTHIS): Bab al-Mandab has a detour and Hormuz
    // does not. It is a standing driver rather than a one-off charge on the
    // closing event because the doves' hormuz term is, and because Riyadh's own
    // Red Sea ports sit behind it — Jizan and Jeddah do not stop being behind it
    // the night after the lane shuts.
    //
    // The barrel already carries some of this through the `oil` term above, and
    // that is fine: the same overlap exists for Hormuz, and what this adds is
    // the doves SAYING SO on the panel. A council charged for a shut strait
    // whose driver list never mentions the strait is a number the president
    // cannot argue with.
    mandabShut: 1.7,   // × 1 contested, × 2 closed
    civil: 1.8,        // per destroyed dual-use site — including the ones Israel did
    // A theater the president has actually calmed has to be able to walk this
    // back, or the only strategy is to outrun it. Worth more than the ambient
    // climb on purpose: a quiet barrel and an open strait is a NET fall.
    calm: -7,
    calmOil: 105,
  },

  // ---- what a full dove gauge costs ----
  // A caveat, not a walkout. It takes a tanker track tonight (a ramp that will
  // host aircraft but not launch them is worth exactly that much) and it raises
  // where the whole tier folds, so each one brings the existing cliff closer to
  // wherever world opinion happens to be standing. Three is the cap: at four the
  // tier folds above the coalition baseline and the war is unplayable for a
  // reason nothing on screen explains.
  caveatMax: 3,
  caveatStep: 6,
  caveatTankers: 1,

  // ---- what a full hawk gauge pays ----
  // A ladder, in order, once each. Ordered cheapest-first deliberately: the
  // fourth fire is worth less than the first, so banking resolve for the
  // corridor (below) stays a live choice rather than something a patient player
  // always wins by default.
  gifts: [
    { id: 'tanker', tankers: 1, title: 'KUWAIT OPENS ALI AL SALEM TO OFFENSIVE TASKING',
      text: 'Kuwait City has quietly dropped the caveat it has carried since the war opened: the ramp at Ali Al Salem is available for strike operations and not only for airlift. CENTCOM gains a tanker track it did not have to ask Riyadh for.' },
    { id: 'patriots', bmd: 0.18, title: 'EMIRATI AIR DEFENSE FOLDS INTO THE THEATER PICTURE',
      text: 'Abu Dhabi has put its own batteries on the American track and released the interceptor stock behind them. The escort screen stops being the only magazine in the theater for the first time since the war opened.' },
    { id: 'fighters', fighters: 2, title: 'BAHRAIN AND THE UAE COMMIT SQUADRONS',
      text: 'Manama and Abu Dhabi are flying. Two allied squadrons come onto the tasking order under CENTCOM control — not a gesture, a share of the night.' },
  ],
  // and after the ladder is spent, they keep paying, smaller
  giftRepeat: { bmd: 0.10 },

  // ---- the northern corridor ----
  // The order that makes banking hawk goodwill worth doing. Deep reach currently
  // dies with the bloc — canReach is one boolean — and this is the insurance
  // against that: Amman and Kuwait City keep the northwestern tracks open on
  // their own account, whatever Doha and Riyadh have filed. It spends the whole
  // gauge, so it is genuinely a choice against the gift ladder rather than a
  // thing to collect on the way past.
  corridorAt: 58,
  corridorApproval: -3,

  // ---- the summit ----
  // The dove-facing lever, and like asking Jerusalem to hold it is billed at
  // HOME rather than abroad: a wartime president spending a week reassuring Gulf
  // monarchies is a week of coverage about what the monarchies want. Same
  // depreciation, same reason — the second reassurance is worth less than the
  // first and both sides know it.
  summitMax: 3,
  summitRelief: -30,
  summitDecay: 0.6,
  summitApproval: 3,
  summitRamp: 1.6,

  // ---- Patriots forward ----
  // Priced in the fleet's own magazine, because that is the honest bill: there
  // is one interceptor stock in the theater and putting it over Manama and Abu
  // Dhabi is taking it off Al Udeid and Al Dhafra. It buys the hawks outright.
  patriotBmd: 0.22,
  patriotResolve: 26,
  patriotMax: 2,
};

// ============================================================
// THE SOUTHERN FRONT — ANSAR ALLAH
// ------------------------------------------------------------
// The one part of this war that does not happen every time.
//
// Everything else on the board is load-bearing: Jerusalem's clock runs all
// thirty turns, the council argues from turn one, the belt reconstitutes on a
// schedule. That is correct for the systems the campaign is ABOUT, and it is
// also why two campaigns on the same difficulty rhyme. This one rolls once at
// H-hour and stays out of three wars in four, so a president who has played six
// campaigns has seen it once or twice and does not have an answer ready.
//
// It is deliberately NOT a second Israel. Jerusalem can lose you the war; Ansar
// Allah can only make it more expensive. The whole front is an annoyance with a
// decision buried in it, and the decision is the point:
//
//   YOU CANNOT REACH IT WITHOUT THE FORD. Sanaa and Hodeidah are in the wrong
//   ocean for the Lincoln. The Red Sea deck is the only American thing within
//   range, which means the southern front is the first thing in the campaign
//   that makes the second carrier order about geography rather than sortie
//   count. A president who never sent for the Ford cannot answer this at all.
//
//   SO THE OTHER ANSWER IS RIYADH — and Riyadh is a DOVE. It is the government
//   that most wants this war over, and the trigger below drags it into a second
//   one on its own southern border. That is the trade the front exists to offer:
//   free sorties from the capital whose patience you are already spending.
//
// WHY THE TRIGGER IS WHAT IT IS. Three salvos onto Saudi soil, or the strait
// shut. Both are things Ansar Allah does and the president does not choose —
// which is what keeps this from being a lever. You cannot decide to bring Saudi
// in; you can only decline to stop the thing that brings them in. A president
// who services the southern front hard enough keeps Riyadh out of it and keeps
// the dove gauge clean, and a president who ignores it gets an air force it did
// not ask for and a bill that arrives four turns later.
const HOUTHIS = {
  // ---- whether this war has one at all ----
  // Rolled once in newWar. A quarter of campaigns, and the roll is not shown:
  // there is no panel and no marker until they announce themselves.
  chance: 0.25,
  // ...and not before this. The front is a late-campaign complication by design
  // — dropped in at turn 3 it is just a harder difficulty setting, and dropped
  // in at turn 20 it lands after most campaigns have already ended on the
  // approval floor (the lesson the covert tier cost a week to learn: see COVERT,
  // and note these numbers are inside the same turn 9–14 window that mechanic
  // had to be dragged back into).
  enterMin: 8,
  enterMax: 13,
  // The one thing that can stop it happening, and it is not luck. Ansar Allah is
  // armed, paid and targeted through the IRGC's external network — the same
  // complex the proxy bill is already denominated in. Flatten it and the seekers
  // stop arriving, so a president who has spent packages on Iranian command by
  // turn 10 may simply never see this front. Checked once, on the entry turn:
  // an IRGC rebuilt afterwards does not summon a war that already declined to
  // start, and one wrecked afterwards does not end one that did.
  entryIrgc: 0.45,

  // ---- what they do while nobody is stopping them ----
  // Per-turn odds once they are in, each scaled by houthiStrength() — which is
  // the condition of the two Yemen aimpoints, so servicing them is the whole of
  // the counterplay and it works immediately.
  shipping: 0.55,     // a hull in the Red Sea or the Gulf of Aden
  // A salvo onto Saudi soil, and this one is the trigger's counter, so its rate
  // is really a statement about WHEN Riyadh can come in. The entry night spends
  // the first of the three itself (see houthiTurn), which leaves two to roll:
  // at 0.40 that is about five turns, so a front that opens on turn 8–13 puts
  // the RSAF in the air around turn 13–18. That is late in a thirty-turn war
  // and absent from a short one, which is the shape the front is supposed to
  // have — but it is also exactly the arithmetic the covert tier got wrong
  // before it was measured, so it is measured (.claude/betatest/houthi.js).
  saudi: 0.40,
  strait: 0.22,       // an attempt on Bab al-Mandab
  // Once shut it stays shut until somebody clears it. Lower than Hormuz's
  // reopening odds because there is no negotiation channel here: nobody in this
  // war has a phone number for Sanaa, and the strait reopens when the launch
  // cells stop working rather than when a deal is struck.
  reopen: 0.18,

  // ---- the barrel ----
  // A third of Hormuz, and the reason is that this one is REROUTABLE. Shutting
  // Bab al-Mandab does not strand the oil; it sends it round the Cape, which is
  // three weeks and a war-risk premium rather than a supply shock. Hormuz has no
  // detour and that is why it is the strait that ends presidencies. Folded into
  // the same nightly oil target so the two straits cannot double-count a panic.
  oilContested: 5,
  oilClosed: 18,

  // ---- Riyadh's threshold ----
  saudiStrikes: 3,    // salvos onto Saudi soil that bring the RSAF in
  // What they fly once they are in: a wider night than the IAF's, because this
  // is their own border and they have been doing it for a decade. Rates are
  // deliberately good — an air force that has flown this exact campaign since
  // 2015 is better at it than a carrier air wing arriving cold.
  saudiAimpoints: 2,
  saudiKill: 0.30,
  saudiDamage: 0.70,
  saudiEvery: 2,      // they fly every other night, not nightly

  // ---- and what Riyadh charges for it ----
  // The answer the player chose, and the one that makes this a gamble rather
  // than a gift. A council cannot file caveats about a war its own air force is
  // flying, so the dove gauge SLOWS while the RSAF is committed — and then it
  // does not, because the thing being measured was never approval of the war. It
  // was how long Riyadh will keep paying for it. Past the grace window Saudi
  // Arabia is fighting two wars it did not want and the gauge climbs faster than
  // it would have if the front had never opened.
  //
  // Both terms go through gulfDoveDrivers as [amount, why] pairs like everything
  // else that moves that gauge, so the council panel explains the swing in the
  // player's own language rather than the number simply changing direction.
  saudiGrace: 4,      // turns of quiet bought by the commitment
  saudiDamp: -3.5,    // per turn inside the grace window
  saudiDrag: 2.5,     // per turn after it, while the front is still live
  saudiDragMax: 7,    // ...ramped over four turns and then capped

  // Approval at home for the RSAF flying American-supplied aircraft over Yemen,
  // charged once when they enter. Small: the domestic story is an ally taking a
  // burden off American pilots, and the honest cost of it lands abroad instead.
  saudiApproval: -2,
  saudiWorld: -3,
};

// Where the second strait is drawn. Bab al-Mandab proper, off Perim — the same
// treatment Hormuz gets (HORMUZ_POS) and, like everything else on this front,
// below the opening frame.
const MANDAB_POS = { x: 162, y: 1016 };

// ============================================================
// IRANIAN WAR PLANS
// ------------------------------------------------------------
// Tehran is not a reaction table. One of these is chosen when the war opens and
// it is not shown to the player: it has to be read off what Iran actually does,
// or bought from the analysts with an action slot. Each one re-weights the same
// event pool rather than adding new events, so the war stays coherent — it just
// stops being the same war every time.
const IRAN_POSTURES = {
  strangler: {
    name: 'STRAIT STRANGLER',
    brief: 'Tehran means to win this at the gas pump. The naval arm and the mine warfare units are the main effort; the missile force is being husbanded to keep the Strait shut rather than spent on airfields.',
    tell: 'heavy naval and mining activity, restrained missile use',
    missile: 0.7, naval: 1.7, proxy: 0.9, ally: 0.8, hormuz: 1.9,
  },
  attrition: {
    name: 'ATTRITION',
    brief: 'Tehran has decided the American public is the weak point and is playing for the casualty count. Missile brigades and proxies are being spent freely against bases and fleet units; the Strait is a lever, not the plan.',
    tell: 'sustained missile salvos against bases, heavy proxy activity',
    missile: 1.35, naval: 0.8, proxy: 1.5, ally: 1.1, hormuz: 0.7,
  },
  sprint: {
    name: 'NUCLEAR SPRINT',
    brief: 'Tehran is buying time for the enrichment halls and nothing else. Air defense and the nuclear sites are being reinforced at the expense of everything else; the retaliation is deliberately measured to keep the war small enough to survive.',
    tell: 'restrained retaliation, hardened air defense, accelerated enrichment',
    missile: 0.75, naval: 0.75, proxy: 0.8, ally: 0.6, hormuz: 0.6,
    // The sprint is meant to be the urgent war, not the unwinnable one: at 1.3
    // the clock runs ~12 turns from a standing start, which is inside what two
    // B-2 cycles against Natanz and Fordow can actually service. Pushed to 1.5
    // it stops being a race and becomes a coin flip on the opening rolls.
    enrich: 1.3, repair: 1.35,
  },
};

// The first turn on which Tehran's own naval arm can move the Strait. Mining a
// channel is not a switch: the boats have to sail and the fields have to be
// laid, and until they are, the naval arm looks the same from Washington
// whatever plan Tehran is running. Without this window STRAIT STRANGLER
// announced itself on the opening night — its `hormuz` and `naval` weights are
// roughly twice the other two plans', so a first-turn mine scare was very
// nearly a free read of the war plan the player is otherwise meant to buy with
// an action slot or earn off several nights of pattern. The strait can still
// move on turn one, but only as revenge for the player's own strike on the oil
// terminals, which fires at the same rate under all three plans and therefore
// tells them nothing.
const NAVAL_SPINUP = 3;

// ============================================================
// THE BREAKOUT CLOCK
// ------------------------------------------------------------
// The reason there is a war on. Iran is enriching the whole time, and the
// campaign is a race against a number nobody in the building can see exactly.
// `need` is randomized at the start of every war, so the estimate the player is
// given is a genuine estimate and not a countdown with a fog filter over it.
//
// THE CLOCK IS NOT A SWITCH (v2.19). Through v2.18 `enrichRate` read
// `natanz.hp` and `fordow.hp` by hardcoded id, and a nuclear target that
// reaches 0 never repairs — so the second of two aimpoints dying SWITCHED THE
// RACE OFF, permanently, and the war's central threat was settled in week one.
// Measured over 432 campaigns in .claude/betatest/race.js: the clock halted
// before the war ended in 84% / 62% / 60% of easy / normal / hard campaigns,
// median turn 8–11, at a median 40% of the way to a device — and every
// competent persona reached a test 0.0% of the time. The only bots that ever
// saw an Iranian device were the ones that barely struck anything.
//
// It also made the covert hall's own description a lie. Kuh-e Siah says
// "Enrichment has continued here every night of the war — the breakout clock
// was never counting only Natanz and Fordow," and in 98.3% of halted campaigns
// that hall was standing at full condition while the panel read HALTED — NO
// CAPABILITY REMAINING. `nukeDegraded` was moved off the two hardcoded ids onto
// the `enrichment` flag for exactly this class of reason; `enrichRate` never
// got the same fix.
//
// WHAT THE REAL ASSESSMENTS SAY, because the numbers below were calibrated
// against them rather than chosen. Every 2026 public assessment of a struck
// Iranian program is written in MONTHS, not in never: 1–3 months with the
// stockpile and stored centrifuges intact, 6–12 months if the material is
// destroyed or buried, against a pre-strike breakout of 2–3 weeks. The
// divergence between those figures is not noise — it is the undeclared half of
// the program, and the named causes are the same three things this game already
// models: an unknown centrifuge inventory, a surviving stockpile that moved,
// and dispersal onto covert sites nobody has located.
//
// The literal wall-clock ratio (~0.25 of rate after the declared halls die)
// cannot simply be used here, and that is worth stating plainly: dropped into a
// thirty-turn campaign it puts the device around turn 50, which is the covert
// tier's own v1.66 mistake — a mechanic priced against a war nobody plays.
// What is modelled instead is the SHAPE those assessments agree on — a large
// but finite setback, whose remainder is undeclared and therefore widens the
// band rather than closing it — calibrated so the residual clock finishes late
// in a long war instead of never.
const BREAKOUT = {
  needMin: 88, needMax: 118,   // progress required for a device
  rate: 6,                     // per turn at full enrichment capability
  // how wide the IC's estimate is, by confidence — ± this many turns
  band: { low: 5, medium: 3, high: 1 },
  decay: 3,                    // turns before a fresh assessment goes stale again

  // ---- what Tehran does with the halls it still holds ----
  // Stored machines get reinstalled where there is still ground to install them
  // on. This is the single thing that keeps every real post-strike estimate in
  // months rather than years, and it is why the survivors matter more than the
  // arithmetic of what was destroyed: `reflow` is how much of the lost capacity
  // the standing halls take up.
  //
  // `reflowCap` is what stops it being a free undo. A hall can be pushed past
  // what it was built for and not indefinitely — it is a fixed number of
  // cascade positions under a fixed amount of rock — so the absorbed capacity
  // is also capped at this multiple of what is actually still standing. That
  // second clamp is the load-bearing half: without it one surviving hall at 24%
  // of the program reconstitutes the whole national effort, and with it a small
  // undeclared site runs a real race but never the race Natanz was running.
  //
  // Both terms go to zero together. Nothing standing absorbs nothing, so
  // HALTED still means halted — it just now means every hall is down, including
  // the one that had to be found first, which is what that banner always
  // claimed and never checked.
  reflow: 0.15,
  reflowCap: 0.4,
};

// ============================================================
// NUCLEAR RELEASE — THE OPTION THAT ONLY EXISTS ONCE THE RACE IS LOST
// ------------------------------------------------------------
// Through v2.17 the breakout clock reaching `need` was an instant loss: the
// device is tested, `DEFEAT — IRAN GOES NUCLEAR` fires, and the campaign ends
// on the same tick. That is the correct ending and it is still here — what was
// missing is that a real president does not learn about a foreign nuclear test
// and then stop existing. They are handed a folder, and the folder has three
// things in it, and every one of them is worse than the last.
//
// So the test now opens a WINDOW instead of closing the war. For `window` turns
// Iran has a device and has not yet fielded it, release authority is unlocked,
// and the campaign runs on. Do nothing and the same ending fires when the window
// expires — that is the weapon leaving the assembly building for a launcher,
// which is what the old instant loss was always describing. The president has
// not been given more time to win the war they were already losing; they have
// been given the four nights in which the only remaining decisions are nuclear.
//
// THE THREE OPTIONS ARE A LADDER AND THE TOP RUNG IS A TRAP. That is the whole
// design. Two of them are real answers at ruinous prices and the third ends the
// presidency on the spot, and the reason the third is on the folder at all is
// that a menu with the unthinkable option quietly removed is not a menu about
// the unthinkable. It is offered, it is described honestly, and it is the only
// order in this game that cannot be recalled, deferred or survived.
//
// WHAT EACH ONE BUYS, and why they are not three sizes of the same thing:
//
//   demo      — a shot nobody dies in. No military effect whatsoever, and that
//               is not a shortcoming, it is the entire instrument: it is a
//               sentence spoken in the only language left. It does not defuse
//               the window, so a demonstration that fails to coerce leaves the
//               president exactly where they were, four days poorer, with the
//               clock still running and the tactical option still on the table.
//               The cheap gamble.
//   tactical  — the device itself, at the site it is being mated at, with the
//               buried enrichment halls underneath it. This DEFUSES the window,
//               which is the only thing on this board that does, and takes the
//               deep program with it. The certain answer at the ruinous price.
//   tehran    — an instant loss. See `ends` below.
//
// The costs are charged DIRECTLY rather than through applyEvent, on the same
// grounds pollEvent and the Hill's vote are: they report a bill already spent.
// That also keeps them off `DIFFICULTY.retaliation`, which is deliberate —
// that knob is how hard IRAN's bill lands and how much patience the country has
// for what is being done TO it. What a president did with their own release
// authority is not a thing an easy setting gets to discount. The only
// difficulty in here is `erode`'s own scaling, which is the shape of the
// country and applies to every catastrophe alike.
//
// `approval` is a push in the pre-v2.13 fully-fluid units every other literal in
// this codebase is written in, so it goes through movePublic and lands against
// the ~42 points actually in play. `erode` is points off the loyal base, which
// is the part that does not come back: the country does not become persuadable
// again about this. Those two together are what "extremely costly" has to mean
// now that approval has a shape — a nuclear release is the only decision in the
// game that lowers the president's own floor, and the floor is the whole model.
const NUCLEAR = {
  // Turns from the test to the ending firing. Four is two days of war, which is
  // long enough to be a decision and short enough that it is never a phase of
  // the campaign to be managed. Anything longer and the breakout ending stops
  // being a loss and becomes a detour.
  window: 4,

  // Iranian dead, for the two options that produce any. Nothing reads these
  // into G.casualties — that counter is American — but they are stated on the
  // card and in the after-action, because an option whose price is written
  // entirely in approval points is an option the game is lying about.
  options: [
    {
      id: 'demo',
      name: 'DEMONSTRATION SHOT',
      where: 'high-altitude airburst over open water, southeast of Socotra',
      // 30% is deliberately a bad bet and deliberately not hopeless. This is
      // the option a president reaches for because the other two are worse,
      // and the honest thing to model about it is that speaking in the only
      // language left works less than a third of the time.
      coerce: 0.30,
      defuses: false,
      approval: -20, erode: 4, world: -22, iranDead: 0,
      // A C+ ceiling. No one died and the program was not touched: what is
      // being capped is the fact of an American nuclear detonation, and that
      // fact is the same size whatever it did or did not achieve.
      gradeCap: 64,
    },
    {
      id: 'tactical',
      name: 'TACTICAL STRIKE — WEAPONS COMPLEX',
      where: 'a single B61-11 on the assembly site and the halls beneath it',
      coerce: 0.70,
      defuses: true,
      approval: -34, erode: 9, world: -38, iranDead: 9000,
      // A D+. The war's object was achieved and the means will define the
      // presidency, every biography of it, and the sixty years after it.
      gradeCap: 49,
    },
    {
      id: 'tehran',
      name: 'STRATEGIC STRIKE — TEHRAN',
      where: 'a countervalue strike on the capital',
      // No `coerce`, no `defuses`, no prices. This one does not resolve against
      // the board at all: it ends the campaign the moment it is ordered, and
      // everything the other two rows spend is charged in a currency that stops
      // existing. The confirmation is a typed word (see ui.js) — the only
      // control in this game that asks for one.
      ends: true,
      iranDead: 4200000,
    },
  ],
};

// ============================================================
// COURSES OF ACTION — WHAT THE STAFF HAS ALREADY DECIDED
// ------------------------------------------------------------
// The president does not pick aimpoints. A real one is handed two or three
// staffed options in the morning, each with a name, an intent, a cost and an
// argument, and picks one — the CAOC does the targeting, and it does it before
// anybody walks into the room. For seventy-six versions this game had the
// president doing the CAOC's job, which is the most demanding thing on the
// board and the least presidential.
//
// So the staff now writes the night, and HOW MUCH OF IT THEY WRITE IS THE
// DIFFICULTY. That is the whole idea, and it is why this table exists rather
// than a third pile of multipliers: easy and hard are not the same game with
// the numbers moved, they are two different jobs. On easy the president is a
// president — three options, pick one, and the skill is reading which doctrine
// the war needs tonight. On hard there is no staff work at all and the
// president is the air component commander, which is the game this has always
// been. Normal is a president with a staff who overrules them.
//
// AN INTENT IS A DOCTRINE, NOT A TARGET LIST. Each entry below is one of the
// arguments an air campaign can actually have with itself, and the reason the
// easy game is a game at all is that they are mutually exclusive on any given
// night and the right answer moves. Fly ROLLBACK for thirty turns and the
// centrifuges finish. Fly THE OBJECTIVE on night one and the belt kills the
// package on the way in. There is no dominant option, which is the bar a menu
// has to clear before picking from it counts as playing.
//
// `weight` is the standing appetite for the doctrine and `scale` is how hard
// board state is allowed to move it — a doctrine with a low `scale` is always
// roughly as urgent as it looks, one with a high `scale` is situational and
// spikes. The scoring itself is in coaScore (game.js), because it reads
// airSuperiority, the breakout estimate and IranAI, none of which exist yet at
// the point this file is parsed.
//
// `types` is what the staff will put on the list under this intent, in the
// order a targeteer would work them. `min` is the point below which the option
// is not offered at all: an intent with one live aimpoint left is not a course
// of action, it is a leftover, and offering it as one of three teaches the
// player that the menu is padding.
const COA = {
  // Slot letters, in brief order. Three is the most a real decision brief
  // carries and the most that fits a phone in landscape without a scroll.
  slots: ['ALPHA', 'BRAVO', 'CHARLIE'],

  // WHAT AN OPTION IS CALLED (v2.01). These were doctrine terms — ROLLBACK,
  // COUNTERFORCE, THE OBJECTIVE — which is what the staff would say to each
  // other and exactly wrong for the man they are briefing. A president is not
  // a targeteer: the name is the first and often the only thing read off a
  // three-column folder, and "THE OBJECTIVE" names a category of thing rather
  // than a night's work. Every name now says what the packages will DO, in the
  // words the president would use to repeat the order back. The doctrine terms
  // survive nowhere in the player's view; `id` is unchanged, so everything that
  // ranks, defers or maps a concern to a doctrine still keys off `rollback`.
  intents: [
    {
      id: 'rollback', name: 'BREAK THE AIR DEFENSES',
      line: 'Gain air superiority. Everything else is waiting on it.',
      types: ['airdefense', 'airbase'], weight: 0.58, scale: 1.05, min: 1,
      why: 'The belt is the reason every package tonight is small, expensive and flown by ' +
        'the only two airframes that survive it. Break it and the fourth-generation force ' +
        'is released, the tasking order opens up, and the interior stops being a place we ' +
        'raid and starts being a place we operate.',
    },
    {
      id: 'counterforce', name: 'HUNT THE LAUNCHERS',
      line: 'Service the missile force before it services us.',
      types: ['tel', 'missile'], weight: 0.46, scale: 1.35, min: 1,
      why: 'Every brigade left standing is a salvo at the ramps we are flying from and a ' +
        'round out of the escort screen\'s cells. This is the one line of work that pays ' +
        'twice — fewer inbound tonight, and interceptors still in the tubes in week three.',
    },
    {
      id: 'objective', name: 'HIT THE ENRICHMENT HALLS',
      line: 'The halls themselves. This is what the war is for.',
      types: ['nuclear'], weight: 0.72, scale: 1.55, min: 1,
      why: 'Everything else on this list is a means. The enrichment program is the reason ' +
        'there are American aircraft over Iran at all, and the clock on it does not stop ' +
        'while we work the belt.',
    },
    {
      id: 'maritime', name: 'CLEAR THE STRAIT',
      line: 'Clear the water. The strait and the hulls that close it.',
      types: ['ship', 'naval'], weight: 0.44, scale: 1.30, min: 1,
      why: 'The anti-ship batteries and what is left of their navy are what keeps the ' +
        'carrier at arm\'s length and the barrel where it is. Kill the hulls and the strait ' +
        'is a shipping lane again — and the deck can come forward, which is worth a package ' +
        'a night on its own.',
    },
    {
      id: 'pressure', name: 'SHUT DOWN THE WAR ECONOMY',
      line: 'The regime\'s own machinery — command, oil, the grid.',
      types: ['command', 'oil', 'infra'], weight: 0.34, scale: 0.95, min: 2,
      why: 'This is the campaign against Tehran\'s ability to keep fighting rather than ' +
        'against what it is fighting with: the headquarters that writes the salvos, the ' +
        'revenue that pays for them, the power that repairs them. It works, and it is read ' +
        'abroad as an American president bombing a country\'s electricity.',
    },
    {
      id: 'jerusalem', name: "FLY ISRAEL'S TARGETS",
      line: 'Fly the aimpoints Israel is threatening to fly itself.',
      types: null, weight: 0.30, scale: 1.70, min: 1,
      // types: null — the list is israelPriority, wherever those sites happen to be,
      // which is the entire point of the option and cannot be written as a class.
      why: 'Jerusalem has told us what it will go and do if we do not. Servicing their ' +
        'priorities out of our tasking order is the only thing that buys time on that clock ' +
        'without spending a phone call, and it is aimpoints we would want anyway.',
    },
    {
      id: 'southern', name: 'THE RED SEA COAST',
      line: 'Ansar Allah. The strait nobody planned for.',
      types: ['houthi'], weight: 0.40, scale: 1.60, min: 1,
      why: 'The Red Sea coast is a different war on a different ocean and it is currently ' +
        'unopposed. It will not decide this campaign, but the shipping is real, the Saudis ' +
        'are watching how seriously we take it, and nobody else is going to do it.',
    },
  ],

  // How much of tonight's plan a single option spends, by difficulty tier. On
  // easy an option IS the night — pick one and the staff flies it — which is
  // what makes the choice feel like a decision rather than a suggestion. On
  // normal it is deliberately short of the plan, because the packages left over
  // are the whole reason normal has a map.
  fill: { full: 1.0, half: 0.55 },

  // The staff will not brief the same doctrine twice, and it will not brief an
  // option it cannot fill to at least this fraction of its size. A COA that
  // arrives half empty is the padding problem again in a smaller font.
  fillFloor: 0.5,

  // What a targeteer calls a class out loud, for the line that says where
  // tonight's packages are actually going ("three on the SAM belt, one on the
  // enrichment halls"). The panel already lists the aimpoints by name behind
  // the caret; what the collapsed line needs is the SHAPE of the night, and a
  // player deciding between three options at a glance is comparing shapes. Not
  // the same strings as `types` and not derivable from them — "airdefense" is a
  // key and "the SAM belt" is what the Chairman would say.
  className: {
    airdefense: 'the SAM belt', airbase: 'the airfields',
    tel: 'the launcher groups', missile: 'the missile brigades',
    nuclear: 'the enrichment halls', ship: 'hulls at sea', naval: 'the naval bases',
    command: 'command and control', oil: 'the export complex',
    infra: 'the crossings and switchyards', houthi: 'the Red Sea coast',
  },
};

// ============================================================
// STATECRAFT — the diplomatic slot, staffed (v1.90)
// ------------------------------------------------------------
// COA above is the same idea for the tasking order, and this is deliberately
// the same shape: an urgency, a weight, and a scale, ranked against ONE read of
// the board (assess.js) so the folder cannot argue with itself. What it ranks
// is not a new set of orders — it is the eleven that have always been in
// DIPLOMATIC ACTIONS, unchanged, scored and cut to three.
//
// The reason it exists is the note under DIFFICULTY below, written at v1.87 and
// left as a promissory: DIPLOMATIC ACTIONS and INTELLIGENCE TASKING stayed on
// easy's rail because "a slot with no door is not a simpler game, it is a
// smaller one", and they come off it "the night the SecDef and NSA brief them
// as dialogs of their own". This is that night for State. The eleven-row shelf
// was the last thing on easy that asked a president to do a staff officer's
// sorting — read every instrument, cost eleven orders against each other, spend
// one — on a level whose whole premise is that somebody else does that first.
//
// THE MAPPING IS THE MECHANIC, and it is why this is a table rather than the
// priority ladder it replaces (`recommendedDiplo` in ui.js, which was a
// hand-written if/else and could only ever name ONE order). `answers` is the
// concern ids from assess.js that this order is a real answer to, and the
// urgency of an order IS the severity of the worst thing it answers. That gets
// three things for free: the ranking moves with the war rather than with a
// fixed list of thresholds, the `read` line on a track is the same clause the
// advisors and the courses of action are already using for that concern, and an
// order that answers nothing live tonight sinks on its own without anybody
// writing a rule about it.
//
// TWO RULES.
//
// An order missing from `orders` is NOT invisible — it falls to `fallback` and
// can still be briefed on a quiet night. The opposite arrangement is the silent
// failure this game keeps re-learning (see `railPanels`): a twelfth diplomatic
// order added in a year would simply never appear on easy, and nothing on
// screen would say so. `.claude/betatest/state.js` asserts every id the panel
// can produce has a row here, which is where that is supposed to be caught.
//
// And `answers` is what the order FIXES, never what it touches. Patriots
// forward buys hawk resolve, so it answers `basing` — it does not answer
// `salvo`, even though it is unambiguously about incoming missiles, because it
// pays for those interceptors out of the same magazine `salvo` is worried
// about. An order that makes a concern worse must not be ranked by it, or the
// gauge that is emptying becomes the reason to empty it faster.
const STATECRAFT = {
  slots: ['TRACK ONE', 'TRACK TWO', 'TRACK THREE'],
  brief: 3,

  // Same arithmetic as a course of action: rank = weight × (0.3 + scale × urgency).
  // `weight` is how much the order is worth when it lands; `scale` is how much
  // of its case is made by tonight rather than by standing merit. A high scale
  // is an order that is either urgent or pointless (ask Jerusalem to hold); a
  // low one is an order that is always mildly worth giving (sanctions).
  orders: {
    // The only order in the game that can END the war tonight, which is why it
    // carries multipliers and nothing else does. `ready` applies when
    // negotiationReady() is true — the window being open is not a factor in the
    // ranking, it is the whole board — and that much is carried over verbatim
    // from the ladder this replaces.
    //
    // `unready` is the other half, and it was measured rather than reasoned:
    // without it, backchannel led TRACK ONE on 44% of all nights while the
    // window was open on 11% of them. Everything it answers — the stalled war,
    // the vote, the floor at home — it answers only BY ending the war, and it
    // cannot end a war Tehran is still willing to fight. So the staff was
    // leading, on two nights in five, with an order whose own row reads "Tehran
    // will not talk while it can still fight" and which costs two points of
    // approval to have tried. A recommendation that is refused by the game's own
    // prose is worse than no recommendation: it teaches the player that the
    // folder is not worth reading. It stays BRIEFABLE while shut — sanctions
    // build the leverage it eventually spends, and a president who wants to
    // probe should be able to — it simply stops leading.
    // `deal` was added at v2.05 and it is the concern this order was always
    // arguing from — it simply did not exist, so the ranker reached past it to
    // the next-worst thing the order touches. Measured over 337 window-open
    // nights on easy, the backchannel led TRACK ONE 100% of the time (the
    // multipliers below do that on their own) under a read line that said
    // "29 turns in, 2 of 3 gates closed, the navy lagging at 42%" — `stall`,
    // which is the war being STUCK, printed over the one order that ends it.
    // The ranking was never the bug; the sentence under it was.
    backchannel: { answers: ['deal', 'stall', 'vote', 'home'], weight: 1.0, scale: 1.0, ready: 2.6, unready: 0.3 },

    // Standing abroad is the master variable and both basing tiers hang off it,
    // so the order that buys it back is priced against the ramps folding.
    un:          { answers: ['basing'], weight: 0.95, scale: 1.3 },
    // Sanctions answer `deal` under the "what it FIXES" rule and not by
    // association: G.sanctions is a term in dealOdds() worth three points of
    // probability each, so a president stacking them is doing the one thing
    // that makes the channel land other than killing more of the war machine.
    // It is the right thing for the staff to brief on the nights the program is
    // finished and the arms are still above the bar.
    sanctions:   { answers: ['deal', 'stall'], weight: 0.6, scale: 0.8 },

    // `home` and NOT `strait`, though a reserve draw is obviously about oil.
    // There is no "the barrel is high" concern — the closest is `strait`, whose
    // clauses are written from the military side because its doctrine is
    // maritime, and borrowing them put "Release the Strategic Reserve" under a
    // read about coastal batteries and charged Jerusalem's own orders with
    // LEAVING THE ANTI-SHIP THREAT UNTOUCHED. No cable ever sent touches the
    // anti-ship threat. What an SPR draw actually moves in this game is the
    // barrel and two points of approval, and both of those are the home front.
    spr:         { answers: ['home'], weight: 0.8, scale: 1.1 },

    // The floor is what wars are lost on, and the count is read out at the vote.
    address:     { answers: ['home', 'vote'], weight: 1.0, scale: 1.4 },
    coalition:   { answers: ['basing', 'stall'], weight: 0.7, scale: 0.7 },

    // Coordinating answers Jerusalem's clock by inverting it, and it answers the
    // breakout clock because the joint deep-strike package is the only renewable
    // path into the buried halls that does not need a B-2. That second mapping
    // is the safety valve on this whole feature: it is what guarantees the one
    // diplomatic order a nuclear endgame can require gets briefed when the
    // centrifuges are the loudest thing on the board.
    israel:      { answers: ['israel', 'breakout'], weight: 1.0, scale: 1.2 },
    restrain:    { answers: ['israel'], weight: 0.95, scale: 1.5 },

    gcc:         { answers: ['basing'], weight: 0.9, scale: 1.2 },
    patriots:    { answers: ['basing'], weight: 0.6, scale: 0.8 },
    corridor:    { answers: ['basing'], weight: 0.85, scale: 1.0 },
  },

  // An order nobody has scored yet. Low, but never zero — see the first rule.
  fallback: { answers: [], weight: 0.4, scale: 0.5 },
};

// ============================================================
// THE COLLECTION DECK, SORTED — DIFFICULTY.intelSlate
// ------------------------------------------------------------
// What STATECRAFT above does for the diplomatic slot, this does for the
// intelligence one, and the argument is one step further along. State's problem
// was eleven orders across four theaters, each spending a different currency, so
// the staff cuts them to three. Intelligence has five or six and they all buy
// the same thing — knowing — which is why v1.90 put the WHOLE deck in the room
// and said so out loud.
//
// The complaint that changes it is not about sorting, it is about what a room
// of six identical-looking taskings does to a player who is being asked to
// choose one: read six, price six, and the honest answer most nights is that
// three of them are collecting against something nothing on the board is
// currently asking about. So the room puts up THREE, and one of them is the one
// tonight's board actually wants.
//
// TWO RULES, AND THE SECOND IS THE FEATURE.
//
// The ranking is the same arithmetic a course of action and a diplomatic track
// already use — weight × (0.3 + scale × urgency) against the one read of the
// board in assess.js — so `answers` here means what a tasking RESOLVES, never
// what it is vaguely about. `hunt` answers the launcher fix and the salvo
// because finding a TEL is the only thing that makes one targetable. `folder`
// answers `blind` and `stall` because a war that has run out of aimpoints is
// the war that needs the ones it has not found yet. Nothing answers `home` or
// `basing`: no collection deck ever flown has moved an approval rating.
//
// AND THE OTHER TWO ARE DRAWN AT RANDOM, deliberately, rather than being ranks
// two and three. A slate of the top three is a ladder, and a ladder read three
// nights running teaches the player to take the top row without reading it —
// which is the failure the advisor damper, the HUD read cell and STATE'S THREE
// have each been fixed for once already. A slate of one good answer and two
// live alternates cannot be skimmed: the president has to read all three,
// because the position of the good one carries no information. It is not a trick
// — every tasking on the slate is a real order that does a real thing tonight,
// and a president who reads the collection picture above them can tell which is
// which. That is the skill the room is teaching.
const INTEL_SLATE = {
  // Fixed at three: it is the width of the room's grid and the same number
  // State's tracks come in at, so the two slot rooms read as the same shape.
  brief: 3,
  orders: {
    // A stale estimate is a package spent on a site that did not need it.
    bda:              { answers: ['blind'], weight: 0.8, scale: 1.1 },
    // The only tasking that makes a target targetable rather than better known.
    hunt:             { answers: ['telfix', 'salvo'], weight: 1.0, scale: 1.4 },
    // The clock the entire campaign is paced against.
    'assess-nuclear': { answers: ['breakout'], weight: 0.9, scale: 1.3 },
    // Aimpoints that are not on the list yet, which is what a stalled war needs.
    folder:           { answers: ['blind', 'stall'], weight: 0.85, scale: 1.0 },
    // Permanent answer, and it decides which arm is worth the campaign.
    'assess-intent':  { answers: ['blind'], weight: 0.7, scale: 0.9 },
    // Standing merit and no urgency at all: nothing on the board ever asks for
    // pattern-of-life, and the raid it feeds is a decision taken somewhere else.
    'isr-prep':       { answers: [], weight: 0.55, scale: 0.4 },
  },
  fallback: { answers: [], weight: 0.4, scale: 0.5 },
};

// ============================================================
// DIFFICULTY
// ------------------------------------------------------------
// Three numbers do almost all the work: what the country will absorb in dead,
// how fast Iran puts its damaged sites back together, and how well it
// coordinates what it has left.
// `softGate` decides whether the air-superiority ladder is advice or law. On
// easy and normal, CENTCOM simply will not task fourth-gen fighters or heavy
// bombers into airspace that has not been taken — the packages are not offered,
// and the player learns the doctrine by reading why. On hard the staff will
// write any plan the President signs: the packages are always available, and
// flying them early is priced in dead aircrew instead of refused outright.
// `israel` scales how fast Jerusalem's pressure gauge climbs (see ISRAEL). It is
// a difficulty knob rather than a flat rate because an impatient ally is exactly
// the kind of pressure a harder war should apply: on hard the IAF is airborne
// while the president is still deciding, on easy there is room to work the list.
// `bmd` is how many interceptors the fleet sailed with (see NAVAL_BMD). It scales
// the magazine rather than the intercept rate, because what a harder war should
// take away is not how well the screen shoots — that is a fact about Aegis — but
// how long it can keep doing it. On hard the cells are dry before the second week
// is out unless the missile force has been worked; on easy there is room to be
// slow about it.
// `retaliation` is how much of an Iranian event's approval bill the country
// actually charges the president — see applyEvent in game.js, which rewrites
// ev.dApproval by it. It is the newest knob and the most load-bearing one, and
// it exists because the table used to scale the WAR and never the domestic
// clock the war was lost on: at v1.72, 64% of all campaigns ended on DEFEAT —
// PRESIDENCY COLLAPSES, 63% were over by turn 10 of 30, and the whole spread
// from easy to hard was worth about one turn. Hard holds the old bill at 1.0
// because expert play was already winning 45-60% there and that is the war as
// designed; what easy buys is not a shorter war but a president the country
// will let finish one.
//
// v1.77 — THE LEVELS ARE NOW THREE DIFFERENT JOBS, NOT ONE JOB AT THREE PRICES.
// Everything above this line is a multiplier: the same screen, the same
// decisions, scaled. That is a difficulty setting in the arcade sense and it
// never addressed the actual complaint about easy, which was not that the war
// was hard — it was that being handed twenty-four aimpoints and a magazine on
// night one is a planning exercise, and a planning exercise is not easier when
// the enemy repairs slower. The four knobs below change WHO DOES THE PLANNING
// (see COA above):
//
//   coa            courses of action the staff briefs each night. 0 = none.
//   coaFill        how much of tonight's plan one option spends (see COA.fill)
//   freeTargeting  whether the map will open a strike dialog at all
//   recommend      whether the staff SORTS the diplomatic slot for the
//                  president (STATECRAFT above). Where the result arrives is a
//                  separate question and `popups` answers it — the same split
//                  `coa` and `popups: 'brief'` already make on the military
//                  side. On a level with the panel it is a mark on one order;
//                  on a level with the dialog it is the three staffed tracks.
//   pgm            campaign precision-munitions reservoir. 0 = no ledger kept
//   dealBar        how much of Iran's war machine has to be gone before Tehran
//                  will take the call — the other half of negotiationReady(),
//                  on IranAI's 0..4 combined scale. This is the ONE knob in the
//                  table that moves a victory condition rather than a price,
//                  and it is here rather than hardcoded for the reason
//                  everything else is: nothing should pin a threshold that
//                  difficulty is supposed to scale.
//
//                  It exists because the negotiated ending was measured
//                  (`.claude/betatest/deal.js`, v2.05) and found to arrive after
//                  the campaign it belongs to. ARMISTICE is the most common win
//                  in the game, the enrichment program finishes on turn 15 of an
//                  easy campaign, and at 1.5 the second half of the gate did not
//                  land until turn 29 — of a war that ends on turn 29. So a
//                  president who did everything right spent the last fourteen
//                  turns with no reachable ending, which is the same failure the
//                  covert tier had at v1.66: a whole mechanic priced against a
//                  war nobody plays. Measured on the same 120 campaigns, the
//                  curve is smooth — 1.8 opens on turn 26, 2.0 on 24, 2.2 on 23,
//                  2.5 on 21, 3.0 on 19.
//
//                  2.5 on easy is deliberately not the earliest of those. It is
//                  the point where Tehran has lost the program the war is about
//                  AND better than a third of what it fights with, which is a
//                  board a player can look at and agree is a defeat — the prose
//                  on that ending says TEHRAN SUES FOR PEACE and it has to be
//                  true. Past about 2.8 the window opens with three quarters of
//                  the war machine intact, and the armistice stops reading as a
//                  won war and starts reading as the game letting you leave.
//                  It also keeps a real on-ramp: the halls fall on turn 15 and
//                  the window opens on 21, so the six turns in between are still
//                  the `deal` concern telling the president what is left.
//
//                  NORMAL AND HARD STAY AT 1.5. What easy buys here is an
//                  ending it can reach, not a softer war.
//
// EASY is the war as a president experiences it: three staffed options, one
// pick, a marked recommendation on the diplomatic side, and no map targeting at
// all — the common operating picture stays fully live and fully readable, it
// simply is not where orders are written. The decision is which doctrine
// tonight's board wants, which is a real decision with a wrong answer, and it
// is the only one being asked.
//
// NORMAL is a president with a staff they are allowed to overrule. Two options,
// each deliberately short of the plan, and the packages left over are flown by
// hand off the map. That leftover is the point: it is strictly more to do than
// easy, and it is where a player who has learned the doctrines starts departing
// from them.
//
// HARD is the game this has always been, plus the ledger it never kept. No
// staff work, every package by hand, and `pgm` — a finite theater stock of
// precision weapons that only the munitions ships refill. Through v1.76 the
// only consumables with a floor were Tomahawks, torpedoes and interceptors;
// everything a fighter or a bomber dropped regenerated overnight forever, so
// the wing had infinite bombs and the war had no logistics in it. It does now,
// on the one level that asked for it.
//
// v1.87 — WHERE THE DECISION ARRIVES, AND HOW MANY DRAWERS ARE OPEN.
// Three more knobs, and all three are the same argument as `coa` taken one step
// further: a level that staffs the night for the president should not also hand
// them the eleven-section sidebar the level that staffs nothing needs.
//
//   railPanels   the sidebar sections this level HAS. null = all eleven.
//   popups       decisions that arrive as a dialog instead of a drawer.
//   autoTheater  CENTCOM makes the force-flow calls rather than offering them.
//
// `railPanels` is a whitelist rather than a list of things to hide, because the
// failure mode of a blacklist here is silent: a section added later joins every
// level automatically and the trim quietly stops being a trim. It is the ONE
// home for that decision — nothing else in ui.js may hide a panel by level.
//
// Easy's core three are the ones with an order in them that only a president
// can give: the staff (who argue), strike assets (what is left to fly with) and
// special operations (the one irreversible call). Of the nine that came off:
// TONIGHT'S OPTIONS, PERSONNEL RECOVERY and now DIPLOMATIC ACTIONS moved into
// dialogs (`popups`), THEATER FORCES is now CENTCOM's problem (`autoTheater`),
// and OBJECTIVES, SQUADRON and THE WORLD are readouts — the breakout clock is already in the
// bottom bar's read cell and in the advisors' mouths, and a president who is
// not writing the tasking order is not costing the gauges out by hand either.
//
// DIPLOMATIC ACTIONS and INTELLIGENCE TASKING were the two that stayed against
// the trim at v1.87, and deliberately: they are the level's two FREE ACTION
// SLOTS, and the primer names never spending them as the most common way a new
// player loses. The condition written here for letting them go was that they be
// briefed as dialogs of their own — the same move TONIGHT'S OPTIONS made — and
// not before, because a slot with no door is not a simpler game, it is a
// smaller one.
//
// v1.90 does that for State: `popups: 'diplo'` puts three staffed tracks in the
// folder (STATECRAFT above, stateOptions in ui.js), so DIPLOMATIC ACTIONS comes
// off easy's rail and its door is the same one the courses of action already
// use. INTELLIGENCE TASKING went the same way in the same release.
//
// v1.91 fixes what that left. Both slots arrived as SECTIONS of the one folder,
// under three courses of action, and the argument for it was the pop-up count —
// which was right about the count and wrong about the shape: a section is only
// read if the reader gets to it, and the slot the folder came in to stop the
// president missing ended up last in an 86vh scroll. The keys in `popups` are
// unchanged and still mean "briefed in the room"; what changed is that the room
// is three rooms walked in order, intelligence then CENTCOM then State, each
// with the briefing department's seal on it. UI.BRIEF_STAGES owns the order.
//
// `autoTheater` exists because the theater calls are the one thing a staffed
// level could not simply drop. Fordow has one key — the GBU-57, which is at
// Whiteman until the 509th is sent for — so a president who never opens THEATER
// FORCES cannot finish the program at any skill level (see the note under THE
// THREE LEVELS ARE THREE DIFFERENT JOBS in CLAUDE.md). Hiding that panel without
// this flag does not simplify easy, it makes it unwinnable.
//
// v1.93 — ONE SIGNATURE, AND IT IS WORTH SIGNING.
// Four more knobs, and the first two are one decision read from both ends.
//
//   coaSigns    courses of action that may be signed in ONE night. 0 = no cap.
//   strike      what a package does on this level, and how that grows.
//   plainAssets STRIKE ASSETS reports readiness rather than arithmetic.
//   intelSlate  intelligence taskings the room puts up. 0 = the whole deck.
//
// `coaSigns` closes a hole that was there from v1.77 and got worse when the
// folder learned to walk itself (v1.92): an option on easy is sized to the WHOLE
// tasking order (`coaFill: 'full'`), so signing a second one is not a bigger
// night, it is a second complete plan flown as late frags — every package
// degraded, the aircrew roll multiplied, and four nights of crew-rest debt
// booked against a president who has no ATO gauge and was never told any of that
// happened. The brief still shows three; exactly one of them can be signed.
// What grows over a campaign is the SIZE of that one option, which is the honest
// place for the buildup to be felt on a level that cannot see the tasking order.
//
// `strike` is that growth, and it is the other half of the same complaint. A
// package on easy was a package on hard, so the one decision the level asks —
// which doctrine tonight is for — was worth a third of a night to a president
// who could sign three options and is worth a whole one to a president who
// cannot. A single signature has to carry the night: `base` multiplies what a
// package takes off a site that wears down, `perFlow` is what each landed
// FORCE_FLOW wave adds to it, and `edge` is a flat lift on the success band.
// It touches those two numbers and NOTHING else — not repair, not world, not
// approval, not the aircrew roll — so what comes out is the same war fought with
// heavier packages rather than a different war. Deliberately absent from normal
// and hard: those levels feel the buildup in the tasking order, which they can
// see, and they can fly a fourth package when tonight needs one.
//
// WHAT THIS COSTS, MEASURED, BECAUSE IT IS NOT FREE AND THE NUMBER IS NOT
// OBVIOUS. `.claude/betatest/coa.js` at n=120, easy, the two bots that only ever
// pick off the menu — coaTop takes the staff's leading recommendation, coaBlind
// picks uniformly at random. That gap is the whole bar for whether this level's
// one decision is a decision:
//
//   v1.92 baseline           coaTop 76%   coaBlind 53%   — 23 points
//   coaSigns: 1 alone        coaTop 75%   coaBlind 57%   — 18 points
//   + strike (this build)    coaTop 82%   coaBlind 79%   —  3 points
//
// So the signature cap is nearly free and the FIREPOWER is what flattens it, and
// it flattens hard: at base 1.15 — a boost small enough that a player would
// struggle to feel it — the gap is already down to 7 points. That is not a
// tuning accident, it is what the level is made of. Easy's decision is an
// efficiency decision under scarcity: with three packages a night against a
// twenty-four aimpoint list, spending one on the wrong doctrine is a night you
// cannot get back, and the ranking is the president's protection from that.
// Relieve the scarcity and every doctrine arrives in time, so the order stops
// mattering. There is no setting of this knob that buys weight without buying
// that, and pretending otherwise is how it gets quietly re-tuned in six months.
//
// It ships anyway, at 1.30, and the argument is that the trade is the right one
// FOR THIS LEVEL: easy is the default and it is labelled RECOMMENDED FOR
// FIRST-TIME PLAYERS, so a first war that is survivable however it is played is
// the product, and the doctrines are still ranked, still argued, and still the
// difference between winning on turn 24 and winning on turn 29. The number to
// watch if this is ever revisited is coaBlind's win rate, not coaTop's — the
// day a random pick and the staff's pick are the same campaign, the folder is
// furniture. Do not raise this knob to fix a complaint about pacing; raise
// ATO.perFlow, which buys weight out of the buildup the player can see.
//
// v2.01 — THE SURGE, AND WHY IT IS NOT THE THING THE NOTE ABOVE FORBIDS.
//
//   coaSurge    packages the staff will put up PAST the plan, once the night is
//               signed. 0 = off, which is normal and hard: they have the map and
//               have been able to late-frag since v1.68.
//
// The complaint was that easy cannot bring firepower to bear the way normal and
// hard can, and it measured true and structural rather than tuned.
// `.claude/betatest/mix.js`, easy, same board: 2.99 packages a night off the
// folder against 4.51 hand-fragging the same level — a third less war per night.
// The cause is that `atoWall` lets every other level keep fragging to plan +
// ATO.ceiling and easy's only brake, `coaSigns: 1`, stops dead at the plan. Easy
// was not a gentler war, it was a SMALLER one, and nothing on screen said so.
//
// The note above is the argument against fixing that with more free packages and
// it stands. What it does not cover is a package the president PAYS for. A surge
// is the late frag the other two levels already fly, with every charge intact —
// `atoOver` degrades the effects, multiplies the aircrew roll and books
// crew-rest debt against tomorrow — so the scarcity the level is built on is
// untouched. What changes is that a president who needs tonight badly enough can
// borrow against tomorrow, and is told the price before signing rather than
// discovering it in the morning.
//
// THE SURGE FLIES THE DOCTRINE THAT WAS SIGNED, and that is the load-bearing
// part rather than a flourish. A surge built from the best aimpoints on the
// board would be a second, better night bolted onto the first, and it would
// flatten exactly what the note above says to protect: if every doctrine gets
// serviced eventually, which one was signed stops mattering. Extending the
// signed option instead makes the surge an amplifier of the decision — pressing
// the wrong doctrine harder is a worse night, not a rescue from one — so the
// ranking is still the president's protection. It falls through to the
// next-ranked doctrine only when its own list is exhausted, because a surge with
// nothing to fly is not a decision either.
//
// One surge a night, capped at 2 rather than at ATO.ceiling's 4: the wall is
// still the wall, and the point is reach, not a second plan. Read the measured
// coaTop/coaBlind gap in `.claude/betatest/coa.js` after touching this — that
// gap is the whole bar, and this knob is the one most likely to close it.
//
// v2.13 — THE COUNTRY, AND WHAT A LEVEL IS ALLOWED TO CHANGE ABOUT IT.
//
//   public      { base, opposed, erode } — the two fixed camps and how fast a
//               catastrophe cracks the loyal one. See APPROVAL.
//   pollDetail  does the poll report the split, or say it in words?
//
// Difficulty has scaled the war since v1.72 and scaled the domestic BILL since
// the `retaliation` knob, but never the country paying it. `public` is where a
// level says what temper the electorate has, and it is the natural home for
// recalibrating this rewrite: a bigger base is a longer fuse at home without
// making a single Iranian salvo cheaper.
//
// `pollDetail` is the other half, and it is display and nothing else. Easy runs
// the IDENTICAL simulation — same blocs, same habituation, same erosion — and
// is simply not shown the arithmetic, exactly as `railPanels` trims drawers off
// a war that is otherwise the same war. A level that quietly simulated less
// would break the one claim that makes this table testable.
const DIFFICULTY = {
  easy:   { name: 'EASY', casualties: 320, repair: 0.75, coord: 0.85, breakout: 1.25, israel: 0.75, bmd: 1.35, covert: 1.3, retaliation: 0.55, softGate: false,
    coa: 3, coaFill: 'full', freeTargeting: false, recommend: true, pgm: 0,
    coaSigns: 1, coaSurge: 2, strike: { base: 1.30, perFlow: 0.08, edge: 0.03 }, dealBar: 2.5,
    plainAssets: true, intelSlate: 3,
    public: { base: 32, opposed: 26, erode: 0.6 }, pollDetail: false,
    railPanels: ['advisors', 'resources', 'specops'],
    popups: ['brief', 'recovery', 'diplo', 'intel'], autoTheater: true,
    tag: 'RECOMMENDED FOR FIRST-TIME PLAYERS',
    desc: 'You\'re President. Each night, CENTCOM briefs you on the situation and gives you options. You pick one. That\'s it — no micromanaging strikes, no moving ships around, no target lists. Just decisions.' },
  normal: { name: 'NORMAL', casualties: 250, repair: 1, coord: 1, breakout: 1, israel: 1, bmd: 1, covert: 1, retaliation: 0.75, softGate: false,
    coa: 2, coaFill: 'half', freeTargeting: true, recommend: false, pgm: 0,
    coaSigns: 0, strike: null, plainAssets: false, intelSlate: 0, dealBar: 1.5,
    railPanels: null, popups: [], autoTheater: false,
    public: { base: 28, opposed: 30, erode: 1 }, pollDetail: true,
    // Held off the title screen. The level is complete and every knob above is
    // live — a save written at this level still restores and plays it — but the
    // radio button is greyed and refuses the click, so `soon` is a statement
    // about the DOOR and not about the war behind it. Nothing in the resolver
    // reads it; `buildDifficultyOptions` is its one consumer. Delete this line
    // to open the level, and delete nothing else.
    soon: true,
    desc: 'A staff you can overrule. Two options are briefed each night and neither one fills the tasking order — what is left over you frag yourself, off the map, against whatever you think they have missed. The war as designed.' },
  hard:   { name: 'HARD', casualties: 190, repair: 1.25, coord: 1.15, breakout: 0.85, israel: 1.3, bmd: 0.7, covert: 0.75, retaliation: 1, softGate: true,
    coa: 0, coaFill: 'full', freeTargeting: true, recommend: false, pgm: 440,
    coaSigns: 0, strike: null, plainAssets: false, intelSlate: 0, dealBar: 1.5,
    railPanels: null, popups: [], autoTheater: false,
    public: { base: 24, opposed: 34, erode: 1.4 }, pollDetail: true,
    desc: 'You are the air component commander and nobody is drafting anything for you. Every package by hand, a finite stock of precision weapons that only the munitions ships replace, less patience at home, faster Iranian repair, a light interceptor magazine and no patience at all in Jerusalem. The staff will fly any plan you sign and hand you the casualty list afterwards.' },
};

// These levels were once named for the chair you were sitting in. A save
// written under those names still restores at the level it was played at
// rather than silently dropping to normal.
const DIFFICULTY_ALIAS = { advisor: 'easy', general: 'normal', president: 'hard' };

// Which level a player who has never chosen one is handed, and it is not a
// neutral default dressed up as one. Being handed twenty-four aimpoints and a
// magazine on night one is a planning exercise, and a first war that opens on a
// planning exercise is a first war that ends on the title screen. `tag` above is
// the same argument said out loud on the radio button. Restoring a save reads
// the level it was played at and never comes here.
const DIFFICULTY_DEFAULT = 'easy';

// ============================================================
// THE COUNTRY — THREE BLOCS, AND ONLY ONE OF THEM IS LISTENING
// ------------------------------------------------------------
// Approval decides more of this game than any other number: 64% of campaigns
// end on DEFEAT — PRESIDENCY COLLAPSES. Through v2.12 it was an accumulator
// with clamps bolted on either end — one running total that started at 58,
// took a flat +3 for every target destroyed and a flat -2 for every miss, on
// turn 2 and on turn 27 alike, and was clamped into 0..100 because nothing
// else stopped it. Three things were wrong with that and they are all the
// same thing: it was arithmetic, not a public.
//
// A country has people in it who are not persuadable. Roughly a quarter will
// approve of a wartime president whatever the war does, and roughly a third
// will not whatever it does, and both of those facts are true before the first
// package launches. So 100% is not merely unlikely, it is unreachable — and so
// is 0. What actually moves is the share in the middle, and every event in
// this game now competes for exactly that share.
//
//   base      the floor. Approval cannot go below it without a catastrophe
//             cracking the base itself (see `erode`).
//   middle    the only thing the war can move. base + middle is the ceiling.
//   opposed   against from night one. Grows when the base cracks, because
//             somebody who abandons a president they voted for does not become
//             persuadable again — they are gone.
//
// The measurement this replaces, over 540 scripted campaigns at v2.12: median
// peak approval 58–76, p99 across all 11,314 turns 80, absolute max 98, and
// zero turns at 100. So the old ceiling was not being HIT — the bug was never
// that the number reached 100, it was that nothing in the model said why it
// shouldn't, and a human addressing the nation every other turn found the hole
// the bots never looked for. What this buys is not a lower number. It is a
// number with a shape: a hard floor to fight from, a ceiling you can run out
// of country against, and a middle that has to be won every night.
const APPROVAL = {
  // Night-one shares. `middle` is never written down — it is 100 - base -
  // opposed, so a difficulty writes the two fixed camps and can never state an
  // arithmetic that does not add up. DIFFICULTY.public overrides both.
  base: 28,
  opposed: 30,

  // Where the persuadable middle stands on night one — a little over two
  // thirds with the president, which leaves real headroom for the opening
  // week's wins to land in.
  openMiddle: 30,

  // ---- the rally, which is BORROWED and sits OUTSIDE the blocs ----
  // Iran killed seven Americans at Al Asad before turn 1, and a country that
  // has just been attacked rallies to its president. `approval` is therefore
  // base + middle + rally, and during the first week it can and should read
  // ABOVE the structural ceiling the rest of this table describes. That is not
  // a leak in the model, it is the thing rallies actually do: a president is
  // briefly more popular than their country's arithmetic allows, and then they
  // are not.
  //
  // THIS IS A SEPARATE TERM AND NOT A FULL MIDDLE, and that distinction was a
  // bug first. The first cut opened the middle at 38 of 42 to represent the
  // rally, which meant the war spent its first five nights with four points of
  // headroom: every kill the president earned was clipped at the ceiling while
  // every Iranian salvo landed in full. Measured, approval at turn 10 fell from
  // 46 to 31 on normal and 43 to 24 on hard, and `DEFEAT — CONGRESS CUTS OFF`
  // went to 38% of all campaigns — a president who was at their persuasion
  // limit on night one and could only ever go down. A rally is people
  // temporarily approving, not people permanently persuaded, and the two
  // cannot share a counter.
  //
  // It bleeds on a fixed schedule whatever the president does with the week,
  // which is the whole point of modelling it: a rally is an opinion about the
  // attack, not about the campaign, and it expires on its own. 8 - 6 × 1.2 =
  // 0.8, so the war opens at 66 on normal and is running on its own merits by
  // turn 7 at 58 — which is exactly the flat number the old model started at,
  // and is the calibration anchor for this whole rewrite.
  rallyAt: 8,
  rallyTurns: 7,
  rallyPer: 1.2,

  // ---- what a dApproval literal MEANS, now that the country has a shape ----
  // Every `dApproval` in this codebase — sixty-odd of them across five files —
  // was written against a running total on a 0..100 scale where, in principle,
  // the whole country could be moved. It cannot. Only `middle` can, and that
  // is 42 points, so the identical event pushing the identical literal moves a
  // far larger FRACTION of what is actually in play than its author intended.
  //
  // This is the one honest place to say that once. A literal is a push in
  // points of the old, fully-fluid country; `sensitivity` is what that is
  // worth against a country where three fifths of the electorate has already
  // decided. It is a unit conversion and it is not a difficulty knob — every
  // level converts identically, and what a level changes is the shape of the
  // country (DIFFICULTY.public) and Iran's bill (DIFFICULTY.retaliation).
  //
  // It is deliberately NOT the derived 0.42. Habituation already took the
  // recurring events down by roughly a third on its own, and stacking a full
  // structural conversion on top double-counted: measured, the whole bill
  // wants about 0.55 to put approval at the War Powers vote back where v2.12
  // had it. Do not "fix" this to 0.42 on principle — the principle is already
  // spent in habitStep, and the two together are what was measured.
  //
  // The hand-set relative weights sit ON TOP of this and are the real content:
  // a militia rocket attack is -1 and a supercarrier on the bottom is -20
  // because those are judgements about what each event is worth, and no global
  // constant can express the difference between them.
  sensitivity: 0.55,

  // ---- mean reversion: the news cycle forgets in both directions ----
  // The middle drifts back toward the middle of itself, a little every night.
  // This is the single most important number in the table and it was missing
  // from the first cut, which is why that cut did not work: with a 42-point
  // band and a charged bill of -56 a campaign, the middle simply emptied and
  // STAYED empty. Measured, hard sat at exactly its own base — 24.0 — by turn
  // 10 of every campaign, which means a president three turns into a bad week
  // was politically dead with nineteen turns left to play and no path back
  // however well they fought. That is not a hard difficulty, it is an ending
  // with a long epilogue.
  //
  // It cuts both ways on purpose, and the symmetry is the honest part: a
  // president running at the top of their band is dragged down by it exactly
  // as one at the bottom is lifted. Sustained approval is hard to hold for the
  // same reason a collapse is survivable — public attention returns to
  // baseline, and holding it away from baseline is what the war is for.
  //
  // 0.06 of the gap a night is about a five-point pull at the extremes, which
  // is roughly a week to recover half of a catastrophe. Anything much larger
  // and the war stops mattering; much smaller and the floor becomes a trap
  // again. `world` has had exactly this mechanic since v1.31 and for exactly
  // this reason — see the news-cycle block in endTurn.
  revert: 0.04,
  revertTo: 0.5,     // fraction of the middle it pulls toward

  // ---- habituation: the ninth SAM site is not news ----
  // Keyed on the target's own `type`, so a target class added later gets this
  // for free and there is no second table to keep in step. Each payout against
  // a class dulls the next one; every turn the class is left alone recovers
  // some of it.
  //
  // `recover` is a quarter of `step`, so four quiet nights against a class
  // restore one full payout's worth of interest. That number is not arbitrary:
  // AD_RECONSTITUTION.quiet is 4, so a SAM belt that has been ignored long
  // enough to come back out of the national reserve is also, exactly, a belt
  // the country has become interested in again. Killing a reconstituted
  // battery is news a second time because it was news enough to rebuild.
  //
  // `floor` is 0.25 and not 0: the country never stops caring completely, it
  // just stops leading with it. A floor of zero would make late-war strikes
  // free of political meaning in either direction, which is a worse lie than
  // the flat rate this replaces.
  habitStep: 0.18,
  habitRecover: 0.045,
  habitFloor: 0.25,

  // THE ASYMMETRY, and it is not the one this table was first written with.
  //
  // The rule started as "habituation applies to GOOD news only" — people stop
  // cheering victories long before they stop counting the dead. That is a true
  // sentence about casualties and it was the wrong rule for the game, and one
  // sweep said so: `DEFEAT — CONGRESS CUTS OFF THE WAR` went from a minority
  // ending to 41.7% of all campaigns, because what actually charges a
  // president here is a DRUMBEAT. Measured over 60 campaigns, the militia
  // attack in Iraq alone is -16.6 a campaign across ten firings of an
  // identical headline, and six recurring events are -45 of a -60 bill.
  //
  // So habituation is direction-agnostic and OPT-IN, and what opts in is
  // repetition rather than valence. The recurring salvos carry an
  // `approvalClass` (see the `news:` keys in ai.js); the singular catastrophes
  // — a carrier on the bottom, aircrew in IRGC custody, a task force that did
  // not come out — carry none and never will.
  //
  // The asymmetry survives exactly where it was argued for, because the thing
  // it was really about was never routed through approval in the first place:
  // the dead are counted in `G.casualties`, they crack the base through
  // `erodeBands` below, and no amount of press boredom touches either. The
  // country stops leading its bulletins with "another rocket landed at Ain
  // al-Asad" around the fifth time it files it. It does not stop counting.
  habitBad: 'opt-in',

  // ---- erosion: what it takes to crack the base ----
  // Ordinary bad news cannot reach the floor — that is what makes it a floor.
  // A catastrophe can, and moves people out of `base` and into `opposed`,
  // which lowers the ceiling and the floor together. Both, because a president
  // who loses part of their own coalition has lost the argument at both ends.
  //
  // Sized so that the collapse ending stays reachable but has to be EARNED by
  // disaster rather than arrived at by attrition: normal opens with a floor of
  // 28 against a collapse threshold of 20, so a campaign needs roughly nine
  // points of catastrophe before losing at home is even on the board.
  erode: {
    hostages: 3,      // Americans held, or shown on Iranian television
    carrierLost: 4,   // a supercarrier on the bottom
    aircrewTaken: 2,  // a downed crew in IRGC custody rather than recovered
    raidLost: 2,      // a task force that did not come out
    casualtyBand: 2,  // per band of the casualty ceiling crossed — see erodeBands
  },
  // Fractions of casualtyLimit() at which the base gives way again. The country
  // absorbing its own dead is not linear: the first hundred is a war, and the
  // number that matches what was promised is where a coalition starts leaving.
  erodeBands: [0.5, 0.75, 1.0],

  // ---- and a war with no end cracks the base on its own ----
  // Points of base lost per turn past softCap, fractional and accumulating.
  //
  // This is the bound that makes the whole model safe, and it is here because
  // the first build without it re-created the exact failure the softCap note in
  // game.js was written to prevent. A floor the president cannot fall through
  // is a floor a PASSIVE president cannot fall through either: with few
  // casualties there is no erosion, with no erosion the base never moves, and
  // `DEFEAT — PRESIDENCY COLLAPSES` fires at 20 against a floor of 32. Measured
  // over 720 campaigns, the personas that do nothing ran to turn 61 and 14.7%
  // of all campaigns simply ran out of the harness's turn cap, against 0%
  // before. Doing nothing had become immortal.
  //
  // Draining the middle harder cannot fix that — the middle is already empty in
  // those campaigns and mean reversion keeps refilling it. What has to give is
  // the base, and it is the honest thing to give: the overtime prose already
  // says "there is no constituency left for this war" and "the leadership has
  // stopped returning calls", which is a description of a president's own
  // coalition leaving. It was being narrated and not modelled.
  //
  // 0.4 a turn compounds with the middle drain rather than replacing it, so a
  // war ten turns past its plan has lost four points of floor and roughly
  // twenty of middle — the collapse threshold becomes reachable around fifteen
  // turns over, which is where OVERTIME_STEP's own quadratic was aimed.
  overtimeBase: 0.4,

  // ---- when the presidency actually falls ----
  // How far the base has to be cracked before the collapse ending fires. The
  // threshold was a flat `approval <= 20` for the whole history of this game,
  // which was right when approval started at 58 and could reach zero, and is
  // wrong the moment the floor is a difficulty knob: against bases of 32/28/24
  // a fixed 20 asks easy for twelve points of catastrophe and hard for four.
  // That is not a more forgiving country, it is a three-times-longer losing
  // sequence — measured, easy's hopeless personas ran to turn 40 against hard's
  // turn 10, all of them already politically dead and none of them told so.
  //
  // Expressed against the base instead, the ending means the same thing on
  // every level: a president collapses when they have lost eight points of the
  // people who were supposed to be unloseable. Normal works out at exactly 20,
  // which is the number that has always been there — the other two levels are
  // what this fixes.
  collapseErosion: 8,

  // ---- the poll ----
  // Every third turn, which is about a poll every day and a half of war. The
  // cadence is the point: this is the surface that teaches the model, and the
  // existing war-weariness event's own comment is the argument against running
  // it more often — sixteen identical events are "noise a player learns to skip
  // past", and this is the one event that cannot afford that habit.
  //
  // Past softCap it fires EVERY turn instead, because that is when the drain is
  // accelerating and each night's number is genuinely new information. One
  // builder, two cadences; the old wearinessEvent folds into it entirely rather
  // than standing beside it as a second poll about the same country.
  pollEvery: 3,
};

// ============================================================
// THE TOTAL WAR GRADE
// ------------------------------------------------------------
// The after-action screen graded four to six things separately and left the
// president to add them up. They do not add up: a campaign could show an A
// beside an F and say nothing about which of them the war was for. It matters
// enormously — a war that gutted the program and broke the missile force is a
// better presidency than one that held the barrel at $95 and left Natanz
// spinning — and no arrangement of independent letters says so.
//
// So every row now carries a 0–100 SCORE as well as a letter, the letter is cut
// from the score by one shared band table, and the total is the weighted mean
// of those same scores put back through the same table. Rows and total cannot
// disagree about what a B is, which is the same drift warMachine() exists to
// prevent between the objectives panel and the win check.
//
// `weights` is the whole argument of the screen. MILITARY SUCCESS is worth more
// than the next three rows together, because this is a grade for a war and not
// for a term in office. Rows that do not apply — no aircrew ever went down, no
// raid was ever launched — are dropped and the remainder renormalise, so a
// campaign is never scored on a question it was never asked.
//
// `outcome` is a bounded adjustment rather than a row of its own, because how
// the war ENDED is largely made of the numbers the rows already score; what it
// adds that they cannot is that signing an armistice and being impeached out of
// the same board state are not the same presidency.
//
// `breakoutCap` is the one hard rule. The war exists to prevent exactly one
// thing. If the device is tested, every other number on the page is a footnote
// — which is what that ending's own prose already says — and the total is an F
// however well the rest of it went.
const WAR_GRADE = {
  // score floor for each letter, descending. Under the last floor is F.
  bands: [['A', 85], ['B', 70], ['C', 55], ['D', 40]],

  // Deliberately not round: military is 40 of a nominal 100 and the whole
  // political half of the board — approval, world opinion, the barrel — is 32
  // between the three of them. A president who wins ugly outgrades one who
  // loses gracefully, and the table is where that is written down.
  weights: {
    military: 40, lives: 14, diplomatic: 12, economic: 10, home: 10,
    recovery: 8, specops: 6,
  },

  // What MILITARY SUCCESS is made of. `machine` reads warMachine() and nothing
  // else — the win check's own scoring — so the heaviest row on the screen and
  // the condition for victory are the same arithmetic. `effects` is the air
  // campaign's raw productivity, the only part of the row that rewards work on
  // targets the victory gate never asks about.
  mil: { nuke: 0.50, machine: 0.35, effects: 0.15 },
  // targets destroyed, cut for A/B/C/D. Measured over 900 scripted campaigns:
  // median 4, the competent personas 12–14, the ceiling 20.
  effectsCuts: [13, 8, 4, 1],

  outcome: { victory: 8, stalemate: 0, defeat: -8 },
  breakoutCap: 39,

  // A supercarrier is not just its crew. The sailors are already counted under
  // AMERICAN LIVES; this is the fleet that no longer exists, charged once
  // against the military row where a lost deck actually belongs.
  carrierPenalty: 12,
};

// ---- US assets shown on the map ----
// sortie: can generate fixed-wing strike sorties (flight animations launch
// from the nearest sortie-capable base); atacms: hosts Army long-range fires
// (ATACMS/PrSM) — reported in the base's tooltip;
// forward: lives on the forward-basing layer (shown by default, BASES hides it)
const US_ASSETS = [
  // The war opens with the Lincoln FORWARD, so the coordinates here are her
  // forward station and not a third position (see CARRIER_STATIONS). labelAbove
  // on both decks: LINCOLN forward sits 48 units northeast of the Shahid
  // Mahdavi and FORD sits hard against the Saudi coast, and a name hung below
  // either hull runs into something.
  { id: 'csg-lincoln', name: 'USS Abraham Lincoln', short: 'LINCOLN', x: 750, y: 578, kind: 'carrier', sortie: true, labelAbove: true,
    desc: 'The only carrier strike group in theater, on station in the Gulf of Oman. The air wing crosses the beach on one tanker cycle — and everything Iran owns that shoots at ships reaches her here.' },
  { id: 'csg-ford', name: 'USS Gerald R. Ford', short: 'FORD', x: -48, y: 604, kind: 'carrier', sortie: true, active: false, labelAbove: true,
    desc: 'Second carrier strike group — Sixth Fleet\'s deck, not Fifth Fleet\'s. She is in the eastern Mediterranean when the war opens and has to be sent for, and the only road from there to this war is the Suez Canal.' },
  { id: 'udeid', name: 'Al Udeid AB — Qatar', short: 'AL UDEID', x: 427, y: 543, kind: 'airbase', sortie: true,
    desc: 'Forward headquarters, tankers and strike aircraft. Within Iranian ballistic missile range.' },
  { id: 'dhafra', name: 'Al Dhafra AB — UAE', short: 'AL DHAFRA', x: 535, y: 576, kind: 'airbase', sortie: true,
    desc: 'F-35 squadrons and ISR platforms. Within Iranian ballistic missile range.' },
  { id: 'asad', name: 'Ain al-Asad AB — Iraq', short: 'AIN AL-ASAD', x: 131, y: 216, kind: 'airbase', sortie: true,
    desc: 'US forces in western Iraq. Repeatedly targeted by Iranian missiles and proxy rockets.' },
  // active: false — the ramp is bare until the 509th is called forward from
  // Whiteman AFB. Nothing stealthy exists in this theater until it is.
  //
  // The atoll's real position is 7.3S 72.4E, which projects to y≈1770 — a long
  // way below the bottom of the chart. The marker sits at the atoll's true
  // LONGITUDE out in the Laccadive Sea, bottom-right of the plot, with the ↓ in
  // its label pointing due south down the meridian the real thing is on. Open
  // water: west of Kerala, south of the Indian shelf, clear of every carrier
  // box. Diego Garcia is B-2s only — the heavies fly out of Fairford.
  { id: 'diego', name: 'Diego Garcia (B-2 staging)', short: 'B-2 // DIEGO GARCIA ↓', x: 1130, y: 1130, kind: 'bomber', active: false,
    ramp: 'DIEGO GARCIA',
    desc: 'Staging field 2,900 nm south. Empty until the 509th Bomb Wing is deployed forward from Whiteman AFB, Missouri — and the B-2 is the only platform that can kill Fordow.' },
  // RAF Fairford (51.7N 1.8W) — the heavy bomber ramp, and the one US asset in
  // the game that is nowhere near the chart: it projects to roughly (-1343,
  // -460), off the top-left corner by a wide margin. `nomap` keeps it out of the
  // render loop entirely; it exists only so a heavy package has a real origin to
  // compute a bearing and a transit distance from. The northwest inbound track
  // it produces is correct — the heavies come down over Europe and Iraq, not up
  // out of the Indian Ocean like the B-2s.
  { id: 'fairford', name: 'RAF Fairford — England (heavy bomber staging)', short: 'FAIRFORD',
    x: -1343, y: -460, kind: 'bomber', nomap: true, ramp: 'RAF FAIRFORD',
    desc: 'The Air Force\'s forward operating base for heavy bombers, Gloucestershire. Empty until the B-1 and B-52 force is called forward from Dyess and Barksdale.' },
  // The one American shooter Iran cannot see, plotted where Fifth Fleet last had
  // her rather than where she is. She takes her Tomahawks out of the same
  // theater magazine everything else does — a submarine shot is not a free shot,
  // it is the same missile fired from somewhere nobody is looking.
  //
  // `nomap` for the same reason Fairford has it, one step further: a boat whose
  // whole point is that nobody knows where she is should not be an icon sitting
  // on the plot. The entry stays because STRIKE_ORIGINS.sub reads it for the
  // name and the bearing the sonar scope is drawn from — origin only, no icon.
  { id: 'ssn-toledo', name: 'USS Toledo — Gulf of Oman', short: 'TOLEDO (SSN)', x: 655, y: 545, kind: 'submarine', nomap: true,
    desc: 'Los Angeles-class attack submarine in the Gulf of Oman, four tubes of Mk-48. Against a hull at sea she is the cheapest weapon in the theater — no aircrew, no warning, nothing off the magazine — and the slowest, because she must close submerged first.' },

  // -- forward basing layer (projected from real coordinates; toggle in map header) --
  { id: 'arifjan', name: 'Camp Arifjan — Kuwait', short: 'ARIFJAN', x: 322, y: 401, kind: 'logistics',
    forward: true, sortie: false, atacms: true,
    desc: 'Army logistics hub south of Kuwait City. Sustains the theater and hosts long-range fires (ATACMS/PrSM).' },
  { id: 'nsa-bahrain', name: 'Naval Support Activity Bahrain', short: 'NSA BAHRAIN', x: 404, y: 502, kind: 'naval',
    forward: true, sortie: false, atacms: false,
    desc: 'Headquarters of the Fifth Fleet — the command node for everything afloat in the Gulf.' },
  { id: 'alisalem', name: 'Ali Al Salem AB — Kuwait', short: 'ALI AL SALEM', x: 300, y: 383, kind: 'airbase',
    forward: true, sortie: true, atacms: false,
    desc: '"The Rock." Airlift and fighter operations from western Kuwait, minutes from Iranian airspace.' },
  { id: 'psab', name: 'Prince Sultan AB — Saudi Arabia', short: 'PRINCE SULTAN', x: 302, y: 583, kind: 'airbase',
    forward: true, sortie: true, atacms: false,
    desc: 'Fighters, tankers and Patriot batteries in the Saudi interior, buying standoff from the Gulf littoral.' },
  { id: 'salti', name: 'Muwaffaq Salti AB — Jordan', short: 'MUWAFFAQ SALTI', x: -58, y: 289, kind: 'airbase',
    forward: true, sortie: true, atacms: false,
    desc: 'F-16 and F-15E operations from Jordan\'s eastern desert, covering the western axis. (Pan west to see it.)' },
  { id: 'harir', name: 'Harir AB — Iraq', short: 'HARIR', x: 194, y: 111, kind: 'airbase',
    forward: true, sortie: true, atacms: false,
    desc: 'Airstrip in the Kurdish highlands supporting operations across northern Iraq.' },
  { id: 'erbil', name: 'Erbil AB — Iraq', short: 'ERBIL', x: 182, y: 123, kind: 'airbase',
    forward: true, sortie: true, atacms: false,
    desc: 'US air operations hub in Iraqi Kurdistan. Struck by Iranian ballistic missiles before — and in range now.' },
  { id: 'buehring', name: 'Camp Buehring — Kuwait', short: 'BUEHRING', x: 286, y: 372, kind: 'logistics',
    forward: true, sortie: false, atacms: true,
    desc: 'Forward staging camp in the Kuwaiti desert. HIMARS batteries here hold Iranian territory at risk.' },

  // -- Israeli air force bases: allied, not American (ally: true draws them in
  //    amber rather than US blue). Far west of the Gulf — pan west to see them.
  //    `allyOf` is what alliedStrike flies FROM: without it the dispatcher picks
  //    any amber base on the board, and the night Riyadh entered the war an IAF
  //    package launched out of Khamis Mushait.
  { id: 'nevatim', name: 'Nevatim AB — Israel', short: 'NEVATIM', x: -117, y: 313, kind: 'airbase',
    forward: true, ally: true, allyOf: 'israel', sortie: false, atacms: false,
    desc: 'IAF F-35I "Adir" and heavy transport base in the Negev. The long-range strike force flies from here. (Pan west to see it.)' },
  { id: 'hatzerim', name: 'Hatzerim AB — Israel', short: 'HATZERIM', x: -129, y: 312, kind: 'airbase',
    forward: true, ally: true, allyOf: 'israel', sortie: false, atacms: false, labelAbove: true,
    desc: 'IAF F-15I and F-16I squadrons west of Beersheba — the aircraft that would fly a deep-strike package into Iran.' },
  // -- and the Royal Saudi Air Force's southern base, which only matters if the
  //    southern front opens (see HOUTHIS). Khamis Mushait is 40 miles off the
  //    Yemeni border and is the ramp that has flown this exact campaign since
  //    2015 — the honest origin for an RSAF package into Sanaa, and a long way
  //    from Prince Sultan, which is the base the basing tiers are about.
  //    Drawn from the start rather than conjured on entry: the base exists in
  //    every campaign, and a marker that appears mid-war reads as the war having
  //    built it.
  { id: 'khamis', name: 'King Khalid AB — Saudi Arabia', short: 'KHAMIS MUSHAIT', x: 133, y: 803, kind: 'airbase',
    forward: true, ally: true, allyOf: 'saudi', sortie: false, atacms: false, labelAbove: true,
    desc: 'RSAF F-15S and Typhoon squadrons in the Asir highlands, forty miles from the Yemeni border. The base the Saudi air campaign in Yemen has been flown from since 2015. (Pan south to see it.)' },
];

// ---- carrier strike groups ----
// Ships are referred to by name everywhere the player can see them — hull
// numbers mean nothing at a glance in the middle of a war.
const CARRIER_INFO = {
  'csg-lincoln': { name: 'USS Abraham Lincoln', short: 'LINCOLN' },
  'csg-ford':    { name: 'USS Gerald R. Ford',  short: 'FORD' },
};

// The Lincoln works two stations. The Ford works one and cannot leave it.
//
// FORWARD for the Lincoln is the Gulf of Oman itself, roughly 24N 61E — inside
// the Ra's al Hadd–Gwadar line and a hundred miles off the Makran coast. That
// is deliberately the most exposed water on the chart: everything Iran owns
// that shoots at ships reaches her there, and it is the station that buys Aegis
// over the Gulf bases, weight on the strait and a lid on the oil premium. BACK
// is the middle of the Arabian Sea at roughly 12N 62.5E — the halfway point
// between Cape Guardafui, the northern tip of Somalia, and the Malabar coast of
// India, with five hundred miles of open water in every direction and Socotra
// the nearest land. It is also below the bottom of the opening frame. Being off
// the chart is what "out of reach" looks like; zoom out to follow her. Repositioning between them takes a turn, and that turn is spent
// exposed without the forward effects yet.
//
// The Ford comes through Suez and works the Red Sea abeam the middle of Saudi
// Arabia. That is the wrong ocean for Iranian anti-ship fires and equally the
// wrong ocean for forward presence: she flies her air wing, which is the whole
// of what she contributes, and nothing about where she sits is a decision.
// `fixed` is what the posture order, the sidebar and the map all read to know
// she does not move.
//
// Every station sits in open water clear of both coasts; check any change
// against the coastline.
const CARRIER_STATIONS = {
  'csg-lincoln': { forward: { x: 750, y: 578 }, back: { x: 800, y: 1040 } },
  'csg-ford':    { back: { x: -48, y: 604 }, fixed: true },
};

// The Ford's run-in: one waypoint per turn of the five-turn transit, out of the
// eastern Mediterranean, down onto Port Said, through the canal, down the Gulf
// of Suez and into the Red Sea. It is a polyline and not a bearing because a
// straight line from the Med to the Red Sea crosses Egypt corner to corner —
// the reason the transit is worth watching is that there is exactly one way
// through and it is a ditch. She does cross land between Port Said and Suez.
// That is the canal. map.js appends her station as the last vertex.
const FORD_INGRESS = [
  { x: -283, y: 227 },   // eastern Mediterranean, south of Crete
  { x: -233, y: 264 },   // closing the Egyptian coast
  { x: -207, y: 302 },   // Port Said — north entrance to the canal
  { x: -183, y: 404 },   // Gulf of Suez, out the south end
  { x: -113, y: 498 },   // northern Red Sea
];

// map from asset type to launch origin on the map. `sub` is not an asset type —
// it is the cruise magazine fired from a different hull (see the `sub` flag on
// strike packages), and it needs its own origin so the inbound bearing on the
// scope comes from where the boat is rather than from where the carrier is.
const STRIKE_ORIGINS = {
  f35: 'csg-lincoln', fighter: 'csg-lincoln', cruise: 'csg-lincoln',
  stealth: 'diego', heavy: 'fairford', sub: 'ssn-toledo',
};

// The boat's own war shots. A submarine attack is the one package in the game
// that spends nothing off the theater magazine — the weapon is already in her
// tubes, and when the four are gone there is no reloading her mid-war.
const TORPEDO_LOAD = 4;
const SUB_WEAPON_NAME = 'Mk-48 ADCAP heavyweight torpedo, out of the boat\'s own tubes';

// ============================================================
// THE ANTI-SHIP ROUNDS
// ------------------------------------------------------------
// Every package in this game used to name its PLATFORM and leave the weapon
// implied — "TLAM salvo", "air strike, 2 F/A-18E sorties" — which is fine for a
// runway and wrong for a hull. A Block IV land-attack Tomahawk cannot hit a
// moving ship at all; it flies to a coordinate. The weapon that does is the
// Block Va, and the difference between them is the whole reason maritime strike
// is a separate problem from the rest of the air campaign. So the round has a
// name now, and the name is the thing the president is actually choosing
// between.
//
// This table is IDENTITY, not tuning. Nothing here is read by the strike math —
// a package's `base`, `qty` and `asset` still carry all of it, and the argument
// for each number sits beside that package in TARGETS. What lives here is what
// the sidebar prints, what the scope header says, and the one clause explaining
// why a president would pick this round over the one above it.
//
// `scope` is the short designation the tactical scope prints in its header, and
// `cs` the callsign root beside it — but `cs` is only on the rounds the SCREEN
// fires, because those are the only ones that check in under a callsign of their
// own. An air-launched round flies on the aircraft's callsign and the scope
// draws the aircraft's silhouette, so giving Harpoon a root of its own would
// have put a missile's name over a Super Hornet's shape (and three of the first
// four collided with real flight and personal callsigns already in the roster —
// see FIGHTER_TYPES and aircrew.js).
//
// `range` is the clause the package detail line hangs off the weapon name. It is
// prose, and it is there because the whole point of putting six anti-ship
// weapons on the board is that they fail differently, and the player cannot see
// that from a probability alone.
const MARITIME_WEAPONS = {
  // The old reliable, in service since 1977 and still the round that is actually
  // in the magazine. Subsonic, sea-skimming, active radar seeker, 488 lb
  // warhead. Its weakness is the seeker: it goes for the biggest return in the
  // basket, which in the Gulf is a VLCC with a Liberian flag on it. Cheapest
  // shot on the board and the one most likely to hit the wrong thing.
  harpoon: { name: 'AGM-84D Harpoon', scope: 'AGM-84D HARPOON',
    range: '67 nm, sea-skimming, active radar seeker — old, plentiful, and it will take the biggest return it sees' },
  // Same airframe, different war. SLAM-ER is the land-attack Harpoon: imaging
  // infrared seeker with a man in the loop over the datalink, so a weapons
  // officer in the back of a Super Hornet picks the aimpoint in the last thirty
  // seconds. That makes it the answer to a hull alongside a pier or a boat
  // hiding in a traffic separation scheme, and a waste of money in blue water.
  slamer: { name: 'AGM-84H/K SLAM-ER', scope: 'AGM-84K SLAM-ER',
    range: '150 nm, man-in-the-loop imaging infrared — the operator picks the hull out of the traffic' },
  // The premium round, and the one the whole US surface-warfare rebuild is
  // built around. Low-observable, 1,000 lb penetrating warhead, and — the part
  // that matters — it does its own target discrimination on the way in, so it
  // does not need anyone to hand it a picture. Small inventory, and the B-1B is
  // the only aircraft that carries it in numbers: twenty-four rounds on one jet.
  lrasm: { name: 'AGM-158C LRASM', scope: 'AGM-158C LRASM',
    range: '200+ nm, low-observable, autonomous target discrimination — it finds the right ship without being told' },
  // What "TLAM salvo" should have said against anything that moves. Block Va
  // puts a maritime seeker and an in-flight retarget datalink on the same
  // 900-nm airframe, so the round can be launched at where she was and still
  // arrive where she is. Comes out of the same Mk 41 cells and the same theater
  // reservoir as every other Tomahawk, which is why it costs tlamPool.
  mst: { name: 'RGM-109E Block Va Maritime Strike Tomahawk', cs: 'ARSENAL', scope: 'RGM-109E BLOCK Va',
    range: '900 nm, retargeted in flight — launched at a datum and re-aimed on the way' },
  // The odd one, and the interesting one. SM-6 is an air-defense interceptor
  // with an anti-surface mode: Mach 3.5 terminal, so nothing outruns it and
  // nothing decoys it, but the warhead is a 64 lb blast-frag built to kill
  // aircraft — it wrecks a ship's topside and rarely sinks her. And it comes out
  // of the ESCORT SCREEN'S CELLS, which is to say out of the same magazine that
  // covers Al Udeid. See NAVAL_BMD: this is one magazine and two missions, which
  // is the real US Navy's real problem and the best trade on this board.
  sm6: { name: 'RIM-174 Standard Missile 6', cs: 'PICKET', scope: 'RIM-174 SM-6',
    range: '200 nm at Mach 3.5 — nothing outruns it, and every round is a round not covering the bases' },
  // Passive imaging infrared, no emissions at all, sea-skimming with a terminal
  // pop-up, 276 lb warhead. Short-legged compared to everything above it, which
  // is why it belongs to the screen and to the Gulf rather than to a bomber over
  // the Caspian. Deck canisters, not VLS cells — eight of them, and nobody
  // reloads a canister at sea either.
  nsm: { name: 'Naval Strike Missile', cs: 'BROADSWORD', scope: 'NAVAL STRIKE MISSILE',
    range: '100 nm, wholly passive — it emits nothing on the way in and gives no warning at all' },
  // The air-launched NSM, and the only anti-ship weapon that fits inside an
  // F-35's bay. Same seeker and same warhead on a longer-legged body: this is
  // how a fifth-generation aircraft shoots at a ship without hanging a missile
  // off a pylon and becoming a fourth-generation aircraft.
  jsm: { name: 'Joint Strike Missile (air-launched NSM)', scope: 'JSM',
    range: '300 nm, carried internally — the only anti-ship round that does not cost the F-35 its signature' },
  // The heaviest thing anyone can put into a ship. 650 lb of PBXN under the
  // keel, wire-guided the whole way, and the explosion is not the mechanism —
  // the gas bubble collapsing under an unsupported hull is, which is why a
  // heavyweight breaks a frigate's back rather than holing her.
  mk48: { name: 'Mk 48 ADCAP heavyweight torpedo', cs: 'TOLEDO', scope: 'Mk 48 ADCAP',
    range: 'under the keel — a heavyweight does not hole a ship, it breaks her in half' },
  // The air-dropped lightweight, and the only anti-SUBMARINE weapon on the
  // board. It is here to make the point that the eight rounds above it are not
  // poor against a submerged boat, they are irrelevant: a sea-skimming missile
  // with a seeker pointed at the surface has nothing to look at.
  mk54: { name: 'Mk 54 lightweight torpedo', scope: 'Mk 54',
    range: 'dropped on a sonobuoy solution — finding her is the hard part and the weapon is the easy one' },
};

// Deck canisters of NSM in the escort screen, and the second magazine on this
// board that nobody reloads underway. Deliberately tiny: eight rounds is what a
// screen actually carries, and it is the reason NSM is a decision rather than a
// default. It refills off the same ammunition ship as the interceptor cells —
// see orderRearm — so the rearm order now buys back two magazines and the three
// nights off station buy a little more than they used to.
const NSM_LOAD = 8;

const ASSET_NAMES = {
  f35: '5th-gen sorties (F-35/F-22)',
  fighter: '4th-gen sorties (F-15E/F-16/F-18)',
  cruise: 'Cruise missiles (TLAM)',
  stealth: 'B-2 bomber missions',
  heavy: 'Heavy bomber missions (B-1/B-52)',
};

// ---- projection scale ----
// The map is equirectangular (standard parallel 28°N): ~33.4 px/°lon,
// ~37.8 px/°lat, which works out to 0.34 projected units per km.
const KM_TO_MAP = 0.34;

// ---- flight animation config ----
// Animation length (ms) for each strike asset's map animation
// `sub` is not an asset type — it is the submarine shot, keyed separately
// because a torpedo runs to the datum at 55 knots, not at 500, and the sonar
// display is worth the extra seconds on screen.
const FLIGHT_DUR = { f35: 10500, fighter: 10500, stealth: 16000, heavy: 14000, cruise: 6500, sub: 13000 };

// Airframes by tier: a random one flies each package. cs is the callsign root;
// from decides whether it launches off a carrier or a land base. The split is
// the whole point of the force structure — the 5th-gen pool is what flies on
// night one, the 4th-gen pool is what floods in once the belt is broken, and
// the heavies come off the Fairford ramp at the end.
// `sil` names the scope silhouette in map.js. Every table below picks an
// airframe per sortie and then announces it by name in the scope header — so
// the shape on the glass has to match the name above it, or the header reads as
// flavour text. A B-1 and a B-52 share nothing but a ramp: one is a swing-wing
// dagger, the other is a plank with eight engines. The same was true of the
// fighters for longer — a Viper, an Eagle and a Rhino all flew as one generic
// dart, which quietly cost the tier split its only visual payoff: the night the
// 4th-gen pool starts flooding in is supposed to LOOK different from night one.
const F35_TYPES = [
  { type: 'F-35A', cs: 'PANTHER', from: 'land', sil: 'f35' },
  { type: 'F-35C', cs: 'WARLOCK', from: 'carrier', sil: 'f35' },
  // The Raptor already flies — it sits in the 5th-gen pool, so any land-based
  // F-35 package can come up RAPTOR — but nothing yet tasks it AS a Raptor:
  // there is no air-superiority mission for it to own, and a strike sortie is
  // not what it is for. Until there is, the shape is the only thing that says
  // one is up there.
  { type: 'F-22A', cs: 'RAPTOR', from: 'land', sil: 'f22' },
];
const FIGHTER_TYPES = [
  { type: 'F/A-18E', cs: 'RHINO', from: 'carrier', sil: 'f18' },
  { type: 'F-16CM', cs: 'VIPER', from: 'land', sil: 'f16' },
  { type: 'F-15E', cs: 'MUDHEN', from: 'land', sil: 'f15' },
  { type: 'F/A-18F', cs: 'GUNSLINGER', from: 'carrier', sil: 'f18' },
];
const HEAVY_TYPES = [
  { type: 'B-1B', cs: 'BONE', from: 'land', sil: 'b1' },
  { type: 'B-52H', cs: 'BUFF', from: 'land', sil: 'b52' },
];

// Every in-flight status / problem message lives here — edit freely.
//   at:    fraction of the flight when the entry fires (values > 1 fire on the
//          egress leg home, where 1.0 = weapons away and 2.0 = animation end)
//   kind:  'status' always fires; 'problem' fires with probability `chance`
//   only:  restricts an entry to one tier ('stealth' | 'heavy' | 'f35' |
//          'fighter') or to a family — 'bomber' is both bomber tiers, 'fighter'
//          is both manned fighter tiers. 'stealth' is the B-2 alone, which
//          matters: it is the only thing that still stages out of the Indian
//          Ocean, and the heavies fly the Fairford leg instead.
//   msgs:  one is picked at random; {cs} {base} {tgt} are substituted
const FLIGHT_EVENTS = [
  { at: 0.02, kind: 'status', msgs: [
    '{cs} wheels up — departing {base}',
    '{cs} airborne out of {base}, climbing on mission profile',
  ] },
  { at: 0.18, kind: 'status', only: 'stealth', msgs: [
    'Aerial refueling over the Indian Ocean — tanker rendezvous complete',
  ] },
  { at: 0.22, kind: 'status', only: 'fighter', msgs: [
    'On the tanker — topping off before the push',
    'Refueling complete — pushing to the line',
  ] },
  { at: 0.30, kind: 'status', only: 'heavy', msgs: [
    'Heavy is on the boom over the eastern Med — full offload, then the run in',
    'Cell is joined and level — running the whole target set off one pass',
  ] },
  { at: 0.90, kind: 'status', only: 'heavy', msgs: [
    'Bomb bay doors open — full load, walking the aimpoints',
  ] },
  { at: 0.42, kind: 'status', msgs: [
    'Feet dry — entering contested airspace',
    'Crossing into Iranian airspace — emissions control, sensors cold',
  ] },
  { at: 0.55, kind: 'problem', chance: 0.4, msgs: [
    'SAM search radar spike — defensive maneuvering',
    'GPS jamming detected — reverting to inertial guidance',
    'Iranian interceptors scrambling — flight is committing anyway',
  ] },
  { at: 0.72, kind: 'problem', chance: 0.35, msgs: [
    'SA-15 launch detected — countermeasures out',
    'Heavy AAA over the target area',
    'Threat ring active — rerouting around the engagement zone',
  ] },
  { at: 0.86, kind: 'status', msgs: [
    'Final attack run — master arm hot',
    'Target designated — weapons release imminent',
  ] },
  { at: 0.99, kind: 'status', msgs: ['ON TARGET — weapons away'] },
  { at: 1.15, kind: 'status', msgs: [
    'Off target — egressing the threat envelope at speed',
  ] },
  { at: 1.75, kind: 'status', msgs: [
    '{cs} feet wet — RTB {base}',
    '{cs} clear of Iranian airspace — returning to {base}',
  ] },
];

// TLAMs fly themselves — no crew, no tanker, no egress. Their own short set of
// lines keeps the scope reading as an unmanned shot rather than a sortie.
const CRUISE_EVENTS = [
  { at: 0.02, kind: 'status', msgs: [
    '{cs} away — vertical launch, {base}',
    'Birds away from {base} — {cs} in the boost phase',
  ] },
  { at: 0.35, kind: 'status', msgs: [
    'Terrain-following, sea-skimming profile — {cs} in the weeds',
    'Midcourse waypoints good — {cs} tracking on inertial',
  ] },
  { at: 0.7, kind: 'problem', chance: 0.3, msgs: [
    'Weather over the target — cloud deck degrading the terminal seeker',
    'One bird lost to a booster fault after launch — remainder pressing',
    'Targeting package flagged stale — running on last-good coordinates',
  ] },
  { at: 0.99, kind: 'status', msgs: ['TERMINAL — {tgt} impact'] },
];

// A submarine shot is a different kind of quiet. There is no tanker, no
// formation and nothing for Iran to see coming — the whole event is a boat
// holding a firing solution long enough to put one heavyweight in the water,
// steering it down the wire, and then going deep. The weapon runs for minutes,
// not seconds, and the target never hears it until the seeker goes active.
const SUB_EVENTS = [
  { at: 0.02, kind: 'status', msgs: [
    '{base} at firing depth — tube one, {cs} away, wire good',
    'Firing solution good — {cs} swimming out of tube one, {base} steering',
  ] },
  { at: 0.22, kind: 'status', msgs: [
    'Weapon running normal — 40 knots on the wire, medium speed to the datum',
    '{cs} on course down the wire — {base} holding the solution passive',
  ] },
  { at: 0.46, kind: 'status', msgs: [
    'Steering correction sent — {cs} coming right onto the updated track',
    'Passive bearing drift on {tgt} — wire correction away to the weapon',
  ] },
  { at: 0.62, kind: 'status', msgs: [
    'ENABLE — {cs} going active, seeker searching',
    'Wire cut — {cs} enabled on its own sonar, autonomous from here',
  ] },
  { at: 0.86, kind: 'status', msgs: [
    'ACQUISITION — {cs} has the hull, closing at 55 knots',
    'Seeker locked on {tgt} — weapon in terminal, going under the keel',
  ] },
  { at: 0.99, kind: 'status', msgs: ['UNDER-KEEL DETONATION — {tgt}'] },
];

// Written the moment the noisemaker actually goes in the water, so the line and
// the false target on the sonar display are the same event — the same contract
// SAM_LINES has with the streak on a radar scope.
const TORPEDO_CM_LINES = [
  'Countermeasures — {tgt} put a noisemaker over the side and turned away',
  '{tgt} at flank, knuckle in the water — {cs} reattacking around the false target',
  'Decoy blooming in the seeker picture — {cs} sorting the hull out of the noise',
];

// Fired into the scope's status lines the moment a SAM actually leaves the ring,
// so the text and the streak on the mini display are the same event.
const SAM_LINES = [
  'SA-15 launch detected — countermeasures out',
  'SA-20 uplink — missile inbound, breaking hard',
  'Launch warning — flares and chaff away',
  'Engagement radar locked — defeating with a beam maneuver',
];

// ---- the intercept: a Fulcrum comes up, once in a very long while ----
// An Easter egg, and it is allowed to be one because it costs nothing. It is
// the same contract every other thing on that display signs: computeStrike()
// has already decided the sortie, and the merge changes no roll, kills no
// aircrew and moves no number. It is theatre, on a display whose whole job is
// theatre — the difference is that this is the one piece of theatre the player
// is not expecting, and most campaigns will never see it at all.
//
// The bandit is a MiG-29A because that is what Iran actually has to send up.
// The IRIAF's fighter inventory is otherwise American and it is old — Tomcats,
// Phantoms and Tigers, none of them delivered after 1979 — and the only Soviet
// fighter on the ramp is the Fulcrum: a couple of squadrons out of Mehrabad,
// plus the airframes Iraq flew into Iran in 1991 and never got back. It is
// also the only jet in the theater a player reads as "a MiG" without being
// told, which is the other half of what an Easter egg needs.
//
// TURNS 1-5 ONLY. The Fulcrum force is small, it flies without tankers, and it
// is the first thing a campaign grinds off the board. A MiG coming up in week
// two would be the game claiming Iran still has an air force — which is
// exactly the thing the opening five turns are supposed to have settled.
//
// And OUR SIDE ALWAYS WINS. Not because the sim is generous: because the sim
// is not consulted. An engagement that could go the other way is a coin toss
// bolted onto a strike whose odds the player already accepted, and the aircrew
// loss model in computeStrike() is where losing an aircraft is supposed to be
// decided. So the Fulcrum dies every time, and nothing that happens in the
// merge is ever written down anywhere.
const DOGFIGHT = {
  chance: 1 / 50,   // rolled once per manned fighter sortie
  lastTurn: 5,      // and only while Iran still has fighters worth scrambling
  at: 0.3,          // how far into the ingress the contact appears
  ms: 8900,         // contact to rejoin — the whole engagement, on the scope
};

// Radio for the merge. Brevity, because a fight is the one part of a sortie
// with no time in it for a sentence: BANDIT is a contact declared hostile,
// TALLY is eyes on it, FOX TWO is a heat-seeker off the rail, SPLASH is the
// other aircraft hitting the ground. {brg} and {rng} are filled from where the
// contact actually is on the glass, so the call and the shape agree.
const DOGFIGHT_LINES = {
  contact: [
    'BANDIT, BANDIT — SINGLE CONTACT {brg} FOR {rng}, HOT',
    'POP-UP GROUP {brg}, {rng} MILES, CLOSING — DECLARED HOSTILE',
    'SINGLE CONTACT {brg} FOR {rng}, COMMITTING ON THE PACKAGE',
  ],
  tally: [
    '{cs} TALLY ONE — FULCRUM, AND HE IS COMMITTING',
    '{cs} ENGAGED, ONE FULCRUM — BREAKING INTO HIM',
    'TALLY, MiG-29 — {cs} IS ANCHORED AND TURNING WITH HIM',
  ],
  shot: [
    '{cs} FOX TWO',
    'IN THE SADDLE — {cs} FOX TWO',
    '{cs} FOX TWO, GOOD TONE',
  ],
  splash: [
    'SPLASH ONE — FULCRUM DOWN',
    'GOOD KILL, GOOD KILL — SPLASH ONE FULCRUM',
    'SPLASH ONE. HE IS BURNING ON THE DESERT FLOOR',
  ],
  rejoin: [
    '{cs} IS CLEAN — REJOINING, PRESSING TO {tgt}',
    'NO FURTHER CONTACTS — {cs} BACK ON THE TRACK',
    '{cs} REJOINING THE PACKAGE, CONTINUING TO {tgt}',
  ],
};

// ---- Iranian counterattack launch sites (projected coords inside Iran) ----
// Missile salvos rise from the surviving missile-base targets (tgtId links a
// site to its TARGETS entry — destroyed bases stop launching); the last entry
// is the fallback for dispersed IRGC launchers. Drones swarm from the interior.
const IRAN_LAUNCH_SITES = {
  missile: [
    { x: 285, y: 196, tgtId: 'msl-kermanshah' },
    { x: 469, y: 374, tgtId: 'msl-shiraz' },
    { x: 321, y: 221, tgtId: 'msl-khorramabad' },
    { x: 434, y: 152 },
  ],
  drone: [
    { x: 330, y: 262 },
    { x: 402, y: 305 },
    { x: 528, y: 418 },
  ],
};

// ---- Hormuz indicator location ----
const HORMUZ_POS = { x: 607, y: 494 };

// ---- Heads of government who ring the White House personally ----
// Two occasions, and they are not the same kind of call. Assembling the
// coalition is the one diplomatic action that puts other governments' names on
// the operation, so it is the one that earns a courtesy: both allies ring —
// London first, off the cable itself, then Paris the following turn (see
// `leaderCalls` in game.js). Taking a call is worth +1 world opinion, refusing
// it -1. Deliberately small numbers — that is a courtesy, not a lever, and it
// should never be worth farming. The whole point is that it costs the player
// nothing but a click and they still have to decide whether to be bothered.
//
// The third entry is the other kind, and it is the reason `stakes` exists as a
// field rather than a pair of literals in game.js: Jerusalem does not ring to
// thank anybody. See the Israeli entry below.
//
// `stakes` is what answering is worth, banked at pickup. The keys are the
// currencies UI.openLeaderCall knows how to write on the card, and a branch
// with nothing in it is a branch that costs nothing — the card simply shows no
// number, which is the honest rendering of a call that is information rather
// than a transaction.
//
// Each leader has two versions of the same call, chosen on world opinion at the
// moment the coalition forms (LEADER_STRONG_WORLD). Above the line the ally
// gives you the most it has in it to give; at or below it the same government
// gives you markedly less. For London that is the distance between putting the
// RAF under your command and offering everything except aircraft — bases,
// intelligence and sanctions, with a flat no to offensive operations. For Paris
// it is the distance between a defensive contribution and refusing to take part
// at all. France is the ally who is never fully in, and the good version of her
// call is still a no to anything that flies against Iran.
//
// Which means below the line neither ally puts a strike aircraft over Iran, and
// the coalition cable says so — see the `coalition` case in game.js, where the
// prose branches on the same tone. The sortie capacity the action grants does
// not branch: at that tone it is the Gulf partners flying, not the RAF.
//
// `clip` keys into AudioSys.FILES; `caption` is the fallback shown when the
// audio can't play (muted, autoplay refused, file missing) and is written as a
// paraphrase rather than a transcript so it can never contradict the recording.
// `declined` is shared across both versions — the snub reads the same however
// warm the call was going to be. `pin` selects which flag goes on the secure
// terminal UI.drawLeader() builds — the only thing on that card that varies by
// country, now that the cartoon portrait and its four colour fields are gone.
const LEADER_STRONG_WORLD = 75;   // world opinion ABOVE this gets the unhedged call

const WORLD_LEADERS = [
  {
    id: 'uk',
    name: 'The Prime Minister of the United Kingdom',
    // `office` alone goes on the call card, where the country is already the
    // line above it; `name` is the full title and goes in the sentence.
    office: 'The Prime Minister',
    country: 'UNITED KINGDOM',
    pin: 'union',
    stakes: { accept: { world: 1 }, decline: { world: -1 } },
    declined: 'You let it go to the Secretary of State. It is noticed. A Number 10 spokesman is ' +
      'asked whether the Prime Minister has spoken to the President and declines to say — which ' +
      'is itself the story by the evening broadcasts.',
    strong: {
      clip: 'ukPmCallStrong',
      caption: 'The Prime Minister commits the RAF to joint strikes against Iran and tells you ' +
        'to consider British squadrons under your command.',
      accepted: 'You take the call. Downing Street briefs it out within the hour and hedges not ' +
        'one word of it — RAF squadrons are flying your missions against your targets, and the ' +
        'operation has a second flag on it that nobody had to be pressured into flying.',
    },
    standard: {
      clip: 'ukPmCall',
      caption: 'The Prime Minister offers basing, intelligence and joint sanctions — but tells ' +
        'you Britain will not take part in offensive operations against Iran.',
      accepted: 'You take the call. London gives you everything except the thing you asked for: ' +
        'the bases, the intelligence take, its name on the sanctions. British aircraft stay on the ' +
        'ground, and the readout is worded carefully enough that the distinction survives contact ' +
        'with the evening broadcasts.',
    },
  },
  {
    id: 'france',
    // France's head of state is the President, and the Élysée — not Matignon —
    // is who a US president calls about a war. The `clip` ids below still read
    // `francePmCall`: they are keys into AudioSys.FILES pointing at recordings
    // that already exist under those filenames, and they are never shown.
    name: 'The President of France',
    office: 'The President',
    country: 'FRANCE',
    pin: 'tricolore',
    stakes: { accept: { world: 1 }, decline: { world: -1 } },
    declined: 'You let it go to the Secretary of State. Paris reads the snub exactly as a snub. ' +
      'Whatever the President intended to say to you privately is said in public instead, ' +
      'and the French position on this war hardens a degree overnight.',
    strong: {
      clip: 'francePmCallStrong',
      caption: 'The President offers French forces in a defensive role only — nothing that ' +
        'flies against Iran — and urges restraint and a negotiated end to the war.',
      accepted: 'You take the call. The Élysée readout is careful about what it is not: French ' +
        'assets are committed to the defence of the region and to nothing beyond it, and every ' +
        'line after that is about the diplomatic track. It is as far as Paris will go, and the ' +
        'President went to the trouble of saying it to you directly.',
    },
    standard: {
      clip: 'francePmCall',
      caption: 'The President tells you France will not take part in the operation, and ' +
        'warns you — plainly, on a secure line — not to make a mistake.',
      accepted: 'You take the call. There is no warm readout to brief out: Paris confirms only ' +
        'that the two of you spoke. France is out, and the President thought enough of the ' +
        'relationship to say so directly rather than let you learn it from a communiqué. ' +
        'Taking the call was the only part of this you controlled.',
    },
  },
  // ---- and the call that is not a courtesy ----
  // Placed by Jerusalem one turn out from a unilateral launch — the same secure
  // line, the same popup, an entirely different conversation. Queued in
  // `israelTurn` off israelEta() rather than off a threshold of its own, so the
  // night the Prime Minister says "tomorrow" is the night the ALLIES panel has
  // been saying it too; see the comment at the queue site in game.js.
  //
  // Sidelined Israel only, and at most once a war. A coordinated Israel is
  // already inside the tasking order and has nothing to threaten; a unilateral
  // one has already carried the threat out, and an ultimatum is spent the
  // moment it is executed.
  //
  // ON THE STAKES. Taking it buys nothing and that is deliberate: this call is
  // information, and the information is the whole payload — a president who
  // picks up gets one turn's notice and two real answers to it (bring them
  // inside the tasking order, or ask them to hold). The snub is charged AT
  // HOME, which is where this game has always billed the Israel relationship —
  // see `holdApproval` in ISRAEL, the one diplomatic action priced in approval
  // rather than standing abroad. Standing abroad is about to take the
  // unilateral strike's own -15 regardless, and charging the snub there too
  // would be the same event billed twice. It cannot be farmed in either
  // direction: it fires once, unprompted, and the branch worth taking is the
  // one that costs nothing.
  {
    id: 'israel',
    name: 'The Prime Minister of Israel',
    office: 'The Prime Minister',
    country: 'ISRAEL',
    pin: 'magen',
    stakes: { accept: {}, decline: { approval: -3 } },
    // The switchboard's own line, overriding the courtesy announcement — an
    // ally asking to be put through is not the same event as an ally who has
    // been holding since the evening and is not asking for an appointment.
    announce: 'Mr. President, the Prime Minister of Israel is holding on the secure line — ' +
      'not through the Embassy, and not asking for an appointment.',
    declined: 'You let it go to the Secretary of State. The message is delivered anyway, ' +
      'to a Cabinet Secretary rather than to you, and Jerusalem makes sure the sequence is on ' +
      'the record: that the warning was given, that it was given in time, and that the ' +
      'President of the United States was not on the line to hear it.',
    standard: {
      clip: 'israelPmCall',
      caption: 'The Prime Minister tells you Iran has left Israel no choice but to defend ' +
        'itself, and asks you to coordinate — or Israel is prepared to act alone.',
      accepted: 'You take the call. It is short and there is nothing conditional in it: the ' +
        'Israeli Air Force is ready to go against the program, and Jerusalem would rather go ' +
        'inside your plan than around it. What you have bought by picking up is a night of ' +
        'warning and the two answers that fit inside one — fold them into the tasking order, ' +
        'or ask them, again, to wait.',
    },
  },
];

// ---- Filler headlines (mixed into the ticker every turn) ----
const FILLER_HEADLINES = [
  'MARKETS ON EDGE AS GULF WAR ENTERS ANOTHER DAY',
  'PENTAGON DECLINES COMMENT ON FORCE MOVEMENTS',
  'ALLIES SEEK CLARITY ON WASHINGTON\'S ENDGAME',
  'SHIPPING INSURERS RAISE GULF TRANSIT PREMIUMS AGAIN',
  'CONGRESSIONAL LEADERS BRIEFED IN CLOSED SESSION',
  'EU CALLS EMERGENCY MEETING ON ENERGY SECURITY',
  'TEHRAN STATE TV AIRS FOOTAGE OF MISSILE UNITS ON THE MOVE',
  'FIFTH FLEET: TRANSITS CONTINUING "AS CONDITIONS PERMIT"',
  'OPEC MEMBERS SIGNAL SPARE CAPACITY IS LIMITED',
  'UN SECRETARY-GENERAL URGES "MAXIMUM RESTRAINT"',
];
