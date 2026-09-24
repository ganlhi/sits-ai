/**
 * Scoring a candidate plot: the fraction of the enemy we expect to destroy minus the fraction
 * of ourselves we expect to lose, plus positional terms. The enemy's orders are unknown at
 * plotting (it plots simultaneously), so every enemy is assumed to drift on its vectors and
 * hold its attitude. At shooting the EoT markers are displaced and known: an enemy's EoT is
 * where the table shows it, its pivot and roll are still unknown.
 *
 * The damage model is deliberately coarse — the real resolution happens on the table — but it
 * keeps the shape of the rules and of the report:
 *   - salvoes by End-of-Turn range band, bearings by salvo timing (RULES.md §3 step 3, §11);
 *   - a ship targets one enemy through one side a turn: all its salvoes at that enemy come from
 *     the one side whose arc (the pointer's window and the eight around it) serves it best, and
 *     the enemy is assumed to do the same against us;
 *   - what gets through falls with the band and with the target facing's effectiveness (its
 *     countermissiles and point defense), and is cut hard by the wedge (§12);
 *   - a weak or damaged facing is worth more to hit, and one of ours is worth more to hide: the
 *     side's effectiveness and its own BDA both count;
 *   - beams hit automatically in arc within three hexes, never through the wedge, harder into
 *     an unwalled bow or stern (§14.3).
 */
import {
  MOUNTS,
  applyManeuver,
  bearing,
  dot,
  impactWindow,
  markerDirection,
  mountArcColour,
  planMotion,
  positionPlus,
  wedgeCovers,
  windowDirection,
  type Attitude,
  type Bearing,
  type Maneuver,
  type Mount,
  type TurnMotion,
  type Vec3,
  type Velocity,
} from '../geometry';
import { BAND_QUALITY, BAND_SALVOES, BEAM_REACH, STANDARD_ARCS, bandFor, bdaIndex, beamPower, enemiesOf, facingFactor, power, salvoPower, shipMotion, type BandName, type Game, type Launch, type SalvoTiming, type Ship } from '../game';
import { effectiveWeights, goalRange, postureFor, type Posture, type Weights } from './doctrine';

export interface Candidate {
  readonly maneuver: Maneuver;
  readonly thrust: Velocity;
  readonly thrustUsed: number;
}

