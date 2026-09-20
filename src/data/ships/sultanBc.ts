/**
 * Sultan-class battlecruiser, People's Navy — SITS2 Ship Book 1 card "PN BC Sultan v214"
 * (SITS2-SB1 PN BC Sultan 110207.pdf, page 2). Transcribed from the vector PDF, 2026-09-20.
 */
import { parseHitLocationText, parseTrack, type MountSpec, type ShipClass, type WeaponSpec } from '../../domain/ssd';
import { standardArcs } from './arcs';

const arcs = standardArcs();
const countdown = (n: number): string => Array.from({ length: n }, (_, i) => `${n - i}`).join(' ');
const weapon = (type: WeaponSpec['type'], label: string, damage: number[], track: string): WeaponSpec => ({ type, label, damage, track: parseTrack(track) });

const hammerhead = (id: 'forward' | 'aft', name: string): MountSpec => ({
  id,
  name,
  fcon: parseTrack('0 1 2 | 3'),
  magazine: 20, // 12 + 8 dots
  weapons: [
    weapon('M', '8M', [8], countdown(5)),
    weapon('L', '11/7/5L', [11, 7, 5], countdown(2)),
    weapon('CM', 'CM', [], '2 2 1 1 2/3 1/3'),
    weapon('PD', 'PD', [], '2 2 2 1 2/3 1/3'),
  ],
  decoys: null,
  gravLance: false,
  arc: arcs[id],
});

const broadside = (id: 'port' | 'starboard', name: string): MountSpec => ({
  id,
  name,
  fcon: parseTrack('0 1 1 2 | 2'),
  magazine: 60, // 12 × 5 dots
  weapons: [
    weapon('M', '8M', [8], countdown(18)),
    weapon('L', '10/7/5L', [10, 7, 5], countdown(6)),
    weapon('G', '10/6G', [10, 6], countdown(6)),
    weapon('CM', 'CM', [], '4 4 3 3 3 3 2 2 2 1 1 1 2/3 1/3'),
    weapon('PD', 'PD', [], '4 4 4 3 3 3 2 2 1 1 2/3 1/3'),
  ],
  decoys: parseTrack('+2*5'),
  gravLance: false,
  arc: arcs[id],
});

const SIDEWALL = '-3 -2 -1 0 +1 +1 +2 | 3';

const HIT_LOCATION = `
.    fcon .    .    .    .    CM   PD   CM   PD   CM   PD   L    .    .    .    .    fcon .
.    hull .    .    dcy  fcon mag  M    M    G    M    M    sdwl fcon dcy  .    .    hull .
M    mag  fwd  fwd  hull ECM  hull mag  mag  mag  hull mag  hull ECM  hull aft  aft  mag  M
CM   hull hull hull fwd  hull hull hull hull hull hull hull hull hull aft  hull hull hull CM
L    hull piv  rol  *SI* *hull* *brg* *hull* *SI* *hull* *SI* *hull* *brg* *hull* *SI* rol  piv  hull L
PD   hull *2fwd* *SI* *com* *lif* *SI* *CIC* *flg* *hyp* *flg* *CIC* *SI* *lif* *com* *SI* *2aft* hull PD
CM   hull piv  rol  *SI* *hull* *brg* *hull* *SI* *hull* *SI* *hull* *brg* *hull* *SI* rol  piv  hull CM
PD   hull hull hull fwd  hull hull hull hull hull hull hull hull hull aft  hull hull hull PD
M    mag  fwd  fwd  hull ECM  hull mag  mag  mag  hull mag  hull ECM  hull aft  aft  mag  M
.    hull .    .    dcy  fcon mag  M    M    G    M    M    sdwl fcon dcy  .    .    hull .
.    fcon .    .    .    .    CM   PD   CM   PD   CM   PD   L    .    .    .    .    fcon .
`;

export const SULTAN_BC: ShipClass = {
  id: 'pn-sultan-bc',
  nationality: "People's Navy",
  className: 'Sultan',
  hullType: 'BC',
  introduced: 1892,
  crew: { officers: 284, enlisted: 1611, marines: 300 },
  smallCraft: '5 cutters, 8 pinnaces',
  reconDrones: 18,
  baseCost: 223,
  printedBoxCount: 314,
  officerCosts: {
    TAC: { poor: -11, average: 0, veteran: 11, elite: 21 },
    EWO: { poor: -4, average: 0, veteran: 4, elite: 7 },
    ATO: { poor: -1, average: 0, veteran: 1, elite: 2 },
    HELM: { poor: -5, average: 0, veteran: 2, elite: 7 },
    ENG: { poor: -11, average: 0, veteran: 11, elite: 32 },
    CREW: { poor: -4, average: 0, veteran: 3, elite: 7 },
  },
  crewQualityTarget: { poor: 2, average: 5, veteran: 7, elite: 9 },
  rangeBands: [
    { maxRange: 1, baseMql: 8, salvoes: ['early', 'middle', 'late'] },
    { maxRange: 4, baseMql: 6, salvoes: ['early', 'middle', 'late'] },
    { maxRange: 6, baseMql: 7, salvoes: ['early', 'middle', 'late'] },
    { maxRange: 10, baseMql: 8, salvoes: ['middle', 'late'] },
    { maxRange: 14, baseMql: 9, salvoes: ['middle', 'late'] },
    { maxRange: 18, baseMql: 10, salvoes: ['middle', 'late'] },
    { maxRange: 23, baseMql: 11, salvoes: ['late'] },
    { maxRange: 28, baseMql: 12, salvoes: ['late'] },
  ],
  mounts: {
    forward: hammerhead('forward', 'Forward Hammerhead'),
    aft: hammerhead('aft', 'Aft Hammerhead'),
    port: broadside('port', 'Port Broadside'),
    starboard: broadside('starboard', 'Starboard Broadside'),
  },
  internals: {
    bridge: parseTrack('_ _ (0) (-1) | -2'),
    flagBridge: parseTrack('+4 +3 +2 +1'),
    lifeSupport: parseTrack('_ _'),
    communications: parseTrack('_ _'),
    ecm: parseTrack('2 1 1 0'),
    pivot: parseTrack('3 3 2 2 1 1'),
    evolutionDelays: [4, 4, 6, 6, 12, 12],
    roll: parseTrack('4 3 3 2 2 1'),
    forwardImpeller: parseTrack('_*7 (W)'),
    aftImpeller: parseTrack('_*7 (W)'),
    maxThrust: parseTrack('3*4 2*8 1 (1)*3'),
    hyperGenerator: parseTrack('_ _'),
    hull: parseTrack('_ _ # _ _ _ # _ _ #   _ _ _ # _ _ # _ _ #   _ _ _ # _ _ # _ _ _   # _ #'),
    hullRowLengths: [10, 10, 10, 3],
    structuralIntegrity: parseTrack('_ _ _ (C) (C) [4] [5] [6] [7] _ [8] [9] [10] *'),
  },
  sidewalls: { port: parseTrack(SIDEWALL), starboard: parseTrack(SIDEWALL) },
  hammerheadArmor: { forward: 1, aft: 1 },
  bowWall: null,
  sternWall: null,
  hitLocation: parseHitLocationText(HIT_LOCATION, 8, 2),
  notes: 'Ship Book 1 card v214. Jayne\'s: 859,250 tons, 489.2 G, in service 1892–1926 PD.',
};
