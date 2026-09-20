/**
 * Text drafts for the numeric fields. The player types into strings; a valid draft is pushed
 * to the game at once, an invalid one ("-", "1.") is left alone until it becomes valid. When
 * the game changes the draft from elsewhere (Next turn, a table shift) the text is reset.
 */
import { useEffect, useRef, useState } from 'react';
import { VECTOR_DIRECTIONS, velocity, velocityEquals, type Velocity } from '../domain/geometry';
import type { VelocityDraft } from './VelocityInput';

export function useDraft<T, D>(value: T, toDraft: (v: T) => D, parse: (d: D) => T | null, equals: (a: T, b: T) => boolean): [D, (d: D) => void] {
  const [draft, setDraft] = useState<D>(() => toDraft(value));
  const ref = useRef(draft);
  ref.current = draft;
  useEffect(() => {
    const parsed = parse(ref.current);
    if (parsed === null || !equals(parsed, value)) setDraft(toDraft(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return [draft, setDraft];
}

export const velocityToDraft = (v: Velocity): VelocityDraft => Object.fromEntries(VECTOR_DIRECTIONS.map((d) => [d, String(v[d])])) as VelocityDraft;

export function draftToVelocity(d: VelocityDraft): Velocity | null {
  const parts: Partial<Record<(typeof VECTOR_DIRECTIONS)[number], number>> = {};
  for (const dir of VECTOR_DIRECTIONS) {
    const t = d[dir].trim();
    const n = t === '' ? 0 : Number(t);
    if (!Number.isInteger(n) || n < 0) return null;
    parts[dir] = n;
  }
  return velocity(parts);
}

export { velocityEquals };

/** A whole number in 0..100, or null. */
export function parsePercent(s: string): number | null {
  const t = s.trim();
  if (t === '') return 0;
  const n = Number(t);
  return Number.isInteger(n) && n >= 0 && n <= 100 ? n : null;
}
