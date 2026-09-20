/**
 * Orientation as the two markers the player reads off the AVID: Forward, then Top among the
 * windows a quarter turn away from it.
 */
import { ALL_WINDOWS, attitudeFromWindows, markers, windowDistance, windowKey, windowLabel, windowsAtDistance, windowsEqual, type Attitude, type AvidWindow } from '../domain/geometry';

const byKey = (key: string, from: readonly AvidWindow[]): AvidWindow | undefined => from.find((w) => windowKey(w) === key);

/** The Top windows that go with a Forward, keeping the current Top in the list even if quantisation left it off. */
export function topOptions(forward: AvidWindow, current: AvidWindow): AvidWindow[] {
  const opts = windowsAtDistance(forward, 3);
  return opts.some((w) => windowsEqual(w, current)) ? opts : [current, ...opts];
}

/** The Top closest to `previous` among the options for a new Forward. */
export function nearestTop(forward: AvidWindow, previous: AvidWindow): AvidWindow {
  const opts = windowsAtDistance(forward, 3);
  let best = opts[0] ?? previous;
  let bestD = Infinity;
  for (const w of opts) {
    const d = windowDistance(w, previous);
    if (d < bestD) {
      bestD = d;
      best = w;
    }
  }
  return best;
}

export interface AttitudeInputProps {
  readonly value: Attitude;
  readonly onChange: (a: Attitude) => void;
}

export function AttitudeInput({ value, onChange }: AttitudeInputProps) {
  const m = markers(value);
  const tops = topOptions(m.forward, m.top);
  return (
    <div className="grid-2">
      <div className="field">
        <label>Forward</label>
        <select
          value={windowKey(m.forward)}
          onChange={(e) => {
            const fwd = byKey(e.target.value, ALL_WINDOWS);
            if (fwd) onChange(attitudeFromWindows(fwd, nearestTop(fwd, m.top)));
          }}
        >
          {ALL_WINDOWS.map((w) => (
            <option key={windowKey(w)} value={windowKey(w)}>
              {windowLabel(w)}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label>Top</label>
        <select
          value={windowKey(m.top)}
          onChange={(e) => {
            const top = byKey(e.target.value, tops);
            if (top) onChange(attitudeFromWindows(m.forward, top));
          }}
        >
          {tops.map((w) => (
            <option key={windowKey(w)} value={windowKey(w)}>
              {windowLabel(w)}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
