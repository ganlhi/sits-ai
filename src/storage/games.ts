/**
 * Creating games: the first event is written straight to the database, after which the
 * GameStore takes over.
 */
import { appendEvent } from './db';
import { forgetGameStore } from './gameStore';

export async function createGame(name: string): Promise<string> {
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  await appendEvent(id, 1, { type: 'GameCreated', id, name, createdAt }, { name, turn: 0, shipCount: 0, createdAt });
  forgetGameStore(id);
  return id;
}
