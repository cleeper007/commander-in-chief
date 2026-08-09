// ============================================================
// aircrew.js — the squadron: who is flying, and how many times
// ============================================================
// csar.js invented a downed crew at the moment it was lost: a callsign minted
// inside `aircraftDown`, two anonymous names on a casualty line, and nothing
// before or after. That produces a better obituary and nothing else. What
// makes a loss land is not the obituary — it is having watched a sortie count
// climb on somebody the president has already seen on three tasking orders.
//
// So the roster is not a data model with a display bolted on. The display IS
// the mechanism, and the data model exists to feed it: thirteen aviators,
// created at kickoff, drawn onto every package that flies, and READ IN THE
// SIDEBAR BEFORE ANYTHING GOES WRONG. By the time csar.js needs a name it is
// asking for one the player already knows.
//
// THIS SUBSYSTEM DOES NOT SIMULATE.
// It never gates a sortie, never shrinks a magazine, never touches approval and
// never appears in a grade row. A squadron with four aviators in Iranian custody
// flies exactly the same night as one with none — what has changed is what the
// player is looking at while they order it. That is deliberate: the war's
// balance is a closed, measured system (see .claude/betatest/grade.js) and this
// is a lens onto it, not another term in it. The one thing it consumes is a
// handful of Math.random() calls at kickoff to shuffle the roster, which is why
// a seeded campaign replays differently against this build than the one before.
//
// ASSIGNMENT IS DETERMINISTIC — fewest sorties first, ties by roster order.
// Two reasons. It spreads the count so every name on the panel is climbing
// rather than one hero and twelve spectators; and it keeps the hot path (every
// package, every night) out of the RNG stream entirely, so the only randomness
// this file adds to a campaign is the one shuffle at kickoff.

