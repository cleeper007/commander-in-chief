# Commander in Chief: Crisis in the Gulf

A browser-based, turn-based war simulator. You are the President of the United States
in a shooting war with Iran — part **DEFCON**, part grand-strategy situation room.
The mission is victory: destroy Iran's nuclear program and break its ability to fight,
while the casualty count, the home front, and the global economy grind against you.

> **Note:** This is a work of strategic fiction. The scenario, events, and outcomes are
> invented and abstracted for gameplay, in the tradition of DEFCON, Twilight Struggle,
> and Command: Modern Operations. It depicts no real events and endorses no policy.

## Screenshots

<!-- Add screenshots here, e.g.: -->
<!-- ![Situation Room](screenshots/situation-room.png) -->
<!-- ![Strike planning](screenshots/strike-planning.png) -->

## How to Play

Open `index.html` in any modern browser — no build step, no server, no dependencies.

### The situation

Iranian missiles have struck a US destroyer in the Strait of Hormuz. This is not a
crisis to be managed — it is a war to be won. Each turn is 12 in-game hours; you have
30 turns (15 days) before the campaign culminates.

### How you win

1. **Decisive military victory** (the primary path) — destroy the nuclear program
   (Natanz and Fordow, 100% degradation) **and** break Iran's war machine: its missile
   bases, its naval bases, and the IRGC command complex.
2. **Armistice** (rare, conditional) — Tehran only comes to the table once the program
   is destroyed and its forces are collapsing, and even then each overture is a gamble.
   Diplomacy is a face-saving off-ramp from a war you are already dominating — not a
   strategy to open with. Attempt it too early and the rebuff costs you at home.

There is no abstract escalation meter. Iran's behavior is driven by what it actually
has left: while its missile force, navy, and IRGC command function, it fights at full
fury; as you destroy them, its capacity to hurt you physically drains away. The
**IRAN WAR CAPACITY** meter in the status bar tracks the enemy's remaining ability to
fight — the mission is driving it to zero.

### How you lose

- **Iran goes nuclear** — the enrichment clock runs out. This is the race the whole war
  is against, and it is the only loss condition you cannot see coming exactly (see below).
- **Unsustainable losses** — the casualty ceiling is passed. What the country will absorb
  depends on the difficulty you chose: 320 on easy, 250 on normal, 190 on hard.
- **Impeachment** — approval collapses below 20%.
- **Congress cuts off the war** — you lose the War Powers vote (see below).
- **Economic collapse** — the Strait of Hormuz stays closed too long, or oil passes $240.
- **Campaign culmination** — 30 turns expire with the program still standing (defeat);
  expire with real damage done and it's a graded stalemate instead.

### The enrichment clock

Iran is enriching the entire time, and the war exists to stop it. The halls run every
turn they are standing, Natanz and Fordow contribute at different rates, and the total
required for a device is **rolled fresh for every war** — so what you are shown is a
genuine estimate with a band on it, not a countdown wearing a fog filter:

> EST. TIME TO A DEVICE — **11–18 turns** *(low confidence)*

Spend an intelligence tasking on it and the band narrows. Ignore it and you may be five
turns wrong in the direction that loses the game.

### You do not know what you have destroyed

Target condition is no longer a number you can read off the map. It is an **assessment**:
the last figure BDA produced, how old it is, and how far it could have drifted since —
because the site has been repairing the whole time and nobody has looked.

- A target nobody has touched is intact, and a collapsed hall is destroyed. Those are
  never in doubt.
- Everything in between reads as a band — `30–55% operational` — that **widens every
  turn nobody looks**, and widens upward faster than down, because the thing that
  happens to an unobserved site is repair.
- The strike planner tells you "an estimated 1–2 more packages on target to finish it."
  Deciding under that is the game.

A collection deck tasking narrows the three worst estimates to ±3. It costs the same
action slot as diplomacy — knowing costs exactly what doing costs.

### Tehran has a war plan

One of three is chosen when the war opens and **it is not shown to you**:

- **Strait Strangler** — the naval arm and the mine warfare units are the main effort;
  Tehran means to win this at the gas pump.
- **Attrition** — missile brigades and proxies spent freely against bases and fleet
  units; they are playing for the casualty count.
- **Nuclear Sprint** — restrained retaliation, hardened air defense, faster enrichment.
  They are buying time for the halls and nothing else.

