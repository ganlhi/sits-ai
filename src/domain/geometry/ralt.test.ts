import { describe, expect, it } from 'vitest';
import { ringFor, trueRange } from './ralt';

describe('RALT (Reference Card, RULES.md §9.1–9.2)', () => {
  it('reproduces the C1.14 sidebar: 7 hexes and 2 levels is range 7 in the blue ring', () => {
    expect(trueRange(7, 2)).toBe(7);
    expect(ringFor(7, 2)).toBe('blue');
  });

  it('matches cells read from the printed table (floor, not round)', () => {
    // row 3: 3 3 4 5 5 6 [7] 8 9 …   row 4: 4 4 5 5 6 7 8 8 9 …   row 2: 2 2 3 4 5 6 7 …
    expect(trueRange(7, 3)).toBe(7); // the boxed example cell: √58 = 7.6 prints as 7
    expect(trueRange(2, 3)).toBe(3);
    expect(trueRange(3, 3)).toBe(4);
    expect(trueRange(4, 3)).toBe(5);
    expect(trueRange(1, 4)).toBe(4);
    expect(trueRange(2, 4)).toBe(4);
    expect(trueRange(6, 4)).toBe(7);
    expect(trueRange(7, 4)).toBe(8);
    expect(trueRange(2, 2)).toBe(2);
    expect(trueRange(1, 1)).toBe(1);
    expect(trueRange(3, 4)).toBe(5);
    expect(trueRange(0, 9)).toBe(9);
    expect(trueRange(12, 0)).toBe(12);
  });

  it('assigns rings by the rules of thumb, with H = V blue', () => {
    expect(ringFor(4, 1)).toBe('yellow');
    expect(ringFor(3, 1)).toBe('blue');
    expect(ringFor(3, 3)).toBe('blue');
    expect(ringFor(2, 3)).toBe('green');
    expect(ringFor(1, 4)).toBe('purple');
    expect(ringFor(0, 2)).toBe('purple');
    expect(ringFor(5, 0)).toBe('yellow');
    expect(ringFor(0, 0)).toBeNull();
  });
});
