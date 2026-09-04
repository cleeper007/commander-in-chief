# Architecture and dependency map

Commander in Chief is a dependency-free static browser game. It deliberately
uses classic scripts and IIFEs rather than a framework or ES-module build. The
order of the `<script>` tags in `index.html` is therefore part of the runtime
contract.

This document is the authority for state ownership. `Game.G` is publicly
readable for rendering and assessment, but that does not grant write access.
When adding a field, place it in exactly one row below and use that row's write
boundary.

## State ownership and write paths

### Stored `G` fields

Every stored field is listed here. The Save allowlist in `game.js` must contain
the same fields; a field intentionally local to an in-progress resolution must
not be placed on `G` or in a save.

| Domain and owner | `G` fields | Modules that may mutate | Supported write path | Principal consumers |
|---|---|---|---|---|
| Campaign lifecycle and diagnostics (`Game`) | `campaignSeed`, `lastResolutionStage`, `lastReportId`, `turn`, `softCap`, `over`, `difficulty`, `iranPosture`, `postureKnown` | `game.js` | `startCampaign`/`newWar`, restore, `nextTurn`, `finish`, `markResolutionStage`, `noteReport`; Iran posture knowledge is set by `Game.doDiplo` | `UI`, `Assess`, `IranAI`, `SpecOps`, `CSAR`, `Replay`, fault reports |
| Domestic politics (`Game`) | `base`, `opposed`, `middleWith`, `rally`, `habit`, `lastPoll`, `addresses`, `addressCooldown` | `game.js` only | `Game.movePublic`, `Game.erodeBase`; private rally/reversion/poll functions | `UI`, `Assess`, `IranAI`, result grading |
| World/economy/casualties (`Game`) | `world`, `oil`, `hormuz`, `hormuzClosedTurns`, `mandab`, `mandabClosedTurns`, `casualties` | `game.js` only for shared values | `Game.moveWorld`, `Game.moveOil`, `Game.addCasualties`; turn events enter through private `applyEvent` | `UI`, `Assess`, `IranAI`, `CSAR`, `SpecOps`, endings |
| Ready forces and magazines (`Game`) | `res`, `caps`, `tlamPool`, `torpedoes`, `pgm`, `bmdPool`, `bmdRearm`, `nsmPool`, `tankers`, `tankerCap` | `game.js` only | `Game.spendResource`, `Game.refillResource`, `Game.bmdEngage`, `Game.orderRearm`, `Game.executeStrike`, `Game.recallMission`, turn refill | `UI`, `Assess`, `IranAI`, `SpecOps`, `CSAR` |
| Fleet, basing, and force flow (`Game`) | `carriers`, `secondCarrierOrdered`, `secondCarrierEta`, `bombersOrdered`, `bomberEta`, `bombersArrived`, `heaviesOrdered`, `heavyEta`, `heaviesArrived`, `forceFlow`, `alliedFighters`, `deployTurn`, `basing`, `basingDebt` | `game.js` only | `Game.orderCarrier`, `Game.toggleCarrierPosture`, `Game.orderBombers`, `Game.orderHeavies`, `Game.orderRearm`; private transit/basing/flow ticks | `UI`, `MapView`, `Assess`, `IranAI` |
| Mission lifecycle and adaptation (`Game`) | `missions`, `strikesThisTurn`, `struckThisTurn`, `fatigue`, `atoPlan`, `turnStartHp`, `adapt`, `adaptSeen` | `game.js` only | `Game.executeStrike`, `Game.recallMission`, resolution; `IranAI` reports a newly observed counter through `Game.noteAdaptation` | `UI`, `Assess`, `IranAI`, `Aircrew` |
| Statecraft (`Game`) | `sanctions`, `coalition`, `leaderCalls`, `sprReleases`, `negotiationsAccepted`, `negotiationMomentum`, `diploUsed`, `intelUsed` | `game.js`; `specops.js` owns raid-created negotiation momentum; `csar.js` owns recovery ISR use | `Game.doDiplo`; subsystem actions for the two noted fields | `UI`, `Assess`, `IranAI` |
| Israel (`Game`) | `israelPosture`, `israelPressure`, `israelSorties`, `israelHolds`, `israelHold`, `israelJointAvailable` | `game.js` only | private Israel turn plus `Game.doDiplo`; joint availability is booked/refunded by mission lifecycle | `UI`, `Assess`, `IranAI` |
| Gulf coalition (`Game`) | `gulf` (`resolve`, `strain`, `caveats`, `gifts`, `tankers`, `corridor`, `summits`, `patriots`) | `game.js` only | private `gulfTurn` and `Game.doDiplo` Gulf orders | `UI`, `MapView`, `Assess`, `IranAI` |
| Southern front (`Game`) | `houthi` (`active`, `entered`, `enterTurn`, `saudiStruck`, `saudiIn`, `saudiSince`, `saudiSorties`) | `game.js` only | private `houthiTurn` and new-war initialization | `UI`, `MapView`, `Assess`, `IranAI` |
| Special operations (`SpecOps`) | `raid`, `raidThisTurn`, `isrPrep`, `regimeChaosTurns`, `regimeErratic` | `specops.js`; `game.js` performs turn decay/new-war reset and nuclear consequences | `SpecOps.runIsrPrep`, private mission outcome handlers; shared costs go through `Game` write APIs | `Game`, `UI`, `Assess`, `IranAI` |
| Personnel recovery (`CSAR`/`Aircrew`) | `downed`, `aircrew`, `hostageCrisis` | `csar.js` for the recovery situation; `aircrew.js` for roster/status; `game.js` for initialization and end-state consequences | `CSAR.aircraftDown`, recovery/turn handlers; `Aircrew.frag`, `unfrag`, `setStatus`, `turnTick` | `Game`, `UI`, `SpecOps`, after-action report |
| Strategic progress and intelligence (`Game`) | `airPhaseSeen`, `milestones`, `breakout`, `nuclear`, `intel`, `threat` | `game.js` only | private objective/breakout/observation/threat functions; `Game.releaseNuclear` | `UI`, `Assess`, `IranAI`, `MapView` |
| Electronic warfare (`Game`) | `ew` (`id`, `sup`, `hit`, `burn`) | `game.js` only | `Game.orderEw`; private resolution and new-war reset | `UI`, `MapView`, strike estimates |
| Congressional authority (`Game`) | `warPowers` | `game.js` only | private `warPowersVote` | `UI`, `Assess`, `IranAI`, legality gates |
| History and counters (`Game`, with subsystem-owned counters) | `stats`, `timeline`, `bdaLog` | `game.js`; `CSAR` and `SpecOps` may increment only counters produced by their own missions | private `recordTurn`, `logReading`, result builders; subsystem outcome handlers | save/load, after-action UI, test harness |

