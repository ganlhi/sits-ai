/**
 * Firing arcs (RULES.md §10) and the ship-frame view of a bearing.
 *
 * A firing-arc diagram is the inside of the AVID sphere fixed to the ship's frame (C1.21). The
 * five-step procedure of C1.22 — count windows from the Top/Bottom marker for the row, count
 * from the nearest side marker for the column — is a change of coordinates from the map-fixed
 * sphere to the ship-fixed one. Here it is done in one step: express the bearing direction in
 * ship coordinates (latitude from Top, longitude from Forward through Starboard) and quantise
 * with the same ring bands as the AVID.
 *
 * Colours (C1.225, C5.1 caption): black — that mount cannot fire there; grey — cleared to fire,
 * the firing ship is covered by its sidewall in that direction; white — cleared to fire, the
 * direction is the ship's bow/stern aspect (covered only by a bow/stern wall, if it has one).
 */
import type { Attitude } from './attitude';
import { starboardOf, type MarkerName, markerDirection, MARKER_NAMES } from './attitude';
import { ringForPitch } from './ralt';
import { DEG, dot, normalize, type Vec3 } from './vec3';

export type ArcColour = 'black' | 'grey' | 'white';

export type Mount = 'forward' | 'aft' | 'port' | 'starboard';
export const MOUNTS: readonly Mount[] = ['forward', 'aft', 'port', 'starboard'];

export type BodyRow = 'top' | 'greenUpper' | 'blueUpper' | 'equator' | 'blueLower' | 'greenLower' | 'bottom';
export const BODY_ROWS: readonly BodyRow[] = ['top', 'greenUpper', 'blueUpper', 'equator', 'blueLower', 'greenLower', 'bottom'];

/** A window on the ship-fixed sphere. `lon` is in 30° steps from Forward towards Starboard (0..11). */
export interface BodyWindow {
  readonly row: BodyRow;
  readonly lon: number;
  /** Continuous values, for display. */
  readonly latitudeDeg: number;
  readonly longitudeDeg: number;
}

const mod12 = (n: number): number => ((n % 12) + 12) % 12;

export function bodyWindow(a: Attitude, direction: Vec3): BodyWindow {
  const u = normalize(direction);
  const up = dot(u, a.top);
  const fwd = dot(u, a.forward);
  const stb = dot(u, starboardOf(a));
  const latitudeDeg = Math.asin(Math.max(-1, Math.min(1, up))) / DEG;
  const longitudeDeg = ((Math.atan2(stb, fwd) / DEG) % 360 + 360) % 360;
  const ring = ringForPitch(latitudeDeg);
  const upper = latitudeDeg >= 0;
  let row: BodyRow;
  let lon: number;
  switch (ring) {
    case 'purple':
      row = upper ? 'top' : 'bottom';
      lon = 0;
      break;
    case 'green':
      row = upper ? 'greenUpper' : 'greenLower';
      lon = mod12(Math.round(longitudeDeg / 60) * 2);
      break;
    case 'blue':
      row = upper ? 'blueUpper' : 'blueLower';
      lon = mod12(Math.round(longitudeDeg / 30));
      break;
    case 'yellow':
      row = 'equator';
      lon = mod12(Math.round(longitudeDeg / 30));
      break;
  }
  return { row, lon, latitudeDeg, longitudeDeg };
}

/**
 * One mount's arc: a colour per body window. Equator and blue rows have 12 entries indexed by
 * `lon`; green rows have 6 indexed by `lon / 2`; the caps have one.
 */
export type ArcDiagram = Readonly<Record<BodyRow, readonly ArcColour[]>>;

export function arcColour(arc: ArcDiagram, w: BodyWindow): ArcColour {
  const row = arc[w.row];
  const idx = w.row === 'top' || w.row === 'bottom' ? 0 : w.row.startsWith('green') ? w.lon / 2 : w.lon;
  return row[idx] ?? 'black';
}

