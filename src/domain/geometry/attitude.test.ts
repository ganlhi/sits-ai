import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import {
  LEVEL_ATTITUDE,
  applyManeuver,
  attitude,
  attitudeFromWindows,
  facingAfter,
  markers,
  pivotCost,
  pivotOptions,
  pivotTowards,
  roll,
} from './attitude';
import { blue, green, purple, windowDistance, windowLabel, windowsEqual, yellow } from './avid';
import { UP, fromAzPitch, rotateAbout, vec3 } from './vec3';

const label = (w: { ring: string }) => windowLabel(w as never);

describe('orientation markers — Annex Z1.0 worked examples (RULES.md §5.2)', () => {
  it('ship pointing straight up, top facing D: Forward and Aft in purple (Aft circled), Top in D(yellow)', () => {
    const a = attitude(UP, fromAzPitch(180, 0));
    const m = markers(a);
    expect(label(m.forward)).toBe('purple(upper)');
    expect(label(m.aft)).toBe('purple(lower)');
    expect(label(m.top)).toBe('D(yellow)');
  });

  it('level, facing A, top up: Forward A(yellow); Top and Bottom purple, Bottom circled; Port E/F, Starboard B/C', () => {
    const m = markers(LEVEL_ATTITUDE);
    expect(label(m.forward)).toBe('A(yellow)');
    expect(label(m.aft)).toBe('D(yellow)');
    expect(label(m.top)).toBe('purple(upper)');
    expect(label(m.bottom)).toBe('purple(lower)');
    expect(label(m.port)).toBe('E/F(yellow)');
    expect(label(m.starboard)).toBe('B/C(yellow)');
  });

  it('facing A, nose up 30°, top facing D: Forward A(blue); Aft circled; Top D(green, upper)', () => {
    const a = attitude(fromAzPitch(0, 30), fromAzPitch(180, 60));
    const m = markers(a);
    expect(label(m.forward)).toBe('A(blue, upper)');
    expect(label(m.aft)).toBe('D(blue, lower)');
    expect(label(m.top)).toBe('D(green, upper)');
    // the same attitude built from its windows
    const b = attitudeFromWindows(blue(0, 'upper'), green(6, 'upper'));
    expect(label(markers(b).top)).toBe('D(green, upper)');
  });

  it('facing A, nose down 30°, rolled 30° to starboard: Forward A(blue) circled; Port rises to the blue ring, Starboard drops; Top on the A–B side of the green ring', () => {
    const noseDown = attitude(fromAzPitch(0, -30), fromAzPitch(0, 60));
    const a = roll(noseDown, 1, 'starboard');
    const m = markers(a);
    expect(label(m.forward)).toBe('A(blue, lower)');
    expect(m.port.ring).toBe('blue');
    expect((m.port as { hemi: string }).hemi).toBe('upper');
    expect(m.starboard.ring).toBe('blue');
    expect((m.starboard as { hemi: string }).hemi).toBe('lower');
    // The book puts Port in E/F and Starboard in B/C; the exact rotation lands Port at azimuth
    // 286° and Starboard at 106°, one degree past the E/F–F and B/C–C boundaries. Either
    // reading is a window away from Forward's column, which is what the rule needs.
    expect([9, 10]).toContain((m.port as { az: number }).az);
    expect([3, 4]).toContain((m.starboard as { az: number }).az);
    expect(m.top.ring).toBe('green');
    expect([0, 2]).toContain((m.top as { az: number }).az); // "on the spine" between A and B
  });
});

describe('pivots and rolls (RULES.md §6)', () => {
  it('a one-window pivot from level flight lands Forward in an adjacent window and costs one window', () => {
    for (const target of pivotOptions(LEVEL_ATTITUDE, 1)) {
      const a = pivotTowards(LEVEL_ATTITUDE, target);
      expect(windowsEqual(markers(a).forward, target)).toBe(true);
      expect(pivotCost(LEVEL_ATTITUDE, target)).toBe(1);
    }
  });

  it('pivoting three windows up points the ship at the purple window and carries Top over to the aft side', () => {
    const a = pivotTowards(LEVEL_ATTITUDE, purple('upper'));
    const m = markers(a);
    expect(label(m.forward)).toBe('purple(upper)');
    expect(label(m.top)).toBe('D(yellow)');
  });

  it('the midpoint attitude is halfway: half a 2-window pivot is one window', () => {
    const target = yellow(2); // A → B is two windows
    expect(pivotCost(LEVEL_ATTITUDE, target)).toBe(2);
    expect(label(facingAfter(LEVEL_ATTITUDE, { pivotTo: target }, 0.5))).toBe('A/B(yellow)');
    expect(label(facingAfter(LEVEL_ATTITUDE, { pivotTo: target }, 1))).toBe('B(yellow)');
  });

  it('a roll moves Top without moving Forward; 3 windows to starboard leans Top over to the starboard bearing and lifts Port to the zenith', () => {
    const a = roll(LEVEL_ATTITUDE, 3, 'starboard');
    const m = markers(a);
    expect(label(m.forward)).toBe('A(yellow)');
    expect(label(m.top)).toBe('B/C(yellow)');
    expect(label(m.port)).toBe('purple(upper)');
    const b = roll(LEVEL_ATTITUDE, 3, 'port');
    expect(label(markers(b).top)).toBe('E/F(yellow)');
    expect(label(markers(b).starboard)).toBe('purple(upper)');
  });

  it('a maneuver applies the pivot then the roll about the new Forward', () => {
    const a = applyManeuver(LEVEL_ATTITUDE, { pivotTo: yellow(3), roll: { windows: 6, direction: 'port' } });
    const m = markers(a);
    expect(label(m.forward)).toBe('B/C(yellow)');
    expect(label(m.top)).toBe('purple(lower)'); // rolled inverted
  });

  it('marker pairs are antipodal and side markers stay about three windows from Forward for any attitude', () => {
    fc.assert(
      fc.property(fc.double({ min: 0, max: 360, noNaN: true }), fc.double({ min: -89, max: 89, noNaN: true }), fc.double({ min: 0, max: 360, noNaN: true }), (az, pitch, rollDeg) => {
        const f = fromAzPitch(az, pitch);
        const t0 = rotateAbout(f, vec3(-Math.cos((az * Math.PI) / 180), Math.sin((az * Math.PI) / 180), 0), 90);
        const a = roll(attitude(f, t0), rollDeg / 30, 'starboard');
        const m = markers(a);
        expect(windowDistance(m.forward, m.aft)).toBe(6);
        expect(windowDistance(m.top, m.bottom)).toBe(6);
        expect(windowDistance(m.port, m.starboard)).toBe(6);
        expect(windowDistance(m.forward, m.port)).toBeGreaterThanOrEqual(2);
        expect(windowDistance(m.forward, m.port)).toBeLessThanOrEqual(4);
        expect(windowDistance(m.forward, m.top)).toBeGreaterThanOrEqual(2);
        expect(windowDistance(m.forward, m.top)).toBeLessThanOrEqual(4);
      }),
    );
  });
});
