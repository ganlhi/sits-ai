/**
 * A Ship Systems Display rendered like the card: header, mounts with their arcs and tracks,
 * internals, and the hit location table with the sidewall tracks along its edges.
 */
import { BODY_ROWS, MOUNTS, MOUNT_CENTRE_LON, type ArcColour, type ArcDiagram, type Mount } from '../../domain/geometry';
import { GRADES, OFFICER_TYPES, currentValue, totalBoxes, type ShipClass, type ShipDamage, type TrackId, trackSpec } from '../../domain/ssd';
import { TrackView } from './TrackView';

export interface SsdSheetProps {
  readonly ship: ShipClass;
  readonly damage?: ShipDamage | undefined;
  /** Phase 4: tap a box to mark damage. */
  readonly onBoxClick?: ((trackId: TrackId, index: number) => void) | undefined;
}

const ARC_ROW_ORDER = BODY_ROWS;

/** The visible hemisphere of a mount's arc: centre ±3 columns, all seven rows. */
export function ArcThumb({ arc, mount }: { arc: ArcDiagram; mount: Mount }) {
  const centre = MOUNT_CENTRE_LON[mount];
  const cellFor = (row: (typeof ARC_ROW_ORDER)[number], offset: number): ArcColour | null => {
    if (row === 'top' || row === 'bottom') return offset === 0 ? (arc[row][0] ?? 'black') : null;
    if (row === 'greenUpper' || row === 'greenLower') {
      // green windows are 60° wide: offsets −2, 0, +2 map onto them; odd offsets are shared
      const lon = (((centre + offset) % 12) + 12) % 12;
      if (centre % 2 === 0) return offset % 2 === 0 ? (arc[row][lon / 2] ?? 'black') : null;
      // odd centre: the window straddles; show the nearer edge window
      return offset % 2 !== 0 ? (arc[row][(lon - (lon % 2)) / 2] ?? 'black') : null;
    }
    const lon = (((centre + offset) % 12) + 12) % 12;
    return arc[row][lon] ?? 'black';
  };
  return (
    <div className="arc-thumb" title={`${mount} firing arc (ship-frame, centre ${centre * 30}°)`}>
      {ARC_ROW_ORDER.map((row) => (
        <div key={row} className="arc-row">
          {[-3, -2, -1, 0, 1, 2, 3].map((o) => {
            const c = cellFor(row, o);
            return <span key={o} className={`arc-cell${c ? ` arc-${c}` : ' arc-empty'}`} />;
          })}
        </div>
      ))}
    </div>
  );
}

