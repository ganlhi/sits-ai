/**
 * A top-down sketch of the table: hexes around the ships, each ship with its altitude, and for
 * AI ships with revealed orders their Midpoint and End-of-Turn markers. The highlighted hex is
 * the centre of the physical map; positions are offsets from it.
 *
 * The view fits the ships until the player zooms (wheel, pinch) or pans (drag); "Fit" returns
 * to the automatic view. The view is the SVG viewBox itself, in pixels of the drawing.
 */
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { hexToPoint, pointToHex, type Cube, type Position } from '../domain/geometry';
import { isOutOfAction, shipMotion, type Game } from '../domain/game';

const SCALE = 34; // px per hex width
const R = 1 / Math.sqrt(3); // circumradius of a flat-top hex of width 1
const MIN_WIDTH = 4 * SCALE;
const MAX_WIDTH = 60 * SCALE;
const MAX_GRID_HEXES = 1500;

function hexPath(cx: number, cy: number): string {
  const pts: string[] = [];
  for (let k = 0; k < 6; k++) {
    const a = (k * 60 * Math.PI) / 180;
    pts.push(`${(cx + R * Math.cos(a)) * SCALE},${(cy - R * Math.sin(a)) * SCALE}`);
  }
  return `M${pts.join('L')}Z`;
}

interface ViewBox {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** Drawing coordinates of a position (y down). */
const P = (pos: Position) => {
  const p = hexToPoint(pos.hex);
  return { x: p.x * SCALE, y: -p.y * SCALE };
};

/** The view that shows every ship and marker, at least a dozen hexes across, in the element's aspect ratio. */
function fitView(points: { x: number; y: number }[], aspect: number): ViewBox {
  const pad = 2.5 * SCALE;
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.min(...xs) - pad;
  const maxX = Math.max(...xs) + pad;
  const minY = Math.min(...ys) - pad;
  const maxY = Math.max(...ys) + pad;
  let w = Math.max(maxX - minX, 12 * SCALE);
  let h = Math.max(maxY - minY, w / aspect);
  if (w / h < aspect) w = h * aspect;
  else h = w / aspect;
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  return { x: cx - w / 2, y: cy - h / 2, w, h };
}

function zoomAround(v: ViewBox, factor: number, px: number, py: number): ViewBox {
  const w = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, v.w * factor));
  const f = w / v.w;
  return { x: px - (px - v.x) * f, y: py - (py - v.y) * f, w, h: v.h * f };
}

