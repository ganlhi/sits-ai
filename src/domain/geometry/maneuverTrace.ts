/**
 * Tracing a maneuver on the AVID for the player: given the attitude now, the path Forward walks
 * on the card and how far the ship rolls, which windows may hold the Top marker at the Midpoint
 * and at End of Turn (RULES.md §5.2, §6).
 *
 * A pivot is a walk from window to touching window, detours allowed, one diagonal step at most
 * (see avidGraph.ts); its cost is the number of steps. Half of it and half of the roll, rounded
 * down, are done at the Midpoint. The attitude is rotated exactly along the path — the minimal
 * rotation carrying Forward from each window centre to the next, the roll a rotation about
 * Forward — and the Top marker is then read back onto the card: the windows three from the
 * Forward window the path names, nearest the exact Top direction first. When that direction
 * falls between two windows both are offered; a Top on the spine between two green windows
 * (B2.143) is called out.
 */
import { type Attitude, attitudeFromWindows, markers, pivotTowards, roll, type Markers, type RollDirection } from './attitude';
import { directionToWindow, green, reciprocalWindow, windowDirection, windowsAtDistance, type AvidWindow } from './avid';
import { pathProblems } from './avidGraph';
import { angleBetween, azimuthDeg } from './vec3';

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
  /** Windows of pivot the path costs. */
  readonly pivotWindows: number;
  /** Windows of pivot done at the Midpoint and at End of Turn. */
  readonly pivotSplit: readonly [number, number];
  /** Windows of roll done at the Midpoint and at End of Turn. */
  readonly rollSplit: readonly [number, number];
  readonly midpoint: TraceStep;
  readonly endOfTurn: TraceStep;
  /** Steps the card does not allow; the trace is still computed. */
  readonly warnings: readonly string[];
}

/** A Top within this many degrees of a window's centre may be placed there: a window is 30° wide, so anything near the edge fits two. */
export const TOP_TOLERANCE_DEG = 20;

/** Half of a maneuver, rounded down: what is done at the Midpoint, and what remains for End of Turn. */
export const halves = (windows: number): [number, number] => [Math.floor(windows / 2), windows - Math.floor(windows / 2)];

/**
 * The Top placements for a Forward window and an exact Top direction. Port and Starboard follow
 * from the frame Forward and that Top make; Top and Bottom are the window chosen and its
 * reciprocal, since a window three from Forward need not be exactly 90° away and the frame's
 * own Top could quantise a window over.
 */
export function topCandidates(forward: AvidWindow, exact: Attitude): TopCandidate[] {
  const all = windowsAtDistance(forward, 3)
    .map((w) => ({ window: w, offsetDeg: angleBetween(windowDirection(w), exact.top), markers: { ...markers(attitudeFromWindows(forward, w)), forward, top: w, bottom: reciprocalWindow(w) } }))
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

/**
 * Trace a plan. `path` is the windows Forward walks through after its current one, in order;
 * empty or null for no pivot.
 */
export function traceManeuver(start: Attitude, path: readonly AvidWindow[] | null, rollPlan: RollPlan | null): ManeuverTrace {
  const m0 = markers(start);
  const steps = path ?? [];
  const r = rollPlan && rollPlan.windows > 0 ? rollPlan : null;
  const pivotSplit = halves(steps.length);
  const rollSplit = halves(r ? r.windows : 0);
  const warnings = pathProblems(m0.forward, steps);

  let att = start;
  for (const w of steps.slice(0, pivotSplit[0])) att = pivotTowards(att, w, 1);
  if (r && rollSplit[0] > 0) att = roll(att, rollSplit[0], r.direction);
  const midpoint = step(steps[pivotSplit[0] - 1] ?? m0.forward, att);

  for (const w of steps.slice(pivotSplit[0])) att = pivotTowards(att, w, 1);
  if (r && rollSplit[1] > 0) att = roll(att, rollSplit[1], r.direction);
  const endOfTurn = step(steps.at(-1) ?? m0.forward, att);

  return { pivotWindows: steps.length, pivotSplit, rollSplit, midpoint, endOfTurn, warnings };
}
