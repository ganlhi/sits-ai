import { describe, expect, it } from 'vitest';
import { SAMPLE_SD } from '../../data/ships/sampleSd';
import { draftFromShip, parseWeaponLine, shipFromDraft } from './draft';

describe('editor draft', () => {
  it('round-trips the Sample class through the text form without loss', () => {
    const d = draftFromShip(SAMPLE_SD);
    const r = shipFromDraft(d);
    expect(r.errors).toEqual([]);
    expect(r.ship).toEqual(SAMPLE_SD);
  });

  it('writes countdown tracks as !N and reads them back', () => {
    const d = draftFromShip(SAMPLE_SD);
    expect(d.mounts.port.weapons.split('\n')[0]).toBe('16M | !32');
    const w = parseWeaponLine('19/12/8/5L | !6');
    expect(w.type).toBe('L');
    expect(w.damage).toEqual([19, 12, 8, 5]);
    expect(w.track.boxes.map((b) => b.value)).toEqual([6, 5, 4, 3, 2, 1]);
    expect(parseWeaponLine('CM | 6 5 5 4 4 3 2 2 1 2/3').type).toBe('CM');
    expect(() => parseWeaponLine('CM 6 5 4')).toThrow();
    expect(() => parseWeaponLine('12CM | 1 2')).toThrow();
  });

  it('reports problems against their fields and never throws', () => {
    const d = draftFromShip(SAMPLE_SD);
    d.internals.ecm = '5 4 x';
    d.mounts.port.arc.equator = 'BBB';
    d.rangeBands = 'nonsense';
    d.baseCost = 'lots';
    const r = shipFromDraft(d);
    expect(r.ship).toBeUndefined();
    const fields = r.errors.map((e) => e.field);
    expect(fields).toContain('internals.ecm');
    expect(fields).toContain('mounts.port.arc.equator');
    expect(fields).toContain('rangeBands');
    expect(fields).toContain('baseCost');
  });
});
