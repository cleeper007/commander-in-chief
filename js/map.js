// ============================================================
// map.js — SVG map rendering, pan/zoom, target icons, strike FX
// ============================================================

const MapView = (() => {
  let svg, world, tooltip;
  let view = { x: 0, y: 0, k: 1 };
  let panning = false, panStart = null;
  // Forward basing starts SHOWN. Where the American bases are is the first
  // thing a president needs off this map, and hiding it behind a button meant
  // most players never saw Kuwait or Jordan at all. The BASES button is now a
  // way to clear the clutter, not a way to find it.
  let forwardOn = true;

  // FAST FORWARD — the player asked for the result, not the show. Everything
  // that animates on a clock checks this flag and collapses to its end state:
  // runs already in the air resolve on their next frame, anything queued behind
  // them never draws at all. Nothing here changes an outcome — the BDA and the
  // Iranian answer are already decided by the time the pixels move.
  let ff = false;

  const rand = CosmeticRandom.int;
  const pick = CosmeticRandom.pick;

  // Real geography lives in geodata.js (COUNTRY_PATHS, Natural Earth 50m).
  // Label anchors are hand-placed in the same projected coordinate space.
  const COUNTRY_LABELS = [
    { name: 'IRAN', x: 533, y: 272 },
    { name: 'IRAQ', x: 160, y: 276 },
    { name: 'SAUDI ARABIA', x: 233, y: 585 },
    { name: 'TURKMENISTAN', x: 633, y: 49 },
    { name: 'AFGHANISTAN', x: 917, y: 215 },
    { name: 'PAKISTAN', x: 933, y: 453 },
    { name: 'OMAN', x: 627, y: 642 },
    { name: 'UAE', x: 563, y: 600 },
    { name: 'TURKEY', x: 67, y: 34 },
    { name: 'SYRIA', x: 33, y: 170 },
    { name: 'YEMEN', x: 290, y: 900 },
    // Muwaffaq Salti sits at (-58,289) and hangs its name at y+17 — i.e. exactly
    // where JORDAN used to be. Pushed down into the empty southern desert, which
    // is still inside the polygon and clear of the Israeli fields to the west.
    { name: 'JORDAN', x: -72, y: 350 },
    { name: 'ISRAEL', x: -112, y: 290 },
    { name: 'LEBANON', x: -88, y: 205 },
    { name: 'BAHRAIN', x: 401, y: 508 },
    { name: 'QATAR', x: 423, y: 540 },
  ];

  const SEAS = [
    { name: 'PERSIAN GULF', x: 390, y: 457 },
    { name: 'GULF OF OMAN', x: 667, y: 551 },
    { name: 'ARABIAN SEA', x: 760, y: 715 },
    { name: 'CASPIAN SEA', x: 423, y: 38 },
  ];

  // ---- islands below the 50m cutoff ----
  // Natural Earth 50m carries Bahrain (570 km2) and Qeshm (1,500) and drops
  // everything much under a hundred. Kharg is 22 km2 — so the terminal that
  // loads ~90% of Iranian crude, the single most consequential aimpoint on the
  // oil list, was a marker floating on open water with no land under it at any
  // zoom. The one place on this chart where a player would go looking for the
  // island is the one place it was not.
  //
  // Hand-carried rather than added to geodata.js, which says at the top of
  // itself that it is generated: a regeneration from Natural Earth would drop
  // this again, silently, because 50m is exactly what does not have it. The
  // outline is OSM coastline way 13237968 (ODbL) run through geodata.js's own
  // projection — x = (lon - 38.5) * 1000/30, y = (39.5 - lat) * 1000/30 /
  // cos(28) — which lands the ring around TARGETS' hand-placed kharg at
  // (394, 387) with the marker inside it. That is the check that this is the
  // right island in the right place, and it is not a coincidence worth
  // trusting twice: anything added here gets the same test.
  //
  // Two decimals, not geodata's one. A country quantised to 0.1 units (~300 m)
  // loses nothing; an island 1.80 x 2.57 units across quantised to 0.1 is an
  // eighteen-step staircase. Douglas-Peucker at 0.02 units (~59 m) — the finest
  // detail MAX_ZOOM can put on a pixel — takes 699 points to 94 and holds the
  // area at 21.96 km2 against the source's 21.92.
  //
  // Drawn in MAP UNITS and deliberately not in the counter-scaled group with
  // the icons: per the note above syncIconScale, a symbol is a statement about
  // a place and an island is a measurement of one. Measured on a 1600px window,
  // that is a 2 x 3 px speck under the marker at the opening view and 21 x 30 px
  // at k=10, against a ring counter-scaled to a constant 21 — so zooming in
  // walks the coast out from under its own icon, north and south tips first.
  // Small either way, and correctly so: five kilometres on a chart three
  // thousand across. Kharku, 1.6 units northeast, is still absent — same
  // cutoff, and no aimpoint on it.
  const ISLANDS = [
    { name: 'Iran', cls: 'iran', d: 'M393.6,388.37L393.68,388.54L393.83,388.54L393.88,388.6L394.03,388.55L394.04,388.57L394.12,388.52L394.14,388.54L394.12,388.5L394.19,388.47L394.36,388.26L394.47,388.3L394.47,388.2L394.45,388.25L394.35,388.21L394.37,388.11L394.44,388.12L394.44,388.04L394.41,388.02L394.42,388.1L394.33,388.1L394.37,388.02L394.31,388.07L394.25,387.85L394.27,387.85L394.25,387.73L394.29,387.68L394.38,387.69L394.39,387.64L394.34,387.53L394.36,387.66L394.27,387.66L394.28,387.56L394.21,387.43L394.28,387.12L394.36,387.13L394.39,387.07L394.36,387.12L394.28,387.09L394.32,387.06L394.32,386.98L394.37,386.88L394.42,386.9L394.47,386.83L394.43,386.79L394.54,386.58L394.31,386.44L394.28,386.36L394.26,386.44L394.23,386.43L394.26,386.41L394.16,386.38L394.17,386.35L394.14,386.37L394.18,386.32L394.27,386.34L394.25,386.31L393.99,386.38L393.77,386.22L393.73,386.25L393.74,386.33L393.71,386.33L393.42,386.13L393.33,386.12L393.31,386.09L393.2,386.1L393.13,386.03L392.8,386.14L392.74,386.24L392.89,386.47L393.01,386.53L393.03,386.58L392.93,386.65L393.04,386.6L393.06,386.64L392.98,386.7L393.08,386.69L393.02,386.74L393.11,386.72L393.17,387.04L393.16,387.22L393.12,387.24L393.23,387.31L393.25,387.5L393.31,387.56L393.35,387.72L393.35,387.76L393.31,387.79L393.36,387.77L393.39,387.82L393.48,388.24L393.51,388.29L393.52,388.27L393.55,388.29Z' },

    // ---- the Strait of Hormuz ----
    // Same cutoff, same fix, one notch further down. 50m carries Qeshm (1,500
    // km2) and then nothing at all in the strait, so the chokepoint this game
    // turns three mechanics on — the barrel, the dove gauge, GULF's whole
    // fold — was drawn as one big island and open water. No Hormuz, no Larak,
    // no Hengam, and none of the disputed group `naval-covert` names in its own
    // region line while sitting on it. Six outlines, largest first, 1.4 to 48
    // km2. The smallest of them is 0.62 x 0.52 units — under a pixel at the
    // opening view, which is exactly why the names below are a separate
    // decision from the coastlines.
    //
    // Same provenance and the same test as Kharg: OSM coastline through
    // geodata.js's own projection, checked against a marker this game already
    // places. Bandar Abbas' naval aimpoint is at (590,467) and Hormuz Island
    // lands 8 units south-east of it, which is where it is. Abu Musa is the
    // second check and it FAILED — `naval-covert` was hand-placed at (520,498),
    // a hundred kilometres of open water west of its own island, near enough to
    // Farur to look deliberate. The marker moved onto the island (data.js), not
    // the island onto the marker. That is what the comment above means by not
    // trusting the coincidence twice; it was not a coincidence the second time.
    //
    // Douglas-Peucker at the same 0.02 units and the same two decimals, which
    // holds every area inside 0.5% of the source. `data-country` is 'Iran' on
    // all six, the three the UAE claims included. That is not an adjudication —
    // it is what this game already models, a swarm base Tehran runs fast-attack
    // craft and anti-ship launchers off. Tagged 'United Arab Emirates' they
    // would flash with Abu Dhabi's mood out of gulfTurn, on the islands the
    // president is being asked to bomb.
    // Hormuz — 40.5 km2, OSM relation 3387931
    { name: 'Iran', cls: 'iran', d: 'M599.19,468.5L599.15,468.53L598.68,468.45L598.5,468.27L598.42,468.03L598.28,468.32L598.2,468.36L598.1,468.33L598.21,468.37L598.15,468.46L598.03,468.37L598.06,468.29L598.03,468.38L598.14,468.46L598.13,468.57L598.09,468.63L598.0,468.65L597.85,468.85L597.52,469.04L597.49,469.11L597.55,469.35L597.42,469.47L597.38,469.66L597.41,469.78L597.35,469.89L597.42,470.0L597.55,470.12L597.54,470.2L597.94,470.44L598.25,470.46L598.33,470.52L598.68,470.64L598.99,470.64L599.05,470.61L599.16,470.65L599.44,470.42L599.57,470.4L599.86,470.28L599.88,470.25L599.81,470.21L599.8,470.12L599.9,469.99L600.04,469.68L600.02,469.65L600.05,469.55L600.03,469.47L600.07,469.39L600.01,469.25L600.01,469.18L599.95,469.02L599.88,468.95L599.66,468.89L599.61,468.76L599.5,468.7L599.47,468.5L599.39,468.39L599.28,468.36Z' },
    // Larak — 47.9 km2, OSM way 160052075
    { name: 'Iran', cls: 'iran', d: 'M596.35,476.23L596.32,476.26L595.65,476.24L595.62,476.26L595.34,476.17L595.17,476.04L595.13,476.05L594.76,476.46L594.58,476.56L594.53,476.68L594.39,476.83L594.35,476.91L594.28,476.93L594.19,477.09L594.09,477.13L593.99,477.28L593.91,477.29L593.89,477.51L593.84,477.54L593.82,477.96L593.94,478.28L594.18,478.53L594.2,478.6L594.16,478.62L594.18,478.65L594.31,478.64L594.32,478.58L594.45,478.54L594.62,478.53L594.76,478.57L594.77,478.6L594.87,478.59L594.94,478.57L594.93,478.52L594.99,478.48L595.58,478.36L595.6,478.32L595.82,478.22L595.8,478.17L595.83,478.14L595.96,478.1L596.0,478.04L596.07,478.03L596.28,477.86L596.43,477.81L596.67,477.58L596.93,477.2L597.1,476.81L597.12,476.66L597.09,476.57L597.01,476.62L596.96,476.6L596.76,476.29Z' },
    // Hengam — 32.9 km2, OSM way 656361290
    { name: 'Iran', cls: 'iran', d: 'M579.81,483.92L579.86,483.82L579.83,483.79L579.85,483.84L579.82,483.9L579.76,483.8L579.8,483.78L579.75,483.8L579.71,483.75L579.64,483.87L579.25,483.95L579.26,484.1L579.22,484.12L579.21,484.25L579.17,484.27L579.17,484.35L578.97,484.47L578.95,484.57L578.92,484.57L578.91,484.65L578.84,484.73L578.79,484.89L578.75,484.9L578.71,484.99L578.7,485.05L578.64,485.08L578.63,485.15L578.59,485.12L578.58,485.28L578.5,485.49L578.45,485.53L578.45,485.7L578.34,485.71L578.35,485.76L578.31,485.83L578.28,485.82L578.26,485.91L578.16,485.92L578.15,486.19L578.34,486.38L578.35,486.44L578.39,486.45L578.44,486.42L578.5,486.47L578.54,486.57L578.6,486.52L578.8,486.59L578.82,486.5L579.11,486.51L579.18,486.5L579.3,486.42L579.41,486.42L579.58,486.36L579.93,486.09L580.08,485.84L580.07,485.73L580.1,485.56L580.27,485.19L580.31,485.17L580.31,485.08L580.41,484.96L580.49,484.75L580.39,484.75L580.34,484.67L580.32,484.33L580.11,484.17L580.11,484.11L580.04,484.11Z' },
    // Greater Tunb — 10.8 km2, OSM way 160056026
    { name: 'Iran', cls: 'iran', d: 'M560.75,499.57L560.73,499.37L560.54,499.03L560.49,499.0L560.26,499.0L560.05,499.22L559.88,499.26L559.86,499.24L559.73,499.31L559.68,499.44L559.62,499.45L559.59,499.67L559.55,499.75L559.51,499.76L559.52,499.93L559.62,499.93L559.78,500.23L559.91,500.31L559.88,500.28L559.91,500.26L559.93,500.3L559.98,500.26L560.18,500.31L560.44,500.26L560.56,500.31L560.65,500.3L560.75,500.24L560.74,500.07L560.71,500.06L560.73,500.03L560.69,499.96L560.76,499.71L560.81,499.71L560.75,499.68L560.76,499.58L560.86,499.6L560.89,499.71L560.87,499.59Z' },
    // Lesser Tunb — 1.4 km2, OSM way 160056054
    { name: 'Iran', cls: 'iran', d: 'M555.15,500.59L555.18,500.54L555.23,500.54L555.23,500.59L555.23,500.53L555.0,500.45L554.93,500.35L554.78,500.34L554.7,500.27L554.65,500.29L554.61,500.35L554.66,500.35L554.69,500.39L554.69,500.5L554.73,500.52L554.73,500.63L554.8,500.67L554.8,500.79L555.07,500.75L555.07,500.72L555.11,500.72L555.15,500.61L555.23,500.61Z' },
    // Abu Musa — 12.6 km2, OSM way 468798441
    { name: 'Iran', cls: 'iran', d: 'M551.74,514.45L551.84,514.45L551.86,514.56L551.85,514.45L551.75,514.44L551.7,514.36L551.64,514.07L551.69,513.98L551.55,513.83L551.53,513.73L551.56,513.67L551.49,513.59L551.35,513.53L551.31,513.43L551.31,513.48L551.24,513.52L551.23,513.56L551.09,513.64L550.99,513.74L550.89,513.76L550.79,513.91L550.76,513.91L550.62,514.09L550.55,514.09L550.56,514.06L550.53,514.09L550.43,514.07L550.37,514.25L550.31,514.33L550.35,514.38L550.31,514.49L550.36,514.57L550.39,514.56L550.33,514.46L550.35,514.48L550.33,514.43L550.37,514.38L550.37,514.41L550.59,514.55L550.62,514.6L550.62,514.73L550.53,514.8L550.6,514.88L550.64,514.87L550.65,514.81L550.71,514.8L550.7,514.77L550.78,514.77L550.94,514.9L550.99,514.88L551.04,514.91L551.16,515.12L551.17,515.06L551.26,514.98L551.65,514.95L551.82,514.97L551.88,514.95L551.87,514.83L551.77,514.59L551.78,514.54L551.82,514.53L551.75,514.54Z' },
  ];

  // ---- island names, held back until the chart is open ----
  // Qeshm's outline is already in geodata.js, so it appears here as a name
  // only; the other five come off ISLANDS above. All six are held back to
  // .map-close-zoom (k>=2.2) — the tier that already means "resolve the
  // detail", where a hull takes its class and the flight deck grows fittings.
  // Six names printed at the opening view would be a smear across the one
  // stretch of this chart that is already carrying two Bandar Abbas aimpoints,
  // the HORMUZ: OPEN readout, a covert box and the Lincoln's own screen.
  //
  // Drawn on a target name's terms and not a sea label's: a FIXED world anchor
  // with the text counter-scaled about it (syncIconScale drives both), so the
  // name holds its size on screen and shrinks in MAP units every click the
  // player zooms in. That direction is the whole reason the layout works. The
  // tier it appears at is its most crowded moment and every zoom past it has
  // more room, so the anchors are tuned at k=2.2 and nothing after can get
  // worse. A world-scaled label — the sea labels' rule — would instead hold one
  // fixed degree of crowding at every zoom, and GREATER TUNB set beside its own
  // island is wider than Qeshm.
  //
  // The anchors are hand-placed against everything already in that water at
  // that zoom — both Bandar Abbas labels at their k=2.2 size, the strait
  // readout, Abu Musa's marker and each other — and every one is nearer the
  // island it names than any other island, and clear of every coastline
  // including its own, so a name reads as pointing at something rather than
  // sitting on it. Checked at 2.2, 2.5, 3, 4, 6 and 10.
  //
  // Two of those constraints were got wrong first and both are worth keeping.
  // The strait readout is sized against `HORMUZ: CONTESTED` and not the
  // `HORMUZ: OPEN` it is BUILT with — setHormuz rewrites it, CONTESTED is five
  // characters wider, it is centred so it grows both ways, and a war that opens
  // contested had GREATER TUNB printed through it on turn 1. And the clearances
  // are ~1.6 map units rather than whatever fits, because every advance here is
  // reckoned at 0.6em and --mono is five different fonts that do not agree on
  // that to the third decimal. A layout tuned to the last tenth of a unit is
  // one that holds on the machine it was tuned on.
  //
  // KHARG and ABU MUSA are deliberately not in here. The target list already
  // puts both names on this chart, and a chart that says ABU MUSA twice inside
  // a ring's width is one that has stopped being read. Abu Musa's marker is
  // covert, so its island stays unnamed until the folder finds what is on it —
  // which is the right way round rather than an omission. The island is a
  // place; the name arriving with the marker is the finding.
  const ISLAND_LABELS = [
    { name: 'QESHM',        x: 572.5, y: 477.1, anchor: 'end' },
    { name: 'HORMUZ',       x: 601.7, y: 469.3, anchor: 'start' },
    { name: 'LARAK',        x: 599.0, y: 481.6, anchor: 'start' },
    { name: 'HENGAM',       x: 582.4, y: 487.7, anchor: 'start' },
    { name: 'LESSER TUNB',  x: 552.8, y: 501.8, anchor: 'end' },
    { name: 'GREATER TUNB', x: 558.7, y: 496.0 },
  ];

  function el(tag, attrs = {}) {
    const n = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    return n;
  }

  // international radiation symbol: a 1.5r hub with three blades running from
  // r=2.2 out to r=5.4, each 60 degrees wide with 60 degrees of gap between.
  function radiationTrefoil() {
    const g = el('g', { class: 'tgt-core' });
    g.appendChild(el('circle', { r: 1.5 }));
    const blades = [
      'M-2.70,-4.68 A5.4,5.4 0 0 1 2.70,-4.68 L1.10,-1.91 A2.2,2.2 0 0 0 -1.10,-1.91 Z',
      'M5.40,0 A5.4,5.4 0 0 1 2.70,4.68 L1.10,1.91 A2.2,2.2 0 0 0 2.20,0 Z',
      'M-2.70,4.68 A5.4,5.4 0 0 1 -5.40,0 L-2.20,0 A2.2,2.2 0 0 0 -1.10,1.91 Z',
    ];
    for (const d of blades) g.appendChild(el('path', { d }));
    return g;
  }

  // Air defense: a shield broken open at the upper right with a missile driving
  // through the gap. The glyph used to be an erector-launcher, which is the same
  // object a ballistic missile brigade wears — two of the eight target types
  // reading as "vehicle with a tube on it" is one too many at map scale, and the
  // launcher belongs to the type that actually shoots at us. A shield says what
  // the site does to a package rather than what it looks like from the road.
  //
  // The ring is one open path, not an outer shape minus an inner one: it runs
  // anticlockwise round the outside from the top edge to the right flank, caps
  // across the wall thickness, and comes back along the inside. Everything is a
  // single fill because `.tgt-core` colours by status and nothing may hold its
  // own fill. Drawn at 0.8 so the missile's tail, which overhangs the shield's
  // shoulder, still lands inside the ±5.5 box the other glyphs live in.
  function airDefenseShield() {
    const g = el('g', { class: 'tgt-core', transform: 'scale(0.8)' });
    g.appendChild(el('path', { d:
      'M0.9,-5.25 C0.3,-5.1 0.1,-5.05 0,-5.02 C-2.1,-5.85 -4.4,-6.2 -6.0,-6.05 ' +
      'L-6.0,-1.2 C-6.0,2.7 -3.2,5.5 0,6.7 C1.8,6.0 3.4,5.0 4.6,3.7 ' +
      'L3.15,2.45 C2.35,3.35 1.3,4.15 0,4.75 C-2.2,3.6 -4.1,1.6 -4.1,-1.2 ' +
      'L-4.1,-4.05 C-2.9,-4.05 -1.4,-3.8 0,-3.35 C0.2,-3.4 0.6,-3.5 0.9,-3.58 Z' }));
    // inbound round, nose down-left: it threads the gap and stops short of the
    // far wall, so the two shapes never touch and merge into one blob at 12px
    const m = el('g', { transform: 'translate(1.99,-1.91) rotate(-35)' });
    m.appendChild(el('path', { d:
      'M-5.6,0 L-3.4,-0.95 L3.2,-0.95 L4.6,-2.5 L5.4,-2.5 L4.9,0 ' +
      'L5.4,2.5 L4.6,2.5 L3.2,0.95 L-3.4,0.95 Z' }));
    g.appendChild(m);
    return g;
  }

  // Ballistic missile brigade: a transporter-erector-launcher, tube raised and
  // slewed left off the back of a three-axle chassis. The breech steps up on the
  // tube's top edge only — squared off symmetrically it grew a corner that
  // pointed down into the chassis and the whole tail read as an arrowhead.
  function telLauncher() {
    // the drawn mass runs low and left — chassis and roadwheels at the bottom,
    // tube overhanging the nose — so the group is nudged back to sit centred in
    // the status ring rather than sagging into its lower-left arc
    const g = el('g', { class: 'tgt-core', transform: 'scale(0.85) translate(0.4,-0.45)' });
    // chassis, stepping down at the rear to a frame rail behind the cab
    g.appendChild(el('path', { d:
      'M-5.2,1.5 L2.0,1.5 L2.0,2.5 L5.4,2.5 L5.4,3.1 L3.0,3.1 L3.0,3.5 L-5.2,3.5 Z' }));
    for (const cx of [-3.7, -1.5, 0.7]) g.appendChild(el('circle', { cx, cy: 4.3, r: 1.2 }));
    const tube = el('g', { transform: 'translate(-0.73,-0.84) rotate(34)' });
    tube.appendChild(el('path', { d:
      'M-6.6,-0.25 L-5.6,-0.95 L2.3,-0.95 L2.3,-1.75 L4.2,-1.75 L4.2,0.95 L-5.6,0.95 Z' }));
    g.appendChild(tube);
    return g;
  }

  // Iranian tricolour flying from a staff. Keeps its national colours in every
  // status — the ring around it is what carries intact/damaged/destroyed.
  function iranianFlag() {
    const g = el('g', { class: 'tgt-core tgt-flag' });
    g.appendChild(el('rect', { class: 'flag-staff', x: -4.7, y: -6.4, width: 1.2, height: 12.4 }));
    g.appendChild(el('rect', { class: 'flag-green', x: -3.5, y: -5.8, width: 8.5, height: 1.63 }));
    g.appendChild(el('rect', { class: 'flag-white', x: -3.5, y: -4.17, width: 8.5, height: 1.63 }));
    g.appendChild(el('rect', { class: 'flag-red', x: -3.5, y: -2.54, width: 8.5, height: 1.63 }));
    g.appendChild(el('circle', { class: 'flag-emblem', cx: 0.75, cy: -3.35, r: 0.58 })); // nishan
    return g;
  }

  // an Iranian hull at sea, plan view, bow up — the same top-down language the
  // US carrier and its escorts are drawn in, so the eye reads it as a ship
  // underway rather than the profile silhouette a naval BASE wears. The decks
  // are cut in map-background dark so the deckhouse reads out of one fill.
  function shipHull() {
    const g = el('g', { class: 'tgt-core' });
    // raked bow, parallel midbody, transom stern
    g.appendChild(el('path', { d: 'M0,-6.8 L2.6,-2.2 L2.6,4.6 Q2.6,5.4 1.8,5.4 ' +
      'L-1.8,5.4 Q-2.6,5.4 -2.6,4.6 L-2.6,-2.2 Z' }));
    // deck breaks, held clear of the sheer so the hull line stays unbroken
    g.appendChild(el('rect', { class: 'ship-deck', x: -2, y: -2.3, width: 4, height: 0.8 }));
    g.appendChild(el('rect', { class: 'ship-deck', x: -2, y: 2.7, width: 4, height: 0.8 }));
    g.appendChild(el('rect', { class: 'ship-bridge', x: -1.3, y: -1.1, width: 2.6, height: 2.4 }));
    return g;
  }

  // the glyph that identifies a target type — drawn on the map at 1x and blown
  // up inside the tactical scope, so both views read as the same object
  function targetCore(type) {
    switch (type) {
      case 'nuclear':   // radiation trefoil — hub plus three 60-degree blades
        return radiationTrefoil();
      case 'airdefense':  // SAM site — a shield with a round coming through it
        return airDefenseShield();
      case 'command':   // Iranian national flag on a staff
        return iranianFlag();
      case 'missile':   // TEL — the launcher itself, not the round it throws
        return telLauncher();
      case 'naval':
        return el('path', { class: 'tgt-core', d: 'M-4,-1 L4,-1 L2,3 L-2,3 Z M-0.8,-5 L0.8,-5 L0.8,-1 L-0.8,-1 Z' });
      case 'ship':      // a hull underway, as opposed to the base she sails from
        return shipHull();
      case 'airbase':   // swept-wing planform, nose up
        return el('path', { class: 'tgt-core',
          d: 'M0,-5.5 L1.1,-1.6 L5,1.4 L5,2.6 L1.1,1.4 L1.1,3.4 L2.4,4.8 L2.4,5.5 ' +
             'L0,4.7 L-2.4,5.5 L-2.4,4.8 L-1.1,3.4 L-1.1,1.4 L-5,2.6 L-5,1.4 L-1.1,-1.6 Z' });
      case 'oil':
        return el('circle', { class: 'tgt-core', r: 3.5 });
      case 'infra':   // an arched span on two abutments — a bridge, read at 11px
        // The class covers rail crossings AND generating plant, and a bridge is
        // the glyph that carries both: a pylon reads as power and nothing else,
        // while a span reads as "the thing underneath the war" generally. Drawn
        // as one filled path in four subpaths (deck, two abutments, and the arch
        // as a closed band) because .tgt-core is filled rather than stroked —
        // the status colours in style.css work on fill, so a stroked glyph would
        // stay red on a destroyed site.
        return el('path', { class: 'tgt-core',
          d: 'M-5.6,0.1 L5.6,0.1 L5.6,1.5 L-5.6,1.5 Z ' +
             'M-5.6,1.5 L-4.2,1.5 L-4.2,4.3 L-5.6,4.3 Z ' +
             'M4.2,1.5 L5.6,1.5 L5.6,4.3 L4.2,4.3 Z ' +
             'M-4.3,0.1 A4.3,4.3 0 0 1 4.3,0.1 L3,0.1 A3,3 0 0 0 -3,0.1 Z' });
      default:
        return el('rect', { class: 'tgt-core', x: -3.5, y: -3.5, width: 7, height: 7 });
    }
  }

  // What the plot is allowed to draw. A dispersal site is not on it until
  // launchers have driven into it AND ISR has found them; a covert site is not
  // on it until the folder work has resolved an aimpoint. Game owns both
  // judgements — the map must never be the second opinion on whether the
  // president knows a target exists.
  const onPlot = (t) => Game.plotted(t);

  // ---- touch targets ----
  // The invisible disc under each icon used to be a flat 13 map units. Map units
  // are not screen pixels: at the zoom a war opens at that is roughly twelve
  // pixels across, against a 44px guideline, and it got SMALLER the further out
  // the player zoomed — exactly when the sites are hardest to hit. So the disc is
  // sized in screen pixels and re-derived on every view change (see syncHitDiscs
  // in applyView); `hitR` below is that radius expressed back in map units.
  //
  // Making the discs honestly finger-sized means they overlap, which is the real
  // problem showing itself rather than a new one: Kharg, Bushehr NPP and Nav
  // Bushehr sit within a few map units of each other and no disc size fixes that.
  // Overlap is resolved by nearest centre, and a tap that is genuinely between
  // two sites opens the picker instead of guessing. See pickTarget.
  const HIT_PX = 22;    // half of the 44px guideline
  const SURE_PX = 10;   // inside the drawn icon — an aim nobody would call ambiguous
  let hitR = 13;

  // Screen pixels per WORLD unit. Off `world`, not `svg`: the svg's own CTM maps
  // viewBox space, and `world` carries the pan/zoom transform on top of it, so
  // an svg-space measurement is short by exactly view.k. Targets are positioned
  // in world space, so everything here has to be.
  const pxPerUnit = () => {
    const m = world && world.getScreenCTM();
    return m ? m.a : 0;
  };

  // client coords → world coords, the space TARGETS are written in
  function clientToWorld(clientX, clientY) {
    const pt = svg.createSVGPoint();
    pt.x = clientX; pt.y = clientY;
    return pt.matrixTransform(world.getScreenCTM().inverse());
  }

  function syncHitDiscs() {
    const ppu = pxPerUnit();
    if (!ppu) return;
    hitR = HIT_PX / ppu;
    for (const c of world.querySelectorAll('circle.tgt-hit')) c.setAttribute('r', hitR);
  }

  // ---- the marker is a statement, not a measurement ----
  // The drawn icon was in map units, so it grew with the zoom by exactly the
  // factor that pushed the sites apart. Kharg, Nav Bushehr and Bushehr NPP sit
  // 20 and 25 units from each other against an 18-unit ring, and from the
  // opening view to k=10 that cluster rendered IDENTICALLY — three touching
  // icons, larger. Zooming in is the one gesture a player reaches for when a
  // cluster is unreadable, and on this chart it did nothing for them.
  //
  // So past the opening zoom the icon is counter-scaled to hold its k=1 size on
  // screen: the gap grows with the zoom and the glyph does not. That is the hit
  // disc's rule above applied to the part of the marker that is visible, and
  // for the same reason — a 9-unit ring is how big "there is a site here" is
  // drawn, not how big the refinery is.
  //
  // Clamped at 1 rather than run both ways. Below the opening zoom a constant
  // screen size would make every icon BIGGER than it is today, on the widest
  // and most crowded view there is, to fix crowding that zooming out cannot fix
  // anyway. And nothing on this plot with a real EXTENT is in here: a covert
  // box is an area of uncertainty and the carrier's escort screen is a
  // formation at its true spacing. Those mean something in map units and have
  // to keep scaling with them.
  //
  // Island NAMES ride here too (ISLAND_LABELS), for the same reason a target's
  // name does: a name is a statement about a place and not a measurement of
  // one. Their coastlines do not — an island is exactly the kind of extent the
  // paragraph above is about, which is why zooming in walks a name off the
  // island it started on top of.
  let iconK = 1;

  function syncIconScale() {
    if (!world) return;
    const k = Math.min(1, 1 / view.k);
    if (k === iconK) return;   // panning does not move it; only zoom does
    iconK = k;
    for (const g of world.querySelectorAll('g.tgt-icon, g.isl-scale'))
      g.setAttribute('transform', `scale(${k})`);
  }

  function targetIcon(t) {
    const g = el('g', { class: `target ${t.status || 'intact'}`,
      id: `tgt-${t.id}`, transform: `translate(${t.x},${t.y})` });
    // Invisible filled circle so the whole icon (not just strokes) is clickable.
    // It stays OUTSIDE the counter-scaled group below: it carries its own
    // screen-pixel rule, and its radius is the one targetsUnder compares world
    // distances against, so it has to stay in world units.
    g.appendChild(el('circle', { class: 'tgt-hit', r: hitR, fill: 'transparent' }));
    // Everything drawn hangs off one group counter-scaled by syncIconScale.
    const icon = el('g', { class: 'tgt-icon', transform: `scale(${iconK})` });
    icon.appendChild(el('circle', { class: 'tgt-ring', r: 9 }));
    icon.appendChild(targetCore(t.type));
    // Labels sit centred under the icon unless the target carries a `label`
    // offset. Iran's coast puts three and four sites inside 40 map units of
    // each other — Kharg/Bushehr, the two at Bandar Abbas, Chabahar next to the
    // Toledo's patrol box — and a centred label there lands on top of the
    // neighbour's icon. The offsets in data.js walk those clusters apart; the
    // coordinates themselves are projected and must not be moved to fix text.
    //
    // The name rides INSIDE the scaled group with its icon, which is what keeps
    // those offsets true: left in world units the text would grow while the
    // glyph it names shrank, and it would walk further from the site every
    // click of the zoom — the crowding this whole block exists to relieve,
    // re-created in the labels.
    const lab = t.label || {};
    const label = el('text', {
      x: lab.dx || 0,
      y: lab.dy != null ? lab.dy : 20,
      ...(lab.anchor ? { 'text-anchor': lab.anchor } : {}),
    });
    label.textContent = t.short;
    icon.appendChild(label);
    g.appendChild(icon);
    return g;
  }

  // ---- the carrier strike group ----
  // A CSG resolves in three steps, because at chart scale it is honestly one
  // blue flat-top and five destroyers drawn at their true spacing would be five
  // pixels of noise. Past k=1.6 (.map-deep-zoom) the escort screen appears — the
  // ships were out there the whole time, the chart just wasn't open enough to
  // say so. Past k=2.2 (.map-close-zoom) every hull resolves into its class and
  // the flight deck grows its fittings (see .cv-detail). That second step is
  // where the hull-type codes come in too: it is the first zoom with room to
  // print them without covering the ship they name.
  //
  // Both steps used to sit at 2.6 and 3.8. The war opens at k=1.0 and the zoom
  // buttons step by 1.3, so that put the escorts four clicks away and every
  // fitting six — past anything a player reaches on the way to picking targets,
  // which meant the strike group looked exactly as it always had. 1.6 and 2.2
  // are two clicks and three. The cost is that both carrier boxes wear a full
  // screen at mid zoom and they are only ~50 map units apart, so the Lincoln and
  // the Ford crowd each other once the Ford is on station. That is the trade.
  //
  // The third step is MAX_DETAIL_ZOOM (.map-max-zoom), and it is a different
  // kind of step from the first two. Those add detail to a symbol; this one
  // stops drawing a symbol. The hulls come off the map's blue and go haze grey,
  // which is the colour they actually are; they grow wakes, because they are
  // actually making way; and the deck starts running a cycle — see FLIGHT
  // QUARTERS below. None of it is information the player needs to fight the
  // war. It is what is down there for anyone who keeps zooming, and the only
  // cost of being wrong about it is that a player who never zooms never finds
  // it.
  //
  // 6 against a MAX_ZOOM of 10 is the last three clicks of the zoom-in button
  // (1.0 x 1.3^7 = 6.27), which is as close to "all the way in" as a threshold
  // can sit and still be reachable by a pinch that stops a little short of the
  // stop. Declared here rather than beside MAX_ZOOM because everything it gates
  // is in this section; applyView reads it.
  const MAX_DETAIL_ZOOM = 6;

  // Everything from here to the end of the strike group is drawn bow-up in one
  // frame 16 units long, which is a Nimitz's 333 m at 0.048 units to the metre.
  // Every dimension below is on that scale unless it says otherwise, so any
  // fitting can be checked against the real ship by dividing.
  const CV_LEN = 16.0;

  // ---- the flight deck ----
  // What there is to see of a carrier from directly overhead is the flight deck
  // and almost nothing else: the hull is narrower than the deck everywhere and
  // spends its whole length underneath it. So the deck IS the silhouette, and
  // it is not a rectangle — it is the shape the angled deck makes of one.
  //
  // Starboard: a straight edge with the island's sponson bulging out of it.
  // Port: a straight edge from the bow to a third of the way aft, then a step
  // outboard onto the angled deck's outboard edge, which runs aft from there
  // slowly converging on the transom. The widest point of the ship is that
  // step, 45% of the way back from the bow, and it is the one line in a plan
  // view that says "angled deck" without drawing a single marking.
  //
  // 3.82 units across the deck on 16 of length is 79 m on 333 — the real ratio
  // to within the width of the line it is drawn with. The silhouette this
  // replaces was 4.4 on 15.8, a fifth too fat, which is what happens when a
  // shape is drawn to read at chart scale and then asked to hold up at ten
  // times that.
  const CV_DECK =
    'M0.05,-8.00 C0.92,-7.80 1.38,-7.05 1.40,-6.25 L1.40,-2.70 L1.80,-2.70 ' +
    'L1.80,1.60 L1.40,1.60 L1.40,7.62 L1.22,8.00 L-1.28,8.00 L-1.62,5.90 ' +
    'L-2.34,1.05 L-2.42,-1.60 Q-2.30,-2.35 -1.42,-2.95 L-1.42,-6.20 Z';

  // The landing area and everything painted in it lie square to the ANGLED deck
  // rather than to the hull, so they are all drawn in one frame rotated onto
  // that axis: origin at the round-down (the ramp, at the stern, where the deck
  // ends and the water starts), local +y running aft, local x across the box.
  //
  // 11 degrees, which is the real offset. It used to be 24.6 — a deliberate
  // exaggeration, on the argument that the angle is the whole point of an
  // angled deck and the one thing a plan view can show. That argument was made
  // for a drawing nobody could zoom into. At 24.6 the landing area cannot even
  // start at the ramp: it runs off the port side before it reaches the bow, so
  // the round-down had to be planted amidships, three units forward of the
  // stern, which is not where any carrier's is. Eleven degrees puts it back on
  // the transom where it belongs and still throws the box a full 1.8 units to
  // port of the centreline by the time it gets forward — visible at k=2.2, and
  // unmistakable at k=6.
  const LAND_TF = 'translate(0.10,7.55) rotate(-11)';
  const LAND_LEN = 9.0;     // ramp to the forward end of the box
  const LAND_HALF = 0.75;   // half the width between the foul lines

  // ---- the air wing, in plan ----
  // F/A-18E nose up, 0.90 units long on a 0.66 span — 18.7 m on 13.7, against a
  // real 18.3 on 13.6. The shape has one job: at eight screen pixels the only
  // things that read are the LERX shoulders and the twin stabilators, and those
  // two are also the only things that make it a Hornet rather than a dart.
  const F18_SPREAD =
    'M0,-0.45 L0.05,-0.27 L0.06,-0.08 L0.33,0.11 L0.33,0.17 L0.10,0.13 ' +
    'L0.12,0.31 L0.25,0.38 L0.16,0.44 L0.07,0.45 L-0.07,0.45 L-0.16,0.44 ' +
    'L-0.25,0.38 L-0.12,0.31 L-0.10,0.13 L-0.33,0.17 L-0.33,0.11 ' +
    'L-0.06,-0.08 L-0.05,-0.27 Z';
  // ...and the same aircraft with its wings folded, which is how a carrier
  // parks them: the outer panels go vertical and the jet loses a third of its
  // span. A deck spotted with spread wings is a deck nobody can move an
  // aircraft around, and drawing one was the tell that the old deck pack was
  // five arrowheads rather than five aeroplanes.
  const F18_FOLDED =
    'M0,-0.45 L0.05,-0.27 L0.06,-0.08 L0.19,0.01 L0.19,0.15 L0.10,0.13 ' +
    'L0.12,0.31 L0.25,0.38 L0.16,0.44 L0.07,0.45 L-0.07,0.45 L-0.16,0.44 ' +
    'L-0.25,0.38 L-0.12,0.31 L-0.10,0.13 L-0.19,0.15 L-0.19,0.01 ' +
    'L-0.06,-0.08 L-0.05,-0.27 Z';

  // ---- wake ----
  // Every hull on this plot is under way and nothing in the drawing said so.
  // A wake is also the cheapest mark on the chart that carries real
  // information: it is the only thing on any of these ships that shows a
  // HEADING rather than an orientation, and with the whole formation on one
  // course it is what makes the group read as a group steaming somewhere
  // instead of six models arranged on a table.
  //
  // Drawn to the Kelvin wedge — 19.5 degrees off the track, which is the angle
  // for any displacement hull at any speed and one of the very few numbers in
  // ship hydrodynamics that does not depend on the ship. Max zoom only: at
  // anything wider it is a smudge behind a symbol.
  function shipWake(len, beam) {
    const h = len / 2, run = len * 1.15, spread = run * 0.354, b = beam / 2;
    const g = el('g', { class: 'ship-wake cv-fine' });
    // The churned water directly astern, in three lengths of decreasing weight.
    // A wake is a thing that stops, and the one drawn as a single shape at one
    // opacity does not: it ends, hard, a fixed distance behind every ship in the
    // formation, and six of those end at once in a straight line across open
    // water. Three steps is enough to read as fading and cheap enough to draw
    // for every hull on the plot.
    const seg = [[0.00, 0.34, 0.52, 0.74], [0.34, 0.66, 0.74, 0.96], [0.66, 1.00, 0.96, 1.20]];
    for (let i = 0; i < seg.length; i++) {
      const [t0, t1, w0, w1] = seg[i];
      g.appendChild(el('path', { class: `wake-trail wake-t${i}`,
        d: `M${-b * w0},${h + run * t0} L${-b * w1},${h + run * t1} ` +
           `L${b * w1},${h + run * t1} L${b * w0},${h + run * t0} Z` }));
    }
    for (const s of [-1, 1]) {
      // the divergent crests, thrown from the quarter at the Kelvin angle
      g.appendChild(el('path', { class: 'wake-arm',
        d: `M${s * b * 0.85},${h - b * 0.3} L${s * spread},${h + run}` }));
      // The bow wave, which from overhead is not the V it is from a boat: on a
      // hull five times longer than it is wide the Kelvin arms do not clear the
      // beam until they are most of the way aft, so a V drawn off the stem
      // spends its visible life as two whiskers halfway down the ship. What is
      // actually there in a photograph is foam banked against the side, from
      // the shoulder to the quarter, and that is a line hugging the hull.
      g.appendChild(el('path', { class: 'wake-arm wake-bow',
        d: `M${s * b * 0.55},${-h * 0.86} Q${s * b * 1.24},${-h * 0.2} ` +
           `${s * b * 1.16},${h * 0.72}` }));
    }
    return g;
  }

  // Deck fittings. What is actually on a flight deck, and where a carrier
  // actually puts it: four catapults (two on the bow either side of the
  // centreline, two in the waist firing across the angled deck), four wires
  // across the landing area, four deck-edge elevators — three to starboard, one
  // on the port quarter — and aircraft parked in every square metre the landing
  // area does not own, because that is the one patch of deck that has to stay
  // clear and everywhere else is fair game.
  function carrierDeck() {
    const g = el('g');
    const mid = el('g', { class: 'cv-detail' });          // .map-close-zoom
    const fine = el('g', { class: 'cv-fine' });           // .map-max-zoom
    const land = el('g', { class: 'cv-detail', transform: LAND_TF });
    const landFine = el('g', { class: 'cv-fine', transform: LAND_TF });

    // A catapult is a track and a jet blast deflector, and the JBD — the bar
    // that comes up out of the deck behind the aircraft — is the half that
    // makes it read as a catapult rather than a stripe. It goes at the AFT end,
    // where the shuttle starts and the aircraft behind it needs shielding.
    const cat = (host, hostFine, x1, y1, x2, y2) => {
      host.appendChild(el('line', { class: 'cv-cat', x1, y1, x2, y2 }));
      const dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy) || 1;
      const px = -dy / L * 0.26, py = dx / L * 0.26;
      const bx = x1 - dx / L * 0.18, by = y1 - dy / L * 0.18;
      hostFine.appendChild(el('line', { class: 'cv-jbd',
        x1: bx - px, y1: by - py, x2: bx + px, y2: by + py }));
    };

    // bow cats, splayed a couple of degrees apart the way the real pair is so
    // that two aircraft off them in sequence do not fly the same air
    cat(mid, fine, -0.58, -2.30, -0.92, -7.55);
    cat(mid, fine, 0.34, -2.30, 0.50, -7.55);
    // waist cats, on the angled deck and outboard of the landing box, which is
    // where they have to be: the whole point of the angle is that the ship can
    // land aircraft over the ramp and shoot them off the waist at the same time
    cat(land, landFine, 0.42, -3.90, 0.42, -8.80);
    cat(land, landFine, 0.98, -3.90, 0.98, -8.80);

    // the landing area: centreline, the four wires, and the starboard foul line
    // that marks where the box ends and the parking starts
    land.appendChild(el('line', { class: 'cv-stripe',
      x1: 0, y1: -0.2, x2: 0, y2: -LAND_LEN }));
    for (const y of [-1.35, -1.92, -2.49, -3.06])
      land.appendChild(el('line', { class: 'cv-wire',
        x1: -0.70, y1: y, x2: 0.70, y2: y }));
    landFine.appendChild(el('line', { class: 'cv-foul',
      x1: LAND_HALF, y1: 0.05, x2: LAND_HALF, y2: -LAND_LEN }));

    // Deck-edge elevators, all four of them overhanging the side they are on —
    // that overhang is the whole design: a lift that hangs off the edge costs
    // the deck no parking and can be worked with aircraft spotted either side
    // of it.
    for (const [x, y0, y1] of [[1.40, -6.05, -4.75], [1.40, -4.20, -2.90],
                               [1.40, 2.10, 3.40], [-2.42, 4.20, 5.50]])
      mid.appendChild(el('rect', { class: 'cv-elev',
        x, y: y0, width: 0.76, height: y1 - y0 }));

    // The island: bridge at the forward end, uptakes aft, mast between them.
    // It is the one structure on the ship with real height, which is why it is
    // drawn in the lightest fill on the plot while everything else on the deck
    // is either paint or a hole.
    fine.appendChild(el('rect', { class: 'cv-bridge', x: 1.47, y: -1.05, width: 0.44, height: 0.46 }));
    fine.appendChild(el('rect', { class: 'cv-uptake', x: 1.51, y: 0.55, width: 0.36, height: 0.52 }));
    fine.appendChild(el('line', { class: 'cv-mast', x1: 1.69, y1: -0.40, x2: 1.69, y2: 1.30 }));
    for (const y of [-0.05, 0.30])
      fine.appendChild(el('line', { class: 'cv-mast', x1: 1.44, y1: y, x2: 1.94, y2: y }));
    // close-in weapons, on sponsons at three corners of the deck
    for (const [x, y] of [[1.66, -3.30], [-1.55, -1.10], [1.32, 7.05]])
      fine.appendChild(el('circle', { class: 'cv-ciws', cx: x, cy: y, r: 0.16 }));

    // ---- the deck pack ----
    // Where a carrier parks aircraft, which is not "wherever there is room":
    // tails outboard along the starboard deck edge aft of the island (the six
    // pack), two more crosswise on the elevators, a pair in the queue on the
    // starboard bow cat, and two on the port bow forward of the angled deck's
    // step. Everything here is clear of the landing box, clear of both bow cat
    // tracks and clear of the port cat, which is the one this deck launches off
    // — see FLIGHT QUARTERS.
    for (const [x, y, rot] of [
      [0.98, 2.55, -55], [0.98, 3.45, -55], [0.98, 4.35, -55],
      [0.98, 5.25, -55], [0.98, 6.15, -55],
      [1.76, 2.75, 90], [-2.02, 4.85, 90],
      [0.34, -2.30, 0], [0.90, -1.25, -25],
      [-1.09, -4.40, 200], [-1.05, -5.60, 200],
    ]) {
      const p = el('path', { class: 'cv-plane', d: F18_FOLDED });
      p.setAttribute('transform', `translate(${x},${y}) rotate(${rot})`);
      mid.appendChild(p);
    }

    g.appendChild(mid);
    g.appendChild(land);
    g.appendChild(fine);
    g.appendChild(landFine);
    return g;
  }

  // top-down aircraft-carrier silhouette, bow up: the flight deck, the hull
  // shadow under its overhang, the angled deck's landing box cut in the map's
  // own dark, and the island on its starboard sponson. Drawn small enough that
  // at map scale it still reads as a single flat-top; the escort screen is
  // added separately.
  function carrierHull(cls) {
    const c = el('g', { class: cls });
    c.appendChild(shipWake(CV_LEN, 3.85));
    // The hull, which is the one part of the ship there is nothing to see of:
    // the deck overhangs it on both sides for the whole length, so all it
    // contributes from directly above is the shadow it throws off that
    // overhang. Drawn as the deck's own outline, offset and darkened — which is
    // exactly what the shadow of a shape is — and it is the cue that says the
    // deck is a roof and not a raft.
    c.appendChild(el('path', { class: 'carrier-shadow cv-fine', d: CV_DECK,
      transform: 'translate(0.19,0.17)' }));
    c.appendChild(el('path', { class: 'asset-icon carrier-hull', d: CV_DECK }));
    // the landing box, cut dark: at chart scale this one shape is what makes
    // the silhouette a carrier rather than a large grey ship
    const box = el('g', { transform: LAND_TF });
    box.appendChild(el('path', { class: 'carrier-deck',
      d: `M${-LAND_HALF},0.10 L${LAND_HALF},0.10 L${LAND_HALF},${-LAND_LEN} ` +
         `L${-LAND_HALF},${-LAND_LEN} Z` }));
    c.appendChild(box);
    c.appendChild(el('line', { class: 'carrier-line', x1: 0, y1: -6.6, x2: 0, y2: 7.2 }));
    c.appendChild(el('rect', { class: 'carrier-island', x: 1.44, y: -1.15, width: 0.50, height: 2.60 }));
    c.appendChild(carrierDeck());
    return c;
  }

  // A hull in plan view, bow up: raked stem, parallel midbody, transom stern.
  // Every ship in the screen is this one drawing at a different length and beam
  // with a different set of fittings on top, which is also roughly how you tell
  // the classes apart from a thousand feet. `blunt` gives the auxiliary her
  // full-bodied merchant bow — she is built to carry fuel, not to make 30 knots.
  //
  // The stem is a curve now rather than the straight taper it was. A warship
  // does not come to a point: flare above the waterline carries the bow's
  // widest section forward of where a straight line would put it, and the
  // shoulder that reads as is the difference between a hull and an arrowhead.
  function hullPath(len, beam, cls, blunt) {
    const h = len / 2, b = beam / 2, s = blunt ? h * 0.66 : h * 0.46, r = h - s;
    const d = blunt
      ? `M${-b * 0.5},${-h} Q${-b},${-h + b * 0.55} ${-b},${-s} ` +
        `L${-b},${h * 0.82} Q${-b},${h} ${-b * 0.62},${h} L${b * 0.62},${h} ` +
        `Q${b},${h} ${b},${h * 0.82} L${b},${-s} ` +
        `Q${b},${-h + b * 0.55} ${b * 0.5},${-h} Z`
      : `M0,${-h} C${b * 0.74},${-h + r * 0.30} ${b},${-h + r * 0.70} ${b},${-s} ` +
        `L${b},${h * 0.82} Q${b},${h} ${b * 0.62},${h} L${-b * 0.62},${h} ` +
        `Q${-b},${h} ${-b},${h * 0.82} L${-b},${-s} ` +
        `C${-b},${-h + r * 0.70} ${-b * 0.74},${-h + r * 0.30} 0,${-h} Z`;
    return el('path', { class: cls, d });
  }

  // The screen, by class. Lengths are the real ones scaled off the carrier and
  // then pulled in: a Burke is 155m against a Nimitz's 333m, a Ticonderoga
  // 173m, and the fast combat support ship is longer than either of them —
  // which looks like a drawing error until you remember she is a tanker with a
  // warship's worth of freeboard. Drawn to true ratio the escorts crowd the
  // flat-top at the spacing the screen is plotted at, so everything here is
  // about 70% of scale.
  //
  // The BEAMS came in with the carrier's. A Burke is 155 x 20, which is 7.75 to
  // 1; drawn at 6.6 x 1.7 she was 3.9 to 1, and a warship at four to one is a
  // barge. 5 to 1 is the compromise the whole screen is now on — still fatter
  // than any of these ships really are, because under about 1.3 units of beam
  // there is no room to put a deckhouse on, and thin enough that the eye reads
  // destroyer.
  const ESCORT_CLASSES = {
    cg:  { len: 7.9, beam: 1.50, tag: 'CG' },    // Ticonderoga — AAW commander
    ddg: { len: 7.1, beam: 1.42, tag: 'DDG' },   // Arleigh Burke — the workhorse
    ao:  { len: 9.0, beam: 1.85, tag: 'T-AO', blunt: true },  // the oiler
  };

  function escortShip(kind) {
    const c = ESCORT_CLASSES[kind];
    const g = el('g', { class: `escort escort-${kind}` });
    const h = c.len / 2, b = c.beam / 2;
    // Fittings are placed as a FRACTION of the length from the stem, which is
    // how a ship is actually described — a frame number is a fraction of a
    // length — and what lets a layout drawn once be checked against a
    // photograph of any of the three classes.
    const at = (f) => -h + f * c.len;

    g.appendChild(shipWake(c.len, c.beam));
    g.appendChild(hullPath(c.len, c.beam, 'asset-icon escort-ship', c.blunt));

    const mid = el('g', { class: 'cv-detail' });    // .map-close-zoom
    const fine = el('g', { class: 'cv-fine' });     // .map-max-zoom

    const box = (host, cls, f0, f1, w) => host.appendChild(el('rect',
      { class: cls, x: -w / 2, y: at(f0), width: w, height: (f1 - f0) * c.len }));
    // A 5-inch mount is a turret and a barrel, and at this size the barrel is
    // the half that says which end of the ship it is on.
    const gun = (f, aft) => {
      box(mid, 'escort-house', f - 0.015, f + 0.019, b * 0.85);
      const s = aft ? 1 : -1;
      fine.appendChild(el('line', { class: 'escort-barrel',
        x1: 0, y1: at(f + s * 0.014), x2: 0, y2: at(f + s * 0.055) }));
    };
    // The four fixed SPY faces: two looking forward off the bridge corners, two
    // looking aft off whatever structure is at the other end of the ship. They
    // are the reason these hulls exist, they never turn, and they are the one
    // fitting a Burke and a Ticonderoga wear in the same place.
    const spy = (f, aft) => {
      for (const s of [-1, 1]) {
        const p = el('rect', { class: 'escort-spy',
          x: -0.17, y: -0.045, width: 0.34, height: 0.09 });
        p.setAttribute('transform',
          `translate(${s * b * 0.5},${at(f)}) rotate(${(aft ? 180 : 0) + s * 34})`);
        fine.appendChild(p);
      }
    };
    const mast = (f) => {
      fine.appendChild(el('line', { class: 'escort-mast',
        x1: 0, y1: at(f - 0.028), x2: 0, y2: at(f + 0.028) }));
      fine.appendChild(el('line', { class: 'escort-mast',
        x1: -b * 0.45, y1: at(f), x2: b * 0.45, y2: at(f) }));
    };
    // A flight deck is a deck with a circle painted on it, and the circle is
    // the whole of what stops it reading as one more deckhouse.
    const flightDeck = (f0, f1) => {
      box(mid, 'escort-deck', f0, f1, b * 1.65);
      fine.appendChild(el('circle', { class: 'escort-circle',
        cx: 0, cy: at((f0 + f1) / 2), r: b * 0.48 }));
    };
    // the RHIBs, in their davits amidships — every one of these ships carries
    // them in the same place, which is the only place left
    const boats = (f) => {
      for (const s of [-1, 1])
        fine.appendChild(el('rect', { class: 'escort-boat',
          x: s * b * 0.86 - 0.07, y: at(f), width: 0.14, height: c.len * 0.035 }));
    };

    if (kind === 'ao') {
      // An auxiliary wears her house right aft over the machinery and gives the
      // whole middle of the ship to cargo. The bars across that deck are the
      // replenishment stations, and they are what tells her from a warship at a
      // glance: they stand athwartships, because the whole job is passing fuel
      // sideways to something steaming a hundred feet away. Three of them, both
      // sides — a Kaiser rigs to port and starboard at once and can be working
      // two ships while a third waits astern.
      box(mid, 'escort-cargo', 0.10, 0.68, b * 1.5);
      for (const f of [0.26, 0.42, 0.58]) {
        box(mid, 'escort-rig', f - 0.011, f + 0.011, b * 2.05);
        fine.appendChild(el('circle', { class: 'escort-ciws', cx: 0, cy: at(f), r: b * 0.15 }));
      }
      box(mid, 'escort-house', 0.70, 0.87, b * 1.45);
      box(mid, 'escort-stack', 0.775, 0.815, b * 0.55);
      mast(0.715);
      flightDeck(0.895, 0.985);
    } else if (kind === 'cg') {
      // Ticonderoga: a Spruance hull carrying two Mk 41 magazines, two 5-inch
      // mounts and four SPY faces split between a forward and an after house.
      // The pair of guns is the giveaway — nothing else in this screen has one
      // at each end — and the two houses set well apart is the rest of it.
      gun(0.085);
      box(mid, 'escort-vls', 0.120, 0.185, b * 1.15);
      box(mid, 'escort-house', 0.205, 0.395, b * 1.5);
      spy(0.240);
      mast(0.410);
      box(mid, 'escort-stack', 0.425, 0.465, b * 0.7);
      boats(0.475);
      box(mid, 'escort-house', 0.490, 0.600, b * 1.4);
      spy(0.575, true);
      box(mid, 'escort-stack', 0.615, 0.655, b * 0.7);
      gun(0.688, true);
      box(mid, 'escort-vls', 0.755, 0.820, b * 1.15);
      box(mid, 'escort-house', 0.830, 0.885, b * 1.35);   // hangar
      flightDeck(0.890, 0.985);
    } else {
      // Arleigh Burke, Flight IIA: one gun forward, magazines at both ends, one
      // long deckhouse with the bridge at the front of it, two stacks and two
      // helicopter hangars side by side aft. The single gun and the twin
      // hangars are what tell her from the cruiser stationed ahead of her.
      gun(0.105);
      box(mid, 'escort-vls', 0.145, 0.215, b * 1.15);
      box(mid, 'escort-house', 0.235, 0.440, b * 1.5);
      spy(0.275);
      mast(0.455);
      box(mid, 'escort-stack', 0.470, 0.515, b * 0.7);
      boats(0.525);
      box(mid, 'escort-stack', 0.565, 0.610, b * 0.7);
      box(mid, 'escort-house', 0.645, 0.790, b * 1.45);
      fine.appendChild(el('line', { class: 'escort-split',
        x1: 0, y1: at(0.650), x2: 0, y2: at(0.785) }));   // the two hangars
      spy(0.755, true);
      fine.appendChild(el('circle', { class: 'escort-ciws', cx: 0, cy: at(0.630), r: b * 0.15 }));
      box(mid, 'escort-vls', 0.800, 0.855, b * 1.15);
      flightDeck(0.865, 0.985);
    }

    g.appendChild(mid);
    g.appendChild(fine);
    return g;
  }

  // ---- FLIGHT QUARTERS ----
  // At MAX_DETAIL_ZOOM the deck starts working. Every 15 seconds a Hornet is
  // shot off the port bow catapult, climbs out, turns left into the pattern,
  // flies two full turns of it in 15 seconds and comes back aboard.
  //
  // A sortie is 25.6 seconds of that and a launch goes every 15, so there are
  // two aircraft in the air for most of a cycle and never fewer than one. That
  // is not a compromise between the two numbers — it is what launching every 15
  // seconds MEANS when the aircraft you launched needs longer than 15 seconds
  // to get back. A deck running a cycle always has more than one jet up; a deck
  // that waited for each aircraft to trap before shooting the next would be a
  // deck doing one thing at a time, which is the one thing an angled deck was
  // invented so a carrier would never have to do.
  //
  // The pattern is the real one and it is flown to port, because carrier
  // patterns are: downwind up the port side into the wind, the turn off the
  // 180 across the wake, and the groove onto an angled deck that points a
  // little to port of where the ship is going. Fly it the other way round and
  // the aircraft would have to land across the deck.
  const CV_CYCLE = 15;        // seconds between launches, as ordered
  const CV_TURNS = 2;         // ...and two full turns of the pattern
  const CV_R = 12.6;          // pattern radius: outside the screen's bow guard
  const CV_ENTRY = 115 * Math.PI / 180;   // joined on the port quarter, downwind
  const CV_PH = { cat: 1.9, join: 3.2, orbit: 15.0, brk: 3.4, groove: 2.1, fade: 1.0 };
  const CV_SORTIE = CV_PH.cat + CV_PH.join + CV_PH.orbit + CV_PH.brk + CV_PH.groove;
  const CV_VISIBLE = CV_SORTIE + CV_PH.fade;
  const CV_SLOTS = Math.ceil(CV_VISIBLE / CV_CYCLE);   // aircraft up at once

  // A cubic through four points, resampled by ARC LENGTH. The plain parameter
  // of a Bezier is not distance along it — a curve with long control arms
  // crawls at the ends and sprints through the middle — and an aeroplane that
  // visibly changes speed twice per turn reads as a bug rather than as flying.
  // 64 samples is well past the point where the remaining error is smaller than
  // the line the aircraft is drawn with.
  function arcCurve(p0, p1, p2, p3) {
    const N = 64, pts = [], len = [0];
    for (let i = 0; i <= N; i++) {
      const u = i / N, v = 1 - u;
      pts.push({
        x: v * v * v * p0.x + 3 * v * v * u * p1.x + 3 * v * u * u * p2.x + u * u * u * p3.x,
        y: v * v * v * p0.y + 3 * v * v * u * p1.y + 3 * v * u * u * p2.y + u * u * u * p3.y,
      });
      if (i) len.push(len[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
    }
    const total = len[N] || 1;
    return (s) => {
      const d = Math.max(0, Math.min(1, s)) * total;
      let lo = 1, hi = N;
      while (lo < hi) { const m = (lo + hi) >> 1; if (len[m] < d) lo = m + 1; else hi = m; }
      const seg = len[lo] - len[lo - 1] || 1, f = (d - len[lo - 1]) / seg;
      return { x: pts[lo - 1].x + (pts[lo].x - pts[lo - 1].x) * f,
               y: pts[lo - 1].y + (pts[lo].y - pts[lo - 1].y) * f };
    };
  }

  const orbitAt = (a) => ({ x: -CV_R * Math.sin(a), y: -CV_R * Math.cos(a) });
  // the tangent, which is also the direction of flight: increasing `a` runs the
  // aircraft counter-clockwise, i.e. aft down the port side and forward up the
  // starboard one, which is a left-hand pattern
  const orbitDir = (a) => ({ x: -Math.cos(a), y: Math.sin(a) });

  // the port bow catapult, from the shuttle at its aft end to a point off the
  // bow — the track itself is drawn from -2.30 to -7.55 and the aircraft is
  // flying by the time it gets there
  const CAT_A = { x: -0.58, y: -2.30 }, CAT_B = { x: -1.02, y: -9.10 };
  const CV_JOIN_E = orbitAt(CV_ENTRY), CV_JOIN_T = orbitDir(CV_ENTRY);
  // Climb-out: straight ahead off the bow, then a climbing turn to port all the
  // way round onto the downwind leg. It is a long way round and it is the way
  // round a departing aircraft actually goes — the pattern is to port, so
  // anything that joins it joins from the port side.
  const CV_JOIN = arcCurve(CAT_B,
    { x: CAT_B.x, y: CAT_B.y - 6.0 },
    { x: CV_JOIN_E.x - CV_JOIN_T.x * 7.0, y: CV_JOIN_E.y - CV_JOIN_T.y * 7.0 },
    CV_JOIN_E);

  // The groove: the extended centreline of the ANGLED deck, which runs aft and
  // to starboard because the deck it extends runs forward and to port. This is
  // the whole reason the approach turn ends up astern of the ship and a little
  // outboard of her wake rather than lined up on her stern.
  const LAND_DIR = { x: -Math.sin(11 * Math.PI / 180), y: -Math.cos(11 * Math.PI / 180) };
  const RAMP = { x: 0.10, y: 7.55 };
  const GROOVE_LEN = 9.5, ROLLOUT = 3.4;
  const GROOVE_G = { x: RAMP.x - LAND_DIR.x * GROOVE_LEN, y: RAMP.y - LAND_DIR.y * GROOVE_LEN };
  // the turn off the 180: out of the pattern on the port quarter, across the
  // wake, and rolled out in the groove pointing at the ramp
  const CV_FINAL = arcCurve(CV_JOIN_E,
    { x: CV_JOIN_E.x + CV_JOIN_T.x * 7.0, y: CV_JOIN_E.y + CV_JOIN_T.y * 7.0 },
    { x: GROOVE_G.x - LAND_DIR.x * 6.5, y: GROOVE_G.y - LAND_DIR.y * 6.5 },
    GROOVE_G);

  // Where one aircraft is, t seconds into its sortie, in the carrier's own
  // frame. Every phase hands the next one its end point and its heading, so the
  // whole 25.6 seconds is one continuous line and nothing has to be smoothed
  // over at a join.
  function sortiePoint(t) {
    if (t <= CV_PH.cat) {
      // held on the cat for the first fifth of the phase — a jet sitting at
      // full power waiting for the shot — and then constant acceleration, which
      // is what a catapult is
      const p = Math.max(0, (t / CV_PH.cat - 0.21) / 0.79), e = p * p;
      return { x: CAT_A.x + (CAT_B.x - CAT_A.x) * e, y: CAT_A.y + (CAT_B.y - CAT_A.y) * e };
    }
    t -= CV_PH.cat;
    if (t <= CV_PH.join) return CV_JOIN(t / CV_PH.join);
    t -= CV_PH.join;
    if (t <= CV_PH.orbit) return orbitAt(CV_ENTRY + (t / CV_PH.orbit) * CV_TURNS * 2 * Math.PI);
    t -= CV_PH.orbit;
    if (t <= CV_PH.brk) return CV_FINAL(t / CV_PH.brk);
    t -= CV_PH.brk;
    // the groove at approach speed, then the wire: a trap takes a Hornet from
    // 150 knots to nothing in about two seconds and a hundred metres, which at
    // this scale is the 3.4 units of rollout below
    const u = Math.min(1, t / CV_PH.groove);
    const d = u < 0.68
      ? (u / 0.68) * GROOVE_LEN
      : GROOVE_LEN + ROLLOUT * (1 - Math.pow(1 - (u - 0.68) / 0.32, 3));
    return { x: GROOVE_G.x + LAND_DIR.x * d, y: GROOVE_G.y + LAND_DIR.y * d };
  }

  // An aircraft two thousand feet up is two thousand feet CLOSER to a camera
  // looking straight down, so it draws bigger, and the shadow it throws on the
  // water separates from it. Both are the same number, and together they are
  // the only thing in a plan view that can say airborne rather than parked.
  function sortieLift(t) {
    const up = CV_PH.cat + CV_PH.join * 0.42;
    if (t <= CV_PH.cat) return 0;
    if (t < up) return (t - CV_PH.cat) / (up - CV_PH.cat);
    const down = CV_SORTIE - CV_PH.groove;
    if (t < down) return 1;
    return Math.max(0, 1 - (t - down) / (CV_PH.groove * 0.72));
  }

  // Every carrier's air layer, registered by render(). Held rather than
  // re-queried for one reason: this is the only thing on the chart that runs at
  // frame rate for as long as the player leaves the zoom alone, so it is the
  // one place where a querySelectorAll per frame is a cost with no ceiling on
  // how long it gets paid.
  const cvAir = [];
  let airRAF = 0;

  // Two decks running the identical cycle in lockstep would look like one
  // animation played twice, so each is offset by a number derived from its own
  // id — stable across a reload, and different for LINCOLN and FORD.
  function idPhase(id) {
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 9973;
    return (h / 9973) * CV_CYCLE;
  }

  function flightQuarters(id) {
    const air = el('g', { class: 'cv-air' });
    const jets = [];
    for (let i = 0; i < CV_SLOTS; i++) {
      const g = el('g', { class: 'cv-jet', opacity: 0 });
      const shadow = el('path', { class: 'jet-shadow', d: F18_SPREAD });
      g.appendChild(shadow);
      g.appendChild(el('path', { class: 'jet-body', d: F18_SPREAD }));
      air.appendChild(g);
      jets.push({ g, shadow, rot: 0 });
    }
    cvAir.push({ id, node: air, jets, phase: idPhase(id) });
    return air;
  }

  // Which sortie this slot is flying right now. Slot i owns every launch whose
  // number is congruent to i modulo the number of slots, so the two aircraft
  // alternate off the cat and each one gets a full CV_CYCLE * CV_SLOTS seconds
  // to fly its 25.6 and clear the deck.
  function placeJet(jet, now, slot) {
    const n0 = Math.floor(now / CV_CYCLE);
    const n = n0 - ((((n0 - slot) % CV_SLOTS) + CV_SLOTS) % CV_SLOTS);
    const t = now - n * CV_CYCLE;
    if (t < 0 || t > CV_VISIBLE) { jet.g.setAttribute('opacity', 0); return; }
    const p = sortiePoint(Math.min(t, CV_SORTIE));
    const q = sortiePoint(Math.min(t + 0.07, CV_SORTIE));
    const dx = q.x - p.x, dy = q.y - p.y;
    // A forward difference is zero while the aircraft is stopped — on the cat
    // before the shot, and in the wires after it — and a heading of zero there
    // would spin the jet to bow-up in front of the player. Hold the last one.
    if (Math.hypot(dx, dy) > 1e-4) jet.rot = Math.atan2(dx, -dy) * 180 / Math.PI;
    const lift = sortieLift(t);
    const s = 1 + 0.30 * lift, off = 2.6 * lift;
    // The sun does not turn with the aeroplane, so the shadow's offset has to
    // be counter-rotated out of the jet's own frame, and counter-scaled out of
    // its lift: a shadow on the water is cast at the size of the aircraft, not
    // at the size the aircraft is drawn from above it.
    const r = jet.rot * Math.PI / 180, cos = Math.cos(r), sin = Math.sin(r);
    jet.g.setAttribute('opacity', t <= CV_SORTIE ? 1 : 1 - (t - CV_SORTIE) / CV_PH.fade);
    jet.g.setAttribute('transform',
      `translate(${p.x.toFixed(3)},${p.y.toFixed(3)}) rotate(${jet.rot.toFixed(2)}) scale(${s.toFixed(3)})`);
    jet.shadow.setAttribute('transform',
      `translate(${(off * (cos + sin) / s).toFixed(3)},${(off * (cos - sin) / s).toFixed(3)}) scale(${(1 / s).toFixed(3)})`);
  }

  function airFrame(ts) {
    airRAF = requestAnimationFrame(airFrame);
    const now = ts / 1000;
    const b = worldBox();
    for (const c of cvAir) {
      const a = US_ASSETS.find(u => u.id === c.id);
      // "...when max zoomed in ON THEM": a deck the player is not looking at is
      // not flying, which is what keeps this to one deck's worth of work in the
      // one case it can cost anything — both carriers on screen at k=6 at once.
      const near = !!a && a.active !== false &&
        a.x > b.x0 - 34 && a.x < b.x1 + 34 && a.y > b.y0 - 34 && a.y < b.y1 + 34;
      c.node.classList.toggle('hidden', !near);
      if (!near) continue;
      const t = now + c.phase;
      for (let i = 0; i < c.jets.length; i++) placeJet(c.jets[i], t, i);
    }
  }

  // Started and stopped from applyView, which is the choke point every gesture
  // already goes through. Below the zoom the CSS has the layer hidden anyway,
  // so the only thing this decides is whether a frame callback is running at
  // all — and it must not be, on a chart the player has zoomed back out of.
  const stillFrames = () =>
    window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function syncCarrierAir() {
    const want = view.k >= MAX_DETAIL_ZOOM && cvAir.length > 0 && !stillFrames();
    if (want && !airRAF) airRAF = requestAnimationFrame(airFrame);
    else if (!want && airRAF) { cancelAnimationFrame(airRAF); airRAF = 0; }
  }

  // the strike group: the carrier plus her screen, hidden until the map is
  // zoomed way in (toggled via .map-deep-zoom / .map-close-zoom on the svg).
  // The stationing is the textbook one — the cruiser up-threat ahead as the air
  // defence commander, destroyers on the bows and the port quarter, and the
  // oiler tucked astern inside everything else, because she is what the screen
  // is partly there to protect.
  //
  // Every hull in it is on the SAME HEADING as the carrier, which is the one
  // thing the old drawing had plainly wrong. A screen is not five ships pointed
  // five ways; it is a formation, stationed on a guide, and the guide is the
  // deck in the middle of it. The group steams one base course and turns
  // together, and the moment that matters most — the carrier coming into the
  // wind to launch, which is the moment this drawing is now animating — is the
  // moment every ship in the screen is most exactly parallel to her. Splayed
  // headings read as five ships milling about, and now that they all carry
  // wakes they would read as five ships milling about at twenty knots.
  const CSG_STATIONS = [
    { kind: 'cg',  dx: 0,   dy: -18 },   // vanguard
    { kind: 'ddg', dx: -13, dy: -8 },    // port bow
    { kind: 'ddg', dx: 13,  dy: -6 },    // starboard bow
    { kind: 'ddg', dx: -14, dy: 8 },     // port quarter
    { kind: 'ao',  dx: 12,  dy: 12 },    // oiler astern
  ];

  function carrierGroup(id) {
    const grp = el('g', { class: 'carrier-strike-group' });
    const screen = el('g', { class: 'strike-group' });
    for (const e of CSG_STATIONS) {
      const slot = el('g', { transform: `translate(${e.dx},${e.dy})` });
      slot.appendChild(escortShip(e.kind));
      // The tag rides in the slot ABOVE her hull without exception: the two
      // ships in the after screen are stationed either side of the carrier's
      // own name, and a tag under those two lands on top of it.
      const tag = el('text', { class: 'escort-tag cv-detail',
        y: -(ESCORT_CLASSES[e.kind].len / 2 + 1.4) });
      tag.textContent = ESCORT_CLASSES[e.kind].tag;
      slot.appendChild(tag);
      screen.appendChild(slot);
    }
    grp.appendChild(screen);
    grp.appendChild(carrierHull('carrier-body'));
    grp.appendChild(flightQuarters(id));   // drawn last: they are above the ship
    return grp;
  }

  // ---- USS Toledo ----
  // The one hull on the plot drawn in profile instead of plan view, because a
  // submarine seen from above is a cigar and nothing else: Los Angeles-class,
  // bow left, ogive bow into a parallel midbody, the hull tapering aft into the
  // cruciform tail and the screw. The planes are on the BOW rather than the
  // sail — Toledo is a 688I, and at a glance that is the one thing that tells
  // the improved boats from the older ones.
  //
  // The HULL is hollow and dashed (see .asset-submerged) because the plot is the
  // last position Fifth Fleet had and not where she is; nothing else on the map
  // is uncertain about where it is. Only the hull, though. A first version dashed
  // the fittings too and the boat came apart into gravel — the dash is 2.6 units
  // long and the sail is 2.5 units of chord, so it drew as one brick. Every
  // fitting is now a thin solid line INSIDE a dashed silhouette, which says the
  // same thing and still looks like a submarine. The fins are open paths for the
  // same reason: closing them would draw a chord across the hull they stand on.
  //
  // Drawn at 1.4x. She is the smallest hull in the theater and the icon with the
  // most shape to show, which is a straight conflict: at the zoom the war opens
  // at, the authored size renders 15x8 CSS pixels and every one of those
  // fittings is a smear, so the boat read as the same dashed sliver she was
  // before any of this. The scale rides on the group rather than the path
  // coordinates so the stroke and the dash scale with her — the dash-to-chord
  // ratio the comment above turns on is preserved exactly.
  function submarineIcon() {
    const g = el('g', { class: 'asset-icon asset-submerged', transform: 'scale(1.4)' });
    g.appendChild(el('path', { class: 'sub-hull',
      d: 'M-7.6,0 C-7.6,-1.5 -5.9,-2.1 -3.7,-2.1 L2.9,-2.1 C4.9,-2.1 6.3,-1.4 6.9,-0.35 ' +
         'L6.9,0.35 C6.3,1.4 4.9,2.1 2.9,2.1 L-3.7,2.1 C-5.9,2.1 -7.6,1.5 -7.6,0 Z' }));
    // fairwater: raked leading edge, trailing edge vertical, set well forward
    g.appendChild(el('path', { class: 'sub-detail', d: 'M-2.9,-2.05 L-2.1,-4.6 L-0.35,-4.6 L-0.35,-2.05' }));
    // bow planes, edge-on
    g.appendChild(el('line', { class: 'sub-detail', x1: -5.7, y1: -0.3, x2: -3.9, y2: -0.3 }));
    // torpedo tube shutters — amidships-forward and angled out, where a 688
    // carries them, not in the nose: the nose is full of the bow sonar sphere
    for (const x of [-3.9, -3.0])
      g.appendChild(el('line', { class: 'sub-detail', x1: x, y1: 1.05, x2: x + 0.85, y2: 1.6 }));
    // cruciform tail: rudder above, lower fin below, stern planes through both
    g.appendChild(el('path', { class: 'sub-detail', d: 'M3.2,-2.05 L4.8,-4.3 L6.0,-4.3 L6.35,-1.0' }));
    g.appendChild(el('path', { class: 'sub-detail', d: 'M3.9,2.05 L5.1,3.8 L6.0,3.8 L6.35,1.0' }));
    g.appendChild(el('line', { class: 'sub-detail', x1: 5.2, y1: 0, x2: 7.8, y2: 0 }));
    g.appendChild(el('ellipse', { class: 'sub-detail', cx: 7.4, cy: 0, rx: 0.4, ry: 1.3 }));
    return g;
  }

  // ---- friendly installations ----
  // Every American and allied base on this chart used to be a primitive: a
  // triangle for an airfield, a square for a depot, a diamond for the Fifth
  // Fleet's headquarters. Iran's sites are drawn as the things they are — a
  // trefoil, a launcher, a hull under way — and the asymmetry showed. The enemy
  // looked authored and our own order of battle looked like placeholder shapes
  // somebody meant to come back to.
  //
  // Two rules shape everything below. An ALLIED base renders hollow (see
  // .us-asset.ally in the stylesheet), so each silhouette is ONE closed contour
  // that still reads as itself in outline — no stack of overlapping subpaths
  // whose internal seams would surface the moment the fill came off. And the
  // fittings hang off a `.base-detail` group, held back until .map-deep-zoom for
  // the same reason the carrier's deck fittings are: a 0.6-unit stripe below
  // that zoom is not detail, it is dirt.

  // Air base: a control tower over a runway, piano keys at both thresholds. The
  // tower is what an airfield is recognised by from any angle and it is nothing
  // else — the obvious alternative, a swept-wing planform, is already the glyph
  // on every IRANIAN airbase, and the ramp a package launches from should not
  // wear the same mark as the ramp it is flying at. Mast, roof, cab, shaft and
  // runway are one path: an allied base outlines a single silhouette rather than
  // five parts with their joins showing.
  function airbaseIcon() {
    const g = el('g', { class: 'asset-icon' });
    g.appendChild(el('path', { d:
      'M-0.38,-6.35 L0.38,-6.35 L0.38,-4.65 L3.80,-4.65 L3.80,-3.78 L3.24,-3.78 ' +
      'L2.05,-0.60 L1.32,-0.60 L1.92,3.70 L7.00,3.70 L7.00,5.10 ' +
      'L-7.00,5.10 L-7.00,3.70 L-1.92,3.70 L-1.32,-0.60 L-2.05,-0.60 ' +
      'L-3.24,-3.78 L-3.80,-3.78 L-3.80,-4.65 L-0.38,-4.65 Z' }));
    const d = el('g', { class: 'base-detail' });
    // the threshold markings, which are the whole difference between a runway
    // and a plinth for the tower to stand on
    for (const x of [-6.85, -5.80, -4.75, -3.70, 3.10, 4.15, 5.20, 6.25])
      d.appendChild(el('rect', { class: 'base-cut', x, y: 4.05, width: 0.6, height: 0.68 }));
    // the cab glass, canted out over the shaft the way a real one is
    d.appendChild(el('path', { class: 'base-cut',
      d: 'M-2.90,-3.55 L2.90,-3.55 L2.10,-1.35 L-2.10,-1.35 Z' }));
    g.appendChild(d);
    return g;
  }

  // Logistics hub: containers stacked on a hardstand. Arifjan and Buehring are
  // where the theater's sustainment lives — the fuel, the rounds and the rations
  // every sortie on this map is spending — and a yard of boxes is what that
  // looks like from the air. The gaps between the containers are real gaps in
  // the silhouette rather than cut lines, so the stack still reads as three
  // boxes and not one block when the fill comes off for an ally.
  function logisticsIcon() {
    const g = el('g', { class: 'asset-icon', transform: 'scale(0.88)' });
    const box = (x, y, w, h) => g.appendChild(el('rect', { x, y, width: w, height: h }));
    box(-6.50, 3.55, 13.00, 1.25);      // hardstand
    box(-6.00, 0.05, 5.60, 3.20);       // bottom row: two forty-footers
    box(0.40, 0.05, 5.60, 3.20);
    box(-3.35, -3.40, 5.60, 3.20);      // and one more across the seam, as a yard stacks
    // corrugation — the one marking that says shipping container and not crate
    const d = el('g', { class: 'base-detail' });
    for (const [bx, by] of [[-6.00, 0.05], [0.40, 0.05], [-3.35, -3.40]])
      for (let i = 1; i <= 4; i++)
        d.appendChild(el('rect', { class: 'base-cut',
          x: bx + i * 1.12, y: by + 0.50, width: 0.26, height: 2.20 }));
    g.appendChild(d);
    return g;
  }

  // Naval Support Activity Bahrain: an anchor. Fifth Fleet's headquarters is not
  // a hull, and drawing it as one would put the command node in the same
  // language as the ships it commands — and in the same language as the Iranian
  // naval bases across the Gulf, which already wear a hull in profile. An anchor
  // means shore establishment and nothing else.
  //
  // The head is an arc inside the contour rather than a circle laid over the
  // shank, so the outline never draws a chord across itself; the eye is a cut,
  // which at chart scale is half a pixel and simply isn't there, and at zoom
  // turns the head into a ring.
  function navalIcon() {
    // 1.05, not 1: an anchor is a tall, narrow, thin-limbed mark next to a
    // 14-unit runway and an 11-unit container stack, and drawn at its authored
    // size the Fifth Fleet's headquarters was the faintest thing on the plot.
    const g = el('g', { class: 'asset-icon', transform: 'scale(1.05)' });
    g.appendChild(el('path', { d:
      'M-0.62,-3.33 A1.15,1.15 0 1 1 0.62,-3.33 L0.62,-2.75 L3.35,-2.75 L3.35,-1.75 ' +
      'L0.62,-1.75 L0.62,1.35 C1.22,2.70 2.02,3.48 3.02,3.86 L4.58,1.48 L4.02,4.34 ' +
      'C2.68,5.02 1.36,5.38 0,5.42 C-1.36,5.38 -2.68,5.02 -4.02,4.34 L-4.58,1.48 ' +
      'L-3.02,3.86 C-2.02,3.48 -1.22,2.70 -0.62,1.35 L-0.62,-1.75 L-3.35,-1.75 ' +
      'L-3.35,-2.75 L-0.62,-2.75 Z' }));
    g.appendChild(el('circle', { class: 'base-cut', cy: -4.30, r: 0.52 }));
    return g;
  }

  // The B-2 ramp at Diego Garcia. A flying wing is one of the few airframes a
  // silhouette can name outright — nothing else has that trailing edge — so the
  // double-W is drawn to the real planform: leading edge swept back a shade over
  // 30 degrees, two notches a side, and the centre spike between the exhausts
  // running further aft than any other point on the aircraft. Nose up, because
  // the long leg from the atoll to Iran is flown north.
  function bomberIcon() {
    const g = el('g', { class: 'asset-icon' });
    g.appendChild(el('path', { d:
      'M0,-3.15 L8.00,1.45 L8.00,2.25 L5.05,1.30 L3.25,2.80 L1.65,1.95 L0,3.45 ' +
      'L-1.65,1.95 L-3.25,2.80 L-5.05,1.30 L-8.00,2.25 L-8.00,1.45 Z' }));
    // cockpit, and the two intake fairings that ride on top of the wing
    const d = el('g', { class: 'base-detail' });
    d.appendChild(el('path', { class: 'base-cut',
      d: 'M-0.62,-1.55 L-0.42,-2.30 L0.42,-2.30 L0.62,-1.55 Z' }));
    for (const s of [-1, 1])
      d.appendChild(el('path', { class: 'base-cut',
        d: `M${s * 1.05},-1.15 L${s * 2.25},-1.15 L${s * 2.95},-0.35 L${s * 1.05},-0.35 Z` }));
    g.appendChild(d);
    return g;
  }

  function assetIcon(a) {
    // active === false is a unit not yet in theater (the second CSG, mid-ocean)
    // `cv-asset`/`label-above` are hooks for the one thing the escort screen
    // breaks: a carrier's own name is placed against a 16-unit flat-top, and
    // once the screen is up it is inside a 36-unit formation instead. See the
    // .map-deep-zoom label rules in the stylesheet.
    const g = el('g', {
      class: 'us-asset' + (a.kind === 'carrier' ? ' cv-asset' : '')
        + (a.labelAbove ? ' label-above' : '')
        + (a.ally ? ' ally' : '') + (a.active === false ? ' hidden' : ''),
      id: `asset-${a.id}`, transform: `translate(${a.x},${a.y})`,
    });
    let icon;
    if (a.kind === 'carrier') {
      icon = carrierGroup(a.id);
    } else if (a.kind === 'bomber') {
      icon = bomberIcon();
    } else if (a.kind === 'logistics') {
      icon = logisticsIcon();
    } else if (a.kind === 'naval') {
      icon = navalIcon();
    } else if (a.kind === 'submarine') {
      icon = submarineIcon();
    } else {
      icon = airbaseIcon();
    }
    g.appendChild(icon);
    // labelAbove keeps neighbouring bases (Nevatim/Hatzerim) from colliding
    const label = el('text', { y: a.labelAbove ? -11 : 17 });
    label.textContent = a.short;
    g.appendChild(label);
    return g;
  }

  function render() {
    svg = document.getElementById('map');
    world = document.getElementById('world');
    tooltip = document.getElementById('tooltip');
    world.innerHTML = '';
    // once per session, and before anything else is drawn — it goes UNDER
    // #world and render() is the only place that has both elements to hand
    mountGlobe();
    // every node the flight-quarters loop holds has just been thrown away
    cvAir.length = 0;

    // water backdrop — the THEATER's ocean, sized to the crop.
    //
    // It was five thousand units across through v2.36, which was fine for
    // exactly as long as nothing could ever see past it, and which is why
    // applyView had to switch it off the moment any of the globe layer was
    // meant to be visible. That swap is invisible because the two backdrops
    // are the same token (see .globe-water in globe.js) — but it is a swap of
    // the WHOLE ocean, including the Persian Gulf's, which stopped being
    // survivable at v2.37 when the chart's handover became something a pan
    // can start: two hundred units of drag and the globe layer's 15°
    // graticule was lying across the board.
    //
    // At crop size it occludes nothing outside the theater, so it needs no
    // swap at all: it fades with the rest of #world, over the same ocean in
    // the same colour, and the graticule stays outside the chart where it
    // belongs. It also cannot re-create the failure the old note warned
    // about — an opaque rect washing every continent geodata.js does not
    // carry toward the sea, drawing this file's coverage as a lighter box
    // across the middle of the earth — because the only continents under it
    // now are the ones geodata.js does carry.
    //
    // Geometry is set in measureWorld, which is where the crop is measured.
    waterRect = el('rect', { class: 'chart-water', fill: 'var(--water)' });
    world.appendChild(waterRect);

    // countries (real borders; the Caspian shows as water between them)
    //
    // Each path carries its own name in a data attribute so the Gulf council can
    // be READ off the plot. That is most of why the two camps are worth building:
    // "Doha and Riyadh have gone amber and Kuwait has gone blue" is a glance, and
    // the same fact in the sidebar is two gauges and a roster the player has to
    // open a panel to reach.
    //
    // ISLANDS goes through the same loop rather than a layer of its own, which
    // is the point of it: an island is not a different kind of thing from the
    // coast it sits off. It gets the same class, the same data-country contract
    // (so Kharg colours with the mainland the day Iran has a mood) and the same
    // seat in measureWorld's bbox.
    for (const c of COUNTRY_PATHS.concat(ISLANDS)) {
      const p = el('path', { class: `country ${c.cls || ''}`, d: c.d, 'fill-rule': 'evenodd' });
      p.dataset.country = c.name;
      world.appendChild(p);
    }
    for (const c of COUNTRY_LABELS) {
      const t = el('text', { class: 'country-label', x: c.x, y: c.y });
      t.textContent = c.name;
      world.appendChild(t);
    }

    for (const s of SEAS) {
      const t = el('text', { class: 'sea-label', x: s.x, y: s.y });
      t.textContent = s.name;
      world.appendChild(t);
    }

    // Island names. Two nested groups because the two transforms have different
    // owners: the outer one is the anchor and never moves, the inner one is
    // rewritten by syncIconScale on every zoom. Writing both onto one element
    // would mean that function had to reconstruct the translate it does not
    // otherwise know about.
    for (const s of ISLAND_LABELS) {
      const g = el('g', { class: 'island-label', transform: `translate(${s.x},${s.y})` });
      const sc = el('g', { class: 'isl-scale', transform: `scale(${iconK})` });
      // text-anchor goes in as a STYLE, not a presentation attribute. The
      // stylesheet sets `text-anchor: middle` on .island-label text, and a CSS
      // declaration beats a presentation attribute however specific the
      // attribute looks — written as an attribute, every label asking to hang
      // off one end silently rendered centred, half its width from where it was
      // placed. (data.js's two `label.anchor` targets are the same bug, still
      // live: targetIcon writes that one as an attribute under `.target text`,
      // which also sets text-anchor in CSS.)
      const t = el('text', s.anchor ? { style: `text-anchor: ${s.anchor}` } : {});
      t.textContent = s.name;
      sc.appendChild(t);
      g.appendChild(sc);
      world.appendChild(g);
    }

    // Hormuz status indicator
    const hz = el('g', { id: 'hormuz-indicator', transform: `translate(${HORMUZ_POS.x},${HORMUZ_POS.y})` });
    hz.appendChild(el('circle', { id: 'hormuz-dot', r: 5, class: 'hz-open' }));
    const hzLabel = el('text', { y: 16, 'font-size': 9, id: 'hormuz-label', class: 'hz-open' });
    hzLabel.textContent = 'HORMUZ: OPEN';
    hz.appendChild(hzLabel);
    world.appendChild(hz);

    // ...and the second strait, drawn with exactly the same furniture 250 units
    // below the frame. It is `hidden` until the southern front opens, which is
    // three campaigns in four: an indicator reading BAB AL-MANDAB: OPEN in a war
    // that has no Yemen in it is a promise the campaign never keeps, and a
    // player who panned down and found it would go looking for a mechanic.
    const bm = el('g', { id: 'mandab-indicator', class: 'hidden',
      transform: `translate(${MANDAB_POS.x},${MANDAB_POS.y})` });
    bm.appendChild(el('circle', { id: 'mandab-dot', r: 5, class: 'hz-open' }));
    const bmLabel = el('text', { y: 16, 'font-size': 9, id: 'mandab-label', class: 'hz-open' });
    bmLabel.textContent = 'BAB AL-MANDAB: OPEN';
    bm.appendChild(bmLabel);
    world.appendChild(bm);

    // forward basing layer (shown by default — the BASES button in the map
    // header hides it when the plot gets busy)
    //
    // The two Kuwait camps used to carry ATACMS/PrSM range rings. Two pairs of
    // 300/500 km circles centred a few map units apart drew four near-concentric
    // arcs across the whole northern Gulf, over Bushehr and Kharg — the busiest
    // corner of the target list — and the layer is on all the time now, so that
    // clutter is permanent rather than opt-in. The fires themselves are still
    // announced in each camp's tooltip, which is where the information belongs.
    const fwd = el('g', { id: 'forward-layer', class: forwardOn ? '' : 'hidden' });
    const forwardAssets = US_ASSETS.filter(a => a.forward);
    for (const a of forwardAssets) {
      const g = assetIcon(a);
      attachTooltip(g, () => `<span class="tt-name">${a.name}</span><br>${a.desc}` +
        // An allied base reports ITS OWN capital's posture. Before the RSAF
        // existed this could hardcode Jerusalem's, because Jerusalem was the
        // only ally with a ramp on the board; Khamis Mushait reading "ISRAEL:
        // COORDINATED" is the same class of mistake as an IAF package launching
        // out of it.
        (a.ally
          ? `<br><em style="color:var(--amber)">ALLIED — NOT UNDER US COMMAND · ${
              a.allyOf === 'saudi' ? Game.saudiStatus() : Game.israelStatus()}</em>`
          : `<br><em style="color:var(--blue)">${a.sortie ? 'Fixed-wing sorties: YES' : 'Fixed-wing sorties: NO'}` +
            ` · ${a.atacms ? 'ATACMS/PrSM: YES' : 'ATACMS/PrSM: NO'}</em>`));
      fwd.appendChild(g);
    }
    world.appendChild(fwd);

    // strike FX layer sits under icons' labels but above land
    world.appendChild(el('g', { id: 'fx-layer' }));

    // US assets
    for (const a of US_ASSETS) {
      if (a.forward) continue; // rendered on the forward layer above
      if (a.nomap) continue;   // off-chart staging field — origin only, no icon
      const g = assetIcon(a);
      attachTooltip(g, () => `<span class="tt-name">${a.name}</span><br>${a.desc}`);
      world.appendChild(g);
    }

    // targets
    for (const t of TARGETS) {
      // A dispersal site is not merely invisible before it is found — it is not
      // in the document at all. Hiding it with a class would leave its name and
      // position sitting in the DOM for anyone who opened the inspector, and
      // the whole point of the launcher hunt is that the player does not know
      // where they are. buildTarget appends it the moment ISR earns it.
      // ...and neither is a covert site, for exactly the same reason: what is
      // not in the folder is not in the document.
      if (!onPlot(t)) continue;
      buildTarget(t);
    }

    // the boxes: activity localized but not resolved into anything strikeable
    syncCovert();

    measureWorld();   // the crop the chart is drawn for, and its own ocean
    initPanZoom();
    applyView();
  }

  // Construct one target's icon, tooltip and click handler, and put it on the
  // plot. Called for the fixed target list at render time, and for a launcher
  // group at the moment it is located.
  function buildTarget(t) {
    if (document.getElementById(`tgt-${t.id}`)) return;
    {
      const g = targetIcon(t);
      attachTooltip(g, () => {
        const st = t.status || 'intact';
        const stColor = st === 'intact' ? 'var(--red)' : st === 'damaged' ? 'var(--amber)' : 'var(--dim)';
        // The condition track is the whole strike decision, and it is an
        // ESTIMATE — the tooltip shows the band CENTCOM is working from and how
        // old it is, never the true number. Game.condition owns that judgement.
        const band = Game.estimate(t);
        const cond = st === 'destroyed' ? 'ASSESSED: destroyed'
          : `ASSESSED: ${st} — ${Game.condition(t)}`;
        const stale = !band.known && band.age > 0
          ? `<br><span style="color:var(--dim)">Last assessed ${band.age} turn${band.age === 1 ? '' : 's'} ago — the estimate ` +
            `widens every night nobody looks.</span>` : '';
        const barred = Game.barred(t);
        return `<span class="tt-name">${t.name}</span><br>` +
          `<span class="tt-status" style="color:${stColor}">${cond}</span><br>${Game.targetDesc(t)}${stale}` +
          (st === 'damaged' && Game.wearsDown(t)
            ? `<br><span style="color:var(--amber)">Repairs overnight unless struck again.</span>` : '') +
          (t.dispersal && t.located
            ? `<br><span style="color:var(--amber)">FIX IS PERISHABLE — this group moves again if it is ` +
              `not struck this turn.</span>` : '') +
          // The last line is what tapping this site will DO, and on a level
          // where the president does not write the tasking order the honest
          // answer is "nothing". Saying "click to plan strike" there sends the
          // player hunting for a dialog that is never going to open, which is
          // the worst possible way to learn a rule — so the plot says what it
          // is for instead. It stays a fully live common operating picture on
          // every difficulty; it simply is not where orders are written.
          (st === 'destroyed' ? ''
            : !Game.freeTargeting()
              ? `<br><em style="color:var(--dim)">CENTCOM tasks this aimpoint — see tonight's courses of action.</em>`
            : barred ? `<br><em style="color:var(--red)">${barred}</em>`
            : `<br><em style="color:var(--blue)">Click to plan strike</em>`);
      });
      g.addEventListener('click', (e) => {
        e.stopPropagation();
        if (typeof onTargetClick !== 'function') return;
        // `t` is only the icon the event happened to land on — with the discs
        // overlapping that is whichever was drawn last, not whichever the
        // player aimed at. pickTarget decides.
        pickTarget(clientToWorld(e.clientX, e.clientY), e, t);
      });
      world.appendChild(g);
    }
  }

  // ---- the middle tier: a box, not a site ----
  // A suspected site is drawn as a dashed ellipse at a position that is
  // deliberately NOT its own, labelled with the problem instead of the answer.
  // It is not a `.target` and it carries no target id: the whole value of the
  // tier is that the player knows something is out there and does not yet know
  // what or exactly where, and an id in the DOM hands them both. Game.suspected-
  // Boxes owns the fuzzing, so the offset is stable across re-renders instead of
  // walking the box across the map every time the panel redraws.
  //
  // Rebuilt wholesale rather than diffed. There are at most a handful of these,
  // they change only at a turn boundary or on an intelligence tasking, and a
  // diff would be more code than the thing it optimises.
  function syncCovert() {
    if (!world) return;
    let layer = document.getElementById('covert-layer');
    if (!layer) {
      layer = el('g', { id: 'covert-layer' });
      world.appendChild(layer);
    }
    while (layer.firstChild) layer.removeChild(layer.firstChild);
    for (const b of Game.suspectedBoxes()) {
      const g = el('g', { class: 'covert-box', id: b.key,
        transform: `translate(${b.x},${b.y})` });
      // transparent fill so the whole ellipse is a hover surface; there is no
      // click handler, because there is nothing here to plan a strike against
      g.appendChild(el('ellipse', { class: 'cb-ring', rx: 27, ry: 19, fill: 'transparent' }));
      const label = el('text', { y: 31 });
      label.textContent = 'UNRESOLVED';
      g.appendChild(label);
      attachTooltip(g, () =>
        `<span class="tt-name">Unresolved activity</span><br>` +
        `<span class="tt-status" style="color:var(--amber)">NOT AN AIMPOINT</span><br>` +
        `${b.region} — ${b.hint}. The analysts have put a box around something here and cannot yet ` +
        `resolve it into a site. The position is approximate and nothing can be planned against it.` +
        `<br><em style="color:var(--blue)">Work the target folder from the Intelligence panel.</em>`);
      layer.appendChild(g);
    }
  }

  // Every target on the plot whose touch disc contains a point, nearest first.
  function targetsUnder(p) {
    const out = [];
    for (const t of TARGETS) {
      if (!onPlot(t) || !document.getElementById(`tgt-${t.id}`)) continue;
      const d = Math.hypot(p.x - t.x, p.y - t.y);
      if (d <= hitR) out.push({ t, d });
    }
    return out.sort((a, b) => a.d - b.d);
  }

  function pickTarget(p, ev, fallback) {
    closePicker();
    const near = targetsUnder(p);
    if (!near.length) { onTargetClick(fallback); return; }

    const sureR = SURE_PX / (pxPerUnit() || 1);
    // Landing inside one icon, with no second icon also under the finger, is an
    // aim and not a guess — take it whatever else is inside the 44px disc.
    const sure = near[0].d <= sureR && (near.length < 2 || near[1].d > sureR);
    if (near.length === 1 || sure) { onTargetClick(near[0].t); return; }

    openPicker(near.map(n => n.t), ev);
  }

  // ---- the ambiguous-tap sheet ----
  // Deliberately not a hover affordance: it exists for the case where the
  // player has already committed to a tap and the map cannot honestly say which
  // site they meant. Guessing there is worse than asking — the wrong guess
  // opens a strike modal for a site 20 miles from the one they wanted, and the
  // only tell is a name they are not reading yet.
  function openPicker(list, ev) {
    const box = document.getElementById('target-pick');
    const cont = document.getElementById('map-container');
    tooltip.classList.add('hidden');

    box.innerHTML = `<div class="pick-head">${list.length} SITES UNDER THIS TAP</div>` +
      list.map((t, i) => {
        const st = t.status || 'intact';
        const col = st === 'intact' ? 'var(--red)' : st === 'damaged' ? 'var(--amber)' : 'var(--dim)';
        return `<button class="pick-row" data-i="${i}">` +
          `<span class="pick-name">${t.name}</span>` +
          `<span class="pick-sub" style="color:${col}">ASSESSED ${st}</span></button>`;
      }).join('');
    box.classList.remove('hidden');

    // placed off the tap, then pulled back inside the chart if it would hang off
    const r = cont.getBoundingClientRect();
    let x = ev.clientX - r.left + 14, y = ev.clientY - r.top + 10;
    const bb = box.getBoundingClientRect();
    if (x + bb.width > r.width) x = Math.max(4, x - bb.width - 28);
    if (y + bb.height > r.height) y = Math.max(4, r.height - bb.height - 4);
    box.style.left = x + 'px';
    box.style.top = y + 'px';

    box.onclick = (e) => {
      const row = e.target.closest('.pick-row');
      if (!row) return;
      const t = list[+row.dataset.i];
      closePicker();
      onTargetClick(t);
    };
    const first = box.querySelector('.pick-row');
    if (first) first.focus();
  }

  function closePicker() {
    const box = document.getElementById('target-pick');
    if (!box) return;
    box.classList.add('hidden');
    box.onclick = null;
  }

  // callback set by game.js
  let onTargetClick = null;
  function setTargetClickHandler(fn) { onTargetClick = fn; }

  function attachTooltip(node, htmlFn) {
    node.addEventListener('mousemove', (e) => {
      tooltip.innerHTML = htmlFn();
      tooltip.classList.remove('hidden');
      const rect = document.getElementById('map-container').getBoundingClientRect();
      let tx = e.clientX - rect.left + 16, ty = e.clientY - rect.top + 12;
      if (tx + 250 > rect.width) tx -= 270;
      if (ty + 120 > rect.height) ty -= 130;
      tooltip.style.left = tx + 'px';
      tooltip.style.top = ty + 'px';
    });
    node.addEventListener('mouseleave', () => tooltip.classList.add('hidden'));
  }

  // ---- pan & zoom ----
  // The chart is a crop. geodata.js carries this region and nothing outside it,
  // so every country that runs off the edge is cut on a straight line — Africa
  // on the left, the Sahara across the top, the Indian Ocean down the right.
  // Those four lines are the edge of the world: bring one into frame and the
  // map stops reading as a map and starts reading as a picture of a map. WORLD
  // is that crop rect. Until v2.36 the view was clamped inside it on all four
  // sides; it is now the rect the chart's own DISSOLVE is measured against
  // instead (`homeT`), and the clamp inside it survives only for a build with
  // no globe behind the crop. Same rect, same reason, one fewer wall.
  //
  // It is measured off the geometry at render time rather than written down as
  // a constant, because the one thing that would silently break a hardcoded
  // rect is the thing most likely to happen to it — someone extending a country
  // path in geodata.js. The literal below is only the fallback for a browser
  // that hands back an empty bbox.
  let WORLD = { x0: -350, y0: -472, x1: 1450, y1: 1303 };
  const MAX_ZOOM = 10;

  // ---- and past the edge of the world, the world ----
  //
  // Everything above is still true: geodata.js carries the theater and
  // nothing outside it, and bringing one of its four cut edges into frame
  // makes the chart read as a picture of a chart. What changed is that the
  // crop is no longer the LAST thing out there. js/globe.js draws the whole
  // planet from js/worldgeo.js, in the same projection — geodata.js and
  // worldgeo.js are both Natural Earth in equirectangular std-parallel 28N
  // with x=0 at 38.5E, which is not a coincidence but the contract the globe
  // was built against — so the two charts are the same chart at two
  // altitudes and a point drawn by either lands on the same pixel.
  //
  // So the crop's floor stops being a wall and becomes a HANDOVER. At and
  // above it nothing whatsoever has changed: same clamp, same transform,
  // same paths, byte for byte. Below it the theater chart cross-fades out,
  // the world fades in behind it, and the projection rolls from flat to
  // orthographic until the earth is a disc in the middle of the frame.
  //
  // GLOBE_ROUND is where the rolling finishes, as a fraction of the crop's
  // own floor — half of it, which is one octave of wheel. Expressed against
  // the crop rather than as an absolute zoom for the reason the crop floor
  // is measured per frame rather than written down: both depend on the shape
  // of the window, and a constant tuned against one shape is wrong on every
  // other.
  //
  // 0.30 is 1.74 octaves, about four and a half notches of a 1.3x wheel,
  // and it was measured rather than picked. At 0.5 — one octave, the
  // obvious first guess — the whole handover fits inside THREE notches on
  // a 16:9 panel and the chart's own cross-fade inside less than one of
  // them, so the theater did not roll out flat: it blinked out and a globe
  // blinked in. The band has to be wider than the gesture that crosses it
  // or there is no morph to see.
  //
  // It also lands the end of the morph where the curvature becomes
  // visible rather than somewhere arbitrary. t reaches 0 at k ~ 0.24 and
  // the limb comes into frame on the wide axis at k ~ 0.27, so the
  // projection finishes rolling over about when the edge of the world
  // appears, and everything below that is an honest globe being spun down
  // to the floor, where the whole disc fits with a margin
  // (Globe.floorZoom).
  const GLOBE_ROUND = 0.30;

  // How much of the frame the crop has to fill before it stops being the
  // thing the player is looking at. `cover` below is 1 whenever no crop
  // edge is in frame, so the chart holds full opacity until an edge is
  // about a twelfth of the way in, dissolves over the next quarter of a
  // frame-width of pan, and is gone before the edge reaches the middle —
  // which is the point past which most of what is on screen has no chart
  // under it and the crop would be answering for a picture it does not
  // have. (The pole clamp that used to sit here is globe.js's
  // LAT_SPIN_CLAMP and now comes back through Globe.camLimits, so there is
  // no second copy of it to drift.)
  const HOME_GONE = 0.35;

  let globeReady = false;

  function smoothstep(a, b, x) {
    const u = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return u * u * (3 - 2 * u);
  }

  // The globe layer is built once and lives UNDER #world, so every marker,
  // label, strike and carrier the game draws sits on top of it and nothing
  // in the 5,000 lines below had to learn the world got bigger. It is
  // display:none at every zoom the war is actually fought at, which is what
  // makes this free: follow() returns on its first line and the reprojection
  // loop never runs.
  function mountGlobe() {
    if (globeReady || typeof Globe === 'undefined' || typeof WORLD_GEO === 'undefined') return;
    const host = el('g', { class: 'globe-host' });
    svg.insertBefore(host, world);
    Globe.attach(host);

    // ---- and one thing on the globe that is the game's ----
    //
    // Iran takes .country.iran up there, which is the fill it already has
    // on the chart, and at a thousand miles that is a two-value shift on a
    // shape forty pixels across — true, and not findable. The war needs a
    // mark. This is the ONLY piece of the game's symbology that survives
    // the handover, and it survives because at globe scale the one question
    // the picture has to answer is where the theater IS; the other forty
    // markers are answers to questions about a board that cannot be reached
    // from here.
    //
    // It sits outside the camera group and is placed per frame in screen
    // space, for the reason every label on this layer is: a marker is a
    // statement about a place and not a measurement of one, so it must not
    // grow with the world transform.
    theaterG = el('g', { class: 'theater-mark' });
    theaterG.appendChild(el('circle', { class: 'tm-ring', r: 17 }));
    for (const t of [[0, -25, 0, -20], [0, 20, 0, 25], [-25, 0, -20, 0], [20, 0, 25, 0]])
      theaterG.appendChild(el('line', { class: 'tm-tick', x1: t[0], y1: t[1], x2: t[2], y2: t[3] }));
    const lab = el('text', { class: 'tm-label', y: 40 });
    lab.textContent = 'THEATER';
    theaterG.appendChild(lab);
    host.appendChild(theaterG);

    globeReady = true;
  }

  // The centre of the theater chart, in lon/lat. (500, 380) is the middle
  // of the viewBox, which is central Iran — geodata.js's grid was built
  // around this war, so the chart's centre and the war's centre are the
  // same point and there is nothing to choose between them.
  const THEATER_LON = 53.5, THEATER_LAT = 29.43;
  let theaterG = null, waterRect = null;

  // Fades in as the chart fades out — the two are one dissolve and not two
  // effects — and goes away when the theater has been spun round to the far
  // side of the earth, which is a thing a player can do and which would
  // otherwise leave a ring hanging over the middle of the Pacific.
  //
  // It reads chartT rather than the morph, so from v2.37 it is also the way
  // home from a chart panned off sideways at full zoom: the only mark left on
  // screen once the theater is off it, pointing at where the war is. RESET is
  // the other one, and is the one that actually gets you there.
  function syncTheater(chartT, chartA) {
    if (!theaterG) return;
    if (!(chartT < 1 && chartA < 1)) {
      if (theaterG.style.display !== 'none') theaterG.style.display = 'none';
      return;
    }
    const p = Globe.at(THEATER_LON, THEATER_LAT);
    if (p.front < 0.06) { theaterG.style.display = 'none'; return; }
    theaterG.style.display = '';
    theaterG.style.opacity = (1 - chartA).toFixed(3);
    theaterG.setAttribute('transform', `translate(${p.x.toFixed(1)},${p.y.toFixed(1)})`);
  }

  function measureWorld() {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of world.querySelectorAll('path.country')) {
      const b = p.getBBox();
      if (!b.width && !b.height) continue;
      x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y);
      x1 = Math.max(x1, b.x + b.width); y1 = Math.max(y1, b.y + b.height);
    }
    // a border is stroked, and a stroke straddles its path: hold the view two
    // units inside the bbox so a cut edge's own line cannot peek in
    if (x1 - x0 > 1 && y1 - y0 > 1) {
      WORLD = { x0: x0 + 2, y0: y0 + 2, x1: x1 - 2, y1: y1 - 2 };
    }
    // The theater's ocean is the theater's, and the crop is what says how far
    // that is — measured here for the same reason the rect above is, and off
    // the raw bbox rather than the inset one, so the outermost stroke on the
    // cut edge still has water under it.
    if (waterRect && x1 > x0) {
      waterRect.setAttribute('x', x0 - 2);
      waterRect.setAttribute('y', y0 - 2);
      waterRect.setAttribute('width', x1 - x0 + 4);
      waterRect.setAttribute('height', y1 - y0 + 4);
    }
  }

  // How much of the world the frame is actually showing, in viewBox units.
  // NOT simply 0,0–1000,760: the svg is xMidYMid meet, so the viewBox is fitted
  // to the element and whatever slack is left on the wider axis shows MORE
  // world than the viewBox asked for. A wide short window therefore sees
  // further past the left and right edges than a square one does — which is
  // exactly why the zoom floor below is computed per-frame instead of being the
  // flat 0.6 it used to be. That constant was tuned against one window shape
  // and let the crop edge show on every other.
  // Last good measurement, kept because a zero-size rect is not a small frame —
  // it is no answer at all (the element is mid-layout, or the tab is not being
  // rendered). Treating it as 1000x760 would quietly relax the clamp to the
  // viewBox and let the crop edge back in; reusing the last real frame keeps
  // the stop where the player last saw it.
  let lastVis = { x: 0, y: 0, w: 1000, h: 760 };

  function visibleBox() {
    const r = svg.getBoundingClientRect();
    const vw = 1000, vh = 760;
    if (!r.width || !r.height) return lastVis;
    const s = Math.min(r.width / vw, r.height / vh);
    const w = r.width / s, h = r.height / s;
    lastVis = { x: (vw - w) / 2, y: (vh - h) / 2, w, h };
    return lastVis;
  }

  // the widest the frame can open before it is showing more than the CROP
  // has. This used to be the zoom floor and is now the handover: at exactly
  // this k the theater fills the frame and the world behind it is still
  // perfectly flat, which is the state every version before this one called
  // "zoomed all the way out".
  function cropZoom(vis) {
    return Math.max(vis.w / (WORLD.x1 - WORLD.x0), vis.h / (WORLD.y1 - WORLD.y0));
  }

  // the widest the frame can open, full stop
  function minZoom(vis) {
    const crop = cropZoom(vis);
    return globeReady ? Math.min(crop, Globe.floorZoom()) : crop;
  }

  // 1 is the flat chart, 0 is a globe. Measured on the LOG of the zoom
  // because zoom is multiplicative — a linear ramp between two k values
  // spends most of the gesture at one end of the morph and crosses the
  // middle in a frame, which reads as a snap with a long wait either side.
  function globeT(vis, k) {
    if (!globeReady) return 1;
    const hi = cropZoom(vis), lo = hi * GLOBE_ROUND;
    if (!(hi > 0) || k >= hi) return 1;
    if (k <= lo) return 0;
    return smoothstep(0, 1, Math.log(k / lo) / Math.log(hi / lo));
  }

  // ---- and the crop's other three sides ----
  //
  // 1 while the crop is the whole picture, 0 once it is not. v2.36 made the
  // crop's FLOOR a handover and left its four sides a wall, and the reason
  // was that `globeT` above is a function of zoom alone: the only way out of
  // the theater was downward, and on the way back up the clamp dragged the
  // camera home again. Spin to Brazil, zoom in, arrive over Iran. The one
  // gesture a player reaches for when they want a closer look at something
  // was the one gesture that took the something away.
  //
  // What was missing is that the crop is an INSET, not a world: it is drawn
  // when the frame is looking at it and it is not drawn when the frame is
  // somewhere else, and that is a question about where the camera is POINTED
  // and not about how high it is. So the chart's authority is now the lower
  // of two numbers — altitude, above, and aim, here.
  //
  // `cover` is how much of the frame the crop fills, normalised by the
  // SMALLER of the two rects, and that normalisation is the whole of why
  // this composes with v2.36 rather than fighting it. Zoomed in over the
  // Gulf the frame is inside the crop and cover is 1; zoomed out below the
  // floor the crop is inside the frame and cover is STILL 1, so every frame
  // of the existing globe handover runs with this term pinned at 1 and
  // unable to touch it. It falls only when a crop edge is genuinely in
  // frame, which is the one state in which the chart cannot answer for the
  // picture — and is exactly the state the old wall existed to prevent.
  //
  // Separable, so it is two spans and a multiply rather than a rectangle
  // intersection: the two axes are independent and the product IS the area
  // ratio.
  function homeT(vis) {
    const b = worldBox();
    const ox = Math.max(0, Math.min(b.x1, WORLD.x1) - Math.max(b.x0, WORLD.x0)) /
      Math.min(b.x1 - b.x0, WORLD.x1 - WORLD.x0);
    const oy = Math.max(0, Math.min(b.y1, WORLD.y1) - Math.max(b.y0, WORLD.y0)) /
      Math.min(b.y1 - b.y0, WORLD.y1 - WORLD.y0);
    return smoothstep(HOME_GONE, 1, Math.min(1, ox) * Math.min(1, oy));
  }

  // Pull the view back inside what there is to look at. Applied at the single
  // choke point every gesture goes through, so wheel, drag, pinch, the
  // buttons and reset are all covered by one rule. Note it clamps `view` and
  // not the gesture's anchor: a drag that runs into the edge and comes back
  // tracks the cursor again from where it left, rather than sliding by
  // however far it was held past the stop.
  //
  // Returns BOTH numbers the frame is described by — `t`, how flat the
  // projection is, which is zoom alone and drives the morph, and `chartT`,
  // whether the theater crop is in charge, which is the lower of that and
  // `homeT`. They were one number through v2.36 and separating them is what
  // makes panning off the chart possible at all: handed one, globe.js would
  // be asked for an orthographic earth of radius k·R the moment a player
  // walked off the side of Iran at k = 5.
  function clampView() {
    const vis = visibleBox();
    view.k = Math.min(MAX_ZOOM, Math.max(minZoom(vis), view.k));
    const t = globeT(vis, view.k);

    if (!globeReady) {
      // Nothing behind the crop, so its four cut edges really are the edge of
      // everything and the view is pinned inside them. This is every version
      // of this map before v2.36, and it is still what a failed globe load,
      // a missing worldgeo.js and the headless harness all get.
      const lox = vis.x + vis.w - view.k * WORLD.x1, hix = vis.x - view.k * WORLD.x0;
      const loy = vis.y + vis.h - view.k * WORLD.y1, hiy = vis.y - view.k * WORLD.y0;
      view.x = Math.min(Math.max(view.x, lox), hix);
      view.y = Math.min(Math.max(view.y, loy), hiy);
      return { t: 1, chartT: 1 };
    }

    // ---- with a world behind it, the world's rule, at every altitude ----
    //
    // The crop rect is no longer a stop of any kind. What keeps its cut
    // edges off the screen is the dissolve above, which has taken the chart
    // away before an edge is far enough in to read as one — the same
    // argument the floor already makes, turned ninety degrees. So the camera
    // obeys globe.js's clamp everywhere: a latitude stop so the pole never
    // tips past the top of the frame, and a longitude stop at the seam in
    // the empty Pacific, both of which open up as the earth rounds. They are
    // asked for in degrees and converted here, because this file's camera is
    // (x, y, k) and that file's is (lon, lat, k) — one rule, two spellings,
    // same as the projection itself.
    const C = Globe.C, L = Globe.camLimits(vis, view.k, t);
    // view.y = VH/2 - k*DEG_Y*(LAT0 - lat), inverted at lat = ±L.lat
    const ya = C.VH / 2 - view.k * C.DEG_Y * (C.LAT0 - L.lat);
    const yb = C.VH / 2 - view.k * C.DEG_Y * (C.LAT0 + L.lat);
    view.y = Math.min(Math.max(view.y, Math.min(ya, yb)), Math.max(ya, yb));
    // view.x = VW/2 - k*DEG_X*(lon - LON0), inverted at lon = ±L.lon
    const xa = C.VW / 2 - view.k * C.DEG_X * (L.lon - C.LON0);
    const xb = C.VW / 2 - view.k * C.DEG_X * (-L.lon - C.LON0);
    view.x = Math.min(Math.max(view.x, Math.min(xa, xb)), Math.max(xa, xb));

    // homeT reads the view, so it is measured AFTER the clamp has finished
    // moving it, never before.
    return { t, chartT: Math.min(t, homeT(vis)) };
  }

  function applyView() {
    const { t, chartT } = clampView();
    world.setAttribute('transform', `translate(${view.x},${view.y}) scale(${view.k})`);

    // ---- the handover ----
    //
    // The theater chart fades out over the top quarter of the morph and the
    // world fades in behind it (globe.js's follow() owns its half). They are
    // the same coastlines from the same survey in the same projection, so
    // the overlap reads as a change of resolution rather than as two maps —
    // which is the only reason a cross-fade works here at all.
    //
    // It has to be a fade rather than a swap because #world opens with an
    // opaque water rect 5,000 units across: nothing behind it is visible at
    // any opacity but zero, and the moment it IS visible the crop's four cut
    // edges are showing against geography that continues past them, which is
    // the exact failure the WORLD comment above exists to prevent.
    //
    // pointer-events goes with it. Every target on the board still has its
    // 44px hit disc down here, stacked into a cluster a hundred pixels
    // across; a click at globe zoom would open a strike dialog on whichever
    // one happened to be on top.
    // 0.50-0.97 of t, which on the band above is about 1.6 notches of the
    // wheel — long enough to read as a dissolve and short enough that the
    // player is not flying a half-transparent chart. The top end is 0.97
    // rather than 1 so the first notch past the old floor is unambiguously
    // still the theater: a fade that starts the instant t leaves 1 makes
    // the handover feel like it happened a notch earlier than it did.
    //
    // Driven by chartT rather than t since v2.37, which is the same dissolve
    // asked a wider question: not "how far out is the camera" but "is the
    // theater still what this frame is of". Zooming out and panning away are
    // one gesture as far as this line is concerned, and they have to be, or
    // the chart's cut edge is on screen for one of the two.
    const chartA = chartT >= 1 ? 1 : smoothstep(0.50, 0.97, chartT);
    world.style.opacity = chartA >= 1 ? '' : chartA.toFixed(3);
    // The ocean needs no handover of its own any more, which is the whole
    // dividend of cutting it to the crop (see measureWorld). Through v2.36 it
    // was five thousand units across, so it hid the entire world layer and
    // had to be switched OFF the instant any of that layer was meant to be
    // visible — a swap that worked because the two backdrops are the same
    // token, and that stops working the moment the handover can also happen
    // sideways: at crop size it took the Persian Gulf's own water off on a
    // two-hundred-unit drag and put the globe layer's 15° graticule across
    // the board. Cut to the crop it occludes nothing outside the theater, so
    // it simply fades with the rest of #world on the line above, over the
    // same ocean in the same colour. While it is up the graticule marks the
    // world OUTSIDE the chart, which is the true thing for it to mark, and by
    // the time the earth starts to curve (t < 0.18) chartA is long since 0.
    world.style.pointerEvents = chartA < 0.5 ? 'none' : '';
    if (globeReady) { Globe.follow(view, t, chartT); syncTheater(chartT, chartA); }
    // reveal each carrier's escort screen once zoomed in, the individual hull
    // classes and deck fittings one step past that, and at the bottom of the
    // zoom the haze grey and the flight cycle (see the strike group section for
    // why these three numbers are where they are)
    svg.classList.toggle('map-deep-zoom', view.k >= 1.6);
    svg.classList.toggle('map-close-zoom', view.k >= 2.2);
    // ...and at the bottom of the zoom the ships stop being symbols altogether
    svg.classList.toggle('map-max-zoom', view.k >= MAX_DETAIL_ZOOM);
    // small/touch screens hide the site names until the chart is open enough
    // for them not to overlap — see .map-far-zoom in the stylesheet
    svg.classList.toggle('map-far-zoom', view.k < 1.7);
    // the touch discs and the drawn icons are both sized in screen pixels, so
    // they are re-derived here: this is the one choke point every gesture
    // already goes through
    syncHitDiscs();
    syncIconScale();
    syncSouthCue();
    wallPlotSync();   // the wall's small plot is the same chart, so it moves too
    syncCarrierAir();
  }

  // ---- the southern front is off the bottom of the frame ----
  // Sanaa plots 150 units below the opening view and Hodeidah 170, and that is
  // the honest place for them: the frame runs south to about 19.4N and Yemen
  // starts at 19. Widening it to hold them would cost ~30% off everything else
  // on the chart, which is the entire war (see the comment on the svg element
  // in index.html, and the Lincoln's deep station, which is off the picture for
  // exactly the same reason).
  //
  // So what the map owes the player is not corrected geography — it is a way to
  // know the theater is down there. A cue on the bottom edge, shown only once
  // the front has actually opened, and taken away again the moment the theater
  // is genuinely on screen. In the three campaigns out of four that never have
  // a southern front it never appears at all: a permanent arrow pointing at an
  // empty sea is worse than no arrow.
  const SOUTH_FOCUS = { x: 165, y: 925 };

  // The visible rect in WORLD coordinates. `world` carries
  // translate(view.x,view.y) scale(view.k), so a world point lands at
  // view.x + view.k*wx — and this is that inverted. NOT toSvgPoint, which is
  // viewBox space and short by view.k (the same distinction pickTarget has to
  // make, documented in CLAUDE.md).
  function worldBox() {
    const vis = visibleBox();
    return {
      x0: (vis.x - view.x) / view.k, y0: (vis.y - view.y) / view.k,
      x1: (vis.x + vis.w - view.x) / view.k, y1: (vis.y + vis.h - view.y) / view.k,
    };
  }

  function syncSouthCue() {
    const cue = document.getElementById('south-cue');
    if (!cue) return;
    const open = !!(typeof Game !== 'undefined' && Game.G.houthi && Game.G.houthi.entered);
    const b = worldBox();
    const shown = SOUTH_FOCUS.x >= b.x0 && SOUTH_FOCUS.x <= b.x1 &&
      SOUTH_FOCUS.y >= b.y0 && SOUTH_FOCUS.y <= b.y1;
    cue.classList.toggle('hidden', !open || shown);
  }

  // Walk the chart down to Yemen. Zoom is set rather than kept, because the
  // player who taps this is arriving from a frame that had none of it in view
  // and the useful thing is the theater filling the screen — Khamis Mushait at
  // the top of it, the strait at the bottom.
  function focusSouth() {
    const vis = visibleBox();
    const k = Math.min(MAX_ZOOM, Math.max(minZoom(vis), 1.5));
    view.k = k;
    view.x = vis.x + vis.w / 2 - k * SOUTH_FOCUS.x;
    view.y = vis.y + vis.h / 2 - k * SOUTH_FOCUS.y;
    applyView();
  }

  function zoomAt(cx, cy, factor) {
    // clamped here as well as in clampView so the point under the cursor stays
    // under the cursor when the gesture runs into the floor or the ceiling
    const nk = Math.min(MAX_ZOOM, Math.max(minZoom(visibleBox()), view.k * factor));
    const f = nk / view.k;
    view.x = cx - f * (cx - view.x);
    view.y = cy - f * (cy - view.y);
    view.k = nk;
    applyView();
  }

  // convert client coords to svg user-space coords
  function clientToSvg(clientX, clientY) {
    const pt = svg.createSVGPoint();
    pt.x = clientX; pt.y = clientY;
    return pt.matrixTransform(svg.getScreenCTM().inverse());
  }
  function toSvgPoint(e) { return clientToSvg(e.clientX, e.clientY); }

  function initPanZoom() {
    svg.addEventListener('wheel', (e) => {
      e.preventDefault();
      const p = toSvgPoint(e);
      zoomAt(p.x, p.y, e.deltaY < 0 ? 1.15 : 1 / 1.15);
    }, { passive: false });

    svg.addEventListener('mousedown', (e) => {
      // any new gesture on the chart answers the picker's question with "neither"
      closePicker();
      panStart = { px: e.clientX, py: e.clientY, vx: view.x, vy: view.y };
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closePicker(); });
    window.addEventListener('mousemove', (e) => {
      if (!panStart) return;
      const dx = e.clientX - panStart.px, dy = e.clientY - panStart.py;
      // ignore sub-threshold jitter so clicks on targets aren't swallowed by panning
      if (!panning && Math.hypot(dx, dy) < 4) return;
      panning = true;
      svg.classList.add('panning');
      // scale mouse delta from screen px to svg units
      const ctm = svg.getScreenCTM();
      view.x = panStart.vx + dx / ctm.a;
      view.y = panStart.vy + dy / ctm.d;
      applyView();
    });
    window.addEventListener('mouseup', () => {
      panning = false;
      panStart = null;
      svg.classList.remove('panning');
    });

    initTouch();

    document.getElementById('zoom-in').addEventListener('click', () => zoomAt(500, 350, 1.3));
    document.getElementById('zoom-out').addEventListener('click', () => zoomAt(500, 350, 1 / 1.3));
    document.getElementById('zoom-reset').addEventListener('click', () => {
      view = { x: 0, y: 0, k: 1 };
      applyView();   // clamps up off 1 if the window is too wide for it
    });
    // The cue hides itself the instant the theater is in frame, so this is a
    // one-way trip: tap it and it is gone, and RESET brings the chart back to
    // the war. There is deliberately no toggle — a button that pans away and
    // then back is a button whose label has to lie in one of the two states.
    document.getElementById('south-cue').addEventListener('click', focusSouth);

    // The frame's shape decides how far out the view may open, so anything that
    // reshapes it can leave a legal view illegal — rotating a phone, a mobile
    // browser's URL bar sliding away, the sidebar reflowing. Watching the
    // element rather than the window catches all of them, including the ones
    // that never fire a window resize. (Same reason ui.js observes the sidebar.)
    new ResizeObserver(() => applyView()).observe(svg);
    document.getElementById('toggle-bases').addEventListener('click', () => {
      forwardOn = !forwardOn;
      const btn = document.getElementById('toggle-bases');
      document.getElementById('forward-layer').classList.toggle('hidden', !forwardOn);
      btn.classList.toggle('layer-on', forwardOn);
      btn.title = forwardOn ? 'Hide forward basing layer' : 'Show forward basing layer';
    });
  }

  // ---- touch: one finger pans, two fingers pinch-zoom ----
  // Kept entirely separate from the mouse handlers above so desktop behaviour
  // is untouched. A touch that never moves past the jitter threshold is left
  // alone — the synthesized click falls through to the target's own handler, so
  // tapping a target still opens strike planning exactly like a mouse click.
  function initTouch() {
    let tPan = null;   // { px, py, vx, vy } — active one-finger pan
    let tPinch = null; // { dist } — active two-finger pinch
    let moved = false; // has this gesture moved enough to stop being a tap?

    const dist = (a, b) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    const mid = (a, b) => ({ x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 });

    svg.addEventListener('touchstart', (e) => {
      closePicker();   // as with mousedown: a new gesture withdraws the question
      if (e.touches.length === 1) {
        tPinch = null; moved = false;
        tPan = { px: e.touches[0].clientX, py: e.touches[0].clientY, vx: view.x, vy: view.y };
      } else if (e.touches.length === 2) {
        tPan = null; moved = true;   // a two-finger gesture is never a tap
        tPinch = { dist: dist(e.touches[0], e.touches[1]) };
        e.preventDefault();          // suppress the browser's own page pinch-zoom
      }
    }, { passive: false });

    svg.addEventListener('touchmove', (e) => {
      const ctm = svg.getScreenCTM();
      if (!ctm) return;
      if (tPinch && e.touches.length === 2) {
        e.preventDefault();
        const nd = dist(e.touches[0], e.touches[1]);
        const m = mid(e.touches[0], e.touches[1]);
        const p = clientToSvg(m.x, m.y);       // pinch about the fingers' midpoint
        if (tPinch.dist > 0 && nd > 0) zoomAt(p.x, p.y, nd / tPinch.dist);
        tPinch.dist = nd;
      } else if (tPan && e.touches.length === 1) {
        const dx = e.touches[0].clientX - tPan.px, dy = e.touches[0].clientY - tPan.py;
        // let small jitter stay a tap so target selection survives a shaky finger
        if (!moved && Math.hypot(dx, dy) < 6) return;
        moved = true;
        e.preventDefault();
        svg.classList.add('panning');
        view.x = tPan.vx + dx / ctm.a;
        view.y = tPan.vy + dy / ctm.d;
        applyView();
      }
    }, { passive: false });

    const endTouch = (e) => {
      if (e.touches.length === 0) {
        tPan = null; tPinch = null; svg.classList.remove('panning');
      } else if (e.touches.length === 1) {
        // lifting one finger of a pinch — resume a clean pan from the survivor
        tPinch = null;
        tPan = { px: e.touches[0].clientX, py: e.touches[0].clientY, vx: view.x, vy: view.y };
      }
    };
    svg.addEventListener('touchend', endTouch);
    svg.addEventListener('touchcancel', endTouch);
  }

  // ---- visual state updates ----
  function updateTarget(t) {
    // a launcher group joins the plot when it is found and leaves it when the
    // track is lost again — it is never a hidden element sitting in the DOM
    // ...and a covert site joins it the night the folder work resolves an
    // aimpoint. Same handling for the same reason: neither is ever a hidden
    // element sitting in the DOM with its name and true position in it.
    // ...and a held aimpoint joins it the night the targeting cycle releases it.
    // It is in here for the DOM plumbing rather than for secrecy — nobody is
    // hiding Abadan — but the handling has to be identical or the marker is
    // simply never built: buildTarget only runs over what was plotted at boot.
    if (t.dispersal || t.covert || t.held) {
      const existing = document.getElementById(`tgt-${t.id}`);
      if (!onPlot(t)) { if (existing) existing.remove(); return; }
      if (!existing) buildTarget(t);
    }
    const g = document.getElementById(`tgt-${t.id}`);
    if (!g) return;
    // a located launcher group is drawn amber-urgent: the fix is perishable and
    // the icon should read that way
    const fix = t.dispersal && t.located ? ' tel-fix' : '';
    g.setAttribute('class', `target ${t.status || 'intact'}${fix}`);
  }

  // The Gulf council, painted on the plot. Takes a {countryName: mood} map from
  // ui.js — one reading, computed once, so the panel and the map can never
  // describe different capitals. Every mood is a class and every colour lives in
  // the stylesheet, because this is the same country fill the rest of the map is
  // drawn with and it has to stay theme-able alongside it.
  const GULF_MOODS = ['gulf-hawk', 'gulf-committed', 'gulf-dove', 'gulf-strained',
    'gulf-caveat', 'gulf-closed'];
  function setGulfMood(mood) {
    if (!world) return;
    for (const p of world.querySelectorAll('path.country[data-country]')) {
      const m = mood[p.dataset.country];
      p.classList.remove(...GULF_MOODS);
      if (m) p.classList.add(`gulf-${m}`);
    }
  }

  function setHormuz(status) {
    const dot = document.getElementById('hormuz-dot');
    const label = document.getElementById('hormuz-label');
    const cls = status === 'OPEN' ? 'hz-open' : status === 'CONTESTED' ? 'hz-contested' : 'hz-closed';
    dot.setAttribute('class', cls + (status !== 'OPEN' ? ' pulsing' : ''));
    label.setAttribute('class', cls);
    label.textContent = `HORMUZ: ${status}`;
  }

  // The southern strait, and the same three states. Called with a status it
  // REVEALS the indicator, which is why houthiTurn calls it on the entry night
  // with a strait that is still open: the marker appearing is how the map says
  // this war has a second waterway in it now.
  function setMandab(status) {
    const g = document.getElementById('mandab-indicator');
    if (!g) return;
    g.classList.remove('hidden');
    const cls = status === 'OPEN' ? 'hz-open' : status === 'CONTESTED' ? 'hz-contested' : 'hz-closed';
    document.getElementById('mandab-dot')
      .setAttribute('class', cls + (status !== 'OPEN' ? ' pulsing' : ''));
    const label = document.getElementById('mandab-label');
    label.setAttribute('class', cls);
    label.textContent = `BAB AL-MANDAB: ${status}`;
    syncSouthCue();
  }

  // ---- carrier movement ----
  // Carriers are the only US assets on this plot that move. The icon animates
  // between stations and the US_ASSETS entry moves with it, so sortie origins,
  // flight paths and incoming salvos all track the hull rather than a fixed
  // point on the chart.
  function moveAsset(id, x, y, animate = true) {
    const a = US_ASSETS.find(u => u.id === id);
    const g = document.getElementById(`asset-${id}`);
    const fromX = a ? a.x : x, fromY = a ? a.y : y;
    if (a) { a.x = x; a.y = y; }
    if (!g) return;
    if (!animate || (fromX === x && fromY === y)) {
      g.setAttribute('transform', `translate(${x},${y})`);
      return;
    }
    const t0 = performance.now(), dur = 900;
    (function step(now) {
      const p = Math.min(1, (now - t0) / dur);
      const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2; // easeInOut
      g.setAttribute('transform', `translate(${fromX + (x - fromX) * e},${fromY + (y - fromY) * e})`);
      if (p < 1) requestAnimationFrame(step);
    })(performance.now());
  }

  function setAssetActive(id, active) {
    const a = US_ASSETS.find(u => u.id === id);
    if (a) a.active = active;
    const g = document.getElementById(`asset-${id}`);
    if (g) g.classList.toggle('hidden', !active);
  }

  // Put a deck where its state says it is. A carrier under orders to reposition
  // is drawn halfway between its stations — the picture always answers "where
  // is she, and can she be shot at" without opening a panel.
  function setCarrierPosture(cv) {
    const st = CARRIER_STATIONS[cv.id];
    if (!st) return;
    setAssetActive(cv.id, cv.arrived && !cv.lost);
    const to = st[cv.posture] || st.back;
    const from = cv.moving ? st[cv.moving] : null;
    const p = from ? { x: (to.x + from.x) / 2, y: (to.y + from.y) / 2 } : to;
    moveAsset(cv.id, p.x, p.y, true);
    const g = document.getElementById(`asset-${cv.id}`);
    if (g) {
      g.classList.toggle('cv-moving', !!cv.moving);
      g.classList.toggle('cv-damaged', !!cv.damaged);
    }
  }

  // The second carrier's run-in: progress 0 is the eastern Mediterranean, 1 is
  // on station in the Red Sea. FORD_INGRESS is a polyline through the canal and
  // not a bearing (see the note on it in data.js), so this walks the legs
  // instead of lerping a pair of points — the vertices are spaced one per turn,
  // so each tick lands on one. She is on the plot for the whole transit, but
  // all of it happens west of the opening frame: pan or zoom out to watch her
  // come down the Red Sea.
  function setCarrierIngress(id, progress) {
    const st = CARRIER_STATIONS[id];
    if (!st) return;
    if (progress < 0) { setAssetActive(id, false); return; }   // not yet ordered
    const route = FORD_INGRESS.concat([st.back]);
    const legs = route.length - 1;
    const t = Math.max(0, Math.min(1, progress)) * legs;
    const i = Math.min(legs - 1, Math.floor(t));   // the last leg owns progress 1
    const f = t - i;
    const a = route[i], b = route[i + 1];
    moveAsset(id, a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f, true);
    setAssetActive(id, true);
  }

  function flashAsset(assetId) {
    const g = document.getElementById(`asset-${assetId}`);
    if (!g) return;
    g.classList.add('under-attack', 'pulsing');
    setTimeout(() => g.classList.remove('under-attack', 'pulsing'), 4000);
  }

  // ---- impact / intercept burst ----
  function burst(x, y, cls, maxR) {
    const fx = document.getElementById('fx-layer');
    const c = el('circle', { class: cls, cx: x, cy: y, r: 1.5 });
    fx.appendChild(c);
    const t0 = performance.now();
    function step(now) {
      const p = Math.min(1, (now - t0) / 450);
      c.setAttribute('r', 1.5 + p * maxR);
      c.setAttribute('opacity', 0.9 * (1 - p));
      if (p < 1) { requestAnimationFrame(step); return; }
      c.remove();
    }
    requestAnimationFrame(step);
  }

  // ============================================================
  // TACTICAL SCOPE (top-left panel)
  // ------------------------------------------------------------
  // Every outbound strike is flown here, in a self-contained 200x200 display
  // with its own coordinate space, instead of across the strategic map. The
  // scope is pure theatre: it dramatizes airDefenseWeight() and the aircrew
  // loss risk that computeStrike() already decided, and it never touches an
  // outcome. game.js still owns every result.
  // ============================================================
  const SC = { C: 100, RING: 70, EDGE: 96, LOCK_ARC: 9 };

  function fsPanel() { return document.getElementById('flight-status'); }

  // scope cards (live strikes) stack above transit cards (B-2s still en route)
  function fsStacks() {
    const panel = fsPanel();
    let scope = document.getElementById('scope-stack');
    if (!scope) {
      scope = document.createElement('div');
      scope.id = 'scope-stack';
      scope.className = 'fs-stack';
      panel.appendChild(scope);
      const transit = document.createElement('div');
      transit.id = 'transit-stack';
      transit.className = 'fs-stack';
      panel.appendChild(transit);
    }
    return { scope, transit: document.getElementById('transit-stack') };
  }

  function fsSync() {
    const { scope, transit } = fsStacks();
    fsPanel().classList.toggle('hidden', !scope.children.length && !transit.children.length);
  }

  function fsLine(entry, text, problem) {
    const div = document.createElement('div');
    div.className = 'fs-line' + (problem ? ' fs-problem' : '');
    div.textContent = '> ' + text;
    entry.querySelector('.fs-lines').appendChild(div);
    const lines = entry.querySelectorAll('.fs-line');
    if (lines.length > 3) lines[0].remove();
    // Every one of these is somebody keying a microphone, so it is also traffic
    // on the net panel — with the callsign in front of it, which the card does
    // not need (its header is the callsign) and the net does: that panel is
    // carrying both screens at once and the lines have to be tellable apart.
    wallTraffic(entry.dataset.cs || '', text, problem);
  }

  // Killing a card also kills its rAF loops: every loop checks card._alive.
  // Release this scope's hold on the jet radar-view chatter, once. Called when
  // the strike video finishes (the primary cut) and again on card close as a
  // fallback for sorties that miss and never play a strike video.
  function stopMissionMusic(entry) {
    if (entry && entry._missionMusic && typeof AudioSys !== 'undefined') {
      entry._missionMusic = false;
      AudioSys.missionMusicStop();
    }
  }

  // Retire a card NOW. Split out of fsClose because the wall needs a screen
  // back on the same tick it hands it to the next package — a timer would have
  // the new card land in a box the old one is still sitting in. Idempotent: the
  // timer fsClose armed can still fire afterwards and finds nothing left to do.
  //
  // A CLIP STILL ON SCREEN HOLDS THE CARD. The card's five-second egress hold
  // was sized for the clips that were short, and two are not: the IRGC set
  // piece runs 8.0s and the F-14 hit 5.7s. Both were being pulled off screen
  // mid-detonation while their own audio played on out of a detached element,
  // which is the footage cutting out a second before the thing it was showing.
  // The wait always ends — every clip carries its own stall timeout and calls
  // finish(), which takes the video out — so this cannot hold a card forever.
  // `force` is for the one caller that cannot wait: the wall reclaiming a
  // screen for the package already flying into it.
  function fsKill(entry, force) {
    if (!entry) return;
    if (!force && entry._alive && entry.querySelector('.scope-hit-video')) {
      fsClose(entry, 600);
      return;
    }
    entry._alive = false;
    stopMissionMusic(entry);
    entry.remove();
    fsSync();
    wallSync();
  }

  function fsClose(entry, delay) {
    setTimeout(() => fsKill(entry), delay || 0);
  }

  // ============================================================
  // THE WALL — four screens, and the strike is watched on all of them
  // ------------------------------------------------------------
  // The markup is in index.html and the cabinet is in the stylesheet; this is
  // the wiring. Four things live on it:
  //
  //   FEED 01 / FEED 02   the scope cards, unchanged — same radar, same
  //                       silhouettes, same status lines, same clips. What
  //                       changed is that there are two boxes and a card fills
  //                       one, instead of one 260px column they stacked in.
  //   COP PLOT            a <use> of the live #world group. Not a copy and not
  //                       a re-render: the same nodes, drawn a second time, so
  //                       the pan, the zoom, the salvos and every target pulse
  //                       arrive here for nothing. #map itself never moves —
  //                       it stays where it is, behind the wall, which is why
  //                       none of the geometry in this file had to learn about
  //                       any of this.
  //   STRIKE NET          the radio traffic. Every fsLine written on either
  //                       feed is somebody keying a mic, so it lands here with
  //                       its callsign and kicks the trace.
  //
  // WHY THE WALL IS ALLOWED TO OWN THE BOARD: it is up only while a package is
  // actually flying, and during that window there is nothing on the chart to
  // decide. The orders are signed. The one thing the player can still do is
  // skip, and that button is in the sidebar, which the wall never covers.
  // ============================================================
  // How long the wall holds open with no card on it. Packages overlap by design
  // — two fly at once and a third steps off behind them — but a gap of a frame
  // or two between batches is possible at the end of a night, and a wall that
  // blinks out and straight back in is worse than one that waits a beat.
  const WALL_LINGER = 900;
  let wallShut = 0;          // the pending close, cancelled if a card arrives
  let wallRAF = 0;
  let wallPings = [];        // live rings on the plot, advanced by the tick
  // Read once when the wall goes up rather than per frame: it is a media query,
  // and the answer does not change in the middle of a strike.
  let wallStill = false;
  const reducedMotion = () => {
    try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
    catch (e) { return false; }
  };

  function wallEl() { return document.getElementById('strike-wall'); }
  function wallFeeds() {
    const w = wallEl();
    return w ? [...w.querySelectorAll('.wall-feed')] : [];
  }
  function wallUp() { const w = wallEl(); return !!w && !w.classList.contains('hidden'); }

  // The screen a package gets. Empty ones first, in order, so the first card of
  // a night lands on FEED 01 and the second under it rather than beside a gap.
  // With both busy the card that is FURTHEST THROUGH ITS RUN gives way, and
  // `_done` — set at impact — is what says so. That flag is load-bearing now
  // rather than a formality: game.js flies two packages at once (see
  // STRIKE_CONCURRENCY), so at the moment a third card is built the wall is
  // genuinely full, with one card past its impact and one still inbound.
  // Evicting the inbound one would kill a run that had not called back yet and
  // leave the batch behind it sitting on the watchdog.
  //
  // The other half of that bargain is kept on game.js's side: a batch does not
  // free its place in the pump until its hit clip has finished, so the `_done`
  // card this reclaims is never one with footage still on it.
  function wallScreen() {
    const feeds = wallFeeds();
    if (!feeds.length) return null;
    let cell = feeds.find(f => !f.querySelector('.scope-card'));
    if (!cell) {
      const busy = feeds.map(f => ({ f, card: f.querySelector('.scope-card') }))
        .sort((a, b) => (b.card._done ? 1 : 0) - (a.card._done ? 1 : 0) ||
                        a.card._born - b.card._born);
      cell = busy[0].f;
      fsKill(busy[0].card, true);
    }
    return cell.querySelector('.wall-body');
  }

  function wallOpen() {
    const w = wallEl();
    if (!w) return;
    clearTimeout(wallShut); wallShut = 0;
    if (wallUp()) return;
    wallStill = reducedMotion();
    w.classList.remove('hidden');
    wallPlotMount();
    wallNetMount();
    wallTick(performance.now());
  }

  function wallClose() {
    const w = wallEl();
    clearTimeout(wallShut); wallShut = 0;
    if (!w || !wallUp()) return;
    w.classList.add('hidden');
    cancelAnimationFrame(wallRAF); wallRAF = 0;
    wallPings = [];
    // The plot is a live reference into the chart, and the net panel is a frame
    // loop's worth of nodes. Neither is wanted between strikes.
    const plot = w.querySelector('.wall-plot .wall-body');
    const net = w.querySelector('.wall-net-view');
    if (plot) plot.innerHTML = '';
    if (net) net.remove();
    netSamples = netTrace = netEcho = netView = null;
    const log = w.querySelector('.wall-net-log');
    if (log) log.innerHTML = '';
    for (const f of wallFeeds()) {
      f.classList.remove('live');
      const sub = f.querySelector('.wall-sub');
      if (sub) sub.textContent = 'STANDBY';
    }
  }

  // Called whenever a card lands or leaves. Keeps the tally lights honest and
  // arms the close once the last package is off the wall.
  function wallSync() {
    if (!wallUp()) return;
    let live = 0;
    for (const f of wallFeeds()) {
      const card = f.querySelector('.scope-card');
      f.classList.toggle('live', !!card);
      if (card) live++;
    }
    wallPlotMarks();
    if (live) { clearTimeout(wallShut); wallShut = 0; return; }
    clearTimeout(wallShut);
    wallShut = setTimeout(wallClose, WALL_LINGER);
  }

  // ---- COP PLOT: the chart itself, at a quarter of the area ----
  // <use href="#world"> rather than a clone. A clone goes stale the moment a
  // missile moves and would have to be rebuilt on a timer; a reference is the
  // same nodes drawn twice and is never wrong. #world survives render()'s
  // innerHTML reset (the element is kept, only its children are replaced), so
  // the reference holds across a turn boundary too.
  function wallPlotMount() {
    const box = wallEl().querySelector('.wall-plot .wall-body');
    if (!box || !document.getElementById('world')) return;
    box.innerHTML = '';
    const view = el('svg', { class: 'wall-plot-view', viewBox: '0 0 1000 760' });
    const use = el('use', { href: '#world' });
    // Safari before 16 only honours the xlink form, and an unresolved <use> is
    // a blank screen where the chart should be — cheap enough to write both.
    use.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', '#world');
    view.appendChild(use);
    // The marks ride in world coordinates, so they carry #world's own transform
    // rather than being placed in screen space — wallPlotSync keeps them level
    // with the chart through every pan and zoom.
    view.appendChild(el('g', { class: 'wall-plot-marks' }));
    box.appendChild(view);
    wallPlotSync();
    wallPlotMarks();
  }

  // Mirror the chart's zoom classes and its pan/zoom transform onto the plot.
  // Called from applyView, which is the one choke point every gesture and every
  // programmatic move already goes through.
  function wallPlotSync() {
    const view = document.querySelector('.wall-plot-view');
    if (!view) return;
    for (const c of ['map-deep-zoom', 'map-close-zoom', 'map-max-zoom', 'map-far-zoom'])
      view.classList.toggle(c, !!svg && svg.classList.contains(c));
    const marks = view.querySelector('.wall-plot-marks');
    if (marks && world) marks.setAttribute('transform', world.getAttribute('transform') || '');
  }

  // A ring on each site currently being serviced. The plot has no site names on
  // it — at a quarter of the area they are grain, not labels — so this is how
  // it answers "where is the thing I am watching burn".
  function wallPlotMarks() {
    const view = document.querySelector('.wall-plot-view');
    if (!view) return;
    const g = view.querySelector('.wall-plot-marks');
    if (!g) return;
    g.innerHTML = '';
    wallPings = [];
    for (const f of wallFeeds()) {
      const card = f.querySelector('.scope-card');
      const t = card && TARGETS.find(x => x.id === card.dataset.tgt);
      if (!t) continue;
      g.appendChild(el('circle', { class: 'wall-plot-mark', cx: t.x, cy: t.y, r: 13 }));
      if (wallStill) continue;
      // Attributes rather than a CSS keyframe on `r`: the ring is advanced by
      // the same tick the net trace runs on, which works everywhere and costs
      // one loop we are already paying for.
      const ping = el('circle', { class: 'wall-plot-mark', cx: t.x, cy: t.y, r: 13 });
      g.appendChild(ping);
      wallPings.push({ node: ping, t0: performance.now() + wallPings.length * 400 });
    }
  }

  // ---- STRIKE NET: the chatter, drawn as chatter ----
  // The trace is not an analyser on the chatter bed — audio.js only builds a
  // Web Audio graph on platforms that need one, so on most machines there is
  // nothing to read. It is driven by the traffic instead, which is the honest
  // signal anyway: what is on this net is what the packages are saying, and
  // the game already knows every word of that before the sound plays.
  const NET_PTS = 121;        // samples across the trace, 2 viewBox units apart
  const NET_W = 240, NET_H = 90, NET_MID = 45;
  const NET_IDLE = 0.05;      // squelch noise — an open net is never silent
  let netSamples = null, netTrace = null, netEcho = null, netView = null;
  let netEnv = NET_IDLE, netTarget = NET_IDLE, netPhase = 0;

  function wallNetMount() {
    const box = wallEl().querySelector('.wall-net .wall-body');
    const log = box && box.querySelector('.wall-net-log');
    if (!box || box.querySelector('.wall-net-view')) return;
    // preserveAspectRatio="none" so the trace fills the panel whatever shape
    // the cell ends up; the strokes opt out of the stretch individually.
    netView = el('svg', {
      class: 'wall-net-view', viewBox: `0 0 ${NET_W} ${NET_H}`,
      preserveAspectRatio: 'none',
    });
    const grid = el('g', { class: 'wall-net-grid' });
    for (let x = 30; x < NET_W; x += 30)
      grid.appendChild(el('line', { x1: x, y1: 6, x2: x, y2: NET_H - 6, 'vector-effect': 'non-scaling-stroke' }));
    // two rails either side of the baseline, so the trace has something to be
    // loud against — without them the panel is a line in an empty box and the
    // waveform reads as smaller than it is
    for (const y of [NET_MID - 30, NET_MID + 30])
      grid.appendChild(el('line', { x1: 0, y1: y, x2: NET_W, y2: y, 'vector-effect': 'non-scaling-stroke' }));
    netView.appendChild(grid);
    netView.appendChild(el('line', {
      class: 'wall-net-base', x1: 0, y1: NET_MID, x2: NET_W, y2: NET_MID,
      'vector-effect': 'non-scaling-stroke',
    }));
    netSamples = new Array(NET_PTS).fill(0);
    netEcho = el('polyline', { class: 'wall-net-echo', 'vector-effect': 'non-scaling-stroke' });
    netTrace = el('polyline', { class: 'wall-net-trace', 'vector-effect': 'non-scaling-stroke' });
    netView.appendChild(netEcho);
    netView.appendChild(netTrace);
    // ahead of the log, so the trace is the top two-thirds of the panel
    box.insertBefore(netView, log);
    netEnv = netTarget = NET_IDLE;
    netDraw();
  }

  function netDraw() {
    if (!netTrace) return;
    let pts = '';
    for (let i = 0; i < NET_PTS; i++)
      pts += (i * 2) + ',' + (NET_MID - netSamples[i]).toFixed(1) + ' ';
    netTrace.setAttribute('points', pts);
    netEcho.setAttribute('points', pts);
    if (netView) netView.classList.toggle('hot', netEnv > 0.4);
  }

  // One sample of an open microphone: a carrier, a harmonic off it and a little
  // noise, all of it scaled by how loud the net is at this instant. Clamped at
  // the rails rather than at the panel edge, so a loud transmission clips the
  // way a loud transmission does instead of running off the top of the box.
  const NET_CLIP = 42;
  function netSample() {
    netPhase += 0.62;
    const v = Math.sin(netPhase) * 0.62 + Math.sin(netPhase * 2.7) * 0.26 +
      (CosmeticRandom.float() - 0.5) * 0.62;
    return Math.max(-NET_CLIP, Math.min(NET_CLIP, v * netEnv * 46));
  }

  // Somebody keyed a mic. Kicks the trace and writes the line onto the net log.
  function wallTraffic(cs, text, problem) {
    netTarget = 1;
    if (wallStill && netSamples) {
      // No frame loop under reduced motion, so the whole trace is redrawn once
      // per transmission: the panel still answers "the net is busy" without
      // anything on screen moving.
      netEnv = 0.8;
      for (let i = 0; i < NET_PTS; i++) netSamples[i] = netSample();
      netDraw();
    }
    const log = wallEl() && wallEl().querySelector('.wall-net-log');
    if (!log || !text) return;
    const line = document.createElement('div');
    line.className = 'wall-net-line' + (problem ? ' net-problem' : '');
    // Half the lines in FLIGHT_EVENTS already open with {cs} — "SPIRIT 31
    // airborne out of DIEGO GARCIA" — and tagging those puts the callsign on
    // twice. The tag is for the ones that don't say who is talking.
    if (cs && text.indexOf(cs) !== 0) {
      const tag = document.createElement('span');
      tag.className = 'wall-net-cs';
      tag.textContent = cs + ' ';
      line.appendChild(tag);
    }
    line.appendChild(document.createTextNode(text));
    log.appendChild(line);
    while (log.children.length > 4) log.firstChild.remove();
  }

  // ---- the wall's own frame loop ----
  // One loop for the whole panel: the net trace scrolls, the plot rings walk
  // out, and each live screen's corner runs a timecode off its card. It exists
  // only while the wall is up.
  function wallTick(now) {
    if (!wallUp()) { wallRAF = 0; return; }
    wallRAF = requestAnimationFrame(wallTick);
    // Under reduced motion the trace is not scrolled here at all — wallTraffic
    // redraws it whole, once, on each transmission. The panel still answers
    // "the net is busy" without anything on screen being in constant motion.
    if (netSamples && !wallStill) {
      netTarget = Math.max(NET_IDLE, netTarget * 0.972);
      netEnv += (netTarget - netEnv) * 0.14;
      netSamples.shift();
      netSamples.push(netSample());
      netDraw();
    }
    for (const p of wallPings) {
      const age = (now - p.t0) % 1800;
      if (age < 0) continue;
      const k = age / 1800;
      p.node.setAttribute('r', (13 + k * 30).toFixed(1));
      p.node.setAttribute('opacity', (0.75 * (1 - k)).toFixed(3));
    }
    for (const f of wallFeeds()) {
      const card = f.querySelector('.scope-card');
      const sub = f.querySelector('.wall-sub');
      if (!card || !sub) continue;
      const s = Math.floor((now - card._born) / 1000);
      sub.textContent = 'T+' + String(Math.floor(s / 60)).padStart(2, '0') +
        ':' + String(s % 60).padStart(2, '0');
    }
  }

  // ---- silhouettes: drawn NOSE-UP (nose at -y), rotated +90 onto the heading ----
  const SIL = {
    // ---- the fighters, drawn to relative planform, not to relative scale ----
    // A Viper really is two-thirds the length of a Strike Eagle, and drawing
    // them that far apart puts one of them below the size where a shape reads at
    // all — the scope renders these about twenty pixels tall. So length varies
    // by a damped amount and the identification is carried by PLANFORM: what the
    // wing does, and what sits behind it. Three features do all the work at that
    // size — how far the span exceeds the body, whether the tail is one blade on
    // the centreline or two prongs flanking a notch, and where the wing's
    // trailing edge sits relative to the stabilators. Everything finer than that
    // (inlet ramps, chine facets, wingtip rails) is invisible at twenty pixels
    // and only muddies the outline, so it is not drawn.
    //
    // F-16C: the smallest thing on the scope, and the only one with a SINGLE
    // fin — that centreline spike past the nozzle is the whole identification,
    // and it is why the Viper survives being the shortest silhouette here.
    // Cropped-delta wing blended into the body through the LERX, so there is no
    // wing root joint to draw; one engine, one plume.
    f16: 'M0,-7.2 L0.5,-5.6 L0.75,-4 L0.85,-2.6 L1.15,-1.7 L1.3,-0.9 ' +
         'L5.4,2.1 L5.4,2.95 L1.4,2.45 L1.35,4.3 L3.2,6 L3,6.65 L1.15,5.4 ' +
         'L0.9,6.9 L0.62,8.15 L0,8.35 L-0.62,8.15 L-0.9,6.9 L-1.15,5.4 ' +
         'L-3,6.65 L-3.2,6 L-1.35,4.3 L-1.4,2.45 L-5.4,2.95 L-5.4,2.1 ' +
         'L-1.3,-0.9 L-1.15,-1.7 L-0.85,-2.6 L-0.75,-4 L-0.5,-5.6 Z',
    // F-15E: the biggest fighter here and drawn like it — widest body, widest
    // stabilators, twin fins set well outboard. The step biting forward off the
    // leading edge is the dogtooth, the one feature an Eagle's wing has that
    // nothing else in this set does; it is exaggerated past scale because at
    // scope size a true-width snag is a single pixel of nothing.
    f15: 'M0,-8 L0.6,-6.4 L0.9,-4.9 L1.45,-3.9 L1.65,-2.2 L1.7,-1.5 ' +
         'L3.6,-0.25 L3.85,-0.6 L6.3,1 L6.3,1.85 L1.85,2.6 L2.05,4.5 ' +
         'L5,6.4 L4.8,7.1 L1.95,6.1 L1.8,8.4 L1.25,8.5 L1.05,7.3 L0,7.1 ' +
         'L-1.05,7.3 L-1.25,8.5 L-1.8,8.4 L-1.95,6.1 L-4.8,7.1 L-5,6.4 ' +
         'L-2.05,4.5 L-1.85,2.6 L-6.3,1.85 L-6.3,1 L-3.85,-0.6 L-3.6,-0.25 ' +
         'L-1.7,-1.5 L-1.65,-2.2 L-1.45,-3.9 L-0.9,-4.9 L-0.6,-6.4 Z',
    // F-35A/C: short and thick. The forebody flares almost straight off the
    // radome — that is the chine, and it is why a Lightning looks stubby from
    // above where every teen-series jet looks like a dart. Single nozzle on the
    // centreline, so the tail ends in a bump between the fins rather than a
    // notch. Deliberately the widest body-to-span ratio in the set: it is the
    // one that has to read as fifth-gen at a glance on night one.
    f35: 'M0,-7.2 L0.8,-5.5 L1.2,-3.7 L1.4,-2.2 L1.45,-1.4 L5.5,1.7 L5.5,2.4 ' +
         'L1.6,2.8 L1.65,4 L3.7,6 L3.5,6.6 L1.5,5.5 L1.7,7.2 L1.15,7.35 ' +
         'L0.7,7 L0,7.7 L-0.7,7 L-1.15,7.35 L-1.7,7.2 L-1.5,5.5 L-3.5,6.6 ' +
         'L-3.7,6 L-1.65,4 L-1.6,2.8 L-5.5,2.4 L-5.5,1.7 L-1.45,-1.4 ' +
         'L-1.4,-2.2 L-1.2,-3.7 L-0.8,-5.5 Z',
    // F/A-18E/F: slim nose that kicks out into the leading-edge extensions, so
    // the Rhino wears a pair of shoulders where the Eagle is one continuous
    // wedge. That break is what tells the two apart at size — both are twin
    // tails on a broad body otherwise.
    f18: 'M0,-7.6 L0.5,-6.3 L0.72,-5 L1.55,-4 L2.15,-1.6 L2.2,-1 L6.3,1.7 ' +
         'L6.3,2.4 L2.1,2.8 L1.95,4.4 L4.8,6.3 L4.6,6.9 L1.9,6 L1.75,8 ' +
         'L1.2,8.1 L1,7.1 L0,6.9 L-1,7.1 L-1.2,8.1 L-1.75,8 L-1.9,6 ' +
         'L-4.6,6.9 L-4.8,6.3 L-1.95,4.4 L-2.1,2.8 L-6.3,2.4 L-6.3,1.7 ' +
         'L-2.2,-1 L-2.15,-1.6 L-1.55,-4 L-0.72,-5 L-0.5,-6.3 Z',
    // F-22A: the diamond. Long wing root running most of the fuselage, and a
    // trailing edge that sweeps FORWARD from tip to root — so the wing hands
    // straight off to the stabilators with no gap, and the whole aircraft reads
    // as one arrowhead instead of a fuselage wearing surfaces. Nothing else here
    // has that; it is the only planform cue that survives at scope size.
    f22: 'M0,-8 L0.75,-6.3 L1.15,-4.5 L1.45,-3 L1.6,-2.3 L6.5,2 L6.5,2.5 ' +
         'L2.2,4.2 L4.9,6.2 L4.7,6.8 L2.05,6 L1.85,8 L1.3,8.1 L1.1,7.2 L0,7 ' +
         'L-1.1,7.2 L-1.3,8.1 L-1.85,8 L-2.05,6 L-4.7,6.8 L-4.9,6.2 ' +
         'L-2.2,4.2 L-6.5,2.5 L-6.5,2 L-1.6,-2.3 L-1.45,-3 L-1.15,-4.5 ' +
         'L-0.75,-6.3 Z',
    // ---- and the one aircraft here that is not ours ----
    // MiG-29A, in Iranian colours. It has to lose to four American fighters at
    // twenty pixels without a label, and it is the only shape in this file with
    // that problem — the teen-series jets only ever have to be told apart from
    // each other, and they get a header naming them. This one gets no header
    // and no callsign, so the planform carries the whole read, and it is drawn
    // around the three things a top-down Fulcrum has that nothing in the
    // American set does.
    //
    // The LERX is a CURVE. Every other fighter here steps out to its wing —
    // the Hornet's shoulders are the loudest version of it — and a Fulcrum
    // does not step, it blends: a long slim radome that swells into the wing
    // root through an ogive with no joint anywhere in it. That single curved
    // leading edge is the fastest thing on the shape to read.
    //
    // The nozzles are WIDE APART, because a Fulcrum's engines are not stacked
    // against each other the way an Eagle's are — there is a whole aircraft's
    // width of centre section between them.
    //
    // And there is a SPIKE past the tail. The Viper's centreline spike is a
    // fin; this one is the tail sting between the nozzles, and it is the only
    // thing in the set that is aft of everything else on the airframe. It is
    // drawn a touch longer than scale for the same reason the Eagle's dogtooth
    // is drawn deeper than scale: at scope size a true one is no pixels at all.
    mig29: 'M0,-6.9 L0.36,-5.9 L0.55,-4.6 L0.7,-3.1 C0.95,-2.45 1.6,-1.55 1.9,-0.15 ' +
           'L5.7,2.6 L5.45,3.3 L1.85,3.9 L1.8,5.15 L4,6.75 L3.8,7.4 L1.95,6.55 ' +
           'L1.9,8 L1.45,8.1 L1.38,7 L1.28,7.65 L0.5,7.7 L0.4,7.35 L0.3,8.75 L0,9.2 ' +
           'L-0.3,8.75 L-0.4,7.35 L-0.5,7.7 L-1.28,7.65 L-1.38,7 L-1.45,8.1 L-1.9,8 ' +
           'L-1.95,6.55 L-3.8,7.4 L-4,6.75 L-1.8,5.15 L-1.85,3.9 L-5.45,3.3 L-5.7,2.6 ' +
           'L-1.9,-0.15 C-1.6,-1.55 -0.95,-2.45 -0.7,-3.1 L-0.55,-4.6 L-0.36,-5.9 Z',
    // flying wing — no tails, one continuous sawtooth trailing edge
    stealth: 'M0,-6.5 L9,4.2 L5.2,3.4 L2.8,6.4 L0,4.8 L-2.8,6.4 L-5.2,3.4 L-9,4.2 Z',
    // heavy bomber — long fuselage, high-aspect swept wings, big tailplane.
    // Reads as "large and slow" next to the fighter, which is the whole point
    // of putting one on the scope. Kept as the fallback for any HEAVY_TYPES
    // entry without a `sil`; the two airframes that actually fly are below.
    heavy: 'M0,-9 L1.3,-5.2 L1.3,-1.4 L9.5,3.2 L9.5,4.6 L1.3,2.4 L1.3,5.6 ' +
           'L4.2,8 L4.2,9 L0,7.8 L-4.2,9 L-4.2,8 L-1.3,5.6 L-1.3,2.4 ' +
           'L-9.5,4.6 L-9.5,3.2 L-1.3,-1.4 L-1.3,-5.2 Z',
    // B-52H — the plank. The only airframe on this scope whose span exceeds
    // its length (56m across, 48m long), so it is drawn WIDER than it is tall
    // and the proportion alone separates it from everything else in the air.
    // The four notches biting forward off the leading edge are the twin-engine
    // pods, which on a BUFF hang ahead of the wing rather than behind it —
    // that overbite is the one feature a top-down BUFF has that nothing else
    // does, and it survives being shrunk to sixteen pixels. Blunt nose, blunt
    // tail (the gun turret bay), 35° sweep, taper down to a thin tip.
    b52: 'M0,-9.4 C0.8,-9.3 1.15,-8.4 1.15,-7.2 L1.15,-1.9 ' +
         'L3.85,0.05 L4.7,-1.2 L5.9,-0.35 L5,0.85 ' +
         'L6.95,2.25 L7.8,1 L9,1.85 L8.1,3.05 ' +
         'L10.8,5 L10.4,6.2 L1.15,3.6 L1.15,6.4 L4.6,8.3 L4.4,9.2 L0.9,9.6 ' +
         'L-0.9,9.6 L-4.4,9.2 L-4.6,8.3 L-1.15,6.4 L-1.15,3.6 L-10.4,6.2 ' +
         'L-10.8,5 L-8.1,3.05 L-9,1.85 L-7.8,1 L-6.95,2.25 ' +
         'L-5,0.85 L-5.9,-0.35 L-4.7,-1.2 L-3.85,0.05 ' +
         'L-1.15,-1.9 L-1.15,-7.2 C-1.15,-8.4 -0.8,-9.3 0,-9.4 Z',
    // B-1B — the dagger. Everything the BUFF is not: long, narrow, and with no
    // wing root at all. The leading edge is a CURVE out of the forward
    // fuselage because a Bone is a blended body — there is no joint to draw,
    // which is exactly what makes it unmistakable from above. Wings are shown
    // mid-sweep rather than the 67.5° of a real low-level run-in: full aft the
    // span collapses to barely wider than the fuselage and the shape stops
    // reading at scope size. The step in the trailing edge is the pair of
    // engine boxes, four nozzles between them, and the spike past the
    // stabilators is the tail cone the fin sits on.
    b1: 'M0,-8.75 C0.46,-8.58 0.8,-7.82 0.85,-6.72 L0.97,-5.35 L1.27,-3.32 ' +
        'C1.7,-1.9 3.1,0.4 5.33,3.24 L4.99,4.15 L2.75,5.3 ' +
        'L2.5,6.5 L1.25,6.6 L0.95,6.9 L3.9,8.05 L3.7,8.7 L0.75,8.2 ' +
        'L0.45,8.95 L0,9.15 L-0.45,8.95 L-0.75,8.2 L-3.7,8.7 L-3.9,8.05 ' +
        'L-0.95,6.9 L-1.25,6.6 L-2.5,6.5 L-2.75,5.3 L-4.99,4.15 L-5.33,3.24 ' +
        'C-3.1,0.4 -1.7,-1.9 -1.27,-3.32 L-0.97,-5.35 L-0.85,-6.72 ' +
        'C-0.8,-7.82 -0.46,-8.58 0,-8.75 Z',
    // TLAM: a body and two stub fins, deliberately not a jet
    cruise: 'M0,-7 L1.2,-3.5 L1.2,3.2 L2.9,6.2 L1.2,5.6 L1.2,7 L-1.2,7 L-1.2,5.6 ' +
            'L-2.9,6.2 L-1.2,3.2 L-1.2,-3.5 Z',
    // Mk-48 ADCAP: rounded nose on a parallel body, cruciform fins aft and a
    // pump-jet tail. Slimmer than the cruise body and blunt where the missile
    // is pointed — at this size that is the whole difference between a weapon
    // that flies and a weapon that swims.
    torpedo: 'M0,-7 C0.95,-7 1.25,-6.1 1.25,-5 L1.25,3.2 L3.3,4.5 L3.3,5.5 ' +
             'L1.25,5.1 L1.25,6.8 L-1.25,6.8 L-1.25,5.1 L-3.3,5.5 L-3.3,4.5 ' +
             'L-1.25,3.2 L-1.25,-5 C-1.25,-6.1 -0.95,-7 0,-7 Z',
    // Los Angeles-class: teardrop hull, tapered tail, drawn bow-up. The sail is
    // a separate rectangle so the boat reads as a boat at eight pixels.
    ssn: 'M0,-10 C2.3,-10 3.1,-6 3.1,-1.5 L3.1,5.4 C3.1,8.2 1.7,10 0,10 ' +
         'C-1.7,10 -3.1,8.2 -3.1,5.4 L-3.1,-1.5 C-3.1,-6 -2.3,-10 0,-10 Z',
    // assault helo: blunt cabin, long tail boom, canted tail fin — read at a
    // glance as "not a jet", which is the only job it has in the raid scope
    helo: 'M0,-6.4 C2.7,-6.4 3.6,-4 3.6,-1.2 L3.6,2.4 L1.5,3.4 L1.2,8.8 ' +
          'L3.2,9.6 L3.2,10.8 L-1.2,10.8 L-1.2,9.6 L-1.4,3.4 L-3.6,2.4 ' +
          'L-3.6,-1.2 C-3.6,-4 -2.7,-6.4 0,-6.4 Z',
    // MQ-9 Reaper: bulbous sensor nose, thin fuselage, very long straight
    // high-aspect wings, and a downward-canted V-tail. Nothing about it reads
    // as a fighter — it is the thing that just circles and watches.
    reaper: 'M0,-8 C1.3,-7.8 1.6,-6.4 1.5,-5 L1,-2.2 L12,-0.7 L12,0.5 L1,-0.2 ' +
            'L0.9,4.6 L4.8,8.2 L4.8,9 L0.8,6.6 L0,7 ' +
            'L-0.8,6.6 L-4.8,9 L-4.8,8.2 L-0.9,4.6 L-1,-0.2 L-12,0.5 L-12,-0.7 ' +
            'L-1,-2.2 L-1.5,-5 C-1.6,-6.4 -1.3,-7.8 0,-8 Z',
  };
  // Exhaust plumes, keyed the same way. The default sits behind a tail because
  // that is where a fighter's engines are; on the heavies it is not, and a
  // plume coming off the wrong part of the airframe undoes the silhouette it
  // is lighting.
  const BURNER = {
    jet: 'M-1.5,7 L1.5,7 L0.9,12.5 L-0.9,12.5 Z',
    // One plume or two, and where — the same question the airframe answers. A
    // Viper and a Lightning are single-engine and light one flame on the
    // centreline; the Eagle, the Rhino and the Raptor light two, split around
    // it. Each starts at that airframe's nozzle: a plume that begins where the
    // fuselage isn't reads as a shape defect, not as afterburner.
    f16: 'M-0.85,6.6 L0.85,6.6 L0.55,11.8 L-0.55,11.8 Z',
    f35: 'M-0.9,7.2 L0.9,7.2 L0.6,12.4 L-0.6,12.4 Z',
    f15: 'M0.15,7.1 L1,7.1 L0.8,12 L0.3,12 Z ' +
         'M-1,7.1 L-0.15,7.1 L-0.3,12 L-0.8,12 Z',
    f18: 'M0.15,6.9 L0.95,6.9 L0.75,11.7 L0.3,11.7 Z ' +
         'M-0.95,6.9 L-0.15,6.9 L-0.3,11.7 L-0.75,11.7 Z',
    f22: 'M0.2,7 L1.05,7 L0.85,11.9 L0.35,11.9 Z ' +
         'M-1.05,7 L-0.2,7 L-0.35,11.9 L-0.85,11.9 Z',
    // two plumes set WIDE, with the tail sting running back between them —
    // the gap is the point, and lighting the burners is what makes it visible
    mig29: 'M0.6,7.6 L1.2,7.6 L1.03,11.9 L0.72,11.9 Z ' +
           'M-1.2,7.6 L-0.6,7.6 L-0.72,11.9 L-1.03,11.9 Z',
    // four plumes trailing the four wing pods — a BUFF's engines are out on
    // the wing, and watching them light up out there is half the read
    b52: 'M4.75,2.6 L5.9,2.6 L5.55,7.2 L5.1,7.2 Z ' +
         'M7.85,4.6 L9,4.6 L8.65,9 L8.2,9 Z ' +
         'M-5.9,2.6 L-4.75,2.6 L-5.1,7.2 L-5.55,7.2 Z ' +
         'M-9,4.6 L-7.85,4.6 L-8.2,9 L-8.65,9 Z',
    // two wide plumes hard against the fuselage — four nozzles in two boxes,
    // tucked under the wing gloves where a Bone actually carries them
    b1: 'M1.35,6.2 L2.45,6.2 L2.3,11.6 L1.65,11.6 Z ' +
        'M-2.45,6.2 L-1.35,6.2 L-1.65,11.6 L-2.3,11.6 Z',
  };

  // ---- scope-local burst (the map's burst() draws in world coords) ----
  function scopeBurst(root, x, y, cls, maxR) {
    const c = el('circle', { class: cls, cx: x, cy: y, r: 1 });
    root.appendChild(c);
    const t0 = performance.now();
    (function step(now) {
      const p = Math.min(1, (now - t0) / 420);
      c.setAttribute('r', 1 + p * maxR);
      c.setAttribute('opacity', 0.9 * (1 - p));
      if (p < 1) { requestAnimationFrame(step); return; }
      c.remove();
    })(performance.now());
  }

  // ---- the scope card: header, mini tactical view, status lines, progress ----
  // The card itself has not changed; where it is hung has. It goes on one of
  // the wall's two screens instead of onto a 260px stack in the corner of the
  // chart — see the wall section above. `_born` is what the wall's timecode
  // counts from and what decides which screen gives way when both are busy.
  function scopeCard(header, callsign, targetId) {
    const entry = document.createElement('div');
    entry._alive = true;
    entry._born = performance.now();
    entry.className = 'flight-entry scope-card';
    if (callsign) entry.dataset.cs = callsign;
    // Set HERE and not by the caller a line later: wallSync() below reads it to
    // put this package's ring on the plot, and a card that learns its own target
    // after the wall has already looked never gets one.
    if (targetId) entry.dataset.tgt = targetId;   // also how playStrikeHit finds this scope
    entry.innerHTML =
      `<div class="fs-head">${header}</div>` +
      `<div class="scope-wrap"></div>` +
      `<div class="fs-lines"></div>` +
      `<div class="progress-row"><span class="progress-phase">STANDING BY</span>` +
      `<span class="progress-pct">0%</span></div>` +
      `<div class="progress-bar"><div class="progress-fill"></div></div>`;
    // Raise the wall before asking it for a screen: wallScreen() may have to
    // retire the card already in one, and a hidden wall has nothing to retire.
    wallOpen();
    const screen = wallScreen();
    // No wall in the document at all (an older cached index.html) — the card
    // still has to fly, so it falls back to the corner stack it used to live in.
    (screen || fsStacks().scope).appendChild(entry);
    if (!screen) fsPanel().classList.remove('hidden');
    wallSync();
    return entry;
  }

  function setProgress(entry, p, phase, contested) {
    entry.querySelector('.progress-fill').style.width = Math.round(Math.min(1, p) * 100) + '%';
    entry.querySelector('.progress-fill').classList.toggle('contested', !!contested);
    entry.querySelector('.progress-phase').textContent = phase;
    entry.querySelector('.progress-pct').textContent = Math.round(Math.min(1, p) * 100) + '%';
  }

  const PHASES = [
    [0.08, 'WHEELS UP'], [0.42, 'INGRESS'], [0.86, 'CONTESTED AIRSPACE'],
    [0.99, 'TERMINAL'], [1.01, 'WEAPONS AWAY'],
  ];
  const PHASES_CRUISE = [
    [0.08, 'LAUNCH'], [0.42, 'MIDCOURSE'], [0.86, 'TERRAIN FOLLOWING'],
    [0.99, 'TERMINAL'], [1.01, 'IMPACT'],
  ];
  function phaseFor(p, cruise) {
    const table = cruise ? PHASES_CRUISE : PHASES;
    for (const [at, name] of table) if (p < at) return name;
    return 'BDA';
  }

  // Builds the static furniture of the mini display and returns handles to the
  // parts that animate. Coordinate space is the scope's own 0..200, never world.
  function buildScopeView(entry, target, adw) {
    const svg = el('svg', { class: 'scope-view', viewBox: '0 0 200 200' });
    const C = SC.C;

    // bearing ticks every 30° plus two faint range rings — situation-room furniture
    const grid = el('g', { class: 'scope-grid' });
    for (const r of [26, 48, SC.RING]) grid.appendChild(el('circle', { cx: C, cy: C, r }));
    for (let a = 0; a < 360; a += 30) {
      const rad = a * Math.PI / 180;
      const inner = a % 90 === 0 ? 82 : 88;
      grid.appendChild(el('line', {
        x1: C + Math.cos(rad) * inner, y1: C + Math.sin(rad) * inner,
        x2: C + Math.cos(rad) * 94, y2: C + Math.sin(rad) * 94,
      }));
    }
    svg.appendChild(grid);

    // THREAT RING — brightness and weight track live SAM coverage. Weight 0 means
    // no ring and no sweep at all: clean skies, the visible payoff for SEAD first.
    let ring = null, sweep = null;
    if (adw > 0) {
      const intensity = Math.min(1, adw / 3);
      ring = el('circle', {
        class: 'scope-ring', cx: C, cy: C, r: SC.RING,
        'stroke-width': (0.8 + intensity * 1.2).toFixed(2),
        opacity: (0.35 + intensity * 0.55).toFixed(2),
      });
      svg.appendChild(ring);

      // rotating wedge: solid leading edge trailing off into a faded tail
      sweep = el('g', { class: 'scope-sweep-g' });
      const span = 34 * Math.PI / 180;
      const x1 = C + Math.cos(-span) * SC.RING, y1 = C + Math.sin(-span) * SC.RING;
      sweep.appendChild(el('path', {
        class: 'scope-sweep',
        d: `M${C},${C} L${x1.toFixed(2)},${y1.toFixed(2)} A${SC.RING},${SC.RING} 0 0 1 ${C + SC.RING},${C} Z`,
      }));
      sweep.appendChild(el('line', { class: 'scope-beam', x1: C, y1: C, x2: C + SC.RING, y2: C }));
      svg.appendChild(sweep);
    }

    // TARGET at dead centre, same glyph it wears on the map, blown up 2x
    const tg = el('g', { class: `target ${target.status || 'intact'} scope-tgt`, transform: `translate(${C},${C})` });
    const inner = el('g', { transform: 'scale(2)' });
    inner.appendChild(el('circle', { class: 'tgt-ring', r: 9 }));
    inner.appendChild(targetCore(target.type));
    tg.appendChild(inner);
    const lbl = el('text', { y: 34 });
    lbl.textContent = target.short;
    tg.appendChild(lbl);
    svg.appendChild(tg);

    const fx = el('g', { class: 'scope-fx' });
    svg.appendChild(fx);

    entry.querySelector('.scope-wrap').appendChild(svg);
    return { svg, fx, ring, sweep, tg };
  }

  // ------------------------------------------------------------
  // THE INTERCEPT — one Fulcrum, and it loses
  // ------------------------------------------------------------
  // Flown entirely inside the 200x200 scope, on the same glass and in the same
  // coordinate space as the strike it interrupts. See DOGFIGHT in data.js for
  // why it is rare, why it is early, and why our side always wins.
  //
  // It is a ONE-CIRCLE FIGHT, because that is the only kind of turning fight
  // that reads at this size. Both aircraft end up going round the same point:
  // he arrives first and anchors, our lead comes off the track a beat later and
  // enters the circle half a turn behind him, and then simply out-rates him —
  // a slightly faster line around a slightly wider circle, which closes the
  // half-turn in three seconds and arrives behind his tail. Two-circle, where
  // they cross and separate and cross again, is the fight a real Fulcrum would
  // rather have; it is also forty pixels of two dots passing each other, and it
  // does not survive being that small.
  //
  // The ingress clock is stopped for the duration (see frame()), so everything
  // in here happens in a held moment: the formation is parked, the progress bar
  // is parked, and the only things moving on the scope are the radar, these two
  // aircraft, and the missile between them.
  function flyIntercept(o) {
    const C = SC.C;
    // ---- the timeline, in ms from the contact call ----
    const T_MERGE = 1500;          // he crosses the edge and anchors his turn
    const T_BREAK = 2650;          // our lead leaves the formation
    const T_SHOT = 5650;           // three seconds of turning buys the saddle
    const T_HIT = 6450;            // missile time of flight
    const T_END = DOGFIGHT.ms;     // and the rejoin, back onto the track

    // ---- the circle ----
    // Parked well off to one side of the inbound track. It has to clear three
    // things at once, and the angle is what buys all three: the target glyph at
    // dead centre (which the circle would otherwise crawl across at its inner
    // edge), the parked formation itself (four aircraft inside forty pixels is
    // not a fight, it is a smudge), and the rim of the glass. Sixty units out
    // at a bit over fifty degrees off the track leaves the turn a clear
    // circle with daylight on every side of it — including under the target's
    // name plate, which hangs far enough below the glyph to be the thing the
    // inner edge of the turn actually has to miss.
    const side = CosmeticRandom.float() < 0.5 ? 1 : -1;
    const mAng = o.bearing + side * 0.95;
    const M = { x: C + Math.cos(mAng) * 60, y: C + Math.sin(mAng) * 60 };
    // He crosses the edge well round the compass from where the package did, so
    // the run-in reads as an intercept cutting across the track rather than as
    // somebody joining the back of the queue.
    const inAng = o.bearing + side * 1.75;
    const from = { x: C + Math.cos(inAng) * SC.EDGE, y: C + Math.sin(inAng) * SC.EDGE };

    const RB = 14;                 // his circle
    const RF0 = 21, RF1 = 16;      // ours: wider at the merge, closing as we gain
    const WB = 2.0;                // rad/s — about three seconds a revolution
    const SADDLE = 0.55;           // radians of angle-off we settle at, behind him
    // Our rate is not a tuned number, it is whatever closes half a turn in the
    // time the turn is given. Retime the fight above and this still lands.
    const WF = WB + (Math.PI - SADDLE) / ((T_SHOT - T_BREAK) / 1000);
    const spin = side;             // both aircraft go round the same way

    const orbit = (a, r) => ({ x: M.x + Math.cos(a) * r, y: M.y + Math.sin(a) * r });
    const ease = (u) => u * u * (3 - 2 * u);
    const lerp = (a, b, u) => ({ x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u });

    // he enters along the straight line into the circle, so there is no kink
    // where the run-in becomes the turn
    const tB0 = Math.atan2(from.y - M.y, from.x - M.x);
    const bAt = (t) => tB0 + spin * WB * Math.max(0, t - T_MERGE) / 1000;
    const tF0 = bAt(T_BREAK) - spin * Math.PI;
    const fAt = (t) => tF0 + spin * WF * (t - T_BREAK) / 1000;

    // Where the formation is standing while this happens. Captured now rather
    // than at the break, which is the same position — the clock is already
    // stopped — and is also where our lead has to be back at when it is over.
    const hold = { x: o.lead.pos.x, y: o.lead.pos.y };

    // ---- what goes on the glass ----
    const g = el('g', { class: 'scope-ac' });
    g.appendChild(el('path', { class: 'scope-burner', d: BURNER.mig29, opacity: 0.75 }));
    g.appendChild(el('path', { class: 'scope-jet scope-bandit', d: SIL.mig29 }));
    o.view.fx.appendChild(g);
    // Our own box on him — the mirror of the lock the SAM belt puts on us,
    // drawn in our colour instead of theirs. It is APPENDED when it turns on
    // rather than faded up from zero, and that is not a style preference: the
    // box blinks on a CSS animation, a CSS animation outranks a presentation
    // attribute, and an `opacity: 0` box whose keyframes interpolate up to 0.25
    // is a box you can see. Hiding it that way put a lock on the bandit from
    // the moment he crossed the edge and gave the merge away before it started.
    const aim = el('rect', { class: 'scope-aim', x: -9, y: -9, width: 18, height: 18 });
    let aimed = false, risen = false;
    let trail = null, head = null, shotFrom = null, killFrom = null;

    // The contact call names a bearing and a range. The bearing is REAL — the
    // angle off the package to where he actually is, converted to compass true
    // the same way the sonar display converts its own, so the call and the
    // shape on the glass agree.
    //
    // The range is a reading, not a measurement: this scope is its own
    // coordinate space and has no scale to be right about. What the number has
    // to be right about is the TEMPO. He merges a second and a half after the
    // call, and a bandit declared at seventy miles is four minutes out — the
    // call would be describing a different engagement from the one the player
    // is watching. Scaled so the glass runs about thirty miles from the
    // formation to the rim, a commit at twenty-five to forty is the call an
    // intercept this close actually gets.
    const dx = from.x - hold.x, dy = from.y - hold.y;
    const brg = String(Math.round((Math.atan2(dx, -dy) * 180 / Math.PI + 360) % 360)).padStart(3, '0');
    const rng = String(Math.max(8, Math.round(Math.hypot(dx, dy) * 0.28)));

    const say = (bank, problem) => o.say(pick(DOGFIGHT_LINES[bank])
      .replace('{brg}', brg).replace('{rng}', rng), problem);
    const calls = [
      [150, () => say('contact', true)],
      [T_MERGE + 250, () => say('tally', true)],
      [T_SHOT, () => say('shot', false)],
      [T_HIT + 120, () => say('splash', false)],
      [T_HIT + 1100, () => say('rejoin', false)],
    ];
    let callIdx = 0;

    // headings come off the frame-to-frame velocity rather than off the phase
    // maths, so a jet is always pointing where it is actually going — including
    // through the two joins, where an analytic heading would snap
    const face = (node, p, mem) => {
      const vx = p.x - mem.x, vy = p.y - mem.y;
      if (vx * vx + vy * vy > 1e-4) mem.deg = Math.atan2(vy, vx) * 180 / Math.PI + 90;
      node.setAttribute('transform',
        `translate(${p.x.toFixed(2)},${p.y.toFixed(2)}) rotate(${(mem.deg || 0).toFixed(1)})`);
      mem.x = p.x; mem.y = p.y;
    };
    const bMem = { x: from.x, y: from.y, deg: 0 };
    const fMem = { x: hold.x, y: hold.y, deg: 0 };

    const t0 = performance.now();
    const pos = { x: hold.x, y: hold.y };   // our lead, for anything chasing it
    let dead = false;

    function stop() {
      g.remove(); aim.remove();
      if (trail) trail.remove();
      if (head) head.remove();
      trail = head = null;
    }

    // Returns false the frame the engagement is over, which is what hands the
    // ingress clock back to frame().
    function step(now) {
      const t = now - t0;
      while (callIdx < calls.length && calls[callIdx][0] <= t) calls[callIdx++][1]();

      // ---- him ----
      if (!dead) {
        const bp = t < T_MERGE
          ? lerp(from, orbit(tB0, RB), ease(t / T_MERGE))
          : orbit(bAt(t), RB);
        face(g, bp, bMem);
        // he fades up out of the noise rather than appearing whole — a contact
        // that pops onto the glass at full strength reads as a drawing error
        if (!risen) {
          if (t < 400) g.setAttribute('opacity', (t / 400).toFixed(2));
          else { risen = true; g.removeAttribute('opacity'); }
        }
        // the box goes on once we have turned the corner on him, and comes off
        // with him
        if (!aimed && t > T_BREAK + 600) { aimed = true; o.view.fx.appendChild(aim); }
        aim.setAttribute('transform', `translate(${bp.x.toFixed(2)},${bp.y.toFixed(2)})`);

        if (t >= T_SHOT && !trail) {
          shotFrom = { x: pos.x, y: pos.y };
          trail = el('line', { class: 'aam-trail', x1: shotFrom.x, y1: shotFrom.y, x2: shotFrom.x, y2: shotFrom.y });
          head = el('circle', { class: 'aam-head', cx: shotFrom.x, cy: shotFrom.y, r: 1.6 });
          o.view.fx.appendChild(trail);
          o.view.fx.appendChild(head);
          if (typeof AudioSys !== 'undefined') AudioSys.play('launch');
        }
        if (trail) {
          // guides on his live position, like a SAM guides on ours
          const u = Math.min(1, (t - T_SHOT) / (T_HIT - T_SHOT));
          const mx = shotFrom.x + (bp.x - shotFrom.x) * u;
          const my = shotFrom.y + (bp.y - shotFrom.y) * u;
          head.setAttribute('cx', mx); head.setAttribute('cy', my);
          trail.setAttribute('x2', mx); trail.setAttribute('y2', my);
          trail.setAttribute('opacity', (0.9 * (1 - u * 0.55)).toFixed(2));
        }
        if (t >= T_HIT) {
          dead = true;
          killFrom = { x: pos.x, y: pos.y };
          g.remove(); aim.remove();
          if (trail) { trail.remove(); head.remove(); trail = head = null; }
          scopeBurst(o.view.fx, bp.x, bp.y, 'bandit-flash', 15);
          if (typeof AudioSys !== 'undefined') AudioSys.play('impact');
        }
      }

      // ---- us ----
      let fp;
      if (t < T_BREAK) {
        fp = hold;                                  // still in formation, watching
      } else if (t < T_HIT) {
        const u = Math.min(1, (t - T_BREAK) / (T_SHOT - T_BREAK));
        const rf = RF0 + (RF1 - RF0) * Math.min(1, u);
        const onCircle = orbit(fAt(t), rf);
        // the break itself is the first 1.15s of the turn: a lerp off the track
        // and onto the circle, so leaving the formation is a movement and not a
        // teleport
        const b = Math.min(1, (t - T_BREAK) / 1150);
        fp = b < 1 ? lerp(hold, onCircle, ease(b)) : onCircle;
      } else {
        // he is down; slide back onto the track and pick the war up again
        const u = ease(Math.min(1, (t - T_HIT) / (T_END - T_HIT)));
        fp = lerp(killFrom || hold, hold, u);
      }
      pos.x = fp.x; pos.y = fp.y;
      face(o.lead.g, fp, fMem);

      if (t < T_END) return true;
      stop();
      // put the lead back exactly where the formation expects it, or the first
      // unfrozen frame is a jump
      o.lead.pos.x = hold.x; o.lead.pos.y = hold.y;
      return false;
    }

    return { pos, step, stop };
  }

  // ---- the terminal attack run, flown inside the scope ----
  function animateScope(assetType, target, done, count, pkg) {
    const stealth = assetType === 'stealth';
    const heavy = assetType === 'heavy';
    const cruise = assetType === 'cruise';
    // both bomber tiers stage off a ramp outside the theater and neither of
    // them is a fighter, so they share most of the presentation — but not the
    // origin. The B-2s come north out of Diego Garcia; the heavies come
    // southeast out of Fairford, which is off the top-left of the chart.
    const fromRamp = stealth || heavy;
    // (the submarine shot never reaches here — it is a torpedo on a sonar
    // display, and animateStrike sends it to animateSonar instead)
    // Half of all fighter sorties are flown off the carrier strike groups:
    // pick the carrier/land group at 50/50, then a random airframe within it.
    // Which pool it comes from is the tier — a 5th-gen package is never a
    // Viper and a 4th-gen package is never a Raptor.
    const fromGroup = (CosmeticRandom.float() < 0.5 && carriersOnStation()) ? 'carrier' : 'land';
    const pool = assetType === 'f35' ? F35_TYPES : FIGHTER_TYPES;
    // The missile branch names the ROUND, because on a cruise run the shape on
    // the glass is a missile and the header is the only thing that says which
    // one. It used to say RGM-109 TLAM for every one of them, which was a lie in
    // both directions once maritime strike existed — a Block IV land-attack
    // round cannot hit a moving ship at all, and half the missiles flying off
    // these decks are not Tomahawks. Packages without a `weapon` keep the old
    // label, which is still correct for a land-attack salvo onto a fixed site.
    //
    // The AIR branches deliberately do not do this: their silhouette is an
    // aircraft, so their header has to name the aircraft or it breaks the
    // shape-matches-the-name contract three comments below. The strike modal
    // already told the player which round is on the pylons.
    const mw = (pkg && pkg.weapon) ? MARITIME_WEAPONS[pkg.weapon] : null;
    const ft = stealth ? { type: 'B-2', cs: 'SPIRIT' }
      : heavy ? pick(HEAVY_TYPES)
      : cruise ? { type: mw ? mw.scope : 'RGM-109 TLAM', cs: mw ? mw.cs : 'ARSENAL' }
      : pick(pool.filter(f => f.from === fromGroup));
    // TLAMs come off whichever strike group is actually in the water
    const origin = fromRamp ? US_ASSETS.find(a => a.id === STRIKE_ORIGINS[assetType])
      : cruise ? (US_ASSETS.find(a => a.id === STRIKE_ORIGINS.cruise && a.active !== false)
          || nearestSortieBase(target, true))
      : nearestSortieBase(target, ft.from === 'carrier');
    const callsign = `${ft.cs} ${rand(1, 9)}${rand(1, 9)}`;
    // the ramps carry a display name because their `short` is a map label with
    // a tier tag and a direction arrow in it, which reads as noise in a header
    const baseName = origin.ramp || origin.short;
    // one silhouette per aircraft/missile in the run — capped so a fat package
    // doesn't overflow the tiny scope
    const N = Math.max(1, Math.min(6, count | 0 || 1));
    // Which shape flies. The B-2 and the TLAM are one airframe each, so the
    // tier name IS the silhouette. Every other tier picks a type per sortie and
    // then announces it by name in the scope header, so the type carries its own
    // `sil` and the shape on the glass matches the name above it — a header
    // reading MUDHEN 42 · F-15E over a generic dart is the header admitting it
    // is flavour text. There is no generic jet left to fall back on, so a table
    // entry that forgets its `sil` gets the commonest airframe of its tier
    // rather than `SIL[undefined]`, which is an invisible aircraft and a scope
    // that looks broken.
    const silKey = heavy ? (ft.sil || 'heavy')
      : cruise ? 'cruise' : stealth ? 'stealth'
      : (ft.sil || (assetType === 'f35' ? 'f35' : 'f16'));

    // live SAM coverage over this target — the same number computeStrike() used
    const adw = (typeof Game !== 'undefined' && Game.airDefenseWeight) ? Game.airDefenseWeight() : 0;

    // Does a MiG come up tonight? Rolled ONCE, here, before anything is drawn —
    // both because a per-sortie chance has to be a per-sortie roll, and because
    // the answer is what this function returns to game.js, whose stall fallback
    // has to be told that this one card is going to take nine seconds longer
    // than every other card of its tier.
    const intercept = interceptRoll(assetType);

    const headHeader = N > 1
      ? `${callsign} FLIGHT (×${N}) · ${ft.type} — ${baseName} → ${target.short}`
      : `${callsign} · ${ft.type} — ${baseName} → ${target.short}`;
    const entry = scopeCard(headHeader, callsign, target.id);
    const view = buildScopeView(entry, target, adw);
    const C = SC.C;

    // REAL BEARING: the angle from the strike origin to the target in world
    // coords, so the scope preserves which way the package actually came from.
    const bearing = Math.atan2(origin.y - target.y, origin.x - target.x);
    // Silhouettes are drawn NOSE-UP (nose at -y). The aircraft flies inbound
    // along `bearing` — velocity direction is bearing+180°, and the nose sits at
    // -90° in the shape's local frame, so the rotation to align them is
    // (bearing+180°) - (-90°) = bearing + 270°.
    const headingDeg = bearing * 180 / Math.PI + 270;

    // inbound track + the formation itself. Each silhouette gets a lateral
    // offset perpendicular to the bearing so they read as a formation abreast,
    // and a small along-track stagger so they don't stack in a straight line.
    view.fx.appendChild(el('line', {
      class: 'scope-track',
      x1: C + Math.cos(bearing) * SC.EDGE, y1: C + Math.sin(bearing) * SC.EDGE, x2: C, y2: C,
    }));
    const perpX = -Math.sin(bearing), perpY = Math.cos(bearing);
    const alongX = -Math.cos(bearing), alongY = -Math.sin(bearing); // toward centre
    const spacing = N <= 2 ? 11 : 9;
    const acs = [];
    for (let i = 0; i < N; i++) {
      const offIdx = i - (N - 1) / 2;                       // symmetric around 0
      const perpOff = offIdx * spacing;
      const alongOff = Math.abs(offIdx) * (N > 2 ? -3.5 : 0); // slight V trail
      const g = el('g', { class: 'scope-ac' });
      let burner = null;
      if (!cruise) {
        burner = el('path', { class: 'scope-burner', d: BURNER[silKey] || BURNER.jet, opacity: 0 });
        g.appendChild(burner);
      }
      g.appendChild(el('path', { class: 'scope-jet', d: SIL[silKey] }));
      view.fx.appendChild(g);
      acs.push({ g, burner, perpOff, alongOff, pos: { x: 0, y: 0 } });
    }

    // blinking lock box, shown only while the beam is actually painting; sits
    // on whichever silhouette the beam happens to be over that frame
    const lock = el('rect', { class: 'scope-lock', x: -11, y: -11, width: 22, height: 22, opacity: 0 });
    view.fx.appendChild(lock);

    // status lines
    const subs = { '{cs}': callsign, '{base}': baseName, '{tgt}': target.short };
    const fill = (s) => s.replace(/\{cs\}|\{base\}|\{tgt\}/g, (m) => subs[m]);
    // `only` matches either the exact tier or the family it belongs to, so a
    // line written for "fighter" plays for both manned fighter tiers and a line
    // written for "bomber" plays for both bomber tiers. The family is NOT named
    // 'stealth': the two bomber tiers fly from opposite sides of the theater
    // now, and 'stealth' has to keep meaning the B-2 alone so a line about the
    // Indian Ocean tanker track does not play for a cell out of Gloucestershire.
    const family = fromRamp ? 'bomber' : 'fighter';
    const evs = (cruise ? CRUISE_EVENTS : FLIGHT_EVENTS)
      .filter(e => !e.only || e.only === assetType || e.only === family)
      .sort((a, b) => a.at - b.at);
    let evIdx = 0;
    const fireUpTo = (prog) => {
      while (evIdx < evs.length && evs[evIdx].at <= prog) {
        const e = evs[evIdx++];
        if (e.kind === 'problem' && CosmeticRandom.float() > e.chance) continue;
        fsLine(entry, fill(pick(e.msgs)), e.kind === 'problem');
      }
    };

    // ---- radar sweep + acquisition ----
    // The aircraft runs in along a fixed bearing, so the beam passes over it once
    // per revolution: sweeping past the inbound is what triggers a paint.
    // acPos tracks the LEAD silhouette (index 0) and is what SAMs chase; a
    // formation still reads as one contact on hostile radar.
    const acPos = { x: C + Math.cos(bearing) * SC.EDGE, y: C + Math.sin(bearing) * SC.EDGE };
    const bearingDeg = ((bearing * 180 / Math.PI) % 360 + 360) % 360;
    const revMs = adw >= 2.5 ? 2500 : adw >= 1 ? 3800 : 5000; // degraded radars turn slower
    let sweepDeg = CosmeticRandom.float() * 360;
    let painted = false, samLines = 0, samsUp = 0;

    // Stealth is painted late and briefly — that is the whole reason a B-2 walks
    // into a defended target and a Strike Eagle does not.
    const paintOdds = stealth ? 0.18 : cruise ? 0.45 : 1;
    // TLAMs fly a terrain-following profile under the SAM belt — air defense is
    // not what defeats a Tomahawk, so nothing rises to engage a cruise run.
    const samChance = cruise ? 0 : Math.min(0.7, 0.22 * adw) * (stealth ? 0.25 : 1);

    function launchSAM() {
      if (samsUp >= 4) return;
      samsUp++;
      // rises from the ring, a little off the inbound's bearing, and chases it
      const off = (CosmeticRandom.float() - 0.5) * 1.1;
      const sx = C + Math.cos(bearing + off) * SC.RING;
      const sy = C + Math.sin(bearing + off) * SC.RING;
      const trail = el('line', { class: 'sam-trail', x1: sx, y1: sy, x2: sx, y2: sy });
      const head = el('circle', { class: 'sam-head', cx: sx, cy: sy, r: 1.8 });
      view.fx.appendChild(trail);
      view.fx.appendChild(head);
      if (samLines < 2) { fsLine(entry, pick(SAM_LINES), true); samLines++; }
      const s0 = performance.now();
      (function step(now) {
        if (!entry._alive) { trail.remove(); head.remove(); return; }
        const p = Math.min(1, (now - s0) / 620);
        // lead the target's live position rather than a frozen intercept point
        const x = sx + (acPos.x - sx) * p, y = sy + (acPos.y - sy) * p;
        head.setAttribute('cx', x); head.setAttribute('cy', y);
        trail.setAttribute('x2', x); trail.setAttribute('y2', y);
        trail.setAttribute('opacity', 0.85 * (1 - p * 0.6));
        if (p < 1) { requestAnimationFrame(step); return; }
        head.remove(); trail.remove();
        samsUp--;
        scopeBurst(view.fx, x, y, 'sam-flash', 9);
      })(performance.now());
    }

    // The live engagement, and the once-guard that stops a second one. Both sit
    // out here because frame() is the only thing that may start or end one.
    let fight = null, fought = false;

    // t0/lastFrame are set when the flight actually starts — for a TLAM that is
    // after the launch clip finishes, so the clip never eats into radar time.
    let lastFrame = 0, t0 = 0;
    const dur = FLIGHT_DUR[assetType];

    // one loop drives the sweep, the aircraft, acquisition and the progress bar
    function frame(now) {
      if (!entry._alive) return;
      if (ff) { impact(); return; }   // skipped mid-run: go straight to weapons away
      const dt = now - lastFrame;
      lastFrame = now;

      // A MERGE STOPS THE INGRESS CLOCK. t0 walks forward with the frame while
      // the fight is live, so `p` holds where it was: the formation parks, the
      // progress bar parks, and the run resumes on the far side at exactly the
      // point it left off. The alternative — letting the package keep closing
      // through the engagement — spends the terminal run on a dogfight and
      // arrives at the target with the fight still going.
      //
      // The sweep is deliberately NOT frozen. It is the same radar it was a
      // second ago, and a scope that stops dead reads as a hung page rather
      // than as a held moment.
      if (fight) t0 += dt;
      const p = Math.min(1, (now - t0) / dur);

      // formation: each silhouette rides the bearing in, offset perpendicular
      // (and slightly along-track) from the lead. Lead sits on the bearing line.
      const r = SC.EDGE * (1 - p);
      const leadX = C + Math.cos(bearing) * r;
      const leadY = C + Math.sin(bearing) * r;
      acPos.x = leadX; acPos.y = leadY;
      for (const a of acs) {
        a.pos.x = leadX + perpX * a.perpOff + alongX * a.alongOff;
        a.pos.y = leadY + perpY * a.perpOff + alongY * a.alongOff;
        a.g.setAttribute('transform',
          `translate(${a.pos.x.toFixed(2)},${a.pos.y.toFixed(2)}) rotate(${headingDeg.toFixed(1)})`);
        if (a.burner) a.burner.setAttribute('opacity',
          (Math.min(1, p * 3) * (0.55 + CosmeticRandom.float() * 0.45)).toFixed(2));
      }

      if (view.sweep) {
        sweepDeg = (sweepDeg + (dt / revMs) * 360) % 360;
        view.sweep.setAttribute('transform', `rotate(${sweepDeg.toFixed(1)},${C},${C})`);
        // degraded coverage flickers
        if (adw < 2 && CosmeticRandom.float() < 0.02) view.sweep.setAttribute('opacity', 0.25 + CosmeticRandom.float() * 0.75);

        // PAINT: is the beam's leading edge on the inbound right now?
        let diff = Math.abs(((sweepDeg - bearingDeg + 540) % 360) - 180);
        diff = 180 - diff;
        const inBeam = diff < SC.LOCK_ARC && r < SC.RING + 4;
        const allowed = !stealth || p > 0.72; // stealth is only ever seen late
        if (inBeam && allowed && CosmeticRandom.float() < paintOdds) {
          // paint whichever silhouette the beam happens to be sweeping across
          const idx = Math.floor(CosmeticRandom.float() * acs.length);
          const paintPos = acs[idx].pos;
          lock.setAttribute('transform', `translate(${paintPos.x.toFixed(2)},${paintPos.y.toFixed(2)})`);
          lock.setAttribute('opacity', 1);
          if (view.ring) view.ring.classList.add('painting');
          // nothing rises off the ring into the middle of a turning fight —
          // a SAM chasing the lead through the merge is three red things on a
          // scope the size of a stamp, and the kill stops reading
          if (!painted && !fight && CosmeticRandom.float() < samChance) launchSAM();
          painted = true;
        } else if (painted) {
          lock.setAttribute('opacity', 0);
          if (view.ring) view.ring.classList.remove('painting');
          painted = false;
        }
      }

      // The engagement flies AFTER the formation has been placed for this
      // frame: it drives the lead's silhouette itself, and it has to be the
      // one that wins. acPos follows it out of formation so anything already
      // guiding on the lead keeps guiding on the lead.
      if (fight) {
        if (fight.step(now)) { acPos.x = fight.pos.x; acPos.y = fight.pos.y; }
        else fight = null;
      } else if (intercept && !fought && p >= DOGFIGHT.at) {
        fought = true;
        fight = flyIntercept({
          view, entry, bearing, lead: acs[0],
          say: (text, problem) => fsLine(entry, fill(text), problem),
        });
      }

      fireUpTo(p);
      // cruise runs carry no threat styling — nothing is shooting at a TLAM
      setProgress(entry, p, fight ? 'AIR-TO-AIR' : phaseFor(p, cruise),
        !cruise && (!!fight || (p >= 0.42 && p < 0.86 && adw > 0)));

      if (p < 1) { requestAnimationFrame(frame); return; }
      impact();
    }

    function impact() {
      // deregistering is also the once-guard: the run reaches weapons away one
      // time, whether it got there by flying or by being skipped
      if (!skipEnders.delete(forceImpact)) return;
      // Past its impact and running out an egress beat: the card has nothing
      // left to resolve, so the wall may take its screen back for the next
      // package if it needs to. See wallScreen().
      entry._done = true;
      // a skip can land in the middle of a merge: the bandit and its missile
      // go with the run, or they sit frozen on the glass through the BDA hold
      if (fight) { fight.stop(); fight = null; }
      for (const a of acs) a.g.setAttribute('opacity', 0);
      lock.setAttribute('opacity', 0);
      if (view.ring) view.ring.classList.remove('painting');
      view.tg.classList.add('scope-hit');
      scopeBurst(view.fx, C, C, 'impact-flash', 46);
      setProgress(entry, 1, 'BDA', false);
      fireUpTo(1);
      done();                 // BDA resolves now — everything after is cosmetic
      targetPulse(target);    // the map's one quiet acknowledgement
      // a single egress beat, then the card retires. Held open long enough for
      // the hit clip (played by game.js on a successful hit) to finish first —
      // unless the player skipped, in which case the card has nothing left to say.
      if (ff) { fsClose(entry, 0); return; }
      if (!cruise) setTimeout(() => { if (entry._alive) fireUpTo(1.2); }, 1400);
      fsClose(entry, 5200);
    }
    const forceImpact = () => { if (entry._alive) impact(); else skipEnders.delete(forceImpact); };
    skipEnders.add(forceImpact);

    // Start the terminal run. For a TLAM the launch clip plays first and in full
    // — the flight (and the radar) only begins once the clip is done, so the clip
    // never cuts into radar time. Every other asset starts its run immediately.
    // Manned-aircraft sorties (fighters, F-35s, B-2s, heavy bombers) carry the
    // radar-view background music; TLAMs don't.
    const isJet = !cruise;
    function startFlight() {
      t0 = performance.now();
      lastFrame = t0;
      if (isJet && typeof AudioSys !== 'undefined') {
        entry._missionMusic = true;
        AudioSys.missionMusicStart();
      }
      requestAnimationFrame(frame);
    }
    // Front-loaded launch clip (plays in full before the run, gating the flight
    // so it never eats into radar time): TLAMs get the vertical-launch clip;
    // fighters coming off a carrier deck get the catapult-launch clip; a heavy
    // package flying the BUFF gets the long roll off the ramp. The clip is keyed
    // on the airframe rather than the tier, so a Bone sortie gets no launch clip
    // rather than eight engines of footage over the wrong jet.
    const launchClip = cruise ? 'video/tlam-launch.mp4'
      : heavy && ft.sil === 'b52' ? 'video/b52-launch.mp4'
      : origin.kind === 'carrier' ? 'video/carrier-launch.mp4'
      : null;
    if (launchClip) {
      overlayScopeClip(entry.querySelector('.scope-wrap'), launchClip, startFlight);
    } else {
      startFlight();
    }
    // What this card is going to cost game.js beyond its tier's flight time.
    // Zero on all but one sortie in fifty (see animateStrike's contract).
    return intercept ? DOGFIGHT.ms : 0;
  }

  // Rolled per sortie, and only for the two MANNED FIGHTER tiers. A bomber is
  // the reason the fighters are up there; a B-2 that wins a turning fight is a
  // different game, and a Tomahawk cannot be intercepted by anything in this
  // war. `ff` is checked because a skipped turn draws nothing at all — there is
  // no scope to fight on, and the allowance would be charged for a card that
  // never appears.
  function interceptRoll(assetType) {
    if (ff || (assetType !== 'fighter' && assetType !== 'f35')) return false;
    const turn = (typeof Game !== 'undefined' && Game.G) ? Game.G.turn : 99;
    return turn <= DOGFIGHT.lastTurn && CosmeticRandom.float() < DOGFIGHT.chance;
  }

  // ---- bomber transit cards: the long leg in from the ramp, kept visible ----
  // A package that will not reach its target this turn gets a compact card —
  // no radar, no attack view — so the distance reads as time. In practice that
  // is the B-2s out of Diego Garcia: the heavies are same-turn now and go
  // straight to the scope. The tier stays in the list and the card is gated on
  // eta alone, so a heavy package carrying an explicit multi-turn eta still
  // draws its own leg off the Fairford ramp.
  const NM_PER_MAP = 1 / KM_TO_MAP / 1.852;
  const RAMP_ASSETS = ['stealth', 'heavy'];

  // Deterministic per-target so the callsign survives re-renders without being
  // written into the mission (and therefore into the save).
  function transitCallsign(id, asset) {
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
    return `${asset === 'heavy' ? 'HAMMER' : 'SPIRIT'} ${11 + (h % 89)}`;
  }

  function updateTransit(missions) {
    const { transit } = fsStacks();
    const inbound = (missions || []).filter(m => m.pkg && RAMP_ASSETS.includes(m.pkg.asset) && m.eta > 1);
    transit.innerHTML = '';
    for (const m of inbound) {
      const t = TARGETS.find(x => x.id === m.targetId);
      const ramp = US_ASSETS.find(a => a.id === STRIKE_ORIGINS[m.pkg.asset]);
      if (!t || !ramp) continue;
      const nm = Math.round(Math.hypot(ramp.x - t.x, ramp.y - t.y) * NM_PER_MAP / 50) * 50;
      const turns = m.eta - 1;
      // the cell's actual airframe is picked when it goes on the scope, so the
      // transit card stays generic rather than promising a type it may not fly
      const isHeavy = m.pkg.asset === 'heavy';
      const type = isHeavy ? 'HEAVY CELL' : 'B-2';
      const tag = isHeavy ? 'B-1B / B-52H' : 'B-2 // SPIRIT';
      const card = document.createElement('div');
      card.className = 'flight-entry transit-card';
      card.innerHTML =
        `<div class="fs-head">${transitCallsign(t.id, m.pkg.asset)} · ${type} — ${ramp.ramp} → ${t.short}</div>` +
        `<div class="transit-strip"><span class="transit-dot"></span></div>` +
        `<div class="fs-lines"><div class="fs-line">> ${tag} — ` +
        `${nm.toLocaleString()} NM — ${turns} TURN${turns === 1 ? '' : 'S'} TO TOT</div></div>`;
      transit.appendChild(card);
    }
    fsSync();
  }

  function nearestSortieBase(target, wantCarrier) {
    let best = null, bd = Infinity;
    for (const a of US_ASSETS) {
      if (!a.sortie || a.active === false) continue;
      if ((a.kind === 'carrier') !== wantCarrier) continue;
      const d = Math.hypot(a.x - target.x, a.y - target.y);
      if (d < bd) { bd = d; best = a; }
    }
    // every deck sunk or still crossing: the sortie flies from land instead
    return best || (wantCarrier ? nearestSortieBase(target, false) : null);
  }

  const carriersOnStation = () =>
    US_ASSETS.some(a => a.kind === 'carrier' && a.sortie && a.active !== false);

  // ---- the map's only outbound-strike cue: a short pulse on the target ----
  function targetPulse(target) {
    const g = document.getElementById(`tgt-${target.id}`);
    if (g) {
      g.classList.add('struck');
      setTimeout(() => g.classList.remove('struck'), 500);
    }
    burst(target.x, target.y, 'impact-flash', 13);
  }

  // ---- strike dispatcher ----
  // Contract with game.js: `done` fires exactly once, at impact. game.js also
  // runs a watchdog that may call its own finishOne first, so the guard here is
  // about never double-resolving from this side.
  //
  // RETURNS the extra milliseconds this particular card is going to hold the
  // scope for beyond its tier's flight time, which game.js adds to the stall
  // fallback it arms behind the animation. It is zero for every sortie except
  // the one in fifty that draws a MiG, and the fallback exists precisely to
  // land behind the animation — so the animation has to be the thing that says
  // how long it is. Anything that throws or never draws returns zero, because
  // a card that does not exist cannot be waited on.
  function animateStrike(assetType, target, done, count, pkg) {
    let called = false;
    const once = () => { if (called) return; called = true; if (done) done(); };
    // skipped: the package still flies and still resolves, it just never draws
    if (ff) { once(); return 0; }
    try {
      // the submarine attack is not flown, it is fired — its own display
      if (pkg && pkg.sub) { animateSonar(target, once); return 0; }
      return animateScope(assetType, target, once, count, pkg) || 0;
    } catch (e) {
      // a broken animation must never hold up the war
      console.error('scope animation failed', e);
      once();
      return 0;
    }
  }

  // ---- strike footage: launch + hit clips that play inside the scope window ----
  // game.js holds the BDA report back until footage is done, so we track how many
  // clips are still on screen and let it await an idle scope.
  let activeClips = 0;
  let clipWaiters = [];
  let clipSeq = 0;   // names each clip's hold on the score — see overlayScopeClip
  // Live clip finishers, so a skip can end them properly rather than yanking the
  // element out from under them — a launch clip gates the flight behind it, and
  // an orphaned one would hold that run for its full stall timeout.
  const clipEnders = new Set();
  // Everything else a skip has to force: live strike runs and the Iranian salvo
  // phase. A frame loop that checks `ff` is not enough on its own — a
  // backgrounded tab stops requestAnimationFrame cold, and a skip must land
  // whether or not the browser is still handing out frames.
  const skipEnders = new Set();
  function clipEnded() {
    activeClips = Math.max(0, activeClips - 1);
    if (activeClips === 0) { const w = clipWaiters; clipWaiters = []; w.forEach(fn => fn()); }
  }
  // How long a clip that never plays is given before it is written off. It is
  // armed at append — BEFORE the file has loaded — so on a cold cache the
  // download eats into it, which is why a clip re-arms against its own real
  // length the moment metadata lands. Without that re-arm the constant is a
  // guillotine sized for the short clips: the 8s IRGC set piece would be cut a
  // second short of the block coming down, on exactly the slow connections
  // where it looks most like a bug.
  const CLIP_STALL_MS = 9000;
  const CLIP_SLACK_MS = 2500;
  // When the longest live clip's own net expires, as a timestamp. whenFootageDone
  // backstops against this rather than a constant, or it would open the report
  // over the top of a clip that the clip's own safety net was still happy to run.
  let footageDeadline = 0;
  // Run cb once every strike clip has finished (or immediately if none are up).
  // The timeout is a hard safety net: a stuck clip must never hang the report.
  function whenFootageDone(cb) {
    if (ff || activeClips === 0) { cb(); return; }
    let fired = false;
    const go = () => { if (fired) return; fired = true; cb(); };
    clipWaiters.push(go);
    setTimeout(go, Math.max(CLIP_STALL_MS, footageDeadline - Date.now() + 500));
  }

  // Overlay a clip on a scope card's radar window, fading out when it ends.
  // Plays WITH sound (muted fallback if the browser blocks audible autoplay).
  // onEnd fires once — on natural end, a load error, or a stall timeout — so a
  // launch clip can gate the flight run behind itself without ever hanging.
  function overlayScopeClip(wrap, src, onEnd) {
    if (ff) { if (onEnd) onEnd(); return; }   // skipped: no footage, no gate
    if (!wrap || wrap.querySelector('.scope-hit-video')) { if (onEnd) onEnd(); return; }
    const vid = document.createElement('video');
    vid.className = 'scope-hit-video';
    vid.src = src;
    vid.playsInline = true;
    // On the wall, the picture takes the screen for as long as it runs: the
    // card's status lines and progress bar step aside and the clip gets the box
    // from the header down. Worth doing because of the shapes involved — the
    // footage is 720x400 and the sensor window it used to play in was square,
    // so `object-fit: cover` was throwing away about half of every frame. The
    // lines lose nothing by going: every one of them is on the net panel with
    // its callsign attached, which is most of what that panel is for.
    const card = wrap.closest ? wrap.closest('.flight-entry') : null;
    if (card) card.classList.add('clip-live');
    // This is the one sound in the game that audio.js does not own, so the two
    // things it gets for free everywhere else have to be asked for here. It
    // answers to the speaker button — muting the game used to silence the
    // klaxon and the watch floor and leave the strike footage talking, which
    // reads as a broken mute rather than a loud clip. And it takes a hold on
    // the score for as long as it runs, like any other noise; without it the
    // bed plays over the footage in the gaps between impacts.
    // The key is per-clip, not per-kind: a package big enough to open two scope
    // cards runs two of these at once, and one shared key would have the first
    // one to end hand the bed back while the second was still playing.
    const hasAudio = typeof AudioSys !== 'undefined';
    const duckKey = 'clip:' + (++clipSeq);
    vid.muted = hasAudio && AudioSys.isMuted();
    if (hasAudio) AudioSys.duckHold(duckKey);
    activeClips++;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clipEnders.delete(finish);
      if (hasAudio) AudioSys.duckRelease(duckKey);
      if (card) card.classList.remove('clip-live');
      vid.remove();
      clipEnded();
      if (onEnd) onEnd();
    };
    clipEnders.add(finish);
    vid.addEventListener('ended', finish);
    vid.addEventListener('error', finish);   // genuine decode/load failure
    // stall safety (e.g. backgrounded tab), re-armed against the clip's own
    // length once that is known — see CLIP_STALL_MS
    const arm = ms => {
      footageDeadline = Math.max(footageDeadline, Date.now() + ms);
      return setTimeout(finish, ms);
    };
    let stall = arm(CLIP_STALL_MS);
    vid.addEventListener('loadedmetadata', () => {
      if (done || !isFinite(vid.duration)) return;
      clearTimeout(stall);
      stall = arm(vid.duration * 1000 + CLIP_SLACK_MS);
    });
    wrap.appendChild(vid);
    // Try to play with sound; a rejected audible autoplay falls back to muted so
    // the footage still runs. Any sound in the clip plays when the browser allows.
    vid.play().catch(() => { vid.muted = true; vid.play().catch(() => {}); });
  }

  // ---- fast forward ----
  // Called by game.js when the player skips the turn. Raising the flag is most
  // of the work — every loop reads it — but anything parked on a clock rather
  // than on a frame has to be told, so live clips are ended here explicitly.
  function setFastForward(on) {
    if (!on) {
      ff = false;
      // frozen sprites from a salvo that was skipped rather than flown
      document.querySelectorAll('.iran-missile, .iran-drone, .iran-missile-path, .iran-drone-path')
        .forEach(n => n.remove());
      return;
    }
    ff = true;
    // clips first: a launch clip gates the run behind it, so ending the clip is
    // what lets that run reach its impact
    for (const end of [...clipEnders]) end();
    for (const end of [...skipEnders]) end();
    // Every scope is being torn down at once — kill the radio chatter outright
    // rather than leaning on each card's close to release it.
    if (typeof AudioSys !== 'undefined') AudioSys.missionMusicStopAll();
    // ...and drop the wall with them, without the linger a normal close takes.
    // The player skipped the footage; there is nothing left on it to watch, and
    // a monitor that hangs on for another second is the skip not landing.
    wallClose();
  }

  // Whether the player has skipped. game.js reads it to drop the two-second
  // stagger between packages: a skip means every remaining batch should resolve
  // as fast as it can be pushed through, not step off on a clock built for
  // footage nobody is watching any more.
  function isFastForward() { return ff; }

  // Some targets have their own hit clip; everything else uses the generic one.
  const HIT_CLIPS = {
    'msl-shiraz': 'video/shiraz-hit.mp4',
    'naval-bandar': 'video/naval-bandar-hit.mp4',
    'tabriz-ab': 'video/tabriz-hit.mp4',
  };
  // The weapon can outrank the target: a torpedo hit is a column of water going
  // up under a hull, and no aimpoint footage says that.
  const TORPEDO_CLIP = 'video/torpedo-hit.mp4';
  // Clips that play ONLY on the package that finishes the site, never on the
  // ones that merely dent it. HIT_CLIPS above cannot express this — it fires on
  // any hit, so a site whose footage is the whole block coming down would play
  // that footage for a package that knocked 20 points off a wall, and the
  // picture would be contradicting the BDA line printed under it. A kill clip is
  // the site being erased, so it is gated on `destroyed` and shown once: nothing
  // in here can be killed twice, since only the SAM belt returns from zero.
  const KILL_CLIPS = {
    'irgc-hq': 'video/irgc-hq-kill.mp4',
  };
  // A hit on a field or a pier can catch whatever is parked alongside, so those
  // types draw from a pool rather than a single clip — the same base struck
  // twice should not look like the same footage twice. A target that also owns an
  // aimpoint clip (Tabriz, Bandar Abbas) throws it into its type's draw as one
  // more entry, so every clip a given base can show is equally likely.
  //
  // `ship` is a separate pool from `naval` rather than more entries in it,
  // because a hull in open water and a quayside are not the same picture: the
  // naval clips are piers, hardstand and whatever was moored alongside, and the
  // ship clips are a sensor holding a moving hull with sea all the way to the
  // edge of frame. Before this, every air-to-ship strike fell through to the
  // generic clip, which is an inland aimpoint — the Dena went down in a desert.
  // Launcher footage, shared by `tel` and `missile` below. Four clips of a
  // wheeled erector taking one weapon in open ground — a raised rail with the
  // round still on it, a mast-up launcher beside its control shelter, a
  // reload/erector on a track, and one caught in scrub off a road.
  const LAUNCHER_POOL = [
    'video/tel-hit-a.mp4',
    'video/tel-hit-b.mp4',
    'video/tel-hit-c.mp4',
    'video/tel-hit-d.mp4',
  ];
  const POOLS = {
    airbase: [
      'video/f14-hit.mp4',
      'video/airbase-hit-a.mp4',
      'video/airbase-hit-b.mp4',
    ],
    // The belt is the MOST-STRUCK type in the game and was the last one with no
    // footage of its own: air defense is the only thing on this board that
    // returns from zero (`AD_RECONSTITUTION`), so its three sites are serviced
    // again and again across a campaign, and every one of those packages played
    // the generic inland aimpoint. Three clips of a site being worked over —
    // a revetted complex of shelters and vehicles in berms that goes up whole on
    // one weapon, a single erector held top-down inside its walled revetment,
    // and a dispersed site on hardstand beside a road, taken from a wider field
    // of view. Between them they say the three things the belt actually is: a
    // fixed installation, one launcher, and a site that has spread out.
    airdefense: [
      'video/airdefense-hit-a.mp4',
      'video/airdefense-hit-b.mp4',
      'video/airdefense-hit-c.mp4',
    ],
    naval: [
      'video/naval-hit-a.mp4',
      'video/naval-hit-b.mp4',
      'video/naval-hit-c.mp4',
    ],
    // Air-to-ship only. The submarine shot never reaches the draw — `hitClip`
    // returns the torpedo clip before it looks a pool up at all, because a
    // column of water going up under a hull is the one picture no aimpoint
    // footage says.
    ship: [
      'video/ship-hit-a.mp4',
      'video/ship-hit-b.mp4',
      'video/ship-hit-c.mp4',
      'video/ship-hit-d.mp4',
    ],
    // One pool for BOTH launcher types, which is the opposite call to the
    // naval/ship split above and for the same reason: there, a hull in open
    // water and a quayside are two pictures; here they are one. A dispersed TEL
    // and a missile base's aimpoint are the same vehicle-scale erector held by
    // the same sensor — the base has a fence round it, and the fence is not in
    // frame at that magnification. Sharing is also what makes these four clips
    // worth having: the missile force is one of the three arms the war is
    // SCORED on, and until now its seven targets showed the generic inland
    // aimpoint every time bar Shiraz, which owns a clip of a parked ramp.
    // Per-target footage still merges in on the draw, so msl-shiraz keeps it.
    tel: LAUNCHER_POOL,
    missile: LAUNCHER_POOL,
  };

  function hitClip(target, pkg, killed) {
    if (pkg && pkg.sub) return TORPEDO_CLIP;
    if (killed && KILL_CLIPS[target.id]) return KILL_CLIPS[target.id];
    const own = HIT_CLIPS[target.id];
    const pool = POOLS[target.type];
    if (pool) {
      const draw = own ? [...pool, own] : pool;
      return draw[Math.floor(CosmeticRandom.float() * draw.length)];
    }
    return own || 'video/strike-hit.mp4';
  }

  // Called by game.js only when BDA confirms a successful hit (destroyed/damaged).
  // Plays in the same window as the radar, then fades out to reveal the BDA state.
  // `killed` is the batch's verdict, not the package's — two sorties arrive as one
  // formation and the second one is often what finishes the site.
  //
  // `onDone` fires exactly once, when this package's footage is off the screen —
  // on the clip's natural end, on a load error, on a stall timeout, or straight
  // away when there is no card to play it on or the player has skipped. game.js
  // waits on it before laying the NEXT package onto the wall: with two packages
  // up, both feeds are busy at the moment a card resolves, and a third one
  // arriving would evict this card while its hit clip was still rolling (see
  // wallScreen, which is allowed to force a kill). Releasing on the clip rather
  // than on BDA is what keeps every strike's footage intact.
  function playStrikeHit(target, pkg, killed, onDone) {
    const fire = typeof onDone === 'function' ? onDone : () => {};
    const entry = [...document.querySelectorAll('.scope-card')]
      .find(e => e._alive && e.dataset.tgt === target.id);
    if (!entry) { fire(); return; }
    overlayScopeClip(entry.querySelector('.scope-wrap'), hitClip(target, pkg, killed), () => {
      stopMissionMusic(entry);   // chatter cuts when the strike video ends
      fire();
    });
  }

  // ============================================================
  // SONAR SCOPE — the submarine attack, run on the boat's display
  // ------------------------------------------------------------
  // Same card and the same contract as the radar scope — `done` fires exactly
  // once, at detonation, and nothing in here decides an outcome — but none of
  // it is a radar picture. There is no sweep, no threat ring and no SAM,
  // because there is nothing to shoot back with: the only two things in the
  // water are a weapon walking down a guidance wire and a hull that does not
  // know about it yet. The whole shape of the display is that silence, and
  // then the moment it ends — ENABLE, when the seeker goes active and starts
  // pinging, and the ping rate climbs the whole way in.
  // ============================================================
  const SN = {
    C: 100, RING: 70, EDGE: 92,
    ENABLE: 0.62,     // wire cut, seeker active — the run stops being quiet
    ACQUIRE: 0.86,    // seeker has the hull; no more searching
    CM_AT: 0.70,      // if she hears it at all, this is when she answers
    CM_END: 0.93,     // and this is where the weapon is back on the hull
  };

  // yards, at the moment of firing. Nowhere near the map plot: the boat has
  // been trailing the hull, and this is the range she shoots from.
  const TORP_RANGE = () => 9200 + Math.round(CosmeticRandom.float() * 4200);

  const PHASES_SUB = [
    [0.06, 'TUBE LAUNCH'], [SN.ENABLE, 'WIRE-GUIDED RUN'], [SN.ACQUIRE, 'SEEKER ACTIVE'],
    [0.99, 'TERMINAL'], [1.01, 'DETONATION'],
  ];
  function subPhase(p) {
    for (const [at, name] of PHASES_SUB) if (p < at) return name;
    return 'BDA';
  }

  // ---- the display's static furniture ----
  // Polar plot with the target dead centre, same as every other scope in the
  // game, plus the two things that make it a sonar display instead of a radar
  // one: corner readouts in yards and knots, and a bearing-time strip along the
  // bottom where the passive picture is written down as it comes in.
  const BTR = { x0: 34, y0: 175, cols: 22, rows: 5, cw: 6, rh: 3.6 };

  function buildSonarView(entry, target) {
    const svg = el('svg', { class: 'scope-view sonar-view', viewBox: '0 0 200 200' });
    const C = SN.C;

    const grid = el('g', { class: 'scope-grid' });
    for (const r of [26, 48, SN.RING]) grid.appendChild(el('circle', { cx: C, cy: C, r }));
    for (let a = 0; a < 360; a += 30) {
      if (a >= 60 && a <= 120) continue;          // the bottom arc belongs to the BTR
      const rad = a * Math.PI / 180;
      const inner = a % 90 === 0 ? 82 : 88;
      grid.appendChild(el('line', {
        x1: C + Math.cos(rad) * inner, y1: C + Math.sin(rad) * inner,
        x2: C + Math.cos(rad) * 94, y2: C + Math.sin(rad) * 94,
      }));
    }
    svg.appendChild(grid);

    // TARGET at dead centre, same glyph it wears on the map, blown up 2x
    const tg = el('g', { class: `target ${target.status || 'intact'} scope-tgt`, transform: `translate(${C},${C})` });
    const inner = el('g', { transform: 'scale(2)' });
    inner.appendChild(el('circle', { class: 'tgt-ring', r: 9 }));
    inner.appendChild(targetCore(target.type));
    tg.appendChild(inner);
    const lbl = el('text', { y: 34 });
    lbl.textContent = target.short;
    tg.appendChild(lbl);
    svg.appendChild(tg);

    // ---- bearing-time recorder: the passive picture, written down ----
    // Columns are bearing, rows are time, and time runs downward, so a contact
    // holding a steady bearing draws a straight vertical trace. That trace is
    // the whole reason the boat has a firing solution at all.
    const btrG = el('g', { class: 'sonar-btr' });
    btrG.appendChild(el('rect', {
      class: 'sonar-btr-frame', x: BTR.x0 - 1.5, y: BTR.y0 - 1.5,
      width: BTR.cols * BTR.cw + 3, height: BTR.rows * BTR.rh + 3,
    }));
    const cells = [];
    for (let r = 0; r < BTR.rows; r++) {
      const row = [];
      for (let c = 0; c < BTR.cols; c++) {
        const rect = el('rect', {
          class: 'sonar-btr-cell', x: BTR.x0 + c * BTR.cw, y: BTR.y0 + r * BTR.rh,
          width: BTR.cw - 0.7, height: BTR.rh - 0.7, opacity: 0,
        });
        btrG.appendChild(rect);
        row.push(rect);
      }
      cells.push(row);
    }
    svg.appendChild(btrG);

    // ---- corner readouts ----
    const readout = (x, y, anchor, cls) => {
      const t = el('text', { class: `sonar-readout ${cls || ''}`, x, y, 'text-anchor': anchor });
      svg.appendChild(t);
      return t;
    };
    const rng = readout(6, 11, 'start');
    const brg = readout(194, 11, 'end');
    const spd = readout(6, 190, 'start');
    const wire = readout(194, 190, 'end');

    const fx = el('g', { class: 'scope-fx' });
    svg.appendChild(fx);

    entry.querySelector('.scope-wrap').appendChild(svg);
    return { svg, fx, tg, cells, rng, brg, spd, wire };
  }

  function animateSonar(target, done) {
    const boat = US_ASSETS.find(a => a.id === STRIKE_ORIGINS.sub);
    const baseName = boat ? boat.short : 'TOLEDO (SSN)';
    const callsign = `MAKO ${rand(1, 9)}${rand(1, 9)}`;
    const entry = scopeCard(`${callsign} · Mk-48 ADCAP — ${baseName} → ${target.short}`,
      callsign, target.id);
    entry.classList.add('sonar-card');
    const view = buildSonarView(entry, target);
    const C = SN.C;

    // Real bearing off the boat, same convention the radar scope uses: the
    // weapon runs in along it, and the compass reading in the corner is that
    // same angle converted to degrees true.
    const bearing = boat ? Math.atan2(boat.y - target.y, boat.x - target.x) : -2.4;
    const brgTrue = Math.round(((Math.atan2(-Math.cos(bearing), Math.sin(bearing)) * 180 / Math.PI) + 360) % 360);
    view.brg.textContent = `BRG ${String(brgTrue).padStart(3, '0')}`;
    const perpX = -Math.sin(bearing), perpY = Math.cos(bearing);

    // OWN SHIP: parked at the edge on the firing bearing, bow toward the datum.
    // She is drawn once and never moves — after the shot the only thing she does
    // is hold the wire and wait, which is exactly what the display should say.
    const ownHeading = Math.atan2(-Math.cos(bearing), Math.sin(bearing)) * 180 / Math.PI;
    const ox = C + Math.cos(bearing) * SN.EDGE, oy = C + Math.sin(bearing) * SN.EDGE;
    const own = el('g', { class: 'sonar-own', transform: `translate(${ox.toFixed(2)},${oy.toFixed(2)}) rotate(${ownHeading.toFixed(1)})` });
    const hull = el('g', { transform: 'scale(0.7)' });
    hull.appendChild(el('path', { class: 'sonar-hull', d: SIL.ssn }));
    hull.appendChild(el('rect', { class: 'sonar-sail', x: -1.4, y: -4.2, width: 2.8, height: 5.2 }));
    own.appendChild(hull);
    view.fx.appendChild(own);

    // the wire, the weapon, and the weapon's own seeker beam
    const wire = el('line', { class: 'sonar-wire', x1: ox, y1: oy, x2: ox, y2: oy });
    view.fx.appendChild(wire);
    const wpn = el('g', { class: 'sonar-weapon' });
    const cone = el('g', { class: 'sonar-cone-g', opacity: 0 });
    const CONE_R = 34, CONE_A = 17 * Math.PI / 180;
    cone.appendChild(el('path', {
      class: 'sonar-cone',
      d: `M0,-4 L${(Math.sin(-CONE_A) * CONE_R).toFixed(2)},${(-Math.cos(-CONE_A) * CONE_R).toFixed(2)} ` +
         `A${CONE_R},${CONE_R} 0 0 1 ${(Math.sin(CONE_A) * CONE_R).toFixed(2)},${(-Math.cos(CONE_A) * CONE_R).toFixed(2)} Z`,
    }));
    wpn.appendChild(cone);
    // the weapon reads smaller than the boat that fired it, which is the one
    // thing about the scale that has to be right
    const torpG = el('g', { transform: 'scale(0.72)' });
    torpG.appendChild(el('path', { class: 'sonar-torp', d: SIL.torpedo }));
    wpn.appendChild(torpG);
    view.fx.appendChild(wpn);

    // ---- countermeasures: the one thing that can happen to the run ----
    // Decided up front so the picture and the status line are the same event —
    // the noisemaker in the water IS the line that gets written.
    const cm = CosmeticRandom.float() < 0.45;
    const cmSide = CosmeticRandom.float() < 0.5 ? 1 : -1;
    let cmDropped = false, decoy = null;

    const subs = { '{cs}': callsign, '{base}': baseName, '{tgt}': target.short };
    const fill = (s) => s.replace(/\{cs\}|\{base\}|\{tgt\}/g, (m) => subs[m]);
    const evs = SUB_EVENTS.slice().sort((a, b) => a.at - b.at);
    let evIdx = 0;
    const fireUpTo = (prog) => {
      while (evIdx < evs.length && evs[evIdx].at <= prog) {
        const e = evs[evIdx++];
        if (e.kind === 'problem' && CosmeticRandom.float() > e.chance) continue;
        fsLine(entry, fill(pick(e.msgs)), e.kind === 'problem');
      }
    };

    // ---- the seeker's ping: a ring off the weapon, and the return off the hull ----
    function ping(x, y) {
      const c = el('circle', { class: 'sonar-ping', cx: x, cy: y, r: 2 });
      view.fx.appendChild(c);
      const PING_R = 150, PING_MS = 950;
      const t0 = performance.now();
      (function step(now) {
        if (!entry._alive) { c.remove(); return; }
        const p = Math.min(1, (now - t0) / PING_MS);
        c.setAttribute('r', (2 + p * PING_R).toFixed(1));
        c.setAttribute('opacity', (0.5 * (1 - p) * (1 - p)).toFixed(3));
        if (p < 1) { requestAnimationFrame(step); return; }
        c.remove();
      })(performance.now());
      if (typeof AudioSys !== 'undefined') AudioSys.play('sonarPing');
      // the return: the hull lights up when the wavefront actually reaches it,
      // not when the ping goes out — the delay is the range, and it shortens
      const d = Math.hypot(C - x, C - y);
      setTimeout(() => {
        if (!entry._alive) return;
        view.tg.classList.add('sonar-return');
        setTimeout(() => view.tg.classList.remove('sonar-return'), 150);
      }, Math.max(0, (d - 2) / PING_R * PING_MS));
    }

    // ---- bearing-time recorder ----
    // One row per tick, scrolling down. The target holds a near-steady bearing
    // (that is why there is a firing solution); everything else is sea noise —
    // until she drops a noisemaker, and a second trace opens up beside her.
    const tgtCol = (BTR.cols - 1) / 2;
    let btrRows = Array.from({ length: BTR.rows }, () => new Array(BTR.cols).fill(0));
    let btrDrift = 0, lastBtr = 0;
    function btrTick(p) {
      btrDrift += (CosmeticRandom.float() - 0.5) * 0.06;
      btrDrift = Math.max(-1.4, Math.min(1.4, btrDrift));
      const row = new Array(BTR.cols);
      for (let c = 0; c < BTR.cols; c++) row[c] = CosmeticRandom.float() * 0.16;
      const paint = (col, gain) => {
        for (let c = 0; c < BTR.cols; c++) {
          const d = Math.abs(c - col);
          if (d < 2.2) row[c] = Math.max(row[c], gain * Math.exp(-d * d * 1.1));
        }
      };
      paint(tgtCol + btrDrift, 0.95);
      // the weapon's own noise, opening away from the target's bearing as it runs
      if (p > 0.05) paint(tgtCol + btrDrift + (p - 0.05) * 2.4 * cmSide * -1, 0.3);
      if (cmDropped) paint(tgtCol + btrDrift + 2.6 * cmSide, 0.8);
      btrRows.pop();
      btrRows.unshift(row);
      for (let r = 0; r < BTR.rows; r++) {
        for (let c = 0; c < BTR.cols; c++) {
          view.cells[r][c].setAttribute('opacity', btrRows[r][c].toFixed(2));
        }
      }
    }

    // ---- wake: the bubble trail, dropped behind the weapon and dissipating ----
    let lastWake = 0;
    function wake(x, y) {
      const b = el('circle', { class: 'sonar-wake', cx: x, cy: y, r: 0.8 });
      view.fx.insertBefore(b, wpn);
      const t0 = performance.now();
      (function step(now) {
        if (!entry._alive) { b.remove(); return; }
        const p = Math.min(1, (now - t0) / 1800);
        b.setAttribute('r', (0.8 + p * 1.9).toFixed(2));
        b.setAttribute('opacity', (0.5 * (1 - p)).toFixed(2));
        if (p < 1) { requestAnimationFrame(step); return; }
        b.remove();
      })(performance.now());
    }

    const range0 = TORP_RANGE();
    let lastPing = 0, prev = { x: ox, y: oy }, t0 = 0;
    const dur = FLIGHT_DUR.sub || 13000;

    function frame(now) {
      if (!entry._alive) return;
      if (ff) { detonate(); return; }   // skipped mid-run: go straight to the hit
      const p = Math.min(1, (now - t0) / dur);

      // the run-in: straight down the bearing, with one deviation in it if she
      // manages to put something in the water worth chasing. It starts clear of
      // the boat rather than on top of her — the weapon swam out of the tube
      // before the display was worth looking at.
      const r = (SN.EDGE - 16) * (1 - p);
      let x = C + Math.cos(bearing) * r, y = C + Math.sin(bearing) * r;
      if (cm && p > SN.CM_AT) {
        const w = Math.min(1, (p - SN.CM_AT) / (SN.CM_END - SN.CM_AT));
        const lat = 15 * Math.sin(Math.PI * w) * cmSide;
        x += perpX * lat; y += perpY * lat;
      }
      // heading comes off the actual velocity, so the weapon leans into the
      // reattack instead of sliding sideways down a fixed bearing
      const vx = x - prev.x, vy = y - prev.y;
      const head = (vx || vy) ? Math.atan2(vx, -vy) * 180 / Math.PI
        : Math.atan2(-Math.cos(bearing), Math.sin(bearing)) * 180 / Math.PI;
      prev = { x, y };
      wpn.setAttribute('transform', `translate(${x.toFixed(2)},${y.toFixed(2)}) rotate(${head.toFixed(1)})`);

      // the wire pays out behind it, then parts at ENABLE
      if (p < SN.ENABLE) {
        wire.setAttribute('x2', x.toFixed(2));
        wire.setAttribute('y2', y.toFixed(2));
      } else if (!wire.classList.contains('cut')) {
        wire.classList.add('cut');
        scopeBurst(view.fx, x, y, 'sonar-enable', 16);
      }

      // seeker: searching side to side, then dead ahead once it has the hull
      if (p >= SN.ENABLE) {
        const acq = p >= SN.ACQUIRE;
        cone.setAttribute('opacity', acq ? 0.95 : 0.7);
        cone.classList.toggle('locked', acq);
        cone.setAttribute('transform', acq ? 'rotate(0)'
          : `rotate(${(Math.sin((now - t0) / 260) * 26).toFixed(1)})`);
        // ping rate climbs the whole way in — the last few seconds are a rattle
        const interval = 1250 - 950 * Math.min(1, (p - SN.ENABLE) / (1 - SN.ENABLE));
        if (now - lastPing > interval) { lastPing = now; ping(x, y); }
      }

      // countermeasures: a can of noise over the side, and a bloom in the seeker
      if (cm && !cmDropped && p >= SN.CM_AT) {
        cmDropped = true;
        // dropped off her beam and a little back along the bearing: close
        // enough to the hull to be worth chasing, which is the entire idea
        const dx = C + perpX * 26 * cmSide + Math.cos(bearing) * 12;
        const dy = C + perpY * 26 * cmSide + Math.sin(bearing) * 12;
        decoy = el('circle', { class: 'sonar-decoy', cx: dx, cy: dy, r: 2.6 });
        view.fx.insertBefore(decoy, wpn);
        scopeBurst(view.fx, dx, dy, 'sonar-decoy-ring', 22);
        setTimeout(() => { if (entry._alive) scopeBurst(view.fx, dx, dy, 'sonar-decoy-ring', 22); }, 700);
        fsLine(entry, fill(pick(TORPEDO_CM_LINES)), true);
      }

      if (now - lastWake > 55) { lastWake = now; wake(x, y); }
      if (now - lastBtr > 190) { lastBtr = now; btrTick(p); }

      // readouts: range closing to zero, speed stepping up at enable, and the
      // wire going from good, to cut, to a seeker that has stopped searching
      const yds = Math.max(0, Math.round(range0 * (1 - p) / 50) * 50);
      view.rng.textContent = `RNG ${yds.toLocaleString()}Y`;
      view.spd.textContent = p >= SN.ENABLE ? '55 KT' : '40 KT';
      view.wire.textContent = p >= SN.ACQUIRE ? 'ACQUIRED' : p >= SN.ENABLE ? 'WIRE CUT' : 'WIRE GOOD';
      view.wire.classList.toggle('hot', p >= SN.ACQUIRE);

      fireUpTo(p);
      setProgress(entry, p, subPhase(p), cm && p >= SN.CM_AT && p < SN.CM_END);

      if (p < 1) { requestAnimationFrame(frame); return; }
      detonate();
    }

    // Under-keel detonation: the warhead does not touch the hull, it takes the
    // water out from under it. Which is why the burst is at the target and not
    // on it, and why the shock ring is the biggest thing on the display.
    function detonate() {
      if (!skipEnders.delete(forceDetonate)) return;   // once, however it got here
      entry._done = true;   // the wall may reclaim this screen — see wallScreen()
      wpn.setAttribute('opacity', 0);
      wire.setAttribute('opacity', 0);
      if (decoy) decoy.setAttribute('opacity', 0);
      view.tg.classList.add('scope-hit');
      scopeBurst(view.fx, C, C, 'impact-flash', 40);
      scopeBurst(view.fx, C, C, 'sonar-shock', 96);
      setProgress(entry, 1, 'BDA', false);
      fireUpTo(1);
      done();                 // BDA resolves now — everything after is cosmetic
      targetPulse(target);
      // held open long enough for the torpedo footage to play out in full
      fsClose(entry, ff ? 0 : 8800);
    }
    const forceDetonate = () => { if (entry._alive) detonate(); else skipEnders.delete(forceDetonate); };
    skipEnders.add(forceDetonate);

    t0 = performance.now();
    btrTick(0);
    requestAnimationFrame(frame);
  }

  // ============================================================
  // RAID SCOPE — the special-operations mission, flown in its own card
  // ============================================================
  // Same panel and the same visual grammar as a strike scope, but the display
  // is a compound overhead instead of a radar picture, and the mission plays as
  // a scripted timeline minutes long rather than a single run-in. specops.js
  // owns the script, the branch, and every outcome; this owns nothing but
  // pixels — no method here decides anything.
  const RC = {
    lz: { x: 100, y: 162 },      // primary LZ, outside the south wall
    hold: { x: 150, y: 132 },    // overwatch bird's orbit point
    breach: { x: 100, y: 132 },  // south wall — where the charge goes
    hvt: { x: 89, y: 97 },       // main residence
    edge: 214,                   // helos enter/leave off the bottom of the view
  };

  function raidOpen(header, onSkip) {
    // The raid does not stack in the corner scope with the strikes: it mounts on
    // its own stage in the middle of the board, split between the compound
    // overhead and whatever the feed from the objective is carrying.
    const stage = document.getElementById('raid-stage');
    const entry = document.createElement('div');
    entry._alive = true;
    entry.className = 'flight-entry raid-card';
    entry.innerHTML =
      `<div class="fs-head">${header}<button type="button" class="raid-skip">SKIP ▸</button></div>` +
      `<div class="raid-split">` +
        `<div class="raid-pane">` +
          `<div class="raid-pane-label">TACTICAL — OBJECTIVE OVERHEAD</div>` +
          `<div class="scope-wrap"></div>` +
          `<div class="fs-lines raid-lines"></div>` +
        `</div>` +
        `<div class="raid-pane">` +
          `<div class="raid-pane-label">FEED — NEPTUNE 01</div>` +
          `<div class="raid-feed-wrap">` +
            `<div class="raid-novisual">NO VISUAL</div>` +
          `</div>` +
        `</div>` +
      `</div>` +
      `<div class="progress-row"><span class="progress-phase">STANDING BY</span>` +
      `<span class="progress-pct">0%</span></div>` +
      `<div class="progress-bar"><div class="progress-fill"></div></div>`;
    stage.innerHTML = '';
    stage.appendChild(entry);
    stage.classList.remove('hidden');
    entry.querySelector('.raid-skip').addEventListener('click', () => { if (onSkip) onSkip(); });

    // ---- the footage pane ----
    // One <video> PER CLIP, not one element re-pointed at each source. Swapping
    // .src on a single element races: every assignment aborts the load under it,
    // and the element settles on whichever response happens to land last rather
    // than on the beat that fired last — which plays the mission out of order.
    // A clip that will not decode is not an error worth surfacing mid-raid; that
    // pane just falls back to NO VISUAL, which is also its resting state for
    // every beat with no footage cut yet.
    //
    // One element per clip only works while they all fit in the browser's media
    // budget, and this pane got a lot heavier when the assault footage landed:
    // the infil alone was six clips, a full mission script now names up to
    // thirteen, and they are 2556x1180 each. Browsers cap how many elements may
    // hold a video decoder at once — iOS Safari most aggressively, and landscape
    // phones are a first-class target here. Past that cap the failure mode is
    // silent: `play()` still resolves, no error event fires, and the frame just
    // never advances, which on screen is indistinguishable from a deliberately
    // static shot.
    //
    // This is a precaution, not a fix for a reproduced bug — the ceiling could
    // not be measured reliably in an automated browser, since those suspend the
    // page between commands and every playback reading is confounded by it. What
    // is not in doubt is that thirteen simultaneous decoders is a bad bet on a
    // phone. So the pane holds a bounded window and hands the decoder back for
    // the rest. `feedPool` is insertion-ordered, least-recently-used first,
    // which is what makes eviction a walk from the front. If footage ever
    // arrives late on a slow connection, this window is the first thing to
    // widen.
    const FEED_WINDOW = 4;
    const feedWrap = entry.querySelector('.raid-feed-wrap');
    const feedPool = new Map();
    let feedCurrent = null;
    let feedOrder = [];   // every clip this mission cuts to, in script order

    // Dropping the source is what actually releases the decoder — pausing the
    // element or pulling it out of the DOM does not.
    function feedRelease(src) {
      const v = feedPool.get(src);
      if (!v || v === feedCurrent) return;
      feedPool.delete(src);
      v.pause();
      v.removeAttribute('src');
      v.load();
      v.remove();
    }

    function feedTrim() {
      if (feedPool.size <= FEED_WINDOW) return;
      for (const src of [...feedPool.keys()]) {
        if (feedPool.size <= FEED_WINDOW) break;
        feedRelease(src);   // no-ops on whatever is currently on screen
      }
    }

    function feedEl(src) {
      let v = feedPool.get(src);
      if (v) {
        // touch: re-insert so this clip is the youngest and evicts last
        feedPool.delete(src);
        feedPool.set(src, v);
        return v;
      }
      v = document.createElement('video');
      v.className = 'raid-feed-video';
      v.muted = true; v.loop = true; v.playsInline = true; v.preload = 'auto';
      v.addEventListener('error', () => {
        v.classList.remove('live');
        if (feedCurrent === v) feedWrap.classList.remove('has-video');
      });
      v.src = src;
      feedWrap.appendChild(v);
      feedPool.set(src, v);
      feedTrim();
      return v;
    }

    // Pull the clips that come after this cut in behind it, so the next beat
    // still lands on footage that has already arrived. Beats are 4–6s apart, so
    // a window of four is roughly twenty seconds of runway — the same guarantee
    // the old build-everything preload gave, inside the decoder budget.
    function feedWarm(src) {
      const i = src ? feedOrder.indexOf(src) : -1;
      if (i < 0) return;
      for (let k = 1; k < FEED_WINDOW && i + k < feedOrder.length; k++) feedEl(feedOrder[i + k]);
    }

    function feedPlay(src) {
      const next = src ? feedEl(src) : null;
      // Claim the current clip before anything can evict it: feedWarm touches
      // the pool, and an un-claimed current is just the oldest entry in it.
      feedCurrent = next;
      for (const v of feedPool.values()) {
        if (v === next) continue;
        v.classList.remove('live');
        v.pause();
      }
      if (!next) {
        feedWrap.classList.remove('has-video');
        return;
      }
      const v = next;
      try { v.currentTime = 0; } catch (e) { /* not seekable yet; it starts at 0 anyway */ }
      // The cut is made here, synchronously, not when play() resolves — a promise
      // that settles late is exactly how the wrong clip ends up on screen.
      v.classList.add('live');
      feedWrap.classList.add('has-video');
      const p = v.play();
      if (p) p.catch(() => {});   // autoplay refusal and abort noise are not mission failures
      feedWarm(src);
    }

    const svg = el('svg', { class: 'scope-view raid-view', viewBox: '0 0 200 200' });

    // ground furniture: a block grid and the two roads that box the compound in
    const grid = el('g', { class: 'raid-grid' });
    for (let i = 25; i < 200; i += 25) {
      grid.appendChild(el('line', { x1: i, y1: 0, x2: i, y2: 200 }));
      grid.appendChild(el('line', { x1: 0, y1: i, x2: 200, y2: i }));
    }
    svg.appendChild(grid);
    const roads = el('g', { class: 'raid-road' });
    roads.appendChild(el('line', { x1: 0, y1: 146, x2: 200, y2: 146 }));
    roads.appendChild(el('line', { x1: 156, y1: 146, x2: 156, y2: 0 }));
    svg.appendChild(roads);

    // the objective: perimeter wall, main residence, annex, guard barracks
    const cmp = el('g', { class: 'raid-compound' });
    cmp.appendChild(el('rect', { class: 'raid-wall', x: 66, y: 76, width: 68, height: 56 }));
    const main = el('rect', { class: 'raid-bldg raid-main', x: 74, y: 84, width: 30, height: 26 });
    cmp.appendChild(main);
    cmp.appendChild(el('rect', { class: 'raid-bldg', x: 110, y: 90, width: 16, height: 16 }));
    const guard = el('rect', { class: 'raid-bldg raid-guard', x: 74, y: 117, width: 15, height: 9 });
    cmp.appendChild(guard);
    const cmpLbl = el('text', { class: 'raid-label', x: 100, y: 70 });
    cmpLbl.textContent = 'OBJECTIVE';
    cmp.appendChild(cmpLbl);
    svg.appendChild(cmp);

    // landing zone
    const lzg = el('g', { class: 'raid-lz' });
    lzg.appendChild(el('circle', { cx: RC.lz.x, cy: RC.lz.y, r: 10 }));
    const lzl = el('text', { class: 'raid-label', x: RC.lz.x, y: RC.lz.y + 21 });
    lzl.textContent = 'LZ';
    lzg.appendChild(lzl);
    svg.appendChild(lzg);

    const fx = el('g', { class: 'raid-fx' });
    svg.appendChild(fx);
    entry.querySelector('.scope-wrap').appendChild(svg);

    // ---- helicopters ----
    // Two birds: the assault bird puts the team on the LZ, the overwatch bird
    // holds off the compound's east side. Rotors spin on their own loop so a
    // bird sitting on the ground still reads as running.
    const helos = [];
    function makeHelo(id, x, y) {
      const g = el('g', { class: 'raid-helo' });
      g.appendChild(el('path', { class: 'raid-hull', d: SIL.helo }));
      const rotor = el('g', { class: 'raid-rotor' });
      rotor.appendChild(el('line', { x1: -12, y1: 0, x2: 12, y2: 0 }));
      rotor.appendChild(el('line', { x1: 0, y1: -12, x2: 0, y2: 12 }));
      g.appendChild(rotor);
      fx.appendChild(g);
      const h = { id, g, rotor, x, y, hdg: 0, spin: CosmeticRandom.float() * 360, power: 1, down: false };
      helos.push(h);
      placeHelo(h);
      return h;
    }
    function placeHelo(h) {
      h.g.setAttribute('transform', `translate(${h.x.toFixed(2)},${h.y.toFixed(2)}) rotate(${h.hdg.toFixed(1)})`);
      h.rotor.setAttribute('transform', `translate(0,-1) rotate(${h.spin.toFixed(1)})`);
    }
    (function spinLoop(last) {
      return function step(now) {
        if (!entry._alive) return;
        const dt = Math.min(64, now - last);
        last = now;
        for (const h of helos) {
          if (h.power <= 0) continue;
          h.spin = (h.spin + dt * 1.6 * h.power) % 360;
          h.rotor.setAttribute('transform', `translate(0,-1) rotate(${h.spin.toFixed(1)})`);
        }
        requestAnimationFrame(step);
      };
    })(performance.now())(performance.now());

    // ---- assault element: one square per operator, moving as a cluster ----
    const ops = [];
    const team = { x: RC.lz.x, y: RC.lz.y };
    // a frozen operator (dead, or captured in place) stops riding the cluster
    function placeOps() {
      for (const o of ops) {
        if (o.frozen) continue;
        o.g.setAttribute('transform',
          `translate(${(team.x + o.dx).toFixed(2)},${(team.y + o.dy).toFixed(2)})`);
      }
    }

    function tween(ms, step, done) {
      const t0 = performance.now();
      (function frame(now) {
        if (!entry._alive) return;
        const p = Math.min(1, (now - t0) / ms);
        step(p);
        if (p < 1) { requestAnimationFrame(frame); return; }
        if (done) done();
      })(performance.now());
    }

    function moveTeam(to, ms, done) {
      const from = { x: team.x, y: team.y };
      tween(ms, (p) => {
        team.x = from.x + (to.x - from.x) * p;
        team.y = from.y + (to.y - from.y) * p;
        placeOps();
      }, done);
    }

    const handle = {
      entry,

      // Feed line, stamped with the mission clock. Kinds colour the line:
      // status is white, problem amber, bad red, good green.
      log(text, kind, clockMs) {
        const div = document.createElement('div');
        div.className = 'fs-line raid-line' + (kind ? ` raid-${kind}` : '');
        const s = Math.max(0, Math.round((clockMs || 0) / 1000));
        const stamp = document.createElement('span');
        stamp.className = 'raid-stamp';
        stamp.textContent = `T+${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
        div.appendChild(stamp);
        div.appendChild(document.createTextNode(' ' + text));
        const box = entry.querySelector('.fs-lines');
        box.appendChild(div);
        const lines = box.querySelectorAll('.fs-line');
        if (lines.length > 5) lines[0].remove();
      },

      phase(p, label, contested) { setProgress(entry, p, label, contested); },

      // Swap the footage pane's source. Passing null parks it on NO VISUAL,
      // which is where the mission sits from the objective onward until that
      // footage is cut.
      clip(src) { feedPlay(src); },

      // Take the mission's whole clip list in script order and warm the head of
      // it. The rest is built a few beats ahead of the cut that needs it — see
      // FEED_WINDOW above for why this cannot just build all of them.
      preload(srcs) {
        feedOrder = [];
        for (const s of srcs) if (s && feedOrder.indexOf(s) < 0) feedOrder.push(s);
        for (let i = 0; i < FEED_WINDOW && i < feedOrder.length; i++) feedEl(feedOrder[i]);
      },

      // birds run in from off the bottom of the display and settle on the LZ
      infil(ms) {
        const assault = makeHelo('assault', RC.lz.x - 8, RC.edge);
        const over = makeHelo('over', RC.lz.x + 22, RC.edge + 26);
        fx.insertBefore(el('line', {
          class: 'raid-track', x1: RC.lz.x - 8, y1: RC.edge, x2: RC.lz.x, y2: RC.lz.y,
        }), fx.firstChild);
        const a0 = { x: assault.x, y: assault.y }, o0 = { x: over.x, y: over.y };
        tween(ms, (p) => {
          const e = p * p * (3 - 2 * p); // ease in/out: they slow onto the objective
          if (!assault.down) {
            assault.x = a0.x + (RC.lz.x - a0.x) * e;
            assault.y = a0.y + (RC.lz.y - a0.y) * e;
            placeHelo(assault);
          }
          if (!over.down) {
            over.x = o0.x + (RC.hold.x - o0.x) * e;
            over.y = o0.y + (RC.hold.y - o0.y) * e;
            placeHelo(over);
          }
        });
      },

      // fast-rope the team in and walk it up to the wall
      fastrope(ms, n) {
        for (let i = 0; i < (n || 6); i++) {
          const g = el('g', { class: 'raid-op' });
          g.appendChild(el('rect', { x: -1.6, y: -1.6, width: 3.2, height: 3.2 }));
          fx.appendChild(g);
          ops.push({ g, dx: (i % 3 - 1) * 5, dy: (i < 3 ? -1 : 1) * 3.5, hit: false });
        }
        team.x = RC.lz.x; team.y = RC.lz.y;
        placeOps();
        moveTeam(RC.breach, ms);
      },

      breach() {
        scopeBurst(fx, RC.breach.x, RC.breach.y, 'raid-blast', 16);
        cmp.classList.add('raid-breached');
      },

      // sporadic muzzle flashes around the wall for the length of the fight
      firefight(ms) {
        const t0 = performance.now();
        (function pop() {
          if (!entry._alive || performance.now() - t0 > ms) return;
          const x = 66 + CosmeticRandom.float() * 68, y = 76 + CosmeticRandom.float() * 56;
          scopeBurst(fx, x, y, 'raid-muzzle', 4);
          setTimeout(pop, 120 + CosmeticRandom.float() * 220);
        })();
      },

      enter(ms) { moveTeam(RC.hvt, ms); },

      jackpot() {
        main.classList.add('raid-cleared');
        scopeBurst(fx, RC.hvt.x, RC.hvt.y, 'raid-jackpot', 22);
      },

      // a bird goes in: it drifts, yaws, and burns where it lands
      heloDown(which, onGround) {
        const h = helos.find(x => x.id === which) || helos[0];
        if (!h || h.down) return;
        h.down = true;
        const from = { x: h.x, y: h.y };
        const to = onGround ? { x: h.x, y: h.y } : { x: h.x + 14, y: h.y + 16 };
        tween(1600, (p) => {
          h.x = from.x + (to.x - from.x) * p;
          h.y = from.y + (to.y - from.y) * p;
          h.hdg = p * 140;
          h.power = 1 - p;
          placeHelo(h);
        }, () => {
          h.power = 0;
          h.g.classList.add('raid-wreck');
          scopeBurst(fx, h.x, h.y, 'raid-blast', 20);
        });
      },

      // n operators go down — the squares stop moving with the cluster and go red
      teamHit(n) {
        const live = ops.filter(o => !o.hit);
        for (let i = 0; i < Math.min(n, live.length); i++) {
          const o = live[i];
          o.hit = true;
          o.g.classList.add('raid-op-down');
          const at = { x: team.x + o.dx, y: team.y + o.dy };
          o.g.setAttribute('transform', `translate(${at.x.toFixed(2)},${at.y.toFixed(2)})`);
          scopeBurst(fx, at.x, at.y, 'raid-muzzle', 6);
          // frozen in place: overwrite its offset so placeOps() can't move it
          o.dx = at.x - team.x; o.dy = at.y - team.y;
          o.frozen = true;
        }
      },

      // survivors stop being ours — amber, static, inside the wire
      teamCaptured() {
        for (const o of ops) {
          if (o.hit) continue;
          o.frozen = true;
          o.g.classList.add('raid-op-taken');
        }
        cmp.classList.add('raid-lost');
      },

      teamOut(ms) { moveTeam(RC.lz, ms); },

      // whatever is still flying lifts off and runs south, off the display
      exfil(ms) {
        for (const o of ops) if (!o.hit && !o.frozen) o.g.classList.add('raid-op-gone');
        for (const h of helos) {
          if (h.down) continue;
          const from = { x: h.x, y: h.y };
          const to = { x: h.x - 6, y: RC.edge + 20 };
          h.hdg = 180;
          tween(ms, (p) => {
            h.x = from.x + (to.x - from.x) * p;
            h.y = from.y + (to.y - from.y) * p;
            placeHelo(h);
          });
        }
      },

      // The stage comes down with the card — and the clip is stopped explicitly
      // rather than left for the removal, so a skipped raid stops decoding now.
      close(delay) {
        setTimeout(() => {
          entry._alive = false;
          for (const v of feedPool.values()) {
            v.pause();
            v.removeAttribute('src');
            v.load();
          }
          feedPool.clear();
          entry.remove();
          const st = document.getElementById('raid-stage');
          st.innerHTML = '';
          st.classList.add('hidden');
        }, delay || 0);
      },
    };

    return handle;
  }

  // ============================================================
  // CSAR SCOPE — personnel recovery, flown in its own card
  // ============================================================
  // The raid scope's sibling: same card, same grammar, different ground. There
  // is no compound here — just terrain, a beacon, and a search party walking
  // toward it. csar.js owns the script, the branch and every outcome; this owns
  // nothing but pixels.
  const CS = {
    surv: { x: 92, y: 96 },      // the wadi the aircrew are holding
    hold: { x: 154, y: 150 },    // JOLLY 52's holding point, south-east
    east: { x: 192, y: 122 },    // where the search party comes up the track
    north: { x: 96, y: 6 },      // and where the second element comes from
    edge: 214,                   // aircraft enter and leave off the bottom
  };

  function csarOpen(header, crew, onSkip, totalMs) {
    // the Reaper covers exactly 1.5 orbits over the length of the mission, so it
    // reads as a slow, patient wheel rather than a fighter racing around
    const orbitRate = (1.5 * 360) / (totalMs || 66000);   // degrees per ms
    const { scope } = fsStacks();
    const entry = document.createElement('div');
    entry._alive = true;
    entry.className = 'flight-entry raid-card csar-card';
    entry.innerHTML =
      `<div class="fs-head">${header}<button type="button" class="raid-skip">SKIP ▸</button></div>` +
      `<div class="scope-wrap"></div>` +
      `<div class="fs-lines raid-lines"></div>` +
      `<div class="progress-row"><span class="progress-phase">STANDING BY</span>` +
      `<span class="progress-pct">0%</span></div>` +
      `<div class="progress-bar"><div class="progress-fill"></div></div>`;
    scope.appendChild(entry);
    fsPanel().classList.remove('hidden');
    entry.querySelector('.raid-skip').addEventListener('click', () => { if (onSkip) onSkip(); });

    const svg = el('svg', { class: 'scope-view raid-view csar-view', viewBox: '0 0 200 200' });

    const grid = el('g', { class: 'raid-grid' });
    for (let i = 25; i < 200; i += 25) {
      grid.appendChild(el('line', { x1: i, y1: 0, x2: i, y2: 200 }));
      grid.appendChild(el('line', { x1: 0, y1: i, x2: 200, y2: i }));
    }
    svg.appendChild(grid);

    // terrain: ridge lines, the wadi the survivors are in, and the track the
    // search party is coming up. Everything about this ground is why it is hard.
    const ridges = el('g', { class: 'csar-ridge' });
    for (const d of [
      'M0,44 C38,32 68,58 100,46 C132,34 164,54 200,40',
      'M0,74 C34,66 60,90 94,78 C130,66 168,86 200,74',
      'M0,140 C40,128 76,150 112,140 C148,130 176,146 200,136',
    ]) ridges.appendChild(el('path', { d }));
    svg.appendChild(ridges);
    svg.appendChild(el('path', { class: 'csar-wadi', d: 'M40,124 C62,112 76,104 92,96 C110,87 124,74 150,66' }));
    svg.appendChild(el('path', { class: 'csar-track', d: 'M200,112 L164,124 L140,150 L118,200' }));

    // the survivors: one marker per aviator, in a dashed contact ring
    const survG = el('g', { class: 'csar-survivors' });
    const ring = el('circle', { class: 'csar-ring', cx: CS.surv.x, cy: CS.surv.y, r: 13 });
    survG.appendChild(ring);
    const survLbl = el('text', { class: 'raid-label', x: CS.surv.x, y: CS.surv.y + 25 });
    survLbl.textContent = 'SURVIVORS';
    survG.appendChild(survLbl);
    const survs = [];
    for (let i = 0; i < (crew || 1); i++) {
      const g = el('g', { class: 'csar-surv' });
      g.appendChild(el('path', { d: 'M0,-2.4 L2,2 L-2,2 Z' }));
      const at = { x: CS.surv.x + (i ? 5 : -5), y: CS.surv.y + (i ? 3 : -2) };
      g.setAttribute('transform', `translate(${at.x},${at.y})`);
      survG.appendChild(g);
      survs.push({ g, x: at.x, y: at.y, state: 'down' });
    }
    svg.appendChild(survG);

    const fx = el('g', { class: 'raid-fx' });
    svg.appendChild(fx);
    entry.querySelector('.scope-wrap').appendChild(svg);

    // ---- aircraft ----
    const helos = [];
    let mq9 = null;

    function makeHelo(id, x, y) {
      const g = el('g', { class: 'raid-helo' });
      g.appendChild(el('path', { class: 'raid-hull', d: SIL.helo }));
      const rotor = el('g', { class: 'raid-rotor' });
      rotor.appendChild(el('line', { x1: -12, y1: 0, x2: 12, y2: 0 }));
      rotor.appendChild(el('line', { x1: 0, y1: -12, x2: 0, y2: 12 }));
      g.appendChild(rotor);
      fx.appendChild(g);
      const h = { id, g, rotor, x, y, hdg: 0, spin: CosmeticRandom.float() * 360, power: 1, down: false };
      helos.push(h);
      placeHelo(h);
      return h;
    }
    function placeHelo(h) {
      h.g.setAttribute('transform', `translate(${h.x.toFixed(2)},${h.y.toFixed(2)}) rotate(${h.hdg.toFixed(1)})`);
      h.rotor.setAttribute('transform', `translate(0,-1) rotate(${h.spin.toFixed(1)})`);
    }

    // the Reaper: a drone holding a slow wheel over the survivors, which is the
    // one thing on this display that never stops moving. It flies the orbit as
    // a flattened ellipse (perspective), and its nose tracks the tangent so it
    // always looks like it is banking around the survivors, not sliding sideways.
    const ORBIT_SQUASH = 0.8;  // vertical flattening that sells the "wheel"
    function makeMq9() {
      const g = el('g', { class: 'csar-mq9' });
      g.appendChild(el('path', { class: 'csar-mq9-hull', d: SIL.reaper }));
      fx.appendChild(g);
      mq9 = { g, ang: 200, r: 56, down: false, gone: false };
    }
    function placeMq9() {
      if (!mq9) return;
      const a = mq9.ang * Math.PI / 180;
      mq9.x = CS.surv.x + Math.cos(a) * mq9.r;
      mq9.y = CS.surv.y + Math.sin(a) * mq9.r * ORBIT_SQUASH;
      // velocity tangent to the ellipse (d/da of the position above); the
      // silhouette is drawn nose-up, so heading = atan2(vy,vx) + 90°
      const vx = -Math.sin(a);
      const vy = Math.cos(a) * ORBIT_SQUASH;
      const heading = Math.atan2(vy, vx) * 180 / Math.PI + 90;
      mq9.g.setAttribute('transform',
        `translate(${mq9.x.toFixed(2)},${mq9.y.toFixed(2)}) rotate(${heading.toFixed(1)})`);
    }

    (function spinLoop(last) {
      return function step(now) {
        if (!entry._alive) return;
        const dt = Math.min(64, now - last);
        last = now;
        for (const h of helos) {
          if (h.power <= 0) continue;
          h.spin = (h.spin + dt * 1.6 * h.power) % 360;
          h.rotor.setAttribute('transform', `translate(0,-1) rotate(${h.spin.toFixed(1)})`);
        }
        if (mq9 && !mq9.down && !mq9.gone) { mq9.ang = (mq9.ang + dt * orbitRate) % 360; placeMq9(); }
        requestAnimationFrame(step);
      };
    })(performance.now())(performance.now());

    // ---- the search party: red squares walking onto the position ----
    const hunters = [];
    function makeHunters(from, ms) {
      const start = CS[from] || CS.east;
      const grp = { x: start.x, y: start.y, stopped: false, sq: [] };
      for (let i = 0; i < 5; i++) {
        const g = el('g', { class: 'csar-hunter' });
        g.appendChild(el('rect', { x: -1.5, y: -1.5, width: 3, height: 3 }));
        fx.appendChild(g);
        grp.sq.push({ g, dx: (i % 3 - 1) * 6, dy: (i < 3 ? -1 : 1) * 4 });
      }
      hunters.push(grp);
      const to = { x: CS.surv.x + (start.x > CS.surv.x ? 22 : -6), y: CS.surv.y + (start.y > CS.surv.y ? 18 : -18) };
      const from0 = { x: grp.x, y: grp.y };
      tween(ms, (p) => {
        if (grp.stopped) return;
        grp.x = from0.x + (to.x - from0.x) * p;
        grp.y = from0.y + (to.y - from0.y) * p;
        for (const s of grp.sq) {
          s.g.setAttribute('transform', `translate(${(grp.x + s.dx).toFixed(2)},${(grp.y + s.dy).toFixed(2)})`);
        }
      });
      return grp;
    }

    // ---- pararescue team: same square vocabulary as the raid's assault element ----
    const pjs = [];
    const pjTeam = { x: CS.surv.x, y: CS.surv.y };

    function tween(ms, step, done) {
      const t0 = performance.now();
      (function frame(now) {
        if (!entry._alive) return;
        const p = Math.min(1, (now - t0) / ms);
        step(p);
        if (p < 1) { requestAnimationFrame(frame); return; }
        if (done) done();
      })(performance.now());
    }

    const jolly = () => helos.find(h => h.id === 'jolly1');

    const handle = {
      entry,

      log(text, kind, clockMs) {
        const div = document.createElement('div');
        div.className = 'fs-line raid-line' + (kind ? ` raid-${kind}` : '');
        const s = Math.max(0, Math.round((clockMs || 0) / 1000));
        const stamp = document.createElement('span');
        stamp.className = 'raid-stamp';
        stamp.textContent = `T+${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
        div.appendChild(stamp);
        div.appendChild(document.createTextNode(' ' + text));
        const box = entry.querySelector('.fs-lines');
        box.appendChild(div);
        const lines = box.querySelectorAll('.fs-line');
        if (lines.length > 5) lines[0].remove();
      },

      phase(p, label, contested) { setProgress(entry, p, label, contested); },

      // two Jollies and the MQ-9 flight run in from the south
      ingress(ms) {
        const j1 = makeHelo('jolly1', CS.hold.x - 30, CS.edge);
        const j2 = makeHelo('jolly2', CS.hold.x + 6, CS.edge + 24);
        makeMq9();
        placeMq9();
        const a0 = { x: j1.x, y: j1.y }, b0 = { x: j2.x, y: j2.y };
        const a1 = { x: CS.hold.x - 26, y: CS.hold.y + 10 };
        tween(ms, (p) => {
          const e = p * p * (3 - 2 * p);
          if (!j1.down && !j1.landing) {
            j1.x = a0.x + (a1.x - a0.x) * e; j1.y = a0.y + (a1.y - a0.y) * e; placeHelo(j1);
          }
          if (!j2.down) {
            j2.x = b0.x + (CS.hold.x - b0.x) * e; j2.y = b0.y + (CS.hold.y - b0.y) * e; placeHelo(j2);
          }
        });
      },

      // contact authenticated: the ring goes live
      beacon() { survG.classList.add('csar-contact'); },

      searchers(ms, from) { makeHunters(from || 'east', ms); },

      // MQ-9 puts a Hellfire into the gap between the search party and the survivors
      gunRun(kill) {
        const grp = hunters[hunters.length - 1];
        const at = grp ? { x: grp.x, y: grp.y } : { x: CS.east.x, y: CS.east.y };
        for (let i = 0; i < 7; i++) {
          setTimeout(() => {
            if (!entry._alive) return;
            scopeBurst(fx, at.x + (i - 3) * 4 + rand(-3, 3), at.y + rand(-5, 5), 'raid-muzzle', 5);
          }, i * 90);
        }
        setTimeout(() => { if (entry._alive) scopeBurst(fx, at.x, at.y, 'raid-blast', 15); }, 700);
        if (kill && grp) {
          grp.stopped = true;
          for (const s of grp.sq) s.g.classList.add('csar-hunter-dead');
        }
      },

      // JOLLY 51 comes off the hold and settles on the survivors
      land(ms) {
        const h = jolly();
        if (!h || h.down) return;
        h.landing = true;
        const from = { x: h.x, y: h.y };
        const to = { x: CS.surv.x + 12, y: CS.surv.y + 10 };
        tween(ms, (p) => {
          h.x = from.x + (to.x - from.x) * p;
          h.y = from.y + (to.y - from.y) * p;
          placeHelo(h);
        }, () => {
          for (let i = 0; i < 2; i++) {
            const g = el('g', { class: 'raid-op' });
            g.appendChild(el('rect', { x: -1.4, y: -1.4, width: 2.8, height: 2.8 }));
            fx.appendChild(g);
            pjs.push({ g, dx: (i ? 3 : -3), dy: 0, hit: false });
          }
          pjTeam.x = h.x; pjTeam.y = h.y;
          tween(1400, (p) => {
            pjTeam.x = h.x + (CS.surv.x - h.x) * p;
            pjTeam.y = h.y + (CS.surv.y - h.y) * p;
            for (const o of pjs) {
              if (o.frozen) continue;
              o.g.setAttribute('transform',
                `translate(${(pjTeam.x + o.dx).toFixed(2)},${(pjTeam.y + o.dy).toFixed(2)})`);
            }
          });
        });
      },

      // n survivors get aboard — they cross to the aircraft and are gone
      pickup(n) {
        const h = jolly();
        const live = survs.filter(s => s.state === 'down');
        for (const s of live.slice(0, Math.max(0, n))) {
          s.state = 'aboard';
          const from = { x: s.x, y: s.y };
          const to = h && !h.down ? { x: h.x, y: h.y } : { x: CS.surv.x, y: CS.surv.y };
          s.g.classList.add('csar-surv-safe');
          tween(2200, (p) => {
            s.g.setAttribute('transform',
              `translate(${(from.x + (to.x - from.x) * p).toFixed(2)},${(from.y + (to.y - from.y) * p).toFixed(2)})`);
          }, () => {
            s.g.classList.add('raid-op-gone');
            // nobody left in the wadi: the beacon ring stops being a live contact
            if (!survs.some(x => x.state === 'down')) survG.classList.remove('csar-contact');
          });
        }
      },

      // whoever is still on the ground stops being ours
      taken() {
        for (const s of survs) {
          if (s.state !== 'down') continue;
          s.state = 'taken';
          s.g.classList.add('csar-surv-taken');
        }
        survG.classList.remove('csar-contact');
        survG.classList.add('csar-lost');
        for (const o of pjs) { o.frozen = true; o.g.classList.add('raid-op-taken'); }
      },

      // a rescue crewman goes down on the objective
      crewHit() {
        const live = pjs.filter(o => !o.hit);
        const o = live[0];
        if (!o) { scopeBurst(fx, CS.surv.x, CS.surv.y, 'raid-muzzle', 7); return; }
        o.hit = true;
        o.frozen = true;
        o.g.classList.add('raid-op-down');
        scopeBurst(fx, pjTeam.x + o.dx, pjTeam.y + o.dy, 'raid-muzzle', 7);
      },

      heloHit(which) {
        const h = helos.find(x => x.id === which) || helos[0];
        if (!h) return;
        h.g.classList.add('csar-hit');
        scopeBurst(fx, h.x, h.y, 'raid-muzzle', 9);
      },

      heloDown(which, onGround) {
        const h = helos.find(x => x.id === which) || helos[0];
        if (!h || h.down) return;
        h.down = true;
        const from = { x: h.x, y: h.y };
        const to = onGround ? { x: h.x + 6, y: h.y - 10 } : { x: h.x + 14, y: h.y + 16 };
        tween(1600, (p) => {
          h.x = from.x + (to.x - from.x) * p;
          h.y = from.y + (to.y - from.y) * p;
          h.hdg = p * 140;
          h.power = 1 - p;
          placeHelo(h);
        }, () => {
          h.power = 0;
          h.g.classList.add('raid-wreck');
          scopeBurst(fx, h.x, h.y, 'raid-blast', 20);
        });
      },

      // the on-scene commander is hit: the wheel stops turning
      mq9Down() {
        if (!mq9 || mq9.down) return;
        mq9.down = true;
        const from = { x: mq9.x, y: mq9.y };
        tween(1500, (p) => {
          const x = from.x + 18 * p, y = from.y - 26 * p;
          mq9.g.setAttribute('transform', `translate(${x.toFixed(2)},${y.toFixed(2)}) rotate(${(p * 220).toFixed(1)})`);
          if (p >= 1) scopeBurst(fx, x, y, 'raid-blast', 18);
        }, () => mq9.g.classList.add('csar-mq9-wreck'));
      },

      // whatever is still flying runs south off the display
      egress(ms) {
        for (const o of pjs) if (!o.hit && !o.frozen) o.g.classList.add('raid-op-gone');
        if (mq9 && !mq9.down) {
          mq9.gone = true;
          const from = { x: mq9.x, y: mq9.y };
          tween(ms, (p) => {
            mq9.g.setAttribute('transform',
              `translate(${(from.x - 10 * p).toFixed(2)},${(from.y + (CS.edge + 20 - from.y) * p).toFixed(2)}) rotate(180)`);
          });
        }
        for (const h of helos) {
          if (h.down) continue;
          const from = { x: h.x, y: h.y };
          const to = { x: h.x - 8, y: CS.edge + 20 };
          h.hdg = 180;
          tween(ms, (p) => {
            h.x = from.x + (to.x - from.x) * p;
            h.y = from.y + (to.y - from.y) * p;
            placeHelo(h);
          });
        }
      },

      close(delay) { fsClose(entry, delay || 0); },
    };

    return handle;
  }

  // ---- isolated personnel on the strategic plot ----
  // Americans on the ground are the one thing on this map that is neither a
  // target nor an asset. The marker exists exactly as long as they are down:
  // csar.js creates it on a shootdown and clears it on any resolution.
  function setSurvivor(pos, label) {
    let g = document.getElementById('survivor-marker');
    if (!pos) { if (g) g.remove(); return; }
    if (!g) {
      g = el('g', { id: 'survivor-marker', class: 'survivor-marker' });
      g.appendChild(el('circle', { class: 'surv-ring pulsing', r: 11 }));
      g.appendChild(el('path', { class: 'surv-mark', d: 'M-4,-4 L4,4 M4,-4 L-4,4' }));
      const t = el('text', { class: 'surv-label', x: 0, y: -15 });
      t.textContent = 'AIRCREW DOWN';
      g.appendChild(t);
      attachTooltip(g, () => `<span class="tt-name">ISOLATED PERSONNEL</span><br>${g.dataset.label || ''}` +
        `<br><em style="color:var(--amber)">Personnel recovery is an option in the situation room.</em>`);
      world.appendChild(g);
    }
    g.dataset.label = label || '';
    g.setAttribute('transform', `translate(${pos.x},${pos.y})`);
  }

  // ---- Iranian counterattacks: ballistic/cruise missiles arc in fast,
  // Shahed drones swarm slowly; both can be intercepted short of the base ----
  function iranOrigin(kind, tx, ty) {
    // destroyed missile-base targets stop launching (tgtId links site → target)
    const alive = IRAN_LAUNCH_SITES[kind].filter(s => {
      if (!s.tgtId) return true;
      const t = TARGETS.find(x => x.id === s.tgtId);
      return t && t.status !== 'destroyed';
    });
    const pool = alive.length ? alive : IRAN_LAUNCH_SITES[kind].slice(-1);
    let best = pool[0], bd = Infinity;
    for (const s of pool) {
      const d = Math.hypot(s.x - tx, s.y - ty);
      if (d < bd) { bd = d; best = s; }
    }
    return best;
  }

  function launchMissiles(base, count, cb) {
    const fx = document.getElementById('fx-layer');
    const o = iranOrigin('missile', base.x, base.y);
    let left = count;
    for (let i = 0; i < count; i++) {
      setTimeout(() => {
        if (ff) { if (--left === 0) cb(); return; }
        const jx = base.x + rand(-8, 8), jy = base.y + rand(-6, 6);
        const mx = (o.x + jx) / 2 + (o.y - jy) * 0.35 + rand(-15, 15);
        const my = (o.y + jy) / 2 + (jx - o.x) * 0.35 + rand(-15, 15);
        const path = el('path', { class: 'iran-missile-path', d: `M${o.x},${o.y} Q${mx},${my} ${jx},${jy}` });
        fx.appendChild(path);
        const m = el('circle', { class: 'iran-missile', r: 2.2 });
        fx.appendChild(m);
        const total = path.getTotalLength();
        const dur = 900 + rand(0, 300);
        // terminal-phase intercept by base air defenses (visual only)
        const interceptAt = CosmeticRandom.float() < 0.35 ? 0.78 + CosmeticRandom.float() * 0.12 : 2;
        const t0 = performance.now();
        const end = () => {
          m.remove();
          path.remove();
          if (--left === 0) cb();
        };
        function step(now) {
          if (ff) { end(); return; }   // skipped: the salvo comes off the plot
          const p = Math.min(1, (now - t0) / dur);
          const pt = path.getPointAtLength(total * p);
          m.setAttribute('cx', pt.x);
          m.setAttribute('cy', pt.y);
          if (p >= interceptAt) { burst(pt.x, pt.y, 'intercept-flash', 10); end(); return; }
          if (p < 1) { requestAnimationFrame(step); return; }
          burst(jx, jy, 'impact-flash-iran', 16);
          end();
        }
        requestAnimationFrame(step);
      }, i * 220);
    }
  }

  function launchDrones(base, count, cb) {
    const fx = document.getElementById('fx-layer');
    const o = iranOrigin('drone', base.x, base.y);
    let left = count;
    for (let i = 0; i < count; i++) {
      setTimeout(() => {
        if (ff) { if (--left === 0) cb(); return; }
        const sx = o.x + rand(-12, 12), sy = o.y + rand(-10, 10);
        const jx = base.x + rand(-7, 7), jy = base.y + rand(-5, 5);
        const mx = (sx + jx) / 2 + rand(-30, 30);
        const my = (sy + jy) / 2 + rand(-30, 30);
        // invisible guide path (stroke: none) — geometry only, for the swarm route
        const path = el('path', { class: 'iran-drone-path', d: `M${sx},${sy} Q${mx},${my} ${jx},${jy}` });
        fx.appendChild(path);
        const d = el('path', { class: 'iran-drone', d: 'M0,-2.6 L2.2,2 L-2.2,2 Z' });
        fx.appendChild(d);
        const total = path.getTotalLength();
        const dur = 2600 + rand(0, 900);
        const wob = 2.5 + CosmeticRandom.float() * 2.5, wf = 4 + CosmeticRandom.float() * 4;
        const interceptAt = CosmeticRandom.float() < 0.3 ? 0.6 + CosmeticRandom.float() * 0.3 : 2;
        const t0 = performance.now();
        const end = () => {
          d.remove();
          path.remove();
          if (--left === 0) cb();
        };
        function step(now) {
          if (ff) { end(); return; }   // skipped: the swarm comes off the plot
          const p = Math.min(1, (now - t0) / dur);
          const pt = path.getPointAtLength(total * p);
          const pb = path.getPointAtLength(Math.min(total, total * p + 2));
          const dx = pb.x - pt.x, dy = pb.y - pt.y;
          const len = Math.hypot(dx, dy) || 1;
          // weave perpendicular to the heading — the swarm wobble
          const off = Math.sin(p * wf * Math.PI) * wob;
          const wx = pt.x + (-dy / len) * off, wy = pt.y + (dx / len) * off;
          const ang = Math.atan2(dy, dx) * 180 / Math.PI + 90;
          d.setAttribute('transform', `translate(${wx},${wy}) rotate(${ang})`);
          if (p >= interceptAt) { burst(wx, wy, 'intercept-flash', 6); end(); return; }
          if (p < 1) { requestAnimationFrame(step); return; }
          burst(jx, jy, 'impact-flash-iran', 9);
          end();
        }
        requestAnimationFrame(step);
      }, i * 280);
    }
  }

  // ---- an allied package, flown on the strategic map ----
  // American strikes are flown in the tactical scope, close up, because the
  // player ordered them and is owed the theatre of watching one arrive. An
  // Israeli package is the opposite kind of event: it is something the president
  // is TOLD ABOUT, and the honest way to show it is the way CENTCOM saw it — as
  // tracks appearing on the strategic plot, from the west, going somewhere the
  // American plan was not going tonight.
  //
  // So this deliberately reuses the Iranian-salvo idiom (a curved track, a
  // silhouette walking it, a burst) rather than the scope: it is a radar picture,
  // not a targeting pod. It runs in amber, and it runs BEFORE the battle report,
  // so the strike is on screen before the prose explaining it.
  //
  // `ally` names WHOSE package this is, and it has to, because there are two
  // allied air forces on the board now and they fly from opposite ends of it.
  // Filtering on `a.ally` alone put an IAF package into Iran out of Khamis
  // Mushait the first night Riyadh committed — the dispatcher rotated through
  // every amber base it could find.
  function alliedStrike(targetIds, done, ally) {
    const fx = document.getElementById('fx-layer');
    const who = ally || 'israel';
    const bases = US_ASSETS.filter(a => a.ally && (a.allyOf || 'israel') === who);
    const tgts = (targetIds || []).map(id => TARGETS.find(t => t.id === id)).filter(Boolean);
    if (ff || !tgts.length || !bases.length) { if (done) done(); return; }

    let left = tgts.length, called = false;
    // Everything this sequence puts on the plot, so the watchdog can take it back
    // off. The flight loop removes its own marks on arrival, but it is driven by
    // requestAnimationFrame — which does not run at all in a hidden tab. A player
    // who switches away mid-ingress and comes back gets the turn handed on by the
    // watchdog below and, without this, two amber tracks welded across Iran for
    // the rest of the war. The turn surviving a throttled tab is not enough; the
    // map has to survive it too.
    const litter = new Set();
    const finish = () => {
      if (called) return;
      called = true;
      skipEnders.delete(finish);
      for (const n of litter) n.remove();
      litter.clear();
      if (done) done();
    };
    skipEnders.add(finish);   // a skip mid-ingress hands the turn straight on

    tgts.forEach((t, i) => {
      setTimeout(() => {
        if (ff) { if (--left === 0) finish(); return; }
        const o = bases[i % bases.length];
        // Bowed NORTH of the direct line, for Israel. The straight track from
        // the Negev to Natanz runs down the middle of Saudi Arabia and Jordan,
        // which is the one route everyone involved insists is not being used;
        // the northern bow reads as the Syria–Iraq corridor the aircraft would
        // really fly.
        //
        // The RSAF's problem is the opposite one and so is the bow. Khamis
        // Mushait to Hodeidah is 130 miles down their own border and there is
        // nothing to route around — the only reason to bend it at all is that a
        // dead-straight track reads as a diagram rather than a flight, so it
        // bows WEST, out over the Red Sea, which is also the run-in they would
        // actually fly to come at the coast from the water.
        const south = who === 'saudi';
        const mx = (o.x + t.x) / 2 + (south ? -55 : 0);
        const my = (o.y + t.y) / 2 - (south ? 0 : 120);
        const path = el('path', { class: 'iaf-path', d: `M${o.x},${o.y} Q${mx},${my} ${t.x},${t.y}` });
        fx.appendChild(path);
        // Each air force flies what it would actually send. Israel: the F-15I
        // for reach and load, the F-35I for the leg that has to survive being
        // seen. Saudi Arabia: the F-15S, which is the aircraft that has flown
        // this campaign since 2015 and the only fast jet silhouette on hand that
        // is honest for them. Picked per aircraft, so an IAF package crossing
        // the plot is a mixed formation rather than four copies of one shape.
        const jet = el('path', { class: 'iaf-jet', d: south ? SIL.f15 : pick([SIL.f15, SIL.f35]) });
        fx.appendChild(jet);
        litter.add(path).add(jet);
        const total = path.getTotalLength();
        const dur = 2200 + rand(0, 400);
        const t0 = performance.now();
        const end = () => {
          jet.remove();
          path.remove();
          litter.delete(path);
          litter.delete(jet);
          if (--left === 0) setTimeout(finish, ff ? 0 : 400);
        };
        function step(now) {
          if (ff) { end(); return; }   // skipped: the package comes off the plot
          const p = Math.min(1, (now - t0) / dur);
          const pt = path.getPointAtLength(total * p);
          const pb = path.getPointAtLength(Math.min(total, total * p + 2));
          const ang = Math.atan2(pb.y - pt.y, pb.x - pt.x) * 180 / Math.PI + 90;
          // the silhouette is drawn for the scope's coordinate space, so it is
          // scaled down to read as an aircraft-sized mark on the strategic plot
          jet.setAttribute('transform', `translate(${pt.x},${pt.y}) rotate(${ang}) scale(0.85)`);
          if (p < 1) { requestAnimationFrame(step); return; }
          // the target's own hit cue, but NOT targetPulse() — that one fires a
          // blue impact-flash, and the whole point of this sequence is that these
          // are not American aircraft
          burst(t.x, t.y, 'impact-flash-ally', 14);
          const g = document.getElementById(`tgt-${t.id}`);
          if (g) { g.classList.add('struck'); setTimeout(() => g.classList.remove('struck'), 500); }
          end();
        }
        requestAnimationFrame(step);
      }, i * 500);
    });
    setTimeout(finish, 9000);   // watchdog: a throttled tab must never stall the war
  }

  // Called from the end-of-turn flow: animates every event carrying an
  // `attack` spec, then hands control back so the battle report can land.
  function animateIranianAttacks(events, done) {
    const specs = [];
    for (const ev of events) {
      if (!ev.attack) continue;
      const bases = ev.attack.bases || [ev.attack.base];
      for (const b of bases) {
        const asset = US_ASSETS.find(a => a.id === b);
        if (!asset) continue;
        if (ev.attack.kind === 'mixed') {
          specs.push({ kind: 'missile', asset, count: ev.attack.count || 4 });
          specs.push({ kind: 'drone', asset, count: 5 });
        } else {
          specs.push({ kind: ev.attack.kind, asset, count: ev.attack.count || (ev.attack.kind === 'drone' ? 5 : 3) });
        }
      }
    }
    if (ff || !specs.length) { if (done) done(); return; }

    let leftSalvos = specs.length, called = false;
    const finish = () => {
      if (called) return;
      called = true;
      skipEnders.delete(finish);
      if (done) done();
    };
    skipEnders.add(finish);   // a skip mid-salvo hands the turn straight on
    specs.forEach((s, i) => {
      setTimeout(() => {
        // a salvo that hasn't launched by the time the player skips never flies
        if (ff) { if (--leftSalvos === 0) finish(); return; }
        (s.kind === 'missile' ? launchMissiles : launchDrones)(s.asset, s.count, () => {
          if (--leftSalvos === 0) setTimeout(finish, ff ? 0 : 400);
        });
      }, i * 600);
    });
    setTimeout(finish, 12000); // watchdog: a throttled tab must never stall the war
  }

  return { render, updateTarget, syncCovert, setHormuz, setMandab, setGulfMood, flashAsset, animateStrike, playStrikeHit,
    whenFootageDone, updateTransit, animateIranianAttacks, alliedStrike,
    setTargetClickHandler, setFastForward, isFastForward, syncSouthCue, focusSouth,
    setCarrierPosture, setCarrierIngress, setAssetActive, raidOpen,
    csarOpen, setSurvivor };
})();
