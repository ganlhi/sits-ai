/**
 * Tracing a maneuver on the AVID for the player: given the attitude now, where the plan puts
 * Forward at the Midpoint and at End of Turn, and how far it rolls, which windows may hold the
 * Top marker at each step (RULES.md §5.2, §6).
 *
 * The attitude is rotated exactly — the pivot is the minimal rotation carrying Forward from one
 * window to the next, the roll a rotation about Forward, half of each at the Midpoint — and the
 * Top marker is then read back onto the card: the windows three from the Forward window the
 * plan names, nearest the exact Top direction first. When that direction falls between two
 * windows both are offered; a Top on the spine between two green windows (B2.143) is called out.
 */
import { type Attitude, attitudeFromWindows, markers, pivotTowards, roll, type Markers, type RollDirection } from './attitude';
import { AZIMUTH_LABELS, directionToWindow, green, windowDirection, windowDistance, windowsAtDistance, type AvidWindow } from './avid';
import { angleBetween, azimuthDeg } from './vec3';

export interface PivotPlan {
  /** Where the arc's midpoint puts Forward at step 5. */
  readonly midpoint: AvidWindow;
  /** Where Forward ends at step 7. */
  readonly endOfTurn: AvidWindow;
}

export interface RollPlan {
  readonly windows: number;
  readonly direction: RollDirection;
}

export interface TopCandidate {
  readonly window: AvidWindow;
  /** Degrees between the window's centre and the exact Top direction: 0 is a perfect fit, 15 a coin toss. */
  readonly offsetDeg: number;
  /** The other markers once Forward and this Top are set. */
  readonly markers: Markers;
}

export interface TraceStep {
  readonly forward: AvidWindow;
  readonly exact: Attitude;
  /** Legal placements, best fit first; every one within TOP_TOLERANCE_DEG of the exact Top is possible. */
  readonly top: readonly TopCandidate[];
  /** The two green windows the exact Top sits between, when it lies on their spine. */
  readonly spine: readonly [AvidWindow, AvidWindow] | null;
}

export interface ManeuverTrace {
  /** Windows of pivot the plan costs: the two legs added up. */
  readonly pivotWindows: number;
  /** Start to Midpoint, Midpoint to End of Turn. */
  readonly legs: readonly [number, number];
  readonly midpoint: TraceStep;
  readonly endOfTurn: TraceStep;
  readonly warnings: readonly string[];
}

/** A Top within this many degrees of a window's centre may be placed there: a window is 30° wide, so anything near the edge fits two. */
export const TOP_TOLERANCE_DEG = 20;

/** The Top placements for a Forward window and an exact Top direction. */
export function topCandidates(forward: AvidWindow, exact: Attitude): TopCandidate[] {
  const all = windowsAtDistance(forward, 3)
    .map((w) => ({ window: w, offsetDeg: angleBetween(windowDirection(w), exact.top), markers: markers(attitudeFromWindows(forward, w)) }))
    .sort((a, b) => a.offsetDeg - b.offsetDeg);
  const within = all.filter((c) => c.offsetDeg <= TOP_TOLERANCE_DEG);
  return within.length ? within : all.slice(0, 1);
}

/** When the exact Top is in the green ring and halfway between two of its windows, the spine they share. */
export function greenSpine(exact: Attitude): readonly [AvidWindow, AvidWindow] | null {
  const w = directionToWindow(exact.top);
  if (w.ring !== 'green') return null;
  const az = azimuthDeg(exact.top);
  const within = ((az % 60) + 60) % 60;
  if (Math.abs(within - 30) > 8) return null;
  const lower = Math.floor(az / 60) * 2;
  return [green(lower, w.hemi), green(lower + 2, w.hemi)];
}

function step(forward: AvidWindow, exact: Attitude): TraceStep {
  return { forward, exact, top: topCandidates(forward, exact), spine: greenSpine(exact) };
}

const label = (w: AvidWindow): string => (w.ring === 'purple' ? 'purple' : AZIMUTH_LABELS[w.az]!);

/** Trace a plan: the pivot legs, the half rolls, and the Top placements at each step. */
export function traceManeuver(start: Attitude, pivot: PivotPlan | null, rollPlan: RollPlan | null): ManeuverTrace {
  const m0 = markers(start);
  const warnings: string[] = [];
  const r = rollPlan && rollPlan.windows > 0 ? rollPlan : null;

  const midForward = pivot ? pivot.midpoint : m0.forward;
  const eotForward = pivot ? pivot.endOfTurn : m0.forward;
  const legs: [number, number] = [windowDistance(m0.forward, midForward), windowDistance(midForward, eotForward)];
  const pivotWindows = legs[0] + legs[1];

  if (pivot) {
    const direct = windowDistance(m0.forward, eotForward);
    if (pivotWindows > direct) warnings.push(`The Midpoint window is off the arc: this path costs ${pivotWindows} windows where a direct pivot from ${label(m0.forward)} to ${label(eotForward)} costs ${direct}.`);
    if (Math.abs(legs[0] - legs[1]) > 1) warnings.push(`The Midpoint window is not halfway along the pivot: ${legs[0]} window${legs[0] === 1 ? '' : 's'} before it, ${legs[1]} after.`);
    if (pivotWindows === 0) warnings.push('Forward does not move: this is not a pivot.');
  }
  if (r && r.windows % 2 === 1) warnings.push(`Half of a ${r.windows}-window roll is ${r.windows / 2} windows: at the Midpoint the Top sits between two windows, either may be used.`);

  let att = pivot ? pivotTowards(start, pivot.midpoint, 1) : start;
  if (r) att = roll(att, r.windows / 2, r.direction);
  const midpoint = step(midForward, att);

  if (pivot) att = pivotTowards(att, pivot.endOfTurn, 1);
  if (r) att = roll(att, r.windows / 2, r.direction);
  const endOfTurn = step(eotForward, att);

  return { pivotWindows, legs, midpoint, endOfTurn, warnings };
}

/** The window the exact arc's midpoint puts Forward in: the default Midpoint for a pivot plan. */
export function defaultPivotMidpoint(start: Attitude, endOfTurn: AvidWindow): AvidWindow {
  return markers(pivotTowards(start, endOfTurn, 0.5)).forward;
}
