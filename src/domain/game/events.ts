/**
 * Events and the reducer. Everything that changes a game is an event; state is a fold over
 * them. Deleting the last event is undo; replaying the log reconstructs any game; and the log
 * is the record the AI's decisions will later be explained against.
 */
import {
  ZERO_VELOCITY,
  applyManeuver,
  attitudeFromWindows,
  maneuverPivots,
  planMotion,
  cubeAdd,
  cubeIsZero,
  formatHexOffset,
  type AvidWindow,
  type Cube,
  type Position,
  type Velocity,
  type VectorDirection,
} from '../geometry';
import { expireRepairs } from '../combat/damageControl';
import { freshDamage, type BoxStatus, type Grade, type Mount, type OfficerType, type ShipClass, type ShipDamage, type TrackId } from '../ssd';
import { TURN_STEPS, nextStep, previousStep, type Controller, type Doctrine, type GameState, type ShipId, type ShipSetup, type ShipState, type TurnOrders, type TurnStep } from './types';

export type GameEvent =
  | { readonly type: 'GameCreated'; readonly id: string; readonly name: string; readonly createdAt: string }
  | { readonly type: 'GameRenamed'; readonly name: string }
  | { readonly type: 'ClassAdded'; readonly shipClass: ShipClass }
  | { readonly type: 'ShipAdded'; readonly setup: ShipSetup }
  | { readonly type: 'ShipRemoved'; readonly shipId: ShipId }
  | { readonly type: 'GameStarted' }
  | { readonly type: 'StepChanged'; readonly step: TurnStep }
  | { readonly type: 'OrdersIssued'; readonly shipId: ShipId; readonly orders: TurnOrders }
  | { readonly type: 'OrdersCleared'; readonly shipId: ShipId }
  | { readonly type: 'TurnEnded' }
  | {
      /** The player corrects a ship to what is actually on the table. */
      readonly type: 'ShipReported';
      readonly shipId: ShipId;
      readonly position?: Position;
      readonly velocity?: Velocity;
      readonly halfDisplacements?: readonly VectorDirection[];
      readonly forward?: AvidWindow;
      readonly top?: AvidWindow;
    }
  | {
      /**
       * Every miniature slides by the same offset (and altitude change), e.g. because the
       * fleet drifted too close to the table edge. Relative geometry is untouched.
       */
      readonly type: 'TableShifted';
      readonly offset: Cube;
      readonly alt: number;
    }
  | { readonly type: 'BoxReported'; readonly shipId: ShipId; readonly trackId: TrackId; readonly index: number; readonly status: BoxStatus }
  | {
      /** A whole damage state produced by the combat engine (a resolved salvo, beams or damage control). */
      readonly type: 'ShipDamageSet';
      readonly shipId: ShipId;
      readonly damage: ShipDamage;
      readonly note: string;
    }
  | { readonly type: 'GradeChanged'; readonly shipId: ShipId; readonly officer: OfficerType; readonly grade: Grade }
  | { readonly type: 'DoctrineChanged'; readonly shipId: ShipId; readonly doctrine: Doctrine }
  | { readonly type: 'ControllerChanged'; readonly shipId: ShipId; readonly controller: Controller }
  | { readonly type: 'MagazineReported'; readonly shipId: ShipId; readonly mount: Mount; readonly remaining: number }
  | { readonly type: 'ShipDestroyed'; readonly shipId: ShipId; readonly destroyed: boolean }
  | { readonly type: 'NoteAdded'; readonly text: string };

export interface StoredEvent {
  readonly seq: number;
  readonly at: string;
  readonly event: GameEvent;
}

const EMPTY: GameState = { id: '', name: '', createdAt: '', turn: 0, step: 'markers', classes: {}, ships: {}, shipOrder: [], log: [] };

function shipFromSetup(g: GameState, s: ShipSetup): ShipState {
  const cls = g.classes[s.classId];
  if (!cls) throw new Error(`class ${s.classId} not in game`);
  return {
    id: s.id,
    name: s.name,
    classId: s.classId,
    side: s.side,
    controller: s.controller,
    grades: s.grades,
    doctrine: s.doctrine ?? 'balanced',
    position: s.position,
    velocity: s.velocity,
    halfDisplacements: [],
    attitude: attitudeFromWindows(s.forward, s.top),
    damage: freshDamage(cls),
    destroyed: false,
    orders: null,
  };
}

function withShip(g: GameState, id: ShipId, f: (s: ShipState) => ShipState): GameState {
  const s = g.ships[id];
  if (!s) throw new Error(`no ship ${id}`);
  return { ...g, ships: { ...g.ships, [id]: f(s) } };
}

function log(g: GameState, text: string): GameState {
  return { ...g, log: [...g.log, { turn: g.turn, step: g.step, text }] };
}

/** Move every ship to its End of Turn marker and roll the turn over (step 9 → step 1). */
function endTurn(g: GameState): GameState {
  let out = g;
  for (const id of g.shipOrder) {
    const s = g.ships[id];
    if (!s || s.destroyed) continue;
    const orders = s.orders;
    const motion = planMotion(
      { position: s.position, velocity: s.velocity, halfDisplacements: s.halfDisplacements },
      orders?.thrust ?? ZERO_VELOCITY,
      orders ? maneuverPivots(orders.maneuver) : false,
      s.grades.ENG,
    );
    const attitude = orders ? applyManeuver(s.attitude, orders.maneuver, 1) : s.attitude;
    // jury-rigged repairs made ten turns ago fail as the new turn begins (C6.13)
    const expired = expireRepairs(s.damage, g.turn + 1);
    out = withShip(out, id, (ship) => ({
      ...ship,
      position: motion.endOfTurn,
      velocity: motion.newVelocity,
      halfDisplacements: motion.carriedHalves,
      attitude,
      damage: expired.damage,
      orders: null,
    }));
    if (expired.failed.length) out = log(out, `${s.name}: ${expired.failed.length} jury-rigged repair${expired.failed.length === 1 ? '' : 's'} failed`);
  }
  out = log(out, `Turn ${g.turn} ended`);
  return { ...out, turn: g.turn + 1, step: 'markers' };
}

