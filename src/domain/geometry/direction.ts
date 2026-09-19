/**
 * The eight vector directions of SITS (RULES.md §4, §7.1): six map directions A–F clockwise
 * from the top of the map, plus up (+) and down (−).
 */
import type { Cube } from './hex';

export const MAP_DIRECTIONS = ['A', 'B', 'C', 'D', 'E', 'F'] as const;
export type MapDirection = (typeof MAP_DIRECTIONS)[number];

export type VerticalDirection = '+' | '-';
export type VectorDirection = MapDirection | VerticalDirection;
export const VECTOR_DIRECTIONS: readonly VectorDirection[] = [...MAP_DIRECTIONS, '+', '-'];

export const isMapDirection = (d: VectorDirection): d is MapDirection => d !== '+' && d !== '-';

/** Unit cube vector of each map direction. A points +y on the map; B is 60° clockwise of A, etc. */
export const DIRECTION_CUBE: Readonly<Record<MapDirection, Cube>> = {
  A: { x: 0, y: 1, z: -1 },
  B: { x: 1, y: 0, z: -1 },
  C: { x: 1, y: -1, z: 0 },
  D: { x: 0, y: -1, z: 1 },
  E: { x: -1, y: 0, z: 1 },
  F: { x: -1, y: 1, z: 0 },
};

export const directionIndex = (d: MapDirection): number => MAP_DIRECTIONS.indexOf(d);

export function directionAt(index: number): MapDirection {
  const d = MAP_DIRECTIONS[((index % 6) + 6) % 6];
  if (!d) throw new Error('unreachable');
  return d;
}

/** Rotate a map direction by `steps` × 60° clockwise (negative = counter-clockwise). */
export const rotateDirection = (d: MapDirection, steps: number): MapDirection => directionAt(directionIndex(d) + steps);

export const oppositeDirection = (d: MapDirection): MapDirection => rotateDirection(d, 3);

/** Angle between two map directions: 0, 60, 120 or 180 degrees. */
export function directionAngle(a: MapDirection, b: MapDirection): 0 | 60 | 120 | 180 {
  const diff = Math.abs(directionIndex(a) - directionIndex(b)) % 6;
  const steps = Math.min(diff, 6 - diff);
  return (steps * 60) as 0 | 60 | 120 | 180;
}

/** Azimuth of a map direction in degrees clockwise from north (A = 0°). */
export const directionAzimuth = (d: MapDirection): number => directionIndex(d) * 60;

export interface Decomposition {
  /** First direction (clockwise-earlier of the two) and its amount. */
  readonly a: MapDirection;
  readonly na: number;
  /** Second direction, 60° clockwise of `a`, and its amount. */
  readonly b: MapDirection;
  readonly nb: number;
}

/**
 * Express a cube offset as non-negative whole amounts of two adjacent map directions.
 * Every horizontal offset has exactly one such decomposition (up to which of the two is
 * called first when one amount is zero). Returns null for the zero offset.
 */
export function decomposeCube(c: Cube): Decomposition | null {
  if (c.x === 0 && c.y === 0 && c.z === 0) return null;
  for (let i = 0; i < 6; i++) {
    const a = directionAt(i);
    const b = directionAt(i + 1);
    const da = DIRECTION_CUBE[a];
    const db = DIRECTION_CUBE[b];
    // Solve na*da + nb*db = c on the (x, y) components; adjacent directions are a lattice basis.
    const det = da.x * db.y - db.x * da.y;
    const na = Math.round((c.x * db.y - c.y * db.x) / det);
    const nb = Math.round((da.x * c.y - da.y * c.x) / det);
    if (na >= 0 && nb >= 0 && na * da.x + nb * db.x === c.x && na * da.y + nb * db.y === c.y) {
      return { a, na, b, nb };
    }
  }
  throw new Error(`no decomposition for (${c.x},${c.y},${c.z})`);
}
