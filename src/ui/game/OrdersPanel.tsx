/**
 * Step 2 — plotting. Pivot (windows and target), roll, thrust and which plotting-grid option;
 * the app shows the Midpoint facing, the displacement and where the EoT marker ends up before
 * the orders are committed.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  allThrustOptions,
  facingAfter,
  formatVelocity,
  markers,
  pivotOptions,
  planMotion,
  windowKey,
  windowLabel,
  windowsEqual,
  type AvidWindow,
  type Maneuver,
  type RollDirection,
  type ThrustPlot,
} from '../../domain/geometry';
import { maneuverLimits, thrustLimit, type GameEvent, type GameState, type ShipState } from '../../domain/game';
import { fmtPos } from './HexMap';

export function OrdersPanel({ game, ship, dispatch }: { game: GameState; ship: ShipState; dispatch: (e: GameEvent) => void }) {
  const limits = maneuverLimits(game, ship);
  const maxThrust = thrustLimit(game, ship);
  const committed = ship.orders;

  const [pivotN, setPivotN] = useState(0);
  const [pivotTo, setPivotTo] = useState<AvidWindow | null>(null);
  const [rollN, setRollN] = useState(0);
  const [rollDir, setRollDir] = useState<RollDirection>('starboard');
  const [thrustKey, setThrustKey] = useState<string>('');

  useEffect(() => {
    // start from what is committed, or from "drift"
    const o = ship.orders;
    if (o) {
      setPivotTo(o.maneuver.pivotTo ?? null);
      setPivotN(o.maneuver.pivotTo ? Math.max(1, pivotOptions(ship.attitude, 1).some((w) => windowsEqual(w, o.maneuver.pivotTo!)) ? 1 : 2) : 0);
      setRollN(o.maneuver.roll?.windows ?? 0);
      setRollDir(o.maneuver.roll?.direction ?? 'starboard');
      setThrustKey(JSON.stringify(o.thrust));
    } else {
      setPivotN(0);
      setPivotTo(null);
      setRollN(0);
      setThrustKey('');
    }
  }, [ship.id, ship.orders, ship.attitude]);

  const targets = useMemo(() => (pivotN > 0 ? pivotOptions(ship.attitude, pivotN) : []), [ship.attitude, pivotN]);
  const effectivePivot = pivotTo && targets.some((w) => windowsEqual(w, pivotTo)) ? pivotTo : (targets[0] ?? null);
  const maneuver: Maneuver = {
    ...(effectivePivot ? { pivotTo: effectivePivot } : {}),
    ...(rollN > 0 ? { roll: { windows: rollN, direction: rollDir } } : {}),
  };
  const facing = facingAfter(ship.attitude, maneuver, 0.5);
  const plots = useMemo(() => allThrustOptions(maxThrust, facing), [maxThrust, facing]);
  const plot: ThrustPlot = plots.find((p) => JSON.stringify(p.delta) === thrustKey) ?? plots[0]!;
  const motion = planMotion({ position: ship.position, velocity: ship.velocity, halfDisplacements: ship.halfDisplacements }, plot.delta, effectivePivot !== null, ship.grades.ENG);
  const eotMarkers = markers(facingAfter(ship.attitude, maneuver, 1) ? { forward: ship.attitude.forward, top: ship.attitude.top } : ship.attitude);
  void eotMarkers;

  const commit = () => dispatch({ type: 'OrdersIssued', shipId: ship.id, orders: { maneuver, thrust: plot.delta, thrustUsed: plot.thrust } });

  return (
    <div className={`orders${committed ? ' committed' : ''}`}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h3>
          {ship.name} <span className="note">pivot ≤ {limits.pivot}, roll ≤ {limits.roll}, thrust ≤ {maxThrust}</span>
        </h3>
        {committed ? <span className="tag locked">orders locked</span> : <span className="tag">not plotted</span>}
      </div>
      {committed && (
        <p className="note">
          Committed: {committed.maneuver.pivotTo ? `pivot Forward to ${windowLabel(committed.maneuver.pivotTo)}` : 'no pivot'}
          {committed.maneuver.roll ? `, roll ${committed.maneuver.roll.windows} to ${committed.maneuver.roll.direction}` : ', no roll'}, thrust {committed.thrustUsed} → {formatVelocity(committed.thrust)}.
          <button type="button" style={{ marginLeft: 8 }} onClick={() => dispatch({ type: 'OrdersCleared', shipId: ship.id })}>
            Unlock
          </button>
        </p>
      )}
      <fieldset disabled={!!committed}>
        <div className="grid-3">
          <div className="field">
            <label>Pivot (windows)</label>
            <select value={pivotN} onChange={(e) => setPivotN(Number(e.target.value))}>
              {Array.from({ length: limits.pivot + 1 }, (_, i) => (
                <option key={i} value={i}>
                  {i}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Forward to</label>
            <select value={effectivePivot ? windowKey(effectivePivot) : ''} disabled={pivotN === 0} onChange={(e) => setPivotTo(targets.find((w) => windowKey(w) === e.target.value) ?? null)}>
              {pivotN === 0 ? <option value="">— stays {windowLabel(markers(ship.attitude).forward)} —</option> : null}
              {targets.map((w) => (
                <option key={windowKey(w)} value={windowKey(w)}>
                  {windowLabel(w)}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Roll (windows)</label>
            <div className="row">
              <select value={rollN} onChange={(e) => setRollN(Number(e.target.value))}>
                {Array.from({ length: limits.roll + 1 }, (_, i) => (
                  <option key={i} value={i}>
                    {i}
                  </option>
                ))}
              </select>
              <div className="seg">
                {(['port', 'starboard'] as RollDirection[]).map((d) => (
                  <button key={d} type="button" aria-pressed={rollDir === d} onClick={() => setRollDir(d)}>
                    {d}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
        <div className="field">
          <label>Thrust along the Midpoint facing {windowLabel(facing)} — pick the plotting-grid cell</label>
          <select value={JSON.stringify(plot.delta)} onChange={(e) => setThrustKey(e.target.value)}>
            {plots.map((p) => (
              <option key={JSON.stringify(p.delta)} value={JSON.stringify(p.delta)}>
                {p.thrust === 0 ? 'no thrust' : `thrust ${p.thrust}: ${formatVelocity(p.delta)} (h ${p.h}, v ${p.v > 0 ? '+' : ''}${p.v})`}
              </option>
            ))}
          </select>
        </div>
      </fieldset>
      <p className="note">
        Midpoint {fmtPos(motion.midpoint)} · EoT {fmtPos(motion.endOfTurn)}
        {effectivePivot ? ' · pivoting: no displacement' : motion.displacement && formatVelocity(motion.displacement) !== 'stationary' ? ` · displaces ${formatVelocity(motion.displacement)}` : ''}
        {motion.carriedHalves.length ? ` · carries half hexes in ${motion.carriedHalves.join(', ')}` : ''} · next turn {formatVelocity(motion.newVelocity)}
      </p>
      {!committed && (
        <button type="button" className="primary" onClick={commit}>
          Lock orders
        </button>
      )}
    </div>
  );
}
