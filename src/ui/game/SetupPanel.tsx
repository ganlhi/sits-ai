/**
 * Setting up a game: put ships on the table. Classes come from the ship library and are
 * snapshotted into the game.
 */
import { useState } from 'react';
import { ALL_WINDOWS, VECTOR_DIRECTIONS, purple, velocity, windowKey, windowLabel, windowsAtDistance, windowsEqual, yellow, type AvidWindow } from '../../domain/geometry';
import { AVERAGE_GRADES, SIDES, shipsOf, type Controller, type Doctrine, type GameEvent, type GameState, type Grades, type Side } from '../../domain/game';
import { GRADES, OFFICER_TYPES, type Grade, type OfficerType, type ShipClass } from '../../domain/ssd';
import { listShips } from '../../storage/shipLibrary';
import { DoctrineSelect } from './AiPanels';
import { fmtPos } from './HexMap';
import { HexOffsetInput, ZERO_DRAFT, draftToPosition, type OffsetDraft } from './HexOffsetInput';

export function SetupPanel({ game, dispatch }: { game: GameState; dispatch: (e: GameEvent) => void }) {
  const library = listShips();
  const [classId, setClassId] = useState(library[0]?.id ?? '');
  const [name, setName] = useState('');
  const [side, setSide] = useState<Side>('green');
  const [controller, setController] = useState<Controller>('player');
  const [grades, setGrades] = useState<Grades>(AVERAGE_GRADES);
  const [doctrine, setDoctrine] = useState<Doctrine>('balanced');
  const [pos, setPos] = useState<OffsetDraft>(ZERO_DRAFT);
  const [vel, setVel] = useState<Record<string, string>>(Object.fromEntries(VECTOR_DIRECTIONS.map((d) => [d, '0'])));
  const [fwd, setFwd] = useState<AvidWindow>(yellow(0));
  const [top, setTop] = useState<AvidWindow>(purple('upper'));
  const [error, setError] = useState<string | null>(null);

  const topOptions = windowsAtDistance(fwd, 3);
  const topOk = topOptions.some((w) => windowsEqual(w, top)) ? top : (topOptions[0] ?? top);

  const add = () => {
    const cls: ShipClass | undefined = library.find((c) => c.id === classId);
    if (!cls) return;
    const position = draftToPosition(pos);
    if (!position) {
      setError('position must be whole numbers');
      return;
    }
    try {
      const v = velocity(Object.fromEntries(VECTOR_DIRECTIONS.map((d) => [d, Number(vel[d] ?? 0)])));
      if (!game.classes[cls.id]) dispatch({ type: 'ClassAdded', shipClass: cls });
      const n = shipsOf(game).length + 1;
      dispatch({
        type: 'ShipAdded',
        setup: {
          id: crypto.randomUUID(),
          name: name.trim() || `${cls.className} ${n}`,
          classId: cls.id,
          side,
          controller,
          grades,
          doctrine,
          position,
          velocity: v,
          forward: fwd,
          top: topOk,
        },
      });
      setName('');
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="setup">
      <section className="panel">
        <h2>Add a ship</h2>
        <div className="grid-3">
          <div className="field">
            <label>Class</label>
            <select value={classId} onChange={(e) => setClassId(e.target.value)}>
              {library.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.className} {c.hullType} — {c.nationality}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Name</label>
            <input value={name} placeholder="HMS …" onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="field">
            <label>Side / control</label>
            <div className="row">
              <div className="seg">
                {SIDES.map((s) => (
                  <button key={s} type="button" aria-pressed={side === s} onClick={() => setSide(s)}>
                    {s}
                  </button>
                ))}
              </div>
              <div className="seg">
                {(['player', 'ai'] as Controller[]).map((c) => (
                  <button key={c} type="button" aria-pressed={controller === c} onClick={() => setController(c)}>
                    {c}
                  </button>
                ))}
              </div>
            </div>
          </div>
          {controller === 'ai' && (
            <div className="field field-wide">
              <label>Doctrine</label>
              <DoctrineSelect value={doctrine} onChange={setDoctrine} />
            </div>
          )}
        </div>
        <p className="note" style={{ marginTop: 8 }}>Position: count hexes from the centre of the map (the compass rosette), e.g. 9 in A then 3 in B.</p>
        <HexOffsetInput value={pos} onChange={setPos} />
        <div className="row">
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
            <select value={windowKey(fwd)} onChange={(e) => setFwd(ALL_WINDOWS.find((w) => windowKey(w) === e.target.value) ?? fwd)}>
              {ALL_WINDOWS.map((w) => (
                <option key={windowKey(w)} value={windowKey(w)}>
                  {windowLabel(w)}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Top</label>
            <select value={windowKey(topOk)} onChange={(e) => setTop(topOptions.find((w) => windowKey(w) === e.target.value) ?? topOk)}>
              {topOptions.map((w) => (
                <option key={windowKey(w)} value={windowKey(w)}>
                  {windowLabel(w)}
                </option>
              ))}
            </select>
          </div>
        </div>
        <details>
          <summary className="note">Officer and crew grades</summary>
          <div className="row">
            {OFFICER_TYPES.map((o: OfficerType) => (
              <label key={o} className="vec-input">
                {o}
                <select value={grades[o]} onChange={(e) => setGrades({ ...grades, [o]: e.target.value as Grade })}>
                  {GRADES.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        </details>
        <div className="row" style={{ marginTop: 8 }}>
          <button type="button" onClick={add}>
            Add ship
          </button>
          {error && <span className="field-msg">{error}</span>}
        </div>
        <p className="note">Positions are offsets from the centre hex of the map in the six map directions A–F (A towards the top of the map, then clockwise). The map on the right shows the result; the centre hex is highlighted.</p>
      </section>
      <section className="panel">
        <h2>Ships on the table</h2>
        {shipsOf(game).length === 0 ? (
          <p className="note">None yet.</p>
        ) : (
          <table className="games-table">
            <tbody>
              {shipsOf(game).map((s) => (
                <tr key={s.id}>
                  <td>
                    <b>{s.name}</b> <span className="note">{game.classes[s.classId]?.className}</span>
                  </td>
                  <td>{s.side}</td>
                  <td>
                    <div className="row">
                      <div className="seg">
                        {(['player', 'ai'] as Controller[]).map((c) => (
                          <button key={c} type="button" aria-pressed={s.controller === c} onClick={() => dispatch({ type: 'ControllerChanged', shipId: s.id, controller: c })}>
                            {c}
                          </button>
                        ))}
                      </div>
                      {s.controller === 'ai' && <DoctrineSelect value={s.doctrine} onChange={(d) => dispatch({ type: 'DoctrineChanged', shipId: s.id, doctrine: d })} />}
                    </div>
                  </td>
                  <td className="note">{fmtPos(s.position)}</td>
                  <td>
                    <button type="button" onClick={() => dispatch({ type: 'ShipRemoved', shipId: s.id })}>
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <button type="button" className="primary" style={{ marginTop: 10 }} disabled={shipsOf(game).length === 0} onClick={() => dispatch({ type: 'GameStarted' })}>
          Start turn 1
        </button>
      </section>
    </div>
  );
}
