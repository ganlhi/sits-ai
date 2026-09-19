import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import { DIRECTION_CUBE, MAP_DIRECTIONS, decomposeCube, directionAngle, directionAzimuth, oppositeDirection, rotateDirection } from './direction';
import { CUBE_ORIGIN, cubeAdd, cubeScale, hexDistance, hexToPoint, pointToHex } from './hex';

describe('map directions', () => {
  it('run clockwise A→F in 60° steps and B is 60° clockwise of A', () => {
    expect(rotateDirection('A', 1)).toBe('B');
    expect(rotateDirection('F', 1)).toBe('A');
    expect(rotateDirection('A', -1)).toBe('F');
    expect(oppositeDirection('A')).toBe('D');
    expect(directionAngle('A', 'C')).toBe(120);
    expect(directionAngle('B', 'E')).toBe(180);
    expect(directionAngle('F', 'A')).toBe(60);
  });

  it('each direction is one hex long and points at its azimuth on the flat-top layout', () => {
    for (const d of MAP_DIRECTIONS) {
      const p = hexToPoint(DIRECTION_CUBE[d]);
      const az = ((Math.atan2(p.x, p.y) * 180) / Math.PI + 360) % 360;
      expect(Math.hypot(p.x, p.y)).toBeCloseTo(1, 9);
      expect(az).toBeCloseTo(directionAzimuth(d), 6);
      expect(hexDistance(CUBE_ORIGIN, DIRECTION_CUBE[d])).toBe(1);
    }
  });

  it('decomposes any offset into two adjacent directions with non-negative amounts', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 5 }), fc.integer({ min: 0, max: 5 }), fc.integer({ min: 0, max: 5 }), (i, na, nb) => {
        const a = MAP_DIRECTIONS[i]!;
        const b = rotateDirection(a, 1);
        const c = cubeAdd(cubeScale(DIRECTION_CUBE[a], na), cubeScale(DIRECTION_CUBE[b], nb));
        const dec = decomposeCube(c);
        if (na === 0 && nb === 0) {
          expect(dec).toBeNull();
          return;
        }
        expect(dec).not.toBeNull();
        const back = cubeAdd(cubeScale(DIRECTION_CUBE[dec!.a], dec!.na), cubeScale(DIRECTION_CUBE[dec!.b], dec!.nb));
        expect(back).toEqual(c);
        expect(dec!.na + dec!.nb).toBe(hexDistance(CUBE_ORIGIN, c));
      }),
    );
  });

  it('round-trips hex → point → hex', () => {
    fc.assert(
      fc.property(fc.integer({ min: -20, max: 20 }), fc.integer({ min: -20, max: 20 }), (x, z) => {
        const c = { x, y: -x - z, z };
        const p = hexToPoint(c);
        expect(pointToHex(p.x, p.y)).toEqual(c);
      }),
    );
  });
});
