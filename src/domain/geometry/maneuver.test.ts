import { describe, expect, it } from 'vitest';
import { LEVEL_ATTITUDE, attitudeFromWindows, markers } from './attitude';
import { ALL_WINDOWS, blue, green, purple, windowKey, windowLabel, yellow } from './avid';
import { pathProblems, pivotSteps, shortestPath } from './avidGraph';
import { applyManeuver, facingAfter, maneuverPivots, maneuverTrace, pivotWindows } from './maneuver';
import { traceManeuver } from './maneuverTrace';

const label = (w: { ring: string }) => windowLabel(w as never);

describe('the shortest path the AI writes for a pivot', () => {
  it('is empty to the window Forward is in, and one step to a touching window', () => {
    expect(shortestPath(yellow(0), yellow(0))).toEqual([]);
    expect(shortestPath(yellow(0), yellow(1)).map(label)).toEqual(['A/B(yellow)']);
    expect(shortestPath(yellow(0), blue(1, 'upper')).map(label)).toEqual(['A/B(blue, upper)']); // the diagonal
  });

  it('costs what the card says, is legal, and keeps to the arc: A → B along the yellow ring, A → zenith up the A column', () => {
    expect(shortestPath(yellow(0), yellow(2)).map(label)).toEqual(['A/B(yellow)', 'B(yellow)']);
    expect(shortestPath(yellow(0), purple('upper')).map(label)).toEqual(['A(blue, upper)', 'A(green, upper)', 'purple(upper)']);
    for (const from of [yellow(0), blue(3, 'lower'), green(6, 'upper'), purple('lower')]) {
      for (const to of ALL_WINDOWS) {
        const p = shortestPath(from, to);
        expect(p.length).toBe(pivotSteps(from, to));
        expect(pathProblems(from, p)).toEqual([]);
        if (p.length) expect(windowKey(p.at(-1)!)).toBe(windowKey(to));
      }
    }
  });
});

describe('maneuvers read through the same trace as the AVID helper', () => {
  it('reports whether and how much the ship pivots', () => {
    expect(maneuverPivots({})).toBe(false);
    expect(maneuverPivots({ pivotPath: [] })).toBe(false);
    expect(maneuverPivots({ pivotPath: [yellow(1)] })).toBe(true);
    expect(pivotWindows({ pivotPath: [yellow(1), yellow(2)] })).toBe(2);
  });

  it('the Midpoint facing is after half the steps rounded down: A → A/B → B faces A/B, three steps to B/C face A/B too', () => {
    expect(label(facingAfter(LEVEL_ATTITUDE, { pivotPath: [yellow(1), yellow(2)] }, 0.5))).toBe('A/B(yellow)');
    expect(label(facingAfter(LEVEL_ATTITUDE, { pivotPath: [yellow(1), yellow(2)] }, 1))).toBe('B(yellow)');
    expect(label(facingAfter(LEVEL_ATTITUDE, { pivotPath: [yellow(1), yellow(2), yellow(3)] }, 0.5))).toBe('A/B(yellow)');
    expect(label(facingAfter(LEVEL_ATTITUDE, {}, 0.5))).toBe('A(yellow)');
  });

  it('the attitude applied is the one set on the card: Forward window and best-fitting Top', () => {
    const m = { pivotPath: [yellow(1), yellow(2), yellow(3)], roll: { windows: 6, direction: 'port' as const } };
    const eot = markers(applyManeuver(LEVEL_ATTITUDE, m, 1));
    expect(label(eot.forward)).toBe('B/C(yellow)');
    expect(label(eot.top)).toBe('purple(lower)');
    const mid = markers(applyManeuver(LEVEL_ATTITUDE, m, 0.5));
    expect(label(mid.forward)).toBe('A/B(yellow)');
    expect(label(mid.top)).toBe('F(yellow)'); // one step along, three windows of roll to port
  });

  it("agrees with the helper on the screenshot's pivot: Top D(blue, lower) at the Midpoint, C/D(yellow) at End of Turn", () => {
    const start = attitudeFromWindows(yellow(9), yellow(6));
    const path = [blue(9, 'upper'), green(8, 'upper'), green(6, 'upper'), green(4, 'upper'), blue(3, 'upper'), yellow(2)];
    const viaManeuver = maneuverTrace(start, { pivotPath: path });
    const viaHelper = traceManeuver(start, path, null);
    expect(viaManeuver).toEqual(viaHelper);
    expect(label(markers(applyManeuver(start, { pivotPath: path }, 0.5)).top)).toBe('D(blue, lower)');
    expect(label(markers(applyManeuver(start, { pivotPath: path }, 1)).top)).toBe('C/D(yellow)');
  });
});
