import { HAVOC_DD } from './havocDd';
import { SAMPLE_SD } from './sampleSd';
import { SULTAN_BC } from './sultanBc';
import { WARRIOR_CA } from './warriorCa';
import type { ShipClass } from '../../domain/ssd';

/** Classes shipped with the app: the core book's Sample class and the Ship Book cards in the folder. */
export const BUILT_IN_SHIPS: readonly ShipClass[] = [SAMPLE_SD, SULTAN_BC, WARRIOR_CA, HAVOC_DD];

export { HAVOC_DD, SAMPLE_SD, SULTAN_BC, WARRIOR_CA };