const Aircrew = (() => {
  const pick = (a) => a[Math.floor(Math.random() * a.length)];

  // Nights off the flight schedule after a recovery. Display only — a
  // recovering aviator is simply not drawn onto tonight's packages, and the
  // packages fly regardless (see the note above).
  const REST = 2;

  // ---- what they fly ----
  // `seats` is 1 or 2 and never more, and that is a constraint of csar.js
  // rather than of aviation: the recovery set piece — the panel, the survivor
  // markers on the plot, the partial-recovery branch that gets one of them out
  // and not the other — is built around one aviator or a pair, and has been
  // since v5. So the roster names the two crew stations a recovery situation
  // can be built around. A B-1 carries four; the two behind the front seats are
  // not tracked here and no line of prose claims they are.
  const AIRFRAMES = {
    f35: [
      { air: 'F-35A Lightning II', short: 'F-35A', seats: 1, flight: 'PANTHER' },
      { air: 'F-35C Lightning II', short: 'F-35C', seats: 1, flight: 'WARHAWK' },
    ],
    // the fourth-generation force, and the only tier where the seat count is a
    // coin flip — which is what makes the partial recovery reachable at all
    fighter: [
      { air: 'F-15E Strike Eagle', short: 'F-15E', seats: 2, flight: 'DUDE' },
      { air: 'F/A-18F Super Hornet', short: 'F/A-18F', seats: 2, flight: 'GUNSLINGER' },
      { air: 'F/A-18E Super Hornet', short: 'F/A-18E', seats: 1, flight: 'RHINO' },
      { air: 'F-16C Fighting Falcon', short: 'F-16C', seats: 1, flight: 'VIPER' },
    ],
    heavy: [
      { air: 'B-1B Lancer', short: 'B-1B', seats: 2, flight: 'BONE' },
      { air: 'B-52H Stratofortress', short: 'B-52H', seats: 2, flight: 'BUFF' },
    ],
    stealth: [
      { air: 'B-2A Spirit', short: 'B-2A', seats: 2, flight: 'SPIRIT' },
    ],
  };

  // How many aviators sit behind each tier. A ROSTER ENTRY IS A SEAT, not an
  // aircraft: a two-seat airframe is crewed by two entries who are generated as
  // a pair, fly as a pair and are lost as a pair. That costs a few more names
  // than the alternative and it buys the best scene csar.js has — the partial
  // recovery, where one of two people the player knows by name comes home and
  // the other is on Iranian television by morning. With one entry per aircraft
  // that branch has nobody in the back seat to leave behind.
  //
  // Sized against the packages each tier actually flies (see TARGETS in
  // data.js — f35 in twos, fighters in twos and threes, heavies in twos, the
  // B-2 alone) with enough slack that one bad night does not leave a tier with
  // nobody to name. Fourteen total: big enough to read as a squadron, small
  // enough that the player knows every name by the second week.
  const ESTABLISHMENT = { f35: 3, fighter: 5, heavy: 4, stealth: 2 };

  // Surnames only. No first names and no pronouns anywhere in this file: these
  // are people the game has established nothing about beyond a rank, a callsign
  // and a sortie count, and it has no business inventing the rest.
  const SURNAMES = [
    'Aguilar', 'Barrett', 'Castellano', 'Delgado', 'Ellsworth', 'Fontaine',
    'Gallagher', 'Hollis', 'Iwasaki', 'Jarrett', 'Kowalski', 'Lindqvist',
    'Moreau', 'Nakamura', 'Oyelaran', 'Pruitt', 'Quintero', 'Rasmussen',
    'Sandoval', 'Tremblay', 'Ueda', 'Vandermeer', 'Whitaker', 'Xiong',
    'Yarborough', 'Zamora', 'Beaumont', 'Devereaux', 'Falconer', 'Marchetti',
  ];

  // Personal callsigns, which is a different thing from the flight callsign the
  // aircraft checks in under — DUDE 61 is the jet, TOLLBOOTH is the person
  // flying it. Real ones are earned by embarrassment and it shows.
  const CALLSIGNS = [
    'SLAPSHOT', 'TUNA', 'GRINDER', 'BOOMER', 'HATCHET', 'PAPERCUT', 'SPUD',
    'CHAINSAW', 'MUDFLAP', 'GUMBO', 'TWITCH', 'KODIAK', 'BRISKET', 'WOMBAT',
    'SNAPPER', 'TRIPOD', 'DIESEL', 'BUCKSHOT', 'LOWBOY', 'PONCHO', 'CINDER',
    'HAYWIRE', 'TOLLBOOTH', 'GRAVEL', 'SHRIMP', 'MOOSE', 'KETTLE', 'FOSSIL',
    'JUNKYARD', 'RHUBARB',
  ];

  // Heavies are commanded by field-grade officers and fighters mostly are not,
  // which is the only reason this varies by tier.
  const RANKS = {
    f35: ['Capt.', 'Capt.', 'Maj.'],
    fighter: ['Capt.', 'Capt.', 'Maj.', 'Lt Col.'],
    heavy: ['Maj.', 'Lt Col.'],
    stealth: ['Maj.', 'Lt Col.'],
  };

  const STATUS = {
    active:     { label: 'ON STATUS',  cls: 'ac-active' },
    recovering: { label: 'RECOVERING', cls: 'ac-rest' },
    mia:        { label: 'DOWN — EVADING', cls: 'ac-mia' },
    pow:        { label: 'IRGC CUSTODY', cls: 'ac-pow' },
    kia:        { label: 'KILLED', cls: 'ac-kia' },
  };

  // ============================================================
  // THE ROSTER
  // ============================================================
  // Rolled once, at kickoff, and never again. TARGETS-style leakage is not a
  // risk here because the array lives on `G` rather than at module scope — but
  // it still has to be rebuilt in newWar, or a restored campaign and a fresh
  // one would share a squadron.
  function newRoster() {
    const names = SURNAMES.slice();
    const signs = CALLSIGNS.slice();
    // Fisher-Yates over both pools, so no name or callsign repeats inside a
    // campaign and no two campaigns open with the same squadron.
    for (const pool of [names, signs]) {
      for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
      }
    }

    const roster = [];
    let n = 0;
    for (const plat of ['f35', 'fighter', 'heavy', 'stealth']) {
      let left = ESTABLISHMENT[plat];
      // Airframes are dealt a WHOLE CREW AT A TIME, so the two people in a
      // two-seat jet are always qualified in the same jet. Dealing seat by seat
      // put a B-1B pilot in the back of a B-52 — which the squadron probe found
      // on its first run, in prose, in the report the player reads.
      while (left > 0) {
        const fits = AIRFRAMES[plat].filter((a) => a.seats <= left);
        const af = pick(fits.length ? fits : AIRFRAMES[plat]);
        const seats = Math.min(af.seats, left);
        for (let s = 0; s < seats; s++) {
          roster.push({
            id: 'ac' + (++n),
            name: pick(RANKS[plat]) + ' ' + names.pop(),
            cs: signs.pop(),
            plat,                     // the AIR_ASSETS key, so `pkg.asset` indexes it directly
            air: af.air, short: af.short, seats: af.seats, flight: af.flight,
            // which seat, which decides who the partial-recovery branch brings
            // home — the front seater gets to the pickup point, and that is not
            // arbitrary, it is the aircraft commander's job
            seat: s === 0 ? 'pilot' : 'wso',
            sorties: 0,
            status: 'active',
            since: 0,                 // the turn the current status was stamped
          });
        }
        left -= seats;
      }
    }
    return roster;
  }

  // Defensive rebuild. The roster is created in newWar and persisted on FIELDS,
  // so the only way to arrive here without one is a code path that reaches the
  // board without a kickoff — the balance harness, a half-restored save. Never
  // silently returns an empty list, because every reader of this module assumes
  // the squadron exists.
  function ensure(G) {
    if (!Array.isArray(G.aircrew) || !G.aircrew.length) G.aircrew = newRoster();
    return G.aircrew;
  }

  const byId = (G, id) => ensure(G).find((a) => a.id === id) || null;
  const roster = (G) => ensure(G);

  // "Capt. Sandoval “TWITCH”" — the form used everywhere a person is named.
  const label = (a) => a ? `${a.name} “${a.cs}”` : 'an unidentified aviator';
  // and the short form, for a line that already carries the airframe
  const shortLabel = (a) => a ? a.cs : 'UNKNOWN';

  // A list of aviators, written out. Goes through the same rules as any other
  // counted prose in the game (see js/text.js) — nothing here open-codes an "s".
  function names(list) {
    const l = list.filter(Boolean).map(label);
    if (!l.length) return 'the crew';
    if (l.length === 1) return l[0];
    return l.slice(0, -1).join(', ') + ' and ' + l[l.length - 1];
  }

  // ============================================================
  // WHO FLIES TONIGHT
  // ============================================================
  // Fewest sorties first, ties by roster order — see the header. An aviator may
  // be drawn onto a second package the same night once everyone else in the
  // tier is a sortie ahead of them, which is what a 12-hour turn at surge tempo
  // actually looks like; they are never drawn twice into the SAME package.
  function available(G, plat) {
    return ensure(G)
      .map((a, i) => ({ a, i }))
      .filter(({ a }) => a.plat === plat && a.status === 'active')
      .sort((x, y) => (x.a.sorties - y.a.sorties) || (x.i - y.i))
      .map(({ a }) => a);
  }

  // Draw the crew for a package about to be fragged and charge them the sortie.
  // Manned JET BY JET — `pkg.qty` is aircraft, and a two-seat aircraft takes two
  // people off the roster — so the flat id list this returns is longer than the
  // package for the tiers that fly in pairs. It is emitted in aircraft order,
  // which is what `crews()` below reads it back as.
  //
  // A tier with fewer aviators left than the package has aircraft returns a
  // short list rather than refusing: the package still flies (this subsystem
  // does not simulate), and a formation with more jets in it than named crew is
  // the honest reading of a squadron that has been shot up.
  function frag(G, pkg) {
    if (!pkg || pkg.sub || pkg.asset === 'cruise') return [];   // nobody is aboard a Tomahawk
    const pool = available(G, pkg.asset);
    if (!pool.length) return [];
    const used = new Set();
    const ids = [];
    for (let jet = 0; jet < Math.max(1, pkg.qty || 1); jet++) {
      const lead = pool.find((a) => !used.has(a.id));
      if (!lead) break;
      used.add(lead.id); ids.push(lead.id);
      // the other seat of the same type. Not merely the same tier: an F-15E
      // back seat is not a slot a Hornet crew can fill.
      if (lead.seats === 2) {
        const mate = pool.find((a) => !used.has(a.id) && a.air === lead.air && a.seat !== lead.seat);
        if (mate) { used.add(mate.id); ids.push(mate.id); }
      }
    }
    for (const id of ids) { const a = byId(G, id); if (a) a.sorties++; }
    return ids;
  }

  // The flat list read back as aircraft. `frag` emits seats in jet order, so a
  // two-seat entry consumes the id behind it — which is why nothing may reorder
  // `mission.crew` between the frag and the shootdown.
  function crews(G, ids) {
    const out = [];
    const list = (ids || []).map((id) => byId(G, id)).filter(Boolean);
    for (let i = 0; i < list.length; ) {
      const lead = list[i];
      // same type AND the other seat. Both halves matter: with every F-15E back
      // seater in Iranian custody `frag` sends two front seaters as two single
      // jets, and matching on type alone would read them back as one crew.
      const next = list[i + 1];
      const n = (lead.seats === 2 && next && next.air === lead.air && next.seat !== lead.seat) ? 2 : 1;
      // pilot first, so the prose and the partial-recovery branch agree about
      // which of the two is in the front seat
      out.push(list.slice(i, i + n).sort((a, b) => (a.seat === 'pilot' ? 0 : 1) - (b.seat === 'pilot' ? 0 : 1)));
      i += n;
    }
    return out;
  }

  // ...and struck off it again. The mirror of `frag`, called by recallMission
  // for exactly the same reason everything else that package booked comes back:
  // it never launched, so nobody flew it.
  function unfrag(G, ids) {
    for (const id of ids || []) {
      const a = byId(G, id);
      if (a) a.sorties = Math.max(0, a.sorties - 1);
    }
  }

  // ============================================================
  // WHAT HAPPENED TO THEM
  // ============================================================
  // The aircraft that was lost, and who was in it. Called by csar.js instead of
  // its old `pickAirframe` — the airframe is now a fact about a person on the
  // roster rather than a fresh weighted roll, so the jet that goes down is one
  // the player watched get fragged.
  //
  // Returns null when the package had no named crew at all (a Tomahawk salvo, a
  // squadron with nothing left on status); csar.js falls back to its own
  // anonymous line, which is the correct behaviour for a war that has run out
  // of people to name.
  function crewLost(G, mission) {
    // whole aircraft, so the two people who go down together were in the same
    // cockpit rather than merely on the same tasking order
    const formation = crews(G, mission && mission.crew)
      .filter((jet) => jet.every((a) => a.status === 'active'));
    if (!formation.length) return null;

    // which jet in the formation took it — the one roll this path makes, and it
    // replaces the `pickAirframe` roll it removed
    const aboard = pick(formation);
    const lead = aboard[0];
    return {
      aboard,
      air: lead.air, short: lead.short, flight: lead.flight,
      crew: aboard.length,
    };
  }

  // One place stamps status, so `since` can never drift from it.
  function setStatus(G, list, status, turn) {
    for (const a of (list || [])) {
      if (!a) continue;
      a.status = status;
      a.since = turn || 0;
    }
  }

  // A recovered aviator goes back on the schedule after REST turns. No RNG, no
  // event, nothing reported — it is the panel quietly filling back in, which is
  // the only good news this subsystem ever delivers.
  function turnTick(G) {
    for (const a of ensure(G)) {
      if (a.status === 'recovering' && G.turn - a.since >= REST) {
        a.status = 'active';
        a.since = G.turn;
      }
    }
  }

  // ============================================================
  // THE READOUT
  // ============================================================
  // Tonight's packages, grouped the way the SCRUB panel groups them, because
  // the split is the same fact: a package fragged this turn is a document and a
  // package fragged last night is airborne. Both are "who is up there" — but a
  // player looking at a name is owed the difference between one they can still
  // strike off the order and one that is nine hours into the Indian Ocean.
  function tonight(G) {
    const order = [], airborne = [];
    for (const m of (G.missions || [])) {
      const formation = crews(G, m.crew);
      if (!formation.length) continue;
      const t = TARGETS.find((x) => x.id === m.targetId);
      const crew = formation.reduce((l, jet) => l.concat(jet), []);
      (m.turn === G.turn ? order : airborne).push({
        crew, jets: formation.length,
        target: t ? t.short : m.targetId,
        flight: formation[0][0].flight,
      });
    }
    return { order, airborne };
  }

  // Everyone the war has taken off the schedule, in the order it took them.
  const lost = (G) => ensure(G).filter((a) => a.status !== 'active' && a.status !== 'recovering');
  const onStatus = (G) => ensure(G).filter((a) => a.status === 'active');

  function crewRow(a, flying) {
    const s = STATUS[a.status] || STATUS.active;
    return `<div class="ac-row${flying ? ' ac-flying' : ''}">` +
      `<span class="ac-cs">${a.cs}</span>` +
      `<span class="ac-name">${a.name}</span>` +
      `<span class="ac-air">${a.short}</span>` +
      `<span class="ac-sorties ${s.cls}">${a.sorties}</span>` +
    `</div>`;
  }

  function renderPanel(G) {
    const panel = document.getElementById('squadron-panel');
    if (!panel) return;
    const list = ensure(G);
    const meta = document.getElementById('squadron-status');
    const box = document.getElementById('squadron-list');
    if (!box) return;

    const up = onStatus(G).length;
    const gone = lost(G);
    if (meta) {
      // The head reads while the panel is shut, so it carries the one number
      // that changes the player's night: how many are still on the schedule,
      // and — only once it is true — how many are not.
      meta.textContent = gone.length
        ? `${up} on status · ${gone.length} lost`
        : `${up} on status`;
      meta.style.color = gone.length ? 'var(--amber)' : '';
    }

    const { order, airborne } = tonight(G);
    const flying = new Set();
    for (const g of order.concat(airborne)) for (const a of g.crew) flying.add(a.id);

    let html = '';
    const block = (title, groups) => {
      if (!groups.length) return '';
      let h = `<div class="ac-head">${title}</div>`;
      for (const g of groups) {
        h += `<div class="ac-pkg"><div class="ac-pkg-head">${g.flight} · ` +
          `${Txt.plural(g.jets, 'aircraft')} — ${g.target}</div>` +
          g.crew.map((a) => crewRow(a, true)).join('') + `</div>`;
      }
      return h;
    };
    html += block("ON TONIGHT'S ORDER", order);
    html += block('AIRBORNE NOW', airborne);
    if (!order.length && !airborne.length) {
      html += `<div class="dim ac-quiet">Nothing fragged. The squadron is on the ramp.</div>`;
    }

    // The full roster underneath, so the sortie counts are readable as a column
    // rather than only in whatever tonight happens to have tasked.
    html += `<div class="ac-head">SQUADRON — ${Txt.plural(list.length, 'aviator')}</div>`;
    html += `<div class="ac-legend"><span>CALLSIGN</span><span>NAME</span><span>TYPE</span><span>SORTIES</span></div>`;
    for (const a of list) {
      if (a.status === 'active') { html += crewRow(a, flying.has(a.id)); continue; }
      const s = STATUS[a.status] || STATUS.active;
      html += `<div class="ac-row ac-out">` +
        `<span class="ac-cs">${a.cs}</span>` +
        `<span class="ac-name">${a.name}</span>` +
        `<span class="ac-air ${s.cls}">${s.label}</span>` +
        `<span class="ac-sorties ${s.cls}">${a.sorties}</span>` +
      `</div>`;
    }
    box.innerHTML = html;
  }

  // ============================================================
  // THE AFTER-ACTION ROSTER
  // ============================================================
  // Display only, and deliberately below the grade rather than inside it: the
  // war grade is a closed system measured over 1,440 campaigns (see WAR_GRADE
  // in data.js) and PERSONNEL RECOVERY already scores what happened to aircrew.
  // What this adds is the part a score cannot carry — which name it was, and
  // how many nights they had flown before it.
  function endgameHtml(list) {
    if (!Array.isArray(list) || !list.length) return '';
    const flown = list.reduce((n, a) => n + a.sorties, 0);
    const gone = list.filter((a) => a.status === 'pow' || a.status === 'kia' || a.status === 'mia');
    let h = '<div class="end-section">THE SQUADRON</div>';
    h += `<p class="dim end-squadron-note">${Txt.plural(list.length, 'aviator')} on the roster, ` +
      `${Txt.plural(flown, 'sortie')} flown` +
      (gone.length ? `, and ${Txt.plural(gone.length, 'name')} that did not come off it.` : ', and everyone came home.') +
      `</p>`;
    h += '<table class="squadron-table"><tr><th>CALLSIGN</th><th>NAME</th><th>TYPE</th>' +
      '<th>SORTIES</th><th>STATUS</th></tr>';
    // the ones the war took first, then the rest by how hard they were worked
    const order = list.slice().sort((a, b) => {
      const rank = (x) => x.status === 'kia' ? 0 : x.status === 'pow' ? 1 : x.status === 'mia' ? 2 : 3;
      return (rank(a) - rank(b)) || (b.sorties - a.sorties);
    });
    for (const a of order) {
      const s = STATUS[a.status] || STATUS.active;
      h += `<tr class="${s.cls}"><td>${a.cs}</td><td>${a.name}</td><td>${a.short}</td>` +
        `<td>${a.sorties}</td><td>${s.label}</td></tr>`;
    }
    h += '</table>';
    return h;
  }

  return {
    newRoster, ensure, roster, byId, label, shortLabel, names,
    frag, unfrag, crews, crewLost, setStatus, turnTick,
    tonight, onStatus, lost, renderPanel, endgameHtml,
    REST,
  };
})();
