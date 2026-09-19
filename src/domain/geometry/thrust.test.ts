import { describe, expect, it } from 'vitest';
import { blue, green, purple, yellow } from './avid';
import { horizontalSplits, thrustOptions, verticalOptions } from './thrust';
import { velocity, velocityEquals, type Velocity } from './velocity';

const has = (plots: { delta: Velocity }[], v: Velocity) => plots.some((p) => velocityEquals(p.delta, v));

describe('vertical plotting grid (Movement Card)', () => {
  it('thrust 4 in the blue ring: 3 across and 3 up (the B4 example) or 4 across and 2 up', () => {
    const cells = verticalOptions(4, 'blue', 'upper').map((c) => `${c.h},${c.v}`).sort();
    expect(cells).toEqual(['3,3', '4,2']);
  });

  it('thrust 4 level: 4 across, optionally with one level up or down (the shallow yellow cells)', () => {
    const cells = verticalOptions(4, 'yellow', null).map((c) => `${c.h},${c.v}`).sort();
    expect(cells).toEqual(['4,-1', '4,0', '4,1']);
  });

  it('thrust 4 straight up: 4 up, or 4 up with a one-hex horizontal offset (B3.251)', () => {
    expect(verticalOptions(4, 'purple', 'upper').map((c) => `${c.h},${c.v}`).sort()).toEqual(['0,4', '1,4']);
    expect(verticalOptions(3, 'purple', 'lower').map((c) => `${c.h},${c.v}`)).toEqual(['0,-3']);
  });

  it('thrust 4 in the green ring: 2 across and 4 up', () => {
    expect(verticalOptions(4, 'green', 'upper').map((c) => `${c.h},${c.v}`)).toEqual(['2,4']);
  });
});

describe('horizontal plotting fans (B3.254–255)', () => {
  it('thrust 4 in A: 4 in A, or 3 in A and 1 in F, or 3 in A and 1 in B', () => {
    expect(horizontalSplits(4, 0, 'yellow')).toEqual([{ A: 4 }, { A: 3, B: 1 }, { A: 3, F: 1 }]);
  });

  it('the green hexes add two-off splits only for a green-ring facing', () => {
    expect(horizontalSplits(4, 0, 'green')).toEqual([{ A: 4 }, { A: 3, B: 1 }, { A: 3, F: 1 }, { A: 2, B: 2 }, { A: 2, F: 2 }]);
    expect(horizontalSplits(3, 0, 'green')).toEqual([{ A: 3 }, { A: 2, B: 1 }, { A: 2, F: 1 }]);
  });

  it('thrust 4 in B/C: 2B 2C, 3B 1C or 1B 3C', () => {
    expect(horizontalSplits(4, 3, 'yellow')).toEqual([{ B: 3, C: 1 }, { B: 2, C: 2 }, { B: 1, C: 3 }]);
    expect(horizontalSplits(1, 3, 'yellow')).toEqual([{ B: 1 }, { C: 1 }]);
    expect(horizontalSplits(5, 3, 'yellow')).toEqual([{ B: 3, C: 2 }, { B: 2, C: 3 }]);
  });

  it('a purple offset may go in any of the six directions', () => {
    expect(horizontalSplits(1, null, 'purple')).toHaveLength(6);
  });
});

describe('full thrust plots', () => {
  it('a ship facing A(blue, upper) thrusting 4 may take 3 in A and 3 in + (B3.25 example)', () => {
    const plots = thrustOptions(4, blue(0, 'upper'));
    expect(has(plots, velocity({ A: 3, '+': 3 }))).toBe(true);
    expect(has(plots, velocity({ A: 2, B: 1, '+': 3 }))).toBe(true);
    expect(has(plots, velocity({ A: 4, '+': 2 }))).toBe(true);
    expect(has(plots, velocity({ A: 4 }))).toBe(false);
  });

  it('a level ship facing A thrusting 2 may take 2 in A, or 1 in A and 1 in B or F', () => {
    const plots = thrustOptions(2, yellow(0));
    expect(has(plots, velocity({ A: 2 }))).toBe(true);
    expect(has(plots, velocity({ A: 1, B: 1 }))).toBe(true);
    expect(has(plots, velocity({ A: 1, F: 1 }))).toBe(true);
    expect(plots.every((p) => p.v === 0)).toBe(true); // 2 is too little for the shallow cells
  });

  it('thrust 0 is the single option of no change; purple thrust 4 offers the offsets', () => {
    expect(thrustOptions(0, yellow(0))).toHaveLength(1);
    const up = thrustOptions(4, purple('upper'));
    expect(has(up, velocity({ '+': 4 }))).toBe(true);
    expect(has(up, velocity({ '+': 4, D: 1 }))).toBe(true);
    expect(up).toHaveLength(7);
  });

  it('green ring facing D, thrusting down: 5 gives 3 across and 5 down (or 2 and 5, or 3 and 4); 6 reaches the green hexes', () => {
    const five = thrustOptions(5, green(6, 'lower'));
    expect(has(five, velocity({ D: 3, '-': 5 }))).toBe(true);
    expect(has(five, velocity({ D: 2, C: 1, '-': 5 }))).toBe(true);
    expect(has(five, velocity({ D: 3, '-': 4 }))).toBe(true);
    expect(has(five, velocity({ D: 1, C: 2, '-': 5 }))).toBe(false); // no green hex for h = 3
    // h = 4 first appears in the green band at thrust 6 (cell 4,5: √41 = 6.4), where the green hexes allow a 2/2 split
    const six = thrustOptions(6, green(6, 'lower'));
    expect(has(six, velocity({ D: 4, '-': 5 }))).toBe(true);
    expect(has(six, velocity({ D: 2, C: 2, '-': 5 }))).toBe(true);
    expect(has(six, velocity({ D: 2, E: 2, '-': 5 }))).toBe(true);
    expect(has(six, velocity({ D: 3, '-': 6 }))).toBe(true);
  });
});
