/**
 * The ship library and class editor: enter a class from a physical SSD, see it rendered as you
 * type, validate, save, export and import JSON.
 */
import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { BODY_ROWS, MOUNTS, type Mount } from '../../domain/geometry';
import { GRADES, OFFICER_TYPES, type ShipClass } from '../../domain/ssd';
import { deleteShip, freshShipId, isBuiltIn, listShips, saveShip } from '../../storage/shipLibrary';
import { draftFromShip, shipFromDraft, type DraftError, type MountDraft, type ShipDraft } from './draft';
import { SsdSheet } from './SsdSheet';

function Field({ label, value, onChange, errors, field, wide, mono, rows }: { label: string; value: string; onChange: (v: string) => void; errors: DraftError[]; field: string; wide?: boolean; mono?: boolean; rows?: number }) {
  const errs = errors.filter((e) => e.field === field || e.field.startsWith(`${field}.`) || e.field.startsWith(`${field}[`));
  const cls = `field${wide ? ' field-wide' : ''}${errs.length ? ' field-error' : ''}`;
  return (
    <div className={cls}>
      <label>{label}</label>
      {rows ? (
        <textarea value={value} rows={rows} spellCheck={false} className={mono ? 'mono' : ''} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input value={value} spellCheck={false} className={mono ? 'mono' : ''} onChange={(e) => onChange(e.target.value)} />
      )}
      {errs.map((e, i) => (
        <div key={i} className="field-msg">
          {e.message}
        </div>
      ))}
    </div>
  );
}

