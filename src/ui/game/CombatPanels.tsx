/**
 * Phase 5 at the table: resolve a salvo or a beam impact with the app's dice and apply the
 * result to the target's sheet, and run damage control at the end of the turn. Everything the
 * tables need is pre-filled from the game state; the player can override any input.
 */
import { useMemo, useState } from 'react';
import {
  MOUNTS,
  windowDirection,
  windowLabel,
  wedgeCovers,
  type Mount,
} from '../../domain/geometry';
import {
  adjustedCmKills,
  adjustedPdKills,
  attemptRepair,
  beamAttack,
  crewQualityTarget,
  damageControlParties,
  ewoEcmModifier,
  expectSalvo,
  placeShot,
  repairableBoxes,
  resolveMissileDefense,
  resolveSalvoImpact,
  systemRng,
  tacMqlModifier,
  type DamageEffect,
  type DefenseContext,
  type Warhead,
} from '../../domain/combat';
import { attitudeAt, engagements, shipClassOf, shipMotion, shipsOf, type Engagement, type GameEvent, type GameState, type ShipState } from '../../domain/game';
import { currentValue, decoyTrackId, fconTrackId, freshTrack, internalTrackId, remainingCount, trackSpec, weaponTrackId, type ShipDamage } from '../../domain/ssd';
import type { SalvoTiming } from '../../domain/ssd';

const live = (g: GameState) => shipsOf(g).filter((s) => !s.destroyed);

function rating(g: GameState, s: ShipState, id: string): number {
  const cls = shipClassOf(g, s);
  return currentValue(trackSpec(cls, id), s.damage.tracks[id] ?? freshTrack(trackSpec(cls, id))) ?? 0;
}

/** The defense context a target presents to a salvo arriving through `impactDir`. */
export function defenseContextFor(g: GameState, target: ShipState, impactDir: ReturnType<typeof windowDirection>, attitude = target.attitude): { ctx: DefenseContext; facingMount: Mount | null } {
  const cls = shipClassOf(g, target);
  const placement = placeShot(cls, target.damage, attitude, impactDir, 'missile');
  const mount = placement?.mount ?? null;
  const pk = (type: 'CM' | 'PD'): number => {
    if (!mount) return 0;
    const i = cls.mounts[mount].weapons.findIndex((w) => w.type === type);
    return i < 0 ? 0 : rating(g, target, weaponTrackId(mount, i));
  };
  let decoyShift: number | null = null;
  const sides: ('port' | 'starboard')[] = mount === 'port' || mount === 'starboard' ? [mount] : ['port', 'starboard'];
  for (const s of sides) {
    if (!cls.mounts[s].decoys) continue;
    const id = decoyTrackId(s);
    const st = target.damage.tracks[id] ?? freshTrack(cls.mounts[s].decoys);
    if (remainingCount(st) > 0) decoyShift = currentValue(cls.mounts[s].decoys, st);
  }
  return {
    facingMount: mount,
    ctx: {
      ecm: rating(g, target, internalTrackId('ecm')) + ewoEcmModifier(target.grades.EWO),
      wedge: wedgeCovers(attitude, impactDir),
      decoyShift,
      decoyPolicy: 'always',
      cmProbableKills: adjustedCmKills(pk('CM'), target.grades.ATO),
      pdProbableKills: adjustedPdKills(pk('PD'), target.grades.ATO),
      fconPenalty: mount ? rating(g, target, fconTrackId(mount)) : 0,
    },
  };
}

