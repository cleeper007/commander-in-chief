# Tier 1 balance work — handoff

Three changes that together fix "the war is over by turn 8 of 30." Items 1 and 2
are **done and verified**; item 3 is specced below and not started.

**Do them in order and playtest between each.** They interact hard: item 1 alone
lengthens the war, item 2 alone slows it, item 3 alone makes it harsher. All
three at once will overshoot and you will have no idea which knob did it.

**Item 3 is therefore the one to hold.** Items 1 and 2 have both landed and the
war has not been played end-to-end by a human since. Approval is still a
one-way ratchet and should still be fixed, but find out what the campaign feels
like at three-to-six packages a night first.

---

## Background — the diagnosis

An outside review played ~70 turns with a bot whose entire strategy was "sort
surviving targets, fly the highest-expected-damage package at each, up to 8 per
night." It won decisively on Hard by turn 8/30 with 27 dead and 1 aircraft lost,
at 100% approval. Whole subsystems never fired: `csar.js` (627 lines,
`downedCrews` 0 every run), the specops raid, TEL hunting (`telsKilled: 0`),
Israel, and the entire negotiation path.

**The thesis: the design is right, the currency is free.** Every interesting
tradeoff in this game is priced in packages — grind a missile base down over four
nights vs. kill it in one (`disperseFrom`), chase TELs vs. hit fixed targets, buy
air superiority vs. fly raw on Hard. All of them are real, well-modeled
decisions. All of them are free, because a package costs nothing: `G.tankers` was
deliberately defanged in v1.19, `G.strikesThisTurn` was never read, and
`lossRisk` went to literal zero after ~8 packages.

Fix the price of a package and most of the problem list prices itself.

---

## Item 1 — air defense reconstitutes + aircrew attrition floor ✅ DONE

Shipped in v1.27, save `VERSION` 13. See `AD_RECONSTITUTION` (`js/data.js`),
`repairCeiling` + the reconstitution branch in `repairTargets` (`js/game.js`),
`attrition` in `AIR_ASSETS`, and the three-branch loss-risk line in
`showEstimate` (`js/ui.js`).

### The root cause it fixed

`airSuperiority()` has always carried this comment:

> *"Nothing about this is a one-way ratchet. Air defense sites repair overnight
> like everything else... the night you look away is the night the plan gets
> smaller."*

**The code did not do this.** `repairTargets` skipped `t.hp <= 0` and
`TARGET_REPAIR`'s header said "Zero is permanent." A player never leaves a SAM
site at 20% — they take it to 0. Three targets, permanently dead, after which
`airDefenseWeight()` is 0 forever, `lossRisk = prof.loss × ad` is 0 forever, and
the campaign is a checklist. The intent was already written down; only the
implementation leaked.

### What it does now

- A SAM site at zero, unvisited for `quiet: 3` nights, returns at `rate: 7`/night
  out of the national reserve, then repairs normally.
- `repairCeiling()` caps any `airdefense` target with `killedOnce` at
  `cap: 60` **permanently** — against ordinary overnight repair as well as the
  return itself. Killing a battery is permanent *degradation*, not permanent
  *removal*. Without this the reserve arrives at 7% and walks straight back to
  100 at 12/night, and SEAD buys nothing that lasts.
- Targets carry `lastStruck` (set beside `G.struckThisTurn.push`) and
  `killedOnce`. Both persist in the per-target save blob; both are cleared in
  `newWar` — `TARGETS` is a module constant that outlives a campaign.
- Re-killing a reconstituted battery pays **+1 approval, not +3**, and does not
  increment `stats.destroyed`. Without that guard, reconstitution is an approval
  farm at +3 every four nights forever.
- `attrition` in `AIR_ASSETS` is added **outside** the air-defense multiplier in
  `computeStrike`, so suppressing the belt does not buy it back: F-35 0.4%,
  fighter 1.3%, heavy 1.0%, stealth 0.2%, cruise 0. Roughly one airframe every
  twelve nights of fighter packages. This is what makes `csar.js` reachable.

### Verified

Reconstitution curve over 13 turns, killed site vs. merely-damaged site:

