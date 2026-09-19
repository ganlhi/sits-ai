/**
 * Phase 2 dual-view AVID inspector (PLAN.md).
 *
 * One attitude, rendered flat and in 3-D. Set Forward and Top, add a pivot and a roll, and
 * step through start → Midpoint → End of Turn. Pick a bearing to see the ship-frame window it
 * maps to and how each Sample-class mount sees it. The point is to check the kernel against a
 * miniature in your hand: set the attitude, rotate the sphere, hold up the ship.
 */
import { useMemo, useState } from 'react';
import {
  ALL_WINDOWS,
  LEVEL_ATTITUDE,
  MARKER_NAMES,
  MOUNTS,
  applyManeuver,
  attitudeFromWindows,
  bodyWindow,
  markers,
  mountArcColour,
  pivotCost,
  pivotOptions,
  purple,
  wedgeCovers,
  windowDirection,
  windowKey,
  windowLabel,
  windowsAtDistance,
  windowsEqual,
  yellow,
  type ArcColour,
  type AvidWindow,
  type Hemisphere,
  type Maneuver,
  type Mount,
  type RollDirection,
} from '../domain/geometry';
import { SAMPLE_SD } from '../data/ships/sampleSd';
import { AvidFlat } from '../ui/avid/AvidFlat';
import { AvidSphere } from '../ui/avid/AvidSphere';

const SAMPLE_ARCS = { forward: SAMPLE_SD.mounts.forward.arc, aft: SAMPLE_SD.mounts.aft.arc, port: SAMPLE_SD.mounts.port.arc, starboard: SAMPLE_SD.mounts.starboard.arc };

const byKey = (k: string): AvidWindow => {
  const w = ALL_WINDOWS.find((x) => windowKey(x) === k);
  if (!w) throw new Error(`unknown window ${k}`);
  return w;
};

function WindowSelect({ label, value, options, onChange, allowNone }: { label: string; value: AvidWindow | null; options: readonly AvidWindow[]; onChange: (w: AvidWindow | null) => void; allowNone?: boolean }) {
  return (
    <div className="field">
      <label>{label}</label>
      <select value={value ? windowKey(value) : ''} onChange={(e) => onChange(e.target.value ? byKey(e.target.value) : null)}>
        {allowNone && <option value="">— none —</option>}
        {options.map((w) => (
          <option key={windowKey(w)} value={windowKey(w)}>
            {windowLabel(w)}
          </option>
        ))}
      </select>
    </div>
  );
}

type ClickMode = 'forward' | 'top' | 'bearing';
type Phase = 0 | 0.5 | 1;

