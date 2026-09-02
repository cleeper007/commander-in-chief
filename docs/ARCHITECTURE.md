# Architecture

Commander in Chief is a static browser application: HTML defines the room,
CSS defines its visual systems and responsive layouts, and classic JavaScript
files expose small global module APIs through IIFEs. There is no build step and
no runtime network dependency.

## Runtime order

`index.html` is the authority for script order. The broad dependency flow is:

1. text and geographic data;
2. globe and game data;
3. assessment and map rendering;
4. Iranian AI, audio, and UI;
5. tours and mission subsystems;
6. the core game loop.

Do not alphabetize the script tags. Later modules intentionally consume APIs
created by earlier modules.

## Module responsibilities

- `js/data.js` — targets, force tables, difficulty settings, and other static
  configuration.
- `js/game.js` — campaign state, orders, turn resolution, saves, and endings.
- `js/ai.js` — Iranian behavior, retaliation, advisors, and headlines.
- `js/assess.js` — the player's assessed picture of hidden simulation truth.
- `js/map.js` and `js/globe.js` — theater/world projection and animation.
- `js/ui.js` — panels, dialogs, reports, and player interaction.
- `js/audio.js` — effects, music, voice, and mute persistence.
- `js/specops.js`, `js/csar.js`, and `js/aircrew.js` — mission-specific domains.
- `js/tour.js` — contextual onboarding.
- `tools/worldgeo.py` — deterministic Natural Earth data generation.

## Important invariants

- Target `hp` is simulation truth; player-facing target condition comes through
  the assessment layer.
- Approval is derived from political blocs. Write through `Game.movePublic()`
  or `Game.erodeBase()`, never assign `Game.G.approval`.
- The save layer persists only its explicit field allowlist and target records.
- Turn resolution must release its UI lock on success, error, or timeout.
- Render functions must not consume gameplay randomness.
- Difficulty behavior belongs in configuration flags rather than scattered
  difficulty-name branches.
- Cache-busting query versions in `index.html` must match the visible build.

## Tests

`tests/repository-smoke.mjs` protects static repository invariants without adding
dependencies. Simulation, save/load, and reported-bug regression tests should
also be committed under `tests/`; personal or agent-specific harnesses are not a
replacement for checks that run in CI.
