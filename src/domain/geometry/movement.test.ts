import { describe, expect, it } from 'vitest';
import { CUBE_ORIGIN, position } from './hex';
import { DIRECTION_CUBE } from './direction';
import { advance, displacementFor, planMotion, type MotionState } from './movement';
import { ZERO_VELOCITY, velocity } from './velocity';

const rest: MotionState = { position: position(CUBE_ORIGIN, 0), velocity: ZERO_VELOCITY, halfDisplacements: [] };

describe('displacement (B3.27, RULES.md §7.3)', () => {
  it('the p.24 example: thrust adding 3 in A and 3 in + displaces the EoT one hex in A and one in +, carrying halves in both', () => {
    const { displacement, carriedHalves } = displacementFor(velocity({ A: 3, '+': 3 }), false, [], 'average');
    expect(displacement).toEqual(velocity({ A: 1, '+': 1 }));
    expect(carriedHalves.sort()).toEqual(['+', 'A']);
  });

  it('a Veteran engineer rounds the halves up; a Poor one loses them', () => {
    expect(displacementFor(velocity({ A: 3, '+': 3 }), false, [], 'veteran').displacement).toEqual(velocity({ A: 2, '+': 2 }));
    const poor = displacementFor(velocity({ A: 3 }), false, [], 'poor');
    expect(poor.displacement).toEqual(velocity({ A: 1 }));
    expect(poor.carriedHalves).toEqual([]);
  });

  it('a carried half completes on the next half in the same direction', () => {
    const second = displacementFor(velocity({ A: 3 }), false, ['A'], 'average');
    expect(second.displacement).toEqual(velocity({ A: 2 }));
    expect(second.carriedHalves).toEqual([]);
  });

  it('pivoting while thrusting forfeits displacement (B4.313)', () => {
    const r = displacementFor(velocity({ A: 4 }), true, ['A'], 'average');
    expect(r.displacement).toEqual(ZERO_VELOCITY);
    expect(r.carriedHalves).toEqual([]);
  });
});

describe('a turn of motion', () => {
  it('places Midpoint at half the vector (rounded down) and EoT at the full vector plus displacement; consolidates for next turn', () => {
    const state: MotionState = { position: position(CUBE_ORIGIN, 0), velocity: velocity({ A: 3, '+': 2 }), halfDisplacements: [] };
    const m = planMotion(state, velocity({ A: 2, '+': 1 }), false);
    expect(m.midpoint).toEqual(position({ x: 0, y: 1, z: -1 }, 1));
    expect(m.displacement).toEqual(velocity({ A: 1 }));
    expect(m.carriedHalves).toEqual(['+']);
    expect(m.endOfTurn).toEqual(position({ x: 0, y: 4, z: -4 }, 2));
    expect(m.newVelocity).toEqual(velocity({ A: 5, '+': 3 }));
    const next = advance(state, m);
    expect(next.position).toEqual(m.endOfTurn);
    expect(next.velocity).toEqual(m.newVelocity);
  });

  it('a stationary ship that thrusts 1 in A does not move this turn; next turn it moves its 1 hex of velocity plus the completed half of displacement', () => {
    const m = planMotion(rest, velocity({ A: 1 }), false);
    expect(m.midpoint).toEqual(rest.position);
    expect(m.endOfTurn).toEqual(rest.position);
    expect(m.carriedHalves).toEqual(['A']);
    const next = advance(rest, m);
    expect(next.velocity).toEqual(velocity({ A: 1 }));
    const m2 = planMotion(next, velocity({ A: 1 }), false);
    expect(m2.displacement).toEqual(velocity({ A: 1 }));
    expect(m2.endOfTurn).toEqual(position({ x: 0, y: 2, z: -2 }, 0));
    expect(m2.carriedHalves).toEqual([]);
    expect(m2.newVelocity).toEqual(velocity({ A: 2 }));
    expect(DIRECTION_CUBE.A).toEqual({ x: 0, y: 1, z: -1 });
  });
});
