/**
 * Damage tracks (RULES.md §15.1, §22; PLAN.md Phase 3).
 *
 * Nearly every rating on an SSD is "the leftmost unchecked box of a track", and nearly every
 * damage effect is "check the leftmost unchecked box". One type covers fire control, ECM,
 * sidewalls, weapons, CM/PD probable kills, decoys, bridge, impellers, Maximum Thrust, pivot,
 * roll, hull and Structural Integrity. Box shapes and marks carry the special cases: circled
 * boxes (the bridge penalties, the reduced-thrust boxes, the SI core-cascade `C`, the impeller
 * `W` Warshawski sail), numbered octagons (SI explosion checks), the terminal star, and the
 * wrench icons on hull boxes that are damage-control parties.
 *
 * Tracks are written in a compact text form so ships can be typed in from a physical SSD:
 *
 *   `0 0 1 1 2 2 3 | 3`             fire control, value 3 once every box is gone
 *   `-4 -4 -3 -3 -2 -2 -1 -1 -1 0 0 1 1 1 2 2 3 | 3`   sidewall
 *   `6 5 5 4 4 3 2 2 1 2/3`         countermissiles, fractional last box
 *   `_ _ _ _ (0) (-1) | -2`          bridge: four plain boxes then two circled penalty boxes
 *   `2*9 1 1*5 (1)*3`               Maximum Thrust: nine 2s, a 1, five 1s, three circled 1s
 *   `_*8 (W)`                       impeller: eight boxes and the Warshawski sail
 *   `_ _ _ _ # _ _ _ _ #`            hull row: `#` is a box with a damage-control wrench
 *   `_*6 (C) _ _ (C) _ [4] _ [5] _ _ [6] _ [7] _ [8] _ _ [9] _ [10] *`   Structural Integrity
 */

export type BoxShape = 'square' | 'circle' | 'octagon' | 'star';
export type BoxMark = 'C' | 'W' | 'wrench';

export interface Box {
  /** Printed value, or null for a plain box. Fractions (⅓, ⅔) are stored as numbers. */
  readonly value: number | null;
  readonly shape: BoxShape;
  readonly mark: BoxMark | null;
}

export interface TrackSpec {
  readonly boxes: readonly Box[];
  /** The rating once every box is destroyed (printed after the track, e.g. `| 4`), if any. */
  readonly exhaustedValue: number | null;
}

export const box = (value: number | null = null, shape: BoxShape = 'square', mark: BoxMark | null = null): Box => ({ value, shape, mark });

export const EMPTY_TRACK: TrackSpec = { boxes: [], exhaustedValue: null };

// ---------------------------------------------------------------------------------------------
// Text form

const FRACTIONS: Record<string, number> = { '⅓': 1 / 3, '⅔': 2 / 3, '½': 1 / 2, '1/3': 1 / 3, '2/3': 2 / 3, '1/2': 1 / 2 };

function parseValue(s: string): number {
  const f = FRACTIONS[s];
  if (f !== undefined) return f;
  if (!/^[+-]?\d+(\.\d+)?$/.test(s)) throw new Error(`bad track value "${s}"`);
  return Number(s);
}

export function formatValue(v: number): string {
  for (const [text, num] of Object.entries(FRACTIONS)) if (text.length > 1 && Math.abs(num - v) < 1e-9) return text;
  if (Number.isInteger(v)) return v > 0 ? `${v}` : `${v}`;
  return v.toFixed(2);
}

/** Format a value the way the card prints it, with an explicit sign where the card uses one. */
export function formatSigned(v: number): string {
  if (Number.isInteger(v)) return v > 0 ? `+${v}` : `${v}`;
  return formatValue(v);
}

function parseToken(tok: string): Box {
  if (tok === '_') return box();
  if (tok === '#') return box(null, 'square', 'wrench');
  if (tok === '*') return box(null, 'star');
  let m = /^\((.*)\)$/.exec(tok);
  if (m) {
    const inner = m[1] ?? '';
    if (inner === 'C') return box(null, 'circle', 'C');
    if (inner === 'W') return box(null, 'circle', 'W');
    if (inner === '_' || inner === '') return box(null, 'circle');
    return box(parseValue(inner), 'circle');
  }
  m = /^\[(.*)\]$/.exec(tok);
  if (m) return box(parseValue(m[1] ?? ''), 'octagon');
  return box(parseValue(tok));
}

