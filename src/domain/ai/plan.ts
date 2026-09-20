/**
 * Planning one AI ship's turn (PLAN.md Phase 6): doctrine-driven candidate generation, scoring
 * with the Evaluator, selection with a little noise, and the order sheet in the book's notation
 * with a one-line rationale. Orders are sealed with a hash so the player can see the AI
 * committed before they plotted.
 */
import {
  allThrustOptions,
  facingAfter,
  formatVelocity,
  markers,
  pivotOptions,
  windowLabel,
  windowsEqual,
  type AvidWindow,
  type Maneuver,
  type RollDirection,
} from '../geometry';
import { maneuverLimits, shipClassOf, thrustLimit, type GameState, type Launch, type ShipState, type TurnOrders } from '../game';
import { seededRng, type Rng } from '../combat';
import { DOCTRINE_WEIGHTS, type Doctrine } from './doctrine';
import { Evaluator, type Candidate, type Evaluation } from './evaluate';

export interface AiPlan {
  readonly orders: TurnOrders;
  readonly evaluation: Evaluation;
  readonly candidatesConsidered: number;
  readonly doctrine: Doctrine;
}

/** Roll options tried with every pivot: none, one window either way, and the half roll that swaps sidewalls. */
const ROLLS: readonly (Maneuver['roll'] | undefined)[] = [
  undefined,
  { windows: 1, direction: 'port' },
  { windows: 1, direction: 'starboard' },
  { windows: 2, direction: 'port' },
  { windows: 2, direction: 'starboard' },
  { windows: 3, direction: 'port' },
  { windows: 3, direction: 'starboard' },
];

/** Every legal pivot/roll/thrust combination within the ship's ratings, deduplicated. */
export function generateCandidates(game: GameState, ship: ShipState, maxCandidates = 900, rng: Rng = seededRng(1)): Candidate[] {
  const limits = maneuverLimits(game, ship);
  const maxThrust = thrustLimit(game, ship);
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
      for (const plot of allThrustOptions(maxThrust, facing)) out.push({ maneuver, thrust: plot.delta, thrustUsed: plot.thrust });
    }
  }
  if (out.length <= maxCandidates) return out;
  // keep every no-thrust and full-thrust option, sample the rest
  const keep = out.filter((c) => c.thrustUsed === 0 || c.thrustUsed === maxThrust);
  const rest = out.filter((c) => !(c.thrustUsed === 0 || c.thrustUsed === maxThrust));
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    [rest[i], rest[j]] = [rest[j]!, rest[i]!];
  }
  return [...keep, ...rest.slice(0, Math.max(0, maxCandidates - keep.length))];
}

/** Plan a ship's turn. Deterministic for a given seed. */
export function planOrders(game: GameState, shipId: string, doctrine: Doctrine = 'balanced', seed = 1): AiPlan {
  const ship = game.ships[shipId];
  if (!ship) throw new Error(`no ship ${shipId}`);
  const rng = seededRng(seed);
  const weights = DOCTRINE_WEIGHTS[doctrine];
  const evaluator = new Evaluator(game, ship, weights, () => rng.next());
  const candidates = generateCandidates(game, ship, 900, seededRng(seed + 7));
  let best: Evaluation | null = null;
  for (const c of candidates) {
    const e = evaluator.evaluate(c);
    if (!best || e.breakdown.total > best.breakdown.total) best = e;
  }
  if (!best) throw new Error('no candidates');
  const launches = best.launches;
  const orders: TurnOrders = {
    maneuver: best.candidate.maneuver,
    thrust: best.candidate.thrust,
    thrustUsed: best.candidate.thrustUsed,
    launches,
    rationale: rationaleFor(game, ship, best, doctrine),
  };
  return { orders, evaluation: best, candidatesConsidered: candidates.length, doctrine };
}

function rationaleFor(game: GameState, ship: ShipState, e: Evaluation, doctrine: Doctrine): string {
  const b = e.breakdown;
  const parts: string[] = [];
  if (b.dealt > 0) parts.push(`expects to deal ≈${b.dealt.toFixed(1)} boxes`);
  if (b.received > 0) parts.push(`take ≈${b.received.toFixed(1)}`);
  if (e.eotRangeToNearest !== null) parts.push(`ends the turn at range ${e.eotRangeToNearest}`);
  if (e.candidate.maneuver.pivotTo) parts.push('pivots to bring a mount to bear');
  else if (e.candidate.maneuver.roll) parts.push('rolls to change the facing presented');
  else parts.push('holds attitude to keep displacement');
  const foeCount = game.shipOrder.filter((id) => game.ships[id] && !game.ships[id]!.destroyed && game.ships[id]!.side !== ship.side).length;
  return `${doctrine}: ${parts.join(', ')}${foeCount === 0 ? ' — no enemy in play' : ''}.`;
}

/** The order sheet in the book's notation, one line per instruction. */
export function orderSheet(game: GameState, ship: ShipState, orders: TurnOrders): string[] {
  const cls = shipClassOf(game, ship);
  const lines: string[] = [];
  const m0 = markers(ship.attitude);
  const m1 = markers(facingAfter(ship.attitude, orders.maneuver, 1) ? { forward: ship.attitude.forward, top: ship.attitude.top } : ship.attitude);
  void m1;
  if (orders.maneuver.pivotTo) {
    const cost = pivotOptions(ship.attitude, 1).some((w) => windowsEqual(w, orders.maneuver.pivotTo!)) ? 1 : pivotOptions(ship.attitude, 2).some((w) => windowsEqual(w, orders.maneuver.pivotTo!)) ? 2 : 3;
    lines.push(`Pivot ${cost} window${cost === 1 ? '' : 's'}: Forward from ${windowLabel(m0.forward)} to ${windowLabel(orders.maneuver.pivotTo)}.`);
  } else {
    lines.push(`No pivot: Forward stays ${windowLabel(m0.forward)}.`);
  }
  if (orders.maneuver.roll) lines.push(`Roll ${orders.maneuver.roll.windows} window${orders.maneuver.roll.windows === 1 ? '' : 's'} to ${orders.maneuver.roll.direction as RollDirection}.`);
  else lines.push('No roll.');
  const facing = facingAfter(ship.attitude, orders.maneuver, 0.5);
  lines.push(orders.thrustUsed === 0 ? 'No thrust.' : `Thrust ${orders.thrustUsed} along the Midpoint facing ${windowLabel(facing)}: write ${formatVelocity(orders.thrust)} into the AVID arrows.`);
  for (const l of orders.launches ?? []) {
    const target = game.ships[l.targetId];
    lines.push(`Launch from the ${cls.mounts[l.mount].name}: ${l.missiles} tubes at ${target?.name ?? l.targetId}, ${l.timings.map((t) => t[0]!.toUpperCase() + t.slice(1)).join(' + ')} salvo${l.timings.length === 1 ? '' : 'es'}.`);
  }
  if (!(orders.launches ?? []).length) lines.push('No missile launch.');
  return lines;
}

/** FNV-1a hash of the orders, shown as the seal of commitment before the player plots. */
export function sealOf(orders: TurnOrders): string {
  const s = JSON.stringify({ m: orders.maneuver, t: orders.thrust, l: orders.launches ?? [] });
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0').toUpperCase();
}

export type { Launch };