export function HexMap({ game }: { game: Game }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [aspect, setAspect] = useState(1.6);
  const [view, setView] = useState<ViewBox | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const viewRef = useRef<ViewBox | null>(null);
  /** Change the view from its latest value, so several events in one frame all count. */
  const apply = (fn: (v: ViewBox) => ViewBox) => setView((cur) => fn(cur ?? viewRef.current ?? { x: 0, y: 0, w: 12 * SCALE, h: 8 * SCALE }));

  const ships = game.ships;
  const points: { x: number; y: number }[] = [];
  const motions = new Map<string, ReturnType<typeof shipMotion>>();
  for (const s of ships) {
    points.push(P(s.position));
    if (s.orders) {
      const m = shipMotion(s);
      motions.set(s.id, m);
      points.push(P(m.midpoint), P(m.endOfTurn));
    }
  }
  if (!points.length) points.push({ x: 0, y: 0 });
  const vb = view ?? fitView(points, aspect);
  viewRef.current = vb;

  // keep the fitted view in the element's aspect ratio
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const update = () => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) setAspect(r.width / r.height);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /** Client pixels → drawing coordinates, accounting for the letterboxing of `meet`. */
  const toDrawing = (clientX: number, clientY: number, v: ViewBox) => {
    const el = svgRef.current;
    if (!el) return { x: v.x, y: v.y, unit: 1 };
    const r = el.getBoundingClientRect();
    const unit = Math.min(r.width / v.w, r.height / v.h); // client px per drawing px
    const ox = (r.width - v.w * unit) / 2;
    const oy = (r.height - v.h * unit) / 2;
    return { x: v.x + (clientX - r.left - ox) / unit, y: v.y + (clientY - r.top - oy) / unit, unit };
  };

  // wheel zoom needs a non-passive listener to keep the page from scrolling
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const factor = Math.exp(Math.sign(e.deltaY) * 0.18);
      apply((v) => {
        const p = toDrawing(e.clientX, e.clientY, v);
        return zoomAround(v, factor, p.x, p.y);
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onPointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // a pointer that is already gone (or synthetic): pan and pinch still work while it moves over the map
    }
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
  };
  const onPointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    const { clientX, clientY } = e;
    const others = [...pointers.current.entries()].filter(([id]) => id !== e.pointerId);
    if (others.length === 0) {
      // one finger or the mouse: pan
      apply((v) => {
        const { unit } = toDrawing(clientX, clientY, v);
        return { ...v, x: v.x - (clientX - prev.x) / unit, y: v.y - (clientY - prev.y) / unit };
      });
    } else {
      // two pointers: pinch around their midpoint
      const [, o] = others[0]!;
      const before = Math.hypot(prev.x - o.x, prev.y - o.y);
      const after = Math.hypot(clientX - o.x, clientY - o.y);
      if (before > 0 && after > 0) {
        apply((v) => {
          const mid = toDrawing((clientX + o.x) / 2, (clientY + o.y) / 2, v);
          return zoomAround(v, before / after, mid.x, mid.y);
        });
      }
    }
    pointers.current.set(e.pointerId, { x: clientX, y: clientY });
  };
  const onPointerUp = (e: ReactPointerEvent<SVGSVGElement>) => {
    pointers.current.delete(e.pointerId);
  };

  // the hexes covering the view, unless zoomed out so far that the grid would be noise
  const hexes: Cube[] = [];
  const cols = vb.w / SCALE;
  const rows = vb.h / SCALE;
  if (cols * rows * 1.2 <= MAX_GRID_HEXES) {
    const seen = new Set<string>();
    for (let y = -(vb.y + vb.h) / SCALE - 1; y <= -vb.y / SCALE + 1; y += 0.5) {
      for (let x = vb.x / SCALE - 1; x <= (vb.x + vb.w) / SCALE + 1; x += 0.5) {
        const c = pointToHex(x, y);
        const k = `${c.x},${c.z}`;
        if (!seen.has(k)) {
          seen.add(k);
          hexes.push(c);
        }
      }
    }
  }

  return (
    <div className="hexmap-wrap">
      <svg
        ref={svgRef}
        className="hexmap"
        viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="map"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={() => setView(null)}
      >
        {hexes.map((c) => {
          const p = hexToPoint(c);
          const origin = c.x === 0 && c.y === 0 && c.z === 0;
          return <path key={`${c.x},${c.z}`} d={hexPath(p.x, -p.y)} className={`hex${origin ? ' hex-origin' : ''}`} />;
        })}
        {hexes.length === 0 && <path d={hexPath(0, 0)} className="hex hex-origin" />}
        {ships.map((s) => {
          const m = motions.get(s.id);
          const a = P(s.position);
          return (
            <g key={s.id} className={`ship side-${s.side}${isOutOfAction(s) ? ' out' : ''}`}>
              {m && (
                <>
                  <line x1={a.x} y1={a.y} x2={P(m.endOfTurn).x} y2={P(m.endOfTurn).y} className="track-line-svg" />
                  <circle cx={P(m.midpoint).x} cy={P(m.midpoint).y} r={5} className="marker midpoint" />
                  <rect x={P(m.endOfTurn).x - 5} y={P(m.endOfTurn).y - 5} width={10} height={10} className="marker eot" transform={`rotate(45 ${P(m.endOfTurn).x} ${P(m.endOfTurn).y})`} />
                </>
              )}
              <circle cx={a.x} cy={a.y} r={9} className="ship-dot" />
              <text x={a.x} y={a.y + 3.5} textAnchor="middle" className="ship-alt">
                {s.position.alt}
              </text>
              <text x={a.x + 12} y={a.y - 8} className="ship-name">
                {s.name}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="hexmap-tools">
        <button type="button" aria-label="zoom in" onClick={() => apply((v) => zoomAround(v, 1 / 1.4, v.x + v.w / 2, v.y + v.h / 2))}>
          +
        </button>
        <button type="button" aria-label="zoom out" onClick={() => apply((v) => zoomAround(v, 1.4, v.x + v.w / 2, v.y + v.h / 2))}>
          −
        </button>
        <button type="button" onClick={() => setView(null)} disabled={view === null} title="Back to the view that fits every ship (or double-click the map)">
          Fit
        </button>
      </div>
    </div>
  );
}
