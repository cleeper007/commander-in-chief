# ROADMAP — MODE DIFFERENTIATION (pre-publish)

Source: "Roadmap for my game before publishing" (Google Doc, 2026-08).
Goal: easy / normal / hard should feel like three different jobs, not one job
at three prices. Much of the scaffolding already exists — `DIFFICULTY` in
`js/data.js` already carries `coa`, `coaFill`, `freeTargeting`,
`recommend`, `pgm`. The work below is mostly (a) new mode flags, (b) an
easy-mode nightly pop-up sequence, (c) hard-mode manual control.

Order: **EASY first, HARD second, MEDIUM last** (per the doc — medium is tuned
to sit between two finished endpoints).

---

## How to run this token-efficiently

Rules of thumb for each work session:

1. **One task per session.** Each task below names the exact files and the
   symbols to open. Don't re-read the repo.
2. **Navigate by symbol, not remembered line number.** The core files are large
   and move frequently. Use `rg` to locate the named symbol before reading its
   surrounding block. A local symbol index can make this faster, but committed
   documentation must not depend on an ignored helper file or stale offsets.
3. **Behavior goes in `js/data.js` as a flag, not as an `if (difficulty ===
   'easy')` sprinkled through game.js.** Add the knob to the `DIFFICULTY` row,
   read it via the existing `diff()` helper in `js/game.js`. One grep later
   this is still findable.
4. **Reuse the existing modal shell.** `index.html` has a repeating
   `.modal` pattern with `data-close`, and `initModals()` in `js/ui.js` wires
   them. New pop-ups = one more block in that pattern + one render function.
   Do not invent a second modal system.
5. **Reuse the COA engine for every "3 options" ask.** `coaOptions`,
   `coaScore`, `coaTargets`, `coaPackage`, `coaEstimate`, `coaBill` already
   exist in `js/game.js` and already build scored, priced, staffed
   options off `Assess.board()`. Diplomatic and intel option sets should be
   new intent tables in the same shape, not new machinery.
6. **Start each session with a one-line statement of the flag you're adding
   and where it's read.** That's the whole design doc you need.

---

## PHASE 1 — EASY MODE (choose-your-own-adventure)

