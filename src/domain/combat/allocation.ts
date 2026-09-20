/**
 * Damage allocation (RULES.md §13–15): where a shot lands, whether it penetrates, how deep it
 * goes across the hit location table, and what each system hit does.
 *
 * Nothing here mutates the caller's data: an AllocationState carries the evolving damage state
 * and a readable list of effects, so the same code drives the table helper, the AI's sampler
 * and the tests.
 */
import type { Attitude, MarkerName, Mount, Vec3 } from '../geometry';
import { MOUNTS, bodyWindow } from '../geometry';
import {
  cellsFromEdge,
  currentValue,
  decoyTrackId,
  destroyLeftmost,
  fconTrackId,
  freshTrack,
  internalTrackId,
  remainingCount,
  sidewallTrackId,
  trackSpec,
  weaponTrackId,
  type HltCell,
  type HltEdge,
  type OfficerType,
  type ShipClass,
  type ShipDamage,
  type SystemCode,
  type TrackId,
  type TrackState,
  type WeaponType,
} from '../ssd';
import { d10face, roll2d10minus, roll2d10plus, type Rng } from './dice';

export type WarheadKind = 'laserhead' | 'nuke' | 'laser' | 'graser' | 'et';

export interface Warhead {
  readonly kind: WarheadKind;
  readonly damage: number;
}

/** Adjacent lines of the table the full damage goes down (C5.33). */
export const SPAN: Readonly<Record<WarheadKind, number>> = { laserhead: 1, nuke: 5, laser: 1, graser: 3, et: 5 };

export type Aspect = 'sidewall' | 'bow' | 'stern' | 'leak';

export interface Placement {
  readonly edge: HltEdge;
  /** The mount that could shoot back — the one whose fire control, weapons and magazine take the hits (C5.412). */
  readonly mount: Mount;
  /** −10 / +10 on the hit location roll for shots leaking around the sidewall (C5.11). */
  readonly rollShift: -10 | 0 | 10;
  /** Sidewall value (or hammerhead armour / bow wall) added to the depth modifier. */
  readonly protection: number;
  /** True when a sidewall (or bow/stern wall) is up on this aspect. */
  readonly sidewallUp: boolean;
  readonly facing: MarkerName;
  readonly aspect: Aspect;
}

const EDGE_MOUNT: Readonly<Record<HltEdge, Mount>> = { starboard: 'starboard', port: 'port', forward: 'forward', aft: 'aft' };

function sidewallValue(cls: ShipClass, damage: ShipDamage, side: 'port' | 'starboard'): { value: number; up: boolean } {
  const id = sidewallTrackId(side);
  const spec = trackSpec(cls, id);
  const st = damage.tracks[id] ?? freshTrack(spec);
  return { value: currentValue(spec, st) ?? spec.exhaustedValue ?? 0, up: remainingCount(st) > 0 };
}

function wallValue(cls: ShipClass, damage: ShipDamage, which: 'bow' | 'stern'): { value: number; up: boolean } {
  const spec = which === 'bow' ? cls.bowWall : cls.sternWall;
  if (!spec) return { value: which === 'bow' ? cls.hammerheadArmor.forward : cls.hammerheadArmor.aft, up: false };
  const id = which === 'bow' ? 'bowWall' : 'sternWall';
  const st = damage.tracks[id] ?? freshTrack(spec);
  return { value: currentValue(spec, st) ?? spec.exhaustedValue ?? 0, up: remainingCount(st) > 0 };
}

/**
 * Shot placement (C5.11). `impactDir` is the direction the shot comes from as the target sees
 * it (the Impact Window). Returns null for a beam stopped by the wedge.
 */
