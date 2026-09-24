import { useState } from 'react';
import { AvidHelperScreen } from './ui/AvidHelperScreen';
import { ClassesScreen } from './ui/ClassesScreen';
import { GameScreen } from './ui/GameScreen';
import { GamesScreen } from './ui/GamesScreen';

type Route = { screen: 'games' } | { screen: 'game'; id: string } | { screen: 'classes' } | { screen: 'avid' };

export function App() {
  const [route, setRoute] = useState<Route>({ screen: 'games' });
  const tab = route.screen === 'game' ? 'games' : route.screen;
  return (
    <div className="app">
      {route.screen !== 'game' && (
        <nav className="topnav">
          <span className="brand">SITS AI</span>
          <div className="seg" role="tablist">
            {(
              [
                ['games', 'Games'],
                ['classes', 'Ship classes'],
                ['avid', 'AVID helper'],
              ] as const
            ).map(([s, label]) => (
              <button key={s} type="button" role="tab" aria-pressed={tab === s} onClick={() => setRoute({ screen: s })}>
                {label}
              </button>
            ))}
          </div>
          <span className="note">an opponent for the Saganami Island Tactical Simulator</span>
        </nav>
      )}
      {route.screen === 'games' && <GamesScreen onOpen={(id) => setRoute({ screen: 'game', id })} />}
      {route.screen === 'classes' && <ClassesScreen />}
      {route.screen === 'avid' && <AvidHelperScreen />}
      {route.screen === 'game' && <GameScreen gameId={route.id} onBack={() => setRoute({ screen: 'games' })} />}
    </div>
  );
}
