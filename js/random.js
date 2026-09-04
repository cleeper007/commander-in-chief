// ============================================================
// random.js — reproducible campaign randomness
// ============================================================
//
// Random is the only source of gameplay randomness. Its complete state is a
// small JSON object, so a save can resume at the exact next draw and a reported
// campaign can be replayed from its original seed.
//
// CosmeticRandom is deliberately a different stream. Animation, audio-track
// selection and other presentation-only variation may use it freely without
// moving the campaign generator by a single draw.

const Random = (() => {
  const STEP = 0x6D2B79F5;
  let initial = 0;
  let current = 0;
  let calls = 0;
  let ready = false;

  function hash(value) {
    if (typeof value === 'number' && Number.isFinite(value)) return value >>> 0;
    const text = String(value);
    let h = 0x811C9DC5;
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
  }

  function freshSeed() {
    try {
      if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
        const word = new Uint32Array(1);
        crypto.getRandomValues(word);
        return word[0] >>> 0;
      }
    } catch (e) { /* fall through to the portable entropy source */ }

    // Math.random is allowed only here, while creating a NEW campaign seed.
    // It never generates a campaign outcome and is never called after seed().
    const time = Date.now() >>> 0;
    const jitter = typeof performance !== 'undefined' && performance.now
      ? Math.floor(performance.now() * 1000) >>> 0 : 0;
    return hash(`${time}:${jitter}:${Math.random()}`);
  }

  function seed(value) {
    initial = hash(value === undefined ? freshSeed() : value);
    current = initial;
    calls = 0;
    ready = true;
    return initial;
  }

  function float() {
    if (!ready) seed();
    current = (current + STEP) >>> 0;
    let t = current;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    calls++;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  function int(min, max) {
    if (!Number.isInteger(min) || !Number.isInteger(max) || max < min) {
      throw new RangeError('Random.int requires integer bounds with min <= max');
    }
    return min + Math.floor(float() * (max - min + 1));
  }

  function pick(array) {
    if (!Array.isArray(array) || array.length === 0) {
      throw new RangeError('Random.pick requires a non-empty array');
    }
    return array[int(0, array.length - 1)];
  }

  function chance(probability) {
    if (!Number.isFinite(probability)) throw new RangeError('Random.chance requires a finite probability');
    // Draw even at 0 and 1. A call to the API always consumes exactly one draw,
    // which makes refactors visible instead of conditionally shifting the stream.
    // Some simulation odds are deliberately multiplied past certainty; clamp
    // those the same way `random < p` did instead of turning a sure event into
    // an exception.
    return float() < Math.min(1, Math.max(0, probability));
  }

  function state() {
    return { seed: initial >>> 0, state: current >>> 0, calls };
  }

  function restore(saved) {
    if (!saved || !Number.isInteger(saved.seed) || !Number.isInteger(saved.state) ||
        !Number.isInteger(saved.calls) || saved.calls < 0) {
      throw new TypeError('Random.restore requires a valid Random.state() value');
    }
    initial = saved.seed >>> 0;
    current = saved.state >>> 0;
    calls = saved.calls;
    ready = true;
    return state();
  }

  // Compact, editable and sufficient to identify the precise next draw. The
  // campaign seed remains separate because it is the human-facing replay key.
  function token() {
    const s = state();
    return `${s.state.toString(36)}-${s.calls.toString(36)}`;
  }

  return { seed, float, int, pick, chance, state, restore, token, freshSeed };
})();

const CosmeticRandom = (() => {
  const float = () => Math.random();
  const int = (min, max) => min + Math.floor(float() * (max - min + 1));
  const pick = (array) => array[int(0, array.length - 1)];
  const chance = (probability) => float() < probability;
  return { float, int, pick, chance };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { Random, CosmeticRandom };
}
