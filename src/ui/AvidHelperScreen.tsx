/**
 * The AVID helper: for a ship's current attitude, a pivot plan (where Forward goes at the
 * Midpoint and at End of Turn) and a roll plan, the windows that may hold the Top marker at each
 * step, with the other markers that follow. A table aid, independent of any game.
 */
import { useMemo, useState } from 'react';
import {
  ALL_WINDOWS,
  LEVEL_ATTITUDE,
  MARKER_NAMES,
  defaultPivotMidpoint,
  markers,
  traceManeuver,
  windowDistance,
  windowKey,
  windowLabel,
  type Attitude,
  type AvidWindow,
  type RollDirection,
  type TraceStep,
} from '../domain/geometry';
import { AttitudeInput } from './AttitudeInput';

const byKey = (key: string): AvidWindow | undefined => ALL_WINDOWS.find((w) => windowKey(w) === key);

const MARKER_LABEL: Readonly<Record<(typeof MARKER_NAMES)[number], string>> = { forward: 'Forward', aft: 'Aft', port: 'Port', starboard: 'Starboard', top: 'Top', bottom: 'Bottom' };

function StepTable({ title, step, when }: { title: string; step: TraceStep; when: string }) {
  return (
    <section className="panel">
      <h3>{title}</h3>
      <p className="note">
        {when} Forward is in <b>{windowLabel(step.forward)}</b>.{' '}
        {step.top.length === 1 ? 'One placement fits the Top marker.' : `${step.top.length} placements fit the Top marker; the best fit is first.`}
      </p>
      <table className="list">
        <thead>
          <tr>
            <th>Top</th>
            <th>Fit</th>
            <th>Port</th>
            <th>Starboard</th>
            <th>Aft</th>
            <th>Bottom</th>
          </tr>
        </thead>
        <tbody>
          {step.top.map((c, i) => (
            <tr key={windowKey(c.window)}>
              <td>
                <b>{windowLabel(c.window)}</b>
              </td>
              <td>{i === 0 ? `best fit, ${Math.round(c.offsetDeg)}° off` : `${Math.round(c.offsetDeg)}° off`}</td>
              <td>{windowLabel(c.markers.port)}</td>
              <td>{windowLabel(c.markers.starboard)}</td>
              <td>{windowLabel(c.markers.aft)}</td>
              <td>{windowLabel(c.markers.bottom)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {step.spine && (
        <p className="note">
          The exact Top lies on the spine between {windowLabel(step.spine[0])} and {windowLabel(step.spine[1])}: the marker may sit on that spine (B2.143).
        </p>
      )}
    </section>
  );
}

export function AvidHelperScreen() {
  const [start, setStart] = useState<Attitude>(LEVEL_ATTITUDE);
  const [pivots, setPivots] = useState(false);
  const [eotForward, setEotForward] = useState<AvidWindow | null>(null);
  const [midForward, setMidForward] = useState<AvidWindow | null>(null);
  const [rollWindows, setRollWindows] = useState(0);
  const [rollDirection, setRollDirection] = useState<RollDirection>('starboard');
  const [pivotRating, setPivotRating] = useState('');
  const [rollRating, setRollRating] = useState('');

  const m0 = markers(start);
  const end = pivots ? (eotForward ?? m0.forward) : null;
  const mid = end ? (midForward ?? defaultPivotMidpoint(start, end)) : null;
  const pivotPlan = end && mid ? { midpoint: mid, endOfTurn: end } : null;
  const rollPlan = rollWindows > 0 ? { windows: rollWindows, direction: rollDirection } : null;
  const trace = useMemo(() => traceManeuver(start, pivotPlan, rollPlan), [start, pivotPlan, rollPlan]);

  /** Windows that can serve as the Midpoint for this pivot: on or near the arc, halfway first. */
  const midOptions = useMemo(() => {
    if (!end) return [];
    const total = windowDistance(m0.forward, end);
    return ALL_WINDOWS.map((w) => ({ w, a: windowDistance(m0.forward, w), b: windowDistance(w, end) }))
      .filter(({ a, b }) => a + b <= total + 1 && a <= total && b <= total)
      .sort((x, y) => Math.abs(x.a - x.b) - Math.abs(y.a - y.b) || x.a + x.b - (y.a + y.b));
  }, [m0.forward, end]);

  const changeStart = (a: Attitude) => {
    setStart(a);
    setMidForward(null);
  };
  const changeEot = (w: AvidWindow) => {
    setEotForward(w);
    setMidForward(null);
  };

  const pr = Number(pivotRating);
  const rr = Number(rollRating);
  const ratingWarnings: string[] = [];
  if (pivotRating.trim() !== '' && Number.isFinite(pr) && trace.pivotWindows > pr) ratingWarnings.push(`The pivot costs ${trace.pivotWindows} windows, more than the pivot rating of ${pr}.`);
  if (rollRating.trim() !== '' && Number.isFinite(rr) && rollWindows > rr) ratingWarnings.push(`The roll is ${rollWindows} windows, more than the roll rating of ${rr}.`);

  return (
    <div className="games">
      <section className="panel">
        <h2>AVID helper</h2>
        <p className="note">
          Set a ship's markers as they are now, say where its Forward goes at the Midpoint and at End of Turn and how far it rolls, and read off where the Top marker may go at each step.
          The pivot is the arc from one Forward window to the next, the roll turns about Forward, and half of each is applied at the Midpoint (RULES.md §6). Top must be three windows from
          Forward; where the exact attitude falls between two windows, both are listed.
        </p>
        <div className="grid-2">
          <div className="stack">
            <section className="panel">
              <h3>Now</h3>
              <AttitudeInput value={start} onChange={changeStart} />
              <p className="note">
                Aft {windowLabel(m0.aft)}, Port {windowLabel(m0.port)}, Starboard {windowLabel(m0.starboard)}, Bottom {windowLabel(m0.bottom)}.
              </p>
            </section>
            <section className="panel">
              <h3>Pivot</h3>
              <label className="row">
                <input type="checkbox" checked={pivots} onChange={(e) => setPivots(e.target.checked)} />
                The ship pivots
              </label>
              {pivots && end && mid && (
                <>
                  <div className="field">
                    <label>Forward at End of Turn</label>
                    <select
                      value={windowKey(end)}
                      onChange={(e) => {
                        const w = byKey(e.target.value);
                        if (w) changeEot(w);
                      }}
                    >
                      {ALL_WINDOWS.map((w) => {
                        const d = windowDistance(m0.forward, w);
                        return (
                          <option key={windowKey(w)} value={windowKey(w)}>
                            {windowLabel(w)} — {d} window{d === 1 ? '' : 's'}
                          </option>
                        );
                      })}
                    </select>
                  </div>
                  <div className="field">
                    <label>Forward at the Midpoint</label>
                    <select
                      value={windowKey(mid)}
                      onChange={(e) => {
                        const w = byKey(e.target.value);
                        if (w) setMidForward(w);
                      }}
                    >
                      {midOptions.map(({ w, a, b }) => (
                        <option key={windowKey(w)} value={windowKey(w)}>
                          {windowLabel(w)} — {a} then {b}
                        </option>
                      ))}
                    </select>
                  </div>
                  <p className="note">
                    Pivot of <b>{trace.pivotWindows}</b> window{trace.pivotWindows === 1 ? '' : 's'}: {trace.legs[0]} to the Midpoint, {trace.legs[1]} to End of Turn.
                  </p>
                </>
              )}
            </section>
            <section className="panel">
              <h3>Roll</h3>
              <div className="grid-2">
                <div className="field">
                  <label>Windows</label>
                  <select value={rollWindows} onChange={(e) => setRollWindows(Number(e.target.value))}>
                    {[0, 1, 2, 3, 4, 5, 6].map((n) => (
                      <option key={n} value={n}>
                        {n === 0 ? 'No roll' : n}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label>To</label>
                  <select value={rollDirection} disabled={rollWindows === 0} onChange={(e) => setRollDirection(e.target.value as RollDirection)}>
                    <option value="port">port</option>
                    <option value="starboard">starboard</option>
                  </select>
                </div>
              </div>
              {rollWindows > 0 && (
                <p className="note">
                  {rollWindows / 2} window{rollWindows / 2 === 1 ? '' : 's'} at the Midpoint, the rest at End of Turn.
                </p>
              )}
            </section>
            <section className="panel">
              <h3>Ratings this turn (optional)</h3>
              <div className="grid-2">
                <div className="field">
                  <label>Pivot</label>
                  <input value={pivotRating} inputMode="numeric" placeholder="—" onChange={(e) => setPivotRating(e.target.value)} />
                </div>
                <div className="field">
                  <label>Roll</label>
                  <input value={rollRating} inputMode="numeric" placeholder="—" onChange={(e) => setRollRating(e.target.value)} />
                </div>
              </div>
            </section>
          </div>
          <div className="stack">
            {[...ratingWarnings, ...trace.warnings].map((w) => (
              <p key={w} className="field-msg">
                {w}
              </p>
            ))}
            <StepTable title="At the Midpoint" step={trace.midpoint} when="After half the pivot and half the roll," />
            <StepTable title="At End of Turn" step={trace.endOfTurn} when="With the pivot and roll complete," />
            <p className="note">
              Markers listed: {MARKER_NAMES.map((m) => MARKER_LABEL[m]).join(', ')}. The other markers follow from Forward and the Top chosen; Port and Starboard are three windows
              from Forward, Aft and Bottom opposite Forward and Top.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
