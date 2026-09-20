/** Put a ship on the table. Position, orientation and vectors can be corrected afterwards on its card. */
import { useState } from 'react';
import { BUILT_IN_SHIPS } from '../data/ships';
import { LEVEL_ATTITUDE, type Attitude } from '../domain/geometry';
import { CONTROLLERS, DOCTRINES, DOCTRINE_LABELS, FULL_EFFECTIVENESS, SIDES, addShip, type Controller, type Doctrine, type Game, type Side } from '../domain/game';
import { AttitudeInput } from './AttitudeInput';
import { HexOffsetInput, ZERO_DRAFT, draftToPosition, type OffsetDraft } from './HexOffsetInput';
import { VelocityInput, type VelocityDraft } from './VelocityInput';
import { draftToVelocity, velocityToDraft } from './drafts';
import { velocity } from '../domain/geometry';

export function AddShipPanel({ game, update }: { game: Game; update: (fn: (g: Game) => Game) => void }) {
  const [classId, setClassId] = useState(BUILT_IN_SHIPS[0]?.id ?? '');
  const [name, setName] = useState('');
  const [side, setSide] = useState<Side>('red');
  const [controller, setController] = useState<Controller>('ai');
  const [doctrine, setDoctrine] = useState<Doctrine>('balanced');
  const [pos, setPos] = useState<OffsetDraft>(ZERO_DRAFT);
  const [vel, setVel] = useState<VelocityDraft>(velocityToDraft(velocity({})));
  const [attitude, setAttitude] = useState<Attitude>(LEVEL_ATTITUDE);
  const [error, setError] = useState<string | null>(null);

  const add = () => {
    const cls = BUILT_IN_SHIPS.find((c) => c.id === classId);
    if (!cls) return;
    const position = draftToPosition(pos);
    const v = draftToVelocity(vel);
    if (!position || !v) {
      setError('position and vectors must be whole numbers');
      return;
    }
    const n = game.ships.length + 1;
    update((g) =>
      addShip(g, {
        id: crypto.randomUUID(),
        name: name.trim() || `${cls.className} ${n}`,
        classId: cls.id,
        side,
        controller,
        doctrine,
        position,
        velocity: v,
        attitude,
        halfDisplacements: [],
        bda: 'undamaged',
        effectiveness: FULL_EFFECTIVENESS,
        orders: null,
      }),
    );
    setName('');
    setError(null);
  };

  return (
    <details className="tool" open={game.ships.length === 0}>
      <summary>Add a ship</summary>
      <div className="grid-3" style={{ marginTop: 8 }}>
        <div className="field">
          <label>Class</label>
          <select value={classId} onChange={(e) => setClassId(e.target.value)}>
            {BUILT_IN_SHIPS.map((c) => (
              <option key={c.id} value={c.id}>
                {c.className} {c.hullType} — {c.nationality}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Name</label>
          <input type="text" value={name} placeholder="HMS …" onChange={(e) => setName(e.target.value)} />
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
              {CONTROLLERS.map((c) => (
                <button key={c} type="button" aria-pressed={controller === c} onClick={() => setController(c)}>
                  {c}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
      {controller === 'ai' && (
        <div className="field">
          <label>Doctrine</label>
          <select value={doctrine} onChange={(e) => setDoctrine(e.target.value as Doctrine)}>
            {DOCTRINES.map((d) => (
              <option key={d} value={d}>
                {DOCTRINE_LABELS[d]}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="label note">Position: hexes from the centre of the map, e.g. 9 in A then 3 in B</div>
      <HexOffsetInput value={pos} onChange={setPos} />
      <div className="label note">Orientation</div>
      <AttitudeInput value={attitude} onChange={setAttitude} />
      <div className="label note">Vectors</div>
      <VelocityInput value={vel} onChange={setVel} />
      <div className="row" style={{ marginTop: 8 }}>
        <button type="button" className="primary" onClick={add}>
          Add ship
        </button>
        {error && <span className="field-msg">{error}</span>}
      </div>
    </details>
  );
}
