# WORLDMAP-SPEC — globe-to-flat world chart

Branch `world-map`. A **standalone** world map in the same visual and coordinate
language as the game's Middle East chart: a globe when fully zoomed out, an
ordinary flat chart when zoomed in, morphing continuously between the two the
way Google Earth does.

Nothing here is wired into the game. No existing file is edited. This is a
back-pocket branch to be merged deliberately later.

---

## 1. Non-goals

No targets, no bases, no carriers, no strike animation, no HUD, no save state,
no game logic of any kind. Geography, labels, and the camera. That is all.

Do not edit `js/map.js`, `js/geodata.js`, `index.html`, or `css/style.css`.
Adding new files is the only permitted change to the existing tree.

---

## 2. The coordinate system is the game's, exactly

The flat end-state projection **must be byte-compatible with `js/geodata.js`**,
so that a future merge can drop existing target `x`/`y` coordinates onto this
map unchanged. That file is equirectangular, standard parallel 28N, with x=0 at
38.5E and y=0 at 39.5N.

```js
const LON0 = 38.5, LAT0 = 39.5;
const DEG_X = 1000 / 30;                              // 33.333333 units / degree lon
const DEG_Y = DEG_X / Math.cos(28 * Math.PI / 180);   // 37.753020 units / degree lat
const R_EARTH = DEG_Y * 180 / Math.PI;                // 2163.00 units — sphere radius

function flat(lon, lat) {
  return { x: (lon - LON0) * DEG_X, y: (LAT0 - lat) * DEG_Y };
}
```

Verified against the real file: Bahrain's path begins at `403.6,514.1`, which
inverts to 50.61E / 25.88N — Bahrain is at 50.55E / 26.07N. Sri Lanka's bbox
inverts to 79.96–81.2E / 8.56–9.83N. Both correct.

**Seam at the antimeridian.** Longitudes are unwrapped into (−180, 180], so the
cut falls in the empty Pacific rather than through Alaska (which is where a naive
±180 window around 38.5E would put it). Full flat extent is therefore
x −7283.3 … 4716.7, y −1906.5 … 4889.0. The game's regional frame (x 0…1000,
y 0…760) sits inside that untouched.

Polygons crossing the seam must be **split**, not drawn — an unsplit ring draws a
horizontal scar across the whole map.

---

## 3. The morph

Two projections and a blend, not one clever projection. This is deliberate: the
flat end state has to land *exactly* on §2, and a lerp guarantees that where a
perspective projection only approaches it.

**Orthographic**, centred on the camera's (λ0, φ0):

```
cosc = sin(φ0)sin(φ) + cos(φ0)cos(φ)cos(λ−λ0)      // < 0 ⇒ far side of the earth
x = R · cos(φ)·sin(λ−λ0)
y = −R · (cos(φ0)·sin(φ) − sin(φ0)·cos(φ)·cos(λ−λ0))   // negated: SVG y grows down
```

**Flat**, recentred on the same point so the two share an origin:

```
x = flat(λ,φ).x − flat(λ0,φ0).x
y = flat(λ,φ).y − flat(λ0,φ0).y
```

**Blend** `p = (1−t)·ortho + t·flatRecentred`, then the camera applies
`translate(view.x, view.y) scale(view.k)` on top, as `map.js` already does.

`t` is driven by **how much of the earth's surface the frame spans**, not by raw
zoom — altitude is what makes it feel like a camera, and an angular measure stays
correct on any window shape:

| visible arc across the frame | `t`  | reads as |
|---|---|---|
| ≥ 90° | 0 | a globe |
| 90° → 25° | smoothstep 0→1 | rolling out flat |
| ≤ 25° | 1 | a chart |

Tune those two numbers by eye and write down what you chose and why. The feel to
aim for: the curvature should be gone slightly *before* the player consciously
notices it going.

**Clipping.** While `t < 1`, geometry with `cosc < 0` is behind the earth and
must be clipped on the great circle `cosc = 0` — not merely culled per-vertex,
which leaves polygons collapsing across the disc. Interpolate the two crossing
vertices to the horizon and close the ring along the limb. At `t == 1` the clip
is off and ordinary viewport culling takes over.

---

## 4. Data contract

Task A produces this; Task B consumes it. Both may proceed in parallel against
this shape.

```js
// js/worldgeo.js — GENERATED, do not edit by hand
const WORLD_GEO = {
  res: '110m',
  countries: [
    {
      name: 'Iran',
      iso: 'IRN',
      rings: [ [lon,lat, lon,lat, ...], ... ],  // flat interleaved; [0] outer, rest holes
      label: [lon, lat],                        // pole of inaccessibility, not centroid
      area: 1648195                             // km², label priority only
    },
    ...
  ]
};
```

- Flat interleaved `Float`-ish arrays, **2 decimal places** (≈1.1 km — finer than
  either source dataset resolves). Not `[[lon,lat],…]`: it roughly doubles the
  bytes and slows the per-frame loop.
- Rings are closed implicitly (do not repeat the first point).
- Winding is not significant; the renderer uses `fill-rule: evenodd` for holes.
- `js/worldgeo-50m.js` is the same shape with `res: '50m'` and a
  `const WORLD_GEO_50M = …` binding, in its own file, **lazy-loaded**.
