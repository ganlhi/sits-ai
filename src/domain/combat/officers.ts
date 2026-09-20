/**
 * Officer and crew grade effects on combat (RULES.md §19.2, D1.14) and Crew Quality checks.
 */
import type { Grade, ShipClass } from '../ssd';
import { DIST_2D10_MINUS, roll2d10minus, type Dist, type Rng } from './dice';

/** Tactical Officer: MQL of all missiles the ship launches (lower is better for the attacker). */
export function tacMqlModifier(g: Grade): number {
  return { poor: 1, average: 0, veteran: -1, elite: -2 }[g];
}

/** Electronic Warfare Officer: ECM value used in the ECM layer. */
export function ewoEcmModifier(g: Grade): number {
  return { poor: -1, average: 0, veteran: 1, elite: 2 }[g];
}

/** Assistant Tactical Officer: probable kills. Poor's −1 never takes CM below 1 (applied by the caller). */
export function atoModifiers(g: Grade): { cm: number; pd: number } {
  return { poor: { cm: -1, pd: 0 }, average: { cm: 0, pd: 0 }, veteran: { cm: 1, pd: 0 }, elite: { cm: 1, pd: 1 } }[g];
}

export function adjustedCmKills(probableKills: number, g: Grade): number {
  if (probableKills <= 0) return 0;
  const m = atoModifiers(g).cm;
  return m < 0 ? Math.max(1, probableKills + m) : probableKills + m;
}

export function adjustedPdKills(probableKills: number, g: Grade): number {
  return probableKills <= 0 ? 0 : probableKills + atoModifiers(g).pd;
}

/** Crew Quality target: roll 2d10− ≤ target succeeds (D1.11, C6.1 example: Average on 5 or less). */
export function crewQualityTarget(cls: ShipClass, crew: Grade): number {
  return cls.crewQualityTarget[crew];
}

export function crewQualityCheck(rng: Rng, target: number): { roll: number; success: boolean } {
  const roll = roll2d10minus(rng).value;
  return { roll, success: roll <= target };
}

export function crewQualitySuccessChance(target: number): number {
  let p = 0;
  for (const [v, pr] of DIST_2D10_MINUS as Dist) if (v <= target) p += pr;
  return p;
}
