import { planFire, planMovement } from '../domain/ai';
import { aiShips, isOutOfAction, nextTurn, undoStep, type Game, type Ship } from '../domain/game';
import { useGame } from '../storage/games';
import { AddShipPanel } from './AddShipPanel';
import { DisplacementPanel } from './DisplacementPanel';
import { HexMap } from './HexMap';
import { OrdersPanel } from './OrdersPanel';
import { ShiftTablePanel } from './ShiftTablePanel';
import { ShipCard } from './ShipCard';

const UNDO_TITLE: Readonly<Record<Game['phase'], string>> = {
  report: 'Back to the end of the previous turn',
  plotted: 'Take back the AI plot and return to the report',
  fired: 'Take back the AI launches and return to the displacement report',
};

export function GameScreen({ gameId, onBack, onAvidHelper }: { gameId: string; onBack: () => void; onAvidHelper: (ship: Ship) => void }) {
  const { game, update } = useGame(gameId);
  if (!game) return <p className="note">Game not found.</p>;

  const ai = aiShips(game).filter((s) => !isOutOfAction(s));
  const phase = game.phase;
  const reporting = phase === 'report';
  const canEndTurn = game.ships.length > 0 && (ai.length === 0 || phase === 'fired');
  const canUndo = game.history.length > 0;

  const plot = () => update((g: Game) => planMovement(g));
  const fire = () => update((g: Game) => planFire(g));
  const endTurn = () => update((g: Game) => nextTurn(g));
  const undo = () => update((g: Game) => undoStep(g) ?? g);

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
          <button type="button" onClick={undo} disabled={!canUndo} title={UNDO_TITLE[phase]}>
            Undo
          </button>
        </div>
      </header>

      <div className="game-body">
        <div className="stack">
          <section className="panel">
            <h2>1 · Report the table — start of turn {game.turn}</h2>
            <p className="note">
              {reporting
                ? 'For every ship: position (hexes from the map centre), Forward and Top markers, vectors, ratings, and per side the damage and how much still fights. AI ships are pre-filled where their orders put them; player ships where their EoT marker was. Change only what the table disagrees with.'
                : 'Locked: the AI has plotted from this report. Undo takes the plot back if the report needs correcting.'}
            </p>
            {game.ships.length === 0 ? (
              <p className="note">No ships yet — add them on the right.</p>
            ) : (
              game.ships.map((s) => <ShipCard key={s.id} game={game} ship={s} update={update} locked={!reporting} onAvidHelper={onAvidHelper} />)
            )}
          </section>

          <section className="panel ai-panel">
            <h2>2 · AI plotting</h2>
            {ai.length === 0 ? (
              <p className="note">No AI ship in action.</p>
            ) : reporting ? (
              <div className="row">
                <button type="button" className="primary" onClick={plot}>
                  AI plotting
                </button>
                <span className="note">Plot your own ships first. The AI plots pivot, roll and thrust from the report above, and shows only whether thrust displaced its EoT markers.</span>
              </div>
            ) : (
              <DisplacementPanel game={game} update={update} />
            )}
          </section>

          <section className="panel ai-panel">
            <h2>3 · AI shooting</h2>
            {ai.length === 0 ? (
              <p className="note">No AI ship in action.</p>
            ) : phase === 'plotted' ? (
              <div className="row">
                <button type="button" className="primary" onClick={fire}>
                  AI shooting
                </button>
                <span className="note">Once your displaced EoT markers are reported above. The AI chooses its launches, then shows its full orders; the plot does not change.</span>
              </div>
            ) : phase === 'fired' ? (
              <OrdersPanel game={game} />
            ) : (
              <p className="note">After the AI plotting.</p>
            )}
          </section>

          <section className="panel">
            <h2>4 · Next turn</h2>
            <div className="row">
              <button type="button" className="primary" onClick={endTurn} disabled={!canEndTurn}>
                Next turn ›
              </button>
              <span className="note">
                {canEndTurn
                  ? 'Moves every AI ship to its End-of-Turn marker with its new vectors and attitude, moves the others to their EoT markers, then asks for the next report. Undo takes it back.'
                  : game.ships.length === 0
                    ? 'Add ships first.'
                    : 'Run the AI plotting and shooting first.'}
              </span>
            </div>
          </section>
        </div>

        <aside className="panel">
          <h2>Table</h2>
          <HexMap game={game} />
          <p className="note">The highlighted hex is the centre of the map. Numbers are altitudes; Midpoint and EoT markers appear once the ships have plotted. Scroll or pinch to zoom, drag to pan, double-click to fit.</p>
          <ShiftTablePanel game={game} update={update} />
          {reporting ? <AddShipPanel game={game} update={update} /> : <p className="note">Ships can be added or removed during the report, before the AI plots.</p>}
        </aside>
      </div>
    </div>
  );
}
