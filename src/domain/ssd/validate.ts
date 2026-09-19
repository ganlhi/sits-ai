/**
 * Structural validation of a ship class read from JSON (the editor's import path).
 *
 * Hand-written rather than a schema library so the domain stays dependency-free. Every check
 * reports a path so the editor can point at the field.
 */
import { MOUNTS, BODY_ROWS, type ArcDiagram, type Mount } from '../geometry';
import { isSystemCode, type HitLocationTable } from './hitLocation';
import { GRADES, OFFICER_TYPES, SALVO_TIMINGS, WEAPON_TYPES, type ShipClass } from './shipClass';
import type { Box, TrackSpec } from './track';

export type ValidationResult = { readonly ok: true; readonly value: ShipClass } | { readonly ok: false; readonly errors: readonly string[] };

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);
const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

class Checker {
  readonly errors: string[] = [];

  fail(path: string, msg: string): void {
    this.errors.push(`${path}: ${msg}`);
  }

  rec(v: unknown, path: string): Rec | null {
    if (isRec(v)) return v;
    this.fail(path, 'expected an object');
    return null;
  }

  str(v: unknown, path: string): void {
    if (typeof v !== 'string' || v.length === 0) this.fail(path, 'expected a non-empty string');
  }

  strOrNull(v: unknown, path: string): void {
    if (v !== null && typeof v !== 'string') this.fail(path, 'expected a string or null');
  }

  int(v: unknown, path: string, min = -Infinity): void {
    if (!isInt(v) || v < min) this.fail(path, `expected an integer${min > -Infinity ? ` ≥ ${min}` : ''}`);
  }

  intOrNull(v: unknown, path: string, min = -Infinity): void {
    if (v !== null) this.int(v, path, min);
  }

  bool(v: unknown, path: string): void {
    if (typeof v !== 'boolean') this.fail(path, 'expected a boolean');
  }

  box(v: unknown, path: string): void {
    const b = this.rec(v, path);
    if (!b) return;
    if (b.value !== null && !isNum(b.value)) this.fail(`${path}.value`, 'expected a number or null');
    if (!['square', 'circle', 'octagon', 'star'].includes(b.shape as string)) this.fail(`${path}.shape`, 'bad shape');
    if (b.mark !== null && !['C', 'W', 'wrench'].includes(b.mark as string)) this.fail(`${path}.mark`, 'bad mark');
    if (b.shape === 'octagon' && !isNum(b.value)) this.fail(`${path}.value`, 'octagons carry a number');
  }

  track(v: unknown, path: string, allowEmpty = false): void {
    const t = this.rec(v, path);
    if (!t) return;
    if (!Array.isArray(t.boxes)) {
      this.fail(`${path}.boxes`, 'expected an array');
      return;
    }
    if (!allowEmpty && t.boxes.length === 0) this.fail(`${path}.boxes`, 'track has no boxes');
    t.boxes.forEach((b, i) => this.box(b, `${path}.boxes[${i}]`));
    if (t.exhaustedValue !== null && !isNum(t.exhaustedValue)) this.fail(`${path}.exhaustedValue`, 'expected a number or null');
  }

  trackOrNull(v: unknown, path: string): void {
    if (v !== null) this.track(v, path);
  }

  arc(v: unknown, path: string): void {
    const a = this.rec(v, path);
    if (!a) return;
    for (const row of BODY_ROWS) {
      const r = a[row];
      const want = row === 'top' || row === 'bottom' ? 1 : row.startsWith('green') ? 6 : 12;
      if (!Array.isArray(r) || r.length !== want) {
        this.fail(`${path}.${row}`, `expected ${want} colours`);
        continue;
      }
      r.forEach((c, i) => {
        if (!['black', 'grey', 'white'].includes(c as string)) this.fail(`${path}.${row}[${i}]`, 'bad colour');
      });
    }
  }

