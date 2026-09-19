import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import {
  ALL_WINDOWS,
  blue,
  directionToWindow,
  green,
  purple,
  reciprocalWindow,
  windowDirection,
  windowDistance,
  windowFromLabel,
  windowLabel,
  windowsAtDistance,
  windowsEqual,
  yellow,
} from './avid';

describe('AVID windows (RULES.md §5)', () => {
  it('has 50 windows: 12 yellow, 24 blue, 12 green, 2 purple', () => {
    expect(ALL_WINDOWS).toHaveLength(50);
    expect(ALL_WINDOWS.filter((w) => w.ring === 'green')).toHaveLength(12);
  });

  it('uses the book notation for labels', () => {
    expect(windowLabel(windowFromLabel('A/B', 'blue', 'upper'))).toBe('A/B(blue, upper)');
    expect(windowLabel(windowFromLabel('D', 'green', 'upper'))).toBe('D(green, upper)');
    expect(windowLabel(yellow(0))).toBe('A(yellow)');
    expect(() => windowFromLabel('A/B', 'green')).toThrow();
  });

  it('bearings are reciprocal (C1.16): A(yellow) ↔ D(yellow); A/B(blue, upper) ↔ D/E(blue, lower)', () => {
    expect(windowsEqual(reciprocalWindow(yellow(0)), yellow(6))).toBe(true);
    expect(windowsEqual(reciprocalWindow(blue(1, 'upper')), blue(7, 'lower'))).toBe(true);
    expect(windowDistance(blue(1, 'upper'), blue(7, 'lower'))).toBe(6);
    for (const w of ALL_WINDOWS) {
      expect(windowsEqual(reciprocalWindow(reciprocalWindow(w)), w)).toBe(true);
      expect(windowDistance(w, reciprocalWindow(w))).toBe(6);
    }
  });

  it('counts windows the way the placement rules do', () => {
    expect(windowDistance(yellow(0), yellow(1))).toBe(1); // A → A/B
    expect(windowDistance(yellow(0), blue(0, 'upper'))).toBe(1); // A(yellow) → A(blue)
    expect(windowDistance(yellow(0), yellow(9))).toBe(3); // Forward A → Port E/F
    expect(windowDistance(yellow(0), purple('upper'))).toBe(3); // Forward A → Top
    expect(windowDistance(blue(0, 'upper'), green(0, 'upper'))).toBe(1);
    expect(windowDistance(green(0, 'upper'), purple('upper'))).toBe(1);
    expect(windowDistance(green(0, 'upper'), green(2, 'upper'))).toBe(1);
    expect(windowDistance(yellow(0), yellow(6))).toBe(6);
  });

  it('quantises the centre of every window back to itself', () => {
    for (const w of ALL_WINDOWS) expect(windowsEqual(directionToWindow(windowDirection(w)), w)).toBe(true);
  });

  it('quantises arbitrary directions to a window whose centre is the nearest by ring band', () => {
    fc.assert(
      fc.property(fc.double({ min: 0, max: 360, noNaN: true }), fc.double({ min: -90, max: 90, noNaN: true }), (az, pitch) => {
        const r = (az * Math.PI) / 180;
        const p = (pitch * Math.PI) / 180;
        const v = { x: Math.sin(r) * Math.cos(p), y: Math.cos(r) * Math.cos(p), z: Math.sin(p) };
        const w = directionToWindow(v);
        expect(windowDistance(w, w)).toBe(0);
        // never more than one window away from the true direction
        const c = windowDirection(w);
        const angle = (Math.acos(Math.max(-1, Math.min(1, c.x * v.x + c.y * v.y + c.z * v.z))) * 180) / Math.PI;
        expect(angle).toBeLessThan(45);
      }),
    );
  });

  it('lists pivot destinations by window distance', () => {
    const one = windowsAtDistance(yellow(0), 1);
    expect(one.some((w) => windowsEqual(w, yellow(1)))).toBe(true);
    expect(one.some((w) => windowsEqual(w, blue(0, 'lower')))).toBe(true);
    expect(one.every((w) => windowDistance(yellow(0), w) === 1)).toBe(true);
  });
});
