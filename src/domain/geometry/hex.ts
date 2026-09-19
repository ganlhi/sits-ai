/**
 * The tactical hex map (RULES.md §4).
 *
 * Hexes use cube coordinates (x + y + z = 0). Altitude is a signed integer number of levels;
 * one level equals one hex of distance (RULES.md §1), which is what makes the RALT a plain
 * Pythagorean table.
 *
 * Hexes are flat-topped so that map direction A (north) is a neighbour direction: the six
 * neighbours sit at 0°, 60°, 120°, … clockwise from north.
 */
export interface Cube {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export const cube = (x: number, y: number, z: number): Cube => {
  if (x + y + z !== 0) throw new Error(`invalid cube coordinate (${x},${y},${z}): x+y+z must be 0`);
  return { x, y, z };
};

export const CUBE_ORIGIN: Cube = { x: 0, y: 0, z: 0 };

export const cubeAdd = (a: Cube, b: Cube): Cube => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
export const cubeSub = (a: Cube, b: Cube): Cube => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
export const cubeScale = (a: Cube, k: number): Cube => ({ x: a.x * k, y: a.y * k, z: a.z * k });
export const cubeEquals = (a: Cube, b: Cube): boolean => a.x === b.x && a.y === b.y && a.z === b.z;
export const cubeIsZero = (a: Cube): boolean => a.x === 0 && a.y === 0 && a.z === 0;

/** Number of hexes between two hexes (the RALT's horizontal axis). */
export function hexDistance(a: Cube, b: Cube): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y), Math.abs(a.z - b.z));
}

/** A hex plus an altitude level. Two ships may not share a position (RULES.md §4). */
export interface Position {
  readonly hex: Cube;
  readonly alt: number;
}

export const position = (hex: Cube, alt: number): Position => ({ hex, alt });
export const positionEquals = (a: Position, b: Position): boolean => cubeEquals(a.hex, b.hex) && a.alt === b.alt;

/**
 * Map-plane coordinates of a hex centre, in units of one hex width (flat side to flat side),
 * with +y towards map direction A. Used for rendering and for continuous bearings.
 */
export function hexToPoint(c: Cube): { x: number; y: number } {
  // axial q = x, r = z; flat-top layout with the A axis pointing +y
  const q = c.x;
  const r = c.z;
  return { x: (Math.sqrt(3) / 2) * q, y: -(r + q / 2) };
}

/** Inverse of {@link hexToPoint}, rounding to the nearest hex. */
export function pointToHex(x: number, y: number): Cube {
  const q = x / (Math.sqrt(3) / 2);
  const r = -y - q / 2;
  return cubeRound({ x: q, y: -q - r, z: r });
}

export function cubeRound(c: Cube): Cube {
  let rx = Math.round(c.x);
  let ry = Math.round(c.y);
  let rz = Math.round(c.z);
  const dx = Math.abs(rx - c.x);
  const dy = Math.abs(ry - c.y);
  const dz = Math.abs(rz - c.z);
  if (dx > dy && dx > dz) rx = -ry - rz;
  else if (dy > dz) ry = -rx - rz;
  else rz = -rx - ry;
  // normalise -0 so coordinates compare equal
  return { x: rx || 0, y: ry || 0, z: rz || 0 };
}