export function placeShot(cls: ShipClass, damage: ShipDamage, attitude: Attitude, impactDir: Vec3, weapon: 'missile' | 'beam', wedgeDown = false): Placement | null {
  const bw = bodyWindow(attitude, impactDir);
  const overWedge = bw.row === 'top' || bw.row === 'bottom' || bw.row === 'greenUpper' || bw.row === 'greenLower';
  if (overWedge && !wedgeDown && weapon === 'beam') return null;
  let lon = bw.lon;
  if (bw.row === 'top' || bw.row === 'bottom') lon = ((Math.round(bw.longitudeDeg / 30) % 12) + 12) % 12;

  const side = (s: 'port' | 'starboard', shift: -10 | 0 | 10, aspect: Aspect): Placement => {
    const sw = sidewallValue(cls, damage, s);
    return { edge: s, mount: s, rollShift: shift, protection: sw.value, sidewallUp: sw.up, facing: s, aspect };
  };
  const end = (which: 'bow' | 'stern'): Placement => {
    const w = wallValue(cls, damage, which);
    const edge: HltEdge = which === 'bow' ? 'forward' : 'aft';
    return { edge, mount: EDGE_MOUNT[edge], rollShift: 0, protection: w.value, sidewallUp: w.up, facing: edge, aspect: which };
  };
  if (overWedge) {
    // missiles slide past the wedge to the closest facing (defender's choice when ambiguous; we go by longitude)
    if (lon <= 1 || lon >= 11) return end('bow');
    if (lon >= 5 && lon <= 7) return end('stern');
    return lon < 6 ? side('starboard', 0, 'sidewall') : side('port', 0, 'sidewall');
  }
  switch (lon) {
    case 0:
      return end('bow');
    case 6:
      return end('stern');
    case 1:
      return side('starboard', -10, 'leak');
    case 11:
      return side('port', -10, 'leak');
    case 5:
      return side('starboard', 10, 'leak');
    case 7:
      return side('port', 10, 'leak');
    case 2:
    case 3:
    case 4:
      return side('starboard', 0, 'sidewall');
    default:
      return side('port', 0, 'sidewall');
  }
}

/** Depth Modifier = Damage − Target Scale + Sidewall (C5.21). */
export const depthModifier = (damage: number, scale: number, protection: number): number => damage - scale + protection;

/** Turn a raw penetration result into Depth for a warhead (C5.32). */
export function depthFor(kind: WarheadKind, raw: number, wedgeDown: boolean): number {
  let d = raw;
  if (wedgeDown && kind !== 'et') d *= 2;
  if (kind === 'nuke') d = Math.floor(d / 2);
  if (kind === 'et') d *= 2;
  return d;
}

export interface Penetration {
  readonly natural: number;
  readonly depth: number;
  readonly penetrates: boolean;
  /** A natural 0 destroys a facing sidewall box (or an SI box) at the end of the step (C5.213). */
  readonly sidewallBox: boolean;
}

export function penetrationFrom(natural: number, warhead: Warhead, scale: number, protection: number, wedgeDown = false): Penetration {
  const raw = depthModifier(warhead.damage, scale, protection) + natural;
  const depth = raw >= 1 ? Math.max(0, depthFor(warhead.kind, raw, wedgeDown)) : 0;
  return { natural, depth, penetrates: depth >= 1, sidewallBox: natural === 0 };
}

export function penetrate(rng: Rng, warhead: Warhead, scale: number, protection: number, wedgeDown = false): Penetration {
  return penetrationFrom(roll2d10minus(rng).value, warhead, scale, protection, wedgeDown);
}

// ---------------------------------------------------------------------------------------------
// Applying hits

export type EffectKind = 'hit' | 'skip' | 'lost' | 'deflected' | 'cascade' | 'explosion-check' | 'destroyed' | 'officer' | 'sidewall' | 'note';

export interface DamageEffect {
  readonly kind: EffectKind;
  readonly text: string;
  readonly trackId?: TrackId;
  readonly boxes?: number;
}

export interface AllocationState {
  damage: ShipDamage;
  destroyed: boolean;
  effects: DamageEffect[];
  /** Officer ratings lost to bridge hits, for the caller to apply to the ship's grades. */
  officerLosses: OfficerType[];
  /** Boxes destroyed so far. */
  boxes: number;
  /** Natural-zero sidewall hits deferred to the end of the damage step (C5.213). */
  pendingSidewallHits: Placement[];
}

