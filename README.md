# SITS AI

An offline PWA that plays the opposing side in the *Saganami Island Tactical Simulator*
tabletop wargame. You keep the real bookkeeping on the table — SSDs, salvo cards, dice — and
the app tracks only what its opponent needs to plot: where every ship is, how it is oriented,
how fast it goes, and roughly how hurt it is.

- Rules, restated for implementation: [RULES.md](RULES.md)
- Development plan and history: [PLAN.md](PLAN.md)

## The turn, at the table

Every turn follows the book's sequence (RULES.md §3): a report, the AI's plot, your displaced
markers, the AI's launches.

1. **Report the table.** For every ship, the card shows what the app expects — an AI ship
   where its orders put it, a player ship at its EoT marker — and you change what the table
   disagrees with:
   - **position**: hexes from the centre of the map, as two legs (`9 in A`, then `3 in B`) and
     an altitude;
   - **orientation**: the Forward and Top markers, in the AVID's own notation;
   - **vectors**: the eight arrows around the AVID;
   - **ratings this turn**: thrust, pivot and roll as the SSD now gives them;
   - for each side (forward, aft, port, starboard): a **battle damage assessment** (undamaged,
     light, medium, heavy, crippled) and its **combat effectiveness** as a percentage;
   - **out of action** when the ship is destroyed or has struck: it drifts and is ignored.
2. **AI plotting** (step 2). Plot your own ships, then click: every AI ship plots pivot, roll
   and thrust from the report, and shows only what the table would — its Midpoint and EoT
   markers, and whether thrust displaced the EoT one. The report is locked from here on.
   Then tick each of your ships whose EoT marker you displaced and say where it now is.
3. **AI shooting** (step 3). The AI chooses its launches against the EoT markers as they now
   stand — it knows where you displaced to, not how you pivoted or rolled — and shows its full
   order sheets: pivot (windows and target window), roll, thrust (with the vector changes to
   write into the arrows), the Forward and Top windows to set at the Midpoint and at End of
   Turn, and each missile launch with its salvo card entries (range, bearing, impact window,
   band per salvo). The plot is the one made at step 2; shooting never changes it.
4. **Next turn.** The app moves every AI ship to its End-of-Turn marker, finishes its pivot and
   roll and adds its thrust to its vectors; player ships move to their EoT markers. Report
   again.

*Undo* walks back one step at a time: the launches, the plot, then the previous turn. *Shift
the whole table* slides every ship by the same offset when the fight drifts towards a map edge.

## Ship classes

A class is the handful of numbers the opponent plots with, entered in the **Ship classes** tab
(three Ship Book cards are built in):

- **base cost** — the SSD's point cost, the AI's hint at how big and dangerous the ship is;
- **max thrust, max pivot, max roll** — the fresh ratings; each ship's card in a game has its
  own *ratings this turn*, which you lower as damage lands;
- **three range bands** (short, medium, long) as "from N to M hexes", read off the SSD's
  range-band table by the salvoes available: short = Early + Middle + Late, medium = Middle +
  Late, long = Late only. Ranges are End-of-Turn to End-of-Turn.

A ship copies its class when it is added, so editing the library never changes a running game.

## AVID helper

A table aid for your own ships, in the **AVID helper** tab, or from a game with the **AVID**
button beside a ship's name, which opens it with that ship's markers and ratings filled in and a
way back to the game. Give a ship's Forward and Top markers as they are now, tick *pivots* and
walk its Forward along the card one window at a time — the list offers only the windows touching
the last one, with the diagonal steps (yellow to the blue window one column over) in their own
group, greyed once the path has used its one — and give the roll as "N windows to port or
starboard". The path's cost is its number of steps; half of it and half of the roll, rounded
down, are done at the Midpoint, which the chain marks. The tab lists, for the Midpoint and for
End of Turn, every window that may hold the Top marker — three windows from the new Forward, best
fit to the exact attitude first, rotated window to window along the path entered — and the Port,
Starboard, Aft and Bottom windows that go with each. Where the exact Top falls between two windows
both are listed; a Top on the spine between two green windows is called out. If you enter the
ratings it warns when the plan costs more windows than the ship has.

## How the opponent plots

The AI never sees your plot: its movement depends only on the report, and it assumes every
enemy drifts on its vectors and holds its attitude. At shooting it also knows where every EoT
marker ended up. For each of its ships it enumerates every legal
pivot, roll and thrust within the ship's current ratings and scores each with a coarse model:

- **One side per target.** Each side's targeting arc is the AVID window its pointer is in and
  the eight windows around it. A ship targets a given enemy through one side a turn: all its
  salvoes at that enemy come from the side that serves best over the Early, Middle and Late
  bearings, and it expects the enemy to do the same against it. The four arcs tile the
  equator and the blue rows without overlapping; above and below them is the wedge.
- **Firepower from cost.** A broadside is worth the ship's cost, a hammerhead a third of it,
  scaled by the reported effectiveness of that facing. Salvoes follow the band (three at short
  range, one at long) and fade with it; what gets through falls with the target facing's
  effectiveness (its countermissiles and point defense) and is cut hard by the wedge. Beams hit
  automatically within three hexes, never through the wedge.
- **Orientation from the facings.** A weak or damaged facing of the enemy — low effectiveness
  or a bad BDA on that side — is worth more to hit, so the AI brings its strongest broadside to
  bear on it; a weak or damaged facing of its own is worth more to hide, so it rolls it away
  from the incoming bearings or puts the wedge there.
- **Posture from the odds.** Own damage against the enemy's, and own cost against theirs: a
  fresh battlecruiser facing a hurt cruiser presses (closes, weighs damage dealt more); the
  cruiser is cautious (holds its long band); hurt, it turns defensive (opens the range beyond
  everyone's missile reach, weighs damage taken heavily, prizes the wedge). The order sheet's
  rationale names the posture.
- **Doctrine** (balanced, missile duel, close to beam range, evade) is the personality on top:
  the *balanced* doctrine lets the posture set the range goal, the others keep their own. A
  little seeded noise keeps it from being predictable, but the same report always gives the
  same plot.

## Layout

```
src/domain/geometry/  hexes, vectors, the AVID, attitude, bearings, thrust plotting, turn motion,
                      firing arcs — the rules kernel, tested against the book's worked examples
src/domain/game/      ship classes, the game state and reports, firepower from cost, the turn rollover
src/domain/ai/        doctrines and postures, candidate generation, the evaluator, order sheets
src/storage/          games and the class library as JSON in localStorage
src/ui/               React screens: games list, class editor, the game screen, ship cards, order sheets
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
browser; export to JSON before clearing site data or switching devices. The class library is
also per browser; *Restore built-in classes* brings back the three Ship Book cards.
