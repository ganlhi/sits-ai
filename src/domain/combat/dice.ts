/**
 * SITS dice and their distributions.
 *
 * A d10 shows 0–9. The book's notations, as reconstructed from the tables and examples:
 *   2d10−   the difference between two d10, 0…9. A "natural 0" is possible (C5.213); the grade
 *           table's "0: if both dice were odd, Poor" only makes sense for equal dice (D1.12).
 *   2d10+   the sum of two d10 read 1–10, 2…20 — the hit location table's rows and columns.
 *   3d10-low / -high / -medium   three d10 read 1–10, take the lowest / highest / middle
 *           [verify: whether these read 0–9 or 1–10; 1–10 keeps "3d10-low hits" ≥ 1].
 *
 * Every roll has a sampler (for `resolve`) and a distribution (for `expect`).
 */

export interface Rng {
  /** Uniform in [0, 1). */
  next(): number;
}

/** Small, fast, seedable PRNG (mulberry32) so resolutions are reproducible. */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return {
    next() {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
  };
}

export const systemRng: Rng = { next: () => Math.random() };

/** One d10, 0–9. */
export const d10 = (rng: Rng): number => Math.floor(rng.next() * 10);

/** One d10 read 1–10 (a 0 reads as 10). */
export const d10face = (rng: Rng): number => d10(rng) + 1;

export function roll2d10minus(rng: Rng): { value: number; dice: [number, number] } {
  const a = d10(rng);
  const b = d10(rng);
  return { value: Math.abs(a - b), dice: [a, b] };
}

export const roll2d10plus = (rng: Rng): number => d10face(rng) + d10face(rng);

export function roll3d10(rng: Rng, pick: 'low' | 'high' | 'medium'): number {
  const d = [d10face(rng), d10face(rng), d10face(rng)].sort((x, y) => x - y);
  return pick === 'low' ? d[0]! : pick === 'high' ? d[2]! : d[1]!;
}

// ---------------------------------------------------------------------------------------------
// Distributions: value → probability

export type Dist = ReadonlyMap<number, number>;

export const point = (v: number): Dist => new Map([[v, 1]]);

export function fromWeights(entries: Iterable<readonly [number, number]>): Dist {
  const m = new Map<number, number>();
  let total = 0;
  for (const [v, w] of entries) {
    if (w <= 0) continue;
    m.set(v, (m.get(v) ?? 0) + w);
    total += w;
  }
  for (const [v, w] of m) m.set(v, w / total);
  return m;
}

export function mapDist(d: Dist, f: (v: number) => number): Dist {
  const m = new Map<number, number>();
  for (const [v, p] of d) {
    const k = f(v);
    m.set(k, (m.get(k) ?? 0) + p);
  }
  return m;
}

export function combine(a: Dist, b: Dist, f: (x: number, y: number) => number): Dist {
  const m = new Map<number, number>();
  for (const [x, px] of a) for (const [y, py] of b) {
    const k = f(x, y);
    m.set(k, (m.get(k) ?? 0) + px * py);
  }
  return m;
}

/** Feed each outcome of `a` into a function returning a distribution. */
export function bind(a: Dist, f: (x: number) => Dist): Dist {
  const m = new Map<number, number>();
  for (const [x, px] of a) for (const [y, py] of f(x)) m.set(y, (m.get(y) ?? 0) + px * py);
  return m;
}

export function mean(d: Dist): number {
  let s = 0;
  for (const [v, p] of d) s += v * p;
  return s;
}

export function probAtLeast(d: Dist, k: number): number {
  let s = 0;
  for (const [v, p] of d) if (v >= k) s += p;
  return s;
}

export function probOf(d: Dist, v: number): number {
  return d.get(v) ?? 0;
}

/** Draw one value from a distribution. */
export function sample(d: Dist, rng: Rng): number {
  let r = rng.next();
  let last = 0;
  for (const [v, p] of d) {
    last = v;
    if (r < p) return v;
    r -= p;
  }
  return last;
}

export const DIST_D10: Dist = fromWeights(Array.from({ length: 10 }, (_, i) => [i, 1] as const));

export const DIST_2D10_MINUS: Dist = (() => {
  const w: [number, number][] = [];
  for (let a = 0; a < 10; a++) for (let b = 0; b < 10; b++) w.push([Math.abs(a - b), 1]);
  return fromWeights(w);
})();

export const DIST_2D10_PLUS: Dist = (() => {
  const w: [number, number][] = [];
  for (let a = 1; a <= 10; a++) for (let b = 1; b <= 10; b++) w.push([a + b, 1]);
  return fromWeights(w);
})();

function dist3d10(pick: 'low' | 'high' | 'medium'): Dist {
  const w: [number, number][] = [];
  for (let a = 1; a <= 10; a++) for (let b = 1; b <= 10; b++) for (let c = 1; c <= 10; c++) {
    const s = [a, b, c].sort((x, y) => x - y);
    w.push([pick === 'low' ? s[0]! : pick === 'high' ? s[2]! : s[1]!, 1]);
  }
  return fromWeights(w);
}

export const DIST_3D10_LOW: Dist = dist3d10('low');
export const DIST_3D10_HIGH: Dist = dist3d10('high');
export const DIST_3D10_MEDIUM: Dist = dist3d10('medium');
