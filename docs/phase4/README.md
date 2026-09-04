# Phase 4 accessibility verification

Build: v2.40

The responsive smoke test covers comfortable-reading persistence, essential
14px text, accessible names and toggle state, disclosure state, the hard-mode
text route into strike planning, dialog initial focus/trapping/return focus,
horizontal overflow, and reachability of the map and session actions.

Viewport evidence:

- [390×844 portrait phone](screenshots/situation-room-390x844.png)
- [844×390 landscape phone](screenshots/situation-room-844x390.png)
- [768×1024 tablet](screenshots/situation-room-768x1024.png)
- [1366×768 laptop](screenshots/situation-room-1366x768.png)
- [1440×900 desktop](screenshots/situation-room-1440x900.png)
- [1366×768 at approximately 200% zoom](screenshots/situation-room-200pct-683x384.png)

Screen-state evidence:

- [Title screen](screenshots/title-1440x900.png)
- [Situation room](screenshots/situation-room-1440x900.png)
- [Decision brief](screenshots/decision-brief-1440x900.png)
- [Strike wall](screenshots/strike-wall-1440x900.png)
- [Turn report](screenshots/report-1440x900.png)
- [Endgame](screenshots/endgame-1440x900.png)

The browser harness always launches with `--mute-audio`. These images are
programmatic page captures; no screen recording, microphone, or system audio is
used.
