/**
 * The AVID — Attitude and Vector Indicator Display (RULES.md §5).
 *
 * A map-fixed sphere quantised into 50 windows:
 *   yellow ring (pitch 0°)      12 windows, one per hex edge and hex corner direction
 *   blue rings  (pitch ±30°)    12 windows each hemisphere
 *   green rings (pitch ±60°)     6 windows each hemisphere — hex edge directions only
 *   purple      (pitch ±90°)     1 window each hemisphere
 *
 * Because the drawing is flat, upper and lower hemispheres share the printed windows; a marker
 * in the lower hemisphere is circled. Window distance is measured as great-circle angle in
 * units of 30°, which reproduces the book's counts (Port is 3 from Forward, Aft is 6, the
 * reciprocal of a blue window is 6 away in the other hemisphere).
 */
import { RING_PITCH, ringForPitch, type Ring } from './ralt';
import { angleBetween, azimuthDeg, fromAzPitch, pitchDeg, type Vec3 } from './vec3';

/** The twelve azimuth windows, clockwise from the top of the map. Even indices are hex edges. */
export const AZIMUTH_LABELS = ['A', 'A/B', 'B', 'B/C', 'C', 'C/D', 'D', 'D/E', 'E', 'E/F', 'F', 'F/A'] as const;
export type AzimuthLabel = (typeof AZIMUTH_LABELS)[number];

export type Hemisphere = 'upper' | 'lower';

export type AvidWindow =
  | { readonly ring: 'yellow'; readonly az: number }
  | { readonly ring: 'blue'; readonly az: number; readonly hemi: Hemisphere }
  | { readonly ring: 'green'; readonly az: number; readonly hemi: Hemisphere }
  | { readonly ring: 'purple'; readonly hemi: Hemisphere };

const mod12 = (n: number): number => ((n % 12) + 12) % 12;

export function yellow(az: number): AvidWindow {
  return { ring: 'yellow', az: mod12(az) };
}
export function blue(az: number, hemi: Hemisphere): AvidWindow {
  return { ring: 'blue', az: mod12(az), hemi };
}
export function green(az: number, hemi: Hemisphere): AvidWindow {
  const a = mod12(az);
  if (a % 2 !== 0) throw new Error(`green ring has no corner window (az ${a})`);
  return { ring: 'green', az: a, hemi };
}
export function purple(hemi: Hemisphere): AvidWindow {
  return { ring: 'purple', hemi };
}

/** Build a window from a label such as "A/B" and a ring; throws on invalid combinations. */
export function windowFromLabel(label: AzimuthLabel, ring: Ring, hemi: Hemisphere = 'upper'): AvidWindow {
  const az = AZIMUTH_LABELS.indexOf(label);
  switch (ring) {
    case 'yellow':
      return yellow(az);
    case 'blue':
      return blue(az, hemi);
    case 'green':
      return green(az, hemi);
    case 'purple':
      return purple(hemi);
  }
}

export const ALL_WINDOWS: readonly AvidWindow[] = (() => {
  const out: AvidWindow[] = [];
  for (let az = 0; az < 12; az++) out.push(yellow(az));
  for (const hemi of ['upper', 'lower'] as const) {
    for (let az = 0; az < 12; az++) out.push(blue(az, hemi));
    for (let az = 0; az < 12; az += 2) out.push(green(az, hemi));
    out.push(purple(hemi));
  }
  return out;
})();

export function windowAzimuthIndex(w: AvidWindow): number | null {
  return w.ring === 'purple' ? null : w.az;
}

export function windowHemisphere(w: AvidWindow): Hemisphere | null {
  return w.ring === 'yellow' ? null : w.hemi;
}

/** Stable identifier, e.g. "yellow:0", "blue:1:upper", "purple:lower". */
export function windowKey(w: AvidWindow): string {
  switch (w.ring) {
    case 'yellow':
      return `yellow:${w.az}`;
    case 'purple':
      return `purple:${w.hemi}`;
    default:
      return `${w.ring}:${w.az}:${w.hemi}`;
  }
}

export function windowsEqual(a: AvidWindow, b: AvidWindow): boolean {
  return windowKey(a) === windowKey(b);
}

