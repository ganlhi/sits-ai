/**
 * Facts derived from game state for a step of the turn: where the markers go, what each ship
 * looks like at the Midpoint and End of Turn, ranges and bearings between ships, which mounts
 * bear. Nothing here is stored; it is recomputed from the fold.
 */
import {
  ZERO_VELOCITY,
  applyManeuver,
  bearing,
  facingAfter,
  impactWindow,
  maneuverPivots,
  markers,
  mountArcColour,
  planMotion,
  wedgeCovers,
  windowDirection,
  MOUNTS,
  type ArcColour,
  type Attitude,
  type AvidWindow,
  type Bearing,
  type Markers,
  type Mount,
  type Position,
  type TurnMotion,
} from '../geometry';
import { currentValue, internalTrackId, rangeBandFor, trackSpec, type RangeBand, type SalvoTiming } from '../ssd';
import { shipClassOf, type GameState, type ShipState } from './types';

/** Current rating of a ship's internal track (pivot, roll, thrust …). */
export function rating(g: GameState, ship: ShipState, key: 'pivot' | 'roll' | 'maxThrust' | 'ecm'): number {
  const cls = shipClassOf(g, ship);
  const id = internalTrackId(key);
  const v = currentValue(trackSpec(cls, id), ship.damage.tracks[id] ?? { boxes: [] });
  return v ?? 0;
}

/** Helm grade adjustments to pivot and roll (D1.144). Elite's +1 is applied to roll here; the UI may let the player choose. */
export function maneuverLimits(g: GameState, ship: ShipState): { pivot: number; roll: number } {
  let pivot = rating(g, ship, 'pivot');
  let roll = rating(g, ship, 'roll');
  switch (ship.grades.HELM) {
    case 'poor':
      pivot = pivot > 0 ? Math.max(1, pivot - 1) : 0;
      roll = roll > 0 ? Math.max(1, roll - 1) : 0;
      break;
    case 'veteran':
      roll += 1;
      break;
    case 'elite':
      roll += 1;
      break;
    default:
      break;
  }
  return { pivot, roll };
}

/** Thrust available this turn: the Maximum Thrust rating, +1 for an Elite engineer (D1.145). */
export function thrustLimit(g: GameState, ship: ShipState): number {
  return rating(g, ship, 'maxThrust') + (ship.grades.ENG === 'elite' ? 1 : 0);
}

/** This turn's motion for a ship, from its committed orders (or drifting if none). */
export function shipMotion(ship: ShipState): TurnMotion {
  return planMotion(
    { position: ship.position, velocity: ship.velocity, halfDisplacements: ship.halfDisplacements },
    ship.orders?.thrust ?? ZERO_VELOCITY,
    ship.orders ? maneuverPivots(ship.orders.maneuver) : false,
    ship.grades.ENG,
  );
}

/** The ship's attitude at the start (0), Midpoint (0.5) or End of Turn (1). */
export function attitudeAt(ship: ShipState, fraction: 0 | 0.5 | 1): Attitude {
  return ship.orders ? applyManeuver(ship.attitude, ship.orders.maneuver, fraction) : ship.attitude;
}

export function markersAt(ship: ShipState, fraction: 0 | 0.5 | 1): Markers {
  return markers(attitudeAt(ship, fraction));
}

/** The facing the ship thrusts along: its Midpoint orientation (B3.2). */
export function thrustFacing(ship: ShipState, maneuver = ship.orders?.maneuver ?? {}): AvidWindow {
  return facingAfter(ship.attitude, maneuver, 0.5);
}

export interface SalvoGeometry {
  readonly timing: SalvoTiming;
  readonly available: boolean;
  readonly bearing: Bearing;
  readonly impact: AvidWindow | null;
}

export interface Engagement {
  readonly shooter: ShipState;
  readonly target: ShipState;
  /** Range between End-of-Turn markers, which sets the number of salvoes (C2.12). */
  readonly eotRange: number;
  readonly band: RangeBand | null;
  readonly salvoes: readonly SalvoGeometry[];
  /** Range and bearing now, for beams (C3.1). */
  readonly now: Bearing;
  /** How each of the shooter's mounts sees the target right now. */
  readonly arcs: Readonly<Record<Mount, ArcColour>>;
  /** Whether the target's wedge is towards the shooter right now. */
  readonly targetWedge: boolean;
}

/**
 * The launch geometry of the Reference Card (step 3): salvoes by EoT-to-EoT range; Early from
 * current to current, Middle from current to target's Midpoint, Late from own Midpoint to the
 * target's EoT.
 */
export function engagement(g: GameState, shooter: ShipState, target: ShipState): Engagement {
  const cls = shipClassOf(g, shooter);
  const sm = shipMotion(shooter);
  const tm = shipMotion(target);
  const eotRange = bearing(sm.endOfTurn, tm.endOfTurn).range;
  const band = rangeBandFor(cls, eotRange);
  const geometry = (timing: SalvoTiming, from: Position, to: Position): SalvoGeometry => {
    const b = bearing(from, to);
    return { timing, available: band?.salvoes.includes(timing) ?? false, bearing: b, impact: impactWindow(b) };
  };
  const salvoes = [geometry('early', shooter.position, target.position), geometry('middle', shooter.position, tm.midpoint), geometry('late', sm.midpoint, tm.endOfTurn)];
  const now = bearing(shooter.position, target.position);
  const dir = now.window ? windowDirection(now.window) : null;
  const arcs = Object.fromEntries(
    MOUNTS.map((m) => [m, dir ? mountArcColour({ forward: cls.mounts.forward.arc, aft: cls.mounts.aft.arc, port: cls.mounts.port.arc, starboard: cls.mounts.starboard.arc }, m, shooter.attitude, dir) : 'black']),
  ) as Record<Mount, ArcColour>;
  const targetDir = now.window ? windowDirection(impactWindow(now)!) : null;
  const targetWedge = targetDir ? wedgeCovers(target.attitude, targetDir) : false;
  return { shooter, target, eotRange, band, salvoes, now, arcs, targetWedge };
}

/** Every shooter → enemy pairing among live ships. */
export function engagements(g: GameState): Engagement[] {
  const live = g.shipOrder.map((id) => g.ships[id]!).filter((s) => s && !s.destroyed);
  const out: Engagement[] = [];
  for (const a of live) for (const b of live) if (a.side !== b.side) out.push(engagement(g, a, b));
  return out;
}
