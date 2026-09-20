/**
 * Game state (PLAN.md Phase 4).
 *
 * A game is a fold over events (see events.ts). The state holds a snapshot of every ship class
 * in use so a saved game stays valid if the library changes later.
 */
import type { Attitude, AvidWindow, Maneuver, Mount, Position, Velocity, VectorDirection } from '../geometry';
import type { Grade, OfficerType, SalvoTiming, ShipClass, ShipDamage } from '../ssd';

export type Side = 'red' | 'green';
export const SIDES: readonly Side[] = ['red', 'green'];

export type Controller = 'player' | 'ai';

export type ShipId = string;

/** The nine steps of the turn sequence (RULES.md §3, Reference Card A3.0). */
export const TURN_STEPS = ['markers', 'plot', 'launch', 'earlyImpact', 'moveMidpoint', 'middleImpact', 'moveEot', 'lateImpact', 'endOfTurn'] as const;
export type TurnStep = (typeof TURN_STEPS)[number];

export const TURN_STEP_TITLES: Readonly<Record<TurnStep, string>> = {
  markers: '1 · Place Midpoint and End-of-Turn markers',
  plot: '2 · AVID plotting, thrust plotting, displace EoT',
  launch: '3 · Launch missiles',
  earlyImpact: '4 · Early missile impact',
  moveMidpoint: '5 · Move to Midpoint; apply ½ pivot and ½ roll',
  middleImpact: '6 · Middle missile impact, first beam impact',
  moveEot: '7 · Move to End of Turn; finish pivot and roll',
  lateImpact: '8 · Late missile impact, second beam impact',
  endOfTurn: '9 · Add thrust to vectors, consolidate, damage control, other actions',
};

export function nextStep(step: TurnStep): TurnStep | null {
  const i = TURN_STEPS.indexOf(step);
  return TURN_STEPS[i + 1] ?? null;
}

export function previousStep(step: TurnStep): TurnStep | null {
  const i = TURN_STEPS.indexOf(step);
  return i > 0 ? (TURN_STEPS[i - 1] ?? null) : null;
}

/** How an AI-controlled ship fights (weights live in domain/ai). */
export type Doctrine = 'balanced' | 'missileDuel' | 'closeToBeams' | 'evade';
export const DOCTRINES: readonly Doctrine[] = ['balanced', 'missileDuel', 'closeToBeams', 'evade'];

export type Grades = Readonly<Record<OfficerType, Grade>>;

export const AVERAGE_GRADES: Grades = { TAC: 'average', EWO: 'average', ATO: 'average', HELM: 'average', ENG: 'average', CREW: 'average' };

/** What the player enters to put a ship on the table. */
export interface ShipSetup {
  readonly id: ShipId;
  readonly name: string;
  readonly classId: string;
  readonly side: Side;
  readonly controller: Controller;
  readonly grades: Grades;
  readonly doctrine?: Doctrine;
  readonly position: Position;
  readonly velocity: Velocity;
  readonly forward: AvidWindow;
  readonly top: AvidWindow;
}

/** A planned missile launch (step 3): one mount at one target, the salvoes it will fire. */
export interface Launch {
  readonly mount: Mount;
  readonly targetId: ShipId;
  readonly timings: readonly SalvoTiming[];
  readonly missiles: number;
}

/** One ship's plotted orders for the turn (step 2), plus the launches it intends for step 3. */
export interface TurnOrders {
  readonly maneuver: Maneuver;
  /** The vector change from thrust, as written in the grey areas of the AVID arrows. */
  readonly thrust: Velocity;
  /** How much thrust was spent (for the record; the delta is what matters). */
  readonly thrustUsed: number;
  readonly launches?: readonly Launch[];
  /** The AI's one-line reason, for the order sheet. */
  readonly rationale?: string;
}

export interface ShipState {
  readonly id: ShipId;
  readonly name: string;
  readonly classId: string;
  readonly side: Side;
  readonly controller: Controller;
  readonly grades: Grades;
  readonly doctrine: Doctrine;
  readonly position: Position;
  readonly velocity: Velocity;
  readonly halfDisplacements: readonly VectorDirection[];
  readonly attitude: Attitude;
  readonly damage: ShipDamage;
  readonly destroyed: boolean;
  /** Orders committed this turn, or null before plotting. */
  readonly orders: TurnOrders | null;
}

export interface LogEntry {
  readonly turn: number;
  readonly step: TurnStep;
  readonly text: string;
}

export interface GameState {
  readonly id: string;
  readonly name: string;
  readonly createdAt: string;
  /** 0 while setting up; the first turn is 1. */
  readonly turn: number;
  readonly step: TurnStep;
  readonly classes: Readonly<Record<string, ShipClass>>;
  readonly ships: Readonly<Record<ShipId, ShipState>>;
  /** Display order. */
  readonly shipOrder: readonly ShipId[];
  readonly log: readonly LogEntry[];
}

export const isSetupPhase = (g: GameState): boolean => g.turn === 0;

export function shipsOf(g: GameState): ShipState[] {
  return g.shipOrder.flatMap((id) => (g.ships[id] ? [g.ships[id]!] : []));
}

export function shipClassOf(g: GameState, ship: ShipState): ShipClass {
  const c = g.classes[ship.classId];
  if (!c) throw new Error(`game has no class ${ship.classId}`);
  return c;
}