export function beginAllocation(damage: ShipDamage): AllocationState {
  return { damage, destroyed: false, effects: [], officerLosses: [], boxes: 0, pendingSidewallHits: [] };
}

function track(cls: ShipClass, st: AllocationState, id: TrackId): TrackState {
  return st.damage.tracks[id] ?? freshTrack(trackSpec(cls, id));
}

function hasTrack(cls: ShipClass, id: TrackId): boolean {
  try {
    trackSpec(cls, id);
    return true;
  } catch {
    return false;
  }
}

/** Cross out `n` boxes on a track and log it. */
function hitTrack(cls: ShipClass, st: AllocationState, id: TrackId, n: number, why: string): ReturnType<typeof destroyLeftmost> {
  const spec = trackSpec(cls, id);
  const r = destroyLeftmost(spec, track(cls, st, id), n);
  st.damage = { ...st.damage, tracks: { ...st.damage.tracks, [id]: r.state } };
  if (r.destroyed.length) {
    st.boxes += r.destroyed.length;
    st.effects.push({ kind: 'hit', text: `${why}: ${r.destroyed.length} box${r.destroyed.length > 1 ? 'es' : ''} on ${id}`, trackId: id, boxes: r.destroyed.length });
  }
  return r;
}

function weaponIndex(cls: ShipClass, mount: Mount, type: WeaponType): number {
  return cls.mounts[mount].weapons.findIndex((w) => w.type === type);
}

function healthierSide(cls: ShipClass, st: AllocationState, id: (s: 'port' | 'starboard') => TrackId): 'port' | 'starboard' {
  const has = (s: 'port' | 'starboard') => (hasTrack(cls, id(s)) ? remainingCount(track(cls, st, id(s))) : -1);
  return has('port') >= has('starboard') ? 'port' : 'starboard';
}

/** Structural Integrity boxes have teeth (C5.42). */
function structuralHits(rng: Rng, cls: ShipClass, st: AllocationState, n: number, why: string): void {
  const id = internalTrackId('structuralIntegrity');
  const r = hitTrack(cls, st, id, n, why);
  for (const d of r.destroyed) {
    if (d.box.mark === 'C') {
      // core cascade: roll a broadside hit location; every non-SI, non-duplicated Core system in that column takes a hit
      const roll = roll2d10plus(rng);
      const cells = cellsFromEdge(cls.hitLocation, 'starboard', roll) ?? [];
      const codes = new Set<SystemCode>();
      for (const c of cells) if (c.core && c.code && c.code !== 'SI') codes.add(c.code);
      st.effects.push({ kind: 'cascade', text: `core cascade (roll ${roll}): ${codes.size ? [...codes].join(', ') : 'no Core systems in that column'}` });
      for (const code of codes) applySystemHit(rng, cls, st, code, 'starboard', 'cascade');
    } else if (d.box.shape === 'octagon' && d.box.value !== null) {
      const roll = d10face(rng);
      const ok = roll >= d.box.value;
      st.effects.push({ kind: 'explosion-check', text: `SI octagon ${d.box.value}: rolled ${roll} — ${ok ? 'holds' : 'the ship explodes'}` });
      if (!ok) st.destroyed = true;
    } else if (d.box.shape === 'star') {
      st.effects.push({ kind: 'destroyed', text: 'SI star destroyed — the ship is destroyed' });
      st.destroyed = true;
    }
  }
}

