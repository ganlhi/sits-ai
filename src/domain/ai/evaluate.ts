/**
 * Scoring a candidate plan (PLAN.md Phase 6): expected boxes dealt minus expected boxes
 * received, plus positional terms, all from the Phase 5 expectation layer.
 *
 * The enemy's orders are unknown at plotting (it plots simultaneously), so it is assumed to
 * drift on its vectors and hold its attitude. Expensive pieces — the expected damage of a
 * salvo on a target facing, the expected boxes of one hit through a placement — are memoised
 * per evaluation session because they depend only on the target's state and the facing.
 */
import {
  MOUNTS,
  ZERO_VELOCITY,
  applyManeuver,
  bearing,
  impactWindow,
  maneuverPivots,
  mountArcColour,
  planMotion,
  wedgeCovers,
  windowDirection,
  type ArcColour,
  type Attitude,
  type Bearing,
  type Maneuver,
  type Mount,
  type Position,
  type TurnMotion,
  type Velocity,
} from '../geometry';
import {
  adjustedCmKills,
  adjustedPdKills,
  arcsOf,
  beamDamageAtRange,
  beamKind,
  beamRangeFor,
  ewoEcmModifier,
  expectHit,
  expectSalvo,
  placeShot,
  tacMqlModifier,
  type DefenseContext,
  type HitExpectation,
  type Warhead,
} from '../combat';
import { shipClassOf, type GameState, type Launch, type ShipState } from '../game';
import { currentValue, decoyTrackId, fconTrackId, freshTrack, internalTrackId, rangeBandFor, remainingCount, trackSpec, weaponTrackId, type SalvoTiming, type ShipClass } from '../ssd';
import type { DoctrineWeights } from './doctrine';

export interface Candidate {
  readonly maneuver: Maneuver;
  readonly thrust: Velocity;
  readonly thrustUsed: number;
}

export interface Breakdown {
  readonly dealt: number;
  readonly received: number;
  readonly range: number;
  readonly positional: number;
  readonly noise: number;
  readonly total: number;
}

export interface Evaluation {
  readonly candidate: Candidate;
  readonly launches: Launch[];
  readonly breakdown: Breakdown;
  readonly motion: TurnMotion;
  readonly eotAttitude: Attitude;
  readonly eotRangeToNearest: number | null;
}

/** A snapshot of an enemy as the planner assumes it: drifting, attitude held. */
interface Foe {
  readonly ship: ShipState;
  readonly cls: ShipClass;
  readonly motion: TurnMotion;
}

const rating = (cls: ShipClass, ship: ShipState, id: string): number => currentValue(trackSpec(cls, id), ship.damage.tracks[id] ?? freshTrack(trackSpec(cls, id))) ?? 0;

function battery(cls: ShipClass, ship: ShipState, mount: Mount): { tubes: number; warhead: Warhead; mql: number } | null {
  const i = cls.mounts[mount].weapons.findIndex((w) => w.type === 'M');
  if (i < 0) return null;
  const tubes = rating(cls, ship, weaponTrackId(mount, i));
  const mag = ship.damage.magazines[mount] ?? cls.mounts[mount].magazine ?? 0;
  if (tubes <= 0 || mag <= 0) return null;
  return { tubes, warhead: { kind: 'laserhead', damage: cls.mounts[mount].weapons[i]!.damage[0] ?? 0 }, mql: rating(cls, ship, fconTrackId(mount)) + tacMqlModifier(ship.grades.TAC) };
}

function defenseContext(cls: ShipClass, ship: ShipState, attitude: Attitude, impactDir: ReturnType<typeof windowDirection>): DefenseContext {
  const placement = placeShot(cls, ship.damage, attitude, impactDir, 'missile');
  const mount = placement?.mount ?? null;
  const pk = (type: 'CM' | 'PD'): number => {
    if (!mount) return 0;
    const i = cls.mounts[mount].weapons.findIndex((w) => w.type === type);
    return i < 0 ? 0 : rating(cls, ship, weaponTrackId(mount, i));
  };
  let decoyShift: number | null = null;
  const sides: ('port' | 'starboard')[] = mount === 'port' || mount === 'starboard' ? [mount] : ['port', 'starboard'];
  for (const s of sides) {
    const d = cls.mounts[s].decoys;
    if (!d) continue;
    const st = ship.damage.tracks[decoyTrackId(s)] ?? freshTrack(d);
    if (remainingCount(st) > 0) decoyShift = currentValue(d, st);
  }
  return {
    ecm: rating(cls, ship, internalTrackId('ecm')) + ewoEcmModifier(ship.grades.EWO),
    wedge: wedgeCovers(attitude, impactDir),
    decoyShift,
    decoyPolicy: 'always',
    cmProbableKills: adjustedCmKills(pk('CM'), ship.grades.ATO),
    pdProbableKills: adjustedPdKills(pk('PD'), ship.grades.ATO),
    fconPenalty: mount ? rating(cls, ship, fconTrackId(mount)) : 0,
  };
}