- Antarctica is included and must not be dropped for having an open southern edge.

---

## 5. Detail tiers

Two-tier LOD. 110m ships in the initial load and carries the globe and every far
zoom; 50m is fetched once the camera crosses into regional scale and then used
from there down. Swapping tiers must not move the camera or flash the map — build
the new paths, then swap in one frame.

Budget: 110m ≈ 150 KB, 50m ≈ 800 KB, both as plain `.js` with a `<script>` tag
(no build step, no modules, no fetch of JSON — this repo has none of those).

---

## 6. Visual language

Match the game's chart. Tokens from `css/style.css`:

```
--bg #060a12   --water #0a1626   --land #16233b   --land-line #2a3d5f
--line #1d2c47   --text #c8d4e8   --dim #6d7d99   --blue #4da3ff
```

Country class `.country { fill: var(--land); stroke: var(--land-line);
stroke-width: 1.2; vector-effect: non-scaling-stroke; }` — copy that rule, do not
import the game's stylesheet.

Also wanted:
- **Graticule** at 15°, generated in code, never in data. It is the single
  strongest cue that the thing is a sphere; it must curve correctly through the
  morph, so generate it as lon/lat polylines and run it through the same
  projector, densified enough that it stays smooth on the limb.
- **Sphere edge** — the disc's outline, with a soft atmosphere falloff outside
  it (SVG radial gradient). It fades out as `t → 1`; there is no horizon on a
  flat chart.
- **Country labels** in `.country-label`'s idiom (fill `#55688a`, letter-spacing,
  monospace, centred), thinned by zoom: at globe scale only the largest handful,
  more as the camera drops. Counter-scale the text so it does not grow with the
  world transform — `map.js` does this and the reason is in its comments.
- **Ocean labels** in `.sea-label`'s idiom, from a small hand-written table in
  `globe.js` (lon/lat + name + the zoom band it lives in). Not in the data file.

---

## 7. Interaction

Drag means the obvious thing at each scale, and crosses over with the morph:

- At globe scale, drag **spins the earth** (moves λ0/φ0). φ0 clamps to ±80° so
  the pole never tips past the top of the frame.
- At chart scale, drag **pans** the camera exactly as `map.js` does.
- Through the morph band, blend the two on the same `t`.

Wheel and pinch zoom about the cursor. `+ / − / RESET` buttons in the corner in
the game's button idiom. Zoom range: fully-out shows the whole globe with margin;
fully-in matches the game's `MAX_ZOOM = 10`. Touch: two-finger pinch, and honour
the game's landscape-only posture only if it is free — this is a standalone page
and does not need the rotate-lock overlay.

Read `js/map.js:1680–1800` (`measureWorld`, `visibleBox`, `minZoom`, `clampView`,
`applyView`) before writing the camera. The clamping and the per-frame
`visibleBox` measurement are both load-bearing and the comments say why.

---

## 8. Performance

The globe re-projects every vertex on every frame that moves. Budget **60fps on a
laptop, no worse than 30fps on a phone**, at 110m.

- Build path `d` strings with a preallocated array join, one pass, no per-point
  object allocation. The projector should write into scratch arrays.
- Do not touch the DOM per vertex. One `<path>` per country, `setAttribute('d')`
  once per frame.
- Skip a country entirely when its lon/lat bbox is wholly behind the horizon or
  wholly outside the viewport.
- Reproject only while the camera is moving; when it settles, stop.

Measure it and write the number down. If 110m cannot hold 60fps, say so with the
figure rather than quietly shipping a slideshow.

---

## 9. Rules

1. **Never invent coordinate data.** Every vertex comes from Natural Earth
   (public domain). If the network is unreachable, stop and report it — a
   hand-drawn coastline is worse than no branch.
2. No dependencies, no build step, no ES modules. One IIFE per file assigned to
   one global, matching every existing `js/*.js`.
3. Comment like the rest of this codebase: say *why* a number is what it is. Read
   a few of `map.js`'s comment blocks first for the register.
4. Generated files carry a `GENERATED — do not edit by hand` header naming the
   generator, as `js/geodata.js` does.
5. Verify in a browser before reporting done. Screenshot the globe, the morph
   mid-band, and the Gulf at full zoom.

---

## 10. Task split

| Task | Owner | Produces |
|---|---|---|
| **A — data** | cloud | `tools/worldgeo.py`, `js/worldgeo.js`, `js/worldgeo-50m.js` |
| **B — engine + page** | cloud | `js/globe.js`, `world.html`, `css/world.css` |
| **C — integration** | local | wiring, verification, `MERGE.md` |

A and B run in parallel against §4. Task B develops against a small built-in
fixture (a few lon/lat boxes plus the graticule) so it never blocks on A, then
swaps in the real data.

**Cross-check for Task A:** re-project Iran's rings through §2's `flat()` and
compare the bbox to the `Iran` entry already in `js/geodata.js`. They come from
the same source at the same resolution and must agree within a unit or two. If
they do not, the projection constants above are wrong and everything downstream
inherits it — report rather than adjust.