  hlt(v: unknown, path: string): void {
    const h = this.rec(v, path);
    if (!h) return;
    this.int(h.scale, `${path}.scale`, 1);
    this.int(h.coreArmor, `${path}.coreArmor`, 0);
    if (!Array.isArray(h.columns) || !h.columns.every(isInt)) this.fail(`${path}.columns`, 'expected integers');
    if (!Array.isArray(h.rows)) {
      this.fail(`${path}.rows`, 'expected an array');
      return;
    }
    h.rows.forEach((r, i) => {
      const row = this.rec(r, `${path}.rows[${i}]`);
      if (!row) return;
      this.str(row.label, `${path}.rows[${i}].label`);
      if (!Array.isArray(row.rolls) || !row.rolls.every(isInt)) this.fail(`${path}.rows[${i}].rolls`, 'expected integers');
    });
    const nRows = h.rows.length;
    const nCols = Array.isArray(h.columns) ? h.columns.length : 0;
    for (const grid of ['cells', 'core'] as const) {
      const g = h[grid];
      if (!Array.isArray(g) || g.length !== nRows) {
        this.fail(`${path}.${grid}`, `expected ${nRows} rows`);
        continue;
      }
      g.forEach((r, ri) => {
        if (!Array.isArray(r) || r.length !== nCols) {
          this.fail(`${path}.${grid}[${ri}]`, `expected ${nCols} cells`);
          return;
        }
        r.forEach((c, ci) => {
          if (grid === 'cells' && c !== null && !(typeof c === 'string' && isSystemCode(c))) this.fail(`${path}.cells[${ri}][${ci}]`, `unknown system code ${String(c)}`);
          if (grid === 'core' && typeof c !== 'boolean') this.fail(`${path}.core[${ri}][${ci}]`, 'expected a boolean');
        });
      });
    }
    // every roll 2..20 must select exactly one row and one column
    if (Array.isArray(h.rows) && Array.isArray(h.columns)) {
      for (let roll = 2; roll <= 20; roll++) {
        const rows = h.rows.filter((r) => isRec(r) && Array.isArray(r.rolls) && r.rolls.includes(roll)).length;
        if (rows !== 1) this.fail(`${path}.rows`, `roll ${roll} selects ${rows} rows`);
        if (h.columns.filter((c) => c === roll).length !== 1) this.fail(`${path}.columns`, `roll ${roll} selects no single column`);
      }
    }
  }
}

