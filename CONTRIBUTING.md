# Contributing

Commander in Chief is a dependency-free browser game. Keep changes focused,
preserve save compatibility deliberately, and verify both the simulation and
the interface before merging.

## Run locally

Opening `index.html` directly is supported for ordinary play. For development,
serve the repository so reloads, media, and browser storage behave consistently:

```sh
python3 -m http.server 8765
```

Then open `http://localhost:8765/`.

## Run the public checks

The checks use Node.js and Python's standard library only:

```sh
node tests/repository-smoke.mjs
for file in js/*.js; do node --check "$file"; done
python3 -m py_compile tools/worldgeo.py
```

The GitHub Actions workflow runs the same checks on pushes and pull requests.
The larger balance harness mentioned in the design notes is developer tooling;
new regression tests that protect repository behavior should live under
`tests/` so they run for every contributor.

## Change discipline

- Keep static game data and difficulty knobs in `js/data.js`.
- Keep state mutations behind the domain APIs exported by `Game`, `IranAI`,
  `MapView`, and the other module IIFEs.
- Treat save changes explicitly. Adding compatible state needs a default;
  changing the meaning of saved state requires a save-version decision.
- Do not add gameplay randomness during rendering. Random outcomes belong in
  the simulation path, where they can eventually be seeded and replayed.
- Update the visible build badge and every `?v=` cache-busting stamp together.
- Verify desktop and portrait mobile layouts when changing HTML or CSS.
- Preserve `prefers-reduced-motion` behavior for new animation.

## Pull requests

Describe the player-facing reason for the change, the state or UI paths it
touches, and how it was verified. Small, single-purpose changes are easiest to
review and safest to balance.