export function reduce(g: GameState, e: GameEvent): GameState {
  switch (e.type) {
    case 'GameCreated':
      return { ...EMPTY, id: e.id, name: e.name, createdAt: e.createdAt };
    case 'GameRenamed':
      return { ...g, name: e.name };
    case 'ClassAdded':
      return { ...g, classes: { ...g.classes, [e.shipClass.id]: e.shipClass } };
    case 'ShipAdded': {
      if (g.ships[e.setup.id]) throw new Error(`ship ${e.setup.id} already exists`);
      const ship = shipFromSetup(g, e.setup);
      return log({ ...g, ships: { ...g.ships, [ship.id]: ship }, shipOrder: [...g.shipOrder, ship.id] }, `${ship.name} added`);
    }
    case 'ShipRemoved': {
      const { [e.shipId]: _, ...ships } = g.ships;
      return { ...g, ships, shipOrder: g.shipOrder.filter((id) => id !== e.shipId) };
    }
    case 'GameStarted':
      if (g.turn !== 0) return g;
      if (g.shipOrder.length === 0) throw new Error('add at least one ship');
      return log({ ...g, turn: 1, step: 'markers' }, 'Game started');
    case 'StepChanged':
      if (!TURN_STEPS.includes(e.step)) throw new Error(`bad step ${e.step}`);
      return { ...g, step: e.step };
    case 'OrdersIssued':
      return withShip(g, e.shipId, (s) => ({ ...s, orders: e.orders }));
    case 'OrdersCleared':
      return withShip(g, e.shipId, (s) => ({ ...s, orders: null }));
    case 'TurnEnded':
      if (g.turn === 0) throw new Error('game not started');
      return endTurn(g);
    case 'ShipReported':
      return withShip(g, e.shipId, (s) => ({
        ...s,
        position: e.position ?? s.position,
        velocity: e.velocity ?? s.velocity,
        halfDisplacements: e.halfDisplacements ?? s.halfDisplacements,
        attitude: e.forward && e.top ? attitudeFromWindows(e.forward, e.top) : s.attitude,
      }));
    case 'TableShifted': {
      if (cubeIsZero(e.offset) && e.alt === 0) return g;
      const ships = Object.fromEntries(
        Object.entries(g.ships).map(([id, s]) => [id, { ...s, position: { hex: cubeAdd(s.position.hex, e.offset), alt: s.position.alt + e.alt } }]),
      );
      const parts: string[] = [];
      if (!cubeIsZero(e.offset)) parts.push(formatHexOffset(e.offset));
      if (e.alt !== 0) parts.push(`${e.alt > 0 ? '+' : ''}${e.alt} altitude`);
      return log({ ...g, ships }, `Table shifted by ${parts.join(', ')}`);
    }
    case 'BoxReported':
      return withShip(g, e.shipId, (s) => {
        const track = s.damage.tracks[e.trackId];
        if (!track) throw new Error(`no track ${e.trackId}`);
        const boxes = track.boxes.map((b, i) => (i === e.index ? { ...b, status: e.status } : b));
        return { ...s, damage: { ...s.damage, tracks: { ...s.damage.tracks, [e.trackId]: { boxes } } } };
      });
    case 'ShipDamageSet':
      return log(
        withShip(g, e.shipId, (s) => ({ ...s, damage: e.damage })),
        `${g.ships[e.shipId]?.name ?? e.shipId}: ${e.note}`,
      );
    case 'GradeChanged':
      return log(
        withShip(g, e.shipId, (s) => ({ ...s, grades: { ...s.grades, [e.officer]: e.grade } })),
        `${g.ships[e.shipId]?.name ?? e.shipId}: ${e.officer} now ${e.grade}`,
      );
    case 'DoctrineChanged':
      return withShip(g, e.shipId, (s) => ({ ...s, doctrine: e.doctrine }));
    case 'ControllerChanged':
      return withShip(g, e.shipId, (s) => ({ ...s, controller: e.controller }));
    case 'MagazineReported':
      return withShip(g, e.shipId, (s) => ({ ...s, damage: { ...s.damage, magazines: { ...s.damage.magazines, [e.mount]: e.remaining } } }));
    case 'ShipDestroyed':
      return log(
        withShip(g, e.shipId, (s) => ({ ...s, destroyed: e.destroyed })),
        `${g.ships[e.shipId]?.name ?? e.shipId} ${e.destroyed ? 'destroyed' : 'restored'}`,
      );
    case 'NoteAdded':
      return log(g, e.text);
  }
}

export function replay(events: readonly StoredEvent[]): GameState {
  return events.reduce((g, s) => reduce(g, s.event), EMPTY);
}

/** Convenience: the event that moves to the following step, or ends the turn from step 9. */
export function advanceEvent(g: GameState): GameEvent {
  const n = nextStep(g.step);
  return n ? { type: 'StepChanged', step: n } : { type: 'TurnEnded' };
}

export function retreatEvent(g: GameState): GameEvent | null {
  const p = previousStep(g.step);
  return p ? { type: 'StepChanged', step: p } : null;
}
