import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { ready } from '../support/campaign.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const corpus = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/fixtures/phase2-campaigns.json'), 'utf8'));
const baseline = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/baselines/phase2-campaigns.json'), 'utf8'));

for (const scenario of corpus) {
  test(`fixed-seed campaign: ${scenario.id}`, () => {
    const harness = ready();
    const summary = harness.api.CampaignReplay.run(scenario.script);
    harness.api.Game.assertInvariants(`fixed-seed campaign ${scenario.id}`);
    assert.deepEqual(JSON.parse(JSON.stringify(summary)), baseline[scenario.id]);
  });
}
