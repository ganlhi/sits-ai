/** Put a ship on the table. Position, orientation, vectors and ratings can be corrected afterwards on its card. */
import { useState } from 'react';
import { LEVEL_ATTITUDE, velocity, type Attitude } from '../domain/geometry';
import { CONTROLLERS, DOCTRINES, DOCTRINE_LABELS, FULL_EFFECTIVENESS, UNDAMAGED, SIDES, addShip, ratingsOf, type Controller, type Doctrine, type Game, type Side } from '../domain/game';
import { useClasses } from '../storage/shipClasses';
import { AttitudeInput } from './AttitudeInput';
import { HexOffsetInput, ZERO_DRAFT, draftToPosition, type OffsetDraft } from './HexOffsetInput';
import { VelocityInput, type VelocityDraft } from './VelocityInput';
import { draftToVelocity, velocityToDraft } from './drafts';

export function AddShipPanel({ game, update }: { game: Game; update: (fn: (g: Game) => Game) => void }) {
  const { classes } = useClasses();
  const [classId, setClassId] = useState(classes[0]?.id ?? '');
  const [name, setName] = useState('');
  const [side, setSide] = useState<Side>('red');
  const [controller, setController] = useState<Controller>('ai');
  const [doctrine, setDoctrine] = useState<Doctrine>('balanced');
  const [pos, setPos] = useState<OffsetDraft>(ZERO_DRAFT);
  const [vel, setVel] = useState<VelocityDraft>(velocityToDraft(velocity({})));
  const [attitude, setAttitude] = useState<Attitude>(LEVEL_ATTITUDE);
  const [error, setError] = useState<string | null>(null);

  const selected = classes.find((c) => c.id === classId) ?? classes[0];

  const add = () => {
    if (!selected) {
      setError('add a ship class first (Ship classes tab)');
      return;
    }
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
        name: name.trim() || `${selected.name} ${n}`,
        side,
        controller,
        doctrine,
        shipClass: selected,
        ratings: ratingsOf(selected),
        position,
        velocity: v,
        attitude,
        halfDisplacements: [],
        bda: UNDAMAGED,
        effectiveness: FULL_EFFECTIVENESS,
        outOfAction: false,
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
          <select value={selected?.id ?? ''} onChange={(e) => setClassId(e.target.value)}>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
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
      {selected && (
        <p className="note">
          {selected.name}: cost {selected.baseCost}, thrust {selected.maxThrust}, pivot {selected.maxPivot}, roll {selected.maxRoll}; bands {selected.bands.short.min}–{selected.bands.short.max} /{' '}
          {selected.bands.medium.min}–{selected.bands.medium.max} / {selected.bands.long.min}–{selected.bands.long.max}.
        </p>
      )}
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
