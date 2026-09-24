import { describe, expect, it } from 'vitest';
import { LEVEL_ATTITUDE, attitudeFromWindows, markers } from './attitude';
import { ALL_WINDOWS, blue, green, purple, windowDistance, windowLabel, windowsEqual, yellow, type AvidWindow } from './avid';
import { defaultPivotMidpoint, halves, midpointOptions, topCandidates, traceManeuver } from './maneuverTrace';

const labels = (ws: readonly { window: AvidWindow }[]) => ws.map((c) => windowLabel(c.window));
const pivot = (windows: number, midpoint: AvidWindow, endOfTurn: AvidWindow) => ({ windows, midpoint, endOfTurn });

describe('tracing a maneuver on the AVID', () => {
  it('half of an odd maneuver rounds down: 3 windows are 1 then 2, 1 window is 0 then 1', () => {
    expect(halves(3)).toEqual([1, 2]);
    expect(halves(1)).toEqual([0, 1]);
    expect(halves(4)).toEqual([2, 2]);
    expect(halves(0)).toEqual([0, 0]);
  });

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
    const t = traceManeuver(LEVEL_ATTITUDE, pivot(2, mid, yellow(2)), null);
    expect(t.shortest).toEqual({ total: 2, legs: [1, 1] });
    expect(labels(t.midpoint.top)).toEqual(['purple(upper)']);
    expect(labels(t.endOfTurn.top)).toEqual(['purple(upper)']);
    expect(t.warnings).toEqual([]);
  });

  it('pitching up three windows to the zenith carries Top over to D(yellow), through D(green) at the midpoint', () => {
    const t = traceManeuver(LEVEL_ATTITUDE, pivot(3, blue(0, 'upper'), purple('upper')), null);
    expect(t.shortest.legs).toEqual([1, 2]);
    expect(t.pivotSplit).toEqual([1, 2]);
    expect(labels(t.midpoint.top)).toEqual(['D(green, upper)']);
    expect(labels(t.endOfTurn.top)).toEqual(['D(yellow)']);
    expect(t.warnings).toEqual([]);
    // a Midpoint a window further along is too far for half of three windows, rounded down
    const t2 = traceManeuver(LEVEL_ATTITUDE, pivot(3, green(0, 'upper'), purple('upper')), null);
    expect(labels(t2.midpoint.top)).toEqual(['D(blue, upper)']);
    expect(t2.warnings.some((w) => /At the Midpoint 1 window of the pivot is done/.test(w))).toBe(true);
  });

  it('a roll moves Top around Forward, half at the midpoint: 2 to starboard puts Top on the B–C spine of the green ring, then in B/C(blue)', () => {
    const t = traceManeuver(LEVEL_ATTITUDE, null, { windows: 2, direction: 'starboard' });
    expect(t.rollSplit).toEqual([1, 1]);
    // one window of roll tilts Top 30° from the zenith: the green ring, halfway between B and C
    expect(labels(t.midpoint.top).sort()).toEqual(['B(green, upper)', 'C(green, upper)'].sort());
    expect(t.midpoint.spine!.map((w) => windowLabel(w))).toEqual(['B(green, upper)', 'C(green, upper)']);
    expect(labels(t.endOfTurn.top)).toEqual(['B/C(blue, upper)']);
    expect(t.endOfTurn.spine).toBeNull();
    expect(t.warnings).toEqual([]);
  });

  it('an odd roll does nothing at the midpoint and all of it at End of Turn', () => {
    const one = traceManeuver(LEVEL_ATTITUDE, null, { windows: 1, direction: 'port' });
    expect(one.rollSplit).toEqual([0, 1]);
    expect(labels(one.midpoint.top)).toEqual(['purple(upper)']);
    expect(labels(one.endOfTurn.top).sort()).toEqual(['E(green, upper)', 'F(green, upper)'].sort());
    const three = traceManeuver(LEVEL_ATTITUDE, null, { windows: 3, direction: 'starboard' });
    expect(three.rollSplit).toEqual([1, 2]);
    expect(labels(three.midpoint.top).sort()).toEqual(['B(green, upper)', 'C(green, upper)'].sort());
    expect(labels(three.endOfTurn.top)).toEqual(['B/C(yellow)']);
  });

  it('pivot then roll: a 3-window pivot to B/C with a 6-window roll ends inverted, Top in purple(lower)', () => {
    const mid = defaultPivotMidpoint(LEVEL_ATTITUDE, yellow(3));
    const t = traceManeuver(LEVEL_ATTITUDE, pivot(3, mid, yellow(3)), { windows: 6, direction: 'port' });
    expect(labels(t.endOfTurn.top)).toEqual(['purple(lower)']);
    // halfway: rolled 90°, Top lies on the horizon to port of the midpoint facing
    expect(t.midpoint.top[0]!.window.ring).toBe('yellow');
    expect(windowDistance(t.midpoint.top[0]!.window, mid)).toBe(3);
  });

  it('every candidate is three windows from the Forward the plan names and carries the other markers', () => {
    for (const end of [yellow(1), blue(2, 'upper'), green(4, 'lower'), purple('lower')]) {
      const mid = defaultPivotMidpoint(LEVEL_ATTITUDE, end);
      const t = traceManeuver(LEVEL_ATTITUDE, pivot(6, mid, end), { windows: 3, direction: 'starboard' });
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

  it("accepts the player's six-window detour from E/F to B over the green ring, and refuses it in five", () => {
    const start = attitudeFromWindows(yellow(9), yellow(6)); // E/F, Top D
    const six = traceManeuver(start, pivot(6, green(6, 'upper'), yellow(2)), null);
    expect(six.shortest).toEqual({ total: 6, legs: [3, 3] });
    expect(six.warnings).toEqual([]);
    const five = traceManeuver(start, pivot(5, green(6, 'upper'), yellow(2)), null);
    expect(five.warnings.some((w) => /shortest legal path costs 6/.test(w))).toBe(true);
    // the direct five-window pivot is fine with its own midpoint: two windows along, F/A, since half of five rounds down
    const mid = defaultPivotMidpoint(start, yellow(2), 5);
    expect(windowLabel(mid)).toBe('F/A(yellow)');
    const direct = traceManeuver(start, pivot(5, mid, yellow(2)), null);
    expect(direct.warnings).toEqual([]);
    // the arc's own midpoint is three along, too far for the first half
    expect(windowLabel(defaultPivotMidpoint(start, yellow(2)))).toBe('A(yellow)');
  });

  it('warns when the Midpoint is too far from either end for its half of the pivot, and when zero windows are to move Forward', () => {
    const lopsided = traceManeuver(LEVEL_ATTITUDE, pivot(2, yellow(0), yellow(2)), null);
    expect(lopsided.warnings.some((w) => /After the Midpoint 1 window of the pivot remains/.test(w))).toBe(true);
    const none = traceManeuver(LEVEL_ATTITUDE, pivot(0, yellow(1), yellow(2)), null);
    expect(none.warnings.some((w) => /0 windows cannot move/.test(w))).toBe(true);
  });

  it('midpoint options are the windows reachable in the first half and leaving the rest for the second, evenest first', () => {
    const opts = midpointOptions(LEVEL_ATTITUDE, yellow(2), 2, ALL_WINDOWS);
    expect(labels(opts)).toEqual(['A/B(yellow)']);
    const detours = midpointOptions(LEVEL_ATTITUDE, yellow(2), 4, ALL_WINDOWS);
    expect(labels(detours)).toContain('A/B(blue, upper)');
    expect(labels(detours)).toContain('A/B(yellow)');
    for (const o of detours) expect(o.legs[0] <= 2 && o.legs[1] <= 2).toBe(true);
  });

  it("the book's nose-down ship rolled one window to starboard keeps Top in the green ring on the A–B side (Annex Z1.0)", () => {
    const noseDown = attitudeFromWindows(blue(0, 'lower'), green(0, 'upper'));
    const t = traceManeuver(noseDown, null, { windows: 2, direction: 'starboard' });
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
