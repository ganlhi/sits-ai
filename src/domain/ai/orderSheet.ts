/**
 * The order sheet: an AI ship's plot in the book's notation, with everything the player needs
 * to execute it on the table — where the markers go, the attitude to set at the Midpoint and
 * at End of Turn, and the salvo card entries for each launch.
 */
import { bearing, formatVelocity, impactWindow, maneuverTrace, markers, stepKind, velocityIsZero, windowLabel, windowsEqual, type AvidWindow, type Markers, type Position } from '../geometry';
import { BAND_LABELS, MOUNT_NAMES, bandFor, formatPosition, shipById, shipMotion, type Game, type SalvoTiming, type Ship } from '../game';

export interface SalvoLine {
  readonly timing: SalvoTiming;
  readonly range: number;
  /** The bearing shot, in the book's notation. */
  readonly bearing: string;
  /** The Impact Window written on the salvo card: the reciprocal of the bearing. */
  readonly impact: string;
  /** The launching ship's band at that range, for the MQL row of its own card. */
  readonly band: string;
}

export interface LaunchSheet {
  readonly mountName: string;
  readonly targetName: string;
  readonly salvoes: readonly SalvoLine[];
}

export interface OrderSheet {
  /** Pivot, roll and thrust, one line each. */
  readonly maneuver: readonly string[];
  readonly midpoint: Position;
  readonly endOfTurn: Position;
  /** How the EoT marker was displaced by thrust, or null when it was not. */
  readonly displacement: string | null;
  /** The markers as reported at the start of the turn, where the plot starts from. */
  readonly attitudeNow: Markers;
  readonly attitudeAtMidpoint: Markers;
  readonly attitudeAtEot: Markers;
  /** The windows Forward walks through, and how many of those steps are done at the Midpoint. */
  readonly pivotPath: readonly AvidWindow[];
  readonly pivotSplit: readonly [number, number];
  readonly launches: readonly LaunchSheet[];
  readonly rationale: string;
}

export const TIMING_LABEL: Readonly<Record<SalvoTiming, string>> = { early: 'Early', middle: 'Middle', late: 'Late' };

/** What the AI shows after plotting (step 2): its markers, and whether thrust displaced the EoT one. Nothing about pivot, roll or thrust. */
export interface DisplacementNotice {
  readonly midpoint: Position;
  readonly endOfTurn: Position;
  /** How far the EoT marker was displaced, or null when it was not. */
  readonly displacement: string | null;
}

export function displacementNotice(ship: Ship): DisplacementNotice | null {
  if (!ship.orders) return null;
  const m = shipMotion(ship);
  return { midpoint: m.midpoint, endOfTurn: m.endOfTurn, displacement: velocityIsZero(m.displacement) ? null : formatVelocity(m.displacement) };
}

