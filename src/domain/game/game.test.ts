import { describe, expect, it } from 'vitest';
import { SAMPLE_SD } from '../../data/ships/sampleSd';
import { CUBE_ORIGIN, DIRECTION_CUBE, cubeScale, markers, position, purple, velocity, windowLabel, yellow } from '../geometry';
import { advanceEvent, reduce, replay, type GameEvent, type StoredEvent } from './events';
import { engagement, maneuverLimits, shipMotion, thrustLimit } from './derived';
import { AVERAGE_GRADES, TURN_STEPS, type GameState, type ShipSetup } from './types';

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

const stored = (events: GameEvent[]): StoredEvent[] => events.map((event, i) => ({ seq: i + 1, at: '2026-09-19T00:00:00Z', event }));

const baseEvents: GameEvent[] = [
  { type: 'GameCreated', id: 'g1', name: 'Test', createdAt: '2026-09-19T00:00:00Z' },
  { type: 'ClassAdded', shipClass: SAMPLE_SD },
  { type: 'ShipAdded', setup: setup('a', 'red', CUBE_ORIGIN, 0, { velocity: velocity({ A: 2 }) }) },
  { type: 'ShipAdded', setup: setup('b', 'green', cubeScale(DIRECTION_CUBE.A, 10), 2, { forward: yellow(6) }) },
  { type: 'GameStarted' },
];

describe('event-sourced game', () => {
  it('replays to a started game with two ships', () => {
    const g = replay(stored(baseEvents));
    expect(g.turn).toBe(1);
    expect(g.step).toBe('markers');
    expect(g.shipOrder).toEqual(['a', 'b']);
    expect(windowLabel(markers(g.ships.b!.attitude).forward)).toBe('D(yellow)');
    expect(g.ships.a!.damage.magazines.port).toBe(120);
  });

  it('is deterministic and undo is dropping the last event', () => {
    const events = stored([...baseEvents, { type: 'StepChanged', step: 'plot' }]);
    const g1 = replay(events);
    const g2 = replay(events);
    expect(g1).toEqual(g2);
    expect(g1.step).toBe('plot');
    expect(replay(events.slice(0, -1)).step).toBe('markers');
  });

  it('walks the nine steps and rolls the turn over', () => {
    let g = replay(stored(baseEvents));
    for (let i = 0; i < 8; i++) {
      g = reduce(g, advanceEvent(g));
      expect(g.step).toBe(TURN_STEPS[i + 1]);
    }
    expect(advanceEvent(g)).toEqual({ type: 'TurnEnded' });
    g = reduce(g, advanceEvent(g));
    expect(g.turn).toBe(2);
    expect(g.step).toBe('markers');
    // ship a drifted 2 hexes in A; ship b sat still
    expect(g.ships.a!.position).toEqual(position(cubeScale(DIRECTION_CUBE.A, 2), 0));
    expect(g.ships.b!.position).toEqual(position(cubeScale(DIRECTION_CUBE.A, 10), 2));
  });

  it('applies committed orders at end of turn: thrust, displacement, pivot and roll', () => {
    let g: GameState = replay(stored(baseEvents));
    // ship a: no pivot, thrust 2 in A → displacement 1 in A, new velocity 4 in A
    g = reduce(g, { type: 'OrdersIssued', shipId: 'a', orders: { maneuver: {}, thrust: velocity({ A: 2 }), thrustUsed: 2 } });
    // ship b: pivot 3 windows to point straight up, roll 1 to starboard, thrust 2 along the midpoint facing
    g = reduce(g, { type: 'OrdersIssued', shipId: 'b', orders: { maneuver: { pivotTo: purple('upper'), roll: { windows: 1, direction: 'starboard' } }, thrust: velocity({ '+': 2 }), thrustUsed: 2 } });
    const ma = shipMotion(g.ships.a!);
    expect(ma.displacement).toEqual(velocity({ A: 1 }));
    expect(ma.endOfTurn).toEqual(position(cubeScale(DIRECTION_CUBE.A, 3), 0));
    const mb = shipMotion(g.ships.b!);
    expect(mb.displacement).toEqual(velocity({})); // pivoting forfeits displacement
    g = reduce(g, { type: 'TurnEnded' });
    expect(g.ships.a!.position).toEqual(position(cubeScale(DIRECTION_CUBE.A, 3), 0));
    expect(g.ships.a!.velocity).toEqual(velocity({ A: 4 }));
    expect(g.ships.a!.orders).toBeNull();
    expect(windowLabel(markers(g.ships.b!.attitude).forward)).toBe('purple(upper)');
    expect(g.ships.b!.velocity).toEqual(velocity({ '+': 2 }));
  });

  it('accepts corrections from the table and damage reports', () => {
    let g = replay(stored(baseEvents));
    g = reduce(g, { type: 'ShipReported', shipId: 'b', position: position(cubeScale(DIRECTION_CUBE.B, 4), -1), forward: yellow(2), top: purple('upper') });
    expect(g.ships.b!.position.alt).toBe(-1);
    expect(windowLabel(markers(g.ships.b!.attitude).forward)).toBe('B(yellow)');
    g = reduce(g, { type: 'BoxReported', shipId: 'b', trackId: 'internals.ecm', index: 0, status: 'destroyed' });
    expect(g.ships.b!.damage.tracks['internals.ecm']!.boxes[0]!.status).toBe('destroyed');
    g = reduce(g, { type: 'MagazineReported', shipId: 'b', mount: 'port', remaining: 100 });
    expect(g.ships.b!.damage.magazines.port).toBe(100);
    g = reduce(g, { type: 'ShipDestroyed', shipId: 'b', destroyed: true });
    expect(g.ships.b!.destroyed).toBe(true);
    expect(g.log.at(-1)?.text).toContain('destroyed');
  });

  it('derives ratings, limits and the launch geometry', () => {
    let g = replay(stored(baseEvents));
    expect(maneuverLimits(g, g.ships.a!)).toEqual({ pivot: 3, roll: 4 });
    expect(thrustLimit(g, g.ships.a!)).toBe(2);
    g = reduce(g, { type: 'BoxReported', shipId: 'a', trackId: 'internals.pivot', index: 0, status: 'destroyed' });
    expect(maneuverLimits(g, g.ships.a!).pivot).toBe(3); // second box is also a 3
    const e = engagement(g, g.ships.a!, g.ships.b!);
    // a at origin moving 2 in A, b 10 hexes up-map and 2 levels up, stationary: EoT range ≈ √(8²+2²) = 8
    expect(e.eotRange).toBe(8);
    expect(e.band?.baseMql).toBe(4);
    expect(e.salvoes.map((s) => s.available)).toEqual([false, true, true]);
    expect(e.now.range).toBe(10);
    expect(windowLabel(e.now.window!)).toBe('A(yellow)'); // 10 hexes for 2 levels: H ≥ 4V, yellow ring
    expect(windowLabel(e.salvoes[2]!.impact!)).toBe('D(yellow)');
    expect(e.arcs.forward).not.toBe('black'); // b is dead ahead of a
    expect(e.targetWedge).toBe(false);
  });

  it('refuses to start without ships and to add a ship of an unknown class', () => {
    const g0 = reduce(reduce({} as GameState, baseEvents[0]!), baseEvents[1]!);
    expect(() => reduce(g0, { type: 'GameStarted' })).toThrow();
    expect(() => reduce(g0, { type: 'ShipAdded', setup: setup('x', 'red', CUBE_ORIGIN, 0, { classId: 'nope' }) })).toThrow();
  });
});
