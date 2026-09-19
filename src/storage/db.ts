/**
 * IndexedDB persistence via Dexie: one row per game plus its append-only event log.
 * The game state itself is never stored; it is replayed from the events on load.
 */
import Dexie, { type Table } from 'dexie';
import type { GameEvent, StoredEvent } from '../domain/game';

export interface GameRow {
  readonly id: string;
  readonly name: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly turn: number;
  readonly shipCount: number;
}

export interface EventRow {
  id?: number;
  readonly gameId: string;
  readonly seq: number;
  readonly at: string;
  readonly event: GameEvent;
}

class SitsDb extends Dexie {
  games!: Table<GameRow, string>;
  events!: Table<EventRow, number>;

  constructor() {
    super('sits-ai');
    this.version(1).stores({
      games: 'id, updatedAt',
      events: '++id, gameId, [gameId+seq]',
    });
  }
}

export const db = new SitsDb();

export async function listGames(): Promise<GameRow[]> {
  return db.games.orderBy('updatedAt').reverse().toArray();
}

export async function loadEvents(gameId: string): Promise<StoredEvent[]> {
  const rows = await db.events.where('[gameId+seq]').between([gameId, Dexie.minKey], [gameId, Dexie.maxKey]).toArray();
  return rows.map((r) => ({ seq: r.seq, at: r.at, event: r.event }));
}

export async function appendEvent(gameId: string, seq: number, event: GameEvent, summary: { name: string; turn: number; shipCount: number; createdAt: string }): Promise<StoredEvent> {
  const at = new Date().toISOString();
  await db.transaction('rw', db.events, db.games, async () => {
    await db.events.add({ gameId, seq, at, event });
    await db.games.put({ id: gameId, name: summary.name, createdAt: summary.createdAt, updatedAt: at, turn: summary.turn, shipCount: summary.shipCount });
  });
  return { seq, at, event };
}

export async function deleteLastEvent(gameId: string, seq: number, summary: { name: string; turn: number; shipCount: number; createdAt: string }): Promise<void> {
  await db.transaction('rw', db.events, db.games, async () => {
    await db.events.where('[gameId+seq]').equals([gameId, seq]).delete();
    await db.games.put({ id: gameId, name: summary.name, createdAt: summary.createdAt, updatedAt: new Date().toISOString(), turn: summary.turn, shipCount: summary.shipCount });
  });
}

export async function deleteGame(gameId: string): Promise<void> {
  await db.transaction('rw', db.events, db.games, async () => {
    await db.events.where('gameId').equals(gameId).delete();
    await db.games.delete(gameId);
  });
}

/** The whole log as JSON, for backup and for sharing a game. */
export async function exportGame(gameId: string): Promise<string> {
  const events = await loadEvents(gameId);
  return JSON.stringify({ format: 'sits-ai-game', version: 1, gameId, events }, null, 2);
}

export async function importGame(json: string): Promise<string> {
  const parsed = JSON.parse(json) as { format?: string; events?: StoredEvent[] };
  if (parsed.format !== 'sits-ai-game' || !Array.isArray(parsed.events)) throw new Error('not a SITS AI game export');
  const events = parsed.events;
  const first = events[0]?.event;
  if (!first || first.type !== 'GameCreated') throw new Error('export does not start with GameCreated');
  const newId = crypto.randomUUID();
  const at = new Date().toISOString();
  await db.transaction('rw', db.events, db.games, async () => {
    for (const e of events) {
      const ev = e.event.type === 'GameCreated' ? { ...e.event, id: newId } : e.event;
      await db.events.add({ gameId: newId, seq: e.seq, at: e.at, event: ev });
    }
    await db.games.put({ id: newId, name: `${first.name} (imported)`, createdAt: first.createdAt, updatedAt: at, turn: 0, shipCount: 0 });
  });
  return newId;
}
