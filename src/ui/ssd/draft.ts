/**
 * The editor's text representation of a ship class, and the conversions both ways.
 *
 * Every track, the range bands, the weapons and the hit location table are edited as text in
 * the compact forms documented in the domain (`parseTrack`, `parseHitLocationText`) plus a few
 * editor-only shorthands defined here. A draft can be partially wrong while the user types;
 * `shipFromDraft` collects every error with the field it belongs to.
 */
import { BODY_ROWS, MOUNTS, type ArcColour, type ArcDiagram, type Mount } from '../../domain/geometry';
import {
  GRADES,
  OFFICER_TYPES,
  formatHitLocationText,
  formatTrack,
  parseHitLocationText,
  parseTrack,
  validateShipClass,
  type Grade,
  type Internals,
  type OfficerType,
  type SalvoTiming,
  type ShipClass,
  type TrackSpec,
  type WeaponSpec,
  type WeaponType,
} from '../../domain/ssd';

export interface MountDraft {
  name: string;
  fcon: string;
  magazine: string;
  /** One weapon per line: `<label> | <track>`; `!N` is a countdown track N…1. */
  weapons: string;
  decoys: string;
  gravLance: boolean;
  /** Arc rows as 12/6/1 letters B, G, W with longitude 0 = Forward. */
  arc: Record<(typeof BODY_ROWS)[number], string>;
}

export interface ShipDraft {
  id: string;
  nationality: string;
  className: string;
  hullType: string;
  introduced: string;
  officers: string;
  enlisted: string;
  marines: string;
  smallCraft: string;
  reconDrones: string;
  baseCost: string;
  printedBoxCount: string;
  officerCosts: Record<OfficerType, Record<Grade, string>>;
  crewQualityTarget: Record<Grade, string>;
  /** One band per line: `<maxRange> <baseMql> <EML letters>`. */
  rangeBands: string;
  mounts: Record<Mount, MountDraft>;
  internals: Record<Exclude<keyof Internals, 'evolutionDelays' | 'hullRowLengths'>, string> & { evolutionDelays: string; hullRowLengths: string };
  sidewallPort: string;
  sidewallStarboard: string;
  hammerheadForward: string;
  hammerheadAft: string;
  bowWall: string;
  sternWall: string;
  hltScale: string;
  hltCoreArmor: string;
  hitLocation: string;
  notes: string;
}

const INTERNAL_KEYS = ['bridge', 'flagBridge', 'lifeSupport', 'communications', 'ecm', 'pivot', 'roll', 'forwardImpeller', 'aftImpeller', 'maxThrust', 'hyperGenerator', 'hull', 'structuralIntegrity'] as const;

// ---------------------------------------------------------------------------------------------
// ship → draft

const COLOUR_LETTER: Record<ArcColour, string> = { black: 'B', grey: 'G', white: 'W' };
const LETTER_COLOUR: Record<string, ArcColour> = { B: 'black', G: 'grey', W: 'white' };

function arcToDraft(arc: ArcDiagram): MountDraft['arc'] {
  const out = {} as MountDraft['arc'];
  for (const row of BODY_ROWS) out[row] = arc[row].map((c) => COLOUR_LETTER[c]).join('');
  return out;
}

function isCountdown(t: TrackSpec): boolean {
  return t.boxes.length > 0 && t.exhaustedValue === null && t.boxes.every((b, i) => b.shape === 'square' && b.mark === null && b.value === t.boxes.length - i);
}

function weaponsToDraft(ws: readonly WeaponSpec[]): string {
  return ws.map((w) => `${w.label} | ${isCountdown(w.track) ? `!${w.track.boxes.length}` : formatTrack(w.track)}`).join('\n');
}

