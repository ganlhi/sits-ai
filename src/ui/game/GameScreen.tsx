import { useState } from 'react';
import { TURN_STEPS, TURN_STEP_TITLES, advanceEvent, isSetupPhase, retreatEvent, shipsOf } from '../../domain/game';
import { useGame } from '../../storage/gameStore';
import { HexMap } from './HexMap';
import { SetupPanel } from './SetupPanel';
import { ShipPanel } from './ShipPanel';
import { EndOfTurnStep, ImpactStep, LaunchStep, MarkersStep, MoveStep, PlotStep } from './StepPanels';

export function GameScreen({ gameId, onBack }: { gameId: string; onBack: () => void }) {
  const { state: game, loading, error, dispatch, undo, canUndo } = useGame(gameId);
  const [selected, setSelected] = useState<string | null>(null);
  const [showLog, setShowLog] = useState(false);

  if (loading || !game) return <p className="note">{loading ? 'Loading…' : 'Game not found.'}</p>;

  const ships = shipsOf(game);
  const sel = ships.find((s) => s.id === selected) ?? ships[0];
  const setup = isSetupPhase(game);

  const stepContent = () => {
    switch (game.step) {
      case 'markers':
        return <MarkersStep game={game} />;
      case 'plot':
        return <PlotStep game={game} dispatch={dispatch} />;
      case 'launch':
        return <LaunchStep game={game} />;
      case 'earlyImpact':
        return <ImpactStep game={game} timing="early" dispatch={dispatch} />;
      case 'moveMidpoint':
        return <MoveStep game={game} fraction={0.5} />;
      case 'middleImpact':
        return <ImpactStep game={game} timing="middle" dispatch={dispatch} />;
      case 'moveEot':
        return <MoveStep game={game} fraction={1} />;
      case 'lateImpact':
        return <ImpactStep game={game} timing="late" dispatch={dispatch} />;
      case 'endOfTurn':
        return <EndOfTurnStep game={game} dispatch={dispatch} />;
    }
  };

  const unplotted = ships.filter((s) => !s.destroyed && !s.orders).length;
  const back = retreatEvent(game);

  return (
    <div className="game">
      <header className="game-header">
        <div className="row">
          <button type="button" onClick={onBack}>
            ‹ Games
          </button>
          <h1>{game.name}</h1>
          <span className="note">{setup ? 'setting up' : `turn ${game.turn}`}</span>
        </div>
        <div className="row">
          {error && <span className="field-msg">{error}</span>}
          <button type="button" onClick={() => setShowLog((v) => !v)}>
            Log
          </button>
          <button type="button" onClick={undo} disabled={!canUndo}>
            Undo
          </button>
        </div>
      </header>

      {showLog && (
        <section className="panel">
          <h2>Log</h2>
          <ul className="log">
            {game.log.slice(-40).map((l, i) => (
              <li key={i}>
                <span className="note">
                  T{l.turn} {l.step}
                </span>{' '}
                {l.text}
              </li>
            ))}
          </ul>
        </section>
      )}

      {setup ? (
        <div className="game-body">
          <SetupPanel game={game} dispatch={dispatch} />
          <aside className="panel">
            <h2>Table</h2>
            <HexMap game={game} selected={sel?.id} onSelect={setSelected} showMarkers={false} />
          </aside>
        </div>
      ) : (
        <>
          <nav className="stepbar" aria-label="turn sequence">
            {TURN_STEPS.map((s, i) => (
              <button key={s} type="button" className={s === game.step ? 'current' : TURN_STEPS.indexOf(game.step) > i ? 'done' : ''} onClick={() => dispatch({ type: 'StepChanged', step: s })} title={TURN_STEP_TITLES[s]}>
                {i + 1}
              </button>
            ))}
            <span className="step-title">{TURN_STEP_TITLES[game.step]}</span>
            <span className="grow" />
            <button type="button" onClick={() => back && dispatch(back)} disabled={!back}>
              ‹ Back
            </button>
            <button
              type="button"
              className="primary"
              onClick={() => {
                if (game.step === 'plot' && unplotted > 0 && !window.confirm(`${unplotted} ship(s) have no orders and will drift. Continue?`)) return;
                if (game.step === 'endOfTurn' && !window.confirm(`End turn ${game.turn}? Ships move to their End-of-Turn markers and vectors consolidate.`)) return;
                dispatch(advanceEvent(game));
              }}
            >
              {game.step === 'endOfTurn' ? `End turn ${game.turn} ›` : 'Next ›'}
            </button>
          </nav>
          <div className="game-body">
            <div>{stepContent()}</div>
            <aside className="panel">
              <h2>Table</h2>
              <HexMap game={game} selected={sel?.id} onSelect={setSelected} />
              <div className="seg ship-tabs" role="tablist">
                {ships.map((s) => (
                  <button key={s.id} type="button" role="tab" aria-pressed={sel?.id === s.id} onClick={() => setSelected(s.id)} className={s.destroyed ? 'dead' : ''}>
                    {s.name}
                  </button>
                ))}
              </div>
              {sel && <ShipPanel game={game} ship={sel} dispatch={dispatch} />}
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