export function validateShipClass(input: unknown): ValidationResult {
  const c = new Checker();
  const s = c.rec(input, 'ship');
  if (!s) return { ok: false, errors: c.errors };

  c.str(s.id, 'id');
  if (typeof s.id === 'string' && !/^[a-z0-9][a-z0-9-]*$/.test(s.id)) c.fail('id', 'use lower-case letters, digits and hyphens');
  c.str(s.nationality, 'nationality');
  c.str(s.className, 'className');
  c.str(s.hullType, 'hullType');
  c.intOrNull(s.introduced, 'introduced');
  const crew = c.rec(s.crew, 'crew');
  if (crew) for (const k of ['officers', 'enlisted', 'marines']) c.int(crew[k], `crew.${k}`, 0);
  c.strOrNull(s.smallCraft, 'smallCraft');
  c.int(s.reconDrones, 'reconDrones', 0);
  c.int(s.baseCost, 'baseCost', 0);
  c.intOrNull(s.printedBoxCount, 'printedBoxCount', 0);
  c.strOrNull(s.notes, 'notes');

  const oc = c.rec(s.officerCosts, 'officerCosts');
  if (oc) {
    for (const o of OFFICER_TYPES) {
      const g = c.rec(oc[o], `officerCosts.${o}`);
      if (g) for (const gr of GRADES) c.int(g[gr], `officerCosts.${o}.${gr}`);
    }
  }
  const cq = c.rec(s.crewQualityTarget, 'crewQualityTarget');
  if (cq) for (const gr of GRADES) c.int(cq[gr], `crewQualityTarget.${gr}`, 0);

  if (!Array.isArray(s.rangeBands) || s.rangeBands.length === 0) c.fail('rangeBands', 'expected a non-empty array');
  else {
    let last = -1;
    s.rangeBands.forEach((b, i) => {
      const band = c.rec(b, `rangeBands[${i}]`);
      if (!band) return;
      c.int(band.maxRange, `rangeBands[${i}].maxRange`, 0);
      if (isInt(band.maxRange)) {
        if (band.maxRange <= last) c.fail(`rangeBands[${i}].maxRange`, 'bands must ascend');
        last = band.maxRange;
      }
      c.int(band.baseMql, `rangeBands[${i}].baseMql`, 0);
      if (!Array.isArray(band.salvoes) || band.salvoes.length === 0 || !band.salvoes.every((t) => (SALVO_TIMINGS as readonly string[]).includes(t as string))) {
        c.fail(`rangeBands[${i}].salvoes`, 'expected early/middle/late');
      }
    });
  }

  const mounts = c.rec(s.mounts, 'mounts');
  if (mounts) {
    for (const m of MOUNTS) {
      const p = `mounts.${m}`;
      const mount = c.rec(mounts[m], p);
      if (!mount) continue;
      if (mount.id !== m) c.fail(`${p}.id`, `expected "${m}"`);
      c.str(mount.name, `${p}.name`);
      c.track(mount.fcon, `${p}.fcon`);
      c.intOrNull(mount.magazine, `${p}.magazine`, 0);
      c.trackOrNull(mount.decoys, `${p}.decoys`);
      c.bool(mount.gravLance, `${p}.gravLance`);
      c.arc(mount.arc, `${p}.arc`);
      if (!Array.isArray(mount.weapons)) c.fail(`${p}.weapons`, 'expected an array');
      else {
        mount.weapons.forEach((w, i) => {
          const wp = `${p}.weapons[${i}]`;
          const weapon = c.rec(w, wp);
          if (!weapon) return;
          if (!(WEAPON_TYPES as readonly string[]).includes(weapon.type as string)) c.fail(`${wp}.type`, 'bad weapon type');
          c.str(weapon.label, `${wp}.label`);
          if (!Array.isArray(weapon.damage) || !weapon.damage.every(isNum)) c.fail(`${wp}.damage`, 'expected numbers');
          else if ((weapon.type === 'M' || weapon.type === 'ET') && weapon.damage.length !== 1) c.fail(`${wp}.damage`, 'missiles and torpedoes have one damage value');
          else if ((weapon.type === 'L' || weapon.type === 'G') && weapon.damage.length === 0) c.fail(`${wp}.damage`, 'beams need damage by range');
          else if ((weapon.type === 'CM' || weapon.type === 'PD') && weapon.damage.length !== 0) c.fail(`${wp}.damage`, 'CM/PD carry no damage');
          c.track(weapon.track, `${wp}.track`);
        });
        const hasMissiles = mount.weapons.some((w) => isRec(w) && w.type === 'M');
        if (hasMissiles && mount.magazine === null) c.fail(`${p}.magazine`, 'a mount with missile tubes needs a magazine');
      }
    }
  }

  const internals = c.rec(s.internals, 'internals');
  if (internals) {
    for (const k of ['bridge', 'flagBridge', 'lifeSupport', 'communications', 'ecm', 'pivot', 'roll', 'forwardImpeller', 'aftImpeller', 'maxThrust', 'hyperGenerator', 'hull', 'structuralIntegrity']) {
      c.track(internals[k], `internals.${k}`, k === 'flagBridge' || k === 'hyperGenerator');
    }
    if (!Array.isArray(internals.evolutionDelays) || !internals.evolutionDelays.every(isInt)) c.fail('internals.evolutionDelays', 'expected integers');
    if (!Array.isArray(internals.hullRowLengths) || !internals.hullRowLengths.every(isInt)) c.fail('internals.hullRowLengths', 'expected integers');
    else if (isRec(internals.hull) && Array.isArray(internals.hull.boxes) && internals.hullRowLengths.reduce((a: number, b) => a + (b as number), 0) !== internals.hull.boxes.length) {
      c.fail('internals.hullRowLengths', 'row lengths must add up to the hull box count');
    }
    const si = isRec(internals.structuralIntegrity) ? internals.structuralIntegrity : null;
    if (si && Array.isArray(si.boxes) && si.boxes.length > 0) {
      const last = si.boxes[si.boxes.length - 1];
      if (!isRec(last) || last.shape !== 'star') c.fail('internals.structuralIntegrity', 'the SI track ends in a star');
    }
  }

  const sw = c.rec(s.sidewalls, 'sidewalls');
  if (sw) {
    c.track(sw.port, 'sidewalls.port', true);
    c.track(sw.starboard, 'sidewalls.starboard', true);
  }
  const ha = c.rec(s.hammerheadArmor, 'hammerheadArmor');
  if (ha) {
    c.int(ha.forward, 'hammerheadArmor.forward');
    c.int(ha.aft, 'hammerheadArmor.aft');
  }
  c.trackOrNull(s.bowWall, 'bowWall');
  c.trackOrNull(s.sternWall, 'sternWall');
  c.hlt(s.hitLocation, 'hitLocation');

  return c.errors.length ? { ok: false, errors: c.errors } : { ok: true, value: input as ShipClass };
}

/** Type guards used by the fixture builders. */
export type { Box, TrackSpec, ArcDiagram, HitLocationTable, Mount };