### Derived `G` members

These are never serialized or assigned. `approval`, `middleSize`, and
`csgPulledBack` are accessors. `nukeDegraded`, `iranCapacity`, `warMachine`,
`iranBroken`, `raidDecapitated`, `dealBar`, `negotiationReady`, `dealProgress`,
and `dealOdds` are derived methods carried on `G` for compatibility with current
consumers. Their arithmetic lives in `GameRules` where extracted. The lint rule
rejects assignments to derived accessors.

### Target state (outside `G`)

`TARGETS` is static tuning data with per-campaign fields layered onto each
target: `hp`, `status`, `lastStruck`, `killedOnce`, `dispersed`, `located`,
`found`, `suspected`, `leads`, `worked`, and `released`.

- Owner and sole mutation module: `game.js`.
- Calculation boundary: `GameRules.Targets` for status, damage, repair ceiling,
  and repair steps.
- Mutation boundary: private `damageTarget`, `syncStatus`, `repairTargets`,
  dispersal/covert handlers, new-war reset, and save restore.
- Consumers: `MapView`, `UI`, `IranAI`, `Assess`, `SpecOps`, and `CSAR` may read;
  none may assign target condition.

## Mutation boundaries

The first protected boundaries are intentionally narrow and can be migrated one
call site at a time.

| Major domain | Boundary |
|---|---|
| Resource spending/refill | `Game.spendResource`, `Game.refillResource`, `Game.executeStrike`, `Game.recallMission`, `Game.bmdEngage`, `Game.orderRearm` |
| Carrier and basing transitions | `Game.orderCarrier`, `Game.toggleCarrierPosture`, `Game.orderRearm`; nightly private sync functions in `game.js` |
| Target damage/repair | `damageTarget` and `repairTargets` in `game.js`, using `GameRules.Targets` |
| Political movement | `Game.movePublic`, `Game.erodeBase`, `Game.moveWorld`, `Game.moveOil`, `Game.addCasualties` |
| Aircrew status | `Aircrew.frag`, `Aircrew.unfrag`, `Aircrew.setStatus`, `Aircrew.turnTick` |
| Mission lifecycle | `Game.executeStrike`, `Game.recallMission`, and the resolution stages in `game.js` |
| Adaptation visibility | `Game.noteAdaptation`; `IranAI` calculates the new level but does not assign `G` |

Development and CI also enforce structural boundaries: direct assignment to
derived state and direct gameplay `Math.random()` fail `npm run lint`.

## Pure calculation APIs

