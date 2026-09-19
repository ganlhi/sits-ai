/**
 * Firing arcs of the Sample-class superdreadnought, read from the SSD (PDF p.13) and the
 * enlarged Port Broadside diagram (PDF p.38).
 *
 * Broadsides bear through the three columns abeam on the equator and both blue rows (grey:
 * covered by the sidewall) plus the two equator windows 60° towards bow and stern (white: the
 * bow/stern aspect). Hammerheads bear through the three columns ahead/astern on the same rows,
 * the middle column white.
 *
 * [verify against the physical SSD] The scan is greyscale; the two lighter tones were told
 * apart by luminance (≈240 vs ≈220 vs ≈180 on the same page). The *shape* of each arc is
 * unambiguous; which of the two lighter tones is "white" should be checked on the colour card.
 *
 * Phase 3 moves this into the Sample-class SSD data file.
 */
import { buildArc, type ArcDiagram, type Mount } from './firingArc';

const broadside = (m: Mount): ArcDiagram =>
  buildArc(m, {
    equator: { [-2]: 'white', [-1]: 'grey', 0: 'grey', 1: 'grey', 2: 'white' },
    blue: { [-1]: 'grey', 0: 'grey', 1: 'grey' },
  });

const hammerhead = (m: Mount): ArcDiagram =>
  buildArc(m, {
    equator: { [-1]: 'grey', 0: 'white', 1: 'grey' },
    blue: { [-1]: 'grey', 0: 'white', 1: 'grey' },
  });

export const SAMPLE_ARCS: Readonly<Record<Mount, ArcDiagram>> = {
  forward: hammerhead('forward'),
  aft: hammerhead('aft'),
  port: broadside('port'),
  starboard: broadside('starboard'),
};
