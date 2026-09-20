import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import { DIRECTION_CUBE, MAP_DIRECTIONS, decomposeCube, directionAngle, directionAzimuth, formatHexOffset, hexOffset, oppositeDirection, rotateDirection } from './direction';
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

describe('hex offsets from the map centre', () => {
  it('builds an offset from direction amounts and formats it back', () => {
    const c = hexOffset({ A: 9, B: 3 });
    expect(c).toEqual(cubeAdd(cubeScale(DIRECTION_CUBE.A, 9), cubeScale(DIRECTION_CUBE.B, 3)));
    expect(formatHexOffset(c)).toBe('9A + 3B');
    expect(formatHexOffset(hexOffset({ D: 4 }))).toBe('4D');
    expect(formatHexOffset(CUBE_ORIGIN)).toBe('centre');
    expect(formatHexOffset(hexOffset({}))).toBe('centre');
  });

  it('cancels opposite directions and normalises to the shortest adjacent pair', () => {
    expect(hexOffset({ A: 3, D: 3 })).toEqual(CUBE_ORIGIN);
    expect(formatHexOffset(hexOffset({ A: -2 }))).toBe('2D');
    // A and C are 120° apart: 1A + 1C is the same hex as 1B, one hex away
    expect(formatHexOffset(hexOffset({ A: 1, C: 1 }))).toBe('1B');
    expect(hexDistance(CUBE_ORIGIN, hexOffset({ A: 1, C: 1 }))).toBe(1);
  });

  it('round-trips any offset through the formatted notation', () => {
    fc.assert(
      fc.property(fc.integer({ min: -8, max: 8 }), fc.integer({ min: -8, max: 8 }), fc.integer({ min: -8, max: 8 }), (a, b, c) => {
        const off = hexOffset({ A: a, B: b, C: c });
        const dec = decomposeCube(off);
        const back = dec ? hexOffset({ [dec.a]: dec.na, [dec.b]: dec.nb }) : CUBE_ORIGIN;
        expect(back).toEqual(off);
      }),
    );
  });
});
