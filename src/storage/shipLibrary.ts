/**
 * The ship library: classes the user has entered, kept in localStorage until Phase 4 brings
 * IndexedDB for game state. The built-in Sample class is always present and read-only.
 */
import { BUILT_IN_SHIPS } from '../data/ships';
import { validateShipClass, type ShipClass } from '../domain/ssd';

const KEY = 'sits.ships.v1';

export { BUILT_IN_SHIPS };

export function isBuiltIn(id: string): boolean {
  return BUILT_IN_SHIPS.some((s) => s.id === id);
}

function readAll(): ShipClass[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return [];
    return arr.flatMap((x) => {
      const r = validateShipClass(x);
      return r.ok ? [r.value] : [];
    });
  } catch {
    return [];
  }
}

function writeAll(ships: readonly ShipClass[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(ships));
  } catch {
    // storage unavailable (private window, quota): the session still works in memory
  }
}

/** Built-in classes first, then the user's, by name. */
export function listShips(): ShipClass[] {
  const user = readAll().sort((a, b) => a.className.localeCompare(b.className));
  return [...BUILT_IN_SHIPS, ...user];
}

export function getShip(id: string): ShipClass | undefined {
  return listShips().find((s) => s.id === id);
}

export function saveShip(ship: ShipClass): void {
  if (isBuiltIn(ship.id)) throw new Error('built-in classes are read-only; duplicate it first');
  const rest = readAll().filter((s) => s.id !== ship.id);
  writeAll([...rest, ship]);
}

export function deleteShip(id: string): void {
  if (isBuiltIn(id)) throw new Error('built-in classes cannot be deleted');
  writeAll(readAll().filter((s) => s.id !== id));
}

/** A fresh id that is not in use, derived from the class name. */
export function freshShipId(base: string): string {
  const slug = base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'ship';
  const taken = new Set(listShips().map((s) => s.id));
  if (!taken.has(slug)) return slug;
  for (let i = 2; ; i++) if (!taken.has(`${slug}-${i}`)) return `${slug}-${i}`;
}
