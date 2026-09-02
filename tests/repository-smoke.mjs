import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

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
