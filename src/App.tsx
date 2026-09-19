import { lazy, Suspense, useState } from 'react';
import { GamesScreen } from './ui/game/GamesScreen';
import { GameScreen } from './ui/game/GameScreen';
import { SsdEditor } from './ui/ssd/SsdEditor';

const InspectorApp = lazy(() => import('./inspector/InspectorApp').then((m) => ({ default: m.InspectorApp })));

type Route = { screen: 'games' } | { screen: 'game'; id: string } | { screen: 'ships' } | { screen: 'avid' };

export function App() {
  const [route, setRoute] = useState<Route>({ screen: 'games' });
  const tab = route.screen === 'game' ? 'games' : route.screen;
  return (
    <div className="app">
      <nav className="topnav">
        <span className="brand">SITS AI</span>
        <div className="seg" role="tablist">
          {(
            [
              ['games', 'Games'],
              ['ships', 'Ship classes'],
              ['avid', 'AVID inspector'],
            ] as const
          ).map(([s, label]) => (
            <button key={s} type="button" role="tab" aria-pressed={tab === s} onClick={() => setRoute({ screen: s })}>
              {label}
            </button>
          ))}
        </div>
      </nav>
      {route.screen === 'games' && <GamesScreen onOpen={(id) => setRoute({ screen: 'game', id })} />}
      {route.screen === 'game' && <GameScreen gameId={route.id} onBack={() => setRoute({ screen: 'games' })} />}
      {route.screen === 'ships' && <SsdEditor />}
      {route.screen === 'avid' && (
        <Suspense fallback={<p className="note">Loading the inspector…</p>}>
          <InspectorApp />
        </Suspense>
      )}
    </div>
  );
}
