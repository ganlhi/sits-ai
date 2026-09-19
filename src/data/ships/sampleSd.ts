/**
 * The Sample-class superdreadnought of the Generic Space Navy — the SSD the core rulebook uses
 * to explain the game (A2.6, PDF pp.13–14; hit location table again on p.45).
 *
 * Transcribed from the rendered page images, 2026-09-19. Everything here is legible in the scan
 * except the items marked [verify]. This is the app's test fixture and reference ship; real
 * classes come from Ship Book 1 (RULES.md §23).
 */
import { buildArc, type ArcDiagram, type Mount } from '../../domain/geometry';
import { parseHitLocationText, parseTrack, type MountSpec, type ShipClass, type WeaponSpec } from '../../domain/ssd';

// Firing arcs (PDF p.13 small diagrams, p.38 enlarged Port Broadside).
// [verify] the greyscale scan: the arc *shapes* are unambiguous; grey vs white was told apart
// by luminance (hammerhead centre column ≈240, both 3×3 blocks ≈220, broadside equator ±60° ≈180).
const broadsideArc = (m: Mount): ArcDiagram =>
  buildArc(m, {
    equator: { [-2]: 'white', [-1]: 'grey', 0: 'grey', 1: 'grey', 2: 'white' },
    blue: { [-1]: 'grey', 0: 'grey', 1: 'grey' },
  });
const hammerheadArc = (m: Mount): ArcDiagram =>
  buildArc(m, {
    equator: { [-1]: 'grey', 0: 'white', 1: 'grey' },
    blue: { [-1]: 'grey', 0: 'white', 1: 'grey' },
  });

const countdown = (n: number): string => Array.from({ length: n }, (_, i) => `${n - i}`).join(' ');

const weapon = (type: WeaponSpec['type'], label: string, damage: number[], track: string): WeaponSpec => ({ type, label, damage, track: parseTrack(track) });

const hammerhead = (id: 'forward' | 'aft', name: string): MountSpec => ({
  id,
  name,
  fcon: parseTrack('0 0 1 3 | 4'),
  magazine: 48, // 8 × 6 dots
  weapons: [
    weapon('M', '16M', [16], countdown(8)),
    weapon('L', '19/12/8/5L', [19, 12, 8, 5], countdown(6)),
    weapon('G', '20/11/6G', [20, 11, 6], countdown(4)),
    weapon('CM', 'CM', [], '6 5 5 4 4 3 2 2 1 2/3'),
    weapon('PD', 'PD', [], '5 5 4 4 3 3 2 2 1 2/3'),
  ],
  decoys: null,
  gravLance: false,
  arc: hammerheadArc(id),
});

const broadside = (id: 'port' | 'starboard', name: string): MountSpec => ({
  id,
  name,
  fcon: parseTrack('0 0 1 1 2 2 3 | 3'),
  magazine: 120, // 10 × 12 dots
  weapons: [
    weapon('M', '16M', [16], countdown(32)),
    weapon('L', '17/11/7/5L', [17, 11, 7, 5], countdown(19)),
    weapon('G', '18/10/6G', [18, 10, 6], countdown(21)),
    weapon('ET', '7ET', [7], countdown(6)),
    weapon('CM', 'CM', [], '12 12 12 11 11 10 10 9 9 8 8 7 7 6 6 5 5 4 4 3 3 2 2 1 1 1/3'),
    weapon('PD', 'PD', [], '12 11 11 11 10 10 9 9 8 8 8 7 7 6 6 5 5 5 4 4 3 3 3 2 2 1 1 1/3'),
  ],
  decoys: parseTrack('+4*10'),
  gravLance: true,
  arc: broadsideArc(id),
});

const SIDEWALL = '-4 -4 -3 -3 -2 -2 -1 -1 -1 0 0 1 1 1 2 2 3 | 3';

// Hit Location Table, PDF p.14 / p.45. Rows 2-3 … 19-20, columns 2 … 20. `*x*` marks the Core.
const HIT_LOCATION = `
.    fcon .    .    .    .    G    M    M    ET   G    M    L    .    .    .    .    fcon .
.    hull .    .    dcy  fcon sdwl PD   CM   L    PD   PD   CM   fcon dcy  .    .    hull .
mag  mag  fwd  fwd  hull ECM  mag  mag  mag  sdwl mag  mag  mag  ECM  hull aft  aft  mag  mag
L    hull hull hull fwd  hull mag  hull hull hull hull hull mag  hull aft  hull hull hull L
CM   hull piv  rol  *SI* *hull* *brg* *hull* *SI* *hull* *SI* *hull* *brg* *hull* *SI* rol  piv  hull CM
M    hull *2fwd* *SI* *com* *lif* *SI* *CIC* *flg* *hyp* *flg* *CIC* *SI* *lif* *com* *SI* *2aft* hull M
PD   hull piv  rol  *SI* *hull* *brg* *hull* *SI* *hull* *SI* *hull* *brg* *hull* *SI* rol  piv  hull PD
G    hull hull hull fwd  hull mag  hull hull hull hull hull mag  hull aft  hull hull hull G
mag  mag  fwd  fwd  hull ECM  mag  mag  mag  sdwl mag  mag  mag  ECM  hull aft  aft  mag  mag
.    hull .    .    dcy  fcon sdwl PD   CM   L    PD   PD   CM   fcon dcy  .    .    hull .
.    fcon .    .    .    .    G    M    M    ET   G    M    L    .    .    .    .    fcon .
`;