You can read it off what Iran actually does, or buy the answer with a tasking. It is
revealed on the endgame screen either way — and if you never assessed it, the screen
says so.

Iran also **adapts**. Every package is logged by platform; lean on one and Tehran works
the counter to that one — decoys and dispersal against Tomahawks, mobile ambush SAMs
against manned packages. It caps out at −15%, and mixing the force keeps it shallow.

### The air campaign is three campaigns, in order

An American air war is not one force applied evenly for thirty nights. It is three
forces applied in sequence, and the sequence is the doctrine. **Air superiority** — a
0–100% number built from what is left of the SAM belt and the Iranian fighter bases —
is what releases each one.

| Phase | At | What flies | Package weight |
|---|---|---|---|
| **Airspace contested** | opening | F-35/F-22 and Tomahawks only | 45 · 55 |
| **Air defenses degraded** | 40% | the 4th-gen force releases — F-15E, F-16, Super Hornet | 62 |
| **Air superiority** | 80% | heavy bombers release — B-1B, B-52H | 92 |

The 5th-gen force is small, expensive per aimpoint, and almost impossible to shoot
down. What it is *for* is not damage — it is buying the next phase. The 4th-gen force
is three times the volume and carries far more, and it dies in defended airspace. The
heavies do the work of two nights of fighters and are the most helpless thing in the
inventory the moment the belt comes back up.

**None of it is a ratchet.** Air defense sites repair overnight like everything else,
so a phase bought in week one is gone by week two if nobody goes back. The heavy force
is not something you unlock; it is a condition you maintain.

On **hard**, the gate is advice rather than law: the staff will fly any package you
order, and a Strike Eagle package into an intact SAM belt runs about 17% odds with a
54% chance of losing the aircrew. You may. You shouldn't.

### Fuel in the air, and the machine spinning up

The binding constraint on an air campaign flown from the sea is not aircraft and not
weapons — it is tankers. Every manned package books **tanker tracks** out of a nightly
theater total; Tomahawks book none.

| Target depth | Fighter | Heavy |
|---|---|---|
| Gulf littoral | 3 tracks | 4 tracks |
| Interior (Tehran, the nuclear sites) | 4 tracks | 5 tracks |
| Far northwest / Caspian | 5 tracks | 6 tracks |
| B-2 mission | 4 tracks | — |

Capacity comes from the decks, from basing, and — increasingly — from the **theater
force flow**. The carriers are what is there on night one. Everything else is a machine
that takes weeks to spin up and then does not stop: squadrons out of CONUS and USAFE,
the tanker wings with them, six waves across the campaign. By week three there is
simply more of everything, and a night that opened with two packages can carry five.

Every wave needs a ramp to land on, and ramps are what world opinion buys. Lose the
basing tier a wave needs and it holds at its staging field until the politics are
repaired — the buildup stalls exactly when you have spent the standing that pays for it.

### World opinion is a permission slip

It is not a scoreboard. It is what the ramps and the tanker tracks are flown off, and it
is withdrawn in two steps — both recoverable if you get the number back up:

- **At 30** — NATO and Saudi basing goes. Incirlik closes, European squadrons suspend,
  Riyadh asks that Prince Sultan not be used offensively. −2 tanker tracks, −2 squadrons.
- **At 15** — the Gulf states revoke access and overflight. Al Udeid and Al Dhafra are
  hosting aircraft that are not permitted to fly. −2 more tracks, and **without the
  northern tanker tracks there is no way to put a package over the far northwest at
  all** — Tabriz and the Caspian come off the target list entirely.

### The missile hunt

Flattening a missile base does not kill the brigade. The garrison, the sheds and the
fuel farm die on that target; the **transporter-erector-launchers that were always the
point drive out into the country** and keep shooting. From that moment:

- They cannot be planned against until ISR finds them.
- They count toward Iranian missile strength whether or not anyone has found them — so
  the capacity meter does not fall as far as the BDA suggests.
- A group you find and do not service **moves again** and the fix is worth nothing.

How much escapes depends on how much of the brigade was alive when the night started.
Grind a base down over three nights and the launchers die with it; flatten it at full
strength in one volley and the whole brigade gets clear.

### Congress votes

