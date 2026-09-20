# SITS AI Opponent — Development Plan

Phase 1 (rules synthesis → [RULES.md](RULES.md)) is complete. This document plans phases 2–9.

---

## Shape of the problem

Three things determine the order of everything below.

**1. The geometry is the hard part, not the AI.** SITS tracks each ship as a position in a hex
grid *plus* a signed altitude, a set of velocity vectors in eight directions, and an attitude
expressed as six markers on a 50-window spherical display. Nothing — not range, not bearing, not
"can this mount bear on that target", not "is the wedge between me and those missiles" — can be
computed until that model exists and is correct. An evaluation function is a few hundred lines on
top of a working kernel and impossible without one.

**2. The data-entry burden is the product risk.** The player plays on a physical table and reports
back. Every turn they must tell the app where enemy ships are, how they are oriented, what their
vectors are, and what damage was scored. If that takes four minutes a turn the app is worse than
no app. This has to be tested with a real game on a real table before the expensive engine work,
not after.

**3. There is no ship data.** The core rulebook contains no SSD for any real class — only the
generic *Sample* class used for illustration (see [RULES.md §23](RULES.md)). Real stats live in
*Ship Book 1*, a separate Ad Astra product not in this repo. The plan routes around this rather
than waiting on it: the app gets an SSD editor, and the *Sample* class serves as the test fixture
throughout.

---

## Technical decisions

Proposed, to confirm before Phase 2 code starts. None is exotic; the point is to fix them once.

| Area | Choice | Why |
|---|---|---|
| Language | TypeScript, strict | The domain is full of easily-confused scalars (windows vs hexes vs degrees); branded types are worth real money here |
| Build / PWA | Vite + `vite-plugin-pwa` (Workbox) | Smallest path to an installable, fully offline app |
| UI | React | AVID and SSD widgets are stateful and fiddly; component model earns its keep |
| 3D view | Three.js via react-three-fiber, lazy-loaded | The rotatable AVID sphere — a correctness oracle in Phase 2 and a comprehension aid in Phase 4. Lazy-loaded so the flat view carries none of its weight |
| Persistence | IndexedDB via Dexie | Games must survive a browser restart at the table. No backend, no account, no network |
| Testing | Vitest + fast-check | Property tests for the geometry kernel (see Phase 2 acceptance) |
| Structure | One repo. `src/domain/**` is pure TypeScript with **zero** imports from React, DOM or storage; enforced by lint rule | Lets the whole rules engine be tested headless and reused by the AI search |

No backend anywhere in the plan. The app is a single-player offline tool; everything lives on the
device, with JSON export/import for backup and sharing.

---

## Phase 2 — Geometry kernel

**Goal:** a headless, dependency-free TypeScript module that answers every spatial question the
game asks, verified against the rulebook's own worked examples.

**Deliverables**

- **Position**: hex coordinate (axial) + signed altitude. Direction set A–F plus `+`/`−`.
- **Vectors**: the eight-direction velocity set, addition, and the **consolidation algorithm**
  (all 180° pairs first, then 120° pairs, per [RULES.md §8](RULES.md)) including the declared
  tie-break when two vectors are equally eligible.
- **AVID**: the 50 distinct windows — 12 yellow, 12 blue upper, 12 blue lower, 6 green upper,
  6 green lower, purple up, purple down — as a first-class type, with the window-distance metric
  that pivot and roll ratings are denominated in, and the green-ring spine placement case
  ([RULES.md §5.1](RULES.md)).
- **Attitude**: derive all six orientation markers from (Forward, Top); validate the
  3-windows-from-Forward and 6-windows-opposed invariants. Pivot and roll as operations on an
  attitude, with the midpoint attitude (half the pivot, half the roll) computed for step 5.
- **Range & bearing**: RALT true range and ring from horizontal distance + altitude difference,
  the §9.2 rules-of-thumb as a cross-check, the 3:1 hex-edge/hex-corner bearing rule, and
  **reciprocity** (`A(yellow)` ↔ `D(yellow)`; blue upper ↔ blue lower six windows away).
- **Firing arcs**: map a bearing to a mount's arc window and its colour ([RULES.md §10.1](RULES.md)).
- **Movement**: midpoint and EoT marker placement, altitude split across the move, thrust
  application along midpoint orientation, **displacement** (half the vector change, carried
  fractions, none if pivoting) with the Engineering-officer variants.

**Acceptance criteria.** Every worked example transcribed in RULES.md reproduces exactly: the four
`Z1.0` attitude examples, the `C1.14` range sidebar, and HMS *Dulcinea*'s vector consolidation.
Property tests assert the invariants: bearings are always reciprocal; attitude marker pairs always
share a ring; consolidation never changes the net displacement of the velocity.

