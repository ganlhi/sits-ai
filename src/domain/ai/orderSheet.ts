/**
 * The order sheet: an AI ship's plot in the book's notation, with everything the player needs
 * to execute it on the table — where the markers go, the attitude to set at the Midpoint and
 * at End of Turn, and the salvo card entries for each launch.
 */
import { applyManeuver, bearing, facingAfter, formatVelocity, impactWindow, markers, pivotCost, velocityIsZero, windowLabel, type Markers, type Position } from '../geometry';
import { BAND_LABELS, MOUNT_NAMES, bandFor, formatPosition, shipById, shipMotion, type Game, type SalvoTiming, type Ship } from '../game';
import { driftMotion } from './evaluate';

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
  readonly attitudeAtMidpoint: Markers;
  readonly attitudeAtEot: Markers;
  readonly launches: readonly LaunchSheet[];
  readonly rationale: string;
}

export const TIMING_LABEL: Readonly<Record<SalvoTiming, string>> = { early: 'Early', middle: 'Middle', late: 'Late' };

export function orderSheet(game: Game, ship: Ship): OrderSheet | null {
  const orders = ship.orders;
  if (!orders) return null;
  const m0 = markers(ship.attitude);
  const maneuver: string[] = [];
  if (orders.maneuver.pivotTo) {
    const cost = pivotCost(ship.attitude, orders.maneuver.pivotTo);
    maneuver.push(`Pivot ${cost} window${cost === 1 ? '' : 's'}: Forward from ${windowLabel(m0.forward)} to ${windowLabel(orders.maneuver.pivotTo)}.`);
  } else {
    maneuver.push(`No pivot: Forward stays ${windowLabel(m0.forward)}.`);
  }
  if (orders.maneuver.roll) maneuver.push(`Roll ${orders.maneuver.roll.windows} window${orders.maneuver.roll.windows === 1 ? '' : 's'} to ${orders.maneuver.roll.direction}.`);
  else maneuver.push('No roll.');
  const facing = facingAfter(ship.attitude, orders.maneuver, 0.5);
  maneuver.push(orders.thrustUsed === 0 ? 'No thrust.' : `Thrust ${orders.thrustUsed} along the Midpoint facing ${windowLabel(facing)}: write ${formatVelocity(orders.thrust)} into the AVID arrows.`);

  const motion = shipMotion(ship);
  const launches: LaunchSheet[] = orders.launches.map((l) => {
    const target = shipById(game, l.targetId);
    if (!target) return { mountName: MOUNT_NAMES[l.mount], targetName: l.targetId, salvoes: [] };
    const tm = driftMotion(target);
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
    attitudeAtMidpoint: markers(applyManeuver(ship.attitude, orders.maneuver, 0.5)),
    attitudeAtEot: markers(applyManeuver(ship.attitude, orders.maneuver, 1)),
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
