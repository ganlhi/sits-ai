/**
 * One turn of movement (RULES.md §3 steps 1–2, 5, 7, 9; §7.1, §7.3, §8).
 *
 *   step 1  Midpoint marker at position + half the vector; EoT marker at position + vector.
 *   step 2  Thrust is plotted; if the ship did not pivot the EoT marker is displaced by half
 *           the vector change, with half-hexes carried forward as the little triangles on the
 *           AVID (B3.27, B3.271).
 *   step 9  The vector change is added to the vectors and consolidated for next turn.
 */
import type { VectorDirection } from './direction';
import { VECTOR_DIRECTIONS } from './direction';
import { cubeAdd, type Position } from './hex';
import {
  ZERO_VELOCITY,
  consolidate,
  netMotion,
  velocityAdd,
  velocityFloorHalf,
  type ConsolidationStep,
  type Velocity,
} from './velocity';

export type EngineeringGrade = 'poor' | 'average' | 'veteran' | 'elite';

export interface MotionState {
  readonly position: Position;
  readonly velocity: Velocity;
  /** Directions with a half hex of displacement carried over from last turn. */
  readonly halfDisplacements: readonly VectorDirection[];
}

export interface TurnMotion {
  readonly midpoint: Position;
  readonly endOfTurn: Position;
  /** Extra movement of the EoT marker this turn. */
  readonly displacement: Velocity;
  /** Half hexes carried into next turn. */
  readonly carriedHalves: readonly VectorDirection[];
  /** Velocity for next turn, after adding the vector change and consolidating. */
  readonly newVelocity: Velocity;
  readonly consolidation: readonly ConsolidationStep[];
}

export function positionPlus(p: Position, v: Velocity): Position {
  const m = netMotion(v);
  return { hex: cubeAdd(p.hex, m.hex), alt: p.alt + m.alt };
}

/**
 * Displacement from a vector change (B3.27, B3.271–272, D1.145).
 * - Half the change in each direction; a pivoting ship gets none (B4.313).
 * - A half hex completes a half carried from last turn in the same direction; otherwise it is
 *   carried forward. Carried halves survive only while the ship keeps thrusting that way.
 * - Poor engineers lose all half hexes; Veteran and Elite round them up immediately.
 */
export function displacementFor(
  delta: Velocity,
  pivoted: boolean,
  carried: readonly VectorDirection[],
  eng: EngineeringGrade = 'average',
): { displacement: Velocity; carriedHalves: VectorDirection[] } {
  if (pivoted) return { displacement: ZERO_VELOCITY, carriedHalves: [] };
  const displacement: Record<VectorDirection, number> = { ...ZERO_VELOCITY };
  const carriedHalves: VectorDirection[] = [];
  for (const d of VECTOR_DIRECTIONS) {
    const n = delta[d];
    if (n === 0) continue;
    let full = Math.floor(n / 2);
    const half = n % 2 === 1;
    const hadHalf = carried.includes(d);
    if (half) {
      if (eng === 'veteran' || eng === 'elite' || hadHalf) full += 1;
      else if (eng !== 'poor') carriedHalves.push(d);
    } else if (hadHalf && eng !== 'poor') {
      carriedHalves.push(d);
    }
    displacement[d] = full;
  }
  return { displacement, carriedHalves };
}

export function planMotion(state: MotionState, delta: Velocity, pivoted: boolean, eng: EngineeringGrade = 'average'): TurnMotion {
  const midpoint = positionPlus(state.position, velocityFloorHalf(state.velocity));
  const { displacement, carriedHalves } = displacementFor(delta, pivoted, state.halfDisplacements, eng);
  const endOfTurn = positionPlus(positionPlus(state.position, state.velocity), displacement);
  const { velocity: newVelocity, steps } = consolidate(velocityAdd(state.velocity, delta));
  return { midpoint, endOfTurn, displacement, carriedHalves, newVelocity, consolidation: steps };
}

/** The state at the start of next turn. */
export function advance(state: MotionState, motion: TurnMotion): MotionState {
  return { position: motion.endOfTurn, velocity: motion.newVelocity, halfDisplacements: motion.carriedHalves };
}