**Risks, and the dual-view inspector.** The AVID's flat projection of a sphere is the thing most
likely to be got subtly wrong — particularly the upper/lower hemisphere collapse (where one printed
window stands for two real directions) and the green ring's missing corner windows. Tests catch
what you thought to assert, and these are errors of imagination: the model will be self-consistent
and wrong.

So build the **dual-view AVID inspector** as the first real artifact of this phase: one attitude
data structure, rendered two ways side by side.

- the **flat projection**, matching the physical play aid window for window;
- a **rotatable 3D sphere**, with the six orientation markers as points on it, the ship drawn in
  its actual attitude, and — once Phase 5 exists — the wedge, sidewalls and mount firing arcs as
  solid volumes.

Be precise about what this does and does not verify. Both views read the same kernel, so a bug in
the *kernel* (a wrong window-adjacency metric, say) appears in both and neither flags it. What the
pair does catch is any bug in *either renderer*, as a visible disagreement. The real value is the
third comparison: **the 3D view can be checked against the miniature in your hand**, which the flat
view cannot. That is a genuine external oracle — set the model's attitude, rotate the sphere, hold
the ship up, and see whether they agree. It is the only way to test the kernel against physical
ground truth rather than against your own reading of the book, and it makes the "verify against the
physical components" backlog in [RULES.md §23](RULES.md) tractable.

This is why it is **not a throwaway**. Build it to keep: Phase 4 promotes it to a player-facing
component.

**Side task.** Work the verification backlog in [RULES.md §23](RULES.md): re-render the degraded
pages at higher scale, or check against the physical components. `B5` (operational movement) and
the red-lining rule `B3.231` are the two that block later phases.

---

## Phase 3 — SSD schema and ship data

**Goal:** a ship is a data file, and the app can read, validate and display one.

**Deliverables**

- **SSD schema** (JSON + TypeScript types + validator) covering everything in
  [RULES.md §22](RULES.md): header, costing box, range bands, four mounts with arcs and fire
  control / magazine / weapon / decoy tracks, structural, command, defensive, propulsion, maneuver,
  and the Hit Location Table.
- **The damage-track abstraction.** Nearly every rating in the game is "the leftmost unchecked box
  of a track", and nearly every damage effect is "check the leftmost unchecked box". Model *one*
  `Track` type — an ordered list of boxes, each with a value and optional special marking (core
  cascade `C`, wrench, circled `W`, terminal star, fractional PD box) — and derive current pivot,
  roll, thrust, ECM, sidewall and fire-control ratings from it uniformly. This single decision
  removes most of the accidental complexity from Phases 5 and 6.
- **Hit Location Table** as a 2D lookup with the core region, sidewall edges and hammerhead armour
  modifiers.
- **The *Sample* class**, transcribed cell-by-cell from the core book, as the canonical test fixture.
- **SSD editor UI** (first real screen): enter or edit a ship class by hand, validate, save, export.

**The ship-data decision.** Two paths, and the plan works either way:

- *If you have Ship Book 1*: transcribe classes into the schema, same method as Phase 1 — render
  pages, read them, verify against worked examples. Budget roughly a session per handful of classes.
- *If not*: the SSD editor is the answer, and you enter the classes you actually own as you need
  them. Either way, do not let the app ship invented stats.

**Acceptance criteria.** The *Sample* class round-trips through schema → storage → display without
loss, and its Hit Location Table reproduces the book's damage-allocation examples.

---

## Phase 4 — Vertical slice: the digital table notebook

**Goal:** a working PWA that tracks a real game, with **no AI at all**. This phase exists to prove
the data-entry model before anything expensive is built on top of it.

**Deliverables**

- App shell: installable PWA, offline, game list, new game, resume game.
- **Event-sourced game state.** Every change is an event (`OrdersIssued`, `PositionReported`,
  `DamageReported`). State is a fold over events. This gives free undo, a full replay log for
  debugging AI decisions later, and — critically — lets the player correct a turn they misreported
  three turns ago without losing the game.
- The **turn-cycle state machine**: the nine steps of [RULES.md §3](RULES.md), with the app walking
  the player through them in order.
- **The AVID widget**, promoted from Phase 2's inspector. The signature component, in two linked
  views over one attitude:
  - **Flat** — canonical and primary. Draw the rings, place and drag the six markers, show pivot
    arcs with their midpoints, show vectors in the outer arrows. It stays primary because the
    player has a physical AVID card on the table and because orders are written in window notation
    (`B/C(blue, upper)`), which is what the flat view speaks.
  - **3D** — rotatable sphere with the ship drawn in its attitude. This is how the player answers
    *"what does that actually mean for the miniature in my hand"* before applying an order, and it
    is where the questions the flat projection makes hard become obvious: is the wedge between me
    and the impact window, does this mount bear, which way is the hull actually pointing.

  Both views are used for display of AI orders and for entry of player-ship attitude; edits in
  either update the other.