/** One planning session for one ship: caches keyed by what the expectation actually depends on. */
export class Evaluator {
  private readonly cls: ShipClass;
  private readonly foes: Foe[];
  private readonly salvoCache = new Map<string, number>();
  private readonly hitCache = new Map<string, HitExpectation | null>();

  constructor(
    readonly game: GameState,
    readonly ship: ShipState,
    readonly weights: DoctrineWeights,
    private readonly noiseSource: () => number,
  ) {
    this.cls = shipClassOf(game, ship);
    this.foes = game.shipOrder
      .map((id) => game.ships[id]!)
      .filter((s) => s && !s.destroyed && s.side !== ship.side)
      .map((s) => ({ ship: s, cls: shipClassOf(game, s), motion: planMotion({ position: s.position, velocity: s.velocity, halfDisplacements: s.halfDisplacements }, s.orders?.thrust ?? ZERO_VELOCITY, s.orders ? maneuverPivots(s.orders.maneuver) : false, s.grades.ENG) }));
  }

  get hasFoes(): boolean {
    return this.foes.length > 0;
  }

  /** Expected boxes of `missiles` from `shooter`'s mount at `target`, arriving through `impact` while the target holds `targetAttitude`. */
  private salvoBoxes(shooter: { cls: ShipClass; ship: ShipState }, mount: Mount, target: { cls: ShipClass; ship: ShipState }, targetAttitude: Attitude, impact: NonNullable<Bearing['window']>, range: number): number {
    const b = battery(shooter.cls, shooter.ship, mount);
    if (!b) return 0;
    const band = rangeBandFor(shooter.cls, range);
    if (!band) return 0;
    const dir = windowDirection(impact);
    const key = `${shooter.ship.id}|${mount}|${target.ship.id}|${impact.ring}:${'az' in impact ? impact.az : ''}:${'hemi' in impact ? impact.hemi : ''}|${band.baseMql}|${attitudeKey(targetAttitude)}`;
    const cached = this.salvoCache.get(key);
    if (cached !== undefined) return cached;
    const ctx = defenseContext(target.cls, target.ship, targetAttitude, dir);
    const e = expectSalvo({ missiles: b.tubes, mql: band.baseMql + b.mql, contactNukes: false }, ctx, { cls: target.cls, damage: target.ship.damage, attitude: targetAttitude }, b.warhead, dir);
    this.salvoCache.set(key, e.expectedBoxes);
    return e.expectedBoxes;
  }

  /** Expected boxes from `shooter`'s beams at `target` right now (positions and attitudes given). */
  private beamBoxes(shooter: { cls: ShipClass; ship: ShipState; attitude: Attitude }, target: { cls: ShipClass; ship: ShipState; attitude: Attitude }, b: Bearing): number {
    if (!b.window) return 0;
    const impactDir = windowDirection(impactWindow(b)!);
    const placement = placeShot(target.cls, target.ship.damage, target.attitude, impactDir, 'beam');
    if (!placement) return 0;
    const dir = windowDirection(b.window);
    const arcs = arcsOf(shooter.cls);
    let total = 0;
    for (const m of MOUNTS) {
      if (mountArcColour(arcs, m, shooter.attitude, dir) === 'black') continue;
      shooter.cls.mounts[m].weapons.forEach((w, wi) => {
        const kind = beamKind(w.type);
        if (!kind) return;
        const count = rating(shooter.cls, shooter.ship, weaponTrackId(m, wi));
        if (count <= 0) return;
        if (kind === 'et' && placement.sidewallUp) return;
        const dmg = beamDamageAtRange(w, beamRangeFor(placement, b.range, kind));
        if (dmg === null) return;
        const hits = kind === 'et' ? count * 3 : count;
        const key = `${target.ship.id}|${placement.edge}|${placement.protection}|${kind}|${dmg}`;
        let h = this.hitCache.get(key);
        if (h === undefined) {
          h = expectHit(target.cls, target.ship.damage, placement, { kind, damage: dmg });
          this.hitCache.set(key, h);
        }
        total += hits * (h?.boxes ?? 0);
      });
    }
    return total;
  }