```
killed  (killedOnce): 0  0  0  0  7 19 31 43 55 60 60 60 60   ← capped, permanent
damaged (never dead): 40 52 64 76 88 100 …                    ← unchanged
```

Also confirmed: the `AIR DEFENSES RETURN` event renders in the summary-first
report shape; save → reload → CONTINUE round-trips `lastStruck`/`killedOnce`;
re-kill pays +1 and leaves `stats.destroyed` alone; all three loss-risk branches
render with the belt at zero; no console errors over ~30 simulated turns.

### Known cosmetic wrinkle (left alone deliberately)

On a re-kill the report digest says "1 target destroyed" while the campaign
scoreboard shows 0. Different scopes — tonight one target *was* destroyed —
so this is arguably correct. Revisit only if it reads wrong in play.

---

## Item 2 — price packages, do not cap them ✅ DONE

Shipped in v1.28, save `VERSION` 14. See `ATO` (`js/data.js`), `planSize` /
`atoSlots` / `atoOver` / `atoWall` (`js/game.js`), the `surge`/`surgeLoss` terms
in `computeStrike`, fatigue accrual in `executeStrike`, decay and the writing of
tomorrow's order in `nextTurn`, and the late-frag line in `showEstimate`
(`js/ui.js`). Built to the spec below with three changes, all of which came out
of playtesting rather than the design:

**The plan is a document, not a running total.** The spec computes `atoSlots()`
live off `G.fatigue`. That is subtly wrong and it showed up immediately: the
fourth package accrues debt, the debt shrinks the plan the fourth package is
being measured against, so the fifth is three past a plan of two instead of two
past a plan of three. The surge accelerates mid-night, the wall arrives four
packages early, and the modal quotes a multiplier that is stale by the time the
player authorizes the next package. The order is now written once at the turn
boundary into `G.atoPlan` and does not move until tomorrow. Both `atoPlan` and
`fatigue` are in `FIELDS`.

**Fatigue decay is unconditional.** The spec pays the debt down only on a night
that stayed inside the plan — "surging again pays nothing back, which is the
whole point of a debt." It produced a trap. A wing at maximum debt has a plan of
one (the `max(1, …)` floor in `planSize`), flying two is one package over, and
one package over paid back nothing — so a single greedy night pinned the
campaign at one package a night for the remaining twenty-nine turns. A bot doing
nothing but "fly the best package available" hit that on turn one and never
recovered. Nothing on screen distinguishes flying one from flying two on a plan
of one, and an unstated rule should not decide a campaign in its first hour.
Each late frag now costs exactly one package-night of future tempo.

**The boat is not on the tasking order.** `atoOver` returns 0 for `pkg.sub`, and
`barred` skips the wall on any target holding a submarine option. Consistent with
how the shot is already treated everywhere else — no theater magazine, no fuel,
not logged for `adapt` — and her torpedo room is its own hard limit.

### Verified

Surge curve on a plan of 3, and the wall:

```
package     1    2    3     4     5     6     7     8
over        0    0    0     1     2     3     4     —
effects    69   69   69    60    51    42    28   REFUSED
loss ×    1.0  1.0  1.0  1.55  2.10  2.65  3.20
```

Recovery after a full seven-package opening night, standing down after:

```
turn        1    2    3    4    5    6
fatigue     4    3    2    1    0    0
plan        3    1    1    2    3    4   ← the turn-3 and turn-5 flow waves land
```

Also confirmed: save → reload → CONTINUE round-trips `fatigue`/`atoPlan`; a v13
blob leaves CONTINUE disabled; the panel row, the shut-panel badge, the modal
banner and the map tooltip all agree on the same three states (inside the plan /
plan spent / order closed); no console errors over 30 simulated turns.

### One thing found and NOT fixed

`G.forceFlow.landed` stays `[]` for a whole campaign under sustained striking,
even with `G.basing` open — so the theater buildup never arrives. **Reproduces
identically on `bf55cf4`, before any of this work.** Pre-existing, out of scope,
and now slightly worse in consequence: `ATO.perFlow` means a dead force flow
also pins the tasking order at 3 forever. Worth a look in `forceFlowTick`.

### The original spec follows

### Do NOT just add a hard cap

