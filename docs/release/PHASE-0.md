# Phase 0 release control

Phase 0 establishes the v2.38 comparison point and the controls that keep the
stabilization release comparable to it.

## Live release tracking

- Project: [v2.39 Release](https://github.com/users/cleeper007/projects/1/views/1)
- Milestone: [v2.39 — Phase 0–2 stabilization](https://github.com/cleeper007/commander-in-chief/milestone/1)
- Baseline: [`tests/baselines/v2.38.json`](../../tests/baselines/v2.38.json)
- Freeze policy: [`FEATURE-FREEZE.md`](FEATURE-FREEZE.md)

The project workflow is, in order: **Triaged**, **Ready**, **In progress**,
**Verification**, and **Done**.

## Accountable issues

| Roadmap item | Priority | Accountable issue | Initial state | Completion evidence |
|---|---|---|---|---|
| 0.1 Record the current baseline | P0 | [#3 Record and lock the v2.38 release baseline](https://github.com/cleeper007/commander-in-chief/issues/3) | Verification | Machine-readable baseline, syntax result, and campaign aggregates |
| 0.2 Create a release board | P1 | [#4 Establish the Phase 0 release board and accountable issue set](https://github.com/cleeper007/commander-in-chief/issues/4) | Verification | Project, labels, milestone, owners, and criteria |
| 0.3 Declare a temporary feature freeze | P0 | [#2 Enforce the temporary feature freeze through Phase 2](https://github.com/cleeper007/commander-in-chief/issues/2) | Verification | Tracked freeze policy and pull-request gate |
| Turn-resolution regression | P0 | [#1 Submarine strike footage must release turn resolution](https://github.com/cleeper007/commander-in-chief/issues/1) | Ready | Deterministic regression and resolution-chain proof |

Every issue is assigned to `cleeper007`, labeled by priority and area, and is
in the stabilization milestone. Issue #1 is intentionally Ready: Phase 0 has
converted the isolated beta report into accountable regression work, but the
regression itself is not claimed complete.

## Milestone scope

The stabilization milestone begins with only the four issues above. New work
may enter it only when it satisfies the temporary feature-freeze policy. New
mechanics, targets, event chains, audiovisual set pieces, and other unrelated
feature work remain outside the milestone until the freeze is explicitly
lifted after Phase 2 verification.
