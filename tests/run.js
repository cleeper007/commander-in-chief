'use strict';

const path = require('path');
const { spawnSync } = require('child_process');

const tests = [
  'test_random.js',
  'test_rules.js',
  'test_resolution.js',
];

for (const test of tests) {
  const result = spawnSync(process.execPath, [path.join(__dirname, test)], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status || 1);
}

console.log(`all ${tests.length} test files passed`);
