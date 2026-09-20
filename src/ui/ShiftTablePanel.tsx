/**
 * Slide everything on the table by one offset: the fleet has drifted towards an edge, or the
 * centre must move for a new map sheet. Shows each ship's old and new position so the player
 * can move the miniatures.
 */
import { useState } from 'react';
import { cubeAdd, cubeIsZero, formatHexOffset, type Cube } from '../domain/geometry';
import { formatPosition, shiftTable, type Game } from '../domain/game';
import { HexOffsetInput, ZERO_DRAFT, draftAlt, draftToCube, type OffsetDraft } from './HexOffsetInput';

interface Applied {
  readonly offset: Cube;
  readonly alt: number;
  readonly rows: readonly { readonly name: string; readonly from: string; readonly to: string }[];
}

function describeShift(offset: Cube, alt: number): string {
  const parts: string[] = [];
  if (!cubeIsZero(offset)) parts.push(formatHexOffset(offset));
  if (alt !== 0) parts.push(`${alt > 0 ? '+' : ''}${alt} altitude`);
  return parts.join(', ');
}

export function ShiftTablePanel({ game, update }: { game: Game; update: (fn: (g: Game) => Game) => void }) {
  const [draft, setDraft] = useState<OffsetDraft>(ZERO_DRAFT);
  const [applied, setApplied] = useState<Applied | null>(null);
  const ships = game.ships;
  const offset = draftToCube(draft);
  const alt = draftAlt(draft);
  const valid = offset !== null && alt !== null;
  const nonZero = valid && (!cubeIsZero(offset) || alt !== 0);
  const after = (s: (typeof ships)[number]) => (valid ? formatPosition({ hex: cubeAdd(s.position.hex, offset), alt: s.position.alt + alt }) : '');

  const apply = () => {
    if (!valid || !nonZero) return;
    const rows = ships.map((s) => ({ name: s.name, from: formatPosition(s.position), to: after(s) }));
    update((g) => shiftTable(g, offset, alt));
    setApplied({ offset, alt, rows });
    setDraft(ZERO_DRAFT);
  };

  return (
    <details className="tool">
      <summary>Shift the whole table</summary>
      <p className="note">Move every miniature by the same amount, e.g. when the fleet gets too close to an edge. Ranges and bearings do not change, so plotted orders stay valid.</p>
      <HexOffsetInput value={draft} onChange={setDraft} altLabel="altitude change" />
      {nonZero && ships.length > 0 && (
        <table className="list">
          <thead>
            <tr>
              <th>Ship</th>
              <th>Now</th>
              <th>After the shift</th>
            </tr>
          </thead>
          <tbody>
            {ships.map((s) => (
              <tr key={s.id}>
                <td>
                  <b>{s.name}</b>
                </td>
                <td className="note">{formatPosition(s.position)}</td>
                <td>{after(s)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="row" style={{ marginTop: 8 }}>
        <button type="button" className="primary" disabled={!nonZero || ships.length === 0} onClick={apply}>
          Shift the table
        </button>
        {!valid && <span className="field-msg">whole numbers only</span>}
        {applied && (
          <button type="button" onClick={() => setApplied(null)}>
            Dismiss
          </button>
        )}
      </div>
      {applied && (
        <div className="shift-done">
          <p>
            <b>Shifted by {describeShift(applied.offset, applied.alt)}.</b> Slide every miniature that way; the new positions are:
          </p>
          <table className="list">
            <thead>
              <tr>
                <th>Ship</th>
                <th>Was</th>
                <th>Now</th>
              </tr>
            </thead>
            <tbody>
              {applied.rows.map((r) => (
                <tr key={r.name}>
                  <td>
                    <b>{r.name}</b>
                  </td>
                  <td className="note">{r.from}</td>
                  <td>
                    <b>{r.to}</b>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </details>
  );
}
