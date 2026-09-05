# Startup performance baseline

Measured September 4, 2026 against build v2.40 before the release cache-stamp
bump. The source baseline was commit `ceef629`; the after measurement included
only the Phase 6 staged-media implementation. Both measurements used the same
local server, empty Chrome profile, disabled cache, and one cold run per profile.

The phone profile is a reproducible lab proxy, not field telemetry: 390×844 CSS
pixels at 2.75 device scale, 4× CPU slowdown, 80 ms latency, 4 Mbps down, and
1 Mbps up. The desktop profile is 1440×900 at native CPU and loopback speed.

## Targets

These budgets turn “make it faster” into a release check. Re-run the probe after
startup, map, globe, or media-loading changes and explain any regression outside
the budget rather than silently moving the budget.

| Measure | Desktop budget | Mid-range-phone budget |
| --- | ---: | ---: |
| Bytes transferred before the title is usable | ≤ 2.90 MB | ≤ 2.90 MB |
| Audio/video requests before interaction | 0 | 0 |
| First contentful paint | ≤ 250 ms | ≤ 3,000 ms |
| Title usable | ≤ 400 ms | ≤ 6,000 ms |
| JS heap at title | ≤ 3.0 MB | ≤ 3.0 MB |
| JS heap after strike-wall sequence | ≤ 5.5 MB | ≤ 5.5 MB |
| Longest map/globe main-thread task | ≤ 120 ms | ≤ 350 ms |

## Recorded results

Transfer totals are network bytes completed before the title became usable.
“Title usable” means game initialization has installed the difficulty controls
and enabled the start control. Memory is Chrome's used JavaScript heap plus DOM
counters; it is not whole-process resident memory. The strike reading is taken
after a representative two-aircraft wall is painted, fast-forwarded, and fully
torn down.

| Profile / measure | Before | After |
| --- | ---: | ---: |
| Desktop transferred bytes | 4,352,574 | 2,807,870 |
| Desktop media requests before interaction | 32 | 0 |
| Desktop first contentful paint | 104 ms | 104 ms |
| Desktop title usable | 146.5 ms | 141.8 ms |
| Desktop JS heap at title | 2,439,684 B | 2,421,864 B |
| Desktop JS heap after strike wall | 4,610,476 B | 4,564,640 B |
| Phone transferred bytes | 2,763,463 | 2,766,408 |
| Phone media requests before interaction | 32 | 0 |
| Phone first contentful paint | 2,688 ms | 2,688 ms |
| Phone title usable | 5,728.6 ms | 5,713.1 ms |
| Phone JS heap at title | 2,543,164 B | 2,527,700 B |
| Phone JS heap after strike wall | 4,593,604 B | 4,677,320 B |

The phone's before-transfer total does not contain the media bodies: on the
throttled connection they had all been requested but had not finished before the
title became usable. The meaningful phone result is therefore the removal of 32
competing requests, not a claim that 2.9 KB of run-to-run transfer variance is a
regression. On desktop, media completed soon enough to count and title transfer
fell by 1,544,704 bytes (35.5%).

Observed long tasks were:

- desktop before/after: map/globe mount 68/66 ms; no separate globe-transition
  long task;
- phone before: title 57 ms, map/globe mount 292 ms, globe transition 216 ms,
  strike wall 61 ms;
- phone after: title 59 ms, map/globe mount 321 ms, globe transition 217 ms,
  strike wall 60 ms.

The variation in map mount did not accompany a code change in map rendering and
remains inside the 350 ms lab budget. It should be watched over repeated runs if
that subsystem changes.

## Reproduce

Chrome and Node.js 22 or newer are required. Run:

```sh
npm run measure:performance -- --label local-check --output docs/performance/local-check.json
```

The probe also records the exact emulation settings, navigation timings, memory
and every long task in its JSON output. Generated local reports need not be
committed unless they support a release or a performance change.