/** One hit on a system named in a hit location cell, for damage coming in through `edge`. */
export function applySystemHit(rng: Rng, cls: ShipClass, st: AllocationState, code: SystemCode, edge: HltEdge, why: string): 'applied' | 'skipped' {
  const mount = EDGE_MOUNT[edge];
  const skip = (text: string): 'skipped' => {
    st.effects.push({ kind: 'skip', text: `${why}: ${text}, location skipped` });
    return 'skipped';
  };
  const one = (id: TrackId): 'applied' | 'skipped' => {
    if (!hasTrack(cls, id) || remainingCount(track(cls, st, id)) === 0) return skip(`${id} exhausted`);
    hitTrack(cls, st, id, 1, why);
    return 'applied';
  };
  const weapon = (type: WeaponType): 'applied' | 'skipped' => {
    const i = weaponIndex(cls, mount, type);
    if (i < 0) return skip(`${cls.mounts[mount].name} has no ${type}`);
    return one(weaponTrackId(mount, i));
  };
  switch (code) {
    case 'fcon':
      return one(fconTrackId(mount));
    case 'CIC': {
      let any = false;
      for (const m of MOUNTS) {
        if (remainingCount(track(cls, st, fconTrackId(m))) > 0) {
          hitTrack(cls, st, fconTrackId(m), 1, `${why} (CIC)`);
          any = true;
        }
      }
      return any ? 'applied' : skip('all fire control gone');
    }
    case 'L':
    case 'M':
    case 'G':
    case 'ET':
    case 'CM':
    case 'PD':
      return weapon(code);
    case 'mag': {
      const cap = cls.mounts[mount].magazine;
      if (cap === null) return skip(`${cls.mounts[mount].name} has no magazine`);
      const left = st.damage.magazines[mount] ?? cap;
      if (left <= 0) return skip('magazine empty');
      const r = roll2d10minus(rng).value;
      const lost = Math.min(left, r);
      st.damage = { ...st.damage, magazines: { ...st.damage.magazines, [mount]: left - lost } };
      st.effects.push({ kind: 'hit', text: `${why}: magazine hit, 2d10− = ${r}: ${lost} salvo${lost === 1 ? '' : 'es'} lost from ${cls.mounts[mount].name}` });
      return 'applied';
    }
    case 'dcy': {
      const side: 'port' | 'starboard' = edge === 'port' || edge === 'starboard' ? edge : healthierSide(cls, st, decoyTrackId);
      if (!cls.mounts[side].decoys) return skip('no decoys');
      return one(decoyTrackId(side));
    }
    case 'sdwl': {
      const side: 'port' | 'starboard' = edge === 'port' || edge === 'starboard' ? edge : healthierSide(cls, st, sidewallTrackId);
      return one(sidewallTrackId(side));
    }
    case 'ECM':
      return one(internalTrackId('ecm'));
    case 'piv':
      return one(internalTrackId('pivot'));
    case 'rol':
      return one(internalTrackId('roll'));
    case 'com':
      return one(internalTrackId('communications'));
    case 'lif':
      return one(internalTrackId('lifeSupport'));
    case 'flg':
      return one(internalTrackId('flagBridge'));
    case 'hyp':
      return one(internalTrackId('hyperGenerator'));
    case 'brg': {
      const r = one(internalTrackId('bridge'));
      if (r === 'applied') {
        const check = roll2d10minus(rng).value;
        if (check >= 6) {
          const which = d10face(rng);
          const officer: OfficerType = which <= 2 ? 'TAC' : which <= 4 ? 'EWO' : which <= 6 ? 'ATO' : which <= 8 ? 'HELM' : 'ENG';
          st.officerLosses.push(officer);
          st.effects.push({ kind: 'officer', text: `bridge hit: 2d10− = ${check}, ${officer} drops one grade` });
        }
      }
      return r;
    }
    case 'fwd':
    case 'aft':
    case '2fwd':
    case '2aft': {
      const id = internalTrackId(code.endsWith('fwd') ? 'forwardImpeller' : 'aftImpeller');
      const count = code.startsWith('2') ? 2 : 1;
      const spec = trackSpec(cls, id);
      const state = track(cls, st, id);
      if (remainingCount(state) === 0) return skip(`${id} exhausted`);
      let destroyed = 0;
      if (count === 2) {
        // one of the two hits goes to the Warshawski sail if it is still there (C5.462)
        const wIdx = spec.boxes.findIndex((b, i) => b.mark === 'W' && state.boxes[i]?.status === 'ok');
        if (wIdx >= 0) {
          const boxes = state.boxes.map((b, i) => (i === wIdx ? { status: 'destroyed' as const, repairedOnTurn: null } : b));
          st.damage = { ...st.damage, tracks: { ...st.damage.tracks, [id]: { boxes } } };
          st.boxes += 1;
          destroyed += 1;
          st.effects.push({ kind: 'hit', text: `${why}: Warshawski sail destroyed on ${id}`, trackId: id, boxes: 1 });
          destroyed += hitTrack(cls, st, id, 1, why).destroyed.length;
        } else {
          destroyed += hitTrack(cls, st, id, 2, why).destroyed.length;
        }
      } else {
        destroyed += hitTrack(cls, st, id, 1, why).destroyed.length;
      }
      // for each impeller box marked off, also mark off one Maximum Thrust box (C5.461)
      if (destroyed > 0) hitTrack(cls, st, internalTrackId('maxThrust'), destroyed, 'impeller loss');
      return 'applied';
    }
    case 'hull': {
      const id = internalTrackId('hull');
      const r = roll2d10minus(rng).value;
      if (r === 0) {
        st.effects.push({ kind: 'note', text: `${why}: hull hit, 2d10− = 0, nothing marked` });
        return 'applied';
      }
      const left = remainingCount(track(cls, st, id));
      if (left === 0) {
        st.effects.push({ kind: 'note', text: `${why}: hull gone — hit cascades to Structural Integrity` });
        structuralHits(rng, cls, st, 1, `${why} (hull cascade)`);
        return 'applied';
      }
      const res = hitTrack(cls, st, id, Math.min(left, r), `${why}: hull hit, 2d10− = ${r}`);
      const parties = res.destroyed.filter((d) => d.box.mark === 'wrench').length;
      if (parties) st.effects.push({ kind: 'note', text: `${parties} damage-control part${parties === 1 ? 'y' : 'ies'} lost` });
      if (r > left) {
        st.effects.push({ kind: 'note', text: 'hull exhausted; the leftover cascades one SI box' });
        structuralHits(rng, cls, st, 1, `${why} (hull cascade)`);
      }
      return 'applied';
    }
    case 'SI':
      if (remainingCount(track(cls, st, internalTrackId('structuralIntegrity'))) === 0) return skip('SI gone');
      structuralHits(rng, cls, st, 1, why);
      return 'applied';
  }
}

