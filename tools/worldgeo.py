#!/usr/bin/env python3
# ============================================================
# worldgeo.py — generates js/worldgeo.js and js/worldgeo-50m.js
#
# Source: Natural Earth admin-0 countries, 110m and 50m (public domain).
# Fetched as plain GeoJSON from nvkelso/natural-earth-vector, which is the
# same data js/geodata.js was cut from — that matters, because the whole
# point of WORLDMAP-SPEC §2 is that a future merge can drop the game's
# existing target x/y onto this map unchanged, and two different vintages
# of Natural Earth would put the coastline a kilometre off the targets.
#
# NOTHING HERE IS PROJECTED. The output is raw lon/lat, WGS84, decimal
# degrees — the renderer owns the projection because it has to interpolate
# between two of them every frame (spec §3). The only place this file knows
# about the game's equirectangular chart at all is --verify, which projects
# three countries through it purely to check the constants.
#
# Re-runnable and deterministic: same inputs, byte-identical outputs. No
# dict iteration order, no sets, no unseeded anything; countries are sorted
# by (-area, name) and every float goes through one formatter.
#
# Usage:
#   python3 tools/worldgeo.py                 # fetch (cached) and write both tiers
#   python3 tools/worldgeo.py --verify        # re-run the §10 cross-check only
#   python3 tools/worldgeo.py --stats         # what got dropped and why
#
# ---- The two numbers that were chosen rather than derived -----------------
#
# SIMPLIFY: 110m ships unsimplified (tolerance 0). It came in at 125 KB of
# ring data against a 150 KB budget, and it is the tier that draws the globe,
# so there was nothing to buy and a limb artefact to lose.
#
# 50m ships Douglas-Peucker at 0.015 degrees, applied in lon/lat AFTER the
# 2dp rounding so the output stays exactly on the output grid. Unsimplified
# it is 1194 KB against an 800 KB budget; the sweep that picked 0.015 is
#
#     tol      verts    raw KB    gzip KB
#     0        97866    1193.6    ~330
#     0.010    70444     863.2     298.4
#     0.012    65417     802.0     279.0
#     0.014    61316     751.9     263.1
#     0.015    59046     724.3     254.5     <- shipped
#     0.020    51055     626.9     223.2
#
# 0.015 deg is ~1.7 km. Douglas-Peucker bounds the error at the tolerance by
# construction; measured, the mean displacement of a removed vertex is well
# under half of it (the generator prints the figure). Worth keeping in
# proportion: 1:50,000,000 is 500 m of ground per 0.01 mm of paper, so the
# source's own positional accuracy is several km — this simplification is
# below the noise floor of the data it is simplifying. In the game's flat
# units 0.015 deg is 0.5 x-units / 0.57 y-units, i.e. ~5 px at MAX_ZOOM = 10,
# and that is the worst case on the straightest runs, not the typical one.
#
# Do not lower this to "sharpen" the coastline without re-measuring the file
# size — 0.012 is already 802 KB, over budget before the per-country JSON
# scaffolding is added.
#
# ---- Small rings ---------------------------------------------------------
#
# A ring is dropped only if it survives NONE of three tests:
#   1. its spherical area is >= MIN_RING_KM2 for the tier, or
#   2. it is the largest ring of its country, or
#   3. its country's total area is under SMALL_COUNTRY_KM2.
#
# (2) and (3) are the ones that matter. (1) alone deletes Vatican City and
# Monaco from the map outright, which is not "dropping a speck", it is
# dropping a country. MIN_RING_KM2 is per tier because the tiers are used at
# different zooms: 110m carries the globe down to about the regional frame,
# where a screen pixel is roughly a flat unit and 20 km2 is sub-pixel; 50m
# carries the regional frame down to MAX_ZOOM = 10, where a pixel is ~330 m,
# so only genuinely degenerate rings qualify. Both thresholds are set so they
# barely fire (1 ring at 110m, 2 at 50m) — Natural Earth has already done
# this filtering at each scale and the tests are a guard, not a lever.
#
# ---- Labels --------------------------------------------------------------
#
# label is the pole of inaccessibility (Mapbox polylabel), NOT a centroid: a
# centroid puts the United States in the Pacific and Indonesia in the sea.
# Computed on the country's LARGEST polygon only, holes included — over all
# polygons the search box for the USA spans the antimeridian via the western
# Aleutians and the answer is meaningless.
#
# Both tiers get the label computed from the 50m geometry. Every 110m country
# also exists at 50m (asserted below), and the tiers swap live under a camera
# that must not flash (spec §5) — a label that jumps 40 km on the swap is
# exactly the sort of flash that rule is about.
# ============================================================

