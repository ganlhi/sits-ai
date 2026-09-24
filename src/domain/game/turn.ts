/**
 * Changing a game: the player's reports, adding and removing ships, shifting the table, the
 * steps of the turn and the rollover that moves the AI ships. Every function returns a new game.
 *
 * A turn runs report → AI plotting (plotted) → AI shooting (fired) → next turn. Each step keeps
 * the state before it in the history, so Undo walks back one step at a time.
 */
import { ZERO_VELOCITY, applyManeuver, cubeAdd, maneuverPivots, planMotion, positionPlus, type Cube, type Position, type TurnMotion } from '../geometry';
import { isOutOfAction, type Game, type Ship, type ShipId, type Snapshot } from './types';

/** Three steps a turn: about thirty turns back. */
const HISTORY_LIMIT = 90;

/**
 * This turn's motion: the plotted orders for an AI ship; drifting for everyone else, with the
 * EoT marker where the player reported it when thrust displaced it.
 */
export function shipMotion(ship: Ship): TurnMotion {
  const state = { position: ship.position, velocity: ship.velocity, halfDisplacements: ship.halfDisplacements };
  if (ship.orders) return planMotion(state, ship.orders.thrust, maneuverPivots(ship.orders.maneuver));
  const drift = planMotion(state, ZERO_VELOCITY, false);
  return ship.displacedEot ? { ...drift, endOfTurn: ship.displacedEot } : drift;
}

export const snapshot = (g: Game): Snapshot => ({ turn: g.turn, phase: g.phase, ships: g.ships });

/** Keep the current state in the history before a step changes it. */
export const withHistory = (g: Game): Game => ({ ...g, history: [...g.history, snapshot(g)].slice(-HISTORY_LIMIT) });

/** Any change to what the table shows at the start of the turn makes the plot stale: back to the report. */
export function invalidateOrders(g: Game): Game {
  if (g.phase === 'report' && g.ships.every((s) => s.orders === null && s.displacedEot === null)) return g;
  return { ...g, phase: 'report', ships: g.ships.map((s) => (s.orders || s.displacedEot ? { ...s, orders: null, displacedEot: null } : s)) };
}

export type ShipReport = Partial<Pick<Ship, 'name' | 'position' | 'velocity' | 'attitude' | 'bda' | 'outOfAction' | 'ratings' | 'effectiveness' | 'doctrine' | 'controller'>>;

/** The player corrects a ship to what is actually on the table. */
export function reportShip(g: Game, id: ShipId, report: ShipReport): Game {
  if (!g.ships.some((s) => s.id === id)) return g;
  return invalidateOrders({ ...g, ships: g.ships.map((s) => (s.id === id ? { ...s, ...report } : s)) });
}

/**
 * After the AI has plotted, the player says where a ship of theirs put its EoT marker: null when
 * it was not displaced. Only in the plotted phase, and only for ships the AI does not plot.
 */
export function reportDisplacement(g: Game, id: ShipId, eot: Position | null): Game {
  if (g.phase !== 'plotted') return g;
  return { ...g, ships: g.ships.map((s) => (s.id === id && !s.orders ? { ...s, displacedEot: eot } : s)) };
}

export function addShip(g: Game, ship: Ship): Game {
  return invalidateOrders({ ...g, ships: [...g.ships, ship] });
}

export function removeShip(g: Game, id: ShipId): Game {
  return invalidateOrders({ ...g, ships: g.ships.filter((s) => s.id !== id) });
}

/** Slide every ship by the same offset. Ranges and bearings do not change, so orders stay valid. */
export function shiftTable(g: Game, offset: Cube, alt: number): Game {
  const move = (p: Position): Position => ({ hex: cubeAdd(p.hex, offset), alt: p.alt + alt });
  return { ...g, ships: g.ships.map((s) => ({ ...s, position: move(s.position), displacedEot: s.displacedEot && move(s.displacedEot) })) };
}

/**
 * End the turn. AI ships with orders move to their End-of-Turn marker, finish their pivot and
 * roll, and add their thrust to their vectors. Everyone else moves to their EoT marker (drifted,
 * or displaced as reported) as a first guess for the player to correct.
 */
export function nextTurn(g: Game): Game {
  const ships = g.ships.map((s): Ship => {
    if (s.controller === 'ai' && s.orders && !isOutOfAction(s)) {
      const m = shipMotion(s);
      return { ...s, position: m.endOfTurn, velocity: m.newVelocity, halfDisplacements: m.carriedHalves, attitude: applyManeuver(s.attitude, s.orders.maneuver, 1), orders: null, displacedEot: null };
    }
    return { ...s, position: s.displacedEot ?? positionPlus(s.position, s.velocity), orders: null, displacedEot: null };
  });
  return { ...withHistory(g), turn: g.turn + 1, phase: 'report', ships };
}

/** Back one step: before the last AI plotting, AI shooting or next turn. */
export function undoStep(g: Game): Game | null {
  const last = g.history.at(-1);
  if (!last) return null;
  return { ...g, turn: last.turn, phase: last.phase, ships: last.ships, history: g.history.slice(0, -1) };
}
