/**
 * Orientation as the two markers the player reads off the AVID: Forward, then Top among the
 * windows a quarter turn away from it. Entered on the card — a click places Forward, a second
 * click on the same window drops it to the lower half, and pips mark the windows Top may take
 * — or through the two selects, which say the same thing in the book's notation.
 */
import { ALL_WINDOWS, attitudeFromWindows, markers, windowDistance, windowKey, windowLabel, windowsAtDistance, windowsEqual, type Attitude, type AvidWindow } from '../domain/geometry';
import { type AvidChoice } from './AvidCard';
import { AvidFigure } from './AvidFigure';

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

const samePrinted = (a: AvidWindow, b: AvidWindow): boolean => a.ring === b.ring && (a.ring === 'purple' || b.ring === 'purple' || a.az === b.az);

/** The Forward a click on a printed window means: the window in Forward's current half, or the other half when Forward is already there. */
export function forwardFromClick(printed: AvidWindow, current: AvidWindow): AvidWindow {
  if (printed.ring === 'yellow') return printed;
  const hemi = current.ring === 'yellow' ? 'upper' : current.hemi;
  if (samePrinted(printed, current)) return { ...printed, hemi: hemi === 'upper' ? 'lower' : 'upper' };
  return { ...printed, hemi };
}

export interface AttitudeInputProps {
  readonly value: Attitude;
  readonly onChange: (a: Attitude) => void;
  /** Leave the card out and keep the selects alone. */
  readonly card?: boolean;
  /** Show the markers but take no clicks: the report is locked. */
  readonly disabled?: boolean;
}

export function AttitudeInput({ value, onChange, card = true, disabled = false }: AttitudeInputProps) {
  const m = markers(value);
  const tops = topOptions(m.forward, m.top);
  const choices: AvidChoice[] = disabled ? [] : tops.filter((w) => !windowsEqual(w, m.top)).map((w) => ({ window: w, kind: 'alt', title: `Top in ${windowLabel(w)}` }));

  const selects = (
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

  if (!card) return selects;
  return (
    <div className="avid-field">
      <div className="avid-row">
        <AvidFigure
          className={disabled ? undefined : 'clickable'}
          title={disabled ? 'Orientation' : 'Orientation: click a window to point Forward there, again for the lower half; a pip moves Top'}
          markers={m}
          choices={choices}
          onPick={disabled ? undefined : (top) => onChange(attitudeFromWindows(m.forward, top))}
          onWindow={
            disabled
              ? undefined
              : (printed) => {
                  const fwd = forwardFromClick(printed, m.forward);
                  onChange(attitudeFromWindows(fwd, nearestTop(fwd, m.top)));
                }
          }
          caption={disabled ? undefined : <span className="note">Click a window to point Forward there, the same window again for the lower half. The pips are the other windows Top may take.</span>}
        />
        <div>
          {selects}
          {!disabled && <span className="note">Click a window to point Forward there, the same window again for the lower half. The pips are the other windows Top may take.</span>}
        </div>
      </div>
    </div>
  );
}
