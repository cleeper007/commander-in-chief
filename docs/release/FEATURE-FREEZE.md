# Temporary feature freeze

- Status: **active**
- Baseline: `v2.38` at `4858e2ee82852a9bc1b07ae2c387c4c7dbe435b4`
- Ends: after Phase 2 is complete and its verification issues are accepted

The release is in a temporary feature freeze so every change can be compared
with the recorded v2.38 baseline in `tests/baselines/v2.38.json`.

Release tracking:

- [v2.39 Release project](https://github.com/users/cleeper007/projects/1/views/1)
- [v2.39 — Phase 0–2 stabilization milestone](https://github.com/cleeper007/commander-in-chief/milestone/1)

## Allowed work

- bug fixes;
- testability and deterministic regression coverage;
- documentation;
- accessibility fixes;
- balance changes supported by a deterministic test that demonstrates the
  need and records before/after results.

## Parked work

- new mechanics;
- new targets;
- new event chains;
- new audiovisual set pieces;
- unrelated feature work, including work already in progress that does not fit
  an allowed category.

Parked work may remain in the backlog, but it must not be placed in the active
release milestone or merged into the release branch before the freeze is
lifted.

## Release gate

Every change in the release milestone must have an accountable issue, explicit
completion criteria, priority and area labels, and a board state. A balance
issue must link its deterministic failing evidence before implementation and
its passing comparison before completion. Work moves to Verification only when
its completion criteria are demonstrably met, and to Done only after the
evidence is attached.

The release owner lifts this freeze explicitly after Phase 2 verification; it
does not expire by date.
