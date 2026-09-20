import { describe, expect, it } from 'vitest';
import { SAMPLE_SD } from '../../data/ships/sampleSd';
import { LEVEL_ATTITUDE, blue, purple, windowDirection, yellow } from '../geometry';
import { cellsFromEdge, currentValue, destroyLeftmost, freshDamage, freshTrack, internalTrackId, remainingCount, trackSpec, withTrack } from '../ssd';
import { beginAllocation, penetrationFrom, placeShot, resolveSalvoImpact, traverseLine } from './allocation';
import { beamAttack } from './beams';
import { attemptRepair, damageControlParties, repairableBoxes } from './damageControl';
import { DIST_2D10_MINUS, DIST_2D10_PLUS, DIST_3D10_LOW, mean, probOf, seededRng } from './dice';
import { depthDist, expectHit, expectSalvo, salvoSurvivors } from './expect';
import { ecmLayerKills, resolveMissileDefense, type DefenseContext, type InboundSalvo } from './missileDefense';
import { adjustedCmKills, crewQualitySuccessChance, tacMqlModifier } from './officers';
import { activeDefenseKills, canistersPerMissile, ecmKills } from './tables';

const ship = SAMPLE_SD;

describe('dice', () => {
  it('2d10− is the difference of two d10: 10% zeros, 2% nines, mean 3.3', () => {
    expect(probOf(DIST_2D10_MINUS, 0)).toBeCloseTo(0.1, 9);
    expect(probOf(DIST_2D10_MINUS, 9)).toBeCloseTo(0.02, 9);
    expect(probOf(DIST_2D10_MINUS, 1)).toBeCloseTo(0.18, 9);
    expect(mean(DIST_2D10_MINUS)).toBeCloseTo(3.3, 9);
    expect([...DIST_2D10_MINUS.values()].reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9);
  });

  it('2d10+ is the sum of two d10 read 1–10: 2…20 with 11 the mode', () => {
    expect(Math.min(...DIST_2D10_PLUS.keys())).toBe(2);
    expect(Math.max(...DIST_2D10_PLUS.keys())).toBe(20);
    expect(probOf(DIST_2D10_PLUS, 11)).toBeCloseTo(0.1, 9);
    expect(probOf(DIST_2D10_PLUS, 2)).toBeCloseTo(0.01, 9);
  });

  it('3d10-low averages a bit under 3', () => {
    expect(mean(DIST_3D10_LOW)).toBeGreaterThan(2.9);
    expect(mean(DIST_3D10_LOW)).toBeLessThan(3.1);
  });

  it('is reproducible from a seed', () => {
    const a = seededRng(42);
    const b = seededRng(42);
    expect([a.next(), a.next(), a.next()]).toEqual([b.next(), b.next(), b.next()]);
  });
});

describe('Missile Defense Card tables (RULES.md §12)', () => {
  it('ECM layer: printed cells and the C4.126 digit rule for 63 missiles', () => {
    expect(ecmKills(1, 15)).toBe(1);
    expect(ecmKills(1, 14)).toBe(0);
    expect(ecmKills(10, 25)).toBe(9);
    expect(ecmKills(20, 13)).toBe(9);
    expect(ecmKills(100, 1)).toBe(1);
    expect(ecmKills(63, 10)).toBe(20 + 1); // row 60 col 10 = 20, row 3 col 10 = 1
    expect(ecmKills(2, 1)).toBe(0);
    expect(ecmKills(5, 30)).toBe(4); // column clamps at 25
    expect(ecmKills(3, -4)).toBe(0); // and at 1
  });

  it('Active Defense: fractional rows and off-row probable kills add up', () => {
    expect(activeDefenseKills(1 / 3, 15)).toBe(1);
    expect(activeDefenseKills(1 / 3, 14)).toBe(0);
    expect(activeDefenseKills(2, 10)).toBe(2);
    expect(activeDefenseKills(12, 19)).toBe(20 + 4); // 10 + 2
    expect(activeDefenseKills(4 + 2 / 3, 19)).toBe(8 + 1);
    expect(activeDefenseKills(30, 19)).toBe(60);
    expect(activeDefenseKills(0, 19)).toBe(0);
  });

  it('canister: 1 per small missile up to 5 per capital missile', () => {
    expect([2, 6, 10, 16, 17].map(canistersPerMissile)).toEqual([1, 2, 3, 4, 5]);
  });
});

