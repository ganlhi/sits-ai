/**
 * One ship's report for the turn: what the table shows. Everything defaults to what the app
 * expects (an AI ship where its orders put it, a player ship drifted along its vectors), so the
 * player only edits what differs. The card is folded to its name and class until opened.
 */
import { useState } from 'react';
import { MOUNTS, positionEquals, type Position } from '../domain/geometry';
import {
  BDA_LABELS,
  BDA_LEVELS,
  CONTROLLERS,
  DOCTRINES,
  DOCTRINE_LABELS,
  MOUNT_NAMES,
  MOUNT_SHORT,
  isOutOfAction,
  removeShip,
  reportShip,
  type Bda,
  type Controller,
  type Doctrine,
  type Effectiveness,
  type Game,
  type Ratings,
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

const RATING_KEYS = ['thrust', 'pivot', 'roll'] as const;
type RatingsDraft = Readonly<Record<(typeof RATING_KEYS)[number], string>>;
const ratingsToDraft = (r: Ratings): RatingsDraft => ({ thrust: String(r.thrust), pivot: String(r.pivot), roll: String(r.roll) });
function draftToRatings(d: RatingsDraft): Ratings | null {
  const out: Partial<Record<(typeof RATING_KEYS)[number], number>> = {};
  for (const k of RATING_KEYS) {
    const t = d[k].trim();
    const n = t === '' ? 0 : Number(t);
    if (!Number.isInteger(n) || n < 0) return null;
    out[k] = n;
  }
  return out as Ratings;
}
const ratingsEqual = (a: Ratings, b: Ratings): boolean => RATING_KEYS.every((k) => a[k] === b[k]);

export interface ShipCardProps {
  readonly game: Game;
  readonly ship: Ship;
  readonly update: (fn: (g: Game) => Game) => void;
  /** Read-only once the AI has plotted from this report. */
  readonly locked?: boolean;
  /** Open the AVID helper with this ship's attitude and ratings; works even when the report is locked. */
  readonly onAvidHelper?: (ship: Ship) => void;
}

export function ShipCard({ ship, update, locked = false, onAvidHelper }: ShipCardProps) {
  const cls = ship.shipClass;
  const report = (patch: Parameters<typeof reportShip>[2]) => update((g) => reportShip(g, ship.id, patch));

  const [pos, setPos] = useDraft<Position, OffsetDraft>(ship.position, draftFromPosition, draftToPosition, positionEquals);
  const [vel, setVel] = useDraft(ship.velocity, velocityToDraft, draftToVelocity, velocityEquals);
  const [eff, setEff] = useDraft(ship.effectiveness, effToDraft, draftToEff, effEquals);
  const [rat, setRat] = useDraft(ship.ratings, ratingsToDraft, draftToRatings, ratingsEqual);

  const posValid = draftToPosition(pos) !== null;
  const velValid = draftToVelocity(vel) !== null;
  const effValid = draftToEff(eff) !== null;
  const ratValid = draftToRatings(rat) !== null;
  const maxOf: Record<(typeof RATING_KEYS)[number], number> = { thrust: cls.maxThrust, pivot: cls.maxPivot, roll: cls.maxRoll };
  const [open, setOpen] = useState(false);

  return (
    <article className={`ship-card side-${ship.side}${isOutOfAction(ship) ? ' out' : ''}${open ? ' open' : ''}`}>
      {/* outside the fieldset: the card must open and close once the report is locked */}
      <div className="row card-title">
        <button type="button" className="fold" aria-expanded={open} onClick={() => setOpen(!open)}>
          <span className="chev" aria-hidden="true">
            {open ? '▾' : '▸'}
          </span>
          {ship.name}
        </button>
        <span className="note">{cls.name}</span>
      </div>
      {open && (
        <fieldset className="plain" disabled={locked}>
          <header>
            {onAvidHelper && (
              // a link, not a button: the fieldset is disabled once the report is locked, and the helper must stay reachable
              <a
                className="button"
                href="#avid"
                title="Open the AVID helper with this ship's markers"
                onClick={(e) => {
                  e.preventDefault();
                  onAvidHelper(ship);
                }}
              >
                AVID
              </a>
            )}
            <span className="note">cost {cls.baseCost}</span>
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
              <AttitudeInput value={ship.attitude} onChange={(attitude) => report({ attitude })} disabled={locked} />
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
              <div className="label note">Ratings this turn</div>
              <div className="row">
                {RATING_KEYS.map((k) => (
                  <label key={k} className="vec-input pct" title={`class maximum ${maxOf[k]}`}>
                    {k}
                    <input
                      value={rat[k]}
                      inputMode="numeric"
                      aria-label={`${k} rating`}
                      onChange={(e) => {
                        const d = { ...rat, [k]: e.target.value };
                        setRat(d);
                        const parsed = draftToRatings(d);
                        if (parsed && !ratingsEqual(parsed, ship.ratings)) report({ ratings: parsed });
                      }}
                    />
                  </label>
                ))}
              </div>
              {!ratValid && <span className="field-msg">whole numbers, 0 or more</span>}
              <table className="list side-table">
                <thead>
                  <tr>
                    <th>Side</th>
                    <th>Battle damage assessment</th>
                    <th>Effectiveness (%)</th>
                  </tr>
                </thead>
                <tbody>
                  {MOUNTS.map((m) => (
                    <tr key={m}>
                      <td title={MOUNT_NAMES[m]}>{MOUNT_SHORT[m]}</td>
                      <td>
                        <select value={ship.bda[m]} aria-label={`${m} battle damage assessment`} onChange={(e) => report({ bda: { ...ship.bda, [m]: e.target.value as Bda } })}>
                          {BDA_LEVELS.map((b) => (
                            <option key={b} value={b}>
                              {BDA_LABELS[b]}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <input
                          className="pct"
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
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!effValid && <span className="field-msg">effectiveness: 0 to 100</span>}
              <label className="row">
                <input type="checkbox" checked={ship.outOfAction} onChange={(e) => report({ outOfAction: e.target.checked })} />
                Out of action (destroyed, surrendered): drifts, neither fires nor is fired at
              </label>
            </div>
          </div>
        </fieldset>
      )}
    </article>
  );
}
