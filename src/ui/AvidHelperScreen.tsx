/**
 * The AVID helper: for a ship's current attitude, the path its Forward walks on the card and a
 * roll plan, the windows that may hold the Top marker at the Midpoint and at End of Turn, with
 * the other markers that follow. A table aid, independent of any game.
 */
import { useMemo, useState } from 'react';
import {
  LEVEL_ATTITUDE,
  cornerNeighbours,
  edgeNeighbours,
  markers,
  stepKind,
  traceManeuver,
  windowKey,
  windowLabel,
  type Attitude,
  type AvidWindow,
  type RollDirection,
  type TraceStep,
} from '../domain/geometry';
import { AttitudeInput } from './AttitudeInput';

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

/** The path as a chain of chips: the start, then each step behind its arrow, a divider at the Midpoint. Clicking a step cuts the path there. */
function PathChain({ start, path, midpointAfter, onCut }: { start: AvidWindow; path: readonly AvidWindow[]; midpointAfter: number; onCut: (keep: number) => void }) {
  let at = start;
  return (
    <div className="path" aria-label="pivot path">
      <span className="chip start">{windowLabel(start)}</span>
      {path.map((w, i) => {
        const kind = stepKind(at, w);
        at = w;
        return (
          <span key={i} className="leg">
            <span className={`arrow ${kind ?? 'bad'}`} title={kind === 'corner' ? 'diagonal step' : kind === 'edge' ? 'step' : 'these windows do not touch'}>
              {kind === 'corner' ? '⤢' : '→'}
            </span>
            <button type="button" className="chip" title="Cut the path here" onClick={() => onCut(i + 1)}>
              {windowLabel(w)}
            </button>
            {i + 1 === midpointAfter && path.length > 0 && <span className="mid">Midpoint</span>}
          </span>
        );
      })}
    </div>
  );
}

export function AvidHelperScreen({ ship, onBack }: AvidHelperScreenProps = {}) {
  const [start, setStart] = useState<Attitude>(ship?.attitude ?? LEVEL_ATTITUDE);
  const [pivots, setPivots] = useState(false);
  const [path, setPath] = useState<AvidWindow[]>([]);
  const [nextKey, setNextKey] = useState<string | null>(null);
  const [rollWindows, setRollWindows] = useState(0);
  const [rollDirection, setRollDirection] = useState<RollDirection>('starboard');
  const [pivotRating, setPivotRating] = useState(ship ? String(ship.pivot) : '');
  const [rollRating, setRollRating] = useState(ship ? String(ship.roll) : '');

  const m0 = markers(start);
  const last = path.at(-1) ?? m0.forward;
  const diagonalUsed = useMemo(() => {
    let at = m0.forward;
    for (const w of path) {
      if (stepKind(at, w) === 'corner') return true;
      at = w;
    }
    return false;
  }, [m0.forward, path]);
  const edges = edgeNeighbours(last);
  const corners = cornerNeighbours(last);
  const next = [...edges, ...corners].find((w) => windowKey(w) === nextKey) ?? edges[0]!;

  const steps = pivots ? path : [];
  const rollPlan = rollWindows > 0 ? { windows: rollWindows, direction: rollDirection } : null;
  const trace = useMemo(() => traceManeuver(start, steps, rollPlan), [start, steps, rollPlan]);

  const changeStart = (a: Attitude) => {
    setStart(a);
    setPath([]);
    setNextKey(null);
  };
  const add = () => {
    setPath([...path, next]);
    setNextKey(null);
  };
  const cut = (keep: number) => {
    setPath(path.slice(0, keep));
    setNextKey(null);
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
          Set a ship's markers as they are now, walk its Forward along the card window by window, and say how far it rolls; read off where the Top marker may go at the Midpoint and at
          End of Turn. A pivot step goes to a touching window, one diagonal step (yellow to the blue window a column over) at most; the roll turns about Forward. Half of each, rounded
          down, is done at the Midpoint (RULES.md §6). Top must be three windows from Forward; where the exact attitude falls between two windows, both are listed.
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
              {pivots && (
                <>
                  <div className="field">
                    <span className="label">Path</span>
                    <PathChain start={m0.forward} path={path} midpointAfter={trace.pivotSplit[0]} onCut={cut} />
                    {path.length === 0 && <span className="note">No step yet: add the windows Forward passes through, in order, ending where it points at End of Turn.</span>}
                  </div>
                  <div className="field">
                    <label>Next window</label>
                    <div className="row">
                      <select className="grow" value={windowKey(next)} onChange={(e) => setNextKey(e.target.value)}>
                        {edges.map((w) => (
                          <option key={windowKey(w)} value={windowKey(w)}>
                            {windowLabel(w)}
                          </option>
                        ))}
                        {corners.length > 0 && (
                          <optgroup label={diagonalUsed ? 'diagonal — already used' : 'diagonal — once per pivot'}>
                            {corners.map((w) => (
                              <option key={windowKey(w)} value={windowKey(w)} disabled={diagonalUsed}>
                                {windowLabel(w)}
                              </option>
                            ))}
                          </optgroup>
                        )}
                      </select>
                      <button type="button" className="primary" onClick={add}>
                        Add
                      </button>
                      <button type="button" disabled={path.length === 0} onClick={() => cut(path.length - 1)}>
                        Undo step
                      </button>
                      <button type="button" disabled={path.length === 0} onClick={() => cut(0)}>
                        Clear
                      </button>
                    </div>
                  </div>
                  {path.length > 0 && (
                    <p className="note">
                      Pivot of <b>{plural(trace.pivotWindows, 'window')}</b>: {trace.pivotSplit[0]} at the Midpoint, Forward in {windowLabel(trace.midpoint.forward)}; {trace.pivotSplit[1]} more to End
                      of Turn, Forward in {windowLabel(trace.endOfTurn.forward)}.
                    </p>
                  )}
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
              window to window along the path entered, so a detour leans the Top the way the real path does.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