const ctx = (over: Partial<DefenseContext> = {}): DefenseContext => ({
  ecm: 5,
  wedge: false,
  decoyShift: null,
  decoyPolicy: 'never',
  cmProbableKills: 12,
  pdProbableKills: 12,
  fconPenalty: 0,
  ...over,
});
const salvo = (missiles: number, mql = 4, contactNukes = false): InboundSalvo => ({ missiles, mql, contactNukes });

describe('missile defense pipeline', () => {
  it('a decoy always kills at least one more missile than the layer alone (C4.124)', () => {
    expect(ecmLayerKills(10, 5, null)).toBe(2);
    expect(ecmLayerKills(10, 5, 1)).toBe(3); // column 6 also gives 2, so the minimum applies
    expect(ecmLayerKills(10, 5, 10)).toBe(5); // column 15
    expect(ecmLayerKills(1, 25, 4)).toBe(1); // never more than the salvo
  });

  it('missiles hitting the wedge: +12 in the ECM layer, no countermissiles, point defense halved', () => {
    const rng = seededRng(7);
    const r = resolveMissileDefense(rng, salvo(20), ctx({ wedge: true, cmProbableKills: 12, pdProbableKills: 12 }));
    expect(r.ecm.column).toBe(Math.min(25, 4 + 12 + r.ecm.roll));
    expect(r.cm.kills).toBe(0);
    expect(r.pd.kills).toBe(Math.min(r.cm.survivors, Math.floor(activeDefenseKills(12, r.pd.column) / 2)));
  });

  it('contact nukes double point-defense kills; fire-control damage shifts the active columns left', () => {
    const a = resolveMissileDefense(seededRng(3), salvo(30, 6, true), ctx());
    expect(a.pd.kills).toBe(Math.min(a.cm.survivors, 2 * activeDefenseKills(12, a.pd.column)));
    const b = resolveMissileDefense(seededRng(3), salvo(30, 6), ctx({ fconPenalty: 3 }));
    expect(b.cm.column).toBe(Math.max(1, 6 + b.cm.roll - 3));
  });

  it('never kills more missiles than are inbound and the layers chain', () => {
    for (let s = 0; s < 200; s++) {
      const r = resolveMissileDefense(seededRng(s), salvo(7, 2), ctx({ decoyShift: 4, decoyPolicy: 'always' }));
      expect(r.ecm.kills).toBeLessThanOrEqual(7);
      expect(r.cm.survivors).toBe(r.ecm.survivors - r.cm.kills);
      expect(r.survivors).toBe(r.cm.survivors - r.pd.kills);
      expect(r.survivors).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('officers', () => {
  it('TAC changes MQL, a Poor ATO never takes CM below 1, crew checks follow 2d10−', () => {
    expect(tacMqlModifier('elite')).toBe(-2);
    expect(adjustedCmKills(1, 'poor')).toBe(1);
    expect(adjustedCmKills(5, 'veteran')).toBe(6);
    expect(crewQualitySuccessChance(5)).toBeCloseTo(0.1 + 0.18 + 0.16 + 0.14 + 0.12 + 0.1, 9);
  });
});

describe('shot placement (C5.11) on a level Sample-class ship facing A', () => {
  const dmg = freshDamage(ship);
  it('abeam hits the sidewall table; dead ahead the forward table with hammerhead armour', () => {
    const stbd = placeShot(ship, dmg, LEVEL_ATTITUDE, windowDirection(yellow(3)), 'missile')!;
    expect(stbd).toMatchObject({ edge: 'starboard', mount: 'starboard', rollShift: 0, protection: -4, sidewallUp: true, aspect: 'sidewall' });
    const bow = placeShot(ship, dmg, LEVEL_ATTITUDE, windowDirection(yellow(0)), 'missile')!;
    expect(bow).toMatchObject({ edge: 'forward', protection: 1, sidewallUp: false, aspect: 'bow' });
    const stern = placeShot(ship, dmg, LEVEL_ATTITUDE, windowDirection(blue(6, 'lower')), 'missile')!;
    expect(stern.edge).toBe('aft');
  });

  it('one window off the bow leaks around the sidewall with a −10 shift; off the stern +10', () => {
    expect(placeShot(ship, dmg, LEVEL_ATTITUDE, windowDirection(yellow(1)), 'missile')).toMatchObject({ edge: 'starboard', rollShift: -10, aspect: 'leak' });
    expect(placeShot(ship, dmg, LEVEL_ATTITUDE, windowDirection(yellow(11)), 'missile')).toMatchObject({ edge: 'port', rollShift: -10 });
    expect(placeShot(ship, dmg, LEVEL_ATTITUDE, windowDirection(yellow(7)), 'missile')).toMatchObject({ edge: 'port', rollShift: 10 });
  });

  it('the wedge stops beams and slides missiles to a facing', () => {
    expect(placeShot(ship, dmg, LEVEL_ATTITUDE, windowDirection(purple('upper')), 'beam')).toBeNull();
    expect(placeShot(ship, dmg, LEVEL_ATTITUDE, windowDirection(purple('upper')), 'missile')).not.toBeNull();
    const g = placeShot(ship, dmg, LEVEL_ATTITUDE, windowDirection({ ring: 'green', az: 4, hemi: 'upper' }), 'missile')!;
    expect(g.edge).toBe('starboard');
  });

  it('uses the exhausted sidewall value once the sidewall is gone', () => {
    const id = 'sidewall.starboard';
    const gone = withTrack(dmg, id, destroyLeftmost(trackSpec(ship, id), freshTrack(trackSpec(ship, id)), 99).state);
    const p = placeShot(ship, gone, LEVEL_ATTITUDE, windowDirection(yellow(3)), 'missile')!;
    expect(p.protection).toBe(3);
    expect(p.sidewallUp).toBe(false);
  });
});

describe('penetration (C5.21, the Star Knight example)', () => {
  it('damage 8 on scale 5 behind a −4 sidewall: roll 1 is deflected, roll 4 goes 3 deep', () => {
    const w = { kind: 'laserhead' as const, damage: 8 };
    expect(penetrationFrom(1, w, 5, -4)).toMatchObject({ penetrates: false, depth: 0, sidewallBox: false });
    expect(penetrationFrom(4, w, 5, -4)).toMatchObject({ penetrates: true, depth: 3 });
    expect(penetrationFrom(0, w, 5, -3)).toMatchObject({ penetrates: false, sidewallBox: true });
  });

  it('contact nukes halve the depth (rounding down), energy torpedoes double it, a down wedge doubles all but torpedoes', () => {
    expect(penetrationFrom(5, { kind: 'nuke', damage: 8 }, 5, -3).depth).toBe(2); // raw 5 → 2
    expect(penetrationFrom(3, { kind: 'et', damage: 7 }, 5, -2).depth).toBe(6); // raw 3 → 6
    expect(penetrationFrom(3, { kind: 'laser', damage: 7 }, 5, -2, true).depth).toBe(6);
    expect(penetrationFrom(3, { kind: 'et', damage: 7 }, 5, -2, true).depth).toBe(6);
  });
});

describe('hit location traversal (C5.23–25) on the Sample class', () => {
  it('walks a starboard column, one box per cell', () => {
    const st = beginAllocation(freshDamage(ship));
    const cells = cellsFromEdge(ship.hitLocation, 'starboard', 11)!;
    const t = traverseLine(seededRng(1), ship, st, 'starboard', cells, 3, 'test');
    expect(t.cellsHit.map((c) => c.code)).toEqual(['ET', 'L', 'sdwl']);
    expect(currentValue(trackSpec(ship, 'mount.starboard.weapon.3'), st.damage.tracks['mount.starboard.weapon.3']!)).toBe(5); // 6 → 5 torpedoes
    expect(currentValue(trackSpec(ship, 'sidewall.starboard'), st.damage.tracks['sidewall.starboard']!)).toBe(-4); // second box is also −4
    expect(remainingCount(st.damage.tracks['sidewall.starboard']!)).toBe(16);
  });

  it('entering the Core costs the Core Armor (3): a depth-4 shot from ahead stops after M and hull', () => {
    const st = beginAllocation(freshDamage(ship));
    const cells = cellsFromEdge(ship.hitLocation, 'forward', 11)!;
    const t = traverseLine(seededRng(2), ship, st, 'forward', cells, 4, 'test');
    expect(t.cellsHit.map((c) => c.code)).toEqual(['M', 'hull']);
    expect(st.effects.some((e) => e.kind === 'lost' && e.text.includes('Core Armor'))).toBe(true);
  });

  it('skips exhausted systems without spending depth, but hull cascades to SI', () => {
    let dmg = freshDamage(ship);
    const et = 'mount.starboard.weapon.3';
    dmg = withTrack(dmg, et, destroyLeftmost(trackSpec(ship, et), freshTrack(trackSpec(ship, et)), 99).state);
    const st = beginAllocation(dmg);
    const t = traverseLine(seededRng(1), ship, st, 'starboard', cellsFromEdge(ship.hitLocation, 'starboard', 11)!, 2, 'test');
    expect(t.cellsHit.map((c) => c.code)).toEqual(['L', 'sdwl']);
    expect(st.effects.some((e) => e.kind === 'skip')).toBe(true);
  });

  it('blank cells before the silhouette are passed over; a blank after entering loses the rest', () => {
    const st = beginAllocation(freshDamage(ship));
    // column 2 from starboard: blank, blank, mag, L, CM, M, PD, G, mag, blank, blank
    const t = traverseLine(seededRng(1), ship, st, 'starboard', cellsFromEdge(ship.hitLocation, 'starboard', 2)!, 9, 'test');
    expect(t.cellsHit.map((c) => c.code)).toEqual(['mag', 'L', 'CM', 'M', 'PD', 'G', 'mag']);
    expect(t.lost).toBe(2);
  });
});

describe('a salvo on the hull', () => {
  it('three 16M laser heads abeam a Sample-class SD (scale 15, sidewall −4) mostly bounce; capital-missile damage does not', () => {
    const weak = resolveSalvoImpact(seededRng(11), ship, freshDamage(ship), LEVEL_ATTITUDE, { missiles: 3, warhead: { kind: 'laserhead', damage: 16 }, impactDir: windowDirection(yellow(3)) });
    expect(weak.effects.length).toBeGreaterThan(0);
    expect(weak.destroyed).toBe(false);
    const heavy = resolveSalvoImpact(seededRng(11), ship, freshDamage(ship), LEVEL_ATTITUDE, { missiles: 3, warhead: { kind: 'laserhead', damage: 40 }, impactDir: windowDirection(yellow(3)) });
    expect(heavy.boxes).toBeGreaterThanOrEqual(3 * 10);
    expect(heavy.effects.filter((e) => e.kind === 'deflected')).toHaveLength(0);
  });

  it('a natural 0 costs a sidewall box at the end of the step', () => {
    // find a seed whose first penetration roll is a natural zero
    let seed = 0;
    for (; seed < 500; seed++) {
      const r = seededRng(seed);
      const a = Math.floor(r.next() * 10);
      const b = Math.floor(r.next() * 10);
      if (a === b) break;
    }
    const st = resolveSalvoImpact(seededRng(seed), ship, freshDamage(ship), LEVEL_ATTITUDE, { missiles: 1, warhead: { kind: 'laserhead', damage: 10 }, impactDir: windowDirection(yellow(3)) });
    expect(st.effects.some((e) => e.text.includes('natural 0'))).toBe(true);
    expect(remainingCount(st.damage.tracks['sidewall.starboard']!)).toBe(16);
  });
});

describe('beams (C3.1)', () => {
  const shooter = { cls: ship, damage: freshDamage(ship), attitude: LEVEL_ATTITUDE };
  it('a Sample SD abeam at range 2 fires its starboard lasers at 11 and grasers at 10; torpedoes need the sidewall down', () => {
    const r = beamAttack(seededRng(5), shooter, { cls: ship, damage: freshDamage(ship), attitude: LEVEL_ATTITUDE }, yellow(3), 2);
    expect(r.placement?.edge).toBe('port'); // the target, also facing A, is hit on its port side
    expect(r.shots.map((s) => `${s.weapon}@${s.damage}x${s.hits}`)).toEqual(['17/11/7/5L@11x19', '18/10/6G@10x21']);
    expect(r.state.effects.some((e) => e.text.includes('energy torpedoes cannot'))).toBe(true);
    expect(r.state.boxes).toBeGreaterThan(0);
  });

  it('beams cannot hurt a target showing its wedge', () => {
    const r = beamAttack(seededRng(5), shooter, { cls: ship, damage: freshDamage(ship), attitude: LEVEL_ATTITUDE }, purple('upper'), 1);
    expect(r.placement).toBeNull();
    expect(r.shots).toHaveLength(0);
  });

  it('a target with no sidewall on the facing is engaged at half range and torpedoes may fire', () => {
    let dmg = freshDamage(ship);
    dmg = withTrack(dmg, 'sidewall.port', destroyLeftmost(trackSpec(ship, 'sidewall.port'), freshTrack(trackSpec(ship, 'sidewall.port')), 99).state);
    const far = beamAttack(seededRng(5), shooter, { cls: ship, damage: dmg, attitude: LEVEL_ATTITUDE }, yellow(3), 3);
    // range 3 halves to 1: lasers 17, grasers 18; a 7ET has one damage value, so it reaches only to range 1
    expect(far.shots.map((s) => `${s.weapon}@${s.damage}`)).toEqual(['17/11/7/5L@17', '18/10/6G@18']);
    const near = beamAttack(seededRng(5), shooter, { cls: ship, damage: dmg, attitude: LEVEL_ATTITUDE }, yellow(3), 1);
    expect(near.shots.map((s) => `${s.weapon}@${s.damage}`)).toEqual(['7ET@7', '17/11/7/5L@17', '18/10/6G@18']);
    expect(near.shots[0]!.hits).toBeGreaterThanOrEqual(6); // 3d10-low per launcher, six launchers
  });
});

describe('damage control (RULES.md §16)', () => {
  it('counts parties, lists repairable boxes, repairs on a passed check and locks the box on a failed one', () => {
    let dmg = freshDamage(ship);
    expect(damageControlParties(ship, dmg)).toBe(21);
    const ecm = internalTrackId('ecm');
    dmg = withTrack(dmg, ecm, destroyLeftmost(trackSpec(ship, ecm), freshTrack(trackSpec(ship, ecm)), 2).state);
    dmg = withTrack(dmg, 'internals.hull', destroyLeftmost(trackSpec(ship, 'internals.hull'), freshTrack(trackSpec(ship, 'internals.hull')), 5).state);
    const list = repairableBoxes(ship, dmg);
    expect(list.map((b) => `${b.trackId}:${b.index}`)).toEqual(['internals.ecm:0', 'internals.ecm:1']);
    const ok = attemptRepair(seededRng(1), ship, dmg, { trackId: ecm, index: 0, parties: 1 }, 9, 4);
    expect(ok.result.success).toBe(true);
    expect(ok.damage.tracks[ecm]!.boxes[0]).toEqual({ status: 'ok', repairedOnTurn: 4 });
    const bad = attemptRepair(seededRng(1), ship, dmg, { trackId: ecm, index: 1, parties: 2 }, -1, 4);
    expect(bad.result.success).toBe(false);
    expect(bad.result.rolls).toHaveLength(2);
    expect(bad.damage.tracks[ecm]!.boxes[1]!.status).toBe('unrepairable');
  });
});

describe('expectation layer agrees with resolution', () => {
  it('survivor distribution matches a Monte Carlo of resolveMissileDefense', () => {
    const s = salvo(20, 5);
    const c = ctx({ decoyShift: 4, decoyPolicy: 'always', cmProbableKills: 6, pdProbableKills: 5 });
    const dist = salvoSurvivors(s, c);
    expect([...dist.values()].reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9);
    const rng = seededRng(2024);
    const N = 20000;
    let sum = 0;
    for (let i = 0; i < N; i++) sum += resolveMissileDefense(rng, s, c).survivors;
    expect(sum / N).toBeCloseTo(mean(dist), 1);
  });

  it('depth distribution matches penetrationFrom over the dice', () => {
    const d = depthDist({ kind: 'laserhead', damage: 16 }, 15, -4);
    // mod −3: natural 4..9 penetrate with depth 1..6
    expect(probOf(d, 0)).toBeCloseTo(0.1 + 0.18 + 0.16 + 0.14, 9);
    expect(probOf(d, 1)).toBeCloseTo(0.12, 9);
    expect(probOf(d, 6)).toBeCloseTo(0.02, 9);
  });

  it('expected boxes per hit are positive and bounded by the depth; capital missiles always penetrate', () => {
    const dmg = freshDamage(ship);
    const p = placeShot(ship, dmg, LEVEL_ATTITUDE, windowDirection(yellow(3)), 'missile')!;
    const weak = expectHit(ship, dmg, p, { kind: 'laserhead', damage: 16 });
    expect(weak.pPenetrate).toBeCloseTo(1 - (0.1 + 0.18 + 0.16 + 0.14), 9);
    expect(weak.boxes).toBeGreaterThan(0);
    expect(weak.boxes).toBeLessThan(mean(depthDist({ kind: 'laserhead', damage: 16 }, 15, -4)) + 0.01);
    const heavy = expectHit(ship, dmg, p, { kind: 'laserhead', damage: 40 });
    expect(heavy.pPenetrate).toBe(1);
    expect(heavy.boxes).toBeGreaterThan(weak.boxes);
    const e = expectSalvo(salvo(32, 4), ctx({ cmProbableKills: 12, pdProbableKills: 12 }), { cls: ship, damage: dmg, attitude: LEVEL_ATTITUDE }, { kind: 'laserhead', damage: 16 }, windowDirection(yellow(3)));
    expect(e.expectedSurvivors).toBeGreaterThan(0);
    expect(e.expectedBoxes).toBeCloseTo(e.expectedSurvivors * weak.boxes, 9);
  });

  it('Monte Carlo of the full salvo tracks the expected box count', () => {
    const dmg = freshDamage(ship);
    const w = { kind: 'laserhead' as const, damage: 30 };
    const dir = windowDirection(yellow(3));
    const p = placeShot(ship, dmg, LEVEL_ATTITUDE, dir, 'missile')!;
    const perHit = expectHit(ship, dmg, p, w);
    const rng = seededRng(99);
    const N = 400;
    let boxes = 0;
    for (let i = 0; i < N; i++) boxes += resolveSalvoImpact(rng, ship, dmg, LEVEL_ATTITUDE, { missiles: 1, warhead: w, impactDir: dir }).boxes;
    // one missile at a time from a fresh state, so within-salvo depletion does not apply; hull hits add 2d10− boxes the expectation counts as one cell
    expect(boxes / N).toBeGreaterThan(perHit.boxes * 0.9);
  });
});
