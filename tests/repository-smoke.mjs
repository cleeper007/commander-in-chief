import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];
const checkedAssets = new Set();

function fail(message) {
  failures.push(message);
}

function read(path) {
  return readFileSync(join(root, path), 'utf8');
}

function walk(path) {
  const absolute = join(root, path);
  return readdirSync(absolute).flatMap((name) => {
    const child = join(absolute, name);
    return statSync(child).isDirectory()
      ? walk(relative(root, child))
      : [relative(root, child)];
  });
}

function localPath(reference) {
  const clean = reference.split(/[?#]/, 1)[0];
  if (!clean || clean.startsWith('#') || clean.startsWith('data:') ||
      clean.startsWith('http://') || clean.startsWith('https://') ||
      clean.includes('${')) return null;
  return clean.replace(/^\.\//, '');
}

function checkReference(reference, source) {
  const path = localPath(reference);
  if (!path) return;
  const key = `${source}:${path}`;
  if (checkedAssets.has(key)) return;
  checkedAssets.add(key);
  if (!existsSync(join(root, path))) fail(`${source} references missing file: ${path}`);
}

const index = read('index.html');
const world = read('world.html');

// Easy mode translates only the player-facing copy. Keep the glossary
// idempotent because some assembled UI fragments pass through it twice, and
// protect ordinary uses of "service" while translating the targeting sense.
const plain = runInNewContext(`${read('js/text.js')}; ({
  brief: Txt.plain('CENTCOM briefs 3 packages against the SAM belt.'),
  repeated: Txt.plain(Txt.plain('Aegis interceptors and GBU-57.')),
  ordinary: Txt.plain('1 American service member'),
})`);
if (plain.brief !== 'the military staff briefs 3 strike missions against the air-defense network.') {
  fail(`Easy-language glossary produced unexpected brief copy: ${plain.brief}`);
}
if (plain.repeated !== 'ship-based defensive missiles and bunker-busting bomb.') {
  fail(`Easy-language glossary is not idempotent: ${plain.repeated}`);
}
if (plain.ordinary !== '1 American service member') {
  fail(`Easy-language glossary changed an ordinary use of service: ${plain.ordinary}`);
}

const difficulty = read('js/data.js');
if (!/easy:\s*\{[\s\S]*?plainLanguage:\s*true/.test(difficulty) ||
    !/normal:\s*\{[\s\S]*?plainLanguage:\s*false/.test(difficulty) ||
    !/hard:\s*\{[\s\S]*?plainLanguage:\s*false/.test(difficulty)) {
  fail('Difficulty rows must opt in or out of the plain-language layer explicitly');
}

for (const [source, html] of [['index.html', index], ['world.html', world]]) {
  for (const match of html.matchAll(/\b(?:src|href)="([^"]+)"/g)) {
    checkReference(match[1], source);
  }

  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  const seen = new Set();
  for (const id of ids) {
    if (seen.has(id)) fail(`${source} contains duplicate id: ${id}`);
    seen.add(id);
  }
}

const badge = index.match(/class="version-badge">v(\d+\.\d+)/)?.[1];
if (!badge) {
  fail('index.html has no readable version badge');
} else {
  const stamped = new Set([...index.matchAll(/[?&]v=(\d+\.\d+)/g)].map((match) => match[1]));
  if (stamped.size !== 1 || !stamped.has(badge)) {
    fail(`index.html cache stamps (${[...stamped].join(', ') || 'none'}) do not match v${badge}`);
  }
}

const sourceFiles = walk('js').filter((path) => extname(path) === '.js');
const literalAsset = /["'`](audio|video|icons|css|js)\/([^"'`\s)]+)["'`]/g;
for (const source of [...sourceFiles, 'index.html', 'world.html']) {
  const content = read(source);
  for (const match of content.matchAll(literalAsset)) {
    checkReference(`${match[1]}/${match[2]}`, source);
  }
}

if (!existsSync(join(root, 'LICENSE'))) fail('README declares a license but LICENSE is missing');
if (!read('README.md').includes('MIT')) fail('README no longer identifies the project license');

if (failures.length) {
  console.error(`Repository smoke check failed (${failures.length}):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`Repository smoke check passed: ${sourceFiles.length} JavaScript files, ` +
    `${checkedAssets.size} local references, consistent build v${badge}.`);
}