The obvious fix is "cap packages at 3–4 per turn; `G.strikesThisTurn` is already
saved, it's a one-line read." **Resist this.** It recreates precisely the failure
the v1.19 tanker rescale note in `js/data.js` diagnoses and fixes:

> *"two deep packages a night, every night, for thirty turns, and the answer to
> every question was 'wait for the tanker wing.' The war it produced was the same
> war every time."*

A flat package cap is the fuel brake wearing a different hat. The surge has to
remain available or the war is on rails again; it just has to **cost**.

### The ATO model

A night's flying is planned ~36 hours out. Packages inside the plan get full
mission planning, a full intel cycle, rested crews, tankers where promised.
Anything past it is a late frag: it flies, because the President said so, and it
flies worse — and the bill comes due on tomorrow's plan.

```js
// js/data.js
const ATO = {
  base: 3,             // packages planned at D-day
  perFlow: 0.5,        // each landed force-flow wave buys half a planned package
  ceiling: 4,          // absolute wall ABOVE the plan — past this nothing flies
  surgeEffects: 0.09,  // success penalty per package past the plan
  surgeLoss: 0.55,     // added loss multiplier per package past the plan
  fatiguePerSurge: 1,  // crew-rest debt incurred
  fatigueDecay: 1,     // paid down per turn of not surging
  maxFatigue: 4,
};
```

```js
// js/game.js
function atoSlots() {
  const flown = G.forceFlow.landed.length;   // see forceFlowTick
  return Math.max(1, Math.floor(ATO.base + flown * ATO.perFlow - (G.fatigue || 0)));
}

// in computeStrike(), alongside adPenalty / lossRisk:
const over = Math.max(0, G.strikesThisTurn - atoSlots() + 1);
const surge = over * ATO.surgeEffects;          // fold into adPenalty
const surgeLoss = 1 + over * ATO.surgeLoss;     // multiply lossRisk
```

- Block in `executeStrike` at `G.strikesThisTurn >= atoSlots() + ATO.ceiling`.
  Route it through `pkgBlock` so it reads as a refusal with a reason, not a dead
  button.
- Accrue `G.fatigue` on each package past the plan; decay it in `nextTurn`
  (beside `G.addressCooldown--`). **Add `fatigue` to `FIELDS`** or it silently
  resets on reload — the single easiest thing to break in this codebase.
- Surface it in `showEstimate` (`js/ui.js`), which is the best screen in the game
  and has room for one more line:

  > **FOURTH PACKAGE TONIGHT — LATE FRAG.** Outside the tasking order.
  > −9% effects, aircrew risk ×1.55, and tomorrow's plan is one package shorter.

This is finally a read of `G.strikesThisTurn`, which is incremented, persisted in
`FIELDS`, reset in `nextTurn` — and never read anywhere.

### Why it matters beyond tempo

It makes the grind-vs-kill tradeoff in `disperseFrom` cost something. That model
is already correct and even has prose for both outcomes
(`BRIGADE DESTROYED IN PLACE` vs `BRIGADE SURVIVORS DISPERSE`) — it just has no
teeth while grinding is free. Same for TEL hunting and the intel slot.

---

## Item 3 — approval is a level, not a balance ⬜ NOT STARTED

`+3` per destroyed target across a 43-target board is **+129 of approval
available from simply doing the job**, against a ceiling of 100, with no decay.
Add `address` (+6 on a 2-turn cooldown), milestone bumps (+4/+7/+8), SPR (+2),
raid (+8), CSAR (+8) and a president 8 days into a shooting war sits at 100%.

### Mean-revert it

```js
// js/game.js — replace the flat `if (G.turn > WEARINESS_TURN) approval -= 0.5`
// tick in resolveTurn (search: "domestic drift").
function approvalBaseline() {
  const lim = casualtyLimit();
  return clamp(62
    - 26 * (G.casualties.us / lim)
    - 0.9 * Math.max(0, G.turn - WEARINESS_TURN)   // WEARINESS_TURN = 14 in game.js
    - (G.oil >= 140 ? 8 : G.oil >= 110 ? 4 : 0)
    + (G.nukeDegraded() >= 100 ? 10 : 0)
    + (G.negotiationsAccepted ? 8 : 0), 15, 88);
}
G.approval += (approvalBaseline() - G.approval) * 0.18;
```

