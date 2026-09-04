import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REQUIRED = [
  'tests/unit', 'tests/simulation', 'tests/save', 'tests/regression',
  'tests/fixtures', 'tests/baselines',
];

for (const item of REQUIRED) {
  assert.ok(fs.statSync(path.join(ROOT, item)).isDirectory(), `missing public test layer: ${item}`);
}

const tracked = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' }).trim().split('\n');
assert.equal(tracked.some((file) => file.startsWith('.claude/')), false,
  'private agent/session files must not be published as repository tests');

function filesUnder(relative) {
  const base = path.join(ROOT, relative);
  if (!fs.existsSync(base)) return [];
  return fs.readdirSync(base, { withFileTypes: true }).flatMap((entry) => {
    const name = path.join(relative, entry.name);
    return entry.isDirectory() ? filesUnder(name) : [name];
  });
}

const checkedAssets = new Set();
function localPath(reference) {
  const clean = reference.split(/[?#]/, 1)[0];
  if (!clean || clean.startsWith('#') || clean.startsWith('data:') ||
      clean.startsWith('http://') || clean.startsWith('https://') || clean.includes('${')) return null;
  return clean.replace(/^\.\//, '');
}

function checkReference(reference, source) {
  const file = localPath(reference);
  if (!file) return;
  const key = `${source}:${file}`;
  if (checkedAssets.has(key)) return;
  checkedAssets.add(key);
  assert.ok(fs.existsSync(path.join(ROOT, file)), `${source} references missing file: ${file}`);
}

// Walk the public source and test trees directly. `git ls-files` would omit a
// newly-authored test until it was staged, which is exactly when this smoke
// check is most useful locally.
const syntaxFiles = [...filesUnder('js'), ...filesUnder('tests'), ...filesUnder('tools')]
  .filter((file) => /\.(?:js|mjs)$/.test(file));
for (const file of syntaxFiles) {
  execFileSync(process.execPath, ['--check', path.join(ROOT, file)], { stdio: 'pipe' });
}

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const world = fs.readFileSync(path.join(ROOT, 'world.html'), 'utf8');

const plain = runInNewContext(`${fs.readFileSync(path.join(ROOT, 'js/text.js'), 'utf8')}; ({
  brief: Txt.plain('CENTCOM briefs 3 packages against the SAM belt.'),
  repeated: Txt.plain(Txt.plain('Aegis interceptors and GBU-57.')),
  ordinary: Txt.plain('1 American service member'),
})`);
assert.equal(plain.brief, 'the military staff briefs 3 strike missions against the air-defense network.');
assert.equal(plain.repeated, 'ship-based defensive missiles and bunker-busting bomb.');
assert.equal(plain.ordinary, '1 American service member');

const difficulty = fs.readFileSync(path.join(ROOT, 'js/data.js'), 'utf8');
assert.match(difficulty, /easy:\s*\{[\s\S]*?plainLanguage:\s*true/);
assert.match(difficulty, /normal:\s*\{[\s\S]*?plainLanguage:\s*false/);
assert.match(difficulty, /hard:\s*\{[\s\S]*?plainLanguage:\s*false/);

for (const [source, sourceHtml] of [['index.html', html], ['world.html', world]]) {
  for (const match of sourceHtml.matchAll(/\b(?:src|href)="([^"]+)"/g)) checkReference(match[1], source);
  const ids = [...sourceHtml.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(new Set(ids).size, ids.length, `${source} contains a duplicate id`);
}

const badge = html.match(/class="version-badge">v(\d+\.\d+)/)?.[1];
assert.ok(badge, 'index.html has no readable version badge');
const stamped = new Set([...html.matchAll(/[?&]v=(\d+\.\d+)/g)].map((match) => match[1]));
assert.deepEqual([...stamped], [badge], 'cache stamps must match the visible version badge');

const literalAsset = /["'`](audio|video|icons|css|js)\/([^"'`\s)]+)["'`]/g;
for (const source of [...filesUnder('js').filter((file) => file.endsWith('.js')), 'index.html', 'world.html']) {
  const content = fs.readFileSync(path.join(ROOT, source), 'utf8');
  for (const match of content.matchAll(literalAsset)) checkReference(`${match[1]}/${match[2]}`, source);
}

assert.ok(fs.existsSync(path.join(ROOT, 'LICENSE')), 'README declares a license but LICENSE is missing');
assert.match(fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8'), /MIT/);

const invariantsAt = html.indexOf('js/invariants.js');
const gameAt = html.indexOf('js/game.js');
assert.ok(invariantsAt >= 0 && invariantsAt < gameAt, 'invariants.js must load before game.js');

// Phase 4 accessibility contracts. These are intentionally structural rather
// than snapshot tests: copy and layout may evolve, but the alternate route and
// the state exposed to assistive technology must not disappear unnoticed.
assert.match(html, /<meta name="viewport" content="[^"]*width=device-width(?![^"]*user-scalable=no)[^"]*">/,
  'the viewport must allow browser zoom');
assert.match(html, /id="btn-comfort-title"[^>]*aria-pressed="false"/,
  'the title must expose the comfortable-reading toggle state');
assert.match(html, /id="operations-panel"[\s\S]*?id="operations-index"/,
  'the situation room needs a list-based operational picture');
for (const id of ['toggle-bases', 'zoom-in', 'zoom-out', 'zoom-reset', 'btn-mute', 'btn-music', 'btn-feedback']) {
  assert.match(html, new RegExp(`id="${id}"[^>]*aria-label="[^"]+"`), `${id} needs an explicit accessible name`);
}
for (const button of html.matchAll(/<button\b[^>]*class="[^"]*modal-close[^"]*"[^>]*>/g)) {
  assert.match(button[0], /aria-label="[^"]+"/, `icon-only dialog close needs a name: ${button[0]}`);
}
for (const dialog of html.matchAll(/<[^>]+role="dialog"[^>]*>/g)) {
  assert.match(dialog[0], /aria-labelledby="[^"]+"|aria-label="[^"]+"/,
    `dialog needs an accessible name: ${dialog[0]}`);
}

const style = fs.readFileSync(path.join(ROOT, 'css/style.css'), 'utf8');
assert.match(style, /html\[data-reading="comfortable"\][\s\S]*?--essential-font-size:\s*14px/,
  'comfortable reading must raise essential text to at least 14px');
assert.match(style, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?#ticker-text[\s\S]*?animation:\s*none/,
  'reduced motion must stop the news crawl without dropping its text');

for (const file of filesUnder('js').filter((name) => name.endsWith('.js') && name !== 'js/random.js')) {
  const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
  assert.equal(/Math\.random\s*\(/.test(source), false, `${file} bypasses the campaign RNG`);
}

console.log(`repository smoke passed: ${syntaxFiles.length} scripts, ${checkedAssets.size} local references, build v${badge}`);
