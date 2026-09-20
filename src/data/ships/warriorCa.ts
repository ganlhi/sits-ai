/**
 * Warrior-class heavy cruiser, Royal Manticoran Navy — SITS2 Ship Book 3 card
 * "RMN CA Warrior v216" (SITS2-SB3 RMN CA Warrior 110207.pdf, page 2). Transcribed 2026-09-20.
 * No flag bridge; the Core has bridge cells where larger ships have the flag bridge.
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
  magazine: 24, // 12 × 2 dots
  weapons: [
    weapon('M', '7M', [7], countdown(2)),
    weapon('G', '8/5G', [8, 5], countdown(1)),
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
  magazine: 24, // 12 × 2 dots
  weapons: [
    weapon('M', '7M', [7], countdown(6)),
    weapon('G', '8/5G', [8, 5], countdown(6)),
    weapon('CM', 'CM', [], '1 1/3'),
    weapon('PD', 'PD', [], '2 2 1 1 2/3 1/3'),
  ],
  decoys: parseTrack('+3*3'),
  gravLance: false,
  arc: arcs[id],
});

const SIDEWALL = '-2 0 +1 | 3';

const HIT_LOCATION = `
.    fcon .    .    .    .    G    M    M    M    G    M    G    .    .    .    .    fcon .
.    hull .    .    dcy  fcon sdwl PD   PD   G    PD   PD   CM   fcon dcy  .    .    hull .
CM   mag  fwd  fwd  hull ECM  hull mag  mag  mag  hull mag  hull ECM  hull aft  aft  mag  CM
G    hull hull hull fwd  hull hull hull hull hull hull hull hull hull aft  hull hull hull G
PD   hull piv  rol  *SI* *hull* *brg* *hull* *SI* *hull* *SI* *hull* *brg* *hull* *SI* rol  piv  hull PD
M    hull *2fwd* *SI* *com* *lif* *SI* *CIC* *brg* *hyp* *brg* *CIC* *SI* *lif* *com* *SI* *2aft* hull M
PD   hull piv  rol  *SI* *hull* *brg* *hull* *SI* *hull* *SI* *hull* *brg* *hull* *SI* rol  piv  hull PD
M    hull hull hull fwd  hull hull hull hull hull hull hull hull hull aft  hull hull hull M
CM   mag  fwd  fwd  hull ECM  hull mag  mag  mag  hull mag  hull ECM  hull aft  aft  mag  CM
.    hull .    .    dcy  fcon sdwl PD   PD   G    PD   PD   CM   fcon dcy  .    .    hull .
.    fcon .    .    .    .    G    M    M    M    G    M    G    .    .    .    .    fcon .
`;

export const WARRIOR_CA: ShipClass = {
  id: 'rmn-warrior-ca',
  nationality: 'Royal Manticoran Navy',
  className: 'Warrior',
  hullType: 'CA',
  introduced: 1794,
  crew: { officers: 42, enlisted: 374, marines: 396 },
  smallCraft: '2 cutters, 3 pinnaces',
  reconDrones: 18,
  baseCost: 93,
  printedBoxCount: 156,
  officerCosts: {
    TAC: { poor: -4, average: 0, veteran: 4, elite: 8 },
    EWO: { poor: -2, average: 0, veteran: 2, elite: 3 },
    ATO: { poor: -1, average: 0, veteran: 1, elite: 2 },
    HELM: { poor: -5, average: 0, veteran: 2, elite: 5 },
    ENG: { poor: -8, average: 0, veteran: 8, elite: 24 },
    CREW: { poor: -2, average: 0, veteran: 1, elite: 3 },
  },
  crewQualityTarget: { poor: 2, average: 5, veteran: 7, elite: 9 },
  rangeBands: [
    { maxRange: 1, baseMql: 6, salvoes: ['early', 'middle', 'late'] },
    { maxRange: 4, baseMql: 4, salvoes: ['early', 'middle', 'late'] },
    { maxRange: 6, baseMql: 5, salvoes: ['early', 'middle', 'late'] },
    { maxRange: 10, baseMql: 6, salvoes: ['middle', 'late'] },
    { maxRange: 14, baseMql: 7, salvoes: ['middle', 'late'] },
    { maxRange: 19, baseMql: 8, salvoes: ['middle', 'late'] },
    { maxRange: 24, baseMql: 9, salvoes: ['late'] },
    { maxRange: 29, baseMql: 10, salvoes: ['late'] },
  ],
  mounts: {
    forward: hammerhead('forward', 'Forward Hammerhead'),
    aft: hammerhead('aft', 'Aft Hammerhead'),
    port: broadside('port', 'Port Broadside'),
    starboard: broadside('starboard', 'Starboard Broadside'),
  },
  internals: {
    bridge: parseTrack('_ _ (0) (-1) | -2'),
    flagBridge: parseTrack(''),
    lifeSupport: parseTrack('_ _'),
    communications: parseTrack('_'),
    ecm: parseTrack('1 0'),
    pivot: parseTrack('5 4 3 2'),
    evolutionDelays: [2, 3, 4, 6],
    roll: parseTrack('5 4 3 2'),
    forwardImpeller: parseTrack('_*6 (W)'),
    aftImpeller: parseTrack('_*6 (W)'),
    maxThrust: parseTrack('3*3 2*6 (1)*3'),
    hyperGenerator: parseTrack('_ _'),
    hull: parseTrack('_ _ _ # _ _ _ _ # _   _ _ # _ _ _ #'),
    hullRowLengths: [10, 7],
    structuralIntegrity: parseTrack('(C) [4] [5] [6] [7] [8] [9] [10] *'),
  },
  sidewalls: { port: parseTrack(SIDEWALL), starboard: parseTrack(SIDEWALL) },
  hammerheadArmor: { forward: 1, aft: 1 },
  bowWall: null,
  sternWall: null,
  hitLocation: parseHitLocationText(HIT_LOCATION, 4, 1),
  notes: 'Ship Book 3 card v216. Jayne\'s: 227,250 tons, 513.0 G, in service 1794–1904 PD. Graser-heavy broadside; no flag bridge.',
};
