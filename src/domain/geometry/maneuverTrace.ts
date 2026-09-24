/**
 * Tracing a maneuver on the AVID for the player: given the attitude now, where the plan puts
 * Forward at the Midpoint and at End of Turn, how many windows the pivot costs and how far the
 * ship rolls, which windows may hold the Top marker at each step (RULES.md §5.2, §6).
 *
 * A pivot is a walk on the card from window to adjacent window, detours allowed, one diagonal
 * step at most (see avidGraph.ts); the player names its cost and where it has got to at the
 * Midpoint. Half of it and half of the roll, rounded down, are done at the Midpoint. The
 * attitude is rotated exactly — the minimal rotation carrying Forward from the start to the
 * Midpoint window and on to the End of Turn window, the roll a rotation about Forward — and the
 * Top marker is then read back onto the card: the windows three from the Forward window the plan
 * names, nearest the exact Top direction first. When that direction falls between two windows
 * both are offered; a Top on the spine between two green windows (B2.143) is called out.
 */
import { type Attitude, attitudeFromWindows, markers, pivotTowards, roll, type Markers, type RollDirection } from './attitude';
import { ALL_WINDOWS, AZIMUTH_LABELS, directionToWindow, green, windowDirection, windowLabel, windowsAtDistance, type AvidWindow } from './avid';
import { pivotStepsVia } from './avidGraph';
import { angleBetween, azimuthDeg } from './vec3';

export interface PivotPlan {
  /** Windows the pivot costs: the length of the path walked on the card. */
  readonly windows: number;
  /** Where the path has got Forward to at step 5. */
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
  /** Windows of pivot the plan costs, as entered. */
  readonly pivotWindows: number;
  /** Fewest windows the path from the start through the Midpoint to End of Turn can cost, and its legs. */
  readonly shortest: { readonly total: number; readonly legs: readonly [number, number] };
  /** Windows of pivot done at the Midpoint and at End of Turn. */
  readonly pivotSplit: readonly [number, number];
  /** Windows of roll done at the Midpoint and at End of Turn. */
  readonly rollSplit: readonly [number, number];
  readonly midpoint: TraceStep;
  readonly endOfTurn: TraceStep;
  readonly warnings: readonly string[];
}

/** A Top within this many degrees of a window's centre may be placed there: a window is 30° wide, so anything near the edge fits two. */
export const TOP_TOLERANCE_DEG = 20;

/** Half of a maneuver, rounded down: what is done at the Midpoint, and what remains for End of Turn. */
export const halves = (windows: number): [number, number] => [Math.floor(windows / 2), windows - Math.floor(windows / 2)];

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

const short = (w: AvidWindow): string => (w.ring === 'purple' ? 'purple' : AZIMUTH_LABELS[w.az]!);
const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`;

/** Trace a plan: the pivot legs, the half rolls, and the Top placements at each step. */
export function traceManeuver(start: Attitude, pivot: PivotPlan | null, rollPlan: RollPlan | null): ManeuverTrace {
  const m0 = markers(start);
  const warnings: string[] = [];
  const r = rollPlan && rollPlan.windows > 0 ? rollPlan : null;

  const midForward = pivot ? pivot.midpoint : m0.forward;
  const eotForward = pivot ? pivot.endOfTurn : m0.forward;
  const pivotWindows = pivot ? pivot.windows : 0;
  const shortest = pivotStepsVia(m0.forward, midForward, eotForward);
  const pivotSplit = halves(pivotWindows);
  const rollSplit = halves(r ? r.windows : 0);

  if (pivot) {
    if (pivotWindows === 0) {
      if (shortest.total > 0) warnings.push(`A pivot of 0 windows cannot move Forward from ${short(m0.forward)} to ${short(eotForward)}.`);
      else warnings.push('Forward does not move: this is not a pivot.');
    } else {
      if (shortest.total > pivotWindows)
        warnings.push(
          `${plural(pivotWindows, 'window')} cannot take Forward from ${short(m0.forward)} through ${windowLabel(midForward)} to ${windowLabel(eotForward)}: the shortest legal path costs ${shortest.total} (${shortest.legs[0]} to the Midpoint, ${shortest.legs[1]} after it), with at most one diagonal step.`,
        );
      if (shortest.legs[0] > pivotSplit[0])
        warnings.push(`At the Midpoint ${plural(pivotSplit[0], 'window')} of the pivot ${pivotSplit[0] === 1 ? 'is' : 'are'} done, but ${windowLabel(midForward)} is at least ${shortest.legs[0]} from ${windowLabel(m0.forward)}.`);
      if (shortest.legs[1] > pivotSplit[1])
        warnings.push(`After the Midpoint ${plural(pivotSplit[1], 'window')} of the pivot remain${pivotSplit[1] === 1 ? 's' : ''}, but ${windowLabel(eotForward)} is at least ${shortest.legs[1]} from ${windowLabel(midForward)}.`);
    }
  }

  let att = pivot ? pivotTowards(start, pivot.midpoint, 1) : start;
  if (r && rollSplit[0] > 0) att = roll(att, rollSplit[0], r.direction);
  const midpoint = step(midForward, att);

  if (pivot) att = pivotTowards(att, pivot.endOfTurn, 1);
  if (r && rollSplit[1] > 0) att = roll(att, rollSplit[1], r.direction);
  const endOfTurn = step(eotForward, att);

  return { pivotWindows, shortest, pivotSplit, rollSplit, midpoint, endOfTurn, warnings };
}

/** The window the exact arc's midpoint puts Forward in. */
export function arcMidpoint(start: Attitude, endOfTurn: AvidWindow): AvidWindow {
  return markers(pivotTowards(start, endOfTurn, 0.5)).forward;
}

export interface MidpointOption {
  readonly window: AvidWindow;
  /** Fewest windows from the start to it, and from it to End of Turn. */
  readonly legs: readonly [number, number];
}

/**
 * Windows that can be the Midpoint of a pivot of `windows` from `start` to `endOfTurn`: reachable
 * in the first half, leaving the rest for the second. Those splitting the pivot most evenly
 * first, then those nearest the arc's own midpoint.
 */
export function midpointOptions(start: Attitude, endOfTurn: AvidWindow, windows: number, all: readonly AvidWindow[] = ALL_WINDOWS): MidpointOption[] {
  const from = markers(start).forward;
  const [before, after] = halves(windows);
  const arc = pivotTowards(start, endOfTurn, 0.5).forward;
  const off = (w: AvidWindow): number => angleBetween(windowDirection(w), arc);
  return all
    .map((w) => ({ window: w, legs: pivotStepsVia(from, w, endOfTurn).legs }))
    .filter(({ legs }) => legs[0] <= before && legs[1] <= after)
    .sort((x, y) => Math.abs(x.legs[0] - x.legs[1]) - Math.abs(y.legs[0] - y.legs[1]) || off(x.window) - off(y.window));
}

/**
 * The Midpoint to propose for a pivot: the evenest split the card allows for that many windows,
 * nearest the arc's midpoint; the arc's midpoint itself when the windows cannot reach the end.
 */
export function defaultPivotMidpoint(start: Attitude, endOfTurn: AvidWindow, windows?: number): AvidWindow {
  if (windows === undefined) return arcMidpoint(start, endOfTurn);
  return midpointOptions(start, endOfTurn, windows)[0]?.window ?? arcMidpoint(start, endOfTurn);
}
