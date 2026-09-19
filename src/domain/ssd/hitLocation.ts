/**
 * The Hit Location Table (RULES.md §13.3–13.4, §22).
 *
 * A top-down silhouette of the ship: a grid of system codes with a shaded Core. Damage from
 * starboard enters at the top edge in the column given by a 2d10+ roll and reads downwards;
 * from port, bottom edge upwards; from forward, left edge in the row given by the roll, reading
 * right; from aft, right edge reading left. Blank cells are outside the silhouette.
 */

export const HLT_SYSTEM_CODES = [
  'fcon', 'hull', 'mag', 'dcy', 'ECM', 'sdwl', 'PD', 'CM', 'L', 'M', 'G', 'ET', 'SI',
  'piv', 'rol', 'brg', 'com', 'lif', 'CIC', 'flg', 'hyp', 'fwd', 'aft', '2fwd', '2aft',
] as const;
export type SystemCode = (typeof HLT_SYSTEM_CODES)[number];

export const isSystemCode = (s: string): s is SystemCode => (HLT_SYSTEM_CODES as readonly string[]).includes(s);

export interface HltRow {
  /** Printed label, e.g. "9-10". */
  readonly label: string;
  /** Hit-location rolls that select this row. */
  readonly rolls: readonly number[];
}

export interface HitLocationTable {
  readonly scale: number;
  readonly coreArmor: number;
  /** Column headings, the hit-location rolls 2…20. */
  readonly columns: readonly number[];
  readonly rows: readonly HltRow[];
  /** cells[rowIndex][columnIndex]; null outside the silhouette. */
  readonly cells: readonly (readonly (SystemCode | null)[])[];
  /** core[rowIndex][columnIndex]: the shaded Core region. */
  readonly core: readonly (readonly boolean[])[];
}

/** The standard row layout printed on every SSD in the core book. */
export const STANDARD_HLT_ROWS: readonly HltRow[] = [
  { label: '2-3', rolls: [2, 3] },
  { label: '4-5', rolls: [4, 5] },
  { label: '6-7', rolls: [6, 7] },
  { label: '8', rolls: [8] },
  { label: '9-10', rolls: [9, 10] },
  { label: '11', rolls: [11] },
  { label: '12-13', rolls: [12, 13] },
  { label: '14', rolls: [14] },
  { label: '15-16', rolls: [15, 16] },
  { label: '17-18', rolls: [17, 18] },
  { label: '19-20', rolls: [19, 20] },
];

export const STANDARD_HLT_COLUMNS: readonly number[] = Array.from({ length: 19 }, (_, i) => i + 2);

export type HltEdge = 'starboard' | 'port' | 'forward' | 'aft';

export function rowIndexForRoll(hlt: HitLocationTable, roll: number): number | null {
  const i = hlt.rows.findIndex((r) => r.rolls.includes(roll));
  return i < 0 ? null : i;
}

export function columnIndexForRoll(hlt: HitLocationTable, roll: number): number | null {
  const i = hlt.columns.indexOf(roll);
  return i < 0 ? null : i;
}

export interface HltCell {
  readonly row: number;
  readonly col: number;
  readonly code: SystemCode | null;
  readonly core: boolean;
}

export function cellAt(hlt: HitLocationTable, row: number, col: number): HltCell | null {
  const r = hlt.cells[row];
  if (!r || col < 0 || col >= r.length) return null;
  return { row, col, code: r[col] ?? null, core: hlt.core[row]?.[col] ?? false };
}

/**
 * The line of cells damage travels along from an edge, in traversal order, for a hit-location
 * roll (a column for starboard/port, a row for forward/aft). Null when the roll is off the table.
 * `lineOffset` shifts to an adjacent line for weapons with a span greater than 1.
 */
export function cellsFromEdge(hlt: HitLocationTable, edge: HltEdge, roll: number, lineOffset = 0): HltCell[] | null {
  if (edge === 'starboard' || edge === 'port') {
    const c0 = columnIndexForRoll(hlt, roll);
    if (c0 === null) return null;
    const col = c0 + lineOffset;
    if (col < 0 || col >= hlt.columns.length) return [];
    const cells = hlt.rows.map((_, row) => cellAt(hlt, row, col)!);
    return edge === 'starboard' ? cells : cells.reverse();
  }
  const r0 = rowIndexForRoll(hlt, roll);
  if (r0 === null) return null;
  const row = r0 + lineOffset;
  if (row < 0 || row >= hlt.rows.length) return [];
  const cells = hlt.columns.map((_, col) => cellAt(hlt, row, col)!);
  return edge === 'forward' ? cells : cells.reverse();
}

/** Every non-blank cell, for counting systems and checking symmetry. */
export function allCells(hlt: HitLocationTable): HltCell[] {
  const out: HltCell[] = [];
  hlt.rows.forEach((_, row) => hlt.columns.forEach((__, col) => {
    const c = cellAt(hlt, row, col);
    if (c && c.code) out.push(c);
  }));
  return out;
}

/**
 * Build a table from rows of text, one row per line, cells separated by whitespace, `.` for a
 * blank; a cell wrapped in `*` marks the Core (`*SI*`). Scale and core armour are given
 * separately. This is the editor's input form.
 */
export function parseHitLocationText(text: string, scale: number, coreArmor: number, rows = STANDARD_HLT_ROWS, columns = STANDARD_HLT_COLUMNS): HitLocationTable {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length !== rows.length) throw new Error(`expected ${rows.length} rows, got ${lines.length}`);
  const cells: (SystemCode | null)[][] = [];
  const core: boolean[][] = [];
  lines.forEach((line, ri) => {
    const toks = line.split(/\s+/);
    if (toks.length !== columns.length) throw new Error(`row ${rows[ri]?.label}: expected ${columns.length} cells, got ${toks.length}`);
    const rowCells: (SystemCode | null)[] = [];
    const rowCore: boolean[] = [];
    for (const t of toks) {
      const isCore = t.startsWith('*') && t.endsWith('*') && t.length > 2;
      const code = isCore ? t.slice(1, -1) : t;
      if (code === '.') {
        rowCells.push(null);
        rowCore.push(false);
        continue;
      }
      if (!isSystemCode(code)) throw new Error(`row ${rows[ri]?.label}: unknown system code "${code}"`);
      rowCells.push(code);
      rowCore.push(isCore);
    }
    cells.push(rowCells);
    core.push(rowCore);
  });
  return { scale, coreArmor, columns, rows, cells, core };
}

export function formatHitLocationText(hlt: HitLocationTable): string {
  return hlt.cells
    .map((row, ri) => row.map((c, ci) => (c === null ? '.' : hlt.core[ri]?.[ci] ? `*${c}*` : c)).join(' '))
    .join('\n');
}
