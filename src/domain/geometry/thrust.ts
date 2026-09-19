/**
 * Thrust plotting (RULES.md §7.2; Movement Card, PDF p.10 and p.24–25).
 *
 * The Plotting Grid turns "thrust T along my facing" into whole-hex vector changes in two steps:
 *
 * 1. The VERTICAL grid: cells (h, v) hold ⌊√(h² + v²)⌋ and are shaded by AVID ring exactly as
 *    the RALT is. A ship facing a window of ring R with thrust T may draw to any cell in band R
 *    whose value is T. Its horizontal component is h and its vertical component v. The purple
 *    band includes the h = 1 column from v = 4 up — the "one hex horizontal offset in any
 *    direction" of B3.251.
 *
 * 2. The HORIZONTAL fans split h between the two map directions bracketing the facing:
 *    - hex edge fan: all of h in the edge direction, or h−1 in it and 1 in either neighbour
 *      (B3.254: "thrust 4 in A → 3 in A, 1 in F" or "3 in A, 1 in B"). The two green hexes
 *      (h−2 and 2, for h = 4 and 5) are only for ships facing a green-ring window (B3.2541).
 *    - hex corner fan: balanced or nearly balanced splits, transcribed row by row from the card
 *      (B3.255: "thrust 4 in B/C → 2B 2C, 3B 1C or 1B 3C").
 */
import type { AvidWindow, Hemisphere } from './avid';
import { MAP_DIRECTIONS, directionAt, type MapDirection } from './direction';
import { ringFor, trueRange, type Ring } from './ralt';
import { velocity, type Velocity } from './velocity';

/** The printed card stops at 7 in each axis; larger thrust extrapolates with the same formula. */
export const PLOTTING_GRID_MAX = 7;

export interface VerticalPlot {
  readonly h: number;
  /** Signed: positive is up. */
  readonly v: number;
}

/** Value printed in vertical-grid cell (h, v). */
export const plottingGridValue = (h: number, v: number): number => trueRange(h, v);

/**
 * Cells of the vertical grid a ship in ring `ring` may draw to with thrust `thrust`.
 * A level ship (yellow) may take the shallow up or down cells; other rings follow the hemisphere.
 */
export function verticalOptions(thrust: number, ring: Ring, hemi: Hemisphere | null): VerticalPlot[] {
  if (thrust <= 0) return [{ h: 0, v: 0 }];
  const out: VerticalPlot[] = [];
  const limit = Math.max(PLOTTING_GRID_MAX, thrust + 1);
  for (let h = 0; h <= limit; h++) {
    for (let v = 0; v <= limit; v++) {
      if (h === 0 && v === 0) continue;
      if (plottingGridValue(h, v) !== thrust || ringFor(h, v) !== ring) continue;
      if (ring === 'yellow') {
        out.push({ h, v });
        if (v > 0) out.push({ h, v: -v });
      } else {
        out.push({ h, v: hemi === 'lower' ? -v : v });
      }
    }
  }
  return out;
}

export type HorizontalSplit = Readonly<Partial<Record<MapDirection, number>>>;

/** Hex-corner fan, row by row from the card: [amount in the earlier direction, amount in the later]. */
const CORNER_SPLITS: Readonly<Record<number, ReadonlyArray<readonly [number, number]>>> = {
  1: [[1, 0], [0, 1]],
  2: [[1, 1]],
  3: [[2, 1], [1, 2]],
  4: [[3, 1], [2, 2], [1, 3]],
  5: [[3, 2], [2, 3]],
  6: [[4, 2], [3, 3], [2, 4]],
  7: [[5, 2], [4, 3], [3, 4], [2, 5]],
};

function cornerSplits(h: number): ReadonlyArray<readonly [number, number]> {
  const printed = CORNER_SPLITS[h];
  if (printed) return printed;
  // Off the printed card: keep the fan's spirit, at most three hexes of imbalance.
  const out: (readonly [number, number])[] = [];
  for (let a = h; a >= 0; a--) if (Math.abs(a - (h - a)) <= 3) out.push([a, h - a]);
  return out;
}

/**
 * Ways to split `h` hexes of horizontal thrust for a facing with azimuth index `azIndex`
 * (0 = A … 11 = F/A; null for the purple ring, where any direction may take the offset).
 */
export function horizontalSplits(h: number, azIndex: number | null, ring: Ring): HorizontalSplit[] {
  if (h === 0) return [{}];
  if (azIndex === null) return MAP_DIRECTIONS.map((d) => ({ [d]: h }));
  if (azIndex % 2 === 0) {
    const d = directionAt(azIndex / 2);
    const next = directionAt(azIndex / 2 + 1);
    const prev = directionAt(azIndex / 2 - 1);
    const out: HorizontalSplit[] = [{ [d]: h }];
    if (h >= 2) out.push({ [d]: h - 1, [next]: 1 }, { [d]: h - 1, [prev]: 1 });
    if (ring === 'green' && (h === 4 || h === 5)) out.push({ [d]: h - 2, [next]: 2 }, { [d]: h - 2, [prev]: 2 });
    return out;
  }
  const d1 = directionAt((azIndex - 1) / 2);
  const d2 = directionAt((azIndex + 1) / 2);
  return cornerSplits(h).map(([a, b]) => {
    const s: Partial<Record<MapDirection, number>> = {};
    if (a) s[d1] = a;
    if (b) s[d2] = b;
    return s;
  });
}

export interface ThrustPlot {
  readonly thrust: number;
  readonly h: number;
  readonly v: number;
  /** The vector change written into the grey areas of the AVID arrows. */
  readonly delta: Velocity;
}

/** Every legal vector change for thrusting exactly `thrust` along `facing`. */
export function thrustOptions(thrust: number, facing: AvidWindow): ThrustPlot[] {
  const hemi: Hemisphere | null = facing.ring === 'yellow' ? null : facing.hemi;
  const az: number | null = facing.ring === 'purple' ? null : facing.az;
  const seen = new Set<string>();
  const out: ThrustPlot[] = [];
  for (const { h, v } of verticalOptions(thrust, facing.ring, hemi)) {
    for (const split of horizontalSplits(h, az, facing.ring)) {
      const delta = velocity({ ...split, '+': v > 0 ? v : 0, '-': v < 0 ? -v : 0 });
      const key = JSON.stringify(delta);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ thrust, h, v, delta });
    }
  }
  return out;
}

/** Every legal vector change for thrusting anything from 0 up to `maxThrust` along `facing`. */
export function allThrustOptions(maxThrust: number, facing: AvidWindow): ThrustPlot[] {
  const out: ThrustPlot[] = [];
  for (let t = 0; t <= maxThrust; t++) out.push(...thrustOptions(t, facing));
  return out;
}