export function SsdSheet({ ship, damage, onBoxClick }: SsdSheetProps) {
  const st = (id: TrackId) => damage?.tracks[id];
  const click = (id: TrackId) => (onBoxClick ? (i: number) => onBoxClick(id, i) : undefined);
  const rating = (id: TrackId) => {
    const s = st(id);
    return s ? currentValue(trackSpec(ship, id), s) : null;
  };
  const h = ship.hitLocation;

  return (
    <div className="ssd">
      <header className="ssd-header">
        <div>
          <div className="ssd-nation">{ship.nationality}</div>
          <h2 className="ssd-class">
            {ship.className} class {ship.hullType}
          </h2>
          <div className="note">
            Crew {ship.crew.officers + ship.crew.enlisted + ship.crew.marines} ({ship.crew.officers} officers, {ship.crew.enlisted} enlisted, {ship.crew.marines} Marines)
            {ship.smallCraft ? ` · Small craft: ${ship.smallCraft}` : ''} · Recon drones: {ship.reconDrones}
            {ship.introduced ? ` · in service ${ship.introduced} PD` : ''}
          </div>
        </div>
        <div className="ssd-cost">
          <div>
            Base cost <b>{ship.baseCost}</b>
          </div>
          <div>
            Boxes <b>{totalBoxes(ship)}</b>
            {ship.printedBoxCount !== null && ship.printedBoxCount !== totalBoxes(ship) ? <span className="note"> (card prints {ship.printedBoxCount})</span> : null}
          </div>
        </div>
      </header>

      <div className="ssd-grid">
        <section className="ssd-box">
          <h3>Officers &amp; Crew — cost</h3>
          <table className="compact">
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
                    <td key={g}>{ship.officerCosts[o][g] > 0 ? `+${ship.officerCosts[o][g]}` : ship.officerCosts[o][g]}</td>
                  ))}
                </tr>
              ))}
              <tr>
                <th>CQ ≤</th>
                {GRADES.map((g) => (
                  <td key={g}>{ship.crewQualityTarget[g]}</td>
                ))}
              </tr>
            </tbody>
          </table>
        </section>

        <section className="ssd-box">
          <h3>Range bands</h3>
          <table className="compact">
            <tbody>
              <tr>
                <th>Range</th>
                {ship.rangeBands.map((b, i) => (
                  <td key={i}>
                    {i === 0 ? 0 : (ship.rangeBands[i - 1]?.maxRange ?? 0) + 1}–{b.maxRange}
                  </td>
                ))}
              </tr>
              <tr>
                <th>Base MQL</th>
                {ship.rangeBands.map((b, i) => (
                  <td key={i}>{b.baseMql}</td>
                ))}
              </tr>
              <tr>
                <th>Salvoes</th>
                {ship.rangeBands.map((b, i) => (
                  <td key={i}>{b.salvoes.map((s) => s[0]!.toUpperCase()).join('')}</td>
                ))}
              </tr>
            </tbody>
          </table>
        </section>
      </div>

      <div className="ssd-mounts">
        {MOUNTS.map((m) => {
          const mount = ship.mounts[m];
          return (
            <section key={m} className="ssd-box mount">
              <div className="mount-head">
                <h3>{mount.name}</h3>
                <ArcThumb arc={mount.arc} mount={m} />
              </div>
              <div className="track-line">
                <span className="track-label">fcon</span>
                <TrackView spec={mount.fcon} state={st(`mount.${m}.fcon`)} onBoxClick={click(`mount.${m}.fcon`)} />
                {damage && <span className="note"> → +{rating(`mount.${m}.fcon`)} MQL</span>}
              </div>
              {mount.magazine !== null && (
                <div className="track-line">
                  <span className="track-label">mag</span>
                  <span>
                    {damage ? `${damage.magazines[m] ?? mount.magazine} / ` : ''}
                    {mount.magazine} salvoes
                  </span>
                </div>
              )}
              {mount.weapons.map((w, i) => (
                <div className="track-line" key={i}>
                  <span className="track-label">{w.label}</span>
                  <TrackView spec={w.track} state={st(`mount.${m}.weapon.${i}`)} onBoxClick={click(`mount.${m}.weapon.${i}`)} wrap={16} />
                </div>
              ))}
              {mount.gravLance && <div className="track-line note">Grav Lance</div>}
              {mount.decoys && (
                <div className="track-line">
                  <span className="track-label">dcy</span>
                  <TrackView spec={mount.decoys} state={st(`mount.${m}.decoys`)} onBoxClick={click(`mount.${m}.decoys`)} signed />
                </div>
              )}
            </section>
          );
        })}
      </div>

      <div className="ssd-grid">
        <section className="ssd-box">
          <h3>Internals</h3>
          {(
            [
              ['bridge', 'brg Bridge'],
              ['flagBridge', 'flg Flag Bridge'],
              ['lifeSupport', 'lif Life Support'],
              ['communications', 'com Communications'],
              ['ecm', 'ECM'],
              ['pivot', 'piv Pivot'],
              ['roll', 'rol Roll'],
              ['forwardImpeller', 'fwd Forward Impeller'],
              ['aftImpeller', 'aft Aft Impeller'],
              ['maxThrust', 'Maximum Thrust'],
              ['hyperGenerator', 'hyp Hyper Generator'],
            ] as const
          ).map(([key, label]) => (
            <div className="track-line" key={key}>
              <span className="track-label">{label}</span>
              <TrackView spec={ship.internals[key]} state={st(`internals.${key}`)} onBoxClick={click(`internals.${key}`)} signed={key === 'flagBridge'} wrap={key === 'maxThrust' ? 10 : 0} />
              {key === 'pivot' && <span className="note"> delays {ship.internals.evolutionDelays.join(' ')}</span>}
            </div>
          ))}
          <div className="track-line">
            <span className="track-label">SI Structural Integrity</span>
            <TrackView spec={ship.internals.structuralIntegrity} state={st('internals.structuralIntegrity')} onBoxClick={click('internals.structuralIntegrity')} wrap={10} />
          </div>
        </section>
        <section className="ssd-box">
          <h3>hull Hull</h3>
          <TrackView spec={ship.internals.hull} state={st('internals.hull')} onBoxClick={click('internals.hull')} rowLengths={ship.internals.hullRowLengths} />
          <p className="note">🔧 = damage control party</p>
          {ship.bowWall && (
            <div className="track-line">
              <span className="track-label">Bow wall</span>
              <TrackView spec={ship.bowWall} state={st('bowWall')} onBoxClick={click('bowWall')} signed />
            </div>
          )}
          {ship.sternWall && (
            <div className="track-line">
              <span className="track-label">Stern wall</span>
              <TrackView spec={ship.sternWall} state={st('sternWall')} onBoxClick={click('sternWall')} signed />
            </div>
          )}
        </section>
      </div>

      <section className="ssd-box">
        <h3>
          Hit Location Table — Scale {h.scale}, Core Armor {h.coreArmor}
        </h3>
        <div className="track-line">
          <span className="track-label">Starboard sidewall</span>
          <TrackView spec={ship.sidewalls.starboard} state={st('sidewall.starboard')} onBoxClick={click('sidewall.starboard')} signed />
        </div>
        <div className="hlt-wrap">
          <table className="hlt">
            <thead>
              <tr>
                <th className="hlt-corner">FWD +{ship.hammerheadArmor.forward}</th>
                {h.columns.map((c) => (
                  <th key={c}>{c}</th>
                ))}
                <th className="hlt-corner">AFT +{ship.hammerheadArmor.aft}</th>
              </tr>
            </thead>
            <tbody>
              {h.rows.map((row, ri) => (
                <tr key={row.label}>
                  <th>{row.label}</th>
                  {h.columns.map((_, ci) => {
                    const code = h.cells[ri]?.[ci] ?? null;
                    const core = h.core[ri]?.[ci] ?? false;
                    return (
                      <td key={ci} className={`${code ? 'hlt-cell' : 'hlt-blank'}${core ? ' hlt-core' : ''}`}>
                        {code ?? ''}
                      </td>
                    );
                  })}
                  <th>{row.label}</th>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="track-line">
          <span className="track-label">Port sidewall</span>
          <TrackView spec={ship.sidewalls.port} state={st('sidewall.port')} onBoxClick={click('sidewall.port')} signed />
        </div>
        <p className="note">CIC = 1 hit to all fcon tracks</p>
      </section>

      {ship.notes && <p className="note ssd-notes">{ship.notes}</p>}
    </div>
  );
}
