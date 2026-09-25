/**
 * The AVID as the card prints it (RULES.md §5): a flat top-down view of the sphere, rings from
 * the outside in — yellow (12 windows), blue (12), green (6), purple (1) — inside the hexagon.
 * Upper and lower hemispheres share the printed windows, so a marker in the lower half is
 * circled, as on the card. The six orientation markers use the book's symbols: triangle and
 * semicircle for Forward and Aft, chevrons for Port and Starboard, star and anchor for Top and
 * Bottom.
 *
 * Besides showing markers, the card takes input: `choices` are drawn as pips in their windows
 * (a plain dot for the upper half, a circled dot for the lower) and clicking one reports it;
 * clicking anywhere else in a window reports the printed window, for the caller to decide the
 * hemisphere.
 */
import type { ReactNode } from 'react';
import { ALL_WINDOWS, AZIMUTH_LABELS, MARKER_NAMES, windowKey, type AvidWindow, type MarkerName, type Markers } from '../domain/geometry';

/** Ring outer radii; the yellow ring is inscribed in the hexagon. */
const R_OUT = { yellow: 100, blue: 76, green: 52, purple: 26 } as const;
const R_IN = { yellow: R_OUT.blue, blue: R_OUT.green, green: R_OUT.purple, purple: 0 } as const;
/** Where a marker sits in a window: inside its centre, leaving the outer part for the label. */
const R_MARK = { yellow: 86, blue: 63, green: 40, purple: 0 } as const;
/** Where a pip sits in a window. */
const R_PIP = { yellow: 79.5, blue: 56, green: 31, purple: 0 } as const;
const HEX_R = 108;

const toXY = (azDeg: number, r: number): [number, number] => {
  const a = ((azDeg - 90) * Math.PI) / 180;
  return [r * Math.cos(a), r * Math.sin(a)];
};

function sectorPath(r0: number, r1: number, a0: number, a1: number): string {
  const [x0, y0] = toXY(a0, r1);
  const [x1, y1] = toXY(a1, r1);
  const [x2, y2] = toXY(a1, r0);
  const [x3, y3] = toXY(a0, r0);
  return `M${x0},${y0} A${r1},${r1} 0 0 1 ${x1},${y1} L${x2},${y2} A${r0},${r0} 0 0 0 ${x3},${y3} Z`;
}

/** The printed window a window falls on: hemisphere dropped. */
const printedKey = (w: AvidWindow): string => (w.ring === 'purple' ? 'purple' : `${w.ring}:${w.az}`);
const isLower = (w: AvidWindow): boolean => w.ring !== 'yellow' && w.hemi === 'lower';

/**
 * A point in window `w` at radius `r`, the `k`-th of `n` things sharing the printed window:
 * they are spread along the ring so none hides another.
 */
function slot(w: AvidWindow, r: number, k: number, n: number): [number, number] {
  const spread = (k - (n - 1) / 2) * 13;
  if (w.ring === 'purple') return [spread, 0];
  const [cx, cy] = toXY(w.az * 30, r);
  const [tx, ty] = toXY(w.az * 30 + 90, 1);
  return [cx + tx * spread, cy + ty * spread];
}

/** Where a window's marker is drawn, when it is alone in its printed window. */
export function windowPoint(w: AvidWindow): [number, number] {
  return slot(w, R_MARK[w.ring], 0, 1);
}

const STAR = (() => {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? 6 : 2.6;
    const a = (-90 + i * 36) * (Math.PI / 180);
    pts.push(`${(r * Math.cos(a)).toFixed(2)},${(r * Math.sin(a)).toFixed(2)}`);
  }
  return `M${pts.join(' L')} Z`;
})();

function Glyph({ name }: { name: MarkerName }) {
  switch (name) {
    case 'forward':
      return <path d="M0,-6 L6,5 L-6,5 Z" className="fill" />;
    case 'aft':
      return <path d="M-6,-1 A6,6 0 0 0 6,-1 Z" className="fill" />;
    case 'port':
      return <path d="M3.5,-5.5 L-3,0 L3.5,5.5" className="line" />;
    case 'starboard':
      return <path d="M-3.5,-5.5 L3,0 L-3.5,5.5" className="line" />;
    case 'top':
      return <path d={STAR} className="fill" />;
    case 'bottom':
      return (
        <g className="line">
          <circle cx={0} cy={-4.6} r={1.6} />
          <path d="M0,-3 V6 M-3.2,-0.5 H3.2 M-5.5,1.5 A5.5,5.5 0 0 0 5.5,1.5" />
        </g>
      );
  }
}

