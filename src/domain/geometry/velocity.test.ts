import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import { MAP_DIRECTIONS, VECTOR_DIRECTIONS, directionAngle } from './direction';
import { consolidate, formatVelocity, netMotion, velocity, velocityAdd, velocityEquals, velocityFromMotion, type Velocity } from './velocity';

describe('vector consolidation (RULES.md §8)', () => {
  it('reproduces HMS Dulcinea (B4.35): 1+, 2F, 1E plus thrust 2+, 3B → 2 in A, 3 in +', () => {
    const start = velocity({ '+': 1, F: 2, E: 1 });
    const thrust = velocity({ '+': 2, B: 3 });
    const { velocity: v, steps } = consolidate(velocityAdd(start, thrust));
    expect(v).toEqual(velocity({ A: 2, '+': 3 }));
    // B and E cancel first (180°), then F and B fold into A (120°)
    expect(steps.map((s) => s.kind)).toEqual(['180', '120']);
    expect(steps[1]?.into).toBe('A');
    expect(formatVelocity(v)).toBe('2 in A, 3 in +');
  });

  it('cancels opposed vertical vectors', () => {
    expect(consolidate(velocity({ '+': 3, '-': 1 })).velocity).toEqual(velocity({ '+': 2 }));
  });

  it('folds 120° pairs into the direction between them, including the wrap-around pair', () => {
    expect(consolidate(velocity({ A: 1, C: 1 })).velocity).toEqual(velocity({ B: 1 }));
    expect(consolidate(velocity({ E: 2, A: 1 })).velocity).toEqual(velocity({ F: 1, E: 1 }));
  });

  const arbVelocity = fc
    .tuple(...VECTOR_DIRECTIONS.map(() => fc.integer({ min: 0, max: 6 })))
    .map((ns) => velocity(Object.fromEntries(VECTOR_DIRECTIONS.map((d, i) => [d, ns[i]!])) as Partial<Record<(typeof VECTOR_DIRECTIONS)[number], number>>));

  it('never changes the net motion and ends in canonical form', () => {
    fc.assert(
      fc.property(arbVelocity, (v: Velocity) => {
        const { velocity: c } = consolidate(v);
        const before = netMotion(v);
        const after = netMotion(c);
        expect(after).toEqual(before);
        // canonical: at most one vertical direction, and every pair of non-zero map directions 60° apart
        expect(c['+'] === 0 || c['-'] === 0).toBe(true);
        const live = MAP_DIRECTIONS.filter((d) => c[d] > 0);
        expect(live.length).toBeLessThanOrEqual(2);
        if (live.length === 2) expect(directionAngle(live[0]!, live[1]!)).toBe(60);
        expect(velocityEquals(c, velocityFromMotion(before.hex, before.alt))).toBe(true);
      }),
    );
  });
});
