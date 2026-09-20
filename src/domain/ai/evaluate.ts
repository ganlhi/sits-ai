/**
 * Scoring a candidate plot: damage we expect to deal minus damage we expect to take, plus
 * positional terms. The enemy's orders are unknown at plotting (it plots simultaneously), so
 * every enemy is assumed to drift on its vectors and hold its attitude.
 *
 * The damage model is deliberately coarse — the real resolution happens on the table — but it
 * keeps the shape of the rules:
 *   - salvoes by EoT-to-EoT range band, bearings by salvo timing (RULES.md §3 step 3, §11);
 *   - the ECM layer as a survival fraction by final column, the wedge as its +12 shift with no
 *     countermissiles and half point defense (§12.2–12.3);
 *   - beams hit automatically in arc and range, never through the wedge, at half range into an
 *     unwalled bow or stern (§14.3);
 *   - the facing that takes the hit is the reported effectiveness of that facing: it fires
 *     fewer tubes, kills fewer missiles, and is worth more to hit.
 */
import {
  MOUNTS,
  ZERO_VELOCITY,
  applyManeuver,
  bearing,
  dot,
  impactWindow,
  markerDirection,
  mountArcColour,
  planMotion,
  wedgeCovers,
  windowDirection,
  type ArcDiagram,
  type Attitude,
  type Bearing,
  type Maneuver,
  type Mount,
  type TurnMotion,
  type Vec3,
  type Velocity,
} from '../geometry';
import { bdaIndex, beamBatteries, beamDamageAtRange, ecmRating, enemiesOf, missileBattery, pointDefense, shipClassOf, type Game, type Launch, type Ship } from '../game';
import { rangeBandFor, type SalvoTiming, type ShipClass } from '../ssd';
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
  /** Enemy salvoes that would arrive through our wedge. */
  readonly wedgedSalvoes: number;
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

/** An enemy as the planner assumes it: drifting, attitude held. */
interface Foe {
  readonly ship: Ship;
  readonly cls: ShipClass;
  readonly motion: TurnMotion;
}

/** Mean of "2d10−" (two dice, take the lower). */
const MEAN_2D10_LOW = 3.5;
/** The wedge's column shift in the ECM layer (C4.12). */
const WEDGE_ECM = 12;
/** Damage terms are scored in tens of points so the doctrine weights stay readable. */
const DAMAGE_SCALE = 0.1;

/**
 * Fraction of a salvo that survives the ECM layer at a final column: a straight line through
 * the 100-missile row of the table (1 kill at column 1, 85 at column 25).
 */
export function ecmSurvival(column: number): number {
  return Math.max(0, Math.min(1, 1 - 0.035 * (column - 1)));
}

/** The facing a hit arriving from `dir` lands on: the nearest of the four side markers (C5.11). */
export function impactFacing(a: Attitude, dir: Vec3): Mount {
  let best: Mount = 'forward';
  let bestDot = -Infinity;
  for (const m of MOUNTS) {
    const d = dot(dir, markerDirection(a, m));
    if (d > bestDot) {
      bestDot = d;
      best = m;
    }
  }
  return best;
}

/** A facing at 40% is worth more to hit than one at 100%: weaker sidewall, fewer defenses. */
const vulnerability = (percent: number): number => 1 + (1 - Math.max(0, Math.min(100, percent)) / 100) * 0.5;

export const arcsOf = (cls: ShipClass): Readonly<Record<Mount, ArcDiagram>> => ({
  forward: cls.mounts.forward.arc,
  aft: cls.mounts.aft.arc,
  port: cls.mounts.port.arc,
  starboard: cls.mounts.starboard.arc,
});

/** Drift for one turn: no thrust, no maneuver. */
export const driftMotion = (s: Ship): TurnMotion => planMotion({ position: s.position, velocity: s.velocity, halfDisplacements: s.halfDisplacements }, ZERO_VELOCITY, false);

interface Combatant {
  readonly ship: Ship;
  readonly cls: ShipClass;
}

