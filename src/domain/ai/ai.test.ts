import { describe, expect, it } from 'vitest';
import { CUBE_ORIGIN, DIRECTION_CUBE, LEVEL_ATTITUDE, attitudeFromWindows, bearing, cubeScale, facingAfter, maneuverPivots, markers, pathProblems, pivotWindows, position, purple, thrustOptions, velocity, windowDirection, yellow } from '../geometry';
import { BUILT_IN_CLASSES, FULL_EFFECTIVENESS, UNDAMAGED, ratingsOf, uniformBda, type Game, type Ship } from '../game';
import { effectiveWeights, goalRange, postureFor } from './doctrine';
import { bestVolley, impactFacing, salvoDamage, vulnerability } from './evaluate';
import { orderSheet, orderSheetText } from './orderSheet';
import { generateCandidates, planFire, planMovement, planOrders } from './plan';
import { displacementNotice } from './orderSheet';

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
  bda: UNDAMAGED,
  effectiveness: FULL_EFFECTIVENESS,
  outOfAction: false,
  orders: null,
  displacedEot: null,
  ...extra,
});

const game = (ships: Ship[]): Game => ({ id: 'g', name: 'Test', createdAt: '2026-09-20T00:00:00Z', updatedAt: '2026-09-20T00:00:00Z', turn: 1, phase: 'report', ships, history: [] });

/** AI plotting then AI shooting, the player reporting no displacement in between. */
const playTurn = (g: Game): Game => planFire(planMovement(g));

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
  expect(pivotWindows(o.maneuver)).toBeLessThanOrEqual(limits.pivot);
  expect(pathProblems(markers(s.attitude).forward, o.maneuver.pivotPath ?? [])).toEqual([]);
  if (o.maneuver.roll) expect(o.maneuver.roll.windows).toBeLessThanOrEqual(limits.roll);
  expect(o.thrustUsed).toBeLessThanOrEqual(limits.thrust);
  const facing = facingAfter(s.attitude, o.maneuver, 0.5);
  expect(thrustOptions(o.thrustUsed, facing).some((p) => JSON.stringify(p.delta) === JSON.stringify(o.thrust))).toBe(true);
  const launches = o.launches ?? [];
  for (const l of launches) {
    expect(s.effectiveness[l.mount]).toBeGreaterThan(0);
    expect(l.timings.length).toBeGreaterThan(0);
    expect(g.ships.some((t) => t.id === l.targetId && t.side !== s.side)).toBe(true);
  }
  // one side per enemy
  const targets = launches.map((l) => l.targetId);
  expect(new Set(targets).size).toBe(targets.length);
};

