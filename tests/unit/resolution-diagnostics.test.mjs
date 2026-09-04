import assert from 'node:assert/strict';
import test from 'node:test';
import { start } from '../support/campaign.mjs';

test('turn resolution exposes each committed stage and returns to idle', () => {
  const { api } = start(4401, 'normal');
  const { Game } = api;

  assert.equal(Game.resolutionStatus().stage, 'idle');
  Game.endTurn();

  const status = Game.resolutionStatus();
  assert.equal(status.stage, 'idle');
  assert.equal(status.lastCommitted, 'close');
  assert.deepEqual(
    Array.from(status.history)
      .filter((entry) => entry.type === 'complete')
      .map((entry) => entry.stage),
    [
      'idle',
      'opening-call',
      'allied-missions',
      'bda',
      'allied-event',
      'iranian-response',
      'retaliation-report',
      'close',
    ],
  );
});