export const MARKER_LABELS: Record<MarkerName, string> = { forward: 'Forward', aft: 'Aft', port: 'Port', starboard: 'Starboard', top: 'Top', bottom: 'Bottom' };

export interface AvidChoice {
  readonly window: AvidWindow;
  /** How the pip is drawn: `step` for a plain move, `diagonal` for the once-a-pivot corner step, `alt` for an alternative placement. */
  readonly kind?: 'step' | 'diagonal' | 'alt';
  readonly disabled?: boolean;
  readonly title?: string;
}

/**
 * A marker's journey over the card: the windows it passes, first to last, an arrowhead at the
 * end and, when `pauseAfter` is given, a pause mark on the window it sits in at the Midpoint.
 * A leg between two windows of one ring follows the ring; any other leg is a straight line,
 * dashed when it enters the lower half.
 */
export interface AvidPath {
  readonly windows: readonly AvidWindow[];
  /** Colours the path: `forward` for the nose's pivot path, `top` for the Top marker's roll. */
  readonly kind?: 'forward' | 'top';
  readonly pauseAfter?: number;
}

const sameRing = (a: AvidWindow, b: AvidWindow): boolean => a.ring === b.ring && a.ring !== 'purple' && (a.ring === 'yellow' || (b.ring !== 'yellow' && b.ring !== 'purple' && a.hemi === b.hemi));

/** The SVG path of one leg: along the ring when both windows are in the same ring, else straight. */
function legPath(a: AvidWindow, b: AvidWindow): string {
  const [x0, y0] = windowPoint(a);
  const [x1, y1] = windowPoint(b);
  if (!sameRing(a, b) || a.ring === 'purple' || b.ring === 'purple') return `M${x0.toFixed(1)},${y0.toFixed(1)} L${x1.toFixed(1)},${y1.toFixed(1)}`;
  const r = R_MARK[a.ring];
  const delta = (((b as { az: number }).az - (a as { az: number }).az + 18) % 12) - 6;
  return `M${x0.toFixed(1)},${y0.toFixed(1)} A${r},${r} 0 0 ${delta > 0 ? 1 : 0} ${x1.toFixed(1)},${y1.toFixed(1)}`;
}

function TracePath({ path }: { path: AvidPath }) {
  const { windows, kind = 'forward', pauseAfter } = path;
  if (windows.length < 2) return null;
  const pause = pauseAfter !== undefined ? windows[pauseAfter] : undefined;
  const [px, py] = pause ? windowPoint(pause) : [0, 0];
  return (
    <g className={`trace ${kind}`}>
      {windows.slice(1).map((w, i) => (
        <path key={i} d={legPath(windows[i]!, w)} className={isLower(w) ? 'leg lower' : 'leg'} markerEnd={i === windows.length - 2 ? `url(#avid-arrow-${kind})` : undefined} />
      ))}
      {pause && (
        <g className="pause" transform={`translate(${px.toFixed(1)},${py.toFixed(1)})`}>
          <title>at the Midpoint</title>
          <rect x={-4.2} y={-4} width={2.8} height={8} />
          <rect x={1.4} y={-4} width={2.8} height={8} />
        </g>
      )}
    </g>
  );
}

export interface AvidCardProps {
  readonly markers?: Markers;
  /** Windows offered to click, drawn as pips. */
  readonly choices?: readonly AvidChoice[];
  readonly onPick?: (w: AvidWindow) => void;
  /** A click in a window away from any pip; the window comes in its upper half (yellow has none). */
  readonly onWindow?: (printed: AvidWindow) => void;
  /** Marker journeys to trace over the card. */
  readonly paths?: readonly AvidPath[];
  readonly title?: string;
  readonly className?: string;
  readonly children?: ReactNode;
}

