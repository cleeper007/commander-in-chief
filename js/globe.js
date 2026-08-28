// ============================================================
// globe.js — the world chart. A globe when the camera is far out, an
// ordinary flat chart when it is close, morphing continuously between
// the two. WORLDMAP-SPEC §2–§8.
//
// Standalone: this file knows nothing about the game. It reads
// WORLD_GEO (and, once the camera earns it, WORLD_GEO_50M) and draws
// geography, a graticule and labels. Nothing else.
//
// The flat end state is byte-compatible with js/geodata.js — same
// equirectangular projection, same standard parallel, same origin — so
// that a future merge can drop the game's existing target x/y onto this
// map unchanged. That is the reason for the lerp in §3 of the spec and
// the reason it is a lerp rather than a single clever projection: a
// perspective projection only ever APPROACHES the flat frame, and
// "approaches" is not good enough when the payload is a coordinate
// system somebody else's data already lives in.
// ============================================================
const Globe = (function () {

  // ---- §2. the coordinate system is the game's, exactly ----
  // Do not touch these. geodata.js was authored against them and the
  // whole point of the branch is that the two agree at t == 1.
  const LON0 = 38.5, LAT0 = 39.5;
  const DEG_X = 1000 / 30;                             // 33.333333 units / deg lon
  const DEG_Y = DEG_X / Math.cos(28 * Math.PI / 180);  // 37.753020 units / deg lat
  const R = DEG_Y * 180 / Math.PI;                     // 2163.00 units — sphere radius
  const D2R = Math.PI / 180, R2D = 180 / Math.PI;

  // Two identities that fall out of the constants above and are worth
  // stating once, because a surprising amount of this file is simple
  // because of them:
  //
  //   DEG_Y === R * PI/180   — the flat map's vertical scale IS the
  //     sphere's. So the ortho and flat projections agree exactly in y
  //     near the camera centre, at every latitude. The morph is a
  //     HORIZONTAL squeeze and nothing else near the middle of the
  //     frame, which is most of why it reads as gentle.
  //
  //   DEG_X === R * cos(28°) * PI/180  — the two agree in x as well, but
  //     only at latitude 28. Away from it the morph resolves the
  //     equirectangular stretch: at the equator the globe is 13% wider
  //     per degree than the chart, at 60N the chart is 37% wider than
  //     the globe. That IS the distortion an equirectangular map has,
  //     and watching it arrive is the honest thing for the morph to show.

  function flatX(lon) { return (lon - LON0) * DEG_X; }
  function flatY(lat) { return (LAT0 - lat) * DEG_Y; }

  // ---- §3. the morph band ----
  // t is driven by how much of the earth the frame spans, not by raw
  // zoom: altitude is what makes a camera feel like a camera, and an
  // angular measure stays honest on any window shape (a landscape phone
  // and a desktop see very different pixel counts of the same world).
  //
  // MORPH_WIDE / MORPH_TIGHT are the two numbers §3 asks to be chosen by
  // eye and written down. Chosen: 92° and 24°.
  //
  //   92, not 90, because the frame at the zoom floor spans ~185–300°
  //   depending on window shape and there is a long stretch of pure
  //   globe below it either way; what 92 buys over 90 is that the first
  //   wheel notch off the floor is still unambiguously a globe on a wide
  //   monitor. Anything past ~110 and the morph starts before the disc
  //   has left the frame, and you get a globe with flattening edges,
  //   which reads as a bug rather than as altitude.
  //
  //   24, not 25, for the reason the spec gives — the curvature should be
  //   gone slightly before the player notices it going. At a 24° span the
  //   remaining discrepancy between the two projections at the frame edge
  //   is about 1% of the offset from centre, and smoothstep's derivative
  //   vanishes at t == 1, so the last third of the band moves almost
  //   nothing. Pushing it further in (15–18) makes the map still be
  //   morphing while the player is reading a country, which is exactly
  //   the moment they can see it; pulling it further out (35+) finishes
  //   the morph while the curve is still large enough to notice
  //   stopping.
  const MORPH_WIDE = 92, MORPH_TIGHT = 24;

  // Longitude sensitivity of a spin drag is 1/cos(lat0) — correct, and
  // correct is unusable in the last few degrees before the pole, where a
  // 20px drag would whip the earth a third of the way round. Damped
  // below cos 72.5°. Exact everywhere a player actually works.
  const SPIN_COS_FLOOR = 0.30;

  const MAX_ZOOM = 10;        // matches the game's chart (§7)
  const GLOBE_FIT = 0.90;     // the disc takes 90% of the short frame axis at the floor
  const LAT_SPIN_CLAMP = 80;  // §7 — the pole never tips past the top of the frame

  // LOD (§5). Both thresholds sit INSIDE chart mode (arc <= MORPH_TIGHT)
  // on purpose: 50m is 59k vertices against 110m's 10k, and chart mode
  // builds its paths once and then rides the camera transform. So the
  // fine tier never enters the per-frame reprojection loop at all, and
  // the 60fps budget in §8 is a claim about 110m, which is the tier that
  // has to hold it. The gap between the two numbers is hysteresis; a
  // tier swap costs a path rebuild and must not fire on jitter.
  const LOD_UP_ARC = 22, LOD_DOWN_ARC = 24;

  // ---- state ----
  let svg, camG, spaceEl, atmoEl, discEl, gratEl, countriesG, labelsG, hudEl;
  let cam = { lon: 38.5, lat: 24, k: 0.2 };   // centre of the frame + zoom
  let tier = null, tier110 = null, tier50 = null, lodPending = false;
  let lastVis = { x: 0, y: 0, w: 1000, h: 760 };
  let dirty = true, rafId = 0;
  let chartBuiltFor = null;   // which tier's static flat paths are in the DOM
  const times = [];           // ring buffer of draw() durations, for §8

  const VW = 1000, VH = 760;  // viewBox — the game's, so the tokens transfer

  // ============================================================
  // preparation — done once per tier, never per frame
  // ============================================================
  //
  // Every vertex is stored three ways: as a unit vector on the sphere,
  // and as its flat x/y. That is 20 bytes a vertex (Float32 throughout —
  // the flat extent is 7283 units and float32 resolves 0.001 of that,
  // which is a millimetre of screen at maximum zoom) and it buys the
  // per-frame loop out of trigonometry entirely. The orthographic
  // projection of a unit vector is three dot products against a frame
  // built from lat0/lon0 once per frame; the flat projection is a
  // subtraction. Thirteen multiplies a vertex, no sin, no cos, no atan2.
  //
  // Storing lon/lat and calling Math.sin per vertex per frame instead
  // costs about 8x and puts 110m under the frame budget on a phone.

  function prepRing(raw) {
    const n = raw.length >> 1;
    const vx = new Float32Array(n), vy = new Float32Array(n), vz = new Float32Array(n);
    const fx = new Float32Array(n), fy = new Float32Array(n);
    let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
    let sx = 0, sy = 0, sz = 0;
    for (let i = 0, j = 0; i < raw.length; i += 2, j++) {
      const lo = raw[i] * D2R, la = raw[i + 1] * D2R;
      const cl = Math.cos(la);
      const x = cl * Math.cos(lo), y = cl * Math.sin(lo), z = Math.sin(la);
      vx[j] = x; vy[j] = y; vz[j] = z;
      sx += x; sy += y; sz += z;
      const px = flatX(raw[i]), py = flatY(raw[i + 1]);
      fx[j] = px; fy[j] = py;
      if (px < bx0) bx0 = px; if (px > bx1) bx1 = px;
      if (py < by0) by0 = py; if (py > by1) by1 = py;
    }
    // Bounding cap: the smallest spherical cap containing the ring,
    // approximated by the normalised vertex mean and the worst vertex.
    // This is what makes the horizon test one dot product per ring
    // instead of one per vertex, and it is EXACT in both directions —
    // see behindHorizon/whollyInFront below.
    let m = Math.hypot(sx, sy, sz);
    if (m < 1e-9) { sx = 0; sy = 0; sz = 1; m = 1; }
    const cx = sx / m, cy = sy / m, cz = sz / m;
    // circular mean longitude, free out of the vector sum already taken.
    // wrapOrigin() below uses it to decide which way round the world this
    // ring sits from the camera.
    const lonMid = Math.atan2(sy, sx) * R2D;
    let capCos = 1;
    for (let j = 0; j < n; j++) {
      const d = vx[j] * cx + vy[j] * cy + vz[j] * cz;
      if (d < capCos) capCos = d;
    }
    // sin of the cap radius, precomputed because both horizon tests want it
    const capSin = Math.sqrt(Math.max(0, 1 - capCos * capCos));
    return { n, vx, vy, vz, fx, fy, cx, cy, cz, capCos, capSin, lonMid, bx0, by0, bx1, by1 };
  }

  // ---- the antimeridian (§2) ----
  // An unsplit ring that crosses ±180 draws a horizontal scar the full
  // width of the map, so rings are cut at the seam and each half closed
  // along the meridian.
  //
  // The condition is deliberately narrower than "the longitude jumped by
  // more than 180": it also requires that neither endpoint is ALREADY on
  // the meridian. Natural Earth ships admin-0 pre-cut at ±180 — Fiji
  // arrives as separate rings ending at 180.0 and starting at −180.0 —
  // and the one remaining jump in the shipped data is Antarctica's
  // closing edge from (180,−90) to (−180,−90), which is the south pole
  // to itself and is the flat map's bottom edge, correct as it stands.
  // Splitting that would cut a continent in half to fix nothing. So on
  // the real data this function does nothing at all; it exists for the
  // fixture, for the day somebody regenerates the data from a source
  // that does not pre-cut, and because "the renderer assumes its input
  // was already fixed" is how a scar ships.
  //
  // Known limit: a ring that ENCLOSES a pole crosses the seam an odd
  // number of times and cannot be closed this way. Nothing in Natural
  // Earth admin-0 reaches this function at all, let alone that case.
  function splitSeam(raw) {
    const n = raw.length >> 1;
    let crossings = 0;
    for (let i = 0; i < n; i++) {
      const a = raw[i * 2], b = raw[((i + 1) % n) * 2];
      if (Math.abs(a - b) > 180 && !(Math.abs(a) >= 179.99 && Math.abs(b) >= 179.99)) crossings++;
    }
    if (crossings === 0) return [raw];
    if (crossings & 1) return [raw];   // pole-enclosing; see the note above

    const pieces = [];
    let cur = [];
    let first = null;                  // the piece the walk started mid-way through
    for (let i = 0; i < n; i++) {
      const ax = raw[i * 2], ay = raw[i * 2 + 1];
      const k = (i + 1) % n;
      const bx = raw[k * 2], by = raw[k * 2 + 1];
      cur.push(ax, ay);
      if (Math.abs(ax - bx) > 180 && !(Math.abs(ax) >= 179.99 && Math.abs(bx) >= 179.99)) {
        // walk east off one edge and on at the other; the crossing
        // latitude is linear in the unwrapped longitude
        const side = ax > 0 ? 180 : -180;
        const bu = bx + (ax > 0 ? 360 : -360);      // b unwrapped onto a's side
        const f = (side - ax) / (bu - ax);
        const lat = ay + (by - ay) * f;
        cur.push(side, lat);
        if (first === null && pieces.length === 0) first = cur; else pieces.push(cur);
        cur = [-side, lat];
      }
    }
    // the walk began inside a piece; its tail is the head of `first`
    if (first) { for (let i = 0; i < first.length; i++) cur.push(first[i]); }
    pieces.push(cur);
    return pieces.filter(p => p.length >= 6);
  }

  function prepTier(src) {
    const t0 = performance.now();
    const out = { res: src.res, countries: [], verts: 0, rings: 0 };
    for (const c of src.countries) {
      const rings = [];
      for (const raw of c.rings) {
        for (const piece of splitSeam(raw)) {
          if (piece.length < 6) continue;
          const r = prepRing(piece);
          rings.push(r);
          out.verts += r.n; out.rings++;
        }
      }
      if (!rings.length) continue;
      const lo = c.label ? c.label[0] : 0, la = c.label ? c.label[1] : 0;
      out.countries.push({
        name: c.name, iso: c.iso, area: c.area || 0, rings,
        lon: lo, lat: la,
        lx: flatX(lo), ly: flatY(la),
        lvx: Math.cos(la * D2R) * Math.cos(lo * D2R),
        lvy: Math.cos(la * D2R) * Math.sin(lo * D2R),
        lvz: Math.sin(la * D2R),
        node: null, label: null
      });
    }
    // labels are drawn largest-first so the overlap reject below keeps
    // the country a reader is most likely to be looking for
    out.countries.sort((a, b) => b.area - a.area);
    out.prepMs = performance.now() - t0;
    return out;
  }

  // ============================================================
  // the camera
  // ============================================================
  //
  // One representation: the geographic point at the centre of the frame,
  // and a zoom. There is no separate pan translate. That is the whole
  // reason the spin/pan crossover in §7 is continuous rather than a
  // switch — spinning the earth and panning the chart are the same
  // operation on (lon, lat) with two different sensitivities, and a
  // blend of two sensitivities is a sensitivity. A build that carried
  // (lon0, lat0) for the globe AND a translate for the chart has to
  // decide, somewhere, which one a drag moves; wherever that decision
  // goes, it is a seam the player can feel.
  //
  // The cost is that zoom-about-cursor has to solve for a new centre
  // rather than adjust a translate. At t == 1 that is closed form
  // (below). At t == 0 it is a pull along the great circle toward the
  // point under the cursor, which is what a globe camera does anyway.

  // How much of the world the frame is actually showing, in viewBox
  // units. NOT simply 0,0–1000,760: the svg is xMidYMid meet, so
  // whatever slack is left on the wider axis shows MORE world than the
  // viewBox asked for. This is map.js's visibleBox and it is here for
  // the same reason — the zoom floor has to be computed per frame, not
  // written down, or it is tuned against one window shape and wrong on
  // every other. A zero-size rect is not a small frame, it is no answer
  // at all (mid-layout, or a tab that is not being rendered), so the
  // last real measurement is kept and reused.
  function visibleBox() {
    const r = svg.getBoundingClientRect();
    if (!r.width || !r.height) return lastVis;
    const s = Math.min(r.width / VW, r.height / VH);
    const w = r.width / s, h = r.height / s;
    lastVis = { x: (VW - w) / 2, y: (VH - h) / 2, w, h };
    return lastVis;
  }

  // degrees of the world across the wider axis of the frame. x and y
  // have different units per degree, so both are converted before the
  // max is taken — otherwise a wide short window reports an arc from its
  // narrow axis and morphs at the wrong altitude.
  function arcDeg(vis, k) {
    return Math.max(vis.w / DEG_X, vis.h / DEG_Y) / k;
  }

  // the widest the frame can open before it is showing more than a globe
  // plus its margin
  function minZoom(vis) {
    return GLOBE_FIT * Math.min(vis.w, vis.h) / (2 * R);
  }

  function smoothstep(a, b, x) {
    const u = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return u * u * (3 - 2 * u);
  }

  // t == 0 at a wide arc, 1 at a tight one; the arc runs the other way
  // from t, hence the flip
  function morphT(arc) { return 1 - smoothstep(MORPH_TIGHT, MORPH_WIDE, arc); }

  function wrapLon(l) {
    l = (l + 180) % 360;
    return (l < 0 ? l + 360 : l) - 180;
  }

  // Pull the camera back inside what there is to look at. One choke
  // point, so wheel, drag, pinch, the buttons, the keyboard and reset
  // are all covered by one rule — map.js's argument, and it holds harder
  // here because there are five gestures rather than four.
  function clampCam(vis) {
    cam.k = Math.min(MAX_ZOOM, Math.max(minZoom(vis), cam.k));
    const t = morphT(arcDeg(vis, cam.k));

    // Latitude. On the globe the limit is the spin clamp from §7 — the
    // pole must not tip past the top of the frame. On the chart the
    // limit is the frame's own half-height, so the view stops at the
    // pole instead of running off the top of the world into nothing.
    // Blended on the same t as everything else, so there is no step
    // where one rule hands over to the other.
    const halfLat = (vis.h / 2) / (cam.k * DEG_Y);
    const chartLim = Math.max(0, 90 - halfLat);
    const lim = (1 - t) * LAT_SPIN_CLAMP + t * chartLim;
    cam.lat = Math.min(lim, Math.max(-lim, cam.lat));

    // Longitude. The globe wraps — spinning past the seam is the whole
    // gesture. The chart does not: §2 puts the seam in the empty Pacific
    // and the flat world genuinely ends there, so the frame stops
    // against it the way map.js's frame stops against its crop. The
    // limit opens up to a full 180 as t falls, so the stop dissolves
    // rather than releasing.
    const halfLon = (vis.w / 2) / (cam.k * DEG_X);
    const lonLim = 180 - t * Math.min(halfLon, 179);
    cam.lon = wrapLon(cam.lon);
    if (cam.lon > lonLim) cam.lon = lonLim;
    if (cam.lon < -lonLim) cam.lon = -lonLim;
    return t;
  }

  // ---- gestures ----

  // Drag. dx/dy arrive in viewBox units; px/py are the same delta in
  // projection units, which is the space both mappings work in.
  //
  // The two mappings are nearly the same function, which is why the
  // crossover has nothing to hide. Vertically they are IDENTICAL
  // (DEG_Y === R·π/180 — see the identities at the top), so a vertical
  // drag needs no blend at all and gets none. Horizontally they differ
  // by cos(lat)/cos(28°): equal at the standard parallel, 13% apart at
  // the equator, 76% apart at 60N. That difference is the only thing the
  // blend is resolving.
  function dragBy(dx, dy, t) {
    const px = dx / cam.k, py = dy / cam.k;
    const cosLat = Math.max(SPIN_COS_FLOOR, Math.cos(cam.lat * D2R));
    const spinLon = -(px / (R * cosLat)) * R2D;
    const panLon = -px / DEG_X;
    cam.lon = wrapLon(cam.lon + (1 - t) * spinLon + t * panLon);
    cam.lat += py / DEG_Y;                       // identical at both ends
    invalidate();
  }

  // Inverse orthographic — the point on the sphere under a projection
  // point. Used only by zoom-about-cursor at globe scale, and only for
  // the direction of the pull, so a cursor outside the disc is not an
  // error: it means "no target", and the caller falls back to zooming
  // about the centre.
  function unprojGlobe(px, py) {
    const rho = Math.hypot(px, py);
    if (rho > R) return null;
    if (rho < 1e-6) return { lon: cam.lon, lat: cam.lat };
    const c = Math.asin(rho / R);
    const sc = Math.sin(c), cc = Math.cos(c);
    const p0 = cam.lat * D2R, up = -py;          // svg y grows down
    const lat = Math.asin(cc * Math.sin(p0) + (up * sc * Math.cos(p0)) / rho);
    const lon = cam.lon + Math.atan2(px * sc, rho * cc * Math.cos(p0) - up * sc * Math.sin(p0)) * R2D;
    return { lon: wrapLon(lon), lat: lat * R2D };
  }

  // Zoom about a point, given in viewBox coordinates.
  //
  // Two exact answers blended on t rather than one approximate one.
  //
  // At t == 1 the projection is flat space translated, so keeping a
  // point under the cursor is algebra: screen = centre + k·(flat(P) −
  // flat(C)) gives flat(C') = flat(C) + (cursor − centre)·(1/k − 1/k').
  // Exact, and this is the end of the range where it matters — a player
  // at chart scale is zooming at something specific and will notice a
  // pixel of drift.
  //
  // At t == 0 there is no translate to solve for, so the camera walks a
  // fraction of the way toward the point under the cursor along lon/lat.
  // The fraction is 1 − k/k', which is the same fraction of the frame
  // the zoom just removed — so the point converges on the centre at the
  // rate the zoom converges on it. That is the Google Earth gesture, and
  // it is what a globe wants anyway: you are not sliding a chart, you
  // are flying somewhere.
  function zoomAt(cx, cy, factor) {
    const vis = visibleBox();
    const k0 = cam.k;
    const nk = Math.min(MAX_ZOOM, Math.max(minZoom(vis), k0 * factor));
    if (nk === k0) return;
    const t = morphT(arcDeg(vis, k0));
    const ox = cx - VW / 2, oy = cy - VH / 2;    // cursor, relative to the centre

    // chart half: exact
    const s = (1 / k0 - 1 / nk);
    let dLonFlat = (ox * s) / DEG_X, dLatFlat = -(oy * s) / DEG_Y;

    // globe half: pull toward whatever is under the cursor
    let dLonGlobe = 0, dLatGlobe = 0;
    if (t < 1) {
      const p = unprojGlobe(ox / k0, oy / k0);
      if (p) {
        const pull = Math.max(0, 1 - k0 / nk);
        let dl = p.lon - cam.lon;
        if (dl > 180) dl -= 360; else if (dl < -180) dl += 360;
        dLonGlobe = dl * pull; dLatGlobe = (p.lat - cam.lat) * pull;
      }
    }
    cam.lon = wrapLon(cam.lon + (1 - t) * dLonGlobe + t * dLonFlat);
    cam.lat += (1 - t) * dLatGlobe + t * dLatFlat;
    cam.k = nk;
    invalidate();
  }

  // ============================================================
  // the horizon clip (§3)
  // ============================================================
  //
  // While t < 1, geometry with cosc < 0 is on the far side of the earth.
  // Culling those vertices one at a time is the obvious thing and it is
  // wrong: the ring survives with its far-side vertices simply missing,
  // so the two neighbours of a removed run join up and the polygon takes
  // a chord straight across the disc. Africa grows a flat edge as it
  // rotates off the limb, and the edge moves.
  //
  // So this is a real clip: Sutherland–Hodgman against the half-space
  // cosc >= 0, with the crossings interpolated ON THE SPHERE (lerp the
  // two 3D unit vectors and renormalise — cosc is linear in the vector,
  // so the lerp parameter cA/(cA−cB) lands exactly on the great circle,
  // and normalising cannot move a zero) and the gap closed by a slerp
  // ALONG the limb rather than a chord across it. A chord there is the
  // same bug one level up: the coastline is right and the closing edge
  // cuts the corner off the disc.
  //
  // At t == 1 the clip is off and ordinary viewport rejection takes
  // over. There is no pop at the handover: t reaches 1 at a 24° arc,
  // where the limb is 90° away and several frame widths off screen.

  // scratch, reused every ring every frame — see §8, no per-point objects
  let dbuf = [];

  function pushPt(x, y) {
    dbuf.push(Math.round(x * 10) / 10, Math.round(y * 10) / 10);
  }

  // Frame of the current camera, rebuilt once per draw.
  //
  // fx0/fy0 is the recentring §3 asks for — the flat coordinates of the
  // camera centre, subtracted so the two projections share an origin.
  // px0/py0 is the same number for everything drawn INSIDE the camera
  // group, and it is zero in chart mode: there the paths hold absolute
  // flat coordinates and the group's own transform carries the
  // recentring. Two names rather than one because labels live outside
  // that group in screen space and always want the recentred form; a
  // single fx0 read by both was the first bug in this file, and it looks
  // exactly like a graticule offset by half the world.
  const F = { vx: 0, vy: 0, vz: 0, ex: 0, ey: 0, ez: 0, nx: 0, ny: 0, nz: 0,
              fx0: 0, fy0: 0, px0: 0, py0: 0, rx0: 0, t: 0, ot: 0 };

  // ---- which way round the world (§2's seam, from the camera's side) ----
  //
  // The flat projection lays the world out once, from 180W to 180E, and
  // ends. So a ring at 179W is 358 degrees of flat map away from a camera
  // at 179E — and while t is between 0 and 1 that ring is drawn 358
  // degrees away, which is off the frame, which is Chukotka and the
  // eastern half of Fiji simply missing from a chart that is otherwise
  // showing the dateline.
  //
  // The fix is not to move the seam: §2 fixes it in the empty Pacific and
  // geodata.js is authored against that. It is to notice that the
  // RECENTRED flat projection has no reason to prefer one representative
  // of a longitude over another. Each ring is placed at whichever of
  // lon, lon+360 or lon-360 is nearest the camera, as a whole — per ring
  // and never per vertex, because a ring with some vertices wrapped and
  // some not is the horizontal scar this exists to prevent, drawn one
  // level further down.
  //
  // At t == 1 this stops mattering: the longitude clamp has the frame's
  // own edge exactly on the seam by then, so there is nothing past it to
  // fetch. The two rules meet there rather than handing over.
  function wrapOrigin(lon) {
    let d = lon - cam.lon;
    if (d > 180) d -= 360; else if (d < -180) d += 360;
    return F.px0 - ((cam.lon + d) - lon) * DEG_X;
  }

  function setFrame(t, chart) {
    const l = cam.lon * D2R, p = cam.lat * D2R;
    const cp = Math.cos(p), sp = Math.sin(p), cl = Math.cos(l), sl = Math.sin(l);
    F.vx = cp * cl; F.vy = cp * sl; F.vz = sp;      // centre
    F.ex = -sl; F.ey = cl; F.ez = 0;                // east
    F.nx = -sp * cl; F.ny = -sp * sl; F.nz = cp;    // north
    F.fx0 = flatX(cam.lon); F.fy0 = flatY(cam.lat);
    F.px0 = chart ? 0 : F.fx0; F.py0 = chart ? 0 : F.fy0;
    F.rx0 = F.px0;
    F.t = t; F.ot = 1 - t;
  }

  // project a stored vertex (index j of ring r) into recentred
  // projection space. Thirteen multiplies; no trigonometry.
  function projIdx(r, j, out) {
    const x = r.vx[j], y = r.vy[j], z = r.vz[j];
    out[0] = F.ot * (R * (x * F.ex + y * F.ey + z * F.ez)) + F.t * (r.fx[j] - F.rx0);
    out[1] = F.ot * (-R * (x * F.nx + y * F.ny + z * F.nz)) + F.t * (r.fy[j] - F.py0);
  }

  // project an arbitrary unit vector, which needs its lon/lat back for
  // the flat half. Only crossings and limb arcs come through here — a
  // handful of points a ring — so the trig is affordable.
  function projVec(x, y, z, out) {
    const ox = R * (x * F.ex + y * F.ey + z * F.ez);
    const oy = -R * (x * F.nx + y * F.ny + z * F.nz);
    if (F.t === 0) { out[0] = ox; out[1] = oy; return; }
    const lat = Math.asin(Math.max(-1, Math.min(1, z))) * R2D;
    const lon = Math.atan2(y, x) * R2D;
    out[0] = F.ot * ox + F.t * (flatX(lon) - F.rx0);
    out[1] = F.ot * oy + F.t * (flatY(lat) - F.py0);
  }

  const _p = [0, 0], _p2 = [0, 0];
  let pz = 0;                 // z of the previous graticule sample; see strand()
  // the three points a clip pass has to remember: where the ring left
  // the visible hemisphere, and where it first came back
  const _exit = [0, 0, 0], _entry = [0, 0, 0], _x3 = [0, 0, 0];

  function crossing(r, i, j, ci, cj, out) {
    const u = ci / (ci - cj);
    let x = r.vx[i] + (r.vx[j] - r.vx[i]) * u;
    let y = r.vy[i] + (r.vy[j] - r.vy[i]) * u;
    let z = r.vz[i] + (r.vz[j] - r.vz[i]) * u;
    const m = Math.hypot(x, y, z) || 1;
    out[0] = x / m; out[1] = y / m; out[2] = z / m;
  }

  // walk the limb from a to b the short way. The limb is the great
  // circle perpendicular to the camera centre, so a and b are both unit
  // vectors in that plane and a slerp between them stays on it.
  function limbArc(a, b) {
    let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    d = Math.max(-1, Math.min(1, d));
    const g = Math.acos(d);
    if (g < 0.02) return;                        // under a degree: the chord is the arc
    const steps = Math.min(64, Math.ceil(g / 0.045));   // ~2.5° a segment
    const sg = Math.sin(g);
    for (let s = 1; s < steps; s++) {
      const u = s / steps;
      const w1 = Math.sin((1 - u) * g) / sg, w2 = Math.sin(u * g) / sg;
      projVec(a[0] * w1 + b[0] * w2, a[1] * w1 + b[1] * w2, a[2] * w1 + b[2] * w2, _p);
      pushPt(_p[0], _p[1]);
    }
  }

  // append one ring to dbuf, clipped to the visible hemisphere.
  // Returns false if nothing survived.
  function clipRing(r) {
    const n = r.n;
    const start = dbuf.length;
    let pending = false, haveEntry = false;
    let cPrev = r.vx[0] * F.vx + r.vy[0] * F.vy + r.vz[0] * F.vz;
    for (let i = 0; i < n; i++) {
      const j = i + 1 === n ? 0 : i + 1;
      const ci = cPrev;
      const cj = r.vx[j] * F.vx + r.vy[j] * F.vy + r.vz[j] * F.vz;
      cPrev = cj;
      if (ci >= 0) {
        projIdx(r, i, _p); pushPt(_p[0], _p[1]);
        if (cj < 0) {
          crossing(r, i, j, ci, cj, _x3);
          projVec(_x3[0], _x3[1], _x3[2], _p); pushPt(_p[0], _p[1]);
          _exit[0] = _x3[0]; _exit[1] = _x3[1]; _exit[2] = _x3[2];
          pending = true;
        }
      } else if (cj >= 0) {
        crossing(r, i, j, ci, cj, _x3);
        if (pending) { limbArc(_exit, _x3); pending = false; }
        else if (!haveEntry) { _entry[0] = _x3[0]; _entry[1] = _x3[1]; _entry[2] = _x3[2]; haveEntry = true; }
        projVec(_x3[0], _x3[1], _x3[2], _p); pushPt(_p[0], _p[1]);
      }
    }
    // the ring began outside and ended outside: close the last gap
    if (pending && haveEntry) limbArc(_exit, _entry);
    return dbuf.length >= start + 6;   // three points or it is not a polygon
  }

  // ============================================================
  // rejection tests (§8)
  // ============================================================

  // Entirely on the far side. cos of the angle to the cap centre against
  // cos(90° + capRadius) = −sin(capRadius). Exact, one dot product.
  function behindHorizon(r) {
    const d = r.vx0;
    return d < -r.capSin;
  }

  // A conservative screen box for a ring at the current t. The flat half
  // is exact (the projection is linear in lon/lat). The orthographic
  // half uses the fact that ortho is a linear map of the unit vector
  // scaled by R and is therefore 1-Lipschitz: every vertex projects
  // within R·capRadius of the cap centre's projection. Rigorous in both
  // halves, so nothing can pop.
  function ringOffscreen(r, vis) {
    const rad = R * Math.acos(Math.max(-1, Math.min(1, r.capCos)));
    const ocx = R * (r.cx * F.ex + r.cy * F.ey + r.cz * F.ez);
    const ocy = -R * (r.cx * F.nx + r.cy * F.ny + r.cz * F.nz);
    const x0 = F.ot * (ocx - rad) + F.t * (r.bx0 - F.fx0);
    const x1 = F.ot * (ocx + rad) + F.t * (r.bx1 - F.fx0);
    const y0 = F.ot * (ocy - rad) + F.t * (r.by0 - F.fy0);
    const y1 = F.ot * (ocy + rad) + F.t * (r.by1 - F.fy0);
    const sx0 = VW / 2 + cam.k * x0, sx1 = VW / 2 + cam.k * x1;
    const sy0 = VH / 2 + cam.k * y0, sy1 = VH / 2 + cam.k * y1;
    return sx1 < vis.x || sx0 > vis.x + vis.w || sy1 < vis.y || sy0 > vis.y + vis.h;
  }

  // ============================================================
  // the graticule (§6)
  // ============================================================
  //
  // Generated in code, never in data — it is a statement about the
  // projection, not about the world, and a data file of it would go
  // stale the first time the projection changed. It is also the single
  // strongest cue that the thing on screen is a sphere, so it runs
  // through the same projector and the same clip as the coastlines; a
  // graticule drawn as straight lines over a curved globe reads as a
  // rendering bug rather than as a grid.
  //
  // Densified adaptively: on the globe a meridian is a curve and wants a
  // point every 3°, on the chart it is a straight line and wants two.
  // Interpolating the step on t saves ~2,700 points a frame at chart
  // scale for exactly no visual difference.
  const GRAT_STEP = 15;

  function buildGraticule(t) {
    dbuf.length = 0;
    const dens = 3 + t * 57;                      // 3° on the globe, 60° flat
    const chart = t >= 1;
    for (let lon = -180; lon < 180; lon += GRAT_STEP) {
      F.rx0 = chart ? 0 : wrapOrigin(lon);
      strand(lon, lon, -80, 80, dens, true, chart);
    }
    // A parallel already spans the whole world, so it has no near side to
    // be fetched to and wrapping one would cut it in half at the seam.
    F.rx0 = F.px0;
    for (let lat = -75; lat <= 75; lat += GRAT_STEP) {
      strand(-180, 180, lat, lat, dens, false, chart);
    }
    return dbuf.length ? fmt() : '';
  }

  // one meridian or parallel, broken into visible runs. Open polylines,
  // so no limb closing: a graticule strand that vanished behind the
  // earth simply stops.
  function strand(lon0, lon1, lat0, lat1, dens, meridian, chart) {
    const span = meridian ? (lat1 - lat0) : (lon1 - lon0);
    const steps = Math.max(1, Math.ceil(span / dens));
    let open = false;
    let px = 0, py = 0, pc = 0, first = true;
    for (let s = 0; s <= steps; s++) {
      const u = s / steps;
      const lon = meridian ? lon0 : lon0 + (lon1 - lon0) * u;
      const lat = meridian ? lat0 + (lat1 - lat0) * u : lat0;
      const la = lat * D2R, lo = lon * D2R, cl = Math.cos(la);
      const x = cl * Math.cos(lo), y = cl * Math.sin(lo), z = Math.sin(la);
      const c = chart ? 1 : x * F.vx + y * F.vy + z * F.vz;
      projVec(x, y, z, _p);
      if (c >= 0) {
        if (!open) {
          // step back to the crossing so the strand ends on the limb
          // rather than a whole segment short of it
          if (!first && pc < 0) {
            const u2 = pc / (pc - c);
            let ix = px + (x - px) * u2, iy = py + (y - py) * u2, iz = pz + (z - pz) * u2;
            const m = Math.hypot(ix, iy, iz) || 1;
            projVec(ix / m, iy / m, iz / m, _p2);
            dbuf.push('M', Math.round(_p2[0] * 10) / 10, Math.round(_p2[1] * 10) / 10, 'L');
          } else {
            dbuf.push('M', Math.round(_p[0] * 10) / 10, Math.round(_p[1] * 10) / 10, 'L');
          }
          open = true;
        }
        dbuf.push(Math.round(_p[0] * 10) / 10, Math.round(_p[1] * 10) / 10);
      } else if (open) {
        open = false;
      }
      px = x; py = y; pz = z; pc = c; first = false;
    }
  }

  function fmt() { return dbuf.join(' '); }

  // ============================================================
  // labels (§6)
  // ============================================================
  //
  // Thinned by area against the arc the frame spans, then rejected
  // against each other so a cluster of small countries does not render
  // as a smear. Both halves are needed: area alone puts Belgium,
  // Netherlands and Luxembourg on top of each other the moment they
  // qualify, and overlap-rejection alone lets the first small country in
  // reading order win over the one a reader was looking for. Largest
  // first, so the loser of a collision is the smaller country.
  //
  // The threshold is area in km² and falls as the square-ish of the arc:
  // at a 180° frame only the eight continental states qualify, at 25°
  // roughly everything down to Belgium, at 5° everything. Tuned by eye
  // against the shape of the count rather than against any one country.
  // LABEL_REF is the arc the base threshold is calibrated at, and the arc
  // is CLAMPED to it before the ratio is taken. Without the clamp a tall
  // narrow window opens at a 330 degree arc rather than 240, the
  // threshold goes to 11.6 million km2, and the fully-zoomed-out globe —
  // the first thing anybody sees — carries two labels. There is no more
  // world to show past a hemisphere, so there is nothing for the
  // threshold to keep rising against.
  const LABEL_BASE = 3.0e6, LABEL_POW = 2.2, LABEL_MAX = 90, LABEL_REF = 180;

  // Sea labels are hand-written here rather than carried in the data
  // file: an ocean has no polygon, its name belongs to a region of the
  // chart and not to a feature, and the band it lives in is a rendering
  // decision. `band` is [tightest arc, widest arc] in degrees.
  const SEAS = [
    { n: 'PACIFIC OCEAN', lon: -150, lat: 5, band: [40, 400] },
    { n: 'ATLANTIC OCEAN', lon: -30, lat: 10, band: [30, 400] },
    { n: 'INDIAN OCEAN', lon: 78, lat: -25, band: [30, 400] },
    { n: 'SOUTHERN OCEAN', lon: 40, lat: -62, band: [40, 400] },
    { n: 'ARCTIC OCEAN', lon: 20, lat: 84, band: [40, 400] },
    { n: 'NORTH ATLANTIC', lon: -40, lat: 45, band: [12, 60] },
    { n: 'SOUTH ATLANTIC', lon: -20, lat: -30, band: [12, 60] },
    { n: 'MEDITERRANEAN', lon: 17, lat: 34.5, band: [4, 40] },
    { n: 'ARABIAN SEA', lon: 63, lat: 15, band: [4, 40] },
    { n: 'BAY OF BENGAL', lon: 88, lat: 15, band: [4, 30] },
    { n: 'SOUTH CHINA SEA', lon: 114, lat: 13, band: [4, 30] },
    { n: 'CARIBBEAN SEA', lon: -75, lat: 15, band: [3, 26] },
    { n: 'GULF OF MEXICO', lon: -91, lat: 25, band: [3, 24] },
    { n: 'NORTH SEA', lon: 3.5, lat: 56, band: [2, 18] },
    { n: 'BLACK SEA', lon: 34, lat: 43, band: [2, 18] },
    { n: 'RED SEA', lon: 38.5, lat: 20, band: [2, 16] },
    { n: 'CASPIAN SEA', lon: 51, lat: 41.5, band: [2, 16] },
    { n: 'PERSIAN GULF', lon: 51.5, lat: 27, band: [1, 14] },
    { n: 'GULF OF OMAN', lon: 58.5, lat: 24.5, band: [1, 10] },
    { n: 'STRAIT OF HORMUZ', lon: 56.4, lat: 26.6, band: [0, 9] }
  ];

  // Natural Earth abbreviates most long names already ("Dem. Rep. Congo",
  // "Bosnia and Herz."), and where it does its form is kept. These are
  // the ones it leaves at full length that are also big enough to be
  // drawn early: at 13px with 2.4px of tracking, UNITED STATES OF AMERICA
  // is 245 viewBox units of label — a quarter of the frame — and because
  // labels are placed largest-first it does not lose the collision, it
  // WINS it, and takes Canada and Mexico off the map with it. A shorter
  // name is the fix; suppressing the long one would be deleting the
  // country most likely to be looked for.
  const SHORT_NAME = {
    'United States of America': 'UNITED STATES',
    'United Arab Emirates': 'U.A.E.',
    'Papua New Guinea': 'PAPUA NEW GUINEA',
    'Fr. S. Antarctic Lands': 'FR. S. ANTARCTIC',
    'Bosnia and Herz.': 'BOSNIA',
    'Central African Rep.': 'CENTRAL AFR. REP.',
    'Dominican Rep.': 'DOMINICAN REP.',
    'Solomon Is.': 'SOLOMON IS.',
    'Eq. Guinea': 'EQ. GUINEA'
  };

  // screen boxes of the labels already placed this frame
  const taken = [];

  function tryPlace(sx, sy, text, size, sp) {
    // monospace: an advance of about 0.6em, plus the tracking. Close
    // enough — this is a collision test, not typesetting.
    const w = text.length * (size * 0.6 + sp), h = size * 1.35;
    const x0 = sx - w / 2, x1 = sx + w / 2, y0 = sy - h / 2, y1 = sy + h / 2;
    for (let i = 0; i < taken.length; i++) {
      const b = taken[i];
      if (x0 < b[2] && x1 > b[0] && y0 < b[3] && y1 > b[1]) return false;
    }
    taken.push([x0, y0, x1, y1]);
    return true;
  }

  // ============================================================
  // drawing
  // ============================================================

  const _lp = [0, 0];

  function draw() {
    const t0 = performance.now();
    const vis = visibleBox();
    const t = clampCam(vis);
    const chart = t >= 1;
    setFrame(t, chart);
    const arc = arcDeg(vis, cam.k);

    // ---- the camera transform ----
    // Two conventions, and the difference is the whole performance
    // story. In chart mode the projection is a fixed linear map of
    // lon/lat, so the paths hold ABSOLUTE flat coordinates, are built
    // once per tier and never rebuilt; panning and zooming are one
    // transform write. In globe mode the projection depends on the
    // camera, so the paths hold recentred blended coordinates and are
    // rebuilt every frame that moves. The transform below is what makes
    // the two agree pixel for pixel at the handover: in chart mode it
    // carries the recentring the coordinates no longer do.
    if (chart) {
      camG.setAttribute('transform',
        `translate(${(VW / 2 - cam.k * F.fx0).toFixed(2)},${(VH / 2 - cam.k * F.fy0).toFixed(2)}) scale(${cam.k})`);
    } else {
      camG.setAttribute('transform', `translate(${VW / 2},${VH / 2}) scale(${cam.k})`);
    }

    // ---- space, atmosphere, the edge of the world ----
    // The disc is drawn as a plain circle in orthographic radius rather
    // than as a projected limb, and that is exact rather than lazy: the
    // limb is 90° from the camera, so it is only inside the frame while
    // k·R is smaller than the frame's half-diagonal — which happens at
    // an arc of about 100°, and the morph has not started at 100°. By
    // the time t is nonzero the horizon is several frame widths off
    // screen. Drawing it as a projected polyline instead would buy
    // nothing and would have to be split at the antimeridian, which for
    // a ring that encircles a pole cannot be done.
    const edge = 1 - smoothstep(0, 0.18, t);
    if (edge > 0.001) {
      const rr = cam.k * R;
      spaceEl.style.opacity = edge;
      discEl.setAttribute('r', rr.toFixed(1));
      discEl.style.opacity = 1;
      atmoEl.setAttribute('r', (rr * 1.13).toFixed(1));
      atmoEl.style.opacity = edge;
    } else {
      spaceEl.style.opacity = 0;
      discEl.style.opacity = 0;
      atmoEl.style.opacity = 0;
    }

    // ---- countries ----
    let drawn = 0, verts = 0;
    if (chart) {
      // static: build once per tier, then never touch the DOM again
      if (chartBuiltFor !== tier) { buildChartPaths(); chartBuiltFor = tier; }
      drawn = tier.countries.length; verts = tier.verts;
    } else {
      chartBuiltFor = null;
      for (const c of tier.countries) {
        dbuf.length = 0;
        let any = false;
        for (const r of c.rings) {
          r.vx0 = r.cx * F.vx + r.cy * F.vy + r.cz * F.vz;   // cos to the cap centre
          if (behindHorizon(r)) continue;
          if (ringOffscreen(r, vis)) continue;
          const whollyFront = r.vx0 > r.capSin;
          F.rx0 = wrapOrigin(r.lonMid);   // see wrapOrigin — per ring, never per vertex
          const at = dbuf.length;
          dbuf.push('M');
          if (whollyFront) {
            for (let j = 0; j < r.n; j++) { projIdx(r, j, _p); pushPt(_p[0], _p[1]); }
            verts += r.n;
          } else if (!clipRing(r)) {
            dbuf.length = at; continue;
          } else {
            verts += r.n;
          }
          dbuf.push('Z');
          any = true;
        }
        const d = any ? fmt() : '';
        if (c._d !== d) { c.node.setAttribute('d', d); c._d = d; }
        if (any) drawn++;
      }
    }

    // ---- graticule ----
    const gd = buildGraticule(t);
    if (gratEl._d !== gd) { gratEl.setAttribute('d', gd); gratEl._d = gd; }
    // Strongest on the globe, where it is the whole cue that the thing
    // is a sphere, and nearly gone at the bottom of the zoom, where a
    // 15° grid is one stray stroke across the frame and reads as a
    // rendering artefact rather than as a grid.
    gratEl.style.opacity = (0.10 + 0.50 * smoothstep(4, 16, arc)).toFixed(3);

    drawLabels(vis, arc, chart);

    const ms = performance.now() - t0;
    times.push(ms); if (times.length > 120) times.shift();
    if (hudEl) hud(arc, t, ms, drawn, verts);
    maybeLod(arc);
  }

  // ---- labels ----
  function drawLabels(vis, arc, chart) {
    taken.length = 0;
    const thresh = LABEL_BASE * Math.pow(Math.min(arc, LABEL_REF) / LABEL_REF, LABEL_POW);
    const size = 13, sp = 2.4;
    let used = 0;
    const pad = 30;

    for (const c of tier.countries) {
      const el = c.label;
      let show = false;
      if (c.area >= thresh && used < LABEL_MAX) {
        // behind the earth?
        const cc = chart ? 1 : c.lvx * F.vx + c.lvy * F.vy + c.lvz * F.vz;
        if (cc >= 0.02) {
          if (chart) {
            _lp[0] = c.lx - F.fx0; _lp[1] = c.ly - F.fy0;
          } else {
            const rx = wrapOrigin(c.lon);   // the name follows its country round the seam
            _lp[0] = F.ot * (R * (c.lvx * F.ex + c.lvy * F.ey + c.lvz * F.ez)) + F.t * (c.lx - rx);
            _lp[1] = F.ot * (-R * (c.lvx * F.nx + c.lvy * F.ny + c.lvz * F.nz)) + F.t * (c.ly - F.fy0);
          }
          const sx = VW / 2 + cam.k * _lp[0], sy = VH / 2 + cam.k * _lp[1];
          if (sx > vis.x - pad && sx < vis.x + vis.w + pad && sy > vis.y - pad && sy < vis.y + vis.h + pad
            && tryPlace(sx, sy, el.textContent, size, sp)) {
            el.setAttribute('x', sx.toFixed(1));
            el.setAttribute('y', sy.toFixed(1));
            show = true; used++;
          }
        }
      }
      if (el._on !== show) { el.style.display = show ? '' : 'none'; el._on = show; }
    }

    for (const s of SEAS) {
      const el = s.el;
      let show = false;
      if (arc >= s.band[0] && arc <= s.band[1]) {
        const cc = chart ? 1 : s.vx * F.vx + s.vy * F.vy + s.vz * F.vz;
        if (cc >= 0.05) {
          const px = F.ot * (R * (s.vx * F.ex + s.vy * F.ey + s.vz * F.ez)) + F.t * (s.fx - (chart ? F.fx0 : wrapOrigin(s.lon)));
          const py = F.ot * (-R * (s.vx * F.nx + s.vy * F.ny + s.vz * F.nz)) + F.t * (s.fy - F.fy0);
          const sx = VW / 2 + cam.k * px, sy = VH / 2 + cam.k * py;
          if (sx > vis.x && sx < vis.x + vis.w && sy > vis.y && sy < vis.y + vis.h
            && tryPlace(sx, sy, s.n, 11, 2)) {
            el.setAttribute('x', sx.toFixed(1)); el.setAttribute('y', sy.toFixed(1));
            show = true;
          }
        }
      }
      if (el._on !== show) { el.style.display = show ? '' : 'none'; el._on = show; }
    }
  }

  // ---- chart mode: one build, absolute flat coordinates ----
  function buildChartPaths() {
    for (const c of tier.countries) {
      dbuf.length = 0;
      for (const r of c.rings) {
        dbuf.push('M');
        for (let j = 0; j < r.n; j++) {
          dbuf.push(Math.round(r.fx[j] * 10) / 10, Math.round(r.fy[j] * 10) / 10);
        }
        dbuf.push('Z');
      }
      const d = fmt();
      c.node.setAttribute('d', d); c._d = null;   // null so globe mode rewrites it
    }
  }

  // ============================================================
  // detail tiers (§5)
  // ============================================================
  //
  // The swap builds a whole new <g> of paths off screen, fills it, and
  // replaces the old one in a single DOM operation, so there is no frame
  // in which the map is half one tier and half the other. Nothing about
  // the camera is touched, which is the other half of "must not move the
  // camera or flash": the camera is (lon, lat, k) and the tier is not in
  // it.
  function maybeLod(arc) {
    if (arc <= LOD_UP_ARC && tier.res === '110m') {
      if (tier50) swapTier(tier50);
      else if (!lodPending) loadFine();
    } else if (arc >= LOD_DOWN_ARC && tier.res === '50m') {
      swapTier(tier110);
    }
  }

  function loadFine() {
    lodPending = true;
    const s = document.createElement('script');
    s.src = 'js/worldgeo-50m.js';
    s.onload = () => {
      lodPending = false;
      if (typeof WORLD_GEO_50M === 'undefined') return;
      tier50 = prepTier(WORLD_GEO_50M);
      buildNodes(tier50);
      // the camera may have walked back out while that was in flight
      const vis = visibleBox();
      if (arcDeg(vis, cam.k) <= LOD_UP_ARC) swapTier(tier50);
    };
    s.onerror = () => { lodPending = false; };   // 110m is a complete map; a missing tier is not an error worth showing
    document.head.appendChild(s);
  }

  function swapTier(next) {
    if (next === tier || !next) return;
    tier = next;
    countriesG.parentNode.replaceChild(next.group, countriesG);
    countriesG = next.group;
    labelsG.parentNode.replaceChild(next.labels, labelsG);
    labelsG = next.labels;
    chartBuiltFor = null;
    for (const c of tier.countries) c._d = undefined;
    invalidate();
  }

  // ============================================================
  // DOM
  // ============================================================

  function buildNodes(t) {
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    const lg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    // the ids ride the new groups across a tier swap: replaceChild drops
    // whatever was on the old node, and a selector written against
    // #countries in the console or a harness must not stop working the
    // moment 50m lands
    g.id = 'countries'; lg.id = 'labels';
    for (const c of t.countries) {
      const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      p.setAttribute('class', 'country');
      p.setAttribute('d', '');
      g.appendChild(p);
      c.node = p;
      const l = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      l.setAttribute('class', 'country-label');
      l.textContent = SHORT_NAME[c.name] || c.name.toUpperCase();
      l.style.display = 'none'; l._on = false;
      lg.appendChild(l);
      c.label = l;
    }
    t.group = g; t.labels = lg;
  }

  function buildSeaNodes(parent) {
    for (const s of SEAS) {
      const la = s.lat * D2R, lo = s.lon * D2R, cl = Math.cos(la);
      s.vx = cl * Math.cos(lo); s.vy = cl * Math.sin(lo); s.vz = Math.sin(la);
      s.fx = flatX(s.lon); s.fy = flatY(s.lat);
      const el = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      el.setAttribute('class', 'sea-label');
      el.textContent = s.n;
      el.style.display = 'none'; el._on = false;
      parent.appendChild(el);
      s.el = el;
    }
  }

  // ============================================================
  // the fixture (§10)
  // ============================================================
  //
  // Not the render path — the real data is. This is a test rig for the
  // two pieces of geometry that need KNOWN input to be checked at all:
  // the horizon clip (does a box leaving the limb close along the great
  // circle, or does it cut the corner?) and the seam split (does a ring
  // written across ±180 come out as two pieces?). Natural Earth arrives
  // pre-cut at the antimeridian, so nothing in the shipped data
  // exercises splitSeam at all — the SEAM box is the only thing that
  // does. Reached with ?fixture on the URL.
  const FIXTURE = {
    res: '110m',
    countries: [
      { name: 'Equator', iso: 'EQU', area: 9e6, label: [0, 0],
        rings: [[-20, -12, 20, -12, 20, 12, -20, 12]] },
      { name: 'Polar', iso: 'POL', area: 8e6, label: [45, 78],
        rings: [[0, 72, 30, 72, 60, 72, 90, 72, 90, 84, 60, 84, 30, 84, 0, 84]] },
      { name: 'Seam', iso: 'SEA', area: 7e6, label: [180, 0],
        rings: [[170, -8, -170, -8, -170, 8, 170, 8]] },
      { name: 'Wide', iso: 'WID', area: 6e6, label: [-60, 40],
        rings: [[-110, 20, -10, 20, -10, 60, -110, 60]] },
      { name: 'Hole', iso: 'HOL', area: 5e6, label: [-60, -40],
        rings: [[-90, -60, -30, -60, -30, -20, -90, -20], [-75, -50, -45, -50, -45, -30, -75, -30]] }
    ]
  };

  // ============================================================
  // frame loop (§8) — reproject only while the camera is moving
  // ============================================================
  function invalidate() {
    dirty = true;
    if (!rafId) rafId = requestAnimationFrame(tick);
  }
  function tick() {
    rafId = 0;
    if (!dirty) return;
    dirty = false;
    draw();
    if (dirty && !rafId) rafId = requestAnimationFrame(tick);
  }

  // ============================================================
  // input
  // ============================================================
  function toSvg(clientX, clientY) {
    const pt = svg.createSVGPoint();
    pt.x = clientX; pt.y = clientY;
    return pt.matrixTransform(svg.getScreenCTM().inverse());
  }

  function initInput() {
    let drag = null;

    svg.addEventListener('wheel', (e) => {
      e.preventDefault();
      const p = toSvg(e.clientX, e.clientY);
      // trackpads deliver many small deltas and mice one large one; the
      // exponent keeps both at the same zoom per gesture rather than the
      // same zoom per event
      const f = Math.pow(1.0016, -Math.max(-160, Math.min(160, e.deltaY)));
      zoomAt(p.x, p.y, f);
    }, { passive: false });

    svg.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch') return;      // touch has its own handler
      svg.setPointerCapture(e.pointerId);
      drag = { x: e.clientX, y: e.clientY };
      svg.classList.add('grabbing');
    });
    svg.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const ctm = svg.getScreenCTM();
      const dx = (e.clientX - drag.x) / ctm.a, dy = (e.clientY - drag.y) / ctm.d;
      drag.x = e.clientX; drag.y = e.clientY;
      dragBy(dx, dy, morphT(arcDeg(visibleBox(), cam.k)));
    });
    const end = () => { drag = null; svg.classList.remove('grabbing'); };
    svg.addEventListener('pointerup', end);
    svg.addEventListener('pointercancel', end);

    // ---- touch ----
    // One finger spins or pans on the same blend as the mouse; two
    // fingers pinch about their midpoint AND carry the midpoint's own
    // travel, because a pinch that ignores the midpoint drifts the map
    // out from under the gesture.
    let tp = null;
    svg.addEventListener('touchstart', (e) => {
      if (e.touches.length === 1) {
        tp = { mode: 1, x: e.touches[0].clientX, y: e.touches[0].clientY };
      } else if (e.touches.length >= 2) {
        const a = e.touches[0], b = e.touches[1];
        tp = { mode: 2, d: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
               x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 };
      }
      e.preventDefault();
    }, { passive: false });
    svg.addEventListener('touchmove', (e) => {
      if (!tp) return;
      e.preventDefault();
      const ctm = svg.getScreenCTM();
      if (tp.mode === 1 && e.touches.length === 1) {
        const dx = (e.touches[0].clientX - tp.x) / ctm.a, dy = (e.touches[0].clientY - tp.y) / ctm.d;
        tp.x = e.touches[0].clientX; tp.y = e.touches[0].clientY;
        dragBy(dx, dy, morphT(arcDeg(visibleBox(), cam.k)));
      } else if (tp.mode === 2 && e.touches.length >= 2) {
        const a = e.touches[0], b = e.touches[1];
        const nd = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
        const mx = (a.clientX + b.clientX) / 2, my = (a.clientY + b.clientY) / 2;
        const dx = (mx - tp.x) / ctm.a, dy = (my - tp.y) / ctm.d;
        if (dx || dy) dragBy(dx, dy, morphT(arcDeg(visibleBox(), cam.k)));
        if (tp.d > 0 && nd > 0) { const p = toSvg(mx, my); zoomAt(p.x, p.y, nd / tp.d); }
        tp.d = nd; tp.x = mx; tp.y = my;
      }
    }, { passive: false });
    const tend = (e) => { if (!e.touches.length) tp = null; else if (e.touches.length === 1)
      tp = { mode: 1, x: e.touches[0].clientX, y: e.touches[0].clientY }; };
    svg.addEventListener('touchend', tend);
    svg.addEventListener('touchcancel', tend);

    // ---- buttons & keys ----
    const btn = (id, fn) => { const el = document.getElementById(id); if (el) el.addEventListener('click', fn); };
    btn('zoom-in', () => zoomAt(VW / 2, VH / 2, 1.35));
    btn('zoom-out', () => zoomAt(VW / 2, VH / 2, 1 / 1.35));
    btn('zoom-reset', reset);

    window.addEventListener('keydown', (e) => {
      const step = 40;
      const t = morphT(arcDeg(visibleBox(), cam.k));
      if (e.key === 'ArrowLeft') dragBy(step, 0, t);
      else if (e.key === 'ArrowRight') dragBy(-step, 0, t);
      else if (e.key === 'ArrowUp') dragBy(0, step, t);
      else if (e.key === 'ArrowDown') dragBy(0, -step, t);
      else if (e.key === '+' || e.key === '=') zoomAt(VW / 2, VH / 2, 1.35);
      else if (e.key === '-' || e.key === '_') zoomAt(VW / 2, VH / 2, 1 / 1.35);
      else if (e.key === '0') reset();
      else return;
      e.preventDefault();
    });

    window.addEventListener('resize', invalidate);
  }

  // The opening view is the game's theater at the centre of a whole
  // globe: 38.5E is geodata.js's own origin meridian, and 24N puts the
  // Gulf a little above the middle of the disc rather than on the
  // equator, which is where the interesting half of the land is.
  //
  // k is set to the measured floor rather than to 0 and left for
  // clampCam to raise on the next frame. A camera is three numbers and
  // anything may read them — stats(), a probe, the next gesture — and
  // k = 0 is a zoom nothing can divide by. Leaving an invalid camera
  // standing between a call and the frame that fixes it is the kind of
  // hole that only ever shows up as a NaN somewhere else.
  function reset() {
    cam.lon = 38.5; cam.lat = 24; cam.k = minZoom(visibleBox());
    invalidate();
  }

  // ?at=lon,lat,zoom — a view is a link. Three numbers is the whole
  // camera (see the note above it), so a deep link needs no encoding and
  // no state: ?at=51.5,26.5,2.4 is the Gulf and ?at=-70,5 is the
  // Americas at whatever zoom the window can hold. Omitting the zoom
  // takes the floor, which is the globe.
  function readHash(q) {
    const a = (q.get('at') || '').split(',').map(Number);
    if (a.length < 2 || !isFinite(a[0]) || !isFinite(a[1])) return;
    cam.lon = wrapLon(a[0]); cam.lat = a[1];
    if (a.length > 2 && isFinite(a[2]) && a[2] > 0) cam.k = a[2];
    invalidate();
  }

  // ============================================================
  // debug readout (?debug) — this is how §8's number was measured
  // ============================================================
  function hud(arc, t, ms, drawn, verts) {
    const sorted = times.slice().sort((a, b) => a - b);
    const med = sorted.length ? sorted[sorted.length >> 1] : 0;
    hudEl.textContent =
      `${tier.res}  arc ${arc.toFixed(1)}°  t ${t.toFixed(3)}  k ${cam.k.toFixed(3)}  ` +
      `${cam.lat.toFixed(1)}N ${cam.lon.toFixed(1)}E   ` +
      `draw ${ms.toFixed(2)}ms (med ${med.toFixed(2)})  ${drawn} shapes / ${verts} pts`;
  }

  // spin the camera for `n` frames and report what it cost. The honest
  // way to answer §8 — an eyeballed "feels smooth" is not a number.
  function bench(n) {
    n = n || 120;
    return new Promise((resolve) => {
      const t0 = performance.now();
      let i = 0;
      const stamps = [];
      const step = () => {
        const a = performance.now();
        cam.lon = wrapLon(cam.lon + 1.5);
        draw();
        stamps.push(performance.now() - a);
        if (++i < n) requestAnimationFrame(step);
        else {
          const wall = performance.now() - t0;
          stamps.sort((x, y) => x - y);
          resolve({
            tier: tier.res, frames: n, wallMs: +wall.toFixed(1),
            fps: +(n / (wall / 1000)).toFixed(1),
            drawMedianMs: +stamps[n >> 1].toFixed(3),
            drawP95Ms: +stamps[Math.floor(n * 0.95)].toFixed(3),
            drawMaxMs: +stamps[n - 1].toFixed(3)
          });
        }
      };
      requestAnimationFrame(step);
    });
  }

  // ============================================================
  function init(opts) {
    opts = opts || {};
    svg = document.getElementById('world');
    camG = document.getElementById('cam');
    spaceEl = document.getElementById('space');
    atmoEl = document.getElementById('atmosphere');
    discEl = document.getElementById('disc');
    gratEl = document.getElementById('graticule');
    countriesG = document.getElementById('countries');
    labelsG = document.getElementById('labels');
    hudEl = opts.hud ? document.getElementById('hud') : null;
    if (opts.hud) document.getElementById('hud').style.display = '';

    const src = opts.fixture ? FIXTURE
      : (typeof WORLD_GEO !== 'undefined' ? WORLD_GEO : FIXTURE);
    tier110 = prepTier(src);
    tier = tier110;
    buildNodes(tier);
    countriesG.parentNode.replaceChild(tier.group, countriesG);
    countriesG = tier.group;
    labelsG.parentNode.replaceChild(tier.labels, labelsG);
    labelsG = tier.labels;
    buildSeaNodes(svg.querySelector('#sea-labels'));

    initInput();
    reset();
    if (opts.at) readHash(opts.at);
    return { verts: tier.verts, rings: tier.rings, countries: tier.countries.length, prepMs: tier.prepMs };
  }

  return {
    init, bench, invalidate, reset,
    // draw this instant rather than on the next frame. invalidate() is
    // what the gestures use and it is the right default — it coalesces a
    // burst of pointermoves into one reprojection. This is for a probe
    // that has to READ the result of a camera move in the same tick it
    // made it, which a scheduled frame cannot give it.
    render: () => draw(),
    // read/drive the camera from the console or a harness
    cam: () => ({ lon: cam.lon, lat: cam.lat, k: cam.k }),
    goto: (lon, lat, k) => { cam.lon = lon; cam.lat = lat; if (k) cam.k = k; invalidate(); },
    stats: () => {
      const vis = visibleBox();
      const arc = arcDeg(vis, cam.k);
      const s = times.slice().sort((a, b) => a - b);
      return {
        tier: tier && tier.res, arc: +arc.toFixed(2), t: +morphT(arc).toFixed(4),
        k: +cam.k.toFixed(4), lon: +cam.lon.toFixed(2), lat: +cam.lat.toFixed(2),
        verts: tier && tier.verts,
        drawMedianMs: s.length ? +s[s.length >> 1].toFixed(3) : null
      };
    },
    MORPH: { wide: MORPH_WIDE, tight: MORPH_TIGHT }
  };
})();
