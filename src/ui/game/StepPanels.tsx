/**
 * The content of each step of the turn (RULES.md §3), as prompts for the table with the
 * numbers the app can work out for you.
 */
import { Suspense, lazy, useState } from 'react';
import { MOUNTS, formatVelocity, windowLabel, type ArcColour, type Mount } from '../../domain/geometry';
import { attitudeAt, engagements, markersAt, shipMotion, shipsOf, shipClassOf, type GameEvent, type GameState, type ShipState } from '../../domain/game';
import { MARKER_NAMES } from '../../domain/geometry';
import { AvidFlat } from '../avid/AvidFlat';
import { BeamResolver, DamageControlPanel, ImpactResolver } from './CombatPanels';
import { fmtPos } from './HexMap';
import { OrdersPanel } from './OrdersPanel';

// three.js is loaded only when someone asks for the sphere
const AvidSphere = lazy(() => import('../avid/AvidSphere').then((m) => ({ default: m.AvidSphere })));

const live = (g: GameState) => shipsOf(g).filter((s) => !s.destroyed);

function ArcDots({ arcs }: { arcs: Readonly<Record<Mount, ArcColour>> }) {
  return (
    <span className="arc-dots">
      {MOUNTS.map((m) => (
        <span key={m} className={`arc-dot arc-${arcs[m]}`} title={`${m}: ${arcs[m]}`}>
          {m[0]!.toUpperCase()}
        </span>
      ))}
    </span>
  );
}

