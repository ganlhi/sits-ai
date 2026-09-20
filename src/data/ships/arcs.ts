/**
 * The firing-arc diagrams shared by every SSD seen so far (core book Sample class; Ship Book
 * cards for Sultan, Warrior, Havoc — all drawn identically).
 *
 * Read from the vector PDFs, whose fills are exact: black (35,31,32) on the caps, the green
 * rows and the ±90° columns; white (255) only in the hammerhead's centre column; light grey
 * (220) in the ±30° columns and the broadside's centre; dark grey (99) in the ±60° columns.
 * The rules name three colours (C1.225: black cannot fire; grey fires from behind the
 * sidewall; white fires from an unwalled aspect), so the two greys are taken as one "grey"
 * drawn with depth shading. [verify against the designers if a fourth meaning turns up]
 *
 * Every mount therefore bears through a 5-column × 3-row window: ±60° of azimuth around its
 * marker, on the equator and both blue rows.
 */
import { buildArc, type ArcDiagram, type Mount } from '../../domain/geometry';

export const broadsideArc = (m: Mount): ArcDiagram =>
  buildArc(m, {
    equator: { [-2]: 'grey', [-1]: 'grey', 0: 'grey', 1: 'grey', 2: 'grey' },
    blue: { [-2]: 'grey', [-1]: 'grey', 0: 'grey', 1: 'grey', 2: 'grey' },
  });

export const hammerheadArc = (m: Mount): ArcDiagram =>
  buildArc(m, {
    equator: { [-2]: 'grey', [-1]: 'grey', 0: 'white', 1: 'grey', 2: 'grey' },
    blue: { [-2]: 'grey', [-1]: 'grey', 0: 'white', 1: 'grey', 2: 'grey' },
  });

export const standardArcs = () => ({
  forward: hammerheadArc('forward'),
  aft: hammerheadArc('aft'),
  port: broadsideArc('port'),
  starboard: broadsideArc('starboard'),
});
