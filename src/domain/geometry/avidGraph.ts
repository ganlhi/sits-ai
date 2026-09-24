/**
 * The AVID as the card prints it: which windows touch which. A pivot is a walk from window to
 * window along that card, one window a step, and the pivot rating is the number of steps. A
 * step may cross to a window sharing an edge freely; a step to a window touching only at a
 * corner (yellow to the blue window one column over) may be taken once in a pivot. Detours are
 * allowed, so the cost of a pivot is the length of the path taken, not the distance between its
 * ends; the distances here are the least a path can cost.
 *
 * Geometry of the card: the yellow and blue rings share twelve columns; the six green windows
 * are centred on the hex-edge columns and span sixty degrees each, so a blue corner window
 * (A/B) touches the two green windows either side of its column along an edge, and a blue edge
 * window (A) touches the one green window in its column. Every green window touches purple.
 */
import { ALL_WINDOWS, blue, green, purple, windowKey, windowLabel, yellow, type AvidWindow, type Hemisphere } from './avid';

const mod12 = (n: number): number => ((n % 12) + 12) % 12;

/** Windows sharing an edge with `w`: a pivot step that is not diagonal. */
export function edgeNeighbours(w: AvidWindow): AvidWindow[] {
  switch (w.ring) {
    case 'yellow':
      return [yellow(w.az - 1), yellow(w.az + 1), blue(w.az, 'upper'), blue(w.az, 'lower')];
    case 'blue': {
      const out = [blue(w.az - 1, w.hemi), blue(w.az + 1, w.hemi), yellow(w.az)];
      if (w.az % 2 === 0) out.push(green(w.az, w.hemi));
      else out.push(green(w.az - 1, w.hemi), green(w.az + 1, w.hemi));
      return out;
    }
    case 'green': {
      const out = [green(w.az - 2, w.hemi), green(w.az + 2, w.hemi), purple(w.hemi), blue(w.az, w.hemi), blue(w.az - 1, w.hemi), blue(w.az + 1, w.hemi)];
      return out;
    }
    case 'purple':
      return [0, 2, 4, 6, 8, 10].map((az) => green(az, w.hemi));
  }
}

/** Windows touching `w` only at a corner: the diagonal step, allowed once in a pivot. */
export function cornerNeighbours(w: AvidWindow): AvidWindow[] {
  switch (w.ring) {
    case 'yellow':
      return (['upper', 'lower'] as Hemisphere[]).flatMap((h) => [blue(w.az - 1, h), blue(w.az + 1, h)]);
    case 'blue':
      return [yellow(mod12(w.az - 1)), yellow(mod12(w.az + 1))];
    default:
      return [];
  }
}

export type StepKind = 'edge' | 'corner';

/** How a pivot step from `a` to `b` crosses the card, or null when the two windows do not touch. */
export function stepKind(a: AvidWindow, b: AvidWindow): StepKind | null {
  const bk = windowKey(b);
  if (edgeNeighbours(a).some((w) => windowKey(w) === bk)) return 'edge';
  if (cornerNeighbours(a).some((w) => windowKey(w) === bk)) return 'corner';
  return null;
}

/** Why a pivot path is not one the card allows, in the player's words; empty when it is fine. */
export function pathProblems(start: AvidWindow, path: readonly AvidWindow[]): string[] {
  const out: string[] = [];
  let diagonals = 0;
  let at = start;
  path.forEach((w, i) => {
    const kind = stepKind(at, w);
    if (!kind) out.push(`Step ${i + 1}: ${windowLabel(w)} does not touch ${windowLabel(at)}.`);
    else if (kind === 'corner' && ++diagonals === 2) out.push(`Step ${i + 1} is a second diagonal step; a pivot may take one.`);
    at = w;
  });
  return out;
}

interface Reach {
  /** Fewest steps with no diagonal. */
  readonly straight: number;
  /** Fewest steps with at most one diagonal. */
  readonly withDiagonal: number;
}

const reachCache = new Map<string, ReadonlyMap<string, Reach>>();

/** Fewest steps from `from` to every window, with and without one diagonal step. */
function reachFrom(from: AvidWindow): ReadonlyMap<string, Reach> {
  const k = windowKey(from);
  const hit = reachCache.get(k);
  if (hit) return hit;
  // state: (window, diagonal used?) — a breadth-first search over 100 states
  const dist = new Map<string, number>();
  const queue: { w: AvidWindow; used: boolean }[] = [{ w: from, used: false }];
  dist.set(`${k}|0`, 0);
  for (let i = 0; i < queue.length; i++) {
    const { w, used } = queue[i]!;
    const d = dist.get(`${windowKey(w)}|${used ? 1 : 0}`)!;
    const push = (n: AvidWindow, nUsed: boolean) => {
      const nk = `${windowKey(n)}|${nUsed ? 1 : 0}`;
      if (!dist.has(nk)) {
        dist.set(nk, d + 1);
        queue.push({ w: n, used: nUsed });
      }
    };
    for (const n of edgeNeighbours(w)) push(n, used);
    if (!used) for (const n of cornerNeighbours(w)) push(n, true);
  }
  const out = new Map<string, Reach>();
  for (const w of ALL_WINDOWS) {
    const wk = windowKey(w);
    const straight = dist.get(`${wk}|0`) ?? Infinity;
    const diagonal = dist.get(`${wk}|1`) ?? Infinity;
    out.set(wk, { straight, withDiagonal: Math.min(straight, diagonal) });
  }
  reachCache.set(k, out);
  return out;
}

/** Fewest windows a pivot from `a` to `b` costs, one diagonal step allowed. */
export function pivotSteps(a: AvidWindow, b: AvidWindow): number {
  return reachFrom(a).get(windowKey(b))!.withDiagonal;
}

export interface PivotPath {
  /** Fewest windows the whole pivot costs. */
  readonly total: number;
  /** Start to Midpoint, Midpoint to End of Turn, on that cheapest path. */
  readonly legs: readonly [number, number];
}

/** Fewest windows a pivot from `a` through `m` to `b` costs, with one diagonal step in all. */
export function pivotStepsVia(a: AvidWindow, m: AvidWindow, b: AvidWindow): PivotPath {
  const first = reachFrom(a).get(windowKey(m))!;
  const second = reachFrom(m).get(windowKey(b))!;
  const options: [number, number][] = [
    [first.straight, second.withDiagonal],
    [first.withDiagonal, second.straight],
  ];
  let best = options[0]!;
  for (const o of options) if (o[0] + o[1] < best[0] + best[1]) best = o;
  return { total: best[0] + best[1], legs: best };
}
