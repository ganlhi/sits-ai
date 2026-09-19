/**
 * A ship class: everything printed on its Ship Systems Display (RULES.md §22).
 *
 * The class is immutable reference data. The damage a particular ship has taken lives in a
 * separate {@link ShipDamage} keyed by track id, so one class serves any number of ships.
 */
import type { ArcDiagram, Mount } from '../geometry';
import { MOUNTS } from '../geometry';
import type { HitLocationTable } from './hitLocation';
import { freshTrack, type TrackSpec, type TrackState } from './track';

export type Grade = 'poor' | 'average' | 'veteran' | 'elite';
export const GRADES: readonly Grade[] = ['poor', 'average', 'veteran', 'elite'];

export type OfficerType = 'TAC' | 'EWO' | 'ATO' | 'HELM' | 'ENG' | 'CREW';
export const OFFICER_TYPES: readonly OfficerType[] = ['TAC', 'EWO', 'ATO', 'HELM', 'ENG', 'CREW'];

export type WeaponType = 'M' | 'L' | 'G' | 'ET' | 'CM' | 'PD';
export const WEAPON_TYPES: readonly WeaponType[] = ['M', 'L', 'G', 'ET', 'CM', 'PD'];

export type SalvoTiming = 'early' | 'middle' | 'late';
export const SALVO_TIMINGS: readonly SalvoTiming[] = ['early', 'middle', 'late'];

export interface WeaponSpec {
  readonly type: WeaponType;
  /** As printed: `16M`, `19/12/8/5L`, `7ET`, `CM`, `PD`. */
  readonly label: string;
  /**
   * Missiles: one entry, the missile size (= damage). Beams: damage by range step (C3.111 —
   * `10/7/5L` does 10 at range 0–1, 7 at 2, 5 at 3). Energy torpedoes: one entry. CM/PD: empty;
   * their track values are probable kills.
   */
  readonly damage: readonly number[];
  /** One box per weapon; the box value is the count remaining (or probable kills for CM/PD). */
  readonly track: TrackSpec;
}

export interface MountSpec {
  readonly id: Mount;
  readonly name: string;
  readonly fcon: TrackSpec;
  /** Salvo dots in the magazine, or null for a mount without missiles. */
  readonly magazine: number | null;
  readonly weapons: readonly WeaponSpec[];
  /** Decoy boxes (broadsides only); values are the column shift each gives. */
  readonly decoys: TrackSpec | null;
  readonly gravLance: boolean;
  readonly arc: ArcDiagram;
}

export interface RangeBand {
  /** Inclusive upper bound of the band; bands are listed in ascending order. */
  readonly maxRange: number;
  readonly baseMql: number;
  readonly salvoes: readonly SalvoTiming[];
}

export interface Internals {
  readonly bridge: TrackSpec;
  readonly flagBridge: TrackSpec;
  readonly lifeSupport: TrackSpec;
  readonly communications: TrackSpec;
  readonly ecm: TrackSpec;
  readonly pivot: TrackSpec;
  /** Printed under the pivot track; used by formation rules (a future product). */
  readonly evolutionDelays: readonly number[];
  readonly roll: TrackSpec;
  readonly forwardImpeller: TrackSpec;
  readonly aftImpeller: TrackSpec;
  readonly maxThrust: TrackSpec;
  readonly hyperGenerator: TrackSpec;
  readonly hull: TrackSpec;
  /** How the hull boxes are laid out in rows on the card, for display only. */
  readonly hullRowLengths: readonly number[];
  readonly structuralIntegrity: TrackSpec;
}

export interface ShipClass {
  /** Stable identifier, e.g. `gsn-sample-sd`. */
  readonly id: string;
  readonly nationality: string;
  readonly className: string;
  /** Hull type abbreviation as printed: SD, BC, CA, DD … */
  readonly hullType: string;
  /** Year (PD) the class entered service, when known. */
  readonly introduced: number | null;
  readonly crew: { readonly officers: number; readonly enlisted: number; readonly marines: number };
  readonly smallCraft: string | null;
  readonly reconDrones: number;
  readonly baseCost: number;
  /** The box count printed in the costing box, kept for reference; see {@link totalBoxes}. */
  readonly printedBoxCount: number | null;
  /** Cost delta per officer type and grade, from the Officers & Crew table. */
  readonly officerCosts: Readonly<Record<OfficerType, Readonly<Record<Grade, number>>>>;
  /** Crew Quality target numbers by crew grade (roll 2d10− ≤ target). */
  readonly crewQualityTarget: Readonly<Record<Grade, number>>;
  readonly rangeBands: readonly RangeBand[];
  readonly mounts: Readonly<Record<Mount, MountSpec>>;
  readonly internals: Internals;
  readonly sidewalls: { readonly port: TrackSpec; readonly starboard: TrackSpec };
  readonly hammerheadArmor: { readonly forward: number; readonly aft: number };
  readonly bowWall: TrackSpec | null;
  readonly sternWall: TrackSpec | null;
  readonly hitLocation: HitLocationTable;
  /** Free-text notes, including `[verify]` flags for values read from a poor scan. */
  readonly notes: string | null;
}

// ---------------------------------------------------------------------------------------------
// Uniform access to every track on the ship

