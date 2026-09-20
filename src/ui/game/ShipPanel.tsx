/**
 * One ship as it stands on the table: position, vectors, attitude, and its SSD with damage.
 * Everything here is "report what the table says": edits become ShipReported / BoxReported
 * events. Defaults are the app's own expectation, so confirming costs nothing.
 */
import { useEffect, useState } from 'react';
import {
  ALL_WINDOWS,
  DIRECTION_CUBE,
  MAP_DIRECTIONS,
  cubeAdd,
  MOUNTS,
  VECTOR_DIRECTIONS,
  formatVelocity,
  markers,
  velocity,
  windowKey,
  windowLabel,
  windowsAtDistance,
  windowsEqual,
  type AvidWindow,
  type Velocity,
} from '../../domain/geometry';
import { shipClassOf, type GameEvent, type GameState, type ShipState } from '../../domain/game';
import type { BoxStatus, TrackId } from '../../domain/ssd';
import { AvidFlat } from '../avid/AvidFlat';
import { SsdSheet } from '../ssd/SsdSheet';
import { fmtPos } from './HexMap';
import { HexOffsetInput, draftFromPosition, draftToPosition, type OffsetDraft } from './HexOffsetInput';

function WindowSelect({ value, options, onChange }: { value: AvidWindow; options: readonly AvidWindow[]; onChange: (w: AvidWindow) => void }) {
  return (
    <select value={windowKey(value)} onChange={(e) => onChange(options.find((w) => windowKey(w) === e.target.value) ?? value)}>
      {options.map((w) => (
        <option key={windowKey(w)} value={windowKey(w)}>
          {windowLabel(w)}
        </option>
      ))}
    </select>
  );
}

export function ShipPanel({ game, ship, dispatch }: { game: GameState; ship: ShipState; dispatch: (e: GameEvent) => void }) {
  const cls = shipClassOf(game, ship);
  const m = markers(ship.attitude);
  const [pos, setPos] = useState<OffsetDraft>(draftFromPosition(ship.position));
  const [vel, setVel] = useState<Record<string, string>>({});
  const [fwd, setFwd] = useState<AvidWindow>(m.forward);
  const [top, setTop] = useState<AvidWindow>(m.top);
  const [showSsd, setShowSsd] = useState(false);
  const [boxMode, setBoxMode] = useState<BoxStatus>('destroyed');

  useEffect(() => {
    setPos(draftFromPosition(ship.position));
    setVel(Object.fromEntries(VECTOR_DIRECTIONS.map((d) => [d, String(ship.velocity[d])])));
    const mk = markers(ship.attitude);
    setFwd(mk.forward);
    setTop(mk.top);
  }, [ship]);

  const topOptions = windowsAtDistance(fwd, 3);
  const topOk = topOptions.some((w) => windowsEqual(w, top)) ? top : (topOptions[0] ?? top);

  const report = () => {
    const position = draftToPosition(pos);
    if (!position) return;
    let v: Velocity;
    try {
      v = velocity(Object.fromEntries(VECTOR_DIRECTIONS.map((d) => [d, Number(vel[d] ?? 0)])));
    } catch {
      return;
    }
    dispatch({ type: 'ShipReported', shipId: ship.id, position, velocity: v, forward: fwd, top: topOk });
  };

  /** One hex (or one level) in a direction; re-expressed from the centre so the legs stay the shortest walk. */
  const nudge = (d: (typeof MAP_DIRECTIONS)[number] | '+' | '-') => {
    const cur = draftToPosition(pos) ?? ship.position;
    if (d === '+' || d === '-') {
      setPos(draftFromPosition({ hex: cur.hex, alt: cur.alt + (d === '+' ? 1 : -1) }));
      return;
    }
    setPos(draftFromPosition({ hex: cubeAdd(cur.hex, DIRECTION_CUBE[d]), alt: cur.alt }));
  };

  const onBox = (trackId: TrackId, index: number) => {
    const cur = ship.damage.tracks[trackId]?.boxes[index]?.status ?? 'ok';
    dispatch({ type: 'BoxReported', shipId: ship.id, trackId, index, status: cur === boxMode ? 'ok' : boxMode });
  };

  return (
    <div className="ship-panel">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h3>
          {ship.name} <span className="note">{cls.className} {cls.hullType} · {ship.side} · {ship.controller}</span>
        </h3>
        <label className="note">
          <input type="checkbox" checked={ship.destroyed} onChange={(e) => dispatch({ type: 'ShipDestroyed', shipId: ship.id, destroyed: e.target.checked })} /> destroyed
        </label>
      </div>
      <p className="note">
        Now: {fmtPos(ship.position)} · {formatVelocity(ship.velocity)} · Forward {windowLabel(m.forward)}, Top {windowLabel(m.top)}
        {ship.halfDisplacements.length ? ` · half hexes in ${ship.halfDisplacements.join(', ')}` : ''}
      </p>

      <details className="report">
        <summary>Report position, vectors, attitude</summary>
        <HexOffsetInput value={pos} onChange={setPos} />
        <div className="row">
          <span className="note">nudge</span>
          {[...MAP_DIRECTIONS, '+', '-'].map((d) => (
            <button key={d} type="button" onClick={() => nudge(d as never)}>
              {d}
            </button>
          ))}
        </div>
        <div className="row" style={{ marginTop: 8 }}>
          <span className="note">vectors</span>
          {VECTOR_DIRECTIONS.map((d) => (
            <label key={d} className="vec-input">
              {d}
              <input value={vel[d] ?? ''} onChange={(e) => setVel({ ...vel, [d]: e.target.value })} />
            </label>
          ))}
        </div>
        <div className="grid-2" style={{ marginTop: 8 }}>
          <div className="field">
            <label>Forward</label>
            <WindowSelect value={fwd} options={ALL_WINDOWS} onChange={setFwd} />
          </div>
          <div className="field">
            <label>Top</label>
            <WindowSelect value={topOk} options={topOptions} onChange={setTop} />
          </div>
        </div>
        <div className="row">
          <div style={{ width: 180 }}>
            <AvidFlat markers={markers(ship.attitude)} clickHemisphere="upper" onSelect={setFwd} />
          </div>
          <button type="button" onClick={report}>
            Apply report
          </button>
        </div>
      </details>

      <details className="report" open={showSsd} onToggle={(e) => setShowSsd((e.target as HTMLDetailsElement).open)}>
        <summary>Damage — tap boxes to mark</summary>
        <div className="row" style={{ margin: '6px 0' }}>
          <span className="note">tap marks a box as</span>
          <div className="seg" role="group">
            {(['destroyed', 'disabled'] as BoxStatus[]).map((s) => (
              <button key={s} type="button" aria-pressed={boxMode === s} onClick={() => setBoxMode(s)}>
                {s}
              </button>
            ))}
          </div>
          <span className="note">(tap again to clear)</span>
        </div>
        <div className="row">
          {MOUNTS.map((mt) =>
            cls.mounts[mt].magazine !== null ? (
              <label key={mt} className="vec-input">
                {cls.mounts[mt].name} mag
                <input
                  value={String(ship.damage.magazines[mt] ?? cls.mounts[mt].magazine)}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    if (Number.isInteger(n) && n >= 0) dispatch({ type: 'MagazineReported', shipId: ship.id, mount: mt, remaining: n });
                  }}
                  style={{ width: 50 }}
                />
              </label>
            ) : null,
          )}
        </div>
        {showSsd && <SsdSheet ship={cls} damage={ship.damage} onBoxClick={onBox} />}
      </details>
    </div>
  );
}
