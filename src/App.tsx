import { useState } from 'react';
import { InspectorApp } from './inspector/InspectorApp';
import { SsdEditor } from './ui/ssd/SsdEditor';

type Screen = 'ships' | 'avid';

export function App() {
  const [screen, setScreen] = useState<Screen>('ships');
  return (
    <div className="app">
      <nav className="topnav">
        <span className="brand">SITS AI</span>
        <div className="seg" role="tablist">
          {(
            [
              ['ships', 'Ship classes'],
              ['avid', 'AVID inspector'],
            ] as [Screen, string][]
          ).map(([s, label]) => (
            <button key={s} type="button" role="tab" aria-pressed={screen === s} onClick={() => setScreen(s)}>
              {label}
            </button>
          ))}
        </div>
      </nav>
      {screen === 'ships' ? <SsdEditor /> : <InspectorApp />}
    </div>
  );
}
