/**
 * Damage control (RULES.md §16). Parties are the intact wrench boxes on the hull track; each
 * makes a Crew Quality check to bring one destroyed box back, jury-rigged for ten turns. A failed
 * box can never be repaired in combat; two parties on one box get two tries. Hull, SI, Warshawski
 * sails and hyper generators cannot be repaired by combat damage control.
 */
import type { Mount } from '../geometry';
import { allTracks, expireJuryRigs, failRepair, freshTrack, intactWithMark, internalTrackId, repairBox, trackSpec, type ShipClass, type ShipDamage, type TrackId } from '../ssd';
import { DIST_3D10_LOW, mean, roll3d10, type Rng } from './dice';
import { crewQualityCheck } from './officers';

export function damageControlParties(cls: ShipClass, damage: ShipDamage): number {
  const id = internalTrackId('hull');
  return intactWithMark(trackSpec(cls, id), damage.tracks[id] ?? freshTrack(trackSpec(cls, id)), 'wrench').length;
}

const UNREPAIRABLE: readonly TrackId[] = ['internals.hull', 'internals.structuralIntegrity', 'internals.hyperGenerator'];

export function isRepairable(cls: ShipClass, damage: ShipDamage, trackId: TrackId, index: number): boolean {
  if (UNREPAIRABLE.includes(trackId)) return false;
  const spec = trackSpec(cls, trackId);
  const box = spec.boxes[index];
  if (!box || box.mark === 'W') return false;
  return damage.tracks[trackId]?.boxes[index]?.status === 'destroyed';
}

/** Every destroyed box combat damage control may attempt. */
export function repairableBoxes(cls: ShipClass, damage: ShipDamage): { trackId: TrackId; index: number; name: string }[] {
  const out: { trackId: TrackId; index: number; name: string }[] = [];
  for (const t of allTracks(cls)) {
    const st = damage.tracks[t.id];
    if (!st) continue;
    st.boxes.forEach((_, i) => {
      if (isRepairable(cls, damage, t.id, i)) out.push({ trackId: t.id, index: i, name: t.name });
    });
  }
  return out;
}

export interface RepairAttempt {
  readonly trackId: TrackId;
  readonly index: number;
  /** One or two parties on the box (C6.122). */
  readonly parties: 1 | 2;
}

export interface RepairResult {
  readonly attempt: RepairAttempt;
  readonly rolls: number[];
  readonly success: boolean;
}

/** Roll a repair. On success the box is back (jury-rigged, turn stamped); on failure it is marked unrepairable. */
export function attemptRepair(rng: Rng, cls: ShipClass, damage: ShipDamage, attempt: RepairAttempt, crewTarget: number, turn: number): { damage: ShipDamage; result: RepairResult } {
  if (!isRepairable(cls, damage, attempt.trackId, attempt.index)) throw new Error(`${attempt.trackId}[${attempt.index}] cannot be repaired`);
  const rolls: number[] = [];
  let success = false;
  for (let i = 0; i < attempt.parties && !success; i++) {
    const c = crewQualityCheck(rng, crewTarget);
    rolls.push(c.roll);
    success = c.success;
  }
  const cur = damage.tracks[attempt.trackId]!;
  const next = success ? repairBox(cur, attempt.index, turn) : failRepair(cur, attempt.index);
  return { damage: { ...damage, tracks: { ...damage.tracks, [attempt.trackId]: next } }, result: { attempt, rolls, success } };
}

/** Repairing a magazine restores 3d10-low salvoes (C6.14); allowed only on a turn the mount did not fire. */
export function repairMagazine(rng: Rng, cls: ShipClass, damage: ShipDamage, mount: Mount, crewTarget: number): { damage: ShipDamage; roll: number; restored: number; success: boolean } {
  const cap = cls.mounts[mount].magazine;
  if (cap === null) throw new Error(`${mount} has no magazine`);
  const c = crewQualityCheck(rng, crewTarget);
  if (!c.success) return { damage, roll: c.roll, restored: 0, success: false };
  const restored = roll3d10(rng, 'low');
  const left = damage.magazines[mount] ?? cap;
  return { damage: { ...damage, magazines: { ...damage.magazines, [mount]: Math.min(cap, left + restored) } }, roll: c.roll, restored, success: true };
}

export const expectedMagazineRestore = (): number => mean(DIST_3D10_LOW);

/** Start of a turn: jury-rigged repairs made ten or more turns ago fail (C6.13). */
export function expireRepairs(damage: ShipDamage, turn: number): { damage: ShipDamage; failed: { trackId: TrackId; index: number }[] } {
  const failed: { trackId: TrackId; index: number }[] = [];
  const tracks: Record<TrackId, ShipDamage['tracks'][string]> = {};
  for (const [id, st] of Object.entries(damage.tracks)) {
    const r = expireJuryRigs(st, turn);
    tracks[id] = r.state;
    for (const i of r.failed) failed.push({ trackId: id, index: i });
  }
  return { damage: { ...damage, tracks }, failed };
}