export function draftFromShip(s: ShipClass): ShipDraft {
  const officerCosts = {} as ShipDraft['officerCosts'];
  for (const o of OFFICER_TYPES) {
    officerCosts[o] = {} as Record<Grade, string>;
    for (const g of GRADES) officerCosts[o][g] = String(s.officerCosts[o][g]);
  }
  const cq = {} as Record<Grade, string>;
  for (const g of GRADES) cq[g] = String(s.crewQualityTarget[g]);
  const mounts = {} as ShipDraft['mounts'];
  for (const m of MOUNTS) {
    const mt = s.mounts[m];
    mounts[m] = {
      name: mt.name,
      fcon: formatTrack(mt.fcon),
      magazine: mt.magazine === null ? '' : String(mt.magazine),
      weapons: weaponsToDraft(mt.weapons),
      decoys: mt.decoys ? formatTrack(mt.decoys) : '',
      gravLance: mt.gravLance,
      arc: arcToDraft(mt.arc),
    };
  }
  const internals = {} as ShipDraft['internals'];
  for (const k of INTERNAL_KEYS) internals[k] = formatTrack(s.internals[k]);
  internals.evolutionDelays = s.internals.evolutionDelays.join(' ');
  internals.hullRowLengths = s.internals.hullRowLengths.join(' ');
  return {
    id: s.id,
    nationality: s.nationality,
    className: s.className,
    hullType: s.hullType,
    introduced: s.introduced === null ? '' : String(s.introduced),
    officers: String(s.crew.officers),
    enlisted: String(s.crew.enlisted),
    marines: String(s.crew.marines),
    smallCraft: s.smallCraft ?? '',
    reconDrones: String(s.reconDrones),
    baseCost: String(s.baseCost),
    printedBoxCount: s.printedBoxCount === null ? '' : String(s.printedBoxCount),
    officerCosts,
    crewQualityTarget: cq,
    rangeBands: s.rangeBands.map((b) => `${b.maxRange} ${b.baseMql} ${b.salvoes.map((t) => t[0]!.toUpperCase()).join('')}`).join('\n'),
    mounts,
    internals,
    sidewallPort: formatTrack(s.sidewalls.port),
    sidewallStarboard: formatTrack(s.sidewalls.starboard),
    hammerheadForward: String(s.hammerheadArmor.forward),
    hammerheadAft: String(s.hammerheadArmor.aft),
    bowWall: s.bowWall ? formatTrack(s.bowWall) : '',
    sternWall: s.sternWall ? formatTrack(s.sternWall) : '',
    hltScale: String(s.hitLocation.scale),
    hltCoreArmor: String(s.hitLocation.coreArmor),
    hitLocation: formatHitLocationText(s.hitLocation),
    notes: s.notes ?? '',
  };
}

// ---------------------------------------------------------------------------------------------
// draft → ship

export interface DraftError {
  readonly field: string;
  readonly message: string;
}

class Errors {
  readonly list: DraftError[] = [];
  add(field: string, message: string): void {
    this.list.push({ field, message });
  }
  /** Run a parser, recording its failure against a field; returns undefined on failure. */
  try<T>(field: string, f: () => T): T | undefined {
    try {
      return f();
    } catch (e) {
      this.add(field, e instanceof Error ? e.message : String(e));
      return undefined;
    }
  }
}

const int = (s: string, field: string, e: Errors, opts: { min?: number; optional?: boolean } = {}): number | null => {
  const t = s.trim();
  if (t === '') {
    if (opts.optional) return null;
    e.add(field, 'required');
    return null;
  }
  if (!/^[+-]?\d+$/.test(t)) {
    e.add(field, `"${t}" is not a whole number`);
    return null;
  }
  const n = Number(t);
  if (opts.min !== undefined && n < opts.min) e.add(field, `must be at least ${opts.min}`);
  return n;
};

const WEAPON_LABEL = /^(\d+(?:\/\d+)*)?(M|L|G|ET|CM|PD)$/;