Around turn 13 the authorization the campaign has been running on lapses and the Hill
votes. It is scored on your approval, the casualty list, whether you still have allies,
whether you ever went on television to explain the war, and whether there is anything to
show for it. Three outcomes: **authorized** (+8 approval and a free hand), **authorized
with conditions** (the war continues with energy targets — and possibly everything
outside the declared theater — barred *by law*), or **cut off**, which ends it.

Each Oval Office address is worth five points on that floor. They are not just a heal.

### Theater forces and the naval transit

You open the war with one deck — the *Abraham Lincoln*, on station in the North Arabian
Sea, well east of Oman — and everything else is somewhere else. Two forces can be brought in, and **Fifth
Fleet cuts one naval transit plan a night**, so only one deployment order goes out per
turn and the order you put them in is the decision:

- **USS Gerald R. Ford** — five turns out. She arrives at standoff in the Arabian Sea
  and roughly doubles what you can put in the air in a day. Every fighter sortie and
  every Tomahawk in this war comes off a deck, so the second one is the difference
  between servicing the target list and picking at it.
- **509th Bomb Wing (B-2)** — one turn out, Whiteman AFB to Diego Garcia. There is not
  a stealth bomber in the hemisphere until you send for it, and the GBU-57 is the only
  thing in the inventory that reaches Fordow. Two sustainable missions off the ramp,
  regenerating one every three turns.

One goes tonight, the other tomorrow. The bombers are cheap in time and priceless in
reach; the carrier is slow and pays out for the rest of the war. Sending the Ford first
costs a turn before the 509th can follow — she does not have to arrive first, but that
lost night still puts Fordow a turn further away.

Once in theater, each deck is either **forward** in the North Arabian Sea box east of
Oman or **back** in the deep Arabian Sea toward the Indian Ocean approaches. The air wing
flies at **full sortie generation from either station** — posture is no longer a strike
tradeoff. What forward buys is **presence**: Aegis BMD over the Gulf-state bases (thinning
the ballistic salvos aimed at Al Udeid and Al Dhafra), weight on the Strait of Hormuz that
makes it harder for Iran to close, and a lid on the oil-war premium — paid for by sitting
a hull inside the longest-legged anti-ship weapons Iran owns. Back is untouchable but gives
up all three. Repositioning takes a turn, exposed and without the presence effects until
she is on station.

### Israel

Israel is not an American asset. It is a **semi-autonomous actor with its own clock**,
and it starts *sidelined* — watching, waiting, and losing patience while Iran's
enrichment halls stand.

You have two ways this goes, and only one of them is your choice:

- **Coordinate with them** (diplomatic action). IAF squadrons join openly: +2 fighter
  capacity, and **one** combined US–Israeli deep-strike package unlocks against Natanz
  *or* Fordow — the only path to the buried halls that isn't a B-2. It is genuinely
  strong and genuinely not free. It costs 8 points of world opinion up front, the
  strike itself carries a diplomatic surcharge on top of the target's normal cost
  (−13 at Fordow vs −5 for an American strike), it takes two turns to plan and fly,
  it risks aircrew, and it is **one-shot** — spend it at Natanz and Fordow still needs
  a bomber. Most of all, it makes Israel a live target: Iranian salvos start going
  west, and your war acquires a second front you don't command.
- **Ignore them.** Each turn they sit out while the program is still largely intact
  (under 50% degraded), their patience drops. At zero they **fly the mission
  themselves**, on their timetable, without telling you. They have no penetrators, so
  the results are partial — real damage at Natanz, very little at Fordow — but the
  escalation is total: a heavy world-opinion hit, an oil spike, an approval hit, and
  every capital in the region convinced Washington authorized it. You inherit the
  consequences of a strike you did not plan and could not aim.

Your SecState and NSA will warn you as the clock runs down — the patience count is in
the advisor panel and on the diplomacy button. Coordinating openly widens the war;
letting it happen by default widens it *and* wastes the shot.

Once Israel is in play, Iranian retaliation weights up, its ally-strikes bias toward
Haifa, and a new **missile exchange** event fires: Iran barrages Israel, the IAF
answers, and the counter-strike can destroy Iranian missile bases CENTCOM never
scheduled. It cuts both ways. Like everything else in the sim it is capacity-gated —
a broken Iran cannot sustain a two-front fight.

Israeli bases (Nevatim and Hatzerim) appear on the forward-basing layer in amber
rather than US blue: allied, but not under your command.

### When an aircraft goes down: personnel recovery