export function AvidCard({ markers, choices = [], onPick, onWindow, paths = [], title, className, children }: AvidCardProps) {
  const printed = ALL_WINDOWS.filter((w) => w.ring === 'yellow' || w.hemi === 'upper');
  const hexPoints = [30, 90, 150, 210, 270, 330].map((a) => toXY(a, HEX_R).join(',')).join(' ');

  // things sharing a printed window are spread so none hides another
  const markerCells = new Map<string, MarkerName[]>();
  if (markers) for (const name of MARKER_NAMES) {
    const k = printedKey(markers[name]);
    markerCells.set(k, [...(markerCells.get(k) ?? []), name]);
  }
  const pipCells = new Map<string, AvidChoice[]>();
  for (const c of choices) {
    const k = printedKey(c.window);
    pipCells.set(k, [...(pipCells.get(k) ?? []), c]);
  }

  return (
    <svg className={`avid${className ? ` ${className}` : ''}`} viewBox="-112 -112 224 224" role="img" aria-label={title ?? 'AVID'}>
      {title && <title>{title}</title>}
      <defs>
        {(['forward', 'top'] as const).map((kind) => (
          <marker key={kind} id={`avid-arrow-${kind}`} className={kind} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 Z" />
          </marker>
        ))}
      </defs>
      <polygon className="hex" points={hexPoints} />
      {printed.map((w) => {
        const key = printedKey(w);
        const click = onWindow ? () => onWindow(w) : undefined;
        if (w.ring === 'purple') return <circle key={key} className={`cell ${w.ring}`} cx={0} cy={0} r={R_OUT.purple} onClick={click} />;
        const half = w.ring === 'green' ? 30 : 15;
        return <path key={key} className={`cell ${w.ring}`} d={sectorPath(R_IN[w.ring], R_OUT[w.ring], w.az * 30 - half, w.az * 30 + half)} onClick={click} />;
      })}
      {AZIMUTH_LABELS.map((label, i) => {
        // as the card prints them: hex edges named in the yellow ring, hex corners in the blue
        const edge = i % 2 === 0;
        const [x, y] = toXY(i * 30, edge ? 95 : 72);
        return (
          <text key={label} className={`label ${edge ? 'edge' : 'corner'}`} x={x} y={y}>
            {label}
          </text>
        );
      })}
      {paths.map((p, i) => (
        <TracePath key={i} path={p} />
      ))}
      {markers &&
        MARKER_NAMES.map((name) => {
          const w = markers[name];
          const shared = markerCells.get(printedKey(w))!;
          const [x, y] = slot(w, R_MARK[w.ring], shared.indexOf(name), shared.length);
          const lower = isLower(w);
          return (
            <g key={name} className={`mark ${name}${lower ? ' lower' : ''}`} transform={`translate(${x.toFixed(1)},${y.toFixed(1)})`} aria-label={`${MARKER_LABELS[name]}: ${windowKey(w)}`}>
              <title>{`${MARKER_LABELS[name]} — ${windowKey(w)}`}</title>
              {lower && <circle className="ring" r={9} />}
              <Glyph name={name} />
            </g>
          );
        })}
      {choices.map((c) => {
        const shared = pipCells.get(printedKey(c.window))!;
        const [x, y] = slot(c.window, R_PIP[c.window.ring], shared.indexOf(c), shared.length);
        const lower = isLower(c.window);
        const cls = `pip ${c.kind ?? 'step'}${lower ? ' lower' : ''}${c.disabled ? ' disabled' : ''}`;
        return (
          <g
            key={windowKey(c.window)}
            className={cls}
            transform={`translate(${x.toFixed(1)},${y.toFixed(1)})`}
            role={onPick && !c.disabled ? 'button' : undefined}
            aria-label={c.title ?? windowKey(c.window)}
            onClick={(e) => {
              e.stopPropagation();
              if (!c.disabled) onPick?.(c.window);
            }}
          >
            <title>{c.title ?? windowKey(c.window)}</title>
            <circle className="hit" r={9} />
            {lower && <circle className="ring" r={6} />}
            <circle className="dot" r={3.2} />
          </g>
        );
      })}
      {children}
    </svg>
  );
}

/** A legend of the six marker symbols, for a first look at the card. */
export function AvidLegend() {
  return (
    <ul className="avid-legend" aria-label="marker symbols">
      {MARKER_NAMES.map((name) => (
        <li key={name}>
          <svg viewBox="-9 -9 18 18" className="avid" aria-hidden="true">
            <g className={`mark ${name}`}>
              <Glyph name={name} />
            </g>
          </svg>
          {MARKER_LABELS[name]}
        </li>
      ))}
      <li>
        <svg viewBox="-9 -9 18 18" className="avid" aria-hidden="true">
          <g className="mark lower">
            <circle className="ring" r={8} />
          </g>
        </svg>
        circled: lower half
      </li>
    </ul>
  );
}