export interface LineTraversal {
  readonly cellsHit: HltCell[];
  readonly lost: number;
}

/**
 * Walk one line of the hit location table with `depth` points (C5.23–C5.25). Cells before the
 * silhouette are skipped; a blank after entering means the damage has left the silhouette and
 * is lost; entering or leaving the Core costs the Core Armor; an exhausted system is skipped
 * without costing depth (C5.413), except hull, which cascades to SI.
 */
export function traverseLine(rng: Rng, cls: ShipClass, st: AllocationState, edge: HltEdge, cells: readonly HltCell[], depth: number, why: string): LineTraversal {
  let d = depth;
  let entered = false;
  let inCore = false;
  const cellsHit: HltCell[] = [];
  for (const cell of cells) {
    if (d <= 0 || st.destroyed) break;
    if (cell.code === null) {
      if (!entered) continue;
      break;
    }
    entered = true;
    if (cell.core !== inCore) {
      d -= cls.hitLocation.coreArmor;
      inCore = cell.core;
      if (d <= 0) {
        st.effects.push({ kind: 'lost', text: `${why}: stopped by the Core Armor` });
        return { cellsHit, lost: 0 };
      }
    }
    if (applySystemHit(rng, cls, st, cell.code, edge, `${why} → ${cell.code}`) === 'applied') {
      cellsHit.push(cell);
      d -= 1;
    }
  }
  if (d > 0) st.effects.push({ kind: 'lost', text: `${why}: ${d} point${d === 1 ? '' : 's'} punched through` });
  return { cellsHit, lost: Math.max(0, d) };
}

