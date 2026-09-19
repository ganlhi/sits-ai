/**
 * Vectors and vector consolidation (RULES.md §7.1, §8).
 *
 * A ship's velocity is a set of whole-hex vectors, one per direction, as written in the
 * arrows around the AVID. Consolidation is the end-of-turn tidy-up from the Reference Card:
 * cancel 180° pairs, then fold 120° pairs into the direction between them.
 */
import {
  DIRECTION_CUBE,
  MAP_DIRECTIONS,
  VECTOR_DIRECTIONS,
  directionAngle,
  directionAt,
  directionIndex,
  oppositeDirection,
  type MapDirection,
  type VectorDirection,
} from './direction';
import { CUBE_ORIGIN, cubeAdd, cubeScale, type Cube } from './hex';

export type Velocity = Readonly<Record<VectorDirection, number>>;

export const ZERO_VELOCITY: Velocity = { A: 0, B: 0, C: 0, D: 0, E: 0, F: 0, '+': 0, '-': 0 };

export function velocity(parts: Partial<Record<VectorDirection, number>>): Velocity {
  const v: Record<VectorDirection, number> = { ...ZERO_VELOCITY };
  for (const d of VECTOR_DIRECTIONS) {
    const n = parts[d] ?? 0;
    if (!Number.isInteger(n) || n < 0) throw new Error(`velocity in ${d} must be a non-negative integer, got ${n}`);
    v[d] = n;
  }
  return v;
}

export function velocityAdd(a: Velocity, b: Velocity): Velocity {
  const v: Record<VectorDirection, number> = { ...ZERO_VELOCITY };
  for (const d of VECTOR_DIRECTIONS) v[d] = a[d] + b[d];
  return v;
}

export const velocityEquals = (a: Velocity, b: Velocity): boolean => VECTOR_DIRECTIONS.every((d) => a[d] === b[d]);

export const velocityIsZero = (v: Velocity): boolean => VECTOR_DIRECTIONS.every((d) => v[d] === 0);

/** Total hexes moved per turn, counting every arrow. */
export const velocityMagnitude = (v: Velocity): number => VECTOR_DIRECTIONS.reduce((s, d) => s + v[d], 0);

/** The net motion the vectors add up to: a cube offset and an altitude change. */
export function netMotion(v: Velocity): { hex: Cube; alt: number } {
  let hex = CUBE_ORIGIN;
  for (const d of MAP_DIRECTIONS) hex = cubeAdd(hex, cubeScale(DIRECTION_CUBE[d], v[d]));
  return { hex, alt: v['+'] - v['-'] };
}

/** Scale every arrow by `k` and round down (used for the Midpoint marker). */
export function velocityFloorHalf(v: Velocity): Velocity {
  const out: Record<VectorDirection, number> = { ...ZERO_VELOCITY };
  for (const d of VECTOR_DIRECTIONS) out[d] = Math.floor(v[d] / 2);
  return out;
}

export interface ConsolidationStep {
  /** '180': opposed vectors cancel. '120': the smaller is folded into the direction between. */
  readonly kind: '180' | '120';
  readonly pair: readonly [VectorDirection, VectorDirection];
  readonly amount: number;
  /** For 120° steps, the direction the smaller vector was copied into. */
  readonly into?: MapDirection;
  readonly after: Velocity;
}

/**
 * Consolidate per the Reference Card (RULES.md §8): all 180° pairs first, then 120° pairs.
 *
 * 120° rule: copy the smaller vector one hex side closer to the larger and add it there, then
 * subtract the smaller from both originals. Where two pairs are equally eligible the choice is
 * arbitrary but must be declared; this implementation always takes the first pair in A…F order,
 * so the result is deterministic. The steps are returned so the UI can show the working.
 */
export function consolidate(input: Velocity): { velocity: Velocity; steps: ConsolidationStep[] } {
  const v: Record<VectorDirection, number> = { ...input };
  const steps: ConsolidationStep[] = [];

  const cancel180 = (): void => {
    const vert = Math.min(v['+'], v['-']);
    if (vert > 0) {
      v['+'] -= vert;
      v['-'] -= vert;
      steps.push({ kind: '180', pair: ['+', '-'], amount: vert, after: { ...v } });
    }
    for (const d of ['A', 'B', 'C'] as const) {
      const o = oppositeDirection(d);
      const m = Math.min(v[d], v[o]);
      if (m > 0) {
        v[d] -= m;
        v[o] -= m;
        steps.push({ kind: '180', pair: [d, o], amount: m, after: { ...v } });
      }
    }
  };

  const fold120Once = (): boolean => {
    for (const d1 of MAP_DIRECTIONS) {
      for (const d2 of MAP_DIRECTIONS) {
        if (directionIndex(d2) <= directionIndex(d1) || directionAngle(d1, d2) !== 120) continue;
        if (v[d1] === 0 || v[d2] === 0) continue;
        const amount = Math.min(v[d1], v[d2]);
        // the single direction 60° from both: one step clockwise of the earlier direction,
        // unless the pair wraps around (A and E), where it is F.
        const into = directionIndex(d2) - directionIndex(d1) === 2 ? directionAt(directionIndex(d1) + 1) : directionAt(directionIndex(d1) - 1);
        v[into] += amount;
        v[d1] -= amount;
        v[d2] -= amount;
        steps.push({ kind: '120', pair: [d1, d2], amount, into, after: { ...v } });
        return true;
      }
    }
    return false;
  };

  cancel180();
  while (fold120Once()) cancel180();
  return { velocity: v, steps };
}

/**
 * The unique consolidated velocity with a given net motion: at most two adjacent map
 * directions plus one vertical direction. Useful for checking consolidation and for
 * building velocities from a desired motion.
 */
export function velocityFromMotion(hex: Cube, alt: number): Velocity {
  const out: Record<VectorDirection, number> = { ...ZERO_VELOCITY };
  if (alt > 0) out['+'] = alt;
  if (alt < 0) out['-'] = -alt;
  if (hex.x !== 0 || hex.y !== 0 || hex.z !== 0) {
    // decompose via the two adjacent directions (see direction.decomposeCube; inlined to avoid a cycle)
    for (let i = 0; i < 6; i++) {
      const a = directionAt(i);
      const b = directionAt(i + 1);
      const da = DIRECTION_CUBE[a];
      const db = DIRECTION_CUBE[b];
      const det = da.x * db.y - db.x * da.y;
      const na = Math.round((hex.x * db.y - hex.y * db.x) / det);
      const nb = Math.round((da.x * hex.y - da.y * hex.x) / det);
      if (na >= 0 && nb >= 0 && na * da.x + nb * db.x === hex.x && na * da.y + nb * db.y === hex.y) {
        out[a] += na;
        out[b] += nb;
        break;
      }
    }
  }
  return out;
}

/** Human-readable form like "2 in A, 3 in +" (RULES.md notation). */
export function formatVelocity(v: Velocity): string {
  const parts = VECTOR_DIRECTIONS.filter((d) => v[d] !== 0).map((d) => `${v[d]} in ${d}`);
  return parts.length ? parts.join(', ') : 'stationary';
}
