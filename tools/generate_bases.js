// ============================================================
// tools/generate_bases.js — generate js/bases.js from CSV
// Projects coordinates into the game's equirectangular 28N projection
// byte-compatible with js/geodata.js and js/data.js (main branch).
// ============================================================
const fs = require('fs');
const path = require('path');

const LON0 = 38.5, LAT0 = 39.5;
const DEG_X = 1000 / 30;                             // 33.333333 units / deg lon
const DEG_Y = DEG_X / Math.cos(28 * Math.PI / 180);  // 37.753020 units / deg lat

function parseCSVLine(line) {
  const values = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      values.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  values.push(cur);
  return values;
}

function parseCSV(text) {
  const lines = text.replace(/\r/g, '').trim().split('\n');
  const headers = parseCSVLine(lines[0]);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const values = parseCSVLine(lines[i]);
    const row = {};
    headers.forEach((h, idx) => { row[h.trim()] = values[idx] !== undefined ? values[idx].trim() : ''; });
    rows.push(row);
  }
  return rows;
}

function makeSlug(name, branch, seen) {
  let base = name.toLowerCase()
    .replace(/\(.*?\)/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  if (!base) base = branch.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  let slug = base;
  let counter = 2;
  while (seen.has(slug)) {
    slug = base + '-' + counter++;
  }
  seen.add(slug);
  return slug;
}

function makeShort(name) {
  let clean = name.replace(/\(.*?\)/g, '').trim();
  clean = clean.replace(/^(Joint Base|JB)\s+/i, 'JB ');
  clean = clean.replace(/^(Naval Station|NS)\s+/i, 'NS ');
  clean = clean.replace(/^(Naval Air Station|NAS)\s+/i, 'NAS ');
  clean = clean.replace(/^(Marine Corps Base|MCB)\s+/i, 'MCB ');
  clean = clean.replace(/^(Marine Corps Air Station|MCAS)\s+/i, 'MCAS ');
  clean = clean.replace(/^(Coast Guard Air Station|CGAS)\s+/i, 'CGAS ');
  clean = clean.replace(/^(Coast Guard Base|CG Base)\s+/i, 'CG BASE ');
  clean = clean.replace(/^(Air Force Base|AFB)\s+/i, 'AFB ');
  return clean.toUpperCase();
}

function getKind(branch, name) {
  const n = name.toLowerCase();
  if (branch === 'Air Force' || branch === 'ANG' || branch === 'AF Reserve') return 'airbase';
  if (branch === 'Space Force') return 'space';
  if (branch === 'Navy') {
    if (n.includes('air station') || n.includes('nas ') || n.includes('air facility')) return 'airbase';
    return 'naval';
  }
  if (branch === 'Marine Corps') {
    if (n.includes('air station') || n.includes('mcas')) return 'airbase';
    return 'marine';
  }
  if (branch === 'Coast Guard') {
    if (n.includes('air station') || n.includes('cgas')) return 'airbase';
    return 'coastguard';
  }
  if (branch === 'Army') {
    if (n.includes('aaf') || n.includes('airfield')) return 'airbase';
    if (n.includes('arsenal') || n.includes('depot') || n.includes('proving ground')) return 'logistics';
    return 'army';
  }
  return 'base';
}

function generate() {
  const csvPath = path.join(__dirname, '..', 'US_Military_Bases_Corrected.csv');
  const outPath = path.join(__dirname, '..', 'js', 'bases.js');

  const content = fs.readFileSync(csvPath, 'utf8');
  const raw = parseCSV(content);
  const seenSlugs = new Set();

  const bases = raw.map((r, idx) => {
    const lat = parseFloat(r['Latitude']);
    const lon = parseFloat(r['Longitude']);
    if (isNaN(lat) || isNaN(lon)) throw new Error('Bad coords at row ' + idx + ': ' + JSON.stringify(r));
    const x = Math.round(((lon - LON0) * DEG_X) * 10) / 10;
    const y = Math.round(((LAT0 - lat) * DEG_Y) * 10) / 10;
    const id = makeSlug(r['Installation'], r['Branch'], seenSlugs);
    const shortName = makeShort(r['Installation']);
    const kind = getKind(r['Branch'], r['Installation']);
    const descParts = [];
    if (r['Primary Combat Units']) descParts.push(r['Primary Combat Units']);
    if (r['Notes']) descParts.push(r['Notes']);
    const desc = descParts.join('. ');

    return {
      id,
      name: r['Installation'],
      short: shortName,
      branch: r['Branch'],
      city: r['City/Area'],
      state: r['State/Country'],
      lat,
      lon,
      x,
      y,
      kind,
      cocom: r['Combatant Command'],
      majcom: r['Major Command'],
      units: r['Primary Combat Units'],
      personnel: r['Approx Personnel'],
      systems: r['Aircraft / Major Combat Systems'],
      desc: desc,
      notes: r['Notes']
    };
  });

  const banner = `// ============================================================
// js/bases.js — GENERATED: do not edit by hand
// Generated by tools/generate_bases.js from US_Military_Bases_Corrected.csv
// Total installations: ${bases.length} across all Armed Forces branches.
// Projection: Equirectangular standard parallel 28N, origin (38.5E, 39.5N)
// Coordinates format matching main branch US_ASSETS schema:
//   id, name, short, branch, city, state, lat, lon, x, y, kind, cocom, majcom, units, personnel, systems, desc, notes
// ============================================================
`;

  const code = banner + `const US_BASES = ` + JSON.stringify(bases, null, 2) + `;\n\n` +
`if (typeof module !== 'undefined' && module.exports) {\n  module.exports = { US_BASES };\n}\n`;

  fs.writeFileSync(outPath, code, 'utf8');
  console.log(`Successfully generated ${bases.length} military installations in ${outPath}`);
}

if (require.main === module) {
  generate();
}

module.exports = { generate };