import argparse
import gzip
import json
import math
import os
import re
import sys
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

# Natural Earth as plain GeoJSON. Both URLs serve the identical file; the
# second is a CDN mirror of the same git ref, so a fallback cannot quietly
# hand back a different vintage of the data.
#
# Deliberately NOT implemented as fallbacks: the naciscdn .zip (shapefile)
# and world-atlas (TopoJSON). world-atlas carries neither NAME nor ISO_A3 in
# Natural Earth's own spelling and has no 50m tier, so a run that silently
# fell through to it would emit a differently-named, differently-shaped
# dataset under the same filename. A loud failure is better. If the network
# is blocked, download the file by hand and pass --geojson-110m / --geojson-50m.
SOURCES = [
    'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/'
    'geojson/ne_%s_admin_0_countries.geojson',
    'https://cdn.jsdelivr.net/gh/nvkelso/natural-earth-vector@master/'
    'geojson/ne_%s_admin_0_countries.geojson',
]

R_EARTH_KM = 6371.0088          # IUGG mean radius; area is for label priority only

TIERS = {
    #                simplify  min ring    binding            file
    '110m': dict(tol=0.0,   min_ring=20.0, binding='WORLD_GEO',
                 out='js/worldgeo.js', budget_kb=150),
    '50m':  dict(tol=0.015, min_ring=1.0,  binding='WORLD_GEO_50M',
                 out='js/worldgeo-50m.js', budget_kb=800),
}

SMALL_COUNTRY_KM2 = 50000.0     # Kuwait is 17.8k, Qatar 11.6k, Fiji 18.3k

# --- the game's projection, for --verify only -----------------------------
# Straight out of WORLDMAP-SPEC §2. Nothing else in this file reads it.
LON0, LAT0 = 38.5, 39.5
DEG_X = 1000.0 / 30.0
DEG_Y = DEG_X / math.cos(math.radians(28.0))


def flat(lon, lat):
    return ((lon - LON0) * DEG_X, (LAT0 - lat) * DEG_Y)


# ============================================================
# fetch
# ============================================================

def cache_dir():
    d = os.environ.get('WORLDGEO_CACHE') or os.path.join(
        os.path.expanduser('~'), '.cache', 'worldgeo')
    os.makedirs(d, exist_ok=True)
    return d


def load_source(res, override=None):
    """Return the parsed GeoJSON for one resolution, from disk cache if present."""
    if override:
        with open(override, 'rb') as fh:
            return json.loads(fh.read().decode('utf-8'))
    path = os.path.join(cache_dir(), 'ne_%s_admin_0_countries.geojson' % res)
    if os.path.exists(path) and os.path.getsize(path) > 100000:
        with open(path, 'rb') as fh:
            return json.loads(fh.read().decode('utf-8'))
    errors = []
    for tpl in SOURCES:
        url = tpl % res
        try:
            sys.stderr.write('  fetching %s\n' % url)
            data = urllib.request.urlopen(url, timeout=300).read()
        except Exception as exc:                       # noqa: BLE001 - report it verbatim
            errors.append('%s -> %s: %s' % (url, type(exc).__name__, exc))
            continue
        with open(path, 'wb') as fh:
            fh.write(data)
        return json.loads(data.decode('utf-8'))
    raise SystemExit(
        'worldgeo: could not fetch Natural Earth %s. Rule 1 of the spec says a\n'
        'hand-drawn coastline is worse than no branch, so this stops here rather\n'
        'than inventing anything. Errors:\n  %s\n'
        'If the network is blocked, download the file and pass --geojson-%s PATH.'
        % (res, '\n  '.join(errors), res))


# ============================================================
# geometry
# ============================================================