- **Position and vector entry**, and **damage marking** by tapping boxes on a rendered SSD.
- **Minimum-input design.** Default everything to unchanged; only ask for deltas; infer what can be
  inferred (a ship that displaced did not pivot). Treat every field the player must type as a
  defect to be designed away.

**Acceptance criteria — the real one.** Play a complete game of SITS at the table, both sides
manual, tracking everything in the app. Time the per-turn data entry. **If it exceeds roughly 90
seconds per turn, stop and redesign the input model before Phase 5.** Write down every moment the
app was wrong, slow or ambiguous; that list is the Phase 4b backlog.

---

## Phase 5 — Combat resolution engine

**Goal:** pure functions covering every combat rule, in two modes — *resolve* (sample outcomes) and
*expect* (compute the distribution without rolling).

The second mode is the non-obvious requirement. The dice are rolled on the physical table, not in
the app, so a naive reading says the app never needs to resolve anything. But the AI cannot choose
a move without estimating what each candidate is worth, and that estimate *is* the resolution
mechanic run as a probability calculation. Build both modes from one implementation.

**Deliverables**

- **Missile launch**: salvoes by EoT-to-EoT range band, missiles per salvo, base MQL, launch
  bearings by salvo timing (early/middle/late), linked salvoes.
- **Missile defense**: the 25-column ECM layer table, the 19-column active defense table, wedge
  interposition, decoys, canister shot ([RULES.md §12](RULES.md)).
- **Damage allocation**: shot placement, penetration and depth, hit location roll, core armour and
  punch-through ([RULES.md §13](RULES.md)).
- **Weapon effects and damage effects by system** ([RULES.md §14–15](RULES.md)), applied to the
  `Track` model from Phase 3.
- **Damage control** ([RULES.md §16](RULES.md)).
- **Expectation layer**: expected damage, kill probability, and expected degradation of each of the
  target's ratings, for a given engagement geometry.

**Acceptance criteria.** Every numeric example in RULES.md §11–16 reproduces. The *resolve* and
*expect* modes agree: 100 000 samples of *resolve* converge on what *expect* predicts.

---

## Phase 6 — AI opponent v1 (heuristic)

**Goal:** the app issues a complete, unambiguous, executable order sheet for each AI ship each turn.

**Approach.** The raw move space is intractable — pivot windows × roll windows × thrust direction ×
thrust magnitude × target selection × tube allocation × defensive posture, per ship, simultaneously.
Do not attempt to enumerate it. Instead:

1. **Doctrine-driven candidate generation.** Each ship has a doctrine (close-to-beam-range,
   missile-duel-at-extreme-range, evade-and-survive, screen-the-flagship). A doctrine proposes on
   the order of 20–50 *plausible plans*, not the full cross-product — "turn to present starboard
   broadside at the expected impact bearing and thrust 4 toward the midpoint", not every legal
   combination.
2. **Evaluation.** Score each candidate with the Phase 5 expectation layer — expected damage dealt
   minus expected damage received — plus positional terms: does this hold the range band I want,
   is the wedge between me and the likely missile impact window, will the mount I need still bear
   next turn.
3. **Selection** with a small amount of randomisation, so the opponent is not exploitable by
   pattern-matching.

**The tensions the evaluator must encode** ([RULES.md §24](RULES.md)): the wedge blocks beams
absolutely but forbids countermissiles and halves point defense; pivoting to bring guns to bear
forfeits displacement; closing to beam range means crossing the enemy's best missile envelope; and
whoever controls range controls how many salvoes each side gets per turn.

**Order sheets.** Orders are executed by a human on a physical table, so they must be stated in the
book's own notation and be unambiguous: *"Pivot 2 windows, Forward to `A/B(blue, upper)`; roll 1
window to starboard; thrust 4 along midpoint facing; launch salvoes 1–2, 8 tubes each, Starboard
broadside, at HMS Fearless, impact window `D/E(blue, lower)`."* Include a one-line rationale per
ship — it is what makes the opponent feel like an opponent rather than a dice table.

Pair each order with its **resulting attitude in the 3D view**, so the player can rotate it, match
the miniature to it, and place the model correctly without having to decode the window notation in
their head. Orienting the miniature is the slowest physical step in a SITS turn; this is where the
3D view pays for itself in play rather than in development.

**Commitment.** Plotting in SITS is simultaneous and secret. The app must lock and display the AI's
orders as committed *before* the player enters their own, with a visible seal, so the player can
trust that the opponent did not peek. This is a fairness feature and it is cheap; build it here.

