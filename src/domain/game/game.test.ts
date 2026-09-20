import { describe, expect, it } from 'vitest';
import { HAVOC_DD, SAMPLE_SD, SULTAN_BC } from '../../data/ships';
import { CUBE_ORIGIN, DIRECTION_CUBE, LEVEL_ATTITUDE, cubeScale, markers, position, velocity, windowLabel, yellow } from '../geometry';
import { maneuverRatings, missileBattery, pointDefense, trackValueAfterLoss } from './ratings';
import { addShip, nextTurn, removeShip, reportShip, shiftTable, undoTurn } from './turn';
import { FULL_EFFECTIVENESS, liveShips, type Game, type Ship } from './types';

const ship = (id: string, extra: Partial<Ship> = {}): Ship => ({
  id,
  name: id.toUpperCase(),
  classId: SULTAN_BC.id,
  side: 'red',
  controller: 'player',
  doctrine: 'balanced',
  position: position(CUBE_ORIGIN, 0),
  velocity: velocity({}),
  attitude: LEVEL_ATTITUDE,
  halfDisplacements: [],
  bda: 'undamaged',
  effectiveness: FULL_EFFECTIVENESS,
  orders: null,
  ...extra,
});

const game = (ships: Ship[]): Game => ({ id: 'g', name: 'Test', createdAt: '2026-09-20T00:00:00Z', updatedAt: '2026-09-20T00:00:00Z', turn: 1, revealed: false, ships, history: [] });

describe('ratings from the BDA', () => {
  it('reads each track at the depth the damage level implies', () => {
    expect(trackValueAfterLoss(SULTAN_BC.internals.pivot, 0)).toBe(3);
    expect(trackValueAfterLoss(SULTAN_BC.internals.pivot, 0.45)).toBe(2); // 6 boxes, 2 gone → third box
    expect(trackValueAfterLoss(SULTAN_BC.internals.pivot, 1)).toBe(0); // no exhausted value printed
    expect(trackValueAfterLoss(SULTAN_BC.mounts.port.fcon, 1)).toBe(2); // exhausted value after the bar
  });

  it('Sultan: undamaged 3/4/3, heavy damage loses most of it, crippled nothing', () => {
    expect(maneuverRatings(SULTAN_BC, 'undamaged')).toEqual({ pivot: 3, roll: 4, thrust: 3 });
    const heavy = maneuverRatings(SULTAN_BC, 'heavy');
    expect(heavy.pivot).toBeLessThan(3);
    expect(heavy.thrust).toBeLessThan(3);
    expect(maneuverRatings(SULTAN_BC, 'crippled')).toEqual({ pivot: 0, roll: 0, thrust: 0 });
    // Havoc's three-box pivot track loses nothing at light damage, one box at medium
    expect(maneuverRatings(HAVOC_DD, 'light')).toEqual({ pivot: 6, roll: 6, thrust: 3 });
    expect(maneuverRatings(HAVOC_DD, 'medium')).toEqual({ pivot: 4, roll: 4, thrust: 2 });
  });

  it('facing effectiveness scales tubes and probable kills', () => {
    expect(missileBattery(SULTAN_BC, 'port', FULL_EFFECTIVENESS)).toEqual({ tubes: 18, damage: 8 });
    expect(missileBattery(SULTAN_BC, 'port', { ...FULL_EFFECTIVENESS, port: 50 })?.tubes).toBe(9);
    expect(missileBattery(SULTAN_BC, 'port', { ...FULL_EFFECTIVENESS, port: 0 })).toBeNull();
    expect(pointDefense(SULTAN_BC, 'starboard', FULL_EFFECTIVENESS)).toEqual({ cm: 4, pd: 4 });
    expect(pointDefense(SULTAN_BC, 'starboard', { ...FULL_EFFECTIVENESS, starboard: 25 })).toEqual({ cm: 1, pd: 1 });
    expect(missileBattery(SAMPLE_SD, 'port', FULL_EFFECTIVENESS)?.tubes).toBeGreaterThan(0);
  });
});

describe('turn rollover', () => {
  const ai = ship('a', {
    controller: 'ai',
    velocity: velocity({ A: 2 }),
    orders: { maneuver: { roll: { windows: 2, direction: 'starboard' } }, thrust: velocity({ B: 2 }), thrustUsed: 2, launches: [], rationale: '' },
  });
  const player = ship('p', { side: 'green', position: position(cubeScale(DIRECTION_CUBE.A, 10), 1), velocity: velocity({ D: 1, '+': 1 }) });
  const g = { ...game([ai, player]), revealed: true };

  it('moves AI ships to their displaced EoT marker with new vectors and the finished roll; drifts the rest', () => {
    const n = nextTurn(g);
    expect(n.turn).toBe(2);
    expect(n.revealed).toBe(false);
    const a = n.ships[0]!;
    // 2 in A plus half of the 2 in B as displacement
    expect(a.position.hex).toEqual({ x: 1, y: 2, z: -3 });
    expect(a.velocity).toEqual(velocity({ A: 2, B: 2 }));
    expect(a.orders).toBeNull();
    expect(windowLabel(markers(a.attitude).forward)).toBe('A(yellow)');
    expect(windowLabel(markers(a.attitude).top)).not.toBe('purple(upper)');
    const p = n.ships[1]!;
    expect(p.position).toEqual(position(cubeScale(DIRECTION_CUBE.A, 9), 2));
    expect(p.velocity).toEqual(player.velocity);
  });

  it('undo restores the state before the rollover, orders included', () => {
    const n = nextTurn(g);
    expect(n.history).toHaveLength(1);
    const back = undoTurn(n)!;
    expect(back.turn).toBe(1);
    expect(back.revealed).toBe(true);
    expect(back.ships).toEqual(g.ships);
    expect(undoTurn(back)).toBeNull();
  });

  it('a report invalidates the plotted orders; a table shift does not', () => {
    const r = reportShip(g, 'p', { bda: 'light' });
    expect(r.revealed).toBe(false);
    expect(r.ships[0]!.orders).toBeNull();
    expect(r.ships[1]!.bda).toBe('light');
    const s = shiftTable(g, DIRECTION_CUBE.C, -1);
    expect(s.revealed).toBe(true);
    expect(s.ships[0]!.position).toEqual(position(DIRECTION_CUBE.C, -1));
    expect(s.ships[1]!.position.alt).toBe(0);
  });

  it('crippled ships drop out of the fight but keep drifting', () => {
    const c = reportShip(g, 'a', { bda: 'crippled' });
    expect(liveShips(c).map((s) => s.id)).toEqual(['p']);
    expect(nextTurn(c).ships[0]!.position.hex).toEqual(cubeScale(DIRECTION_CUBE.A, 2));
  });

  it('adds and removes ships', () => {
    const g2 = addShip(game([]), ship('x', { attitude: LEVEL_ATTITUDE, position: position(CUBE_ORIGIN, 0) }));
    expect(g2.ships).toHaveLength(1);
    expect(removeShip(g2, 'x').ships).toHaveLength(0);
    expect(windowLabel(markers(g2.ships[0]!.attitude).forward)).toBe(windowLabel(yellow(0)));
  });
});