export function InspectorApp() {
  const [forward, setForward] = useState<AvidWindow>(yellow(0));
  const [top, setTop] = useState<AvidWindow>(purple('upper'));
  const [pivotWindows, setPivotWindows] = useState(0);
  const [pivotTo, setPivotTo] = useState<AvidWindow | null>(null);
  const [rollWindows, setRollWindows] = useState(0);
  const [rollDir, setRollDir] = useState<RollDirection>('starboard');
  const [phase, setPhase] = useState<Phase>(1);
  const [bearingWin, setBearingWin] = useState<AvidWindow | null>(null);
  const [mount, setMount] = useState<Mount>('starboard');
  const [clickMode, setClickMode] = useState<ClickMode>('forward');
  const [clickHemi, setClickHemi] = useState<Hemisphere>('upper');

  const topOptions = useMemo(() => windowsAtDistance(forward, 3), [forward]);
  const base = useMemo(() => {
    const t = topOptions.some((w) => windowsEqual(w, top)) ? top : (topOptions[0] ?? purple('upper'));
    return attitudeFromWindows(forward, t);
  }, [forward, top, topOptions]);

  const pivotTargets = useMemo(() => (pivotWindows > 0 ? pivotOptions(base, pivotWindows) : []), [base, pivotWindows]);
  const effectivePivot = pivotTo && pivotTargets.some((w) => windowsEqual(w, pivotTo)) ? pivotTo : (pivotTargets[0] ?? null);

  const maneuver: Maneuver = useMemo(
    () => ({
      ...(effectivePivot ? { pivotTo: effectivePivot } : {}),
      ...(rollWindows > 0 ? { roll: { windows: rollWindows, direction: rollDir } } : {}),
    }),
    [effectivePivot, rollWindows, rollDir],
  );

  const current = useMemo(() => applyManeuver(base, maneuver, phase), [base, maneuver, phase]);
  const m = useMemo(() => markers(current), [current]);

  const bearingInfo = useMemo(() => {
    if (!bearingWin) return null;
    const dir = windowDirection(bearingWin);
    const bw = bodyWindow(current, dir);
    const colours = Object.fromEntries(MOUNTS.map((mt) => [mt, mountArcColour(SAMPLE_ARCS, mt, current, dir)])) as Record<Mount, ArcColour>;
    return { bw, colours, wedge: wedgeCovers(current, dir) };
  }, [bearingWin, current]);

  const onSelect = (w: AvidWindow) => {
    if (clickMode === 'forward') setForward(w);
    else if (clickMode === 'top') setTop(w);
    else setBearingWin(w);
  };

  const highlight: AvidWindow[] = [];
  if (bearingWin) highlight.push(bearingWin);
  if (effectivePivot) highlight.push(effectivePivot);

  return (
    <div className="app">
      <header className="app-header">
        <h1>SITS AI — AVID inspector</h1>
        <span className="sub">one attitude, two views; check it against the miniature</span>
      </header>
      <div className="inspector">
        <aside className="panel">
          <h2>Attitude at start of turn</h2>
          <WindowSelect label="Forward" value={forward} options={ALL_WINDOWS} onChange={(w) => w && setForward(w)} />
          <WindowSelect label="Top (3 windows from Forward)" value={topOptions.some((w) => windowsEqual(w, top)) ? top : (topOptions[0] ?? null)} options={topOptions} onChange={(w) => w && setTop(w)} />
          <button type="button" className="seg" onClick={() => { setForward(yellow(0)); setTop(purple('upper')); setPivotWindows(0); setRollWindows(0); }}>
            <span style={{ padding: '4px 10px' }}>Reset to level, facing A</span>
          </button>

          <h2 style={{ marginTop: 16 }}>Maneuver</h2>
          <div className="field">
            <label>Pivot (windows)</label>
            <input type="number" min={0} max={6} value={pivotWindows} onChange={(e) => setPivotWindows(Math.max(0, Math.min(6, Number(e.target.value))))} />
          </div>
          {pivotWindows > 0 && <WindowSelect label={`Pivot Forward to (${pivotTargets.length} options)`} value={effectivePivot} options={pivotTargets} onChange={setPivotTo} />}
          <div className="field">
            <label>Roll (windows)</label>
            <div className="row">
              <input type="number" min={0} max={6} value={rollWindows} onChange={(e) => setRollWindows(Math.max(0, Math.min(6, Number(e.target.value))))} style={{ width: 70 }} />
              <div className="seg" role="group" aria-label="roll direction">
                {(['port', 'starboard'] as RollDirection[]).map((d) => (
                  <button key={d} type="button" aria-pressed={rollDir === d} onClick={() => setRollDir(d)}>
                    to {d}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="field">
            <label>Show</label>
            <div className="seg" role="group" aria-label="phase">
              {([0, 0.5, 1] as Phase[]).map((p) => (
                <button key={p} type="button" aria-pressed={phase === p} onClick={() => setPhase(p)}>
                  {p === 0 ? 'start' : p === 0.5 ? 'Midpoint' : 'End of Turn'}
                </button>
              ))}
            </div>
          </div>

          <h2 style={{ marginTop: 16 }}>Markers now</h2>
          <table className="markers">
            <tbody>
              {MARKER_NAMES.map((n) => (
                <tr key={n}>
                  <th>{n}</th>
                  <td>{windowLabel(m[n])}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {effectivePivot && <p className="note">Pivot cost from start: {pivotCost(base, effectivePivot)} windows.</p>}

          <h2 style={{ marginTop: 16 }}>Bearing</h2>
          <WindowSelect label="Target seen through" value={bearingWin} options={ALL_WINDOWS} onChange={setBearingWin} allowNone />
          <div className="field">
            <label>Mount for the 3-D bearing line</label>
            <div className="seg" role="group" aria-label="mount">
              {MOUNTS.map((mt) => (
                <button key={mt} type="button" aria-pressed={mount === mt} onClick={() => setMount(mt)}>
                  {mt}
                </button>
              ))}
            </div>
          </div>
          {bearingInfo && (
            <>
              <p className="note">
                Ship-frame window: <b>{bearingInfo.bw.row}</b>, longitude {bearingInfo.bw.lon} ({bearingInfo.bw.longitudeDeg.toFixed(0)}° from Forward, {bearingInfo.bw.latitudeDeg.toFixed(0)}° above the keel plane)
                {bearingInfo.wedge ? ' — behind the wedge' : ''}
              </p>
              <table className="markers">
                <tbody>
                  {MOUNTS.map((mt) => (
                    <tr key={mt}>
                      <th>{mt}</th>
                      <td>
                        <span className="swatch" style={{ background: `var(--arc-${bearingInfo.colours[mt]})` }} />
                        {bearingInfo.colours[mt]}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="note">Sample-class arcs; black cannot fire, grey fires from behind the sidewall, white is the bow/stern aspect.</p>
            </>
          )}
        </aside>

        <section className="panel">
          <h2>Flat AVID</h2>
          <div className="row" style={{ marginBottom: 8 }}>
            <span className="note">click sets</span>
            <div className="seg" role="group" aria-label="click mode">
              {(['forward', 'top', 'bearing'] as ClickMode[]).map((c) => (
                <button key={c} type="button" aria-pressed={clickMode === c} onClick={() => setClickMode(c)}>
                  {c}
                </button>
              ))}
            </div>
            <div className="seg" role="group" aria-label="hemisphere">
              {(['upper', 'lower'] as Hemisphere[]).map((h) => (
                <button key={h} type="button" aria-pressed={clickHemi === h} onClick={() => setClickHemi(h)}>
                  {h}
                </button>
              ))}
            </div>
          </div>
          <div className="view">
            <AvidFlat markers={m} highlight={highlight} clickHemisphere={clickHemi} onSelect={onSelect} />
          </div>
          <p className="note">Circled markers are in the lower hemisphere. Outlined windows: the bearing and the pivot target.</p>
        </section>

        <section className="panel">
          <h2>Sphere</h2>
          <div className="view">
            <AvidSphere attitude={current} bearing={bearingWin && bearingInfo ? { window: bearingWin, colour: bearingInfo.colours[mount] } : undefined} />
          </div>
          <p className="note">Drag to orbit. Red strake is port, green starboard, yellow fin is top.</p>
        </section>
      </div>
    </div>
  );
}
