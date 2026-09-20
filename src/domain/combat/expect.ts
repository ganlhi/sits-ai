/**
 * The expectation layer (PLAN.md Phase 5): the same combat arithmetic as `resolve`, fed with
 * dice distributions instead of rolls. This is what the AI ranks moves with.
 *
 * Distributions are exact for the defensive layers and for penetration; the box count is the
 * expected traversal for a fresh copy of the current damage state (within-salvo depletion is
 * ignored), averaged over every hit-location roll.
 */
import type { Attitude, Vec3 } from '../geometry';
import { cellsFromEdge, freshTrack, remainingCount, trackSpec, type HltCell, type ShipClass, type ShipDamage, type SystemCode, type TrackId } from '../ssd';
import { SPAN, depthModifier, depthFor, placeShot, type Placement, type Warhead } from './allocation';
import { DIST_2D10_MINUS, DIST_2D10_PLUS, bind, mapDist, mean, point, probAtLeast, type Dist } from './dice';
import { activeLayerColumn, activeLayerKills, ecmBaseColumn, ecmLayerKills, type DefenseContext, type InboundSalvo } from './missileDefense';

/** Survivors after the ECM layer. A decoy is assumed used whenever the policy is not 'never' and one is available. */
export function ecmSurvivors(salvo: InboundSalvo, ctx: DefenseContext): Dist {
  const n = salvo.missiles;
  if (n <= 0) return point(0);
  const base = ecmBaseColumn(salvo.mql, ctx.ecm, ctx.wedge);
  const decoy = ctx.decoyPolicy === 'never' ? null : ctx.decoyShift;
  return mapDist(DIST_2D10_MINUS, (roll) => n - Math.min(n, ecmLayerKills(n, Math.max(1, Math.min(25, base + roll)), decoy)));
}

function activeSurvivors(layer: 'cm' | 'pd', salvo: InboundSalvo, ctx: DefenseContext): (inbound: number) => Dist {
  const pk = layer === 'cm' ? ctx.cmProbableKills : ctx.pdProbableKills;
  return (inbound) => {
    if (inbound <= 0) return point(0);
    return mapDist(DIST_2D10_MINUS, (roll) => inbound - Math.min(inbound, activeLayerKills(layer, pk, activeLayerColumn(salvo.mql, roll, ctx.fconPenalty), { wedge: ctx.wedge, contactNukes: salvo.contactNukes })));
  };
}

/** Distribution of missiles reaching the hull after ECM, countermissiles and point defense. */
export function salvoSurvivors(salvo: InboundSalvo, ctx: DefenseContext): Dist {
  return bind(bind(ecmSurvivors(salvo, ctx), activeSurvivors('cm', salvo, ctx)), activeSurvivors('pd', salvo, ctx));
}

/** Distribution of Depth for one warhead; 0 means deflected. */
export function depthDist(warhead: Warhead, scale: number, protection: number, wedgeDown = false): Dist {
  const mod = depthModifier(warhead.damage, scale, protection);
  return mapDist(DIST_2D10_MINUS, (natural) => {
    const raw = mod + natural;
    if (raw < 1) return 0;
    return Math.max(0, depthFor(warhead.kind, raw, wedgeDown));
  });
}

interface CountCtx {
  readonly cls: ShipClass;
  readonly remaining: Map<TrackId, number>;
}

function remainingFor(cls: ShipClass, damage: ShipDamage): Map<TrackId, number> {
  const m = new Map<TrackId, number>();
  for (const [id, st] of Object.entries(damage.tracks)) m.set(id, remainingCount(st));
  for (const t of (['sidewall.port', 'sidewall.starboard'] as TrackId[])) if (!m.has(t)) m.set(t, remainingCount(freshTrack(trackSpec(cls, t))));
  return m;
}

/** Whether a cell can absorb a hit right now (an exhausted system is skipped, C5.413). Hull always absorbs (it cascades to SI). */
function absorbs(ctx: CountCtx, code: SystemCode, edge: Placement['edge']): boolean {
  const cls = ctx.cls;
  const mount = edge;
  const has = (id: TrackId) => (ctx.remaining.get(id) ?? 0) > 0;
  switch (code) {
    case 'hull':
    case 'SI':
      return true;
    case 'CIC':
      return true;
    case 'mag':
      return cls.mounts[mount].magazine !== null;
    case 'fcon':
      return has(`mount.${mount}.fcon`);
    case 'L':
    case 'M':
    case 'G':
    case 'ET':
    case 'CM':
    case 'PD': {
      const i = cls.mounts[mount].weapons.findIndex((w) => w.type === code);
      return i >= 0 && has(`mount.${mount}.weapon.${i}`);
    }
    case 'dcy':
      return has(`mount.${mount === 'forward' || mount === 'aft' ? 'port' : mount}.decoys`) || has('mount.starboard.decoys');
    case 'sdwl':
      return has('sidewall.port') || has('sidewall.starboard');
    case 'ECM':
      return has('internals.ecm');
    case 'piv':
      return has('internals.pivot');
    case 'rol':
      return has('internals.roll');
    case 'brg':
      return has('internals.bridge');
    case 'com':
      return has('internals.communications');
    case 'lif':
      return has('internals.lifeSupport');
    case 'flg':
      return has('internals.flagBridge');
    case 'hyp':
      return has('internals.hyperGenerator');
    case 'fwd':
    case '2fwd':
      return has('internals.forwardImpeller');
    case 'aft':
    case '2aft':
      return has('internals.aftImpeller');
  }
}