export const canFire = (c: ArcColour): boolean => c !== 'black';

/** Longitude of each mount's centre marker on the ship-fixed sphere. */
export const MOUNT_CENTRE_LON: Readonly<Record<Mount, number>> = { forward: 0, starboard: 3, aft: 6, port: 9 };

export interface ArcSpec {
  /** Colours by offset in 30° windows from the mount centre, on the equator row. */
  readonly equator?: Readonly<Record<number, ArcColour>>;
  /** Colours by offset in 30° windows, applied to both blue rows. */
  readonly blue?: Readonly<Record<number, ArcColour>>;
  /** Colours by offset in 60° windows, applied to both green rows. */
  readonly green?: Readonly<Record<number, ArcColour>>;
  readonly caps?: ArcColour;
}

/** Build a diagram from offsets around a mount's centre; everything unspecified is black. */
export function buildArc(mount: Mount, spec: ArcSpec): ArcDiagram {
  const centre = MOUNT_CENTRE_LON[mount];
  const ring12 = (offsets: Readonly<Record<number, ArcColour>> | undefined): ArcColour[] => {
    const row: ArcColour[] = Array<ArcColour>(12).fill('black');
    for (const [k, c] of Object.entries(offsets ?? {})) row[mod12(centre + Number(k))] = c;
    return row;
  };
  const ring6 = (offsets: Readonly<Record<number, ArcColour>> | undefined): ArcColour[] => {
    const row: ArcColour[] = Array<ArcColour>(6).fill('black');
    if (centre % 2 !== 0) {
      // a mount centred on a corner cannot address the edge-only green ring exactly; spread to both neighbours
      for (const [k, c] of Object.entries(offsets ?? {})) {
        row[mod12(centre - 1 + Number(k) * 2) / 2] = c;
        row[mod12(centre + 1 + Number(k) * 2) / 2] = c;
      }
    } else {
      for (const [k, c] of Object.entries(offsets ?? {})) row[mod12(centre + Number(k) * 2) / 2] = c;
    }
    return row;
  };
  const caps: ArcColour[] = [spec.caps ?? 'black'];
  return {
    top: caps,
    bottom: caps,
    greenUpper: ring6(spec.green),
    greenLower: ring6(spec.green),
    blueUpper: ring12(spec.blue),
    blueLower: ring12(spec.blue),
    equator: ring12(spec.equator),
  };
}

/** The colour a mount sees a direction through. */
export function mountArcColour(arcs: Readonly<Record<Mount, ArcDiagram>>, mount: Mount, a: Attitude, direction: Vec3): ArcColour {
  return arcColour(arcs[mount], bodyWindow(a, direction));
}

/**
 * Nearest orientation marker to a direction (used for shot placement, C5.11). Ties within a
 * degree are reported so the rule's "attacker/defender chooses" can be applied.
 */
export function nearestFacing(a: Attitude, direction: Vec3): { facing: MarkerName; ties: MarkerName[] } {
  const u = normalize(direction);
  const scored = MARKER_NAMES.map((m) => ({ m, d: dot(u, markerDirection(a, m)) })).sort((x, y) => y.d - x.d);
  const best = scored[0];
  if (!best) throw new Error('unreachable');
  const ties = scored.filter((s) => s !== best && Math.abs(s.d - best.d) < Math.cos(89 * DEG)).map((s) => s.m);
  return { facing: best.m, ties };
}

/**
 * Whether the impeller wedge lies between the ship and a direction: the direction is more than
 * 45° above or below the ship's own plane (the green rows and caps of the ship-fixed sphere).
 * Beams from there cannot hurt the ship; missiles slide to the nearest facing (C5.11).
 */
export function wedgeCovers(a: Attitude, direction: Vec3): boolean {
  const row = bodyWindow(a, direction).row;
  return row === 'top' || row === 'bottom' || row === 'greenUpper' || row === 'greenLower';
}