def ring_area_km2(ring):
    """Spherical polygon area by excess. Sign discarded — winding in Natural
    Earth is not reliable and nothing downstream needs it (the renderer fills
    evenodd). Longitude steps are normalised into (-pi, pi] so Antarctica's
    closing run along lat -90, which jumps 180 -> -180 in one step at 110m,
    contributes nothing instead of unwinding the whole ring."""
    total = 0.0
    n = len(ring)
    for i in range(n):
        lon1, lat1 = ring[i]
        lon2, lat2 = ring[(i + 1) % n]
        d = math.radians(lon2 - lon1)
        if d > math.pi:
            d -= 2.0 * math.pi
        elif d < -math.pi:
            d += 2.0 * math.pi
        total += d * (2.0 + math.sin(math.radians(lat1)) + math.sin(math.radians(lat2)))
    return abs(total * R_EARTH_KM * R_EARTH_KM / 2.0)


def quantize(ring):
    """Round to the output grid and collapse the runs that produces. Also drops
    GeoJSON's repeated closing vertex — spec §4 closes rings implicitly."""
    out = []
    for lon, lat in ring:
        p = (round(lon, 2), round(lat, 2))
        if not out or out[-1] != p:
            out.append(p)
    while len(out) > 1 and out[0] == out[-1]:
        out.pop()
    return out


def _dp_open(pts, tol2, dropped):
    """Douglas-Peucker over an open polyline. Returns the kept mask."""
    keep = [False] * len(pts)
    keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        s, e = stack.pop()
        if e <= s + 1:
            continue
        ax, ay = pts[s]
        bx, by = pts[e]
        dx, dy = bx - ax, by - ay
        dd = dx * dx + dy * dy
        best, bi = -1.0, -1
        for i in range(s + 1, e):
            px, py = pts[i]
            if dd == 0.0:
                d2 = (px - ax) ** 2 + (py - ay) ** 2
            else:
                t = ((px - ax) * dx + (py - ay) * dy) / dd
                t = 0.0 if t < 0.0 else (1.0 if t > 1.0 else t)
                d2 = (px - ax - t * dx) ** 2 + (py - ay - t * dy) ** 2
            if d2 > best:
                best, bi = d2, i
        if best > tol2:
            keep[bi] = True
            stack.append((s, bi))
            stack.append((bi, e))
        else:
            for i in range(s + 1, e):
                dropped.append(math.sqrt(max(0.0, _seg_dist2(pts[i], pts[s], pts[e]))))
    return keep


def _seg_dist2(p, a, b):
    px, py = p
    ax, ay = a
    bx, by = b
    dx, dy = bx - ax, by - ay
    if dx or dy:
        t = ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)
        if t > 1.0:
            ax, ay = bx, by
        elif t > 0.0:
            ax, ay = ax + dx * t, ay + dy * t
    return (px - ax) ** 2 + (py - ay) ** 2


def simplify_ring(ring, tol, dropped):
    """Douglas-Peucker on a CLOSED ring. A closed ring has no endpoints, so it
    is cut at the vertex furthest from ring[0] first — anchoring both halves on
    the long axis. Anchoring on ring[0] alone lets DP shortcut straight across
    a narrow peninsula whose tip happens to be the start vertex."""
    if tol <= 0.0 or len(ring) < 6:
        return ring
    x0, y0 = ring[0]
    far = max(range(len(ring)),
              key=lambda i: (ring[i][0] - x0) ** 2 + (ring[i][1] - y0) ** 2)
    if far < 2 or far > len(ring) - 2:
        return ring
    tol2 = tol * tol
    head = ring[:far + 1]
    tail = ring[far:] + [ring[0]]
    ka = _dp_open(head, tol2, dropped)
    kb = _dp_open(tail, tol2, dropped)
    out = [p for p, k in zip(head, ka) if k][:-1] + [p for p, k in zip(tail, kb) if k][:-1]
    return out if len(out) >= 3 else ring


# ============================================================
# polylabel — pole of inaccessibility
# ============================================================

def _point_to_polygon_dist(x, y, rings):
    """Signed distance to the polygon boundary: positive inside, negative out."""
    inside = False
    best = float('inf')
    for ring in rings:
        n = len(ring)
        j = n - 1
        for i in range(n):
            ax, ay = ring[i]
            bx, by = ring[j]
            if ((ay > y) != (by > y)) and (x < (bx - ax) * (y - ay) / (by - ay) + ax):
                inside = not inside
            d2 = _seg_dist2((x, y), (ax, ay), (bx, by))
            if d2 < best:
                best = d2
            j = i
    d = math.sqrt(best)
    return d if inside else -d


