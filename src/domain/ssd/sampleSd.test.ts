import { describe, expect, it } from 'vitest';
import { SAMPLE_SD } from '../../data/ships/sampleSd';
import { LEVEL_ATTITUDE, mountArcColour, windowDirection, yellow } from '../geometry';
import { allCells, cellsFromEdge, formatHitLocationText, parseHitLocationText } from './hitLocation';
import { allTracks, destroyedBoxes, freshDamage, rangeBandFor, totalBoxes, trackSpec, withTrack } from './shipClass';
import { currentValue, destroyLeftmost, freshTrack } from './track';
import { validateShipClass } from './validate';

describe('the Sample-class fixture', () => {
  it('validates and survives a JSON round trip unchanged', () => {
    const json = JSON.parse(JSON.stringify(SAMPLE_SD)) as unknown;
    const r = validateShipClass(json);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toEqual(SAMPLE_SD);
  });

  it('has the ratings the rulebook quotes for it', () => {
    const d = freshDamage(SAMPLE_SD);
    const rating = (id: string) => currentValue(trackSpec(SAMPLE_SD, id), d.tracks[id]!);
    expect(rating('internals.ecm')).toBe(5);
    expect(rating('internals.pivot')).toBe(3);
    expect(rating('internals.roll')).toBe(4);
    expect(rating('internals.maxThrust')).toBe(2);
    expect(rating('sidewall.port')).toBe(-4);
    expect(SAMPLE_SD.sidewalls.port.exhaustedValue).toBe(3);
    expect(rating('mount.port.fcon')).toBe(0);
    expect(rating('mount.port.weapon.0')).toBe(32); // 32 missile tubes
    expect(rating('mount.forward.weapon.0')).toBe(8);
    expect(SAMPLE_SD.hitLocation.scale).toBe(15);
    expect(SAMPLE_SD.hitLocation.coreArmor).toBe(3);
    expect(SAMPLE_SD.internals.evolutionDelays).toEqual([4, 4, 6, 6, 6, 12]);
  });

  it('has the range bands of A2.66', () => {
    expect(rangeBandFor(SAMPLE_SD, 0)?.baseMql).toBe(4);
    expect(rangeBandFor(SAMPLE_SD, 3)?.baseMql).toBe(2);
    expect(rangeBandFor(SAMPLE_SD, 9)?.salvoes).toEqual(['middle', 'late']);
    expect(rangeBandFor(SAMPLE_SD, 22)?.salvoes).toEqual(['late']);
    expect(rangeBandFor(SAMPLE_SD, 30)).toBeNull();
  });

  it('counts its boxes and its damage-control parties', () => {
    expect(SAMPLE_SD.internals.hull.boxes).toHaveLength(99);
    expect(SAMPLE_SD.internals.hull.boxes.filter((b) => b.mark === 'wrench')).toHaveLength(21);
    expect(SAMPLE_SD.internals.structuralIntegrity.boxes).toHaveLength(27);
    expect(SAMPLE_SD.internals.maxThrust.boxes).toHaveLength(18);
    expect(allTracks(SAMPLE_SD).length).toBeGreaterThan(30);
    expect(totalBoxes(SAMPLE_SD)).toBeGreaterThan(600);
  });

  it('hit location table: symmetric fore/aft and top/bottom, hyper generator dead centre, Core as drawn', () => {
    const h = SAMPLE_SD.hitLocation;
    expect(h.rows).toHaveLength(11);
    expect(h.columns).toHaveLength(19);
    const centreRow = 5; // "11"
    const centreCol = h.columns.indexOf(11);
    expect(h.cells[centreRow]?.[centreCol]).toBe('hyp');
    expect(h.core[centreRow]?.[centreCol]).toBe(true);
    // top/bottom mirror of the interior; the edge columns list one of each hammerhead system instead
    for (let r = 0; r < 11; r++) expect(h.cells[r]?.slice(1, 18)).toEqual(h.cells[10 - r]?.slice(1, 18));
    expect(h.cells.map((row) => row[0])).toEqual([null, null, 'mag', 'L', 'CM', 'M', 'PD', 'G', 'mag', null, null]);
    // the broadside weapon rows are not fore/aft symmetric on the card (G M M ET G M L), but the
    // impellers are: fwd cells mirror aft cells
    const swap = (c: string | null) => (c === 'fwd' ? 'aft' : c === '2fwd' ? '2aft' : null);
    for (const row of h.cells) for (let c = 0; c < 19; c++) {
      const s = swap(row[c] ?? null);
      if (s) expect(row[18 - c]).toBe(s);
    }
    expect(allCells(h).filter((c) => c.code === 'fwd')).toHaveLength(allCells(h).filter((c) => c.code === 'aft').length);
    // the Core: rows 9-10 and 12-13 from column 6 to 16, row 11 from 4 to 18
    expect(h.core[4]?.map((b) => (b ? 1 : 0)).join('')).toBe('0000111111111110000');
    expect(h.core[5]?.map((b) => (b ? 1 : 0)).join('')).toBe('0011111111111111100');
    expect(h.core[0]?.some(Boolean)).toBe(false);
    expect(allCells(h).filter((c) => c.code === 'SI')).toHaveLength(12);
    expect(allCells(h).filter((c) => c.code === 'CIC')).toHaveLength(2);
  });

  it('hit location text round-trips', () => {
    const h = SAMPLE_SD.hitLocation;
    expect(parseHitLocationText(formatHitLocationText(h), h.scale, h.coreArmor)).toEqual(h);
  });

  it('reads damage lines from each edge in the right order', () => {
    const h = SAMPLE_SD.hitLocation;
    const fromStarboard = cellsFromEdge(h, 'starboard', 11)!;
    expect(fromStarboard.map((c) => c.code)).toEqual(['ET', 'L', 'sdwl', 'hull', 'hull', 'hyp', 'hull', 'hull', 'sdwl', 'L', 'ET']);
    const fromPort = cellsFromEdge(h, 'port', 2)!;
    expect(fromPort[0]?.code).toBeNull(); // column 2 is blank at rows 19-20 … the silhouette narrows
    expect(fromPort.map((c) => c.code).filter(Boolean)).toEqual(['mag', 'G', 'PD', 'M', 'CM', 'L', 'mag']);
    const fromForward = cellsFromEdge(h, 'forward', 11)!;
    expect(fromForward.slice(0, 4).map((c) => c.code)).toEqual(['M', 'hull', '2fwd', 'SI']);
    const fromAft = cellsFromEdge(h, 'aft', 11)!;
    expect(fromAft.slice(0, 4).map((c) => c.code)).toEqual(['M', 'hull', '2aft', 'SI']);
    expect(cellsFromEdge(h, 'starboard', 1)).toBeNull();
  });

  it('its firing arcs are the ones the geometry tests use', () => {
    const arcs = { forward: SAMPLE_SD.mounts.forward.arc, aft: SAMPLE_SD.mounts.aft.arc, port: SAMPLE_SD.mounts.port.arc, starboard: SAMPLE_SD.mounts.starboard.arc };
    expect(mountArcColour(arcs, 'forward', LEVEL_ATTITUDE, windowDirection(yellow(0)))).toBe('white');
    expect(mountArcColour(arcs, 'starboard', LEVEL_ATTITUDE, windowDirection(yellow(3)))).toBe('grey');
    expect(mountArcColour(arcs, 'port', LEVEL_ATTITUDE, windowDirection(yellow(3)))).toBe('black');
  });

  it('damage state: destroying boxes shows in the victory-point count', () => {
    let d = freshDamage(SAMPLE_SD);
    expect(destroyedBoxes(SAMPLE_SD, d)).toBe(0);
    expect(d.magazines.port).toBe(120);
    const id = 'mount.port.weapon.0';
    d = withTrack(d, id, destroyLeftmost(trackSpec(SAMPLE_SD, id), freshTrack(trackSpec(SAMPLE_SD, id)), 5).state);
    expect(destroyedBoxes(SAMPLE_SD, d)).toBe(5);
    expect(currentValue(trackSpec(SAMPLE_SD, id), d.tracks[id]!)).toBe(27);
  });

  it('the validator reports paths for broken input', () => {
    const broken = JSON.parse(JSON.stringify(SAMPLE_SD)) as { internals: { ecm: { boxes: unknown[] } }; hitLocation: { cells: (string | null)[][] }; rangeBands: { maxRange: number }[] };
    broken.internals.ecm.boxes = [];
    broken.hitLocation.cells[0]![0] = 'warp';
    broken.rangeBands[1]!.maxRange = 0;
    const r = validateShipClass(broken);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => e.startsWith('internals.ecm.boxes'))).toBe(true);
      expect(r.errors.some((e) => e.startsWith('hitLocation.cells[0][0]'))).toBe(true);
      expect(r.errors.some((e) => e.includes('bands must ascend'))).toBe(true);
    }
  });
});
