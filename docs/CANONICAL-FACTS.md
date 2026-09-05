# Canonical scenario facts

This is the copy desk for facts repeated across the title screen, README,
walkthrough, advisor briefings, reports, headlines, and endgame. Gameplay code
remains authoritative for live values; when a rule or identity changes, update
this sheet and every named surface in the same change.

## Scenario and clock

- The scenario is strategic fiction and has no calendar date or year.
- At **0340 Zulu**, Iranian ballistic missiles strike **Ain al-Asad Air Base,
  Iraq**, killing **seven Americans**. The strike is described as retaliation
  for a covert action Iran attributes to the United States.
- Player control begins at **DAY 1 — 20:00 ET**. Decision turns alternate
  **20:00 ET** and **08:00 ET**, twelve hours apart.
- The operation has a **30-turn (15-day) plan**. Turn 30 is labeled
  **DAY 16 — 08:00 ET** because the first decision occurs on Day 1's evening.
  Turn 30 is a soft culmination point, not an automatic ending; political
  exhaustion accelerates in overtime.
- The War Powers vote occurs on **turn 10**.

## Starting force disposition

| Force | Opening position and status |
|---|---|
| USS *Abraham Lincoln* | Forward and on station in the **Gulf of Oman**. She may move back to the deep Arabian Sea. |
| USS *Toledo* | On patrol in the **Gulf of Oman**, with four Mk-48 war shots. |
| USS *Gerald R. Ford* | In the **eastern Mediterranean**, not yet in theater. A five-turn transit through Suez ends at a fixed **Red Sea** station. |
| 509th Bomb Wing (B-2) | At **Whiteman AFB, Missouri**. A one-turn deployment order stages it at **Diego Garcia**; a B-2 strike then takes two turns to reach its target. |
| B-1/B-52 force | At **Dyess AFB and Barksdale AFB**. A two-turn deployment stages it at **RAF Fairford, England**. |
| Forward land-based force | Strike aircraft, tankers, ISR, missile defense, and support are already distributed across **Al Udeid, Al Dhafra, Ain al-Asad**, and partner bases shown on the map. |

Easy mode automates the theater buildup. Normal and hard require deployment
orders. Only the *Lincoln* has a forward/back posture decision; the *Ford* is
fixed in the Red Sea after arrival.

The decision surfaces are intentionally different: easy asks the president to
choose one complete staffed plan; normal asks for one partial staffed plan plus
manual target fragments; hard asks for every strike package and electronic-
warfare mission to be ordered manually and exposes a finite precision-munitions
ledger. These are different jobs, not price multipliers on the same job.

Every mode has two independent non-strike slots per turn: one intelligence
tasking and one diplomatic order. Recovery ISR and raid preparation spend the
intelligence tasking; they do not consume diplomacy.

## End conditions

Decisive military victory requires both:

1. **100% enrichment-program degradation**, including every declared or
   undeclared enrichment hall; and
2. Iran's **missile force**, **navy**, and **IRGC command** each below their
   victory gate.

The other victories are a negotiated **armistice** after the nuclear program is
destroyed and the missile/naval force is collapsing, or **capitulation under
nuclear threat** during the post-test window.

Defeat occurs when Iran fields its tested device after the four-turn assembly
window, US casualties reach the selected mode's ceiling (easy 320, normal 250,
hard 190), approval reaches the selected mode's collapse floor (easy 24,
normal 20, hard 16), Congress cuts off the war, the Strait of Hormuz has been
closed for 12 cumulative turns, oil reaches $240, or the president orders the
countervalue strike on Tehran. In overtime, political collapse is
**campaign exhaustion** when less than half the nuclear program is gone and a
graded **stalemate** when at least half is gone.

## People and offices

| Display name | Office |
|---|---|
| SecDef Whitfield | Secretary of Defense |
| SecState Okafor | Secretary of State |
| NSA Reyes | National Security Advisor |
| Gen. Halvorsen, CJCS | Chairman of the Joint Chiefs of Staff |

Briefing-room headers may shorten the Chairman's display name to
**Gen. Halvorsen**, but the office remains **Chairman of the Joint Chiefs**.
In this game, **NSA** in a person's title means National Security Advisor, not
the National Security Agency.

## Target identity and location

`TARGETS[].name` in `js/data.js` is the authoritative full target name used by
folders and reports. `TARGETS[].short` is the compact map/readout label, not an
alternate proper name. For covert sites, `TARGETS[].region` is the
intelligence-box location until an aimpoint is found.

| Campaign-critical target | Canonical location |
|---|---|
| Natanz Enrichment Facility | Natanz |
| Fordow Enrichment Plant | Fordow |
| Undeclared Enrichment Hall — Kuh-e Siah | Kuh-e Siah ridge — east of Isfahan |
| IRGC Command Complex — Tehran | Tehran |
| Concealed Missile Brigade — Semnan Corridor | Semnan corridor — Dasht-e Kavir margin |
| Forward Swarm Base — Abu Musa | Lower Gulf islands — Abu Musa and the Tunbs |

The complete missile and naval rosters are victory-gate inputs; copy should say
**missile force** and **navy** unless it is naming a specific entry from the
target table. Arak is the heavy-water/plutonium path but is not an enrichment
hall and does not count toward the 100% enrichment objective. Bushehr Nuclear
Power Plant is not part of the nuclear-weapons objective.

## Terms and abbreviations

| Term | Canonical meaning |
|---|---|
| ATO | Air Tasking Order |
| BDA | Battle Damage Assessment |
| BMD | Ballistic Missile Defense |
| CAOC | Combined Air Operations Center |
| CENTCOM | United States Central Command |
| CJCS | Chairman of the Joint Chiefs of Staff |
| CSG | Carrier Strike Group |
| GCC | Gulf Cooperation Council |
| IAF | Israeli Air Force |
| IRGC | Islamic Revolutionary Guard Corps; UI prose may use “Iranian Revolutionary Guard” in easy mode |
| ISR | Intelligence, Surveillance, and Reconnaissance |
| PGM | Precision-Guided Munition |
| SAM | Surface-to-Air Missile |
| SEAD | Suppression of Enemy Air Defenses |
| TLAM | Tomahawk Land Attack Missile |

Use **Strait of Hormuz** on first reference and **Hormuz** thereafter. Use
**Ain al-Asad** consistently; do not alternate it with “Al Asad.”

## Release identity

- Current playable build: **v2.41**.
- Status: **BETA — actively developed**.
- Easy and hard are playable. Normal is implemented but remains visibly marked
  **COMING SOON** on the title screen.

The title-screen badge and every primary-app cache stamp in `index.html` must
carry the same version. The README status and this sheet must change with any
release-status change.

## Surfaces checked for v2.41

- title screen and version badge;
- README rules and force-disposition sections;
- both walkthrough variants and the written primer;
- advisor identities and briefing-room offices;
- dynamically generated target folders, battle reports, and headlines;
- objective panel, War Powers dialog, nuclear-release sequence, and endgame.
