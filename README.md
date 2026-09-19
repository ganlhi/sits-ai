# SITS AI

An offline PWA that plays the opposing side in the *Saganami Island Tactical Simulator*
tabletop wargame. You set up the game, the app issues orders for its ships each turn, you
execute them on the physical table and report back what happened.

- Rules, restated for implementation: [RULES.md](RULES.md)
- Development plan and phase gates: [PLAN.md](PLAN.md)

## Layout

```
src/domain/          pure TypeScript, no DOM / React / storage imports — the rules engine
  geometry/          Phase 2: hexes, vectors, the AVID, attitude, bearings, thrust plotting,
                     turn motion, firing arcs (tests alongside, built from the book's examples)
  ssd/               Phase 3: the Track abstraction, hit location table, ship class model,
                     damage state, validation
  game/              Phase 4: game state as a fold over events, the nine-step turn machine,
                     derived facts (markers, launch geometry, arcs)
src/data/ships/      ship classes; sampleSd.ts is the core book's Sample-class SD, the fixture
src/storage/         persistence: ship library (localStorage), game event logs (IndexedDB/Dexie)
src/ui/              React components (AvidFlat, AvidSphere, SsdSheet, SsdEditor, game screens …)
src/inspector/       the dual-view AVID inspector (dev tool, becomes the Phase 4 widget)
scripts/             environment helpers
```

Conventions, everywhere: map direction **A** is +y (north), directions run clockwise A→F,
altitude is +z; azimuths are degrees clockwise from A. Hexes are cube coordinates. An
attitude is an orthonormal (Forward, Top) frame; the six AVID markers are derived from it.

## Setup

Node 24+. The project lives in a Google Drive folder whose path contains an emoji, and both
facts matter:

- **Install dependencies with `scripts/install-deps.ps1`**, not `npm install`. npm's parallel
  extraction corrupts files on Google Drive's streaming filesystem (and the filesystem refuses
  junctions, so `node_modules` cannot be redirected). The script installs into
  `%USERPROFILE%\.sits-ai\staging` and mirrors `node_modules` back single-threaded with retries.
  To add a package: `scripts\install-deps.ps1 -Packages "-D zod"`.
- **Run tools through `npm run …`**, whose scripts call `node` on relative paths. The
  `node_modules\.bin` shims fail on the emoji path.

```
npm test            # vitest
npm run typecheck   # tsc --noEmit
npm run dev         # the inspector at http://localhost:5173
npm run build
```

## Status

| Phase | State |
|---|---|
| 1 — rules synthesis | done |
| 2 — geometry kernel + dual-view AVID inspector | done |
| 3 — SSD schema, Sample-class fixture, editor | done |
| 4 — playable notebook PWA (no AI) | done — needs its table test (≤ 90 s of entry per turn) |
| 5 — combat resolution engine | next |

## Playing with the notebook

**Games** → create → add the ships on the table (class, side, who controls it, hex, altitude,
vectors, Forward and Top windows) → *Start turn 1*. The step bar follows the Reference Card:
markers, plotting (lock every ship's pivot/roll/thrust; the app shows the Midpoint facing,
displacement and EoT), launch geometry (ranges, salvoes, bearings, impact windows, which mounts
bear), impact prompts with beam ranges, move prompts with the attitude at the Midpoint and EoT
(flat AVID, optional 3-D), and end of turn (vector consolidation shown step by step). *End turn*
moves every ship to its EoT marker. Whatever the table disagrees with, report it in the ship
panel; tap boxes on the sheet to mark damage. Every change is an event: **Undo** removes the
last one, and a game exports as its event log.

Installable and offline: `npm run build` then serve `dist/` (or `npm run preview`).

## Entering a ship class

Ship classes are typed in from the physical SSD in the **Ship classes** screen, using text
forms that read like the card: a track is `0 0 1 3 | 4`, `_*8 (W)` or `2*9 1 1*5 (1)*3`; a
weapon line is `16M | !8` (a countdown of 8 tubes); the hit location table is 11 rows of 19
codes with `.` for blank and `*SI*` for the Core. Classes are validated as you type, saved in
the browser, and can be exported/imported as JSON. The built-in Sample class is the template.

Things transcribed from the scan that should be checked against the physical components are
marked `[verify …]` in source comments and listed in RULES.md §23.
