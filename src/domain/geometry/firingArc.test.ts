import { describe, expect, it } from 'vitest';
import { LEVEL_ATTITUDE, attitude, roll } from './attitude';
import { blue, green, purple, windowDirection, yellow, type AvidWindow } from './avid';
import { MOUNTS, bodyWindow, mountArcColour, nearestFacing, wedgeCovers } from './firingArc';
import { fromAzPitch } from './vec3';
import { SAMPLE_SD } from '../../data/ships/sampleSd';

const SAMPLE_ARCS = { forward: SAMPLE_SD.mounts.forward.arc, aft: SAMPLE_SD.mounts.aft.arc, port: SAMPLE_SD.mounts.port.arc, starboard: SAMPLE_SD.mounts.starboard.arc };

const colours = (a = LEVEL_ATTITUDE, w: AvidWindow) =>
  Object.fromEntries(MOUNTS.map((m) => [m, mountArcColour(SAMPLE_ARCS, m, a, windowDirection(w))]));

describe('ship-frame windows (C1.22 as a change of coordinates)', () => {
  it('a level ship facing A sees B/C(yellow) on its starboard equator and purple at its top', () => {
    expect(bodyWindow(LEVEL_ATTITUDE, windowDirection(yellow(3)))).toMatchObject({ row: 'equator', lon: 3 });
    expect(bodyWindow(LEVEL_ATTITUDE, windowDirection(yellow(9)))).toMatchObject({ row: 'equator', lon: 9 });
    expect(bodyWindow(LEVEL_ATTITUDE, windowDirection(purple('upper')))).toMatchObject({ row: 'top' });
    expect(bodyWindow(LEVEL_ATTITUDE, windowDirection(blue(0, 'upper')))).toMatchObject({ row: 'blueUpper', lon: 0 });
  });

  it('rolling the ship rotates the frame: after 3 windows to starboard, a target abeam to starboard is now over the top', () => {
    const a = roll(LEVEL_ATTITUDE, 3, 'starboard');
    expect(bodyWindow(a, windowDirection(yellow(3))).row).toBe('top');
    expect(bodyWindow(a, windowDirection(yellow(9))).row).toBe('bottom');
    expect(bodyWindow(a, windowDirection(purple('upper'))).lon).toBe(9); // map-up is now the port side
  });

  it('the C1.22 worked case: Top in D(green, upper), target in B/C(blue, upper) lies two rows below Top, one window from Starboard', () => {
    // nose up 30° facing A, top towards D
    const a = attitude(fromAzPitch(0, 30), fromAzPitch(180, 60));
    const bw = bodyWindow(a, windowDirection(blue(3, 'upper')));
    expect(bw.row).toBe('blueUpper'); // two rows down from the top cap
    expect(Math.abs(bw.lon - 3)).toBe(1); // one window from the Starboard marker (lon 3)
  });
});

describe('Sample-class firing arcs', () => {
  it('a target dead ahead is white for the forward hammerhead and black for every other mount', () => {
    expect(colours(LEVEL_ATTITUDE, yellow(0))).toEqual({ forward: 'white', aft: 'black', port: 'black', starboard: 'black' });
  });

  it('a target abeam to starboard is grey for the starboard broadside only', () => {
    expect(colours(LEVEL_ATTITUDE, yellow(3))).toEqual({ forward: 'black', aft: 'black', port: 'black', starboard: 'grey' });
    expect(colours(LEVEL_ATTITUDE, blue(3, 'lower')).starboard).toBe('grey');
  });

  it('a target 30° off the bow is covered by both the forward hammerhead and the starboard broadside, from behind the sidewall', () => {
    expect(colours(LEVEL_ATTITUDE, yellow(1))).toEqual({ forward: 'grey', aft: 'black', port: 'black', starboard: 'grey' });
    expect(colours(LEVEL_ATTITUDE, yellow(2))).toEqual({ forward: 'grey', aft: 'black', port: 'black', starboard: 'grey' });
  });

  it('nothing bears on a target straight up or in the green ring — the wedge is in the way', () => {
    expect(Object.values(colours(LEVEL_ATTITUDE, purple('upper'))).every((c) => c === 'black')).toBe(true);
    expect(Object.values(colours(LEVEL_ATTITUDE, green(2, 'lower'))).every((c) => c === 'black')).toBe(true);
    expect(wedgeCovers(LEVEL_ATTITUDE, windowDirection(purple('upper')))).toBe(true);
    expect(wedgeCovers(LEVEL_ATTITUDE, windowDirection(green(2, 'lower')))).toBe(true);
    expect(wedgeCovers(LEVEL_ATTITUDE, windowDirection(blue(3, 'upper')))).toBe(false);
  });

  it('after a 3-window starboard roll the wedge faces the old starboard bearing and the port broadside faces the zenith', () => {
    const a = roll(LEVEL_ATTITUDE, 3, 'starboard');
    expect(wedgeCovers(a, windowDirection(yellow(3)))).toBe(true);
    expect(colours(a, yellow(3)).starboard).toBe('black');
    expect(colours(a, purple('upper')).port).toBe('grey');
    expect(colours(a, purple('lower')).starboard).toBe('grey');
  });
});

describe('nearest facing (C5.11)', () => {
  it('names the facing a bearing is closest to and reports ties', () => {
    expect(nearestFacing(LEVEL_ATTITUDE, windowDirection(yellow(0))).facing).toBe('forward');
    expect(nearestFacing(LEVEL_ATTITUDE, windowDirection(yellow(9))).facing).toBe('port');
    expect(nearestFacing(LEVEL_ATTITUDE, windowDirection(purple('lower'))).facing).toBe('bottom');
    const corner = nearestFacing(LEVEL_ATTITUDE, fromAzPitch(45, 0));
    expect(['forward', 'starboard']).toContain(corner.facing);
    expect(corner.ties).toHaveLength(1);
  });
});
