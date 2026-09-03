import { ready } from '../support/campaign.mjs';

const RUNS_PER_DIFFICULTY = Number(process.env.CIC_SWEEP_RUNS || 30);
const MAX_TURNS = Number(process.env.CIC_SWEEP_TURNS || 30);
const results = [];

for (const [difficultyIndex, difficulty] of ['easy', 'normal', 'hard'].entries()) {
  for (let run = 0; run < RUNS_PER_DIFFICULTY; run++) {
    const harness = ready();
    const { Game } = harness.api;
    const seed = 700000 + difficultyIndex * 10000 + run;
    Game.startCampaign(difficulty, seed);
    while (!Game.G.over && Game.G.turn <= MAX_TURNS) {
      const choice = Game.coaOptions()[0];
      if (choice) Game.takeCoa(choice.id);
      const before = Game.G.turn;
      Game.endTurn();
      if (Game.busy() || (!Game.G.over && Game.G.turn === before)) {
        throw new Error(`sweep stalled: ${difficulty} seed ${seed} turn ${before}`);
      }
      Game.assertInvariants(`balance sweep ${difficulty} seed ${seed}`);
    }
    results.push({
      difficulty, seed, turn: Game.G.turn, over: Game.G.over,
      approval: +Game.G.approval.toFixed(2), world: +Game.G.world.toFixed(2),
      destroyed: Game.G.stats.destroyed, casualties: Game.G.casualties.us,
    });
  }
}

const grouped = Object.fromEntries(['easy', 'normal', 'hard'].map((difficulty) => {
  const rows = results.filter((row) => row.difficulty === difficulty);
  const mean = (key) => +(rows.reduce((sum, row) => sum + row[key], 0) / rows.length).toFixed(2);
  return [difficulty, {
    runs: rows.length,
    campaignsEnded: rows.filter((row) => row.over).length,
    meanTurn: mean('turn'), meanApproval: mean('approval'),
    meanWorld: mean('world'), meanDestroyed: mean('destroyed'),
    totalCasualties: rows.reduce((sum, row) => sum + row.casualties, 0),
  }];
}));

process.stdout.write(`${JSON.stringify({ generatedAt: new Date().toISOString(), grouped })}\n`);
