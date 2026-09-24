import { describe, expect, it } from 'vitest';
import { LEVEL_ATTITUDE, attitudeFromWindows, markers } from './attitude';
import { blue, green, purple, windowDistance, windowLabel, windowsEqual, yellow } from './avid';
import { defaultPivotMidpoint, topCandidates, traceManeuver } from './maneuverTrace';

const labels = (ws: readonly { window: { ring: string } }[]) => ws.map((c) => windowLabel(c.window as never));

describe('tracing a maneuver on the AVID', () => {
  it('no pivot, no roll: Forward and Top stay put at both steps', () => {
    const t = traceManeuver(LEVEL_ATTITUDE, null, null);
    expect(t.pivotWindows).toBe(0);
    expect(labels(t.midpoint.top)).toEqual(['purple(upper)']);
    expect(labels(t.endOfTurn.top)).toEqual(['purple(upper)']);
    expect(t.warnings).toEqual([]);
  });

  it('a level two-window pivot A → B keeps Top at the zenith; the arc midpoint is A/B', () => {
    const mid = defaultPivotMidpoint(LEVEL_ATTITUDE, yellow(2));
    expect(windowLabel(mid)).toBe('A/B(yellow)');
    const t = traceManeuver(LEVEL_ATTITUDE, { midpoint: mid, endOfTurn: yellow(2) }, null);
    expect(t.pivotWindows).toBe(2);
    expect(t.legs).toEqual([1, 1]);
    expect(labels(t.midpoint.top)).toEqual(['purple(upper)']);
    expect(labels(t.endOfTurn.top)).toEqual(['purple(upper)']);
    expect(t.warnings).toEqual([]);
  });

  it('pitching up three windows to the zenith carries Top over to D(yellow), through D(green) at the midpoint', () => {
    const t = traceManeuver(LEVEL_ATTITUDE, { midpoint: blue(0, 'upper'), endOfTurn: purple('upper') }, null);
    expect(t.legs).toEqual([1, 2]);
    expect(labels(t.midpoint.top)).toEqual(['D(green, upper)']);
    expect(labels(t.endOfTurn.top)).toEqual(['D(yellow)']);
    // the midpoint choice a window further along is as legal
    const t2 = traceManeuver(LEVEL_ATTITUDE, { midpoint: green(0, 'upper'), endOfTurn: purple('upper') }, null);
    expect(t2.legs).toEqual([2, 1]);
    expect(labels(t2.midpoint.top)).toEqual(['D(blue, upper)']);
  });

  it('a roll moves Top around Forward, half at the midpoint: 2 to starboard puts Top on the B–C spine of the green ring, then in B/C(blue)', () => {
    const t = traceManeuver(LEVEL_ATTITUDE, null, { windows: 2, direction: 'starboard' });
    // one window of roll tilts Top 30° from the zenith: the green ring, halfway between B and C
    expect(labels(t.midpoint.top).sort()).toEqual(['B(green, upper)', 'C(green, upper)'].sort());
    expect(t.midpoint.spine!.map((w) => windowLabel(w))).toEqual(['B(green, upper)', 'C(green, upper)']);
    expect(labels(t.endOfTurn.top)).toEqual(['B/C(blue, upper)']);
    expect(t.endOfTurn.spine).toBeNull();
    expect(t.warnings).toEqual([]);
  });

  it('an odd roll leaves Top between windows at the midpoint, and says so', () => {
    const t = traceManeuver(LEVEL_ATTITUDE, null, { windows: 1, direction: 'port' });
    // half a window: 15° off the zenith towards E/F — purple still fits best, the two green windows either side are possible
    expect(labels(t.midpoint.top)[0]).toBe('purple(upper)');
    expect(labels(t.midpoint.top).sort()).toEqual(['E(green, upper)', 'F(green, upper)', 'purple(upper)'].sort());
    expect(labels(t.endOfTurn.top).sort()).toEqual(['E(green, upper)', 'F(green, upper)'].sort());
    expect(t.endOfTurn.spine).not.toBeNull();
    expect(t.warnings.some((w) => /0\.5 windows/.test(w))).toBe(true);
  });

  it('pivot then roll: a 3-window pivot to B/C with a 6-window roll ends inverted, Top in purple(lower)', () => {
    const mid = defaultPivotMidpoint(LEVEL_ATTITUDE, yellow(3));
    const t = traceManeuver(LEVEL_ATTITUDE, { midpoint: mid, endOfTurn: yellow(3) }, { windows: 6, direction: 'port' });
    expect(t.pivotWindows).toBe(3);
    expect(labels(t.endOfTurn.top)).toEqual(['purple(lower)']);
    // halfway: rolled 90°, Top lies on the horizon to port of the midpoint facing
    expect(t.midpoint.top[0]!.window.ring).toBe('yellow');
    expect(windowDistance(t.midpoint.top[0]!.window, mid)).toBe(3);
  });

  it('every candidate is three windows from the Forward the plan names and carries the other markers', () => {
    for (const end of [yellow(1), blue(2, 'upper'), green(4, 'lower'), purple('lower')]) {
      const mid = defaultPivotMidpoint(LEVEL_ATTITUDE, end);
      const t = traceManeuver(LEVEL_ATTITUDE, { midpoint: mid, endOfTurn: end }, { windows: 3, direction: 'starboard' });
      for (const s of [t.midpoint, t.endOfTurn]) {
        expect(s.top.length).toBeGreaterThan(0);
        for (const c of s.top) {
          expect(windowDistance(s.forward, c.window)).toBe(3);
          expect(windowsEqual(c.markers.forward, s.forward)).toBe(true);
          expect(windowsEqual(c.markers.top, c.window)).toBe(true);
          expect(windowDistance(c.markers.port, c.markers.starboard)).toBe(6);
        }
        expect(s.top[0]!.offsetDeg).toBeLessThanOrEqual(s.top.at(-1)!.offsetDeg);
      }
    }
  });

  it('warns when the midpoint window is off the arc or not halfway', () => {
    const off = traceManeuver(LEVEL_ATTITUDE, { midpoint: yellow(11), endOfTurn: yellow(2) }, null);
    expect(off.pivotWindows).toBe(4);
    expect(off.warnings.some((w) => /off the arc/.test(w))).toBe(true);
    const lopsided = traceManeuver(LEVEL_ATTITUDE, { midpoint: yellow(0), endOfTurn: yellow(2) }, null);
    expect(lopsided.warnings.some((w) => /not halfway/.test(w))).toBe(true);
  });

  it("the book's nose-down ship rolled one window to starboard keeps Top in the green ring on the A–B side (Annex Z1.0)", () => {
    // facing A nose down 30°, then 1 window of roll to starboard: the book puts Top on the spine between A and B
    const noseDown = attitudeFromWindows(blue(0, 'lower'), green(0, 'upper'));
    const t = traceManeuver(noseDown, null, { windows: 2, direction: 'starboard' });
    // at the midpoint the roll is one window, the book's case; the exact rotation leans it towards B
    const best = t.midpoint.top[0]!.window;
    expect(best.ring).toBe('green');
    expect([0, 2]).toContain((best as { az: number }).az);
    for (const c of t.midpoint.top) expect(windowDistance(c.window, blue(0, 'lower'))).toBe(3);
  });

  it('top candidates for the current attitude are just its own Top', () => {
    const a = attitudeFromWindows(blue(0, 'upper'), green(6, 'upper'));
    expect(labels(topCandidates(markers(a).forward, a))).toEqual(['D(green, upper)']);
  });
});
