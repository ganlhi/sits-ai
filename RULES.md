# Saganami Island Tactical Simulator — Rules Synthesis

Source: `SITS_Core_book.pdf` (Ad Astra Games, SITS 2.0 Core Rulebook, © 2007), 74 scanned
pages. Book page number = PDF page number − 1.

This document restates the rules in the order and depth needed to build a software opponent.
Rule numbers from the book (`A1.11`, `C5.211`, …) are cited so anything can be traced back.
The scan carries an OCR layer of poor quality; everything below was read from the rendered page
images. Passages where the scan itself is degraded are flagged **[verify]**.

**Section 23** lists what the core book does *not* contain and what the app still needs.

---

## 1. Game overview and scale constants

SITS is a 3-D vector-movement tactical spaceship game set in David Weber's Honorverse. Each
player commands one or more impeller-drive warships on a hex map, plotting maneuver secretly and
resolving fire simultaneously.

| Quantity | Value |
|---|---|
| Hex width (edge to edge) | 0.8 light seconds |
| One altitude level | 0.8 light seconds (same as a hex) |
| Tactical turn | 6 minutes |
| 1 point of thrust | 190 g |
| 1 g | 9.765625 m/s² |
| Operational ("system") hex | 8 light seconds |
| Operational turn | 19 minutes |
| Stacking limit | 1 ship per hex per altitude level |

Physical map: large hexes 35.5 mm (tactical), small hexes 19 mm (operational), printed on
opposite sides of the same map sheets (`D2.11`).

Movement is Newtonian. A ship continues on its current vector until thrust changes it. Facing
and velocity are independent: a ship can be flying in direction C while pointed at F.

**Designer's stance** (stated repeatedly in sidebars): where the novels' numbers conflict with
the novels' *feel*, the game matches the feel. Useful when judging whether an AI behaviour is
"right".

---

## 2. Components and play aids

| Aid | Purpose |
|---|---|
| **Movement Card (MC)** | Per-ship laminated card holding the **AVID** and the **Plotting Grid**. Nine cards: three each of type 1, 2, 3. Sides are colour-coded (matching the tilt blocks) and differ by orientation — hex **edge** on top vs hex **corner** on top — so the map can be set up either way (`A2.21`). |
| **Reference Card (RC)** | Vector Consolidation reference, Turn Sequence, Range-Angle Lookup Table (RALT), Horizontal Bearings graphic (`A2.31`). |
| **Missile Defense Card (MDC)** | ECM Layer table and Active Defense table with their modifier arrows (`A2.4`). |
| **Salvo Card (SC)** | One per firing ship per target per turn. Front = launch data; back = missile impact data (`A2.5`, `C2.1`). |
| **Ship Systems Display (SSD)** | The ship's record sheet: all damage tracks, weapon mounts, firing arcs, hit location table, point cost, officer/crew table, range bands. |
| **Box miniature + tilt block** | Shows position and 3-D attitude on the map. |
| **Stacking tiles** | Placed under the miniature to show altitude; each level equals one hex of distance. Colour-coded: **white = 1, light blue = 4, dark blue = 16, black = a negative sign** (`B1.14`). |
| **Midpoint / EoT markers** | Placed each turn to show where the ship will be halfway through the turn and at end of turn. |

Damage notation on the SSD: a destroyed box is crossed out; a *disabled* box is circled and
returns when the disabling condition ends (`A1` glossary).

---

## 3. Turn sequence

Verbatim from the Reference Card (`A3.0`):

1. **Place Midpoint and End of Turn (EoT) markers.**
2. **AVID plotting, Thrust plotting, Displace EoT.**
3. **Launch missiles.**
   - 3a. Number of salvoes is set by range from **EoT to EoT**.
   - 3b. **Early** salvoes: shoot bearing from your current position to target's current position.
   - 3c. **Middle** salvoes: shoot bearing from your current position to target's **Midpoint**.
   - 3d. **Late** salvoes: shoot bearing from your **Midpoint** to target's **EoT**.
4. **Early missile impact.**
5. **Move to Midpoint marker; apply ½ pivot and ½ roll.**
6. **Middle missile impact, First beam impact.**
7. **Move to End of Turn marker; finish pivot and roll.**
8. **Late missile impact, Second beam impact.**
9. **Add thrust to vectors, consolidate vectors, perform damage control, other actions.**

Notes:

- All plotting in step 2 is **simultaneous and secret**. Direction and number of windows of
  pivots and rolls are revealed only as ships move — they are not announced before missile
  launch (`A3.1`).
- Because launch happens after EoT displacement but before movement, a firing ship knows whether
  the target has *displaced* (and therefore has not pivoted, per `B3.27`) but not how much it has
  rolled or pivoted (`C2.11`).
- Step 9 "other actions" is where missile pods are deployed (`C8.23`).

---

## 4. The map: position, direction, altitude

- Six map directions, labelled **A** through **F** clockwise, with A at the top of the map
  (`B1.11`). The compass rosette in the centre of each map sheet must point the same way on every
  sheet used (`D2.11`).
- Two vertical directions: **+** (up) and **−** (down).
- Position = (hex, altitude level). Altitude is a signed integer. The physical game shows it with
  colour-coded stacking tiles: **white = 1, light blue = 4, dark blue = 16, black = negative sign**.
  Tiles are stacked light to dark from top to bottom, so the units you change most often sit at the
  bottom of the stack where they are easiest to handle (`B1.14`, `B1.141`). An altitude of 18 is one
  dark blue tile over two white tiles.
- When showing altitude **change** to the Midpoint and EoT markers, use only the tiles needed for the
  **difference**, not the absolute altitude: a ship at altitude 7 gaining one level puts **one** tile
  under its EoT marker, not eight (`B1.142`). A ship **losing** altitude places an **inverted** tile
  under the relevant marker (`B1.143`).
- Only one ship may occupy a given hex at a given altitude (stacking limit). LAC squadrons are an
  exception: several squadrons may share a hex (`C7.11`).

---

## 5. Orientation: the AVID

The **AVID** (Attitude and Vector Indicator Display) is a top-down projection of a sphere that is
**fixed relative to the map**, not to the ship. Markers drawn on it record the ship's attitude;
bearings to targets are also recorded on it. Because it is map-fixed, **all bearings are
reciprocal** (`C1.16`).

### 5.1 Rings

The rings are 30° solid angles (`B2.12`):

| Ring | Pitch angle | Span | Windows |
|---|---|---|---|
| **Yellow** (outermost, inside the hexagon) | 0° | −15° to +15° | 12 |
| **Blue** | ±30° | 16° to 45° | 12 |
| **Green** | ±60° | 46° to 75° | 6 |
| **Purple** (centre) | ±90° | 76° to 90° | 1 |

The 12-window rings are labelled, clockwise from the top:
`A, A/B, B, B/C, C, C/D, D, D/E, E, E/F, F, F/A` — six hex-**edge** directions alternating with
six hex-**corner** directions.

The green ring has only the **six hex-edge windows** `A, B, C, D, E, F`. Consequences:

- You cannot thrust to a hex corner from the green ring (`B3.2541`).
- An orientation marker in the green ring may sit on the **spine between two green windows** when
  that is the only placement satisfying the "three windows away" rule (`B2.143`).

Because the sphere is drawn flat, upper and lower hemispheres share the same printed windows.
A marker in the **lower** hemisphere is **circled**. The purple centre window serves both +90°
and −90°.

Notation used throughout the book: `B/C(blue, upper)`, `D(green, upper)`, `A(yellow)`.

### 5.2 Orientation markers

Six markers in three opposed pairs (`B2.14`):

| Pair | Symbols |
|---|---|
| Forward / Aft | triangle / semicircle |
| Port / Starboard | `<` / `>` |
| Top / Bottom | star / anchor |

Placement rules:

- **Port** and **Starboard** are **3 windows** from Forward, counter-clockwise and clockwise
  respectively (`B2.13`).
- **Aft** is **6 windows** from Forward.
- **Top** and **Bottom** are **3 windows** from both Forward and Port (or Starboard).
- Both members of a pair always lie in the **same coloured ring**. If Forward is in the blue
  ring, Aft is in the blue ring.

Worked examples from Annex `Z1.0`:

- Ship pointing **straight up**, top facing direction D: Forward and Aft both in the **purple**
  window (Aft circled); Top marker in `D(yellow)`.
- Ship **level with the map**, facing A, top facing "up": Forward triangle in `A(yellow)`; Top
  and Bottom in the purple window, Bottom circled.
- Ship facing A, **nose up 30°**, top facing D: Forward in `A(blue)`; Aft circled; Top in
  `D(green, upper)`.
- Ship facing A, **nose down 30°, rolled 30° to starboard**: Forward in `A(blue)` circled; Port
  risen to `E/F(blue)`; Starboard dropped to `B/C(blue)`; Top and Bottom on the **spines** in the
  green ring.

---

## 6. Maneuver: pivots and rolls

- A **pivot** is any facing change that moves the front of the miniature around, whether up, down
  or in the map plane (`A1` glossary).
- A **roll** rotates the ship about its Forward/Aft axis; it moves the Top marker without moving
  Forward.
- Both are measured in **AVID windows** and are limited per turn by the ship's **Pivot** and
  **Roll** ratings — the leftmost unchecked box of those tracks on the SSD (`C5.464`).
- On the AVID, a pivot is drawn as an arc from the old Forward window to the new one; the
  **midpoint** of the arc is marked, because **half the pivot and half the roll are applied at
  the Midpoint marker (step 5) and the remainder at EoT (step 7)**.
- A **Poor helmsman** subtracts 1 from the number of windows the ship may pivot and roll, never
  below 1 while boxes remain on those tracks. A **Veteran** helmsman adds 1 to the roll rating.
  An **Elite** helmsman adds 1 to either pivot or roll (not both), and may switch which each
  plotting phase (`D1.144`).

Interaction with thrust: see §7.3.

### 6.1 LAC exception

LACs may change facing to **any** AVID window before applying thrust, and again to any window
between their midpoint and EoT orientation (`C7.12`). A LAC thrusts in the direction of its
**midpoint** orientation. To displace, its midpoint and EoT orientations must be identical.
On the AVID, a LAC's first pivot ends with a double line, a second with an arrowhead
(`C7.12*2` **[verify: rule number garbled]**). LACs may also plot their pivots and thrust **after**
seeing conventional ships' thrust results (`C7.13`).

