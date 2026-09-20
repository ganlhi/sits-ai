/**
 * Doctrines (PLAN.md Phase 6): the weights that turn the expectation layer's numbers into a
 * preference. They encode the tensions of RULES.md §24 — the wedge protects but cripples the
 * active defenses, pivoting forfeits displacement, closing to beam range crosses the enemy's
 * best missile envelope, and whoever controls the range controls the salvo count.
 */
import type { Doctrine } from '../game/types';

export type { Doctrine };
export { DOCTRINES } from '../game/types';

export interface DoctrineWeights {
  /** Multiplier on expected boxes dealt. */
  readonly offense: number;
  /** Multiplier on expected boxes received. */
  readonly defense: number;
  /** Range (EoT to EoT) the doctrine wants to sit at, or null for no preference. */
  readonly preferredRange: number | null;
  /** Penalty per hex away from the preferred range. */
  readonly rangeWeight: number;
  /** Bonus for a broadside still bearing on the enemy at End of Turn. */
  readonly bearingNextTurn: number;
  /** Bonus for having the wedge between us and the enemy at impact times. */
  readonly wedge: number;
  /** Noise added to scores so the opponent is not exploitable by pattern. */
  readonly noise: number;
}

export const DOCTRINE_WEIGHTS: Readonly<Record<Doctrine, DoctrineWeights>> = {
  balanced: { offense: 1, defense: 1, preferredRange: null, rangeWeight: 0, bearingNextTurn: 1.5, wedge: 0.5, noise: 0.4 },
  missileDuel: { offense: 1, defense: 1.2, preferredRange: 14, rangeWeight: 0.6, bearingNextTurn: 2, wedge: 0.5, noise: 0.4 },
  closeToBeams: { offense: 1.3, defense: 0.7, preferredRange: 2, rangeWeight: 0.8, bearingNextTurn: 2, wedge: 0.2, noise: 0.4 },
  evade: { offense: 0.4, defense: 1.8, preferredRange: 28, rangeWeight: 0.5, bearingNextTurn: 0.5, wedge: 1.5, noise: 0.3 },
};

export const DOCTRINE_LABELS: Readonly<Record<Doctrine, string>> = {
  balanced: 'Balanced — trade fire, keep a broadside on the enemy',
  missileDuel: 'Missile duel — hold the range where the salvo count favours us',
  closeToBeams: 'Close to beam range — accept the missile envelope to bring lasers and grasers to bear',
  evade: 'Evade — open the range, interpose the wedge, survive',
};
