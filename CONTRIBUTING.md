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

The checks use Node.js, Python's standard library, and `ffprobe`. The default
command runs repository/syntax and media-manifest checks, fast unit and invariant
coverage, the save/load matrix, regressions, and fixed-seed campaign smoke tests:

```sh
npm test
```

Chrome can be exercised separately with `npm run test:browser`. The larger
fixed-seed sweep is `npm run test:balance`; CI runs it nightly and on manual
dispatch, while pull requests receive the faster browser smoke test. Each CI
layer uploads only its compact summary log.

Every shipped audio/video file is inventoried in `media-manifest.json`. After
adding or intentionally re-encoding media, run `npm run media:manifest`, review
its owner, codec, duration, size, and hash, then commit the updated inventory.
The validator rejects missing or orphaned media, duplicate content, unsupported
codecs, stale profiles, and individual assets over 4 MiB. An orphan is a review
finding, not permission to delete the file.

Reusable tests belong in `tests/unit`, `tests/simulation`, `tests/save`, or
`tests/regression`. Put data-only scenarios in `tests/fixtures`, and commit a
small reviewed expectation under `tests/baselines` when a deterministic
campaign result is part of the contract. Historical regression fixtures must
name the issue that introduced or tracked the failure.

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