**Status: 1.0, 1.1, 1.2, 1.6 shipped in v1.87**, plus the recovery pop-up (which
was not in the original plan — it came out of "personnel recovery can be its own
pop up"). 1.5 (scripted night one), 1.3 and 1.4 (the SecDef and NSA dialogs) and
1.7 (the playtest pass) are what is left. DIPLOMATIC ACTIONS and INTELLIGENCE
TASKING deliberately stayed in the sidebar until 1.3/1.4 land — they are the
level's two free action slots, and a slot with no door is a smaller game rather
than a simpler one. Take them off `DIFFICULTY.easy.railPanels` in the same commit
that gives them dialogs.

New `DIFFICULTY.easy` flags to add in one pass (Task 1.0), then consumed one at
a time:

```
staffedDiplo: 3     // SecDef briefs N diplomatic options as a pop-up
staffedIntel: true  // NSA briefs intel options as a pop-up
staffedStrike: 3    // Generals brief N strike options each night
scriptedOpen: true  // night one is locked to the SAM belt
autoTheater: true   // theater forces flow in without player orders
railPanels: ['advisors','resources','specops']  // everything else hidden
```

### 1.0 — Add the flags (30 min, tiny)
- Find `DIFFICULTY` in `js/data.js` — add the six keys to `easy`, explicit `false`/`0`/`null`
  on `normal` and `hard` so nothing reads `undefined`.
- Extend the comment block above `DIFFICULTY` in `js/data.js` with the new
  knobs — that block is the file's contract.
- Nothing consumes them yet. Ship it as its own commit.

### 1.1 — Sidebar trim: three panels only
Doc: *"Advisor tab, strike assets, spec ops are the only three needed."*
- `index.html` — the eleven `data-panel="…"` blocks.
- `js/ui.js` — `initRail()` / `RAIL_GROUPS` / `syncRail` / `defaultRail`.
- Implement as a filter, not deletion: on kickoff, if `diff().railPanels`,
  add `hidden` to every `.panel[data-panel]` not in the list and filter
  `RAIL_GROUPS` the same way. Mobile rail and desktop accordion both read the
  same panel set, so one filter covers both.
- Watch: `csar-panel` and `coa-panel` open themselves programmatically
  (see the comment beside that behavior in `js/ui.js`). Decide whether CSAR is allowed to break the trim
  on easy — recommend yes, aircrew down is the one interruption worth it.

### 1.2 — Nightly strike brief: Generals, 3 options, as a pop-up
Doc: *"Generals to prepare 3 strike options each night."*
- This is `coa: 3` already working — the change is **presentation**: move it
  from the `coa-panel` sidebar accordion into a modal that opens at the top of
  the turn.
- `coaOptions` in `js/game.js` produces the data; find the COA panel renderer
  in `js/ui.js` (grep `coa-panel`, `coa-status`) and give it a modal host.
- New modal block in `index.html` next to `strike-modal`; render the same
  option cards into it; dismiss on pick.
- Sequence it: this pop-up fires **after** diplomacy/intel (1.3, 1.4) so the
  night reads brief → decide → execute.

### 1.3 — SecDef: 3 diplomatic actions, as a pop-up
Doc: *"secretary of defense to prepare 3 different diplomatic actions."*
- Existing surface: `diplo-panel` in `index.html`, plus `DIPLO_GROUPS` and the
  diplomacy section in `js/ui.js`.
- Add a `DIPLO_COA` intent table in `js/data.js` beside `COA` (same shape:
  `id/name/line/why` + a scoring hook off `Assess.board()`), and a
  `diploOptions()` in `js/game.js` modeled on `coaOptions`.
- `recommend: true` already exists — mark the staff's pick in the pop-up.
- On easy the `diplo-panel` stays hidden (1.1); the pop-up is the only door.

### 1.4 — NSA: intelligence options, as a pop-up
Doc: *"NSA to have intelligence options."*
- Existing surface: `intel-panel` in `index.html`, plus the ISR slot CSAR
  already spends (`doIsr` in `js/csar.js` — "spends the turn's intelligence
  slot"). That slot is the budget; the pop-up spends it.
- Same pattern as 1.3: option table in data.js, builder in game.js, modal in
  ui.js. Smallest of the three — 2-3 options is enough.
- Keep the `NSA` advisor voice lines in `js/ai.js` as the source of the
  framing text so the pop-up sounds like the existing advisor.

### 1.5 — Night one locked to the SAM belt
Doc: *"The first night should be pretty much locked in at sam sights."*
- Cheapest correct version: on turn 1 with `scriptedOpen`, `coaOptions`
  returns a single forced ROLLBACK option (`COA.intents[0]` in `js/data.js`)
  and the pop-up presents it as an order to acknowledge, not a choice.
- `coaOptions` in `js/game.js` — early return when
  `G.turn === 1 && diff().scriptedOpen`.
- Write the acknowledgment copy in the CJCS voice in `js/ai.js`.

### 1.6 — Theater forces auto-flow
Doc: *"Theater forces should be automatically pulled in."*
- `FORCE_FLOW` in `js/data.js` already lands waves on a turn schedule with
  a `needs:` gate (`nato` / `gulf` — diplomatic prerequisites).
- On easy with `autoTheater`, treat `needs` as satisfied and land each wave as
  a pop-up/ticker notification rather than something to unlock.
- The `fleet-panel` (THEATER FORCES in `index.html`) is hidden by 1.1, so
  the arrival notice is the only feedback — make it good.

### 1.7 — Easy-mode playtest pass
- Run a full 30-turn campaign. Check: does the night have a rhythm
  (intel → diplomacy → strike → resolve), and is the sidebar quiet?
- The local beta harness includes campaign, COA, brief, DOM, and grading probes.
  Extend rather than hand-play where possible, and move regression coverage
  into `tests/` when it protects public repository behavior so CI can run it.
- Update `DIFFICULTY.easy.desc` to describe what easy actually is now.

---

## PHASE 2 — HARD MODE (you do everything yourself)

Hard already has `coa: 0`, `freeTargeting: true`, `softGate: true`,
`pgm: 440`. The gaps are theater movement, munitions management, and
diplomacy depth.

### 2.1 — Manual theater force movement
Doc: *"Move in theater forces manually."*
- Inverse of 1.6. `FORCE_FLOW` waves arrive at a staging point; the player
  assigns them to bases from the `fleet-panel`.
- Biggest new-mechanic task in the roadmap — basing has to matter (range,
  ramp space, or exposure to the missile force) or it's busywork. Decide the
  cost model **before** writing UI. Recommend: ramp capacity per base plus
  exposure, so dispersal trades sortie rate against losses on the ground.
- Touches `js/data.js` (base capacity), `js/game.js` (assignment state on `G`
  and save/load), `js/ui.js` (fleet panel), `js/map.js`
  (basing readout).

### 2.2 — Interceptor / strike-missile management
Doc: *"Manage interceptor, strike missiles, etc."*
- Today: `NAVAL_BMD` magazine is scaled by `DIFFICULTY.bmd` and spent
  automatically by `aegisIntercept` in `js/ai.js`; `pgm` is a passive
  ledger.
- Hard should make allocation a decision: how much of the magazine the screen
  is authorized to spend per night, and PGM apportionment across packages.
- Smallest version that's a real decision: a per-turn engagement policy
  (hold / normal / weapons free) on the Aegis screen, plus a visible PGM
  ledger with a spend forecast on the strike modal. Do that before building
  per-missile assignment.

### 2.3 — Diplomacy in depth, fully player-run
Doc: *"Democracy needs to be more in depth and fully controlled"* (read:
diplomacy).
- `recommend: false` on hard already removes the marked pick. What's missing
  is depth: today diplomacy is a short action list.
- Add state to the tracks that already exist (`ISRAEL` `js/data.js`, `GULF`,
  NATO/`needs` gates in `FORCE_FLOW`) — each ally as a standing relationship
  with its own pressure clock the player works, rather than a one-shot action.
- Explicitly reuses Phase 1.3's `DIPLO_COA` table: easy picks from it,
  hard composes from it.

### 2.4 — Advisors advise only
Doc: *"advisors really only being advisors."*
- Audit `advise()` in `js/ai.js` and the four advisor tables for anywhere
  a recommendation is also an action shortcut; on hard, strip the button and
  leave the words.
- Small, do it last in the phase — it's a cleanup pass over 2.1–2.3.

---

## PHASE 3 — MEDIUM (last)

Do nothing here until 1 and 2 are done and played. Then:
- Sit the flags between the endpoints: `coa: 2`, `coaFill: 'half'` (current
  behavior) plus partial versions of the new knobs — staffed diplomacy but
  manual intel, auto theater arrival but manual basing, etc.
- Pick by playing, not by reasoning. Medium is a tuning task, and it's a
  one-session job once the ends exist.

---

## Cross-cutting, don't forget

- **Save compatibility.** Locate the `Save` IIFE in `js/game.js` and
  `DIFFICULTY_ALIAS` in `js/data.js` by symbol. Any new `G` state from 2.1/2.2
  needs a default for saves written before it existed.
- **Script order.** No build step, no modules — a new `js/*.js` file needs a
  `<script>` tag in the right slot in `index.html` (see CLAUDE.md).
- **Balance branch.** `BALANCE-TIER1.md` / branch `balance/tier1` is in flight;
  land or merge it before Phase 2 touches the same tuning constants.
- **Keep any local symbol index current**, but use symbol names in committed
  documentation so it survives ordinary source movement.
