import { planAll } from '../domain/ai';
import { aiShips, isOutOfAction, nextTurn, undoTurn, type Game } from '../domain/game';
import { useGame } from '../storage/games';
import { AddShipPanel } from './AddShipPanel';
import { HexMap } from './HexMap';
import { OrdersPanel } from './OrdersPanel';
import { ShiftTablePanel } from './ShiftTablePanel';
import { ShipCard } from './ShipCard';

export function GameScreen({ gameId, onBack }: { gameId: string; onBack: () => void }) {
  const { game, update } = useGame(gameId);
  if (!game) return <p className="note">Game not found.</p>;

  const ai = aiShips(game).filter((s) => !isOutOfAction(s));
  const needsReveal = ai.length > 0 && !game.revealed;
  const canUndo = game.history.length > 0;

  const reveal = () => update((g: Game) => planAll(g));
  const endTurn = () => update((g: Game) => nextTurn(g));
  const undo = () => update((g: Game) => undoTurn(g) ?? g);

  return (
    <div className="game">
      <header className="game-header">
        <div className="row">
          <button type="button" onClick={onBack}>
            ‹ Games
          </button>
          <h1>{game.name}</h1>
          <span className="note">turn {game.turn}</span>
        </div>
        <div className="row">
          <button type="button" onClick={undo} disabled={!canUndo} title="Back to the start of the previous turn">
            Undo turn
          </button>
        </div>
      </header>

      <div className="game-body">
        <div className="stack">
          <section className="panel">
            <h2>1 · Report the table — start of turn {game.turn}</h2>
            <p className="note">
              For every ship: position (hexes from the map centre), Forward and Top markers, vectors, damage level and how much of each facing still fights. AI ships are pre-filled where their
              orders put them; player ships are drifted along their vectors. Change only what the table disagrees with.
            </p>
            {game.ships.length === 0 ? <p className="note">No ships yet — add them on the right.</p> : game.ships.map((s) => <ShipCard key={s.id} game={game} ship={s} update={update} />)}
          </section>

          <section className="panel ai-panel">
            <h2>2 · AI orders</h2>
            {ai.length === 0 ? (
              <p className="note">No AI ship in action.</p>
            ) : needsReveal ? (
              <div className="row">
                <button type="button" className="primary" onClick={reveal}>
                  Reveal AI orders
                </button>
                <span className="note">Plots pivot, roll, thrust and missile launches for every AI ship from the reports above. Plot your own ships first if you want to keep it honest.</span>
              </div>
            ) : (
              <OrdersPanel game={game} />
            )}
          </section>

          <section className="panel">
            <h2>3 · Next turn</h2>
            <div className="row">
              <button type="button" className="primary" onClick={endTurn} disabled={needsReveal || game.ships.length === 0}>
                Next turn ›
              </button>
              <span className="note">
                {needsReveal
                  ? 'Reveal the AI orders first.'
                  : 'Moves every AI ship to its End-of-Turn marker with its new vectors and attitude, drifts the others, then asks for the next report. Undo turn takes it back.'}
              </span>
            </div>
          </section>
        </div>

        <aside className="panel">
          <h2>Table</h2>
          <HexMap game={game} />
          <p className="note">The highlighted hex is the centre of the map. Numbers are altitudes; markers appear for AI ships once their orders are revealed. Scroll or pinch to zoom, drag to pan, double-click to fit.</p>
          <ShiftTablePanel game={game} update={update} />
          <AddShipPanel game={game} update={update} />
        </aside>
      </div>
    </div>
  );
}
