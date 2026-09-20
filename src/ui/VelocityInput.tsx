/** The eight vector arrows of the AVID as eight small boxes. */
import { VECTOR_DIRECTIONS, type VectorDirection } from '../domain/geometry';

export type VelocityDraft = Readonly<Record<VectorDirection, string>>;

export function VelocityInput({ value, onChange }: { value: VelocityDraft; onChange: (v: VelocityDraft) => void }) {
  return (
    <div className="row">
      {VECTOR_DIRECTIONS.map((d) => (
        <label key={d} className="vec-input">
          {d}
          <input value={value[d]} inputMode="numeric" aria-label={`vector ${d}`} onChange={(e) => onChange({ ...value, [d]: e.target.value })} />
        </label>
      ))}
    </div>
  );
}
