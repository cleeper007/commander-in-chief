import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST = path.join(ROOT, 'media-manifest.json');
const WRITE = process.argv.includes('--write');
const MEDIA_EXT = /\.(?:mp3|m4a|wav|mp4)$/i;
const MAX_MEDIA_BYTES = Number(process.env.CIC_MEDIA_MAX_BYTES || 4 * 1024 * 1024);

function walk(relative) {
  const dir = path.join(ROOT, relative);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const name = path.posix.join(relative, entry.name);
    return entry.isDirectory() ? walk(name) : [name];
  });
}

const mediaFiles = [...walk('audio'), ...walk('video')].filter((file) => MEDIA_EXT.test(file)).sort();
const sourceFiles = [
  'index.html', 'world.html',
  ...walk('js').filter((file) => file.endsWith('.js')),
  ...walk('css').filter((file) => file.endsWith('.css')),
];
const sources = new Map(sourceFiles.map((file) => [file, fs.readFileSync(path.join(ROOT, file), 'utf8')]));
const issues = [];

function exactReferences(source) {
  const refs = [];
  for (const match of source.matchAll(/["'`](audio|video)\/([^"'`\s?#]+\.(?:mp3|m4a|wav|mp4))(?:[?#][^"'`]*)?["'`]/gi)) {
    refs.push(`${match[1]}/${match[2]}`);
  }
  return refs;
}

const explicitRefs = new Set();
for (const source of sources.values()) for (const ref of exactReferences(source)) explicitRefs.add(ref);

// AudioSys intentionally stores filenames beside symbolic clip keys, then adds
// audio/ when it constructs an element. Treat those as full references so a
// typo in that catalog fails in the same way as a literal video path.
for (const match of sources.get('js/audio.js').matchAll(/["'`]([^/"'`]+\.(?:mp3|m4a|wav))["'`]/gi)) {
  explicitRefs.add(`audio/${match[1]}`);
}

// SpecOps composes one of two directory constants with bare clip filenames.
// They cannot become exact references without evaluating the mission table, but
// a basename that exists nowhere in shipped video is unambiguously broken.
for (const match of sources.get('js/specops.js').matchAll(/["'`]([^/"'`]+\.mp4)["'`]/gi)) {
  if (!mediaFiles.some((file) => path.posix.basename(file) === match[1])) {
    issues.push(`missing referenced SpecOps media: ${match[1]}`);
  }
}

for (const ref of explicitRefs) {
  if (!fs.existsSync(path.join(ROOT, ref))) issues.push(`missing referenced media: ${ref}`);
}

const ownerNames = {
  'js/audio.js': 'AudioSys',
  'js/map.js': 'MapView',
  'js/specops.js': 'SpecOps',
  'js/ui.js': 'UI',
  'js/data.js': 'Game content data',
  'index.html': 'Application shell',
  'world.html': 'World map shell',
};

function ownersFor(file) {
  const base = path.posix.basename(file);
  const owners = [];
  for (const [sourceFile, source] of sources) {
    // Full paths cover ordinary references. Basenames cover the two deliberate
    // catalogs whose directory is composed at runtime: AudioSys and SpecOps.
    const full = source.includes(file);
    const catalog = (sourceFile === 'js/audio.js' || sourceFile === 'js/specops.js') &&
      new RegExp(`["'\\x60]${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["'\\x60]`).test(source);
    if (full || catalog) owners.push(ownerNames[sourceFile] || sourceFile);
  }
  return [...new Set(owners)].sort();
}

function probe(file) {
  let raw;
  try {
    raw = execFileSync('ffprobe', [
      '-v', 'error', '-show_entries', 'format=duration',
      '-show_entries', 'stream=codec_type,codec_name', '-of', 'json', path.join(ROOT, file),
    ], { encoding: 'utf8' });
  } catch (error) {
    throw new Error(`ffprobe failed for ${file}: ${error.message}`);
  }
  const data = JSON.parse(raw);
  const duration = Number(data.format?.duration);
  const codecs = (data.streams || []).map((stream) => `${stream.codec_type}:${stream.codec_name}`);
  if (!Number.isFinite(duration) || duration <= 0) issues.push(`invalid duration: ${file}`);
  if (!codecs.length) issues.push(`no audio/video codec found: ${file}`);
  return { durationSeconds: Number(duration.toFixed(3)), codecs };
}

function validateCodecs(file, codecs) {
  const ext = path.extname(file).toLowerCase();
  const allowed = {
    '.mp3': new Set(['audio:mp3']),
    '.m4a': new Set(['audio:aac']),
    '.wav': new Set(['audio:pcm_s16le', 'audio:pcm_s24le']),
    '.mp4': new Set(['video:h264', 'audio:aac']),
  }[ext];
  for (const codec of codecs) if (!allowed?.has(codec)) issues.push(`unsupported codec for ${ext}: ${file} (${codec})`);
  const primary = ext === '.mp4' ? 'video:h264' : [...allowed].find((codec) => codec.startsWith('audio:'));
  if (primary && !codecs.includes(primary)) issues.push(`inconsistent codec for ${ext}: ${file} (${codecs.join(', ')})`);
}

const hashes = new Map();
const entries = mediaFiles.map((file) => {
  const bytes = fs.readFileSync(path.join(ROOT, file));
  const sizeBytes = bytes.length;
  const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
  const usageOwner = ownersFor(file);
  const technical = probe(file);
  validateCodecs(file, technical.codecs);
  if (!usageOwner.length) issues.push(`orphaned media has no runtime owner: ${file}`);
  if (sizeBytes > MAX_MEDIA_BYTES) {
    issues.push(`unexpectedly large media: ${file} (${sizeBytes} bytes; limit ${MAX_MEDIA_BYTES})`);
  }
  if (!hashes.has(sha256)) hashes.set(sha256, []);
  hashes.get(sha256).push(file);
  return { path: file, sizeBytes, durationSeconds: technical.durationSeconds,
    codecs: technical.codecs, sha256, usageOwner };
});

for (const [hash, files] of hashes) {
  if (files.length > 1) issues.push(`duplicate content hash ${hash}: ${files.join(', ')}`);
}

const manifest = {
  schemaVersion: 1,
  generatedBy: 'node tools/media-manifest.mjs --write',
  maximumAssetBytes: MAX_MEDIA_BYTES,
  assets: entries,
};
const serialized = `${JSON.stringify(manifest, null, 2)}\n`;

if (WRITE) {
  fs.writeFileSync(MANIFEST, serialized);
} else if (!fs.existsSync(MANIFEST)) {
  issues.push('media-manifest.json is missing; run npm run media:manifest');
} else if (fs.readFileSync(MANIFEST, 'utf8') !== serialized) {
  issues.push('media-manifest.json is stale; run npm run media:manifest and commit the result');
}

if (issues.length) {
  for (const issue of issues) console.error(`media validation: ${issue}`);
  process.exitCode = 1;
} else {
  console.log(`media manifest ${WRITE ? 'generated' : 'validated'}: ${entries.length} assets, every asset owned and profiled`);
}
