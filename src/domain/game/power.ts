/**
 * Firepower and toughness from the few numbers the app has. The base cost stands for the
 * whole SSD: a ship's broadsides carry most of its weapons, its hammerheads a third as much,
 * and the reported effectiveness of a facing scales what that facing can still do.
 */
import { buildArc, type ArcDiagram, type Mount } from '../geometry';
import type { Ship } from './types';

/** Share of the ship's firepower on each facing, relative to a broadside. */
export const MOUNT_WEIGHT: Readonly<Record<Mount, number>> = { forward: 0.35, aft: 0.35, port: 1, starboard: 1 };

/** Cost in hundreds of points: the unit both damage and toughness are measured in. */
export const power = (s: Ship): number => Math.max(0.05, s.shipClass.baseCost / 100);

/** Fraction of the facing's cost-worth of weapons still firing. */
export const facingFactor = (s: Ship, m: Mount): number => Math.max(0, Math.min(100, s.effectiveness[m])) / 100;

/** What one salvo from a facing is worth at short range against an undefended target, in cost units. */
export const SALVO_FACTOR = 0.1;
export const salvoPower = (s: Ship, m: Mount): number => power(s) * MOUNT_WEIGHT[m] * facingFactor(s, m) * SALVO_FACTOR;

/** Beams: automatic hits inside three hexes, falling off with range (C3.111), lighter than a salvo. */
export const BEAM_REACH = 3;
export const beamFactor = (range: number): number => (range <= 1 ? 0.6 : range === 2 ? 0.4 : range === 3 ? 0.25 : 0);
export const beamPower = (s: Ship, m: Mount, range: number): number => power(s) * MOUNT_WEIGHT[m] * facingFactor(s, m) * beamFactor(range);

/**
 * Each side's targeting arc: the window its pointer sits in and the eight around it — the
 * pointer's equator window and its neighbours, and the three blue windows above and below.
 * The four blocks tile the equator and the blue rows without overlapping, so a bearing is in at
 * most one side's arc; above and below the blue rows is the wedge. Hammerheads are unwalled dead
 * ahead / astern.
 */
const SIDE_BLOCK = { [-1]: 'grey', 0: 'grey', 1: 'grey' } as const;
const HAMMERHEAD_BLOCK = { [-1]: 'grey', 0: 'white', 1: 'grey' } as const;
export const STANDARD_ARCS: Readonly<Record<Mount, ArcDiagram>> = {
  forward: buildArc('forward', { equator: HAMMERHEAD_BLOCK, blue: HAMMERHEAD_BLOCK }),
  aft: buildArc('aft', { equator: HAMMERHEAD_BLOCK, blue: HAMMERHEAD_BLOCK }),
  port: buildArc('port', { equator: SIDE_BLOCK, blue: SIDE_BLOCK }),
  starboard: buildArc('starboard', { equator: SIDE_BLOCK, blue: SIDE_BLOCK }),
};