def polylabel(rings):
    """Mapbox's polylabel: quadtree over the bounding box, always splitting the
    cell whose best-possible interior distance is highest, until no cell can
    beat the incumbent by more than `precision`. Deterministic — the heap is
    ordered by (-potential, insertion index), never by float ties alone."""
    import heapq
    outer = rings[0]
    minx = min(p[0] for p in outer)
    maxx = max(p[0] for p in outer)
    miny = min(p[1] for p in outer)
    maxy = max(p[1] for p in outer)
    w, h = maxx - minx, maxy - miny
    if w <= 0 or h <= 0:
        return (round(minx + w / 2.0, 2), round(miny + h / 2.0, 2)), 0.0
    # Relative precision: a label 1/1000 of a country's own width off centre is
    # not a label anyone can see move, and a fixed absolute value would make
    # Russia cost 14 levels of quadtree for nothing.
    precision = max(max(w, h) / 1000.0, 0.0005)
    cell = min(w, h)
    half = cell / 2.0

    def score(cx, cy, hh):
        d = _point_to_polygon_dist(cx, cy, rings)
        return d, d + hh * math.sqrt(2.0)

    seq = 0
    heap = []
    bx, by = minx + w / 2.0, miny + h / 2.0
    bd, _ = score(bx, by, 0.0)
    x = minx
    while x < maxx:
        y = miny
        while y < maxy:
            cx, cy = x + half, y + half
            d, mx = score(cx, cy, half)
            heapq.heappush(heap, (-mx, seq, cx, cy, half, d))
            seq += 1
            if d > bd:
                bx, by, bd = cx, cy, d
            y += cell
        x += cell
    while heap:
        nmx, _, cx, cy, hh, d = heapq.heappop(heap)
        if -nmx - bd <= precision:
            continue
        hh /= 2.0
        for ox in (-hh, hh):
            for oy in (-hh, hh):
                nx, ny = cx + ox, cy + oy
                nd, nm = score(nx, ny, hh)
                if nd > bd:
                    bx, by, bd = nx, ny, nd
                heapq.heappush(heap, (-nm, seq, nx, ny, hh, nd))
                seq += 1
    return (round(bx, 2), round(by, 2)), bd


# ============================================================
# feature extraction
# ============================================================

def iso_of(props):
    """ISO_A3, with Natural Earth's -99 sentinel emitted as null (spec's
    examples: Kosovo, N. Cyprus, Somaliland). Norway and France also carry -99
    in ISO_A3 — a long-standing quirk of the dataset, not a fact about those
    countries — and Natural Earth's own ISO_A3_EH field has NOR and FRA, so
    that is consulted for anything Natural Earth calls a country. It is NOT
    consulted for dependencies, where ISO_A3_EH holds the *sovereign's* code
    and would file Ashmore and Cartier Islands under AUS."""
    iso = (props.get('ISO_A3') or '').strip()
    if iso and iso != '-99':
        return iso
    if props.get('TYPE') in ('Sovereign country', 'Country'):
        eh = (props.get('ISO_A3_EH') or '').strip()
        if eh and eh != '-99':
            return eh
    return None


def polygons_of(geom):
    if geom is None:
        return []
    if geom['type'] == 'MultiPolygon':
        return geom['coordinates']
    if geom['type'] == 'Polygon':
        return [geom['coordinates']]
    raise SystemExit('worldgeo: unexpected geometry type %r' % geom['type'])


def seam_report(features):
    """Natural Earth already splits polygons at the antimeridian, which is why
    nothing here does. This checks that claim on every run instead of trusting
    it — the failure mode if the source ever changes is a horizontal scar
    across the whole map (spec §2), and it is silent in the data."""
    crossings = []
    for f in features:
        for poly in polygons_of(f['geometry']):
            for ring in poly:
                for i in range(len(ring) - 1):
                    if abs(ring[i + 1][0] - ring[i][0]) > 180.0:
                        crossings.append((f['properties']['NAME'],
                                          round(ring[i][1], 2)))
    return crossings