/** Cells a depth-`depth` shot down one line would hit, without rolling anything. */
export function countLine(ctx: CountCtx, edge: Placement['edge'], cells: readonly HltCell[], depth: number): HltCell[] {
  let d = depth;
  let entered = false;
  let inCore = false;
  const out: HltCell[] = [];
  for (const cell of cells) {
    if (d <= 0) break;
    if (cell.code === null) {
      if (!entered) continue;
      break;
    }
    entered = true;
    if (cell.core !== inCore) {
      d -= ctx.cls.hitLocation.coreArmor;
      inCore = cell.core;
      if (d <= 0) break;
    }
    if (absorbs(ctx, cell.code, edge)) {
      out.push(cell);
      d -= 1;
    }
  }
  return out;
}

export interface HitExpectation {
  /** Probability the warhead penetrates at all. */
  readonly pPenetrate: number;
  /** Expected boxes (cells hit) per warhead, including deflections as 0. */
  readonly boxes: number;
  /** Expected Core cells hit per warhead. */
  readonly coreBoxes: number;
  /** Expected SI cells hit per warhead. */
  readonly siBoxes: number;
}

/** Expected effect of one warhead arriving through `placement`. */
export function expectHit(cls: ShipClass, damage: ShipDamage, placement: Placement, warhead: Warhead, wedgeDown = false): HitExpectation {
  const ctx: CountCtx = { cls, remaining: remainingFor(cls, damage) };
  const depths = depthDist(warhead, cls.hitLocation.scale, placement.protection, wedgeDown);
  const span = SPAN[warhead.kind];
  const half = (span - 1) / 2;
  let boxes = 0;
  let coreBoxes = 0;
  let siBoxes = 0;
  for (const [depth, pd] of depths) {
    if (depth <= 0) continue;
    for (const [roll, pr] of DIST_2D10_PLUS) {
      let shifted = roll + placement.rollShift;
      let edge = placement.edge;
      if (shifted < 2 || shifted > 20) {
        // re-rolled on the end table: approximate with the median roll
        edge = shifted < 2 ? 'forward' : 'aft';
        shifted = 11;
      }
      for (let off = -half; off <= half; off++) {
        const cells = cellsFromEdge(cls.hitLocation, edge, shifted, off);
        if (!cells || cells.length === 0) continue;
        const hit = countLine(ctx, edge, cells, depth);
        boxes += pd * pr * hit.length;
        coreBoxes += pd * pr * hit.filter((c) => c.core).length;
        siBoxes += pd * pr * hit.filter((c) => c.code === 'SI').length;
      }
    }
  }
  return { pPenetrate: probAtLeast(depths, 1), boxes, coreBoxes, siBoxes };
}

export interface SalvoExpectation {
  readonly survivors: Dist;
  readonly expectedSurvivors: number;
  readonly pAnyHit: number;
  readonly perHit: HitExpectation | null;
  readonly expectedBoxes: number;
  readonly expectedSiBoxes: number;
}

/** Expected damage of a salvo: defenses, then per-missile allocation on the facing it slides to. */
export function expectSalvo(salvo: InboundSalvo, ctx: DefenseContext, target: { cls: ShipClass; damage: ShipDamage; attitude: Attitude }, warhead: Warhead, impactDir: Vec3, wedgeDown = false): SalvoExpectation {
  const survivors = salvoSurvivors(salvo, ctx);
  const es = mean(survivors);
  const placement = placeShot(target.cls, target.damage, target.attitude, impactDir, 'missile', wedgeDown);
  const perHit = placement ? expectHit(target.cls, target.damage, placement, warhead, wedgeDown) : null;
  return {
    survivors,
    expectedSurvivors: es,
    pAnyHit: perHit ? 1 - Math.pow(1 - perHit.pPenetrate, Math.max(0, es)) : 0,
    perHit,
    expectedBoxes: perHit ? es * perHit.boxes : 0,
    expectedSiBoxes: perHit ? es * perHit.siBoxes : 0,
  };
}
