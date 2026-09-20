import { useState } from 'react';
import { GameScreen } from './ui/GameScreen';
import { GamesScreen } from './ui/GamesScreen';

type Route = { screen: 'games' } | { screen: 'game'; id: string };

export function App() {
  const [route, setRoute] = useState<Route>({ screen: 'games' });
  return (
    <div className="app">
      {route.screen === 'games' && (
        <>
          <nav className="topnav">
            <span className="brand">SITS AI</span>
            <span className="note">an opponent for the Saganami Island Tactical Simulator</span>
          </nav>
          <GamesScreen onOpen={(id) => setRoute({ screen: 'game', id })} />
        </>
      )}
      {route.screen === 'game' && <GameScreen gameId={route.id} onBack={() => setRoute({ screen: 'games' })} />}
    </div>
  );
}
