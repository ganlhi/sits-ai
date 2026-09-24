/**
 * Ship attitude: the six orientation markers, pivots and rolls (RULES.md §5.2, §6).
 *
 * Internally an attitude is an orthonormal frame (Forward, Top). The six markers are derived
 * from it and quantised to AVID windows for display and for the rules that count windows.
 * A pivot is the minimal rotation carrying Forward onto a target window; a roll is a rotation
 * about Forward. Both are measured in windows of 30°, and half of each is applied at the
 * Midpoint marker (RULES.md §3 step 5, §6).
 *
 * Modelling the attitude continuously rather than as marker windows reproduces the book's
 * worked examples (Annex Z1.0), including the "Top on the spine of the green ring" case.
 */
import { directionToWindow, windowDirection, type AvidWindow } from './avid';
import { NORTH, UP, angleBetween, approxEqual, cross, normalize, orthogonalTo, rotateAbout, scale, type Vec3 } from './vec3';

export interface Attitude {
  /** Unit vector the bow points along. */
  readonly forward: Vec3;
  /** Unit vector out of the top of the hull, orthogonal to `forward`. */
  readonly top: Vec3;
}

/** Build an attitude, orthonormalising `top` against `forward`. */
export function attitude(forward: Vec3, top: Vec3): Attitude {
  const f = normalize(forward);
  const t = orthogonalTo(top, f);
  return { forward: f, top: normalize(t) };
}

/** Level with the map, bow towards A, top up. */
export const LEVEL_ATTITUDE: Attitude = attitude(NORTH, UP);

export function attitudeFromWindows(forward: AvidWindow, top: AvidWindow): Attitude {
  return attitude(windowDirection(forward), windowDirection(top));
}

export const starboardOf = (a: Attitude): Vec3 => cross(a.forward, a.top);
export const portOf = (a: Attitude): Vec3 => scale(starboardOf(a), -1);
export const aftOf = (a: Attitude): Vec3 => scale(a.forward, -1);
export const bottomOf = (a: Attitude): Vec3 => scale(a.top, -1);

export type MarkerName = 'forward' | 'aft' | 'port' | 'starboard' | 'top' | 'bottom';
export const MARKER_NAMES: readonly MarkerName[] = ['forward', 'aft', 'port', 'starboard', 'top', 'bottom'];

export type Markers = Readonly<Record<MarkerName, AvidWindow>>;

export function markerDirection(a: Attitude, m: MarkerName): Vec3 {
  switch (m) {
    case 'forward':
      return a.forward;
    case 'aft':
      return aftOf(a);
    case 'port':
      return portOf(a);
    case 'starboard':
      return starboardOf(a);
    case 'top':
      return a.top;
    case 'bottom':
      return bottomOf(a);
  }
}

/** The six orientation markers as AVID windows. */
export function markers(a: Attitude): Markers {
  return {
    forward: directionToWindow(a.forward),
    aft: directionToWindow(aftOf(a)),
    port: directionToWindow(portOf(a)),
    starboard: directionToWindow(starboardOf(a)),
    top: directionToWindow(a.top),
    bottom: directionToWindow(bottomOf(a)),
  };
}

export function rotateAttitude(a: Attitude, axis: Vec3, deg: number): Attitude {
  return { forward: rotateAbout(a.forward, axis, deg), top: rotateAbout(a.top, axis, deg) };
}

export type RollDirection = 'port' | 'starboard';

/**
 * Roll `windows` × 30° about Forward. Rolling to starboard drops the starboard side and lifts
 * Port — the book's "nose down 30°, rolled 30° to starboard" example has Port rise to the blue
 * ring and Starboard drop.
 */
export function roll(a: Attitude, windows: number, direction: RollDirection): Attitude {
  const sign = direction === 'starboard' ? 1 : -1;
  return rotateAttitude(a, a.forward, sign * windows * 30);
}

/**
 * Pivot so that Forward points at `target`, by the minimal rotation (the arc drawn on the
 * AVID). `fraction` 0.5 gives the Midpoint attitude. A pivot straight to the reciprocal window
 * is done over the top.
 */
export function pivotTowards(a: Attitude, target: AvidWindow, fraction = 1): Attitude {
  return pivotToDirection(a, windowDirection(target), fraction);
}

/** Pivot so that Forward points along unit vector `t`, by the minimal rotation; no roll about Forward. */
export function pivotToDirection(a: Attitude, t: Vec3, fraction = 1): Attitude {
  const angle = angleBetween(a.forward, t);
  if (angle < 1e-9) return a;
  const axisRaw = angle > 180 - 1e-6 ? a.top : cross(a.forward, t);
  if (approxEqual(axisRaw, { x: 0, y: 0, z: 0 }, 1e-9)) return rotateAttitude(a, a.top, angle * fraction);
  return rotateAttitude(a, normalize(axisRaw), angle * fraction);
}

// Maneuvers (a pivot path on the card and a roll) live in maneuver.ts, on top of the trace in maneuverTrace.ts.