---

## 7. Vector movement and thrust

### 7.1 Vectors

A ship's velocity is stored as a set of **vectors**, each a whole number of hexes in one of the
six map directions plus the two vertical directions (`+`/`−`). They are written in the vector
arrows around the outside of the AVID.

At the start of each turn (step 1) the ship places:

- an **EoT marker** at current position + current vector;
- a **Midpoint marker** at current position + half the vector.

Altitude change is split evenly across the move: a vector of +2 puts one altitude tile under the
Midpoint marker and the second under the EoT marker (`B4.12`).

### 7.2 Thrust plotting

Thrust is plotted on the **Plotting Grid** of the Movement Card, which has a **VERTICAL** grid
(±90° and ±60° columns, rows +7 … −7) and a **HORIZONTAL** grid (hex-edge and hex-corner
fans). The plot is drawn as an arrow; the resulting vector changes are written into the grey
areas of the AVID's vector arrows (`B3.2`, `B4.2`).

Thrust available per turn is the leftmost unchecked box of the **Maximum Thrust** track. A ship
thrusts along its **facing** — specifically, along its **midpoint orientation** when pivoting.

### 7.3 Displacement

**Displacement** is the extra movement a ship gets in the turn it thrusts, reflecting that the
acceleration applies throughout the turn rather than instantaneously.

- A ship that thrusts **without pivoting** generates displacement equal to **half** the vector
  change (`B4.213`). Example: thrust adds +2 vertical and +3 in C → displacement of 1 in `+` and
  1.5 in C.
- Fractional displacement is **carried forward**: 1.5 in C becomes 1 hex in C now with a half
  displacement retained, shown by filling in the small triangle in direction C on the AVID.
- A ship that **pivots** while thrusting accumulates **no displacement** that turn (`B4.313`).
- Displacement moves the **EoT marker** only. **The Midpoint marker is never moved** (`B4.221`).
- Because EoT displacement happens in step 2 and launch in step 3, an opponent who sees your EoT
  marker displace knows you did **not** pivot (`B3.27`, cited from `C2.11`).

Engineering officer effects (`D1.145`):

| Grade | Effect |
|---|---|
| Poor | Fractional displacements do not accumulate turn to turn **[verify: text degraded]** |
| Average | Normal |
| Veteran | Fractional displacements round **up** and are usable on the turn of thrust; may be waived |
| Elite | Veteran rounding, plus **+1 thrust rating at all times** (cannot be combined with red-lining the impellers) |

### 7.4 Red-lining the compensators

A ship may "red-line the compensators" (`B3.231`) to conceal a decrease in thrust rate; used with
pod towing (§19.1). **[verify: full rule text not legible in the scan]**

---

## 8. Vector consolidation

Performed in step 9. From the Reference Card:

**Vectors 180° apart:** subtract the smaller from the larger.

**Vectors 120° apart:**
1. Copy the smaller vector **one hex side closer** to the larger vector and add it to any
   existing vector in that direction.
2. Subtract the smaller vector from **both** original vectors. This reduces the smaller to 0.

**Multiple vectors:** consolidate **all 180° pairs first**, then all 120° pairs.

