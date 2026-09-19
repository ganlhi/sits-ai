/**
 * One damage track drawn the way the card prints it: squares, circles, numbered octagons and
 * the terminal star, with values inside. Damage state, when given, crosses boxes out.
 */
import type { Box, TrackSpec, TrackState } from '../../domain/ssd';
import { formatValue } from '../../domain/ssd';

export interface TrackViewProps {
  readonly spec: TrackSpec;
  readonly state?: TrackState | undefined;
  /** Show explicit signs (sidewalls, flag bridge, decoys). */
  readonly signed?: boolean;
  readonly onBoxClick?: ((index: number) => void) | undefined;
  /** Boxes per row for wrapping long tracks; 0 = one row. */
  readonly wrap?: number;
  /** Explicit row lengths (the hull grid). */
  readonly rowLengths?: readonly number[] | undefined;
}

const glyph = (b: Box, signed: boolean): string => {
  if (b.mark === 'C') return 'C';
  if (b.mark === 'W') return 'W';
  if (b.mark === 'wrench') return '🔧';
  if (b.shape === 'star') return '★';
  if (b.value === null) return '';
  if (signed && Number.isInteger(b.value) && b.value > 0) return `+${b.value}`;
  return formatValue(b.value);
};

export function TrackView({ spec, state, signed = false, onBoxClick, wrap = 0, rowLengths }: TrackViewProps) {
  const rows: Box[][] = [];
  if (rowLengths && rowLengths.length) {
    let i = 0;
    for (const n of rowLengths) {
      rows.push(spec.boxes.slice(i, i + n));
      i += n;
    }
  } else if (wrap > 0) {
    for (let i = 0; i < spec.boxes.length; i += wrap) rows.push(spec.boxes.slice(i, i + wrap));
  } else {
    rows.push([...spec.boxes]);
  }
  let idx = 0;
  return (
    <span className="track">
      {rows.map((row, ri) => (
        <span className="track-row" key={ri}>
          {row.map((b) => {
            const i = idx++;
            const st = state?.boxes[i]?.status ?? 'ok';
            const cls = `box box-${b.shape}${b.mark ? ` box-mark-${b.mark}` : ''} box-${st}${onBoxClick ? ' box-clickable' : ''}`;
            return (
              <span key={i} className={cls} title={`box ${i + 1}: ${st}`} onClick={onBoxClick ? () => onBoxClick(i) : undefined} role={onBoxClick ? 'button' : undefined}>
                {glyph(b, signed)}
              </span>
            );
          })}
          {ri === rows.length - 1 && spec.exhaustedValue !== null && <span className="track-exhausted">{signed && spec.exhaustedValue > 0 ? `+${spec.exhaustedValue}` : formatValue(spec.exhaustedValue)}</span>}
        </span>
      ))}
    </span>
  );
}
