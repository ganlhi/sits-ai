/**
 * Positions in table language: an offset from the centre hex as two "n hexes in direction X"
 * legs plus an altitude, e.g. "9 in A + 3 in B, altitude 2". Every position on the table has
 * such a description with two adjacent directions; the player may type any two.
 */
import { CUBE_ORIGIN, MAP_DIRECTIONS, decomposeCube, hexOffset, rotateDirection, type Cube, type MapDirection, type Position } from '../../domain/geometry';

export interface OffsetDraft {
  readonly na: string;
  readonly a: MapDirection;
  readonly nb: string;
  readonly b: MapDirection;
  readonly alt: string;
}

export function draftFromPosition(p: Position): OffsetDraft {
  return { ...draftFromCube(p.hex), alt: String(p.alt) };
}

export function draftFromCube(c: Cube, alt = '0'): OffsetDraft {
  const d = decomposeCube(c);
  if (!d) return { na: '0', a: 'A', nb: '0', b: 'B', alt };
  return { na: String(d.na), a: d.a, nb: String(d.nb), b: d.b, alt };
}

const whole = (s: string): number | null => {
  const t = s.trim();
  if (t === '' || t === '-') return 0;
  const n = Number(t);
  return Number.isInteger(n) ? n : null;
};

/** The hex the draft describes, or null when a leg is not a whole number. */
export function draftToCube(d: OffsetDraft): Cube | null {
  const na = whole(d.na);
  const nb = whole(d.nb);
  if (na === null || nb === null) return null;
  return hexOffset({ [d.a]: na, [d.b]: nb });
}

export function draftToPosition(d: OffsetDraft): Position | null {
  const hex = draftToCube(d);
  const alt = whole(d.alt);
  if (!hex || alt === null) return null;
  return { hex, alt };
}

export function draftAlt(d: OffsetDraft): number | null {
  return whole(d.alt);
}

export const ZERO_DRAFT: OffsetDraft = draftFromCube(CUBE_ORIGIN);

function Leg({ n, dir, onChange, label }: { n: string; dir: MapDirection; onChange: (n: string, d: MapDirection) => void; label: string }) {
  return (
    <div className="field">
      <label>{label}</label>
      <div className="row leg">
        <input value={n} inputMode="numeric" aria-label={`${label} hexes`} onChange={(e) => onChange(e.target.value, dir)} />
        <span className="note">in</span>
        <select value={dir} aria-label={`${label} direction`} onChange={(e) => onChange(n, e.target.value as MapDirection)}>
          {MAP_DIRECTIONS.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

export interface HexOffsetInputProps {
  readonly value: OffsetDraft;
  readonly onChange: (d: OffsetDraft) => void;
  /** Label of the altitude field: "altitude" for a position, "altitude change" for a shift. */
  readonly altLabel?: string;
}

/** Two legs from the centre and an altitude, laid out like the other three-column forms. */
export function HexOffsetInput({ value, onChange, altLabel = 'altitude' }: HexOffsetInputProps) {
  // when the first direction changes and the second was the next one clockwise, keep it so: the pair stays a natural "go, then turn" walk
  const setA = (na: string, a: MapDirection) => {
    const wasAdjacent = value.b === rotateDirection(value.a, 1);
    onChange({ ...value, na, a, b: a !== value.a && wasAdjacent ? rotateDirection(a, 1) : value.b });
  };
  return (
    <div className="grid-3">
      <Leg label="from centre" n={value.na} dir={value.a} onChange={setA} />
      <Leg label="then" n={value.nb} dir={value.b} onChange={(nb, b) => onChange({ ...value, nb, b })} />
      <div className="field">
        <label>{altLabel}</label>
        <input value={value.alt} inputMode="numeric" onChange={(e) => onChange({ ...value, alt: e.target.value })} />
      </div>
    </div>
  );
}
