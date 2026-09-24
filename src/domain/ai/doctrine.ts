/**
 * Doctrines and postures.
 *
 * A doctrine is the personality the player gives an AI ship. A posture is what the situation
 * makes of it: comparing the ship's own damage and size with the enemy's tells it whether to
 * press, hold, hang back or run. The two combine into the weights the evaluator scores with.
 *
 * Damage terms are fractions of a fleet's cost destroyed in the turn, so a weight of 1 on a
 * term worth 0.1 is "ten percent of the enemy".
 */
import { missileReach, overallDamage, power, type Doctrine, type Ship } from '../game';

/** Where the ship wants to end the turn, in terms of its own bands. */
export type RangeGoal = 'close' | 'medium' | 'long' | 'open' | null;

export interface Weights {
  /** Multiplier on the fraction of the enemy expected destroyed. */
  readonly offense: number;
  /** Multiplier on the fraction of ourselves expected destroyed. */
  readonly defense: number;
  readonly rangeGoal: RangeGoal;
  /** Penalty per hex away from the goal range. */
  readonly rangeWeight: number;
  /** Bonus for a broadside still bearing on the enemy at End of Turn, scaled by its effectiveness. */
  readonly bearingNextTurn: number;
  /** Bonus per enemy salvo that would arrive through our wedge. */
  readonly wedge: number;
  /** Noise added to scores so the opponent is not exploitable by pattern. */
  readonly noise: number;
}

export const DOCTRINE_WEIGHTS: Readonly<Record<Doctrine, Weights>> = {
  balanced: { offense: 1, defense: 1, rangeGoal: null, rangeWeight: 0.015, bearingNextTurn: 0.15, wedge: 0.1, noise: 0.04 },
  missileDuel: { offense: 1, defense: 1.2, rangeGoal: 'medium', rangeWeight: 0.03, bearingNextTurn: 0.2, wedge: 0.1, noise: 0.04 },
  closeToBeams: { offense: 1.3, defense: 0.7, rangeGoal: 'close', rangeWeight: 0.04, bearingNextTurn: 0.2, wedge: 0.05, noise: 0.04 },
  evade: { offense: 0.4, defense: 1.8, rangeGoal: 'open', rangeWeight: 0.03, bearingNextTurn: 0.05, wedge: 0.3, noise: 0.03 },
};

export type Posture = 'aggressive' | 'balanced' | 'cautious' | 'defensive';

interface PostureModifier {
  readonly offense: number;
  readonly defense: number;
  readonly wedge: number;
  /** The range a doctrine without a goal of its own adopts. */
  readonly rangeGoal: RangeGoal;
}

export const POSTURE_MODIFIERS: Readonly<Record<Posture, PostureModifier>> = {
  aggressive: { offense: 1.3, defense: 0.8, wedge: 0.7, rangeGoal: 'close' },
  balanced: { offense: 1, defense: 1, wedge: 1, rangeGoal: 'medium' },
  cautious: { offense: 0.8, defense: 1.3, wedge: 1.3, rangeGoal: 'long' },
  defensive: { offense: 0.5, defense: 1.8, wedge: 2, rangeGoal: 'open' },
};

/**
 * Own damage against the enemy's, and own size against theirs. A fresh battlecruiser facing a
 * hurt cruiser presses; a hurt cruiser facing the battlecruiser runs.
 */
export function postureFor(me: Ship, enemies: readonly Ship[]): Posture {
  if (!enemies.length) return 'balanced';
  const enemyPower = enemies.reduce((s, e) => s + power(e), 0);
  const enemyHurt = enemies.reduce((s, e) => s + overallDamage(e.bda) * power(e), 0) / enemyPower;
  const myHurt = overallDamage(me.bda);
  const advantage = (enemyHurt - myHurt) * 0.75 + Math.log2(power(me) / enemyPower);
  if (myHurt >= 3 && advantage < 1) return 'defensive';
  if (advantage >= 0.75) return 'aggressive';
  if (advantage <= -2) return 'defensive';
  if (advantage <= -0.5) return 'cautious';
  return 'balanced';
}

export function effectiveWeights(doctrine: Doctrine, posture: Posture): Weights {
  const d = DOCTRINE_WEIGHTS[doctrine];
  const p = POSTURE_MODIFIERS[posture];
  return { ...d, offense: d.offense * p.offense, defense: d.defense * p.defense, wedge: d.wedge * p.wedge, rangeGoal: d.rangeGoal ?? p.rangeGoal };
}

/** The End-of-Turn range a goal means for this ship against these enemies. */
export function goalRange(goal: RangeGoal, me: Ship, enemies: readonly Ship[]): number | null {
  const b = me.shipClass.bands;
  switch (goal) {
    case 'close':
      return 2;
    case 'medium':
      return Math.round((b.medium.min + b.medium.max) / 2);
    case 'long':
      return Math.round((b.long.min + b.long.max) / 2);
    case 'open':
      return Math.max(missileReach(me.shipClass), ...enemies.map((e) => missileReach(e.shipClass))) + 2;
    case null:
      return null;
  }
}