# ============================================================
# emit
# ============================================================

def num(v):
    """2dp with trailing zeros stripped: 50.6 not 50.60. Negative zero is a
    real hazard here — round(-0.001, 2) is -0.0, which formats as '-0'."""
    s = ('%.2f' % v).rstrip('0').rstrip('.')
    return '0' if s in ('-0', '', '-') else s


def js_string(s):
    # ASCII-escaped on purpose. There is no build step and no bundler here, so
    # the only thing standing between "Cote d'Ivoire" and mojibake is whatever
    # charset the page that <script>-tags this file happens to declare. \u
    # escapes cost a few bytes and cannot be got wrong.
    return json.dumps(s, ensure_ascii=True)


def build_tier(res, features, labels, tol, min_ring, stats):
    countries = []
    for f in features:
        props = f['properties']
        name = props.get('NAME') or props.get('NAME_LONG') or props.get('ADMIN')
        polys = polygons_of(f['geometry'])
        if not polys:
            stats['no_geom'].append(name)
            continue

        # Pass 1: area of every ring, in source coordinates, before any of the
        # thinning decisions read it.
        sized = []
        for poly in polys:
            outer_a = ring_area_km2(poly[0])
            holes = [(r, ring_area_km2(r)) for r in poly[1:]]
            sized.append((poly[0], outer_a, holes))
        total = sum(a - sum(ha for _, ha in hs) for _, a, hs in sized)
        biggest = max(a for _, a, _ in sized)
        keep_all = total < SMALL_COUNTRY_KM2

        rings = []
        for outer, outer_a, holes in sized:
            if outer_a < min_ring and not keep_all and outer_a < biggest:
                stats['dropped'].append((res, name, round(outer_a, 2), 'small ring'))
                continue
            group = [(outer, outer_a)] + holes
            for ring, area in group:
                q = quantize(ring)
                if len(q) < 3:
                    stats['collapsed'].append((res, name, round(area, 3)))
                    continue
                q = simplify_ring(q, tol, stats['dropped_dist'])
                if len(q) < 3:
                    stats['collapsed'].append((res, name, round(area, 3)))
                    continue
                rings.append(q)
        if not rings:
            stats['lost'].append((res, name, round(total, 3)))
            continue
        countries.append(dict(name=name, iso=iso_of(props), rings=rings,
                              label=labels[name], area=int(round(total))))

    # Sorted big-to-small. Deterministic (name breaks the tie), and it means a
    # renderer thinning labels by area can walk the list and stop, and that the
    # small islands paint over the landmasses rather than under them.
    countries.sort(key=lambda c: (-c['area'], c['name']))
    return countries


def emit(res, binding, countries, out_path):
    tier = TIERS[res]
    verts = sum(len(r) for c in countries for r in c['rings'])
    lines = []
    lines.append('// ============================================================')
    lines.append('// %s — Natural Earth admin-0 countries, %s (public domain)'
                 % (os.path.basename(out_path), res))
    lines.append('// Raw lon/lat, WGS84, UNPROJECTED — the renderer projects, because it')
    lines.append('// interpolates between two projections every frame (WORLDMAP-SPEC §3).')
    lines.append('// Rings are flat interleaved lon,lat pairs at 2dp and are closed')
    lines.append('// implicitly; holes ride in the same list and fill evenodd.')
    if tier['tol'] > 0:
        lines.append('// Douglas-Peucker simplified at %g deg (~%.1f km) in lon/lat.'
                     % (tier['tol'], tier['tol'] * 111.32))
    else:
        lines.append('// Not simplified — 2dp rounding is the only reduction applied.')
    lines.append('// %d countries, %d vertices.' % (len(countries), verts))
    lines.append('// Generated file — do not edit by hand. See tools/worldgeo.py.')
    lines.append('// ============================================================')
    lines.append('')
    lines.append('const %s = {' % binding)
    lines.append("  res: '%s'," % res)
    lines.append('  countries: [')
    for c in countries:
        rings = '[' + '],['.join(
            ','.join(num(v) for p in ring for v in p) for ring in c['rings']) + ']'
        iso = ("'%s'" % c['iso']) if c['iso'] else 'null'
        lines.append('    { name: %s, iso: %s, area: %d, label: [%s,%s], rings: [%s] },'
                     % (js_string(c['name']), iso, c['area'],
                        num(c['label'][0]), num(c['label'][1]), rings))
    lines.append('  ]')
    lines.append('};')
    lines.append('')
    text = '\n'.join(lines)
    with open(out_path, 'w', encoding='utf-8') as fh:
        fh.write(text)
    return text, verts


