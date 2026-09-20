/**
 * Beam weapons (RULES.md §14.3, C3.1): in arc, in range and not facing the wedge, beams hit
 * automatically. Damage falls off with range; a target showing neither sidewall nor wedge is
 * engaged at half range (rounding for the attacker). Energy torpedoes ignore that halving and
 * cannot affect a target with an intact sidewall; grav lances work only at range 0.
 */
import type { Attitude, AvidWindow, Mount } from '../geometry';
import { MOUNTS, mountArcColour, reciprocalWindow, windowDirection } from '../geometry';
import { currentValue, destroyLeftmost, freshTrack, internalTrackId, remainingCount, sidewallTrackId, trackSpec, weaponTrackId, type ShipClass, type ShipDamage, type WeaponSpec } from '../ssd';
import { beginAllocation, finishDamageStep, placeShot, resolveWarhead, type AllocationState, type Placement, type WarheadKind } from './allocation';
import { d10, roll3d10, type Rng } from './dice';

/** Damage of a beam at a range (C3.111): `10/7/5L` does 10 at 0–1, 7 at 2, 5 at 3, nothing beyond. */
export function beamDamageAtRange(weapon: WeaponSpec, range: number): number | null {
  const idx = range <= 1 ? 0 : range - 1;
  return weapon.damage[idx] ?? null;
}

/** No sidewall and no wedge showing → halve the range, rounding in the attacker's favour; never for torpedoes (C3.12, C3.124). */
export const beamRangeFor = (placement: Placement, range: number, kind: WarheadKind): number => (kind !== 'et' && !placement.sidewallUp ? Math.floor(range / 2) : range);

export const beamKind = (t: WeaponSpec['type']): WarheadKind | null => (t === 'L' ? 'laser' : t === 'G' ? 'graser' : t === 'ET' ? 'et' : null);

export interface Combatant {
  readonly cls: ShipClass;
  readonly damage: ShipDamage;
  readonly attitude: Attitude;
}

export interface BeamShot {
  readonly mount: Mount;
  readonly weapon: string;
  readonly damage: number;
  readonly hits: number;
}

export interface BeamAttackResult {
  readonly state: AllocationState;
  /** Null when the target's wedge faces the shooter. */
  readonly placement: Placement | null;
  readonly shots: BeamShot[];
}

export const arcsOf = (cls: ShipClass) => ({ forward: cls.mounts.forward.arc, aft: cls.mounts.aft.arc, port: cls.mounts.port.arc, starboard: cls.mounts.starboard.arc });

/**
 * Fire every beam of every bearing mount from `shooter` at `target`, the target seen through
 * `bearing` at `range`. `mounts` restricts which mounts fire.
 */
export function beamAttack(rng: Rng, shooter: Combatant, target: Combatant, bearing: AvidWindow, range: number, mounts: readonly Mount[] = MOUNTS, wedgeDown = false): BeamAttackResult {
  const st = beginAllocation(target.damage);
  const impactDir = windowDirection(reciprocalWindow(bearing));
  const placement = placeShot(target.cls, target.damage, target.attitude, impactDir, 'beam', wedgeDown);
  const shots: BeamShot[] = [];
  if (!placement) {
    st.effects.push({ kind: 'note', text: 'target shows its wedge: beams cannot damage it' });
    return { state: st, placement: null, shots };
  }
  const dir = windowDirection(bearing);
  const arcs = arcsOf(shooter.cls);
  const bearing_mounts = mounts.filter((m) => mountArcColour(arcs, m, shooter.attitude, dir) !== 'black');

  // C5.31: grav lance, then energy torpedoes, lasers, grasers
  for (const m of bearing_mounts) {
    if (shooter.cls.mounts[m].gravLance && range === 0 && (placement.aspect === 'sidewall' || placement.aspect === 'leak')) {
      const dice = trackSpec(shooter.cls, internalTrackId('maxThrust')).boxes.length;
      let boxes = 0;
      for (let i = 0; i < dice; i++) if (d10(rng) >= 3) boxes++;
      const id = sidewallTrackId(placement.edge as 'port' | 'starboard');
      const spec = trackSpec(target.cls, id);
      const r = destroyLeftmost(spec, st.damage.tracks[id] ?? freshTrack(spec), boxes);
      st.damage = { ...st.damage, tracks: { ...st.damage.tracks, [id]: r.state } };
      st.boxes += r.destroyed.length;
      st.effects.push({ kind: 'hit', text: `${shooter.cls.mounts[m].name} grav lance: ${dice} dice, ${r.destroyed.length} sidewall box${r.destroyed.length === 1 ? '' : 'es'}`, trackId: id, boxes: r.destroyed.length });
      shots.push({ mount: m, weapon: 'Grav Lance', damage: 0, hits: r.destroyed.length });
    }
  }
  for (const kind of ['et', 'laser', 'graser'] as WarheadKind[]) {
    for (const m of bearing_mounts) {
      shooter.cls.mounts[m].weapons.forEach((w, wi) => {
        if (beamKind(w.type) !== kind) return;
        const count = currentValue(w.track, shooter.damage.tracks[weaponTrackId(m, wi)] ?? freshTrack(w.track)) ?? 0;
        if (count <= 0) return;
        if (kind === 'et' && placement.sidewallUp) {
          st.effects.push({ kind: 'note', text: `${shooter.cls.mounts[m].name} ${w.label}: sidewall intact, energy torpedoes cannot affect the target` });
          return;
        }
        const dmg = beamDamageAtRange(w, beamRangeFor(placement, range, kind));
        if (dmg === null) return;
        let hits = count;
        if (kind === 'et') {
          hits = 0;
          for (let i = 0; i < count; i++) hits += roll3d10(rng, 'low');
        }
        shots.push({ mount: m, weapon: w.label, damage: dmg, hits });
        for (let i = 0; i < hits && !st.destroyed; i++) resolveWarhead(rng, target.cls, st, placement, { kind, damage: dmg }, `${shooter.cls.mounts[m].name} ${w.label} ${i + 1}`, wedgeDown);
      });
    }
  }
  finishDamageStep(rng, target.cls, st);
  return { state: st, placement, shots };
}
