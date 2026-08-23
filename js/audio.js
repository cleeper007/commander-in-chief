// ============================================================
// audio.js — sound effects: preload, play, mute toggle
// ============================================================
// Clips live in /audio (synthesized in-house, royalty-free). Every path
// here fails silently — a missing file or blocked autoplay never breaks
// the game.

const AudioSys = (() => {
  const FILES = {
    launch: 'launch.wav',           // strike package launched
    impact: 'impact.wav',           // strike impact / BDA
    aircraftLost: 'aircraft-lost.wav',
    retaliation: 'retaliation.wav', // Iranian retaliation alert
    klaxon: 'klaxon.wav',           // Hormuz closes / casualties cross 100
    cable: 'cable.wav',             // diplomatic cable
    sonarPing: 'sonar-ping.wav',    // Mk-48 seeker going active on the sonar scope
    // The title screen handing off to the situation room: one cinematic sting
    // under the board coming up, played once as the war opens.
    gameStart: 'game-start.mp3',
    victory: 'victory.wav',
    defeat: 'defeat.wav',
    // Voice traffic — watch-floor calls on the moments that change the board.
    fordArrival: 'ford-arrival.mp3',            // Ford checks in with Fifth Fleet
    b2Arrival: 'b2-arrival.mp3',                // 509th on the ramp at Diego Garcia
    strikeForce: 'strike-force-initiated.mp3',  // the night's packages step off
    hormuzClosure: 'hormuz-closure.mp3',        // the strait slams shut
    targetMarked: 'target-marked.mp3',          // a package is authorized onto a target
    // The deck getting under way, in two beats: the sea alongside her, then the
    // floor reading the order back. The wash is a NOISE — no VOICE row, nothing
    // to caption — and it is one wave rather than a signal blast: in at -40 dB,
    // up to -23 across the middle two seconds, and fading out on its own by the
    // end. That shape is what the read-back's offset is measured against — see
    // REPOSITION_READBACK_MS in game.js, which puts the voice in the decay with
    // the swell still under it rather than after the sea has gone.
    shipUnderway: 'ship-underway.mp3',           // ~5.0 s
    carrierReposition: 'carrier-reposition.mp3', // the deck ordered to a new station
    bdaReport: 'bda-report.mp3',                // the damage assessment lands on the table
    // The staff at the door of the folder, on the one level that has a folder:
    // played off READY FOR OPTIONS and nowhere else. Deliberately NOT in VOICE
    // below, and it is the first spoken clip that isn't — the watch card is
    // drawn on the map, and the dialog this announces covers the map a beat
    // later, so a card raised here would be a caption behind the thing it is
    // captioning. What it says is also the only thing in the game already
    // written on the control that fired it, which is the other half of why the
    // transcript rule exists at all. ~2.2 s.
    briefReady: 'brief-ready.mp3',
    // Rotor wash and interphone under the JSOC infil. ~28s, which is the length
    // of the infil sequence in specops.js — it runs out on its own as the team
    // hits the ramp, so the branch beats after the objective play into silence.
    raidInfil: 'spec-ops-infil.m4a',
    // Heads of government on the secure line once the coalition forms. Played
    // through playThen so the popup can hold the "line open" state for exactly
    // as long as the leader is actually talking. Two takes each — the `Strong`
    // ones play when world opinion was above LEADER_STRONG_WORLD when the
    // coalition formed (see WORLD_LEADERS in data.js).
    ukPmCall: 'uk-pm-call.mp3',                      // ~11.2 s
    francePmCall: 'france-pm-call.mp3',              // ~4.7 s
    ukPmCallStrong: 'uk-pm-call-strong.mp3',         // ~7.4 s
    francePmCallStrong: 'france-pm-call-strong.mp3', // ~8.2 s
    // ...and the one call that is not a courtesy. Jerusalem, one turn out from
    // launching, on the same secure line and through the same popup — which is
    // the whole reason that popup was built to take a leader off a data table
    // rather than off a hardcoded pair. See WORLD_LEADERS in data.js.
    israelPmCall: 'israel-pm-call.mp3',              // ~7.5 s
    // The switchboard, ringing under the incoming-call popup until it is
    // answered or declined. Looped by hand — see ringStart.
    phoneRing: 'phone-ring.m4a',   // ~2.3 s
    // The two halves of the one night the arrays see a device. The alarm runs
    // under the NSA's request for the room and does NOT stop until the meeting
    // is taken — looped on the element, which is the choice ringStart argues
    // against and is the right one here: what that comment calls "a fire alarm,
    // not a telephone" is, this once, a fire alarm. ~1.5 s.
    nukeAlarm: 'nuclear-alert.mp3',
    // ...and the National Security Advisor, over the test footage. Deliberately
    // NOT in VOICE below, for the same reason the leader calls are not: the
    // dialog it plays under covers the map, so a watch card raised here would
    // be a caption behind the thing it is captioning, and its transcript is on
    // screen in that dialog where it reads. ~10.9 s.
    nsaCall: 'nsa-nuclear-call.mp3',
  };

  // ---- WHO IS TALKING ----
  // The six clips below are the only recordings in the game with words in them,
  // and this table is the whole hook for the watch card in the corner of the
  // map: a clip listed here raises the card automatically from inside play()
  // and playThen(), and a clip not listed here is a noise and gets nothing. A
  // seventh voice clip needs a row and nothing else.
  //
  // `says` is a TRANSCRIPT, not a paraphrase, because with sound off — or for a
  // player who cannot hear it at all — this line is the only place the content
  // exists. Everything else the game says, it also writes down somewhere.
  //
  // ON ATTRIBUTION. Not one of the recordings names its speaker, and only three
  // of the six are even addressed to the President. So the card is titled for
  // the ROOM and the speaker line carries a BILLET rather than a person. The
  // tempting alternative was to hang all six on Gen. Halvorsen — he is the only
  // officer this game has named, and the sidebar has already given the player a
  // face for him. It is false twice over. The Chairman does not key a strike
  // net to say "target marked" and does not carry a BDA product across the
  // floor; those are a controller and the intelligence watch, and putting his
  // name on them would be the kind of small lie nothing else in here tells.
  // He is also, in this game, an advisor who argues with the president, which
  // is a different job from a duty officer reading traffic aloud.
  //
  // Four of them share the DDO — the officer who actually runs the NMCC watch
  // and whose job is to speak to the National Command Authority — because they
  // are all the same act: the floor reporting a change on the board. Splitting
  // them across four invented speakers to make the card look varied would be
  // the same lie in a smaller font.
  const VOICE = {
    fordArrival: {
      who: 'DEPUTY DIRECTOR FOR OPERATIONS',
      says: 'Sir, the Gerald R. Ford Carrier Strike Group has arrived in theater.',
    },
    b2Arrival: {
      who: 'DEPUTY DIRECTOR FOR OPERATIONS',
      says: 'Sir, stealth bombers have arrived at Diego Garcia.',
    },
    strikeForce: {
      who: 'DEPUTY DIRECTOR FOR OPERATIONS',
      says: 'Mr. President, the order has been received and authenticated. ' +
            'Strike forces are moving into position.',
    },
    hormuzClosure: {
      who: 'DEPUTY DIRECTOR FOR OPERATIONS',
      says: 'Mr. President, Iran has moved to close the Strait of Hormuz.',
    },
    // Not addressed to the President either: the floor reading back an order
    // that has just gone out to Fifth Fleet, which is the same act as the four
    // rows above it and takes the same billet rather than an invented maritime
    // watch. ~2.1 s.
    carrierReposition: {
      who: 'DEPUTY DIRECTOR FOR OPERATIONS',
      says: 'Repositioning carrier strike group.',
    },
    // Not addressed to anybody: a controller keying a net to acknowledge that
    // the aimpoint is now on the tasking. One second of audio, which is why the
    // card holds after the voice stops — see voiceDown in ui.js.
    targetMarked: { who: 'STRIKE CONTROL', says: 'Target marked.' },
    // The product changing hands, not the assessment itself. What it says is
    // that the BDA is ready; what it is ready to say is on the screen behind it.
    bdaReport: { who: 'J2 — INTELLIGENCE WATCH', says: 'Battle damage assessment is ready.' },
  };

  // Per-clip playback level, 0..1. Anything not listed plays at full volume.
  // The klaxon rides under the Hormuz closure call rather than over it — at
  // full gain it buried the voice and simply hurt.
  const VOLUME = {
    klaxon: 0.25,
    // Ambience, not an event: the rotors sit under the launch SFX and the feed
    // rather than on top of them.
    raidInfil: 0.6,
    // The one clip in here that does not stop by itself. Everything else is a
    // burst the player waits out; this runs until the meeting is taken, and at
    // the gain a one-shot klaxon can afford it is punishing rather than urgent.
    nukeAlarm: 0.45,
  };

  // Mission tracks: looping background music that plays while a jet's radar
  // scope is on screen. One is picked at random each time the music starts.
  //
  // It is a BED, not an event, and until v1.78 it was the one bed that never
  // got out of anything's way: it played at full gain and stayed there while
  // the watch floor talked over the top of it. On a phone — where the strike
  // footage and the voice calls are already fighting a single small speaker —
  // that is the loudest thing in the mix sitting on the thing it is supposed
  // to sit under. Same two levels as the score below, same duck, and it does
  // not duck under ITSELF (see missionDucks).
  const MISSION_TRACKS = ['radio-chatter-1.m4a', 'radio-chatter-2.m4a'];
  const MISSION_VOLUME = 0.55;
  const MISSION_DUCK = 0.08;

  // The score: one faint bed under the entire session, distinct from
  // MISSION_TRACKS, which are radio chatter tied to a live radar scope. It has
  // to sit *under* every event sound rather than beside them — a klaxon or a
  // watch-floor call has to read as an interruption, and it can't if the music
  // is at the same size in the mix. Hence two levels: MUSIC_VOLUME with nothing
  // else going on, and MUSIC_DUCK the moment anything else makes a noise —
  // any clip, the chatter bed, the switchboard. The duck is most of the level,
  // not a trim: half-stepping it just makes the mix muddy without ever getting
  // out of the way of the voice.
  const MUSIC_FILE = 'soundtrack.mp3';
  const MUSIC_VOLUME = 0.05;
  const MUSIC_DUCK = 0.015;
  // The duck is ramped rather than switched. A strike launch fires several
  // clips in a second or two, and stepping the gain on each one pumps the bed
  // audibly — which draws the ear straight to the thing that is supposed to be
  // beneath notice. Down fast, back up slowly, the way a duck is normally set.
  const RAMP_MS = { down: 120, up: 550 };

  const MUTE_KEY = 'cic-muted';
  // Versioned, and the version is the fix. Before the score defaulted to off,
  // init called setMusicOff(musicOff) with musicOff already true-by-default and
  // setMusicOff PERSISTED it — so every device that so much as loaded the page
  // in that era wrote 'cic-music-off' = '0' without the player touching
  // anything. The current read treats a stored '0' as "the player explicitly
  // asked for the score", which is exactly what that stamp is not: on any phone
  // that saw the old build, the music came on by itself on the first tap and
  // came back on every reload after. A new key ignores the stale opt-in without
  // touching anyone's real choice, and setMusicOff no longer writes a default it
  // was never given — only a toggle the player actually pressed persists.
  const MUSIC_KEY = 'cic-music-off-v2';
  const MUSIC_KEY_OLD = 'cic-music-off';
  const clips = {};
  let muted = false;
  let unlocked = false;   // browsers require a user gesture before audio

  // ---- the score ----
  let music = null;       // the looping bed, null if it failed to load
  // The player's own switch, independent of the master mute. Default is OFF:
  // the score is a bed under a session someone chose to sit down for, and a
  // first-time visitor who lands on the title screen with music already
  // playing reaches for the tab close before the toggle. Opt-in, and the
  // choice sticks either way — see init.
  let musicOff = true;

  // ---- mission music (jet radar scopes) ----
  // Reference-counted across overlapping sorties: the track starts when the
  // first jet scope opens and stops when the last one closes.
  const missionAudio = [];   // preloaded <Audio> per track
  let missionCount = 0;      // live jet scopes currently on screen
  let missionCur = null;     // the clip currently playing

  // ---- levels on iOS ----
  // Every level in this file — the bed, its duck, the klaxon riding under the
  // Hormuz call — is written to HTMLMediaElement.volume, and on iOS that
  // property is not a control. WebKit makes it read-only there on the grounds
  // that loudness belongs to the hardware switch: the assignment is accepted,
  // silently ignored, and reads back as 1. So every sound in the game played at
  // FULL GAIN on a phone. The bed came out twenty times louder than it was
  // mixed and sat on top of the voice it exists to sit under; the duck walked a
  // number nothing was reading; and the one file carrying a comment about the
  // klaxon not being allowed to bury the watch floor buried the watch floor.
  // None of it was a mix problem — the mix never reached the device.
  //
  // A GainNode *is* a control on iOS, so the levels route through one there.
  // musicLevel's comment argued a context was not worth it for one gain node,
  // and on desktop that still holds: volume works, this block stays asleep, and
  // nothing below changes path. The test is the capability rather than the user
  // agent, so a WebKit that ever ships a settable volume drops straight back to
  // the simple path with no edit here. The other half of that argument — that a
  // context needs its own unlock — was already paid for before it was made:
  // init has had a first-gesture hook since the autoplay policy landed.
  const honorsVolume = (() => {
    try {
      const a = new Audio();
      a.volume = 0.5;
      return Math.abs(a.volume - 0.5) < 0.01;
    } catch (e) { return true; }   // no Audio at all — nothing to route anyway
  })();

  let actx = null;                // one context, built on demand
  const gains = new WeakMap();    // element -> its GainNode

  // Put an element behind a gain node so its level is settable. Only called for
  // the handful of sources that want a level other than full — routing an
  // element makes its sound depend on the context running, which is a trade
  // worth making for the bed and worth avoiding for everything already at 1.
  // createMediaElementSource throws on a second call for the same element, so
  // the WeakMap is the guard as well as the lookup. Anything that fails leaves
  // the element playing exactly where it played before.
  function route(el) {
    if (honorsVolume || !el) return;
    if (gains.has(el)) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      if (!actx) actx = new AC();
      const g = actx.createGain();
      actx.createMediaElementSource(el).connect(g);
      g.connect(actx.destination);
      gains.set(el, g);
    } catch (e) { /* silent — element keeps playing at full, as it did before */ }
  }

  // The only two places a level is read or written. Same call on both paths, so
  // nothing else in this file has to know which one it is standing on — in
  // particular musicLevel's hand-stepped ramp is left as the single ramp
  // implementation rather than growing a Web Audio twin that could drift.
  function setLevel(el, v) {
    const g = gains.get(el);
    if (g) { try { g.gain.value = v; } catch (e) { /* silent */ } return; }
    try { el.volume = v; } catch (e) { /* silent */ }
  }

  function getLevel(el) {
    const g = gains.get(el);
    if (g) { try { return g.gain.value; } catch (e) { return 1; } }
    try { return el.volume; } catch (e) { return 1; }
  }

  // Is a level on this element a control at all? honorsVolume is the platform
  // answer; the gain node is the per-element one, and it can be missing on a
  // platform that needs it — no AudioContext, a context the browser refused to
  // build, createMediaElementSource throwing. route() is deliberately silent
  // about all three because a sound that keeps playing beats a sound that
  // doesn't, but a bed whose level nothing can move is the one case where that
  // trade is wrong: it means the duck is being written to a number the device
  // never reads, which is the bug this whole block exists to stop and which
  // came back the moment routing failed. Where the level is not a control, the
  // duck stops pretending and PAUSES the bed instead — see bedLevel.
  function canLevel(el) { return honorsVolume || gains.has(el); }

  // iOS suspends the context when the tab backgrounds or the phone locks, and a
  // suspended context is SILENCE rather than a wrong level — the one failure
  // here that is worse than the bug being fixed. So this runs on every gesture
  // and on coming back to the tab, not just on the first unlock.
  function actxResume() {
    if (!actx || actx.state !== 'suspended') return;
    try { const p = actx.resume(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* silent */ }
  }

  function preload() {
    for (const [name, file] of Object.entries(FILES)) {
      try {
        const a = new Audio(`audio/${file}`);
        a.preload = 'auto';
        if (VOLUME[name] !== undefined) { route(a); setLevel(a, VOLUME[name]); }
        a.addEventListener('error', () => delete clips[name]);
        clips[name] = a;
      } catch (e) { /* no Audio support — game plays silent */ }
    }
    for (const file of MISSION_TRACKS) {
      try {
        const a = new Audio(`audio/${file}`);
        a.preload = 'auto';
        a.loop = false;   // plays through once — never repeats within a mission
        route(a);         // it is a bed, and a bed has to be able to get down
        setLevel(a, MISSION_VOLUME);
        a.addEventListener('error', () => { const i = missionAudio.indexOf(a); if (i >= 0) missionAudio.splice(i, 1); });
        missionAudio.push(a);
      } catch (e) { /* no Audio support — game plays silent */ }
    }
    try {
      const m = new Audio(`audio/${MUSIC_FILE}`);
      m.preload = 'auto';
      m.loop = true;
      route(m);
      setLevel(m, MUSIC_VOLUME);
      m.addEventListener('error', () => { music = null; });
      music = m;
    } catch (e) { /* no Audio support — game plays silent */ }
  }

  // ---- ducking ----
  // Everything that makes a noise takes a hold out on the score and drops it
  // when it is done; the bed sits at MUSIC_DUCK for as long as any hold is
  // outstanding. A set rather than a counter because the holds are named — a
  // clip cut short, a ring the player never answered and a scope torn down by
  // a skip all release out of order, and dropping the same hold twice must not
  // leave the bed stuck quiet for the rest of the war.
  const ducks = new Set();
  const duckTimers = {};   // per-clip watchdog: no clip holds the bed forever
  const ramps = new WeakMap();   // bed element -> the interval walking its gain

  // Every hold except the chatter's own. The chatter bed must not duck under
  // itself, and it is the only source in the file that both makes a noise and
  // has a level of its own to lose.
  function ducked(exceptMission) {
    if (!exceptMission) return ducks.size > 0;
    for (const k of ducks) if (k !== 'mission') return true;
    return false;
  }

  function duckAdd(key) { if (!ducks.has(key)) { ducks.add(key); musicLevel(); } }
  function duckDrop(key) { if (ducks.delete(key)) musicLevel(); }

  // A one-shot clip: hold for as long as it runs. Driven off a timer rather
  // than an `ended` listener because play() re-triggers the same element while
  // an earlier hold may still be live, and a fresh listener per call would
  // stack on the element. `duration` is NaN until metadata lands, so a clip
  // played inside the first moments of the session falls back to a length no
  // effect in here exceeds.
  function duckClip(name, clip) {
    duckAdd('sfx:' + name);
    clearTimeout(duckTimers[name]);
    const dur = isFinite(clip.duration) && clip.duration > 0 ? clip.duration : 6;
    duckTimers[name] = setTimeout(() => duckDrop('sfx:' + name), dur * 1000 + 300);
  }

  function duckClipDrop(name) {
    clearTimeout(duckTimers[name]);
    duckDrop('sfx:' + name);
  }

  // ---- the watch card ----
  // This file owns exactly one question — is somebody talking right now — and
  // ui.js owns the card that answers it. The hook lives here rather than at the
  // six call sites so that adding a row to VOICE is the entire wiring job.
  //
  // Both of these are raised off the sound ACTUALLY STARTING rather than off
  // the call being made. Muted and locked bail out of play()/playThen() before
  // they get here, but blocked autoplay does not: it comes back as a rejected
  // play() promise a frame later, and a card raised on the call would flash up
  // and vanish on every turn of a muted session.
  //
  // Transient by design and nowhere near G or FIELDS. A voice that was in the
  // middle of a sentence when the player quit is not a thing to resume — the
  // same reasoning arrivalCalls in game.js is written on.
  let voiceCur = null;      // clip name currently holding the card, or null
  const voiceTimers = {};   // fallback retire for clips played through play()

  function voiceRaise(name, clip) {
    const v = VOICE[name];
    if (!v || typeof UI === 'undefined' || !UI.voiceUp) return;
    voiceCur = name;
    try { UI.voiceUp(v.who, v.says); } catch (e) { /* silent, like everything here */ }
    // playThen knows exactly when its clip stops and lowers the card there.
    // play() is fire-and-forget, so the card retires on a timer instead — same
    // shape and same `duration is NaN until metadata lands` fallback as
    // duckClip above, since it is the same problem.
    clearTimeout(voiceTimers[name]);
    const dur = isFinite(clip.duration) && clip.duration > 0 ? clip.duration : 6;
    voiceTimers[name] = setTimeout(() => voiceLower(name), dur * 1000);
  }

  // `hard` retires the card immediately instead of letting it hold — a cut.
  function voiceLower(name, hard) {
    clearTimeout(voiceTimers[name]);
    // A second clip may have taken the card while this one was still winding
    // down; the one that owns it is the one allowed to take it away.
    if (voiceCur !== name) return;
    voiceCur = null;
    if (typeof UI === 'undefined' || !UI.voiceDown) return;
    try { UI.voiceDown(!!hard); } catch (e) { /* silent */ }
  }

  // Walk the gain to wherever the holds say it should be. Stepped by hand on a
  // timer rather than handed to Web Audio's own ramp: on desktop the rest of
  // this file is bare <Audio> elements and a ramp node is not worth a context,
  // and where a context does exist (iOS — see the levels block above, where
  // volume is not a control at all) this stays the ONE ramp both paths run, so
  // the duck cannot come out a different shape depending on the device. All
  // that changes between them is where the number lands, which is setLevel's
  // problem and not this function's.
  // Walk one bed to its target. `hold` is the element the caller is still
  // holding a reference to — the ramp checks it every step, so a bed torn down
  // mid-ramp (a scope closed, the score stopped) leaves nothing running.
  function rampTo(el, target, live) {
    const step = 40;
    const ms = target < getLevel(el) ? RAMP_MS.down : RAMP_MS.up;
    clearInterval(ramps.get(el));
    const delta = (target - getLevel(el)) / Math.max(1, ms / step);
    const id = setInterval(() => {
      if (live && !live()) { clearInterval(id); ramps.delete(el); return; }
      const next = getLevel(el) + delta;
      const done = delta >= 0 ? next >= target : next <= target;
      setLevel(el, done ? target : Math.max(0, Math.min(1, next)));
      if (done) { clearInterval(id); ramps.delete(el); }
    }, step);
    ramps.set(el, id);
  }

  // Put a bed where the holds say it should be. Two ways down, and which one is
  // used is a property of the DEVICE rather than of the sound: where a level is
  // a control the bed ramps, and where it is not (see canLevel) it is paused
  // outright for as long as anything else is making a noise. A pause is a
  // cruder duck than a ramp and on the platform that needs it it is the only
  // one that is audible at all — the alternative is not a gentler duck, it is
  // no duck, which is a full-gain bed sitting on top of the watch floor. The
  // score resumes where it left off; the chatter is chatter and does the same.
  function bedLevel(el, base, duck, isDucked, live) {
    if (!el) return;
    if (!canLevel(el)) {
      clearInterval(ramps.get(el));
      ramps.delete(el);
      try {
        if (isDucked) el.pause();
        else if (el.paused && !muted && unlocked) { const p = el.play(); if (p && p.catch) p.catch(() => {}); }
      } catch (e) { /* silent */ }
      return;
    }
    rampTo(el, isDucked ? duck : base, live);
  }

  // Both beds answer the same set of holds, so they move together and one call
  // site can't leave one of them up. Named musicLevel still because that is
  // what every duckAdd/duckDrop in the file calls.
  function musicLevel() {
    if (music && !musicOff && !muted) bedLevel(music, MUSIC_VOLUME, musicDuck(), ducked(false), () => !!music);
    if (missionCur) {
      const cur = missionCur;
      bedLevel(cur, MISSION_VOLUME, missionDuck(), ducked(true), () => missionCur === cur);
    }
  }

  // Start (or resume) the bed. No-op until the first gesture unlocks audio, and
  // no-op if either switch is off. Resumes from where it was rather than
  // restarting — a mute and unmute mid-campaign shouldn't rewind the track.
  function musicStart() {
    if (!music || musicOff || muted || !unlocked) return;
    // Level AFTER the play, not before: on the pause-path (canLevel false) the
    // duck IS a pause, and a play() underneath it would start the bed back up
    // over whatever the hold is protecting. This way the last word belongs to
    // the holds, whichever way the device ducks.
    try {
      const p = music.play();
      if (p && p.catch) p.catch(() => {});
    } catch (e) { /* silent */ }
    musicLevel();
  }

  function musicStop() {
    if (!music) return;
    try { music.pause(); } catch (e) { /* silent */ }
  }

  // Pick a random track and start it (no ref-counting). No-op if one is already
  // playing, if muted, if audio isn't unlocked yet, or if no tracks loaded.
  function playMissionTrack() {
    if (missionCur || muted || !unlocked || !missionAudio.length) return;
    // Only ever one chatter stream at a time: silence every track first so a
    // big package launching several scopes at once can never stack audio.
    for (const a of missionAudio) {
      try { a.pause(); a.currentTime = 0; } catch (e) { /* silent */ }
    }
    missionCur = missionAudio[Math.floor(Math.random() * missionAudio.length)];
    // Opens at whichever level the room is already at: a scope card that comes
    // up while the watch floor is mid-sentence must not start at full and ramp
    // down over the end of the sentence.
    setLevel(missionCur, ducked(true) ? missionDuck() : MISSION_VOLUME);
    // On the pause-path the bed cannot open quietly, so it does not open at
    // all until the room is clear; bedLevel's resume branch picks it up when
    // the last hold drops, which is where every other bed comes back too.
    const hold = !canLevel(missionCur) && ducked(true);
    try {
      missionCur.currentTime = 0;
      if (!hold) { const p = missionCur.play(); if (p && p.catch) p.catch(() => {}); }
    } catch (e) { /* silent */ }
    duckAdd('mission');   // the score steps down while the chatter is up
    musicLevel();         // ...and the chatter steps down under anything else
  }

  // A jet's radar scope just opened. Start the music if nothing is playing yet.
  function missionMusicStart() {
    missionCount++;
    playMissionTrack();
  }

  // A jet's radar scope closed. Stop only once the last live scope is gone.
  function missionMusicStop() {
    if (missionCount > 0) missionCount--;
    if (missionCount > 0 || !missionCur) return;
    const c = missionCur;
    missionCur = null;
    try { c.pause(); c.currentTime = 0; } catch (e) { /* silent */ }
    duckDrop('mission');
  }

  // Kill the chatter outright regardless of how many scopes are open — used when
  // the player skips the turn, which tears every live scope down at once.
  function missionMusicStopAll() {
    missionCount = 0;
    if (!missionCur) return;
    const c = missionCur;
    missionCur = null;
    try { c.pause(); c.currentTime = 0; } catch (e) { /* silent */ }
    duckDrop('mission');
  }

  function play(name, delayMs = 0) {
    if (muted || !unlocked || !clips[name]) return;
    const go = () => {
      const c = clips[name];
      if (!c) return;
      // Tested here rather than at the top so a delayed clip is judged against
      // the room it would actually land in — play('hormuzClosure', 400) queued
      // a beat before the switchboard rings must not arrive on top of the call.
      // A refused clip is DROPPED, not deferred: everything in here is an event
      // that has already happened and is already written down on the screen
      // behind the popup, and a klaxon replayed ninety seconds late reports a
      // strait that closed before the president picked up the phone.
      if (onLine && !lineAudio(name)) return;
      try {
        c.currentTime = 0;
        const p = c.play();
        // The card goes up only once the browser says the sound is running.
        // No promise at all (old engines) is the one case we take on trust.
        if (p && p.then) p.then(() => voiceRaise(name, c), () => {});
        else voiceRaise(name, c);
      } catch (e) { /* silent */ }
      duckClip(name, c);   // the score gets out from under it
    };
    delayMs > 0 ? setTimeout(go, delayMs) : go();
  }

  // Finishers for the clips currently gating something, keyed by clip name, so
  // a clip can be cut short and hand straight on to whatever was waiting on it.
  const pendingThen = {};

  // Play a clip and run `cb` once it has finished — for the places where the
  // audio has to clear before the next thing starts rather than run under it.
  //
  // `cb` is always called exactly once, and never held hostage by the sound:
  // if the clip can't play at all (muted, audio not unlocked yet, file missing,
  // autoplay refused) it runs immediately, and a watchdog covers a clip that
  // starts and then stalls — a background tab throttling the decode must not
  // wedge a turn behind a sound effect.
  function playThen(name, cb) {
    const go = typeof cb === 'function' ? cb : () => {};
    // The secure line joins the four reasons a clip can't play at all, and takes
    // the same exit: `cb` runs immediately, so a chain waiting on a voice that
    // is not allowed to speak over the call hands straight on rather than
    // stalling behind a sound nobody is going to hear.
    if (muted || !unlocked || !clips[name] || (onLine && !lineAudio(name))) { go(); return; }
    const c = clips[name];
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      if (pendingThen[name] === finish) delete pendingThen[name];
      c.removeEventListener('ended', finish);
      c.removeEventListener('error', finish);
      duckClipDrop(name);   // the voice has cleared; the bed can come back up
      voiceLower(name);     // …and the card comes down with it
      go();
    };
    pendingThen[name] = finish;
    // These are the spoken clips, so the hold runs off `finish` — which already
    // covers ended, error, a stall and being cut short — rather than a timer.
    duckAdd('sfx:' + name);
    c.addEventListener('ended', finish);
    c.addEventListener('error', finish);
    try {
      c.currentTime = 0;
      const p = c.play();
      // Same guard as play(): the card waits for the sound. `done` is checked
      // because an error can beat the resolve, and a card raised after its own
      // finish has already run would never be lowered by anything.
      if (p && p.then) p.then(() => { if (!done) voiceRaise(name, c); }, finish);
      else voiceRaise(name, c);
    } catch (e) { finish(); return; }
    const dur = isFinite(c.duration) && c.duration > 0 ? c.duration : 10;
    setTimeout(finish, dur * 1000 + 1000);
  }

  // Cut a playThen clip short: silence it and hand straight on to whatever was
  // waiting on it. A skip is the player saying they have heard this one — the
  // clip should get out of the way rather than be the thing they wait out.
  // Safe to call when the clip isn't playing, or was never gating anything.
  function cut(name) {
    const c = clips[name];
    if (c) { try { c.pause(); c.currentTime = 0; } catch (e) { /* silent */ } }
    // Before finish(), which would lower the card the polite way and leave the
    // caption sitting on the map for two more seconds. A cut is the player
    // saying they have heard this one; the card goes when the voice goes.
    voiceLower(name, true);
    const finish = pendingThen[name];
    if (finish) finish();
  }

  // ---- the switchboard ringing ----
  // `loop` on the element rings the clip end to end, which is a fire alarm, not
  // a telephone. A phone rings in bursts, so the silence is scheduled by hand:
  // play the burst, wait for it to actually finish, hold RING_GAP, ring again —
  // until the player answers or declines. The gap is measured from the end of
  // the burst rather than its start so a clip that decodes slowly still gets the
  // same silence after it.
  const RING_GAP = 1500;
  let ringing = false, ringTimer = null, ringOnEnd = null;

  function ringStart() {
    const c = clips.phoneRing;
    if (ringing || muted || !unlocked || !c) return;
    ringing = true;
    const ring = () => {
      if (!ringing) return;
      try {
        c.currentTime = 0;
        const p = c.play();
        if (p && p.catch) p.catch(() => {});
      } catch (e) { /* silent */ }
    };
    ringOnEnd = () => { ringTimer = setTimeout(ring, RING_GAP); };
    c.addEventListener('ended', ringOnEnd);
    // One hold for the whole ring rather than one per burst: released between
    // bursts, the bed would swell back up in every 1.5s silence and pump for as
    // long as the phone went unanswered.
    duckAdd('ring');
    ring();
  }

  // Safe to call on a ring that never started, and safe to call twice — the
  // popup calls it from every path out of the incoming state.
  function ringStop() {
    ringing = false;
    clearTimeout(ringTimer);
    ringTimer = null;
    duckDrop('ring');
    const c = clips.phoneRing;
    if (!c) return;
    if (ringOnEnd) { c.removeEventListener('ended', ringOnEnd); ringOnEnd = null; }
    try { c.pause(); c.currentTime = 0; } catch (e) { /* silent */ }
  }

  // ---- the alarm ----
  // The klaxon that does not stop. Everything else in this file is a burst: an
  // event happened, the room hears about it once, and the clip runs out on its
  // own. This one is a STANDING condition — the National Security Advisor has
  // asked for the room and the president has not yet said yes — so it loops on
  // the element until somebody answers it.
  //
  // Which is precisely the thing ringStart refuses to do, and the two comments
  // are not in disagreement. `loop` end to end is "a fire alarm, not a
  // telephone", and a telephone is what that one is; this one is the fire
  // alarm, so it takes the treatment that was wrong there. It also means the
  // gap is not scheduled by hand and there is no `ended` listener to unhook —
  // stopping it is pausing it and clearing the flag.
  //
  // Like the bell it is safe to start twice and safe to stop having never
  // started, because the popup calls the stop from every path out of it.
  let alarming = false;

  function alarmStart() {
    const c = clips.nukeAlarm;
    if (alarming || muted || !unlocked || !c) return;
    alarming = true;
    c.loop = true;
    // One hold for the whole alarm, on the same argument as the ring's: the
    // beds must not swell back up between two laps of a 1.5 s clip.
    duckAdd('alarm');
    try {
      c.currentTime = 0;
      const p = c.play();
      if (p && p.catch) p.catch(() => {});
    } catch (e) { /* silent */ }
  }

  function alarmStop() {
    alarming = false;
    duckDrop('alarm');
    const c = clips.nukeAlarm;
    if (!c) return;
    c.loop = false;   // the element is shared with nothing, but leave it clean
    try { c.pause(); c.currentTime = 0; } catch (e) { /* silent */ }
  }

  // ---- the secure line ----
  // A head of government on the phone is the one sound in this game that is not
  // an event in the mix — it is the room going quiet so the president can take a
  // call. Everything else in here ducks: the bed steps down to MUSIC_DUCK, a
  // clip already in flight keeps running, and the next klaxon or watch-floor
  // call comes in over the top at full gain. That is right for a strike and
  // wrong for a telephone, and it is what a call arriving mid-sequence sounds
  // like — the switchboard ringing underneath the rotors, or the Prime Minister
  // talking against a BDA report.
  //
  // So the popup takes an EXCLUSIVE hold rather than a duck, for the whole time
  // it is up: incoming, line open, and the beat after the leader stops talking.
  // The duck stops being a duck (both beds go to silence rather than out of the
  // way — see musicDuck/missionDuck), everything already making a noise is
  // silenced, and everything that tries to start is refused.
  //
  // Held across all three states of the popup and not just the ring, because
  // the gap between hanging up the bell and opening the line is exactly where a
  // queued clip would land. openLeaderCall in ui.js owns both ends of it, and
  // that popup has no Escape and no close button — `close` is the only door out
  // of it, which is what makes one hold safe to leave standing.
  let onLine = false;    // the secure-line popup is up, in any of its states
  let lineClip = [];     // the clips that ARE the call, named by the caller

  // The switchboard and whatever the caller says is the call. Nothing else, and
  // the caller names the clips rather than this file keeping a second copy of
  // the list in WORLD_LEADERS — a fifth head of government is then a data
  // change. It is a LIST because the nuclear set piece is one room held across
  // two dialogs: the alarm under the NSA asking for the meeting, then the NSA
  // himself over the footage. Naming both up front is what lets that hold be
  // continuous rather than dropped and re-taken between them.
  function lineAudio(name) { return name === 'phoneRing' || lineClip.indexOf(name) >= 0; }

  // On the line the duck is not a duck. Zero on the ramp path; the pause path
  // (canLevel false — see bedLevel) is already silence and needs nothing.
  function musicDuck() { return onLine ? 0 : MUSIC_DUCK; }
  function missionDuck() { return onLine ? 0 : MISSION_DUCK; }

  // Everything audible when the phone starts ringing. A clip mid-sentence is
  // precisely what the call is being talked over by, so it stops where it
  // stands rather than being left to run out.
  //
  // A GATING clip is silenced and NOT cut. cut() hands its continuation on
  // early, and the continuation of the clip that gates the night is the night
  // resolving — a call arriving inside the three-second switchboard pause after
  // END TURN would then resolve the turn behind the popup, sooner than it
  // otherwise would have. playThen's own watchdog still fires finish() on the
  // clip's own schedule, so the chain keeps its cadence and only the sound goes.
  function silenceRoom() {
    for (const name of Object.keys(clips)) {
      if (lineAudio(name)) continue;
      const c = clips[name];
      if (!c || c.paused) continue;
      try { c.pause(); c.currentTime = 0; } catch (e) { /* silent */ }
      voiceLower(name, true);   // nobody is talking; the card goes with the voice
      if (!pendingThen[name]) duckClipDrop(name);
    }
    // The strike footage is the one audible thing this file does not own — the
    // same reach setMuted makes, and one direction only for the same reason:
    // a clip that fell back to muted to get past autoplay is only playing
    // BECAUSE it is muted, and handing it an unmute afterwards asks the browser
    // to re-authorize a video already in flight.
    try {
      document.querySelectorAll('.scope-hit-video').forEach(v => { v.muted = true; });
    } catch (e) { /* silent */ }
  }

  // `clip` is the leader's recording for this call — the only thing besides the
  // bell allowed to make a noise until lineClose.
  function lineOpen(clip) {
    if (onLine) return;
    onLine = true;         // before silenceRoom: a finisher that runs in there
    // must be refused too, not allowed one last word
    lineClip = !clip ? [] : Array.isArray(clip) ? clip.slice() : [clip];
    silenceRoom();
    duckAdd('line');       // and the beds go to zero, not to the duck
  }

  function lineClose() {
    if (!onLine) return;
    onLine = false;
    lineClip = [];
    duckDrop('line');      // musicLevel is inside duckDrop; the beds ramp back
  }

  // Klaxon on the moments that change the war: the strait slams shut, or
  // the casualty count crosses what the home front will bear watching.
  // Called from the HUD render so every state change passes through it.
  let lastHormuz = null, lastCas = null;
  function alertCheck(G) {
    if (lastHormuz !== null && lastHormuz !== 'CLOSED' && G.hormuz === 'CLOSED') {
      play('klaxon');
      play('hormuzClosure', 400);   // alarm first, then the watch floor says it
    }
    if (lastCas !== null && lastCas < 100 && G.casualties.us >= 100) play('klaxon');
    lastHormuz = G.hormuz;
    lastCas = G.casualties.us;
  }

  function isMuted() { return muted; }
  function isMusicOff() { return musicOff; }

  // The score's own switch. The speaker button is the master — it silences
  // everything including this — so a player who wants the game but not the
  // music turns this one off and leaves the other alone.
  // `persist` is false exactly once, at boot, where the argument is not the
  // player's choice but the value just read back (or defaulted). Writing there
  // is what turned a default into a stored preference last time — see MUSIC_KEY.
  function setMusicOff(off, persist = true) {
    musicOff = !!off;
    musicOff ? musicStop() : musicStart();
    if (persist) try { localStorage.setItem(MUSIC_KEY, musicOff ? '1' : '0'); } catch (e) {}
    const btn = document.getElementById('btn-music');
    if (btn) {
      btn.classList.toggle('off', musicOff);
      btn.title = musicOff ? 'Music off — click to play' : 'Music on — click to stop';
      btn.setAttribute('aria-pressed', musicOff ? 'false' : 'true');
    }
  }

  function setMuted(m) {
    muted = !!m;
    // Muting silences the mission track immediately; unmuting resumes it if a
    // jet scope is still live.
    if (missionCur) {
      try { muted ? missionCur.pause() : missionCur.play().catch(() => {}); } catch (e) {}
    } else if (!muted && missionCount > 0) {
      playMissionTrack();   // a jet scope is still live — resume music
    }
    // The speaker is the master switch, so it takes the score down with it —
    // and hands it back on unmute unless the player turned the music off
    // separately, which musicStart checks for us.
    muted ? musicStop() : musicStart();
    // Whatever came back above comes back at the level the holds say, not at
    // the level it was paused from — unmuting mid-sentence must not hand the
    // beds back on top of the sentence.
    if (!muted) musicLevel();
    // muting mid-ring hangs up the bell, not the call: the popup is still there
    // and still waiting on an answer, it has just stopped making noise
    if (muted) { ringStop(); alarmStop(); }
    // The strike footage is the one audible thing this file does not own — see
    // the duck seam at the bottom — so the master switch has to reach it by
    // hand, and reach it MID-CLIP rather than only at creation: a player who
    // hits the speaker button while a package is landing wants silence now, and
    // fifteen seconds of footage is a long time to keep talking over the ask.
    //
    // One direction only, for the same reason the ring is: muting is the urgent
    // half. A clip that fell back to muted because audible autoplay was refused
    // is only playing at all BECAUSE it is muted, and handing it an unmute here
    // would be asking the browser to re-authorize a video already in flight.
    if (muted) {
      document.querySelectorAll('.scope-hit-video').forEach(v => { v.muted = true; });
    }
    try { localStorage.setItem(MUTE_KEY, muted ? '1' : '0'); } catch (e) {}
    const btn = document.getElementById('btn-mute');
    if (btn) {
      btn.textContent = muted ? '🔇' : '🔊';
      btn.title = muted ? 'Sound off — click to unmute' : 'Sound on — click to mute';
    }
  }

  function init() {
    try { muted = localStorage.getItem(MUTE_KEY) === '1'; } catch (e) {}
    // Absent means off, so the test is against '0' rather than '1' — only a
    // player who has explicitly turned the score on gets it back on reload.
    try { musicOff = localStorage.getItem(MUSIC_KEY) !== '0'; } catch (e) {}
    // The stale stamp is not a preference and there is nothing in it worth
    // migrating — every device that ever loaded the old build carries the same
    // '0' whether or not anyone asked for music.
    try { localStorage.removeItem(MUSIC_KEY_OLD); } catch (e) {}
    preload();

    // Respect autoplay policy: unlock only after the first real interaction.
    // That gesture is also the earliest moment the score is allowed to start,
    // so it opens there rather than on load — anything sooner is refused.
    const unlock = () => { unlocked = true; actxResume(); musicStart(); };
    document.addEventListener('pointerdown', unlock, { once: true });
    document.addEventListener('keydown', unlock, { once: true });
    // The unlock above is `once` because it only has to happen once. Resuming
    // is not that: a phone that locked mid-turn comes back with the context
    // suspended and every routed level silent, so this one stands for the whole
    // session. Cheap — actxResume is a state check and a no-op on desktop,
    // where actx is never built at all.
    document.addEventListener('pointerdown', actxResume);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) actxResume(); });

    const btn = document.getElementById('btn-mute');
    if (btn) btn.addEventListener('click', () => setMuted(!muted));
    const mbtn = document.getElementById('btn-music');
    if (mbtn) mbtn.addEventListener('click', () => setMusicOff(!musicOff));
    setMuted(muted);
    setMusicOff(musicOff, false);
  }

  // duckHold/duckRelease are the seam for sound this file does not own — the
  // strike footage in map.js plays its own audio and has to take a hold like
  // everything else, or the bed sits on top of it. Named keys, dropped by the
  // caller; see the ducks set for why it is a set and not a counter.
  return { init, play, playThen, cut, ringStart, ringStop, alarmStart, alarmStop, lineOpen, lineClose, alertCheck, isMuted, setMuted, isMusicOff, setMusicOff, missionMusicStart, missionMusicStop, missionMusicStopAll, duckHold: duckAdd, duckRelease: duckDrop };
})();
