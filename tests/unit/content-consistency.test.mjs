import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { plain, start } from '../support/campaign.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (file) => readFileSync(path.join(ROOT, file), 'utf8');
const index = read('index.html');
const readme = read('README.md');
const facts = read('docs/CANONICAL-FACTS.md');
const gameSource = read('js/game.js');
const tourSource = read('js/tour.js');
const compact = (value) => value.replace(/\s+/g, ' ');

test('opening incident and campaign clock agree across copy and live state', () => {
  const { api } = start(1601, 'normal');
  assert.match(index, /0340 ZULU[\s\S]{0,180}Ain al-Asad Air Base[\s\S]{0,100}Seven Americans are dead/);
  assert.match(readme, /Ain al-Asad Air Base in Iraq, killing seven\s+Americans/);
  assert.match(facts, /0340 Zulu[\s\S]{0,120}Ain al-Asad Air Base[\s\S]{0,100}seven Americans/);
  assert.equal(api.Game.G.casualties.us, 7);
  assert.equal(api.Game.G.softCap, 30);
  assert.equal(api.Game.WAR_POWERS_TURN, 10);
  assert.equal(api.Txt.stamp(1), 'DAY 1 — 20:00');
  assert.equal(api.Txt.stamp(30), 'DAY 16 — 08:00');

  for (const [name, copy] of Object.entries({ index, readme, gameSource, tourSource })) {
    assert.doesNotMatch(copy, /\bAl Asad\b/i, `${name} reverted the opening-base name`);
  }
  assert.doesNotMatch(readme, /around turn 13|30 turns expire|hard stop at turn 30|whole war is thirty turns/i);
  assert.doesNotMatch(tourSource, /war lasts thirty turns|whole war is thirty turns/i);
});

test('starting force disposition and mode ownership match the facts sheet', () => {
  const { api } = start(1602, 'normal');
  const { Game } = api;
  const lincoln = Game.G.carriers.find((carrier) => carrier.id === 'csg-lincoln');
  const ford = Game.G.carriers.find((carrier) => carrier.id === 'csg-ford');
  assert.deepEqual(plain({ arrived: lincoln.arrived, posture: lincoln.posture }),
    { arrived: true, posture: 'forward' });
  assert.deepEqual(plain({ arrived: ford.arrived, ordered: Game.G.secondCarrierOrdered }),
    { arrived: false, ordered: false });
  assert.equal(Game.G.bombersArrived, false);
  assert.equal(Game.G.heaviesArrived, false);
  assert.equal(Game.FORD_TRANSIT_TURNS, 5);
  assert.equal(Game.B2_TRANSIT_TURNS, 1);
  assert.equal(Game.HEAVY_TRANSIT_TURNS, 2);

  for (const phrase of [
    'Gulf of Oman', 'eastern Mediterranean', 'Red Sea', 'Whiteman AFB',
    'Diego Garcia', 'Dyess AFB', 'Barksdale AFB', 'RAF Fairford',
  ]) {
    assert.ok(compact(facts).includes(phrase), `facts sheet omits ${phrase}`);
    assert.ok(compact(readme).includes(phrase), `README omits ${phrase}`);
  }
  assert.ok(compact(facts).includes(
    'Easy mode automates the theater buildup. Normal and hard require deployment orders',
  ));
});

test('victory and loss conditions use the live thresholds', () => {
  const thresholds = Object.fromEntries(['easy', 'normal', 'hard'].map((difficulty, index) => {
    const { api } = start(1610 + index, difficulty);
    return [difficulty, {
      casualties: api.Game.casualtyLimit(),
      collapse: api.Game.collapseAt(),
    }];
  }));
  assert.deepEqual(plain(thresholds), {
    easy: { casualties: 320, collapse: 24 },
    normal: { casualties: 250, collapse: 20 },
    hard: { casualties: 190, collapse: 16 },
  });
  assert.match(facts, /100% enrichment-program degradation[\s\S]{0,220}missile force[\s\S]{0,80}navy[\s\S]{0,80}IRGC command/);
  assert.match(facts, /four-turn assembly\s+window/);
  assert.ok(compact(facts).includes('easy 320, normal 250, hard 190'));
  assert.ok(compact(facts).includes('easy 24, normal 20, hard 16'));
  assert.match(facts, /12 cumulative turns/);
  assert.equal(start(1620, 'normal').api.Game.HORMUZ_LIMIT, 12);
  assert.match(gameSource, /every declared and undeclared enrichment hall as functionally destroyed/);
  assert.match(gameSource, /the navy neutralized/);
});

