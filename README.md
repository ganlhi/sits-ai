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
  combat/            Phase 5: dice and distributions, the Missile Defense Card, missile defense,
                     damage allocation, beams, damage control, the expectation layer
  ai/                Phase 6: doctrines, candidate generation, the evaluator, order sheets, seals
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
| 5 — combat resolution engine (resolve + expect) | done |
| 6 — AI opponent v1 (heuristic, sealed orders, order sheets) | done — needs its three-game playtest |
| 7 — AI v2, officers/miracles, pods, LACs | next, only if v1 plays too shallow |

## The opponent

Mark a ship *ai* at setup and give it a doctrine (balanced, missile duel, close to beam range,
evade). When the plotting step opens the AI plots every one of its ships first — it enumerates
every legal pivot/roll/thrust within the ship's ratings, scores each with the expectation layer
(boxes it expects to deal by missiles and beams minus boxes it expects to take, with the enemy
assumed to drift and hold attitude, plus the doctrine's range and wedge preferences and a little
noise) — locks the best, and shows only a **seal** (a hash of the orders). Lock your own ships
and the order sheets are revealed in the book's notation with a one-line reason: *"Pivot 2
windows: Forward from A(yellow) to A/B(blue, upper). Roll 1 window to starboard. Thrust 2 along
the Midpoint facing …: write 1 in A, 1 in B into the AVID arrows. Launch from the Starboard
Broadside: 32 tubes at HMS X, Middle + Late salvoes."* Step 3 lists its launches; the move
steps repeat the sheet next to the attitude to set.

## Combat at the table

The impact steps offer to resolve a salvo or a beam impact with the app's dice: it pre-fills
missiles, MQL (range band + fire control + TAC grade), the target's ECM, countermissile and
point-defense probable kills, decoys and wedge from the game state, shows the expected result,
rolls, lists every effect (penetration, hit location, boxes, cascades, explosion checks) and
applies it to the target's sheet in one tap. End of turn has damage control. Prefer real dice?
Tap the destroyed boxes on the sheet instead — both paths are just events.

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

## Publishing on GitHub Pages

The repository ships a workflow ([.github/workflows/pages.yml](.github/workflows/pages.yml))
that tests, builds and deploys the app on every push to `main`. To turn it on:

1. Push this repository to GitHub (the folder is already a git repo with `main` as its branch):
   ```
   git remote add origin https://github.com/<owner>/<repo>.git
   git push -u origin main
   ```
2. On GitHub: **Settings → Pages → Build and deployment → Source: “GitHub Actions”**.
3. Push (or run the workflow from the **Actions** tab). The app appears at
   `https://<owner>.github.io/<repo>/`. On a phone, open that address and *Add to Home Screen*;
   it then works offline and updates itself on the next visit after each deploy.

The base path is derived from the repository name (`BASE_PATH=/<repo>/`), so the workflow
needs no editing if you rename the repository. For a user/organisation site
(`<owner>.github.io` as the repository name) set `BASE_PATH: /` in the workflow instead.

Nothing on the page talks to a server: games and ship classes stay in the visiting browser's
IndexedDB and localStorage. Export a game or class to JSON before clearing site data or
switching devices.

## Ship classes

Built in: the core book's **Sample-class SD** and three Ship Book cards from the folder above
— **Sultan-class BC** (People's Navy, SB1), **Warrior-class CA** and **Havoc-class DD** (RMN,
SB3) — transcribed from the vector PDFs in `src/data/ships/`. The Ship Book 2 and 3 PDFs in
that folder hold the rest of the fleets and can be added the same way (or through the editor).

## Entering a ship class

Ship classes are typed in from the physical SSD in the **Ship classes** screen, using text
forms that read like the card: a track is `0 0 1 3 | 4`, `_*8 (W)` or `2*9 1 1*5 (1)*3`; a
weapon line is `16M | !8` (a countdown of 8 tubes); the hit location table is 11 rows of 19
codes with `.` for blank and `*SI*` for the Core. Classes are validated as you type, saved in
the browser, and can be exported/imported as JSON. The built-in Sample class is the template.

Things transcribed from the scan that should be checked against the physical components are
marked `[verify …]` in source comments and listed in RULES.md §23.
