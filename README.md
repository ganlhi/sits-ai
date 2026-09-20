# SITS AI

An offline PWA that plays the opposing side in the *Saganami Island Tactical Simulator*
tabletop wargame. You keep the real bookkeeping on the table — SSDs, salvo cards, dice — and
the app tracks only what its opponent needs to plot: where every ship is, how it is oriented,
how fast it goes, and roughly how hurt it is.

- Rules, restated for implementation: [RULES.md](RULES.md)
- Development plan and history: [PLAN.md](PLAN.md)

## The turn, at the table

Every turn is three clicks and a report.

1. **Report the table.** For every ship, the card shows what the app expects — an AI ship
   where its orders put it, a player ship drifted along its vectors — and you change what the
   table disagrees with:
   - **position**: hexes from the centre of the map, as two legs (`9 in A`, then `3 in B`) and
     an altitude;
   - **orientation**: the Forward and Top markers, in the AVID's own notation;
   - **vectors**: the eight arrows around the AVID;
   - **battle damage assessment**: undamaged, light, medium, heavy, crippled/destroyed;
   - **combat effectiveness** of each facing (forward, aft, port, starboard), as a percentage.
2. **Reveal AI orders.** Every AI ship gets an order sheet in the book's notation: pivot
   (windows and target window), roll, thrust (with the vector changes to write into the arrows),
   where its Midpoint and End-of-Turn markers go, the Forward and Top windows to set at the
   Midpoint and at End of Turn, and each missile launch with its salvo card entries (range,
   bearing, impact window, base MQL per salvo). You execute them on the table.
3. **Next turn.** The app moves every AI ship to its End-of-Turn marker, finishes its pivot and
   roll and adds its thrust to its vectors; player ships are drifted. Report again.

*Undo turn* goes back to the start of the previous turn. *Shift the whole table* slides every
ship by the same offset when the fight drifts towards a map edge.

## How the opponent plots

The AI never sees your plot: its orders depend only on the report, and it assumes every enemy
drifts on its vectors and holds its attitude. For each of its ships it enumerates every legal
pivot, roll and thrust within the ship's ratings and scores each with a coarse damage model:

- **Ratings from the BDA.** The damage level says how far down the ship's own pivot, roll,
  thrust and ECM tracks the damage has reached (0 %, 20 %, 45 %, 70 %, all), and the rating is
  read off the class card at that depth. A facing's effectiveness scales its launchers, beams,
  countermissiles and point defense, and makes it a juicier target.
- **Missiles**: salvoes by End-of-Turn range band, bearings by salvo timing, mounts that bear
  at launch; the ECM layer as a survival fraction, the wedge as its +12 column shift with no
  countermissiles and half point defense.
- **Beams**: automatic in arc and range at the Midpoint and End of Turn, never through the
  wedge, half range into an unwalled bow or stern.
- **Doctrine** (balanced, missile duel, close to beam range, evade) sets the weights and a
  preferred range; heavily damaged ships weigh damage received more. A little seeded noise
  keeps it from being predictable, but the same report always gives the same reveal.

If an AI ship's real pivot, roll or thrust rating is lower than the BDA implies, cap the order
at the real rating — the geometry is the same.

## Layout

```
src/domain/geometry/  hexes, vectors, the AVID, attitude, bearings, thrust plotting, turn motion,
                      firing arcs — the rules kernel, tested against the book's worked examples
src/domain/ssd/       the ship class model (tracks, mounts, range bands, arcs)
src/domain/game/      the lite game state: reports, ratings from the BDA, the turn rollover
src/domain/ai/        doctrines, candidate generation, the evaluator, order sheets
src/data/ships/       ship classes: the core book's Sample SD, Sultan BC, Warrior CA, Havoc DD
src/storage/          games as JSON snapshots in localStorage
src/ui/               React screens: games list, the game screen, ship cards, order sheets, map
```

The previous full-bookkeeping app (combat engine, SSD editor, AVID inspector, event-sourced
game) lives in git history, on the `bak` branch.

Conventions, everywhere: map direction **A** is +y (north), directions run clockwise A→F,
altitude is +z; azimuths are degrees clockwise from A. Hexes are cube coordinates. An
attitude is an orthonormal (Forward, Top) frame; the six AVID markers are derived from it.

## Setup

Node 24+.

```
npm install
npm test            # vitest
npm run typecheck   # tsc --noEmit
npm run dev         # http://localhost:5173
npm run build       # dist/, an installable offline PWA
```

The npm scripts call `node` on relative paths rather than the `node_modules/.bin` shims, and
`scripts/install-deps.ps1` is a slow but safe installer for a project kept on a Google Drive
folder. Neither is needed on an ordinary local disk.

## Publishing on GitHub Pages

[.github/workflows/pages.yml](.github/workflows/pages.yml) tests, builds and deploys the app
on every push to `main`. Turn it on once with **Settings → Pages → Source: “GitHub Actions”**;
the app appears at `https://<owner>.github.io/<repo>/`. On a phone, open it and *Add to Home
Screen*; it works offline and updates itself after each deploy. Games stay in the visiting
browser; export to JSON before clearing site data or switching devices.

## Ship classes

Built in: the core book's **Sample-class SD**, the **Sultan-class BC** (People's Navy), the
**Warrior-class CA** and **Havoc-class DD** (RMN), transcribed from the Ship Book cards into
`src/data/ships/`. Add a class the same way: a TypeScript file next to them, listed in
`src/data/ships/index.ts`. The AI reads a class's range bands, mounts, weapons, arcs and the
pivot, roll, thrust and ECM tracks; the hit location table and hull are carried but unused.