At 100% approval against a baseline of 55 that is ~8/night of gravity. Every
good night becomes a push against it rather than a deposit into it.

### Two supporting changes

- **Make the `address` rally temporary.** Rally-round-the-flag effects decay in
  days. `G.rally = 6`, decaying 2/turn in `nextTurn`, displayed added to
  approval. An address buys a window, not a permanent raise. (`G.rally` → `FIELDS`.)
- **Novelty decay on kills.** Full +3 for the first destruction of a *type*, +1
  after, 0 past the fourth of a type. The public tracks "we hit the nuclear
  site," not aimpoint counts. Note item 1 already added a `firstKill` branch in
  `resolveImpact` — extend that, don't add a second mechanism.

---

## How to verify (this worked well, reuse it)

`.claude/launch.json` already has a `cic` static server. `file://` will **not**
work — the preview pane won't reload it, so you can never reset a war.

```js
// paste in the browser console / javascript_tool after preview_start {name:"cic"}
try { localStorage.clear(); } catch(e) {}
document.getElementById('btn-start').click();
// ...mutate TARGETS / Game.G to set up the scenario...
window.__iv = setInterval(() => {
  // pin the politics so the test can reach the turn you care about
  Game.movePublic(80 - Game.G.approval);
  Game.G.casualties.us = 0; Game.G.oil = 90;
  Game.G.hormuz = 'OPEN'; Game.G.hormuzClosedTurns = 0;
  const rm = document.getElementById('report-modal');
  if (rm && !rm.classList.contains('hidden')) { document.getElementById('btn-report-ok').click(); return; }
  const skip = document.getElementById('btn-skip-turn');
  if (skip && !skip.classList.contains('hidden')) { skip.click(); return; }
  if (Game.G.turn >= 16 || Game.G.over) { clearInterval(window.__iv); return; }
  const end = document.getElementById('btn-end-turn');
  if (end && !end.classList.contains('hidden')) end.click();
}, 250);
```

`Game.G` and `TARGETS` are globals; `Game.computeStrike` / `Game.executeStrike`
are exported. Package rows in the strike modal are `.pkg-option`, not buttons.
Without the approval pin the game ends around turn 4 from doing nothing, which
will cut every test short.

---

## Deferred — Tier 2 and 3 (not in scope here, recorded so they aren't lost)

**Tier 2 — systems that go dead**
- `enrichRate()` reads `natanz.hp` / `fordow.hp` — **ground truth, not
  `estimate()`**. The uncertainty layer's centerpiece is computed from numbers
  the player isn't supposed to have. Route `breakoutEstimate` through assessed
  condition.
- Breakout clock is passive — only the player can move it. Add material transfer
  (Natanz dies → Fordow's 0.6 coefficient rises to ~0.85, making the B-2 the only
  answer) and an Iranian sprint when the regime is losing badly.