Worked example (`B4.35`, HMS *Dulcinea*): starting vectors 1 in `+`, 2 in F, 1 in E; thrust adds
2 in `+` and 3 in B.
- The 2 in `+` adds to the existing 1 in `+`, leaving **3 in +**.
- The 3 in B consolidates against the 1 in E to leave **2 in B**.
- The remaining 2 in F and 2 in B are 120° apart; the smaller is rotated one side closer to B,
  and the original value of F is subtracted from both, leaving **0 in F and 0 in B**
  **[verify: this last step's arithmetic is partly illegible in the scan]**.

Where two vectors are equally eligible, the choice is arbitrary but must be declared.

---

## 9. Bearings, range and the RALT

Every shot needs a **range** and a **bearing** (an AVID window) from a firing point to a target
point. Which points depends on the salvo timing (§3, step 3).

### 9.1 True range — the RALT

The **Range-Angle Lookup Table** on the Reference Card is a printed Pythagorean table (`C1.14`):

1. Count the **horizontal** distance to the target along the bottom axis.
2. Go **up** a number of rows equal to the **difference in altitude**.
3. The cell value is the **true range**.
4. The cell's **colour** tells you which AVID ring the target is in.

Example (`C1.14` sidebar): target 7 hexes away, 2 levels of altitude difference → true range 7,
blue ring.

### 9.2 Ring rules of thumb

Instead of the table (`C1.15`), where H = horizontal distance and V = altitude difference:

| Condition | Ring |
|---|---|
| H ≥ 4 × V | **yellow** (0°) |
| V ≥ 4 × H | **purple** (90°) |
| V > H (and V < 4 × H) | **green** (60°) |
| H > V (and H < 4 × V) | **blue** (30°) |
| H = V exactly | **blue** |

The RALT is authoritative where the two disagree.

### 9.3 Horizontal bearing — which of the 12 windows

From the Horizontal Bearings graphic on the Reference Card: if the target is **three times as far
away in one map direction as the other**, it is visible through that **hex edge**. Otherwise it
is visible through the **hex corner**.

### 9.4 Recording and reciprocity

- Write the range in the AVID window you see the target through. If the target is **below** you,
  **circle** the number (`C1.15`).
- **Bearing reciprocity** (`C1.16`): bearings are mutual. If you see a target through `A(yellow)`,
  it sees you through `D(yellow)`. If you see it through `A/B(blue, upper)`, it sees you 6 windows
  away in `D/E(blue, lower)`.
- The **Impact Window** written on the Salvo Card is the **reciprocal** of the bearing you shot,
  so the defender immediately knows which way the missiles are coming from.

---

## 10. Firing arcs

The SSD shows four weapon mounts: **Forward Hammerhead**, **Aft Hammerhead**, **Port Broadside**,
**Starboard Broadside**. Each has a firing-arc diagram, which is the *inside* of the AVID sphere
fixed to the ship's frame — so it **spins inside the AVID as the ship changes facing**
(`C1.21`).

### 10.1 Mapping a bearing to a firing-arc window (`C1.22`)

Five steps:

1. Count the number of windows between the **target's bearing** and the nearer of the ship's
   **Top** or **Bottom** markers.
2. Count the distance and direction from the target bearing to the **nearest orientation marker**
   (Port, Starboard, Forward or Aft). If two markers are equally distant, the **attacker** chooses,
   and that choice holds for all combat resolution on that damage step.
3. On the firing-arc diagram, go the same number of rows down from the top as you counted in
   step 1.
4. Count the same number of windows away from the corresponding side marker on the diagram, in
   the same direction. This must land in the row from step 3.
5. Read the **colour** of that window.

Performing all five steps guarantees an unambiguous arc regardless of orientation.

### 10.2 Window colours

| Colour | Meaning |
|---|---|
| **Black** | That mount **cannot fire** in that direction. |
| **Grey** | Cleared to fire; the *target* is protected by sidewalls or stern-walls in that direction. |
| **White** | Cleared to fire; the target is **unprotected** there. |

The same grey/white shading is used on the wedge-and-sidewall coverage illustration (`C5.1`) to
remind you which mounts are fully covered by sidewalls and which have partial cover.

---

## 11. Missile launch

Missiles are the predominant weapon. They are **never placed on the map** — a salvo is recorded on
a **Salvo Card** during the Missile Launch phase and handed to the target's player (`A2.5`).

### 11.1 Number of salvoes — the Range Bands table

Measure the range **between the two ships' EoT markers** and read the Range Bands table on the
SSD (`C2.12`). For the *Sample*-class shown in the book (`A2.66`):

| Range | 0–1 | 2–4 | 5–7 | 8–11 | 12–15 | 16–20 | 21–25 | 26–29 |
|---|---|---|---|---|---|---|---|---|
| **Base MQL** | 4 | 2 | 3 | 4 | 5 | 6 | 7 | 8 |
| **Salvoes available** | Early + Middle + Late | Early + Middle + Late | Early + Middle + Late | Middle + Late | Middle + Late | Middle + Late | Late | Late |

So at most **three salvoes per turn**: one Early (impacts before movement), one Middle (impacts at
the Midpoint), one Late (impacts at EoT). Getting a Late salvo is nearly always possible; Middle +
Late is common; all three is difficult. Cross out unused salvoes on the Salvo Card.

**Range bands are per ship class** — every SSD has its own table. Missile pods use the table on
the **pod card**, not the ship's (`C8.31`).

All salvoes fired **at the same target on the same turn** by one ship go on **one Salvo Card**
(`C2.123`).

### 11.2 Missiles per salvo

Record, in the `#` box, the number of missile **launchers** the mount had at the **start of the
turn** (`C2.13`). Destroyed launchers still fire every salvo they launched this turn. Firing fewer
missiles is allowed but not recommended — it requires swapping cards mid-turn for little gain.

### 11.3 Bearings and MQL

Shoot the bearing appropriate to the salvo timing (§3, step 3), record the **range** in the range
box and the **reciprocal** of the bearing in the **Impact Window** box (`C2.14`).

Cross-reference the recorded range against the ship's Range Bands table to get the **Missile
Quality Level (MQL)** for that salvo (`C2.15`). **Lower MQL is better for the attacker.**

MQL modifiers:

- **Fire control damage**: the number in the leftmost unchecked box of that mount's `fcon` track
  is **added** to the MQL (`C5.432`).
- **Tactical Officer grade** modifies the MQL of all missiles that ship launches (`D1.141`).
- **Towed pods**: each pod deployed disables one fire control box on the facing bearing, and that
  penalty applies to all missile and point-defense fire until end of turn (`C8.31`).

Also record the **missile damage** (the number before the `M`, e.g. 16 for a `16M`) in the Missile
Damage box. If the salvo is contact nukes, **circle** the missile damage (`C2.151`).

### 11.4 Linked salvoes

Adjacent friendly ships with functioning communications may fire **linked** salvoes at one target
(`C2.17`). The target treats them as **one large salvo** for ECM and Active Defenses, and **chooses
which missiles die**. Unlinked salvoes are resolved separately.

- Range and bearing are determined from **one** ship; all others must be adjacent to it. Each
  launching unit uses its **own** MQL and fire control penalty for that range and bearing. If
  missiles, fire control penalty and MQL are identical across ships, they may share one Salvo Card
  (`C2.171`).
- **Adjacency is checked at the moment of launch** (`C2.172`): adjacent at start of turn but not at
  Midpoint → can link Early and Middle only. Not adjacent at start but adjacent at Midpoint → Late
  only. Adjacent throughout → all three.
- Mark linked cards with a common letter in the **Linked** box (`C2.173`).
- At least one **communications** box is required to link salvoes (`C5.444`).

Trade-off flagged by the designers: one decoy spent against a linked salvo works against *all* the
missiles, where unlinked salvoes might each cost the defender a decoy.

---

## 12. Missile defense

Incoming missiles pass through two procedures: **ECM**, then **Active Defenses** (`C4.0`).

### 12.1 General table procedure (`C4.11`)

1. The **initial column** is the **MQL** of the inbound salvo, written in the *Base MQL* box.
2. Modifiers shift the column; each is printed in an arrow pointing in the direction of the shift.
3. Cross-reference the row with the final column; the result is the number of missiles killed by
   that layer.

Unless linked, **each salvo card is a separate salvo**, resolved individually.

### 12.2 ECM layer (`C4.12`)

Modifiers, applied in this order, to produce the **Final ECM Quality** column:

1. **+ ECM value** of the target from its SSD (leftmost unchecked box of the ECM track). The EW
   Officer's grade modifies this value (`D1.142`).
2. **If the missiles are hitting the wedge**: use the **+12** arrow and **ignore ECM entirely**.
3. **+ 2d10−** roll. You must have at least one box in the ECM track to make this roll, even if it
   is a "0" box.
4. **After seeing the 2d10− result**, you may spend a **decoy** from the facing being attacked. The
   decoy shifts the column by the number printed in its box **and always kills a minimum of one
   additional missile**. Missiles hitting from Forward, Aft or the wedge can be distracted by
   decoys from either side. **One decoy works against one salvo**; multiple decoys against the same
   salvo have no extra benefit. Each decoy box on the SSD is single-use.

Then cross-reference **number of incoming missiles** with the final column. If the number of
missiles has no row (e.g. 63), check the row for the first digit, then the row for the second
digit, and add the kills (`C4.126`).

Linked salvoes use one set of ECM modifiers, including wedge and decoy, for the whole linked group.

#### ECM Layer table

Rows = number of incoming missiles. Columns = Final ECM Quality 1–25.

| # | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20 | 21 | 22 | 23 | 24 | 25 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **1** | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 |
| **2** | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 2 | 2 | 2 |
| **3** | 0 | 0 | 0 | 0 | 0 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 3 |
| **4** | 0 | 0 | 0 | 0 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 3 | 3 | 3 | 3 | 3 | 3 | 3 |
| **5** | 0 | 0 | 0 | 1 | 1 | 1 | 1 | 1 | 1 | 2 | 2 | 2 | 2 | 2 | 3 | 3 | 3 | 3 | 3 | 3 | 4 | 4 | 4 | 4 | 4 |
| **6** | 0 | 0 | 0 | 1 | 1 | 1 | 1 | 2 | 2 | 2 | 2 | 2 | 3 | 3 | 3 | 3 | 3 | 4 | 4 | 4 | 4 | 4 | 5 | 5 | 5 |
| **7** | 0 | 0 | 1 | 1 | 1 | 1 | 2 | 2 | 2 | 2 | 3 | 3 | 3 | 3 | 4 | 4 | 4 | 4 | 4 | 5 | 5 | 5 | 5 | 6 | 6 |
| **8** | 0 | 0 | 1 | 1 | 1 | 1 | 2 | 2 | 2 | 3 | 3 | 3 | 3 | 4 | 4 | 4 | 5 | 5 | 5 | 5 | 6 | 6 | 6 | 7 | 7 |
| **9** | 0 | 0 | 1 | 1 | 1 | 2 | 2 | 2 | 3 | 3 | 3 | 4 | 4 | 4 | 5 | 5 | 5 | 5 | 6 | 6 | 6 | 7 | 7 | 7 | 8 |
| **10** | 0 | 0 | 1 | 1 | 2 | 2 | 2 | 3 | 3 | 3 | 4 | 4 | 4 | 5 | 5 | 5 | 6 | 6 | 6 | 7 | 7 | 7 | 8 | 8 | 9 |
| **20** | 0 | 1 | 2 | 2 | 3 | 4 | 4 | 5 | 6 | 7 | 7 | 8 | 9 | 9 | 10 | 11 | 11 | 12 | 13 | 14 | 14 | 15 | 16 | 16 | 17 |
| **30** | 0 | 1 | 2 | 3 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20 | 21 | 22 | 23 | 24 | 26 |
| **40** | 0 | 2 | 3 | 5 | 6 | 7 | 9 | 10 | 12 | 13 | 14 | 16 | 17 | 19 | 20 | 21 | 23 | 24 | 26 | 27 | 28 | 30 | 31 | 33 | 34 |
| **50** | 1 | 2 | 4 | 6 | 8 | 9 | 11 | 13 | 15 | 16 | 18 | 20 | 22 | 23 | 25 | 27 | 29 | 30 | 32 | 34 | 36 | 37 | 39 | 41 | 43 |
| **60** | 1 | 3 | 5 | 7 | 9 | 11 | 13 | 15 | 17 | 20 | 22 | 24 | 26 | 28 | 30 | 32 | 34 | 36 | 38 | 41 | 43 | 45 | 47 | 49 | 51 |
| **70** | 1 | 3 | 6 | 8 | 11 | 13 | 15 | 18 | 20 | 23 | 25 | 28 | 30 | 33 | 35 | 37 | 40 | 42 | 45 | 47 | 50 | 52 | 55 | 57 | 60 |
| **80** | 1 | 4 | 6 | 9 | 12 | 15 | 18 | 20 | 23 | 26 | 29 | 32 | 34 | 37 | 40 | 43 | 46 | 48 | 51 | 54 | 57 | 60 | 62 | 65 | 68 |
| **90** | 1 | 4 | 7 | 10 | 14 | 17 | 20 | 23 | 26 | 29 | 32 | 36 | 39 | 42 | 45 | 48 | 51 | 54 | 58 | 61 | 64 | 67 | 70 | 73 | 77 |
| **100** | 1 | 5 | 8 | 12 | 15 | 19 | 22 | 26 | 29 | 33 | 36 | 40 | 43 | 47 | 50 | 54 | 57 | 61 | 64 | 68 | 71 | 75 | 78 | 82 | 85 |

### 12.3 Active defenses (`C4.13`)

Survivors are engaged by **countermissiles (CM)**, then by **point defense (PD)** clusters —
the Active Defense table is used twice.

- The CM and PD tracks on the SSD are printed in grey. The numbers in each box are **probable
  kills** — the average probability of stopping a missile times the number of systems available.
  This number selects the **row**.
- The **column** is the inbound salvo's **MQL** plus a **2d10−** roll (`C4.132`).
- **Fire control damage** (or disabled fire control) gives a **leftward column shift**, via the
  arrow labelled `FCON` (`C4.133`).

#### Circumstantial modifiers (`C4.14`)

| Situation | Effect |
|---|---|
| **Wedge interposed** | **No CMs may be used**, and **all PD kill totals are halved**, rounding in favour of the attacker. Surviving missiles slide past the wedge to the nearer facing (Port, Starboard, Forward, Aft); defender chooses in ambiguous cases. |
| **Contact nukes** | **All PD kills are doubled.** |
| **Friendly ship at range 1** at missile impact | May **pool** its CM and PD kills with the target. |
| **Friendly ship at range 2** | May pool **CM kills only**, and only if the target of the salvo sees the escort next to the Impact Window. The escort uses CM and PD that bear on the Impact Window. |
| **Linked salvoes** | The target generates Active Defense kills **once per linked set**; the defender picks which missiles die (`C4.144`). |

In all pooling cases the **defender chooses which missiles die**.

Assistant Tactical Officer grade (`D1.143`): Poor subtracts 1 from CM probable kills (never below
1 from this penalty); Veteran adds 1 to CM probable kills; Elite adds 1 to **both** CM and PD.

#### Active Defense table

Rows = **probable kills** (including the fractional rows). Columns = **Active Defense Quality** 1–19.

| PK | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **⅓** | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 1 | 1 | 1 | 1 |
| **⅔** | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 |
| **1** | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 2 | 2 | 2 |
| **2** | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 2 | 2 | 2 | 2 | 2 | 3 | 3 | 3 | 4 | 4 |
| **3** | 1 | 1 | 1 | 1 | 1 | 1 | 2 | 2 | 2 | 2 | 3 | 3 | 3 | 4 | 4 | 4 | 5 | 5 | 6 |
| **4** | 1 | 1 | 1 | 2 | 2 | 2 | 2 | 2 | 3 | 3 | 3 | 4 | 4 | 5 | 5 | 6 | 6 | 7 | 8 |
| **5** | 1 | 1 | 2 | 2 | 2 | 2 | 3 | 3 | 3 | 4 | 4 | 5 | 5 | 6 | 7 | 7 | 8 | 9 | 10 |
| **6** | 2 | 2 | 2 | 2 | 3 | 3 | 3 | 4 | 4 | 5 | 5 | 6 | 6 | 7 | 8 | 9 | 10 | 11 | 12 |
| **7** | 2 | 2 | 2 | 3 | 3 | 3 | 4 | 4 | 5 | 5 | 6 | 7 | 7 | 8 | 9 | 10 | 11 | 13 | 14 |
| **8** | 2 | 2 | 3 | 3 | 3 | 4 | 4 | 5 | 5 | 6 | 7 | 8 | 8 | 9 | 10 | 12 | 13 | 14 | 16 |
| **9** | 2 | 3 | 3 | 3 | 4 | 4 | 5 | 6 | 6 | 7 | 8 | 8 | 9 | 11 | 12 | 13 | 15 | 16 | 18 |
| **10** | 3 | 3 | 3 | 4 | 4 | 5 | 5 | 6 | 7 | 8 | 8 | 9 | 11 | 12 | 13 | 14 | 16 | 18 | 20 |
| **20** | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 14 | 15 | 17 | 19 | 21 | 23 | 26 | 29 | 32 | 36 | 40 |
| **30** | 8 | 9 | 10 | 11 | 13 | 15 | 16 | 18 | 21 | 23 | 25 | 28 | 32 | 35 | 39 | 43 | 48 | 54 | 60 |

### 12.4 Canister shot (`C4.15`)

Canister shot replaces an offensive missile with countermissiles. Each canister adds **⅓ probable
kill** to the ship's countermissiles; combine fractions into whole numbers.

| Missile size | Canisters per missile |
|---|---|
| 1M–4M | 1 |
| 5M–8M | 2 |
| 9M–12M | 3 |
| 13M–16M | 4 |
| 17M and larger | 5 |

- Holding a tube back is done during the **Missile Launch** step; each tube held back from a salvo
  (Early, Middle or Late) can be used defensively against that same salvo. Holding a tube back does
  not oblige you to fire canister.
- Each canister has a point cost paid at scenario start; which broadsides carry canister and how
  many rounds each can fire is recorded before the scenario (`D4.12`: **½ point per canister after
  1902 PD, 1 point before**).
- The maximum number of tubes devoted to canister in a single impact step equals the number of
  boxes in that facing's `fcon` track (`C4.153`).
- **Each missile tube that fires canister disables one fire control box** for active defenses
  during that impact step (`C4.154`).

---

## 13. Damage allocation

Order of operations once missiles get through (`C5.0`):

1. Determine the **incoming damage bearing** → which facing / hit location table.
2. Roll **Penetration** for each weapon → **Depth**.
3. Roll **Hit Location** for each penetrating weapon → place the centre of the damage.
4. Mark off damage tracks; apply system effects.

### 13.1 Shot placement (`C5.11`)

Use the **Impact Window** and the ship's current orientation to find the nearest facing marker.

| Case | Resolution |
|---|---|
| **Beam** damage into a window obscured by the wedge | The wedge protects **completely**. |
| **Missiles** into a wedge-covered window that survive ECM and active defense | Hit the **closest facing** (Port, Starboard, Forward or Aft); defender chooses if ambiguous. |
| **Wedge is down** (turned off, not "down" as a direction) | Resolved on nearest facing of the **defender's** choice, and **all Penetration values are doubled**. *Exception: Energy Torpedo damage is not doubled.* |
| **Bubble wall** unit (e.g. a base) | Attacks from Top and Bottom resolve on the closest facing, defender choosing if ambiguous. |
| Window containing the **Forward** triangle, either window adjacent to it toward Top or Bottom, or the window directly **Aft** | Use the **Forward** or **Aft** hit location table. These four windows are covered by the **Bow wall** if present. *(No ship in Ship Book 1 has Bow or Stern walls.)* |
| One window **adjacent** to the Forward marker, or one window to Port/Starboard of the **Aft** marker | Resolve on the **Port or Starboard** table, but **subtract 10** from the hit location roll (shifting results Forward) or **add 10** (shifting Aft). Rolls over 20 or under 2 are re-rolled on the Aft or Forward side of the table. This represents missiles "leaking around the sidewall". |

**Ambiguity (`C5.12`)**: shoot a bearing to resolve it. If that does not resolve it and the rule
does not give the choice to the defender, the **attacker** chooses.

### 13.2 Penetration and Depth (`C5.21`)

Each weapon has a base damage printed on the SSD (a `7M` does 7 damage). Convert to **Depth**:

```
Damage − Target Scale + Sidewall = Depth Modifier
Depth = Depth Modifier + 2d10−     (the "Penetration roll")
```

- If the modified Penetration roll is **less than 1**, the **sidewall deflected** that missile.
- On a **natural Penetration roll of 0**, the weapon does its listed damage **and** automatically
  destroys a box on the facing sidewall — or, if no facing sidewall exists, the target takes an
  automatic **Structural Integrity (SI)** hit. Sidewall damage done this way is applied at the end
  of the damage step, so it does **not** weaken the sidewall against other missiles in the same
  salvo, but it **does** matter for subsequent salvoes, including later ones on the same turn.
- A ship **without a sidewall** uses the number at the **end** of the sidewall track (worst value).

The **sidewall track** is printed along the top and bottom edges of the hit location table. The
*Sample*-class track runs:
`−4 −4 −3 −3 −2 −2 −1 −1 −1 0 0 1 1 1 2 2 3` (with `+3` as the no-sidewall value).
The current value is the leftmost unchecked box; damage marks it off from the left.

Forward and Aft aspects have **hammerhead armour** instead of a sidewall — `+1` for the
*Sample*-class, printed on the left and right edges of the hit location table.

**Batch processing (`C5.22`)**: gather pairs of same-coloured d10s and roll all the missile
penetrations at once; cull natural zeroes first, then weapons that failed to penetrate, then sort
the penetrating weapons by final modified Depth, largest to smallest.

### 13.3 Hit location (`C5.23`)

Roll **2d10+** on the appropriate edge of the hit location table:

| Damage from | Edge used | Read |
|---|---|---|
| Starboard | top | top to bottom |
| Port | bottom | bottom to top |
| Forward | left | left to right |
| Aft | right | right to left |

The **Depth** is how many cells deep along that axis the damage penetrates; the hit location roll
selects the row (or column) where the damage is centred. Every cell crossed is a hit on the system
named in it.

The hit location table is per ship class and carries its **SCALE** and **CORE ARMOR** values in its
header (e.g. *Sample*-class: Scale 15, Core Armor 3).

System codes seen in the table: `fcon`, `hull`, `mag`, `dcy`, `ECM`, `sdwl`, `PD`, `CM`, `L`, `M`,
`G`, `ET`, `SI`, `piv`, `rol`, `brg`, `com`, `lif`, `CIC`, `flg`, `hyp`, `fwd`, `aft`, `2fwd`,
`2aft`. A note on the table reads **"CIC = 1 hit to all fcon tracks"**.

### 13.4 Core armour and punch-through

- The shaded cells of the hit location table are the **Core** — command and control and other vital
  systems. The band around the Core is the **Core Armor Belt**; crossing it costs Depth equal to the
  **Core Armor** value printed on the SSD (`C5.24`).
- Damage in excess of what is needed to cross the table — including crossing the Core Armor twice,
  once entering and once leaving — is **lost**; the damage has punched through (`C5.25`).
- If damage would leave the silhouette of the hit location table, the remaining damage is lost
  (`C5.251`).
- When a specific system is exhausted, that item's hit location is **skipped** (`C5.413`).
  *Exception: hull hits fall through to Structural Integrity.*

---

## 14. Weapon effects

### 14.1 Order of resolution (`C5.31`)

Missile warheads resolve **laser heads before contact nukes**, and **all missiles before beam
weapons**. Beam weapons resolve in this order:

**Grav Lance → Energy Torpedo → Lasers → Grasers**

Weapons destroyed before their resolution step cannot fire. All damage from weapons of the same
type is simultaneous (`C5.312`).

### 14.2 Weapon reference (from the Reference Card)

| Weapon | Depth multiplier | Span | Notes |
|---|---|---|---|
| **Laser head** | 1× Depth | 1 | Missile warhead. |
| **Contact nuke** | ½× Depth (round down) | 5 | **Doubles PD kills** against it. |
| **Grav lance** | — | — | **Range 0 only.** Roll 1d10 per box on the *attacker's* Maximum Thrust track, including circled boxes. Every roll of **3 or higher destroys one sidewall box** on the target. A grav lance can never have an adjusted range greater than 0, even via a miracle (`D2.2`). |
| **Energy torpedo** | 2× Depth | 5 | **3d10-low hits per launcher** that fires; each hit is a separate Span 5 hit at double normal Depth. Cannot affect a target with intact sidewalls. Its range and damage presume the target's sidewalls are down; **do not halve the range** (`C1.123` exception). |
| **Laser** | 1× Depth | 1 | |
| **Graser** | 1× Depth | 3 | |

**Depth multipliers (`C5.32`)**: contact nukes **halve** the depth result after all other
modifiers, rounding down. Energy torpedoes **double** the generated depth. Attacks other than
energy torpedoes hitting **Top or Bottom** on ships with **down wedges** do **double** depth.

**Weapon span (`C5.33`)**: span is how many adjacent columns or rows on the hit location table the
weapon's full damage goes down. A Depth-7, Span-3 weapon does 7 damage down each of three adjacent
rows centred on the rolled position (hitting row 11 also hits 10 and 12). Any part of a span that
falls off the chart is lost per `C5.251`.

### 14.3 Beam weapon procedure (`C3.1`)

After Middle and Late missile impacts come the **First** and **Second Beam Impact** steps.

Shoot a range and bearing from the ship's **current position** to the target's **current
position**. If the target is **in arc**, **in range**, and **does not have its wedge showing**,
the beams **hit automatically**. There is **no active defense against beams**, and **fire control
hits do not penalise beams**.

**Damage falls off with range**, printed as a series on the SSD: a `10/7/5L` is a laser doing 10
damage at ranges 0–1, 7 at range 2, and 5 at range 3 (`C3.111`).

**Target aspect (`C3.12`)** — exactly one of:

1. Target's **sidewall faces the shooter** → use the range shown by the bearing. Normal case.
2. Target has its **wedge showing** → beams **cannot damage** it.
3. Target has **no sidewall and no wedge** showing → **halve the range** for determining beam
   damage, rounding **in favour of the attacker**.

Energy torpedoes never halve the range (`C3.124`).

Down-the-throat example (`C3.12` sidebar): a `10/7/5L` fired directly on the Forward marker of a
ship with no bow wall, from range 7. Half of 7 is 3.5, which rounds in the attacker's favour to 3,
giving a 5-damage hit.

---

## 15. Damage effects by system

### 15.1 General (`C5.41`)

Each damage point destroys one box of a given system type. Boxes are marked left to right (or top
to bottom on vertical tracks); the contents of the current box give the current benefit.

**Exceptions** — **magazine** and **hull** hits: roll **2d10−** and take that many hits on the
track. A result of 0 means nothing is marked off (`C5.411`).

For **magazine, decoy and weapon** hits, the placement on the hit location table determines which
weapon mount takes the damage: ask *"for damage coming into this side of the table, which weapon
mount could shoot back?"* (`C5.412`).

### 15.2 Structural systems (`C5.42`)

**Structural Integrity (SI)** is how ships die.

| SI box type | Effect |
|---|---|
| **Square** | No penalty (`C5.4211`). |
| **Circle containing `C`** | **Core cascade**: roll a hit location on the broadside and take any non-SI, non-duplicated Core hits in that column. Hit locations of 2, 3, 19 and 20 have no Core hits, so the cascade has no effect (`C5.4212`). |
| **Octagon with a number** | Chance the ship explodes. After marking it, roll **that number or higher on a d10** or the ship explodes (`C5.4213`). Mnemonic: octagons are stop signs — "roll this number or higher, or stop playing the ship". |
| **Star** (end of track) | Damage to it **destroys the ship** (`C5.4214`). |

**Hull** represents bulk storage and berthing. Each hull hit → roll 2d10− and mark that many boxes.
Each hull box with a **wrench icon** is a **damage control party**. If a ship runs out of hull
boxes, all remaining hull hits (including leftovers from the 2d10− roll) **cascade to SI**, but
cascade hits only do a **single box** of SI damage each.

**Life support (`lif`)**: until at least one life support box is **permanently** repaired, a crew
quality check must be made every **6 hours (19 operational turns)** or the ship is lost with all
hands.

### 15.3 Weapon mounts (`C5.43`)

Three categories within a mount: **fire control**, the **weapons**, and the **magazine**.

Weapon designators: `M` missiles, `L` lasers, `ET` energy torpedoes, `G` grasers, `CM`
countermissiles, `PD` point defense clusters.

- **Fire control (`fcon`) hits** penalise all weapons fire from that mount. The number in the
  leftmost unchecked box is **added to the MQL** for outgoing fire and is a **leftward column
  shift** for active defenses (`C5.432`).
- A **CIC** hit does one fire control hit to **all four** mounts (`C5.443`).
- The number of **towed missile pods** a ship can fire equals the number of boxes in the fire
  control track (`C5.4322`).
- A **magazine** hit reduces the shots available to that mount's missile launchers by **2d10−
  salvo dots**.
- A **decoy** hit destroys one broadside decoy box. If the damage came from fore or aft, the
  defender chooses which side loses a decoy.

### 15.4 Command and control (`C5.44`)

- **Bridge (`brg`)**: the track ends in circled boxes carrying penalties `0`, `−1`, `−2`. When only
  circular bridge hits remain, the penalties apply to plotting facing changes on the AVID, applying
  thrust, and targeting missiles, via Crew Quality checks. Defensive systems (ECM, decoys) have
  enough autonomous control to work without the bridge.
  Whenever you take a bridge hit, roll **2d10−**; on a **6 or higher** one of your officer ratings
  drops by one. Roll a **d10** for which officer: **1–2** Tactical, **3–4** EW, **5–6** Assistant
  Tactical, **7–8** Helm, **9–10** Engineering (`C5.4412`). No damage allocation hit can reduce the
  quality of your **crew**.
- **Flag Bridge (`flg`)**: track of `+7 +6 +5 +4 +3 +2 +1`; used by formation rules (a future
  product) (`C5.442`).
- **Communications (`com`)**: at least one box is required to link salvoes, share active defense
  kills, or be part of a formation (`C5.444`).

### 15.5 Defensive systems (`C5.45`)

Hits to **sidewalls** and the **ECM** track reduce their capability to the leftmost unchecked box.
The *Sample*-class ECM track reads `5 4 4 3 3 2 1 1 0`. Decoys are handled under weapon mount hits.

### 15.6 Propulsion and maneuver (`C5.46`)

Propulsion systems: forward impeller, aft impeller, Warshawski sails, hyper generator, Maximum
Thrust track. Maneuver systems: pivot and roll tracks.

- Hits to `fwd` or `aft` hit the corresponding impeller track. **For each impeller box marked off,
  also mark off one box of the Maximum Thrust track** (`C5.461`).
- The **last box on each impeller track is a circled `W`** — the **Warshawski sail**. A `2fwd` or
  `2aft` hit takes two hits to the impeller track, one of which is to the Warshawski sail if it is
  still there; if not, both are ordinary impeller hits (`C5.462`).
- The **hyper generator** sits in the Core. Without hyper generators a ship cannot translate into
  hyperspace; it does not automatically drop into normal space when the generator is destroyed
  (`C5.463`).
- **Pivot** and **roll** tracks take damage normally; current ratings are the leftmost unchecked
  box. The *Sample*-class pivot track reads `3 3 2 2 2 1` with **evolution delays** `4 4 6 6 6 12`
  printed underneath (used by formation movement rules, a future product). The roll track reads
  `4 3 3 2 2 1` (`C5.464`, `C5.4541`).
- If the **Maximum Thrust** track is reduced to just the **circled** boxes, a **Crew Quality check
  is required each turn thrust is used**; on a failure the ship takes an **SI hit**. The same check
  is required to use thrust on each plotting phase if **all the boxes in one impeller track** are
  destroyed (`C5.465`).

---

## 16. Damage control

- Each **wrench icon** in the hull track is one **damage control party** (`C6.11`).
- At the end of each turn, during the record-keeping step, assign damage control parties to repair
  destroyed boxes. Parties may repair boxes damaged earlier in the same turn; there is no delay to
  track (`C6.12`).
- For each party assigned, roll a **Crew Quality check**. Success repairs the box. **Failure means
  that box can never be repaired by combat damage control.**
- You may send **up to two** parties at one box on the same turn, giving two attempts; if either
  succeeds the system is up. This is the only way to roll twice for the same box. Failure of both
  means the box cannot be repaired for the rest of the fight (`C6.122`).
- Unless specified otherwise, one repair restores one box (`C6.123`).
- **Combat repairs are jury-rigged and fail ten tactical turns after being fixed** (`C6.13`).

**Unusual systems (`C6.14`)**: repairing a magazine hit restores **3d10-low** missiles to the
magazine; this can also be used to reload magazines. Magazines cannot be repaired on a turn the
missiles in that mount have fired. Magazines are an **exception to the "can only be repaired once"
rule**.

**Cannot be repaired by combat damage control (`C6.15`)**: **hull, Structural Integrity, Warshawski
sails, hyper generators.**

**Permanent repairs (`C6.16`)**: take **one operational turn** each; one per damage control party;
the Crew Quality check works normally and two parties on one roll is still allowed. Permanent
repairs **can** be used on the SI track. Repairing hull can bring destroyed damage control parties
back. Unlike a tactical repair, you **may try again** on a failed permanent repair; failing a
second time means it needs a shipyard.

Additional damage control parties may be purchased as a commander's option: **up to three at 2
points each** (`D4.21`). They are pencilled into the hull track and may not all be in the same
rows, nor adjacent to each other or to an original damage control party **[verify: text partly
illegible]**.

---

## 17. Light Attack Craft (LACs)

LAC combat differs from starship combat in maneuver, firing and damage allocation (`C7.0`).

### 17.1 Squadrons

- LACs operate in squadrons of up to **10**, maneuvered as **one unit** — one box miniature, one
  unit on the map. **Multiple LAC squadrons may share a hex** (`C7.11`).
- When purchasing a squadron, mark off the boxes of the unused LACs.
- **Squadron benefits (`C7.13`)**: LACs in the same squadron and hex **add all of their box
  launcher fire into one salvo**, which can then be linked (`C2.17`) with salvoes from other units.
  They also **share the squadron ECM value**, and all active defense kills generated by the squadron
  are **pooled** and used against missiles targeting the squadron as a whole.

### 17.2 Maneuver

See §6.1. LACs suffer **no loss in thrust capability from damage**; any impeller loss that would
force them out of formation is assumed to have destroyed them instead (`C7.123`).

### 17.3 Weaponry

- **Box launchers (`C7.21`)**: no magazines. Each launcher holds a fixed number of missiles fired as
  one salvo. LAC fire control allows **one box launcher per broadside per firing opportunity** — a
  LAC with 3 box launchers could fire one Early, one Middle and one Late, but not all three Early.
  **When a box launcher fires it is marked off as destroyed.**
- **Active defenses (`C7.22`)**: each LAC's PD and CM systems are arrayed in a column of hits.
- **Beam weapons (`C7.23`)** work identically to ships. LAC maneuverability makes them likelier to
  get a down-the-throat shot.

### 17.4 Damage (`C7.3`)

1. **Which LAC got hit**: when missiles penetrate a squadron's defenses, roll a **d10 per missile**.
   This is done *before* resolving damage on any single LAC, so several missiles may overkill one LAC.
2. **Damaging a LAC**: determine the Depth modifier as usual (Damage − target scale + sidewall), roll
   **2d10−**, **skip that many boxes** on the track, and start marking damage **left to right**. If
   damage hits the **star** at the end, the LAC is destroyed.
   - **Blank boxes** are "padding hits".
   - **Octagon hits** are a chance for the LAC to be destroyed, as with SI. Further hits to a
     destroyed octagon skip to the next box in the string.
   - **Circular hits** direct that damage point to a weapon of the appropriate type. Weapons must be
     taken from the **facing location first**, then from the side of the defending player's choice.
     If no weapons of that type are left, the damage falls to the next box on the track.
   - Weapons with **Span greater than 1 add 2 to the 2d10− "skip roll"**.
3. **Crew quality (`C7.33`)**: LACs are assumed to have **Average** crew quality. So long as they have
   one square box left on their damage control track, they have one damage control party.

LAC damage track scale is **1**.

---

## 18. Missile pods

A missile pod is effectively a **single-shot box launcher** towed outside the ship's wedge and
guided by the towing ship's fire control (`C8.0`).

### 18.1 The pod card (`C8.1`)

Downloadable cards, paperclipped to the SSD or keyed by ship ID. **Up to twelve pods per card.**
Each card carries its own **Towed Pods** track, **Range Bands** table and **Points** table.

The `Mk12 Missile Pod` (RMN, introduction 1905 PD) shown in the book carries **16MB** per pod and
has these range bands — note they differ from shipboard bands:

| Range | 0–1 | 2–4 | 5–7 | 8–11 | 12–15 | 16–20 | 21–26 | 27–31 |
|---|---|---|---|---|---|---|---|---|
| **Base MQL** | 8 | 6 | 7 | 8 | 9 | 10 | 11 | 12 |
| **Salvoes available** | Early + Middle + Late | Early + Middle + Late | Early + Middle + Late | Middle + Late | Middle + Late | Middle + Late | Late | Late |

Pod point cost varies with the **towing ship's Tactical Officer grade**:

| Pods | Poor | Avg | Vet | Elite |
|---|---|---|---|---|
| 1 | 10 | 14 | 19 | 24 |
| 2 | 20 | 31 | 31 | 31 |
| 3 | 32 | 48 | 48 | 48 |
| 4 | 44 | 66 | 66 | 66 |
| 5 | 56 | 84 | 84 | 84 |
| 6 | 68 | 103 | 103 | 103 |
| 7 | 81 | 122 | 122 | 122 |
| 8 | 94 | 141 | 141 | 141 |
| 9 | 107 | 161 | 161 | 161 |
| 10 | 120 | 180 | 180 | 180 |
| 11 | 133 | 200 | 200 | 200 |
| 12 | 146 | 220 | 220 | 220 |

Mark off unused towed pod boxes and circle the point cost actually paid.

### 18.2 Restrictions and drawbacks (`C8.2`)

- **Towing limit**: a ship may tow **Scale − 10** pods with no reduction in maximum thrust; negative
  results (e.g. a Scale 8 battlecruiser) are treated as **0**. Each pod over the limit **disables two
  boxes** on the Maximum Thrust track; those boxes come back once the pods have fired. You may not
  tow pods that would push maximum thrust down into the **circled** boxes, though you may "red-line
  the compensators" (`B3.231`) to conceal a thrust decrease (`C8.21`).
- **LACs cannot tow pods or provide fire control guidance for them** (`C8.211`).
- **Soft kills (`C8.22`)**: any missile that rolls for Penetration on the target destroys a number of
  **unfired towed pods** equal to the **basic Penetration roll**.
  - Soft kills in the **Early** impact phase destroy pods slated to impact in the Middle and Late
    phases of that turn.
  - Soft kills in the **Middle** phase destroy pods slated for the Late phase.
  - Soft kills in the **Late** phase destroy any unfired pods still towed, or pods deployed but not
    yet stabilised to fire.
- **Deploying more pods (`C8.23`)**: done during the **Other Actions** step; available to fire **two
  tactical turns** after deployment; **one pod per turn** for ordinary ships. Between deployment and
  readiness the launching ship may **not plot any pivots, rolls or thrusts** without losing the pods,
  and the pods remain vulnerable to soft kills. **Podlaying ships** may deploy multiple pods per turn
  and have only a **one-turn** delay; their limits are printed on their SSDs.

### 18.3 Firing from pods (`C8.3`)

- **Each pod deployed disables one fire control box** on the bearing facing the enemy. Those boxes
  come back at the end of the turn after the pods have launched. Fire control penalties accrued this
  way apply to **all missile and point defense fire** until the end of the turn the missiles were
  launched on (`C8.31`).
- Missiles from pods use the **Range Bands table on the pod card**, not the SSD's.
- Pod missiles are typically **capital missiles**; damage is printed on the card.

Worked example (`C8.2` sidebar): a *Reliant*-class battlecruiser with five fire control boxes towing
five pods is effectively firing at **+3 MQL**, which also applies to its own tube fire on that
bearing, and **all its active defenses take a 3-column leftward shift**. Its opening salvo could be
22 broadside missiles plus 40 capital missiles from pods, at a severe accuracy penalty.

### 18.4 Points and victory

A pod's point cost is added to the **force budget** of the side deploying them. **Every pod used is
counted as destroyed** for victory calculations (`C8.12`, `D2.225`). This makes it unwise to launch
pods at ships cheaper than the pods themselves.

**Force composition limit (`D4.11`)**: no more than **10% of a force's book value** (prior to crew
and officer adjustments) may be spent on pods. Some historical battles (e.g. Hancock Station) exceed
this.

