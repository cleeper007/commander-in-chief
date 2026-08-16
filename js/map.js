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

  const rand = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

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
  let iconK = 1;

  function syncIconScale() {
    if (!world) return;
    const k = Math.min(1, 1 / view.k);
    if (k === iconK) return;   // panning does not move it; only zoom does
    iconK = k;
    for (const g of world.querySelectorAll('g.tgt-icon'))
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
  // A CSG resolves in two steps, because at chart scale it is honestly one blue
  // flat-top and five destroyers drawn at their true spacing would be five
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

  // Deck fittings, close zoom only. What is actually on a flight deck: the two
  // bow catapults, the waist cat sharing the angled deck, four wires across the
  // landing area, three deck-edge elevators overhanging the side, and aircraft
  // parked where a carrier parks them — which is everywhere the landing area is
  // not, because that is the one patch of deck that has to stay clear.
  function carrierDeck() {
    const d = el('g', { class: 'cv-detail' });
    for (const x of [-1.25, 0.55])   // bow cats, either side of the centreline
      d.appendChild(el('line', { class: 'cv-cat', x1: x, y1: -7.0, x2: x, y2: -1.6 }));
    // Everything the landing area owns lies square to the ANGLED deck rather
    // than to the hull, so it is all drawn in one frame rotated onto that axis:
    // origin at the round-down (the aft end of the angled deck), local +y
    // running aft, local x across it. The 25-degree offset is the whole point of
    // an angled deck and the one thing a plan view can actually show.
    const land = el('g', { transform: 'translate(0.15,4.25) rotate(-24.6)' });
    // landing centreline, then the four wires across it, then the waist cat
    // running up the starboard side of the box out of everyone's way
    land.appendChild(el('line', { class: 'cv-stripe', x1: 0, y1: -0.4, x2: 0, y2: -8.4 }));
    for (const y of [-0.6, -1.15, -1.7, -2.25])
      land.appendChild(el('line', { class: 'cv-wire', x1: -1.05, y1: y, x2: 1.05, y2: y }));
    land.appendChild(el('line', { class: 'cv-cat', x1: 1.5, y1: -1.5, x2: 1.5, y2: -7.4 }));
    d.appendChild(land);
    // deck-edge elevators: two starboard either side of the island, one port aft
    for (const [x, y] of [[2.0, -4.6], [2.0, 1.3], [-2.8, 2.3]])
      d.appendChild(el('rect', { class: 'cv-elev', x, y, width: 0.9, height: 1.7 }));
    // the air wing: the pack aft of the island, two more spotted on the bow
    for (const [x, y, rot] of [[1.5, 2.5, 40], [1.5, 4.1, 40], [1.5, 5.6, 40],
                               [1.5, -5.0, -25], [1.5, -6.4, -25]]) {
      const p = el('path', { class: 'cv-plane', d: 'M0,-0.75 L0.5,0.3 L0,0.08 L-0.5,0.3 Z' });
      p.setAttribute('transform', `translate(${x},${y}) rotate(${rot})`);
      d.appendChild(p);
    }
    return d;
  }

  // top-down aircraft-carrier silhouette (bow up): hull, angled flight deck,
  // starboard island and a faint centreline. drawn small so at map scale it
  // reads as a single flat-top; the escort screen is added separately.
  function carrierHull(cls) {
    const c = el('g', { class: cls });
    c.appendChild(el('path', { class: 'asset-icon carrier-hull',
      d: 'M0,-8 C1.8,-6.5 2.2,-4.5 2.2,-3 L2.2,6.5 Q2.2,7.8 1,7.8 L-1,7.8 Q-2.2,7.8 -2.2,6.5 L-2.2,-3 C-2.2,-4.5 -1.8,-6.5 0,-8 Z' }));
    // angled flight deck (offset to port, as on a real carrier)
    c.appendChild(el('path', { class: 'carrier-deck', d: 'M-0.8,5 L-4.8,-4 L-2.9,-5 L1.1,3.5 Z' }));
    // deck centreline
    c.appendChild(el('line', { class: 'carrier-line', x1: 0, y1: -6.5, x2: 0, y2: 6.5 }));
    // starboard island superstructure
    c.appendChild(el('rect', { class: 'carrier-island', x: 1.2, y: -2.4, width: 1.4, height: 3.2 }));
    c.appendChild(carrierDeck());
    return c;
  }

  // A hull in plan view, bow up: raked stem, parallel midbody, transom stern.
  // Every ship in the screen is this one drawing at a different length and beam
  // with a different set of fittings on top, which is also roughly how you tell
  // the classes apart from a thousand feet. `blunt` gives the auxiliary her
  // full-bodied merchant bow — she is built to carry fuel, not to make 30 knots.
  function hullPath(len, beam, cls, blunt) {
    const h = len / 2, b = beam / 2, s = blunt ? h * 0.62 : h * 0.5;
    const stem = blunt
      ? `M${-b * 0.55},${-h} L${b * 0.55},${-h} L${b},${-s}`
      : `M0,${-h} L${b},${-s}`;
    return el('path', { class: cls,
      d: `${stem} L${b},${h * 0.8} Q${b},${h} ${b * 0.6},${h} ` +
         `L${-b * 0.6},${h} Q${-b},${h} ${-b},${h * 0.8} L${-b},${-s} Z` });
  }

  // The screen, by class. Lengths are the real ones scaled off the carrier and
  // then pulled in: a Burke is 155m against a Nimitz's 333m, a Ticonderoga 173m,
  // and the fast combat support ship is longer than either of them — which looks
  // like a drawing error until you remember she is a tanker with guns' worth of
  // freeboard. Drawn to true ratio the escorts crowd the flat-top at the spacing
  // the screen is plotted at, so everything here is about 60% of scale.
  const ESCORT_CLASSES = {
    cg:  { len: 7.4, beam: 1.9, tag: 'CG' },    // AAW commander, two deckhouses
    ddg: { len: 6.6, beam: 1.7, tag: 'DDG' },   // Arleigh Burke — the workhorse
    ao:  { len: 7.8, beam: 2.3, tag: 'T-AO', blunt: true },  // the oiler
  };

  function escortShip(kind) {
    const c = ESCORT_CLASSES[kind];
    const g = el('g', { class: `escort escort-${kind}` });
    g.appendChild(hullPath(c.len, c.beam, 'asset-icon escort-ship', c.blunt));
    const h = c.len / 2, d = el('g', { class: 'cv-detail' });
    const box = (cls, x, y, w, ht) => d.appendChild(el('rect', { class: cls, x, y, width: w, height: ht }));
    if (kind === 'ao') {
      // An auxiliary wears her house right aft over the machinery and gives the
      // whole middle of the ship to cargo. The two bars across that deck are the
      // replenishment rigs, and they are what tells her from a warship at a
      // glance: they stand athwartships, because the whole job is passing fuel
      // sideways to something steaming a hundred feet away.
      box('escort-deck', -0.8, -h * 0.6, 1.6, h * 0.95);
      for (const y of [-h * 0.34, h * 0.04]) box('escort-rig', -0.95, y, 1.9, 0.26);
      box('escort-house', -0.65, h * 0.44, 1.3, h * 0.38);
    } else {
      box('escort-vls', -0.55, -h * 0.62, 1.1, h * 0.2);   // forward VLS
      box('escort-house', -0.6, -h * 0.3, 1.2, h * 0.5);   // bridge / deckhouse
      if (kind === 'cg') box('escort-house', -0.5, h * 0.26, 1.0, h * 0.24); // after house
      box('escort-vls', -0.5, h * 0.06, 1.0, h * 0.16);    // after VLS
      box('escort-deck', -0.55, h * 0.55, 1.1, h * 0.3);   // flight deck aft
    }
    g.appendChild(d);
    return g;
  }

  // the strike group: the carrier plus her screen, hidden until the map is
  // zoomed way in (toggled via .map-deep-zoom / .map-close-zoom on the svg).
  // The stationing is the textbook one — the cruiser up-threat ahead as the air
  // defence commander, destroyers on the bows and the port quarter, and the
  // oiler tucked astern inside everything else, because she is what the screen
  // is partly there to protect.
  function carrierGroup() {
    const grp = el('g', { class: 'carrier-strike-group' });
    const screen = el('g', { class: 'strike-group' });
    const escorts = [
      { kind: 'cg',  dx: 0,   dy: -18, rot: 0 },     // vanguard
      { kind: 'ddg', dx: -13, dy: -8,  rot: -22 },   // port bow
      { kind: 'ddg', dx: 13,  dy: -6,  rot: 20 },    // starboard bow
      { kind: 'ddg', dx: -14, dy: 8,   rot: -158 },  // port quarter
      { kind: 'ao',  dx: 12,  dy: 12,  rot: 168 },   // oiler astern
    ];
    for (const e of escorts) {
      const slot = el('g', { transform: `translate(${e.dx},${e.dy})` });
      const s = escortShip(e.kind);
      s.setAttribute('transform', `rotate(${e.rot})`);
      slot.appendChild(s);
      // The tag rides in the UNROTATED slot so it reads upright on whatever
      // heading the ship is on, and ABOVE her without exception: the two ships
      // in the after screen are stationed either side of the carrier's own name,
      // and a tag under those two lands on top of it.
      const tag = el('text', { class: 'escort-tag cv-detail',
        y: -(ESCORT_CLASSES[e.kind].len / 2 + 1.4) });
      tag.textContent = ESCORT_CLASSES[e.kind].tag;
      slot.appendChild(tag);
      screen.appendChild(slot);
    }
    grp.appendChild(screen);
    grp.appendChild(carrierHull('carrier-body'));
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
      icon = carrierGroup();
    } else if (a.kind === 'bomber') {
      icon = el('path', { class: 'asset-icon', d: 'M0,-4 L8,3 L2,2 L0,5 L-2,2 L-8,3 Z' });
    } else if (a.kind === 'logistics') {
      icon = el('path', { class: 'asset-icon', d: 'M-4.5,-4.5 L4.5,-4.5 L4.5,4.5 L-4.5,4.5 Z M-4.5,-1 L4.5,-1 L4.5,1 L-4.5,1 Z' });
    } else if (a.kind === 'naval') {
      icon = el('path', { class: 'asset-icon', d: 'M0,-5.5 L4.5,0 L0,5.5 L-4.5,0 Z' });
    } else if (a.kind === 'submarine') {
      icon = submarineIcon();
    } else {
      icon = el('path', { class: 'asset-icon', d: 'M-5,4 L0,-5 L5,4 Z M-7,4 L7,4 L7,5.5 L-7,5.5 Z' });
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

    // water backdrop
    world.appendChild(el('rect', { x: -2000, y: -2000, width: 5000, height: 5000, fill: 'var(--water)' }));

    // countries (real borders; the Caspian shows as water between them)
    //
    // Each path carries its own name in a data attribute so the Gulf council can
    // be READ off the plot. That is most of why the two camps are worth building:
    // "Doha and Riyadh have gone amber and Kuwait has gone blue" is a glance, and
    // the same fact in the sidebar is two gauges and a roster the player has to
    // open a panel to reach.
    for (const c of COUNTRY_PATHS) {
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

    measureWorld();   // the crop the view is not allowed to escape
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
  // is that crop rect, and the view is clamped to stay inside it.
  //
  // It is measured off the geometry at render time rather than written down as
  // a constant, because the one thing that would silently break a hardcoded
  // rect is the thing most likely to happen to it — someone extending a country
  // path in geodata.js. The literal below is only the fallback for a browser
  // that hands back an empty bbox.
  let WORLD = { x0: -350, y0: -472, x1: 1450, y1: 1303 };
  const MAX_ZOOM = 10;

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

  // the widest the frame can open before it is showing more than the world has
  function minZoom(vis) {
    return Math.max(vis.w / (WORLD.x1 - WORLD.x0), vis.h / (WORLD.y1 - WORLD.y0));
  }

  // Pull the view back inside the crop. Applied at the single choke point every
  // gesture goes through, so wheel, drag, pinch, the buttons and reset are all
  // covered by one rule. Note it clamps `view` and not the gesture's anchor:
  // a drag that runs into the edge and comes back tracks the cursor again from
  // where it left, rather than sliding by however far it was held past the stop.
  function clampView() {
    const vis = visibleBox();
    view.k = Math.min(MAX_ZOOM, Math.max(minZoom(vis), view.k));
    // translate range that keeps the visible rect inside the crop — guaranteed
    // non-empty by the floor just applied to k
    const lox = vis.x + vis.w - view.k * WORLD.x1, hix = vis.x - view.k * WORLD.x0;
    const loy = vis.y + vis.h - view.k * WORLD.y1, hiy = vis.y - view.k * WORLD.y0;
    view.x = Math.min(Math.max(view.x, lox), hix);
    view.y = Math.min(Math.max(view.y, loy), hiy);
  }

  function applyView() {
    clampView();
    world.setAttribute('transform', `translate(${view.x},${view.y}) scale(${view.k})`);
    // reveal each carrier's escort screen once zoomed in, and the individual
    // hull classes and deck fittings one step past that (see carrierGroup for
    // why these two numbers are as low as they are)
    svg.classList.toggle('map-deep-zoom', view.k >= 1.6);
    svg.classList.toggle('map-close-zoom', view.k >= 2.2);
    // small/touch screens hide the site names until the chart is open enough
    // for them not to overlap — see .map-far-zoom in the stylesheet
    svg.classList.toggle('map-far-zoom', view.k < 1.7);
    // the touch discs and the drawn icons are both sized in screen pixels, so
    // they are re-derived here: this is the one choke point every gesture
    // already goes through
    syncHitDiscs();
    syncIconScale();
    syncSouthCue();
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

  function fsClose(entry, delay) {
    setTimeout(() => {
      entry._alive = false;
      stopMissionMusic(entry);
      entry.remove();
      fsSync();
    }, delay || 0);
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
  function scopeCard(header) {
    const { scope } = fsStacks();
    const entry = document.createElement('div');
    entry._alive = true;
    entry.className = 'flight-entry scope-card';
    entry.innerHTML =
      `<div class="fs-head">${header}</div>` +
      `<div class="scope-wrap"></div>` +
      `<div class="fs-lines"></div>` +
      `<div class="progress-row"><span class="progress-phase">STANDING BY</span>` +
      `<span class="progress-pct">0%</span></div>` +
      `<div class="progress-bar"><div class="progress-fill"></div></div>`;
    scope.appendChild(entry);
    fsPanel().classList.remove('hidden');
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
    const fromGroup = (Math.random() < 0.5 && carriersOnStation()) ? 'carrier' : 'land';
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

    const headHeader = N > 1
      ? `${callsign} FLIGHT (×${N}) · ${ft.type} — ${baseName} → ${target.short}`
      : `${callsign} · ${ft.type} — ${baseName} → ${target.short}`;
    const entry = scopeCard(headHeader);
    entry.dataset.tgt = target.id;   // lets playStrikeHit() find this live scope
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
        if (e.kind === 'problem' && Math.random() > e.chance) continue;
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
    let sweepDeg = Math.random() * 360;
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
      const off = (Math.random() - 0.5) * 1.1;
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
          (Math.min(1, p * 3) * (0.55 + Math.random() * 0.45)).toFixed(2));
      }

      if (view.sweep) {
        sweepDeg = (sweepDeg + (dt / revMs) * 360) % 360;
        view.sweep.setAttribute('transform', `rotate(${sweepDeg.toFixed(1)},${C},${C})`);
        // degraded coverage flickers
        if (adw < 2 && Math.random() < 0.02) view.sweep.setAttribute('opacity', 0.25 + Math.random() * 0.75);

        // PAINT: is the beam's leading edge on the inbound right now?
        let diff = Math.abs(((sweepDeg - bearingDeg + 540) % 360) - 180);
        diff = 180 - diff;
        const inBeam = diff < SC.LOCK_ARC && r < SC.RING + 4;
        const allowed = !stealth || p > 0.72; // stealth is only ever seen late
        if (inBeam && allowed && Math.random() < paintOdds) {
          // paint whichever silhouette the beam happens to be sweeping across
          const idx = Math.floor(Math.random() * acs.length);
          const paintPos = acs[idx].pos;
          lock.setAttribute('transform', `translate(${paintPos.x.toFixed(2)},${paintPos.y.toFixed(2)})`);
          lock.setAttribute('opacity', 1);
          if (view.ring) view.ring.classList.add('painting');
          if (!painted && Math.random() < samChance) launchSAM();
          painted = true;
        } else if (painted) {
          lock.setAttribute('opacity', 0);
          if (view.ring) view.ring.classList.remove('painting');
          painted = false;
        }
      }

      fireUpTo(p);
      // cruise runs carry no threat styling — nothing is shooting at a TLAM
      setProgress(entry, p, phaseFor(p, cruise), !cruise && p >= 0.42 && p < 0.86 && adw > 0);

      if (p < 1) { requestAnimationFrame(frame); return; }
      impact();
    }

    function impact() {
      // deregistering is also the once-guard: the run reaches weapons away one
      // time, whether it got there by flying or by being skipped
      if (!skipEnders.delete(forceImpact)) return;
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
  function animateStrike(assetType, target, done, count, pkg) {
    let called = false;
    const once = () => { if (called) return; called = true; if (done) done(); };
    // skipped: the package still flies and still resolves, it just never draws
    if (ff) { once(); return; }
    try {
      // the submarine attack is not flown, it is fired — its own display
      if (pkg && pkg.sub) animateSonar(target, once);
      else animateScope(assetType, target, once, count, pkg);
    } catch (e) {
      // a broken animation must never hold up the war
      console.error('scope animation failed', e);
      once();
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
  }

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
      return draw[Math.floor(Math.random() * draw.length)];
    }
    return own || 'video/strike-hit.mp4';
  }

  // Called by game.js only when BDA confirms a successful hit (destroyed/damaged).
  // Plays in the same window as the radar, then fades out to reveal the BDA state.
  // `killed` is the batch's verdict, not the package's — two sorties arrive as one
  // formation and the second one is often what finishes the site.
  function playStrikeHit(target, pkg, killed) {
    const entry = [...document.querySelectorAll('.scope-card')]
      .find(e => e._alive && e.dataset.tgt === target.id);
    if (entry) overlayScopeClip(entry.querySelector('.scope-wrap'), hitClip(target, pkg, killed),
      () => stopMissionMusic(entry));   // chatter cuts when the strike video ends
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
  const TORP_RANGE = () => 9200 + Math.round(Math.random() * 4200);

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
    const entry = scopeCard(`${callsign} · Mk-48 ADCAP — ${baseName} → ${target.short}`);
    entry.dataset.tgt = target.id;          // lets playStrikeHit() find this scope
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
    const cm = Math.random() < 0.45;
    const cmSide = Math.random() < 0.5 ? 1 : -1;
    let cmDropped = false, decoy = null;

    const subs = { '{cs}': callsign, '{base}': baseName, '{tgt}': target.short };
    const fill = (s) => s.replace(/\{cs\}|\{base\}|\{tgt\}/g, (m) => subs[m]);
    const evs = SUB_EVENTS.slice().sort((a, b) => a.at - b.at);
    let evIdx = 0;
    const fireUpTo = (prog) => {
      while (evIdx < evs.length && evs[evIdx].at <= prog) {
        const e = evs[evIdx++];
        if (e.kind === 'problem' && Math.random() > e.chance) continue;
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
      btrDrift += (Math.random() - 0.5) * 0.06;
      btrDrift = Math.max(-1.4, Math.min(1.4, btrDrift));
      const row = new Array(BTR.cols);
      for (let c = 0; c < BTR.cols; c++) row[c] = Math.random() * 0.16;
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
      const h = { id, g, rotor, x, y, hdg: 0, spin: Math.random() * 360, power: 1, down: false };
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
          const x = 66 + Math.random() * 68, y = 76 + Math.random() * 56;
          scopeBurst(fx, x, y, 'raid-muzzle', 4);
          setTimeout(pop, 120 + Math.random() * 220);
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
      const h = { id, g, rotor, x, y, hdg: 0, spin: Math.random() * 360, power: 1, down: false };
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
        const interceptAt = Math.random() < 0.35 ? 0.78 + Math.random() * 0.12 : 2;
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
        const wob = 2.5 + Math.random() * 2.5, wf = 4 + Math.random() * 4;
        const interceptAt = Math.random() < 0.3 ? 0.6 + Math.random() * 0.3 : 2;
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
    setTargetClickHandler, setFastForward, syncSouthCue, focusSouth,
    setCarrierPosture, setCarrierIngress, setAssetActive, raidOpen,
    csarOpen, setSurvivor };
})();