export function MarkersStep({ game }: { game: GameState }) {
  return (
    <section className="panel">
      <h2>Place the markers</h2>
      <p className="note">Midpoint at current position + half the vector; End of Turn at position + vector. Displacement from thrust moves the EoT marker in step 2.</p>
      <table className="games-table">
        <thead>
          <tr>
            <th>Ship</th>
            <th>Now</th>
            <th>Vector</th>
            <th>Midpoint</th>
            <th>End of Turn</th>
          </tr>
        </thead>
        <tbody>
          {live(game).map((s) => {
            const m = shipMotion({ ...s, orders: null });
            return (
              <tr key={s.id}>
                <td>
                  <b>{s.name}</b>
                </td>
                <td className="note">{fmtPos(s.position)}</td>
                <td>{formatVelocity(s.velocity)}</td>
                <td>{fmtPos(m.midpoint)}</td>
                <td>{fmtPos(m.endOfTurn)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

export function PlotStep({ game, dispatch }: { game: GameState; dispatch: (e: GameEvent) => void }) {
  const ships = live(game);
  const locked = ships.filter((s) => s.orders).length;
  return (
    <section className="panel">
      <h2>
        Plot orders <span className="note">{locked}/{ships.length} locked</span>
      </h2>
      <p className="note">Plotting is simultaneous and secret: lock every ship before revealing. AI ships take their own orders from Phase 6; until then enter both sides here.</p>
      {ships.map((s) => (
        <OrdersPanel key={s.id} game={game} ship={s} dispatch={dispatch} />
      ))}
    </section>
  );
}

export function LaunchStep({ game }: { game: GameState }) {
  const es = engagements(game);
  return (
    <section className="panel">
      <h2>Missile launch</h2>
      <p className="note">Salvoes by End-of-Turn to End-of-Turn range. Early: bearing from current to current; Middle: current to the target's Midpoint; Late: own Midpoint to the target's EoT. The Impact Window is the reciprocal. Letters show which mounts bear now (black cannot).</p>
      {es.length === 0 && <p className="note">No opposing ships.</p>}
      <table className="games-table">
        <thead>
          <tr>
            <th>Shooter → target</th>
            <th>EoT range</th>
            <th>Band</th>
            <th>Early</th>
            <th>Middle</th>
            <th>Late</th>
            <th>Bears</th>
          </tr>
        </thead>
        <tbody>
          {es.map((e) => (
            <tr key={`${e.shooter.id}-${e.target.id}`}>
              <td>
                <b>{e.shooter.name}</b> → {e.target.name}
              </td>
              <td>{e.eotRange}</td>
              <td>{e.band ? `MQL ${e.band.baseMql} · ${e.band.salvoes.map((t) => t[0]!.toUpperCase()).join('')}` : 'out of range'}</td>
              {e.salvoes.map((sv) => (
                <td key={sv.timing} className={sv.available ? '' : 'note'}>
                  {sv.available ? (
                    <>
                      r{sv.bearing.range} {sv.bearing.window ? windowLabel(sv.bearing.window) : '—'}
                      <br />
                      <span className="note">impact {sv.impact ? windowLabel(sv.impact) : '—'}</span>
                    </>
                  ) : (
                    '—'
                  )}
                </td>
              ))}
              <td>
                <ArcDots arcs={e.arcs} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export function ImpactStep({ game, timing, dispatch }: { game: GameState; timing: 'early' | 'middle' | 'late'; dispatch: (e: GameEvent) => void }) {
  const es = engagements(game).filter((e) => e.salvoes.find((s) => s.timing === timing)?.available);
  const beams = timing !== 'early';
  const fraction = timing === 'middle' ? 0.5 : 1;
  return (
    <section className="panel">
      <h2>{timing === 'early' ? 'Early' : timing === 'middle' ? 'Middle' : 'Late'} missile impact{beams ? ` · ${timing === 'middle' ? 'first' : 'second'} beam impact` : ''}</h2>
      {es.length === 0 ? <p className="note">No {timing} salvoes were available this turn.</p> : (
        <ul>
          {es.map((e) => {
            const sv = e.salvoes.find((s) => s.timing === timing)!;
            return (
              <li key={`${e.shooter.id}-${e.target.id}`}>
                <b>{e.shooter.name}</b>'s {timing} salvo on <b>{e.target.name}</b>: range {sv.bearing.range}, impact window {sv.impact ? windowLabel(sv.impact) : '—'}, base MQL {e.band?.baseMql}. Resolve ECM, then active defenses, then damage; mark it on {e.target.name}'s sheet.
              </li>
            );
          })}
        </ul>
      )}
      {es.length > 0 && <ImpactResolver game={game} timing={timing} dispatch={dispatch} />}
      {beams && <BeamNotes game={game} fraction={fraction} />}
      {beams && <BeamResolver game={game} fraction={fraction} dispatch={dispatch} />}
      <p className="note">Rolled at the table instead? Tap the destroyed boxes in the ship panel.</p>
    </section>
  );
}

function BeamNotes({ game, fraction }: { game: GameState; fraction: 0.5 | 1 }) {
  const ships = live(game);
  const rows: { shooter: ShipState; target: ShipState; range: number; window: string; arcs: Record<Mount, ArcColour>; wedge: boolean }[] = [];
  // beams are shot from current to current position: at this step the ships sit at their Midpoint (0.5) or EoT (1) markers
  for (const a of ships) {
    for (const b of ships) {
      if (a.side === b.side) continue;
      const pa = fraction === 0.5 ? shipMotion(a).midpoint : shipMotion(a).endOfTurn;
      const pb = fraction === 0.5 ? shipMotion(b).midpoint : shipMotion(b).endOfTurn;
      const e = engagements({ ...game, ships: { ...game.ships, [a.id]: { ...a, position: pa, attitude: attitudeAt(a, fraction), orders: null }, [b.id]: { ...b, position: pb, attitude: attitudeAt(b, fraction), orders: null } } }).find((x) => x.shooter.id === a.id && x.target.id === b.id);
      if (e) rows.push({ shooter: a, target: b, range: e.now.range, window: e.now.window ? windowLabel(e.now.window) : '—', arcs: e.arcs, wedge: e.targetWedge });
    }
  }
  return (
    <>
      <h3>Beams</h3>
      <table className="games-table">
        <thead>
          <tr>
            <th>Shooter → target</th>
            <th>Range</th>
            <th>Bearing</th>
            <th>Bears</th>
            <th>Target wedge</th>
            <th>Beam damage at this range</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const cls = shipClassOf(game, r.shooter);
            const idx = r.range <= 1 ? 0 : r.range - 1;
            const beamsHere = MOUNTS.filter((m) => r.arcs[m] !== 'black').flatMap((m) =>
              cls.mounts[m].weapons.filter((w) => (w.type === 'L' || w.type === 'G' || w.type === 'ET') && idx < w.damage.length).map((w) => `${cls.mounts[m].name.split(' ')[0]} ${w.label} → ${w.damage[idx]}`),
            );
            return (
              <tr key={`${r.shooter.id}-${r.target.id}`}>
                <td>
                  <b>{r.shooter.name}</b> → {r.target.name}
                </td>
                <td>{r.range}</td>
                <td>{r.window}</td>
                <td>
                  <ArcDots arcs={r.arcs} />
                </td>
                <td>{r.wedge ? 'yes — beams cannot hurt it' : 'no'}</td>
                <td className="note">{beamsHere.length ? beamsHere.join('; ') : 'nothing in range'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
  );
}

export function MoveStep({ game, fraction }: { game: GameState; fraction: 0.5 | 1 }) {
  const [sphere, setSphere] = useState<string | null>(null);
  return (
    <section className="panel">
      <h2>{fraction === 0.5 ? 'Move to the Midpoint markers; apply half the pivot and half the roll' : 'Move to the End-of-Turn markers; finish the pivot and roll'}</h2>
      <div className="move-grid">
        {live(game).map((s) => {
          const m = shipMotion(s);
          const mk = markersAt(s, fraction);
          const pivoting = s.orders?.maneuver.pivotTo || s.orders?.maneuver.roll;
          return (
            <div key={s.id} className="move-card">
              <h3>
                {s.name} {!pivoting && <span className="note">no attitude change</span>}
              </h3>
              <p>
                to <b>{fmtPos(fraction === 0.5 ? m.midpoint : m.endOfTurn)}</b>
              </p>
              <div className="row">
                <div style={{ width: 150 }}>
                  <AvidFlat markers={mk} />
                </div>
                <table className="markers">
                  <tbody>
                    {MARKER_NAMES.map((n) => (
                      <tr key={n}>
                        <th>{n}</th>
                        <td>{windowLabel(mk[n])}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button type="button" onClick={() => setSphere(sphere === s.id ? null : s.id)}>
                {sphere === s.id ? 'Hide 3-D' : 'Show in 3-D'}
              </button>
              {sphere === s.id && (
                <div className="view" style={{ marginTop: 6 }}>
                  <Suspense fallback={<p className="note">Loading…</p>}>
                    <AvidSphere attitude={attitudeAt(s, fraction)} />
                  </Suspense>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function EndOfTurnStep({ game, dispatch }: { game: GameState; dispatch: (e: GameEvent) => void }) {
  return (
    <section className="panel">
      <h2>End of turn</h2>
      <p className="note">Add the thrust to the vectors and consolidate; assign damage-control parties; deploy pods or take other actions. Then press End turn.</p>
      <DamageControlPanel game={game} dispatch={dispatch} />
      <table className="games-table">
        <thead>
          <tr>
            <th>Ship</th>
            <th>Vectors + thrust</th>
            <th>Consolidation</th>
            <th>Next turn</th>
          </tr>
        </thead>
        <tbody>
          {live(game).map((s) => {
            const m = shipMotion(s);
            return (
              <tr key={s.id}>
                <td>
                  <b>{s.name}</b>
                </td>
                <td>
                  {formatVelocity(s.velocity)} {s.orders ? `+ ${formatVelocity(s.orders.thrust)}` : '(no thrust)'}
                </td>
                <td className="note">
                  {m.consolidation.length === 0
                    ? 'nothing to consolidate'
                    : m.consolidation.map((c, i) => <div key={i}>{c.kind === '180' ? `${c.pair[0]}/${c.pair[1]} cancel ${c.amount}` : `${c.amount} of ${c.pair[0]} and ${c.pair[1]} → ${c.into}`}</div>)}
                </td>
                <td>
                  <b>{formatVelocity(m.newVelocity)}</b>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
