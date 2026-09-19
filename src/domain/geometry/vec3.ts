/**
 * Minimal 3-D vector helpers for the AVID sphere.
 *
 * Frame: x = east (map direction B/C), y = north (map direction A), z = up (+).
 * Azimuths are measured clockwise from north, as the AVID labels run A, A/B, B … clockwise.
 */
export interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export const DEG = Math.PI / 180;

export const vec3 = (x: number, y: number, z: number): Vec3 => ({ x, y, z });
export const UP: Vec3 = vec3(0, 0, 1);
export const NORTH: Vec3 = vec3(0, 1, 0);

export const add = (a: Vec3, b: Vec3): Vec3 => vec3(a.x + b.x, a.y + b.y, a.z + b.z);
export const sub = (a: Vec3, b: Vec3): Vec3 => vec3(a.x - b.x, a.y - b.y, a.z - b.z);
export const scale = (a: Vec3, k: number): Vec3 => vec3(a.x * k, a.y * k, a.z * k);
export const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
export const cross = (a: Vec3, b: Vec3): Vec3 =>
  vec3(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
export const length = (a: Vec3): number => Math.sqrt(dot(a, a));

export function normalize(a: Vec3): Vec3 {
  const l = length(a);
  if (l < 1e-12) throw new Error('cannot normalize a zero vector');
  return scale(a, 1 / l);
}

const clamp1 = (t: number): number => Math.max(-1, Math.min(1, t));

/** Angle between two vectors in degrees, 0..180. */
export function angleBetween(a: Vec3, b: Vec3): number {
  return Math.acos(clamp1(dot(a, b) / (length(a) * length(b)))) / DEG;
}

/** Rotate `v` about unit `axis` by `deg` degrees (right-hand rule), Rodrigues' formula. */
export function rotateAbout(v: Vec3, axis: Vec3, deg: number): Vec3 {
  const k = normalize(axis);
  const c = Math.cos(deg * DEG);
  const s = Math.sin(deg * DEG);
  return add(add(scale(v, c), scale(cross(k, v), s)), scale(k, dot(k, v) * (1 - c)));
}

/** Component of `v` orthogonal to unit vector `n`. */
export function orthogonalTo(v: Vec3, n: Vec3): Vec3 {
  return sub(v, scale(n, dot(v, n)));
}

/** Unit vector from azimuth (degrees clockwise from north) and pitch (degrees above the map plane). */
export function fromAzPitch(azDeg: number, pitchDeg: number): Vec3 {
  const cp = Math.cos(pitchDeg * DEG);
  return vec3(Math.sin(azDeg * DEG) * cp, Math.cos(azDeg * DEG) * cp, Math.sin(pitchDeg * DEG));
}

/** Azimuth in degrees, clockwise from north, normalised to [0, 360). Undefined (0) for vertical vectors. */
export function azimuthDeg(v: Vec3): number {
  if (Math.abs(v.x) < 1e-12 && Math.abs(v.y) < 1e-12) return 0;
  const a = Math.atan2(v.x, v.y) / DEG;
  return ((a % 360) + 360) % 360;
}

/** Pitch above the map plane in degrees, −90..90. */
export function pitchDeg(v: Vec3): number {
  return Math.asin(clamp1(v.z / length(v))) / DEG;
}

export const approxEqual = (a: Vec3, b: Vec3, eps = 1e-9): boolean =>
  Math.abs(a.x - b.x) < eps && Math.abs(a.y - b.y) < eps && Math.abs(a.z - b.z) < eps;
