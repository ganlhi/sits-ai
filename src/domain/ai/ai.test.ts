import { describe, expect, it } from 'vitest';
import { SAMPLE_SD } from '../../data/ships/sampleSd';
import { CUBE_ORIGIN, DIRECTION_CUBE, cubeScale, markers, pivotCost, position, purple, velocity, windowLabel, yellow } from '../geometry';
import { AVERAGE_GRADES, maneuverLimits, replay, thrustLimit, type GameEvent, type ShipSetup, type StoredEvent } from '../game';
import { generateCandidates, orderSheet, planOrders, sealOf } from './plan';

const setup = (id: string, side: 'red' | 'green', hex = CUBE_ORIGIN, alt = 0, extra: Partial<ShipSetup> = {}): ShipSetup => ({
  id,
  name: id.toUpperCase(),
  classId: SAMPLE_SD.id,
  side,
  controller: side === 'red' ? 'ai' : 'player',
  grades: AVERAGE_GRADES,
  position: position(hex, alt),
  velocity: velocity({}),
  forward: yellow(0),
  top: purple('upper'),
  ...extra,
});

const stored = (events: GameEvent[]): StoredEvent[] => events.map((event, i) => ({ seq: i + 1, at: '2026-09-20T00:00:00Z', event }));

// Red SD at the origin facing A, Green SD 6 hexes dead ahead facing back at it: a knife fight.
const knifeFight = replay(
  stored([
    { type: 'GameCreated', id: 'g', name: 'AI test', createdAt: '2026-09-20T00:00:00Z' },
    { type: 'ClassAdded', shipClass: SAMPLE_SD },
    { type: 'ShipAdded', setup: setup('red', 'red', CUBE_ORIGIN, 0, { doctrine: 'balanced' }) },
    { type: 'ShipAdded', setup: setup('green', 'green', cubeScale(DIRECTION_CUBE.A, 6), 0, { forward: yellow(6) }) },
    { type: 'GameStarted' },
  ]),
);

describe('AI opponent v1', () => {
  it('generates only legal candidates within the ship ratings', () => {
    const ship = knifeFight.ships.red!;
    const limits = maneuverLimits(knifeFight, ship);
    const cands = generateCandidates(knifeFight, ship);
    expect(cands.length).toBeGreaterThan(20);
    for (const c of cands) {
      if (c.maneuver.pivotTo) expect(pivotCost(ship.attitude, c.maneuver.pivotTo)).toBeLessThanOrEqual(limits.pivot);
      if (c.maneuver.roll) expect(c.maneuver.roll.windows).toBeLessThanOrEqual(limits.roll);
      expect(c.thrustUsed).toBeLessThanOrEqual(thrustLimit(knifeFight, ship));
    }
  });

  it('plans deterministically for a seed and issues legal, non-empty orders', () => {
    const a = planOrders(knifeFight, 'red', 'balanced', 3);
    const b = planOrders(knifeFight, 'red', 'balanced', 3);
    expect(a.orders).toEqual(b.orders);
    expect(a.candidatesConsidered).toBeGreaterThan(20);
    expect(a.orders.thrustUsed).toBeLessThanOrEqual(thrustLimit(knifeFight, knifeFight.ships.red!));
    expect(a.orders.rationale).toContain('balanced');
    expect(sealOf(a.orders)).toMatch(/^[0-9A-F]{8}$/);
    expect(sealOf(a.orders)).toBe(sealOf(b.orders));
  });

  it('with the enemy dead ahead, brings a broadside round (pivots) rather than drifting nose-on', () => {
    const plan = planOrders(knifeFight, 'red', 'balanced', 5);
    const e = plan.evaluation;
    // pivoting is worth it here: nose-on only the hammerhead's 8 tubes bear, a broadside brings 32
    expect(plan.orders.maneuver.pivotTo).toBeDefined();
    expect(e.breakdown.dealt).toBeGreaterThan(0);
    expect(plan.orders.launches?.length ?? 0).toBeGreaterThan(0);
    for (const l of plan.orders.launches ?? []) {
      expect(l.targetId).toBe('green');
      expect(l.missiles).toBeGreaterThan(0);
      expect(l.timings.length).toBeGreaterThan(0);
    }
  });

  it('the evade doctrine ends further away than close-to-beams', () => {
    const evade = planOrders(knifeFight, 'red', 'evade', 2);
    const close = planOrders(knifeFight, 'red', 'closeToBeams', 2);
    expect(evade.evaluation.eotRangeToNearest!).toBeGreaterThanOrEqual(close.evaluation.eotRangeToNearest!);
  });

  it('writes an order sheet in the book notation', () => {
    const plan = planOrders(knifeFight, 'red', 'balanced', 5);
    const lines = orderSheet(knifeFight, knifeFight.ships.red!, plan.orders);
    expect(lines.length).toBeGreaterThanOrEqual(4);
    expect(lines[0]).toMatch(/^(Pivot \d window|No pivot)/);
    expect(lines.some((l) => l.startsWith('Launch from the') || l === 'No missile launch.')).toBe(true);
    expect(lines.join('\n')).toContain(windowLabel(markers(knifeFight.ships.red!.attitude).forward));
  });

  it('with no enemy in play, plans without launches and says so', () => {
    const alone = replay(stored([{ type: 'GameCreated', id: 'g', name: 'solo', createdAt: '2026-09-20T00:00:00Z' }, { type: 'ClassAdded', shipClass: SAMPLE_SD }, { type: 'ShipAdded', setup: setup('red', 'red') }, { type: 'GameStarted' }]));
    const plan = planOrders(alone, 'red', 'balanced', 1);
    expect(plan.orders.launches).toEqual([]);
    expect(plan.orders.rationale).toContain('no enemy');
  });
});
