import type { ZoneDef } from './schema';

/** Zone 0 is the gentlest; the gale and umbra species join progressively. */
export const ZONES: ZoneDef[] = [
  {
    wild: ['cindermite', 'brambleback', 'tidewisp', 'emberveil'],
    elite: ['cindermaw', 'tidewraith'],
  },
  {
    wild: ['cindermite', 'brambleback', 'tidewisp', 'emberveil', 'skirrow'],
    elite: ['bramblewarden', 'tidewraith', 'emberveil'],
  },
  {
    wild: ['cindermite', 'brambleback', 'tidewisp', 'emberveil', 'skirrow', 'dusklurk'],
    elite: ['cindermaw', 'bramblewarden', 'tidewraith'],
  },
];