  evaluate(c: Candidate): Evaluation {
    const me = this.ship;
    const motion = planMotion({ position: me.position, velocity: me.velocity, halfDisplacements: me.halfDisplacements }, c.thrust, maneuverPivots(c.maneuver), me.grades.ENG);
    const attMid = applyManeuver(me.attitude, c.maneuver, 0.5);
    const attEot = applyManeuver(me.attitude, c.maneuver, 1);
    const myAttitudeAt: Record<SalvoTiming, Attitude> = { early: me.attitude, middle: attMid, late: attEot };
    const w = this.weights;

    let dealt = 0;
    let received = 0;
    let positional = 0;
    let nearest: number | null = null;
    const launches: Launch[] = [];

    for (const foe of this.foes) {
      const eotRange = bearing(motion.endOfTurn, foe.motion.endOfTurn).range;
      nearest = nearest === null ? eotRange : Math.min(nearest, eotRange);

      // --- my missiles: launched at step 3 with my current attitude, salvoes by EoT range
      const band = rangeBandFor(this.cls, eotRange);
      if (band) {
        const geometry: Record<SalvoTiming, Bearing> = {
          early: bearing(me.position, foe.ship.position),
          middle: bearing(me.position, foe.motion.midpoint),
          late: bearing(motion.midpoint, foe.motion.endOfTurn),
        };
        const arcs = arcsOf(this.cls);
        const perMount = new Map<Mount, { timings: SalvoTiming[]; boxes: number; missiles: number }>();
        for (const t of band.salvoes) {
          const g = geometry[t];
          if (!g.window) continue;
          const impact = impactWindow(g)!;
          for (const m of MOUNTS) {
            const b = battery(this.cls, me, m);
            if (!b) continue;
            if (mountArcColour(arcs, m, me.attitude, windowDirection(g.window)) === 'black') continue;
            const boxes = this.salvoBoxes({ cls: this.cls, ship: me }, m, { cls: foe.cls, ship: foe.ship }, foe.ship.attitude, impact, g.range);
            if (boxes <= 0) continue;
            const entry = perMount.get(m) ?? { timings: [], boxes: 0, missiles: b.tubes };
            entry.timings.push(t);
            entry.boxes += boxes;
            perMount.set(m, entry);
          }
        }
        for (const [m, e] of perMount) {
          dealt += e.boxes;
          launches.push({ mount: m, targetId: foe.ship.id, timings: e.timings, missiles: e.missiles });
        }
      }

      // --- my beams at the two beam impacts: Midpoint (positions at midpoints, half maneuver) and EoT
      const midB = bearing(motion.midpoint, foe.motion.midpoint);
      const eotB = bearing(motion.endOfTurn, foe.motion.endOfTurn);
      dealt += this.beamBoxes({ cls: this.cls, ship: me, attitude: attMid }, { cls: foe.cls, ship: foe.ship, attitude: foe.ship.attitude }, midB);
      dealt += this.beamBoxes({ cls: this.cls, ship: me, attitude: attEot }, { cls: foe.cls, ship: foe.ship, attitude: foe.ship.attitude }, eotB);

      // --- the enemy's missiles at me, with my attitude at each impact time
      const foeBand = rangeBandFor(foe.cls, eotRange);
      if (foeBand) {
        const geometry: Record<SalvoTiming, Bearing> = {
          early: bearing(foe.ship.position, me.position),
          middle: bearing(foe.ship.position, motion.midpoint),
          late: bearing(foe.motion.midpoint, motion.endOfTurn),
        };
        const foeArcs = arcsOf(foe.cls);
        for (const t of foeBand.salvoes) {
          const g = geometry[t];
          if (!g.window) continue;
          const impact = impactWindow(g)!;
          for (const m of MOUNTS) {
            if (!battery(foe.cls, foe.ship, m)) continue;
            if (mountArcColour(foeArcs, m, foe.ship.attitude, windowDirection(g.window)) === 'black') continue;
            received += this.salvoBoxes({ cls: foe.cls, ship: foe.ship }, m, { cls: this.cls, ship: me }, myAttitudeAt[t], impact, g.range);
          }
          if (wedgeCovers(myAttitudeAt[t], windowDirection(impact))) positional += w.wedge;
        }
      }
      // --- the enemy's beams at me
      received += this.beamBoxes({ cls: foe.cls, ship: foe.ship, attitude: foe.ship.attitude }, { cls: this.cls, ship: me, attitude: attMid }, bearing(foe.motion.midpoint, motion.midpoint));
      received += this.beamBoxes({ cls: foe.cls, ship: foe.ship, attitude: foe.ship.attitude }, { cls: this.cls, ship: me, attitude: attEot }, bearing(foe.motion.endOfTurn, motion.endOfTurn));

      // --- still bearing next turn?
      if (eotB.window) {
        const arcs = arcsOf(this.cls);
        const dir = windowDirection(eotB.window);
        const bears = (['port', 'starboard'] as Mount[]).some((m) => battery(this.cls, me, m) && mountArcColour(arcs, m, attEot, dir) !== 'black');
        if (bears) positional += w.bearingNextTurn;
      }
    }

    const range = w.preferredRange !== null && nearest !== null ? -w.rangeWeight * Math.abs(nearest - w.preferredRange) : 0;
    const noise = (this.noiseSource() - 0.5) * 2 * w.noise;
    const total = w.offense * dealt - w.defense * received + range + positional + noise;
    return { candidate: c, launches, breakdown: { dealt, received, range, positional, noise, total }, motion, eotAttitude: attEot, eotRangeToNearest: nearest };
  }
}

function attitudeKey(a: Attitude): string {
  const r = (x: number) => Math.round(x * 20) / 20;
  return `${r(a.forward.x)},${r(a.forward.y)},${r(a.forward.z)}|${r(a.top.x)},${r(a.top.y)},${r(a.top.z)}`;
}

export type { ArcColour, Position };
