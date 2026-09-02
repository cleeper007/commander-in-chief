// ============================================================
// THE WALKTHROUGH
// ------------------------------------------------------------
// The written brief (UI.showPrimer) is the reference — five headings a player
// can skim at turn 14 to check one fact. This is the orientation: the same
// lessons standing next to the widget each one is about, because "STRIKE ASSETS
// carries the count" means nothing to somebody who has not yet found STRIKE
// ASSETS among eight shut drawers.
//
// It runs on the live war and it spends nothing, because THE BOARD IS SEALED
// FOR THE DURATION. Through v1.73 the dim was a box-shadow and nothing else,
// which is not hit-testable, so every click went straight through it into the
// room underneath — and a player being shown the diplomatic shelf pressed
// something on it to see what it did, spent the turn's one action, and got a
// live confirmation dialog over the top of the card that was explaining the
// shelf. The same door was open on AUTHORIZE STRIKE, two steps earlier, on a
// dialog the walkthrough had opened itself. A walkthrough that can lose you the
// war is not a walkthrough. `#tour-block` now swallows every pointer event and
// the Tab branch of the key handler holds focus on the card, so the only live
// controls anywhere on screen are BACK, NEXT and END WALKTHROUGH.
//
// The strike dialog it opens is still the real one, on an air defense site it
// picks itself, and it picks a package too so the estimate is on screen to be
// read rather than described. Both are UI state — `currentTarget`, `selectedPkg`
// and what those two render — and neither is charged against `G`; the
// walkthrough presses ABORT on the way out regardless. A sandbox turn would be
// more code and would teach a room that is not the room.
//
// SEALED IS NOT TRAPPED, and that distinction is the design constraint the rest
// falls out of:
//
//   - Every card carries END WALKTHROUGH in the same place, and Escape does the
//     same thing whenever it is the walkthrough's to end. Those two are the exit,
//     they are live on every step, and having them is what buys the right to
//     seal everything else.
//   - No step waits on the player doing something. NEXT is the only thing that
//     has to be pressed to get through the whole card stack; the first card
//     opens the demonstration dialog itself off NEXT rather than standing there
//     until the map is clicked, which it now has to, because the map cannot be
//     clicked.
//   - BACK is symmetric with NEXT and never skips a card. Walking back into the
//     dialog steps reopens the dialog, because the alternative — stepping over
//     them to the map — was a BACK button that threw the player to step one.
//   - The loop is a watchdog as much as a positioner: if that dialog goes
//     away from under a step that lives inside it, the walkthrough moves on
//     rather than pointing at a widget that is gone.
//
// AND IT WALKS THE ROOM THE PLAYER IS ACTUALLY IN (v1.89). The written brief
// learned this at v1.77 and the walkthrough did not, which was survivable while
// easy differed only in who did the targeting and stopped being survivable at
// v1.87: easy is five sidebar sections, a brief that arrives as a dialog and a
// force flow CENTCOM runs itself, so a card stack built for eleven drawers spent
// a step outlining THEATER FORCES — a panel that level does not have, whose
// visible box is nothing, which leaves the ring collapsed and the card pointing
// at a name the player will never find — and opened the strike dialog on the one
// level where the map does not open strike dialogs at all. There are two step
// lists, chosen off `freeTargeting` like everything else that differs, and the
// demonstration dialog is per-list: the map level is shown a strike, the staffed
// level is shown the folder it signs, because that is the whole of its night.
// ============================================================
const Tour = (() => {
  const $ = (id) => document.getElementById(id);

  // THE DEMONSTRATION DIALOG, and which one it is belongs to the step list.
  // Both are the real dialog on the real board and both spend nothing: the
  // strike modal is UI state to the last line (see the note at the top) and
  // UI.openBrief only reads Game.coaOptions(), which renderCoa already calls on
  // every draw. Neither touches `G`, and the walkthrough closes whichever one it
  // opened on the way out. Note the brief is opened through UI, never through
  // Game.showBrief — that one clears `briefPending` and drains the theater
  // notes, so a walkthrough run before the folder was read would eat the night's
  // brief and put END TURN back with the president never having seen it.
  const DEMOS = {
    strike: {
      id: 'strike-modal',
      open() {
        const t = demoTarget();
        if (!t || Game.G.over) return false;
        UI.openStrikeModal(Game.G, t);
        return true;
      },
      close() {
        const b = document.querySelector('#strike-modal [data-close]');
        if (b) b.click();
      },
    },
    brief: {
      id: 'brief-modal',
      open() {
        if (Game.G.over) return false;
        // The notes are PEEKED, not taken, so the folder the president opens for
        // real after the walkthrough is still the whole folder. Passed in at all
        // because a demonstration of the brief with CENTCOM's own half missing is
        // a demonstration of a dialog this level does not have — the force flow
        // is reported there and nowhere else once THEATER FORCES comes off the rail.
        UI.openBrief(null, Game.peekTheaterNotes());   // declines if there is nothing to show
        return true;
      },
      close: () => UI.closeBrief(),
    },
  };
  let demo = DEMOS.strike;

  const demoOpen = () => {
    const m = $(demo.id);
    return !!m && !m.classList.contains('hidden');
  };

  // Any real dialog, by the same test initModals uses in ui.js — an .overlay
  // with a .modal in it, which is what keeps the title screen out of the count.
  const anyModalOpen = () => [...document.querySelectorAll('.overlay:not(.hidden)')]
    .some(o => o.querySelector(':scope > .modal'));

  // The estimate box does not exist until a package is picked, so this step
  // points at whichever of the two is actually on screen. Everything else names
  // an element that is always in the DOM.
  const estimateOrFooter = () => {
    const est = $('strike-estimate');
    if (est && !est.classList.contains('hidden')) return est;
    return document.querySelector('#strike-modal .modal-footer');
  };

  // Same problem one dialog over: CENTCOM's "already moved on this" block is
  // written fresh every night and is empty on most of them, so the card that
  // teaches the president what the staff does without asking has to fall back to
  // something that is always there. An empty div is worse than the wrong anchor
  // — visibleBox reports a zero-height box, the ring collapses to a line, and
  // the card settles against nothing.
  const notesOrFooter = () => {
    const n = $('brief-modal-notes');
    if (n && n.firstElementChild) return n;
    return document.querySelector('#brief-modal .modal-footer');
  };
  const notesUp = () => {
    const n = $('brief-modal-notes');
    return !!(n && n.firstElementChild);
  };

  // The primary button is not the same control on every level or in every half
  // of a turn — on a level that reads the brief as a dialog, READY FOR OPTIONS
  // stands in END TURN's place until the folder has been opened (syncBriefButton),
  // and END TURN is behind `held`. Point at whichever one the player is looking
  // at, or the last card of the walkthrough outlines a button that is not there.
  const endOrReady = () => {
    const r = $('btn-brief-ready');
    if (r && !r.classList.contains('hidden')) return r;
    return $('btn-end-turn');
  };

  // `panel` names a sidebar section to open first (the data-panel key).
  // `modal` marks the steps that live inside the strike dialog — what the
  // watchdog reads, and what moves the card into the dialog's focus trap.
  // `opens` marks the card whose NEXT has to have a strike dialog open behind it
  // before the next card, which lives inside one, can point at anything.
  // `pick` marks the card that needs a package selected behind it, because the
  // box it points at does not exist until one is.
  // `text` may be a function for the same reason `sel` may be: a card whose
  // anchor is chosen at run time cannot always describe it in a string written
  // at load time.
  //
  // MAP_STEPS is the room on a level that frags off the plot — normal and hard.
  const MAP_STEPS = [
    { sel: '#map-panel', opens: true,
      title: 'THE MAP IS THE ORDER FORM',
      text: 'Every marker is an Iranian target, and clicking one opens the strike dialog. ' +
        'NEXT opens it on an air defense site, which is the right first move.' },
    { sel: '#strike-packages', modal: true,
      title: 'PICK A PACKAGE',
      text: 'Each row is a way to hit it, and only what can fly tonight is listed. Anything ' +
        'missing, whether a tier the SAM belt has not released or a wing still in CONUS, ' +
        'is in the resources panel with the reason.' },
    // This button read ABORT for one version, because the walkthrough's NEXT and
    // the dialog's ABORT were the same action and a player who pressed ABORT
    // themselves watched the tutorial advance on its own. Sealing the board
    // settled it the other way: ABORT is not pressable during the walkthrough,
    // so a button labelled ABORT was naming a control the player could not reach
    // and breaking the one promise the card stack makes, which is that NEXT is
    // the only thing you ever have to press.
    { sel: estimateOrFooter, modal: true, pick: true,
      title: 'NOTHING IS SPENT UNTIL YOU AUTHORIZE',
      text: 'A package is picked here, and the estimate reads back the odds and the risk to ' +
        'aircrew before anything flies. Nothing is charged until you authorize, and ABORT ' +
        'costs you nothing.' },
    { sel: '#resources-panel', panel: 'resources',
      title: 'THREE PACKAGES A NIGHT',
      text: 'STRIKE ASSETS carries the count. Additional sorties still fly, degraded, and they ' +
        'come off tomorrow\'s plan.' },
    { sel: '#fleet-panel', panel: 'fleet',
      title: 'BRING IN MORE FIREPOWER',
      text: 'Not everything is in theater yet. Order it forward from here, including the B-2, ' +
        'the only aircraft that reaches Fordow.' },
    // The folder replaced "assess Tehran's intent" here rather than joining it,
    // because a card listing all six taskings is a menu and this one has to be a
    // recommendation. Naming the folder was defensible to leave out while the
    // covert tier resolved after most campaigns had ended; v1.66 moved the
    // median box to turn 6-7 and the aimpoint to 8-9, which puts it inside the
    // war the player is actually fighting and makes it the only route to four
    // sites, one of them an enrichment hall.
    //
    // The last sentence is the one that earns its words. The complaint the
    // persistence rule answers was never "the odds are low", it was "the slot
    // vanished and nothing happened" — and a player who reads one blank night as
    // a wasted tasking stops working the folder exactly when it was about to pay.
    { sel: '#intel-panel', panel: 'intel',
      title: 'INTELLIGENCE TASKING',
      text: 'Hunt the missile launchers, re-look a target you have hit, or work the target folder, ' +
        'which is the only way a hidden site becomes an aimpoint. A night that finds nothing still ' +
        'improves the next one.' },
    { sel: '#diplo-panel', panel: 'diplo',
      title: 'DIPLOMATIC ACTIONS',
      text: 'Steady the home front, work the coalition, or lean on Tehran. This shelf and ALLIES ' +
        'share one action a turn between them.' },
    { sel: '#status-row',
      title: 'THE WAR AT HOME',
      text: 'Approval, oil, world opinion, casualties. A war being won on the map is routinely ' +
        'lost along this bar.' },
    { sel: '#advisors-panel', panel: 'advisors',
      title: 'YOUR STAFF IS WORTH READING',
      text: 'Four advisors watching the war from four directions, the pressing ones flagged ' +
        'URGENT. When they agree on something, do it.' },
    { sel: '#btn-end-turn', next: 'DONE',
      title: 'THEN END THE TURN',
      text: 'Tehran answers overnight and the assessment lands in the morning. Thirty turns is ' +
        'the whole war.' },
  ];

  // ------------------------------------------------------------
  // STAFF_STEPS — the room on a level that staffs the night (easy).
  //
  // Same format, same card length, same one-idea-per-card rule as the written
  // brief: the action first, the reason second, the panel carrying the detail
  // named in caps. What changes is which room it is a tour of, and every
  // difference below is a difference the level actually has.
  //
  //   - The map is not the order form here. It opens a folder, not a strike, so
  //     the first card says so rather than telling the player to do the one
  //     thing this level does not let them do — the identical sentence the
  //     primer's first card had to lose at v1.77.
  //   - The demonstration is the BRIEF — five cards, one per thing the folder
  //     asks, walked across its three rooms — because the folder IS the night at
  //     this level. On the map levels those cards are a strike dialog for the
  //     same reason. Five and not three since v1.91: the two free actions used
  //     to be sections of one scroll and are rooms of their own now, and a card
  //     stack that walked the folder in a different order than the president
  //     does is a walkthrough of a screen this level does not have.
  //   - THEATER FORCES is gone with no replacement card, because the fact a
  //     player needed it for — the B-2 is in Missouri and somebody has to send
  //     for it — is no longer a decision here. CENTCOM's own line about it lands
  //     in the brief, which is where the card that mentions it points.
  //   - No card teaches the late frag. The staff sizes an option to the plan;
  //     surging past it is not a button this president has.
  const STAFF_STEPS = [
    { sel: '#map-panel', opens: true,
      title: 'USE THE MAP TO UNDERSTAND THE WAR',
      text: 'Every marker is an Iranian target. Select one to read what your staff knows about it. ' +
        'In Easy mode, the staff builds the strike plan for you.' },
    // THE THREE ROOMS, IN THE ORDER THE BRIEFING WALKS THEM (v1.91). Both free
    // action slots have to be taught here and neither can be a panel card:
    // INTELLIGENCE TASKING and DIPLOMATIC ACTIONS are both off easy's rail, so
    // the railPanels filter in start() drops any card naming one — which would
    // leave this level's walkthrough silent about BOTH of the free actions the
    // primer names as the most common way a new player loses. Grouped with the
    // other modal cards rather than left in the sidebar run: going modal, out,
    // and back in reopens the demo dialog mid-walkthrough, and a folder that
    // shuts and reappears reads as a fault in the game rather than as a step.
    //
    // `stage` is the room the card is about, and go() walks the demo folder to
    // it before framing anything. It is not optional on these five: they all
    // point at the same shell, and a card pointing at #brief-modal-buttons with
    // the wrong room dressed into it describes State's cables over CENTCOM's
    // options. The rooms are named in the same order the president walks them,
    // so the walkthrough never sends the folder backwards.
    { sel: '#brief-modal-head', stage: 'intel', modal: true,
      title: 'FIRST: CHECK WHAT YOU KNOW',
      text: 'The briefing starts with the nuclear timeline, missing missile launchers, and other ' +
        'unknowns. Green means reliable information. Red means your analysts need more evidence.' },
    { sel: '#brief-modal-buttons', stage: 'intel', modal: true,
      title: 'CHOOSE ONE INTELLIGENCE ACTION',
      text: 'Search for missile launchers, recheck a damaged target, or investigate signs of hidden ' +
        'sites. Even an unsuccessful search improves the next attempt.' },
    { sel: '#brief-modal-buttons', stage: 'brief', modal: true,
      title: 'THEN: CHOOSE TONIGHT\'S STRIKE PLAN',
      text: 'Each plan states why it matters now, what it is expected to achieve, and its tradeoff. ' +
        'Choose one; your military staff handles the individual targets.' },
    { sel: notesOrFooter, stage: 'brief', modal: true,
      title: () => (notesUp() ? 'WHAT THEY DID NOT ASK ABOUT' : 'SIGNING IS THE NIGHT'),
      text: () => (notesUp()
        ? 'Your staff moves aircraft and ships for you, including bringing forward the B-2 bomber ' +
          'needed for buried nuclear sites. Completed moves appear above your choices.'
        : 'Choose one plan to schedule its strike missions. Nothing is spent before you choose. ' +
          'If you close this screen, REOPEN BRIEFING brings it back.') },
    { sel: '#brief-modal-buttons', stage: 'diplo', modal: true,
      title: 'FINALLY: CHOOSE ONE DIPLOMATIC ACTION',
      text: 'Your staff narrows the available actions to three. Each shows its effect and tradeoff. ' +
        'Use one every night; ignoring diplomacy is a common way to lose.' },
    { sel: '#resources-panel', panel: 'resources',
      title: 'CHECK WHAT CAN FLY',
      text: 'AVAILABLE FORCES shows which aircraft and weapons are ready, held back, or still on ' +
        'the way. Your staff sizes every plan around what is available.' },
    { sel: '#status-row',
      title: 'THE WAR AT HOME',
      text: 'Approval, oil, world opinion, casualties, and on the right the one thing the staff ' +
        'says is worst tonight. A war being won on the map is routinely lost along this bar.' },
    { sel: '#advisors-panel', panel: 'advisors',
      title: 'YOUR STAFF IS WORTH READING',
      text: 'Four advisors watching the war from four directions, the pressing ones flagged ' +
        'URGENT. They argue from the same read the options are ranked against.' },
    { sel: endOrReady, next: 'DONE',
      title: 'MAKE THREE CHOICES, THEN END THE TURN',
      text: 'Choose one intelligence action, one strike plan, and one diplomatic action. Then end ' +
        'the turn to see the results. The war lasts thirty turns.' },
  ];

  // Chosen in start(), off the same knob the primer reads.
  let STEPS = MAP_STEPS;

  let i = -1;          // current step, -1 when the walkthrough is not running
  let root = null, ring = null, card = null;
  let raf = 0;
  let ownsModal = false;   // the strike dialog is the walkthrough's to close
  let hadOpen = [];        // sidebar sections the player had expanded before we started
  let pin = 0;             // frames left holding a freshly-opened section at the top
  let settle = 0;          // frames left in which the card may still reposition
  let lastBox = '';        // the anchor geometry the card was last placed against
  let keyHandler = null, resizeHandler = null;

  function build() {
    root = document.createElement('div');
    root.id = 'tour';
    root.className = 'hidden';
    // The blocker is the first child and the card is the last, so the card
    // paints over it and keeps its own clicks. It lives inside `root` rather
    // than beside it deliberately: `root` is what gets hidden, reparented and
    // torn down, and a seal that can outlive its teardown makes the game
    // unplayable. One element, one lifetime, no second cleanup path to forget.
    root.innerHTML =
      '<div id="tour-block"></div>' +
      '<div id="tour-ring"></div>' +
      '<div id="tour-card" role="region" aria-live="polite" aria-label="Walkthrough">' +
        '<div class="tour-step" id="tour-count"></div>' +
        '<div class="tour-title" id="tour-title"></div>' +
        '<div class="tour-text" id="tour-text"></div>' +
        '<div class="tour-nav">' +
          '<button id="tour-back" class="btn-secondary">BACK</button>' +
          '<button id="tour-next" class="btn-primary">NEXT</button>' +
        '</div>' +
        '<button id="tour-end" class="tour-end">END WALKTHROUGH</button>' +
      '</div>';
    document.body.appendChild(root);
    ring = $('tour-ring');
    card = $('tour-card');
    $('tour-back').addEventListener('click', onBack);
    $('tour-next').addEventListener('click', onNext);
    $('tour-end').addEventListener('click', endTour);
  }

  // BACK IS SYMMETRIC WITH NEXT: every card NEXT walked through, BACK walks
  // back through, in the same order and without skipping one. Step four closed
  // the strike dialog on its way in, so backing out of it lands on a card that
  // lives inside a dialog that is no longer there — and the first fix for that
  // was to step over those cards entirely, which made BACK on step four jump to
  // step one. Two cards vanished, and the button that was supposed to undo one
  // move undid three. Reopen the dialog instead; it is the walkthrough's own and
  // opening it costs nothing.
  //
  // The old skip survives as the fallback, for the case where the dialog cannot
  // be reopened at all — nothing left on the plot to demonstrate on. Without it
  // the watchdog would see a modal step with no modal and bounce straight
  // forward again, which is the dead button all over again.
  function onBack() {
    let n = i - 1;
    if (n >= 0 && STEPS[n].modal && !demoOpen() && !openDemo()) {
      while (n >= 0 && STEPS[n].modal) n--;
    }
    go(Math.max(0, n));
  }

  // NEXT off the first card opens the strike dialog itself, on a live air
  // defense site — the strike it was recommending anyway. It used to watch the
  // map instead and advance when the player clicked a target, with NEXT as the
  // escape hatch; one button doing the whole walkthrough is less to explain, and
  // a card that advances on its own while you are reading it reads as a misfire.
  // Since the board is sealed this is also the only way in: the map is not
  // clickable while the walkthrough is running.
  function onNext() {
    const st = STEPS[i];
    if (st && st.opens) openDemo();
    go(i + 1);
  }

  // The demonstration dialog, and the walkthrough owns it either way — it
  // presses ABORT (or STAND THE ROOM DOWN) on the way out, which spends nothing.
  // Reports whether there is one on screen to point at, which is what BACK
  // reads, and it asks the DOM rather than trusting `open()` to have worked: the
  // brief declines to open on a night with nothing to sign, and the watchdog
  // has to hear about that as "no dialog" and walk the cards past it.
  function openDemo() {
    if (demoOpen()) { ownsModal = true; return true; }
    if (!demo.open()) return false;
    ownsModal = true;
    return demoOpen();
  }

  // The estimate box does not exist until a package is chosen, and the player
  // cannot choose one — the board is sealed. So the walkthrough chooses, and the
  // card that talks about reading the odds has the odds behind it rather than an
  // empty footer and a sentence describing a screen the player has not seen.
  // `choose` in openStrikeModal is UI state to the last line: selection classes,
  // the estimate, the AUTHORIZE gate. Nothing here reaches `G`.
  function pickDemoPackage() {
    const est = $('strike-estimate');
    if (!est || !est.classList.contains('hidden')) return;
    const row = document.querySelector('#strike-modal .pkg-option');
    if (row) row.click();
  }

  // ANYTHING THE PLOT WILL NOT DRAW IS NOT SOMETHING TO OPEN A DIALOG ON. This
  // filtered on status alone, which was right while everything on the list was
  // on the board and wrong from the moment anything was not: a held aimpoint, an
  // unfound covert site and an unlocated launcher group are all absent by design,
  // and Game.plotted is the one place that knows it. The air defense branch never
  // hit the problem — no SAM site is covert, dispersed or held — but the fallback
  // behind it did, and it is exactly the branch that fires late in a war with the
  // whole belt down, which is when a player is most likely to reopen the room.
  //
  // Two things went wrong through it, and neither is the walkthrough's to fix
  // downstream. openStrikeModal prints the name and the description BEFORE it
  // asks barred(), so an unfound covert site was named on screen — the one thing
  // the middle tier exists to withhold, and the reason syncCovert draws a box
  // with no id and no click handler. And barred() had no clause for `held` at
  // all, because nothing could reach one: the walkthrough was the only path in
  // the game that could hand openStrikeModal an aimpoint CENTCOM had not
  // released, and it opened live and orderable.
  function demoTarget() {
    if (typeof TARGETS === 'undefined') return null;
    const live = TARGETS.filter(t => t.status !== 'destroyed' && Game.plotted(t));
    return live.find(t => t.type === 'airdefense') || live[0] || null;
  }

  const resolve = (st) => (typeof st.sel === 'function' ? st.sel() : document.querySelector(st.sel));
  const words = (v) => (typeof v === 'function' ? v() : v);

  // Moving a subtree drops focus to the body, and the card is routinely holding
  // it — NEXT is focused the moment the walkthrough starts. Hand it back.
  function reparent(host) {
    if (root.parentNode === host) return;
    const keep = root.contains(document.activeElement) ? document.activeElement : null;
    host.appendChild(root);
    if (keep) keep.focus();
  }

  // ---- geometry ----
  // Re-run every frame rather than measured once per step. A sidebar section
  // animates open on grid-template-rows, the scroll pane moves under it, and the
  // window can be rotated mid-card; a rAF loop answers all three for the cost of
  // a couple of getBoundingClientRect calls, and it is the same loop the
  // watchdog and the gate ride on. It does not run in a hidden tab, which is
  // fine — there is nothing to keep in sync in a tab nobody is looking at.
  const PAD = 6, GAP = 12, EDGE = 8;

  // What the player can actually SEE of an element, which is not its rect. An
  // expanded sidebar section is routinely 700px of content hanging out of a
  // 200px scroll pane, and getBoundingClientRect happily reports all of it — so
  // the ring drawn off it enclosed the END TURN button and the session row, none
  // of which is in the panel it claimed to be pointing at. Intersect with every
  // ancestor that clips, then with the window.
  function visibleBox(el) {
    let box = el.getBoundingClientRect();
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const ov = getComputedStyle(p).overflow;
      if (ov === 'visible') continue;
      const c = p.getBoundingClientRect();
      box = {
        top: Math.max(box.top, c.top), left: Math.max(box.left, c.left),
        bottom: Math.min(box.bottom, c.bottom), right: Math.min(box.right, c.right),
      };
    }
    return box;
  }

  const pinPanel = (el) => {
    const scroll = $('sidebar-scroll');
    if (!scroll || !scroll.contains(el)) return;
    scroll.scrollTop += el.getBoundingClientRect().top - scroll.getBoundingClientRect().top;
  };

  function place(el) {
    const r = visibleBox(el);
    if (r.bottom <= r.top || r.right <= r.left) return;
    const vw = window.innerWidth, vh = window.innerHeight;
    const top = Math.max(0, r.top - PAD), left = Math.max(0, r.left - PAD);
    const bottom = Math.min(vh, r.bottom + PAD), right = Math.min(vw, r.right + PAD);
    ring.style.top = top + 'px';
    ring.style.left = left + 'px';
    ring.style.width = Math.max(0, right - left) + 'px';
    ring.style.height = Math.max(0, bottom - top) + 'px';

    // THE RING TRACKS; THE CARD SETTLES AND THEN HOLDS STILL. Both used to be
    // rewritten every frame, which is right for the outline — it has to stay on
    // the thing it is outlining — and wrong for the card, because the thing it
    // is outlining changes size under the player. Picking a package on step two
    // opens the estimate box, the dialog grows, the roomiest side is suddenly a
    // different side, and the card the player is mid-sentence in jumps across
    // the screen and lands on the estimate it just told them to read.
    //
    // So the card follows only while the anchor is genuinely moving, and locks
    // the frame it stops — the same two-equal-frames test openPanel uses to know
    // a section has finished animating open. Not a fixed delay: a delay is a
    // guess that is either too short for a slow panel or long enough to still be
    // live when a quick player clicks something. The count is only a backstop
    // against something that animates forever. A reader is owed a stationary
    // paragraph more than a perfectly-adjacent one.
    if (settle <= 0) return;
    // rounded, or a subpixel jitter somewhere upstream reads as "still moving"
    // forever and the window never closes
    const box = [top, left, bottom, right].map(Math.round).join(',');
    if (box === lastBox) { settle = 0; return; }
    lastBox = box;
    settle--;

    // Put the card wherever there is the most room. Below is the habit, but on a
    // landscape phone the map panel is the whole window and nothing is below
    // anything, so fall back to the roomiest side and clamp into the window.
    const cw = card.offsetWidth, ch = card.offsetHeight;
    const space = { below: vh - bottom, above: top, right: vw - right, left: left };
    let side = 'below';
    if (space.below < ch + GAP) {
      side = Object.keys(space).sort((a, b) => space[b] - space[a])[0];
    }
    let ct, cl;
    if (side === 'below') { ct = bottom + GAP; cl = r.left; }
    else if (side === 'above') { ct = top - GAP - ch; cl = r.left; }
    else if (side === 'right') { cl = right + GAP; ct = r.top; }
    else { cl = left - GAP - cw; ct = r.top; }
    card.style.left = Math.max(EDGE, Math.min(cl, vw - cw - EDGE)) + 'px';
    card.style.top = Math.max(EDGE, Math.min(ct, vh - ch - EDGE)) + 'px';
  }

  function frame() {
    if (i < 0) return;
    const st = STEPS[i];
    // the player closed the dialog out from under a step that lives inside it —
    // Escape, ABORT, or authorising the strike for real. All three are fine.
    if (st.modal && !demoOpen()) { ownsModal = false; return go(afterModal()); }
    // A player who clicks a target on the first card rather than pressing NEXT
    // gets the real dialog up over the map. The card stays anchored to the map —
    // that is still what this step is about — but it has to ride inside the
    // dialog to stay in ui.js's focus trap, or its own NEXT is on screen and
    // unreachable from the keyboard.
    if (st.opens) reparent(demoOpen() ? $(demo.id) : document.body);
    const el = resolve(st);
    if (!el) return go(i + 1);
    if (pin > 0) { pin--; pinPanel(el); }
    place(el);
    raf = requestAnimationFrame(frame);
  }

  const afterModal = () => {
    let n = i;
    while (n < STEPS.length && STEPS[n].modal) n++;
    return n;
  };

  function go(n) {
    cancelAnimationFrame(raf); raf = 0;
    if (n < 0) n = 0;
    if (n >= STEPS.length) return endTour();
    i = n;
    const st = STEPS[i];
    if (!st.modal && ownsModal && demoOpen()) { demo.close(); ownsModal = false; }
    if (st.pick && demoOpen()) pickDemoPackage();
    // Five cards point at the same shell, so the shell has to be wearing the
    // right room before anything is measured. UI.briefGoto renders a room
    // whether or not it has a live decision in it, which is the case that
    // matters here: the walkthrough is routinely taken on a night the president
    // has already spent a slot, and a card teaching the collection deck must not
    // fall through to whichever room the chain would have resumed on.
    if (st.stage && demoOpen()) UI.briefGoto(st.stage);
    // openPanel's own `reveal` is deliberately not used. It brings a section's
    // leading 140px in from below, which is right for a panel that opened
    // because the war made it relevant and wrong here: the walkthrough is about
    // to draw a box round the whole section, and a box whose top edge is off the
    // pane points at nothing. Pin the head to the top of the scroller instead,
    // for as long as the section is still animating open — half a second, after
    // which the player's own scrolling is left alone.
    if (st.panel) { UI.openPanel(st.panel); pin = 30; } else { pin = 0; }
    settle = 40; lastBox = '';

    // The card rides inside the dialog it is talking about. ui.js traps Tab
    // within the top .overlay, so a card left on the body would be visible and
    // unreachable from the keyboard for these two steps; parented to the overlay
    // its buttons join the trap for free. It is a plain div either way — never
    // an .overlay with a .modal in it — so it never enters the dialog stack.
    reparent(st.modal || (st.opens && demoOpen()) ? $(demo.id) : document.body);

    // The seal is announced rather than left to be discovered. A player who
    // presses something on the panel the card is pointing at and gets no
    // response has learned that the game is broken, which is the opposite of
    // what the card was teaching; three words on a line that was already there
    // costs nothing and answers it before it is asked.
    $('tour-count').textContent = `STEP ${i + 1} OF ${STEPS.length} · DEMONSTRATION ONLY`;
    $('tour-title').textContent = words(st.title);
    $('tour-text').textContent = words(st.text);
    $('tour-back').disabled = i === 0;
    $('tour-next').textContent = st.next || 'NEXT';
    raf = requestAnimationFrame(frame);

    // The card is the only live thing on screen, so focus belongs on it —
    // claimed, not seized. A frame late because ui.js hands focus to the strike
    // dialog's own ✕ on the microtask after it opens, and claiming it
    // synchronously here would just lose that race. Left alone when the player
    // is already standing somewhere on the card, or BACK would drop them on
    // NEXT every time they pressed it.
    requestAnimationFrame(() => {
      if (i < 0 || card.contains(document.activeElement)) return;
      $('tour-next').focus();
    });
  }

  function start() {
    if (i >= 0) return;
    // Never over a resolving turn or an open set piece. The HOW TO PLAY button
    // already guards the primer this way; the walkthrough reaches for the same
    // board — it opens panels, opens the strike modal and moves the map — so it
    // has to answer to the same lock rather than relying on the primer being the
    // only door into it.
    if (Game.busy && Game.busy()) return;
    if (!root) build();

    // WHICH ROOM THIS IS, decided once per run rather than per card. The knob is
    // `freeTargeting` — the same one the primer's first card reads — because it
    // is the difference the walkthrough is a walkthrough OF: a level that opens
    // strike dialogs off the map has a strike dialog to demonstrate and a level
    // that does not, does not.
    //
    // The panel filter behind it is the belt to that braces. `railPanels` is a
    // whitelist and panels get added to this game, so a step naming a section
    // this level does not have is a bug waiting on the next feature rather than
    // a bug in the two lists as written. UI.openPanel already refuses a
    // `mode-off` panel; dropping the card is the other half — a refusal leaves
    // the ring drawn round a collapsed box with a card beside it explaining a
    // drawer that is not on screen.
    const d = Game.difficulty();
    demo = d.freeTargeting ? DEMOS.strike : DEMOS.brief;
    const rail = d.railPanels;
    STEPS = (d.freeTargeting ? MAP_STEPS : STAFF_STEPS)
      .filter((st) => !st.panel || !rail || rail.includes(st.panel));

    hadOpen = [...document.querySelectorAll('#sidebar-scroll .panel[data-panel]')]
      .filter(p => !p.classList.contains('collapsed')).map(p => p.dataset.panel);
    ownsModal = false;
    root.classList.remove('hidden');
    document.addEventListener('keydown', keyHandler, true);
    // A rotate or a resize is the one thing that genuinely invalidates a settled
    // card: the side it chose may no longer exist. Reopen the window rather than
    // repositioning here, so it still lands after the layout has finished moving.
    window.addEventListener('resize', resizeHandler);
    go(0);   // which claims focus for the card, a frame from now
  }

  // Escape ends the walkthrough, but only when it is the walkthrough's to end.
  // Two steps run inside the real strike dialog, which has its own Escape in
  // ui.js; one key doing two things at once is how a player ends up unable to
  // tell which. So defer while any dialog is open — the dialog closing is what
  // the watchdog reads as "move on", so the second press lands here anyway.
  //
  // CAPTURE PHASE, and that is the whole of why this works. Both handlers sit on
  // document, ui.js's registered first at boot, so in the bubble phase it closes
  // the dialog before this one gets a look — and this one then sees no dialog
  // open and ends the walkthrough off the same keystroke. Capture asks the
  // question before anybody has changed the answer.
  resizeHandler = () => { settle = 40; lastBox = ''; };

  keyHandler = (e) => {
    if (i < 0) return;

    // TAB IS THE OTHER WAY INTO THE ROOM, and a pointer seal without a keyboard
    // seal leaves the identical bug standing for anyone who plays with one:
    // three tabs off the card reaches the diplomatic shelf the card is pointing
    // at, and Enter spends the turn's action. ui.js's trap does not cover it —
    // that one only runs while a dialog is open, and eight of the ten cards do
    // not have one — and on the steps that do it would fight this one, since
    // it traps to the whole overlay and the dialog's own AUTHORIZE STRIKE is in
    // there. Capture and stop, so exactly one trap answers any keystroke.
    if (e.key === 'Tab') {
      const f = [...card.querySelectorAll('button:not([disabled])')];
      if (!f.length) return;
      e.preventDefault(); e.stopPropagation();
      const at = f.indexOf(document.activeElement);
      // from anywhere else on the page, Tab lands on NEXT: it is the way through
      f[at < 0 ? Math.max(0, f.indexOf($('tour-next')))
              : (at + (e.shiftKey ? -1 : 1) + f.length) % f.length].focus();
      return;
    }

    if (e.key !== 'Escape' || anyModalOpen()) return;
    e.preventDefault();
    endTour();
  };

  // One teardown, called from the END WALKTHROUGH button, from Escape, and from
  // running off the end of the list. Three exit paths where two forget to put
  // something back is the usual way a walkthrough leaves a mess behind it.
  function endTour() {
    if (i < 0) return;
    cancelAnimationFrame(raf); raf = 0;
    i = -1;
    if (ownsModal && demoOpen()) demo.close();
    ownsModal = false;
    document.removeEventListener('keydown', keyHandler, true);
    window.removeEventListener('resize', resizeHandler);
    root.classList.add('hidden');
    document.body.appendChild(root);
    // the sidebar back the way the player had it: the walkthrough opened four
    // sections they did not ask for, and every turn otherwise starts from a shut
    // sidebar (see closeAllPanels)
    UI.closeAllPanels();
    for (const key of hadOpen) UI.openPanel(key);
    const btn = $('btn-primer');
    if (btn && btn.offsetParent !== null) btn.focus();
  }

  return { start, end: endTour, running: () => i >= 0 };
})();
