'use strict';

const assert = require('assert');
const { Random } = require('../js/random.js');

Random.seed('phase-3-domain-test');
const initial = Random.state();
const first = [Random.float(), Random.int(10, 12), Random.pick(['a', 'b', 'c'])];
const after = Random.state();

assert.strictEqual(initial.calls, 0);
assert.strictEqual(after.calls, 3);
assert(first[0] >= 0 && first[0] < 1);
assert(first[1] >= 10 && first[1] <= 12);
assert(['a', 'b', 'c'].includes(first[2]));

Random.restore(initial);
assert.deepStrictEqual(
  [Random.float(), Random.int(10, 12), Random.pick(['a', 'b', 'c'])],
  first,
  'restoring RNG state must reproduce the exact draw sequence'
);

assert.throws(() => Random.int(2, 1), /integer bounds/);
assert.throws(() => Random.pick([]), /non-empty array/);

console.log('random domain: all tests passed');
