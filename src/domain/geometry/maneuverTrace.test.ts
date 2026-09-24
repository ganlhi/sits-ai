import { describe, expect, it } from 'vitest';
import { LEVEL_ATTITUDE, attitudeFromWindows, markers } from './attitude';
import { blue, green, purple, windowDirection, windowDistance, windowLabel, windowsEqual, yellow, type AvidWindow } from './avid';
import { halves, nosePath, topCandidates, traceManeuver } from './maneuverTrace';
import { azimuthDeg, pitchDeg } from './vec3';

const labels = (ws: readonly { window: AvidWindow }[]) => ws.map((c) => windowLabel(c.window));

describe('tracing a maneuver on the AVID', () => {
  it('half of an odd maneuver rounds down: 3 windows are 1 then 2, 1 window is 0 then 1', () => {
    expect(halves(3)).toEqual([1, 2]);
    expect(halves(1)).toEqual([0, 1]);
    expect(halves(4)).toEqual([2, 2]);
    expect(halves(0)).toEqual([0, 0]);
  });

  it('no pivot, no roll: Forward and Top stay put at both steps', () => {
    for (const path of [null, []]) {
      const t = traceManeuver(LEVEL_ATTITUDE, path, null);
      expect(t.pivotWindows).toBe(0);
      expect(windowLabel(t.midpoint.forward)).toBe('A(yellow)');
      expect(labels(t.midpoint.top)).toEqual(['purple(upper)']);
      expect(labels(t.endOfTurn.top)).toEqual(['purple(upper)']);
      expect(t.warnings).toEqual([]);
    }
  });

  it('a level two-step pivot A → A/B → B keeps Top at the zenith, with the Midpoint at A/B', () => {
    const t = traceManeuver(LEVEL_ATTITUDE, [yellow(1), yellow(2)], null);
    expect(t.pivotWindows).toBe(2);
    expect(t.pivotSplit).toEqual([1, 1]);
    expect(windowLabel(t.midpoint.forward)).toBe('A/B(yellow)');
    expect(windowLabel(t.endOfTurn.forward)).toBe('B(yellow)');
    expect(labels(t.midpoint.top)).toEqual(['purple(upper)']);
    expect(labels(t.endOfTurn.top)).toEqual(['purple(upper)']);
    expect(t.warnings).toEqual([]);
  });

  it('pitching up three steps to the zenith carries Top over to D(yellow); the Midpoint after one step has Top in D(green)', () => {
    const t = traceManeuver(LEVEL_ATTITUDE, [blue(0, 'upper'), green(0, 'upper'), purple('upper')], null);
    expect(t.pivotSplit).toEqual([1, 2]);
    expect(windowLabel(t.midpoint.forward)).toBe('A(blue, upper)');
    expect(labels(t.midpoint.top)).toEqual(['D(green, upper)']);
    expect(windowLabel(t.endOfTurn.forward)).toBe('purple(upper)');
    expect(labels(t.endOfTurn.top)).toEqual(['D(yellow)']);
    expect(t.warnings).toEqual([]);
  });

  it('a roll moves Top around Forward, half at the midpoint: 2 to starboard puts Top on the B–C spine of the green ring, then in B/C(blue)', () => {
    const t = traceManeuver(LEVEL_ATTITUDE, null, { windows: 2, direction: 'starboard' });
    expect(t.rollSplit).toEqual([1, 1]);
    expect(labels(t.midpoint.top).sort()).toEqual(['B(green, upper)', 'C(green, upper)'].sort());
    expect(t.midpoint.spine!.map((w) => windowLabel(w))).toEqual(['B(green, upper)', 'C(green, upper)']);
    expect(labels(t.endOfTurn.top)).toEqual(['B/C(blue, upper)']);
    expect(t.endOfTurn.spine).toBeNull();
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

  it('pivot then roll: three steps to B/C with a 6-window roll ends inverted, Top in purple(lower)', () => {
    const t = traceManeuver(LEVEL_ATTITUDE, [yellow(1), yellow(2), yellow(3)], { windows: 6, direction: 'port' });
    expect(labels(t.endOfTurn.top)).toEqual(['purple(lower)']);
    // at the Midpoint: one step along, rolled 90° to port, Top on the horizon a quarter turn anticlockwise of A/B: F
    expect(windowLabel(t.midpoint.forward)).toBe('A/B(yellow)');
    expect(labels(t.midpoint.top)).toEqual(['F(yellow)']);
  });

  it("the player's detour E/F → over the green ring → B: six steps, Midpoint at D(green), Top following the real path", () => {
    const level = attitudeFromWindows(yellow(9), purple('upper'));
    const rolled = attitudeFromWindows(yellow(9), yellow(6)); // the screenshot's ship: E/F with its Top on the horizon at D
    const path = [blue(9, 'upper'), green(8, 'upper'), green(6, 'upper'), green(4, 'upper'), blue(3, 'upper'), yellow(2)];
    const t = traceManeuver(level, path, null);
    expect(t.pivotWindows).toBe(6);
    expect(t.pivotSplit).toEqual([3, 3]);
    expect(windowLabel(t.midpoint.forward)).toBe('D(green, upper)');
    expect(windowLabel(t.endOfTurn.forward)).toBe('B(yellow)');
    expect(t.warnings).toEqual([]);
    // up the E/F column then along the green ring: at D(green) the Top has swung to the far side of the ring
    expect(windowDistance(t.midpoint.top[0]!.window, green(6, 'upper'))).toBe(3);
    for (const c of t.endOfTurn.top) expect(windowDistance(c.window, yellow(2))).toBe(3);
    expect(traceManeuver(rolled, path, null).warnings).toEqual([]);
  });

  it("the screenshot's pivot: E/F with Top at D, up and over the D side to B — Top D(blue, lower) at D(green), C/D(yellow) at the end", () => {
    const start = attitudeFromWindows(yellow(9), yellow(6));
    const viaD = [blue(9, 'upper'), green(8, 'upper'), green(6, 'upper'), green(4, 'upper'), blue(3, 'upper'), yellow(2)];
    const t = traceManeuver(start, viaD, null);
    expect(windowLabel(t.midpoint.forward)).toBe('D(green, upper)');
    expect(labels(t.midpoint.top)[0]).toBe('D(blue, lower)');
    expect(windowLabel(t.endOfTurn.forward)).toBe('B(yellow)');
    expect(labels(t.endOfTurn.top)[0]).toBe('C/D(yellow)');
    // Written through purple, or round the A side, the nose passes the pole on the ship's Bottom side instead of its Top
    // side: a half turn about an axis 15° off the Top axis moves the Top 30°, so the Top ends higher, not lower.
    const viaPurple = [blue(9, 'upper'), green(10, 'upper'), purple('upper'), green(2, 'upper'), blue(3, 'upper'), yellow(2)];
    const viaA = [blue(9, 'upper'), green(10, 'upper'), green(0, 'upper'), green(2, 'upper'), blue(3, 'upper'), yellow(2)];
    for (const path of [viaPurple, viaA]) {
      const best = traceManeuver(start, path, null).endOfTurn.top[0]!.window;
      expect(windowDistance(best, yellow(2))).toBe(3);
      expect(best.ring === 'yellow' || best.hemi === 'upper').toBe(true);
    }
  });

  it('the nose path is pulled taut through the windows: level steps stay on the horizon, a detour round the pole hugs it', () => {
    const level = nosePath(windowDirection(yellow(0)), [yellow(1), yellow(2), yellow(3)]);
    for (const p of level) expect(Math.abs(pitchDeg(p))).toBeLessThan(1e-6);
    expect(azimuthDeg(level[1]!)).toBeCloseTo(60, 5);
    const over = nosePath(windowDirection(yellow(9)), [blue(9, 'upper'), green(8, 'upper'), green(6, 'upper'), green(4, 'upper'), blue(3, 'upper'), yellow(2)]);
    expect(pitchDeg(over[2]!)).toBeCloseTo(75, 3); // D(green) is crossed at its edge nearest the pole
    expect(over).toHaveLength(6);
  });

  it('a step to a window that does not touch, or a second diagonal, is reported but still traced', () => {
    const jump = traceManeuver(LEVEL_ATTITUDE, [yellow(3)], null);
    expect(jump.warnings).toEqual(['Step 1: B/C(yellow) does not touch A(yellow).']);
    expect(windowLabel(jump.endOfTurn.forward)).toBe('B/C(yellow)');
    const twoDiagonals = traceManeuver(LEVEL_ATTITUDE, [blue(1, 'upper'), yellow(2)], null);
    expect(twoDiagonals.warnings).toEqual(['Step 2 is a second diagonal step; a pivot may take one.']);
  });

  it('every candidate is three windows from the Forward the path names and carries the other markers', () => {
    const paths: AvidWindow[][] = [[yellow(1)], [blue(0, 'upper'), blue(1, 'upper'), green(2, 'upper')], [blue(0, 'lower'), green(0, 'lower'), purple('lower')]];
    for (const path of paths) {
      const t = traceManeuver(LEVEL_ATTITUDE, path, { windows: 3, direction: 'starboard' });
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
