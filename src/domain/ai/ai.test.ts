import { describe, expect, it } from 'vitest';
import { HAVOC_DD, SULTAN_BC, WARRIOR_CA } from '../../data/ships';
import { CUBE_ORIGIN, DIRECTION_CUBE, LEVEL_ATTITUDE, attitudeFromWindows, cubeScale, facingAfter, pivotCost, position, purple, thrustOptions, velocity, windowDirection, yellow, type AvidWindow } from '../geometry';
import { FULL_EFFECTIVENESS, maneuverRatings, missileBattery, shipClassOf, type Game, type Ship } from '../game';
import { ecmSurvival, impactFacing } from './evaluate';
import { orderSheet, orderSheetText } from './orderSheet';
import { generateCandidates, planAll, planOrders } from './plan';

const ship = (id: string, extra: Partial<Ship> = {}): Ship => ({
  id,
  name: id.toUpperCase(),
  classId: SULTAN_BC.id,
  side: 'red',
  controller: 'ai',
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

/** Sultan (AI, red) at the centre facing A; a Warrior (player, green) 8 hexes off in B, closing. */
const duel = game([
  ship('red', { velocity: velocity({ A: 1 }) }),
  ship('green', {
    classId: WARRIOR_CA.id,
    side: 'green',
    controller: 'player',
    position: position(cubeScale(DIRECTION_CUBE.B, 8), 1),
    velocity: velocity({ E: 2 }),
    attitude: attitudeFromWindows(yellow(8), purple('upper')),
  }),
]);

const legal = (g: Game, s: Ship): void => {
  const o = s.orders!;
  const cls = shipClassOf(s);
  const limits = maneuverRatings(cls, s.bda);
  if (o.maneuver.pivotTo) expect(pivotCost(s.attitude, o.maneuver.pivotTo)).toBeLessThanOrEqual(limits.pivot);
  if (o.maneuver.roll) expect(o.maneuver.roll.windows).toBeLessThanOrEqual(limits.roll);
  expect(o.thrustUsed).toBeLessThanOrEqual(limits.thrust);
  const facing: AvidWindow = facingAfter(s.attitude, o.maneuver, 0.5);
  expect(thrustOptions(o.thrustUsed, facing).some((p) => JSON.stringify(p.delta) === JSON.stringify(o.thrust))).toBe(true);
  for (const l of o.launches) {
    const b = missileBattery(cls, l.mount, s.effectiveness)!;
    expect(b).not.toBeNull();
    expect(l.missiles).toBe(b.tubes);
    expect(l.timings.length).toBeGreaterThan(0);
    expect(g.ships.some((t) => t.id === l.targetId && t.side !== s.side)).toBe(true);
  }
};

describe('evaluator pieces', () => {
  it('ECM survival falls with the column and the wedge shift is brutal', () => {
    expect(ecmSurvival(1)).toBe(1);
    expect(ecmSurvival(25)).toBeCloseTo(0.16, 5);
    expect(ecmSurvival(12 + 8)).toBeLessThan(ecmSurvival(8));
  });

  it('a hit from dead ahead lands on the forward facing; from the beam on the side', () => {
    expect(impactFacing(LEVEL_ATTITUDE, windowDirection(yellow(0)))).toBe('forward');
    expect(impactFacing(LEVEL_ATTITUDE, windowDirection(yellow(3)))).toBe('starboard');
    expect(impactFacing(LEVEL_ATTITUDE, windowDirection(yellow(9)))).toBe('port');
    expect(impactFacing(LEVEL_ATTITUDE, windowDirection(yellow(6)))).toBe('aft');
  });

  it('candidate generation respects the ratings and shrinks with damage', () => {
    const fresh = generateCandidates(ship('a'), 100000);
    const heavy = generateCandidates(ship('a', { bda: 'heavy' }), 100000);
    expect(fresh.length).toBeGreaterThan(heavy.length);
    expect(fresh.every((c) => c.thrustUsed <= 3)).toBe(true);
    expect(fresh.every((c) => !c.maneuver.pivotTo || pivotCost(LEVEL_ATTITUDE, c.maneuver.pivotTo) <= 3)).toBe(true);
    expect(generateCandidates(ship('a', { classId: HAVOC_DD.id }), 500).length).toBeLessThanOrEqual(500);
  });
});

describe('planning', () => {
  it('issues legal orders that launch at the enemy, and is deterministic for a seed', () => {
    const p1 = planOrders(duel, duel.ships[0]!, 42);
    const p2 = planOrders(duel, duel.ships[0]!, 42);
    expect(p1.orders).toEqual(p2.orders);
    expect(p1.candidatesConsidered).toBeGreaterThan(100);
    legal(duel, { ...duel.ships[0]!, orders: p1.orders });
    expect(p1.orders.launches.length).toBeGreaterThan(0);
    expect(p1.orders.rationale).toMatch(/balanced/);
  });

  it('launches only from mounts that bear and still have tubes', () => {
    const noBroadsides = { ...duel, ships: [{ ...duel.ships[0]!, effectiveness: { forward: 100, aft: 100, port: 0, starboard: 0 } }, duel.ships[1]!] };
    const p = planOrders(noBroadsides, noBroadsides.ships[0]!, 3);
    for (const l of p.orders.launches) expect(['forward', 'aft']).toContain(l.mount);
    const disarmed = { ...duel, ships: [{ ...duel.ships[0]!, effectiveness: { forward: 0, aft: 0, port: 0, starboard: 0 } }, duel.ships[1]!] };
    expect(planOrders(disarmed, disarmed.ships[0]!, 3).orders.launches).toEqual([]);
  });

  it('planAll plots every AI ship in action, skips crippled and player ships, and marks the turn revealed', () => {
    const g = game([...duel.ships, ship('hulk', { bda: 'crippled', position: position(cubeScale(DIRECTION_CUBE.D, 5), 0) })]);
    const r = planAll(g);
    expect(r.revealed).toBe(true);
    expect(r.ships[0]!.orders).not.toBeNull();
    expect(r.ships[1]!.orders).toBeNull();
    expect(r.ships[2]!.orders).toBeNull();
    expect(planAll(g)).toEqual(r);
    legal(r, r.ships[0]!);
  });

  it('an evader with heavy damage still plots legally with its reduced ratings', () => {
    const g = { ...duel, ships: [{ ...duel.ships[0]!, bda: 'heavy' as const, doctrine: 'evade' as const }, duel.ships[1]!] };
    const r = planAll(g);
    legal(r, r.ships[0]!);
  });

  it('the order sheet has the markers, both attitudes and a salvo line per launched salvo', () => {
    const r = planAll(duel);
    const s = orderSheet(r, r.ships[0]!)!;
    expect(s.maneuver).toHaveLength(3);
    expect(s.maneuver[0]).toMatch(/pivot/i);
    expect(s.maneuver[2]).toMatch(/thrust/i);
    for (const l of s.launches) {
      expect(l.salvoes.length).toBeGreaterThan(0);
      for (const line of l.salvoes) {
        expect(line.range).toBeGreaterThan(0);
        expect(line.impact).toMatch(/\(/);
      }
    }
    const text = orderSheetText(s, 'RED');
    expect(text).toContain('Midpoint marker at');
    expect(text).toContain('At End of Turn: Forward');
    expect(orderSheet(r, r.ships[1]!)).toBeNull();
  });
});