**Acceptance criteria.** Play three full games against it. It should never issue an illegal order,
never issue an ambiguous one, and should beat inattentive play while losing to good play.

---

## Phase 7 — AI v2 and advanced subsystems

Only if Phase 6 proves too shallow in play. Two independent tracks:

**Deeper AI.** One-ply-per-side lookahead: for each of my candidates, generate the opponent's best
replies with the same evaluator, and score against their expected response rather than their current
position. Monte-Carlo rollouts over the Phase 5 sampler where the expectation model is too coarse.
Opponent-modelling from the game's own event log — the player's observed tendencies are already
recorded by Phase 4's event store.

**Subsystems.** Officers and crew grades, miracle-grade officers ([RULES.md §19](RULES.md)), missile
pods ([RULES.md §18](RULES.md)), LAC squadrons and their special maneuver rules
([RULES.md §17](RULES.md)). Each needs both a rules implementation and an AI that knows when to use
it — a miracle spent badly is worse than not having one.

---

## Phase 8 — Scenarios, forces and victory

- Force construction against a point budget, with the officer/crew cost deltas from the costing box.
- The **patrol scenario generator** ([RULES.md §20.4](RULES.md)) — mission cards for attacker and
  defender, setup, and the resulting asymmetric objectives.
- **Victory points and margin of victory** ([RULES.md §20.2–20.3](RULES.md)). Note the arithmetic
  erratum documented in RULES.md §20.2 and decide explicitly whether to reproduce the book's number
  or the correct one.
- Commander's options ([RULES.md §20.5](RULES.md)).
- The AI must play to the *scenario* objective, not to attrition — a defender who has to survive
  plays very differently from one who has to destroy.

---

## Phase 9 — Hardening and release

- Work the playtest backlog from Phases 4 and 6.
- Error recovery: edit or roll back any past turn; reconcile "the table and the app disagree".
- Export / import a game as JSON; export an order sheet as printable text for the table.
- Performance: AI decision under ~2 seconds on a phone; Web Worker for the search if not.
- Offline verification: install, go airplane mode, play a full game.
- Accessibility and one-handed use — this is operated next to a game table, often standing.

---

## Sequencing summary

| Phase | Output | Gate to the next phase |
|---|---|---|
| 2 | Geometry kernel | Book's worked examples reproduce |
| 3 | SSD schema + *Sample* fixture + editor | *Sample* round-trips losslessly |
| 4 | Playable notebook PWA, no AI | **A real game played at the table, ≤90 s/turn entry** |
| 5 | Combat engine (resolve + expect) | Book's combat examples reproduce; modes agree |
| 6 | AI v1 + order sheets | Three games; no illegal or ambiguous orders |
| 7 | AI v2, officers, pods, LACs | Only if v1 plays too shallow |
| 8 | Scenarios and victory | — |
| 9 | Hardening | Full offline game on a phone |

Phases 2, 3 and 5 are pure headless code and can be built and tested without any UI. Phase 4 is the
one that decides whether the product works at all, which is why it comes before the expensive engine
work rather than after it.

## Open decisions

1. **Tech stack** — confirm or amend the table above before Phase 2.
2. **Ship data** — do you have *Ship Book 1*? It changes Phase 3 from "build an editor and enter
   your own" to "transcribe the book", and it changes what the AI can field.
3. **Scope of the opponent** — is the target a competent sparring partner (Phase 6 is enough) or a
   genuinely strong one (Phase 7 is required)?
4. **Digital dice** — the current design has all dice rolled on the table and reported. An option to
   let the app roll would cut data entry substantially at the cost of table feel. Worth deciding
   before Phase 4's input model is designed.

## Status (2026-09-20)

| Phase | Commit | Gate |
|---|---|---|
| 2 Geometry kernel + inspector | `bd6ec0e` | met: Z1.0, C1.14, Dulcinea, B3.25x, p.24 examples reproduce |
| 3 SSD schema + Sample fixture + editor | `6fa5500` | met: Sample round-trips through JSON and the editor text form |
| 4 Notebook PWA | `a57ea3a` | **open**: play a real game at the table, time the entry |
| 5 Combat engine | `2d1f6e5` | met: examples reproduce; 20k-sample Monte Carlo matches `expect` |
| 6 AI v1 | this commit | **open**: three games; no illegal or ambiguous orders |

Known limits to carry into Phase 7–9: the AI assumes the enemy drifts and holds attitude (no
lookahead); wedge interposition is valued only through the defense tables; the 3-D view's
labels use a font fetched from a CDN (bundle one for offline); a plan is computed on the main
thread (~0.3 s per ship on a desktop; move to a Worker if phones lag); firing-arc grey/white
on the Sample class and the `3d10` reading (0–9 vs 1–10) are still `[verify]`.