export interface Breakdown {
  /** Fraction of the enemy fleet's cost expected destroyed. */
  readonly dealt: number;
  /** Fraction of our own cost expected destroyed. */
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

/** An enemy as the planner assumes it: attitude held, drifting unless its EoT marker is known to be displaced. */
interface Foe {
  readonly ship: Ship;
  readonly motion: TurnMotion;
}

/** What is left of a salvo after the wedge takes it: no countermissiles, but a +12 ECM shift. */
const WEDGE_FACTOR = 0.35;
/** How much of a salvo a fully effective facing's active defenses remove. */
const DEFENSE_FACTOR = 0.4;
/** Beams into an unwalled bow or stern count the range halved (C3.12). */
const HAMMERHEAD_BEAM_BONUS = 1.3;

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

/** How much more a hit is worth per BDA level of the side it lands on: armour and structure already gone there. */
export const BDA_EXPOSURE = 0.2;

/**
 * A facing at 40 % is worth more to hit than one at 100 %: weaker sidewall, fewer defenses; a
 * heavily damaged side more than an undamaged one: nearer the core.
 */
export const vulnerability = (target: Ship, facing: Mount): number => (2 - facingFactor(target, facing)) * (1 + BDA_EXPOSURE * bdaIndex(target.bda[facing]));

/** Expected damage (cost units) of one salvo from `shooter`'s mount at `target` holding `targetAttitude`, arriving from `impactDir`. */
export function salvoDamage(shooter: Ship, mount: Mount, band: BandName, target: Ship, targetAttitude: Attitude, impactDir: Vec3): number {
  const fp = salvoPower(shooter, mount);
  if (fp <= 0) return 0;
  const wedge = wedgeCovers(targetAttitude, impactDir);
  const facing = impactFacing(targetAttitude, impactDir);
  const through = wedge ? WEDGE_FACTOR : 1 - DEFENSE_FACTOR * facingFactor(target, facing);
  return fp * BAND_QUALITY[band] * through * vulnerability(target, facing);
}

/** Expected damage (cost units) of `shooter`'s beams at `target` for one beam impact. */
export function beamDamage(shooter: Ship, shooterAttitude: Attitude, target: Ship, targetAttitude: Attitude, b: Bearing): number {
  if (!b.window || b.range > BEAM_REACH) return 0;
  const dir = windowDirection(b.window);
  const impactDir = windowDirection(impactWindow(b)!);
  if (wedgeCovers(targetAttitude, impactDir)) return 0;
  const facing = impactFacing(targetAttitude, impactDir);
  const aspect = facing === 'port' || facing === 'starboard' ? 1 : HAMMERHEAD_BEAM_BONUS;
  // one side at a time: the best side with the target in its arc
  let best = 0;
  for (const m of MOUNTS) if (mountArcColour(STANDARD_ARCS, m, shooterAttitude, dir) !== 'black') best = Math.max(best, beamPower(shooter, m, b.range));
  return best * aspect * vulnerability(target, facing);
}

/** The salvoes one side would put into a target this turn. */
export interface SideVolley {
  readonly mount: Mount;
  readonly timings: SalvoTiming[];
  readonly damage: number;
  /** Salvoes that would arrive through the target's wedge. */
  readonly wedged: number;
}

/**
 * The shooter's best side against one target for the turn. Missiles launch at step 3 with the
 * shooter's current attitude; each salvo is shot on its timing's bearing and lands on the
 * target's attitude at that impact. Only one side may target a given enemy, so the others'
 * salvoes do not add up.
 */
export function bestVolley(
  shooter: Ship,
  shooterAttitude: Attitude,
  band: BandName,
  target: Ship,
  targetAttitudeAt: Readonly<Record<SalvoTiming, Attitude>>,
  geometry: Readonly<Record<SalvoTiming, Bearing>>,
): SideVolley | null {
  let best: SideVolley | null = null;
  for (const m of MOUNTS) {
    if (facingFactor(shooter, m) <= 0) continue;
    const timings: SalvoTiming[] = [];
    let damage = 0;
    let wedged = 0;
    for (const t of BAND_SALVOES[band]) {
      const g = geometry[t];
      if (!g.window) continue;
      if (mountArcColour(STANDARD_ARCS, m, shooterAttitude, windowDirection(g.window)) === 'black') continue;
      const impactDir = windowDirection(impactWindow(g)!);
      const dmg = salvoDamage(shooter, m, band, target, targetAttitudeAt[t], impactDir);
      if (dmg <= 0) continue;
      timings.push(t);
      damage += dmg;
      if (wedgeCovers(targetAttitudeAt[t], impactDir)) wedged += 1;
    }
    if (timings.length && (!best || damage > best.damage)) best = { mount: m, timings, damage, wedged };
  }
  return best;
}

/** One planning session for one ship. */
export class Evaluator {
  readonly posture: Posture;
  readonly weights: Weights;
  readonly goal: number | null;
  private readonly foes: Foe[];
  private readonly enemyPower: number;
  private readonly myPower: number;