Fighter packages flown against live SAMs can be shot down. Most of the time the crew
gets out — two good chutes, two beacons, and living Americans on Iranian soil. When
that happens, and *only* when that happens:

- An amber **AIRCREW DOWN** marker appears on the map at the crash area, and a
  **PERSONNEL RECOVERY** panel opens at the top of the situation room showing the
  callsign, the airframe, how long they have been down, and the running **capture
  risk**. Recover them or lose them; both panel and marker disappear the moment it
  resolves either way.
- **Every turn you wait, the odds get worse in both directions** — the recovery
  estimate falls and the capture risk rises, because IRGC search parties are working
  the ground and helicopters are flying a pattern over it. Do nothing long enough and
  they are taken alive: hostage crisis, −10 approval, −4 world opinion, and Tehran
  running the footage for the rest of the war.
- **Push ISR** (spends the turn's action slot) to lock the position: +10% recovery,
  −8% capture risk.
- **Launch the recovery** — a pair of HH-60W Jolly Green IIs with pararescuemen, an
  A-10 Sandy flight as on-scene commander, tankers off the coast. Costs one fighter
  sortie for the escort. One attempt. It plays out live in the tactical panel over
  about seventy seconds, and it branches four ways: everyone out clean; everyone out
  at the cost of a pararescueman and a shot-up airframe; a **partial recovery** where
  the helicopter leaves with one crewman and not two; or the rescue force itself
  destroyed on the objective — a downed Jolly, a downed Sandy, up to nine dead, and
  more Americans in IRGC custody than the shootdown created.

Night turns (18:00) help. Rolled-back SAM belts help. A carrier forward helps. Time
does not. The failure cases are the harshest political outcomes in the game — a failed
rescue costs 15 points of approval and 8 of world opinion — and a clean one is worth
more at home than any target on the map.

### Damage, condition, and repair

Fixed installations are worn down, not switched off. Every target carries a **0–100
condition track**, and a strike package that achieves full effects takes 55 off it —
half that on partial effects, nothing on a miss. So a SAM complex, missile base, naval
base, airbase, refinery or command node takes **two good packages to finish**, and it
keeps fighting on whatever is left in the meantime: air defenses screen the skies in
proportion to their condition, and a missile brigade at 30% throws 30% of the salvo.

The counterpart is that **Iran repairs overnight**. Any damaged site you don't put
ordnance on this turn gets crews, spare radars and fill dirt, and climbs back toward
full — fastest at command nodes (+14/turn), slowest at oil infrastructure (+5/turn),
and slower across the board once the IRGC command complex is degraded. **Zero is
permanent**: nobody reconstitutes rubble mid-war. The practical consequence is that
concentration beats spread — two packages on one target in the same turn kills it,
one package a turn just keeps it wounded while you pay for it.

Two kinds of target sit outside this. The **nuclear sites** take damage in whole steps
— 100 → 50 → 0 — because the buried halls are all-or-nothing by design.

**Ships are one-hit kills.** A warship that takes a weapon is not "damaged" in any
sense the war cares about; she is on the bottom, or she is still shooting at you. Any
package that achieves effects sinks her outright, there is no partial result to follow
up, and nothing about a sunk hull ever comes back. Which makes the **submarine attack**
the cheapest shot in the game: USS *Toledo* is on patrol in the Gulf of Oman, and one
**Mk-48 ADCAP** heavyweight out of her tubes kills a hull as dead as a two-missile salvo
does. It is the only package in the war that spends nothing off the theater magazine —
the weapon is already aboard — puts no aircrew at risk, teaches Iran nothing (she is
never held on sonar, and a pattern nobody can observe is a pattern nobody can counter),
and gives no warning at all. What it costs is **two turns**, because the boat has to
close inside firing range submerged first, and **one of four war shots**: nobody reloads
a boat on patrol. The Caspian flotilla is the exception and always will be: no submarine
has ever reached a landlocked sea.

The run is fought on its own display — a sonar plot, not a radar scope. There is nothing
to shoot back with, so there is no threat ring and no sweep; there is a weapon walking
down a guidance wire at 40 knots while the boat holds the solution passive, a
bearing-time recorder writing the picture down as it comes in, and then **ENABLE**: the
wire parts, the seeker goes active, and the ping rate climbs the whole way in. If she
hears it in time she puts a noisemaker over the side and turns away, and the weapon
reattacks around the false target. What ends it is an under-keel detonation — the
warhead does not touch the hull, it takes the water out from under it.

### Each turn you can

- **Lay on strikes** — click any Iranian target on the map, pick a strike package,
  review estimated success / time on target / risks, and authorize. **Strikes take
  time**: authorizing commits the assets and puts the mission *in flight* — fighter
  and TLAM packages arrive at the end of the turn, with battle damage assessment in
  the battle report; B-2s transiting from Diego Garcia take two turns. Missions
  resolve in the order they were laid on, so a SEAD sweep queued first clears the air
  for the packages behind it.
  - *Fighter sorties* — flexible, but at risk from whatever SAMs are alive at TOT.
  - *Cruise missiles (TLAM)* — no aircrew risk, ineffective against buried sites.
  - *B-2 missions (GBU-57)* — scarce, slow to arrive, and not in theater until the
    509th is deployed forward; the **only** weapon that can kill Fordow.
- **Move forces** — surge the *Ford*, deploy the B-2s forward, or shift a deck between
  the North Arabian Sea and the deep Arabian Sea. Only one deployment order can be cut per turn
  (see above); posture changes are free of it.
- **Spend the action slot — on doing, or on knowing.** There is one slot a turn and
  everything competes for it: backchannel talks, UN pressure, sanctions, coalition
  building, **coordinating with Israel**, an address to the nation, **ISR prep** for the
  raid, a **recovery push** for downed aircrew — and the four intelligence taskings:
  reassess damaged sites, hunt dispersed launchers, reassess the enrichment timeline,
  or assess the Iranian war plan. That contention is the point.
- **Decide what to do about Israel** — see below. Doing nothing is also a decision.
- **Launch the leadership raid** — a single Tier-1 SOF task force, one attempt for
  the whole game. Base odds are low; ISR prep and degraded air defenses / IRGC
  command raise them. Success shatters Tehran's command chain (and may open — or
  poison — the negotiation window); failure puts dead or captured operators on
  Iranian state TV.