/**
 * Expected damage of one salvo from `shooter`'s mount at `target`, arriving from `impactDir`
 * while the target holds `targetAttitude`, launched at `range`.
 */
export function salvoDamage(shooter: Combatant, mount: Mount, target: Combatant, targetAttitude: Attitude, impactDir: Vec3, range: number): number {
  const battery = missileBattery(shooter.cls, mount, shooter.ship.effectiveness);
  if (!battery) return 0;
  const band = rangeBandFor(shooter.cls, range);
  if (!band) return 0;
  const wedge = wedgeCovers(targetAttitude, impactDir);
  const facing = impactFacing(targetAttitude, impactDir);
  const column = band.baseMql + (wedge ? WEDGE_ECM : ecmRating(target.cls, target.ship.bda)) + MEAN_2D10_LOW;
  const defense = pointDefense(target.cls, facing, target.ship.effectiveness);
  const through = battery.tubes * ecmSurvival(column) - (wedge ? 0 : defense.cm) - defense.pd * (wedge ? 0.5 : 1);
  return Math.max(0, through) * battery.damage * vulnerability(target.ship.effectiveness[facing]);
}

/** Expected damage of `shooter`'s beams at `target` for one beam impact, positions and attitudes given. */
export function beamDamage(shooter: Combatant, shooterAttitude: Attitude, target: Combatant, targetAttitude: Attitude, b: Bearing): number {
  if (!b.window) return 0;
  const dir = windowDirection(b.window);
  const impactDir = windowDirection(impactWindow(b)!);
  if (wedgeCovers(targetAttitude, impactDir)) return 0;
  const facing = impactFacing(targetAttitude, impactDir);
  const sidewall = facing === 'port' || facing === 'starboard';
  const range = sidewall ? b.range : Math.floor(b.range / 2);
  const arcs = arcsOf(shooter.cls);
  let total = 0;
  for (const m of MOUNTS) {
    if (mountArcColour(arcs, m, shooterAttitude, dir) === 'black') continue;
    for (const beam of beamBatteries(shooter.cls, m, shooter.ship.effectiveness)) {
      const dmg = beamDamageAtRange(beam.damage, range);
      if (dmg !== null) total += beam.count * dmg;
    }
  }
  return total * vulnerability(target.ship.effectiveness[facing]);
}

/** One planning session for one ship. */
export class Evaluator {
  private readonly me: Combatant;
  private readonly foes: Foe[];
  private readonly arcs: Readonly<Record<Mount, ArcDiagram>>;

  constructor(
    readonly game: Game,
    readonly ship: Ship,
    readonly weights: DoctrineWeights,
    private readonly noiseSource: () => number,
  ) {
    const cls = shipClassOf(ship);
    this.me = { ship, cls };
    this.arcs = arcsOf(cls);
    this.foes = enemiesOf(game, ship).map((s) => ({ ship: s, cls: shipClassOf(s), motion: driftMotion(s) }));
  }

  get hasFoes(): boolean {
    return this.foes.length > 0;
  }