export function parseWeaponLine(line: string): WeaponSpec {
  const [labelPart, trackPart, ...rest] = line.split('|');
  if (!trackPart || rest.length) throw new Error(`"${line}": expected "<label> | <track>"`);
  const label = (labelPart ?? '').trim();
  const m = WEAPON_LABEL.exec(label);
  if (!m) throw new Error(`"${label}": weapon label must look like 16M, 19/12/8/5L, 7ET, CM or PD`);
  const type = m[2] as WeaponType;
  const damage = m[1] ? m[1].split('/').map(Number) : [];
  if ((type === 'CM' || type === 'PD') && damage.length) throw new Error(`"${label}": CM and PD carry no damage`);
  if (type !== 'CM' && type !== 'PD' && !damage.length) throw new Error(`"${label}": needs a damage value`);
  const tt = trackPart.trim();
  const cd = /^!(\d+)$/.exec(tt);
  const track = cd ? parseTrack(Array.from({ length: Number(cd[1]) }, (_, i) => String(Number(cd[1]) - i)).join(' ')) : parseTrack(tt);
  return { type, label, damage, track };
}

function parseArcRow(text: string, row: (typeof BODY_ROWS)[number]): ArcColour[] {
  const want = row === 'top' || row === 'bottom' ? 1 : row.startsWith('green') ? 6 : 12;
  const letters = text.replace(/\s+/g, '').toUpperCase();
  if (letters.length !== want) throw new Error(`${row}: expected ${want} letters (B/G/W), got ${letters.length}`);
  return [...letters].map((ch) => {
    const c = LETTER_COLOUR[ch];
    if (!c) throw new Error(`${row}: "${ch}" is not B, G or W`);
    return c;
  });
}

function parseRangeBands(text: string, e: Errors): ShipClass['rangeBands'] {
  const out: { maxRange: number; baseMql: number; salvoes: SalvoTiming[] }[] = [];
  text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .forEach((line, i) => {
      const m = /^(\d+)\s+(\d+)\s+([EMLeml]+)$/.exec(line);
      if (!m) {
        e.add('rangeBands', `line ${i + 1} "${line}": expected "<max range> <base MQL> <E/M/L letters>"`);
        return;
      }
      const letters = [...m[3]!.toUpperCase()];
      const salvoes: SalvoTiming[] = [];
      if (letters.includes('E')) salvoes.push('early');
      if (letters.includes('M')) salvoes.push('middle');
      if (letters.includes('L')) salvoes.push('late');
      out.push({ maxRange: Number(m[1]), baseMql: Number(m[2]), salvoes });
    });
  if (!out.length) e.add('rangeBands', 'at least one band');
  return out;
}

