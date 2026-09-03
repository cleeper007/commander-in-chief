import assert from 'node:assert/strict';
import test from 'node:test';
import { plain, reveal, start, targetState } from '../support/campaign.mjs';

function board(seed) {
  const harness = start(seed, 'hard');
  const { Game, TARGETS } = harness.api;
  for (const target of TARGETS) {
    reveal(target);
    if (target.type === 'airdefense' || target.type === 'airbase') targetState(target, 0);
  }
  for (const key of Object.keys(Game.G.caps)) {
    Game.G.caps[key] = 50;
    Game.G.res[key] = 50;
  }
  Game.G.bombersArrived = true;
  Game.G.heaviesArrived = true;
  Game.G.tankerCap = 100;
  Game.G.tankers = 100;
  Game.G.tlamPool = 100;
  Game.G.pgm = 1000;
  Game.G.atoPlan = 20;
  return harness;
}

function ledger(G) {
  return plain({
    res: G.res,
    tankers: G.tankers,
    tlamPool: G.tlamPool,
    torpedoes: G.torpedoes,
    nsmPool: G.nsmPool,
    bmdPool: G.bmdPool,
    pgm: G.pgm,
    strikesThisTurn: G.strikesThisTurn,
    fatigue: G.fatigue,
    statsStrikes: G.stats.strikes,
    adapt: G.adapt,
    sorties: G.aircrew.map((crew) => crew.sorties),
    missions: G.missions.length,
  });
}

function assertOrderAndExactRecall(harness, targetId, choose, verifySpend) {
  const { Game, TARGETS } = harness.api;
  const target = TARGETS.find((item) => item.id === targetId);
  const pkg = target.packages.find(choose);
  assert.ok(pkg, `no matching package on ${targetId}`);
  const before = ledger(Game.G);
  Game.executeStrike(target, pkg);
  assert.equal(Game.G.missions.length, 1, `package on ${targetId} was refused`);
  verifySpend(before, ledger(Game.G), pkg, Game);
  assert.equal(Game.recallMission(0), true);
  assert.deepEqual(ledger(Game.G), before, `recall did not restore the ${targetId} ledger exactly`);
}

test('fighter packages spend tanker, sortie, PGM, aircrew, and tasking ledgers', () => {
  const harness = board(1301);
  assertOrderAndExactRecall(harness, 'ad-tehran', (pkg) => pkg.asset === 'fighter', (before, after, pkg, Game) => {
    assert.equal(after.res.fighters, before.res.fighters - pkg.qty);
    assert.equal(after.tankers, before.tankers - Game.tankersFor(
      harness.api.TARGETS.find((item) => item.id === 'ad-tehran'), pkg).cost);
    assert.equal(after.pgm, before.pgm - Game.pgmCost(pkg));
    assert.ok(after.sorties.some((value, index) => value > before.sorties[index]));
    assert.equal(after.strikesThisTurn, before.strikesThisTurn + 1);
  });
});

test('Tomahawks spend both ready launchers and the finite theater pool', () => {
  const harness = board(1302);
  assertOrderAndExactRecall(harness, 'ad-tehran', (pkg) => pkg.asset === 'cruise' && !pkg.escort && !pkg.sub,
    (before, after, pkg) => {
      assert.equal(after.res.cruise, before.res.cruise - pkg.qty);
      assert.equal(after.tlamPool, before.tlamPool - pkg.qty);
    });
});

test('torpedo, NSM, and SM-6 packages debit only their own magazines', async (t) => {
  const cases = [
    ['torpedo', 'ship-mahdavi', (pkg) => pkg.sub, 'torpedoes'],
    ['NSM', 'naval-covert', (pkg) => pkg.escort === 'nsm', 'nsmPool'],
    ['SM-6', 'ship-mahdavi', (pkg) => pkg.escort === 'sm6', 'bmdPool'],
  ];
  for (let index = 0; index < cases.length; index++) {
    const [name, target, choose, field] = cases[index];
    await t.test(name, () => {
      const harness = board(1310 + index);
      assertOrderAndExactRecall(harness, target, choose, (before, after, pkg) => {
        assert.equal(after[field], before[field] - pkg.qty);
        assert.equal(after.tlamPool, before.tlamPool, `${name} incorrectly spent Tomahawks`);
        assert.equal(after.res.cruise, before.res.cruise, `${name} incorrectly spent ready launchers`);
      });
    });
  }
});

test('BMD engagement consumes a bounded interceptor magazine', () => {
  const harness = start(1320, 'normal');
  const { Game } = harness.api;
  const before = Game.G.bmdPool;
  const shot = plain(Game.bmdEngage(3));
  assert.ok(shot.fired > 0 && shot.fired <= before);
  assert.equal(Game.G.bmdPool, before - shot.fired);
  Game.assertInvariants('BMD engagement');
});