  constructor(
    readonly game: Game,
    readonly ship: Ship,
    private readonly noiseSource: () => number,
  ) {
    const enemies = enemiesOf(game, ship);
    this.foes = enemies.map((s) => ({ ship: s, motion: shipMotion(s) }));
    this.posture = postureFor(ship, enemies);
    this.weights = effectiveWeights(ship.doctrine, this.posture);
    this.goal = goalRange(this.weights.rangeGoal, ship, enemies);
    this.enemyPower = Math.max(0.05, enemies.reduce((s, e) => s + power(e), 0));
    this.myPower = power(ship);
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
    let nearestNext: number | null = null;
    const launches: Launch[] = [];
    // where this turn's vectors carry us if nobody thrusts next turn: what the thrust choice is really about
    const nextMe = positionPlus(motion.endOfTurn, motion.newVelocity);

    for (const foe of this.foes) {
      const eotB = bearing(motion.endOfTurn, foe.motion.endOfTurn);
      const eotRange = eotB.range;
      nearest = nearest === null ? eotRange : Math.min(nearest, eotRange);
      const nextRange = bearing(nextMe, positionPlus(foe.motion.endOfTurn, foe.motion.newVelocity)).range;
      nearestNext = nearestNext === null ? nextRange : Math.min(nearestNext, nextRange);

      // --- my missiles: launched at step 3 with my current attitude, salvoes by EoT range, one side per target
      const band = bandFor(me.shipClass, eotRange);
      if (band) {
        const geometry: Record<SalvoTiming, Bearing> = {
          early: bearing(me.position, foe.ship.position),
          middle: bearing(me.position, foe.motion.midpoint),
          late: bearing(motion.midpoint, foe.motion.endOfTurn),
        };
        const foeAttitude: Record<SalvoTiming, Attitude> = { early: foe.ship.attitude, middle: foe.ship.attitude, late: foe.ship.attitude };
        const volley = bestVolley(me, me.attitude, band, foe.ship, foeAttitude, geometry);
        if (volley) {
          dealt += volley.damage;
          launches.push({ mount: volley.mount, targetId: foe.ship.id, timings: volley.timings });
        }
      }

      // --- my beams at the two beam impacts: Midpoint (half maneuver) and End of Turn
      dealt += beamDamage(me, attMid, foe.ship, foe.ship.attitude, bearing(motion.midpoint, foe.motion.midpoint));
      dealt += beamDamage(me, attEot, foe.ship, foe.ship.attitude, eotB);

      // --- the enemy's missiles at me, from its best side, with my attitude at each impact time
      const foeBand = bandFor(foe.ship.shipClass, eotRange);
      if (foeBand) {
        const geometry: Record<SalvoTiming, Bearing> = {
          early: bearing(foe.ship.position, me.position),
          middle: bearing(foe.ship.position, motion.midpoint),
          late: bearing(foe.motion.midpoint, motion.endOfTurn),
        };
        const volley = bestVolley(foe.ship, foe.ship.attitude, foeBand, me, myAttitudeAt, geometry);
        if (volley) {
          received += volley.damage;
          positional += w.wedge * volley.wedged;
          wedgedSalvoes += volley.wedged;
        }
      }
      // --- the enemy's beams at me
      received += beamDamage(foe.ship, foe.ship.attitude, me, attMid, bearing(foe.motion.midpoint, motion.midpoint));
      received += beamDamage(foe.ship, foe.ship.attitude, me, attEot, bearing(foe.motion.endOfTurn, motion.endOfTurn));

      // --- a broadside still bearing next turn, worth what is left of it
      if (eotB.window) {
        const dir = windowDirection(eotB.window);
        let best = 0;
        for (const m of ['port', 'starboard'] as const) if (mountArcColour(STANDARD_ARCS, m, attEot, dir) !== 'black') best = Math.max(best, facingFactor(me, m));
        positional += w.bearingNextTurn * best;
      }
    }

    const dealtFrac = dealt / this.enemyPower;
    const receivedFrac = received / this.myPower;
    const range = this.goal !== null && nearest !== null && nearestNext !== null ? -w.rangeWeight * (Math.abs(nearest - this.goal) + Math.abs(nearestNext - this.goal)) : 0;
    const noise = (this.noiseSource() - 0.5) * 2 * w.noise;
    const total = w.offense * dealtFrac - w.defense * receivedFrac + range + positional + noise;
    return { candidate: c, launches, breakdown: { dealt: dealtFrac, received: receivedFrac, range, positional, wedgedSalvoes, noise, total }, motion, eotAttitude: attEot, eotRangeToNearest: nearest };
  }
}
