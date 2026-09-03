# Release baselines

Release baselines are immutable characterization records. They describe the
behavior of one exact source commit; they are not targets that every later
release must reproduce blindly.

`v2.38.json` is the starting point for the current release program. Its source
commit and tree identify the code, its inventory records the checkout shape,
and its campaign section records the seeded private-harness run independently
of the ignored `.claude/` directory.

## Comparing a later build

1. Run JavaScript syntax checks against the candidate commit.
2. Run the same harness sources, configuration, persona order, difficulty
   order, and seeds recorded in the baseline.
3. Use the definitions in `campaign_harness.definitions`; in particular, a
   30-turn completion is an ended campaign with `turns <= 30`, while a
   progression fault is not a balance outcome.
4. Report absolute counts and percentage-point changes. Keep prose-lint
   findings separate from progression faults.
5. If the harness changes, record new source hashes and explain the change;
   do not compare two harness implementations as though only game behavior
   moved.

The raw 10.6 MB campaign output is intentionally not tracked. Its SHA-256,
source hashes, seed formula, aggregate counts, definitions, and issue snapshot
are tracked in the baseline so another checkout can identify exactly what was
measured.