export function shipFromDraft(d: ShipDraft): { ship?: ShipClass; errors: DraftError[] } {
  const e = new Errors();
  const officerCosts = {} as Record<OfficerType, Record<Grade, number>>;
  for (const o of OFFICER_TYPES) {
    officerCosts[o] = {} as Record<Grade, number>;
    for (const g of GRADES) officerCosts[o][g] = int(d.officerCosts[o][g], `officerCosts.${o}.${g}`, e) ?? 0;
  }
  const cq = {} as Record<Grade, number>;
  for (const g of GRADES) cq[g] = int(d.crewQualityTarget[g], `crewQualityTarget.${g}`, e, { min: 0 }) ?? 0;

  const mounts = {} as Record<Mount, ShipClass['mounts'][Mount]>;
  for (const m of MOUNTS) {
    const md = d.mounts[m];
    const arc = {} as Record<(typeof BODY_ROWS)[number], ArcColour[]>;
    for (const row of BODY_ROWS) arc[row] = e.try(`mounts.${m}.arc.${row}`, () => parseArcRow(md.arc[row], row)) ?? Array<ArcColour>(row === 'top' || row === 'bottom' ? 1 : row.startsWith('green') ? 6 : 12).fill('black');
    const weapons = md.weapons
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .flatMap((line, i) => {
        const w = e.try(`mounts.${m}.weapons`, () => parseWeaponLine(line));
        return w ? [w] : [];
      });
    mounts[m] = {
      id: m,
      name: md.name.trim() || m,
      fcon: e.try(`mounts.${m}.fcon`, () => parseTrack(md.fcon)) ?? { boxes: [], exhaustedValue: null },
      magazine: int(md.magazine, `mounts.${m}.magazine`, e, { optional: true, min: 0 }),
      weapons,
      decoys: md.decoys.trim() ? (e.try(`mounts.${m}.decoys`, () => parseTrack(md.decoys)) ?? null) : null,
      gravLance: md.gravLance,
      arc,
    };
  }

  const internals = {} as Record<(typeof INTERNAL_KEYS)[number], TrackSpec>;
  for (const k of INTERNAL_KEYS) internals[k] = e.try(`internals.${k}`, () => parseTrack(d.internals[k])) ?? { boxes: [], exhaustedValue: null };
  const nums = (s: string, field: string): number[] => {
    const parts = s.trim() ? s.trim().split(/[\s,]+/) : [];
    if (!parts.every((p) => /^\d+$/.test(p))) {
      e.add(field, 'whole numbers separated by spaces');
      return [];
    }
    return parts.map(Number);
  };

  const scale = int(d.hltScale, 'hitLocation.scale', e, { min: 1 }) ?? 1;
  const coreArmor = int(d.hltCoreArmor, 'hitLocation.coreArmor', e, { min: 0 }) ?? 0;
  const hitLocation = e.try('hitLocation', () => parseHitLocationText(d.hitLocation, scale, coreArmor));

  const candidate = {
    id: d.id.trim(),
    nationality: d.nationality.trim(),
    className: d.className.trim(),
    hullType: d.hullType.trim(),
    introduced: int(d.introduced, 'introduced', e, { optional: true }),
    crew: { officers: int(d.officers, 'crew.officers', e, { min: 0 }) ?? 0, enlisted: int(d.enlisted, 'crew.enlisted', e, { min: 0 }) ?? 0, marines: int(d.marines, 'crew.marines', e, { min: 0 }) ?? 0 },
    smallCraft: d.smallCraft.trim() || null,
    reconDrones: int(d.reconDrones, 'reconDrones', e, { min: 0 }) ?? 0,
    baseCost: int(d.baseCost, 'baseCost', e, { min: 0 }) ?? 0,
    printedBoxCount: int(d.printedBoxCount, 'printedBoxCount', e, { optional: true, min: 0 }),
    officerCosts,
    crewQualityTarget: cq,
    rangeBands: parseRangeBands(d.rangeBands, e),
    mounts,
    internals: { ...internals, evolutionDelays: nums(d.internals.evolutionDelays, 'internals.evolutionDelays'), hullRowLengths: nums(d.internals.hullRowLengths, 'internals.hullRowLengths') },
    sidewalls: {
      port: e.try('sidewalls.port', () => parseTrack(d.sidewallPort)) ?? { boxes: [], exhaustedValue: null },
      starboard: e.try('sidewalls.starboard', () => parseTrack(d.sidewallStarboard)) ?? { boxes: [], exhaustedValue: null },
    },
    hammerheadArmor: { forward: int(d.hammerheadForward, 'hammerheadArmor.forward', e) ?? 0, aft: int(d.hammerheadAft, 'hammerheadArmor.aft', e) ?? 0 },
    bowWall: d.bowWall.trim() ? (e.try('bowWall', () => parseTrack(d.bowWall)) ?? null) : null,
    sternWall: d.sternWall.trim() ? (e.try('sternWall', () => parseTrack(d.sternWall)) ?? null) : null,
    hitLocation,
    notes: d.notes.trim() || null,
  };

  if (e.list.length || !hitLocation) return { errors: e.list };
  const v = validateShipClass(candidate);
  if (!v.ok) return { errors: v.errors.map((msg) => ({ field: msg.split(':')[0] ?? '', message: msg.slice((msg.split(':')[0] ?? '').length + 1).trim() })) };
  return { ship: v.value, errors: [] };
}