  evaluate(c: Candidate): Evaluation {
    const me = this.ship;
    const w = this.weights;
    const motion = planMotion({ position: me.position, velocity: me.velocity, halfDisplacements: me.halfDisplacements }, c.thrust, c.maneuver.pivotTo !== undefined);
    const attMid = applyManeuver(me.attitude, c.maneuver, 0.5);
    const attEot = applyManeuver(me.attitude, c.maneuver, 1);
    const myAttitudeAt: Record<SalvoTiming, Attitude> = { early: me.attitude, middle: attMid, late: attEot };

    let dealt = 0;
    let received = 0;
    let positional = 0;
    let wedgedSalvoes = 0;
    let nearest: number | null = null;
    const launches: Launch[] = [];

    for (const foe of this.foes) {
      const eotB = bearing(motion.endOfTurn, foe.motion.endOfTurn);
      const eotRange = eotB.range;
      nearest = nearest === null ? eotRange : Math.min(nearest, eotRange);
      const priority = 1 + 0.15 * bdaIndex(foe.ship.bda);
      const foeCombatant: Combatant = { ship: foe.ship, cls: foe.cls };

      // --- my missiles: launched at step 3 with my current attitude, salvoes by EoT range
      const band = rangeBandFor(this.me.cls, eotRange);
      if (band) {
        const geometry: Record<SalvoTiming, Bearing> = {
          early: bearing(me.position, foe.ship.position),
          middle: bearing(me.position, foe.motion.midpoint),
          late: bearing(motion.midpoint, foe.motion.endOfTurn),
        };
        const perMount = new Map<Mount, { timings: SalvoTiming[]; damage: number; missiles: number }>();
        for (const t of band.salvoes) {
          const g = geometry[t];
          if (!g.window) continue;
          const impactDir = windowDirection(impactWindow(g)!);
          for (const m of MOUNTS) {
            const battery = missileBattery(this.me.cls, m, me.effectiveness);
            if (!battery) continue;
            if (mountArcColour(this.arcs, m, me.attitude, windowDirection(g.window)) === 'black') continue;
            const dmg = salvoDamage(this.me, m, foeCombatant, foe.ship.attitude, impactDir, g.range);
            if (dmg <= 0) continue;
            const entry = perMount.get(m) ?? { timings: [], damage: 0, missiles: battery.tubes };
            entry.timings.push(t);
            entry.damage += dmg;
            perMount.set(m, entry);
          }
        }
        for (const [m, e] of perMount) {
          dealt += e.damage * priority;
          launches.push({ mount: m, targetId: foe.ship.id, timings: e.timings, missiles: e.missiles });
        }
      }

      // --- my beams at the two beam impacts: Midpoint (half maneuver) and End of Turn
      dealt += beamDamage(this.me, attMid, foeCombatant, foe.ship.attitude, bearing(motion.midpoint, foe.motion.midpoint)) * priority;
      dealt += beamDamage(this.me, attEot, foeCombatant, foe.ship.attitude, eotB) * priority;

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
          const impactDir = windowDirection(impactWindow(g)!);
          let anyBattery = false;
          for (const m of MOUNTS) {
            if (!missileBattery(foe.cls, m, foe.ship.effectiveness)) continue;
            if (mountArcColour(foeArcs, m, foe.ship.attitude, windowDirection(g.window)) === 'black') continue;
            anyBattery = true;
            received += salvoDamage(foeCombatant, m, this.me, myAttitudeAt[t], impactDir, g.range);
          }
          if (anyBattery && wedgeCovers(myAttitudeAt[t], impactDir)) {
            positional += w.wedge;
            wedgedSalvoes += 1;
          }
        }
      }
      // --- the enemy's beams at me
      received += beamDamage(foeCombatant, foe.ship.attitude, this.me, attMid, bearing(foe.motion.midpoint, motion.midpoint));
      received += beamDamage(foeCombatant, foe.ship.attitude, this.me, attEot, bearing(foe.motion.endOfTurn, motion.endOfTurn));

      // --- still bearing next turn?
      if (eotB.window) {
        const dir = windowDirection(eotB.window);
        const bears = (['port', 'starboard'] as const).some((m) => missileBattery(this.me.cls, m, me.effectiveness) && mountArcColour(this.arcs, m, attEot, dir) !== 'black');
        if (bears) positional += w.bearingNextTurn;
      }
    }

    const caution = 1 + 0.35 * bdaIndex(me.bda);
    const range = w.preferredRange !== null && nearest !== null ? -w.rangeWeight * Math.abs(nearest - w.preferredRange) : 0;
    const noise = (this.noiseSource() - 0.5) * 2 * w.noise;
    const total = w.offense * dealt * DAMAGE_SCALE - w.defense * caution * received * DAMAGE_SCALE + range + positional + noise;
    return { candidate: c, launches, breakdown: { dealt, received, range, positional, wedgedSalvoes, noise, total }, motion, eotAttitude: attEot, eotRangeToNearest: nearest };
  }
}