describe('posture', () => {
  it('a fresh battlecruiser presses a cruiser; the cruiser is cautious; hurt, it turns defensive', () => {
    const sultan = ship('s');
    const w = { ...warrior, side: 'green' as const };
    expect(postureFor(sultan, [w])).toBe('aggressive');
    expect(postureFor(w, [sultan])).toBe('cautious');
    expect(postureFor({ ...w, bda: uniformBda('heavy') }, [sultan])).toBe('defensive');
    expect(postureFor({ ...sultan, bda: uniformBda('heavy') }, [{ ...w, bda: uniformBda('undamaged') }])).toBe('defensive');
    expect(postureFor({ ...sultan, bda: uniformBda('medium') }, [{ ...w, bda: uniformBda('medium') }])).toBe('aggressive');
    expect(postureFor(sultan, [])).toBe('balanced');
  });

  it('damage is read per side: one wrecked side hurts less than the whole ship wrecked', () => {
    const a = ship('a');
    const b = ship('b', { side: 'green' });
    expect(postureFor({ ...a, bda: { ...UNDAMAGED, starboard: 'light' } }, [b])).toBe('balanced');
    expect(postureFor({ ...a, bda: { ...UNDAMAGED, starboard: 'heavy' } }, [b])).toBe('cautious');
    expect(postureFor(a, [{ ...b, bda: { ...UNDAMAGED, port: 'crippled' } }])).toBe('aggressive');
  });

  it('evenly matched ships stay balanced until one is hurt', () => {
    const a = ship('a');
    const b = ship('b', { side: 'green' });
    expect(postureFor(a, [b])).toBe('balanced');
    expect(postureFor(a, [{ ...b, bda: uniformBda('medium') }])).toBe('aggressive');
    expect(postureFor({ ...a, bda: uniformBda('medium') }, [b])).toBe('cautious');
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

  it("a hit is worth more on a side the BDA already reports damaged, and only that side's", () => {
    const s = ship('s');
    const t = ship('t', { side: 'green' });
    const fromStarboard = windowDirection(yellow(3));
    const hurt = { ...t, bda: { ...UNDAMAGED, starboard: 'heavy' as const } };
    expect(vulnerability(hurt, 'starboard')).toBeGreaterThan(vulnerability(t, 'starboard'));
    expect(vulnerability(hurt, 'port')).toBe(vulnerability(t, 'port'));
    expect(salvoDamage(s, 'port', 'short', hurt, LEVEL_ATTITUDE, fromStarboard)).toBeGreaterThan(salvoDamage(s, 'port', 'short', t, LEVEL_ATTITUDE, fromStarboard));
    expect(salvoDamage(s, 'port', 'short', hurt, LEVEL_ATTITUDE, windowDirection(yellow(9)))).toBe(salvoDamage(s, 'port', 'short', t, LEVEL_ATTITUDE, windowDirection(yellow(9))));
  });

  it('only one side targets a given enemy in a turn, even when the bearings cross from one arc to the next', () => {
    const s = ship('s');
    const t = ship('t', { side: 'green' });
    const at = { early: LEVEL_ATTITUDE, middle: LEVEL_ATTITUDE, late: LEVEL_ATTITUDE };
    // Early and Middle on the bow (forward hammerhead), Late abeam to starboard (starboard broadside)
    const geometry = { early: bearing(position(CUBE_ORIGIN, 0), position(cubeScale(DIRECTION_CUBE.A, 4), 0)), middle: bearing(position(CUBE_ORIGIN, 0), position(cubeScale(DIRECTION_CUBE.A, 3), 0)), late: bearing(position(CUBE_ORIGIN, 0), position(cubeScale(DIRECTION_CUBE.C, 3), 0)) };
    const v = bestVolley(s, LEVEL_ATTITUDE, 'short', t, at, geometry)!;
    expect(['forward', 'starboard']).toContain(v.mount);
    expect(v.timings).toEqual(v.mount === 'forward' ? ['early', 'middle'] : ['late']);
    const fwdOnly = bestVolley({ ...s, effectiveness: { ...FULL_EFFECTIVENESS, starboard: 0 } }, LEVEL_ATTITUDE, 'short', t, at, geometry)!;
    expect(fwdOnly).toMatchObject({ mount: 'forward', timings: ['early', 'middle'] });
    const stbdOnly = bestVolley({ ...s, effectiveness: { ...FULL_EFFECTIVENESS, forward: 0 } }, LEVEL_ATTITUDE, 'short', t, at, geometry)!;
    expect(stbdOnly).toMatchObject({ mount: 'starboard', timings: ['late'] });
  });

  it("a salvo whose own range is past the class's last band is not fired, even when the EoT band allows the timing", () => {
    const s = ship('s');
    const t = ship('t', { side: 'green' });
    const at = { early: LEVEL_ATTITUDE, middle: LEVEL_ATTITUDE, late: LEVEL_ATTITUDE };
    const abeam = (range: number) => bearing(position(CUBE_ORIGIN, 0), position(cubeScale(DIRECTION_CUBE.C, range), 0));
    // EoT to EoT in the long band (Late only), but the Late bearing itself runs past the Sultan's reach of 28
    expect(bestVolley(s, LEVEL_ATTITUDE, 'long', t, at, { early: abeam(31), middle: abeam(31), late: abeam(31) })).toBeNull();
    expect(bestVolley(s, LEVEL_ATTITUDE, 'long', t, at, { early: abeam(31), middle: abeam(31), late: abeam(27) })).toMatchObject({ timings: ['late'] });
    // short band grants three salvoes, but the Early one is shot at a range the card has no MQL for
    expect(bestVolley(s, LEVEL_ATTITUDE, 'short', t, at, { early: abeam(30), middle: abeam(5), late: abeam(4) })).toMatchObject({ timings: ['middle', 'late'] });
    // each salvo is rated by its own band: a Late shot at long range is worth less than one at short range
    const far = bestVolley(s, LEVEL_ATTITUDE, 'long', t, at, { early: abeam(27), middle: abeam(27), late: abeam(27) })!;
    const near = bestVolley(s, LEVEL_ATTITUDE, 'long', t, at, { early: abeam(5), middle: abeam(5), late: abeam(5) })!;
    expect(far.damage).toBeLessThan(near.damage);
  });

  it('candidate generation respects the current ratings', () => {
    const fresh = generateCandidates(ship('a'), 100000);
    const hurt = generateCandidates(ship('a', { ratings: { thrust: 1, pivot: 1, roll: 1 } }), 100000);
    expect(fresh.length).toBeGreaterThan(hurt.length);
    expect(hurt.every((c) => c.thrustUsed <= 1 && (!c.maneuver.roll || c.maneuver.roll.windows <= 1))).toBe(true);
    expect(fresh.every((c) => pivotWindows(c.maneuver) <= 3)).toBe(true);
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
    expect(p1.orders.launches).toBeNull();
    expect(p1.evaluation.launches.length).toBeGreaterThan(0);
    expect(p1.posture).toBe('aggressive');
    expect(p1.orders.rationale).toMatch(/balanced, aggressive/);
  });

  it('launches only from facings that still fight', () => {
    const noBroadsides = { ...duel, ships: [{ ...duel.ships[0]!, effectiveness: { forward: 100, aft: 100, port: 0, starboard: 0 } }, warrior] };
    const p = planOrders(noBroadsides, noBroadsides.ships[0]!, 3);
    for (const l of p.evaluation.launches) expect(['forward', 'aft']).toContain(l.mount);
    const disarmed = { ...duel, ships: [{ ...duel.ships[0]!, effectiveness: { forward: 0, aft: 0, port: 0, starboard: 0 } }, warrior] };
    expect(planOrders(disarmed, disarmed.ships[0]!, 3).evaluation.launches).toEqual([]);
  });

  it('a ship with one dead broadside brings the other to bear', () => {
    // enemy dead abeam to starboard; the starboard broadside is gone, port is fresh
    const foe = ship('foe', { side: 'green', controller: 'player', shipClass: WARRIOR, ratings: ratingsOf(WARRIOR), position: position(cubeScale(DIRECTION_CUBE.C, 3), 0) });
    const me = ship('me', { effectiveness: { forward: 100, aft: 100, port: 100, starboard: 0 } });
    const g = playTurn(game([me, foe]));
    const o = g.ships[0]!.orders!;
    expect(o.launches!.some((l) => l.mount === 'port') || maneuverPivots(o.maneuver)).toBe(true);
    expect(o.launches!.every((l) => l.mount !== 'starboard')).toBe(true);
  });

  it('plotting plots every AI ship in action, skips ships out of action and player ships, and moves to the plotted phase', () => {
    const g = game([...duel.ships, ship('hulk', { outOfAction: true, position: position(cubeScale(DIRECTION_CUBE.D, 5), 0) })]);
    const r = planMovement(g);
    expect(r.phase).toBe('plotted');
    expect(r.history).toHaveLength(1);
    expect(planMovement(r)).toBe(r); // only once per turn
    expect(r.ships[0]!.orders).not.toBeNull();
    expect(r.ships[1]!.orders).toBeNull();
    expect(r.ships[2]!.orders).toBeNull();
    expect(planMovement(g)).toEqual(r);
    legal(r, r.ships[0]!);
  });

  it('a hurt evader with lowered ratings still plots legally', () => {
    const g = { ...duel, ships: [{ ...duel.ships[0]!, bda: uniformBda('heavy'), doctrine: 'evade' as const, ratings: { thrust: 1, pivot: 2, roll: 1 } }, warrior] };
    const r = playTurn(g);
    legal(r, r.ships[0]!);
    expect(r.ships[0]!.orders!.rationale).toMatch(/evade, defensive/);
  });

  it('the order sheet has the markers, both attitudes and a salvo line per launched salvo', () => {
    const r = playTurn(duel);
    const s = orderSheet(r, r.ships[0]!)!;
    expect(s.maneuver).toHaveLength(3);
    expect(s.maneuver[0]).toMatch(/pivot/i);
    expect(s.maneuver[2]).toMatch(/thrust/i);
    for (const l of s.launches) {
      expect(l.salvoes.length).toBeGreaterThan(0);
      for (const line of l.salvoes) {
        expect(line.range).toBeGreaterThan(0);
        expect(line.impact).toMatch(/\(/);
        expect(['Short', 'Medium', 'Long']).toContain(line.band);
      }
    }
    const text = orderSheetText(s, 'RED');
    expect(text).toContain('Midpoint marker at');
    expect(text).toContain('At End of Turn: Forward');
    expect(orderSheet(r, r.ships[1]!)).toBeNull();
  });

  it('never writes a salvo the card has no range for, even closing fast from the edge of missile reach', () => {
    // Sultan rushing at 6 hexes a turn towards a Warrior 34 hexes off: EoT to EoT lands in the long band,
    // but the Late bearing, shot from the Sultan's Midpoint, is still past its reach of 28.
    const rusher = ship('red', { velocity: velocity({ B: 6 }) });
    const target = { ...warrior, position: position(cubeScale(DIRECTION_CUBE.B, 34), 0), velocity: velocity({}) };
    for (let turn = 1; turn <= 3; turn++) {
      const g = { ...game([rusher, target]), turn };
      const r = playTurn(g);
      legal(r, r.ships[0]!);
      const s = orderSheet(r, r.ships[0]!)!;
      for (const l of s.launches) for (const line of l.salvoes) expect(line.band).not.toBe('out of range');
    }
  });
});

describe('plotting, then shooting', () => {
  it('plotting shows only the markers: the launches wait for the shooting step', () => {
    const p = planMovement(duel);
    const o = p.ships[0]!.orders!;
    expect(o.launches).toBeNull();
    const n = displacementNotice(p.ships[0]!)!;
    expect(n.displacement === null).toBe(o.thrustUsed === 0 || maneuverPivots(o.maneuver));
    expect(displacementNotice(p.ships[1]!)).toBeNull();
  });

  it('shooting adds the launches and leaves the plot exactly as it was', () => {
    const p = planMovement(duel);
    const f = planFire(p);
    expect(f.phase).toBe('fired');
    expect(f.history).toHaveLength(2);
    const before = p.ships[0]!.orders!;
    const after = f.ships[0]!.orders!;
    expect({ ...after, launches: null }).toEqual(before);
    expect(after.launches!.length).toBeGreaterThan(0);
    legal(f, f.ships[0]!);
    expect(planFire(duel)).toBe(duel); // not before plotting
    expect(planFire(f)).toBe(f); // only once
  });

  it("shooting aims at the player's EoT marker where it was displaced to", () => {
    const p = planMovement(duel);
    const plot = p.ships[0]!.orders!;
    // the warrior reports its EoT marker displaced far out of missile range
    const away = { ...p, ships: [p.ships[0]!, { ...p.ships[1]!, displacedEot: position(cubeScale(DIRECTION_CUBE.B, 45), 1) }] };
    const f = planFire(away);
    expect(f.ships[0]!.orders!.launches).toEqual([]);
    expect({ ...f.ships[0]!.orders!, launches: null }).toEqual(plot);
  });
});
