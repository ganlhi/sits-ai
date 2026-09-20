import { describe, expect, it } from 'vitest';
import { LEVEL_ATTITUDE, mountArcColour, windowDirection, yellow, blue, purple } from '../../domain/geometry';
import { allCells, cellsFromEdge, currentValue, freshDamage, totalBoxes, trackSpec, validateShipClass } from '../../domain/ssd';
import { draftFromShip, shipFromDraft } from '../../ui/ssd/draft';
import { BUILT_IN_SHIPS, HAVOC_DD, SULTAN_BC, WARRIOR_CA } from './index';
import { standardArcs } from './arcs';

describe('built-in ship classes', () => {
  it('all validate, round-trip through JSON and the editor text form, and have distinct ids', () => {
    const ids = new Set<string>();
    for (const s of BUILT_IN_SHIPS) {
      const r = validateShipClass(JSON.parse(JSON.stringify(s)) as unknown);
      expect(r.ok, `${s.className}: ${r.ok ? '' : r.errors.join('; ')}`).toBe(true);
      const d = shipFromDraft(draftFromShip(s));
      expect(d.errors, s.className).toEqual([]);
      expect(d.ship).toEqual(s);
      expect(ids.has(s.id)).toBe(false);
      ids.add(s.id);
    }
  });

  it('standard arcs: every mount bears ±60° on the equator and blue rows, hammerheads white dead ahead', () => {
    const arcs = standardArcs();
    const c = (m: 'forward' | 'aft' | 'port' | 'starboard', w: Parameters<typeof windowDirection>[0]) => mountArcColour(arcs, m, LEVEL_ATTITUDE, windowDirection(w));
    expect(c('forward', yellow(0))).toBe('white');
    expect(c('forward', yellow(2))).toBe('grey');
    expect(c('forward', yellow(3))).toBe('black');
    expect(c('starboard', yellow(3))).toBe('grey');
    expect(c('starboard', yellow(1))).toBe('grey');
    expect(c('starboard', yellow(0))).toBe('black');
    expect(c('starboard', blue(3, 'lower'))).toBe('grey');
    expect(c('starboard', purple('upper'))).toBe('black');
    expect(c('port', yellow(9))).toBe('grey');
    expect(c('aft', yellow(6))).toBe('white');
  });

  it('Sultan BC: ratings and counts as printed', () => {
    const d = freshDamage(SULTAN_BC);
    const r = (id: string) => currentValue(trackSpec(SULTAN_BC, id), d.tracks[id]!);
    expect(SULTAN_BC.hitLocation.scale).toBe(8);
    expect(SULTAN_BC.hitLocation.coreArmor).toBe(2);
    expect(r('internals.maxThrust')).toBe(3);
    expect(r('internals.pivot')).toBe(3);
    expect(r('internals.roll')).toBe(4);
    expect(r('internals.ecm')).toBe(2);
    expect(r('sidewall.port')).toBe(-3);
    expect(r('mount.port.weapon.0')).toBe(18);
    expect(r('mount.forward.weapon.0')).toBe(5);
    expect(SULTAN_BC.internals.hull.boxes).toHaveLength(33);
    expect(SULTAN_BC.internals.hull.boxes.filter((b) => b.mark === 'wrench')).toHaveLength(10);
    expect(SULTAN_BC.internals.structuralIntegrity.boxes).toHaveLength(14);
    expect(SULTAN_BC.internals.maxThrust.boxes).toHaveLength(16);
    expect(cellsFromEdge(SULTAN_BC.hitLocation, 'forward', 11)!.map((c) => c.code).slice(0, 5)).toEqual(['PD', 'hull', '2fwd', 'SI', 'com']);
    expect(allCells(SULTAN_BC.hitLocation).filter((c) => c.code === 'flg')).toHaveLength(2);
    expect(totalBoxes(SULTAN_BC)).toBeGreaterThan(150);
  });

  it('Warrior CA: graser cruiser with no flag bridge', () => {
    const d = freshDamage(WARRIOR_CA);
    const r = (id: string) => currentValue(trackSpec(WARRIOR_CA, id), d.tracks[id]!);
    expect(WARRIOR_CA.hitLocation.scale).toBe(4);
    expect(r('internals.pivot')).toBe(5);
    expect(r('internals.maxThrust')).toBe(3);
    expect(r('sidewall.starboard')).toBe(-2);
    expect(WARRIOR_CA.sidewalls.port.boxes).toHaveLength(3);
    expect(WARRIOR_CA.internals.flagBridge.boxes).toHaveLength(0);
    expect(allCells(WARRIOR_CA.hitLocation).filter((c) => c.code === 'flg')).toHaveLength(0);
    expect(allCells(WARRIOR_CA.hitLocation).filter((c) => c.code === 'brg')).toHaveLength(6);
    expect(WARRIOR_CA.mounts.port.weapons.map((w) => w.label)).toEqual(['7M', '8/5G', 'CM', 'PD']);
    expect(WARRIOR_CA.internals.structuralIntegrity.boxes[0]?.mark).toBe('C');
    expect(WARRIOR_CA.internals.hull.boxes).toHaveLength(17);
  });

  it('Havoc DD: small, fast, one ECM box', () => {
    const d = freshDamage(HAVOC_DD);
    const r = (id: string) => currentValue(trackSpec(HAVOC_DD, id), d.tracks[id]!);
    expect(HAVOC_DD.hitLocation.scale).toBe(3);
    expect(r('internals.pivot')).toBe(6);
    expect(r('internals.ecm')).toBe(1);
    expect(r('sidewall.port')).toBe(-3);
    expect(HAVOC_DD.internals.structuralIntegrity.boxes).toHaveLength(7);
    expect(HAVOC_DD.internals.structuralIntegrity.boxes[0]).toMatchObject({ shape: 'octagon', value: 5 });
    expect(HAVOC_DD.internals.hull.boxes).toHaveLength(10);
    expect(HAVOC_DD.mounts.port.magazine).toBe(22);
    expect(cellsFromEdge(HAVOC_DD.hitLocation, 'starboard', 9)!.map((c) => c.code)).toEqual(['M', 'PD', 'sdwl', 'hull', 'hull', 'CIC', 'hull', 'hull', 'sdwl', 'PD', 'M']);
  });
});
