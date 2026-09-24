/**
 * A ship's maneuver for the turn, as the AI plots it and the player executes it: the path
 * Forward walks on the AVID card and a roll about Forward. One model for the whole app — the
 * planner, the order sheet, the turn rollover and the AVID helper all read a maneuver through
 * traceManeuver, so the Midpoint and End of Turn markers the AI announces are the ones the
 * helper would give for the same plan.
 */
import { attitudeFromWindows, markers, type Attitude, type RollDirection } from './attitude';
import { type AvidWindow } from './avid';
import { traceManeuver, type ManeuverTrace, type TraceStep } from './maneuverTrace';

export interface Maneuver {
  /** The windows Forward passes through after its current one, in order; omit or empty for no pivot. */
  readonly pivotPath?: readonly AvidWindow[];
  readonly roll?: { readonly windows: number; readonly direction: RollDirection };
}

export const NO_MANEUVER: Maneuver = {};

export const maneuverPivots = (m: Maneuver): boolean => (m.pivotPath?.length ?? 0) > 0;

/** Windows of pivot the maneuver costs against the pivot rating. */
export const pivotWindows = (m: Maneuver): number => m.pivotPath?.length ?? 0;

export const maneuverTrace = (a: Attitude, m: Maneuver): ManeuverTrace => traceManeuver(a, m.pivotPath ?? null, m.roll ?? null);

/** The attitude as the markers are set on the card: the step's Forward window and the best-fitting Top. */
export function settledAttitude(step: TraceStep): Attitude {
  const top = step.top[0]?.window ?? markers(step.exact).top;
  return attitudeFromWindows(step.forward, top);
}

/**
 * The attitude after the maneuver, as set on the card: `fraction` 0.5 gives the Midpoint (half
 * the pivot and half the roll, rounded down), anything else the End of Turn.
 */
export function applyManeuver(a: Attitude, m: Maneuver, fraction = 1): Attitude {
  const t = maneuverTrace(a, m);
  return settledAttitude(fraction === 0.5 ? t.midpoint : t.endOfTurn);
}

/** The Forward window after the maneuver — at the Midpoint (0.5), the ship's facing for the thrust plot. */
export function facingAfter(a: Attitude, m: Maneuver, fraction = 1): AvidWindow {
  const t = maneuverTrace(a, m);
  return (fraction === 0.5 ? t.midpoint : t.endOfTurn).forward;
}
