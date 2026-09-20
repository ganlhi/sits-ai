/**
 * The ship class library: a JSON list in localStorage, seeded with the built-in classes the
 * first time it is read. A game copies the class into each ship, so editing the library never
 * changes a running game.
 */
import { useCallback, useState } from 'react';
import { BUILT_IN_CLASSES, type ShipClass } from '../domain/game';

const KEY = 'sits.classes.v1';

function readStored(): ShipClass[] | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const arr = JSON.parse(raw) as unknown;
    return Array.isArray(arr) ? (arr as ShipClass[]).filter((c) => c && typeof c.id === 'string' && c.bands) : null;
  } catch {
    return null;
  }
}

function writeAll(classes: readonly ShipClass[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(classes));
  } catch {
    // storage unavailable (private window, quota): the session still works in memory
  }
}

export function listClasses(): ShipClass[] {
  return (readStored() ?? [...BUILT_IN_CLASSES]).slice().sort((a, b) => a.name.localeCompare(b.name));
}

export function saveClass(cls: ShipClass): void {
  const rest = listClasses().filter((c) => c.id !== cls.id);
  writeAll([...rest, cls]);
}

export function deleteClass(id: string): void {
  writeAll(listClasses().filter((c) => c.id !== id));
}

/** Put back any built-in class that was deleted or changed. */
export function restoreBuiltIns(): void {
  const rest = listClasses().filter((c) => !BUILT_IN_CLASSES.some((b) => b.id === c.id));
  writeAll([...rest, ...BUILT_IN_CLASSES]);
}

export function freshClassId(name: string): string {
  const slug =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'class';
  const taken = new Set(listClasses().map((c) => c.id));
  if (!taken.has(slug)) return slug;
  for (let i = 2; ; i++) if (!taken.has(`${slug}-${i}`)) return `${slug}-${i}`;
}

export function useClasses(): { classes: ShipClass[]; refresh: () => void } {
  const [classes, setClasses] = useState(() => listClasses());
  const refresh = useCallback(() => setClasses(listClasses()), []);
  return { classes, refresh };
}
