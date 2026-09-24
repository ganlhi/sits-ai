/**
 * Plotting the AI ships: every legal pivot/roll/thrust within the ship's current ratings,
 * scored by the Evaluator, the best kept (step 2). Shooting: with that plot fixed and every
 * EoT marker displaced, the launches (step 3). Deterministic for a game and turn, so plotting
 * twice on the same reports gives the same orders.
 */
import { ALL_WINDOWS, allThrustOptions, facingAfter, maneuverPivots, markers, pivotSteps, shortestPath, windowKey, type AvidWindow, type Maneuver } from '../geometry';
import { isOutOfAction, withHistory, type Game, type Launch, type Orders, type Ship } from '../game';
import type { Posture } from './doctrine';
import { Evaluator, type Candidate, type Evaluation } from './evaluate';
import { hashSeed, seededRng, type Rng } from './rng';

export interface AiPlan {
  readonly orders: Orders;
  readonly evaluation: Evaluation;
  readonly candidatesConsidered: number;
  readonly posture: Posture;
}

/** Roll options tried with every pivot: none, then up to three windows either way. */
const ROLLS: readonly (Maneuver['roll'] | undefined)[] = [
  undefined,
  { windows: 1, direction: 'port' },
  { windows: 1, direction: 'starboard' },
  { windows: 2, direction: 'port' },
  { windows: 2, direction: 'starboard' },
  { windows: 3, direction: 'port' },
  { windows: 3, direction: 'starboard' },
];

/**
 * Every legal pivot/roll/thrust combination within the ship's ratings, deduplicated and capped.
 * A pivot is written as the shortest path on the card to each window the pivot rating reaches
 * (avidGraph.ts); the AI takes no detours.
 */
export function generateCandidates(ship: Ship, maxCandidates = 1200, rng: Rng = seededRng(1)): Candidate[] {
  const limits = ship.ratings;
  const from = markers(ship.attitude).forward;
  const pivots: (readonly AvidWindow[] | undefined)[] = [undefined];
  for (const w of ALL_WINDOWS) {
    if (windowKey(w) === windowKey(from)) continue;
    const n = pivotSteps(from, w);
    if (n >= 1 && n <= limits.pivot) pivots.push(shortestPath(from, w));
  }
  const out: Candidate[] = [];
  for (const pivotPath of pivots) {
    for (const roll of ROLLS) {
      if (roll && roll.windows > limits.roll) continue;
      const maneuver: Maneuver = { ...(pivotPath ? { pivotPath } : {}), ...(roll ? { roll } : {}) };
      const facing = facingAfter(ship.attitude, maneuver, 0.5);
      for (const plot of allThrustOptions(limits.thrust, facing)) out.push({ maneuver, thrust: plot.delta, thrustUsed: plot.thrust });
    }
  }
  if (out.length <= maxCandidates) return out;
  // prefer the no-thrust and full-thrust options, sample the rest
  const shuffle = <T,>(xs: T[]): T[] => {
    for (let i = xs.length - 1; i > 0; i--) {
      const j = Math.floor(rng.next() * (i + 1));
      [xs[i], xs[j]] = [xs[j]!, xs[i]!];
    }
    return xs;
  };
  const isEdge = (c: Candidate): boolean => c.thrustUsed === 0 || c.thrustUsed === limits.thrust;
  const keep = shuffle(out.filter(isEdge)).slice(0, maxCandidates);
  const rest = shuffle(out.filter((c) => !isEdge(c)));
  return [...keep, ...rest.slice(0, Math.max(0, maxCandidates - keep.length))];
}

/** Plan one ship's movement. The evaluation's launches are what it expects to fire, not orders yet. */
export function planOrders(game: Game, ship: Ship, seed = 1): AiPlan {
  const rng = seededRng(seed);
  const evaluator = new Evaluator(game, ship, () => rng.next());
  const candidates = generateCandidates(ship, 1200, seededRng(seed + 7));
  let best: Evaluation | null = null;
  for (const c of candidates) {
    const e = evaluator.evaluate(c);
    if (!best || e.breakdown.total > best.breakdown.total) best = e;
  }
  if (!best) throw new Error('no candidates');
  const orders: Orders = {
    maneuver: best.candidate.maneuver,
    thrust: best.candidate.thrust,
    thrustUsed: best.candidate.thrustUsed,
    launches: null,
    rationale: rationaleFor(evaluator, best),
  };
  return { orders, evaluation: best, candidatesConsidered: candidates.length, posture: evaluator.posture };
}

const pct = (x: number): string => `${Math.round(x * 100)} %`;

function rationaleFor(evaluator: Evaluator, e: Evaluation): string {
  const b = e.breakdown;
  const c = e.candidate;
  const parts: string[] = [];
  if (evaluator.hasFoes) {
    parts.push(b.dealt > 0 ? `expects to deal ≈${pct(b.dealt)} of the enemy` : 'expects to deal nothing');
    parts.push(b.received > 0 ? `take ≈${pct(b.received)} of itself` : 'take nothing');
  }
  if (b.wedgedSalvoes > 0) parts.push(`shows the wedge to ${b.wedgedSalvoes} incoming salvo${b.wedgedSalvoes === 1 ? '' : 'es'}`);
  if (e.eotRangeToNearest !== null) parts.push(`ends the turn at range ${e.eotRangeToNearest}${evaluator.goal !== null ? ` (wants ${evaluator.goal})` : ''}`);
  if (maneuverPivots(c.maneuver) && c.thrustUsed > 0) parts.push('pivots and thrusts, forfeiting displacement');
  else if (maneuverPivots(c.maneuver)) parts.push('pivots without thrust');
  else if (c.thrustUsed > 0) parts.push('holds Forward to keep displacement');
  else if (c.maneuver.roll) parts.push('only rolls');
  else parts.push('holds attitude and drifts');
  const head = evaluator.hasFoes ? `${evaluator.ship.doctrine}, ${evaluator.posture}` : `${evaluator.ship.doctrine}, no enemy in play`;
  return `${head}: ${parts.join(', ')}.`;
}

/** The seed for a game and turn: the same reports always give the same reveal. */
export const turnSeed = (game: Game): number => hashSeed(`${game.id}:${game.turn}`);

/**
 * AI plotting (step 2): plot pivot, roll and thrust for every AI ship still in action, from the
 * start-of-turn reports only. Every AI ship plots on the same game, so none sees another's plot.
 */
export function planMovement(game: Game): Game {
  if (game.phase !== 'report') return game;
  const seed = turnSeed(game);
  const ships = game.ships.map((s, i) => (s.controller === 'ai' && !isOutOfAction(s) ? { ...s, orders: planOrders(game, s, seed + i).orders } : { ...s, orders: null }));
  return { ...withHistory(game), phase: 'plotted', ships };
}

/** One ship's launches for its fixed plot, now that the EoT markers are known. */
export function planLaunches(game: Game, ship: Ship): Launch[] {
  const o = ship.orders;
  if (!o) return [];
  const evaluator = new Evaluator(game, ship, () => 0.5);
  return evaluator.evaluate({ maneuver: o.maneuver, thrust: o.thrust, thrustUsed: o.thrustUsed }).launches;
}

/**
 * AI shooting (step 3): with the plots fixed and every EoT marker displaced, choose each AI
 * ship's launches. Only the launches are added; the plot stays as it was.
 */
export function planFire(game: Game): Game {
  if (game.phase !== 'plotted') return game;
  const ships = game.ships.map((s) => (s.orders ? { ...s, orders: { ...s.orders, launches: planLaunches(game, s) } } : s));
  return { ...withHistory(game), phase: 'fired', ships };
}
