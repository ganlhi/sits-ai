/**
 * The Missile Defense Card (RULES.md §12.2–12.3), transcribed from the page images.
 *
 * ECM Layer: rows are incoming missiles, columns Final ECM Quality 1–25. A missile count with
 * no row is looked up digit by digit and the kills added (C4.126: 63 → row 60 + row 3).
 * Active Defense: rows are probable kills (⅓, ⅔, 1–10, 20, 30), columns Active Defense Quality
 * 1–19. Fractional and off-row values are split the same way.
 */

const row = (s: string): readonly number[] => s.trim().split(/\s+/).map(Number);

export const ECM_LAYER: ReadonlyMap<number, readonly number[]> = new Map<number, readonly number[]>([
  [1, row('0 0 0 0 0 0 0 0 0 0 0 0 0 0 1 1 1 1 1 1 1 1 1 1 1')],
  [2, row('0 0 0 0 0 0 0 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 2 2 2')],
  [3, row('0 0 0 0 0 1 1 1 1 1 1 1 1 1 2 2 2 2 2 2 2 2 2 2 3')],
  [4, row('0 0 0 0 1 1 1 1 1 1 1 2 2 2 2 2 2 2 3 3 3 3 3 3 3')],
  [5, row('0 0 0 1 1 1 1 1 1 2 2 2 2 2 3 3 3 3 3 3 4 4 4 4 4')],
  [6, row('0 0 0 1 1 1 1 2 2 2 2 2 3 3 3 3 3 4 4 4 4 4 5 5 5')],
  [7, row('0 0 1 1 1 1 2 2 2 2 3 3 3 3 4 4 4 4 4 5 5 5 5 6 6')],
  [8, row('0 0 1 1 1 1 2 2 2 3 3 3 3 4 4 4 5 5 5 5 6 6 6 7 7')],
  [9, row('0 0 1 1 1 2 2 2 3 3 3 4 4 4 5 5 5 5 6 6 6 7 7 7 8')],
  [10, row('0 0 1 1 2 2 2 3 3 3 4 4 4 5 5 5 6 6 6 7 7 7 8 8 9')],
  [20, row('0 1 2 2 3 4 4 5 6 7 7 8 9 9 10 11 11 12 13 14 14 15 16 16 17')],
  [30, row('0 1 2 3 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 26')],
  [40, row('0 2 3 5 6 7 9 10 12 13 14 16 17 19 20 21 23 24 26 27 28 30 31 33 34')],
  [50, row('1 2 4 6 8 9 11 13 15 16 18 20 22 23 25 27 29 30 32 34 36 37 39 41 43')],
  [60, row('1 3 5 7 9 11 13 15 17 20 22 24 26 28 30 32 34 36 38 41 43 45 47 49 51')],
  [70, row('1 3 6 8 11 13 15 18 20 23 25 28 30 33 35 37 40 42 45 47 50 52 55 57 60')],
  [80, row('1 4 6 9 12 15 18 20 23 26 29 32 34 37 40 43 46 48 51 54 57 60 62 65 68')],
  [90, row('1 4 7 10 14 17 20 23 26 29 32 36 39 42 45 48 51 54 58 61 64 67 70 73 77')],
  [100, row('1 5 8 12 15 19 22 26 29 33 36 40 43 47 50 54 57 61 64 68 71 75 78 82 85')],
]);

export const ECM_COLUMNS = 25;

/** Active Defense rows keyed in thirds of a probable kill: 1 = ⅓, 2 = ⅔, 3 = 1 … 30 = 10, 60 = 20, 90 = 30. */
export const ACTIVE_DEFENSE: ReadonlyMap<number, readonly number[]> = new Map<number, readonly number[]>([
  [1, row('0 0 0 0 0 0 0 0 0 0 0 0 0 0 1 1 1 1 1')],
  [2, row('0 0 0 0 0 0 0 0 0 1 1 1 1 1 1 1 1 1 1')],
  [3, row('0 0 0 0 0 0 1 1 1 1 1 1 1 1 1 1 2 2 2')],
  [6, row('1 1 1 1 1 1 1 1 1 2 2 2 2 2 3 3 3 4 4')],
  [9, row('1 1 1 1 1 1 2 2 2 2 3 3 3 4 4 4 5 5 6')],
  [12, row('1 1 1 2 2 2 2 2 3 3 3 4 4 5 5 6 6 7 8')],
  [15, row('1 1 2 2 2 2 3 3 3 4 4 5 5 6 7 7 8 9 10')],
  [18, row('2 2 2 2 3 3 3 4 4 5 5 6 6 7 8 9 10 11 12')],
  [21, row('2 2 2 3 3 3 4 4 5 5 6 7 7 8 9 10 11 13 14')],
  [24, row('2 2 3 3 3 4 4 5 5 6 7 8 8 9 10 12 13 14 16')],
  [27, row('2 3 3 3 4 4 5 6 6 7 8 8 9 11 12 13 15 16 18')],
  [30, row('3 3 3 4 4 5 5 6 7 8 8 9 11 12 13 14 16 18 20')],
  [60, row('5 6 7 8 9 10 11 12 14 15 17 19 21 23 26 29 32 36 40')],
  [90, row('8 9 10 11 13 15 16 18 21 23 25 28 32 35 39 43 48 54 60')],
]);

export const ACTIVE_DEFENSE_COLUMNS = 19;

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, Math.round(v)));

/** Missiles killed by the ECM layer for `missiles` inbound at Final ECM Quality `column`. */
export function ecmKills(missiles: number, column: number): number {
  if (missiles <= 0) return 0;
  const col = clamp(column, 1, ECM_COLUMNS) - 1;
  const at = (n: number): number => ECM_LAYER.get(n)?.[col] ?? 0;
  let n = Math.floor(missiles);
  let kills = 0;
  while (n >= 100) {
    kills += at(100);
    n -= 100;
  }
  if (n >= 10) {
    kills += at(Math.floor(n / 10) * 10);
    n %= 10;
  }
  if (n > 0) kills += at(n);
  return Math.min(kills, Math.floor(missiles));
}

/** Missiles killed by one active-defense layer with `probableKills` (may be fractional) at quality `column`. */
export function activeDefenseKills(probableKills: number, column: number): number {
  if (probableKills <= 0) return 0;
  const col = clamp(column, 1, ACTIVE_DEFENSE_COLUMNS) - 1;
  const at = (thirds: number): number => ACTIVE_DEFENSE.get(thirds)?.[col] ?? 0;
  let thirds = Math.round(probableKills * 3);
  let kills = 0;
  while (thirds >= 90) {
    kills += at(90);
    thirds -= 90;
  }
  if (thirds >= 60) {
    kills += at(60);
    thirds -= 60;
  }
  if (thirds >= 30) {
    kills += at(30);
    thirds -= 30;
  }
  const whole = Math.floor(thirds / 3);
  if (whole > 0) kills += at(whole * 3);
  const frac = thirds % 3;
  if (frac > 0) kills += at(frac);
  return kills;
}

/** Canister rounds one missile of a given size becomes (C4.15); each adds ⅓ probable kill to CM. */
export function canistersPerMissile(missileSize: number): number {
  if (missileSize <= 4) return 1;
  if (missileSize <= 8) return 2;
  if (missileSize <= 12) return 3;
  if (missileSize <= 16) return 4;
  return 5;
}
