/**
 * The flat AVID: the printed play aid, window for window (RULES.md §5).
 *
 * Rings from the outside in: yellow (12), blue (12), green (6), purple (1). Upper and lower
 * hemispheres share the printed windows; lower-hemisphere markers are circled, as on the card.
 */
import type { ReactNode } from 'react';
import {
  ALL_WINDOWS,
  AZIMUTH_LABELS,
  windowKey,
  windowsEqual,
  type AvidWindow,
  type Hemisphere,
  type Markers,
  type MarkerName,
  MARKER_NAMES,
} from '../../domain/geometry';

const R = { yellowOut: 100, blueOut: 76, greenOut: 52, purpleOut: 26 };
const RING_RADIUS: Record<AvidWindow['ring'], [number, number]> = {
  yellow: [R.blueOut, R.yellowOut],
  blue: [R.greenOut, R.blueOut],
  green: [R.purpleOut, R.greenOut],
  purple: [0, R.purpleOut],
};
const RING_FILL: Record<AvidWindow['ring'], string> = {
  yellow: 'var(--ring-yellow)',
  blue: 'var(--ring-blue)',
  green: 'var(--ring-green)',
  purple: 'var(--ring-purple)',
};

const MARKER_GLYPH: Record<MarkerName, string> = {
  forward: '▲',
  aft: '◖',
  port: '‹',
  starboard: '›',
  top: '★',
  bottom: '⚓',
};

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

/** Where a window's centre sits on the flat card. Lower-hemisphere windows are offset a little so both show. */
export function windowCentre(w: AvidWindow): [number, number] {
  const [r0, r1] = RING_RADIUS[w.ring];
  const r = w.ring === 'purple' ? 0 : (r0 + r1) / 2;
  const az = w.ring === 'purple' ? 0 : w.az * 30;
  return toXY(az, r);
}

export interface AvidFlatProps {
  readonly markers?: Markers;
  /** Windows to outline, e.g. a bearing or pivot target. */
  readonly highlight?: readonly AvidWindow[];
  /** Hemisphere a click on a printed yellow/blue/green window means. */
  readonly clickHemisphere?: Hemisphere;
  readonly onSelect?: (w: AvidWindow) => void;
  readonly children?: ReactNode;
}

export function AvidFlat({ markers, highlight = [], clickHemisphere = 'upper', onSelect, children }: AvidFlatProps) {
  // one printed cell per (ring, az); purple once
  const printed = ALL_WINDOWS.filter((w) => w.ring === 'yellow' || (w.ring !== 'purple' ? w.hemi === 'upper' : w.hemi === 'upper'));
  const hexPoints = [30, 90, 150, 210, 270, 330].map((a) => toXY(a, 108).join(',')).join(' ');

  const isHighlighted = (w: AvidWindow): boolean =>
    highlight.some((h) => (h.ring === 'purple' ? w.ring === 'purple' : h.ring === w.ring && 'az' in h && 'az' in w && h.az === w.az));

  const clickTarget = (w: AvidWindow): AvidWindow =>
    w.ring === 'yellow' ? w : w.ring === 'purple' ? { ring: 'purple', hemi: clickHemisphere } : { ...w, hemi: clickHemisphere };

  return (
    <svg className="avid" viewBox="-125 -125 250 250" role="img" aria-label="AVID">
      <polygon points={hexPoints} fill="none" stroke="var(--line)" strokeWidth={1.5} />
      {printed.map((w) => {
        const [r0, r1] = RING_RADIUS[w.ring];
        const cls = `window${isHighlighted(w) ? ' highlight' : ''}`;
        if (w.ring === 'purple') {
          return <circle key={windowKey(w)} className={cls} cx={0} cy={0} r={r1} fill={RING_FILL.purple} onClick={() => onSelect?.(clickTarget(w))} />;
        }
        const half = w.ring === 'green' ? 30 : 15;
        return (
          <path
            key={windowKey(w)}
            className={cls}
            d={sectorPath(r0, r1, w.az * 30 - half, w.az * 30 + half)}
            fill={RING_FILL[w.ring]}
            onClick={() => onSelect?.(clickTarget(w))}
          />
        );
      })}
      {AZIMUTH_LABELS.map((label, i) => {
        const [x, y] = toXY(i * 30, 116);
        return (
          <text key={label} x={x} y={y} fontSize={i % 2 === 0 ? 9 : 7} textAnchor="middle" dominantBaseline="middle" fontWeight={i % 2 === 0 ? 600 : 400}>
            {label}
          </text>
        );
      })}
      {markers &&
        MARKER_NAMES.map((name) => {
          const w = markers[name];
          const lower = w.ring !== 'yellow' && w.hemi === 'lower';
          const [cx, cy] = windowCentre(w);
          const dx = lower ? 5 : -5;
          const dy = lower ? 5 : -5;
          // stack markers that share a window so none is hidden
          const shared = MARKER_NAMES.filter((n) => windowsEqual(markers[n], w));
          const k = shared.indexOf(name);
          const ox = cx + dx + (k % 2) * 8 - 4;
          const oy = cy + dy + Math.floor(k / 2) * 8 - 4;
          return (
            <g key={name} aria-label={`${name}: ${windowKey(w)}`}>
              {lower && <circle cx={ox} cy={oy} r={7.5} fill="none" stroke="var(--ink)" strokeWidth={1} />}
              <text x={ox} y={oy} fontSize={11} textAnchor="middle" dominantBaseline="central" fontWeight={700}>
                {MARKER_GLYPH[name]}
              </text>
            </g>
          );
        })}
      {children}
    </svg>
  );
}