/** Track ids: `mount.<mount>.fcon`, `mount.<mount>.weapon.<i>`, `mount.<mount>.decoys`, `internals.<name>`, `sidewall.<side>`, `bowWall`, `sternWall`. */
export type TrackId = string;

export interface TrackRef {
  readonly id: TrackId;
  readonly name: string;
  readonly spec: TrackSpec;
}

const INTERNAL_TRACKS: readonly { key: keyof Internals; name: string }[] = [
  { key: 'bridge', name: 'Bridge' },
  { key: 'flagBridge', name: 'Flag Bridge' },
  { key: 'lifeSupport', name: 'Life Support' },
  { key: 'communications', name: 'Communications' },
  { key: 'ecm', name: 'ECM' },
  { key: 'pivot', name: 'Pivot' },
  { key: 'roll', name: 'Roll' },
  { key: 'forwardImpeller', name: 'Forward Impeller' },
  { key: 'aftImpeller', name: 'Aft Impeller' },
  { key: 'maxThrust', name: 'Maximum Thrust' },
  { key: 'hyperGenerator', name: 'Hyper Generator' },
  { key: 'hull', name: 'Hull' },
  { key: 'structuralIntegrity', name: 'Structural Integrity' },
];

export function allTracks(ship: ShipClass): TrackRef[] {
  const out: TrackRef[] = [];
  for (const m of MOUNTS) {
    const mount = ship.mounts[m];
    out.push({ id: `mount.${m}.fcon`, name: `${mount.name} fire control`, spec: mount.fcon });
    mount.weapons.forEach((w, i) => out.push({ id: `mount.${m}.weapon.${i}`, name: `${mount.name} ${w.label}`, spec: w.track }));
    if (mount.decoys) out.push({ id: `mount.${m}.decoys`, name: `${mount.name} decoys`, spec: mount.decoys });
  }
  for (const t of INTERNAL_TRACKS) {
    const spec = ship.internals[t.key];
    if (typeof spec === 'object' && 'boxes' in spec) out.push({ id: `internals.${t.key}`, name: t.name, spec });
  }
  out.push({ id: 'sidewall.port', name: 'Port sidewall', spec: ship.sidewalls.port });
  out.push({ id: 'sidewall.starboard', name: 'Starboard sidewall', spec: ship.sidewalls.starboard });
  if (ship.bowWall) out.push({ id: 'bowWall', name: 'Bow wall', spec: ship.bowWall });
  if (ship.sternWall) out.push({ id: 'sternWall', name: 'Stern wall', spec: ship.sternWall });
  return out;
}

export function trackSpec(ship: ShipClass, id: TrackId): TrackSpec {
  const t = allTracks(ship).find((x) => x.id === id);
  if (!t) throw new Error(`no track ${id} on ${ship.className}`);
  return t.spec;
}

export const weaponTrackId = (mount: Mount, weaponIndex: number): TrackId => `mount.${mount}.weapon.${weaponIndex}`;
export const fconTrackId = (mount: Mount): TrackId => `mount.${mount}.fcon`;
export const decoyTrackId = (mount: Mount): TrackId => `mount.${mount}.decoys`;
export const sidewallTrackId = (side: 'port' | 'starboard'): TrackId => `sidewall.${side}`;
export const internalTrackId = (key: Exclude<keyof Internals, 'evolutionDelays' | 'hullRowLengths'>): TrackId => `internals.${key}`;

/** Total boxes on the ship for the victory-point percentage (D2.223). Magazine dots are not boxes. */
export function totalBoxes(ship: ShipClass): number {
  return allTracks(ship).reduce((n, t) => n + t.spec.boxes.length, 0);
}

// ---------------------------------------------------------------------------------------------
// Damage state of one ship

export interface ShipDamage {
  readonly tracks: Readonly<Record<TrackId, TrackState>>;
  /** Salvoes left in each magazine. */
  readonly magazines: Readonly<Partial<Record<Mount, number>>>;
}

export function freshDamage(ship: ShipClass): ShipDamage {
  const tracks: Record<TrackId, TrackState> = {};
  for (const t of allTracks(ship)) tracks[t.id] = freshTrack(t.spec);
  const magazines: Partial<Record<Mount, number>> = {};
  for (const m of MOUNTS) {
    const cap = ship.mounts[m].magazine;
    if (cap !== null) magazines[m] = cap;
  }
  return { tracks, magazines };
}

export function trackState(damage: ShipDamage, id: TrackId): TrackState {
  const s = damage.tracks[id];
  if (!s) throw new Error(`no damage state for track ${id}`);
  return s;
}

export function withTrack(damage: ShipDamage, id: TrackId, state: TrackState): ShipDamage {
  return { ...damage, tracks: { ...damage.tracks, [id]: state } };
}

/** Boxes destroyed across the ship, for the victory-point percentage. */
export function destroyedBoxes(ship: ShipClass, damage: ShipDamage): number {
  return allTracks(ship).reduce((n, t) => {
    const s = damage.tracks[t.id];
    return n + (s ? s.boxes.filter((b) => b.status === 'destroyed' || b.status === 'unrepairable').length : 0);
  }, 0);
}

/** The range band a range falls in, or null beyond the last band (out of missile range). */
export function rangeBandFor(ship: ShipClass, range: number): RangeBand | null {
  return ship.rangeBands.find((b) => range <= b.maxRange) ?? null;
}
