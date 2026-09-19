/**
 * Range and bearing between two positions (RULES.md §9).
 *
 * Range and ring come from the RALT; the azimuth window comes from the Horizontal Bearings
 * graphic: a target three or more times as far in one map direction as in the adjacent one is
 * seen through that hex edge, otherwise through the hex corner between them.
 */
import { blue, green, purple, reciprocalWindow, yellow, type AvidWindow } from './avid';
import { decomposeCube, directionIndex } from './direction';
import { cubeSub, hexDistance, type Position } from './hex';
import { ringFor, trueRange, type Ring } from './ralt';

export interface Bearing {
  /** True range from the RALT. */
  readonly range: number;
  readonly horizontal: number;
  /** Signed altitude difference, positive when the target is above. */
  readonly vertical: number;
  readonly ring: Ring | null;
  /** The AVID window the target is seen through; null when both positions coincide. */
  readonly window: AvidWindow | null;
}

/**
 * Azimuth window index (0 = A … 11 = F/A) of a horizontal offset by the 3:1 rule.
 * Null for a zero offset.
 */
export function horizontalAzimuthIndex(dx: { x: number; y: number; z: number }): number | null {
  const d = decomposeCube(dx);
  if (!d) return null;
  if (d.na >= 3 * d.nb) return directionIndex(d.a) * 2;
  if (d.nb >= 3 * d.na) return directionIndex(d.b) * 2;
  return directionIndex(d.a) * 2 + 1;
}

/**
 * The hex-edge azimuth nearest to an offset, for rings with only edge windows. Ties go to the
 * clockwise-earlier direction, declared here so the choice is deterministic.
 */
function edgeAzimuthIndex(dx: { x: number; y: number; z: number }): number {
  const d = decomposeCube(dx);
  if (!d) return 0;
  return d.na >= d.nb ? directionIndex(d.a) * 2 : directionIndex(d.b) * 2;
}

export function bearing(from: Position, to: Position): Bearing {
  const dx = cubeSub(to.hex, from.hex);
  const horizontal = hexDistance(from.hex, to.hex);
  const vertical = to.alt - from.alt;
  const range = trueRange(horizontal, vertical);
  const ring = ringFor(horizontal, vertical);
  const hemi = vertical >= 0 ? 'upper' : 'lower';
  let window: AvidWindow | null = null;
  switch (ring) {
    case null:
      window = null;
      break;
    case 'purple':
      window = purple(hemi);
      break;
    case 'yellow': {
      const az = horizontalAzimuthIndex(dx);
      window = az === null ? null : yellow(az);
      break;
    }
    case 'blue': {
      const az = horizontalAzimuthIndex(dx);
      window = az === null ? null : blue(az, hemi);
      break;
    }
    case 'green':
      window = green(edgeAzimuthIndex(dx), hemi);
      break;
  }
  return { range, horizontal, vertical, ring, window };
}

/** The Impact Window written on the Salvo Card: the reciprocal of the bearing shot. */
export function impactWindow(b: Bearing): AvidWindow | null {
  return b.window ? reciprocalWindow(b.window) : null;
}
