import type { ZoneDef } from './schema';

/** Zone 0 is the gentlest; the umbra species joins in zone 1. The final boss species never appears as wild. */
export const ZONES: ZoneDef[] = [
  {
    wild: ['cindermite', 'brambleback', 'tidewisp', 'skirrow'],
    elite: ['cindermaw', 'tidewraith'],
  },
  {
    wild: ['cindermite', 'brambleback', 'tidewisp', 'skirrow', 'dusklurk'],
    elite: ['bramblewarden', 'tidewraith'],
  },
  {
    wild: ['cindermite', 'brambleback', 'tidewisp', 'skirrow', 'dusklurk'],
    elite: ['cindermaw', 'bramblewarden', 'tidewraith'],
  },
];