export function orderSheet(game: Game, ship: Ship): OrderSheet | null {
  const orders = ship.orders;
  if (!orders) return null;
  const m0 = markers(ship.attitude);
  const trace = maneuverTrace(ship.attitude, orders.maneuver);
  const maneuver: string[] = [];
  const path = orders.maneuver.pivotPath ?? [];
  if (path.length) {
    // the path as walked on the card, a diagonal step marked, the Midpoint after half the steps rounded down
    let at = m0.forward;
    const legs = path.map((w, i) => {
      const arrow = stepKind(at, w) === 'corner' ? ' ⤢ ' : ' → ';
      at = w;
      return `${arrow}${windowLabel(w)}${i + 1 === trace.pivotSplit[0] ? ' [Midpoint]' : ''}`;
    });
    maneuver.push(`Pivot ${path.length} window${path.length === 1 ? '' : 's'}: Forward ${windowLabel(m0.forward)}${legs.join('')}.`);
  } else {
    maneuver.push(`No pivot: Forward stays ${windowLabel(m0.forward)}.`);
  }
  if (orders.maneuver.roll) {
    const r = orders.maneuver.roll;
    maneuver.push(`Roll ${r.windows} window${r.windows === 1 ? '' : 's'} to ${r.direction}: ${trace.rollSplit[0]} at the Midpoint, ${trace.rollSplit[1]} at End of Turn.`);
  } else maneuver.push('No roll.');
  const facing = trace.midpoint.forward;
  maneuver.push(orders.thrustUsed === 0 ? 'No thrust.' : `Thrust ${orders.thrustUsed} along the Midpoint facing ${windowLabel(facing)}: write ${formatVelocity(orders.thrust)} into the AVID arrows.`);

  const motion = shipMotion(ship);
  const launches: LaunchSheet[] = (orders.launches ?? []).map((l) => {
    const target = shipById(game, l.targetId);
    if (!target) return { mountName: MOUNT_NAMES[l.mount], targetName: l.targetId, salvoes: [] };
    const tm = shipMotion(target);
    const geometry = (timing: SalvoTiming, from: Position, to: Position): SalvoLine => {
      const b = bearing(from, to);
      const band = bandFor(ship.shipClass, b.range);
      return {
        timing,
        range: b.range,
        bearing: b.window ? windowLabel(b.window) : '—',
        impact: b.window ? windowLabel(impactWindow(b)!) : '—',
        band: band ? BAND_LABELS[band] : 'out of range',
      };
    };
    const all: Record<SalvoTiming, SalvoLine> = {
      early: geometry('early', ship.position, target.position),
      middle: geometry('middle', ship.position, tm.midpoint),
      late: geometry('late', motion.midpoint, tm.endOfTurn),
    };
    return { mountName: MOUNT_NAMES[l.mount], targetName: target.name, salvoes: l.timings.map((t) => all[t]) };
  });

  return {
    maneuver,
    midpoint: motion.midpoint,
    endOfTurn: motion.endOfTurn,
    displacement: velocityIsZero(motion.displacement) ? null : formatVelocity(motion.displacement),
    attitudeNow: m0,
    attitudeAtMidpoint: trace.midpoint.top[0]?.markers ?? markers(trace.midpoint.exact),
    attitudeAtEot: trace.endOfTurn.top[0]?.markers ?? markers(trace.endOfTurn.exact),
    pivotPath: path,
    pivotSplit: trace.pivotSplit,
    launches,
    rationale: orders.rationale,
  };
}

/** The sheet as plain text, for reading aloud or copying. */
export function orderSheetText(sheet: OrderSheet, shipName: string): string {
  const lines = [`${shipName}`, ...sheet.maneuver];
  lines.push(`Midpoint marker at ${formatPosition(sheet.midpoint)}; End of Turn marker at ${formatPosition(sheet.endOfTurn)}${sheet.displacement ? ` (displaced ${sheet.displacement})` : ''}.`);
  lines.push(`At the Midpoint: Forward ${windowLabel(sheet.attitudeAtMidpoint.forward)}, Top ${windowLabel(sheet.attitudeAtMidpoint.top)}.`);
  lines.push(`At End of Turn: Forward ${windowLabel(sheet.attitudeAtEot.forward)}, Top ${windowLabel(sheet.attitudeAtEot.top)}.`);
  for (const l of sheet.launches) {
    lines.push(`Launch from the ${l.mountName}, every tube, at ${l.targetName}: ${l.salvoes.map((s) => TIMING_LABEL[s.timing]).join(' + ')}.`);
    for (const s of l.salvoes) lines.push(`  ${TIMING_LABEL[s.timing]}: range ${s.range}, bearing ${s.bearing}, impact window ${s.impact}, ${s.band} band.`);
  }
  if (!sheet.launches.length) lines.push('No missile launch.');
  lines.push(sheet.rationale);
  return lines.join('\n');
}

/** A marker's journey over the turn, drawn on the card: the windows it passes, and after how many of them it pauses at the Midpoint. */
export interface MarkerPath {
  readonly windows: readonly AvidWindow[];
  readonly pauseAfter: number;
}

/**
 * The paths the Forward and Top markers take on the card: Forward along the pivot path, Top
 * from its window now to where it sits at the Midpoint and at End of Turn. A marker that does
 * not move has no path; a leg on which it stays put is dropped, the pause kept where it is.
 */
export function markerPaths(sheet: OrderSheet): { readonly forward: MarkerPath | null; readonly top: MarkerPath | null } {
  const forward = sheet.pivotPath.length ? { windows: [sheet.attitudeNow.forward, ...sheet.pivotPath], pauseAfter: sheet.pivotSplit[0] } : null;
  const stops = [sheet.attitudeNow.top, sheet.attitudeAtMidpoint.top, sheet.attitudeAtEot.top];
  const windows: AvidWindow[] = [stops[0]!];
  let pauseAfter = 0;
  stops.forEach((w, i) => {
    if (i > 0 && !windowsEqual(w, windows.at(-1)!)) windows.push(w);
    if (i === 1) pauseAfter = windows.length - 1;
  });
  return { forward, top: windows.length > 1 ? { windows, pauseAfter } : null };
}
