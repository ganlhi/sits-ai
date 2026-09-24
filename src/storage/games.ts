/**
 * Persistence: every game is a JSON snapshot in localStorage, saved on every change. No
 * backend, no account, no network. Export and import move a game between devices.
 */
import { useEffect, useState } from 'react';
import { uniformBda, type Bda, type Game, type Ship } from '../domain/game';

const KEY = 'sits.games.v2';

export interface GameSummary {
  readonly id: string;
  readonly name: string;
  readonly turn: number;
  readonly shipCount: number;
  readonly updatedAt: string;
}

/**
 * Games saved before BDA was reported per side carry one BDA for the whole ship, with
 * "crippled" doubling as destroyed: spread it to every side and lift out the out-of-action flag.
 */
function upgradeShip(s: Ship): Ship {
  const old = s as Omit<Ship, 'bda' | 'outOfAction'> & { bda: Bda | Ship['bda']; outOfAction?: boolean };
  if (typeof old.bda !== 'string') return { ...s, outOfAction: old.outOfAction ?? false };
  return { ...old, bda: uniformBda(old.bda), outOfAction: old.outOfAction ?? old.bda === 'crippled' };
}

function upgradeGame(g: Game): Game {
  return { ...g, ships: g.ships.map(upgradeShip), history: (g.history ?? []).map((h) => ({ ...h, ships: h.ships.map(upgradeShip) })) };
}

function readAll(): Game[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as unknown;
    return Array.isArray(arr) ? (arr as Game[]).filter((g) => g && typeof g.id === 'string' && Array.isArray(g.ships)).map(upgradeGame) : [];
  } catch {
    return [];
  }
}

function writeAll(games: readonly Game[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(games));
  } catch {
    // storage unavailable (private window, quota): the session still works in memory
  }
}

export function listGames(): GameSummary[] {
  return readAll()
    .map((g) => ({ id: g.id, name: g.name, turn: g.turn, shipCount: g.ships.length, updatedAt: g.updatedAt }))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function loadGame(id: string): Game | null {
  return readAll().find((g) => g.id === id) ?? null;
}

export function saveGame(game: Game): void {
  const rest = readAll().filter((g) => g.id !== game.id);
  writeAll([...rest, game]);
}

export function deleteGame(id: string): void {
  writeAll(readAll().filter((g) => g.id !== id));
}

export function createGame(name: string): Game {
  const now = new Date().toISOString();
  const game: Game = { id: crypto.randomUUID(), name, createdAt: now, updatedAt: now, turn: 1, revealed: false, ships: [], history: [] };
  saveGame(game);
  return game;
}

export function exportGame(game: Game): string {
  return JSON.stringify({ format: 'sits-ai-game', version: 2, game }, null, 2);
}

export function importGame(json: string): Game {
  const parsed = JSON.parse(json) as { format?: string; version?: number; game?: Game };
  if (parsed.format !== 'sits-ai-game' || parsed.version !== 2 || !parsed.game || !Array.isArray(parsed.game.ships)) throw new Error('not a SITS AI game export');
  const now = new Date().toISOString();
  const game: Game = { ...upgradeGame(parsed.game), id: crypto.randomUUID(), name: `${parsed.game.name} (imported)`, updatedAt: now };
  saveGame(game);
  return game;
}

export interface UseGame {
  readonly game: Game | null;
  /** Apply a change; the result is saved. */
  readonly update: (fn: (g: Game) => Game) => void;
}

export function useGame(id: string): UseGame {
  const [game, setGame] = useState<Game | null>(() => loadGame(id));
  useEffect(() => {
    setGame(loadGame(id));
  }, [id]);
  useEffect(() => {
    if (game) saveGame(game);
  }, [game]);
  return {
    game,
    update: (fn) => setGame((g) => (g ? { ...fn(g), updatedAt: new Date().toISOString() } : g)),
  };
}
