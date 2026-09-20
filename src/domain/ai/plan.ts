/**
 * Plotting the AI ships: every legal pivot/roll/thrust within the ship's ratings (as the BDA
 * leaves them), scored by the Evaluator, the best kept. Deterministic for a game and turn, so
 * revealing twice on the same reports gives the same orders.
 */
import { allThrustOptions, facingAfter, pivotOptions, windowLabel, type AvidWindow, type Maneuver } from '../geometry';
import { isOutOfAction, maneuverRatings, shipClassOf, type Doctrine, type Game, type Orders, type Ship } from '../game';
import { DOCTRINE_WEIGHTS } from './doctrine';
import { Evaluator, type Candidate, type Evaluation } from './evaluate';
import { hashSeed, seededRng, type Rng } from './rng';

export interface AiPlan {
  readonly orders: Orders;
  readonly evaluation: Evaluation;
  readonly candidatesConsidered: number;
  readonly doctrine: Doctrine;
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

/** Every legal pivot/roll/thrust combination within the ratings, deduplicated and capped. */
export function generateCandidates(ship: Ship, maxCandidates = 1200, rng: Rng = seededRng(1)): Candidate[] {
  const limits = maneuverRatings(shipClassOf(ship), ship.bda);
  const pivots: (AvidWindow | undefined)[] = [undefined];
  const seen = new Set<string>();
  for (let n = 1; n <= limits.pivot; n++) {
    for (const w of pivotOptions(ship.attitude, n)) {
      const k = windowLabel(w);
      if (!seen.has(k)) {
        seen.add(k);
        pivots.push(w);
      }
    }
  }
  const out: Candidate[] = [];
  for (const pivotTo of pivots) {
    for (const roll of ROLLS) {
      if (roll && roll.windows > limits.roll) continue;
      const maneuver: Maneuver = { ...(pivotTo ? { pivotTo } : {}), ...(roll ? { roll } : {}) };
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

/** Plan one ship's turn. */
export function planOrders(game: Game, ship: Ship, seed = 1): AiPlan {
  const rng = seededRng(seed);
  const weights = DOCTRINE_WEIGHTS[ship.doctrine];
  const evaluator = new Evaluator(game, ship, weights, () => rng.next());
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
    launches: best.launches,
    rationale: rationaleFor(evaluator, best, ship.doctrine),
  };
  return { orders, evaluation: best, candidatesConsidered: candidates.length, doctrine: ship.doctrine };
}

function rationaleFor(evaluator: Evaluator, e: Evaluation, doctrine: Doctrine): string {
  const b = e.breakdown;
  const c = e.candidate;
  const parts: string[] = [];
  if (b.dealt > 0) parts.push(`expects to deal ≈${Math.round(b.dealt)} damage`);
  if (evaluator.hasFoes) parts.push(b.received > 0 ? `take ≈${Math.round(b.received)}` : 'take none');
  if (b.wedgedSalvoes > 0) parts.push(`shows the wedge to ${b.wedgedSalvoes} incoming salvo${b.wedgedSalvoes === 1 ? '' : 'es'}`);
  if (e.eotRangeToNearest !== null) parts.push(`ends the turn at range ${e.eotRangeToNearest}`);
  if (c.maneuver.pivotTo && c.thrustUsed > 0) parts.push('pivots and thrusts, forfeiting displacement');
  else if (c.maneuver.pivotTo) parts.push('pivots without thrust');
  else if (c.thrustUsed > 0) parts.push('holds Forward to keep displacement');
  else if (c.maneuver.roll) parts.push('only rolls');
  else parts.push('holds attitude and drifts');
  return `${doctrine}: ${parts.join(', ')}${evaluator.hasFoes ? '' : ' — no enemy in play'}.`;
}

/** The seed for a game and turn: the same reports always give the same reveal. */
export const turnSeed = (game: Game): number => hashSeed(`${game.id}:${game.turn}`);

/** Plot every AI ship still in action and mark the turn revealed. */
export function planAll(game: Game): Game {
  const seed = turnSeed(game);
  const ships = game.ships.map((s, i) => (s.controller === 'ai' && !isOutOfAction(s) ? { ...s, orders: planOrders(game, s, seed + i).orders } : { ...s, orders: null }));
  return { ...game, ships, revealed: true };
}
