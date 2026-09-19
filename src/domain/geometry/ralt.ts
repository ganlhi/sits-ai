/**
 * The Range-Angle Lookup Table (RULES.md §9.1–9.2).
 *
 * Transcribed from the Reference Card (PDF p.37): the cell for H hexes and V levels is
 * ⌊√(H² + V²)⌋ — the boxed example H=7, V=3 → 7 rules out rounding to nearest. The ring
 * shading follows the integer rules of thumb exactly (H ≥ 4V is yellow, V ≥ 4H purple,
 * V > H green, otherwise blue; H = V is blue).
 *
 * The Movement Card's vertical plotting grid is the same function (RULES.md §7.2, PDF p.10).
 */
export type Ring = 'yellow' | 'blue' | 'green' | 'purple';

export const RINGS: readonly Ring[] = ['yellow', 'blue', 'green', 'purple'];

/** Nominal pitch of each ring's centre line, degrees. */
export const RING_PITCH: Readonly<Record<Ring, number>> = { yellow: 0, blue: 30, green: 60, purple: 90 };

/** True range for a horizontal distance of `h` hexes and `v` levels of altitude difference. */
export function trueRange(h: number, v: number): number {
  const hh = Math.abs(h);
  const vv = Math.abs(v);
  // add a hair so exact squares (3,4 → 5) never land a rounding error below the integer
  return Math.floor(Math.sqrt(hh * hh + vv * vv) + 1e-9);
}

/** Which AVID ring a target at (h, v) is seen through. Null when h = v = 0 (same position). */
export function ringFor(h: number, v: number): Ring | null {
  const hh = Math.abs(h);
  const vv = Math.abs(v);
  if (hh === 0 && vv === 0) return null;
  if (hh >= 4 * vv) return 'yellow';
  if (vv >= 4 * hh) return 'purple';
  if (vv > hh) return 'green';
  return 'blue';
}

/** Ring for a continuous pitch angle in degrees, with the book's boundary conventions. */
export function ringForPitch(pitchDeg: number): Ring {
  const p = Math.abs(pitchDeg);
  if (p <= 15) return 'yellow';
  if (p <= 45) return 'blue';
  if (p <= 75) return 'green';
  return 'purple';
}
