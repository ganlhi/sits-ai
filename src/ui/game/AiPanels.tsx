/**
 * The opponent at the table (PLAN.md Phase 6). In step 2 every AI ship plots and locks first,
 * showing only a seal (a hash of its orders) until all player ships are locked; then the order
 * sheets are revealed in the book's notation, with a one-line reason, so the player can execute
 * them on the table. The seal is what lets the player trust the AI did not peek.
 */
import { useEffect, useState } from 'react';
import { DOCTRINE_LABELS, orderSheet, planOrders, sealOf } from '../../domain/ai';
import { DOCTRINES, shipsOf, type Doctrine, type GameEvent, type GameState, type ShipState } from '../../domain/game';

export function aiShips(game: GameState): ShipState[] {
  return shipsOf(game).filter((s) => !s.destroyed && s.controller === 'ai');
}

export function playerShips(game: GameState): ShipState[] {
  return shipsOf(game).filter((s) => !s.destroyed && s.controller === 'player');
}

export function OrderSheet({ game, ship }: { game: GameState; ship: ShipState }) {
  if (!ship.orders) return <p className="note">No orders.</p>;
  return (
    <div className="order-sheet">
      <ol>
        {orderSheet(game, ship, ship.orders).map((l, i) => (
          <li key={i}>{l}</li>
        ))}
      </ol>
      {ship.orders.rationale && <p className="note">“{ship.orders.rationale}”</p>}
      <p className="note seal">seal {sealOf(ship.orders)}</p>
    </div>
  );
}

export function AiPlotPanel({ game, dispatch }: { game: GameState; dispatch: (e: GameEvent) => void }) {
  const ai = aiShips(game);
  const players = playerShips(game);
  const unplotted = ai.filter((s) => !s.orders);
  const playersLocked = players.every((s) => s.orders);
  const [busy, setBusy] = useState(false);
  const [reveal, setReveal] = useState(false);

  const plot = (ships: ShipState[]) => {
    setBusy(true);
    // let the browser paint the "plotting" state before the synchronous search
    setTimeout(() => {
      try {
        for (const s of ships) {
          const plan = planOrders(game, s.id, s.doctrine, (game.turn * 7919 + s.id.length * 31) >>> 0);
          dispatch({ type: 'OrdersIssued', shipId: s.id, orders: plan.orders });
        }
      } finally {
        setBusy(false);
      }
    }, 0);
  };

  // the AI plots as soon as the plotting step opens, before the player has entered anything
  useEffect(() => {
    if (unplotted.length && !busy) plot(unplotted);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.turn, game.step, unplotted.length]);

  if (ai.length === 0) return null;
  const shown = reveal || playersLocked;

  return (
    <section className="panel ai-panel">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h2>Opponent</h2>
        <div className="row">
          {busy && <span className="note">plotting…</span>}
          {!shown && (
            <button type="button" onClick={() => setReveal(true)}>
              Reveal early
            </button>
          )}
          <button type="button" onClick={() => { for (const s of ai) if (s.orders) dispatch({ type: 'OrdersCleared', shipId: s.id }); }} disabled={busy || !ai.some((s) => s.orders)}>
            Re-plot
          </button>
        </div>
      </div>
      {!shown && (
        <p className="note">
          Orders are locked and sealed. Lock your own ships to reveal them — {players.filter((s) => s.orders).length}/{players.length} locked.
        </p>
      )}
      {ai.map((s) => (
        <div key={s.id} className="ai-ship">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <h3>
              {s.name} <span className="note">{DOCTRINE_LABELS[s.doctrine]}</span>
            </h3>
            {s.orders ? <span className="tag locked">sealed {sealOf(s.orders)}</span> : <span className="tag">plotting…</span>}
          </div>
          {shown && s.orders && <OrderSheet game={game} ship={s} />}
        </div>
      ))}
    </section>
  );
}

export function DoctrineSelect({ value, onChange }: { value: Doctrine; onChange: (d: Doctrine) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value as Doctrine)}>
      {DOCTRINES.map((d) => (
        <option key={d} value={d}>
          {DOCTRINE_LABELS[d]}
        </option>
      ))}
    </select>
  );
}
