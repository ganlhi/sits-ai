import { useEffect, useState, type ChangeEvent } from 'react';
import { deleteGame, exportGame, importGame, listGames, type GameRow } from '../../storage/db';
import { createGame } from '../../storage/games';
import { forgetGameStore } from '../../storage/gameStore';

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
  const [games, setGames] = useState<GameRow[] | null>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const refresh = () => listGames().then(setGames).catch((e) => setError(String(e)));
  useEffect(() => {
    void refresh();
  }, []);

  const onCreate = async () => {
    const n = name.trim() || `Game ${new Date().toLocaleDateString()}`;
    const id = await createGame(n);
    setName('');
    onOpen(id);
  };
  const onDelete = async (g: GameRow) => {
    if (!window.confirm(`Delete "${g.name}" and its whole log?`)) return;
    await deleteGame(g.id);
    forgetGameStore(g.id);
    void refresh();
  };
  const onExport = async (g: GameRow) => download(`${g.name.replace(/[^\w-]+/g, '_')}.sits.json`, await exportGame(g.id));
  const onImport = (ev: ChangeEvent<HTMLInputElement>) => {
    const file = ev.target.files?.[0];
    if (!file) return;
    file
      .text()
      .then(importGame)
      .then(() => {
        setError(null);
        void refresh();
      })
      .catch((e) => setError(`${file.name}: ${e instanceof Error ? e.message : String(e)}`));
    ev.target.value = '';
  };

  return (
    <div className="games">
      <section className="panel">
        <h2>New game</h2>
        <div className="row">
          <input value={name} placeholder="name" onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void onCreate()} />
          <button type="button" onClick={() => void onCreate()}>
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
        {games === null ? (
          <p className="note">Loading…</p>
        ) : games.length === 0 ? (
          <p className="note">No games yet. Create one, add the ships on the table, and the app walks you through each turn.</p>
        ) : (
          <table className="games-table">
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
                  <td>{g.turn === 0 ? 'setup' : g.turn}</td>
                  <td>{g.shipCount}</td>
                  <td>{new Date(g.updatedAt).toLocaleString()}</td>
                  <td className="row">
                    <button type="button" onClick={() => onOpen(g.id)}>
                      Open
                    </button>
                    <button type="button" onClick={() => void onExport(g)}>
                      Export
                    </button>
                    <button type="button" onClick={() => void onDelete(g)}>
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
