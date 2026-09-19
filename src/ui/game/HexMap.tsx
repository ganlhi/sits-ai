/**
 * A top-down sketch of the table: hexes around the ships, each ship with its altitude, its
 * Midpoint and End-of-Turn markers and the line it will travel. The origin hex is wherever the
 * first ship was placed; the physical map's own numbering is not modelled.
 */
import { hexToPoint, pointToHex, type Cube, type Position } from '../../domain/geometry';
import { shipMotion, type GameState, type ShipState, shipsOf } from '../../domain/game';

const SCALE = 34; // px per hex width
const R = 1 / Math.sqrt(3); // circumradius of a flat-top hex of width 1

function hexPath(cx: number, cy: number): string {
  const pts: string[] = [];
  for (let k = 0; k < 6; k++) {
    const a = (k * 60 * Math.PI) / 180;
    pts.push(`${(cx + R * Math.cos(a)) * SCALE},${(cy - R * Math.sin(a)) * SCALE}`);
  }
  return `M${pts.join('L')}Z`;
}

export interface HexMapProps {
  readonly game: GameState;
  readonly selected?: string | undefined;
  readonly onSelect?: ((shipId: string) => void) | undefined;
  readonly onHexClick?: ((hex: Cube) => void) | undefined;
  /** Show markers (needs orders or drift). */
  readonly showMarkers?: boolean;
}

export function HexMap({ game, selected, onSelect, onHexClick, showMarkers = true }: HexMapProps) {
  const ships = shipsOf(game).filter((s) => !s.destroyed);
  const points: { x: number; y: number }[] = [];
  const motions = new Map<string, ReturnType<typeof shipMotion>>();
  for (const s of ships) {
    points.push(hexToPoint(s.position.hex));
    if (showMarkers) {
      const m = shipMotion(s);
      motions.set(s.id, m);
      points.push(hexToPoint(m.midpoint.hex), hexToPoint(m.endOfTurn.hex));
    }
  }
  if (!points.length) points.push({ x: 0, y: 0 });
  const pad = 2.5;
  const minX = Math.min(...points.map((p) => p.x)) - pad;
  const maxX = Math.max(...points.map((p) => p.x)) + pad;
  const minY = Math.min(...points.map((p) => p.y)) - pad;
  const maxY = Math.max(...points.map((p) => p.y)) + pad;

  // hexes covering the box
  const hexes: Cube[] = [];
  const seen = new Set<string>();
  for (let y = minY; y <= maxY; y += 0.5) {
    for (let x = minX; x <= maxX; x += 0.5) {
      const c = pointToHex(x, y);
      const k = `${c.x},${c.z}`;
      if (!seen.has(k)) {
        seen.add(k);
        hexes.push(c);
      }
    }
  }

  const P = (pos: Position) => {
    const p = hexToPoint(pos.hex);
    return { x: p.x * SCALE, y: -p.y * SCALE };
  };
  const vb = `${minX * SCALE} ${-maxY * SCALE} ${(maxX - minX) * SCALE} ${(maxY - minY) * SCALE}`;

  return (
    <svg className="hexmap" viewBox={vb} role="img" aria-label="map">
      {hexes.map((c) => {
        const p = hexToPoint(c);
        const origin = c.x === 0 && c.y === 0 && c.z === 0;
        return <path key={`${c.x},${c.z}`} d={hexPath(p.x, -p.y)} className={`hex${origin ? ' hex-origin' : ''}`} onClick={onHexClick ? () => onHexClick(c) : undefined} />;
      })}
      {ships.map((s) => {
        const m = motions.get(s.id);
        const a = P(s.position);
        return (
          <g key={s.id} className={`ship side-${s.side}${selected === s.id ? ' selected' : ''}`} onClick={onSelect ? () => onSelect(s.id) : undefined}>
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
  );
}

export function fmtPos(p: Position): string {
  return `q${p.hex.x} r${p.hex.z} · alt ${p.alt}`;
}

export function shipLabel(s: ShipState): string {
  return `${s.name} (${s.side})`;
}