/** Resolve one warhead that has reached the ship: penetration, hit location, span, traversal. */
export function resolveWarhead(rng: Rng, cls: ShipClass, st: AllocationState, placement: Placement, warhead: Warhead, label: string, wedgeDown = false): Penetration {
  const pen = penetrate(rng, warhead, cls.hitLocation.scale, placement.protection, wedgeDown);
  if (pen.sidewallBox) st.pendingSidewallHits.push(placement);
  if (!pen.penetrates) {
    st.effects.push({ kind: 'deflected', text: `${label}: penetration ${pen.natural}${pen.sidewallBox ? ' (natural 0: sidewall box)' : ''} — deflected` });
    return pen;
  }
  let edge = placement.edge;
  let roll = roll2d10plus(rng) + placement.rollShift;
  if (roll < 2 || roll > 20) {
    // leaked past the end of the side table: resolve on the Forward or Aft table instead
    edge = roll < 2 ? 'forward' : 'aft';
    roll = roll2d10plus(rng);
    st.effects.push({ kind: 'note', text: `${label}: shifted roll off the table, re-rolled on the ${edge} edge` });
  }
  const span = SPAN[warhead.kind];
  const half = (span - 1) / 2;
  st.effects.push({ kind: 'note', text: `${label}: depth ${pen.depth}${pen.sidewallBox ? ' (natural 0: sidewall box)' : ''}, hit location ${roll} from ${edge}${span > 1 ? `, span ${span}` : ''}` });
  for (let off = -half; off <= half; off++) {
    const cells = cellsFromEdge(cls.hitLocation, edge, roll, off);
    if (!cells) continue;
    if (cells.length === 0) {
      st.effects.push({ kind: 'lost', text: `${label}: span line ${off > 0 ? '+' : ''}${off} falls off the table` });
      continue;
    }
    traverseLine(rng, cls, st, edge, cells, pen.depth, off === 0 ? label : `${label} span ${off > 0 ? '+' : ''}${off}`);
    if (st.destroyed) break;
  }
  return pen;
}

/** End of a damage step: the natural-zero sidewall boxes come off now (C5.213). */
export function finishDamageStep(rng: Rng, cls: ShipClass, st: AllocationState): void {
  for (const p of st.pendingSidewallHits) {
    let id: TrackId | null = null;
    if (p.aspect === 'sidewall' || p.aspect === 'leak') id = sidewallTrackId(p.edge as 'port' | 'starboard');
    else if (p.aspect === 'bow' && cls.bowWall) id = 'bowWall';
    else if (p.aspect === 'stern' && cls.sternWall) id = 'sternWall';
    if (id && remainingCount(track(cls, st, id)) > 0) {
      hitTrack(cls, st, id, 1, 'natural 0');
      continue;
    }
    st.effects.push({ kind: 'sidewall', text: 'natural 0 with no facing sidewall: automatic SI hit' });
    structuralHits(rng, cls, st, 1, 'natural 0');
  }
  st.pendingSidewallHits = [];
}

export interface SalvoImpact {
  /** Missiles that got through the defenses. */
  readonly missiles: number;
  readonly warhead: Warhead;
  /** The direction the missiles come from, as the target sees it. */
  readonly impactDir: Vec3;
}

/** Resolve a salvo's surviving missiles on the target. Missiles never stop at the wedge — they slide to a facing. */
export function resolveSalvoImpact(rng: Rng, cls: ShipClass, damage: ShipDamage, attitude: Attitude, salvo: SalvoImpact, wedgeDown = false): AllocationState {
  const st = beginAllocation(damage);
  const placement = placeShot(cls, damage, attitude, salvo.impactDir, 'missile', wedgeDown);
  if (!placement) return st;
  st.effects.push({ kind: 'note', text: `${salvo.missiles} missile${salvo.missiles === 1 ? '' : 's'} hit the ${placement.facing} (${placement.aspect}), protection ${placement.protection >= 0 ? '+' : ''}${placement.protection}` });
  for (let i = 0; i < salvo.missiles && !st.destroyed; i++) resolveWarhead(rng, cls, st, placement, salvo.warhead, `missile ${i + 1}`, wedgeDown);
  finishDamageStep(rng, cls, st);
  return st;
}