`js/rules.js` has no browser dependencies. It can be loaded with
`require('../js/rules.js')` in Node and exposes:

- `GameRules.Politics`: approval, middle size, public movement, habituation,
  base erosion, rally decay, and reversion.
- `GameRules.Targets`: wear-down classification, status, damage, repair ceiling,
  and one repair step.
- `GameRules.Assessment`: observation error and age/repair uncertainty bands.
- `GameRules.Strike`: success, full-effect, surge, and aircrew-loss estimates.
- `GameRules.Resources`: strike bills and bounded spending/refill arithmetic.
- `GameRules.Victory`: nuclear degradation, military and negotiation progress,
  and ending selection.
- `GameRules.Save`: allowlisted serialization and structural validation.

`js/random.js` exposes the seeded `Random` campaign stream and a separate
`CosmeticRandom` stream for presentation-only variation. Campaign seed, state,
and draw count round-trip through saves. The module is directly requireable in
Node, and the separate APIs keep rendering and audio from advancing campaign
outcomes.

## Exported browser APIs and consumers

Static data globals from `data.js`, `geodata.js`, and `worldgeo.js`
are read-only tuning/dataset contracts. The behavioral module APIs are:

| Global | Exported API (grouped where large) | Consumers |
|---|---|---|
| `Random`, `CosmeticRandom` | campaign: `seed`, `float`, `int`, `pick`, `chance`, `state`, `restore`, `token`, `freshSeed`; cosmetics: `float`, `int`, `pick`, `chance`; both are exported in Node | campaign modules; `MapView`/`AudioSys` for cosmetics; tests |
| `Txt` | `plural`, `pluralize`, `turns`, `were`, `are`, `ordinal`, `signed`, `MINUS`, date/clock helpers | `Game`, `UI`, `IranAI`, `Assess`, `Aircrew`, `CSAR` |
| `Globe` | `init`, `bench`, `invalidate`, `reset`, `attach`, `follow`, `camLimits`, `floorZoom`, `at`, `render`, camera diagnostics/constants | `MapView`, `world.html`, projection probes |
| `GameRules` | `Politics`, `Targets`, `Assessment`, `Strike`, `Resources`, `Victory`, `Save` | `Game`, Node tests |
| `ResolutionMachine` | `STAGES`, `ORDER`, `create`; instance methods `begin`, `transition`, `callback`, `heartbeat`, `finish`, `fail`, `reset`, `diagnostics` | `Game`, Node tests |
| `StateInvariants` | `assert`, `StateInvariantError` | `Game`, Node tests |
| `Replay` | `validate`, `applyTurn`, `run`, `summary` | browser console, replay tooling/tests |
| `Assess` | `board`, `concerns`, `forDoctrine`, `phase` | `Game`, `UI`, `IranAI` |
| `MapView` | rendering/target sync, Strait/Gulf/transit/fleet sync, strike/allied/Iranian animation, footage wait, fast-forward, map input, raid/CSAR views | `Game`, `UI`, `IranAI`, `SpecOps`, `CSAR` |
| `IranAI` | `respond`, `advise`, `headlines`, `missileStrength`, `navalStrength`, adaptation readers, `liveTels`, `posture` | `Game`, `UI`, `Assess` |
| `AudioSys` | initialization and playback, gated playback/cut, phone/alarm/line controls, mute/music controls, mission music, duck holds | `Game`, `UI`, `MapView`, `SpecOps`, `CSAR` |
| `UI` | initialization/rendering, report/endgame/set-piece dialogs, panel/brief navigation, leader calls, pure option/render helpers | `Game`, `Tour`, `SpecOps`, `CSAR` |
| `Tour` | `start`, `end`, `running` | `Game`, `UI` |
| `SpecOps` | `init`, `renderPanel`, `odds`, `isrTasking`, `runIsrPrep`, `busy` | `Game`, `UI` |
| `Aircrew` | roster/read helpers, `frag`, `unfrag`, crew loss/status/turn helpers, tonight/endgame readers, `REST` | `Game`, `UI`, `CSAR` |
| `CSAR` | `init`, `renderPanel`, `aircraftDown`, `turnTick`, `syncMap`, `busy` | `Game`, `UI` |
| `Game` | strike/mission actions; statecraft/end-turn actions; protected state writers; carrier/force/BMD actions; campaign, intelligence, target, ATO, COA, Gulf/Israel/Yemen, nuclear, difficulty and resolution diagnostic readers; `G` | every gameplay/rendering module |

## Script-load dependencies

The game page loads scripts in this exact order:

1. `random.js` — no dependency.
2. `text.js` — no gameplay dependency.
3. `geodata.js`, `worldgeo.js` — generated/static datasets.
4. `globe.js` — consumes world geography.
5. `data.js` — tuning constants and target/asset rosters; consumes theater
   geography for coordinates.