/** Parse the text form. Throws with a message naming the offending token. */
export function parseTrack(text: string): TrackSpec {
  const [body, ...rest] = text.split('|');
  if (rest.length > 1) throw new Error('at most one "|" exhausted value');
  const boxes: Box[] = [];
  for (const raw of (body ?? '').trim().split(/\s+/).filter(Boolean)) {
    const rep = /^(.*)\*(\d+)$/.exec(raw);
    // `*` alone is the star; `tok*N` repeats
    if (rep && raw !== '*') {
      const b = parseToken(rep[1] ?? '');
      for (let i = 0; i < Number(rep[2]); i++) boxes.push(b);
    } else {
      boxes.push(parseToken(raw));
    }
  }
  const ex = rest[0]?.trim();
  return { boxes, exhaustedValue: ex ? parseValue(ex) : null };
}

function formatBox(b: Box): string {
  switch (b.shape) {
    case 'star':
      return '*';
    case 'octagon':
      return `[${b.value ?? ''}]`;
    case 'circle':
      if (b.mark === 'C' || b.mark === 'W') return `(${b.mark})`;
      return b.value === null ? '(_)' : `(${formatValue(b.value)})`;
    case 'square':
      if (b.mark === 'wrench') return '#';
      return b.value === null ? '_' : formatValue(b.value);
  }
}

const sameBox = (a: Box, b: Box): boolean => a.shape === b.shape && a.mark === b.mark && ((a.value === null && b.value === null) || (a.value !== null && b.value !== null && Math.abs(a.value - b.value) < 1e-9));

/** Format a track in the text form, compressing runs of three or more identical boxes. */
export function formatTrack(t: TrackSpec): string {
  const parts: string[] = [];
  for (let i = 0; i < t.boxes.length; ) {
    const b = t.boxes[i]!;
    let n = 1;
    while (i + n < t.boxes.length && sameBox(t.boxes[i + n]!, b)) n++;
    parts.push(n >= 3 ? `${formatBox(b)}*${n}` : Array<string>(n).fill(formatBox(b)).join(' '));
    i += n;
  }
  return t.exhaustedValue === null ? parts.join(' ') : `${parts.join(' ')} | ${formatValue(t.exhaustedValue)}`;
}

// ---------------------------------------------------------------------------------------------
// State

/**
 * ok — intact. destroyed — crossed out. disabled — circled, returns when the condition ends
 * (fire control disabled by towed pods or canister, thrust boxes disabled by towing).
 * unrepairable — destroyed and a repair attempt failed (C6.12): combat damage control may not
 * try again.
 */
export type BoxStatus = 'ok' | 'destroyed' | 'disabled' | 'unrepairable';

export interface BoxState {
  readonly status: BoxStatus;
  /** Turn a jury-rigged repair was made; it fails ten turns later (C6.13). */
  readonly repairedOnTurn: number | null;
}

export interface TrackState {
  readonly boxes: readonly BoxState[];
}

export const freshTrack = (spec: TrackSpec): TrackState => ({ boxes: spec.boxes.map(() => ({ status: 'ok', repairedOnTurn: null })) });

const withBox = (s: TrackState, i: number, b: BoxState): TrackState => ({ boxes: s.boxes.map((x, j) => (j === i ? b : x)) });

/** Index of the leftmost intact (not destroyed, not disabled) box. */
export function currentIndex(state: TrackState): number | null {
  const i = state.boxes.findIndex((b) => b.status === 'ok');
  return i < 0 ? null : i;
}

/** The current rating: the value in the leftmost intact box, else the exhausted value. */
export function currentValue(spec: TrackSpec, state: TrackState): number | null {
  const i = currentIndex(state);
  if (i === null) return spec.exhaustedValue;
  return spec.boxes[i]?.value ?? spec.exhaustedValue;
}

