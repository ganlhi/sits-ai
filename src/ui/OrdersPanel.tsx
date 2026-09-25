/** The AI's order sheets for the turn, in the book's notation, with the salvo card entries. */
import { windowLabel } from '../domain/geometry';
import { TIMING_LABEL, markerPaths, orderSheet, orderSheetText } from '../domain/ai';
import { aiShips, formatPosition, isOutOfAction, type Game, type Ship } from '../domain/game';
import { type AvidPath } from './AvidCard';
import { AvidFigure } from './AvidFigure';

function Sheet({ game, ship }: { game: Game; ship: Ship }) {
  const sheet = orderSheet(game, ship);
  if (!sheet) {
    return (
      <article className="order-sheet">
        <h3>
          {ship.name} <span className="note">{ship.shipClass.name}</span>
        </h3>
        <p className="note">{isOutOfAction(ship) ? 'Out of action: no orders, drifts on its vectors.' : 'No orders.'}</p>
      </article>
    );
  }
  const paths = markerPaths(sheet);
  const plot: AvidPath[] = [];
  if (paths.forward) plot.push({ ...paths.forward, kind: 'forward' });
  if (paths.top) plot.push({ ...paths.top, kind: 'top' });
  const key = (
    <p className="plot-key">
      <span>
        <span className="swatch forward" />
        Forward (pivot)
      </span>
      <span>
        <span className="swatch top" />
        Top (roll)
      </span>
      <span>❚❚ at the Midpoint</span>
      <span>dashed: into the lower half</span>
    </p>
  );
  const copy = () => {
    void navigator.clipboard?.writeText(orderSheetText(sheet, ship.name));
  };
  return (
    <article className="order-sheet">
      <div className="row">
        <h3>
          {ship.name} <span className="note">{ship.shipClass.name}</span>
        </h3>
        <span className="grow" />
        <button type="button" onClick={copy}>
          Copy as text
        </button>
      </div>
      <div className="avid-field">
        <div className="avid-row compact">
          <div>
            <AvidFigure title={`${ship.name}: markers now, with the paths Forward and Top take this turn`} markers={sheet.attitudeNow} paths={plot} caption={key} />
            {key}
          </div>
          <div>
            <ol>
              {sheet.maneuver.map((l, i) => (
                <li key={i}>{l}</li>
              ))}
              <li>
                Markers: Midpoint at <b>{formatPosition(sheet.midpoint)}</b>, End of Turn at <b>{formatPosition(sheet.endOfTurn)}</b>
                {sheet.displacement ? ` (EoT displaced ${sheet.displacement})` : ''}.
              </li>
            </ol>
            <div className="attitudes">
              <div>
                <span className="note">At the Midpoint:</span> Forward <b>{windowLabel(sheet.attitudeAtMidpoint.forward)}</b>, Top <b>{windowLabel(sheet.attitudeAtMidpoint.top)}</b>
              </div>
              <div>
                <span className="note">At End of Turn:</span> Forward <b>{windowLabel(sheet.attitudeAtEot.forward)}</b>, Top <b>{windowLabel(sheet.attitudeAtEot.top)}</b>
              </div>
            </div>
          </div>
        </div>
      </div>
      {sheet.launches.length === 0 ? (
        <p className="note">No missile launch.</p>
      ) : (
        sheet.launches.map((l, i) => (
          <div key={i} className="launch">
            <div>
              Launch from the <b>{l.mountName}</b>, every tube, at <b>{l.targetName}</b>: {l.salvoes.map((s) => TIMING_LABEL[s.timing]).join(' + ')}.
            </div>
            <table className="list">
              <thead>
                <tr>
                  <th>Salvo</th>
                  <th>Range</th>
                  <th>Bearing</th>
                  <th>Impact window</th>
                  <th>Band</th>
                </tr>
              </thead>
              <tbody>
                {l.salvoes.map((s) => (
                  <tr key={s.timing}>
                    <td>{TIMING_LABEL[s.timing]}</td>
                    <td>{s.range}</td>
                    <td>{s.bearing}</td>
                    <td>{s.impact}</td>
                    <td>{s.band}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="note">Bearings use the Midpoint and EoT markers as placed on the table. Read the MQL off the ship's own card at that range.</p>
          </div>
        ))
      )}
      <p className="note">{sheet.rationale}</p>
    </article>
  );
}

export function OrdersPanel({ game }: { game: Game }) {
  return (
    <div>
      {aiShips(game).map((s) => (
        <Sheet key={s.id} game={game} ship={s} />
      ))}
    </div>
  );
}
