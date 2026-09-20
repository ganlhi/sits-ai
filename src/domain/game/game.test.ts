import { describe, expect, it } from 'vitest';
import { CUBE_ORIGIN, DIRECTION_CUBE, LEVEL_ATTITUDE, cubeScale, markers, position, velocity, windowLabel } from '../geometry';
import { power, salvoPower } from './power';
import { BUILT_IN_CLASSES, bandFor, missileReach, ratingsOf, validateShipClass, type ShipClass } from './shipClass';
import { addShip, nextTurn, removeShip, reportShip, shiftTable, undoTurn } from './turn';
import { FULL_EFFECTIVENESS, liveShips, type Game, type Ship } from './types';

const SULTAN = BUILT_IN_CLASSES[0]!;
const WARRIOR = BUILT_IN_CLASSES[1]!;

const ship = (id: string, extra: Partial<Ship> = {}): Ship => ({
  id,
  name: id.toUpperCase(),
  side: 'red',
  controller: 'player',
  doctrine: 'balanced',
  shipClass: SULTAN,
  ratings: ratingsOf(SULTAN),
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

describe('ship classes', () => {
  it('built-ins validate and read their bands', () => {
    for (const c of BUILT_IN_CLASSES) expect(validateShipClass(c), c.name).toEqual([]);
    expect(bandFor(SULTAN, 0)).toBe('short');
    expect(bandFor(SULTAN, 6)).toBe('short');
    expect(bandFor(SULTAN, 7)).toBe('medium');
    expect(bandFor(SULTAN, 19)).toBe('long');
    expect(bandFor(SULTAN, 29)).toBeNull();
    expect(missileReach(WARRIOR)).toBe(29);
    expect(ratingsOf(WARRIOR)).toEqual({ thrust: 3, pivot: 5, roll: 5 });
  });

  it('rejects nonsense classes with readable messages', () => {
    const bad: ShipClass = { ...SULTAN, name: ' ', baseCost: 0, maxPivot: -1, bands: { short: { min: 0, max: 8 }, medium: { min: 7, max: 5 }, long: { min: 19, max: 28 } } };
    const errors = validateShipClass(bad);
    expect(errors).toContain('a name is required');
    expect(errors).toContain('base cost must be a positive number');
    expect(errors.some((e) => e.includes('pivot'))).toBe(true);
    expect(errors.some((e) => e.includes('overlap'))).toBe(true);
    expect(errors.some((e) => e.includes('from must not exceed to'))).toBe(true);
  });

  it('firepower follows cost and facing effectiveness', () => {
    const s = ship('s');
    expect(power(s)).toBeCloseTo(2.23);
    expect(salvoPower(s, 'port')).toBeGreaterThan(salvoPower(s, 'forward'));
    expect(salvoPower({ ...s, effectiveness: { ...FULL_EFFECTIVENESS, port: 50 } }, 'port')).toBeCloseTo(salvoPower(s, 'port') / 2);
    expect(salvoPower({ ...s, effectiveness: { ...FULL_EFFECTIVENESS, port: 0 } }, 'port')).toBe(0);
  });
});

describe('turn rollover', () => {
  const ai = ship('a', {
    controller: 'ai',
    velocity: velocity({ A: 2 }),
    orders: { maneuver: { roll: { windows: 2, direction: 'starboard' } }, thrust: velocity({ B: 2 }), thrustUsed: 2, launches: [], rationale: '' },
  });
  const player = ship('p', { side: 'green', shipClass: WARRIOR, ratings: ratingsOf(WARRIOR), position: position(cubeScale(DIRECTION_CUBE.A, 10), 1), velocity: velocity({ D: 1, '+': 1 }) });
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
    const r = reportShip(g, 'p', { bda: 'light', ratings: { thrust: 2, pivot: 4, roll: 4 } });
    expect(r.revealed).toBe(false);
    expect(r.ships[0]!.orders).toBeNull();
    expect(r.ships[1]!.bda).toBe('light');
    expect(r.ships[1]!.ratings.thrust).toBe(2);
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
    const g2 = addShip(game([]), ship('x'));
    expect(g2.ships).toHaveLength(1);
    expect(removeShip(g2, 'x').ships).toHaveLength(0);
  });
});
