/**
 * Game state for the lite opponent: the minimum the AI needs to plot a turn.
 *
 * The player keeps the real bookkeeping on the table (SSDs, salvo cards, dice). At the start
 * of every turn they report, per ship, what the table shows — position, orientation, vectors,
 * a battle damage assessment and a rough combat effectiveness per facing — and the app plots
 * the AI ships from that. Nothing else is tracked.
 */
import { BUILT_IN_SHIPS } from '../../data/ships';
import { formatHexOffset, type Attitude, type Maneuver, type Mount, type Position, type VectorDirection, type Velocity } from '../geometry';
import type { SalvoTiming, ShipClass } from '../ssd';

export type Side = 'red' | 'green';
export const SIDES: readonly Side[] = ['red', 'green'];

export type Controller = 'player' | 'ai';
export const CONTROLLERS: readonly Controller[] = ['player', 'ai'];

export type ShipId = string;

/** How an AI-controlled ship fights (weights live in domain/ai/doctrine.ts). */
export type Doctrine = 'balanced' | 'missileDuel' | 'closeToBeams' | 'evade';
export const DOCTRINES: readonly Doctrine[] = ['balanced', 'missileDuel', 'closeToBeams', 'evade'];
export const DOCTRINE_LABELS: Readonly<Record<Doctrine, string>> = {
  balanced: 'Balanced — trade fire, keep a broadside on the enemy',
  missileDuel: 'Missile duel — hold the range where the salvo count favours us',
  closeToBeams: 'Close to beam range — accept the missile envelope',
  evade: 'Evade — open the range, interpose the wedge, survive',
};

/** Battle Damage Assessment: the player's one-word summary of a ship's SSD. */
export type Bda = 'undamaged' | 'light' | 'medium' | 'heavy' | 'crippled';
export const BDA_LEVELS: readonly Bda[] = ['undamaged', 'light', 'medium', 'heavy', 'crippled'];
export const BDA_LABELS: Readonly<Record<Bda, string>> = {
  undamaged: 'Undamaged',
  light: 'Light damage',
  medium: 'Medium damage',
  heavy: 'Heavy damage',
  crippled: 'Crippled / destroyed',
};
/**
 * Fraction of the pivot, roll, thrust and ECM tracks assumed crossed out at each level. The
 * ratings the AI plots with are read from the ship's own tracks at that depth, so a Sultan with
 * medium damage plots with the pivot its card gives after two boxes are gone.
 */
export const BDA_TRACK_LOSS: Readonly<Record<Bda, number>> = { undamaged: 0, light: 0.2, medium: 0.45, heavy: 0.7, crippled: 1 };
export const bdaIndex = (b: Bda): number => BDA_LEVELS.indexOf(b);

/** Combat effectiveness of each facing, in percent: launchers, beams, CM/PD and sidewall together. */
export type Effectiveness = Readonly<Record<Mount, number>>;
export const FULL_EFFECTIVENESS: Effectiveness = { forward: 100, aft: 100, port: 100, starboard: 100 };
export const MOUNT_SHORT: Readonly<Record<Mount, string>> = { forward: 'Fwd', aft: 'Aft', port: 'Port', starboard: 'Stbd' };

/** A planned missile launch (step 3): one mount at one target, the salvoes it will fire. */
export interface Launch {
  readonly mount: Mount;
  readonly targetId: ShipId;
  readonly timings: readonly SalvoTiming[];
  readonly missiles: number;
}

/** One AI ship's plot for the turn (step 2) and its launches (step 3). */
export interface Orders {
  readonly maneuver: Maneuver;
  /** The vector change from thrust, as written in the grey areas of the AVID arrows. */
  readonly thrust: Velocity;
  readonly thrustUsed: number;
  readonly launches: readonly Launch[];
  /** The AI's one-line reason, for the order sheet. */
  readonly rationale: string;
}

export interface Ship {
  readonly id: ShipId;
  readonly name: string;
  readonly classId: string;
  readonly side: Side;
  readonly controller: Controller;
  readonly doctrine: Doctrine;
  readonly position: Position;
  readonly velocity: Velocity;
  readonly attitude: Attitude;
  /** Half hexes of displacement carried over (AI ships only; the app computes their motion). */
  readonly halfDisplacements: readonly VectorDirection[];
  readonly bda: Bda;
  readonly effectiveness: Effectiveness;
  /** The AI's plot for this turn, once revealed. Always null for player ships. */
  readonly orders: Orders | null;
}

/** What "Undo turn" restores. */
export interface Snapshot {
  readonly turn: number;
  readonly revealed: boolean;
  readonly ships: readonly Ship[];
}

export interface Game {
  readonly id: string;
  readonly name: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  /** The first turn is 1; ships may be added at any time. */
  readonly turn: number;
  /** Whether the AI's orders for this turn have been plotted and shown. */
  readonly revealed: boolean;
  readonly ships: readonly Ship[];
  readonly history: readonly Snapshot[];
}

export const isOutOfAction = (s: Ship): boolean => s.bda === 'crippled';
export const liveShips = (g: Game): Ship[] => g.ships.filter((s) => !isOutOfAction(s));
export const enemiesOf = (g: Game, s: Ship): Ship[] => liveShips(g).filter((e) => e.side !== s.side);
export const aiShips = (g: Game): Ship[] => g.ships.filter((s) => s.controller === 'ai');
export const shipById = (g: Game, id: ShipId): Ship | undefined => g.ships.find((s) => s.id === id);

export function classById(id: string): ShipClass {
  const c = BUILT_IN_SHIPS.find((s) => s.id === id);
  if (!c) throw new Error(`unknown ship class ${id}`);
  return c;
}
export const shipClassOf = (s: Ship): ShipClass => classById(s.classId);

/** A position in table language: offset from the centre hex, then altitude ("9A + 3B · alt 2"). */
export const formatPosition = (p: Position): string => `${formatHexOffset(p.hex)} · alt ${p.alt}`;
