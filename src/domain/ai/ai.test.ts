import { describe, expect, it } from 'vitest';
import { CUBE_ORIGIN, DIRECTION_CUBE, LEVEL_ATTITUDE, attitudeFromWindows, cubeScale, facingAfter, pivotCost, position, purple, thrustOptions, velocity, windowDirection, yellow } from '../geometry';
import { BUILT_IN_CLASSES, FULL_EFFECTIVENESS, ratingsOf, type Game, type Ship } from '../game';
import { effectiveWeights, goalRange, postureFor } from './doctrine';
import { impactFacing, salvoDamage } from './evaluate';
import { orderSheet, orderSheetText } from './orderSheet';
import { generateCandidates, planAll, planOrders } from './plan';

const SULTAN = BUILT_IN_CLASSES[0]!;
const WARRIOR = BUILT_IN_CLASSES[1]!;
const HAVOC = BUILT_IN_CLASSES[2]!;

const ship = (id: string, extra: Partial<Ship> = {}): Ship => ({
  id,
  name: id.toUpperCase(),
  side: 'red',
  controller: 'ai',
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

/** Sultan (AI, red) at the centre facing A; a Warrior (player, green) 8 hexes off in B, closing. */
const warrior = ship('green', {
  shipClass: WARRIOR,
  ratings: ratingsOf(WARRIOR),
  side: 'green',
  controller: 'player',
  position: position(cubeScale(DIRECTION_CUBE.B, 8), 1),
  velocity: velocity({ E: 2 }),
  attitude: attitudeFromWindows(yellow(8), purple('upper')),
});
const duel = game([ship('red', { velocity: velocity({ A: 1 }) }), warrior]);

const legal = (g: Game, s: Ship): void => {
  const o = s.orders!;
  const limits = s.ratings;
  if (o.maneuver.pivotTo) expect(pivotCost(s.attitude, o.maneuver.pivotTo)).toBeLessThanOrEqual(limits.pivot);
  if (o.maneuver.roll) expect(o.maneuver.roll.windows).toBeLessThanOrEqual(limits.roll);
  expect(o.thrustUsed).toBeLessThanOrEqual(limits.thrust);
  const facing = facingAfter(s.attitude, o.maneuver, 0.5);
  expect(thrustOptions(o.thrustUsed, facing).some((p) => JSON.stringify(p.delta) === JSON.stringify(o.thrust))).toBe(true);
  for (const l of o.launches) {
    expect(s.effectiveness[l.mount]).toBeGreaterThan(0);
    expect(l.timings.length).toBeGreaterThan(0);
    expect(g.ships.some((t) => t.id === l.targetId && t.side !== s.side)).toBe(true);
  }
};

describe('posture', () => {
  it('a fresh battlecruiser presses a cruiser; the cruiser is cautious; hurt, it turns defensive', () => {
    const sultan = ship('s');
    const w = { ...warrior, side: 'green' as const };
    expect(postureFor(sultan, [w])).toBe('aggressive');
    expect(postureFor(w, [sultan])).toBe('cautious');
    expect(postureFor({ ...w, bda: 'heavy' }, [sultan])).toBe('defensive');
    expect(postureFor({ ...sultan, bda: 'heavy' }, [{ ...w, bda: 'undamaged' }])).toBe('defensive');
    expect(postureFor({ ...sultan, bda: 'medium' }, [{ ...w, bda: 'medium' }])).toBe('aggressive');
    expect(postureFor(sultan, [])).toBe('balanced');
  });

  it('evenly matched ships stay balanced until one is hurt', () => {
    const a = ship('a');
    const b = ship('b', { side: 'green' });
    expect(postureFor(a, [b])).toBe('balanced');
    expect(postureFor(a, [{ ...b, bda: 'medium' }])).toBe('aggressive');
    expect(postureFor({ ...a, bda: 'medium' }, [b])).toBe('cautious');
  });

  it('the posture reshapes the weights and the range goal', () => {
    const agg = effectiveWeights('balanced', 'aggressive');
    const def = effectiveWeights('balanced', 'defensive');
    expect(agg.offense).toBeGreaterThan(def.offense);
    expect(agg.defense).toBeLessThan(def.defense);
    expect(agg.rangeGoal).toBe('close');
    expect(def.rangeGoal).toBe('open');
    expect(effectiveWeights('evade', 'aggressive').rangeGoal).toBe('open');
    const s = ship('s');
    expect(goalRange('medium', s, [warrior])).toBe(13);
    expect(goalRange('open', s, [warrior])).toBe(31);
    expect(goalRange('close', s, [warrior])).toBe(2);
  });
});

describe('evaluator pieces', () => {
  it('a hit from dead ahead lands on the forward facing; from the beam on the side', () => {
    expect(impactFacing(LEVEL_ATTITUDE, windowDirection(yellow(0)))).toBe('forward');
    expect(impactFacing(LEVEL_ATTITUDE, windowDirection(yellow(3)))).toBe('starboard');
    expect(impactFacing(LEVEL_ATTITUDE, windowDirection(yellow(9)))).toBe('port');
    expect(impactFacing(LEVEL_ATTITUDE, windowDirection(yellow(6)))).toBe('aft');
  });

  it('a salvo hurts a weak facing more, a wedged facing less, and fades with the band', () => {
    const s = ship('s');
    const t = ship('t', { side: 'green' });
    const fromStarboard = windowDirection(yellow(3));
    const full = salvoDamage(s, 'port', 'short', t, LEVEL_ATTITUDE, fromStarboard);
    const weak = salvoDamage(s, 'port', 'short', { ...t, effectiveness: { ...FULL_EFFECTIVENESS, starboard: 20 } }, LEVEL_ATTITUDE, fromStarboard);
    const wedged = salvoDamage(s, 'port', 'short', t, LEVEL_ATTITUDE, windowDirection(purple('upper')));
    expect(weak).toBeGreaterThan(full);
    expect(wedged).toBeLessThan(full);
    expect(salvoDamage(s, 'port', 'long', t, LEVEL_ATTITUDE, fromStarboard)).toBeLessThan(salvoDamage(s, 'port', 'medium', t, LEVEL_ATTITUDE, fromStarboard));
    expect(salvoDamage({ ...s, effectiveness: { ...FULL_EFFECTIVENESS, port: 0 } }, 'port', 'short', t, LEVEL_ATTITUDE, fromStarboard)).toBe(0);
  });

  it('candidate generation respects the current ratings', () => {
    const fresh = generateCandidates(ship('a'), 100000);
    const hurt = generateCandidates(ship('a', { ratings: { thrust: 1, pivot: 1, roll: 1 } }), 100000);
    expect(fresh.length).toBeGreaterThan(hurt.length);
    expect(hurt.every((c) => c.thrustUsed <= 1 && (!c.maneuver.roll || c.maneuver.roll.windows <= 1))).toBe(true);
    expect(fresh.every((c) => !c.maneuver.pivotTo || pivotCost(LEVEL_ATTITUDE, c.maneuver.pivotTo) <= 3)).toBe(true);
    expect(generateCandidates(ship('a', { shipClass: HAVOC, ratings: ratingsOf(HAVOC) }), 500).length).toBeLessThanOrEqual(500);
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
    expect(p1.posture).toBe('aggressive');
    expect(p1.orders.rationale).toMatch(/balanced, aggressive/);
  });

  it('launches only from facings that still fight', () => {
    const noBroadsides = { ...duel, ships: [{ ...duel.ships[0]!, effectiveness: { forward: 100, aft: 100, port: 0, starboard: 0 } }, warrior] };
    const p = planOrders(noBroadsides, noBroadsides.ships[0]!, 3);
    for (const l of p.orders.launches) expect(['forward', 'aft']).toContain(l.mount);
    const disarmed = { ...duel, ships: [{ ...duel.ships[0]!, effectiveness: { forward: 0, aft: 0, port: 0, starboard: 0 } }, warrior] };
    expect(planOrders(disarmed, disarmed.ships[0]!, 3).orders.launches).toEqual([]);
  });

  it('a ship with one dead broadside brings the other to bear', () => {
    // enemy dead abeam to starboard; the starboard broadside is gone, port is fresh
    const foe = ship('foe', { side: 'green', controller: 'player', shipClass: WARRIOR, ratings: ratingsOf(WARRIOR), position: position(cubeScale(DIRECTION_CUBE.C, 3), 0) });
    const me = ship('me', { effectiveness: { forward: 100, aft: 100, port: 100, starboard: 0 } });
    const g = planAll(game([me, foe]));
    const o = g.ships[0]!.orders!;
    expect(o.launches.some((l) => l.mount === 'port') || o.maneuver.pivotTo !== undefined).toBe(true);
    expect(o.launches.every((l) => l.mount !== 'starboard')).toBe(true);
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

  it('a hurt evader with lowered ratings still plots legally', () => {
    const g = { ...duel, ships: [{ ...duel.ships[0]!, bda: 'heavy' as const, doctrine: 'evade' as const, ratings: { thrust: 1, pivot: 2, roll: 1 } }, warrior] };
    const r = planAll(g);
    legal(r, r.ships[0]!);
    expect(r.ships[0]!.orders!.rationale).toMatch(/evade, defensive/);
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
        expect(['Short', 'Medium', 'Long', 'out of range']).toContain(line.band);
      }
    }
    const text = orderSheetText(s, 'RED');
    expect(text).toContain('Midpoint marker at');
    expect(text).toContain('At End of Turn: Forward');
    expect(orderSheet(r, r.ships[1]!)).toBeNull();
  });
});
