/**
 * One ship's report for the turn: what the table shows. Everything defaults to what the app
 * expects (an AI ship where its orders put it, a player ship drifted along its vectors), so the
 * player only edits what differs.
 */
import { MOUNTS, positionEquals, type Position } from '../domain/geometry';
import {
  BDA_LABELS,
  BDA_LEVELS,
  CONTROLLERS,
  DOCTRINES,
  DOCTRINE_LABELS,
  MOUNT_SHORT,
  isOutOfAction,
  removeShip,
  reportShip,
  shipClassOf,
  type Bda,
  type Controller,
  type Doctrine,
  type Effectiveness,
  type Game,
  type Ship,
} from '../domain/game';
import { AttitudeInput } from './AttitudeInput';
import { HexOffsetInput, draftFromPosition, draftToPosition, type OffsetDraft } from './HexOffsetInput';
import { VelocityInput } from './VelocityInput';
import { draftToVelocity, parsePercent, useDraft, velocityEquals, velocityToDraft } from './drafts';

type EffDraft = Readonly<Record<(typeof MOUNTS)[number], string>>;
const effToDraft = (e: Effectiveness): EffDraft => ({ forward: String(e.forward), aft: String(e.aft), port: String(e.port), starboard: String(e.starboard) });
function draftToEff(d: EffDraft): Effectiveness | null {
  const out: Partial<Record<(typeof MOUNTS)[number], number>> = {};
  for (const m of MOUNTS) {
    const n = parsePercent(d[m]);
    if (n === null) return null;
    out[m] = n;
  }
  return out as Effectiveness;
}
const effEquals = (a: Effectiveness, b: Effectiveness): boolean => MOUNTS.every((m) => a[m] === b[m]);

export interface ShipCardProps {
  readonly game: Game;
  readonly ship: Ship;
  readonly update: (fn: (g: Game) => Game) => void;
}

export function ShipCard({ ship, update }: ShipCardProps) {
  const cls = shipClassOf(ship);
  const report = (patch: Parameters<typeof reportShip>[2]) => update((g) => reportShip(g, ship.id, patch));

  const [pos, setPos] = useDraft<Position, OffsetDraft>(ship.position, draftFromPosition, draftToPosition, positionEquals);
  const [vel, setVel] = useDraft(ship.velocity, velocityToDraft, draftToVelocity, velocityEquals);
  const [eff, setEff] = useDraft(ship.effectiveness, effToDraft, draftToEff, effEquals);

  const posValid = draftToPosition(pos) !== null;
  const velValid = draftToVelocity(vel) !== null;
  const effValid = draftToEff(eff) !== null;

  return (
    <article className={`ship-card side-${ship.side}${isOutOfAction(ship) ? ' out' : ''}`}>
      <header>
        <h3>{ship.name}</h3>
        <span className="note">
          {cls.className} {cls.hullType}
        </span>
        <span className="tag">{ship.side}</span>
        <div className="seg" role="group" aria-label="controller">
          {CONTROLLERS.map((c: Controller) => (
            <button key={c} type="button" aria-pressed={ship.controller === c} onClick={() => report({ controller: c })}>
              {c}
            </button>
          ))}
        </div>
        {ship.controller === 'ai' && (
          <select value={ship.doctrine} aria-label="doctrine" onChange={(e) => report({ doctrine: e.target.value as Doctrine })}>
            {DOCTRINES.map((d) => (
              <option key={d} value={d}>
                {DOCTRINE_LABELS[d]}
              </option>
            ))}
          </select>
        )}
        <span className="grow" />
        <button
          type="button"
          onClick={() => {
            if (window.confirm(`Remove ${ship.name} from the game?`)) update((g) => removeShip(g, ship.id));
          }}
        >
          Remove
        </button>
      </header>

      <div className="report-grid">
        <div>
          <div className="label note">Position</div>
          <HexOffsetInput
            value={pos}
            onChange={(d) => {
              setPos(d);
              const p = draftToPosition(d);
              if (p && !positionEquals(p, ship.position)) report({ position: p });
            }}
          />
          {!posValid && <span className="field-msg">whole numbers only</span>}
        </div>
        <div>
          <div className="label note">Orientation</div>
          <AttitudeInput value={ship.attitude} onChange={(attitude) => report({ attitude })} />
        </div>
        <div>
          <div className="label note">Vectors</div>
          <VelocityInput
            value={vel}
            onChange={(d) => {
              setVel(d);
              const v = draftToVelocity(d);
              if (v && !velocityEquals(v, ship.velocity)) report({ velocity: v });
            }}
          />
          {!velValid && <span className="field-msg">whole numbers, 0 or more</span>}
        </div>
        <div>
          <div className="field">
            <label>Battle damage assessment</label>
            <select value={ship.bda} onChange={(e) => report({ bda: e.target.value as Bda })}>
              {BDA_LEVELS.map((b) => (
                <option key={b} value={b}>
                  {BDA_LABELS[b]}
                </option>
              ))}
            </select>
          </div>
          <div className="label note">Combat effectiveness per facing (%)</div>
          <div className="row">
            {MOUNTS.map((m) => (
              <label key={m} className="vec-input pct">
                {MOUNT_SHORT[m]}
                <input
                  value={eff[m]}
                  inputMode="numeric"
                  aria-label={`${m} effectiveness`}
                  onChange={(e) => {
                    const d = { ...eff, [m]: e.target.value };
                    setEff(d);
                    const parsed = draftToEff(d);
                    if (parsed && !effEquals(parsed, ship.effectiveness)) report({ effectiveness: parsed });
                  }}
                />
              </label>
            ))}
          </div>
          {!effValid && <span className="field-msg">0 to 100</span>}
        </div>
      </div>
    </article>
  );
}
