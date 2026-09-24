/**
 * The AVID helper: for a ship's current attitude, a pivot plan (how many windows, where Forward
 * is at the Midpoint and at End of Turn) and a roll plan, the windows that may hold the Top
 * marker at each step, with the other markers that follow. A table aid, independent of any game.
 */
import { useMemo, useState } from 'react';
import {
  ALL_WINDOWS,
  LEVEL_ATTITUDE,
  defaultPivotMidpoint,
  markers,
  midpointOptions,
  pivotSteps,
  traceManeuver,
  windowKey,
  windowLabel,
  windowsEqual,
  type Attitude,
  type AvidWindow,
  type RollDirection,
  type TraceStep,
} from '../domain/geometry';
import { AttitudeInput } from './AttitudeInput';

const byKey = (key: string): AvidWindow | undefined => ALL_WINDOWS.find((w) => windowKey(w) === key);
const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`;

/** A ship the helper is opened for: its markers now and this turn's pivot and roll ratings. */
export interface AvidHelperShip {
  readonly name: string;
  readonly attitude: Attitude;
  readonly pivot: number;
  readonly roll: number;
}

export interface AvidHelperScreenProps {
  /** Pre-fills the current attitude and the ratings; the helper starts level with no ship. */
  readonly ship?: AvidHelperShip;
  /** Back to the game the helper was opened from. */
  readonly onBack?: () => void;
}

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

export function AvidHelperScreen({ ship, onBack }: AvidHelperScreenProps = {}) {
  const [start, setStart] = useState<Attitude>(ship?.attitude ?? LEVEL_ATTITUDE);
  const [pivots, setPivots] = useState(false);
  const [eotForward, setEotForward] = useState<AvidWindow | null>(null);
  const [midForward, setMidForward] = useState<AvidWindow | null>(null);
  const [pivotWindowsText, setPivotWindowsText] = useState('');
  const [rollWindows, setRollWindows] = useState(0);
  const [rollDirection, setRollDirection] = useState<RollDirection>('starboard');
  const [pivotRating, setPivotRating] = useState(ship ? String(ship.pivot) : '');
  const [rollRating, setRollRating] = useState(ship ? String(ship.roll) : '');

  const m0 = markers(start);
  const end = pivots ? (eotForward ?? m0.forward) : null;
  const shortestDirect = end ? pivotSteps(m0.forward, end) : 0;
  const typed = Number(pivotWindowsText);
  const pivotWindows = pivotWindowsText.trim() !== '' && Number.isInteger(typed) && typed >= 0 ? typed : shortestDirect;

  /** Windows that can be the Midpoint of this pivot, those splitting it most evenly first. */
  const midOptions = useMemo(() => (end ? midpointOptions(start, end, pivotWindows, ALL_WINDOWS) : []), [start, end, pivotWindows]);
  const mid = end ? (midForward && midOptions.some((o) => windowsEqual(o.window, midForward)) ? midForward : defaultPivotMidpoint(start, end, pivotWindows)) : null;

  const pivotPlan = end && mid ? { windows: pivotWindows, midpoint: mid, endOfTurn: end } : null;
  const rollPlan = rollWindows > 0 ? { windows: rollWindows, direction: rollDirection } : null;
  const trace = useMemo(() => traceManeuver(start, pivotPlan, rollPlan), [start, pivotPlan, rollPlan]);

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
  if (pivotRating.trim() !== '' && Number.isFinite(pr) && trace.pivotWindows > pr) ratingWarnings.push(`The pivot costs ${plural(trace.pivotWindows, 'window')}, more than the pivot rating of ${pr}.`);
  if (rollRating.trim() !== '' && Number.isFinite(rr) && rollWindows > rr) ratingWarnings.push(`The roll is ${plural(rollWindows, 'window')}, more than the roll rating of ${rr}.`);

  return (
    <div className="games">
      <section className="panel">
        <div className="row">
          {onBack && (
            <button type="button" onClick={onBack}>
              ‹ Game
            </button>
          )}
          <h2>AVID helper{ship ? ` — ${ship.name}` : ''}</h2>
        </div>
        {ship && (
          <p className="note">
            Markers and ratings as {ship.name} reports them at the start of the turn; changes here do not touch the game.
          </p>
        )}
        <p className="note">
          Set a ship's markers as they are now, say how many windows it pivots and where its Forward is at the Midpoint and at End of Turn, and how far it rolls; read off where the Top
          marker may go at each step. A pivot walks Forward from window to touching window, detours allowed, with at most one diagonal step; the roll turns about Forward. Half of each,
          rounded down, is done at the Midpoint (RULES.md §6). Top must be three windows from Forward; where the exact attitude falls between two windows, both are listed.
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
                      {ALL_WINDOWS.map((w) => (
                        <option key={windowKey(w)} value={windowKey(w)}>
                          {windowLabel(w)} — at least {plural(pivotSteps(m0.forward, w), 'window')}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label>Windows pivoted</label>
                    <input value={pivotWindowsText} inputMode="numeric" placeholder={String(shortestDirect)} onChange={(e) => setPivotWindowsText(e.target.value)} />
                    <span className="note">
                      The path walked on the card, detours included. The shortest path to {windowLabel(end)} is {plural(shortestDirect, 'window')}.
                    </span>
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
                      {midOptions.map(({ window: w, legs }) => (
                        <option key={windowKey(w)} value={windowKey(w)}>
                          {windowLabel(w)} — at least {legs[0]} then {legs[1]}
                        </option>
                      ))}
                      {!midOptions.some((o) => windowsEqual(o.window, mid)) && <option value={windowKey(mid)}>{windowLabel(mid)}</option>}
                    </select>
                  </div>
                  <p className="note">
                    Pivot of <b>{plural(trace.pivotWindows, 'window')}</b>: {trace.pivotSplit[0]} at the Midpoint, {trace.pivotSplit[1]} at End of Turn.
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
                  {plural(trace.rollSplit[0], 'window')} at the Midpoint, {trace.rollSplit[1]} at End of Turn.
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
              The other markers follow from Forward and the Top chosen: Port and Starboard are three windows from Forward, Aft and Bottom opposite Forward and Top. The attitude is rotated
              along the shortest arc from the start to the Midpoint window and on to the End of Turn window; a long detour may lean the Top a window further than shown.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
