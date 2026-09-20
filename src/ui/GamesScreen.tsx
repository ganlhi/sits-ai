import { useState, type ChangeEvent } from 'react';
import { createGame, deleteGame, exportGame, importGame, listGames, loadGame } from '../storage/games';

function download(name: string, text: string): void {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function GamesScreen({ onOpen }: { onOpen: (id: string) => void }) {
  const [games, setGames] = useState(() => listGames());
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const refresh = () => setGames(listGames());

  const onCreate = () => {
    const g = createGame(name.trim() || `Game ${new Date().toLocaleDateString()}`);
    setName('');
    onOpen(g.id);
  };
  const onDelete = (id: string, gameName: string) => {
    if (!window.confirm(`Delete "${gameName}"?`)) return;
    deleteGame(id);
    refresh();
  };
  const onExport = (id: string, gameName: string) => {
    const g = loadGame(id);
    if (g) download(`${gameName.replace(/[^\w-]+/g, '_')}.sits.json`, exportGame(g));
  };
  const onImport = (ev: ChangeEvent<HTMLInputElement>) => {
    const file = ev.target.files?.[0];
    if (!file) return;
    file
      .text()
      .then((t) => {
        importGame(t);
        setError(null);
        refresh();
      })
      .catch((e: unknown) => setError(`${file.name}: ${e instanceof Error ? e.message : String(e)}`));
    ev.target.value = '';
  };

  return (
    <div className="games">
      <section className="panel">
        <h2>New game</h2>
        <div className="row">
          <input type="text" value={name} placeholder="name" onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && onCreate()} />
          <button type="button" className="primary" onClick={onCreate}>
            Create
          </button>
          <label className="button">
            Import game
            <input type="file" accept="application/json,.json" onChange={onImport} hidden />
          </label>
        </div>
        {error && <p className="field-msg">{error}</p>}
      </section>
      <section className="panel">
        <h2>Games</h2>
        {games.length === 0 ? (
          <p className="note">No games yet. Create one, add the ships on the table, and report the table at the start of each turn.</p>
        ) : (
          <table className="list">
            <thead>
              <tr>
                <th>Name</th>
                <th>Turn</th>
                <th>Ships</th>
                <th>Last played</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {games.map((g) => (
                <tr key={g.id}>
                  <td>
                    <button type="button" className="link" onClick={() => onOpen(g.id)}>
                      {g.name}
                    </button>
                  </td>
                  <td>{g.turn}</td>
                  <td>{g.shipCount}</td>
                  <td>{new Date(g.updatedAt).toLocaleString()}</td>
                  <td className="row">
                    <button type="button" onClick={() => onOpen(g.id)}>
                      Open
                    </button>
                    <button type="button" onClick={() => onExport(g.id, g.name)}>
                      Export
                    </button>
                    <button type="button" onClick={() => onDelete(g.id, g.name)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
