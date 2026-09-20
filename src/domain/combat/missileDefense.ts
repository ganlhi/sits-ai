/**
 * Missile defense (RULES.md §12): the ECM layer, then countermissiles, then point defense.
 *
 * One implementation serves both modes: `resolveMissileDefense` rolls, `expect.ts` feeds the
 * same column arithmetic with the dice distributions.
 */
import { roll2d10minus, type Rng } from './dice';
import { ACTIVE_DEFENSE_COLUMNS, ECM_COLUMNS, activeDefenseKills, ecmKills } from './tables';

export interface InboundSalvo {
  readonly missiles: number;
  /** Final MQL: base from the shooter's range band, plus its fire-control penalty and TAC grade. */
  readonly mql: number;
  readonly contactNukes: boolean;
}

export type DecoyPolicy = 'never' | 'always' | ((ecmColumnAfterRoll: number, missiles: number) => boolean);

export interface DefenseContext {
  /** The target's ECM rating (leftmost intact box) plus the EWO modifier. */
  readonly ecm: number;
  /** Missiles are hitting the wedge: +12 instead of ECM; no CM; PD halved. */
  readonly wedge: boolean;
  /** Column shift of one decoy from the facing being attacked, or null if none is left. */
  readonly decoyShift: number | null;
  readonly decoyPolicy: DecoyPolicy;
  /** Probable kills of the facing mount's CM and PD (after ATO adjustment, canister, pooling). */
  readonly cmProbableKills: number;
  readonly pdProbableKills: number;
  /** Leftward column shift from fire-control damage on the facing mount (C4.133). */
  readonly fconPenalty: number;
}

export const WEDGE_ECM_BONUS = 12;

export function ecmBaseColumn(mql: number, ecm: number, wedge: boolean): number {
  return mql + (wedge ? WEDGE_ECM_BONUS : ecm);
}

const clampEcm = (c: number): number => Math.max(1, Math.min(ECM_COLUMNS, c));
const clampAd = (c: number): number => Math.max(1, Math.min(ACTIVE_DEFENSE_COLUMNS, c));

/**
 * Kills from the ECM layer at a rolled column, with the decoy rule: a decoy shifts the column
 * by its value and always kills at least one more missile than the layer would have without it.
 */
export function ecmLayerKills(missiles: number, columnAfterRoll: number, decoyShift: number | null): number {
  const base = ecmKills(missiles, clampEcm(columnAfterRoll));
  if (decoyShift === null) return base;
  return Math.min(missiles, Math.max(ecmKills(missiles, clampEcm(columnAfterRoll + decoyShift)), base + 1));
}

export function activeLayerColumn(mql: number, roll: number, fconPenalty: number): number {
  return clampAd(mql + roll - fconPenalty);
}

/** Kills from CM or PD at a column, with the wedge and contact-nuke modifiers (C4.14). */
export function activeLayerKills(layer: 'cm' | 'pd', probableKills: number, column: number, ctx: { wedge: boolean; contactNukes: boolean }): number {
  if (layer === 'cm' && ctx.wedge) return 0;
  let kills = activeDefenseKills(probableKills, column);
  if (layer === 'pd') {
    if (ctx.wedge) kills = Math.floor(kills / 2); // rounding in favour of the attacker
    if (ctx.contactNukes) kills *= 2;
  }
  return kills;
}

export interface LayerResult {
  readonly roll: number;
  readonly column: number;
  readonly kills: number;
  readonly survivors: number;
}

export interface MissileDefenseResult {
  readonly ecm: LayerResult & { readonly decoyUsed: boolean };
  readonly cm: LayerResult;
  readonly pd: LayerResult;
  readonly survivors: number;
}

function useDecoy(policy: DecoyPolicy, column: number, missiles: number): boolean {
  if (policy === 'never') return false;
  if (policy === 'always') return true;
  return policy(column, missiles);
}

export function resolveMissileDefense(rng: Rng, salvo: InboundSalvo, ctx: DefenseContext): MissileDefenseResult {
  const n = salvo.missiles;
  // ECM
  const ecmRoll = roll2d10minus(rng).value;
  const ecmColumn = clampEcm(ecmBaseColumn(salvo.mql, ctx.ecm, ctx.wedge) + ecmRoll);
  const decoyUsed = ctx.decoyShift !== null && n > 0 && useDecoy(ctx.decoyPolicy, ecmColumn, n);
  const ecmK = Math.min(n, ecmLayerKills(n, ecmColumn, decoyUsed ? ctx.decoyShift : null));
  const afterEcm = n - ecmK;
  // CM
  const cmRoll = roll2d10minus(rng).value;
  const cmColumn = activeLayerColumn(salvo.mql, cmRoll, ctx.fconPenalty);
  const cmK = Math.min(afterEcm, activeLayerKills('cm', ctx.cmProbableKills, cmColumn, { wedge: ctx.wedge, contactNukes: salvo.contactNukes }));
  const afterCm = afterEcm - cmK;
  // PD
  const pdRoll = roll2d10minus(rng).value;
  const pdColumn = activeLayerColumn(salvo.mql, pdRoll, ctx.fconPenalty);
  const pdK = Math.min(afterCm, activeLayerKills('pd', ctx.pdProbableKills, pdColumn, { wedge: ctx.wedge, contactNukes: salvo.contactNukes }));
  const survivors = afterCm - pdK;
  return {
    ecm: { roll: ecmRoll, column: ecmColumn, kills: ecmK, survivors: afterEcm, decoyUsed },
    cm: { roll: cmRoll, column: cmColumn, kills: cmK, survivors: afterCm },
    pd: { roll: pdRoll, column: pdColumn, kills: pdK, survivors },
    survivors,
  };
}