- `un` is a free, uncapped, no-cooldown +8 world (`doDiplo`). Require a fresh
  grievance (the event text already says "condemnation of the attack on Al
  Asad"), scale the gain to it, diminish per use, cost 1–2 approval.
- Endgame: make the military win a **precondition** for victory, not a
  substitute. `nukeDegraded() >= 100 && iranBroken()` should collapse Tehran's
  position and open the table, not end the war. Wars end when someone quits.
  This makes ~1,800 lines of negotiation/diplomacy writing load-bearing.
- Magazine glut: gate the last two `FORCE_FLOW` waves on the campaign still being
  contested, and give surplus sorties a non-strike use (standing DCA/SEAD patrol
  that blunts the next salvo, or free `huntTels` rolls).

**Tier 3 — mechanical, independent ✅ ALL SEVEN DONE (v1.29)**

Landed together; none of them touch balance, so they did not need playtesting
between each the way Tier 1 did. What each one turned into:

- **Aegis desync** — `ev.text` is now a function of the event for the three
  builders that quote a casualty figure, `aegisIntercept` appends to
  `ev.appended`, and `evBody` in ui.js is the only reader. Verified over 1,500
  simulated Iranian turns: 886 intercepted events, zero desyncs, against a clean
  reproduction of the old bug first (prose "6 Americans were killed", chip "+4
  US KIA"). A full-fleet intercept can drive the count to zero, so both builders
  grew a no-fatalities branch. Rule written into CLAUDE.md.
- **`plural()`** — moved to a new `js/text.js` (global `Txt`, loaded first) with
  `pluralize`, `were`/`are`, `ordinal` and `signed` alongside it. Sibilants,
  invariants and irregulars are tables; inflection is on the last word so
  "tanker track" and "American life" work unsplit. ai.js now uses it.
- **Stale HUD** — `renderHUD(Game.G)` at the top of `showReport`.
- **Campaign-log dedupe** — `recordTurn` ranks every candidate instead of taking
  the first `find`, skips titles already in `G.timeline`, and appends
  `— SECOND NIGHT` / `— THIRD NIGHT` when there is nothing new to say. Rows
  carry a raw `title` beside the rendered `text` so the ordinal does not defeat
  the next turn's comparison.
- **Modal keyboard/screen-reader** — one stack, one `document.keydown`, one
  trap, `inert` + `aria-hidden` on `#app`, focus restored on close. Driven by a
  MutationObserver on the `hidden` class rather than a refactor of twelve
  open/close sites. Escape is per-dialog: the allied call and the endgame screen
  deliberately ignore it.
- **Touch targets** — `circle.tgt-hit` is now sized in screen pixels and
  re-derived in `applyView`; measured at a constant 44px across from full zoom-out
  to full zoom-in. Overlap resolves by nearest centre, and a genuinely ambiguous
  tap opens a picker sheet (`#target-pick`). Found and fixed a real bug on the
  way: the first version compared a **viewBox**-space pointer against
  **world**-space target coordinates, so every pick was wrong by `view.k`.
- **Leader portrait** — replaced with a secure-voice terminal: crypto header,
  scrolling oscilloscope trace (green and moving only while the line is open),
  the existing vector flag pin, TS//SCI footer. The four portrait colour fields
  are gone from `WORLD_LEADERS`.

**Known gap, deliberately not fixed here.** The strike modal now traps focus, but
its `.pkg-option` rows carry no `tabindex` — so a keyboard player can reach only
✕ and ABORT inside it. The trap is correct; the dialog behind it is not yet
reachable. Same question worth asking of the CSAR and SpecOps modals.

The original list follows.
- **Aegis desync (worst bug, hits on turn 1).** `aegisIntercept` (`js/ai.js`)
  rewrites `ev.casualties` but not `ev.text`, which already baked the
  pre-intercept figure. One event, three different numbers on the first screen a
  new player reads. Fix: `ev.body = (ev) => ...` as a function of the event, never
  a string built beside it; `aegisIntercept` appends to `ev.appended`; `ui.js`
  reads through one helper. ~4 builders to convert. Add the rule to CLAUDE.md.
- `plural()` doesn't handle sibilants → "0 addresss so far" (`ui.js`). And
  `ai.js` doesn't use the helper at all → "1 Americans were killed". Move
  `plural/turns/signed` into a `js/text.js` loaded first — `ai.js`, `csar.js`,
  `specops.js` all write counted prose and none can reach `UI`'s IIFE.
- HUD contradicts the open report (stale bar under a fresh report). One line:
  `renderHUD(G)` at the top of `showReport`.
- `recordTurn`'s notable-picker has no dedupe → the campaign log reads
  `MASS MISSILE BARRAGE` four nights running. Rank candidates, skip titles already
  in `G.timeline`, and append `— FOURTH NIGHT` when everything has been said.
- Touch targets 12–20px against a 44px guideline, and Kharg/Nav Bushehr/Bushehr
  NPP sit within a few pixels. Invisible hit disc sized in *screen* px (radius ÷
  zoom scale, updated in `applyView`), plus nearest-centre resolution and a
  disambiguation sheet for the coastal cluster.
- No Escape key anywhere, no `role="dialog"`, no focus trap. One modal stack, one
  `document.keydown`, `aria-modal` on the four `.modal` divs in `index.html`.
- The cartoon leader portrait (`drawLeader`, `js/ui.js`) is the only screen
  fighting the CENTCOM aesthetic. Replace with a secure-voice terminal card —
  waveform, the existing vector flag pin, transcript in mono.
