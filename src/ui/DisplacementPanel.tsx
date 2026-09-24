/**
 * Step 2 of the turn, once the AI has plotted: what the AI shows (its Midpoint and EoT markers,
 * and whether thrust displaced the EoT one), and the player's own displaced EoT markers, which
 * the AI shoots at.
 */
import { positionEquals, type Position } from '../domain/geometry';
import { displacementNotice } from '../domain/ai';
import { aiShips, formatPosition, isOutOfAction, reportDisplacement, shipMotion, type Game, type Ship } from '../domain/game';
import { HexOffsetInput, draftFromPosition, draftToPosition, type OffsetDraft } from './HexOffsetInput';
import { useDraft } from './drafts';

type Update = (fn: (g: Game) => Game) => void;

function AiNotice({ ship }: { ship: Ship }) {
  const n = displacementNotice(ship);
  if (!n) return null;
  return (
    <li>
      <b>{ship.name}</b>: Midpoint marker at {formatPosition(n.midpoint)};{' '}
      {n.displacement ? (
        <>
          EoT marker <b>displaced {n.displacement}</b> to <b>{formatPosition(n.endOfTurn)}</b>.
        </>
      ) : (
        <>EoT marker not displaced, at {formatPosition(n.endOfTurn)}.</>
      )}
    </li>
  );
}

function PlayerDisplacement({ ship, editable, update }: { ship: Ship; editable: boolean; update: Update }) {
  const drifted = shipMotion({ ...ship, displacedEot: null }).endOfTurn;
  const eot = ship.displacedEot ?? drifted;
  const [draft, setDraft] = useDraft<Position, OffsetDraft>(eot, draftFromPosition, draftToPosition, positionEquals);
  const report = (p: Position | null) => update((g) => reportDisplacement(g, ship.id, p));

  if (!editable) {
    return (
      <li>
        <b>{ship.name}</b>: {ship.displacedEot ? `EoT marker displaced to ${formatPosition(ship.displacedEot)}.` : `EoT marker not displaced, at ${formatPosition(drifted)}.`}
      </li>
    );
  }
  return (
    <li>
      <label className="row">
        <input type="checkbox" checked={ship.displacedEot !== null} onChange={(e) => report(e.target.checked ? drifted : null)} />
        <b>{ship.name}</b>: EoT marker displaced
        {ship.displacedEot === null && <span className="note">— stays at {formatPosition(drifted)}</span>}
      </label>
      {ship.displacedEot !== null && (
        <>
          <HexOffsetInput
            value={draft}
            onChange={(d) => {
              setDraft(d);
              const p = draftToPosition(d);
              if (p && !positionEquals(p, eot)) report(p);
            }}
          />
          {draftToPosition(draft) === null && <span className="field-msg">whole numbers only</span>}
        </>
      )}
    </li>
  );
}

export function DisplacementPanel({ game, update }: { game: Game; update: Update }) {
  const ai = aiShips(game).filter((s) => s.orders);
  const players = game.ships.filter((s) => !s.orders && !isOutOfAction(s));
  const editable = game.phase === 'plotted';
  return (
    <div className="stack">
      <div>
        <div className="label note">The AI has plotted. Place its markers:</div>
        <ul>
          {ai.map((s) => (
            <AiNotice key={s.id} ship={s} />
          ))}
        </ul>
      </div>
      {players.length > 0 && (
        <div>
          <div className="label note">{editable ? 'Your ships: tick those whose EoT marker thrust displaced, and say where it now is.' : 'Your EoT markers, as reported:'}</div>
          <ul className="displacements">
            {players.map((s) => (
              <PlayerDisplacement key={s.id} ship={s} editable={editable} update={update} />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
