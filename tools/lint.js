#!/usr/bin/env node
'use strict';

// Dependency-free guardrails for failure classes this repository has already
// hit. This is intentionally not a style linter; it must not reformat or churn
// classic scripts while Phase 3 extracts them incrementally.

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const JS_ROOT = path.join(ROOT, 'js');
const files = fs.readdirSync(JS_ROOT)
  .filter((name) => name.endsWith('.js'))
  .map((name) => path.join(JS_ROOT, name));
const failures = [];

function relative(file) {
  return path.relative(ROOT, file);
}

function fail(file, line, rule, detail) {
  failures.push(`${relative(file)}:${line}  ${rule}  ${detail}`);
}

function stripCommentsAndStrings(source) {
  let out = '';
  let i = 0;
  let state = 'code';
  let quote = '';
  while (i < source.length) {
    const c = source[i];
    const n = source[i + 1];
    if (state === 'line') {
      if (c === '\n') { state = 'code'; out += '\n'; } else out += ' ';
      i++;
      continue;
    }
    if (state === 'block') {
      if (c === '*' && n === '/') { out += '  '; i += 2; state = 'code'; }
      else { out += c === '\n' ? '\n' : ' '; i++; }
      continue;
    }
    if (state === 'string') {
      if (c === '\\') { out += '  '; i += 2; continue; }
      if (c === quote) { out += ' '; i++; state = 'code'; continue; }
      out += c === '\n' ? '\n' : ' ';
      i++;
      continue;
    }
    if (c === '/' && n === '/') { out += '  '; i += 2; state = 'line'; continue; }
    if (c === '/' && n === '*') { out += '  '; i += 2; state = 'block'; continue; }
    if (c === '"' || c === "'" || c === '`') {
      quote = c; state = 'string'; out += ' '; i++; continue;
    }
    out += c;
    i++;
  }
  return out;
}

const allowedGlobals = new Set([
  'window', 'document', 'globalThis', 'self', 'module', 'exports', 'require',
  'console', 'localStorage', 'navigator', 'location', 'screen', 'performance',
  'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval',
  // HTML attribute names can surface when a template literal contains nested
  // interpolation; neither is a legal bare JavaScript assignment target here.
  'class', 'style',
]);

function declaredNames(source) {
  const names = new Set(allowedGlobals);
  let match;
  const declarations = /\b(?:const|let|var)\s+([^;\n]+)/g;
  while ((match = declarations.exec(source))) {
    const piece = match[1];
    for (const item of piece.split(',')) {
      const name = /^\s*([A-Za-z_$][\w$]*)/.exec(item);
      if (name) names.add(name[1]);
    }
  }
  const functions = /\bfunction\s*([A-Za-z_$][\w$]*)?\s*\(([^)]*)\)/g;
  while ((match = functions.exec(source))) {
    if (match[1]) names.add(match[1]);
    for (const param of match[2].split(',')) {
      const name = /([A-Za-z_$][\w$]*)/.exec(param.trim());
      if (name) names.add(name[1]);
    }
  }
  const arrows = /(?:\(([^)]*)\)|\b([A-Za-z_$][\w$]*))\s*=>/g;
  while ((match = arrows.exec(source))) {
    const params = match[1] || match[2] || '';
    for (const param of params.split(',')) {
      const name = /([A-Za-z_$][\w$]*)/.exec(param.trim());
      if (name) names.add(name[1]);
    }
  }
  const catches = /\bcatch\s*\(\s*([A-Za-z_$][\w$]*)/g;
  while ((match = catches.exec(source))) names.add(match[1]);
  return names;
}

for (const file of files) {
  const source = fs.readFileSync(file, 'utf8');
  const clean = stripCommentsAndStrings(source);
  const lines = source.split('\n');
  const cleanLines = clean.split('\n');

  // Syntax checking catches duplicate lexical declarations as well as broken
  // extractions before the browser gets a chance to stop at a blank screen.
  const checked = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (checked.status !== 0) fail(file, 1, 'valid-js/duplicate-declarations', (checked.stderr || checked.stdout).trim());

  if (path.basename(file) !== 'random.js') {
    cleanLines.forEach((line, index) => {
      if (/\bMath\.random\s*\(/.test(line)) {
        fail(file, index + 1, 'no-direct-gameplay-random', 'use Random or CosmeticRandom');
      }
    });
  }

  cleanLines.forEach((line, index) => {
    if (/\bG\.(?:approval|middleSize|csgPulledBack)\s*=/.test(line)) {
      fail(file, index + 1, 'no-derived-state-assignment', 'derived G fields are read-only');
    }
    const unreachable = /\b(?:return|throw|continue|break)\b[^;]*;\s*[^}\s]/.exec(line);
    if (unreachable && !/\bif\b/.test(line.slice(0, unreachable.index))) {
      fail(file, index + 1, 'no-unreachable-same-line', 'statement follows an unconditional exit');
    }
  });

  // A deliberately narrow floating-promise rule for the two browser APIs used
  // here. AudioSys.play is synchronous and is not part of this rule.
  lines.forEach((line, index) => {
    if (/\.(?:play|writeText)\s*\(/.test(line) && !/AudioSys\.play\s*\(/.test(line) &&
        !/\b(?:await|return|void)\b|\bconst\s+\w+\s*=|\.then\s*\(|\.catch\s*\(/.test(line)) {
      fail(file, index + 1, 'no-floating-promise', 'await, return, assign, or explicitly handle the promise');
    }
  });

  // Existing calls are approved fault reporting. Any new console call must
  // either use one of these signatures or be added here in a reviewed change.
  lines.forEach((line, index) => {
    if (!/\bconsole\.(?:log|warn|error|info|debug)\s*\(/.test(line)) return;
    const approved =
      /JIPTL: no such target|CIC: |console\.error\(e\)|raid fx failed|csar fx failed|scope animation failed/.test(line);
    if (!approved) fail(file, index + 1, 'no-unapproved-console', 'route through approved fault reporting');
  });

  // Catch the common accidental-global shape: assignment to a bare identifier
  // that is never declared anywhere in that classic script. This conservative
  // whole-file check avoids pretending to be a full scope analyzer.
  const declared = declaredNames(clean);
  cleanLines.forEach((line, index) => {
    const assignments = /(^|[^.\w$])([A-Za-z_$][\w$]*)\s*(?:\+\+|--|[+\-*/%]?=(?!=|>))/g;
    let match;
    while ((match = assignments.exec(line))) {
      const name = match[2];
      if (!declared.has(name)) fail(file, index + 1, 'no-accidental-global', `"${name}" is assigned but never declared`);
    }
  });
}

// Classic scripts share one global lexical environment in the browser. Each
// file can pass `node --check` on its own while two files still declare the
// same top-level `const`; compiling index.html's ordered bundle catches that
// blank-page failure without introducing a build step.
try {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const scriptPaths = [...html.matchAll(/<script src="([^"]+\.js)(?:\?[^\"]*)?"/g)]
    .map((match) => match[1]);
  const combined = scriptPaths.map((scriptPath) => fs.readFileSync(path.join(ROOT, scriptPath), 'utf8')).join('\n');
  new vm.Script(combined, { filename: 'index.html classic scripts' });
} catch (error) {
  failures.push(`index.html:1  no-duplicate-global-declarations  ${error.message}`);
}

if (failures.length) {
  console.error(`lint failed with ${failures.length} violation(s):\n\n${failures.join('\n')}`);
  process.exit(1);
}

console.log(`lint passed (${files.length} classic scripts)`);