/** Missile tubes and warhead of a shooter's mount. */
export function missileBattery(g: GameState, shooter: ShipState, mount: Mount): { tubes: number; warhead: Warhead; mql: number } | null {
  const cls = shipClassOf(g, shooter);
  const i = cls.mounts[mount].weapons.findIndex((w) => w.type === 'M');
  if (i < 0) return null;
  const w = cls.mounts[mount].weapons[i]!;
  const tubes = rating(g, shooter, weaponTrackId(mount, i));
  const mag = shooter.damage.magazines[mount] ?? cls.mounts[mount].magazine ?? 0;
  if (tubes <= 0 || mag <= 0) return null;
  return { tubes, warhead: { kind: 'laserhead', damage: w.damage[0] ?? 0 }, mql: rating(g, shooter, fconTrackId(mount)) + tacMqlModifier(shooter.grades.TAC) };
}

function EffectList({ effects }: { effects: readonly DamageEffect[] }) {
  return (
    <ul className="effects">
      {effects.map((e, i) => (
        <li key={i} className={`effect-${e.kind}`}>
          {e.text}
        </li>
      ))}
    </ul>
  );
}

export function ImpactResolver({ game, timing, dispatch }: { game: GameState; timing: SalvoTiming; dispatch: (e: GameEvent) => void }) {
  const es = useMemo(() => engagements(game).filter((e) => e.salvoes.find((s) => s.timing === timing)?.available), [game, timing]);
  const [pairKey, setPairKey] = useState<string>('');
  const eng: Engagement | undefined = es.find((e) => `${e.shooter.id}>${e.target.id}` === pairKey) ?? es[0];
  const [mount, setMount] = useState<Mount>('port');
  const [missilesText, setMissilesText] = useState<string>('');
  const [nukes, setNukes] = useState(false);
  const [result, setResult] = useState<{ text: string[]; damage: ShipDamage; destroyed: boolean; boxes: number } | null>(null);

  if (!eng) return <p className="note">No {timing} salvoes this turn.</p>;
  const sv = eng.salvoes.find((s) => s.timing === timing)!;
  const shooterCls = shipClassOf(game, eng.shooter);
  const bearingMounts = MOUNTS.filter((m) => eng.arcs[m] !== 'black' && missileBattery(game, eng.shooter, m));
  const useMount: Mount = bearingMounts.includes(mount) ? mount : (bearingMounts[0] ?? mount);
  const battery = missileBattery(game, eng.shooter, useMount);
  const impactDir = sv.impact ? windowDirection(sv.impact) : null;
  // at Middle the target is at its Midpoint attitude, at Late at its End-of-Turn attitude
  const fraction = timing === 'early' ? 0 : timing === 'middle' ? 0.5 : 1;
  const targetAttitude = attitudeAt(eng.target, fraction);
  const def = impactDir ? defenseContextFor(game, eng.target, impactDir, targetAttitude) : null;
  const missiles = missilesText === '' ? (battery?.tubes ?? 0) : Number(missilesText);
  const mql = (eng.band?.baseMql ?? 0) + (battery?.mql ?? 0);
  const targetCls = shipClassOf(game, eng.target);
  const exp = def && impactDir && battery ? expectSalvo({ missiles, mql, contactNukes: nukes }, def.ctx, { cls: targetCls, damage: eng.target.damage, attitude: targetAttitude }, { ...battery.warhead, kind: nukes ? 'nuke' : 'laserhead' }, impactDir) : null;

  const resolve = () => {
    if (!def || !impactDir || !battery) return;
    const rng = systemRng;
    const d = resolveMissileDefense(rng, { missiles, mql, contactNukes: nukes }, def.ctx);
    const lines = [
      `${eng.shooter.name} → ${eng.target.name}, ${timing} salvo: ${missiles} × ${battery.warhead.damage}M at MQL ${mql} (band ${eng.band?.baseMql}, fire control +${battery.mql - tacMqlModifier(eng.shooter.grades.TAC)}, TAC ${tacMqlModifier(eng.shooter.grades.TAC)})`,
      `Impact window ${sv.impact ? windowLabel(sv.impact) : '—'}; hits the ${def.facingMount ?? 'wedge'}${def.ctx.wedge ? ' (wedge interposed)' : ''}`,
      `ECM: 2d10− ${d.ecm.roll} → column ${d.ecm.column}${d.ecm.decoyUsed ? ` + decoy ${def.ctx.decoyShift}` : ''} → ${d.ecm.kills} killed`,
      `Countermissiles (PK ${def.ctx.cmProbableKills}): 2d10− ${d.cm.roll} → column ${d.cm.column} → ${d.cm.kills} killed`,
      `Point defense (PK ${def.ctx.pdProbableKills}): 2d10− ${d.pd.roll} → column ${d.pd.column} → ${d.pd.kills} killed`,
      `${d.survivors} missile${d.survivors === 1 ? '' : 's'} reach the hull`,
    ];
    let damage = eng.target.damage;
    // a used decoy is spent
    if (d.ecm.decoyUsed && def.facingMount) {
      const side: 'port' | 'starboard' = def.facingMount === 'port' || def.facingMount === 'starboard' ? def.facingMount : 'port';
      const id = decoyTrackId(side);
      const spec = trackSpec(targetCls, id);
      const st = damage.tracks[id] ?? freshTrack(spec);
      const idx = st.boxes.findIndex((b) => b.status === 'ok');
      if (idx >= 0) damage = { ...damage, tracks: { ...damage.tracks, [id]: { boxes: st.boxes.map((b, i) => (i === idx ? { status: 'destroyed' as const, repairedOnTurn: null } : b)) } } };
    }
    const alloc = resolveSalvoImpact(rng, targetCls, damage, targetAttitude, { missiles: d.survivors, warhead: { ...battery.warhead, kind: nukes ? 'nuke' : 'laserhead' }, impactDir });
    setResult({ text: [...lines, ...alloc.effects.map((e) => e.text)], damage: alloc.damage, destroyed: alloc.destroyed, boxes: alloc.boxes });
  };

  const apply = () => {
    if (!result) return;
    dispatch({ type: 'ShipDamageSet', shipId: eng.target.id, damage: result.damage, note: `${timing} salvo from ${eng.shooter.name}: ${result.boxes} boxes` });
    if (result.destroyed) dispatch({ type: 'ShipDestroyed', shipId: eng.target.id, destroyed: true });
    // magazine: one salvo dot spent by the shooter
    const mag = eng.shooter.damage.magazines[useMount] ?? shooterCls.mounts[useMount].magazine ?? 0;
    if (mag > 0) dispatch({ type: 'MagazineReported', shipId: eng.shooter.id, mount: useMount, remaining: mag - 1 });
    setResult(null);
  };

  return (
    <div className="resolver">
      <h3>Resolve a {timing} salvo with the app's dice</h3>
      <div className="row">
        <select value={`${eng.shooter.id}>${eng.target.id}`} onChange={(e) => { setPairKey(e.target.value); setResult(null); }}>
          {es.map((e) => (
            <option key={`${e.shooter.id}>${e.target.id}`} value={`${e.shooter.id}>${e.target.id}`}>
              {e.shooter.name} → {e.target.name}
            </option>
          ))}
        </select>
        <select value={useMount} onChange={(e) => setMount(e.target.value as Mount)}>
          {bearingMounts.map((m) => (
            <option key={m} value={m}>
              {shooterCls.mounts[m].name}
            </option>
          ))}
        </select>
        <label className="vec-input">
          missiles
          <input value={missilesText === '' ? String(battery?.tubes ?? 0) : missilesText} onChange={(e) => setMissilesText(e.target.value)} style={{ width: 50 }} />
        </label>
        <label className="note">
          <input type="checkbox" checked={nukes} onChange={(e) => setNukes(e.target.checked)} /> contact nukes
        </label>
      </div>
      {battery && def ? (
        <p className="note">
          Range {sv.bearing.range}, MQL {mql}. Target ECM {def.ctx.ecm}, CM PK {def.ctx.cmProbableKills}, PD PK {def.ctx.pdProbableKills}, decoy {def.ctx.decoyShift ?? 'none'}, fcon shift {def.ctx.fconPenalty}
          {def.ctx.wedge ? ', wedge interposed' : ''}.
          {exp && exp.perHit ? ` Expect ${exp.expectedSurvivors.toFixed(1)} missiles through, ${(exp.perHit.pPenetrate * 100).toFixed(0)}% each penetrate, ≈${exp.expectedBoxes.toFixed(1)} boxes.` : ''}
        </p>
      ) : (
        <p className="note">No bearing mount with missiles and ammunition.</p>
      )}
      <div className="row">
        <button type="button" onClick={resolve} disabled={!battery || !def || missiles <= 0}>
          Roll it
        </button>
        {result && (
          <button type="button" className="primary" onClick={apply}>
            Apply to {eng.target.name} ({result.boxes} boxes{result.destroyed ? ', destroyed' : ''})
          </button>
        )}
        {result && (
          <button type="button" onClick={() => setResult(null)}>
            Discard
          </button>
        )}
      </div>
      {result && (
        <ul className="effects">
          {result.text.map((t, i) => (
            <li key={i}>{t}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function BeamResolver({ game, fraction, dispatch }: { game: GameState; fraction: 0.5 | 1; dispatch: (e: GameEvent) => void }) {
  const ships = live(game);
  const pairs = useMemo(() => {
    const out: { shooter: ShipState; target: ShipState; range: number; window: ReturnType<typeof engagements>[number]['now']['window']; arcs: Engagement['arcs'] }[] = [];
    for (const a of ships) for (const b of ships) {
      if (a.side === b.side) continue;
      const pa = fraction === 0.5 ? shipMotion(a).midpoint : shipMotion(a).endOfTurn;
      const pb = fraction === 0.5 ? shipMotion(b).midpoint : shipMotion(b).endOfTurn;
      const g2: GameState = { ...game, ships: { ...game.ships, [a.id]: { ...a, position: pa, attitude: attitudeAt(a, fraction), orders: null }, [b.id]: { ...b, position: pb, attitude: attitudeAt(b, fraction), orders: null } } };
      const e = engagements(g2).find((x) => x.shooter.id === a.id && x.target.id === b.id);
      if (e && e.now.window) out.push({ shooter: a, target: b, range: e.now.range, window: e.now.window, arcs: e.arcs });
    }
    return out;
  }, [game, fraction, ships]);
  const [key, setKey] = useState('');
  const pair = pairs.find((p) => `${p.shooter.id}>${p.target.id}` === key) ?? pairs[0];
  const [result, setResult] = useState<{ effects: DamageEffect[]; damage: ShipDamage; destroyed: boolean; boxes: number; shots: string[] } | null>(null);
  if (!pair) return null;

  const fire = () => {
    const sc = shipClassOf(game, pair.shooter);
    const tc = shipClassOf(game, pair.target);
    const r = beamAttack(systemRng, { cls: sc, damage: pair.shooter.damage, attitude: attitudeAt(pair.shooter, fraction) }, { cls: tc, damage: pair.target.damage, attitude: attitudeAt(pair.target, fraction) }, pair.window!, pair.range);
    setResult({ effects: r.state.effects, damage: r.state.damage, destroyed: r.state.destroyed, boxes: r.state.boxes, shots: r.shots.map((s) => `${s.mount} ${s.weapon}: ${s.hits} × ${s.damage}`) });
  };
  const apply = () => {
    if (!result) return;
    dispatch({ type: 'ShipDamageSet', shipId: pair.target.id, damage: result.damage, note: `beams from ${pair.shooter.name}: ${result.boxes} boxes` });
    if (result.destroyed) dispatch({ type: 'ShipDestroyed', shipId: pair.target.id, destroyed: true });
    setResult(null);
  };
  return (
    <div className="resolver">
      <h3>Resolve beams with the app's dice</h3>
      <div className="row">
        <select value={`${pair.shooter.id}>${pair.target.id}`} onChange={(e) => { setKey(e.target.value); setResult(null); }}>
          {pairs.map((p) => (
            <option key={`${p.shooter.id}>${p.target.id}`} value={`${p.shooter.id}>${p.target.id}`}>
              {p.shooter.name} → {p.target.name} (range {p.range})
            </option>
          ))}
        </select>
        <button type="button" onClick={fire}>
          Fire everything that bears
        </button>
        {result && (
          <button type="button" className="primary" onClick={apply}>
            Apply ({result.boxes} boxes{result.destroyed ? ', destroyed' : ''})
          </button>
        )}
      </div>
      {result && (
        <>
          <p className="note">{result.shots.length ? result.shots.join('; ') : 'nothing fired'}</p>
          <EffectList effects={result.effects} />
        </>
      )}
    </div>
  );
}

export function DamageControlPanel({ game, dispatch }: { game: GameState; dispatch: (e: GameEvent) => void }) {
  const [shipId, setShipId] = useState('');
  const ships = live(game);
  const ship = ships.find((s) => s.id === shipId) ?? ships[0];
  const [pick, setPick] = useState('');
  const [parties, setParties] = useState<1 | 2>(1);
  const [log, setLog] = useState<string[]>([]);
  if (!ship) return null;
  const cls = shipClassOf(game, ship);
  const boxes = repairableBoxes(cls, ship.damage);
  const available = damageControlParties(cls, ship.damage);
  const sel = boxes.find((b) => `${b.trackId}:${b.index}` === pick) ?? boxes[0];
  const target = crewQualityTarget(cls, ship.grades.CREW);

  const roll = () => {
    if (!sel) return;
    const r = attemptRepair(systemRng, cls, ship.damage, { trackId: sel.trackId, index: sel.index, parties }, target, game.turn);
    dispatch({ type: 'ShipDamageSet', shipId: ship.id, damage: r.damage, note: `damage control on ${sel.name} box ${sel.index + 1}: ${r.result.success ? 'repaired' : 'failed'}` });
    setLog([`${sel.name} box ${sel.index + 1}: rolled ${r.result.rolls.join(', ')} vs ≤${target} — ${r.result.success ? 'repaired (jury-rigged, fails on turn ' + (game.turn + 10) + ')' : 'failed; cannot be repaired in combat'}`, ...log].slice(0, 12));
  };

  return (
    <div className="resolver">
      <h3>Damage control</h3>
      <div className="row">
        <select value={ship.id} onChange={(e) => setShipId(e.target.value)}>
          {ships.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <span className="note">
          {available} part{available === 1 ? 'y' : 'ies'} · crew check ≤ {target}
        </span>
      </div>
      {boxes.length === 0 ? (
        <p className="note">Nothing repairable.</p>
      ) : (
        <div className="row">
          <select value={sel ? `${sel.trackId}:${sel.index}` : ''} onChange={(e) => setPick(e.target.value)}>
            {boxes.map((b) => (
              <option key={`${b.trackId}:${b.index}`} value={`${b.trackId}:${b.index}`}>
                {b.name} — box {b.index + 1}
              </option>
            ))}
          </select>
          <div className="seg">
            {([1, 2] as const).map((n) => (
              <button key={n} type="button" aria-pressed={parties === n} onClick={() => setParties(n)}>
                {n} part{n === 1 ? 'y' : 'ies'}
              </button>
            ))}
          </div>
          <button type="button" onClick={roll} disabled={available === 0}>
            Roll repair
          </button>
        </div>
      )}
      {log.length > 0 && (
        <ul className="effects">
          {log.map((l, i) => (
            <li key={i}>{l}</li>
          ))}
        </ul>
      )}
      <p className="note">Hull, Structural Integrity, Warshawski sails and hyper generators cannot be repaired in combat. Repairs fail ten turns later.</p>
    </div>
  );
}
