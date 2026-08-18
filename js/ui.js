// ============================================================
// ui.js — HUD, sidebar, modals, ticker rendering
// ============================================================

const UI = (() => {
  const $ = (id) => document.getElementById(id);

  // Counted nouns and signed numbers live in text.js, where ai.js and csar.js
  // can reach them too. Pulled into locals here so the ~30 call sites below read
  // the way they always did.
  const { plural, pluralize, turns, signed, MINUS } = Txt;

  let selectedPkg = null;
  let currentTarget = null;

  // ============================================================
  // COLLAPSIBLE SIDEBAR PANELS
  // ------------------------------------------------------------
  // The sidebar is eight sections deep and only one of them is ever the one
  // being used. Each is a dropdown: the header is the hit target and the caret
  // turns. A shut section is not silent: its badge carries the one thing worth
  // knowing from the outside, which for an action panel is how many orders in
  // it can actually be given tonight.
  //
  // Open/shut state is deliberately NOT persisted. It used to survive a reload,
  // which meant a war opened with whatever assortment of sections happened to
  // be open when the last one was left — a sidebar the player did not arrange,
  // scrolled past the fold before the first order. The sections are cheap to
  // open and the badges say what is inside them, so every war and every turn
  // starts from the same shut sidebar. See closeAllPanels.
  // ============================================================
  function setPanelOpen(panel, open) {
    panel.classList.toggle('collapsed', !open);
    panel.querySelector('.panel-head').setAttribute('aria-expanded', String(open));
  }

  // Called at the start of a war and at the top of every turn: the sidebar is
  // reset to shut so the player opens what tonight's decision actually needs.
  function closeAllPanels() {
    for (const panel of document.querySelectorAll('#sidebar-scroll .panel[data-panel]')) {
      setPanelOpen(panel, false);
    }
    const scroll = $('sidebar-scroll');
    if (scroll) scroll.scrollTop = 0;
    // On a phone "shut" is not a state the deck has — there is always exactly
    // one tab showing. The equivalent reset is to send the rail back to where
    // every turn should start, which is tonight's decision.
    selectRail(defaultRail());
  }

  // ============================================================
  // THE SECTION RAIL — phones and small windows
  // ------------------------------------------------------------
  // Eleven sections in a scroll pane that is ~250px tall on a landscape phone.
  // Collapsed, the list of heads is already taller than the pane; expanded, one
  // section pushes the other ten out of sight. Either way the player is
  // scrolling past headers they cannot see to reach a section they cannot see,
  // on every one of thirty turns. That is the thing this fixes.
  //
  // Five standing tabs, always all visible, each carrying the live badge its
  // sections carry. The grouping is NOT a filing convenience — it is the action
  // budget made visible. DIPLOMATIC ACTIONS, ALLIES and GULF PARTNERS spend the
  // same single slot (see doDiplo in game.js), so on a phone they are one tab
  // and choosing between them looks like the choice it actually is. Same
  // argument for TONIGHT: the staffed options and the one-shot raid are both
  // things the military slot buys tonight.
  //
  // Nothing is renamed and nothing is taken away. Each panel keeps its own
  // header, its meta line and its disclosure caret; the rail is a way in.
  // ============================================================

  // The one definition of "this screen is a phone". CSS reads it back off
  // `body.mobile-ui` rather than repeating the breakpoints, so there is no
  // second copy to drift. Height is in here because a landscape phone is short
  // rather than narrow — 932x430 is neither a small width nor a desktop.
  const MOBILE_Q = '(max-width: 900px), (max-height: 560px)';

  const RAIL_GROUPS = [
    // Labels are capped at seven characters and that is a hard constraint, not
    // a style: six tabs have to stand side by side across a 268px sidebar on an
    // iPhone SE turned sideways, which is ~43px of chip each. STAFF rather than
    // ADVISORS for exactly that reason — the panel it opens still says
    // SITUATION ROOM — ADVISORS at the top of the pane.
    { key: 'recovery', label: 'RESCUE',  urgent: true, panels: ['csar'] },
    { key: 'tonight',  label: 'TONIGHT', panels: ['coa', 'specops'] },
    { key: 'mission',  label: 'MISSION', panels: ['objectives', 'intel'] },
    // SQUADRON used to ride with FORCES rather than take a seventh chip. The
    // panel came off at v2.09 and the roster did not — see aircrew.js and the
    // note where the markup used to be in index.html.
    { key: 'forces',   label: 'FORCES',  panels: ['resources', 'fleet'] },
    { key: 'advisors', label: 'STAFF',   panels: ['advisors'] },
    // `slot` says this group's orders share ONE budget, so its chip must not be
    // a count of rows. See railBadge — this is the flag that stops the tab
    // reading "10 READY" over a single diplomatic action.
    // Orders FIRST here, and this is the one place the rail's order deliberately
    // differs from the sidebar's. On a desktop THE WORLD is above DIPLOMATIC
    // ACTIONS because there is room to read the board and then decide. On a
    // phone selectRail opens the first section in the group, and an open THE
    // WORLD is taller than a landscape phone's whole scroll pane — it pushed
    // the orders so far below the fold that the tab appeared to contain nothing
    // but gauges. The board is still the first thing on screen, as a shut head
    // carrying its own alarm, which is the whole reason that head exists.
    { key: 'diplo',    label: 'DIPLO',   slot: true, panels: ['diplo', 'world'] },
  ];

  let railKey = null;

  const onMobile = () => document.body.classList.contains('mobile-ui');
  const panelEl = (key) => document.querySelector(`.panel[data-panel="${key}"]`);
  const railGroup = (key) => RAIL_GROUPS.find((g) => g.key === key);
  const groupFor = (panelKey) => RAIL_GROUPS.find((g) => g.panels.includes(panelKey));

  // ============================================================
  // THE SECTIONS THIS LEVEL HAS — DIFFICULTY.railPanels
  // ------------------------------------------------------------
  // A level that staffs the night for the president should not also hand them
  // the eleven-drawer sidebar the level that staffs nothing needs. The whitelist
  // lives in data.js, next to the knobs that decide who does the targeting,
  // because that is the same decision one step further out; this is only the
  // thing that applies it.
  //
  // `mode-off` rather than `hidden`, and that is the whole reason this works.
  // Four of these panels toggle `hidden` on themselves every render — CSAR when
  // aircrew are down, TONIGHT'S OPTIONS when the staff has something to brief —
  // so a trim written in the same class would be undone by the next draw and
  // re-applied by the next turn, flickering panels the level does not have. Two
  // classes, two owners: `hidden` stays the renderers', `mode-off` is the
  // level's, and CSS hides a panel carrying either.
  //
  // Run once, at boot, after the difficulty is known. Nothing re-runs it because
  // nothing changes difficulty mid-war.
  function applyPanelTrim() {
    const keep = Game.difficulty().railPanels;
    for (const p of document.querySelectorAll('#sidebar-scroll .panel[data-panel]')) {
      p.classList.toggle('mode-off', !!keep && !keep.includes(p.dataset.panel));
    }
  }

  // A tab is on the rail only while it has something behind it. RECOVERY does
  // not exist until aircrew are down, TONIGHT'S OPTIONS does not exist at all on
  // hard, and a panel this level does not have never exists — a tab leading to
  // an empty pane is worse than no tab.
  const livePanels = (g) =>
    g.panels.map(panelEl).filter((p) => p &&
      !p.classList.contains('hidden') && !p.classList.contains('mode-off'));
  const groupLive = (g) => livePanels(g).length > 0;

  // Aircrew on the ground outrank whatever the player had open; otherwise the
  // night starts on the night's decision.
  function defaultRail() {
    const first = ['recovery', 'tonight', 'mission'].map(railGroup).find(groupLive);
    return (first || RAIL_GROUPS.find(groupLive) || {}).key;
  }

  // What the chip says while its sections are out of sight. Orders first, and
  // in the same words the panel badges already use — how much of this is still
  // live tonight — because that is the number that decides whether a tab is
  // worth opening. A group with no orders left falls back to the most
  // informative thing its panels are saying, which is how MISSION goes on
  // showing the breakout clock once the collection deck is spent.
  function railBadge(g) {
    if (g.key === 'advisors') {
      const n = document.querySelectorAll('#advisors-list .advisor.urgent').length;
      return { text: n ? `${n} URGENT` : '', urgent: n > 0 };
    }
    // Counted off the order rows themselves rather than off the panel badges,
    // for one reason: TONIGHT'S OPTIONS has no badge — it is not in
    // ACTION_PANELS, because on a desktop its meta line already says how many
    // options are staffed — and a tab reading "1 READY" over two courses of
    // action and a raid is simply wrong. Same rule as renderBadges otherwise,
    // disclosure carets included: they are never disabled, so counting them
    // would report every tab as ready.
    // A `slot` group is not counted at all: eleven diplomatic orders over one
    // budget is one decision, and a chip reading "10 READY" describes a game
    // nobody is playing. It reads its panels' badges instead — and ranks an
    // ALARM above them, because a gauge about to discharge outranks the
    // reminder that the slot is unspent. `alarm` is picked by class rather than
    // by panel order: the readout is listed second in that group so the phone
    // lands on the orders, and pinning "which badge wins" to that ordering
    // would silently invert this the next time it is reconsidered.
    let counted = false, live = 0, fallback = '', alarm = '';
    for (const p of livePanels(g)) {
      const box = g.slot ? null : p.querySelector('[id$="-buttons"]');
      if (box && box.querySelector('button:not(.action-why)')) {
        counted = true;
        live += box.querySelectorAll('button:not(.action-why):not(:disabled)').length;
      }
      const badge = p.querySelector('.panel-badge');
      const text = (badge.textContent || '').trim();
      if (!text || text === 'NONE') continue;
      if (badge.classList.contains('badge-warn') && !alarm) alarm = text;
      if (!fallback) fallback = text;
    }
    if (alarm) return { text: alarm, urgent: true };
    if (counted && live) return { text: `${live} READY` };
    // An unspent slot is the one fallback that is not a quiet fact — it is the
    // same nag the END TURN button carries, and the primer names not spending
    // the free actions as the most common way a new player loses.
    if (g.slot && fallback) return { text: fallback, quiet: /GIVEN|SPENT/.test(fallback) };
    return { text: fallback || (counted ? 'NONE' : ''), quiet: true };
  }

  // Open a tab: everything outside it leaves the pane entirely (a collapsed
  // head still costs 30px and still has to be scrolled past), and the first
  // section inside it opens, because a tab that lands on a row of shut headers
  // has moved the problem rather than solved it. The rest keep their heads and
  // their carets — a group is two or three sections, so they all fit on screen.
  function selectRail(key) {
    if (!onMobile()) return;
    const g = railGroup(key);
    const target = g && groupLive(g) ? g : RAIL_GROUPS.find(groupLive);
    if (!target) return;
    railKey = target.key;
    // Visibility here as well as in syncRail, and not as belt and braces: the
    // recovery tab is created hidden and is un-hidden by the same render that
    // calls openPanel on it, so a selectRail that only moved the highlight
    // would put the player on a tab that is still display:none — the section
    // opens and the way back to it does not exist.
    for (const chip of document.querySelectorAll('.rail-chip')) {
      const own = railGroup(chip.dataset.rail);
      chip.classList.toggle('hidden', !(own && groupLive(own)));
      chip.setAttribute('aria-pressed', String(chip.dataset.rail === target.key));
    }
    for (const p of document.querySelectorAll('#sidebar-scroll .panel[data-panel]')) {
      p.classList.toggle('rail-off', !target.panels.includes(p.dataset.panel));
    }
    livePanels(target).forEach((p, i) => setPanelOpen(p, i === 0));
    const scroll = $('sidebar-scroll');
    if (scroll) scroll.scrollTop = 0;
  }

  // Badges and tab visibility, every render. Deliberately NOT re-selecting the
  // tab: the player may have opened the second or third section inside the one
  // they are on, and a turn's worth of re-rendering must not shut it again.
  function syncRail() {
    const rail = $('panel-rail');
    if (!rail || !rail.children.length) return;
    let shown = 0;
    for (const g of RAIL_GROUPS) {
      const chip = rail.querySelector(`[data-rail="${g.key}"]`);
      if (!chip) continue;
      const live = groupLive(g);
      chip.classList.toggle('hidden', !live);
      if (!live) continue;
      shown++;
      const b = railBadge(g);
      chip.querySelector('.rail-badge').textContent = b.text;
      chip.classList.toggle('rail-quiet', !!b.quiet);
      chip.classList.toggle('rail-urgent', !!(g.urgent || b.urgent));
    }
    // THE RAIL IS SIZED AGAINST WHAT IS ACTUALLY ON IT. The 8.5px label and the
    // 44px floor in the CSS are written for six tabs standing across a 268px
    // sidebar — that is the worst case and it is genuinely tight. A level that
    // has been trimmed to three sections (DIFFICULTY.railPanels) does not have
    // that problem and should not pay that price: three chips at six-chip type
    // is a nav bar apologising for space it is not using, on the level whose
    // whole argument is that there is less to read. Set off the live count
    // rather than off the difficulty, because RECOVERY comes and goes mid-war
    // and the rail has to re-fit when it does.
    // Two steps rather than one, and the second is the level's normal state:
    // easy's whitelist is three sections, so three chips is not an unusually
    // empty rail there, it is the rail. See the rail-three block in the CSS.
    rail.classList.toggle('rail-few', shown > 0 && shown <= 4);
    rail.classList.toggle('rail-three', shown > 0 && shown <= 3);
    // The tab under the player can stop existing — the recovery closes, the
    // last aircrew comes home — so re-home rather than leaving the pane
    // pointing at nothing.
    const open = railGroup(railKey);
    if (onMobile() && (!open || !groupLive(open))) selectRail(defaultRail());
  }

  function initRail() {
    const rail = $('panel-rail');
    if (!rail) return;
    for (const g of RAIL_GROUPS) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'rail-chip hidden' + (g.urgent ? ' rail-urgent' : '');
      chip.dataset.rail = g.key;
      chip.setAttribute('aria-pressed', 'false');
      const label = document.createElement('span');
      label.className = 'rail-label';
      label.textContent = g.label;
      const badge = document.createElement('span');
      badge.className = 'rail-badge';
      chip.append(label, badge);
      chip.addEventListener('click', () => selectRail(g.key));
      rail.appendChild(chip);
    }

    const mq = window.matchMedia(MOBILE_Q);
    const apply = () => {
      document.body.classList.toggle('mobile-ui', mq.matches);
      rail.classList.toggle('hidden', !mq.matches);
      if (mq.matches) {
        syncRail();
        selectRail(railKey || defaultRail());
      } else {
        // Back to a desktop window mid-war: hand every section back to the
        // accordion it came from, shut, which is where a turn starts there.
        for (const p of document.querySelectorAll('#sidebar-scroll .panel[data-panel]')) {
          p.classList.remove('rail-off');
          setPanelOpen(p, false);
        }
      }
    };
    // A rotation fires this, which is the whole point: the deck has to be
    // standing before the first tap lands after the phone comes round.
    mq.addEventListener('change', apply);
    apply();
  }

  // For a section that has just become relevant on its own account rather than
  // because the player went looking for it. Everything in the sidebar opens by
  // being clicked; this is the exception — CSAR when aircrew go down, and the
  // turn-one advisors.
  //
  // `reveal` scrolls it back into the window afterwards. A panel opened FOR the
  // player can still open below the fold: on a landscape phone the scroll pane
  // is barely 200px and three collapsed heads sit above the advisors, so the
  // tasking that was the whole reason for opening it lands off-screen.
  //
  // NOT scrollIntoView({block:'nearest'}) — the same trap openStrikeModal
  // documents. The panel's HEAD is inside the pane while everything under it
  // hangs below, so `nearest` calls it visible and moves nothing. Drive the
  // scroller directly instead. What it aims for is described at SLICE below.
  function openPanel(key, reveal) {
    const panel = document.querySelector(`.panel[data-panel="${key}"]`);
    if (!panel) return;
    // A section this level does not have cannot be opened, and the refusal is
    // here rather than at each of the four call sites: openPanel is what a
    // renderer reaches for when its own content has just become urgent, and
    // "urgent" is exactly when a trimmed panel would otherwise force itself
    // back on screen — CSAR the moment aircrew go down, which on a level that
    // pops the recovery is the one night the drawer must stay shut.
    if (panel.classList.contains('mode-off')) return;
    // On a phone the section is behind a tab, so it has to bring its tab with
    // it — otherwise this opens a panel inside a group the rail is not showing
    // and the player is told nothing at all. Before setPanelOpen, because
    // selecting a tab opens the FIRST section in it and this one may be second.
    const g = onMobile() && groupFor(key);
    if (g && g.key !== railKey) selectRail(g.key);
    setPanelOpen(panel, true);
    if (!reveal) return;
    // The body animates open on grid-template-rows, so its height is a moving
    // target and a panel measured mid-animation is still a sliver — which reads
    // as "it very nearly fits" and scrolls by the few tens of pixels it was
    // short, leaving the tasking off-screen anyway.
    //
    // Neither a fixed delay nor transitionend survives this. The delay is a
    // guess, and transitionend BUBBLES — the action rows inside the body have
    // transitions of their own, so it fires early from a descendant. So poll
    // instead: wait until the panel's height stops changing, then measure. Two
    // equal frames is settled; the frame cap stops a permanently-animating child
    // from holding the scroll hostage.
    const scroll = $('sidebar-scroll');
    if (!scroll) return;
    // Bring the panel's LEADING SLICE on screen — its head, its status line and
    // the first tasking — not the whole panel. Chasing the whole thing scrolls
    // as far as it takes to fit 600px of advisors, which on a desktop window
    // pushed the three collapsed heads above it off the top; those heads carry
    // the breakout clock, the tanker count and the air-superiority phase, so
    // buying the fourth panel by hiding three badges is a bad trade. Enough to
    // read the first tasking is the whole requirement.
    const SLICE = 140;
    const doReveal = () => {
      const sr = scroll.getBoundingClientRect(), pr = panel.getBoundingClientRect();
      // a panel shorter than the slice only needs its own bottom brought in
      const want = Math.min(pr.top + SLICE, pr.bottom) - sr.bottom;
      // never scroll past aligning the head with the top of the pane
      if (want > 0) scroll.scrollTop += Math.min(pr.top - sr.top, want);
    };
    let last = -1, frames = 0;
    const settle = () => {
      const h = panel.getBoundingClientRect().height;
      if (h === last || frames++ > 40) return doReveal();
      last = h;
      requestAnimationFrame(settle);
    };
    requestAnimationFrame(settle);
  }

  function initPanels() {
    for (const panel of document.querySelectorAll('#sidebar-scroll .panel[data-panel]')) {
      panel.querySelector('.panel-head').addEventListener('click', () => {
        const opening = panel.classList.contains('collapsed');
        setPanelOpen(panel, opening);
        // a section opened at the bottom of the list would otherwise expand
        // off-screen: pull it back into the scroll once it has finished growing
        if (opening) setTimeout(() => panel.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 200);
      });
    }
  }

  // The sidebar fades its bottom edge while there is more list below the fold
  // (see #sidebar-scroll's mask). Lift the fade once it is scrolled out, so a
  // fully-read sidebar does not sit there implying it is still hiding something.
  function initScrollEdge() {
    const scroll = $('sidebar-scroll');
    const update = () => {
      const atEnd = scroll.scrollTop + scroll.clientHeight >= scroll.scrollHeight - 2;
      scroll.classList.toggle('at-end', atEnd);
    };
    scroll.addEventListener('scroll', update, { passive: true });
    new ResizeObserver(update).observe(scroll);
    update();

    // The status row is the same problem lying on its side: it overflows
    // horizontally on a narrow landscape phone and a touch browser draws no
    // resting scrollbar, so the readouts past the right edge were unreachable
    // by anything except a swipe the player had no reason to try. Unlike the
    // sidebar it also has to say when it DOESN'T overflow — on a desktop the
    // whole row fits and a permanent fade would imply a ninth column that isn't
    // there. Observed rather than measured once: the row is re-rendered every
    // turn and the widths move with the numbers in it (a five-figure casualty
    // count is wider than a one-figure one).
    const status = $('status-row');
    if (!status) return;
    const statusUpdate = () => {
      const overflows = status.scrollWidth > status.clientWidth + 2;
      status.classList.toggle('no-overflow', !overflows);
      status.classList.toggle('at-end',
        status.scrollLeft + status.clientWidth >= status.scrollWidth - 2);
    };
    status.addEventListener('scroll', statusUpdate, { passive: true });
    new ResizeObserver(statusUpdate).observe(status);
    new MutationObserver(statusUpdate).observe(status, { childList: true, subtree: true, characterData: true });
    statusUpdate();
  }

  // The same contract for every modal body. On a desktop window almost nothing
  // overflows and the fade never appears; on a landscape phone the endgame, the
  // primer and a strike estimate all run past the bottom of a ~260px window,
  // and without this the player has no way to know the rest of the page is
  // there. `no-overflow` is the common case and lifts the fade entirely.
  //
  // Modals are populated after this runs, so each body is watched rather than
  // measured once: the ResizeObserver fires when the content is written in, and
  // MutationObserver catches a rewrite that happens to come out the same height.
  function initModalScrollEdge() {
    for (const body of document.querySelectorAll('.modal-body')) {
      const update = () => {
        const overflows = body.scrollHeight > body.clientHeight + 2;
        body.classList.toggle('no-overflow', !overflows);
        body.classList.toggle('at-end',
          body.scrollTop + body.clientHeight >= body.scrollHeight - 2);
      };
      body.addEventListener('scroll', update, { passive: true });
      new ResizeObserver(update).observe(body);
      new MutationObserver(update).observe(body, { childList: true, subtree: true });
      update();
    }
  }

  function setBadge(key, text, cls) {
    const panel = document.querySelector(`.panel[data-panel="${key}"]`);
    if (!panel) return;
    const badge = panel.querySelector('.panel-badge');
    badge.textContent = text || '';
    badge.className = 'panel-badge' + (cls ? ` ${cls}` : '');
  }

  // Action panels get counted rather than described: whatever the section
  // rendered, how much of it is still live.
  // DIPLOMATIC ACTIONS is deliberately NOT in here. Counting its rows reports
  // how many orders are on the shelf, and what the player actually has is one
  // slot to spend on any of them — renderDiplo sets that badge itself.
  const ACTION_PANELS = {
    fleet: 'fleet-buttons', csar: 'csar-buttons', intel: 'intel-buttons',
    specops: 'specops-buttons',
  };
  function renderBadges() {
    for (const key in ACTION_PANELS) {
      const box = $(ACTION_PANELS[key]);
      if (!box) continue;
      // the disclosure carets are not orders and must not be counted — they are
      // never disabled, so counting them would report every panel as READY
      const total = box.querySelectorAll('button:not(.action-why)').length;
      const live = box.querySelectorAll('button:not(.action-why):not(:disabled)').length;
      if (!total) { setBadge(key, ''); continue; }
      setBadge(key, live ? `${live} READY` : 'NONE', live ? '' : 'badge-none');
    }
    // the rail reads its tabs off the badges this just wrote, so it is synced
    // from here rather than from a second pass over the same panels
    syncRail();
  }

  // ---- the read: the one line that names what is likeliest to end this war ----
  // `Assess.concerns()` has always been the game's own answer to "what is going
  // wrong tonight", ranked, and until v1.83 the only two things that read it
  // were `coaOptions` and `advise` — both of them behind a click. A president
  // who never opened the brief was never told which of seven falling numbers
  // was the one about to finish them, while the staff argued from that exact
  // judgement in the next panel over. This is that judgement, on the bar,
  // always: `Assess.phase` for the frame and the worst live concern's `now`
  // clause for the specific.
  //
  // WHY IT IS DAMPED, which is the whole design question here. Severity alone
  // picks the loudest STANDING condition, and a standing condition never stops
  // being true — the same failure DAMP_STEP fixes for the advisor tables, and a
  // worse one here, because those are read when a panel is opened and this is
  // on screen every second of every turn. Measured in `.claude/betatest/brief.js`
  // over 810 campaigns: RAW, the top concern holds the same id for a mean of
  // 6.0–9.5 consecutive turns, in the worst campaign for all 30 of them, and
  // `strait` alone leads on 31–52% of every turn played by every persona. A line
  // that reads identically for ten turns is not a warning, it is part of the
  // frame, and the player stops seeing it somewhere around turn four. Damped on
  // advise()'s own constants — deliberately the same numbers, so this is one
  // experiment and not two — the longest run falls to a mean of 3.0–3.9 with a
  // worst case of 7, and distinct ids a campaign go from 5.6 to 6.3. The
  // ranking is still the ranking. It just stops narrating the same sentence at
  // a president who has already read it and gone somewhere else on purpose.
  const READ_STEP = 0.12, READ_FLOOR = 0.55, READ_RECOVER = 0.5;
  const readHeard = new Map();      // concern id -> consecutive turns displayed
  let readSaid = null;              // this turn's pick, awaiting commit
  let readTurn = -1;

  // Same rule as `hold` in ai.js: exempt the concerns that are THEMSELVES
  // expiring rather than being restated. A fix on a launcher group does not
  // survive the night, the vote is a different number of hours away every turn,
  // and a breakout band inside single digits is the war closing. None of those
  // is a condition the president has heard before — each is new every evening
  // until it resolves — so none of them is damped for being said twice.
  // An OPEN negotiation window belongs on the same list and is the clearest case
  // on it: the war can be ended tonight, the odds under it move every night as
  // leverage accrues, and it stops being true the moment Tehran repairs back
  // over the bar. Damping it would be the room getting tired of saying the war
  // is winnable. The approaching arm is NOT exempt — that one is a standing
  // condition for the last third of the campaign and is exactly what the damper
  // is for — which is why this asks `b.deal.open` rather than the id alone.
  const readHold = (c, b) => c.id === 'telfix' || c.id === 'vote' ||
    (c.id === 'deal' && b.deal.open) ||
    (c.id === 'breakout' && b.brk.hi <= 8);

  // The counter is committed at the TURN BOUNDARY and never on a render, for
  // exactly the reason commitHeard in ai.js is: renderHUD runs on every draw —
  // a package lands, a report opens, the sidebar re-renders — and a line that
  // reordered itself between two draws of the same night would be worse than
  // one that repeated. The CONCERNS are re-read every draw regardless (rule 2
  // in assess.js), so the line still moves the moment the board does; what is
  // frozen for the night is only how tired the room is of hearing each one.
  function readLead(b) {
    const list = Assess.concerns(b);
    if (!list.length) return null;
    if (readTurn !== Game.G.turn) {
      // a new war rewinds the clock; nothing carries across campaigns
      if (Game.G.turn < readTurn) { readHeard.clear(); readSaid = null; }
      else if (readTurn >= 0) {
        for (const k of [...readHeard.keys()]) {
          if (k !== readSaid) readHeard.set(k, Math.max(0, readHeard.get(k) - READ_RECOVER));
        }
        if (readSaid) readHeard.set(readSaid, (readHeard.get(readSaid) || 0) + 1);
      }
      readTurn = Game.G.turn;
    }
    let best = null;
    for (const c of list) {
      const rep = readHold(c, b) ? 0 : (readHeard.get(c.id) || 0);
      const sev = c.sev * Math.max(READ_FLOOR, 1 - rep * READ_STEP);
      if (!best || sev > best.sev) best = { sev, c };
    }
    readSaid = best.c.id;
    return best.c;
  }

  // ---- HUD / bottom bar ----
  function renderHUD(G) {
    // clock
    const day = Math.ceil(G.turn / 2);
    const hour = G.turn % 2 === 1 ? '06:00' : '18:00';
    // LOCAL is in a span so a phone can drop it: with the chart's label already
    // hidden this row is the clock plus six controls, and on a 390px portrait
    // screen those six need every pixel the word was spending.
    $('map-clock').innerHTML =
      `DAY ${day} — ${hour}<span class="mc-local"> LOCAL</span>`;
    // A bare count, no denominator. The war does not end on a known turn any
    // more — it ends when the country stops paying for it — and "17/30" would
    // promise a deadline the game no longer honours in either direction: it can
    // run past thirty, and most campaigns are decided well before it.
    $('turn-value').textContent = `${G.turn}`;

    // Iran war capacity meter: the enemy's remaining ability to fight.
    // Full and red at the start — the mission is draining it to zero.
    const meter = $('capacity-meter');
    meter.innerHTML = '';
    const cap = G.iranCapacity();
    const lvl = Math.round(cap / 10);
    for (let i = 1; i <= 10; i++) {
      const seg = document.createElement('div');
      let cls = 'seg';
      if (i <= lvl) {
        cls += cap >= 60 ? ' on-high' : cap >= 30 ? ' on-mid' : ' on-low';
      }
      seg.className = cls;
      meter.appendChild(seg);
    }
    $('capacity-value').textContent = `${cap}%`;
    $('capacity-value').style.color = cap >= 60 ? 'var(--red)' : cap >= 30 ? 'var(--amber)' : 'var(--green)';

    // Every readout on this bar that can END the war names the line it is
    // measured against, the way the Strait already counts its closed nights and
    // casualties count against what the country will absorb. A bare "58%" told
    // a new president nothing about the fact that 20 is impeachment — and
    // approval finishes the overwhelming majority of campaigns, so it was the
    // single most important number on the screen with no denominator on it.
    const ap = $('approval-value');
    // The bands are derived, not literal, because as of v2.13 there is no
    // single scale left to write a literal against: the floor is 32 on easy and
    // 24 on hard, so a fixed `< 30 = crit` opened every hard war amber and
    // could not go red on easy until the presidency was already over. Red is
    // "within a bad week of the collapse line", amber is "in the bottom third
    // of what this country will ever give you" — both relative to the same
    // blocs the number itself is made of. See APPROVAL in data.js.
    const floor = Game.collapseAt();
    const apClass = G.approval <= floor + 8 ? 'crit'
      : G.approval <= G.base + G.middleSize * 0.35 ? 'warn'
      : 'good';
    ap.textContent = `${Math.round(G.approval)}%`;
    ap.className = 'stat-value big ' + apClass;
    // The threshold rides in its own span so a phone can hold it back until it
    // is worth the width: seven readouts across a 390px screen leaves ~95px a
    // column, and "APPROVAL — FALLS AT 20%" does not go in 95px. The stylesheet
    // brings it back the moment this readout goes amber, which is when the line
    // stops being trivia and starts being the thing about to end the war.
    $('approval-label').innerHTML =
      `APPROVAL<span class="stat-sub"> — FALLS AT ${floor}%</span>`;

    // Oil defeats the war outright at $240; pulse the number once it is close
    // enough that the next spike could end it, so the loss never arrives unseen.
    const oil = $('oil-value');
    oil.textContent = `$${Math.round(G.oil)}`;
    oil.className = 'stat-value big ' + (G.oil >= 150 ? 'crit' : G.oil >= 110 ? 'warn' : '') +
      (G.oil >= 190 ? ' pulsing' : '');
    // $135 is where the barrel starts costing approval every night, $165 where
    // it doubles, $240 where it ends the war. The label names whichever line is
    // the next one coming, so it always reads as a warning rather than a stat.
    $('oil-label').innerHTML = 'BRENT CRUDE<span class="stat-sub"> — ' +
      (G.oil >= 165 ? 'BREAKS AT $240' : G.oil >= 135 ? 'DOUBLES AT $165' : 'BITES AT $135') +
      '</span>';

    // A closed Strait breaks the economy after HORMUZ_LIMIT turns shut. Shown as
    // a count against that limit the same way casualties are, and read from the
    // constant so the readout can never quote a wall the check does not use —
    // this line said /7 while the comment above it said five, and both were
    // stale the moment the limit moved.
    const hz = $('hormuz-value');
    hz.textContent = G.hormuz === 'CLOSED' && G.hormuzClosedTurns > 0
      ? `CLOSED ${G.hormuzClosedTurns}/${Game.HORMUZ_LIMIT}` : G.hormuz;
    hz.className = 'stat-value big ' + (G.hormuz === 'CLOSED' ? 'crit' : G.hormuz === 'CONTESTED' ? 'warn' : 'good') +
      (G.hormuz === 'CLOSED' && G.hormuzClosedTurns >= Game.HORMUZ_LIMIT - 4 ? ' pulsing' : '');

    const w = $('world-value');
    w.textContent = Math.round(G.world);
    w.className = 'stat-value big ' + (G.world < 30 ? 'crit' : G.world < 45 ? 'warn' : '');

    const lim = Game.casualtyLimit();
    $('casualty-value').textContent = `${G.casualties.us}/${lim}`;
    $('casualty-value').className = 'stat-value big ' +
      (G.casualties.us > lim * 0.72 ? 'crit' : G.casualties.us > lim * 0.44 ? 'warn' : '') +
      (G.casualties.us > lim * 0.85 ? ' pulsing' : '');

    // The primer names not spending the free slots as the most common way a new
    // player loses, and then nothing anywhere said a slot was still open. This
    // is on the button rather than behind a confirm dialog on purpose: a player
    // who meant to hold a night is not interrupted, and a player who forgot is
    // told in the one place they are already looking.
    const unspent = (G.intelUsed ? 0 : 1) + (G.diploUsed ? 0 : 1);
    const end = $('btn-end-turn');
    if (end) {
      // Txt inflects on the last word and returns lower-case 's', which reads as
      // "2 FREE ACTIONs" inside an upper-case button label. This is the one
      // place in the game that counts a noun in caps, so it does it by hand
      // rather than teaching the whole helper about case.
      end.textContent = unspent && !G.over
        ? `END TURN — ${unspent} FREE ACTION${unspent === 1 ? '' : 'S'} UNSPENT`
        : 'END TURN — AWAIT DEVELOPMENTS';
      end.classList.toggle('has-unspent', unspent > 0 && !G.over);
    }

    // A fresh read, on every draw, uncached — see rule 2 at the top of
    // assess.js. Fifteen passes over forty targets against a bar that is
    // already rebuilding a ten-segment meter, and the alternative is a line
    // still quoting the board as it stood before tonight's package landed.
    const b = Assess.board();
    const ph = Assess.phase(b);
    const lead = readLead(b);
    $('read-phase').textContent = ph.name;
    // The clause rides in a `.stat-sub` because it is the same bargain the
    // approval and crude thresholds already strike: real information, far too
    // long for a 95px column, so a phone holds it back until the readout has
    // earned the width. Measured, the rendered line runs 87 characters at the
    // median and never once exceeded 122 in 810 campaigns, which is what the
    // cell is sized against in the stylesheet.
    // Written into the span rather than the cell so the `.stat-sub` wrapper the
    // phone's hold-back rule keys on survives every render; the class on the
    // cell below is set separately for the same reason.
    $('read-value').querySelector('.stat-sub').textContent = lead ? lead.now : '';
    // RED MEANS TONIGHT, AMBER MEANS THIS CAMPAIGN. Not a single severity cut,
    // because severity is a ruler for RANKING and reads badly as a colour: the
    // shared scale documented above CONCERNS puts the SAM belt at 0.85 for the
    // whole contested opening, so a red-at-0.8 bar opens every war red and has
    // said nothing by turn four. Measured over 810 campaigns, `sev >= 0.7` —
    // the ruler's own "decides the campaign" anchor — is true on 52–69% of all
    // turns and `sev >= 0.8` on 17–27%.
    //
    // So red is the two facts that are about to stop being available: the
    // collapse phase (the presidency ends inside four turns) and a lead the
    // damper itself exempts as perishable, which is the same `readHold` rule
    // and fires on 12–16% of turns. Amber is severe-but-standing at 0.8, and
    // the race phase. The remaining ~65% of nights the line is white, which is
    // what makes the other 35% mean anything.
    const crit = ph.id === 'collapse' || (lead && readHold(lead, b));
    $('read-value').className = 'stat-value ' +
      (crit ? 'crit' : ph.id === 'race' || (lead && lead.sev >= 0.8) ? 'warn' : '');

    AudioSys.alertCheck(G);
  }

  // ---- sidebar ----
  function renderObjectives(G) {
    const deg = G.nukeDegraded();
    const brk = Game.breakoutEstimate();
    // Every objective carries its own number, and every way of losing carries
    // the line it is measured against. Casualties always did — "7 / 250
    // tolerated" is the model the other three now follow, because a bare 58% on
    // the bar teaches a new president nothing about the fact that 20 ends the
    // war, and approval ends nine campaigns in ten.
    const wm = G.warMachine();
    const items = [
      { text: `Destroy nuclear program (${deg}% / 100%)`, done: deg >= 100 },
      { text: `Break Iran's war machine (${wm.map(c => `${c.label} ${c.pct}%`).join(' · ')})`,
        done: G.iranBroken() },
      { text: `Limit US casualties (${G.casualties.us} / ${Game.casualtyLimit()} tolerated)`, done: null },
      { text: `Hold approval above ${Game.collapseAt()}% (now ${Math.round(G.approval)}%)`, done: null },
      { text: `Keep crude under $240 (now $${Math.round(G.oil)})`, done: null },
      { text: `Keep Strait of Hormuz open`, done: null },
    ];
    $('objectives-list').innerHTML = items.map(i =>
      `<li class="${i.done === true ? 'done' : 'pending'}">${i.text}</li>`).join('');

    // ---- the breakout clock ----
    // The one number in this game the player is never given exactly. It reads
    // as a band, and the band is the whole point: it is narrow because someone
    // paid an action slot for it to be, or it is wide because nobody did.
    const box = $('breakout-line');
    if (!box) return;
    if (brk.halted) {
      box.className = 'breakout halted';
      box.innerHTML = '<span class="bo-label">ENRICHMENT</span>' +
        '<span class="bo-value">HALTED — no capability remaining</span>';
      setBadge('objectives', 'HALTED');
      return;
    }
    const urgent = brk.hi <= 6 ? ' urgent' : brk.hi <= 12 ? ' warn' : '';
    // Shut, the objectives panel still has to show the clock the war is run
    // against — and it has to say what the number IS. "5–16T" is the most
    // important figure on the screen rendered as a crossword clue: a player who
    // has not yet opened the panel has no way to know the T is turns, let alone
    // turns until Iran has a weapon. The word BOMB is what makes it a clock.
    setBadge('objectives', `BOMB IN ${brk.lo}–${brk.hi}`, urgent ? '' : 'badge-none');
    box.className = 'breakout' + urgent;
    box.innerHTML = '<span class="bo-label">EST. TIME TO A DEVICE</span>' +
      `<span class="bo-value">${brk.lo}–${brk.hi} turns</span>` +
      `<span class="bo-conf">${brk.conf} confidence</span>`;
  }

  // ---- the air-superiority ladder ----
  // The single most important number on the screen after the enrichment clock,
  // because it decides which two thirds of the force are allowed to fly. Shown
  // as a bar with the two release thresholds marked on it, so the player can
  // see how much more of the SAM belt has to come down — and can watch it slide
  // back the other way on the nights nobody goes back.
  //
  // Split in two as of v1.33. The BAR is the first line of the tonight box. The
  // sentence saying which rung comes next moved into that box's disclosure: it
  // is the same sentence for every turn spent on a rung — a reference card that
  // was being reprinted above seven magazine rows on all thirty of them.
  function airPhaseBar(G) {
    const s = Game.airSuperiority();
    const phase = Game.airPhase();
    const cls = phase === 'superiority' ? 'ap-sup' : phase === 'degraded' ? 'ap-deg' : 'ap-con';
    return `<div class="airsup ${cls}">` +
      `<div class="as-head"><span class="as-label">${Game.PHASE_LABEL[phase]}</span>` +
      `<span class="as-value">${Math.round(s * 100)}%</span></div>` +
      `<div class="as-bar"><span class="as-fill" style="width:${Math.round(s * 100)}%"></span>` +
      `<span class="as-tick" style="left:${AIR_PHASE.degraded * 100}%"></span>` +
      `<span class="as-tick" style="left:${AIR_PHASE.superiority * 100}%"></span></div></div>`;
  }

  function airPhaseNote(G) {
    const phase = Game.airPhase();
    const gated = !Game.difficulty().softGate;
    return phase === 'contested'
      ? (gated ? 'Fourth-generation squadrons release at 40%.'
               : 'Fourth-generation squadrons release at 40% — until then they fly into an intact belt.')
      : phase === 'degraded'
        ? 'Heavy bombers release at 80%. Air defense repairs overnight — this number falls if you look away.'
        : 'The heavy force is released. Every night the SAM belt is left alone, this number falls.';
  }

  // ============================================================
  // STRIKE ASSETS
  // ------------------------------------------------------------
  // The panel was eleven rows and two paragraphs at one weight, in a 300px
  // column. Everything in it was true and nothing in it was ranked: a torpedo
  // count spent twice a war was set in the same type as the package plan spent
  // every turn, and the two figures that actually gate a night — packages left
  // and tanker tracks — sat ninth and tenth, each under three lines of prose.
  //
  // So it is now three answers in the order the questions get asked. What gates
  // tonight (the box: phase, packages, tankers). What can fly, grouped by
  // whether it is released rather than by tier. What is already airborne.
  //
  // Nothing was removed. The reference prose — which rung comes next, what a
  // late frag costs, what each package charges the tanker plan — is one click
  // down, because it says the same thing every turn and the numbers above it
  // do not.
  // ============================================================

  // Whether the tonight box's explainer is open. Like `actOpen` and unlike
  // `advOpen` this is NOT cleared on the turn roll: "a deep fighter package
  // books two tracks" is the same sentence on turn 1 and turn 30, so a player
  // who opened it is learning the game and keeps it open until they close it.
  let resWhyOpen = false;

  // A magazine drawn as well as counted. "4 / 8" and "6 / 8" read identically
  // at 12px in a column this narrow; the bar is the only thing in the row that
  // says how close to dry it is without being read.
  function magBar(have, cap, cls) {
    const pct = cap > 0 ? Math.max(0, Math.min(100, Math.round(have / cap * 100))) : 0;
    return `<span class="a-mag${cls ? ' ' + cls : ''}"><i style="width:${pct}%"></i></span>`;
  }

  // The tasking order as boxes rather than a fraction: solid for the plan,
  // dashed for the late frags past it, filled for what has already flown, and
  // the wall is where the boxes stop. The whole of ATO reads at a glance and
  // without a sentence — which matters, because the sentence is the thing a
  // player stops reading around turn five.
  function slotGauge(flown, slots, ceiling) {
    let s = '';
    for (let i = 0; i < slots; i++) s += `<span class="seg${i < flown ? ' on' : ' off'}"></span>`;
    s += '<span class="split"></span>';
    for (let i = 0; i < ceiling; i++) s += `<span class="seg late${slots + i < flown ? ' on' : ''}"></span>`;
    return `<span class="gauge">${s}</span>`;
  }

  function trackGauge(have, cap) {
    let s = '';
    for (let i = 0; i < cap; i++) s += `<span class="seg${i < have ? ' on' : ' off'}"></span>`;
    return `<span class="gauge tk">${s}</span>`;
  }

  // Every magazine, sorted by the only question a player asks of one: can I use
  // this tonight. `group` is that answer — cleared, present but not released,
  // not in theater — and it is a HEADING now rather than the 8.5px suffix it
  // used to be, because a tier that will not fly must not read like one that
  // will. `tick` is the coloured rule down the left of the row; `low` is the
  // magazine itself being the problem, which is a different fact from the
  // ladder holding the tier back and gets a different colour on the bar.
  // ---- READINESS, NOT ARITHMETIC — DIFFICULTY.plainAssets ----
  // What this panel is FOR changes with who is writing the tasking order. On a
  // level where the president frags packages by hand, "4 / 8" is the working
  // number: it is the difference between a night with two Weasel sweeps in it
  // and a night with one, and the bar beside it is how close the magazine is to
  // refusing the next click. On a level where CENTCOM sizes the option and the
  // map opens no strike dialog at all, that same figure is arithmetic against a
  // decision the president does not make — eleven fractions on a panel whose
  // only real question is "what can fly tonight".
  //
  // So on easy every row answers that question in a word. Nothing is removed:
  // the same rows in the same groups under the same headings, with the same
  // coloured tick and the same second line naming the aircraft. What goes is the
  // count and the bar, which are the two things that only mean something to
  // somebody spending them.
  //
  // The word is derived from what the row already knows rather than from a
  // second table, so a row that goes critical says so in both modes and cannot
  // say one thing on easy and another on normal.
  const READY_WORD = (r) => {
    if (r.val) return r.val;                       // NOT DEPLOYED / EN ROUTE — already a word
    if (r.group === 'held') return 'NOT RELEASED';
    if (r.word) return r.word;                     // a state that outranks the magazine
    if (r.have <= 0) return r.dry || 'NONE LEFT';
    if (r.low) return r.lowWord || 'BELOW A PACKAGE';
    return r.ready || 'READY';
  };

  function assetRows(G) {
    const softGate = Game.difficulty().softGate;
    const rows = [];
    const add = (o) => rows.push(Object.assign({ group: 'go', tick: '', low: false }, o));

    // Present, but the ladder has not released it. On the difficulties that
    // only soften the gate the tier DOES fly — into an intact belt — so it
    // belongs in CLEARED with a warning, not behind a heading saying grounded.
    const gate = (need) => {
      if (Game.phaseAtLeast(need)) return null;
      return softGate
        ? { tick: 'warn', sub: 'Belt unsuppressed — they fly into it' }
        : { group: 'held', tick: 'crit', sub: `Held until ${Math.round(AIR_PHASE[need] * 100)}%` };
    };
    // A count is not an answer. What the player needs to know is whether the
    // magazine holds a PACKAGE, because that is the unit the strike modal
    // spends — "1 / 2" reads like something you can use and buys nothing. Only
    // when the count is non-zero: an empty magazine already reads as empty, and
    // it is the leftover sortie that lies.
    const short = (asset) => {
      const have = G.res[Game.resKey(asset)], min = Game.minPackage(asset);
      return min && have > 0 && have < min
        ? { tick: 'crit', low: true, sub: `Short of a package — ${min} needed` } : null;
    };

    const f5 = short('f35');
    add({ name: '5th-gen sorties', sub: f5 ? f5.sub : 'F-35 / F-22',
      tick: f5 ? f5.tick : '', low: !!f5, have: G.res.f35, cap: G.caps.f35 });

    const f4 = gate('degraded') || short('fighter');
    add({ name: '4th-gen sorties', sub: f4 ? f4.sub : 'F-15E / F-16',
      tick: f4 ? f4.tick : '', low: !!(f4 && f4.low), group: (f4 && f4.group) || 'go',
      have: G.res.fighters, cap: G.caps.fighters });

    // The Tomahawk reservoir is finite for the whole war (Lincoln 20, Ford +10).
    // What is left behind the ready launchers rides in the row's second line and
    // escalates as it runs down — the point of the number is that it is rationed.
    const pool = G.tlamPool ?? 0;
    const tl = short('cruise');
    add({ name: 'Cruise missiles', sub: `${tl ? tl.sub : 'TLAM'} · ${pool} in theater`,
      tick: tl ? 'crit' : pool <= 4 ? 'crit' : pool <= 10 ? 'warn' : '',
      low: !!tl || pool <= 4, have: G.res.cruise, cap: G.caps.cruise });

    // The screen's interceptors — the one magazine on this panel that is spent
    // by the ENEMY rather than by the president, which is exactly why it needs a
    // row here. A shield that decays silently is the crew-rest bug again: a
    // cliff nothing on the screen showed. The second line carries the thing the
    // player actually decides on, which is not the round count but what fraction
    // of tonight's salvo it still stops (see NAVAL_BMD).
    const bmdCap = Game.bmdCapacity();
    const bmdLeft = G.bmdPool ?? 0;
    const bmdFrac = Game.bmdFrac();
    const bmdRate = Math.round(Game.bmdRate() * 100);
    const bmdTick = bmdFrac <= NAVAL_BMD.crit ? 'crit' : bmdFrac <= NAVAL_BMD.warn ? 'warn' : '';
    // ACTIVE or not is the whole of what a president who is not spending these
    // needs: they are fired by Tehran's tempo, and the only order attached to
    // them is one CENTCOM gives itself on this level. A screen that is alongside
    // the ammunition ship or has no deck forward is not shooting at anything,
    // which is a different fact from a light magazine and reads as one.
    const bmdOff = Game.bmdRearming() || Game.navalForward() <= 0;
    add({ name: 'Aegis interceptors',
      sub: Game.bmdRearming()
        ? `Rearming — ${turns(G.bmdRearm)} alongside`
        : Game.navalForward() <= 0
          ? 'SM-3 / SM-6 · no deck on station'
          : `SM-3 / SM-6 · stops ${bmdRate}% of a Gulf salvo`,
      tick: bmdTick, low: bmdFrac <= NAVAL_BMD.crit, group: 'shield',
      word: bmdOff ? 'NOT COVERING' : null, ready: 'ACTIVE',
      lowWord: 'RUNNING DRY', dry: 'CELLS DRY',
      have: bmdLeft, cap: bmdCap });

    // The boat's own load — not a theater magazine, and it never refills.
    const torps = G.torpedoes ?? 0;
    add({ name: 'Mk-48 torpedoes', sub: torps === 0 ? 'Tubes dry' : 'Toledo · never refills',
      tick: torps === 0 ? 'crit' : '', low: torps === 0, dry: 'TUBES DRY',
      have: torps, cap: TORPEDO_LOAD });

    if (G.bombersArrived) {
      const b2 = short('stealth');
      add({ name: 'B-2 missions', sub: b2 ? b2.sub : 'GBU-57 · Diego Garcia',
        tick: b2 ? b2.tick : '', low: !!b2, have: G.res.stealth, cap: G.caps.stealth });
    } else {
      add({ name: 'B-2 missions', group: 'away', sub: 'GBU-57 · 509th, Whiteman AFB',
        val: G.bombersOrdered ? `EN ROUTE ${G.bomberEta}T` : 'NOT DEPLOYED' });
    }

    if (G.heaviesArrived) {
      const hv = gate('superiority') || short('heavy');
      add({ name: 'Heavy bombers', sub: hv ? hv.sub : 'B-1 / B-52 · RAF Fairford',
        tick: hv ? hv.tick : '', low: !!(hv && hv.low), group: (hv && hv.group) || 'go',
        have: G.res.heavy, cap: G.caps.heavy });
    } else {
      add({ name: 'Heavy bombers', group: 'away', sub: 'B-1 Dyess · B-52 Barksdale',
        val: G.heaviesOrdered ? `EN ROUTE ${G.heavyEta}T` : 'NOT DEPLOYED' });
    }

    add({ name: 'SOF task force', sub: 'Tier 1', have: G.res.specops, cap: G.caps.specops });
    return rows;
  }

  // The interceptor magazine gets its own heading rather than sitting under
  // CLEARED TO FLY with the strike magazines. It is the one row on the panel the
  // president does not spend — Tehran spends it — and filing it under what can
  // be tasked tonight would be the only line here that answers a question nobody
  // asked of it.
  const RES_GROUPS = [
    ['go', 'CLEARED TO FLY', ''],
    ['shield', 'WHAT DEFENDS THE RAMP', ''],
    ['held', 'NOT RELEASED', 'held'],
    ['away', 'NOT IN THEATER', 'away'],
  ];

  function assetHtml(r) {
    const off = r.group !== 'go';
    // The readiness word is a word in the value slot and gets the value slot's
    // narrow type, so a row that says BELOW A PACKAGE wraps to two lines instead
    // of pushing the aircraft name off the left of a 300px column.
    if (Game.difficulty().plainAssets) {
      const word = READY_WORD(r);
      const wCls = r.low || r.group === 'held' ? ' crit' : off || r.val ? ' off' : '';
      return `<div class="asset${r.tick ? ' ' + r.tick : ''}">` +
        `<span class="a-name">${r.name}<span class="a-sub${r.tick ? ' ' + r.tick : ''}">${r.sub}</span></span>` +
        `<span class="a-val word${wCls}">${word}</span></div>`;
    }
    const val = r.val ?? `${r.have} / ${r.cap}`;
    const vCls = r.val ? ' off' : r.low ? ' crit' : off ? ' off' : '';
    return `<div class="asset${r.tick ? ' ' + r.tick : ''}">` +
      `<span class="a-name">${r.name}<span class="a-sub${r.tick ? ' ' + r.tick : ''}">${r.sub}</span></span>` +
      `<span class="a-val${vCls}">${val}</span>` +
      (r.val ? '' : magBar(r.have, r.cap, off ? 'off' : r.low ? 'crit' : '')) +
      `</div>`;
  }

  // ---- WHERE THE DECKS ARE, ON A LEVEL WITH NO FLEET PANEL ----
  // THEATER FORCES came off easy's rail at v1.87 and CENTCOM took over the
  // orders behind it (DIFFICULTY.autoTheater), which is right — the force flow
  // is not a decision that level asks. But a carrier's STATION is not an order,
  // it is a fact about tonight that half this panel is downstream of: whether
  // the Aegis row is covering anything, whether the strait has weight on it,
  // whether there is a lid on the barrel, and how many sorties the wing is
  // generating. Removing the panel removed the only place that fact was
  // written. So the decks are reported here, where what they do is counted, and
  // only on the level that has nowhere else to read them.
  // Drawn through `carrierLine`, which is THEATER FORCES' own renderer, for the
  // reason coaRows and intelParts are shared: the two homes must not be able to
  // disagree about where a ship is. What this one drops is the note — the
  // paragraph under the label there is about what changing her station would
  // buy, and on this level nobody is changing it.
  function stationRows(G) {
    if (!Game.difficulty().autoTheater) return '';
    const rows = G.carriers.map((cv) => {
      const info = CARRIER_INFO[cv.id] || {};
      const line = carrierLine(cv, G);
      const label = line ? line.label
        : G.secondCarrierEta ? `EN ROUTE — ${turns(G.secondCarrierEta).toUpperCase()}`
        : 'NOT DEPLOYED';
      // The tick follows carrierLine's own class so the colour and the words
      // come from one decision: a withdrawal and a rearm are the two states this
      // panel is downstream of, and both read as something being off.
      const cls = !line ? 'off'
        : line.cls === 'cv-lost' ? 'crit'
        : line.cls === 'cv-forward' ? '' : 'off';
      return `<div class="asset"><span class="a-name">${info.name || cv.id}` +
        `<span class="a-sub">${line && line.cls === 'cv-forward'
          ? 'Full sortie generation, Aegis over the Gulf ramps'
          : 'Air wing flying · no forward presence'}</span></span>` +
        `<span class="a-val word ${cls}">${label}</span></div>`;
    }).join('');
    return `<div class="res-group"><div class="res-legend">CARRIER STRIKE GROUPS</div>${rows}</div>`;
  }

  function renderResources(G) {
    // ---- what gates tonight ----
    // Read BEFORE a target is clicked: the whole decision the ATO constant
    // exists to create is "what is the third package worth, and is there a
    // fourth", and a player who only learns the plan is spent from a refusal in
    // the strike modal is being asked to sequence a night they cannot see.
    const slots = Game.atoSlots();
    const flown = G.strikesThisTurn;
    const over = Math.max(0, flown - slots);
    const left = Math.max(0, slots - flown);
    const closed = flown >= slots + ATO.ceiling;
    const tk = G.tankers, cap = G.tankerCap || Game.tankerCapacity();
    // THE TASKING ORDER IS NOT THIS LEVEL'S PROBLEM. The gauge, the fraction and
    // every late-frag alert under them exist to price a decision the president
    // makes package by package on the map — and easy has no map targeting, no
    // strike dialog, and exactly one signature a night sized by the staff to the
    // plan. Nothing a player can do there puts a package past it, so a gauge
    // showing four solid boxes and four dashed ones is a mechanic being taught to
    // somebody who will never touch it, on the panel where they are supposed to
    // be reading what can fly. The plan is still what sizes the option — it is
    // simply CENTCOM's arithmetic on this level, and it is felt as a heavier
    // option rather than read as a fraction (see DIFFICULTY.strike).
    const showAto = !Game.difficulty().plainAssets;

    // Live state stays on the face of the box. Only the things that are true
    // tonight and would change how the player spends the next order — never the
    // standing rules, which are what the disclosure is for.
    const alerts = [];
    if (showAto) {
      if (closed) alerts.push(['crit', 'The order is closed — nothing else flies tonight.']);
      else if (over > 0) alerts.push(['crit', `${plural(over, 'late frag')} outside the plan — ` +
        'degraded, costing aircrew, one package off tomorrow each.']);
      else if (left === 0) alerts.push(['warn', 'The plan is spent. More can still be flown as late frags.']);
      if (G.fatigue) alerts.push(['warn', `${plural(G.fatigue, 'package')} held back for crew rest.`]);
    }
    if (!G.basing.gulf) alerts.push(['crit', 'Gulf ramps closed — nothing deep is reachable.']);
    else if (!G.basing.nato) alerts.push(['warn', showAto
      ? 'NATO and Saudi tanker tracks withdrawn.'
      : 'NATO and Saudi ramps withdrawn — the theater refuels from fewer places.']);
    // The depots, where anyone is counting them. Phrased in NIGHTS rather than
    // rounds for the same reason the Aegis line is tiered: "412 weapons" is a
    // number a player cannot price, and "three nights of fighting" is a
    // decision about whether tonight is the night to send the heavies.
    if (Game.pgmLedger()) {
      const n = Game.pgmNights();
      if (n < 1) alerts.push(['crit', 'Precision munitions exhausted — the depots cannot build up a package.']);
      else if (n < 3) alerts.push(['crit', `Precision munitions critical — about ${plural(Math.floor(n), 'night')} of ` +
        'fighting left in the depots.']);
      else if (n < 6) alerts.push(['warn', `Precision munitions running low — about ${Math.floor(n)} nights ` +
        'left at this tempo. The next shipment comes in with the force flow.']);
    }

    const whyText =
      `<p>${airPhaseNote(G)}</p>` +
      (showAto
        ? `<p>Tonight's order holds ${plural(slots, 'package')}. Past it a package still flies as a ` +
          `late frag — worse effects, a heavier aircrew roll, and one package charged against ` +
          `tomorrow's plan — until the order closes after the ${Txt.ordinal(slots + ATO.ceiling)}. ` +
          `The boat is not on the ` +
          `order: a torpedo attack is planned aboard the submarine.</p>`
        : `<p>CENTCOM writes tonight's tasking order and sizes the course of action to it — the ` +
          `packages in the option you sign are the packages the theater can actually fly tonight. ` +
          `It grows as the force flow lands.</p>`) +
      // The charge table prices a bill that is paid package by package on the
      // map. With the tanker plan off the face of the box it has nothing to
      // price, and a disclosure explaining a cost the body never states is the
      // badge quoting a tasking order all over again.
      (showAto
        ? `<p>Tanker charges — fighters: littoral unrefuelled · interior 1 · deep 2. Bombers tank at ` +
          `every depth: B-1/B-52 littoral 2 · interior 3 · deep 4 · B-2 mission 4. Tomahawks fly ` +
          `unrefuelled.</p>`
        : '');

    const atoCls = closed ? ' crit' : flown >= slots ? ' warn' : '';
    const tkCls = tk <= 1 ? ' crit' : tk <= 3 ? ' warn' : '';
    let html = `<div class="res-tonight${resWhyOpen ? ' open' : ''}">` +
      airPhaseBar(G) +
      (showAto
        ? `<div class="ton-row"><span>PACKAGES</span>` +
          `<span class="ton-val${atoCls}">${flown} / ${slots}</span></div>` +
          slotGauge(flown, slots, ATO.ceiling)
        : '') +
      // ...and the tanker plan goes with the tasking order, for the same reason.
      // It is the second half of the same arithmetic: a fighter costs one track
      // interior and two deep, and the only place that fraction is ever spent is
      // the strike dialog easy does not open. CENTCOM sizes the option to the
      // fuel it has, so on this level a short tanker plan is felt as a narrower
      // option and never read as "4 / 10".
      (showAto
        ? `<div class="ton-row"><span>TANKER TRACKS</span>` +
          `<span class="ton-val${tkCls}">${tk} / ${cap}</span></div>` +
          trackGauge(tk, cap)
        : '') +
      (Game.pgmLedger()
        ? `<div class="ton-row"><span>PRECISION MUNITIONS</span>` +
          `<span class="ton-val${Game.pgmNights() < 3 ? ' crit' : Game.pgmNights() < 6 ? ' warn' : ''}">` +
          `${G.pgm}</span></div>` : '') +
      alerts.map(([c, t]) => `<div class="ton-alert ${c}">${t}</div>`).join('') +
      `<button type="button" class="ton-why" aria-expanded="${resWhyOpen}">` +
      `<span class="why-caret" aria-hidden="true">▾</span>what this costs</button>` +
      `<div class="ton-text">${whyText}</div></div>`;

    // ---- what can fly ----
    const rows = assetRows(G);
    for (const [key, legend, cls] of RES_GROUPS) {
      const inGroup = rows.filter(r => r.group === key);
      if (!inGroup.length) continue;
      html += `<div class="res-group"><div class="res-legend ${cls}">${legend}</div>` +
        inGroup.map(assetHtml).join('') + `</div>`;
    }

    // ...and where the decks are, on the level with no THEATER FORCES to read it
    // off. Below the magazines rather than above them: the panel's first question
    // is still what can fly tonight, and a station is context for the answer.
    html += stationRows(G);

    // ---- what is already out ----
    // Split by whether the package can still be struck off tonight's order.
    // Anything fragged this turn has not rolled — it is a line on a document and
    // it can be scrubbed, magazine and fuel and all (see Game.recallMission).
    // Anything carried over from a previous night is genuinely airborne, and the
    // two must not look alike: a president who reads "RECALL" next to a B-2 nine
    // hours down-range has been told something that is not true.
    const onOrder = [], airborne = [];
    G.missions.forEach((m, i) => (m.turn === G.turn ? onOrder : airborne).push({ m, i }));

    const flightRow = ({ m, i }, recallable) => {
      const t = TARGETS.find(x => x.id === m.targetId);
      return `<div class="res-flight"><span class="tgt">→ ${t.short}</span>` +
        `<span class="eta">${m.eta > 1 ? `TOT ${m.eta}T` : 'TOT TONIGHT'}</span>` +
        (recallable
          ? `<button type="button" class="res-recall" data-mission="${i}" ` +
            `title="Strike this package off tonight's order — aircraft, fuel and the slot come back">` +
            `SCRUB</button>`
          : '') + `</div>`;
    };

    if (onOrder.length) {
      html += `<div class="res-group"><div class="res-legend">ON TONIGHT'S ORDER</div>` +
        onOrder.map(x => flightRow(x, true)).join('') +
        `<div class="res-note">Not yet rolled — scrubbing one returns the aircraft, the fuel and the slot.</div>` +
        `</div>`;
    }
    if (airborne.length) {
      html += `<div class="res-group"><div class="res-legend">AIRBORNE NOW</div>` +
        airborne.map(x => flightRow(x, false)).join('') + `</div>`;
    }

    $('resources-list').innerHTML = html;

    // Indexes are read off G.missions at render time and recallMission
    // re-renders, so the list the next click reads is always the current one.
    $('resources-list').querySelectorAll('.res-recall').forEach((b) => {
      b.addEventListener('click', () => Game.recallMission(+b.dataset.mission));
    });

    const why = $('resources-list').querySelector('.ton-why');
    if (why) why.addEventListener('click', () => {
      resWhyOpen = !resWhyOpen;
      why.closest('.res-tonight').classList.toggle('open', resWhyOpen);
      why.setAttribute('aria-expanded', String(resWhyOpen));
    });

    // Shut, the assets panel shows the magazine that actually runs out first —
    // which as of v1.28 is the tasking order and not the tanker plan. Tankers
    // were the binding constraint until v1.19 deliberately took them out of that
    // role; leaving the badge on them was the panel still reporting the old war.
    // Spelled out: PKG is ramp shorthand, and this badge is one of five words a
    // player sees before they have opened anything at all.
    // ...and on a level with no tasking order in the panel, the badge cannot
    // quote one. A shut panel reading "3 PACKAGES" over a body that never
    // mentions packages is the drawer describing a different level's game, which
    // is the same failure the primer is gated against — so it reports the one
    // thing this panel is now for, which is whether anything on it is a problem.
    if (showAto) {
      setBadge('resources',
        closed ? 'ORDER CLOSED'
          : left === 0 ? 'PLAN SPENT'
          : `${left} PACKAGE${left === 1 ? '' : 'S'}`,
        left === 0 ? '' : 'badge-none');
    } else {
      const bad = rows.filter(r => r.low || r.group === 'held').length;
      setBadge('resources', bad ? `${bad} SHORT` : 'ALL READY', bad ? '' : 'badge-none');
    }
    // The ladder itself, on the shut panel. The tonight box draws the full bar
    // with both release thresholds marked on it, but that lives inside the body
    // — and the phase is what decides whether the fourth-gen squadrons and the
    // heavies fly at all. A player who never opens this panel still has to know
    // which rung the campaign is on.
    const phaseNow = Game.airPhase();
    const rs = $('resources-status');
    if (rs) {
      rs.textContent = `— ${Game.PHASE_LABEL[phaseNow]} ${Math.round(Game.airSuperiority() * 100)}%`;
      rs.style.color = phaseNow === 'superiority' ? 'var(--green)'
        : phaseNow === 'degraded' ? 'var(--amber)' : 'var(--red)';
    }
    // bombers still on the long leg in get a transit card in the scope panel
    MapView.updateTransit(G.missions);
  }

  // ---- carrier strike groups ----
  // The panel answers three questions at a glance: where is each deck, what is
  // it worth there, and can it be shot at.
  //
  // These notes say what an asset IS doing. What it would cost to change that
  // is the order row underneath, which now carries the trade explicitly — so
  // the note no longer lists the Aegis umbrella, the weight on the strait and
  // the oil lid only for the button below it to list them again as the price.
  // State here, consequence there.
  function carrierLine(cv, G) {
    if (cv.lost) return { label: 'LOST', cls: 'cv-lost', note: 'Sunk in the Gulf of Oman.' };
    if (!cv.arrived) return null;   // handled by the order/ETA button below
    // A deck with one station reports the station and nothing else — there is no
    // "what it would cost to change that", so the note carries the trade she is
    // permanently on instead: no exposure, and no presence either.
    if (Game.carrierFixed(cv)) {
      return {
        label: 'ON STATION — RED SEA', cls: 'cv-back',
        note: (cv.damaged ? 'Battle damage: flying at a fraction of her rate. ' : '') +
          'Behind Suez: out of Iranian reach, and out of the Gulf presence entirely. Her air wing is what she brings.',
      };
    }
    // the rearm outranks the station: she is somewhere specific, doing something
    // specific, and cannot be ordered anywhere until it is finished
    if (Game.bmdRearming()) {
      return {
        label: `REARMING — ${turns(G.bmdRearm).toUpperCase()} ALONGSIDE`, cls: 'cv-moving',
        note: 'Escorts alongside the ammunition ship, striking down SM-3 and SM-6 one cell at a time. ' +
          'Full air wing, no umbrella over the Gulf bases, no weight on the strait.',
      };
    }
    if (cv.moving) {
      return {
        label: cv.moving === 'forward' ? 'CLOSING NORTH' : 'WITHDRAWING SOUTH',
        cls: 'cv-moving',
        note: 'Repositioning — full strike either way, but still inside the envelope until she is clear.',
      };
    }
    if (cv.posture === 'forward') {
      return {
        label: 'ON STATION — GULF OF OMAN', cls: 'cv-forward',
        note: (cv.damaged ? 'Battle damage: flying at a fraction of her rate. ' : '') +
          `Full sortie generation, ${Math.round(Game.bmdRate() * 100)}% of a Gulf salvo knocked down — ` +
          'and a hull inside Iranian anti-ship fires.',
      };
    }
    return {
      label: 'MID — ARABIAN SEA', cls: 'cv-back',
      note: (cv.damaged ? 'Battle damage: flying at a fraction of her rate. ' : '') +
        'Out of reach, and flying her full air wing.',
    };
  }

  // Where the Ford is tonight, leg by leg. An ETA alone does not say that the
  // middle of this transit is a ditch someone else schedules, and the plot she
  // is drawn on is west of the opening frame — so the only place most players
  // will ever read the canal is right here. Keyed by ETA, which ticks 5 down to
  // 1 across the five vertices of FORD_INGRESS (data.js); the two must stay in
  // step, and there is no third place that knows the route.
  const FORD_LEG = {
    5: 'Under way from the eastern Mediterranean',
    4: 'Closing the Egyptian coast',
    3: 'Holding off Port Said for a southbound convoy slot',
    2: 'In the canal — southbound through the Bitter Lakes',
    1: 'Out of Suez and into the northern Red Sea',
  };

  // ---- the bomber force ----
  // The 509th is a third piece of the deployment picture, and it competes with
  // the Ford for the same naval transit — so it lives in the same panel, where
  // the player can see both halves of the choice at once.
  function bomberLine(G) {
    if (G.bombersArrived) {
      return {
        label: 'ON THE RAMP — DIEGO GARCIA', cls: 'cv-forward',
        note: `${G.res.stealth} of ${plural(G.caps.stealth, 'mission')} generated. 2,900 nm south of the fight and out of Iranian reach.`,
      };
    }
    if (G.bombersOrdered) {
      return {
        label: 'EN ROUTE — WHITEMAN → DIEGO GARCIA', cls: 'cv-moving',
        note: `Crossing the Pacific on tankers — ${turns(G.bomberEta)} out.`,
      };
    }
    return {
      label: 'NOT IN THEATER', cls: 'cv-away',
      note: 'At Whiteman AFB, Missouri.',
    };
  }

  // ---- the heavy bomber force ----
  // The last piece of the deployment picture and the only one with a
  // precondition attached: the sky has to be at least breaking before anyone
  // will move it, and taken before anyone will fly it.
  function heavyLine(G) {
    if (G.heaviesArrived) {
      const released = Game.phaseAtLeast('superiority');
      return {
        label: released ? 'ON THE RAMP — RELEASED' : 'ON THE RAMP — NOT RELEASED',
        cls: released ? 'cv-forward' : 'cv-back',
        note: `${G.res.heavy} of ${plural(G.caps.heavy, 'mission')} generated. ` + (released
          ? 'Air superiority holds and the cells are on tonight\'s tasking order.'
          : 'They will not be tasked until the SAM belt is back down. Until then they are the most expensive parked aircraft in the world.'),
      };
    }
    if (G.heaviesOrdered) {
      return {
        label: 'EN ROUTE — CONUS → RAF FAIRFORD', cls: 'cv-moving',
        note: `Crossing the Atlantic on tankers — ${turns(G.heavyEta)} out.`,
      };
    }
    return {
      label: 'NOT IN THEATER', cls: 'cv-away',
      note: 'B-1s at Dyess and B-52s at Barksdale.',
    };
  }

  function renderFleet(G) {
    const box = $('fleet-list');
    if (!box) return;
    const naval = IranAI.navalStrength();
    const status = $('fleet-status');
    status.textContent = naval > 0 ? '— ANTI-SHIP THREAT ACTIVE' : '— THREAT NEUTRALIZED';
    status.style.color = naval > 0 ? 'var(--red)' : 'var(--green)';

    box.innerHTML = G.carriers.map(cv => {
      const info = CARRIER_INFO[cv.id];
      const st = carrierLine(cv, G);
      const head = `<div class="cv-head"><span class="cv-hull">${info.short}</span>` +
        `<span class="cv-state ${st ? st.cls : 'cv-away'}">${st ? st.label : 'NOT IN THEATER'}</span></div>`;
      // a deck that is not here yet has its whole story in the order row below
      const note = st ? st.note
        : G.secondCarrierOrdered
          ? `${FORD_LEG[G.secondCarrierEta] || 'Under way'} — ${turns(G.secondCarrierEta)} out.`
          : '';
      return `<div class="cv-row"><div class="cv-name dim">${info.name}</div>${head}` +
        `<div class="cv-note dim">${note}</div></div>`;
    }).join('');

    const bl = bomberLine(G);
    box.innerHTML +=
      `<div class="cv-row"><div class="cv-name dim">509th Bomb Wing — B-2 Spirit</div>` +
      `<div class="cv-head"><span class="cv-hull">B-2</span>` +
      `<span class="cv-state ${bl.cls}">${bl.label}</span></div>` +
      `<div class="cv-note dim">${bl.note}</div></div>`;

    const hl = heavyLine(G);
    box.innerHTML +=
      `<div class="cv-row"><div class="cv-name dim">Heavy Bomber Force — B-1B / B-52H</div>` +
      `<div class="cv-head"><span class="cv-hull">HEAVY</span>` +
      `<span class="cv-state ${hl.cls}">${hl.label}</span></div>` +
      `<div class="cv-note dim">${hl.note}</div></div>`;

    // one force flow a night: whichever deployment was ordered this turn holds
    // tonight's transit plan, and the other one goes out on tomorrow's
    const planCut = Game.transitCommitted();
    const bomberInbound = G.bombersOrdered && !G.bombersArrived;

    // Force-flow orders go through the shared action list like every other
    // tasking: the order and what it costs stay up, the explanation of what a
    // transit plan is folds away. Each entry needs its own data attribute
    // because these do not go through doDiplo — the wiring below reads them.
    const acts = [];

    G.carriers.forEach(cv => {
      const info = CARRIER_INFO[cv.id];
      if (cv.lost) return;
      if (!cv.arrived) {
        if (G.secondCarrierOrdered) {
          acts.push({ id: `cv-eta-${cv.id}`, attrs: '', name: `${info.short} EN ROUTE`,
            current: `ETA ${turns(G.secondCarrierEta)}.`,
            desc: 'She cannot be hurried.', disabled: true });
        } else if (planCut) {
          acts.push({ id: `cv-cut-${cv.id}`, attrs: '', name: 'NAVAL TRANSIT COMMITTED — B-2 FORCE MOVING',
            current: `${info.short} can be surged next turn.`,
            desc: 'Fifth Fleet cuts one transit plan a night, and tonight\'s is the 509th.',
            disabled: true });
        } else {
          acts.push({ id: `cv-surge-${cv.id}`, name: `SURGE ${info.short} TO THE THEATER`,
            attrs: 'data-carrier-order="1"',
            current: `${turns(Game.FORD_TRANSIT_TURNS)} out. Costs tonight's naval transit.`,
            desc: `Orders ${info.name} out of the Mediterranean and down through the Suez Canal; she takes ` +
              'station in the Red Sea and stays there. What you are buying is a second air wing — she is ' +
              'too far west to put Aegis over the Gulf bases or weight on the strait. Costs no money and ' +
              'no lives, but the B-2s cannot be moved until next turn.' });
        }
        return;
      }
      // one station, no order: say where she is and why there is no button
      if (Game.carrierFixed(cv)) {
        acts.push({ id: `cv-post-${cv.id}`, attrs: '', name: `${info.short} HOLDS THE RED SEA`,
          current: 'No station forward for her.',
          desc: 'Fifth Fleet keeps the second deck west of Suez. She flies her full air wing from there, ' +
            'and nothing Iran has reaches her.',
          disabled: true });
        return;
      }
      // Alongside the ammunition ship there is no order to give: the whole cost
      // of the rearm is that she cannot be sent anywhere while it runs, so the
      // panel says so in the same slot the posture order lives in.
      if (Game.bmdRearming()) {
        acts.push({ id: `cv-rearm-${cv.id}`, attrs: '', name: `${info.short} REARMING`,
          current: `${turns(G.bmdRearm)} alongside. Cells full when she breaks away.`,
          desc: 'She cannot be ordered north until the strike-down is finished, and she does not go ' +
            'north on her own when it is — putting the umbrella back over the Gulf bases is a separate ' +
            'order and another night.',
          disabled: true });
        return;
      }
      const fwd = cv.posture === 'forward';
      acts.push({
        id: `cv-post-${cv.id}`,
        name: cv.moving ? `${info.short} REPOSITIONING`
          : fwd ? `PULL ${info.short} BACK TO THE OPEN ARABIAN SEA`
          : `SEND ${info.short} FORWARD INTO THE GULF OF OMAN`,
        attrs: `data-carrier-toggle="${cv.id}"`,
        current: cv.moving ? 'Between stations until the end of the turn.'
          : fwd ? 'One turn, exposed until clear. Aegis, strait pressure and the oil lid come off with her.'
          : 'One turn, exposed until on station. Adds Aegis BMD, a harder strait, a lower oil premium.',
        desc: cv.moving ? 'The order is given.'
          : fwd ? 'Full strike either way — what you give up is the Aegis umbrella over the Gulf-state bases, the weight on the strait, and the lid on the oil premium.'
          : 'Full strike either way. The cost is a hull inside Iran\'s anti-ship envelope.',
        disabled: cv.moving,
      });

      // and the order that gets the umbrella back. Offered whatever her station,
      // because a deck already pulled back can still be out of interceptors —
      // and priced in nights either way (see NAVAL_BMD).
      const bmdPct = Math.round(Game.bmdFrac() * 100);
      acts.push({
        id: `cv-rearm-${cv.id}`,
        name: `REARM ${info.short}'S ESCORT SCREEN`,
        attrs: `data-carrier-rearm="${cv.id}"`,
        current: `${G.bmdPool} of ${plural(Game.bmdCapacity(), 'interceptor')} left — ${bmdPct}%. ` +
          `${turns(NAVAL_BMD.rearmTurns)} alongside, plus the night back north.`,
        desc: 'Detaches the strike group to the ammunition ship and strikes down a full load of SM-3 and ' +
          'SM-6. There is no way to do it on station — a Mk 41 cell is loaded by crane, alongside — so ' +
          'the price is the forward presence for three nights: no umbrella over Al Udeid and Al Dhafra, ' +
          'no weight on the strait, no lid on the oil premium. The magazine is spent by what Tehran ' +
          'throws, not by the calendar, so the launchers you service are also interceptors you keep.',
        disabled: bmdPct >= 100,
      });
    });

    if (!G.bombersArrived) {
      if (bomberInbound) {
        acts.push({ id: 'b2-eta', attrs: '', name: 'B-2 FORCE EN ROUTE', current: `ETA ${turns(G.bomberEta)}.`,
          desc: 'They land, they get built up, then they fly.', disabled: true });
      } else if (planCut) {
        acts.push({ id: 'b2-cut', attrs: '', name: 'NAVAL TRANSIT COMMITTED — FORD UNDER WAY',
          current: 'The 509th moves on tomorrow\'s plan.',
          desc: 'Tonight\'s transit plan is the carrier surge. They do not wait on her arrival.',
          disabled: true });
      } else {
        acts.push({ id: 'b2-go', name: 'DEPLOY B-2 FORCE — WHITEMAN → DIEGO GARCIA',
          attrs: 'data-bomber-order="1"',
          current: `${turns(Game.B2_TRANSIT_TURNS)} out. Unlocks the GBU-57 — the only way to reach Fordow.`,
          desc: 'Moves the 509th into theater. Takes tonight\'s naval transit, so the ' +
            `${CARRIER_INFO['csg-ford'].short} cannot be surged until next turn.` });
      }
    }

    // the heavies want the sky to be breaking before anyone will move them, and
    // they take a transit slot like everything else
    if (!G.heaviesArrived) {
      if (G.heaviesOrdered) {
        acts.push({ id: 'hv-eta', attrs: '', name: 'HEAVY BOMBER FORCE EN ROUTE',
          current: `ETA ${turns(G.heavyEta)} to RAF Fairford.`, disabled: true });
      } else if (!Game.phaseAtLeast('degraded')) {
        acts.push({ id: 'hv-blocked', attrs: '', name: 'HEAVY BOMBERS — AIRSPACE STILL CONTESTED',
          current: 'Degrade the air defense network first.',
          desc: 'Air Combat Command will not flow B-1s and B-52s into a theater with an intact SAM belt.',
          disabled: true });
      } else if (planCut) {
        acts.push({ id: 'hv-cut', attrs: '', name: 'TRANSIT COMMITTED — ANOTHER FORCE IS MOVING',
          current: 'The heavies go out on tomorrow\'s plan.',
          desc: 'One force flow a night.', disabled: true });
      } else {
        acts.push({ id: 'hv-go', name: 'DEPLOY HEAVY BOMBER FORCE — CONUS → RAF FAIRFORD',
          attrs: 'data-heavy-order="1"',
          current: `${turns(Game.HEAVY_TRANSIT_TURNS)} out. Roughly half again a fighter package per target.`,
          desc: 'Moves the B-1 and B-52 force into theater. They will not be tasked until air superiority ' +
            'is declared, so calling them early is a bet on the campaign going well.' });
      }
    }

    $('fleet-buttons').innerHTML = actionButtons(acts, false);
    for (const btn of $('fleet-buttons').querySelectorAll('.action-do')) {
      if (btn.dataset.carrierOrder) btn.addEventListener('click', () => Game.orderCarrier());
      else if (btn.dataset.bomberOrder) btn.addEventListener('click', () => Game.orderBombers());
      else if (btn.dataset.heavyOrder) btn.addEventListener('click', () => Game.orderHeavies());
      else if (btn.dataset.carrierRearm) btn.addEventListener('click', () => Game.orderRearm());
      else if (btn.dataset.carrierToggle) {
        btn.addEventListener('click', () => Game.toggleCarrierPosture(btn.dataset.carrierToggle));
      }
    }
    wireWhy('#fleet-buttons');
  }

  // Which advisors the player has opened, and the turn that was true for.
  // Deliberately NOT on `G` and NOT in save/load `FIELDS`: what you had open
  // when you quit is not part of the war, and an advisor says something
  // different every turn, so carrying an expansion across the turn boundary
  // would reopen a paragraph the player never asked for. Cleared on the turn
  // roll; survives the many re-renders inside one turn, which is the point.
  let advOpen = new Set();
  let advTurn = 0;

  // ---- the four faces in the room ----
  // Shoulder-up busts in the same vocabulary the map's SIL table already
  // speaks: one solid closed path each, no strokes, no gradients, nothing
  // finer than the CRT look carries. Collapsed, the panel was four lines of
  // text that read as one block; the point of these is that the player can
  // tell who is talking before reading a word.
  //
  // Keyed by NAME rather than by cls, because NSA Reyes has an empty cls and so
  // cls is not a unique key across the four of them. And the table
  // lives here rather than in ai.js because ai.js owns what an advisor says —
  // how one is drawn is presentation.
  //
  // Deliberately faceless. At 15px a mouth or a pair of eyes is four grey
  // pixels that read as a smudge, and the moment they resolve at all the panel
  // stops looking like a briefing and starts looking like a cartoon. So the
  // identification is carried entirely by OUTLINE, which is the only thing
  // that survives at this size: headwear first, then shoulder width, then the
  // collar, then the crown. Four axes, one per advisor.
  //
  // All 0 0 24 24, all drawn counterclockwise from the bottom-left corner:
  // up the left shoulder, up the neck, around the head, down the right.
  const ADV_ICON = {
    // Heaviest build in the room and the widest shoulders — they run the full
    // box. Close-cropped: the crown is squared off rather than domed, which is
    // the one head shape here that reads as flat at 15px. Notched lapel cut up
    // out of the bottom edge, the only bust with one.
    'SecDef Whitfield':
      'M0.8,24 C0.8,19.4 4.4,16.8 9.2,16 L9.6,12.3 ' +
      'C8.2,11.5 7,9.8 6.8,7.8 L6.8,4.8 C6.8,3 9,2.2 12,2.2 ' +
      'C15,2.2 17.2,3 17.2,4.8 L17.2,7.8 C17,9.8 15.8,11.5 14.4,12.3 ' +
      'L14.8,16 C19.6,16.8 23.2,19.4 23.2,24 L13.9,24 L12,19.9 L10.1,24 Z',
    // The narrow one: shoulders inset three units on each side, a longer neck,
    // and a taller, rounder skull. Closed collar, no notch — read against
    // Whitfield's lapel it is the whole difference between the two civilians
    // who flank the argument.
    'SecState Okafor':
      'M3.2,24 C3.2,19.6 6.2,17.2 9.8,16.4 L10.1,12 ' +
      'C8.4,11 7.4,9.2 7.4,7.4 C7.4,4.3 9.5,2.2 12,2.2 ' +
      'C14.5,2.2 16.6,4.3 16.6,7.4 C16.6,9.2 15.6,11 13.9,12 ' +
      'L14.2,16.4 C17.8,17.2 20.8,19.6 20.8,24 Z',
    // The third civilian, and the hardest to separate from the other two, so
    // it takes the middle of every axis — shoulders between Whitfield's and
    // Okafor's, no collar detail — and earns its silhouette at the top
    // instead: a fuller head of hair swept over the left temple, the only
    // asymmetric outline in the set.
    'NSA Reyes':
      'M2.2,24 C2.2,19.4 5.6,16.8 9.6,16 L9.9,12.2 ' +
      'C8.4,11.4 7.2,9.9 6.9,8.2 C6.4,7.7 6.3,6.6 6.6,5.4 ' +
      'C7.1,3.2 9.2,1.9 12,1.9 C15.1,1.9 17.3,3.5 17.3,6 L17.1,8.2 ' +
      'C16.8,9.9 15.6,11.4 14.1,12.2 L14.4,16 ' +
      'C18.4,16.8 21.8,19.4 21.8,24 Z',
    // Service cap, and it does all the work — nothing else in the panel has
    // anything above the brow line. The bill is drawn wider than the head and
    // a full two units deep, exaggerated past scale for the same reason the
    // map's F-15 dogtooth is: a true-depth visor is one pixel of nothing here.
    // Crown flares outward as it rises, which is what makes it a peaked cap
    // rather than a hat. Shoulders are wide and flatter than the civilians'.
    'Gen. Halvorsen, CJCS':
      'M1.4,24 C1.4,18.6 4.6,16.9 9.4,16.1 L9.7,12.4 ' +
      'C8.4,11.6 7.4,10.4 7.1,9.1 L3.6,9.3 L6.3,6.9 L5.6,3.6 ' +
      'C5.6,2.4 8.2,1.8 12,1.8 C15.8,1.8 18.4,2.4 18.4,3.6 L17.7,6.9 ' +
      'L20.4,9.3 L16.9,9.1 C16.6,10.4 15.6,11.6 14.3,12.4 L14.6,16.1 ' +
      'C19.4,16.9 22.6,18.6 22.6,24 Z'
  };

  // aria-hidden because the name is already in the button as text — the bust
  // is decoration on top of it, not a second label. The empty span is not
  // dead code: if a name in advise() ever changes without this table
  // following, the column still gets filled and the four names stay aligned
  // instead of one of them jumping 21px left.
  function advIcon(name) {
    const d = ADV_ICON[name];
    return d
      ? `<svg class="adv-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/></svg>`
      : '<span class="adv-icon" aria-hidden="true"></span>';
  }

  // The watch card's portrait is this same capped bust, reused rather than
  // redrawn. What it identifies is A UNIFORMED OFFICER, which is all the card
  // ever claims — the billet printed beside it says which one, and it is never
  // the Chairman (see VOICE in audio.js for why). A second, near-identical
  // silhouette drawn to avoid the association would be worse: two busts to keep
  // in sync, and a player would read them as the same person anyway.
  function officerBust() {
    return `<svg viewBox="0 0 24 24" aria-hidden="true">` +
      `<path d="${ADV_ICON['Gen. Halvorsen, CJCS']}"/></svg>`;
  }

  function renderAdvisors(G) {
    const advice = IranAI.advise(G);

    if (advTurn !== G.turn) { advOpen = new Set(); advTurn = G.turn; }

    // NOTHING OPENS ITSELF HERE. Through v1.92 the highest-priority urgent
    // advisor had their paragraph pushed open on every render, on the argument
    // that an urgent condition should not be behind a caret. Two things are
    // wrong with it. An advisor's paragraph runs four to six sentences, so one
    // auto-opened bust turns a four-line panel into most of a landscape phone's
    // scroll pane and pushes the other three names under the fold — the panel
    // stops being a room and becomes one person talking. And it fought the
    // player: `advOpen` is cleared at the turn roll but re-seeded on every draw,
    // so a president who shut the paragraph had it reopen the next time anything
    // on the board moved, which on a resolving turn is several times a second.
    //
    // The urgency is not lost, and this is why it can go: `a.line` is the
    // advisor's one-line position and it is ON the collapsed head, the URGENT
    // flag is beside their name, the count is in the panel's meta row, and the
    // rail chip carries it when the panel is shut. Four places say it. The
    // paragraph is the ARGUMENT, and an argument is something a president asks
    // for.
    $('advisors-list').innerHTML = advice.map(a => {
      const open = advOpen.has(a.name);
      return `<div class="advisor ${a.cls}${a.urgent ? ' urgent' : ''}${open ? ' open' : ''}" data-adv="${a.name}">` +
        `<button type="button" class="adv-head" aria-expanded="${open}">` +
        `<span class="adv-caret" aria-hidden="true">▾</span>` +
        advIcon(a.name) +
        `<span class="adv-name">${a.name}</span>` +
        (a.urgent ? '<span class="adv-flag">URGENT</span>' : '') +
        `<span class="adv-line">${a.line}</span>` +
        `</button>` +
        `<div class="adv-text">${a.text}</div></div>`;
    }).join('');

    for (const head of $('advisors-list').querySelectorAll('.adv-head')) {
      head.addEventListener('click', () => {
        const box = head.parentElement;
        const key = box.dataset.adv;
        const open = !box.classList.contains('open');
        box.classList.toggle('open', open);
        head.setAttribute('aria-expanded', String(open));
        if (open) advOpen.add(key); else advOpen.delete(key);
      });
    }

    // The panel is collapsed most of the time, so the header is the only place
    // an urgent advisor can be seen without opening anything. This goes in the
    // meta line rather than the badge for the same reason the fleet's threat
    // warning does: "SITUATION ROOM — ADVISORS" is long enough that a badge
    // beside it wraps the title, and the meta row is already the slot for a
    // condition rather than a count.
    const urgent = advice.filter(a => a.urgent).length;
    const status = $('advisors-status');
    if (!status) return;
    // lowercase noun: the meta row is uppercased by CSS, and plural() would
    // otherwise pluralise "ADVISOR" to "ADVISORs"
    status.textContent = urgent ? `— ${plural(urgent, 'advisor')} flagged urgent` : '';
    status.style.color = 'var(--red)';
  }

  // ---- Jerusalem's two orders ----
  // The gauge these used to carry is in THE WORLD now (see renderWorld). It was
  // `extra` on the coordinate order through v1.79, which put the only clock in
  // this game another government owns on a row that goes dead the moment the
  // order is taken — a coordinated Israel disables the button, and the gauge
  // greys out with it while the clock underneath goes on running.
  function israelActions(G) {
    const posture = G.israelPosture;
    const cost = Game.israelHoldCost();
    const out = [];

    out.push({
      id: 'israel', name: 'Coordinate with Israel',
      moves: 'JERUSALEM',
      current: posture === 'coordinated'
        ? (G.israelJointAvailable
            ? 'Israel is in. Joint deep-strike package ON THE BOARD.'
            : 'Israel is in. The joint slot returns when they next fly.')
        : posture === 'unilateral'
          ? 'Too late — Israel is running its own war now.'
          : 'World opinion −8, a standing price abroad, and a bill at home every night they fly.',
      desc: posture === 'sidelined'
        ? 'Brings the IAF in openly. Fighter capacity, +half a package a night on the tasking order from their ' +
          'escort and SEAD, three of their aimpoints serviced every night they fly, and a joint deep-strike ' +
          'package against Natanz or Fordow — the only path to the buried halls that does not need a B-2. It ' +
          'also inverts the JERUSALEM gauge: instead of flying alone when their patience runs out, they fly ' +
          'inside your plan, and the joint package comes back every time they do. ' +
          'The bill is standing rather than one-off — this war stops recovering abroad past a lower ceiling, ' +
          'Iran starts shooting at Israel on our account, and every Israeli night costs you at home. They are ' +
          'an ally, not a squadron: they do not always wait for the gauge, and about half their nights end with ' +
          'a second element over the power stations and the river crossings. You will answer for those.'
        : posture === 'coordinated'
          ? 'They are inside the tasking order. When the JERUSALEM gauge fills they fly your corridor against ' +
            'their own aimpoints — sometimes before it fills, and often past the agreed list onto the grid and ' +
            'the crossings, which is charged to you abroad and at home. The joint deep-strike slot re-arms ' +
            'every time they fly. What is filling the gauge is in THE WORLD, above.'
          : 'They went alone and they will go again, on their own timetable. Nothing recovers abroad while ' +
            'that is true. What is driving the next one is in THE WORLD, above.',
      disabled: posture !== 'sidelined',
    });

    // Only offered while they are sidelined. A coordinated Israel flying is a
    // free package and there is nothing to restrain; a unilateral one has stopped
    // taking the call. That asymmetry is the mechanic, not an oversight.
    if (posture === 'sidelined') {
      out.push({
        id: 'restrain', name: 'Ask Jerusalem to hold',
        moves: 'JERUSALEM',
        current: cost.left <= 0
          ? 'Jerusalem will not take the call again.'
          : `Pressure −${cost.relief}, approval −${cost.approval}. ${plural(cost.left, 'ask')} left.`,
        desc: cost.left <= 0
          ? ''
          : `Buys ${turns(3)} of Israeli restraint. The only lever on that gauge that is not a bomb, and one ` +
            'of the two orders here billed at home instead of abroad: leaning on Jerusalem in public costs a ' +
            'wartime president, and the Hill counts it when the authorization comes up. Each ask is worth less ' +
            'than the last and costs more.',
        disabled: cost.left <= 0,
      });
    }
    return out;
  }

  // ---- tonight's staffed options ----
  // The whole easy-mode game, and half the normal one. See COURSES OF ACTION in
  // game.js for what a course of action is; this draws it.
  //
  // Three rules, and the first two are the reason it does not just print the
  // legs in a list. A COA is an ARGUMENT — a name, an intent, and a reason —
  // and the aimpoints are the evidence for it, so the pitch is above the fold
  // and the target list is behind the same disclosure caret every other order
  // in this sidebar uses. A player who wants to audit the staff can; a player
  // who wants to be a president does not have to. Second, the MAIN EFFORT and
  // the supporting packages are drawn apart, because what is being chosen is
  // the main effort and burying it in a flat list of six sites would misrepresent
  // the choice as a target list — which is the one thing this panel exists to
  // stop being. Third, an option already flown is not removed: it stays,
  // marked, because the packages are still scrubbable off tonight's order and a
  // player who signed the wrong one needs to see what they signed.
  //
  // v1.82 — WHAT IS ABOVE THE FOLD IS NOW TONIGHT, NOT THE DOCTRINE. The
  // collapsed row used to carry the intent's standing one-liner, which is the
  // same sentence on turn 2 and turn 27; a player scanning three options was
  // reading three slogans and choosing between the names. It now carries
  // `read` — the board fact that put this doctrine where it is in the ranking —
  // and, under the cost strip, `defers`: the worst thing this option does not
  // do, in the words the option that WOULD do it uses. Those two lines are the
  // decision. The doctrine's own slogan is not gone, it has moved behind the
  // caret to sit at the head of its argument where it reads as a thesis
  // statement rather than as a description of tonight.
  // The option cards themselves, built once and rendered into either of the two
  // places the brief can arrive — the sidebar panel, or the dialog on a level
  // that pops it. Extracted for that reason and no other: two copies of this
  // markup is two places for a bill row or a `defers` line to go missing from,
  // and the whole argument for `defers` is that the player sees it every time.
  // THE SURGE IS A BAR, NOT A FOURTH CARD (v2.07). It is the only option in the
  // game that does not exist until the president has already answered the room —
  // signing the night is what creates it — so as a card it arrived on top of the
  // decision just made, in the shape of the three cards that decision was
  // between. That reads as a pop-up: the same box asking the same kind of
  // question again, one click after it was answered.
  //
  // Drawn across the bottom of the room instead, under a rule, from the moment
  // the folder opens — greyed and saying what it is waiting for (Game.surgeState),
  // live once the plan is signed. Nothing appears and nothing moves; one line
  // changes state in a place the president has already looked at.
  //
  // The button keeps `action-do` so both homes' existing wiring fires it — the
  // panel and the room each already bind every `.action-do` in their container to
  // takeCoa — and adds `surge-do` so it is not one of the three cards to anything
  // reading this markup.
  function surgeBar() {
    const st = Game.surgeState();
    if (!st) return '';                       // normal and hard have no surge
    const c = st.opt;
    return `<div class="coa-surge${st.ready ? '' : ' off'}">` +
      `<button class="action-do surge-do" data-coa="surge"${st.ready ? '' : ' disabled'}>` +
      `<span class="surge-head"><span class="coa-slot">SURGE</span>` +
      `<span class="surge-line">Fly extra sorties tonight.</span>` +
      `<span class="surge-cost">${st.ready
        ? `${plural(c.legs.length, 'package')}${c.shape ? ` · ${c.shape}` : ''}`
        : st.why}</span></span>` +
      // The price, on the face of it, exactly as a card carries it: this is a
      // loan against tomorrow's plan and it is the whole reason the bar is a
      // decision rather than a bonus.
      (st.ready && c.defers ? `<span class="coa-defers">LEAVES — ${c.defers}</span>` : '') +
      `</button></div>`;
  }

  function coaRows(G, list) {
    const flown = Game.coaFlown();
    const spent = Game.atoSlots() - G.strikesThisTurn;
    // Whether the president has any signature left tonight. On a level with a
    // budget (DIFFICULTY.coaSigns) the options that were not taken do not vanish
    // when one is signed — they stay on the card stack, greyed, saying what the
    // night went to instead. Removing them would answer the one question a
    // president asks after signing, which is what they gave up.
    const spare = Game.coaSignsLeft();
    // The surge comes out of the card stack here and is drawn as the bar below
    // it — same slate, same object, one renderer, per surgeBar above.
    return list.filter((c) => !c.surge).map((c) => {
      const done = flown.has(c.id);
      const shut = !done && spare <= 0;
      const open = actOpen.has(`coa-${c.id}`);
      const main = c.legs.filter(l => l.main), supp = c.legs.filter(l => !l.main);
      const nameOf = (l) => {
        const t = TARGETS.find(x => x.id === l.targetId);
        return t ? `${t.name.split(' — ')[0]} <span class="dim">· ${l.pkg.label}</span>` : l.targetId;
      };
      const legList = (arr, label) => arr.length
        ? `<div class="coa-leg-head">${label}</div>` +
          arr.map(l => `<div class="coa-leg">${nameOf(l)}</div>`).join('')
        : '';
      const bill = (c.bill || []).map(x =>
        `<span class="coa-chip${x.warn ? ' warn' : ''}"><b>${x.k}</b> ${x.v}</span>`).join('');
      return `<div class="action coa${done || shut ? ' off' : ''}${open ? ' open' : ''}" data-action="coa-${c.id}">` +
        `<button class="action-do" data-coa="${c.id}" ${done || shut ? 'disabled' : ''}>` +
        `<span class="action-name"><span class="coa-slot">${c.slot}</span> ${c.name}</span>` +
        `<span class="il-current">${c.read || c.line}</span>` +
        `<span class="coa-cost">${done ? 'SIGNED — ON TONIGHT\'S ORDER'
          : shut ? 'NOT TONIGHT — THE NIGHT IS SIGNED'
          : `${plural(c.legs.length, 'package')}${c.shape ? ` · ${c.shape}` : ''}${spent > 0 && c.legs.length > spent
            ? ` · ${c.legs.length - spent} past the plan` : ''}`}</span>` +
        // The tradeoff, and it is deliberately on the face of the button rather
        // than behind the caret: an option that only shows what it buys is a
        // pitch, and three pitches is not a decision. Absent — not blank — when
        // there is genuinely nothing else on the board, which is a real and
        // rare state and reads as one.
        (c.defers && !done && !shut ? `<span class="coa-defers">LEAVES — ${c.defers}</span>` : '') +
        `</button>` +
        `<button type="button" class="action-why" aria-expanded="${open}" ` +
        `aria-label="What this option flies, and why"><span class="why-caret">▾</span></button>` +
        `<div class="action-desc">` +
        `<div class="coa-thesis">${c.line}</div>${c.why}` +
        (c.est ? `<div class="coa-est">${c.est}</div>` : '') +
        (bill ? `<div class="coa-bill">${bill}</div>` : '') +
        `<div class="coa-legs">${legList(main, 'MAIN EFFORT')}${legList(supp, 'AND WITH THE REMAINING CAPACITY')}</div>` +
        `</div></div>`;
    }).join('') + surgeBar();
  }

  // An empty brief is a real state — everything reachable is serviced, or the
  // sky has not released anything the staff would sign its name to — and it has
  // to say which rather than rendering a blank box.
  const COA_EMPTY = '<div class="coa-empty">The staff has nothing to brief tonight. ' +
    'Every aimpoint CENTCOM can reach and release is either serviced or waiting on ' +
    'something the tasking order cannot buy.</div>';

  function renderCoa(G) {
    const panel = $('coa-panel');
    const list = Game.briefOptions();
    // hard briefs nothing at all, and the panel is not there to say so
    if (!Game.difficulty().coa) { panel.classList.add('hidden'); return; }
    panel.classList.remove('hidden');

    const flown = Game.coaFlown();
    $('coa-status').textContent = flown.size
      ? `— ${flown.size} SIGNED`
      : list.length ? `— ${plural(list.length, 'option')}` : '— NONE TONIGHT';

    // COA_EMPTY still carries the bar: a night the staff cannot brief is a night
    // the surge line is the only thing in the panel with an answer in it.
    $('coa-buttons').innerHTML = list.length ? coaRows(G, list) : COA_EMPTY + surgeBar();
    if (!list.length) return;
    for (const btn of document.querySelectorAll('#coa-buttons .action-do')) {
      btn.addEventListener('click', () => Game.takeCoa(btn.dataset.coa));
    }
    wireWhy('#coa-buttons');
  }

  // ============================================================
  // THE EVENING BRIEF, AS THREE ROOMS — DIFFICULTY.popups
  // ------------------------------------------------------------
  // The same decisions, in the room instead of in a drawer. What the dialog adds
  // is not content, it is that the night ASKS: on a level where signing one
  // option is the entire decision, a shut panel over the words "3 OPTIONS" is
  // the one arrangement of this screen where a president can end a turn without
  // knowing they were asked anything. A dialog cannot be scrolled past.
  //
  // v1.90 put the two free action slots INSIDE that one dialog, as sections
  // under the courses of action, and the argument for it was the pop-up count:
  // three dialogs a night is the number at which dialogs stop being read. That
  // argument was right about the count and wrong about the shape. A section is
  // only read if the reader gets to it, and what actually shipped was a single
  // scroll running the collection picture, three courses of action, three
  // diplomatic tracks and two spent-slot notices down one 86vh box — on a level
  // whose entire premise is that the president is not asked to sort things. The
  // slot the folder came in here to stop them missing was the LAST thing in it.
  //
  // So it is three rooms and one shell, walked in order. Intelligence first
  // because knowing precedes doing and because the collection picture is what
  // the other two rooms are argued from; CENTCOM second because signing an
  // option is the night; State last because a cable is what the president sends
  // once they know what the war did. One dialog is still open at a time, which
  // is what the pop-up-count argument was actually protecting: this is one
  // briefing with three folders in it, not three briefings.
  //
  // Everything visible is written from the stage descriptor — the title, the
  // seal, the preamble, the orders, the footer. Adding a fourth room is one
  // entry here plus its key in `popups`, the same bargain BRIEF_SLOTS made and
  // for the same reason: a second copy of this markup is how a decision goes
  // missing from one of the two homes it is meant to have.
  //
  // Two rules carried forward unchanged, both of which were bugs first.
  // `body` draws its rows with `actionButtons` (or coaRows) and NOTHING else, so
  // the drawer and the room cannot drift about what a row says — what a room may
  // vary is which orders it feeds in, which is why intelligence hands over its
  // whole deck and diplomacy ranks eleven cables down to three. And the orders
  // land in a container whose id ends in `-buttons`, because order containers
  // are matched by shape (`.modal [id$="-buttons"]`) and a container named
  // anything else renders every row as a native white centred button.
  // `who` is the fourth thing off the descriptor and the newest. The seal says
  // which DEPARTMENT walked in, which a player reads as heraldry the first time
  // and stops reading by turn three — and the four faces in the sidebar are the
  // people this game has spent five versions making the president recognise. A
  // room with the NSA's seal over it and nobody's name in it is a folder; a room
  // that says Reyes is briefing it is a meeting. Same names, spelled the same
  // way, as ADV_ICON and advise() use, because they are the same people.
  const BRIEF_STAGES = [
    {
      key: 'intel', room: 'INTELLIGENCE', seal: 'icons/seal-nsa.png?v=1.91',
      who: 'NSA Reyes', role: 'National Security Advisor',
      live: (G) => !G.intelUsed,
      count: (G) => (G.intelUsed ? 'SLOT SPENT TONIGHT' : '1 TASKING'),
      body: intelParts,
    },
    {
      key: 'brief', room: 'STRIKE OPTIONS', seal: 'icons/seal-dod.png?v=1.91',
      who: 'Gen. Halvorsen', role: 'Chairman of the Joint Chiefs',
      notes: true,
      // The staff's room is "live" while there is an option left unsigned AND
      // the president still has a signature to spend on it. The second half is
      // v1.93's: with a budget of one (DIFFICULTY.coaSigns), two unsigned cards
      // sitting behind a spent signature is not a decision, and a folder that
      // walked back into this room to show them would be re-asking a question it
      // has already refused to accept a second answer to. The cards themselves
      // do stay, greyed — see coaRows — for anyone who walks BACK.
      // ...and it is live again once the night is SIGNED, if the staff can put
      // something up past the plan (v2.01). That is the one case where a room
      // gains a decision by being answered rather than losing one: the surge
      // does not exist until the signature that creates it, so a chain that
      // walked past this room on the signature would put the only door to it
      // behind a second press of BRIEF ME. It cannot loop — a signed surge
      // makes surgeOption() null.
      live: (G, opts) => (Game.coaSignsLeft() > 0 && opts.length > Game.coaFlown().size)
        || !!Game.surgeOption(),
      count: (G, opts) => {
        const flown = Game.coaFlown().size;
        // A signed night that can still put weight up says so, because that is
        // the only reason the folder has walked back into this room at all.
        if (flown && Game.surgeOption()) return `${flown} SIGNED — SURGE AVAILABLE`;
        // Counted through Txt like every other number in a sentence, then cased
        // — inflecting an already-shouted noun gets you "3 OPTIONs". With
        // nothing staffed it says so rather than reading "0 OPTIONS", which is
        // what a folder opened for its slots alone would otherwise be titled on
        // the nights that matter most for the slot.
        if (flown) return `${flown} SIGNED`;
        if (!opts.length) return 'NO OPTIONS TONIGHT';
        // The budget belongs in the count, because it is the rule that decides
        // how the president should read the three cards under it — three things
        // to choose between, not three things to take.
        const cap = Game.coaSignsLeft();
        return isFinite(cap) && cap === 1 && opts.length > 1
          ? `${plural(opts.length, 'option').toUpperCase()} — SIGN ONE`
          : plural(opts.length, 'option').toUpperCase();
      },
      body: (G, opts) => ({ head: '', rows: opts.length ? coaRows(G, opts) : COA_EMPTY + surgeBar() }),
    },
    {
      key: 'diplo', room: 'DIPLOMATIC ACTIONS', seal: 'icons/seal-state.png?v=1.91',
      who: 'SecState Okafor', role: 'Secretary of State',
      live: (G) => !G.diploUsed,
      count: (G) => (G.diploUsed ? 'ORDER GIVEN' : '1 ORDER'),
      body: (G) => ({ head: '', rows: diploBody(G) }),
    },
  ];

  // Which rooms this level actually holds. A level that pops the brief but not
  // the slots (there is no such level today, and there is no reason there could
  // not be) gets a one-room briefing and a footer with no NEXT in it.
  const briefRooms = () => BRIEF_STAGES.filter((s) => Game.popup(s.key));

  // Whether any free action slot this level briefs still has its order in it.
  // Read by Game.openBrief to decide whether the folder is worth arming on a
  // night the staff has nothing to sign — an unspent slot is a decision, so it
  // is. Kept under its v1.90 name because game.js and the harness both call it,
  // and because "slot" is still exactly what it means: the strike room is not a
  // slot and is deliberately not counted here.
  function briefSlotPending() {
    const G = Game.G;
    return !G.over && briefRooms().some((s) => s.key !== 'brief' && s.live(G, []));
  }

  // Tonight's folder, as the dialog is holding it. `briefAt` is where the chain
  // RESUMES rather than where it is: a president who gives an order out of the
  // intelligence room has the room close on them (see the wiring below), and
  // BRIEF ME should put them in front of CENTCOM rather than back in front of a
  // slot they just spent. Module-local and reset on the turn roll, like
  // readLead's damper and stateHeard — no FIELDS entry and no VERSION bump,
  // because a resumed war has never opened tonight's folder at all.
  //
  // `briefResume` is the other half of it. An order given in a free action slot
  // comes back as a dialog of its own — the intelligence product, the cable, and
  // sometimes an ally's phone call behind it — so those two rooms cannot simply
  // re-dress themselves in place the way the strike room can; the folder has to
  // stand down over the answer and walk back in once it has been read. See
  // resumeBrief for where that lands.
  let briefOptions = [], briefNotes = null, briefAt = 0, briefTurn = -1, briefRoom = 0;
  let briefResume = false;

  function briefReset() {
    if (briefTurn === Game.G.turn) return;
    briefTurn = Game.G.turn; briefAt = 0; briefResume = false;
  }

  // The whole briefing, opened at the first room that still has a decision in
  // it. `list` and `notes` are what game.js hands over — the options it already
  // computed, and tonight's theater notes if this is the first reading.
  function openBrief(list, notes) {
    const G = Game.G;
    if (G.over) return;
    briefReset();
    briefOptions = list || (Game.difficulty().coa ? Game.briefOptions() : []);
    briefNotes = notes;

    const rooms = briefRooms();
    // Nothing to brief, nothing to report AND no slot still holding an order is
    // not an empty dialog, it is no dialog. The panel path says "NONE TONIGHT"
    // in a status line the player is already looking at; the dialog path would
    // have to interrupt them to say it.
    if (!rooms.length ||
        (!briefOptions.length && !(notes && notes.length) && !briefSlotPending())) {
      syncBriefButton(); return;
    }

    let at = rooms.findIndex((s, n) => n >= briefAt && s.live(G, briefOptions));
    if (at < 0) at = rooms.findIndex((s) => s.live(G, briefOptions));
    showRoom(at < 0 ? Math.min(briefAt, rooms.length - 1) : at);
  }

  // Dress the shell as one of the three. Called on open, on NEXT/BACK, and by
  // the walkthrough, which walks the rooms with the board sealed.
  function showRoom(n) {
    const G = Game.G;
    const rooms = briefRooms();
    if (!rooms.length) return;
    briefRoom = Math.max(0, Math.min(n, rooms.length - 1));
    const st = rooms[briefRoom];
    const last = briefRoom === rooms.length - 1;

    $('brief-modal-room').textContent = `TURN ${G.turn} — ${st.room}`;
    $('brief-modal-when').textContent = st.count(G, briefOptions);
    $('brief-modal-seal').src = st.seal;
    // Who is standing there. Under the seal rather than beside the title,
    // because the seal is what the eye lands on and the name is the caption for
    // it — and because the title line is already carrying the room and the count
    // and is centred between two marks whose widths it cannot control.
    $('brief-modal-who').innerHTML = st.who
      ? `<b>${st.who}</b><span>${st.role}</span>` : '';

    // The theater notes belong to CENTCOM's room and to no other: they are the
    // other half of what the staff is briefing — what it moved without asking,
    // over what it is asking — and read above the collection picture they would
    // be an army report in the NSA's meeting.
    $('brief-modal-notes').innerHTML = (st.notes && briefNotes && briefNotes.length)
      ? `<div class="brief-notes"><div class="brief-notes-head">CENTCOM HAS ALREADY MOVED ON THIS</div>` +
        briefNotes.map((x) => `<div class="brief-note">${x}</div>`).join('') + `</div>`
      : '';

    const parts = st.body(G, briefOptions);
    $('brief-modal-head').innerHTML = parts.head;
    $('brief-modal-buttons').innerHTML = parts.rows;

    // Giving an order does not end the briefing, it WALKS THE PRESIDENT INTO THE
    // NEXT ROOM. Through v1.91 an order closed the folder and left `briefAt`
    // behind as a bookmark, so a president who signed the first thing they were
    // shown had the meeting end on them and had to press BRIEF ME twice more to
    // find out that the other two rooms had decisions in them — which is the
    // v1.90 fold problem in its third costume: a room is only read if the reader
    // gets to it, and answering one is the single most likely moment for the
    // reader to stop. The folder now closes when the briefing is FINISHED, which
    // is to say when there is no room left in front of the president holding a
    // decision they have not made.
    //
    // The strike room re-dresses itself in place, because signing an option
    // produces no dialog — the packages go onto tonight's tasking order and fly
    // at the turn boundary. The two slot rooms cannot: an order there comes back
    // as a product, a cable, and sometimes an ally's phone call behind it, and
    // holding the folder open over the answer hides the one thing the president
    // just asked for. So they stand the folder down and arm `briefResume`, which
    // walks it back in when the last of those dialogs is gone.
    // `briefAt = briefRoom` and not `briefRoom + 1` (v2.01): the chain re-reads
    // the room it is standing in before walking past it, because the strike room
    // can GAIN a decision by being answered — signing the night is what creates
    // the surge. Safe for the other two rooms, whose `live` goes false the moment
    // their slot is spent, and safe against a loop for this one, because a signed
    // surge makes surgeOption() null. The slate is re-read for the same reason
    // resumeBrief re-reads it: the option that just appeared is not in the list
    // the folder was opened with.
    const advance = () => {
      briefAt = briefRoom;
      briefOptions = Game.difficulty().coa ? Game.briefOptions() : [];
      const n = nextLive();
      if (n < 0) closeBrief(); else showRoom(n);
    };
    if (st.key === 'brief') {
      for (const btn of document.querySelectorAll('#brief-modal-buttons .action-do')) {
        // The order first, then the room: `live` on the room being walked into
        // is read off a G the signature has already moved.
        btn.addEventListener('click', () => { Game.takeCoa(btn.dataset.coa); advance(); });
      }
      wireWhy('#brief-modal-buttons');
    } else {
      wireActions('#brief-modal-buttons', () => {
        briefAt = briefRoom + 1; briefResume = true; closeBrief();
      });
    }

    // The footer is the chain. The counter says how much briefing is left,
    // which is the thing a president reading a dialog most wants to know and the
    // reason a stack of three is not three interruptions; NEXT names the room it
    // is walking into, because "NEXT" alone on a folder does not say whether
    // the meeting is nearly over.
    $('brief-modal-step').textContent = rooms.length > 1
      ? `${briefRoom + 1} OF ${rooms.length}` : '';
    const back = $('btn-brief-back'), next = $('btn-brief-next');
    back.classList.toggle('hidden', briefRoom === 0);
    back.onclick = () => showRoom(briefRoom - 1);
    next.textContent = last ? 'CLOSE THE FOLDER' : `NEXT — ${rooms[briefRoom + 1].room} ▸`;
    next.onclick = () => (last ? closeBrief() : showRoom(briefRoom + 1));

    $('brief-modal').classList.remove('hidden');
    syncBriefButton();
  }

  // The next room in front of the president that still holds a decision they
  // have not made. Strictly FORWARD of `briefAt`: the folder is walked in one
  // direction, and a chain allowed to fall back would re-offer the slot that was
  // just spent. -1 means the briefing is finished, which is the one thing that
  // closes the folder on an order.
  function nextLive() {
    const G = Game.G;
    return briefRooms().findIndex((s, n) => n >= briefAt && s.live(G, briefOptions));
  }

  // Walk back in once the answer to a slot order has been read. Hung off the
  // modal stack going empty (see syncStack) rather than off any one dialog's
  // onClose, because a cable can have an ally's phone call chained behind it and
  // the folder must not re-open underneath it — the stack is the only thing that
  // knows the board is actually clear again.
  function resumeBrief() {
    if (!briefResume) return;
    briefResume = false;
    if (Game.G.over || Game.busy()) return;
    // Re-read rather than carried: an intelligence product is exactly the kind
    // of answer that changes what the staff would brief in the next room, and
    // the whole point of the intelligence room coming first is that the other
    // two are argued from it.
    briefOptions = Game.difficulty().coa ? Game.briefOptions() : [];
    const n = nextLive();
    if (n < 0) { syncBriefButton(); return; }
    showRoom(n);
  }

  // Walk to a named room. Only the walkthrough uses it, and it is the reason
  // showRoom renders a room whether or not that room has anything live in it —
  // a card explaining the collection deck has to have the collection deck behind
  // it on a night the slot is already spent.
  function briefGoto(key) {
    const n = briefRooms().findIndex((s) => s.key === key);
    if (n >= 0) showRoom(n);
  }

  function closeBrief() { $('brief-modal').classList.add('hidden'); }

  // The two buttons that stand for the brief when the brief is not on screen,
  // and they are never both live. Before it has been read tonight, READY FOR
  // OPTIONS holds the primary slot in front of END TURN — see the note above
  // Game.openBrief for why it is a swap and not a companion. After it has been
  // read and dismissed, BRIEF ME is the way back in, and it sits with HOW TO
  // PLAY rather than in the scroll pane because it is a session control — it
  // reopens a dialog — and not an order. Both exist only on a level that reads
  // the brief as a dialog, and BRIEF ME only while there is still something in
  // it to sign: a button that reopens a folder reading "nothing to brief" is a
  // button that teaches the player to stop pressing it.
  function syncBriefButton() {
    const pending = Game.briefPending();
    const ready = $('btn-brief-ready');
    if (ready) ready.classList.toggle('hidden', !pending);
    // `held`, not `hidden`. `hidden` on the end-turn button belongs to
    // setResolving, which writes it at every turn boundary, so a second owner
    // using the same class has its work undone by the next resolve and the
    // button reappears under the gate. Same split as `mode-off` beside `hidden`
    // on the rail panels, and the same bug if it is ignored.
    const end = $('btn-end-turn');
    if (end) end.classList.toggle('held', pending);

    const btn = $('btn-brief');
    if (!btn) return;
    // A slot still holding its order is reason enough to keep the door open,
    // independently of whether the staff has anything left to sign. Gating this
    // on the options alone would take BRIEF ME away the moment the last course
    // of action was signed — on the exact nights the unspent slot is the only
    // decision left in the folder, which is the thing this level moved it in
    // there to prevent.
    const on = Game.popup('brief') && !Game.G.over && !pending &&
      ((Game.difficulty().coa && Game.briefOptions().length > 0) || briefSlotPending());
    btn.classList.toggle('hidden', !on);
  }

  // ============================================================
  // THE WORLD — the diplomatic board, drawn as a readout
  // ------------------------------------------------------------
  // Everything in this panel moves whether or not the president touches it, and
  // nothing in it is a button. That is the whole distinction it exists to make:
  // one section is the situation and the next one is the single order a night
  // that can be given against it. See the note in index.html for what the three
  // sections this replaces were getting wrong.
  //
  // Order inside is by how fast a thing changes. Standing abroad first because
  // it is the master variable and every basing tier hangs off it; then the three
  // gauges, which are the live clocks; then the council roster and the southern
  // front behind one caret, because those are reference — true for most of a
  // war, read once, and the gauges have the better claim on a landscape phone's
  // ~200px of scroll pane.
  // ============================================================

  // A gauge and what is filling it. The bar is a bar rather than a number
  // because that is how every other pressure in this game is shown, and because
  // the point is that a president catches it filling out of the corner of an
  // eye. The driver list behind the caret is the same array the simulation just
  // used, so the panel cannot describe a different war than the one being
  // fought — and it lives HERE, on the gauge, rather than in the explainer of
  // some order that may already be spent.
  function gaugeRow(id, name, pct, tone, meta, drivers) {
    const open = actOpen.has(`gauge-${id}`);
    return `<div class="gauge-row${open ? ' open' : ''}" data-action="gauge-${id}">` +
      `<button type="button" class="gauge-head" aria-expanded="${open}" ` +
      `aria-label="What is moving ${name}">` +
        `<span class="gauge-name">${name}</span>` +
        `<span class="gauge-val" style="color:${tone}">${pct}%</span>` +
        `<span class="why-caret">▾</span>` +
      `</button>` +
      `<div class="israel-gauge"><div class="israel-gauge-fill" ` +
      `style="width:${pct}%;background:${tone}"></div></div>` +
      `<div class="israel-gauge-meta">${meta}</div>` +
      `<div class="gauge-why">${gulfWhy(drivers)}</div>` +
    `</div>`;
  }

  // Same shape as wireWhy, and separate for the same reason renderCoa wires its
  // own: the head IS the toggle here, not a caret sitting beside an order.
  function wireGauges(sel) {
    for (const head of document.querySelectorAll(`${sel} .gauge-head`)) {
      head.addEventListener('click', () => {
        const row = head.parentElement;
        const open = !row.classList.contains('open');
        row.classList.toggle('open', open);
        head.setAttribute('aria-expanded', String(open));
        if (open) actOpen.add(row.dataset.action); else actOpen.delete(row.dataset.action);
      });
    }
  }

  // The driver list. Biggest mover first — a zero-amount driver is a note rather
  // than a figure (the standing-down row) and gets no signed number, because
  // signed(0) is "−0" and a minus sign on nothing reads as a mistake.
  function gulfWhy(drivers) {
    return `<ul class="israel-why">` + drivers.slice()
      .sort((a, b) => Math.abs(b[0]) - Math.abs(a[0]))
      .map(([amt, label]) => {
        const n = Math.round(amt * 10) / 10;
        return `<li>${n === 0 ? '' : `${signed(n)} — `}${label}</li>`;
      }).join('') + `</ul>`;
  }

  // ---- standing abroad, and what it is currently holding up ----
  // World opinion was a bare number in the bottom bar and nothing anywhere said
  // what it BUYS. Both basing tiers are gated on it, the Gulf one against a
  // threshold the doves walk upward, so the cliff and the distance to it are the
  // fact a president needs — not the score.
  function standingHtml(G) {
    const w = Math.round(G.world);
    const row = (name, up, at, note) =>
      `<div class="gulf-state"><span class="gulf-state-name">${name}</span>` +
      `<span class="gulf-state-holds" style="color:${up ? 'var(--dim)' : 'var(--red)'}">` +
      `${up ? `holds above ${at}` : `LOST — returns above ${at}`}${note}</span></div>`;
    const gulfAt = Game.gulfFoldThreshold('gulf');
    const caveats = G.gulf.caveats;
    return `<div class="gulf-camp world-standing">` +
      `<div class="gulf-camp-head">STANDING ABROAD` +
      `<span class="world-score${w < 30 ? ' crit' : w < 45 ? ' warn' : ''}">${w}</span></div>` +
      row('NATO ramps', G.basing.nato, Game.gulfFoldThreshold('nato'), '') +
      // The Gulf threshold is the only one in the game that MOVES, so it says so
      // in the same line rather than leaving the player to notice the number is
      // not the one in the constant.
      row('Gulf ramps', G.basing.gulf, gulfAt,
        caveats ? ` · ${plural(caveats, 'caveat')}` : '') +
      `</div>`;
  }

  // ---- the council roster and the southern front, behind one caret ----
  // The roster earns its space by being the only thing that says WHO is in which
  // camp and what they are holding, which is the fact the whole mechanic turns
  // on: the states that want the war shortest are the states with the big ramps
  // under them. It is reference rather than news, so it folds.
  //
  // The southern front is inside it rather than in a panel of its own, and that
  // is the argument it is making: the thing that matters about Ansar Allah is
  // what it does to Riyadh, who is a dove holding Prince Sultan. A separate
  // panel would have read as a separate war.
  function councilHtml(G) {
    const open = actOpen.has('gauge-council');
    const roster = ['hawk', 'dove'].map(camp => {
      const label = camp === 'hawk' ? 'PRESS THE WAR' : 'END IT';
      return `<div class="gulf-camp gulf-camp-${camp}">` +
        `<div class="gulf-camp-head">${label}</div>` +
        Game.gulfStates(camp).map(s =>
          `<div class="gulf-state"><span class="gulf-state-name">${s.capital}</span>` +
          `<span class="gulf-state-holds">${s.holds}</span></div>`).join('') +
        `</div>`;
    }).join('');
    return `<div class="gauge-row council-row${open ? ' open' : ''}" data-action="gauge-council">` +
      `<button type="button" class="gauge-head" aria-expanded="${open}" ` +
      `aria-label="Who is in which camp, and what they are holding">` +
        `<span class="gauge-name">THE COUNCIL</span>` +
        `<span class="gauge-val dim">who holds what</span>` +
        `<span class="why-caret">▾</span>` +
      `</button>` +
      `<div class="gauge-why">${roster}${southHtml(G)}</div>` +
    `</div>`;
  }

  // What this must NOT show is a gauge. Riyadh has a threshold, not a temper:
  // three salvos or a shut strait, both of which are things Ansar Allah does and
  // the president does not choose. Drawing it as a filling bar would invite
  // exactly the reading the mechanic is built to refuse — that bringing the RSAF
  // in is a lever you pull. Empty in the three campaigns out of four that never
  // open a southern front.
  function southHtml(G) {
    const H = G.houthi;
    if (!H || !H.entered) return '';

    const y = Game.yemenTargets();
    const cond = Math.round(y.reduce((n, t) => n + t.hp, 0) / y.length);
    const reach = Game.reachesYemen();
    const strait = G.mandab;
    // The threshold, stated as a count against a count. It is the only number in
    // this block a player can act on, and only by taking the launch cells apart
    // before the third salvo lands.
    const trip = H.saudiIn ? null : `${H.saudiStruck}/${HOUTHIS.saudiStrikes} salvos on Saudi soil`;

    const row = (k, v, tone) =>
      `<div class="gulf-state"><span class="gulf-state-name">${k}</span>` +
      `<span class="gulf-state-holds"${tone ? ` style="color:${tone}"` : ''}>${v}</span></div>`;

    return `<div class="gulf-camp gulf-camp-south">` +
      `<div class="gulf-camp-head">THE SOUTHERN FRONT</div>` +
      row('Ansar Allah', cond > 0 ? `${cond}% capable` : 'launch cells down',
        cond > 60 ? 'var(--red)' : cond > 0 ? 'var(--amber)' : 'var(--green)') +
      row('Bab al-Mandab', strait,
        strait === 'OPEN' ? 'var(--green)' : strait === 'CONTESTED' ? 'var(--amber)' : 'var(--red)') +
      row('Riyadh', H.saudiIn
        ? `flying · ${plural(H.saudiSorties, 'night')}`
        : trip, H.saudiIn ? 'var(--amber)' : '') +
      // The reach line is the decision this front actually poses, so it is the
      // one that gets a sentence rather than a value. A player reading "out of
      // range" with no reason attached goes looking at world opinion, which is
      // where every other unreachable target in this game points them.
      row('CENTCOM', reach ? 'Ford on station — aimpoints live' : 'out of range without the Ford',
        reach ? 'var(--blue)' : 'var(--dim)') +
      `</div>` +
      `<p class="gulf-south-note">${
        H.saudiIn
          ? (H.saudiSince <= HOUTHIS.saudiGrace
            ? 'The council is quiet while the RSAF is committed. A government cannot file a caveat about a war it is flying — and that is a loan, not a gift.'
            : 'Riyadh is fighting two wars and wanted neither. The council is louder than it would have been if this front had never opened.')
          : 'Ansar Allah is an Iranian-supplied problem in the wrong ocean. Take the launch cells apart, or let the third salvo land and hand it to Riyadh.'
      }</p>`;
  }

  // What goes on the shut header, ranked strictly by how close a thing is to
  // costing something: a tier that has already folded is a fact, a shut waterway
  // is costing money tonight, a gauge about to discharge is a deadline, and the
  // percentages are only a forecast. The three old heads each shouted their own
  // gauge and left the player to rank them.
  //
  // `badge` is the same alarm at chip length, because it is what the DIPLO tab
  // shows on a phone while this panel is shut and off-screen — and it is EMPTY
  // when there is nothing to be alarmed about, so the tab falls through to
  // reporting that the diplomatic slot is unspent. Nothing is worth
  // out-shouting that on a quiet night.
  //
  // Every countdown here says IN, and the one badge that is a count of things
  // does not: "CAVEAT 3" and "3 CAVEAT" are the same eight characters saying
  // opposite things, and the second is the unpluralised counted noun Txt exists
  // to prevent. The count says FILED, which is what a caveat is.
  function worldMeta(G) {
    const p = Math.round(G.israelPressure);
    const strain = Math.round(G.gulf.strain);
    const say = (meta, badge) => ({ meta, badge: badge || '' });
    if (!G.basing.gulf) return say('GULF RAMPS LOST', 'GULF LOST');
    if (!G.basing.nato) return say('NATO RAMPS LOST', 'NATO LOST');
    if (G.mandab === 'CLOSED') return say('MANDAB SHUT', 'MANDAB SHUT');
    if (G.israelPosture === 'unilateral') return say(`JERUSALEM ${p}% · UNILATERAL`, 'IAF ALONE');
    const iEta = Game.israelEta();
    if (iEta !== null && iEta <= 6) {
      return say(`JERUSALEM ${p}% · FLIES IN ${turns(iEta)}`, `IAF IN ${iEta}`);
    }
    const dEta = Game.gulfEta('dove');
    if (dEta !== null && dEta <= 4) {
      return G.gulf.caveats >= GULF.caveatMax
        ? say(`GULF · WITHDRAWAL IN ${turns(dEta)}`, `PULLOUT IN ${dEta}`)
        : say(`GULF · CAVEAT IN ${turns(dEta)}`, `CAVEAT IN ${dEta}`);
    }
    if (G.gulf.caveats) {
      return say(`GULF ${plural(G.gulf.caveats, 'caveat').toUpperCase()} · ` +
        `FOLDS AT ${Game.gulfFoldThreshold('gulf')}`, `${G.gulf.caveats} FILED`);
    }
    // The quiet line. Two figures and not three: a landscape phone wraps this
    // head at about thirty characters, and a wrapped head costs a row of the
    // ~200px scroll pane to say the thing that is least worth saying.
    return say(`WORLD ${Math.round(G.world)} · JERUSALEM ${p}%${strain >= 50 ? ` · GULF ${strain}%` : ''}`);
  }

  function renderWorld(G) {
    const head = worldMeta(G);
    $('world-status').textContent = head.meta;
    setBadge('world', head.badge, head.badge ? 'badge-warn' : '');

    const p = Math.round(G.israelPressure);
    const rate = Game.israelDrivers().reduce((n, [amt]) => n + amt, 0);
    const posture = G.israelPosture;
    // The fill's COLOUR carries the posture — amber sidelined, red about to
    // launch, blue flying with us — which is why it is not keyed off the
    // percentage alone.
    const iTone = posture === 'coordinated' ? 'var(--blue)' : p >= 75 ? 'var(--red)' : 'var(--amber)';

    const resolve = Math.round(G.gulf.resolve);
    const strain = Math.round(G.gulf.strain);
    const caveats = G.gulf.caveats;
    const hEta = Game.gulfEta('hawk');
    const dEta = Game.gulfEta('dove');

    $('world-standing').innerHTML = standingHtml(G);
    $('world-gauges').innerHTML =
      gaugeRow('israel', 'JERUSALEM', p, iTone,
        `${posture.toUpperCase()} · ${signed(Math.round(rate))}/turn · ${Game.israelClock()}`,
        Game.israelDrivers()) +
      // The hawk bar is the one gauge in the game where FULL is good news, so it
      // runs blue-to-green rather than amber-to-red. A president who has learned
      // that a filling bar is a warning has to be able to see at a glance that
      // this one is not.
      gaugeRow('hawks', 'GULF HAWKS', resolve, resolve >= 75 ? 'var(--green)' : 'var(--blue)',
        `PRESS THE WAR · ${hEta === null ? 'FLAT' : `COMMITS IN ${turns(hEta)}`}`,
        Game.gulfHawkDrivers()) +
      gaugeRow('doves', 'GULF DOVES', strain, strain >= 75 ? 'var(--red)' : 'var(--amber)',
        `END IT` +
        (caveats ? ` · ${plural(caveats, 'caveat').toUpperCase()} FILED` : '') +
        (dEta === null ? ' · HOLDING'
          : caveats >= GULF.caveatMax ? ` · WITHDRAWAL IN ${turns(dEta)}`
          : ` · NEXT CAVEAT ${turns(dEta)}`),
        Game.gulfDoveDrivers());
    $('world-council').innerHTML = councilHtml(G);
    wireGauges('#world-panel');

    // the plot carries the same split, so the panel and the map cannot disagree
    MapView.setGulfMood(gulfMood(G));
  }

  // ============================================================
  // DIPLOMATIC ACTIONS — eleven orders, one slot
  // ------------------------------------------------------------
  // Grouped by what an order DOES rather than who it is given to, because
  // "which counterpart is this" was not a rule a player could learn: addressing
  // the nation and drawing the SPR are domestic politics and the pump price, and
  // they were filed under diplomacy because that section was really "everything
  // not military".
  //
  // They all still spend the same single slot — this is a shelf, not four
  // budgets. Giving any of them a budget of its own is the obvious version and
  // the wrong one: coalition is once a war, coordinating with Israel is once a
  // war, and Jerusalem takes ISRAEL.holdMax calls, so a dedicated slot would sit
  // unspent about twenty-five turns out of thirty wearing a READY badge over
  // nothing — while handing the diplomatic slot a free action every turn, which
  // is most of what makes the address/backchannel choice a choice.
  // ============================================================
  const DIPLO_GROUPS = [
    { label: 'HOLD THE COALITION TOGETHER', ids: ['restrain', 'gcc', 'un'] },
    { label: 'TRADE STANDING FOR CAPABILITY', ids: ['israel', 'coalition', 'patriots', 'corridor'] },
    { label: 'AT HOME AND AT THE PUMP', ids: ['address', 'spr'] },
    { label: 'END THE WAR', ids: ['sanctions', 'backchannel'] },
  ];

  // The Gulf council's three orders. The gauges they used to carry as `extra`
  // are in THE WORLD — same reason as Jerusalem's, and worse here, because both
  // of these levers run out (two summits, two batteries) while the camps go on
  // filling for the rest of the campaign.
  function gulfActions(G) {
    const summit = Game.gulfSummitCost();
    const resolve = Math.round(G.gulf.resolve);
    const spend = Math.round(Game.bmdCapacity() * GULF.patriotBmd);
    return [
      {
        id: 'gcc', name: 'GCC summit — hold the council together',
        moves: 'GULF DOVES',
        current: summit.left <= 0
          ? 'The council will meet without you now.'
          : `Strain ${signed(-summit.relief)}, approval ${signed(-summit.approval)}. ${plural(summit.left, 'summit')} left.`,
        desc: summit.left <= 0 ? '' :
          'Buys down the pressure for an American end state. Billed at home rather than abroad, and ' +
          'depreciating — the second reassurance is worth less than the first and both sides know it. ' +
          'What the doves file when this fills is a caveat, not a walkout: one tanker track tonight, and ' +
          'the threshold the whole Gulf tier folds at walks up toward wherever standing abroad is ' +
          `standing. It is at ${Game.gulfFoldThreshold('gulf')} now.`,
        disabled: summit.left <= 0,
      },
      {
        id: 'patriots', name: 'Patriots forward — Manama and Abu Dhabi',
        moves: 'GULF HAWKS',
        current: G.gulf.patriots >= GULF.patriotMax
          ? 'Both batteries are already released.'
          : G.bmdPool < spend
            ? 'Not enough left in the cells to release any.'
            : `Resolve +${GULF.patriotResolve}, ${plural(spend, 'interceptor')} off the screen.`,
        desc: 'Priced in the fleet\'s own magazine, because that is the honest bill — there is one ' +
          'interceptor stock in the theater and putting it over the hosts is taking it off Al Udeid and ' +
          'Al Dhafra. Every time the hawks\' gauge fills they pay: a tanker track, then interceptors, then ' +
          'squadrons, then rounds every time after.',
        disabled: G.gulf.patriots >= GULF.patriotMax || G.bmdPool < spend,
      },
      {
        id: 'corridor', name: 'Northern corridor — Amman and Kuwait City',
        moves: 'GULF HAWKS',
        current: G.gulf.corridor
          ? 'Corridor guaranteed. Deep reach survives the council.'
          : resolve < GULF.corridorAt
            ? `Needs ${GULF.corridorAt}% resolve. They are at ${resolve}%.`
            : 'Spends the hawks\' goodwill to the last point.',
        desc: G.gulf.corridor ? '' :
          'The one thing the council can take away that can be bought back in advance. When Gulf basing ' +
          'folds, the northwestern tanker tracks go with it and Tabriz and the Caspian come off the target ' +
          'list — unless Jordan and Kuwait are holding the corridor on their own account. It costs the ' +
          'whole gauge, so it is a real choice against what the hawks would otherwise have paid you in ' +
          'tankers, interceptors and squadrons.',
        disabled: G.gulf.corridor || resolve < GULF.corridorAt,
      },
    ];
  }

  // Every diplomatic order the president could give tonight, with its live
  // state and its price. Extracted from renderDiplo at v1.90 for the same
  // reason coaRows was extracted from renderCoa: there are now two places the
  // diplomatic slot is presented — the shelf, and the three staffed tracks in
  // the folder — and a second copy of eleven orders' worth of availability
  // logic is a second place for `disabled` to go stale. Nothing in here touches
  // the DOM, which is also what lets .claude/betatest/state.js hold a reference
  // to it across stub().
  //
  // `current` is what the player needs to choose — the odds, the price, the
  // countdown. `desc` is what the instrument is. Anything with a number in it
  // that the player is spending belongs above the fold.
  function diploActions(G) {
    const negReady = G.negotiationReady();
    return [
      {
        id: 'backchannel', name: 'Omani backchannel',
        // No `moves` badge, deliberately: every other one names a gauge the
        // player can go and look at in THE WORLD, and this order moves none of
        // them — it ends the campaign. A badge here would teach a gauge that
        // does not exist.
        // `current` is documented at the top of this function as "the odds, the
        // price, the countdown", and until v2.05 the one order in the game that
        // can END the war was the only one that named none of them: "a deal is
        // possible" on a night that might be 9% or might be 65%, with no way to
        // tell which and no way to learn that sanctions and a dead IRGC are what
        // move it. Off Game.dealOdds(), which is what doDiplo actually rolls.
        current: negReady
          ? `About ${Math.round(Game.G.dealOdds() * 100)}% tonight, and rising as they break.`
          : 'Tehran will not talk while it can still fight.',
        desc: negReady
          ? 'Far from certain, but this is the moment an overture can land. A rebuff is not the end of it — ' +
            'the channel stays warm, and every brigade and hull serviced afterwards lifts the next attempt. ' +
            'What raises the odds is leverage: sanctions stacked, the IRGC command gone, the war machine ' +
            'under the bar.'
          : 'An overture now will be rebuffed and read as weakness at home.',
      },
      {
        id: 'un', name: 'UN Security Council push',
        moves: 'STANDING ABROAD',
        current: 'World opinion +.',
        desc: 'Rally international support and diplomatic cover. Standing abroad is what both basing tiers ' +
          'are gated on, so this is the order that buys back a ramp.',
      },
      {
        id: 'sanctions', name: 'Snap-back sanctions package',
        current: 'Negotiation leverage +, small oil cost.',
        desc: 'Tighten the economic screws. Leverage is what a backchannel spends when the time comes.',
      },
      {
        id: 'spr', name: 'Release the Strategic Reserve',
        current: G.sprReleases >= 2
          ? 'Tanks too low for another release of scale.'
          : `Oil ${G.sprReleases === 0 ? '−$20' : '−$12'}, approval +2. ${plural(2 - G.sprReleases, 'release')} left.`,
        desc: G.sprReleases >= 2 ? '' : 'A coordinated draw on the Strategic Petroleum Reserve to push the pump price down.',
        disabled: G.sprReleases >= 2,
      },
      {
        id: 'address', name: 'Address the nation',
        current: G.addressCooldown > 0
          ? `Available in ${turns(G.addressCooldown)}.`
          : `Approval +6. ${plural(G.addresses, 'address')} so far.`,
        desc: G.addressCooldown > 0 ? '' :
          'Rally the public — and the count is read out when the War Powers vote comes up.',
        disabled: G.addressCooldown > 0,
      },
      {
        id: 'coalition', name: 'Build strike coalition',
        current: G.coalition ? 'Coalition assembled — allied sorties added.' : 'Adds allied sorties.',
        desc: G.coalition ? '' : 'Brings allied air into the operation and spreads the political weight of it.',
        disabled: G.coalition,
      },
      ...israelActions(G),
      ...gulfActions(G),
    ];
  }

  // The diplomatic slot as the folder renders it: THREE staffed tracks, not the
  // eleven-row shelf. This is the one place the two slots deliberately differ.
  // Intelligence puts its whole drawer in the room because five orders that all
  // buy KNOWING are a short menu and the collection picture above them is the
  // reason to pick one. Diplomacy is eleven orders across four theaters, each
  // one costing a different currency, and moving all eleven into the folder
  // would have been the same sorting problem one fold deeper — a president
  // reading every instrument and costing eleven cables against each other on a
  // level whose whole premise is that somebody does that first. So the staff
  // sorts it (stateOptions), and what arrives is the same shape CENTCOM's half
  // of the folder arrives in: a reason, a price, and what it leaves undone.
  //
  // Still actionButtons, and that is the rule this framework states — one
  // renderer, or the drawer and the dialog drift. A staffed row is not a second
  // kind of control, it is an order carrying three more fields.
  function diploBody(G) {
    const tracks = stateOptions(G);
    return tracks.length ? actionButtons(tracks, G.diploUsed) : DIPLO_EMPTY;
  }

  // Eleven orders and none of them live is very nearly impossible — the UN push
  // and the sanctions package have no precondition at all — but "nearly" is how
  // the blank box gets shipped, and a section of the folder that renders empty
  // is the one thing worse than a drawer nobody opens.
  const DIPLO_EMPTY = '<div class="coa-empty">State has nothing to put in front of you tonight. ' +
    'Every channel that is open has already been used as far as it goes.</div>';

  function renderDiplo(G) {
    // On a level that briefs this slot in the room the drawer is trimmed off the
    // rail entirely (DIFFICULTY.railPanels) and openPanel refuses it, so there
    // is nothing here to draw into — the brief's own room owns it instead. Same split as
    // renderIntel and CSAR.renderPanel make.
    if (Game.popup('diplo')) return;
    const used = G.diploUsed;
    // The slot, not a count of the shelf. Both of these are what the player is
    // actually choosing between — one order, out of everything below.
    $('diplo-status').textContent = used ? '— ORDER GIVEN' : '';
    setBadge('diplo', used ? 'ORDER GIVEN' : '1 ORDER', used ? 'badge-none' : '');

    const actions = diploActions(G);

    // ...and where the staff sorts this slot, it says which one. It is a MARK
    // on an order the president was always able to give, not a fourth kind of
    // button and not a shortcut that takes it: "diplomacy recommended" is the
    // same bargain the courses of action make on the military side, and the
    // president still has to agree. Gated on `recommend`, because the advisors
    // already argue for all of these at length and a star beside one of them on
    // a level with no staff would be the room having the argument twice and
    // then settling it for you.
    //
    // It reads the SAME ranker the folder's three tracks come out of
    // (stateOptions), which is the point: a level carrying both surfaces must
    // not have two opinions about tonight, and the star is simply TRACK ONE
    // wearing the shelf's clothes.
    if (Game.difficulty().recommend && !used) {
      const top = stateOptions(G, actions)[0];
      const hit = top && actions.find(a => a.id === top.id);
      if (hit) hit.mark = 'STAFF RECOMMENDS';
    }

    // Grouped, and a group with nothing live in it is absent rather than empty —
    // "Ask Jerusalem to hold" only exists while they are sidelined, so HOLD THE
    // COALITION TOGETHER is two rows for most of a war and one if the summits
    // are also gone.
    const byId = new Map(actions.map(a => [a.id, a]));
    $('diplo-buttons').innerHTML = DIPLO_GROUPS.map(g => {
      const rows = g.ids.map(id => byId.get(id)).filter(Boolean);
      return rows.length
        ? `<div class="diplo-group">${g.label}</div>${actionButtons(rows, used)}`
        : '';
    }).join('');
    wireActions('#diplo-buttons');
  }

  // ---- STATE'S THREE ----
  // The diplomatic slot, staffed: the eleven orders above ranked against the
  // same read of the board the courses of action and the four advisors argue
  // from, and cut to three. STATECRAFT in data.js holds the mapping and the
  // arithmetic; this holds the prose rules, which are the same three
  // `coaOptions` follows and are written out there at length.
  //
  // WHAT THIS REPLACES, AND WHY THE PRINCIPLE INVERTED. Until v1.90 this
  // function was a short priority ladder that named ONE order, and it
  // deliberately refused to name three of them — coordinating with Israel,
  // the Patriots, the northern corridor — on the grounds that those spend a
  // relationship for a capability, cannot be un-spent, and a star beside one is
  // the staff making the strategic call rather than teaching what the button
  // is. That was right while the star sat on a shelf of eleven visible orders:
  // everything the staff declined to point at, the president could still see
  // and still give.
  //
  // It is exactly wrong now that the folder is the only door. An order the
  // ranking never surfaces on easy is an order that does not exist on easy, and
  // one of those three re-arms the joint deep-strike package — the only
  // renewable path into the buried halls that does not need a B-2. That is the
  // `autoTheater` trap in a second costume: taking a panel away without moving
  // what was behind it does not simplify the level, it makes it unwinnable. So
  // all eleven are eligible, the irreversible ones included, and what protects
  // the player from a staff that plays for them is not omission — it is that
  // every track carries `defers`, the same as a course of action, so the pitch
  // arrives with its own cost attached.
  //
  // AND IT IS DAMPED, on readLead's own constants, which are advise()'s own
  // constants — deliberately the same numbers a third time, so this stays one
  // experiment rather than three. Measured in .claude/betatest/state.js over 30
  // easy campaigns, before the damper: the folder showed 5.0 DISTINCT SETS of
  // three across a whole campaign, `backchannel`/`spr`/`address` took 85% of
  // every lead there was, and `un` — the order that buys back the ramps
  // everything else is gated on — was briefed on 10% of the nights it was
  // available. Damped, and with the backchannel fix in STATECRAFT beside it:
  // 14.2 distinct sets, no order leading more than a quarter of nights, and
  // every one of the eleven briefed on a real share of the nights it is live.
  //
  // That is the same failure the HUD read cell and the advisor ladder both had,
  // for the same reason: severity alone picks the loudest STANDING condition,
  // and a standing condition never stops being true. The floor at home is not
  // less true tonight because the president heard about it last night. A folder
  // that opens on the same three cables for nine nights running is a layout.
  //
  // What did NOT come all the way down is the longest single run at TRACK ONE —
  // 9.0 nights before, 7.3 after, against the 3.0–3.9 the same constants buy the
  // HUD line. That is a real difference and it is the honest one to report: a
  // concern severity is on assess.js's shared 0..1 ruler, so damping reorders
  // the leaders easily, while these eleven orders carry weights a factor of two
  // apart and the floor at 0.55 cannot always close that gap. It is left alone
  // because the folder is THREE rows and the set is what the president reads —
  // 14 distinct sets across a campaign is not wallpaper even when one row of the
  // three is stable — and because lowering the floor here would make this a
  // second experiment with the same name as the first.
  //
  // All three briefed ids accrue, not just the leader — what repeats here is the
  // SET, since the president is reading three rows and not one — and the eight
  // that did not get briefed recover at half rate, which is what rotates the
  // tail of the shelf back into view.
  const STATE_STEP = 0.12, STATE_FLOOR = 0.55, STATE_RECOVER = 0.5;
  const stateHeard = new Map();     // order id -> consecutive turns briefed
  let stateSaid = [];               // this turn's three, awaiting commit
  let stateTurn = -1;

  // Same rule as `hold` in ai.js and `readHold` above: exempt what is ITSELF
  // expiring rather than being restated. An open negotiation window is the war
  // ending tonight and must never be damped off the folder — it is the one order
  // in the game that wins; each ask of Jerusalem is worth less and costs more
  // than the last, so it is a different order every time it is offered; and
  // coordinating stops existing the moment they go unilateral, which is a
  // deadline and not a preference. Nothing else is exempt.
  const stateHold = (a) => {
    if (a.id === 'backchannel') return Game.G.negotiationReady();
    if (a.id === 'restrain') return true;
    if (a.id === 'israel') { const e = Game.israelEta(); return e !== null && e <= 3; }
    return false;
  };

  // Committed at the TURN BOUNDARY and never on a render, for the reason
  // commitHeard and readLead both are: the folder can be opened, shut and
  // reopened inside one night, and three tracks that reordered themselves
  // between two readings of the same folder would be worse than three that
  // repeated. The RANKING is re-read every time (rule 2 in assess.js), so the
  // tracks still move the moment the board does; what is frozen for the night is
  // only how tired the room is of making each pitch.
  //
  // Module-local, like readLead's damper and for the same reason: no FIELDS
  // entry and no VERSION bump. A president returning to a saved war should be
  // offered the truest three, not the three the last session had stopped
  // reading. A night on which the folder is never opened accrues nothing, which
  // is also right — the room cannot get tired of a pitch nobody heard.
  function commitState() {
    if (stateTurn === Game.G.turn) return;
    if (Game.G.turn < stateTurn) { stateHeard.clear(); stateSaid = []; }   // new war
    else if (stateTurn >= 0) {
      for (const k of [...stateHeard.keys()]) {
        if (!stateSaid.includes(k)) stateHeard.set(k, Math.max(0, stateHeard.get(k) - STATE_RECOVER));
      }
      for (const k of stateSaid) stateHeard.set(k, (stateHeard.get(k) || 0) + 1);
    }
    stateTurn = Game.G.turn;
  }

  // Not cached, for rule 2 in assess.js: this is re-read every time the folder
  // is opened, and a diplomatic order landing mid-night moves the board.
  function stateOptions(G, list) {
    if (G.over) return [];
    // Orderable rows only. `attrs: ''` marks a status row — something a panel
    // is telling the player rather than an order they can give — and a shelf
    // that grows one would otherwise be briefed as a track that does nothing.
    const actions = (list || diploActions(G))
      .filter(a => a.attrs === undefined && !a.disabled);

    commitState();
    const worries = Assess.concerns();
    const spec = (id) => STATECRAFT.orders[id] || STATECRAFT.fallback;

    const ranked = actions.map(a => {
      const s = spec(a.id);
      // The urgency of an order is the severity of the worst thing it answers,
      // and the concern that supplies it is the one whose words the track will
      // argue in. Nothing else in here computes a severity of its own — the
      // scale is shared across categories on purpose (see CONCERNS) and a
      // second one written here would not be on the same ruler.
      let lead = null;
      for (const cid of s.answers) {
        const c = worries.find(w => w.id === cid);
        if (c && (!lead || c.sev > lead.sev)) lead = c;
      }
      let rank = s.weight * (0.3 + s.scale * (lead ? lead.sev : 0));
      if (s.ready || s.unready) rank *= (G.negotiationReady() ? (s.ready || 1) : (s.unready || 1));
      const rep = stateHold(a) ? 0 : (stateHeard.get(a.id) || 0);
      rank *= Math.max(STATE_FLOOR, 1 - rep * STATE_STEP);
      return { a, answers: s.answers, lead, rank };
    }).sort((x, y) => y.rank - x.rank);

    const brief = ranked.slice(0, STATECRAFT.brief);
    stateSaid = brief.map(o => o.a.id);

    // WHAT THE FOLDER CAN REACH TONIGHT: every concern some order actually on
    // the shelf answers. This is the eligible set for `defers`, and deriving it
    // from the table rather than writing a filter is the point — it is exactly
    // the mirror of the rule coaOptions follows. A course of action is not
    // charged for failing to fix your approval rating because no course of
    // action can; a track is not charged for leaving the SAM belt standing,
    // because "this cable does not suppress air defense" is true of every cable
    // ever sent. The strait, the belt, the launcher fix and the soft
    // assessments drop out on their own, because nothing in STATECRAFT.orders
    // claims them and nothing should.
    //
    // Scoped to the AVAILABLE shelf and not to the three briefed. Charging a
    // track only against its two rivals was the first cut and it left 79% of
    // tracks with no LEAVES line at all — three orders that happen to answer
    // overlapping concerns have nothing to charge each other with, which reads
    // as three free lunches. What the president is actually choosing between is
    // the whole shelf; three of it are simply the ones worth their evening.
    const reach = new Set();
    for (const o of ranked) for (const c of o.answers) reach.add(c);

    return brief.map((o, i) => {
      // WHAT IT LEAVES — and the eligible set is narrower here than it is for a
      // course of action, in the opposite direction. A COA is not charged for
      // failing to fix your approval rating because no COA can. A track is not
      // charged for leaving the SAM belt standing, because that is what the
      // president is signing CENTCOM's half of the same folder for. What a
      // track is charged for is the worst thing ANOTHER TRACK IN FRONT OF THEM
      // would have done instead — which is the only comparison that makes the
      // three a decision rather than a queue.
      const mine = new Set(o.answers);
      const gap = worries.find(w => reach.has(w.id) && !mine.has(w.id));
      return {
        ...o.a,
        slot: STATECRAFT.slots[i] || `TRACK ${i + 1}`,
        // Exported rather than recomputed by the caller, so nothing outside
        // this file has to keep a second copy of stateHold. Only the probe
        // reads it, and it reads it to answer the one question the run-length
        // number cannot answer on its own: a track that leads for nine nights
        // is wallpaper if it is the standing floor at home, and is the war
        // being winnable if it is an open negotiation window.
        hold: stateHold(o.a),
        // The fallback is not decoration. A quiet night for State is a real
        // state of this game — nothing discharging, the floor a long way off —
        // and "there is no fire, and this is still worth the cable" is an
        // honest thing for a staff to say. Same bargain coaOptions makes.
        read: o.lead ? o.lead.now
          : 'Nothing on the board is forcing this tonight. It is standing business, and a slot ' +
            'spent on it is a slot spent while nothing is on fire — which is the only time it is cheap.',
        defers: gap ? gap.left : null,
        rank: o.rank,
      };
    });
  }

  // What each of the seven countries is coloured on the strategic plot. One
  // reading, computed here and handed to the map, so there is no second copy of
  // "who is angry" for the two displays to drift apart on.
  function gulfMood(G) {
    const mood = {};
    for (const s of Game.gulfStates('hawk')) {
      mood[s.country] = G.gulf.resolve >= 60 ? 'committed' : 'hawk';
    }
    for (const s of Game.gulfStates('dove')) {
      // Saudi Arabia, Oman and Qatar stay plain on the plot — none of the
      // doves carry the mood colouring here.
      if (s.country === 'Saudi Arabia' || s.country === 'Oman' || s.country === 'Qatar') continue;
      mood[s.country] = !G.basing.gulf ? 'closed'
        : G.gulf.caveats >= GULF.caveatMax ? 'caveat'
        : G.gulf.strain >= 60 ? 'strained' : 'dove';
    }
    return mood;
  }

  // one control for every order the player can give, so a tasking looks like a
  // tasking wherever it is rendered
  // Which action explainers are open. Unlike the advisors' `advOpen` this is NOT
  // cleared on the turn roll: an advisor says something different every turn, so
  // a stale expansion would show a paragraph nobody asked for, but "what a
  // collection deck is" is the same sentence on turn 1 and turn 30. A player who
  // opens it is learning the game and should keep it open until they close it.
  const actOpen = new Set();

  // One control for every order the player can give, so a tasking looks like a
  // tasking wherever it is rendered — and so the split between what changed and
  // what it means is made once instead of per panel.
  //
  // `name` and `current` are the decision: the order, its live state, and what
  // it costs. `desc` is the mechanism — what an SPR draw is, why the heavies
  // will not fly — which is the same prose every turn for thirty turns and is
  // the part that was making these panels 600-840px tall. It renders collapsed.
  //
  // The explainer sits OUTSIDE the button rather than inside it: the button
  // performs the action on click, so a disclosure nested in it would be an
  // invalid control that fires an order when the player only wanted to read.
  function actionButtons(list, used) {
    return list.map(a => {
      const off = used || a.disabled;
      const open = actOpen.has(a.id);
      // `attrs: ''` marks a status row — something the panel is telling the
      // player rather than an order they can give. Omitting attrs entirely is
      // the diplomacy/intelligence default, where the id IS the order.
      const attrs = a.attrs === undefined ? `data-diplo="${a.id}"` : a.attrs;
      // `slot`, `read` and `defers` are what a STAFFED order carries on top of
      // an order (stateOptions). They are rendered here rather than by a second
      // row-builder for the reason coaRows exists: the folder and the shelf must
      // not be two copies of this markup, or the line naming what a track leaves
      // undone goes missing from one of them — and that line is the whole reason
      // three pitches are a decision. An unstaffed row simply has none of them.
      return `<div class="action${off ? ' off' : ''}${open ? ' open' : ''}${a.slot ? ' staffed' : ''}" data-action="${a.id}">` +
        `<button class="action-do" ${attrs} ${off ? 'disabled' : ''}>` +
        `<span class="action-name">` +
        (a.slot ? `<span class="coa-slot">${a.slot}</span> ` : '') + a.name +
        (a.mark ? `<span class="rec-chip">${a.mark}</span>` : '') + `</span>` +
        // WHY TONIGHT above WHAT IT COSTS, the same order the courses of action
        // put them in: the board fact that put this order in front of the
        // president, then the price of agreeing.
        (a.read ? `<span class="il-read">${a.read}</span>` : '') +
        (a.current ? `<span class="il-current">${a.current}</span>` : '') +
        (a.defers ? `<span class="coa-defers">LEAVES — ${a.defers}</span>` : '') +
        // `moves` names the gauge in THE WORLD this order pushes on. It is the
        // connective tissue that went missing when the gauges stopped living on
        // the order rows: without it a president reads eleven unrelated buttons
        // above a board of three bars and has to infer which touches which.
        (a.moves ? `<span class="il-moves">MOVES ${a.moves}</span>` : '') +
        `</button>` +
        (a.desc
          ? `<button type="button" class="action-why" aria-expanded="${open}" ` +
            `aria-label="Why this order matters"><span class="why-caret">▾</span></button>`
          : '') +
        // `extra` is live state that is a SHAPE rather than a sentence — a gauge
        // another government owns, filling. It sits outside the button for the
        // same reason the disclosure does (a div inside a button is not markup),
        // and above the fold for the opposite reason: it is the state, not the
        // explanation, so it must never be the thing behind the caret.
        (a.extra ? `<div class="action-extra">${a.extra}</div>` : '') +
        (a.desc ? `<div class="action-desc">${a.desc}</div>` : '') +
        `</div>`;
    }).join('');
  }

  // Wires the disclosure carets in a panel. The action itself is wired by the
  // caller, because a diplomatic action, a carrier order and a bomber order all
  // go somewhere different — but every panel hides its prose the same way.
  function wireWhy(sel) {
    for (const why of document.querySelectorAll(`${sel} .action-why`)) {
      why.addEventListener('click', () => {
        const row = why.parentElement;
        const open = !row.classList.contains('open');
        row.classList.toggle('open', open);
        why.setAttribute('aria-expanded', String(open));
        if (open) actOpen.add(row.dataset.action); else actOpen.delete(row.dataset.action);
      });
    }
  }

  // `before` runs on the way to the order and is how the same rows work inside a
  // dialog: giving the order closes the room, for the reason signing a course of
  // action does — what comes back is a report, and holding the brief open over
  // the answer hides the thing the president just asked for.
  function wireActions(sel, before) {
    for (const btn of document.querySelectorAll(`${sel} .action-do`)) {
      btn.addEventListener('click', () => {
        if (before) before();
        Game.doDiplo(btn.dataset.diplo);
      });
    }
    wireWhy(sel);
  }

  // ---- intelligence tasking ----
  // Its own one-per-turn slot, separate from diplomacy: these buy knowing
  // instead of doing. The panel leads with the collection picture — what is
  // currently known, and how firmly — because every one of these orders is a
  // decision to spend the night's intel slot moving one of those lines. Reading
  // the state out of four paragraphs of button text was the wrong shape for it.
  //
  // Split three ways — the state, the picture, the rows — because on a level
  // that briefs this slot as a dialog (DIFFICULTY.popups) those same two halves
  // are rendered into the brief instead of into the drawer. One renderer, two
  // homes: the rule coaRows and briefLines/orderRows already follow, and for the
  // same reason, which is that a second copy of this markup is how a tasking
  // quietly goes missing from one of the two places it is meant to appear.

  // Everything both halves read, derived once and handed to both. The picture's
  // "3 localized" and the folder tasking's "3 areas localized and still
  // unresolved" are the same fact twice, and computing them down two paths is
  // how they come to disagree inside a single dialog.
  function intelState(G) {
    const gaps = Game.covertGaps();
    return {
      hidden: IranAI.liveTels().filter(t => !t.located).length,
      brk: Game.breakoutEstimate(),
      posture: G.postureKnown ? IranAI.posture() : null,
      // A collection deck is only worth flying when there is something soft
      // enough to be worth looking at. Offered with nothing on the list it
      // spends the night's intel slot and hands back "nothing worth the sortie"
      // — so the button says so up front instead, and the count is the argument.
      stale: Game.staleEstimates(),
      gaps,
      boxed: gaps.filter(t => t.suspected).length,
      leads: gaps.reduce((n, t) => n + (t.suspected ? 0 : (t.leads || 0)), 0),
      // nights of collection already flown against the box the deck is furthest
      // into — the one workFolder will task next
      worked: gaps.reduce((n, t) => Math.max(n, t.suspected ? (t.worked || 0) : 0), 0),
    };
  }

  // The folder line reports what the analysts have OBSERVED — leads carried
  // and boxes up — and never the number of sites still unknown, because that
  // is a number CENTCOM cannot have. A panel reading "4 gaps" on turn one
  // would hand the player the answer to the mechanic and delete the mid-game
  // this exists to create: the discrepancy is supposed to be something they
  // notice against the capacity meter, not something the HUD announces.
  // "Nothing outstanding" beside a live covert site is not the game lying —
  // it is the assessment being wrong, which is the same contract t.hp and
  // estimate() already run on.
  function intelPicture(s) {
    const { hidden, brk, posture, boxed, leads } = s;
    const lines = [
      ['Enrichment', brk.halted ? 'HALTED' : `${brk.lo}–${brk.hi}T · ${brk.conf}`,
        brk.halted || brk.conf === 'high' ? 'known' : brk.conf === 'low' ? 'unknown' : ''],
      ['Dispersed launchers', hidden ? `${hidden} unlocated` : 'none loose',
        hidden ? 'unknown' : 'known'],
      ['Iranian war plan', posture ? posture.name : 'unassessed', posture ? 'known' : 'unknown'],
      ['Target folder', boxed ? `${boxed} localized, unresolved`
        : leads ? `${plural(leads, 'lead')} carried`
        : 'nothing outstanding',
        boxed ? '' : leads ? 'unknown' : 'known'],
    ];
    return lines.map(([label, value, cls]) =>
      `<div class="intel-line"><span>${label}</span>` +
      `<span class="il-value ${cls}">${value}</span></div>`).join('');
  }

  // Every tasking that can actually be given tonight, in the order the slot
  // lists them.
  function intelTaskings(G, s) {
    const { hidden, brk, posture, stale, gaps, boxed, leads, worked } = s;

    const intel = [
      {
        id: 'bda', name: 'Task a collection deck — reassess damaged sites',
        current: stale.length
          ? `${plural(stale.length, 'estimate')} soft enough to be worth the sortie: ` +
            `${stale.map(({ t }) => t.short).join(' · ')}.`
          : 'Nothing on the list is stale enough to be worth a collection deck.',
        desc: stale.length
          ? 'Overhead, a Global Hawk orbit and the signals picture. Narrows those estimates to ±3 — ' +
            'which is the difference between knowing a site needs one more package and guessing.'
          : 'Every site that has been hit is carrying a fresh assessment. Strike something and let a ' +
            'night pass, and the analysts will have work worth doing.',
        disabled: !stale.length,
      },
      {
        id: 'hunt', name: 'Hunt dispersed launchers',
        current: hidden
          ? `${hidden} launcher group${hidden === 1 ? '' : 's'} loose in the country and shooting.`
          : 'Nothing unaccounted for.',
        desc: hidden
          ? 'A sweep may find one. Found is not killed — they move again if they are not serviced the ' +
            'same turn.'
          : 'Every launcher group known to have left a base is on the plot or destroyed.',
        disabled: !hidden,
      },
      {
        id: 'assess-nuclear', name: 'Reassess the enrichment timeline',
        current: brk.halted
          ? 'No capability remaining.'
          : `Current judgement: ${brk.lo}–${brk.hi} turns, ${brk.conf} confidence.`,
        desc: brk.halted
          ? 'Enrichment capability is destroyed. There is no timeline left to assess.'
          : 'Narrows the band — the estimate is what the whole campaign is being paced against.',
        disabled: brk.halted,
      },
      {
        id: 'folder', name: 'Work the target folder',
        // Deliberately vague when there is nothing localized. The tasking's
        // existence tells the player the folder CAN be worked, which they should
        // know; its wording must never tell them how much is left in it, which
        // they should not. It drops off the list entirely once every gap is
        // closed — that end state is worth reading, and it is the only moment
        // the panel is allowed to confirm a negative.
        // A box the deck has already been flown against is closer than one it
        // has not, and the panel says so — the persistence in workFolder is the
        // main reason this tasking is worth committing to two nights running,
        // and a mechanic the player cannot see is a mechanic they cannot plan
        // against. It counts nights spent, never odds: the folder does not quote
        // probabilities anywhere else and should not start here.
        current: boxed
          ? `${plural(boxed, 'area')} localized and still unresolved.` +
            (worked ? ` ${plural(worked, 'night')} of collection already flown against the closest.` : '')
          : leads
            ? `${plural(leads, 'lead')} in the file. Nothing localized yet.`
            : 'The order of battle has discrepancies in it. None of them have a shape.',
        desc: boxed
          ? 'The deck knows where to look. Resolving a box turns it into an aimpoint that can go on a ' +
            'tasking order — and the site has been in this war since the first night. A night that does ' +
            'not close it still narrows it: the analysts pick up where they left off, so tasking the same ' +
            'box again is worth more than starting a new one.'
          : 'Flown blind against the holes in the order of battle. A blind deck turns up leads, not ' +
            'sites; two good nights on the same discrepancy and it becomes a box on the plot.',
        disabled: !gaps.length,
      },
      {
        id: 'assess-intent', name: 'Assess Iranian war plan',
        current: posture
          ? `Assessed: ${posture.name}.`
          : (G.turn <= 3 ? `Locked until turn 4 (currently turn ${G.turn}).` : 'Never assessed.'),
        desc: posture
          ? posture.brief
          : (G.turn <= 3
            ? 'The Agency needs time on the target before it can read Tehran\'s intent. The tasking ' +
              'opens up after the first three turns of the campaign.'
            : 'The Agency can tell you which arm Tehran has decided to fight this war with — and therefore ' +
              'which one is worth spending the campaign destroying. One tasking, permanent answer.'),
        disabled: G.postureKnown || G.turn <= 3,
      },
    ];

    // the leadership raid's ISR prep is an intelligence tasking: it lives here
    // now, not in Special Operations. SpecOps hands back the button (or null
    // once there is no raid left to prepare for).
    const isr = SpecOps.isrTasking(G);
    if (isr) intel.push(isr);

    // Only orders that can actually be given are listed. A tasking is dropped
    // when there is nothing for it to collect against — no stale estimates, no
    // loose launchers, enrichment already destroyed, the plan already read, the
    // pattern-of-life picture already complete. What it would have told the
    // player is the collection picture above, which says the same thing in one
    // line each; a permanently dead button repeating it is a list of things the
    // player cannot do. `used` is deliberately NOT a filter — the slot comes
    // back next turn, so those stay visible and greyed rather than emptying the
    // panel for half of every turn.
    return intel.filter(a => !a.disabled);
  }

  // ---- THE SLATE: ONE GOOD ANSWER AND TWO REAL ALTERNATIVES ----
  // See INTEL_SLATE in data.js for why the room puts up three rather than the
  // whole deck, and why exactly one of the three is chosen for merit. This is
  // the part that has to be got right: the good one must be UNMARKED and
  // UNPLACED. It carries no chip, it is not first, and it is not last — the
  // slate is sorted back into the deck's own order before it is drawn, so its
  // position in the room is a fact about the deck and not about the ranking.
  //
  // Deterministic per turn, off a local generator seeded with the turn number
  // and never off Math.random. Two reasons, and both were bugs elsewhere in this
  // file first: the folder can be opened, shut and reopened inside one night and
  // three taskings that reshuffled between two readings are worse than three
  // that repeated (the same rule commitState and readLead follow), and a
  // renderer that draws from the campaign's RNG stream makes the simulation
  // depend on how many times the player looked at a dialog.
  function intelSlate(G, live) {
    const cap = Game.difficulty().intelSlate || 0;
    if (!cap || live.length <= cap) return live;

    const worries = Assess.concerns();
    const spec = (id) => INTEL_SLATE.orders[id] || INTEL_SLATE.fallback;
    // Same arithmetic as a course of action and a diplomatic track, against the
    // same one read of the board: the urgency of a tasking is the severity of
    // the worst thing it answers. Undamped, unlike State's three — this slate is
    // two thirds random already, which is a stronger rotation than any damper,
    // and stacking one on top would start moving the good answer off the slate.
    let best = null;
    for (const a of live) {
      const s = spec(a.id);
      let sev = 0;
      for (const cid of s.answers) {
        const c = worries.find(w => w.id === cid);
        if (c && c.sev > sev) sev = c.sev;
      }
      const rank = s.weight * (0.3 + s.scale * sev);
      if (!best || rank > best.rank) best = { a, rank };
    }

    // xorshift on the turn, so the same night always deals the same alternates
    let seed = (G.turn * 2654435761) >>> 0 || 1;
    const next = () => {
      seed ^= seed << 13; seed >>>= 0;
      seed ^= seed >> 17;
      seed ^= seed << 5;  seed >>>= 0;
      return seed / 4294967296;
    };
    const rest = live.filter(a => a !== best.a);
    for (let i = rest.length - 1; i > 0; i--) {
      const j = Math.floor(next() * (i + 1));
      [rest[i], rest[j]] = [rest[j], rest[i]];
    }
    const picked = new Set([best.a, ...rest.slice(0, cap - 1)]);
    return live.filter(a => picked.has(a));
  }

  const INTEL_EMPTY = '<div class="dim" style="font-size:11px;margin-top:6px">' +
    'No tasking worth the sortie. The collection picture is as good as ' +
    'assets can make it — strike something and let a night pass.</div>';

  // The picture over the orders, which is the whole shape of this slot: the
  // state first, then the night's one decision against it. Both homes render
  // exactly this — and they are handed the two halves separately rather than
  // one string, because the room lays its orders out in columns and a readout
  // is not a column. Same split, one renderer: the drawer glues them back
  // together below.
  function intelParts(G) {
    const s = intelState(G);
    const live = intelSlate(G, intelTaskings(G, s));
    return {
      head: intelPicture(s),
      rows: live.length ? actionButtons(live, G.intelUsed) : INTEL_EMPTY,
    };
  }

  function intelBody(G) {
    const p = intelParts(G);
    return p.head + p.rows;
  }

  function renderIntel(G) {
    // On a level that briefs this slot in the room the drawer is trimmed off the
    // rail entirely (DIFFICULTY.railPanels) and openPanel refuses it, so there
    // is nothing here to draw into — the brief's own room owns it instead. Same split as
    // CSAR.renderPanel makes for the recovery.
    if (Game.popup('intel')) return;
    $('intel-status').textContent = G.intelUsed ? '— SLOT SPENT THIS TURN' : '';
    $('intel-buttons').innerHTML = intelBody(G);
    wireActions('#intel-buttons');
  }

  let csarWasHidden = true;

  function renderSidebar(G) {
    CSAR.renderPanel(G);   // hidden unless there are Americans on the ground
    // A recovery panel that has just appeared opens itself. Whatever the player
    // had shut, aircrew on the ground outrank it.
    const csar = $('csar-panel');
    const csarHidden = csar.classList.contains('hidden');
    // openPanel rather than setPanelOpen: this is the case that function was
    // written for, and on a phone it is the difference between the recovery
    // opening and the recovery opening behind a tab nobody is looking at.
    if (csarWasHidden && !csarHidden) openPanel('csar', true);
    csarWasHidden = csarHidden;

    renderCoa(G);          // first in the sidebar; absent entirely on hard
    renderObjectives(G);
    renderResources(G);
    renderFleet(G);
    renderAdvisors(G);
    renderWorld(G);        // the board, then the one order against it
    renderDiplo(G);
    renderIntel(G);
    SpecOps.renderPanel(G);
    renderBadges();
    syncBriefButton();   // the way back into a dismissed brief, while there is one
    syncNuclearButton(); // and into the release folder, while there is a window
  }

  function renderAll(G) {
    renderHUD(G);
    renderSidebar(G);
  }

  // ---- ticker ----
  function setTicker(headlines) {
    $('ticker-text').textContent = headlines.join('  •••  ') + '  •••  ';
  }

  // ---- strike modal ----
  // Asset names sit mid-sentence ("Requires 2× cruise missiles"), so the
  // leading capital comes down — EXCEPT when the name opens on an aircraft
  // designation, where dropping it produces "b-2 bomber missions". A name that
  // starts with a capital followed by a lower-case letter is an ordinary word
  // and can be folded; anything else is a designation and is left alone.
  const lcFirst = (s) => /^[A-Z][a-z]/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s;

  // Nothing this target has can be tasked tonight, so the list of packages is a
  // list of reasons instead — deduplicated, in package order, so the first line
  // is what the target's best option is waiting on. Two tiers held by the same
  // intact belt is one sentence and not two.
  //
  // The magazine and the tanker plan get written out here because on a package
  // row they were a three-word tag hung off a label that carried the rest of the
  // meaning ("Wild Weasel sweep — 3 F-16CM sorties … — MAGAZINE SHORT"). Alone
  // in an otherwise empty dialog a tag is not an explanation, so each of them
  // has to say what ran out and when it comes back.
  //
  // Precedence matches what the rows did: a gate wins over MAGAZINE SHORT,
  // because a tier that is not in theater has generated no sorties either and
  // the magazine is the wrong thing to go and fix. See Game.pkgBlock.
  const MAG_SHORT = 'MAGAZINE SHORT — nothing left in the theater magazine holds a full ' +
    'package against this target. Sorties are generated back at the turn.';
  const NO_TANKERS = 'NO TANKER TRACKS — tonight\'s tanker plan is spent, and nothing that ' +
    'reaches this target flies unrefuelled. The tracks come back with tomorrow\'s plan.';

  function heldReasons(held) {
    const out = [];
    const push = (s) => { if (!out.includes(s)) out.push(s); };
    for (const h of held) {
      if (h.gate) { push(h.gate); continue; }
      if (!h.stock) push(MAG_SHORT);
      if (!h.fuel) push(NO_TANKERS);
      // The aircraft exist, the fuel exists, and there is nothing to hang under
      // them. Its own line rather than folded into MAGAZINE SHORT, because they
      // are answered by two different things: sorties come back at the turn,
      // weapons come back with the force flow.
      if (h.pgm) push(h.pgm);
    }
    return out;
  }

  function openStrikeModal(G, target) {
    currentTarget = target;
    selectedPkg = null;
    $('strike-target-name').textContent = target.name.toUpperCase();
    $('strike-target-desc').textContent = Game.targetDesc(target);
    $('strike-estimate').classList.add('hidden');
    $('btn-confirm-strike').disabled = true;

    const box = $('strike-packages');
    box.innerHTML = '';
    // Torn down on every open, because the two paths below disagree about what
    // this box is: a list of choices, or a single sentence explaining that there
    // are none. A radiogroup left over from the last target would announce the
    // refusal as though it were selectable.
    box.removeAttribute('role');
    box.removeAttribute('aria-label');
    box.onkeydown = null;

    // Congress, the tanker plan and the search for the target itself can all
    // take a target off the board without it being destroyed. Say which.
    const block = Game.barred(target);
    if (block) {
      box.innerHTML = `<div class="pkg-blocked">${block}</div>`;
      $('strike-modal').classList.remove('hidden');
      return;
    }

    // ---- what is actually on the menu ----
    // Only packages that can be tasked tonight are drawn. Through v1.70 every
    // package a target had was rendered whatever its state — greyed, with the
    // reason beside it — so the first thing a turn-one SAM site taught was which
    // two thirds of its own menu to ignore: a Wild Weasel sweep the belt has not
    // released, a heavy strike sitting in Fairford, a magazine one sortie short.
    // Three refusals and one choice, on the screen where the choice is made.
    //
    // Nothing is lost by dropping them, because not one of those reasons is a
    // fact about THIS target and every one of them is already standing in the
    // resources panel, where it belongs: a tier the ladder has not released sits
    // under NOT RELEASED with the percentage it is waiting on, a force still in
    // CONUS sits under NOT IN THEATER with its ETA, a magazine that no longer
    // holds a package says so on its own row, and the tanker plan and the
    // tasking order are the two gauges at the top of the box. The panel is where
    // a player asks why there are so few options; this dialog is where they pick
    // one.
    //
    // What IS lost is the answer when there are no options at all — a dialog
    // that opens empty says nothing about anything. So the partition is kept and
    // the refusals are written out in full when they are all there is.
    const flyable = [], held = [];
    target.packages.forEach((pkg) => {
      // the submarine shot is counted out of the boat's tubes, not the theater
      // magazine — same gate, different magazine, and it says which
      const have = Game.pkgStock(pkg);
      const { cost, ok: fuel } = Game.tankersFor(target, pkg);
      const stock = have >= pkg.qty;
      // the air-superiority ladder outranks both magazines: a tier that has not
      // been released is not short of anything, it is simply not flying tonight
      const gate = Game.pkgBlock(target, pkg);
      const pgm = Game.pgmBlock(pkg);
      if (stock && fuel && !gate && !pgm) flyable.push({ pkg, have, cost });
      else held.push({ gate, stock, fuel, pgm });
    });

    if (!flyable.length) {
      box.innerHTML = heldReasons(held).map(r => `<div class="pkg-blocked">${r}</div>`).join('');
      $('strike-modal').classList.remove('hidden');
      return;
    }

    // The packages are mutually exclusive plans against the same target, so the
    // list is a radiogroup and not a stack of buttons. That mapping buys two
    // things a row of buttons does not: the group is ONE tab stop, so the trap
    // installed at MODAL KEYBOARD AND SCREEN-READER BEHAVIOUR carries the player
    // ✕ → packages → AUTHORIZE → ABORT instead of making them tab past five
    // packages to reach the button, and a screen reader announces "2 of 4"
    // instead of leaving them to count what they have already passed. That count
    // is now the count of things that can fly, which is what it always claimed.
    //
    // Rows stay divs: the styling is written for divs, and a radio has no native
    // element that would survive this markup without restructuring it.
    box.setAttribute('role', 'radiogroup');
    box.setAttribute('aria-label', 'Strike packages');

    // The rows a keyboard can land on, in DOM order — now every row there is.
    const choosable = [];

    flyable.forEach(({ pkg, have, cost }) => {
      const div = document.createElement('div');
      div.className = 'pkg-option';
      div.setAttribute('role', 'radio');
      div.setAttribute('aria-checked', 'false');
      div.tabIndex = -1;
      // ---- what this package fires ----
      // A package used to name its PLATFORM and leave the weapon implied, which
      // is fine for a runway and wrong for a hull: the difference between an
      // AGM-84 and an AGM-158C against the same frigate is most of the decision
      // and none of it was on screen. Packages carrying a `weapon` name the
      // round; everything else falls back to the tier, which is still the right
      // sentence for two Strike Eagles and a load of JDAM.
      const w = pkg.weapon ? MARITIME_WEAPONS[pkg.weapon] : null;
      const round = w ? w.name : pkg.sub ? SUB_WEAPON_NAME : lcFirst(ASSET_NAMES[pkg.asset]);
      // ...and which magazine it comes out of, whenever that is not the theater
      // stock the counter above the list is already showing. The SM-6 line is
      // amber because it is the one package on the board that spends a magazine
      // the president is relying on for something else.
      // The count is already on the row as `available`, so this names the
      // magazine rather than counting it again — what the player needs to know
      // is not how many rounds there are but what ELSE those rounds were for.
      const magazine = pkg.escort === 'sm6'
        ? ' · <span class="pkg-mag">fired from the escort screen\'s interceptor cells — the umbrella over the Gulf bases</span>'
        : pkg.escort === 'nsm'
        ? ' · <span class="pkg-mag">fired from the screen\'s deck canisters — no reload until the ammunition ship</span>'
        : pkg.sub ? ' · <span class="pkg-free">no theater magazine spent</span>' : '';
      div.innerHTML = `<span class="pkg-name">${pkg.label}</span>` +
        `<span class="pkg-detail">Requires ${pkg.qty}× ${round} ` +
        // "1 tanker track of 10 left" reads as "1 out of 10" and means the
        // opposite — the cost is 1 and the plan has 10. Separate the two.
        `(available: ${have}) · ${cost ? `${plural(cost, 'tanker track')} ` +
        `· ${G.tankers} left tonight` : 'no tanker requirement'}` +
        magazine +
        (w ? `<span class="pkg-weapon">${w.range}</span>` : '') + '</span>';
      choosable.push({ div, pkg });
      div.addEventListener('click', () => choose(div, pkg, true));
      box.appendChild(div);
    });

    // Roving tabindex: the group holds a single tab stop, and before anything is
    // selected it sits on the first package. There is always at least one — the
    // empty case returned above.
    choosable[0].div.tabIndex = 0;

    // The one place a package becomes the selected one, whatever asked for it: a
    // click, Enter, Space, or an arrow walking the list. Selection, the estimate
    // box and the AUTHORIZE STRIKE gate move together, or the dialog starts
    // lying about what is about to be launched.
    function choose(div, pkg, reveal) {
      for (const el of box.querySelectorAll('.pkg-option')) {
        el.classList.remove('selected');
        el.setAttribute('aria-checked', 'false');
      }
      div.classList.add('selected');
      div.setAttribute('aria-checked', 'true');
      // the tab stop follows the selection, so Tab comes back to the package the
      // player chose rather than to the top of the list
      for (const c of choosable) c.div.tabIndex = c.div === div ? 0 : -1;
      div.focus();
      selectedPkg = pkg;
      showEstimate(G, target, pkg);
      $('btn-confirm-strike').disabled = false;
      if (!reveal) return;
      // On a landscape phone the package list alone fills the window, and
      // the estimate this choice just produced — the tanker bill, the
      // diplomatic bill, the aircrew loss risk — renders below the fold
      // while AUTHORIZE STRIKE sits enabled and fully visible above it.
      // Bring the numbers to the player rather than trusting them to go
      // looking: the whole point of the panel is to be read before the
      // button is pressed. Harmless on a desktop window, where nothing
      // overflows and the scroll is a no-op.
      //
      // Scroll the box itself rather than calling scrollIntoView on the
      // estimate: the estimate is un-hidden one line above, so its geometry
      // is a frame stale, and `nearest` reads that as "already visible" and
      // moves ten pixels. Waiting a frame and driving the scroller directly
      // puts the bottom of the estimate — loss risk, the unsuppressed
      // threat warning — against the bottom of the window every time.
      // Assigned rather than animated: a smooth scroll is silently a no-op
      // wherever reduced motion is in force, and a jump that always happens
      // beats an animation that sometimes does. There is no motion worth
      // watching here anyway — the player asked to read a number.
      requestAnimationFrame(() => {
        const body = $('strike-modal').querySelector('.modal-body');
        const est = $('strike-estimate');
        const want = est.offsetTop + est.offsetHeight - body.clientHeight;
        if (want > body.scrollTop) body.scrollTop = want;
      });
    }

    // Assigned rather than added, because openStrikeModal runs again for every
    // target the player opens and `box` outlives all of them — addEventListener
    // would stack a handler per strike planned, each closed over a stale list.
    box.onkeydown = (e) => {
      const row = e.target.closest('.pkg-option');
      const i = row ? choosable.findIndex(c => c.div === row) : -1;
      if (i < 0) return;

      // Enter and Space are what the row's role promises, and they get the same
      // reveal a click does: this is the player committing to a package rather
      // than passing over it, so the numbers come to them.
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault(); // Space would otherwise page the modal body
        choose(row, choosable[i].pkg, true);
        return;
      }

      // Arrows walk the group and select as they go, which is the radiogroup
      // contract and also the right one here: comparing packages IS the decision
      // this dialog exists for, so every stop puts its own estimate up. The walk
      // wraps, and it deliberately does NOT scroll the estimate into view — that
      // would push the row being walked off the screen it is being walked on.
      const step = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1
        : e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : 0;
      if (!step) return;
      e.preventDefault(); // the arrows belong to the group, not to the scroller
      const next = choosable[(i + step + choosable.length) % choosable.length];
      choose(next.div, next.pkg, false);
    };

    $('strike-modal').classList.remove('hidden');
  }

  function showEstimate(G, target, pkg) {
    const est = Game.computeStrike(target, pkg);
    const pct = Math.round(est.success * 100);
    const sCls = pct >= 70 ? 'est-good' : pct >= 45 ? 'est-warn' : 'est-bad';
    // "probability of kill" means something different for a site that wears
    // down: the roll decides whether the package achieves effects, and what the
    // effects are worth is the bite it takes out of the condition track. Both
    // numbers go in front of the player, plus what it takes to finish the job.
    // How many more packages it takes is now a RANGE, because the condition it
    // is computed from is a range. This is the number the whole uncertainty
    // layer exists to make interesting: "one, probably — maybe two" is a
    // decision, and "two" is arithmetic.
    const band = Game.estimate(target);
    // The reading goes in the record here rather than at openStrikeModal,
    // because this is the line that actually puts a number in front of the
    // president — the dialog above it is a name, a blurb and a package menu.
    // See logReading in game.js.
    Game.logReading(target);
    const hitsLo = est.gradual ? Math.max(1, Math.ceil(band.lo / est.damage)) : 0;
    const hitsHi = est.gradual ? Math.max(1, Math.ceil(band.hi / est.damage)) : 0;
    const hits = hitsLo === hitsHi ? `${hitsLo}` : `${hitsLo}–${hitsHi}`;
    // only the B-2 pays a transit turn now — the heavies land the same night
    // they are tasked (see MISSION_ETA in game.js)
    const eta = pkg.eta || (pkg.asset === 'stealth' ? 2 : 1);
    const totWhy = pkg.joint ? 'joint mission planning and transit'
      : 'transit from Diego Garcia';
    const tot = eta > 1
      ? `TIME ON TARGET: <span class="est-warn">${eta} turns — ${totWhy}</span>`
      : 'TIME ON TARGET: <span class="est-good">end of this turn — BDA with the battle report</span>';
    const worldCost = target.world + (pkg.extraWorld || 0);
    let html =
      // against a hull there is no partial result to report, so the number means
      // what it says: this is the chance she goes down
      `EST. PROBABILITY OF ${est.oneShot ? 'KILL' : 'EFFECTS'}: <span class="${sCls}">${pct}%</span><br>` +
      (est.oneShot
        ? `<span class="est-good">One weapon on target sinks her — no partial damage, and a sunk hull ` +
          `never comes back.</span><br>` : '') +
      (est.gradual
        ? `ASSESSED CONDITION: <span class="${band.lo >= 100 ? 'est-bad' : 'est-warn'}">` +
          `${Game.condition(target)}</span>` +
          (band.age > 0
            ? ` <span class="dim">(last looked at ${band.age} turn${band.age === 1 ? '' : 's'} ago — ` +
              `it has been repairing since)</span>` : '') + `<br>` +
          `PACKAGE WEIGHT: <span class="est-good">−${est.damage} condition</span> on full effects, ` +
          `<span class="dim">half that on partial — an estimated ${hits} more package` +
          `${hits === '1' ? '' : 's'} on target to finish it</span><br>`
        : '') +
      `TANKER COST: <span class="${est.tanker > G.tankers ? 'est-bad' : 'est-good'}">` +
      `${est.tanker ? `${plural(est.tanker, 'track')} · ${G.tankers} left tonight`
                    : 'none — flies unrefuelled'}` +
      `</span><br>` +
      `${tot}<br>` +
      // Two different bills. `worldCost` is what tonight costs; `worldOnKill` is
      // what the target costs when it finally stops working, and the player has
      // to be able to see that before committing the first package — otherwise
      // a free-looking strike hands them a −8 they never agreed to.
      `WORLD OPINION: <span class="${worldCost ? 'est-warn' : 'est-good'}">` +
      `${worldCost ? signed(worldCost) : 'no cost for this strike'}</span>` +
      // the joint packages only exist against the enrichment sites, and those
      // now cost nothing on their own — so the whole number is the surcharge
      (pkg.extraWorld
        ? ` <span class="dim">(${target.world ? `${signed(target.world)} target, ` : 'the aimpoint itself costs nothing — '}` +
          `${signed(pkg.extraWorld)} for flying it with Israel)</span>` : '') + `<br>` +
      (target.worldOnKill
        ? `<span class="est-warn">DESTROYING IT COSTS ${MINUS}${Math.abs(target.worldOnKill)}</span> ` +
          `<span class="dim">— the diplomatic bill lands once, the night the site is finished, ` +
          `not for the packages that get it there.</span><br>` : '');
    // Flying outside the tasking order (see ATO in data.js). The ordinal is what
    // makes this land — "fourth package tonight" is a decision and "surge
    // penalty applied" is a status bar — and the line has to carry the half of
    // the cost that appears in no number on this screen: tomorrow's plan. The
    // aircrew multiplier is the figure meant to stop the player, so it is stated
    // rather than left inside the loss-risk percentage at the bottom.
    if (est.over > 0) {
      const nth = ['', 'FIRST', 'SECOND', 'THIRD', 'FOURTH', 'FIFTH', 'SIXTH', 'SEVENTH', 'EIGHTH',
        'NINTH', 'TENTH'];
      const n = G.strikesThisTurn + 1;
      // A wing already at maximum debt owes nothing further — saying "one
      // package shorter" there would be a promise the next turn does not keep.
      const maxed = (G.fatigue || 0) >= ATO.maxFatigue;
      html += `<span class="est-bad">${nth[n] || `PACKAGE ${n}`} PACKAGE TONIGHT — LATE FRAG.</span> ` +
        `<span class="dim">Outside a tasking order of ${est.slots}: hasty target study, whatever ` +
        `tanker is airborne, a crew briefed on the ramp. ${MINUS}${Math.round(est.surge * 100)}% ` +
        `effects and aircrew risk ×${est.surgeLoss.toFixed(2)}` +
        (maxed
          ? ', and the wing is already as far into crew-rest debt as it goes.'
          : `, and tomorrow's plan is one package shorter.`) + `</span><br>`;
    }
    // flying a tier outside its phase — only reachable on hard, and the player
    // is told in as many words what they are ordering
    if (est.raw) {
      html += `<span class="est-bad">FLYING INTO AN UNSUPPRESSED THREAT. ` +
        `${pkg.asset === 'heavy' ? 'Heavy bombers have no business over a live SAM belt'
          : 'These are fourth-generation airframes and the belt is still up'} — ` +
        `the staff has written this plan because it was ordered to.</span><br>`;
    }
    if (est.adPenalty > 0.01) {
      html += `<span class="est-warn">Air defenses degrade this package (−${Math.round(est.adPenalty * 100)}%).</span> `;
    }
    if (est.adaptPenalty > 0.01) {
      html += `<span class="est-warn">Iran has adapted to this platform (−${Math.round(est.adaptPenalty * 100)}%) ` +
        `— mixing the force is what walks this back.</span> `;
    }
    // Three states, not two. The middle one is the attrition floor (see
    // AIR_ASSETS): with the belt suppressed the risk rounds to zero and the old
    // two-branch version told the player "No aircrew at risk" about a night
    // package over a hostile country. It never reads zero for anything with
    // somebody aboard, because it never is zero.
    if (est.lossRisk >= 0.01) {
      html += `<span class="est-bad">Aircrew loss risk: ${Math.round(est.lossRisk * 100)}%.</span>`;
    } else if (est.lossRisk > 0) {
      html += `<span class="est-warn">Aircrew loss risk: under 1% — the threat is suppressed, ` +
        `not absent.</span>`;
    } else {
      html += `<span class="est-good">No aircrew at risk.</span>`;
    }
    $('strike-estimate').innerHTML = html;
    $('strike-estimate').classList.remove('hidden');
  }

  // ---- the target folder ----
  // What tapping an aimpoint does where the president does not write the
  // tasking order. It is everything the strike dialog says ABOUT a site and
  // nothing that orders one — deliberately the same estimate, the same
  // staleness warning and the same perishable-fix line, because the reason to
  // keep the plot live on easy is that reading it is how a player decides which
  // course of action the night wants. Take the information away with the target
  // list and the menu becomes a coin flip.
  function openTargetCard(G, target) {
    $('target-card-name').textContent = target.name;
    const st = target.status || 'intact';
    const band = Game.estimate(target);
    // On easy this card is the only place a band is read, so it is the reading
    // that gets recorded — same contract as showEstimate above.
    Game.logReading(target);
    const col = st === 'intact' ? 'var(--red)' : st === 'damaged' ? 'var(--amber)' : 'var(--dim)';
    $('target-card-status').innerHTML =
      `<span style="color:${col}">ASSESSED ${st.toUpperCase()}` +
      (st === 'destroyed' ? '' : ` — ${Game.condition(target)}`) + `</span>` +
      (!band.known && band.age > 0
        ? `<br><span class="dim">Last assessed ${plural(band.age, 'turn')} ago — the estimate widens ` +
          `every night nobody looks.</span>` : '');
    $('target-card-desc').textContent = Game.targetDesc(target);

    const barred = Game.barred(target);
    $('target-card-note').innerHTML = st === 'destroyed'
      ? 'This aimpoint is off the list.'
      : barred ? `<span style="color:var(--red)">${barred}</span>`
      // Which is the sentence that has to do the teaching, so it names the
      // panel by the words on it rather than saying "you cannot do this here".
      : 'CENTCOM builds the tasking order. If this site is worth a package tonight it will ' +
        'appear under TONIGHT\'S OPTIONS — signing the option that covers it is how it gets flown.';
    $('target-card').classList.remove('hidden');
  }

  function closeStrikeModal() {
    $('strike-modal').classList.add('hidden');
    currentTarget = null;
    selectedPkg = null;
  }

  // ---- turn report modal ----
  // Two people read this screen. One wants the prose — the assessment language,
  // the miss reasons, the casualty sentence. The other wants to know whether the
  // night went well and what it cost, and will not read twelve paragraphs to find
  // out. The prose loses that fight every time it is the only thing on offer: a
  // wall of text gets ACKNOWLEDGE'd unread, and then the player is making
  // decisions off a war they never actually read.
  //
  // So the report is built the other way round. A one-line verdict and a strip of
  // net changes come first, every event is one scannable line carrying its own
  // impact chips, and the full assessment is one tap underneath. Nothing has to
  // be opened to play correctly — opening is for the player who wants the story.
  const VERBOSE_KEY = 'cic-report-verbose';
  const verbose = () => { try { return localStorage.getItem(VERBOSE_KEY) === '1'; } catch (e) { return false; } };
  const setVerbose = (v) => { try { localStorage.setItem(VERBOSE_KEY, v ? '1' : '0'); } catch (e) {} };

  // Everything the night did, added up once. Individual events still carry their
  // own numbers on their own line; this is the version you can read in a second.
  function digest(events) {
    const d = { destroyed: 0, damaged: 0, missed: 0, lost: 0, kia: 0,
      dApproval: 0, dOil: 0, dWorld: 0, dTanker: 0, hormuz: null };
    for (const ev of events) {
      if (ev.outcome === 'destroyed') d.destroyed++;
      else if (ev.outcome === 'damaged') d.damaged++;
      else if (ev.outcome === 'miss') d.missed++;
      if (ev.aircraftLost) d.lost++;
      d.kia += ev.casualties || 0;
      d.dApproval += ev.dApproval || 0;
      d.dOil += ev.dOil || 0;
      d.dWorld += ev.dWorld || 0;
      d.dTanker += ev.dTanker || 0;
      if (ev.hormuz) d.hormuz = ev.hormuz;   // last word on the strait wins
    }
    return d;
  }

  // The verdict line: what happened, in the fewest words that are still true.
  function headline(d) {
    const parts = [];
    if (d.destroyed) parts.push(`${plural(d.destroyed, 'target')} destroyed`);
    if (d.damaged) parts.push(`${d.damaged} damaged`);
    if (d.missed) parts.push(`${plural(d.missed, 'strike')} with no effect`);
    if (d.lost) parts.push(`${plural(d.lost, 'aircraft')} lost`);
    if (d.kia) parts.push(`${plural(d.kia, 'American')} killed`);
    if (d.hormuz) parts.push(`Hormuz ${d.hormuz.toLowerCase()}`);
    return parts.join(' · ');
  }

  // A number the player is meant to read at a glance, so it is signed, colored
  // by whether it helped or hurt, and never explained. `good` is the direction
  // that is good for the president: approval and world opinion up, oil down.
  function chip(label, val, good, unit) {
    if (!val) return '';
    const n = Math.round(val * 10) / 10;
    const sign = n > 0 ? '+' : '−';
    const body = unit === '$' ? `${sign}$${Math.abs(n)}` : `${sign}${Math.abs(n)}`;
    const tone = (n > 0) === good ? 'good' : 'bad';
    return `<span class="rc ${tone}"><b>${body}</b>${label}</span>`;
  }

  function chipsFor(o) {
    return chip('APPROVAL', o.dApproval, true) +
      chip('OIL', o.dOil, false, '$') +
      chip('WORLD', o.dWorld, true) +
      chip('TANKERS', o.dTanker, true) +
      ((o.casualties || o.kia)
        ? `<span class="rc bad"><b>+${o.casualties || o.kia}</b>US KIA</span>` : '') +
      ((o.aircraftLost || o.lost)
        ? `<span class="rc bad"><b>−${o.lost || 1}</b>AIRCRAFT</span>` : '') +
      (o.hormuz
        ? `<span class="rc ${o.hormuz === 'OPEN' ? 'good' : 'bad'}"><b>HORMUZ</b>${o.hormuz}</span>` : '');
  }

  // The collapsed line. `sum` is written by whatever produced the event when it
  // knows the outcome in four words (see resolveImpact); a title is the fallback,
  // and for Iran's events the title already is the summary.
  const evSummary = (ev) => ev.sum || ev.title;

  // The one way to read an event's prose. `text` may be a function of the event
  // rather than a string, because an event is not finished when it is built:
  // aegisIntercept rescales casualties on every strike inside the naval BMD
  // umbrella, and a builder that baked its figure into a string went on quoting
  // the pre-intercept count next to chips showing the post-intercept one.
  // Anything added after the fact lands in `appended`. Nothing outside this
  // helper reads `.text`.
  const evBody = (ev) =>
    (typeof ev.text === 'function' ? ev.text(ev) : ev.text || '') + (ev.appended || '');

  // opts.prose forces every event open: the set pieces the player triggered on
  // purpose and just watched an animation for — a raid debrief, a recovery, the
  // primer — are read for the writing, and there is one of them, not twelve a
  // night. The summary layout is for the nightly reports that stack up.
  function showReport(title, events, onClose, opts) {
    // Every event in this report has already been spent against G — applyEvent
    // runs before the retaliation report is built, and strike effects land back
    // in resolveMissions. The bar under the modal was last drawn before any of
    // that, so without this the report says "18 Americans killed" above a
    // casualty count that has not moved and an approval bar that disagrees with
    // the chip beside it. renderAll comes later, when the report is dismissed.
    renderHUD(Game.G);

    const d = digest(events);
    const verdict = headline(d);
    const strip = chipsFor(d);
    // A single-event report is already a one-liner — a cable, an intelligence
    // product. Collapsing one paragraph helps nobody.
    const collapsible = events.length > 1 && !(opts && opts.prose);
    const open = !collapsible || verbose();

    let html = '';
    // only worth a strip when there is more than one event to add up — on a
    // prose report or a single event the same numbers are already on the line
    if (collapsible && (verdict || strip)) {
      // a night with nothing to count still moved numbers — label the strip so
      // it does not read as an empty box
      html += `<div class="report-bottom-line">` +
        (verdict ? `<div class="bl-verdict">${verdict}</div>`
          : `<div class="bl-label">NET EFFECT TONIGHT</div>`) +
        (strip ? `<div class="bl-chips">${strip}</div>` : '') +
        `</div>`;
    }

    html += events.map((ev, i) => {
      const chips = chipsFor(ev);
      const sum = evSummary(ev);
      const detail = `<div class="ev-detail${open ? '' : ' hidden'}" id="ev-d${i}">` +
        (ev.sum ? `<div class="ev-title">${ev.title}</div>` : '') +
        `<div>${evBody(ev)}</div></div>`;
      if (!collapsible) {
        return `<div class="report-event ${ev.cls || ''}">` +
          `<div class="ev-sum">${sum}</div>` +
          (chips ? `<div class="ev-chips">${chips}</div>` : '') + detail + `</div>`;
      }
      return `<div class="report-event ${ev.cls || ''}">` +
        `<button class="ev-row" aria-expanded="${open}" aria-controls="ev-d${i}" data-i="${i}">` +
        `<span class="ev-caret">${open ? '−' : '+'}</span>` +
        `<span class="ev-sum">${sum}</span>` +
        (chips ? `<span class="ev-chips">${chips}</span>` : '') +
        `</button>` + detail + `</div>`;
    }).join('');

    $('report-title').textContent = title;
    const body = $('report-body');
    body.innerHTML = html;
    body.scrollTop = 0;

    // one line opens one assessment; the footer toggle is for the player who
    // wants all of them, every turn, without clicking twelve times
    if (collapsible) {
      body.onclick = (e) => {
        const row = e.target.closest('.ev-row');
        if (!row) return;
        const det = document.getElementById('ev-d' + row.dataset.i);
        const nowOpen = det.classList.toggle('hidden') === false;
        row.setAttribute('aria-expanded', nowOpen);
        row.querySelector('.ev-caret').textContent = nowOpen ? '−' : '+';
      };
    } else {
      body.onclick = null;
    }

    // Only the primer offers the walkthrough, and it re-arms it after this call.
    // Reset here rather than there so a nightly report cannot inherit the button
    // from the last brief the player happened to open.
    $('btn-report-tour').classList.add('hidden');

    const toggle = $('btn-report-detail');
    toggle.classList.toggle('hidden', !collapsible);
    if (collapsible) {
      const sync = () => {
        const all = verbose();
        toggle.textContent = all ? 'HIDE DETAIL' : 'FULL DETAIL';
        body.querySelectorAll('.ev-detail').forEach(el => el.classList.toggle('hidden', !all));
        body.querySelectorAll('.ev-row').forEach(r => {
          r.setAttribute('aria-expanded', all);
          r.querySelector('.ev-caret').textContent = all ? '−' : '+';
        });
      };
      toggle.onclick = () => { setVerbose(!verbose()); sync(); };
      toggle.textContent = verbose() ? 'HIDE DETAIL' : 'FULL DETAIL';
    }

    $('report-modal').classList.remove('hidden');
    $('btn-report-ok').onclick = () => {
      $('report-modal').classList.add('hidden');
      if (onClose) onClose();
    };
  }

  // ============================================================
  // THE WAR POWERS VOTE
  // ------------------------------------------------------------
  // The vote used to be event number eleven in the retaliation report, collapsed
  // to one line between a SAM site and a tanker track — so the night the target
  // list was shortened by law read exactly like the night a warehouse burned, and
  // players went into turn 15 not knowing the oil complex had come off the board.
  // It is the only event in the campaign that rewrites the rules for the fifteen
  // turns after it, so it gets a dialog of its own, after the report.
  //
  // Three parts, and the order is a fold problem rather than a taste one. The
  // amendments come SECOND, directly under the verdict, because they are the only
  // part that changes tomorrow's tasking and the first draft put them under a
  // seven-line paragraph — on a landscape phone that is the same disappearing act
  // the report line was, in a dialog built to end it. The prose explains the
  // amendments and so follows them; the record is the answer to "why?", which is
  // the least urgent question in the room and the one worth scrolling for.
  function showWarPowers(vote, onClose) {
    // Same argument as showReport: the approval swing has already been spent
    // against G, and the bar underneath was drawn before it.
    renderHUD(Game.G);

    const chips = chipsFor(vote);
    let html = `<div class="wp-verdict ${vote.cls || ''}">` +
      `<div class="wp-gavel" aria-hidden="true">⚖</div>` +
      `<div class="wp-verdict-text">` +
      `<div class="wp-result">${vote.title}</div>` +
      `<div class="wp-chamber">JOINT RESOLUTION · BOTH CHAMBERS · DAY ${Math.ceil(Game.G.turn / 2)}</div>` +
      `</div></div>`;

    if (chips) html += `<div class="wp-chips">${chips}</div>`;

    html += `<div class="wp-section"><div class="wp-label">STANDING RESTRICTIONS ON THE TARGET LIST</div>`;
    if (vote.bars && vote.bars.length) {
      html += `<ul class="wp-bars">` +
        vote.bars.map(b => `<li>${b}</li>`).join('') +
        `</ul><p class="wp-note dim">CENTCOM will refuse these aimpoints for the rest of the ` +
        `campaign, and the objectives are scored against the list you were left with.</p>`;
    } else {
      html += `<p class="wp-none">None. The campaign is authorized through its conclusion, ` +
        `and every aimpoint on the board remains available.</p>`;
    }
    html += `</div>`;

    html += `<div class="wp-section"><div class="wp-label">FROM THE FLOOR</div>` +
      `<p class="wp-prose">${evBody(vote)}</p></div>`;

    if (vote.record && vote.record.length) {
      html += `<div class="wp-section"><div class="wp-label">WHAT THE VOTE WAS WEIGHED AGAINST</div>` +
        `<dl class="wp-record">` +
        vote.record.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('') +
        `</dl></div>`;
    }

    const body = $('wp-body');
    body.innerHTML = html;
    body.scrollTop = 0;

    $('warpowers-modal').classList.remove('hidden');
    $('btn-wp-ok').onclick = () => {
      $('warpowers-modal').classList.add('hidden');
      if (onClose) onClose();
    };
  }


  // ============================================================
  // NUCLEAR RELEASE AUTHORITY
  // ------------------------------------------------------------
  // The folder the president is handed the night the breakout clock finishes.
  // Read the NUCLEAR block in data.js for why it has three rows on it; this is
  // only how they are put on a screen, and there are three rules in that.
  //
  // IT IS ITS OWN DIALOG, on the same grounds the War Powers vote is: it rewrites
  // what the rest of the campaign can be, and as line twelve of a retaliation
  // report it would collapse to one row between a SAM site and a tanker track.
  // It is chained LAST — behind even the gavel — because a nuclear test outranks
  // everything else that happened tonight and is therefore read with nothing
  // else left to read.
  //
  // IT IS DISMISSIBLE, unlike the allied call, because standing down is a real
  // answer and is usually the right one on the first night. RELEASE AUTHORITY in
  // #session-buttons is the door back, live for exactly as long as the window
  // is, which is what makes deferring safe rather than a way to lose the folder.
  //
  // AND THE THIRD ROW ASKS FOR A TYPED WORD. It is the only control in this game
  // that does. Every other irreversible order in here is one click behind a
  // confirm, and that is right for them, because all of them are survivable and
  // most of them are recoverable — this one ends the campaign on the press with
  // no roll, no report and no tomorrow. A player who ordered it by misreading a
  // button would be entitled to think the game had done it to them.
  function nuclearBody() {
    const st = Game.nuclearState();
    const opts = Game.releaseOptions();

    // The clock, and it is the first thing in the box because it is the only
    // reason any of the rest of it is a decision rather than a hypothetical.
    const left = st.left;
    const clock = `<div class="nuke-clock${left <= 1 ? ' critical' : ''}">` +
      `<div class="nuke-clock-n">${left}</div>` +
      `<div class="nuke-clock-l">${left === 1
        ? 'TURN BEFORE THE WEAPON IS FIELDED'
        : 'TURNS BEFORE THE WEAPON IS FIELDED'}</div></div>`;

    const head = `<div class="nuke-head">` + clock +
      `<p class="nuke-sit">A device was tested in the Dasht-e Lut on turn ${st.testedTurn}. ` +
      `It is being assembled, not yet mated to a launcher, and the assembly site is a place on a map. ` +
      `When this clock runs out the campaign ends — there is no version of this board that survives a ` +
      `fielded Iranian weapon, and no conventional package that reaches the building in time.</p></div>`;

    const rows = opts.map(o => {
      // The trap rung is drawn as a different KIND of thing, not as a third
      // card with worse numbers. It has no price row because there is no
      // currency left to state one in, and it carries the only warning label in
      // the game that is not also an argument.
      if (o.ends) {
        return `<div class="action nuke-row terminal${o.spent ? ' off' : ''}" data-action="nuke-${o.id}">` +
          `<button class="action-do nuke-do" data-nuke="${o.id}" ${o.spent ? 'disabled' : ''}>` +
          `<span class="action-name">${o.name}</span>` +
          `<span class="il-current">${o.where} — an estimated ` +
          `${o.iranDead.toLocaleString()} ${pluralize(o.iranDead, 'civilian death')}.</span>` +
          `<span class="nuke-terminal-warn">THE JOINT STAFF WILL EXECUTE THIS ORDER. NOTHING AFTER IT IS ` +
          `RECOVERABLE — NOT THE WAR, NOT THE PRESIDENCY, NOT THE COUNTRY THAT ORDERED IT.</span>` +
          `</button></div>`;
      }
      const odds = Math.round(o.coerce * 100);
      const bill = [
        ['APPROVAL', `${o.approval}`],
        ['LOYAL BASE', `${o.erode} pts, permanent`],
        ['STANDING ABROAD', `${o.world}`],
        ['TEHRAN FOLDS', `${odds}%`],
      ].map(([k, v]) => `<span class="coa-chip warn"><b>${k}</b> ${v}</span>`).join('');
      return `<div class="action nuke-row${o.spent ? ' off' : ''}" data-action="nuke-${o.id}">` +
        `<button class="action-do nuke-do" data-nuke="${o.id}" ${o.spent ? 'disabled' : ''}>` +
        `<span class="action-name">${o.name}</span>` +
        `<span class="il-current">${o.where}.</span>` +
        `<span class="coa-cost">${o.spent ? 'ALREADY EXECUTED THIS CAMPAIGN'
          : o.defuses
            ? 'STOPS THE CLOCK — destroys the device and the halls under it'
            : 'DOES NOT STOP THE CLOCK — a signal, and nothing else'}</span>` +
        `<span class="coa-defers">${o.iranDead
          ? `AN ESTIMATED ${o.iranDead.toLocaleString()} ${pluralize(o.iranDead, 'IRANIAN DEATH')}`
          : 'NO CASUALTIES — THE POINT OF IT IS THAT THERE ARE NONE'}</span>` +
        `<span class="nuke-bill">${bill}</span>` +
        `</button></div>`;
    }).join('');

    return head + `<div id="nuclear-buttons" class="nuke-rows">${rows}</div>`;
  }

  // `onClose` is the turn chain's `close` on the night of the test and absent
  // every time the president comes back through RELEASE AUTHORITY. It is held
  // by whichever of the two doors is pressed, and it is deliberately NOT fired
  // when an order ends the campaign — finish() owns the screen from there.
  function showNuclear(onClose) {
    renderHUD(Game.G);
    const modal = $('nuclear-modal');
    const body = $('nuclear-body');
    body.innerHTML = nuclearBody();
    body.scrollTop = 0;

    const shut = (run) => {
      modal.classList.add('hidden');
      syncNuclearButton();
      if (run && onClose) onClose();
    };

    for (const btn of modal.querySelectorAll('.nuke-do')) {
      btn.onclick = () => {
        const id = btn.getAttribute('data-nuke');
        const opt = Game.releaseOptions().find(o => o.id === id);
        if (!opt) return;
        // The typed word. See the third rule at the top of this block.
        if (opt.ends && !confirmTerminal()) return;
        const out = Game.releaseNuclear(id);
        if (!out) return;
        modal.classList.add('hidden');
        syncNuclearButton();
        // An order that ended the campaign goes straight to the endgame screen
        // and never runs the chain's `close`: there is no next turn to hand on
        // to, and nextTurn() behind an endgame screen is the bug that leaves a
        // finished war accepting orders.
        if (out.result) {
          if (out.events.length) {
            showReport('NUCLEAR RELEASE — EXECUTED', out.events, () => Game.finish(out.result), { prose: true });
          } else {
            Game.finish(out.result);
          }
          return;
        }
        showReport('NUCLEAR RELEASE — EXECUTED', out.events, () => shut(true), { prose: true });
      };
    }

    $('btn-nuclear-close').onclick = () => shut(true);
    $('btn-nuclear-stand-down').onclick = () => shut(true);
    modal.classList.remove('hidden');
  }

  // Typed confirmation for the countervalue strike. A native prompt() rather
  // than a fourth bespoke dialog on purpose: it is modal, it is keyboard-only,
  // it cannot be dismissed by a stray click on a backdrop, and it looks like
  // nothing else in this game — all four of which are the point. An empty or
  // cancelled answer is a refusal, which is the safe direction to resolve
  // ambiguity in for the one order that has no other door out of it.
  function confirmTerminal() {
    const answer = window.prompt(
      'STRATEGIC STRIKE — TEHRAN\n\n' +
      'This order kills roughly four million people and ends your presidency. It cannot be ' +
      'recalled, and there is no outcome after it in which any objective of this war is met.\n\n' +
      'Type EXECUTE to authenticate the order, or cancel.');
    return (answer || '').trim().toUpperCase() === 'EXECUTE';
  }

  // The door back, live for exactly as long as the window is. Same shape and
  // same reasoning as syncBriefButton — a decision a player can defer needs a
  // way back to it, or deferring is indistinguishable from losing the folder.
  function syncNuclearButton() {
    const btn = $('btn-nuclear');
    if (!btn) return;
    const st = Game.nuclearState();
    btn.classList.toggle('hidden', !st.open);
    if (st.open) btn.textContent = `RELEASE AUTHORITY — ${st.left} LEFT`;
    btn.onclick = () => showNuclear(null);
  }

  // ============================================================
  // THE WATCH-FLOOR VOICE CARD
  // ------------------------------------------------------------
  // Bottom-right of the map, up for as long as the room is talking. Six clips
  // carried information that existed in no other form: with the sound off, or
  // for a player who cannot hear them, the game simply did not say those things.
  // The caption is most of the reason this exists; the meter is what tells a
  // player who is looking at Bandar Abbas that it was said just now.
  //
  // A STATUS INDICATOR, NOT A DIALOG, and every part of that is deliberate. It
  // is not an .overlay, it never reaches initModals, it traps nothing, Escape
  // does not touch it and it never takes focus. The president is in the middle
  // of picking an aimpoint when the strait closes; the room announcing it must
  // not be able to interrupt that.
  //
  // Who talks and what they say lives in VOICE in audio.js, next to the file
  // each line belongs to. Nothing about the card touches G — see the raise/lower
  // pair in audio.js for why voice is transient state.
  // ============================================================

  // The voice stops and the card holds, flat, for a beat before it retires.
  // "Target marked." is one second of audio, and a caption nobody can finish
  // reading is not a caption — but stretching the METER past the clip would be
  // the card lying about whether anyone is still speaking. So the meter's life
  // is exactly the clip's life and the card's is a little longer, which is the
  // same two-state shape the leader call already uses (.connected, then .ended).
  const VC_LINGER = 2400;
  let vcTimer = null;

  function voiceUp(who, says) {
    const card = $('voice-card');
    if (!card) return;
    clearTimeout(vcTimer);
    // Unhide BEFORE writing the line. The caption sits in an aria-live region,
    // and a region mutated while it is still display:none is not reliably
    // announced — the one ordering constraint in here.
    card.classList.remove('hidden', 'vc-ended');
    $('vc-who').textContent = who;
    $('vc-caption').textContent = says;
  }

  // `hard` is a cut: the clip was silenced rather than allowed to finish, so
  // the card goes with it instead of holding.
  function voiceDown(hard) {
    const card = $('voice-card');
    if (!card) return;
    clearTimeout(vcTimer);
    if (hard) { card.classList.add('hidden'); return; }
    card.classList.add('vc-ended');
    vcTimer = setTimeout(() => card.classList.add('hidden'), VC_LINGER);
  }

  // ============================================================
  // HEAD-OF-GOVERNMENT CALL
  // ------------------------------------------------------------
  // Runs three times a campaign at most, and two of them are the same event:
  // London off the coalition cable, Paris the following turn (see `leaderCalls`
  // in game.js). Take those or don't; the numbers are tiny either way and the
  // point is the moment, not the point. The third is Jerusalem the night before
  // it goes alone, which is the same telephone and nothing else the same — so
  // everything that differs between a courtesy and an ultimatum is DATA:
  // office, country, the flag on the terminal, how the switchboard announces
  // it, and what either answer is worth. All of it comes from WORLD_LEADERS in
  // data.js, and which of a leader's takes gets played is decided there too and
  // handed in as `V`.
  // ============================================================

  // The flag pin, drawn at r=8 around a local origin so every flag is
  // interchangeable wherever it is dropped. Simplified on purpose: at 17px
  // across on screen, a faithful Union Jack is mud — the diagonals and the
  // cross are the whole recognisable signature and everything else is noise.
  // The same rule picks the Israeli flag apart: two bands and a six-pointed
  // star, and the star is drawn as two OPEN triangles because a filled hexagram
  // at this size is a blue dot.
  const PINS = {
    union: () =>
      `<rect x="-8" y="-8" width="16" height="16" fill="#0c2074"/>` +
      `<path d="M-8-8 L8 8 M-8 8 L8-8" stroke="#f4f6fb" stroke-width="3.6"/>` +
      `<path d="M-8-8 L8 8 M-8 8 L8-8" stroke="#c8102e" stroke-width="1.7"/>` +
      `<path d="M-8 0 H8" stroke="#f4f6fb" stroke-width="5.4"/>` +
      `<path d="M0-8 V8" stroke="#f4f6fb" stroke-width="5.4"/>` +
      `<path d="M-8 0 H8" stroke="#c8102e" stroke-width="3"/>` +
      `<path d="M0-8 V8" stroke="#c8102e" stroke-width="3"/>`,
    tricolore: () =>
      `<rect x="-8" y="-8" width="5.34" height="16" fill="#0d3b93"/>` +
      `<rect x="-2.67" y="-8" width="5.34" height="16" fill="#f4f6fb"/>` +
      `<rect x="2.67" y="-8" width="5.34" height="16" fill="#c8102e"/>`,
    magen: () =>
      `<rect x="-8" y="-8" width="16" height="16" fill="#f4f6fb"/>` +
      `<rect x="-8" y="-6.4" width="16" height="2.1" fill="#0d3b93"/>` +
      `<rect x="-8" y="4.3" width="16" height="2.1" fill="#0d3b93"/>` +
      `<path d="M0-3.5 L3.03 1.75 L-3.03 1.75 Z M0 3.5 L3.03-1.75 L-3.03-1.75 Z" ` +
        `fill="none" stroke="#0d3b93" stroke-width="1.15" stroke-linejoin="round"/>`,
  };

  function flagPin(kind, id) {
    const clip = `lc-pin-${id}`;
    const inner = (PINS[kind] || PINS.tricolore)();
    return `<clipPath id="${clip}"><circle cx="0" cy="0" r="8"/></clipPath>` +
      `<g clip-path="url(#${clip})">${inner}</g>` +
      `<circle cx="0" cy="0" r="8" fill="none" stroke="#d8b46a" stroke-width="1.4"/>`;
  }

  // ---- the secure voice terminal ----
  // This slot used to hold a cartoon head-and-shoulders — skin tone, suit, tie,
  // hair — and it was the only thing on screen fighting the rest of the game.
  // Every other surface here is instrumentation: a chart, a scope, a readout,
  // rendered by a machine in a windowless room. A contact photo made the one
  // moment in the campaign where a foreign government speaks to the President
  // directly look like a phone app, and it also meant the game was quietly
  // asserting what two real heads of government look like.
  //
  // What a president actually sees on this call is a crypto terminal. So: the
  // trace, the flag pin the portrait already used, and the classification. The
  // leader is identified by office and country in the text beside it, which is
  // how the call would really be announced.

  // Deterministic from a string — the same leader draws the same trace every
  // time, rather than reshuffling on every re-render of the same call.
  const seedOf = (s) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);

  // An oscilloscope trace of speech. Drawn twice end to end and scrolled by
  // exactly one width when the line is open (see .lc-wave in the stylesheet),
  // so the loop has no seam — which is why the last sample is forced back to
  // the first.
  function scopeTrace(seed, w, h, step) {
    let s = seed >>> 0 || 1;
    const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
    const amp = [];
    for (let x = 0; x <= w; x += step) {
      // an envelope, so it reads as syllables rather than static
      const env = 0.28 + 0.72 * Math.abs(Math.sin((x / w) * Math.PI * 2.5));
      amp.push((rnd() * 2 - 1) * (h / 2) * 0.88 * env);
    }
    amp[amp.length - 1] = amp[0];
    const pts = (off) =>
      amp.map((y, i) => `${(off + i * step).toFixed(1)} ${(h / 2 + y).toFixed(1)}`);
    return 'M' + [...pts(0), ...pts(w).slice(1)].join(' L');
  }

  function drawLeader(L) {
    const W = 132, H = 108;
    const wx = 8, wy = 38, ww = 116, wh = 40;   // the trace window
    const clip = `lc-scope-${L.id}`;
    return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" ` +
      `aria-label="Secure voice terminal — encrypted line to ${L.country}">` +
      `<defs><clipPath id="${clip}">` +
        `<rect x="${wx}" y="${wy}" width="${ww}" height="${wh}"/>` +
      `</clipPath></defs>` +
      // the case
      `<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" fill="#0a1120" stroke="#2a4a7a"/>` +
      // header: flag pin, then the country it is a line to
      `<g transform="translate(18,20)">${flagPin(L.pin, L.id)}</g>` +
      `<text x="32" y="17" class="lc-term-label">SECURE VOICE</text>` +
      `<text x="32" y="27" class="lc-term-sub">TYPE 1 · ${L.id.toUpperCase()}</text>` +
      // the trace window
      `<rect x="${wx}" y="${wy}" width="${ww}" height="${wh}" fill="#060d18" stroke="#1d3252"/>` +
      `<line x1="${wx}" y1="${wy + wh / 2}" x2="${wx + ww}" y2="${wy + wh / 2}" ` +
        `stroke="#1d3252" stroke-width="0.8"/>` +
      `<g clip-path="url(#${clip})">` +
        `<g class="lc-wave" transform="translate(${wx},${wy})">` +
          `<path d="${scopeTrace(seedOf(L.id), ww, wh, 4)}" class="lc-trace" fill="none"/>` +
        `</g>` +
      `</g>` +
      // footer: the classification, which is the other thing really on that box
      `<text x="8" y="92" class="lc-term-sub">CRYPTO SYNC</text>` +
      `<text x="${W - 8}" y="92" class="lc-term-sub" text-anchor="end">TS//SCI</text>` +
      `<line x1="8" y1="98" x2="${W - 8}" y2="98" stroke="#1d3252" stroke-width="0.8"/>` +
      `</svg>`;
  }

  // `L` is the leader (identity and portrait); `V` is the version of the call
  // being placed — clip, caption and readout — picked on world opinion back in
  // game.js. Everything that varies with tone comes off `V`, everything that is
  // the same person either way comes off `L`.
  //
  // `onResolve(accepted)` runs the moment the player answers — before the call
  // plays out — so the world-opinion swing is banked and saved even if they
  // close the tab while the leader is still talking.
  function openLeaderCall(L, V, onResolve, onDone) {
    const modal = $('leader-call-modal').querySelector('.modal');
    modal.classList.remove('connected', 'ended');
    $('lc-portrait').innerHTML = drawLeader(L);
    $('lc-country').textContent = L.country;
    // The country is already the line above, so the card carries the office
    // alone — "UNITED KINGDOM / The Prime Minister of the United Kingdom" said
    // it twice. The full title still goes in the sentence, where it reads.
    $('lc-name').textContent = L.office;
    $('lc-state-text').textContent = 'INCOMING — SECURE LINE';
    // the name is a title and carries its own article — mid-sentence it wants a
    // lowercase one, "Mr. President, the President of France is on the line".
    // No pronoun follows it: these are offices rather than named characters,
    // and the game has no business assigning one a gender it never established.
    const midSentence = L.name.charAt(0).toLowerCase() + L.name.slice(1);
    // The courtesy announcement, unless the leader carries one of its own —
    // an ally ringing to thank you and an ally ringing the night before it goes
    // alone are not put through the same way.
    $('lc-line').innerHTML = `<span class="dim">SECRETARY OF STATE —</span> ` +
      (L.announce ||
        `Mr. President, ${midSentence} is on the line, and would like to speak to you personally.`);
    $('lc-outcome').classList.add('hidden');
    $('lc-effect').classList.add('hidden');
    $('lc-footer').innerHTML = '';

    // The room goes quiet for the whole popup — the ring, the line, and the
    // beat after the leader stops talking. Both beds down to silence rather
    // than to their duck, anything already in flight stopped where it stands,
    // and anything that tries to start refused: see the secure line in
    // audio.js. It has to bracket all three states rather than the ring alone,
    // because the gap between hanging up the bell and opening the line is
    // exactly where a queued clip would land.
    AudioSys.lineOpen(V.clip);
    // The switchboard rings until somebody does something about it. Both
    // buttons stop it, and so does closing the popup — a bell still going after
    // the call has been dealt with is the one bug this is worth guarding.
    AudioSys.ringStart();

    const close = () => {
      AudioSys.ringStop();
      AudioSys.lineClose();   // the only door out of this popup — see lineOpen
      $('leader-call-modal').classList.add('hidden');
      if (onDone) onDone();
    };

    // What the answer cost or bought, written off the leader's own `stakes`
    // (see WORLD_LEADERS) rather than hardcoded here — the coalition's calls
    // move standing abroad and Jerusalem's is billed at home. A branch with
    // nothing in it draws no box at all: this popup's effect line is for
    // numbers, and a call that is purely information has none to show. That is
    // the correct rendering of taking Jerusalem's warning — what it buys is a
    // turn's notice, and the readout underneath says so in words.
    const STAKE_NAMES = { world: 'WORLD OPINION', approval: 'APPROVAL', oil: 'OIL' };
    const effect = (s) => {
      const box = $('lc-effect');
      const keys = Object.keys(STAKE_NAMES).filter(k => s && s[k]);
      if (!keys.length) { box.classList.add('hidden'); return; }
      box.textContent = keys.map(k => `${STAKE_NAMES[k]} ${Txt.signed(s[k])}`).join('  ·  ');
      box.classList.toggle('bad', keys.some(k => s[k] < 0));
      box.classList.remove('hidden');
    };
    const stakes = (accepted) =>
      (L.stakes && L.stakes[accepted ? 'accept' : 'decline']) || {};

    const btn = (label, cls, fn) => {
      const b = document.createElement('button');
      b.className = cls;
      b.textContent = label;
      b.addEventListener('click', fn);
      $('lc-footer').appendChild(b);
      return b;
    };

    btn('DECLINE — SECSTATE TAKES IT', 'btn-secondary', () => {
      AudioSys.ringStop();
      onResolve(false);
      modal.classList.add('ended');
      $('lc-state-text').textContent = 'DECLINED — CALL PASSED TO STATE';
      $('lc-line').textContent = L.declined;
      effect(stakes(false));
      $('lc-footer').innerHTML = '';
      btn('ACKNOWLEDGE', 'btn-primary', close);
    });

    btn('ACCEPT THE CALL', 'btn-primary', () => {
      AudioSys.ringStop();   // picked up — the bell stops before the line opens
      onResolve(true);
      modal.classList.add('connected');
      $('lc-state-text').textContent = 'LINE OPEN — SECURE';
      $('lc-line').textContent = V.caption;
      effect(stakes(true));
      $('lc-footer').innerHTML = '';
      // The clip is the scene. END CALL cuts it short and hands straight on to
      // the same finish the clip would have reached on its own, so a player who
      // does not want to sit through the whole thing never has to.
      const end = btn('END CALL', 'btn-secondary', () => AudioSys.cut(V.clip));
      AudioSys.playThen(V.clip, () => {
        modal.classList.remove('connected');
        modal.classList.add('ended');
        $('lc-state-text').textContent = 'CALL ENDED';
        $('lc-outcome').textContent = V.accepted;
        $('lc-outcome').classList.remove('hidden');
        end.textContent = 'ACKNOWLEDGE';
        end.className = 'btn-primary';
        end.replaceWith(end.cloneNode(true));   // drop the cut handler
        $('lc-footer').lastChild.addEventListener('click', close);
      });
    });

    $('leader-call-modal').classList.remove('hidden');
  }

  // ---- endgame ----
  //
  // Read top to bottom: what the war got graded, what happened, what it cost,
  // how each part of it scored, what Tehran was doing, who flew it, how good the
  // numbers you flew it on turned out to be, and then the whole thing turn by
  // turn. The last three are the reveals — three different things the president
  // could not see from inside the war, and they sit together for that reason.
  // The single grade goes FIRST and largest because it is the one
  // thing a player takes away from the screen — the old layout opened with a
  // seven-line verdict and put six independent letters under it, which asked
  // the president to do the weighting themselves and gave them no weights.
  function showEndgame(result) {
    // stashed for the feedback dialog, which is most useful in exactly the
    // moment after a war ends and wants to name the ending without re-deriving
    // it from the DOM
    lastEndgame = result;
    $('end-title').textContent = result.title;
    const vCls = result.kind === 'victory' ? 'end-victory' : result.kind === 'defeat' ? 'end-defeat' : 'end-stalemate';

    let html = '';
    const T = result.total;
    if (T) {
      html += `<div class="end-total ${vCls}">` +
        `<div class="et-mark grade-${T.letter}">${T.mark}</div>` +
        `<div class="et-body">` +
          `<div class="et-label">TOTAL WAR GRADE</div>` +
          `<div class="et-score"><b>${T.score}</b><span class="dim">/100 · weighted across ` +
            `${Txt.plural(result.grades.length, 'category')}, military heaviest</span></div>` +
          `<div class="et-blurb">${T.blurb}</div>` +
        `</div></div>`;
    }

    html += `<div class="end-verdict ${vCls}">${result.verdict}</div>`;
    html += `<p class="dim end-narrative">${result.narrative}</p>`;

    // The numbers the verdict is made of, before the grades that judge them.
    const S = result.stats;
    html += '<div class="end-stats">' + [
      ['APPROVAL', Math.round(S.approval) + '%'],
      ['OIL', '$' + Math.round(S.oil)],
      ['US DEAD', `${S.casualties}<span class="dim">/${S.limit}</span>`],
      ['TARGETS DESTROYED', S.destroyed],
      ['DURATION', Txt.turns(S.turns)],
      ['DIFFICULTY', S.difficulty],
    ].map(([k, v]) => `<div class="es-cell"><span>${k}</span><b>${v}</b></div>`).join('') + '</div>';

    // One row per category, each showing what it was worth. The weight is on
    // screen because the total is a weighted mean and a player who disagrees
    // with the grade is owed the arithmetic.
    const wsum = result.grades.reduce((s, g) => s + g.weight, 0) || 1;
    html += '<div class="end-section">ASSESSMENT</div>';
    html += '<div class="grade-list">';
    for (const g of result.grades) {
      html += `<div class="gr-row">` +
        `<div class="gr-head"><span class="gr-label">${g.label}</span>` +
          `<span class="gr-weight">${Math.round(100 * g.weight / wsum)}% of grade</span></div>` +
        `<div class="gr-letter grade-${g.letter}">${g.letter}</div>` +
        `<div class="gr-note">${g.note}</div>` +
        `<div class="gr-bar grade-${g.letter}" role="img" aria-label="scored ${g.score} out of 100">` +
          `<i style="width:${Math.max(2, g.score)}%"></i></div>` +
      `</div>`;
    }
    html += '</div>';

    // What Tehran was actually doing the whole time. Shown at the end whether
    // or not the player ever spent a slot finding out — and if they didn't, the
    // reveal is the lesson.
    if (result.posture) {
      html += `<div class="end-reveal"><span class="er-label">IRANIAN WAR PLAN</span> ` +
        `<strong>${result.posture.name}</strong>` +
        (result.postureKnown ? ' <span class="dim">(assessed during the war)</span>'
          : ' <span class="warn">(never assessed — you fought this campaign without knowing it)</span>') +
        `<div class="dim">${result.posture.brief}</div></div>`;
    }

    // Who flew it. Below the grade and outside it — the roster is a record, not
    // a score, and PERSONNEL RECOVERY already grades what happened to aircrew
    // (see the note in aircrew.js and WAR_GRADE in data.js).
    html += Aircrew.endgameHtml(result.aircrew);

    // What the intelligence picture was actually worth. Every band a reading put
    // in front of the president, against what was standing behind it at the
    // time — the one thing thirty turns of banded estimates never told them.
    //
    // THE COVERT-COUNT RULE DOES NOT BIND HERE, AND THE NEXT PERSON SHOULD NOT
    // HAVE TO RE-DERIVE WHY. Inside the war, nothing on screen may report how
    // many gaps are left in the folder — the intel panel gives leads carried,
    // boxes up and nights flown, and never the remainder — because that number
    // IS the mechanic: a president who can read it knows exactly when to stop
    // paying for collection, and the whole tier stops being a bet. This section
    // is post-war. There is no slot left to spend, no package left to write and
    // no decision left to corrupt, which is the same ground the Iranian war plan
    // above is revealed on. The in-war rule is about information reaching a live
    // decision, not about secrecy for its own sake. Anything that moves this
    // table back inside the campaign re-opens it.
    const readings = result.bdaLog || [];
    if (readings.length) {
      // WHICH ERROR THIS TABLE MEASURES, AND WHY IT IS NOT THE OBVIOUS ONE.
      // The first cut ranked readings by how far the truth sat OUTSIDE the band,
      // which is the natural question and produces an empty table: measured over
      // 120 campaigns in `.claude/betatest/bdalog.js`, the truth escaped the band
      // in 1% of readings and in 0% of the ones a collection deck flew. That is
      // the uncertainty layer working exactly as designed — the band opens six
      // points wide and grows six a night, so it is almost never WRONG. It is
      // just enormous: median 21 points of the condition track, mean 35, and at
      // the top of the range it is the whole track and says nothing at all.
      //
      // So the error the president actually ate is the distance from the middle
      // of the band — the number you plan against when the screen says 20–70 and
      // you have one package. That runs a median of 6 points and a maximum of
      // 50, with 13% of readings 30 or more points out. THAT is the lesson this
      // section exists to deliver, and a table of band escapes would have hidden
      // it behind a rounding error.
      //
      // Midpoint rather than estimate()'s own `mid`, deliberately: `mid` carries
      // the repair bias and is never shown, and what is being scored here is the
      // number the president could read off the screen.
      const mid = (r) => (r.lo + r.hi) / 2;
      const off = (r) => Math.round(r.truth - mid(r));
      const escaped = (r) => r.truth > r.hi || r.truth < r.lo;
      // Worst first and capped: the lesson is the reading that was furthest out,
      // not the ninety that were close, and a war that opens a lot of target
      // cards takes a couple of hundred of these (median 94, max 222 measured).
      // Sorting and capping are presentation — nothing here feeds a grade, per
      // logReading in game.js.
      const CAP = 12;
      const worst = readings.slice().sort((a, b) => Math.abs(off(b)) - Math.abs(off(a)));
      const out = worst.filter((r) => escaped(r)).length;

      // No AFTER-ACTION prefix: the timeline below carries one, and two of them
      // stacked reads as a repeated heading rather than two different reveals.
      html += '<div class="end-section">WHAT YOU WERE TOLD, AND WHAT WAS TRUE</div>';
      html += `<p class="dim end-narrative">${plural(readings.length, 'assessment')} read during the ` +
        `campaign. An estimate opens six points wide the night a collection deck flies it and grows ` +
        `twelve wider for every night nobody looks again, so the band nearly always held the true ` +
        `condition — it failed ` +
        (out ? `<span class="warn">${plural(out, 'time')}</span>. ` : 'not once. ') +
        `What it could not tell you is where inside it you were. These are the readings you were ` +
        `furthest out on: a plus is a site standing in better shape than the middle of your estimate — ` +
        `a package you believed had done the job and had not — and a minus is one already further gone ` +
        `than you thought, and ordnance spent on damage that was already there.</p>`;
      html += '<table class="timeline-table bda-table"><tr><th>T</th><th>AIMPOINT</th>' +
        '<th>ASSESSED</th><th>ACTUAL</th><th>OUT BY</th></tr>';
      for (const r of worst.slice(0, CAP)) {
        html += `<tr><td>${r.turn}</td><td class="tl-text">${r.name}` +
          (escaped(r) ? ' <span class="dim">— outside the band entirely</span>' : '') + `</td>` +
          `<td>${r.lo}–${r.hi}%</td><td>${r.truth}%</td>` +
          `<td class="bda-out">${off(r) === 0 ? '—' : signed(off(r))}</td></tr>`;
      }
      html += '</table>';
      if (readings.length > CAP) {
        html += `<p class="dim end-narrative">` +
          `${plural(readings.length - CAP, 'further reading')} closer than these.</p>`;
      }
    }

    // The campaign, one line a turn. The numbers are the shape of the war: you
    // can see the night it went wrong.
    if (result.timeline && result.timeline.length) {
      html += '<div class="end-section">AFTER-ACTION — THE CAMPAIGN, TURN BY TURN</div>';
      html += '<table class="timeline-table"><tr><th>T</th><th>APPR</th><th>KIA</th><th>NUKE</th><th>DEVELOPMENT</th></tr>';
      for (const r of result.timeline) {
        html += `<tr><td>${r.turn}</td><td>${r.approval}%</td><td>${r.dead}</td>` +
          `<td>${r.deg}%</td><td class="tl-text">${r.text}</td></tr>`;
      }
      html += '</table>';
    }

    $('end-body').innerHTML = html;
    $('end-modal').classList.remove('hidden');
  }

  // ============================================================
  // MODAL KEYBOARD AND SCREEN-READER BEHAVIOUR
  // ------------------------------------------------------------
  // Six dialogs, opened and closed from a dozen places across four files, every
  // one of them by toggling a single `hidden` class. Rather than route all of
  // those through a new open()/close() pair — a refactor with a dozen chances to
  // miss a site, and nothing to stop the next one being added the old way — this
  // watches the class. The DOM is already the source of truth for what is open;
  // a MutationObserver only makes it observable. A modal added later inherits
  // all of this by being an `.overlay` with a `.modal` in it, which is the same
  // deal `.modal-body` already offers for the scroll fade.
  //
  // Scoped to overlays that contain a `.modal`, which is what keeps the title
  // screen — an `.overlay` too, but a screen rather than a dialog — out of it.
  //
  // ESCAPE IS NOT UNIVERSAL, AND THAT IS DELIBERATE. It presses the dialog's own
  // dismiss control: the ✕ where there is one, otherwise whatever `data-esc`
  // names. The allied call and the endgame screen have neither, because the
  // first is take-it-or-don't by design (see the comment on its markup) and the
  // second offers NEW WAR, which is not a way of dismissing anything. A dialog
  // that deliberately has no third door does not get one from the keyboard.
  const modalStack = [];
  const lastFocus = new WeakMap();

  const modalOverlays = () =>
    [...document.querySelectorAll('.overlay')].filter(o => o.querySelector(':scope > .modal'));
  const modalOpen = (o) => !o.classList.contains('hidden');

  // Visible, reachable controls inside the dialog. `offsetParent` filters the
  // ones the dialog itself has hidden — FULL DETAIL on a single-event report,
  // the second footer button once the phone has been answered.
  const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), ' +
    'select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
  const focusablesIn = (root) =>
    [...root.querySelectorAll(FOCUSABLE)].filter(el => el.offsetParent !== null);

  const escControl = (overlay) => (overlay.dataset.esc
    ? $(overlay.dataset.esc)
    : overlay.querySelector('.modal-close'));

  // Everything below the top dialog stops taking focus or reaching a screen
  // reader. The dialogs are siblings of #app, not children, so making the app
  // inert does not make the open dialog inert with it.
  function syncInert() {
    const top = modalStack[modalStack.length - 1] || null;
    const app = $('app');
    if (app) {
      app.toggleAttribute('inert', !!top);
      if (top) app.setAttribute('aria-hidden', 'true'); else app.removeAttribute('aria-hidden');
    }
    for (const o of modalOverlays()) o.toggleAttribute('inert', modalOpen(o) && o !== top);
  }

  // Reconcile the stack with what is actually on screen. Called from the
  // observer, and again at the top of the key handler: a MutationObserver
  // delivers on a microtask, so anything that opens a dialog and reads the
  // keyboard in the same task would otherwise be answering for the dialog
  // underneath. Cheap enough to run on a keystroke — six elements and a class
  // check — and being idempotent is what makes it safe to call from both.
  function syncStack() {
    for (let i = modalStack.length - 1; i >= 0; i--) {
      if (modalOpen(modalStack[i])) continue;
      const gone = modalStack.splice(i, 1)[0];
      // hand focus back to whatever opened it — a target on the map, a sidebar
      // order — so keyboard play does not restart from the top of the document
      const prev = lastFocus.get(gone);
      lastFocus.delete(gone);
      if (prev && document.contains(prev) && prev.offsetParent !== null) prev.focus();
    }
    let opened = null;
    for (const o of modalOverlays()) {
      if (!modalOpen(o) || modalStack.includes(o)) continue;
      lastFocus.set(o, document.activeElement);
      modalStack.push(o);
      opened = o;
    }
    syncInert();
    // focus moves only on the transition, never on a plain reconcile, or every
    // keystroke would drag it back to the first button
    if (opened) {
      const f = focusablesIn(opened);
      (f[0] || opened.querySelector('.modal')).focus();
    }
    // The board is clear, so a briefing that stood down over the answer to a
    // slot order can walk back in. This is the one place that knows it: an
    // intelligence product can have an ally's phone call chained behind it, and
    // reopening the folder off either dialog's own onClose would put it
    // underneath the next one. Re-entrant by design and safe — resumeBrief
    // disarms itself before it opens anything, so the observer firing again on
    // the class it just changed finds nothing armed.
    if (!modalStack.length) resumeBrief();
  }

  function initModals() {
    const obs = new MutationObserver(syncStack);
    for (const o of modalOverlays()) {
      // the box itself is the focus of last resort — the report can be one
      // paragraph and a button that has not rendered yet
      o.querySelector(':scope > .modal').setAttribute('tabindex', '-1');
      obs.observe(o, { attributes: true, attributeFilter: ['class'] });
    }
    syncStack();

    document.addEventListener('keydown', (e) => {
      syncStack();
      const top = modalStack[modalStack.length - 1];
      if (!top) return;

      if (e.key === 'Escape') {
        const btn = escControl(top);
        if (btn) { e.preventDefault(); btn.click(); }
        return;
      }
      if (e.key !== 'Tab') return;

      // the trap: Tab off either end wraps rather than escaping into the map
      const f = focusablesIn(top);
      if (!f.length) { e.preventDefault(); return; }
      const first = f[0], last = f[f.length - 1];
      const cur = document.activeElement;
      const outside = !top.contains(cur);
      if (e.shiftKey && (outside || cur === first)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (outside || cur === last)) { e.preventDefault(); first.focus(); }
    });
  }

  // ---- beta feedback ----
  // Pre-fills a GitHub issue and never files one — see the note on
  // #feedback-modal in index.html for why the tester presses Submit themselves.
  const FEEDBACK_REPO = 'cleeper007/commander-in-chief';
  let lastEndgame = null;

  // EVERYTHING IN THIS BLOCK IS SOMETHING THE PLAYER CAN ALREADY SEE, and that
  // is a rule rather than a coincidence. `G` carries two things the campaign
  // spends real mechanics withholding: `iranPosture`, which is Tehran's war plan
  // and is supposed to cost an intelligence tasking to learn, and the covert
  // folder's unknown count, which the intel panel is under standing orders never
  // to report because that number IS the mechanic. A diagnostic dump is still a
  // screen the player reads, so a report button that printed either would hand
  // over both secrets the game is built to keep — in the one dialog nobody
  // thinks of as game content. Anything added here gets the same test: would the
  // HUD show it?
  function feedbackDiagnostics() {
    const G = Game.G;
    const badge = document.querySelector('.version-badge');
    const ver = ((badge && badge.firstChild && badge.firstChild.textContent) || '?').trim();
    const wp = G.warPowers.done ? (G.warPowers.result || 'held') : 'no vote yet';
    const end = lastEndgame
      ? lastEndgame.title + (lastEndgame.total ? ` (grade ${lastEndgame.total.letter}, ${lastEndgame.total.score}/100)` : '')
      : 'still playing';
    return [
      `build:      ${ver}`,
      `difficulty: ${G.difficulty}`,
      `turn:       ${G.turn} of 30`,
      `approval:   ${Math.round(G.approval)}    world: ${Math.round(G.world)}    oil: $${Math.round(G.oil)}`,
      `losses:     ${G.casualties.us} American dead, ${G.stats.aircraftLost} aircraft`,
      `progress:   ${G.stats.destroyed} destroyed, nuclear ${Math.round(G.nukeDegraded())}% degraded`,
      `israel:     ${G.israelPosture}    hormuz: ${G.hormuz}`,
      `warpowers:  ${wp}`,
      `outcome:    ${end}`,
      `screen:     ${window.innerWidth}x${window.innerHeight}`,
      `browser:    ${navigator.userAgent}`,
    ].join('\n');
  }

  function openFeedback() {
    // Rebuilt on every open rather than held: the whole value of the block is
    // that it describes the turn the tester is looking at.
    $('feedback-diag').value = feedbackDiagnostics();
    $('feedback-modal').classList.remove('hidden');
    $('feedback-note').focus();
  }

  function feedbackBody() {
    const note = $('feedback-note').value.trim();
    return (note || '_(no description given)_') + '\n\n---\n```\n' + $('feedback-diag').value + '\n```\n';
  }

  function initFeedback() {
    const btn = $('btn-feedback');
    if (btn) btn.addEventListener('click', openFeedback);

    $('btn-feedback-open').addEventListener('click', () => {
      const G = Game.G;
      const url = `https://github.com/${FEEDBACK_REPO}/issues/new` +
        `?title=${encodeURIComponent(`[beta] turn ${G.turn} — `)}` +
        `&body=${encodeURIComponent(feedbackBody())}`;
      window.open(url, '_blank', 'noopener');
      $('feedback-modal').classList.add('hidden');
    });

    // The fallback the COPY note in index.html is about. Label swap rather than
    // a toast: there is no toast in this game and one button is not a reason to
    // build one. clipboard.writeText is unavailable over plain http and inside
    // some in-app browsers, which is exactly where a tester is most likely to be
    // standing when they need it — so the failure says so instead of going quiet.
    const copy = $('btn-feedback-copy');
    copy.addEventListener('click', async () => {
      const restore = () => setTimeout(() => { copy.textContent = 'COPY'; }, 1600);
      try {
        await navigator.clipboard.writeText(feedbackBody());
        copy.textContent = 'COPIED';
      } catch (e) {
        $('feedback-note').focus();
        $('feedback-note').select();
        copy.textContent = 'PRESS ⌘C';
      }
      restore();
    });
  }

  // ---- wiring ----
  function init() {
    initPanels();
    initRail();      // after initPanels: the rail drives the same open/shut state
    initScrollEdge();
    initModalScrollEdge();
    initModals();
    initFeedback();
    document.querySelectorAll('[data-close]').forEach(btn => {
      btn.addEventListener('click', () => $(btn.dataset.close).classList.add('hidden'));
    });
    $('btn-confirm-strike').addEventListener('click', () => {
      if (currentTarget && selectedPkg) {
        const t = currentTarget, p = selectedPkg;
        closeStrikeModal();
        Game.executeStrike(t, p);
      }
    });
    $('btn-restart').addEventListener('click', () => window.location.reload());
    // The watch card's one piece of art, dropped in once. It is the only thing
    // in that card that never changes, so it is filled here rather than on
    // every raise — and it lives in JS rather than the markup so the advisor
    // panel stays the single home of the bust (see officerBust).
    const bust = $('vc-bust');
    if (bust) bust.innerHTML = officerBust();
  }

  // ---- primer ----
  // Reuses the report modal to teach what the advisors cannot say loudly enough
  // on a screen the player has not opened yet.
  //
  // ORDER IS THE POINT HERE. This used to lead with the two free action slots —
  // true, and the most common way a campaign is lost, but it is the SECOND
  // lesson. The first click of a new player's first war is the nuclear program,
  // because the title screen just told them to destroy it, and that click lands
  // on a buried target whose only effective package is a bomber still parked in
  // Missouri. Leading with the ladder and the bomber answers the question the
  // player actually has at the moment they read this; the action slots follow.
  //
  // AND SO IS LENGTH. Each card used to run 60-70 words, which is five dense
  // paragraphs on the first screen of a war the player is impatient to start —
  // and a wall of text gets ACKNOWLEDGE'd unread, which costs more than saying
  // less would have. The same argument the turn report already lost once, at the
  // top of showReport. Each card is now one idea in about 25 words: the action
  // first, the reason second, and the panel carrying the detail named in caps so
  // there is somewhere to go. The room teaches the rest — WALK ME THROUGH THE
  // ROOM in the footer runs these same lessons standing next to the widgets.
  //
  // Auto-shown on easy and normal only — a player who picked hard was warned the
  // staff refuses nothing. `manual` is the HOW TO PLAY button, which works at
  // every difficulty: suppressing the brief at boot is a judgement about pacing,
  // not a reason to make it unreachable for the rest of the war.
  // v1.77 — AND IT NOW TEACHES THE GAME THE PLAYER PICKED. The first card used
  // to open "Click any target to plan a strike", which on easy is an instruction
  // to go and do the one thing that level deliberately does not let you do:
  // tapping a site opens a folder and nothing else, and a player following the
  // brief would conclude the game was broken on their first click. A primer that
  // describes a different difficulty than the one running is worse than no
  // primer, so the cards that differ are chosen off the same two knobs the rest
  // of the feature reads (see DIFFICULTY).
  // `then` is what the room does once the president closes the brief. It runs on
  // the suppressed path too — hard never sees the primer at boot, and a
  // continuation that only fired when a dialog happened to be shown would make
  // the opening of the war depend on whether the player was being tutored.
  function showPrimer(manual, then) {
    if (!manual && (Game.G.difficulty || 'normal') === 'hard') { if (then) then(); return; }
    const d = Game.difficulty();
    const panels = [
      d.coa && !d.freeTargeting
        ? { cls: 'friendly', title: 'THE STAFF WRITES THE NIGHT',
            text: Game.popup('brief')
              ? 'CENTCOM walks in with options every evening and will not leave until you sign one. You ' +
                'are not picking aimpoints — you are picking which war tonight is for. BRIEF ME reopens ' +
                'the folder if you send the room away.'
              : 'CENTCOM briefs you options every evening under TONIGHT\'S OPTIONS. Sign one. You are ' +
                'not picking aimpoints — you are picking which war tonight is for.' }
        : d.coa
        ? { cls: 'friendly', title: 'TWO OPTIONS, AND THE REST IS YOURS',
            text: 'CENTCOM briefs you two plans under TONIGHT\'S OPTIONS, and neither fills the order. ' +
              'Sign one, then click targets on the map to spend what is left.' }
        : { cls: 'friendly', title: 'FIRST, GAIN AIR SUPERIORITY',
            text: 'Click any target to plan a strike. Most of your force is grounded until the SAM belt ' +
              'comes down, so hit air defenses first. STRIKE ASSETS shows what has been released.' },
      // The ladder still has to be taught on easy — the options are ranked
      // against it, and a president who never understands why BREAK THE AIR
      // DEFENSES keeps coming up first is picking off a menu rather than
      // reading a war.
      ...(d.freeTargeting ? [] : [{ cls: '', title: 'GAIN AIR SUPERIORITY FIRST',
        text: 'Most of the force is grounded until the SAM belt is down, which is why BREAK THE AIR ' +
          'DEFENSES keeps coming up. Gain air superiority and the heavier options open.' }]),
      // The board opens SHORT as of v1.69, and a player who reads night one as
      // the whole war mis-plans everything downstream of it — Arak arrives on
      // the ramp, so the nuclear objective is not even fully visible yet.
      //
      // The ramp itself is self-explaining after one turn: the JIPTL UPDATE
      // event lands in the report every night and says what was added. What the
      // report CANNOT say at the moment it matters is that rolling the belt back
      // makes it arrive faster — by the time that sentence fires, the player has
      // already either earned it or not. So the incentive is the half worth a
      // card, and it lands next to the card that gives the same order for a
      // different reason.
      { cls: '', title: 'THE TARGET LIST IS STILL OPENING',
        text: 'Tonight\'s board is not the whole list. CENTCOM releases more aimpoints every night, ' +
          'and more of them once the belt is down.' },
      // The tasking order is the currency the whole campaign is priced in as of
      // v1.28, and it is the first thing a new player runs into — three packages
      // on night one, and the fourth costs. Discovering that from a refusal on
      // the fourth click is the wrong way to learn the rule the game is about.
      // The late frag is a decision the president does not make on easy — the
      // staff sizes the option to the plan — so the card that teaches how to
      // spend a fourth package is dropped rather than reworded.
      ...(d.freeTargeting ? [{ cls: '', title: 'THREE PACKAGES A NIGHT',
        text: 'A fourth still flies, as a degraded LATE FRAG, and it comes off tomorrow\'s plan. ' +
          'Surge for a night that matters, not for every night.' }] : []),
      ...(Game.pgmLedger() ? [{ cls: 'iran', title: 'THE DEPOTS ARE FINITE',
        text: 'Precision weapons do not regenerate — only the force flow brings more. STRIKE ASSETS ' +
          'counts them. A bomber cell costs six times what an F-35 pair does.' }] : []),
      // TWO CARDS THAT COME OFF THE LEVEL THAT DOES NOT NEED THEM (v1.93).
      // Both taught a decision, and on `autoTheater` neither one is a decision
      // the president makes any more — which makes them worse than redundant.
      // The B-2 card said "call the 509th forward" and then, once CENTCOM took
      // the force flow, said "CENTCOM already did" — a card whose entire content
      // is that there is nothing to do, on the first screen of a first war,
      // where every card the player reads is a card they are looking for an
      // instruction in. The free-action card named two SIDEBAR PANELS that level
      // does not have: both slots arrive as rooms of the evening folder now
      // (DIFFICULTY.popups), the folder walks the president into them and will
      // not close while either still holds its order, so the failure this card
      // existed to prevent cannot happen there. Same rule the primer has
      // followed since v1.77 — a card describing a different game than the one
      // running is worse than no card.
      ...(d.autoTheater ? [] : [{ cls: '', title: 'THE NUCLEAR SITES NEED THE B-2',
        text: 'Fordow and Natanz are buried, and only the B-2 reaches them. It is still in Missouri, ' +
          'so call it forward from THEATER FORCES, one turn out.' }]),
      // What does NOT come off with it is the home front. The slots were only
      // ever half of that card and the warning was the other half — this game is
      // lost at home more often than it is lost over Iran, on every level — so
      // the lesson stays and loses the two panel names it can no longer point at.
      Game.popup('diplo')
        ? { cls: '', title: 'THE WAR IS LOST AT HOME', text: 'Watch the bottom bar. A campaign ' +
            'going well over Iran is routinely finished by the approval rating underneath it, and ' +
            'the folder puts a cable in front of you every night for exactly that reason.' }
        : { cls: '', title: 'TWO FREE ACTIONS EVERY TURN',
            text: 'One INTELLIGENCE tasking, one DIPLOMATIC action, both free. Watch the bottom bar: a war ' +
              'being won on the map is routinely lost at home.' },
      { cls: 'iran', title: 'IRAN HAS A PLAN YOU CANNOT SEE',
        text: 'Close the Strait, bleed you with missiles, or sprint for a bomb. Read it off what Tehran ' +
          'actually does, and fight the war in front of you.' },
    ];
    showReport('HOW TO PLAY: THE WAY THIS WAR IS FOUGHT', panels, then || null, { prose: true });
    // The brief is the reference; the walkthrough is the orientation. Offering
    // it from inside the brief rather than beside it keeps HOW TO PLAY a single
    // door, and keeps the written version as the thing that always works — it is
    // five headings and no measuring, where the walkthrough has rects to get
    // right on every viewport in the world.
    const walk = $('btn-report-tour');
    walk.classList.remove('hidden');
    // Through ACKNOWLEDGE's own handler, not past it. This hid the dialog itself
    // and dropped `then` on the floor, which was invisible while the continuation
    // only opened the advisors panel and stopped being invisible at v1.88: on a
    // level that ARMS the brief, `then` is what arms it, so a player who took the
    // walkthrough off the primer got a night with no READY FOR OPTIONS in the
    // primary slot — the one control the whole staged-brief design turns on.
    // BRIEF ME still stood, so the folder was reachable and nothing said it had
    // been skipped, which is the worst version of this bug.
    walk.onclick = () => {
      $('btn-report-ok').onclick();
      Tour.start();
    };
  }

  return { init, renderAll, renderHUD, renderSidebar, setTicker, openStrikeModal, openTargetCard, showReport,
    showWarPowers, showEndgame, showPrimer, openLeaderCall, closeAllPanels, openPanel, voiceUp, voiceDown,
    // syncBriefButton is exported for game.js's openBrief: arming the brief is
    // a state change with no render behind it, and the two buttons that stand
    // for the dialog have to follow it in the same tick.
    // briefSlotPending goes with it, and for the same reason it lives here at
    // all: BRIEF_STAGES is the ONE registry of which rooms a level's briefing
    // has, so game.js asks it rather than keeping a second list that could arm
    // the folder for a room the dialog does not render.
    // briefGoto is the walkthrough's, and only the walkthrough's — a card that
    // explains the collection deck has to have the collection deck on screen
    // behind it, whichever room the chain would have opened on.
    applyPanelTrim, openBrief, closeBrief, syncBriefButton, briefSlotPending, briefGoto,
    // The release folder. showNuclear is the turn chain's — it is chained last
    // on the night of the test and holds `close`, so a harness that stubs UI
    // must stub it as a SEAM and not a noop, exactly as showWarPowers is: a
    // swallowed onClose stalls the campaign on the test turn forever.
    // nuclearBody is exported for .claude/betatest/nuclear.js on the same
    // grounds as intelParts and coaRows — it is a pure read of G, so the probe
    // can hold it across stub() and measure what the room actually says.
    showNuclear, syncNuclearButton, nuclearBody,
    // Exported for .claude/betatest/state.js and nothing else in the game calls
    // them from out here. Both are pure functions of G — no DOM, deliberately —
    // so the probe can hold a reference across stub(), which noops every UI
    // method not on its keep list. That is the only way either surface gets
    // measured at all: the scripted personas call Game.doDiplo with an id they
    // picked themselves, so without this the ranker could throw on every night
    // of every campaign and no probe would notice. Same blind spot brief.js was
    // written for.
    //
    // `intelParts` joins them for exactly the same reason and on the same terms:
    // it returns two HTML strings off G and touches no live node, so
    // .claude/betatest/easystaff.js can hold it across stub() and read what the
    // intelligence room actually puts up. Without it the slate (see intelSlate,
    // and DIFFICULTY.intelSlate) is unreachable from the harness — the bots call
    // Game.doDiplo with an id they chose, so a ranker that threw every night
    // would look exactly like a ranker that worked.
    //
    // `coaRows` is here on the same ticket. It is the ONE renderer for an option
    // card in both of that card's homes, so it is also the one place a rule
    // about what may be signed becomes something the president can see — and
    // DIFFICULTY.coaSigns is enforced in takeCoa, which means the two can drift.
    // A card that offers what the model refuses reads as a bug rather than as a
    // rule, so the probe checks them against each other.
    stateOptions, diploActions, intelParts, coaRows };
})();
