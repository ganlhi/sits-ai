/**
 * Havoc-class destroyer, Royal Manticoran Navy — SITS2 Ship Book 3 card "RMN DD Havoc v216"
 * (SITS2-SB3 RMN DD Havoc 110207.pdf, page 2). Transcribed 2026-09-20.
 */
import { parseHitLocationText, parseTrack, type MountSpec, type ShipClass, type WeaponSpec } from '../../domain/ssd';
import { standardArcs } from './arcs';

const arcs = standardArcs();
const countdown = (n: number): string => Array.from({ length: n }, (_, i) => `${n - i}`).join(' ');
const weapon = (type: WeaponSpec['type'], label: string, damage: number[], track: string): WeaponSpec => ({ type, label, damage, track: parseTrack(track) });

const hammerhead = (id: 'forward' | 'aft', name: string): MountSpec => ({
  id,
  name,
  fcon: parseTrack('0 2 | 3'),
  magazine: 14, // 12 + 2 dots
  weapons: [
    weapon('M', '4M', [4], countdown(2)),
    weapon('L', '7/5L', [7, 5], countdown(1)),
    weapon('CM', 'CM', [], '1 2/3'),
    weapon('PD', 'PD', [], '2/3 1/3'),
  ],
  decoys: null,
  gravLance: false,
  arc: arcs[id],
});

const broadside = (id: 'port' | 'starboard', name: string): MountSpec => ({
  id,
  name,
  fcon: parseTrack('0 1 2 | 3'),
  magazine: 22, // 12 + 10 dots
  weapons: [
    weapon('M', '4M', [4], countdown(5)),
    weapon('L', '6/4L', [6, 4], countdown(3)),
    weapon('CM', 'CM', [], '1 1 1/3'),
    weapon('PD', 'PD', [], '1 2/3 1/3'),
  ],
  decoys: parseTrack('+2*3'),
  gravLance: false,
  arc: arcs[id],
});

const SIDEWALL = '-3 -1 +1 | 3';

const HIT_LOCATION = `
.    fcon .    .    .    .    M    M    M    M    M    M    L    .    .    .    .    fcon .
.    hull .    .    dcy  fcon CM   PD   PD   L    PD   L    CM   fcon dcy  .    .    hull .
PD   CM   fwd  fwd  hull ECM  mag  sdwl mag  CM   mag  mag  mag  ECM  hull aft  aft  CM   PD
M    hull hull hull fwd  hull hull hull hull hull hull hull hull hull aft  hull hull hull M
PD   mag  piv  rol  *SI* *hull* *brg* *hull* *SI* *hull* *SI* *hull* *brg* *hull* *SI* rol  piv  mag  PD
M    hull *2fwd* *SI* *com* *lif* *SI* *CIC* *brg* *hyp* *brg* *CIC* *SI* *lif* *com* *SI* *2aft* hull M
L    CM   piv  rol  *SI* *hull* *brg* *hull* *SI* *hull* *SI* *hull* *brg* *hull* *SI* rol  piv  CM   L
M    hull hull hull fwd  hull hull hull hull hull hull hull hull hull aft  hull hull hull M
PD   CM   fwd  fwd  hull ECM  mag  sdwl mag  CM   mag  mag  mag  ECM  hull aft  aft  CM   PD
.    mag  .    .    dcy  fcon CM   PD   PD   L    PD   L    CM   fcon dcy  .    .    mag  .
.    fcon .    .    .    .    M    M    M    M    M    M    L    .    .    .    .    fcon .
`;

export const HAVOC_DD: ShipClass = {
  id: 'rmn-havoc-dd',
  nationality: 'Royal Manticoran Navy',
  className: 'Havoc',
  hullType: 'DD',
  introduced: 1861,
  crew: { officers: 28, enlisted: 253, marines: 38 },
  smallCraft: '2 cutters, 2 pinnaces',
  reconDrones: 12,
  baseCost: 35,
  printedBoxCount: 122,
  officerCosts: {
    TAC: { poor: -1, average: 0, veteran: 1, elite: 2 },
    EWO: { poor: -1, average: 0, veteran: 1, elite: 2 },
    ATO: { poor: -1, average: 0, veteran: 1, elite: 2 },
    HELM: { poor: -3, average: 0, veteran: 2, elite: 5 },
    ENG: { poor: -7, average: 0, veteran: 7, elite: 20 },
    CREW: { poor: -1, average: 0, veteran: 1, elite: 2 },
  },
  crewQualityTarget: { poor: 2, average: 5, veteran: 7, elite: 9 },
  rangeBands: [
    { maxRange: 1, baseMql: 7, salvoes: ['early', 'middle', 'late'] },
    { maxRange: 4, baseMql: 5, salvoes: ['early', 'middle', 'late'] },
    { maxRange: 6, baseMql: 6, salvoes: ['early', 'middle', 'late'] },
    { maxRange: 10, baseMql: 7, salvoes: ['middle', 'late'] },
    { maxRange: 14, baseMql: 8, salvoes: ['middle', 'late'] },
    { maxRange: 18, baseMql: 9, salvoes: ['middle', 'late'] },
    { maxRange: 23, baseMql: 10, salvoes: ['late'] },
    { maxRange: 28, baseMql: 11, salvoes: ['late'] },
  ],
  mounts: {
    forward: hammerhead('forward', 'Forward Hammerhead'),
    aft: hammerhead('aft', 'Aft Hammerhead'),
    port: broadside('port', 'Port Broadside'),
    starboard: broadside('starboard', 'Starboard Broadside'),
  },
  internals: {
    bridge: parseTrack('_ (0) (-1) | -2'),
    flagBridge: parseTrack(''),
    lifeSupport: parseTrack('_'),
    communications: parseTrack('_'),
    ecm: parseTrack('1'),
    pivot: parseTrack('6 4 2'),
    evolutionDelays: [2, 3, 6],
    roll: parseTrack('6 4 2'),
    forwardImpeller: parseTrack('_*5 (W)'),
    aftImpeller: parseTrack('_*5 (W)'),
    maxThrust: parseTrack('3*3 2*4 (1)*3'),
    hyperGenerator: parseTrack('_'),
    hull: parseTrack('_ _ _ _ # _ _ _ _ #'),
    hullRowLengths: [10],
    structuralIntegrity: parseTrack('[5] [6] [7] [8] [9] [10] *'),
  },
  sidewalls: { port: parseTrack(SIDEWALL), starboard: parseTrack(SIDEWALL) },
  hammerheadArmor: { forward: 1, aft: 1 },
  bowWall: null,
  sternWall: null,
  hitLocation: parseHitLocationText(HIT_LOCATION, 3, 1),
  notes: 'Ship Book 3 card v216. Jayne\'s: 84,500 tons, 519.8 G, in service 1861–1923 PD. No flag bridge.',
};