# ============================================================
# --verify — WORLDMAP-SPEC §10 cross-check
# ============================================================

PATH_NUM = re.compile(r'(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)')


def geodata_bbox(name):
    """Pull one country's path out of js/geodata.js without reading the file
    into anything. Returns (minx, miny, maxx, maxy, first_point)."""
    path = os.path.join(ROOT, 'js', 'geodata.js')
    with open(path, encoding='utf-8') as fh:
        for line in fh:
            if '"%s"' % name not in line:
                continue
            # Not one regex: some entries carry a `cls:` between name and d
            # (Iran does), so this anchors on the name and then takes the next
            # `d:` on the same line rather than assuming the field order.
            at = line.find('name: "%s"' % name)
            if at < 0:
                continue
            m = re.search(r'd:\s*"([^"]*)"', line[at:])
            if not m:
                continue
            pts = [(float(a), float(b)) for a, b in PATH_NUM.findall(m.group(1))]
            xs = [p[0] for p in pts]
            ys = [p[1] for p in pts]
            return (min(xs), min(ys), max(xs), max(ys)), pts[0], len(pts)
    return None, None, 0


def ne_bbox(features, name, quantized):
    pts = []
    for f in features:
        if f['properties'].get('NAME') != name:
            continue
        for poly in polygons_of(f['geometry']):
            for ring in poly:
                r = quantize(ring) if quantized else [tuple(p[:2]) for p in ring]
                pts.extend(flat(lon, lat) for lon, lat in r)
    if not pts:
        return None, None, 0
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    return (min(xs), min(ys), max(xs), max(ys)), pts[0], len(pts)


def verify(features50):
    print('')
    print('=== WORLDMAP-SPEC §10 cross-check ===')
    print('Natural Earth 50m re-projected through the spec\'s flat() vs the same')
    print('country already in js/geodata.js. Both are NE 50m, so they must agree.')
    print('  flat(lon,lat) = ((lon-38.5)*33.333333, (39.5-lat)*37.753020)')
    worst = 0.0
    for name in ('Iran', 'Bahrain', 'Sri Lanka'):
        game, gfirst, gn = geodata_bbox(name)
        raw, rfirst, rn = ne_bbox(features50, name, False)
        shipped, _, sn = ne_bbox(features50, name, True)
        print('')
        print('  %s' % name)
        if game is None:
            print('    not in js/geodata.js — skipped')
            continue
        print('    geodata.js   x %9.1f .. %9.1f   y %9.1f .. %9.1f   (%d pts)'
              % (game[0], game[2], game[1], game[3], gn))
        print('    NE 50m raw   x %9.1f .. %9.1f   y %9.1f .. %9.1f   (%d pts)'
              % (raw[0], raw[2], raw[1], raw[3], rn))
        print('    NE 50m 2dp   x %9.1f .. %9.1f   y %9.1f .. %9.1f   (%d pts)'
              % (shipped[0], shipped[2], shipped[1], shipped[3], sn))
        d = [raw[i] - game[i] for i in range(4)]
        worst = max(worst, max(abs(v) for v in d))
        print('    delta (raw - geodata.js)  dminx %+.2f  dminy %+.2f  '
              'dmaxx %+.2f  dmaxy %+.2f' % (d[0], d[1], d[2], d[3]))
        print('    first vertex: geodata.js %.1f,%.1f   NE 50m %.1f,%.1f'
              % (gfirst[0], gfirst[1], rfirst[0], rfirst[1]))
    print('')
    print('  worst bbox delta across all three: %.2f flat units' % worst)
    print('  (1 flat unit = 0.030 deg lon = 0.026 deg lat = ~3.3 km / ~2.9 km)')
    if worst > 2.0:
        print('  *** OVER 2 UNITS — per spec §10 this is REPORTED, NOT PATCHED. ***')
    return worst


# ============================================================
# main
# ============================================================

