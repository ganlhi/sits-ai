/**
 * What a ship can still do, read from its class card at the depth of damage the player
 * reported. The player does not enter tracks; the BDA level says how far down each maneuver
 * track the damage has reached, and the facing effectiveness scales that facing's launchers,
 * beams and active defenses.
 */
import type { Mount } from '../geometry';
import type { ShipClass, TrackSpec, WeaponSpec } from '../ssd';
import { BDA_TRACK_LOSS, type Bda, type Effectiveness } from './types';

/** The rating a track gives once `fraction` of its boxes (from the left) are crossed out. */
export function trackValueAfterLoss(spec: TrackSpec, fraction: number): number {
  const n = spec.boxes.length;
  const k = Math.min(n, Math.floor(fraction * n + 1e-9));
  for (let i = k; i < n; i++) {
    const v = spec.boxes[i]?.value;
    if (v !== null && v !== undefined) return v;
  }
  return spec.exhaustedValue ?? 0;
}

export interface ManeuverRatings {
  readonly pivot: number;
  readonly roll: number;
  readonly thrust: number;
}

export function maneuverRatings(cls: ShipClass, bda: Bda): ManeuverRatings {
  const loss = BDA_TRACK_LOSS[bda];
  return {
    pivot: trackValueAfterLoss(cls.internals.pivot, loss),
    roll: trackValueAfterLoss(cls.internals.roll, loss),
    thrust: trackValueAfterLoss(cls.internals.maxThrust, loss),
  };
}

export const ecmRating = (cls: ShipClass, bda: Bda): number => trackValueAfterLoss(cls.internals.ecm, BDA_TRACK_LOSS[bda]);

/** The printed count of a weapon: the first box of its countdown, or the number of boxes. */
export const weaponCount = (w: WeaponSpec): number => w.track.boxes[0]?.value ?? w.track.boxes.length;

const clampPercent = (p: number): number => Math.max(0, Math.min(100, Number.isFinite(p) ? p : 0));
const scaledCount = (n: number, percent: number): number => Math.round((n * clampPercent(percent)) / 100);

export interface MissileBattery {
  readonly tubes: number;
  /** Missile size, the number before the M. */
  readonly damage: number;
}

/** Launchers a facing can still fire, or null when it has none left (or never had any). */
export function missileBattery(cls: ShipClass, mount: Mount, effectiveness: Effectiveness): MissileBattery | null {
  const w = cls.mounts[mount].weapons.find((x) => x.type === 'M');
  if (!w) return null;
  const tubes = scaledCount(weaponCount(w), effectiveness[mount]);
  return tubes > 0 ? { tubes, damage: w.damage[0] ?? 0 } : null;
}

export interface BeamBattery {
  readonly count: number;
  /** Damage by range step, as printed: `10/7/5L` does 10 at 0–1, 7 at 2, 5 at 3. */
  readonly damage: readonly number[];
}

export function beamBatteries(cls: ShipClass, mount: Mount, effectiveness: Effectiveness): BeamBattery[] {
  return cls.mounts[mount].weapons
    .filter((w) => w.type === 'L' || w.type === 'G')
    .map((w) => ({ count: scaledCount(weaponCount(w), effectiveness[mount]), damage: w.damage }))
    .filter((b) => b.count > 0);
}

/** Beam damage at a range, or null when out of reach (C3.111). */
export function beamDamageAtRange(damage: readonly number[], range: number): number | null {
  const idx = range <= 1 ? 0 : range - 1;
  return damage[idx] ?? null;
}

/** Longest range at which the ship's best beam still does damage. */
export function beamReach(cls: ShipClass): number {
  let reach = 0;
  for (const m of ['forward', 'aft', 'port', 'starboard'] as const) for (const w of cls.mounts[m].weapons) if (w.type === 'L' || w.type === 'G') reach = Math.max(reach, w.damage.length);
  return reach;
}

export interface PointDefense {
  /** Probable countermissile kills. */
  readonly cm: number;
  /** Probable point-defense kills. */
  readonly pd: number;
}

export function pointDefense(cls: ShipClass, mount: Mount, effectiveness: Effectiveness): PointDefense {
  const pct = clampPercent(effectiveness[mount]) / 100;
  const kills = (type: 'CM' | 'PD'): number => {
    const w = cls.mounts[mount].weapons.find((x) => x.type === type);
    return w ? (w.track.boxes[0]?.value ?? 0) * pct : 0;
  };
  return { cm: kills('CM'), pd: kills('PD') };
}
