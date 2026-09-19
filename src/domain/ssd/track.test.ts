import { describe, expect, it } from 'vitest';
import {
  currentValue,
  destroyLeftmost,
  disableLeftmost,
  expireJuryRigs,
  failRepair,
  formatTrack,
  freshTrack,
  intactWithMark,
  onlyCircledRemain,
  parseTrack,
  remainingCount,
  repairBox,
  restoreDisabled,
} from './track';

describe('track text form', () => {
  it('parses the fire control track with its exhausted value', () => {
    const t = parseTrack('0 0 1 1 2 2 3 | 3');
    expect(t.boxes.map((b) => b.value)).toEqual([0, 0, 1, 1, 2, 2, 3]);
    expect(t.exhaustedValue).toBe(3);
  });

  it('parses shapes, marks, fractions and repeats', () => {
    const si = parseTrack('_*6 (C) _ _ (C) _ [4] _ [5] _ _ [6] _ [7] _ [8] _ _ [9] _ [10] *');
    expect(si.boxes).toHaveLength(27);
    expect(si.boxes[6]).toEqual({ value: null, shape: 'circle', mark: 'C' });
    expect(si.boxes[11]).toEqual({ value: 4, shape: 'octagon', mark: null });
    expect(si.boxes[26]).toEqual({ value: null, shape: 'star', mark: null });
    const cm = parseTrack('6 5 5 4 4 3 2 2 1 2/3');
    expect(cm.boxes[9]?.value).toBeCloseTo(2 / 3, 9);
    const imp = parseTrack('_*8 (W)');
    expect(imp.boxes).toHaveLength(9);
    expect(imp.boxes[8]).toEqual({ value: null, shape: 'circle', mark: 'W' });
    const thrust = parseTrack('2*9 1 1*5 (1)*3');
    expect(thrust.boxes).toHaveLength(18);
    expect(thrust.boxes[17]).toEqual({ value: 1, shape: 'circle', mark: null });
    expect(parseTrack('_ _ _ _ # _ _ _ _ #').boxes.filter((b) => b.mark === 'wrench')).toHaveLength(2);
    expect(parseTrack('_ _ _ _ (0) (-1) | -2').boxes[5]).toEqual({ value: -1, shape: 'circle', mark: null });
  });

  it('round-trips through format', () => {
    for (const text of [
      '0 0 1 1 2 2 3 | 3',
      '-4 -4 -3 -3 -2 -2 -1 -1 -1 0 0 1 1 1 2 2 3 | 3',
      '6 5 5 4 4 3 2 2 1 2/3',
      '_ _ _ _ (0) (-1) | -2',
      '2*9 1 1*5 (1)*3',
      '_*8 (W)',
      '_*6 (C) _ _ (C) _ [4] _ [5] _ _ [6] _ [7] _ [8] _ _ [9] _ [10] *',
      '+4*10',
      '+7 +6 +5 +4 +3 +2 +1',
    ]) {
      const t = parseTrack(text);
      expect(parseTrack(formatTrack(t))).toEqual(t);
    }
  });

  it('rejects garbage', () => {
    expect(() => parseTrack('1 2 x')).toThrow(/bad track value/);
    expect(() => parseTrack('1 | 2 | 3')).toThrow();
  });
});

describe('track state (RULES.md §15.1)', () => {
  const ecm = parseTrack('5 4 4 3 3 2 1 1 0');
  const fcon = parseTrack('0 0 1 3 | 4');

  it('the current rating is the leftmost intact box; damage marks from the left; the exhausted value takes over', () => {
    let s = freshTrack(ecm);
    expect(currentValue(ecm, s)).toBe(5);
    s = destroyLeftmost(ecm, s, 2).state;
    expect(currentValue(ecm, s)).toBe(4);
    expect(remainingCount(s)).toBe(7);
    let f = freshTrack(fcon);
    expect(currentValue(fcon, f)).toBe(0);
    const r = destroyLeftmost(fcon, f, 5);
    f = r.state;
    expect(currentValue(fcon, f)).toBe(4);
    expect(r.destroyed).toHaveLength(4);
    expect(r.overflow).toBe(1);
  });

  it('reports the boxes destroyed so their effects can be applied', () => {
    const imp = parseTrack('_*2 (W)');
    const r = destroyLeftmost(imp, freshTrack(imp), 3);
    expect(r.destroyed.map((d) => d.box.mark)).toEqual([null, null, 'W']);
  });

  it('disabled boxes do not count for the rating and come back', () => {
    let s = disableLeftmost(freshTrack(fcon), 2);
    expect(currentValue(fcon, s)).toBe(1);
    s = restoreDisabled(s);
    expect(currentValue(fcon, s)).toBe(0);
  });

  it('a hit on a disabled box destroys it', () => {
    const s = disableLeftmost(freshTrack(fcon), 1);
    const r = destroyLeftmost(fcon, s, 1);
    expect(r.state.boxes[0]?.status).toBe('destroyed');
  });

  it('repairs are jury-rigged and fail ten turns later; a failed repair is final', () => {
    let s = destroyLeftmost(ecm, freshTrack(ecm), 1).state;
    s = repairBox(s, 0, 3);
    expect(currentValue(ecm, s)).toBe(5);
    expect(expireJuryRigs(s, 12).failed).toEqual([]);
    const e = expireJuryRigs(s, 13);
    expect(e.failed).toEqual([0]);
    expect(currentValue(ecm, e.state)).toBe(4);
    const u = failRepair(e.state, 0);
    expect(u.boxes[0]?.status).toBe('unrepairable');
    expect(() => repairBox(u, 0, 14)).toThrow();
  });

  it('finds surviving damage-control parties and the circled-only state', () => {
    const hull = parseTrack('_ _ # _ #');
    let s = freshTrack(hull);
    expect(intactWithMark(hull, s, 'wrench')).toEqual([2, 4]);
    s = destroyLeftmost(hull, s, 3).state;
    expect(intactWithMark(hull, s, 'wrench')).toEqual([4]);
    const thrust = parseTrack('2 2 1 (1) (1)');
    let t = freshTrack(thrust);
    expect(onlyCircledRemain(thrust, t)).toBe(false);
    t = destroyLeftmost(thrust, t, 3).state;
    expect(onlyCircledRemain(thrust, t)).toBe(true);
    expect(currentValue(thrust, t)).toBe(1);
  });
});