---

## 19. Officers, crews and miracles

### 19.1 Grades

Four grades, mnemonic **PAVE**: **Poor, Average, Veteran, Elite** (`D1.11`). Grades are relative to
the ship's own service, not an absolute standard — do not start all Manticoran officers at Veteran.

Five officer types plus overall crew quality are tracked. The **Officers & Crew** table in the SSD's
upper right gives each grade's benefit and its **price change** to the ship's cost. Base cost is
printed at upper left; sum the grade adjustments to get the **Adjusted Cost**.

**Crew Quality Target Number**: the number you must roll **less than or equal to** for a crew quality
check (Average succeeds on a 5 or less, per the `C6.1` example).

#### Initial distribution (`D1.12`)

Roll **2d10−** six times per ship (five officers + crew grade):

| Roll | Result |
|---|---|
| **0** | 50/50 chance of being below average: if the two dice were **odd**, that grade is **Poor**; otherwise Average |
| **1–7** | **Average** |
| **8** | **Veteran** |
| **9** | **Elite** |

Randomly rolled grades are still **paid for** (`D1.125`).

#### Grades over time (`D1.13`)

Once per T-year (on the ship's anniversary, or at the start of each calendar year), roll 2d10− six
times per ship:

- **0**, with both individual dice showing 0s or 1s → that grade **drops one**.
- **9** → that grade **improves one**.
- A **miracle-grade commander** forces a fresh set of grade rolls two months after taking command,
  for grades of Average or worse; **add 1 to all crew grade rolls per level of miracle effect**.
- Grades are **tied to ships, not officers** — you cannot move an Elite TO from a destroyer to a
  superdreadnought at will (`D1.134`).
- An **Overwhelming Victory** lets a ship re-roll its grades at **+1**; a **Legendary Victory** at
  **+2** (`D1.135`).

### 19.2 Officer types (`D1.14`)

| Officer | Abbrev. | Effect |
|---|---|---|
| **Tactical Officer** | TAC | Missile fire control. Modifies the **MQL of all missiles** launched by the ship, up or down by grade. |
| **Electronic Warfare Officer** | EWO | ECM and decoy deployment. Modifies the **ECM value** used in the ECM layer. On the operational scale the EWO's ECM modifier **adds to the Crew Quality number for detection**. |
| **Assistant Tactical Officer** | ATO | Active defenses. **Poor**: −1 to CM probable kills (never below 1 from this penalty). **Veteran**: +1 to CM probable kills. **Elite**: +1 to **both** CM and PD probable kills. |
| **Helm** | — | **Poor**: −1 to pivot and roll windows per turn (never below 1 while boxes remain). **Veteran**: +1 to roll rating. **Elite**: +1 to **either** pivot or roll, switchable each plotting phase. |
| **Engineering Officer** | ENG | See §7.3. **Elite**: **+1 thrust rating at all times** (not combinable with red-lining). |

### 19.3 Miracle-grade officers (`D1.2`)

A rules-breaking mechanic for recreating Honor Harrington-class heroics. Miracle commanders appear
only in **historical scenarios**, or by mutual agreement when one side is **20% or more under** the
other side's points (`D3.42`).

**Mechanics (`D1.22`)**: a miracle-grade commander fighting at a points disadvantage of 20% or more
draws from a deck of playing cards on a schedule set by their grade. Cards form a **Blackjack hand**:
number cards at face value, **Aces 11 or 1**, face cards **10**. Goal: get as close to 21 as possible
without going over. Going over **busts** — all cards are shuffled back and the process restarts. Cards
are kept **face down** until a complete hand is met. A miracle commander **must always draw** when
eligible. **A hand of 19 or higher is a miracle.**

**Card draw frequency (`D1.23`)**, shown by diamonds after the ship name:

| Grade | Examples | First draw | Thereafter |
|---|---|---|---|
| **Superb** | Sarnow, Tourville | end of turn 6 **[verify: text then says draws are on turns 4, 10, 14, 18 — inconsistent in the scan]** | every 4 turns |
| **Excellent** | Theismann, White Haven | turn 4 | every 3 turns (4, 7, 10, 13) |
| **Legendary** | Harrington | turn 2 | every 3 turns (2, 5, 8, 11) |

Superb commanders also add **+1 to officer and crew checks** if they have commanded that ship for two
months or more. On the operational scale the same turn delays apply. Switching from operational to
tactical scale **shuffles all cards and restarts the draws**. **Miracles may not be banked** — you have
until your next card draw to use one, and that draw may bust you.

#### Level 19 miracles (`D1.24`)

Instant, lasting only the turn used. Suggested effects:

- Missiles **completely ignore the ECM layer**, or score a minimum of **3d10-high** missiles reaching
  the target regardless of the target's rolls.
- Defensively: **double** the missiles killed by your own ECM layer; or declare an interposed wedge
  **100% effective** for that turn; or **use a decoy without it being destroyed**.
- Operational: **automatic detection** of a target at maximum range, without guessing a search bearing.
- Damage allocation: **pick the hit location** of 10% of the missiles that impact, rounding up.
- **Automatically succeed one SI check** during the turn.

#### Level 20 miracles (`D1.25`)

Things not technically allowed by the rules but reasonably plausible:

- The classic **"roll ship and fire a double broadside"**: fire one salvo from **each** broadside at
  the same target in the **Late** missile salvo, provided the ship rolled at least **4 windows** that
  turn.
- A salvo takes a mild **"dog leg"** — adjust the Impact Window to any **adjacent** AVID window at
  launch.
- **Double your thrust rating for two turns**, but only if you have taken impeller damage and not in
  excess of the original maximum. Alternately, **see what thrust your target has plotted** before
  plotting your own.
- Operational: spend a recon drone to know the exact size, vector and disposition of all enemy units
  within two operational hexes without choosing a bearing. When transitioning operational → tactical,
  **specify up to half of the opposing force's pre-tactical scenario thrust**.
- Damage allocation: **specify maximum penetration rolls** for weapons hitting in one impact step and
  **pick the hit location numbers**, rounding fractional weapon counts up.
- **Re-roll previously failed damage control attempts**; automatically make all SI checks during a
  single turn.
- **Halve the range** when firing beams at a target with its sidewall interposed (the sidewall still
  applies normally for damage resolution).

#### Level 21 miracles (`D1.26`)

The only miracles with **persistent effects past the turn of use**, though never past the end of the
current combat. The restrictions are that the effect must fit the Honorverse, that your opponent
would find it reasonable, and that you **may not use the same Level 21 miracle twice**.

- Reduce **[effect partly illegible]** for two turns; alternately **add 1 to the MQL of all enemy
  missiles** fired at the miraculous officer's ship, increasing by one every two combat turns.
- Damage allocation: specify that an **entire salvo hits the throat or the kilt** of the enemy ship,
  before rolling for Penetration or hit location, **even if the geometry doesn't allow it** or the
  target has its wedge interposed.
- **After the target has plotted their movement orders**, plot yours and **change your ship's position
  by up to 5 hexes**, in addition to your plotted vector changes.
- Operational: know the entire disposition of the enemy's forces, and either move your forces **five
  operational hexes** in response, or make your own forces appear to be in a different position by up
  to **three operational hexes**.
- Fire beams as though the target had **no sidewalls at all** — at half true range, ignoring the
  sidewall for penetration rolls. Beams that would ordinarily hit the wedge are treated as a standard
  beam shot against sidewalls.
- **Automatically succeed on all SI checks** during the battle. The ship is still destroyed if the star
  at the end of the SI track is damaged.
- **"Immortal magazines"**: firing missiles does not consume magazine dots, though damage to the
  magazines still does, and having no magazines still prevents firing. Lasts until the ship transitions
  back to operational movement, or **6 hours**, whichever is less.

---

## 20. Scenarios and victory

### 20.1 Setup (`D2.1`)

- Map sheets lay edge to edge. **Long-edge to long-edge** gives a squarish area, good for large
  squadron actions; **short-edge to short-edge** gives a long thin area, better for stern chases. The
  compass rosette must point the same way on every sheet.
- The two sides are designated **Red** or **Green**, matching the tilt blocks and Movement Cards.
- **Simple scenario setup (`D2.12`)**: after agreeing forces, both sides start **within 5 hexes of
  opposite corners** of a long-edge-to-long-edge double map sheet, facing as they choose, with vectors
  of **up to 5 hexes per turn in any direction**. One side will be at **12 hexes of altitude** (large
  hexes) or **20 hexes** (small hexes).
- **Operational → tactical transition (`D2.13`)**: when two forces reach **range 5** on the operational
  map they transition to the tactical map.

**Cowardly draw (`D2.1` sidebar)**: if after ten turns neither side has done at least **2% damage to
at least half the ships** of the other side, the game ends in a draw.

### 20.2 Victory conditions (`D2.2`)

**Simple**: one player stops because they see no way to win, or all their units are destroyed.

**Derived (point-based)**:

- Two ships with equal point costs should have about a 50/50 chance in a straight-up fight.
- **Damaging** an enemy ship earns a fraction of its point cost equal to the **percentage of the boxes
  on the ship destroyed**. **Destroying** it earns victory points equal to its full cost. Round
  fractional VPs **up** (`D2.223`).
- **Surrender (`D2.224`)**: a ship that surrenders gives its **full point cost** to the enemy, **minus
  0.2 VP per officer aboard and minus 0.01 VP per enlisted rating or Marine**. Divide the officer count
  by 5 and the enlisted count by 100. This is deliberately designed to give players a reason to strike
  their colours rather than fight to the end.
- **Each missile pod used or killed counts as victory points for the opposing side** (`D2.225`).
- Scenario objectives give bonus points (`D2.222`).

**Erratum in the book's worked example.** The `D2.223` sidebar reads: *"A Falcon class DD costs 36
points, and has 114 hull boxes. Over the course of the scenario, it gets mauled, taking 47 boxes of
damage. 47/114 = 36%, and 36% of 36 is 12.9 (rounds up to 13) victory points for its opponent. If it
were completely destroyed, it would have netted the opponent 114 points."* Two errors, both verified
against the page image:

- 47/114 is **41%**, not 36%. Either the damage should read 41 boxes (41/114 = 36%) or the percentage
  is wrong. The final answer of 13 VPs follows from 36%.
- "114 points" for total destruction contradicts the rule itself. `D2.223` says destruction gives VPs
  equal to the ship's **cost** — **36**, not its box count.

**Implement the rule, not the example**: damage VPs = (boxes destroyed ÷ total boxes) × point cost,
rounded up; destruction VPs = full point cost.

### 20.3 Margin of victory (`D2.23`)

1. **Victory Point Ratio (VPR)** = total victory points you earned ÷ **initial cost of your own
   force**, including VPs from scenario objectives. Think of it as "victory point return on
   investment".
2. Subtract the smaller VPR from the larger and look up the difference:

| Difference in VPR | Margin of victory |
|---|---|
| 0.00 – 0.10 | **Draw** |
| 0.11 – 0.30 | **Minor Victory** |
| 0.31 – 0.60 | **Victory** |
| 0.61 – 0.90 | **Major Victory** |
| 0.91 – 1.30 | **Overwhelming Victory** |
| 1.31 or more | **Legendary Victory** |

*The upper bounds (0.10, 0.30, 0.60, 0.90, 1.30) are legible; the lower bounds are OCR-mangled in
the source and have been inferred as the obvious continuation.*

Example: Havenite VPR 13/42 = 0.309; Manticoran VPR 5/36 = 0.138; difference 0.171 → **Minor Victory**
for the Havenites.

### 20.4 Patrol scenario generator (`D3.0`)

A randomised scenario generator using a standard deck of playing cards.

**Force selection (`D3.1`)**:

- One player is the **Attacker**, the other the **Defender**. Each picks a faction. The **year**
  determines what ships are available; **1906 is the default**.
- Agree a **duelling point budget**; **600 points per side** gives a reasonable game mixing
  battlecruisers and cruisers.
- Spend **60%** of the budget on ships, including rolling and paying for crew and officer grades. The
  remaining points are spent **after** drawing cards for force budget.
- **The Lemon Rule (`D3.12`)**: **10%** of each side's force budget is chosen **by the opposing
  player**. Playing Manticore, your Havenite opponent picks 10% of your force, and you pick 10% of
  theirs.
- **Card draws (`D3.13`)**: each player draws **three** cards — one is the **force multiplier**, one the
  **time limit**, one the **mission objective**. Each player chooses which card fills which role, then
  places them face down for later verification. Some mission cards require a second draw; all others
  permit a second draw to conceal the mission.
- **Disengagement (`D3.131`)**: more than **50 hexes of separation** between the closest elements of
  the two forces, with at least **3 hexes per turn** of separation rate **[verify: text degraded]**.
  Failing to meet the disengagement conditions within **10 turns** of the time limit forfeits **50%** of
  your VPs; failing after **20 turns** forfeits **100%**.

**Force multipliers and time limits** (sidebar tables, `D3.14`):

| Card | Force multiplier | Time limit |
|---|---|---|
| Ace | 130% of base | 20 turns |
| King | 120% | 18 turns |
| Queen | 110% | 16 turns |
| Jack | 100% | 15 turns |
| 10 | 100% | 14 turns |
| 9 | 100% | 13 turns |
| 8 | 100% | 12 turns |
| 7 | 100% | 12 turns |
| 6 | 100% | 12 turns |
| 5 | 100% | 12 turns |
| 4 | 90% | 11 turns |
| 3 | 80% | 10 turns |
| 2 | 70% | 9 turns |

#### Attacker missions (`D3.2`)

| Card | Mission | Effect |
|---|---|---|
| **Ace** | **Spy** | You have a spy on an enemy ship of your choice. Do one of: (1) **Sabotage** — pick four adjacent cells on the hit location table and do two damage to each; (2) force the enemy to **reveal their mission card**; (3) prevent that ship from **plotting any movement orders for three turns**; (4) don't reveal, but score **5% of the enemy's total force budget** as bonus VPs. Draw another card for your true mission; a second Ace lets you choose any mission you like in addition to the spy. |
| **King** | **Dummy Draw** | Draw another card. Pick the defender's or attacker's mission of your choice. |
| **Queen** | **Force Majeure** | **Destroy the largest ship in the enemy force to double your victory point total.** |
| **Jack** | **Convoy Raid** | A convoy of freighters lies behind the enemy. For each hyper-capable ship that disengages past the enemy force you capture one freighter, worth **5% of your opponent's point budget**. Maximum **50%** of the base point budget this way. |
| **10** | **Vendetta** | Pick one enemy ship; your force commander has a private vendetta with its commander. Destroying it counts **triple** VPs. If it successfully disengages, it counts **double** VPs for the other side. |
| **9** | **Deep Strike** | Any of your units lacking functioning hyper generators are **considered destroyed** at the end of the scenario. All your VP totals are multiplied by **120%**. You may draw a second card to conceal this one. |
| **8** | **Dummy Draw** | Draw another card and take the **Defender** mission profile it gives. Another dummy draw → take the defender mission of your choice. |
| **7** | **Liar's Bluff** | You are a bluff to convince the enemy operations will begin here. **None of your ships may disengage until one enemy has disengaged.** |
| **6** | **Space Superiority** | Intercept and destroy the defending fleet. You receive only **50%** of normal point values for damage to enemy ships that are not destroyed. |
| **5** | **Demonstration of Mettle** | Your disengagement timer card does not count; you may **not attempt to disengage until at least two hyper-capable enemy units are destroyed**. |
| **4** | **System Blockade** | Prevent the enemy reaching the hyper limit. Enemy units that lose their hyper generators by scenario end count for **150%** of normal VPs. |
| **3** | **Economy of Force** | Intercept and destroy the defending fleet — but the enemy scores **125%** of normal VPs for damage to your fleet. You may draw a second card to disguise this one. |
| **2** | **Intelligence Gathering** | Gather intelligence on **three enemy units of different classes**, chosen at scenario start. For each turn you have at least one unit within **range 5** of one of them, gain **1%** of the enemy's point total; within range 5 of two on the same turn, **2%**; of all three on the same turn, **4%**. Maximum **25%** bonus. |

*Note: the scan shows both "6" and "5" labelled with what appear to be Space Superiority and
Demonstration of Mettle respectively; card-number labels in this section are partly degraded.*
**[verify]**

#### Defender missions (`D3.3`)

| Card | Mission | Effect |
|---|---|---|
| **Ace** | **Vengeance** | The attackers achieved their objective; ensure they don't leave alive. You score **double** points for enemy ships destroyed, and the enemy gains **double** points for all ships that disengage. |
| **King** | **Pincer Maneuver** | **One third** of your point total is off the map and will appear with vectors of your choice at **range 30** in **3d10-medium** tactical turns. |
| **Queen** | **Dummy Draw** | Draw one more card and use that mission. A second Dummy Draw gives you the **Attacker** mission of your choice. |
| **Jack** | **Elite Crew** | One of the ships chosen by your opponent through the Lemon Rule has an **Elite TO and Elite Crew**, in addition to whatever you bought. However, if it is destroyed its point value is **doubled and subtracted** from your victory point total (morale). |
| **10** | **Dummy Draw** | Draw another card and take the Defender mission it gives. A second Dummy Draw → defender mission of your choice. |
| **9** | **Convoy Defence** | A convoy lies behind you. Each enemy ship that disengages past you subtracts its remaining value from your score, up to **50%** of the base point budget. If no enemy ships disengage, **double** your total victory points. |
| **8** | **Space Superiority** | Intercept and destroy the attacking fleet. You receive only **50%** of normal values for enemy ships not destroyed. |
| **7** | **System Blockade** | Prevent the enemy leaving. **[effect text partly illegible: appears to subtract value of each enemy ship with a functioning hyper generator that leaves the map from your VP total]** |
| **6** | **Fleet in Being** | Your force is the only major group of naval combatants available; it is vital it be preserved intact, even if you must surrender. Ships destroyed or captured count **double** for the enemy. |
| **5** | **Space Supremacy** | Naval Command assembled your force to frustrate enemy plans. You score **double** VPs if you prevent the enemy achieving their objective by **turn 10**. |
| **4** | **Picket Duty** | Re-supply is due but you are short of everything. **Halve all magazine totals**; you may use **no pods**; **25%** of your force by points has a **Poor crew**. On any turn you use countermissiles, roll **2d10−**; on a **7 or higher** the countermissiles on that side of the ship are out of ammunition. Canister fire is unaffected. |
| **3** | **Walking Wounded** | **20%** of your force by points, including at least one of your largest ships, has already taken **half its SI hits** as damage. You add **50%** of their point values to your total if they successfully disengage past the enemy when your time limit comes up. Which ships are damaged is recorded in secret; you only reveal it when they take an SI hit. |
| **2** | **Political Appointee** | Your **second largest ship** is commanded by someone with political ties. **Two of its officers MUST be Poor** and the crew can be no better than Average. If it ever loses more than **50% of one broadside's worth of weapons**, or successfully makes an octagon SI check roll, it must immediately roll a **Crew Quality check** or attempt to leave the fight immediately. If it disengages, the enemy scores **150%** of normal VPs for it. If destroyed, you lose VPs equal to **twice** its VP total. You may draw a second card to conceal this one. |

**Victory (`D3.4`)**: calculate VP totals and VPRs normally and use the margin-of-victory chart in
`D2.232`.

### 20.5 Commander's options (`D4.0`)

Ways to customise a force and spend leftover points. Distinct from buying officer and crew quality.

| Option | Cost / limit |
|---|---|
| **Missile pods** (`D4.11`) | Max **10% of force book value**. Availability date printed on the pod card. Some historical battles exceed the limit. |
| **Canister shot** (`D4.12`) | **½ point per canister after 1902 PD**; **1 point** before. Heavy-cruiser missiles and larger are replaced by multiple canister rounds. Which broadsides carry canister is recorded before the scenario. |
| **Recon drones** (`D4.13`) | **2 points** each. A ship may never carry more than **half again** the quantity specified in its class history, rounding up. A ship with 13 drones may buy 7 more, for 20. |
| **Damage control parties** (`D4.21`) | Up to **three** extra at **2 points** each. |
| **Marine company ready to deploy** (`D4.22`) | **5 points** at scenario start. Company counts come from Jayne's Intelligence Review; most battalions have 4 companies. |

---

## 21. Operational (system) scale

A system scale is provided for pre-scenario maneuvering (`B5.0`, intro):

- One operational hex = **8 light seconds**; one operational turn = **19 minutes**.
- Many tactical maneuver constraints do not apply.
- Detection uses Crew Quality checks; the EW Officer's ECM modifier **adds to the Crew Quality number
  for detection** (`D1.142`).
- Forces transition to the tactical map at **range 5** (`D2.13`).
- **Recon drones** are spent here for reconnaissance (`D4.13`, `D1.254`).
- Life support crew checks are measured in operational turns: **19 operational turns = 6 hours**
  (`C5.42`).
- Permanent damage control repairs take **one operational turn** each (`C6.16`).

*The scan of section `B5` is among the more degraded in the book; treat operational-scale detail as
provisional.* **[verify]**

---

## 22. Ship Systems Display — data model

Everything the app needs to represent one ship. Structure confirmed from `A2.6` and `C5.4`.

**Header**: nationality, class name, ship ID number, ship name.

**Costing box** (upper right): base point cost, box count, Officers & Crew table (TAC, EWO, ATO,
Helm, ENG, Crew — each with grade benefit and cost delta), Adjusted Cost.

**Range Bands table**: available salvoes and Base MQL by range (see §11.1).

**Four weapon mounts** — Forward Hammerhead, Aft Hammerhead, Port Broadside, Starboard Broadside.
Each holds:
- a **firing arc diagram** (sphere view, black / grey / white windows)
- `fcon` **fire control track** with penalty values, e.g. `0 0 1 1 2 2 3 | 3`
- `mag` **magazine** track (dot grid) with missile size, e.g. `16M`
- **weapon tracks** with salvo dots, e.g. missiles, `17/11/7/5L` lasers, `18/10/6G` grasers, `7ET`
  energy torpedoes, `CM`, `PD` (PD tracks end in fractional boxes such as `⅓`)
- **decoy** boxes

**Structural**: `SI` track (squares, circled `C` core-cascade boxes, numbered octagons, terminal star),
`hull` track (with wrench icons = damage control parties), `lif` life support track.

**Command and control**: `brg` bridge (ending `(0) (−1) −2`), `flg` flag bridge (`+7 … +1`), `CIC`,
`com` communications.

**Defensive**: `ECM` track (e.g. `5 4 4 3 3 2 1 1 0`), Port and Starboard **sidewall** tracks
(e.g. `−4 −4 −3 −3 −2 −2 −1 −1 −1 0 0 1 1 1 2 2 3`, no-sidewall value `+3`), bow/stern walls if present.

**Propulsion**: `fwd` forward impeller (ending in circled `W`), `aft` aft impeller (circled `W`),
**Maximum Thrust** track (squares then circles, e.g. `2×9, 1` over `1×5, (1)(1)(1)`).

**Maneuver**: `piv` pivot track (e.g. `3 3 2 2 2 1`) with **evolution delays** beneath (`4 4 6 6 6 12`),
`rol` roll track (e.g. `4 3 3 2 2 1`).

**Hit Location Table**: header gives **SCALE** and **CORE ARMOR**; body is a grid of system codes with
a shaded Core region; edges carry the sidewall tracks (top = Starboard, bottom = Port) and the
hammerhead armour values (left = Forward `+1`, right = Aft `+1`); row/column labels `2-3, 4-5, 6-7, 8,
9-10, 11, 12-13, 14, 15-16, 17-18, 19-20` and `2 … 20`; legend `FORWARD −10 … +10 AFT` and
`CIC = 1 hit to all fcon tracks`.

**Also tracked**: hyper generator (located in the Core), recon drone count, officer/Marine/enlisted
counts (for surrender VP calculation).

---

## 23. What the core book does not contain

The app cannot be built from this book alone.

1. **No ship data.** The core book contains **no SSDs for actual ship classes** — only a generic
   *Sample*-class used for illustration. Real ships (*Star Knight*, *Falcon*, *Reliant*, *Conqueror*,
   etc. are referenced by name in examples) live in **Ship Book 1**, a separate product. The app needs
   a ship database: per class, everything in §22 plus point cost and availability year.
2. **No missile pod cards.** Pod cards are downloads from the Ad Astra Games site (`C8.11`). Only the
   RMN `Mk12` is shown.
3. **Formation rules are explicitly deferred** to a future product (`C4.1431`, `C5.442`, `C5.4541`).
   The Flag Bridge track and the pivot-track evolution delays exist only to serve those rules.
4. **Manticoran Super-LACs (Shrikes, Ferrets)** are deferred to a future product (`C7.1` sidebar).
5. **Historical scenarios** are referenced (Basilisk Station, Hancock Station, Yeltsin's Star, Poicters,
   Seaford 9, Blackbird) but not printed here.
6. **The index** is an annex that is updated separately (`A1.11G`).

### Items to verify against the physical components or a cleaner scan

- The full text of red-lining the compensators (`B3.231`).
- The Superb miracle-grade first-draw turn (`D1.231`) — the scan gives both "turn six" and a
  sequence starting at turn 4.
- The lower bounds of the margin-of-victory bands (`D2.232`); upper bounds are certain.
- Card-number labels in the attacker mission list (`D3.2`).
- The Defender "System Blockade" effect (`D3.3`, card 7).
- The damage-control-party placement restriction (`D4.21`).
- Section `B5` (operational movement) in full — the most degraded pages in the scan.
- The *Sample*-class Hit Location Table cell-by-cell, if a worked reference implementation is wanted.

---

## 24. Quick reference for an AI opponent

The decision points a SITS ship commander faces each turn, in plotting order:

1. **Pivot** — how many windows, in which direction, to bring the intended weapon mount to bear on
   where the enemy *will be*, while keeping the wedge between you and where *their* missiles will come
   from. Constrained by the pivot rating.
2. **Roll** — how many windows, to present a fresh sidewall or to interpose the wedge. Constrained by
   the roll rating. Remember a 4+ window roll enables the Level 20 double-broadside miracle.
3. **Thrust** — direction (your midpoint orientation) and magnitude, up to the Maximum Thrust rating.
   Pivoting forfeits displacement, so the choice is between a facing change and extra movement this
   turn.
4. **Missile launch** — which salvoes (set by EoT-to-EoT range), which mount, how many tubes, whether
   to hold tubes back for canister, whether to link with friendly ships, which target.
5. **Defense** — whether to interpose the wedge (blocks beams entirely and forces missiles to the
   nearest facing, but forbids countermissiles and halves PD), whether to spend a decoy after seeing
   the 2d10− result.
6. **Damage control** — which parties to which boxes, and whether to double up for a second roll.
7. **Other actions** — deploy a pod, change formation, disengage.

The tensions that make the game: the wedge protects absolutely against beams but cripples active
defenses; pivoting to bring guns to bear forfeits displacement; closing to beam range means passing
through the enemy's best missile envelope; and the Range Bands table means the side that controls
range controls how many salvoes per turn each side gets.
