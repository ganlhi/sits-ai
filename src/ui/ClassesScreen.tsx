/**
 * The ship class library: a table of classes and a form to add or edit one. Only the numbers
 * the AI uses — cost, the three ratings, the three range bands.
 */
import { useState } from 'react';
import { BAND_LABELS, BAND_NAMES, blankShipClass, validateShipClass, type BandName, type ShipClass } from '../domain/game';
import { deleteClass, freshClassId, restoreBuiltIns, saveClass, useClasses } from '../storage/shipClasses';

interface Draft {
  readonly id: string;
  readonly name: string;
  readonly baseCost: string;
  readonly maxThrust: string;
  readonly maxPivot: string;
  readonly maxRoll: string;
  readonly bands: Readonly<Record<BandName, { readonly min: string; readonly max: string }>>;
}

const toDraft = (c: ShipClass): Draft => ({
  id: c.id,
  name: c.name,
  baseCost: String(c.baseCost),
  maxThrust: String(c.maxThrust),
  maxPivot: String(c.maxPivot),
  maxRoll: String(c.maxRoll),
  bands: { short: { min: String(c.bands.short.min), max: String(c.bands.short.max) }, medium: { min: String(c.bands.medium.min), max: String(c.bands.medium.max) }, long: { min: String(c.bands.long.min), max: String(c.bands.long.max) } },
});

const num = (s: string): number => (s.trim() === '' ? NaN : Number(s));

const fromDraft = (d: Draft): ShipClass => ({
  id: d.id,
  name: d.name.trim(),
  baseCost: num(d.baseCost),
  maxThrust: num(d.maxThrust),
  maxPivot: num(d.maxPivot),
  maxRoll: num(d.maxRoll),
  bands: { short: { min: num(d.bands.short.min), max: num(d.bands.short.max) }, medium: { min: num(d.bands.medium.min), max: num(d.bands.medium.max) }, long: { min: num(d.bands.long.min), max: num(d.bands.long.max) } },
});

function Num({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="field">
      <label>{label}</label>
      <input value={value} inputMode="numeric" onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

export function ClassesScreen() {
  const { classes, refresh } = useClasses();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const cls = draft ? fromDraft(draft) : null;
  const errors = cls ? validateShipClass(cls) : [];
  const isNew = draft ? !classes.some((c) => c.id === draft.id) : false;

  const startNew = () => {
    setDraft(toDraft(blankShipClass(`new-${Date.now().toString(36)}`)));
    setSaved(null);
  };
  const edit = (c: ShipClass) => {
    setDraft(toDraft(c));
    setSaved(null);
  };
  const duplicate = (c: ShipClass) => {
    setDraft(toDraft({ ...c, id: freshClassId(`${c.name} copy`), name: `${c.name} (copy)` }));
    setSaved(null);
  };
  const save = () => {
    if (!cls || errors.length) return;
    const id = isNew ? freshClassId(cls.name) : cls.id;
    saveClass({ ...cls, id });
    refresh();
    setDraft(null);
    setSaved(cls.name);
  };
  const remove = (c: ShipClass) => {
    if (!window.confirm(`Delete the class "${c.name}"? Ships already in a game keep their copy.`)) return;
    deleteClass(c.id);
    refresh();
    if (draft?.id === c.id) setDraft(null);
  };

  return (
    <div className="games">
      <section className="panel">
        <div className="row">
          <h2>Ship classes</h2>
          <span className="grow" />
          <button type="button" className="primary" onClick={startNew}>
            New class
          </button>
          <button
            type="button"
            onClick={() => {
              restoreBuiltIns();
              refresh();
            }}
          >
            Restore built-in classes
          </button>
        </div>
        <p className="note">
          A class is the handful of numbers the opponent plots with: the SSD's base cost (how big and dangerous the ship is), the maximum thrust, pivot and roll ratings, and the three range
          bands read off the SSD's range-band table — short: Early + Middle + Late salvoes, medium: Middle + Late, long: Late only. Ranges are End-of-Turn to End-of-Turn, in hexes, inclusive.
        </p>
        {saved && <p className="note">Saved {saved}.</p>}
        <table className="list">
          <thead>
            <tr>
              <th>Name</th>
              <th>Cost</th>
              <th>Thrust</th>
              <th>Pivot</th>
              <th>Roll</th>
              <th>Short</th>
              <th>Medium</th>
              <th>Long</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {classes.map((c) => (
              <tr key={c.id}>
                <td>
                  <b>{c.name}</b>
                </td>
                <td>{c.baseCost}</td>
                <td>{c.maxThrust}</td>
                <td>{c.maxPivot}</td>
                <td>{c.maxRoll}</td>
                {BAND_NAMES.map((b) => (
                  <td key={b}>
                    {c.bands[b].min}–{c.bands[b].max}
                  </td>
                ))}
                <td className="row">
                  <button type="button" onClick={() => edit(c)}>
                    Edit
                  </button>
                  <button type="button" onClick={() => duplicate(c)}>
                    Duplicate
                  </button>
                  <button type="button" onClick={() => remove(c)}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {draft && (
        <section className="panel">
          <h2>{isNew ? 'New class' : `Edit ${draft.name || 'class'}`}</h2>
          <div className="grid-2">
            <div className="field">
              <label>Name</label>
              <input type="text" value={draft.name} placeholder="Sultan BC (PN)" onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            </div>
            <Num label="Base cost (points)" value={draft.baseCost} onChange={(v) => setDraft({ ...draft, baseCost: v })} />
          </div>
          <div className="grid-3">
            <Num label="Max thrust" value={draft.maxThrust} onChange={(v) => setDraft({ ...draft, maxThrust: v })} />
            <Num label="Max pivot (windows)" value={draft.maxPivot} onChange={(v) => setDraft({ ...draft, maxPivot: v })} />
            <Num label="Max roll (windows)" value={draft.maxRoll} onChange={(v) => setDraft({ ...draft, maxRoll: v })} />
          </div>
          <div className="label note">Range bands (hexes, End of Turn to End of Turn)</div>
          <div className="grid-3">
            {BAND_NAMES.map((b) => (
              <div key={b} className="field">
                <label>{BAND_LABELS[b]}</label>
                <div className="row leg">
                  <span className="note">from</span>
                  <input value={draft.bands[b].min} inputMode="numeric" aria-label={`${b} from`} onChange={(e) => setDraft({ ...draft, bands: { ...draft.bands, [b]: { ...draft.bands[b], min: e.target.value } } })} />
                  <span className="note">to</span>
                  <input value={draft.bands[b].max} inputMode="numeric" aria-label={`${b} to`} onChange={(e) => setDraft({ ...draft, bands: { ...draft.bands, [b]: { ...draft.bands[b], max: e.target.value } } })} />
                </div>
              </div>
            ))}
          </div>
          {errors.length > 0 && (
            <ul className="field-msg">
              {errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}
          <div className="row" style={{ marginTop: 8 }}>
            <button type="button" className="primary" disabled={errors.length > 0} onClick={save}>
              Save
            </button>
            <button type="button" onClick={() => setDraft(null)}>
              Cancel
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