def main():
    ap = argparse.ArgumentParser(description='Generate js/worldgeo*.js from Natural Earth.')
    ap.add_argument('--verify', action='store_true', help='run the §10 cross-check only')
    ap.add_argument('--stats', action='store_true', help='print what was dropped and why')
    ap.add_argument('--geojson-110m', help='local ne_110m_admin_0_countries.geojson')
    ap.add_argument('--geojson-50m', help='local ne_50m_admin_0_countries.geojson')
    args = ap.parse_args()

    src = {}
    for res, override in (('110m', args.geojson_110m), ('50m', args.geojson_50m)):
        if args.verify and res == '110m':
            continue
        src[res] = load_source(res, override)['features']

    if args.verify:
        verify(src['50m'])
        return

    for res in ('110m', '50m'):
        crossings = seam_report(src[res])
        # The one legitimate hit is Antarctica closing its ring along lat -90,
        # which at 110m is a single 180 -> -180 step across the south pole. In
        # the flat chart that is the bottom edge of the map and in the globe
        # both ends are the pole itself, so it is not a scar. Anything else is.
        bad = [c for c in crossings if not (c[0] == 'Antarctica' and c[1] <= -89.0)]
        print('%s: %d antimeridian step(s) in source; %d unexpected'
              % (res, len(crossings), len(bad)))
        if bad:
            raise SystemExit('worldgeo: unsplit seam-crossing ring(s): %r\n'
                             'Natural Earth used to ship these pre-split. Add a splitter.'
                             % bad)

    names110 = {f['properties']['NAME'] for f in src['110m']}
    names50 = {f['properties']['NAME'] for f in src['50m']}
    missing = sorted(names110 - names50)
    if missing:
        raise SystemExit('worldgeo: %r is in 110m but not 50m — labels are computed '
                         'from 50m and shared, so this breaks.' % missing)

    # Labels once, from 50m, shared by both tiers (see the header).
    print('computing poles of inaccessibility from 50m ...')
    labels = {}
    outside = []
    for f in sorted(src['50m'], key=lambda f: f['properties']['NAME']):
        name = f['properties']['NAME']
        polys = polygons_of(f['geometry'])
        if not polys:
            labels[name] = (0.0, 0.0)
            continue
        best = max(polys, key=lambda p: ring_area_km2(p[0]))
        rings = [[tuple(p[:2]) for p in r] for r in best]
        pt, dist = polylabel(rings)
        labels[name] = pt
        if dist <= 0:
            outside.append((name, pt, round(dist, 4)))
    if outside:
        print('  WARNING: label fell outside the polygon for %r' % outside)

    stats = dict(dropped=[], collapsed=[], lost=[], no_geom=[], dropped_dist=[])
    results = {}
    for res in ('110m', '50m'):
        tier = TIERS[res]
        countries = build_tier(res, src[res], labels, tier['tol'], tier['min_ring'], stats)
        out = os.path.join(ROOT, tier['out'])
        text, verts = emit(res, tier['binding'], countries, out)
        raw_kb = len(text.encode('utf-8')) / 1024.0
        gz_kb = len(gzip.compress(text.encode('utf-8'), 9)) / 1024.0
        results[res] = (len(countries), verts, raw_kb, gz_kb)
        flag = '' if raw_kb <= tier['budget_kb'] else '  *** OVER BUDGET ***'
        print('%-5s %3d countries  %6d vertices  %7.1f KB (budget %d)  gz %6.1f KB%s'
              % (res, len(countries), verts, raw_kb, tier['budget_kb'], gz_kb, flag))

    if stats['dropped_dist']:
        d = stats['dropped_dist']
        print('simplification: %d vertices removed, mean displacement %.4f deg, '
              'max %.4f deg' % (len(d), sum(d) / len(d), max(d)))
    print('rings dropped as specks: %d   rings collapsed by 2dp rounding: %d   '
          'countries lost entirely: %d'
          % (len(stats['dropped']), len(stats['collapsed']), len(stats['lost'])))
    if stats['lost']:
        print('  LOST: %r' % stats['lost'])
    if args.stats:
        for row in stats['dropped']:
            print('  dropped %s' % (row,))
        for row in stats['collapsed']:
            print('  collapsed %s' % (row,))

    verify(src['50m'])


if __name__ == '__main__':
    main()
