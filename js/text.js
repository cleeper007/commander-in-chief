// ============================================================
// text.js — counted nouns and signed numbers
// ============================================================
// Loaded first, before anything that writes prose. These three helpers used to
// live inside UI's IIFE, where nothing else could reach them — so ai.js, csar.js
// and specops.js each open-coded `n === 1 ? '' : 's'` at the point of use, or
// forgot to. That is how the battle report came to say "1 Americans were
// killed" on a night the Aegis screen did its job. Prose with a number in it is
// written in four modules; the rule for counting has to live in one.

const Txt = (() => {
  // Nouns that do not take a plural -s. A blanket +s gives "2 aircrafts", so
  // the exceptions are listed rather than guessed at.
  const INVARIANT = ['aircraft', 'personnel'];

  // A sibilant takes -es: "3 addresses", not "3 addresss" — which is what the
  // ADDRESS THE NATION panel printed for eight months.
  const SIBILANT = /(s|x|z|ch|sh)$/i;

  // Consonant + y takes -ies: "6 categories", not "6 categorys" — which is what
  // the after-action screen printed the first night it counted its own graded
  // categories. A VOWEL + y is a plain -s ("2 turkeys"), which is why the class
  // is spelled out rather than written as \w.
  const CONSONANT_Y = /[^aeiou]y$/i;

  // Stems no rule reaches. Keyed on the last word, so "American life" inflects
  // as "American lives" and the adjective comes along for free.
  // "2 crewmans" is what the southern front's shipping report printed the first
  // night a hull was hit with people still aboard.
  const IRREGULAR = { life: 'lives', person: 'people', crewman: 'crewmen' };

  // The noun alone, correctly counted. For prose that puts the number somewhere
  // other than immediately in front of the word ("a single aviator", "both
  // aircrew"), or does not show it at all.
  // Everything inflects on the LAST word, so a modifier in front of the noun
  // ("tanker track", "American life") comes along for free and no caller has to
  // split the phrase up itself.
  const pluralize = (n, word) => {
    if (n === 1) return word;
    const head = word.slice(word.lastIndexOf(' ') + 1);
    if (INVARIANT.includes(head)) return word;
    if (IRREGULAR[head]) return word.slice(0, word.length - head.length) + IRREGULAR[head];
    if (CONSONANT_Y.test(head)) return word.slice(0, -1) + 'ies';
    return word + (SIBILANT.test(head) ? 'es' : 's');
  };

  // The usual case: number, space, correctly counted noun.
  const plural = (n, word) => `${n} ${pluralize(n, word)}`;

  // "1 turn" / "3 turns" without a thing being counted — for the ETA lines that
  // read "3 turns out" rather than counting a noun.
  const turns = (n) => plural(n, 'turn');

  // Verb agreement for the noun just counted. A casualty figure is not fixed at
  // the moment the sentence is written — the Aegis screen can thin a salvo from
  // twelve dead to one between the event being built and the report being read
  // — so the verb has to be chosen at the same time as the number, not before.
  const were = (n) => (n === 1 ? 'was' : 'were');
  const are = (n) => (n === 1 ? 'is' : 'are');

  // Ordinals as words up to tenth, which is further than anything in this game
  // needs to count. Past that a numeral is less silly than the word.
  const ORDINAL = ['zeroth', 'first', 'second', 'third', 'fourth', 'fifth',
    'sixth', 'seventh', 'eighth', 'ninth', 'tenth'];
  const ordinal = (n) => {
    if (ORDINAL[n]) return ORDINAL[n];
    const r = n % 100;
    return n + (r >= 11 && r <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th');
  };

  // ---- THE CAMPAIGN CLOCK ----
  // Two turns a day, twelve hours apart, and the clock is WASHINGTON'S. The
  // player is the president in the White House, not the CAOC in Qatar, so the
  // bar reads the time it is where the decision is being made rather than the
  // time it is where the aircraft are. Turn 1 is 20:00 ET: the campaign opens
  // in the evening, which is what makes every sentence in this game about
  // tonight's tasking order literally true of the first one.
  //
  // The pairing therefore runs EVENING then MORNING, and the date rolls over
  // BETWEEN the two halves of a turn-pair rather than after them — which is why
  // this is floor+1 and not the ceil(turn / 2) it replaced. Under ceil, turn 1
  // printed DAY 1 — 20:00 and turn 2 printed DAY 1 — 08:00, one line reading as
  // twelve hours of time running backwards. Thirty turns is fifteen days and
  // twelve hours of war, so it touches sixteen dates; the campaign is still the
  // fifteen days G's comment claims.
  const day = (turn) => Math.floor(turn / 2) + 1;
  const hour = (turn) => (turn % 2 === 1 ? '20:00' : '08:00');
  const stamp = (turn) => `DAY ${day(turn)} — ${hour(turn)}`;

  // Whether the package launches into the dark — a fact about TEHRAN, not about
  // the clock above it, and the two now disagree. Iran runs seven and a half
  // hours ahead of Washington: 20:00 ET is 03:30 over the target, the deep
  // pre-dawn window a strike package wants, and 08:00 ET is the middle of their
  // afternoon. So the ODD turns are the night ones, the reverse of what the
  // 06:00 / 18:00 theater-local clock this replaced implied. csar.js's recovery
  // odds read it from here rather than restating the parity in a comment beside
  // a magic number, which is how that comment came to describe a clock the game
  // no longer keeps.
  const night = (turn) => turn % 2 === 1;

  // A signed cost, typeset. The tuning tables store plain JS numbers, so a
  // world-opinion cost interpolated raw arrives as a hyphen-minus ("-1") and
  // sits next to a real minus ("−45") two lines up in the same panel. Every
  // signed number the player reads goes through here.
  const MINUS = '−';
  const signed = (n) => (n > 0 ? '+' : MINUS) + Math.abs(n);

  return { plural, pluralize, turns, were, are, ordinal, signed, MINUS,
    day, hour, stamp, night };
})();