- **Go get your people** — *only if a strike aircraft has actually been shot down.*
  There is no standing rescue button; the panel does not exist until aircrew are on
  the ground. See below.
- **End the turn** — your packages arrive and BDA comes back, then Iran answers with
  whatever the volley left standing: missile barrages, proxy attacks, shipping
  attacks, cyber, or moves against the Strait of Hormuz.

### Watching the strike go in

While packages are in the air the chart gives way to **the wall** — four screens in
the map panel, behind the room's own glass:

- **FEED 01 / FEED 02**, top-left and bottom-left. The tactical scopes: the radar
  picture, the formation flying its run in, the SAMs that rise to meet it, and the
  strike footage when the weapons land. Two of them, because packages overlap — one
  flight holding its egress beat while the next comes off the deck is what a night
  actually looks like, and a single scope could only ever show you one of them.
- **COP PLOT**, top-right. The theater, still live, with a ring on whatever site is
  being serviced right now.
- **STRIKE NET**, bottom-right. Every radio call from both feeds, with the callsign
  in front of it, drawn as traffic on the net.

The wall comes up when the first package launches and goes down when the last one is
off it. **SKIP TO RESULTS** drops it immediately and resolves the turn.

The game autosaves at each turn boundary and after every resolved action —
use **Continue** on the title screen to pick up a war in progress, **Save & Quit** to
step away, and the mute toggle in the status bar to silence sound effects.

### Tips

- Intact air defense networks (SEAD targets) degrade every non-stealth strike and can
  shoot down your aircraft. Roll them back first — and remember that a shootdown is
  not just two names on a list, it is a rescue decision you will have to make under a
  clock.
- **If you have aircrew on the ground, go the first night.** Waiting a turn is the one
  thing that worsens the recovery odds and the capture odds at the same time. Push ISR
  *and* launch in the same turn — it costs the diplomatic action slot, not the clock.
- **Tempo is everything.** Iran does not stop shooting because you did, and its war
  machine spins up over the first days. Every turn it survives is a turn it spends
  killing Americans.
- **Plan your volleys.** Strikes land at the end of the turn, in the order you queued
  them — SEAD first, then the packages that need clear skies. Watch the MISSIONS IN
  FLIGHT list so you know what is already inbound.
- **Finish what you start.** A half-serviced target list is worse than a short one:
  everything you leave damaged repairs itself while you are somewhere else. Stack two
  packages on one site in the same turn rather than one package on two sites.
