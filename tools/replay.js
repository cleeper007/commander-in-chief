#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { ready } = require('../tests/support/headless');

function usage() {
  console.error('Usage: node tools/replay.js <decision-script.json>');
  process.exitCode = 2;
}

const name = process.argv[2];
if (!name) {
  usage();
} else {
  try {
    const filename = path.resolve(process.cwd(), name);
    const fixture = JSON.parse(fs.readFileSync(filename, 'utf8'));
    const script = fixture.script || fixture;
    const harness = ready();
    const result = harness.api.CampaignReplay.run(script);
    const digest = crypto.createHash('sha256').update(JSON.stringify(result)).digest('hex');

    if (fixture.expected) {
      const actual = JSON.stringify(result);
      const expected = JSON.stringify(fixture.expected);
      if (actual !== expected) {
        console.error(`Replay diverged from fixture: ${filename}`);
        console.error(`expected: ${JSON.stringify(fixture.expected, null, 2)}`);
        console.error(`actual:   ${JSON.stringify(result, null, 2)}`);
        process.exitCode = 1;
      } else {
        console.log(`Replay matched fixture through turn ${result.turn}: seed ${result.seed}`);
      }
    } else if (fixture.expectedDigest) {
      if (digest !== fixture.expectedDigest) {
        console.error(`Replay diverged from fixture: ${filename}`);
        console.error(`expected digest: ${fixture.expectedDigest}`);
        console.error(`actual digest:   ${digest}`);
        console.error(JSON.stringify(result, null, 2));
        process.exitCode = 1;
      } else {
        console.log(`Replay matched fixture through turn ${result.turn}: seed ${result.seed} · ${digest.slice(0, 12)}`);
      }
    } else {
      console.log(JSON.stringify(result, null, 2));
    }
  } catch (error) {
    console.error(error && error.stack || error);
    process.exitCode = 1;
  }
}
