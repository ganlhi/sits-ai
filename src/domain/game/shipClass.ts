/**
 * A ship class, as the app knows it: a handful of numbers rather than the full SSD. The base
 * cost stands in for size and firepower; the three ratings bound the plot; the three range
 * bands say how many salvoes a turn the ship gets at a given End-of-Turn range and how good
 * they are — short: Early + Middle + Late, medium: Middle + Late, long: Late only.
 */
export type SalvoTiming = 'early' | 'middle' | 'late';
export const SALVO_TIMINGS: readonly SalvoTiming[] = ['early', 'middle', 'late'];

export type BandName = 'short' | 'medium' | 'long';
export const BAND_NAMES: readonly BandName[] = ['short', 'medium', 'long'];
export const BAND_LABELS: Readonly<Record<BandName, string>> = { short: 'Short', medium: 'Medium', long: 'Long' };

/** Inclusive range of hexes. */
export interface RangeBand {
  readonly min: number;
  readonly max: number;
}

export interface ShipClass {
  readonly id: string;
  readonly name: string;
  /** Point cost from the SSD: the AI's hint at how big and how dangerous the ship is. */
  readonly baseCost: number;
  readonly maxThrust: number;
  readonly maxPivot: number;
  readonly maxRoll: number;
  readonly bands: Readonly<Record<BandName, RangeBand>>;
}

/** The ratings a ship plots with this turn; start at the class maxima, lowered as damage lands. */
export interface Ratings {
  readonly thrust: number;
  readonly pivot: number;
  readonly roll: number;
}

export const ratingsOf = (c: ShipClass): Ratings => ({ thrust: c.maxThrust, pivot: c.maxPivot, roll: c.maxRoll });

export const BAND_SALVOES: Readonly<Record<BandName, readonly SalvoTiming[]>> = {
  short: ['early', 'middle', 'late'],
  medium: ['middle', 'late'],
  long: ['late'],
};

/** How much of a salvo gets through at each band, relative to short range (lower MQL is better for the attacker). */
export const BAND_QUALITY: Readonly<Record<BandName, number>> = { short: 1, medium: 0.7, long: 0.4 };

/** The band a range falls in, or null when out of missile range (or in a gap between bands). */
export function bandFor(cls: ShipClass, range: number): BandName | null {
  for (const b of BAND_NAMES) {
    const r = cls.bands[b];
    if (range >= r.min && range <= r.max) return b;
  }
  return null;
}

/** Longest range at which the class can still launch. */
export const missileReach = (cls: ShipClass): number => Math.max(...BAND_NAMES.map((b) => cls.bands[b].max));

const whole = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 0;

/** Problems with a class, in the player's words; empty when it is fine. */
export function validateShipClass(c: ShipClass): string[] {
  const errors: string[] = [];
  if (!c.name.trim()) errors.push('a name is required');
  if (!(typeof c.baseCost === 'number' && c.baseCost > 0)) errors.push('base cost must be a positive number');
  for (const [k, v] of [
    ['thrust', c.maxThrust],
    ['pivot', c.maxPivot],
    ['roll', c.maxRoll],
  ] as const) {
    if (!whole(v)) errors.push(`max ${k} must be a whole number, 0 or more`);
  }
  for (const b of BAND_NAMES) {
    const r = c.bands[b];
    if (!whole(r.min) || !whole(r.max)) errors.push(`${b} band bounds must be whole numbers`);
    else if (r.min > r.max) errors.push(`${b} band: from must not exceed to`);
  }
  if (c.bands.short.max >= c.bands.medium.min && c.bands.short.min <= c.bands.medium.max) errors.push('short and medium bands overlap');
  if (c.bands.medium.max >= c.bands.long.min && c.bands.medium.min <= c.bands.long.max) errors.push('medium and long bands overlap');
  if (c.bands.short.max > c.bands.medium.min || c.bands.medium.max > c.bands.long.min) errors.push('bands must run short, then medium, then long');
  return errors;
}

/**
 * The Ship Book cards in the folder, reduced to this model. Bands are the card's range-band
 * table grouped by the salvoes available.
 */
export const BUILT_IN_CLASSES: readonly ShipClass[] = [
  { id: 'pn-sultan-bc', name: 'Sultan BC (PN)', baseCost: 223, maxThrust: 3, maxPivot: 3, maxRoll: 4, bands: { short: { min: 0, max: 6 }, medium: { min: 7, max: 18 }, long: { min: 19, max: 28 } } },
  { id: 'rmn-warrior-ca', name: 'Warrior CA (RMN)', baseCost: 93, maxThrust: 3, maxPivot: 5, maxRoll: 5, bands: { short: { min: 0, max: 6 }, medium: { min: 7, max: 19 }, long: { min: 20, max: 29 } } },
  { id: 'rmn-havoc-dd', name: 'Havoc DD (RMN)', baseCost: 35, maxThrust: 3, maxPivot: 6, maxRoll: 6, bands: { short: { min: 0, max: 6 }, medium: { min: 7, max: 18 }, long: { min: 19, max: 28 } } },
];

export function blankShipClass(id: string): ShipClass {
  return { id, name: '', baseCost: 100, maxThrust: 3, maxPivot: 3, maxRoll: 4, bands: { short: { min: 0, max: 6 }, medium: { min: 7, max: 18 }, long: { min: 19, max: 28 } } };
}
