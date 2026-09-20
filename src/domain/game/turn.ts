/**
 * Changing a game: the player's reports, adding and removing ships, shifting the table, and
 * the turn rollover that moves the AI ships. Every function returns a new game.
 */
import { ZERO_VELOCITY, applyManeuver, cubeAdd, maneuverPivots, planMotion, positionPlus, type Cube, type TurnMotion } from '../geometry';
import { isOutOfAction, type Game, type Ship, type ShipId, type Snapshot } from './types';

const HISTORY_LIMIT = 30;

/** This turn's motion: the plotted orders for an AI ship, drifting for everyone else. */
export function shipMotion(ship: Ship): TurnMotion {
  const state = { position: ship.position, velocity: ship.velocity, halfDisplacements: ship.halfDisplacements };
  return ship.orders ? planMotion(state, ship.orders.thrust, maneuverPivots(ship.orders.maneuver)) : planMotion(state, ZERO_VELOCITY, false);
}

export const snapshot = (g: Game): Snapshot => ({ turn: g.turn, revealed: g.revealed, ships: g.ships });

/** Any change to what the table shows makes the plotted orders stale. */
export function invalidateOrders(g: Game): Game {
  if (!g.revealed && g.ships.every((s) => s.orders === null)) return g;
  return { ...g, revealed: false, ships: g.ships.map((s) => (s.orders ? { ...s, orders: null } : s)) };
}

export type ShipReport = Partial<Pick<Ship, 'name' | 'position' | 'velocity' | 'attitude' | 'bda' | 'ratings' | 'effectiveness' | 'doctrine' | 'controller'>>;

/** The player corrects a ship to what is actually on the table. */
export function reportShip(g: Game, id: ShipId, report: ShipReport): Game {
  if (!g.ships.some((s) => s.id === id)) return g;
  return invalidateOrders({ ...g, ships: g.ships.map((s) => (s.id === id ? { ...s, ...report } : s)) });
}

export function addShip(g: Game, ship: Ship): Game {
  return invalidateOrders({ ...g, ships: [...g.ships, ship] });
}

export function removeShip(g: Game, id: ShipId): Game {
  return invalidateOrders({ ...g, ships: g.ships.filter((s) => s.id !== id) });
}

/** Slide every ship by the same offset. Ranges and bearings do not change, so orders stay valid. */
export function shiftTable(g: Game, offset: Cube, alt: number): Game {
  return { ...g, ships: g.ships.map((s) => ({ ...s, position: { hex: cubeAdd(s.position.hex, offset), alt: s.position.alt + alt } })) };
}

/**
 * End the turn. AI ships with orders move to their End-of-Turn marker, finish their pivot and
 * roll, and add their thrust to their vectors. Everyone else is drifted along their vectors as
 * a first guess for the player to correct. The state before the rollover goes into the history.
 */
export function nextTurn(g: Game): Game {
  const ships = g.ships.map((s): Ship => {
    if (s.controller === 'ai' && s.orders && !isOutOfAction(s)) {
      const m = shipMotion(s);
      return { ...s, position: m.endOfTurn, velocity: m.newVelocity, halfDisplacements: m.carriedHalves, attitude: applyManeuver(s.attitude, s.orders.maneuver, 1), orders: null };
    }
    return { ...s, position: positionPlus(s.position, s.velocity), orders: null };
  });
  return { ...g, turn: g.turn + 1, revealed: false, ships, history: [...g.history, snapshot(g)].slice(-HISTORY_LIMIT) };
}

export function undoTurn(g: Game): Game | null {
  const last = g.history.at(-1);
  if (!last) return null;
  return { ...g, turn: last.turn, revealed: last.revealed, ships: last.ships, history: g.history.slice(0, -1) };
}