export const SAMPLE_SD: ShipClass = {
  id: 'gsn-sample-sd',
  nationality: 'Generic Space Navy',
  className: 'Sample',
  hullType: 'SD',
  introduced: null,
  crew: { officers: 440, enlisted: 3963, marines: 500 },
  smallCraft: '12 cutters, 16 pinnaces, 2 assault shuttles',
  reconDrones: 24,
  baseCost: 4434,
  printedBoxCount: 774,
  officerCosts: {
    TAC: { poor: -122, average: 0, veteran: 122, elite: 245 },
    EWO: { poor: -45, average: 0, veteran: 45, elite: 90 },
    ATO: { poor: -24, average: 0, veteran: 32, elite: 61 },
    HELM: { poor: -6, average: 0, veteran: 2, elite: 8 },
    ENG: { poor: -8, average: 0, veteran: 8, elite: 23 },
    CREW: { poor: -88, average: 0, veteran: 66, elite: 133 },
  },
  crewQualityTarget: { poor: 2, average: 5, veteran: 7, elite: 9 },
  rangeBands: [
    { maxRange: 1, baseMql: 4, salvoes: ['early', 'middle', 'late'] },
    { maxRange: 4, baseMql: 2, salvoes: ['early', 'middle', 'late'] },
    { maxRange: 7, baseMql: 3, salvoes: ['early', 'middle', 'late'] },
    { maxRange: 11, baseMql: 4, salvoes: ['middle', 'late'] },
    { maxRange: 15, baseMql: 5, salvoes: ['middle', 'late'] },
    { maxRange: 20, baseMql: 6, salvoes: ['middle', 'late'] },
    { maxRange: 25, baseMql: 7, salvoes: ['late'] },
    { maxRange: 29, baseMql: 8, salvoes: ['late'] },
  ],
  mounts: {
    forward: hammerhead('forward', 'Forward Hammerhead'),
    aft: hammerhead('aft', 'Aft Hammerhead'),
    port: broadside('port', 'Port Broadside'),
    starboard: broadside('starboard', 'Starboard Broadside'),
  },
  internals: {
    bridge: parseTrack('_ _ _ _ (0) (-1) | -2'),
    flagBridge: parseTrack('+7 +6 +5 +4 +3 +2 +1'),
    lifeSupport: parseTrack('_*5'),
    communications: parseTrack('_*5'),
    ecm: parseTrack('5 4 4 3 3 2 1 1 0'),
    pivot: parseTrack('3 3 2 2 2 1'),
    evolutionDelays: [4, 4, 6, 6, 6, 12],
    roll: parseTrack('4 3 3 2 2 1'),
    forwardImpeller: parseTrack('_*8 (W)'),
    aftImpeller: parseTrack('_*8 (W)'),
    maxThrust: parseTrack('2*9 1 1*5 (1)*3'),
    hyperGenerator: parseTrack('_*3'),
    // 5 rows of 10 with wrenches in columns 5 and 10, 5 rows of 9 with wrenches in 4 and 9, one row of 4 with a wrench in 4
    hull: parseTrack([...Array<string>(5).fill('_ _ _ _ # _ _ _ _ #'), ...Array<string>(5).fill('_ _ _ # _ _ _ _ #'), '_ _ _ #'].join(' ')),
    hullRowLengths: [10, 10, 10, 10, 10, 9, 9, 9, 9, 9, 4],
    structuralIntegrity: parseTrack('_*6 (C) _ _ (C) _ [4] _ [5] _ _ [6] _ [7] _ [8] _ _ [9] _ [10] *'),
  },
  sidewalls: { port: parseTrack(SIDEWALL), starboard: parseTrack(SIDEWALL) },
  hammerheadArmor: { forward: 1, aft: 1 },
  bowWall: null,
  sternWall: null,
  hitLocation: parseHitLocationText(HIT_LOCATION, 15, 3),
  notes: [
    'Transcribed from the SITS 2.0 core rulebook scan (PDF pp.13–14, 45).',
    '[verify] firing-arc grey/white assignment (greyscale scan); the arc shapes are certain.',
    '[verify] printed "Hull Boxes: 774" does not match any obvious count of the transcribed boxes; the app uses the actual box count.',
    'Magazine dots counted as 8×6 (hammerheads) and 10×12 (broadsides).',
  ].join('\n'),
};
