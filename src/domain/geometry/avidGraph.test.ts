import { describe, expect, it } from 'vitest';
import { ALL_WINDOWS, blue, green, purple, windowKey, windowLabel, windowsEqual, yellow } from './avid';
import { cornerNeighbours, edgeNeighbours, pathProblems, pivotSteps, pivotStepsVia, stepKind } from './avidGraph';

const labels = (ws: readonly { ring: string }[]) => ws.map((w) => windowLabel(w as never)).sort();

describe('the AVID card as a graph of touching windows', () => {
  it('a yellow window touches its two neighbours and the blue window above and below; the blue windows one column over only at a corner', () => {
    expect(labels(edgeNeighbours(yellow(0)))).toEqual(labels([yellow(11), yellow(1), blue(0, 'upper'), blue(0, 'lower')]));
    expect(labels(cornerNeighbours(yellow(0)))).toEqual(labels([blue(11, 'upper'), blue(1, 'upper'), blue(11, 'lower'), blue(1, 'lower')]));
  });

  it('a blue edge window touches one green window; a blue corner window touches the two green windows either side', () => {
    expect(edgeNeighbours(blue(0, 'upper')).filter((w) => w.ring === 'green').map((w) => windowLabel(w))).toEqual(['A(green, upper)']);
    expect(labels(edgeNeighbours(blue(9, 'upper')).filter((w) => w.ring === 'green'))).toEqual(labels([green(8, 'upper'), green(10, 'upper')]));
  });

  it('green windows touch their neighbours on the ring, purple, and the three blue windows below; purple touches all six green', () => {
    expect(labels(edgeNeighbours(green(6, 'lower')))).toEqual(labels([green(4, 'lower'), green(8, 'lower'), purple('lower'), blue(5, 'lower'), blue(6, 'lower'), blue(7, 'lower')]));
    expect(edgeNeighbours(purple('upper'))).toHaveLength(6);
    expect(cornerNeighbours(green(0, 'upper'))).toEqual([]);
    expect(cornerNeighbours(purple('lower'))).toEqual([]);
  });

  it('touching is mutual', () => {
    for (const a of ALL_WINDOWS) {
      for (const b of edgeNeighbours(a)) expect(edgeNeighbours(b).some((w) => windowsEqual(w, a))).toBe(true);
      for (const b of cornerNeighbours(a)) expect(cornerNeighbours(b).some((w) => windowsEqual(w, a))).toBe(true);
    }
  });

  it('counts pivots as the book does: three windows to the zenith, six to the reciprocal, one diagonal saving a step', () => {
    expect(pivotSteps(yellow(0), purple('upper'))).toBe(3);
    expect(pivotSteps(yellow(0), yellow(6))).toBe(6);
    expect(pivotSteps(yellow(0), yellow(0))).toBe(0);
    expect(pivotSteps(yellow(0), blue(1, 'upper'))).toBe(1); // the diagonal
    expect(pivotSteps(yellow(0), green(2, 'upper'))).toBe(2); // diagonal to A/B(blue), then up into B(green)
    expect(pivotSteps(blue(0, 'upper'), blue(0, 'lower'))).toBe(2); // through the yellow ring
    expect(pivotSteps(purple('upper'), purple('lower'))).toBe(6);
  });

  it("the player's detour: E/F(yellow) up over the green ring and down to B(yellow) is six windows with one diagonal, where the direct path is five", () => {
    // E/F yellow > E/F blue > E green > D green > C green > B/C blue > B yellow
    const path = [yellow(9), blue(9, 'upper'), green(8, 'upper'), green(6, 'upper'), green(4, 'upper'), blue(3, 'upper'), yellow(2)];
    let diagonals = 0;
    for (let i = 1; i < path.length; i++) {
      const [a, b] = [path[i - 1]!, path[i]!];
      const edge = edgeNeighbours(a).some((w) => windowsEqual(w, b));
      const corner = cornerNeighbours(a).some((w) => windowsEqual(w, b));
      expect(edge || corner).toBe(true);
      if (!edge) diagonals++;
    }
    expect(diagonals).toBe(1);
    expect(pivotSteps(yellow(9), yellow(2))).toBe(5);
    const via = pivotStepsVia(yellow(9), green(6, 'upper'), yellow(2));
    expect(via).toEqual({ total: 6, legs: [3, 3] });
  });

  it('the one diagonal is spent once on the whole path through the Midpoint', () => {
    // A(yellow) to A/B(blue) is 1 with the diagonal, 2 without; from there to B/C(blue) another diagonal would cost 2 without
    const via = pivotStepsVia(yellow(0), blue(1, 'upper'), yellow(3));
    expect(via.total).toBe(4);
    expect(via.legs[0] + via.legs[1]).toBe(4);
    expect(pivotSteps(yellow(0), blue(1, 'upper')) + pivotSteps(blue(1, 'upper'), yellow(3))).toBe(3);
  });

  it('names each step of a path: edge, corner or not touching; and finds what is wrong with a path', () => {
    expect(stepKind(yellow(0), yellow(1))).toBe('edge');
    expect(stepKind(yellow(0), blue(1, 'upper'))).toBe('corner');
    expect(stepKind(yellow(0), yellow(3))).toBeNull();
    expect(pathProblems(yellow(9), [blue(9, 'upper'), green(8, 'upper'), green(6, 'upper'), green(4, 'upper'), blue(3, 'upper'), yellow(2)])).toEqual([]);
    expect(pathProblems(yellow(0), [])).toEqual([]);
    expect(pathProblems(yellow(0), [blue(1, 'upper'), yellow(2)])).toEqual(['Step 2 is a second diagonal step; a pivot may take one.']);
    expect(pathProblems(yellow(0), [purple('upper')])).toEqual(['Step 1: purple(upper) does not touch A(yellow).']);
  });

  it('every window reaches every other in at most nine steps', () => {
    for (const a of ALL_WINDOWS) for (const b of ALL_WINDOWS) expect(pivotSteps(a, b)).toBeLessThanOrEqual(9);
    expect(new Set(ALL_WINDOWS.map(windowKey)).size).toBe(50);
  });
});