- Iran's retaliation scales with what's left of its missile and naval forces. Killing
  missile bases thins the barrages; killing naval bases lets the Fifth Fleet force the
  Strait of Hormuz back open. A dead navy can't keep the strait shut.
- Striking oil infrastructure is economic pressure with brutal diplomatic costs — and
  Iran retaliates against shipping.
- **Decide about Israel early, on purpose.** The worst outcome is drifting into their
  unilateral strike: you pay the escalation, Fordow survives, and you never got the
  joint package. If you're going to bring them in, do it while there's still a buried
  site worth spending the shot on — and roll back the SAMs first, because the joint
  package is manned aircraft and air defenses gut its odds.
- Don't open with the backchannel: Tehran reads early overtures as weakness and your
  approval pays for it. Break their forces first; the Omanis will tell you when the
  pragmatists start counting launchers.
- Watch the Strait of Hormuz indicator and the casualty count — those two clocks, plus
  approval and the enrichment estimate, are what actually beat you.
- **Buy the enrichment assessment early.** A low-confidence band five turns wide is the
  difference between pacing the campaign correctly and discovering on turn 14 that you
  had four turns, not nine.
- **A wide BDA band is a wasted package waiting to happen.** If the estimate says
  `20–60%`, you genuinely do not know whether one more package finishes the site or
  bounces off it. Task a collection deck before you spend the ordnance.
- **Grind missile bases down before you finish them.** What escapes into the country is
  measured from the brigade's strength when the night began. Patience kills launchers;
  a one-turn alpha strike lets the whole brigade drive away.
- **A launcher fix is perishable.** Find them and service them the same turn, or you
  will pay for the same fix twice.
- **Mix the force.** Iran adapts to whatever you fly repeatedly. Alternating platforms
  keeps both counters shallow.
- **When the fleet is warned, answer it.** An anti-ship workup is announced before it is
  rolled, and you have three outs: ride it out, pull the deck back for a day, or kill
  the shooter tonight. Ignoring the warning is the only wrong answer.
- **Address the nation on a schedule.** Every one is five points on the floor when the
  War Powers vote comes up, and that vote can end the war outright.
- Striking oil infrastructure is economic pressure with brutal diplomatic costs — and
  Iran retaliates against shipping. What it *buys* is Iran's repair effort: refineries
  fuel the generators, cranes and trucks that put every other site back together.

## Project Structure

```
commander-in-chief/
├── index.html        # Layout: map, sidebar, status bar, modals
├── css/
│   └── style.css     # Dark situation-room theme
├── audio/            # Sound effects (synthesized in-house, royalty-free WAVs)
└── js/
    ├── geodata.js    # Real country outlines (Natural Earth 50m, generated)
    ├── data.js       # Targets, US assets, static data
    ├── map.js        # SVG map, pan/zoom, icons, strike animations, the strike wall
    ├── ai.js         # Iranian AI opponent, advisors, headlines
    ├── audio.js      # Sound manager: preload, play, mute toggle
    ├── ui.js         # HUD, sidebar, modal rendering
    ├── specops.js    # Special forces: ISR prep + leadership raid
    ├── csar.js       # Combat search and rescue: downed aircrew, recovery mission
    └── game.js       # State, turn loop, strikes, save/continue, endings
```

Vanilla HTML/CSS/JavaScript. All state is client-side. The SVG map uses real country
borders from [Natural Earth](https://www.naturalearthdata.com/) 50m data (public domain),
pre-projected into the game's coordinate space and baked into `js/geodata.js`, so there
are still no API keys or network calls. Targets and bases sit at their real-world
coordinates (equirectangular projection, standard parallel 28°N).

## Deploying to GitHub Pages

The game is fully static and deploys from the repository root.

1. Push the repo to GitHub:
   ```sh
   git remote add origin https://github.com/<you>/commander-in-chief.git
   git push -u origin main
   ```
2. On GitHub: **Settings → Pages → Build and deployment**
   - Source: *Deploy from a branch*
   - Branch: `main`, folder: `/ (root)`
3. Your game will be live at `https://<you>.github.io/commander-in-chief/`.

(Alternatively, use the `/docs` folder method by moving the files into `docs/`, or a
`gh-pages` branch — the root-of-`main` method is the simplest for this layout.)

## License

MIT
