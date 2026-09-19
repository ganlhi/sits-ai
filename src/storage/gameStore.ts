/**
 * In-memory game state fed by the event log, with persistence to IndexedDB and a React hook.
 * dispatch() folds the event immediately (so the UI is never waiting on the database) and
 * appends it; undo() drops the last event and replays.
 */
import { useEffect, useState } from 'react';
import { reduce, replay, type GameEvent, type GameState, type StoredEvent } from '../domain/game';
import { appendEvent, deleteLastEvent, loadEvents } from './db';

type Listener = () => void;

export class GameStore {
  private events: StoredEvent[] = [];
  private state: GameState | null = null;
  private listeners = new Set<Listener>();
  private queue: Promise<unknown> = Promise.resolve();
  error: string | null = null;

  constructor(readonly gameId: string) {}

  getState(): GameState | null {
    return this.state;
  }

  get canUndo(): boolean {
    // never undo the creation event
    return this.events.length > 1;
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private notify(): void {
    for (const l of this.listeners) l();
  }

  async load(): Promise<void> {
    this.events = await loadEvents(this.gameId);
    this.state = this.events.length ? replay(this.events) : null;
    this.notify();
  }

  private summary(g: GameState) {
    return { name: g.name, turn: g.turn, shipCount: g.shipOrder.length, createdAt: g.createdAt };
  }

  /** Fold and persist. Throws (and leaves state untouched) if the reducer rejects the event. */
  dispatch(event: GameEvent): void {
    if (!this.state) throw new Error('game not loaded');
    const next = reduce(this.state, event);
    const seq = (this.events.at(-1)?.seq ?? 0) + 1;
    const stored: StoredEvent = { seq, at: new Date().toISOString(), event };
    this.events = [...this.events, stored];
    this.state = next;
    this.error = null;
    this.notify();
    this.queue = this.queue.then(() => appendEvent(this.gameId, seq, event, this.summary(next))).catch((e) => {
      this.error = `save failed: ${e instanceof Error ? e.message : String(e)}`;
      this.notify();
    });
  }

  undo(): void {
    if (!this.canUndo) return;
    const last = this.events.at(-1)!;
    this.events = this.events.slice(0, -1);
    this.state = replay(this.events);
    this.notify();
    const s = this.state;
    this.queue = this.queue.then(() => deleteLastEvent(this.gameId, last.seq, this.summary(s))).catch((e) => {
      this.error = `undo failed: ${e instanceof Error ? e.message : String(e)}`;
      this.notify();
    });
  }

  /** Wait for pending writes (tests, page unload). */
  flush(): Promise<unknown> {
    return this.queue;
  }
}

const stores = new Map<string, GameStore>();

export function getGameStore(gameId: string): GameStore {
  let s = stores.get(gameId);
  if (!s) {
    s = new GameStore(gameId);
    stores.set(gameId, s);
  }
  return s;
}

export function forgetGameStore(gameId: string): void {
  stores.delete(gameId);
}

export interface UseGame {
  readonly state: GameState | null;
  readonly loading: boolean;
  readonly error: string | null;
  readonly dispatch: (e: GameEvent) => void;
  readonly undo: () => void;
  readonly canUndo: boolean;
}

export function useGame(gameId: string): UseGame {
  const store = getGameStore(gameId);
  const [, setTick] = useState(0);
  const [loading, setLoading] = useState(store.getState() === null);
  const [dispatchError, setDispatchError] = useState<string | null>(null);

  useEffect(() => {
    const unsub = store.subscribe(() => setTick((t) => t + 1));
    if (store.getState() === null) {
      setLoading(true);
      store.load().finally(() => setLoading(false));
    }
    return unsub;
  }, [store]);

  return {
    state: store.getState(),
    loading,
    error: dispatchError ?? store.error,
    dispatch: (e) => {
      try {
        store.dispatch(e);
        setDispatchError(null);
      } catch (err) {
        setDispatchError(err instanceof Error ? err.message : String(err));
      }
    },
    undo: () => store.undo(),
    canUndo: store.canUndo,
  };
}
