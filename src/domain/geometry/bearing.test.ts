import { describe, expect, it } from 'vitest';
import { windowLabel } from './avid';
import { bearing, horizontalAzimuthIndex, impactWindow } from './bearing';
import { DIRECTION_CUBE } from './direction';
import { CUBE_ORIGIN, cubeAdd, cubeScale, position } from './hex';

const offset = (a: 'A' | 'B' | 'C' | 'D' | 'E' | 'F', na: number, b: 'A' | 'B' | 'C' | 'D' | 'E' | 'F', nb: number) =>
  cubeAdd(cubeScale(DIRECTION_CUBE[a], na), cubeScale(DIRECTION_CUBE[b], nb));

describe('bearings (RULES.md §9)', () => {
  it('applies the 3:1 hex-edge / hex-corner rule', () => {
    expect(horizontalAzimuthIndex(offset('A', 3, 'B', 1))).toBe(0); // A edge
    expect(horizontalAzimuthIndex(offset('A', 2, 'B', 1))).toBe(1); // A/B corner
    expect(horizontalAzimuthIndex(offset('A', 1, 'B', 3))).toBe(2); // B edge
    expect(horizontalAzimuthIndex(offset('A', 1, 'B', 1))).toBe(1);
    expect(horizontalAzimuthIndex(offset('E', 5, 'F', 1))).toBe(8); // E edge
    expect(horizontalAzimuthIndex(offset('F', 2, 'A', 1))).toBe(11); // F/A corner
    expect(horizontalAzimuthIndex(CUBE_ORIGIN)).toBeNull();
  });

  it('C1.14 sidebar: target 7 hexes off along A and 2 levels up → range 7, A(blue, upper)', () => {
    const b = bearing(position(CUBE_ORIGIN, 0), position(cubeScale(DIRECTION_CUBE.A, 7), 2));
    expect(b.range).toBe(7);
    expect(b.ring).toBe('blue');
    expect(windowLabel(b.window!)).toBe('A(blue, upper)');
    expect(windowLabel(impactWindow(b)!)).toBe('D(blue, lower)');
  });

  it('a target straight above is seen through purple; one directly below is circled', () => {
    expect(windowLabel(bearing(position(CUBE_ORIGIN, 0), position(CUBE_ORIGIN, 3)).window!)).toBe('purple(upper)');
    expect(windowLabel(bearing(position(CUBE_ORIGIN, 5), position(CUBE_ORIGIN, 1)).window!)).toBe('purple(lower)');
  });

  it('is reciprocal: the target sees us through the reciprocal window at the same range', () => {
    const p = position(offset('C', 4, 'D', 2), -3);
    const q = position(offset('A', 1, 'B', 6), 5);
    const pq = bearing(p, q);
    const qp = bearing(q, p);
    expect(pq.range).toBe(qp.range);
    expect(windowLabel(impactWindow(pq)!)).toBe(windowLabel(qp.window!));
  });

  it('picks the nearer hex edge for green-ring bearings', () => {
    const b = bearing(position(CUBE_ORIGIN, 0), position(offset('B', 2, 'C', 1), 5));
    expect(b.ring).toBe('green');
    expect(windowLabel(b.window!)).toBe('B(green, upper)');
  });

  it('returns no window for coincident positions', () => {
    const b = bearing(position(CUBE_ORIGIN, 2), position(CUBE_ORIGIN, 2));
    expect(b.window).toBeNull();
    expect(b.range).toBe(0);
  });
});