6. `rules.js` — pure and dependency-free.
7. `resolution.js` — pure except injected/default timer functions.
8. `assess.js` — consumes `Txt`, tuning data, and late-bound `Game`/`IranAI`
   readers when its functions are called.
9. `map.js` — consumes geography, `Globe`, data, `CosmeticRandom`, and late-bound
   `Game`/`AudioSys` readers.
10. `ai.js` — consumes data, `Random`, `Assess`, and late-bound `Game` readers and
    mutation APIs.
11. `audio.js` — consumes `CosmeticRandom`; all browser audio failures are
    non-fatal.
12. `ui.js` — consumes `Game`, `Assess`, `IranAI`, `MapView`, `AudioSys`,
    `SpecOps`, `CSAR`, and `Aircrew` at call time.
13. `tour.js` — must follow `ui.js`; it drives exported UI navigation.
14. `specops.js`.
15. `aircrew.js` — must precede `csar.js`.
16. `csar.js` — consumes `Aircrew` and late-bound `Game` APIs.
17. `invariants.js` — pure campaign/save invariant checks.
18. `game.js` — composes every preceding gameplay module and wires
    `DOMContentLoaded`.
19. `replay.js` — follows `game.js` because it drives the public `Game` API.

`world.html` is a separate globe-only entry point. `worldgeo-50m.js` is loaded
there on demand and is intentionally absent from the game page.

Adding, removing, or reordering a classic script requires updating both
`index.html` and any headless loader that mirrors it.

## Asynchronous turn resolution

`Game.endTurn()` starts one `ResolutionMachine` cycle. The authoritative current
stage is available at any time from `Game.resolutionStatus()`; diagnostics also
report wait type, elapsed/timeout values, legal next stages, last safely
committed stage, the latest error, and recent transition history.

| Stage | Entry work | Completes when | Wait | Timeout/recovery | Safely committed on completion |
|---|---|---|---|---|---|
| `idle` | Board accepts orders | Player ends turn | player outside the machine | none | n/a |
| `opening-call` | Lock board; play strike-force call | audio ends, errors, is cut, or audio fallback fires | media | 45 s; recover by advancing without replay | no |
| `allied-missions` | Snapshot start HP; resolve due US missions/batches | final batch and hit-footage handoff complete | media/timer | 180 s, re-armed by batch heartbeats; recover without replay | yes |
| `bda` | Resolve Israel, repairs, dispersal, phase/objective/covert releases, transit and threat | outstanding strike footage clears | media | 90 s; recover without replay | yes |
| `allied-event` | Animate allied tracks and show the BDA report when present | media ends and the player closes the BDA report | media/player | 30 min; a visible modal defers timeout | no additional state |
| `iranian-response` | Add Houthi/carrier events and animate allied/Iranian response tracks | final response animation completes | media | 120 s; recover without replay | yes |
| `retaliation-report` | Apply response; economy/public/breakout/basing/flow/vote accounting; record turn; show report, gavel and nuclear set piece | player closes the last applicable report/dialog | player | 30 min; a visible modal defers timeout | yes |
| `close` | Stop fast-forward, unlock, finish or advance the campaign, queue calls | `nextTurn` or endgame handoff succeeds | none | 45 s; recover without replay | yes |
| `idle` | New turn is available | — | — | — | close is last committed |

The state machine rejects illegal transitions and wraps callbacks with a
cycle/stage token, so a duplicate or late media callback cannot apply the next
stage twice. Errors and timeouts recover from the recorded `lastCommitted`
stage by advancing the turn; stages are never replayed because their state may
already have been applied. The older 15-minute watchdog remains outside the
machine as a final safety net and still defers while a modal is visibly held by
the player.

## Save contract

`GameRules.Save.serialize` receives the explicit `FIELDS` allowlist and target
roster. `GameRules.Save.validate` rejects wrong versions, missing state, missing
targets, and invalid target condition before restore. `G.approval` and all other
derived members are intentionally absent. A valid same-version save retains its
existing JSON shape and storage key.

## Verification and policy

- `npm test` runs the repository, determinism, pure-rule, resolution-stage,
  invariant, save/load, regression, and fixed-seed campaign suites.
- `npm run lint` performs syntax/duplicate-declaration checks and narrowly
  enforces accidental-global, same-line unreachable-code, gameplay RNG,
  browser-promise, derived-state, and approved-console policies.
- `npm run check` runs both locally. CI executes the same lint and test scripts
  in focused jobs.

The lint policy is intentionally behavioral. It does not impose formatting and
does not rewrite unrelated files.