test('advisor identities, target identities, and abbreviations have one canonical spelling', () => {
  const { api } = start(1630, 'normal');
  assert.deepEqual(plain(api.IranAI.advise().map((advisor) => advisor.name)), [
    'SecDef Whitfield', 'SecState Okafor', 'NSA Reyes', 'Gen. Halvorsen, CJCS',
  ]);
  const people = {
    'SecDef Whitfield': 'Secretary of Defense',
    'SecState Okafor': 'Secretary of State',
    'NSA Reyes': 'National Security Advisor',
    'Gen. Halvorsen, CJCS': 'Chairman of the Joint Chiefs of Staff',
  };
  for (const [name, office] of Object.entries(people)) {
    assert.ok(facts.includes(name), `facts sheet omits ${name}`);
    assert.ok(facts.includes(office), `facts sheet omits ${office}`);
  }

  const criticalIds = ['natanz', 'fordow', 'nuc-covert', 'irgc-hq', 'msl-covert', 'naval-covert'];
  for (const id of criticalIds) {
    const target = api.TARGETS.find((candidate) => candidate.id === id);
    assert.ok(target, `missing target ${id}`);
    assert.ok(facts.includes(target.name), `facts sheet omits canonical target name ${target.name}`);
    if (target.region) {
      assert.ok(facts.includes(target.region), `facts sheet omits canonical location ${target.region}`);
    }
  }

  const terms = {
    ATO: 'Air Tasking Order', BDA: 'Battle Damage Assessment',
    BMD: 'Ballistic Missile Defense', CAOC: 'Combined Air Operations Center',
    CENTCOM: 'United States Central Command', CJCS: 'Chairman of the Joint Chiefs of Staff',
    CSG: 'Carrier Strike Group', GCC: 'Gulf Cooperation Council',
    IAF: 'Israeli Air Force', IRGC: 'Islamic Revolutionary Guard Corps',
    ISR: 'Intelligence, Surveillance, and Reconnaissance',
    PGM: 'Precision-Guided Munition', SAM: 'Surface-to-Air Missile',
    SEAD: 'Suppression of Enemy Air Defenses', TLAM: 'Tomahawk Land Attack Missile',
  };
  for (const [term, meaning] of Object.entries(terms)) {
    assert.ok(facts.includes(`| ${term} | ${meaning}`), `facts sheet omits ${term}`);
  }
});

test('release badge, cache stamps, beta copy, and mode availability agree', () => {
  const version = index.match(/<div class="version-badge">v([^<]+)/)?.[1];
  assert.equal(version, '2.40');
  assert.match(index, /version-badge">v2\.40<span class="beta-tag">BETA/);
  assert.match(readme, /\*\*Beta, actively developed\.\*\*/);
  assert.match(facts, /Current playable build: \*\*v2\.40\*\*/);
  assert.match(facts, /Status: \*\*BETA — actively developed\*\*/);

  const cacheVersions = [...index.matchAll(/(?:src|href)="(?:css|js)\/[^"?]+\?v=([0-9.]+)"/g)]
    .map((match) => match[1]);
  assert.ok(cacheVersions.length > 10, 'primary app cache stamps were not found');
  assert.deepEqual([...new Set(cacheVersions)], ['2.40']);

  const { api } = start(1640, 'normal');
  assert.equal(api.DIFFICULTY.normal.soon, true);
  assert.equal(api.DIFFICULTY.easy.soon, undefined);
  assert.equal(api.DIFFICULTY.hard.soon, undefined);
  assert.match(facts, /Easy and hard are playable\. Normal is implemented[\s\S]{0,100}COMING SOON/);
});
