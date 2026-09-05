# Repository history decision

Decision recorded September 4, 2026: **retain shared history for this release**
and prepare a separate, coordinated maintenance window if clone cost becomes a
continuing contributor problem. Phase 6 does not rewrite `main`, branches, tags,
or clone URLs.

## Current topology and recovery check

GitHub was queried immediately before this decision:

- public repository: `cleeper007/commander-in-chief`;
- default branch and Pages source: `main`, repository root;
- Pages URL: `https://cleeper007.github.io/commander-in-chief/` (status `built`);
- HTTPS clone: `https://github.com/cleeper007/commander-in-chief.git`;
- SSH clone: `git@github.com:cleeper007/commander-in-chief.git`;
- GitHub collaborators: `cleeper007` (admin); Git history also contains Claude
  co-author identities, but no additional human author;
- GitHub forks: 0;
- published branches: `main`, `world-map`; six `archive/*` tags are also
  published.

A fresh `--mirror` clone was created at
`/private/tmp/commander-in-chief-phase6-20260904.git` and passed `git fsck
--full`. It contains one 217.91 MiB pack and occupies 224 MiB. This is a verified
short-term safety copy for this investigation, not a durable backup: temporary
storage may be cleared by the operating system. Before any future rewrite,
create a new mirror in durable storage, run `git fsck --full`, record its object
ID for `main`, and protect it from garbage collection.

The working repository is a full clone, not a shallow clone. Its `.git` directory
occupies about 263 MiB and currently reports its objects as loose; it also carries
local archive and stash refs. The currently shipped audio/video inventory is
21.70 MiB, so normal contributor clone cost is dominated by historical revisions
rather than the checked-out media.

## Obsolete binary revisions

The clearest obsolete set is the original special-operations footage removed in
commit `0fef327` when the raid was converted from HEVC QuickTime files to
fast-start H.264 MP4. Thirteen unreachable-from-HEAD `.mov` blobs remain reachable
from history and total 72,601,036 bytes (69.2 MiB uncompressed). The largest are:

| Historical path | Blob size |
| --- | ---: |
| `video/spec-ops infil/6Missionisgomov.mov` | 11,163,230 B |
| `video/spec-ops assault/Interiorstackmovement.mov` | 9,257,762 B |
| `video/spec-ops assault/Breachcharge.mov` | 8,019,546 B |
| `video/spec-ops infil/5ridgelineterrain.mov` | 6,518,504 B |
| `video/spec-ops assault/fastrope.mov` | 5,993,938 B |

There are also superseded, larger MP4 revisions (for example old F-14,
airbase, strike, carrier-launch, and raid encodes). A future cleanup should build
its deletion expression from blob IDs and path history, not from the current
manifest: every current file must survive unchanged.

## Options considered

| Option | Benefit | Cost / risk | Decision |
| --- | --- | --- | --- |
| `git filter-repo` on obsolete blob IDs and old `.mov` paths | Largest likely reduction while keeping one repository | Rewrites every affected commit, branch and tag; all clones must be replaced and open commit links change | Best technical cleanup, but only in a scheduled maintenance window |
| Freeze this repository as an archive and publish a new clean repository from current `main` | Clean clone without rewriting the archive | Changes project identity, clone URLs and Pages routing; issues/stars/history split across repositories | Not justified while the existing URL is the live game |
| Leave history unchanged | Zero coordination risk; all links and refs stay valid | Fresh mirror remains ~224 MiB | Chosen for this release |

## Tested cleanup procedure for a future window

No command below should be run against the live checkout without an announced
freeze and a second durable mirror.

1. Record collaborator, fork, branch, tag, Pages, and clone-URL state again.
2. Create two durable mirrors. Keep one byte-for-byte untouched and run the
   experiment only on the other.
3. Install a pinned `git-filter-repo` release and filter the reviewed obsolete
   blob IDs/paths. Do not use a broad extension rule that could remove current
   media.
4. Run `git fsck --full`; compare every file and hash in `media-manifest.json`
   against pre-rewrite `main`; run `npm test` and `npm run test:browser` from a
   fresh non-bare clone of the candidate mirror.
5. Measure the candidate mirror and a fresh working clone. Proceed only if the
   reduction is material relative to the current 224 MiB mirror.
6. During the announced freeze, force-push all reviewed branches and tags with
   explicit leases. Never force-push only `main` while old published refs keep
   the removed blobs reachable.
7. Re-clone through both HTTPS and SSH URLs; verify GitHub Pages still reports
   `main` `/ (root)`, then load the title and start a campaign at the Pages URL.
8. Tell every collaborator to archive or delete old clones and clone again.
   Publish the untouched mirror's recovery location and rollback commands until
   the maintenance window closes.

Until that window is approved, history size is tracked contributor friction,
not a release blocker and not permission for an opportunistic force-push.