function download(name: string, text: string): void {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function SsdEditor() {
  const [ships, setShips] = useState<ShipClass[]>(() => listShips());
  const [selectedId, setSelectedId] = useState<string>(ships[0]?.id ?? '');
  const [draft, setDraft] = useState<ShipDraft | null>(null);
  const [dirty, setDirty] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  const selected = ships.find((s) => s.id === selectedId) ?? ships[0];
  const readOnly = selected ? isBuiltIn(selected.id) : false;

  useEffect(() => {
    if (selected && !dirty) setDraft(draftFromShip(selected));
  }, [selected, dirty]);

  const parsed = useMemo(() => (draft ? shipFromDraft(draft) : { errors: [] as DraftError[] }), [draft]);
  const errors = parsed.errors;
  const preview = parsed.ship ?? (dirty ? null : selected);

  const refresh = (id?: string) => {
    const list = listShips();
    setShips(list);
    if (id) setSelectedId(id);
    setDirty(false);
  };

  const update = (patch: Partial<ShipDraft>) => {
    if (!draft) return;
    setDraft({ ...draft, ...patch });
    setDirty(true);
  };
  const updateMount = (m: Mount, patch: Partial<MountDraft>) => {
    if (!draft) return;
    update({ mounts: { ...draft.mounts, [m]: { ...draft.mounts[m], ...patch } } });
  };

  const onSave = () => {
    if (!parsed.ship) return;
    saveShip(parsed.ship);
    refresh(parsed.ship.id);
  };
  const onDuplicate = () => {
    if (!selected) return;
    const copy: ShipClass = { ...selected, id: freshShipId(`${selected.className}-copy`), className: `${selected.className} (copy)` };
    saveShip(copy);
    refresh(copy.id);
  };
  const onNew = () => {
    const base = ships[0];
    if (!base) return;
    const blank: ShipClass = { ...base, id: freshShipId('new-class'), nationality: '', className: 'New class', hullType: '', notes: null, printedBoxCount: null, introduced: null };
    saveShip(blank);
    refresh(blank.id);
  };
  const onDelete = () => {
    if (!selected || readOnly) return;
    if (!window.confirm(`Delete ${selected.className}?`)) return;
    deleteShip(selected.id);
    refresh(listShips()[0]?.id);
  };
  const onExport = () => {
    const ship = parsed.ship ?? selected;
    if (ship) download(`${ship.id}.json`, JSON.stringify(ship, null, 2));
  };
  const onImport = (ev: ChangeEvent<HTMLInputElement>) => {
    const file = ev.target.files?.[0];
    if (!file) return;
    file.text().then((text) => {
      try {
        const json = JSON.parse(text) as unknown;
        const d = draftFromShip(json as ShipClass);
        const r = shipFromDraft(d);
        if (!r.ship) {
          setImportError(`${file.name}: ${r.errors.map((e) => `${e.field}: ${e.message}`).join('; ')}`);
          return;
        }
        let ship = r.ship;
        if (isBuiltIn(ship.id) || ships.some((s) => s.id === ship.id)) ship = { ...ship, id: freshShipId(ship.id) };
        saveShip(ship);
        setImportError(null);
        refresh(ship.id);
      } catch (e) {
        setImportError(`${file.name}: ${e instanceof Error ? e.message : String(e)}`);
      }
    });
    ev.target.value = '';
  };

  if (!draft || !selected) return <p className="note">No ships.</p>;

  return (
    <div className="editor">
      <aside className="panel editor-list">
        <h2>Ship classes</h2>
        <ul className="ship-list">
          {ships.map((s) => (
            <li key={s.id}>
              <button type="button" className={s.id === selected.id ? 'selected' : ''} onClick={() => { setSelectedId(s.id); setDirty(false); }}>
                {s.className} <span className="note">{s.hullType}</span>
                {isBuiltIn(s.id) && <span className="tag">built-in</span>}
              </button>
            </li>
          ))}
        </ul>
        <div className="row">
          <button type="button" onClick={onNew}>New</button>
          <button type="button" onClick={onDuplicate}>Duplicate</button>
          <button type="button" onClick={onDelete} disabled={readOnly}>Delete</button>
        </div>
        <div className="row" style={{ marginTop: 8 }}>
          <button type="button" onClick={onExport}>Export JSON</button>
          <label className="button">
            Import JSON
            <input type="file" accept="application/json,.json" onChange={onImport} hidden />
          </label>
        </div>
        {importError && <p className="field-msg">{importError}</p>}
        <p className="note" style={{ marginTop: 12 }}>
          Tracks are typed the way the card reads: <code>0 0 1 3 | 4</code>, <code>_*8 (W)</code>, <code>2*9 1 1*5 (1)*3</code>, <code>+4*10</code>; <code>#</code> is a hull box with a wrench, <code>[4]</code> an
          octagon, <code>(C)</code> a core-cascade box, <code>*</code> the SI star. Weapons: one per line, <code>16M | !8</code> (countdown of 8) or <code>CM | 6 5 5 4 4 3 2 2 1 2/3</code>. Arcs: letters B/G/W per
          window, longitude 0 = Forward, clockwise through Starboard. Hit location: 11 rows × 19 codes, <code>.</code> blank, <code>*SI*</code> Core.
        </p>
      </aside>

      <section className="panel editor-form">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2>
            {readOnly ? 'Built-in (read-only — duplicate to edit)' : dirty ? 'Editing' : 'Saved'}
          </h2>
          <div className="row">
            <span className="note">{errors.length ? `${errors.length} problem${errors.length > 1 ? 's' : ''}` : 'valid'}</span>
            <button type="button" onClick={onSave} disabled={readOnly || !parsed.ship || !dirty}>Save</button>
            <button type="button" onClick={() => setDirty(false)} disabled={!dirty}>Revert</button>
          </div>
        </div>
        <fieldset disabled={readOnly}>
          <h3>Identity</h3>
          <div className="grid-3">
            <Field label="id" field="id" value={draft.id} onChange={(v) => update({ id: v })} errors={errors} mono />
            <Field label="Nationality" field="nationality" value={draft.nationality} onChange={(v) => update({ nationality: v })} errors={errors} />
            <Field label="Class name" field="className" value={draft.className} onChange={(v) => update({ className: v })} errors={errors} />
            <Field label="Hull type" field="hullType" value={draft.hullType} onChange={(v) => update({ hullType: v })} errors={errors} />
            <Field label="In service (PD)" field="introduced" value={draft.introduced} onChange={(v) => update({ introduced: v })} errors={errors} />
            <Field label="Base cost" field="baseCost" value={draft.baseCost} onChange={(v) => update({ baseCost: v })} errors={errors} />
            <Field label="Officers" field="crew.officers" value={draft.officers} onChange={(v) => update({ officers: v })} errors={errors} />
            <Field label="Enlisted" field="crew.enlisted" value={draft.enlisted} onChange={(v) => update({ enlisted: v })} errors={errors} />
            <Field label="Marines" field="crew.marines" value={draft.marines} onChange={(v) => update({ marines: v })} errors={errors} />
            <Field label="Recon drones" field="reconDrones" value={draft.reconDrones} onChange={(v) => update({ reconDrones: v })} errors={errors} />
            <Field label="Printed box count" field="printedBoxCount" value={draft.printedBoxCount} onChange={(v) => update({ printedBoxCount: v })} errors={errors} />
            <Field label="Small craft" field="smallCraft" value={draft.smallCraft} onChange={(v) => update({ smallCraft: v })} errors={errors} />
          </div>

          <h3>Officers &amp; crew cost</h3>
          <table className="compact edit-table">
            <thead>
              <tr>
                <th />
                {GRADES.map((g) => (
                  <th key={g}>{g}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {OFFICER_TYPES.map((o) => (
                <tr key={o}>
                  <th>{o}</th>
                  {GRADES.map((g) => (
                    <td key={g}>
                      <input value={draft.officerCosts[o][g]} onChange={(e) => update({ officerCosts: { ...draft.officerCosts, [o]: { ...draft.officerCosts[o], [g]: e.target.value } } })} />
                    </td>
                  ))}
                </tr>
              ))}
              <tr>
                <th>CQ target ≤</th>
                {GRADES.map((g) => (
                  <td key={g}>
                    <input value={draft.crewQualityTarget[g]} onChange={(e) => update({ crewQualityTarget: { ...draft.crewQualityTarget, [g]: e.target.value } })} />
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
          {errors.filter((e) => e.field.startsWith('officerCosts') || e.field.startsWith('crewQualityTarget')).map((e, i) => (
            <div key={i} className="field-msg">{e.field}: {e.message}</div>
          ))}

          <Field label="Range bands — one per line: max range, base MQL, salvo letters (E M L)" field="rangeBands" value={draft.rangeBands} onChange={(v) => update({ rangeBands: v })} errors={errors} rows={8} mono wide />

          <h3>Weapon mounts</h3>
          {MOUNTS.map((m) => {
            const md = draft.mounts[m];
            return (
              <details key={m} open className="mount-edit">
                <summary>{md.name || m}</summary>
                <div className="grid-3">
                  <Field label="Name" field={`mounts.${m}.name`} value={md.name} onChange={(v) => updateMount(m, { name: v })} errors={errors} />
                  <Field label="Fire control track" field={`mounts.${m}.fcon`} value={md.fcon} onChange={(v) => updateMount(m, { fcon: v })} errors={errors} mono />
                  <Field label="Magazine (salvoes)" field={`mounts.${m}.magazine`} value={md.magazine} onChange={(v) => updateMount(m, { magazine: v })} errors={errors} />
                </div>
                <Field label="Weapons — one per line: label | track" field={`mounts.${m}.weapons`} value={md.weapons} onChange={(v) => updateMount(m, { weapons: v })} errors={errors} rows={6} mono wide />
                <div className="grid-3">
                  <Field label="Decoys (blank if none)" field={`mounts.${m}.decoys`} value={md.decoys} onChange={(v) => updateMount(m, { decoys: v })} errors={errors} mono />
                  <div className="field">
                    <label>Grav lance</label>
                    <input type="checkbox" checked={md.gravLance} onChange={(e) => updateMount(m, { gravLance: e.target.checked })} />
                  </div>
                </div>
                <div className="grid-3">
                  {BODY_ROWS.map((row) => (
                    <Field key={row} label={`Arc ${row}`} field={`mounts.${m}.arc.${row}`} value={md.arc[row]} onChange={(v) => updateMount(m, { arc: { ...md.arc, [row]: v } })} errors={errors} mono />
                  ))}
                </div>
              </details>
            );
          })}

          <h3>Internals</h3>
          <div className="grid-2">
            {(
              [
                ['bridge', 'Bridge'],
                ['flagBridge', 'Flag bridge'],
                ['lifeSupport', 'Life support'],
                ['communications', 'Communications'],
                ['ecm', 'ECM'],
                ['pivot', 'Pivot'],
                ['roll', 'Roll'],
                ['forwardImpeller', 'Forward impeller'],
                ['aftImpeller', 'Aft impeller'],
                ['maxThrust', 'Maximum thrust'],
                ['hyperGenerator', 'Hyper generator'],
                ['structuralIntegrity', 'Structural integrity'],
              ] as const
            ).map(([k, label]) => (
              <Field key={k} label={label} field={`internals.${k}`} value={draft.internals[k]} onChange={(v) => update({ internals: { ...draft.internals, [k]: v } })} errors={errors} mono />
            ))}
            <Field label="Evolution delays (under the pivot track)" field="internals.evolutionDelays" value={draft.internals.evolutionDelays} onChange={(v) => update({ internals: { ...draft.internals, evolutionDelays: v } })} errors={errors} mono />
          </div>
          <Field label="Hull (all rows, left to right; # = wrench)" field="internals.hull" value={draft.internals.hull} onChange={(v) => update({ internals: { ...draft.internals, hull: v } })} errors={errors} rows={3} mono wide />
          <Field label="Hull row lengths" field="internals.hullRowLengths" value={draft.internals.hullRowLengths} onChange={(v) => update({ internals: { ...draft.internals, hullRowLengths: v } })} errors={errors} mono />

          <h3>Defences</h3>
          <div className="grid-2">
            <Field label="Port sidewall" field="sidewalls.port" value={draft.sidewallPort} onChange={(v) => update({ sidewallPort: v })} errors={errors} mono />
            <Field label="Starboard sidewall" field="sidewalls.starboard" value={draft.sidewallStarboard} onChange={(v) => update({ sidewallStarboard: v })} errors={errors} mono />
            <Field label="Forward hammerhead armour" field="hammerheadArmor.forward" value={draft.hammerheadForward} onChange={(v) => update({ hammerheadForward: v })} errors={errors} />
            <Field label="Aft hammerhead armour" field="hammerheadArmor.aft" value={draft.hammerheadAft} onChange={(v) => update({ hammerheadAft: v })} errors={errors} />
            <Field label="Bow wall (blank if none)" field="bowWall" value={draft.bowWall} onChange={(v) => update({ bowWall: v })} errors={errors} mono />
            <Field label="Stern wall (blank if none)" field="sternWall" value={draft.sternWall} onChange={(v) => update({ sternWall: v })} errors={errors} mono />
          </div>

          <h3>Hit location table</h3>
          <div className="grid-3">
            <Field label="Scale" field="hitLocation.scale" value={draft.hltScale} onChange={(v) => update({ hltScale: v })} errors={errors} />
            <Field label="Core armor" field="hitLocation.coreArmor" value={draft.hltCoreArmor} onChange={(v) => update({ hltCoreArmor: v })} errors={errors} />
          </div>
          <Field label="Cells — 11 rows (2-3 … 19-20) × 19 columns (2 … 20); . = blank, *code* = Core" field="hitLocation" value={draft.hitLocation} onChange={(v) => update({ hitLocation: v })} errors={errors} rows={12} mono wide />

          <Field label="Notes" field="notes" value={draft.notes} onChange={(v) => update({ notes: v })} errors={errors} rows={3} wide />
        </fieldset>
      </section>

      <section className="panel editor-preview">
        <h2>Preview</h2>
        {preview ? <SsdSheet ship={preview} /> : <p className="note">Fix the problems on the left to see the sheet.</p>}
      </section>
    </div>
  );
}