export const remainingCount = (state: TrackState): number => state.boxes.filter((b) => b.status === 'ok').length;
export const destroyedCount = (state: TrackState): number => state.boxes.filter((b) => b.status === 'destroyed' || b.status === 'unrepairable').length;
export const isExhausted = (state: TrackState): boolean => remainingCount(state) === 0;

export interface DestroyedBox {
  readonly index: number;
  readonly box: Box;
}

/**
 * Take `hits` to the track: cross out the leftmost boxes that are not already destroyed
 * (a disabled box that is hit is destroyed). Returns the boxes destroyed so callers can apply
 * their effects (a Warshawski sail, a damage-control party, an SI cascade or explosion check).
 * Hits beyond the end of the track are reported as `overflow`.
 */
export function destroyLeftmost(spec: TrackSpec, state: TrackState, hits: number): { state: TrackState; destroyed: DestroyedBox[]; overflow: number } {
  let s = state;
  const destroyed: DestroyedBox[] = [];
  let remaining = hits;
  for (let i = 0; i < s.boxes.length && remaining > 0; i++) {
    const st = s.boxes[i]!.status;
    if (st === 'destroyed' || st === 'unrepairable') continue;
    s = withBox(s, i, { status: 'destroyed', repairedOnTurn: null });
    destroyed.push({ index: i, box: spec.boxes[i]! });
    remaining--;
  }
  return { state: s, destroyed, overflow: remaining };
}

/** Disable the leftmost `n` intact boxes (pods, canister). */
export function disableLeftmost(state: TrackState, n: number): TrackState {
  let s = state;
  let left = n;
  for (let i = 0; i < s.boxes.length && left > 0; i++) {
    if (s.boxes[i]!.status !== 'ok') continue;
    s = withBox(s, i, { status: 'disabled', repairedOnTurn: null });
    left--;
  }
  return s;
}

/** Return every disabled box to service. */
export function restoreDisabled(state: TrackState): TrackState {
  return { boxes: state.boxes.map((b) => (b.status === 'disabled' ? { status: 'ok', repairedOnTurn: null } : b)) };
}

/** A successful damage-control roll on a destroyed box (C6.12). */
export function repairBox(state: TrackState, index: number, turn: number): TrackState {
  const b = state.boxes[index];
  if (!b || b.status !== 'destroyed') throw new Error(`box ${index} is not repairable`);
  return withBox(state, index, { status: 'ok', repairedOnTurn: turn });
}

/** A failed damage-control roll: the box can never be repaired by combat damage control. */
export function failRepair(state: TrackState, index: number): TrackState {
  const b = state.boxes[index];
  if (!b || b.status !== 'destroyed') throw new Error(`box ${index} is not destroyed`);
  return withBox(state, index, { status: 'unrepairable', repairedOnTurn: null });
}

/** Jury-rigged repairs fail ten tactical turns after being made (C6.13). */
export function expireJuryRigs(state: TrackState, turn: number): { state: TrackState; failed: number[] } {
  const failed: number[] = [];
  const boxes = state.boxes.map((b, i) => {
    if (b.status === 'ok' && b.repairedOnTurn !== null && turn - b.repairedOnTurn >= 10) {
      failed.push(i);
      return { status: 'destroyed' as BoxStatus, repairedOnTurn: null };
    }
    return b;
  });
  return { state: { boxes }, failed };
}

/** Indices of the boxes with a given mark that are still intact (e.g. surviving damage-control parties). */
export function intactWithMark(spec: TrackSpec, state: TrackState, mark: BoxMark): number[] {
  return spec.boxes.flatMap((b, i) => (b.mark === mark && state.boxes[i]?.status === 'ok' ? [i] : []));
}

/** True when only circled boxes remain — the bridge and Maximum Thrust special states. */
export function onlyCircledRemain(spec: TrackSpec, state: TrackState): boolean {
  return remainingCount(state) > 0 && spec.boxes.every((b, i) => state.boxes[i]?.status !== 'ok' || b.shape === 'circle');
}