/** The book's notation: `A/B(blue, upper)`, `D(green, upper)`, `A(yellow)`, `purple(lower)`. */
export function windowLabel(w: AvidWindow): string {
  switch (w.ring) {
    case 'yellow':
      return `${AZIMUTH_LABELS[w.az]}(yellow)`;
    case 'purple':
      return `purple(${w.hemi})`;
    default:
      return `${AZIMUTH_LABELS[w.az]}(${w.ring}, ${w.hemi})`;
  }
}

/** Unit vector through the centre of a window. */
export function windowDirection(w: AvidWindow): Vec3 {
  const pitch = RING_PITCH[w.ring] * (w.ring !== 'yellow' && w.hemi === 'lower' ? -1 : 1);
  const az = w.ring === 'purple' ? 0 : w.az * 30;
  return fromAzPitch(az, pitch);
}

/** Quantise a direction to the window it falls in. */
export function directionToWindow(v: Vec3): AvidWindow {
  const pitch = pitchDeg(v);
  const ring = ringForPitch(pitch);
  const hemi: Hemisphere = pitch >= 0 ? 'upper' : 'lower';
  if (ring === 'purple') return purple(hemi);
  const az = azimuthDeg(v);
  if (ring === 'green') return green(Math.round(az / 60) * 2, hemi);
  const idx = Math.round(az / 30);
  return ring === 'yellow' ? yellow(idx) : blue(idx, hemi);
}

/** Bearings are reciprocal (RULES.md §9.4): the window the target sees you through. */
export function reciprocalWindow(w: AvidWindow): AvidWindow {
  const flip = (h: Hemisphere): Hemisphere => (h === 'upper' ? 'lower' : 'upper');
  switch (w.ring) {
    case 'yellow':
      return yellow(w.az + 6);
    case 'purple':
      return purple(flip(w.hemi));
    case 'blue':
      return blue(w.az + 6, flip(w.hemi));
    case 'green':
      return green(w.az + 6, flip(w.hemi));
  }
}

/** Great-circle angle between two window centres, degrees. */
export function windowAngle(a: AvidWindow, b: AvidWindow): number {
  return angleBetween(windowDirection(a), windowDirection(b));
}

/** Distance in windows: the angle in units of 30°, rounded. Adjacent windows are 1, antipodes 6. */
export function windowDistance(a: AvidWindow, b: AvidWindow): number {
  return Math.round(windowAngle(a, b) / 30);
}

/** All windows at exactly `n` windows from `from`. */
export function windowsAtDistance(from: AvidWindow, n: number): AvidWindow[] {
  return ALL_WINDOWS.filter((w) => windowDistance(from, w) === n);
}

/** The window's extent on the card: pitch band and azimuth span, degrees. Purple spans every azimuth. */
export function windowBounds(w: AvidWindow): { readonly pitchMin: number; readonly pitchMax: number; readonly azCentre: number; readonly azHalf: number } {
  const sign = w.ring !== 'yellow' && w.hemi === 'lower' ? -1 : 1;
  const band = (lo: number, hi: number) => (sign > 0 ? { pitchMin: lo, pitchMax: hi } : { pitchMin: -hi, pitchMax: -lo });
  switch (w.ring) {
    case 'yellow':
      return { pitchMin: -15, pitchMax: 15, azCentre: w.az * 30, azHalf: 15 };
    case 'blue':
      return { ...band(15, 45), azCentre: w.az * 30, azHalf: 15 };
    case 'green':
      return { ...band(45, 75), azCentre: w.az * 30, azHalf: 30 };
    case 'purple':
      return { ...band(75, 90), azCentre: 0, azHalf: 180 };
  }
}

/** The point of window `w` nearest to direction `v`: `v` itself when it lies in the window, else clamped to the window's edge. */
export function clampToWindow(v: Vec3, w: AvidWindow): Vec3 {
  const b = windowBounds(w);
  const pitch = Math.max(b.pitchMin, Math.min(b.pitchMax, pitchDeg(v)));
  if (b.azHalf >= 180) return fromAzPitch(azimuthDeg(v), pitch);
  const rel = ((azimuthDeg(v) - b.azCentre + 540) % 360) - 180;
  const az = b.azCentre + Math.max(-b.azHalf, Math.min(b.azHalf, rel));
  return fromAzPitch(az, pitch);
}
