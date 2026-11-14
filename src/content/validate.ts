import type { Content } from './schema';

const STAT_KEYS = ['health', 'power', 'guard', 'speed', 'focus'] as const;

/** Returns one message per problem; an empty array means the content is valid. */
export function validateContent(c: Content): string[] {
  const errs: string[] = [];
  const moveIds = new Set<string>();
  for (const m of c.moves) {
    if (moveIds.has(m.id)) errs.push(`duplicate move id: ${m.id}`);
    moveIds.add(m.id);
    if (!m.names.en || !m.names.es) errs.push(`move ${m.id}: missing en or es name`);
    if (m.names.es.length > 24) errs.push(`move ${m.id}: es name longer than 24 characters`);
    if (!Number.isInteger(m.accuracy) || m.accuracy < 1 || m.accuracy > 100)
      errs.push(`move ${m.id}: accuracy must be 1..100`);
    if (m.kind === 'damage' && m.power <= 0) errs.push(`move ${m.id}: damage power must be > 0`);
    if (m.kind === 'status' && !m.status) errs.push(`move ${m.id}: status move needs a status`);
    if (m.focusCost < 0) errs.push(`move ${m.id}: negative focus cost`);
  }
  const speciesIds = new Set<string>();
  const artKeys = new Set<string>();
  for (const s of c.species) {
    const dupId = speciesIds.has(s.id);
    if (dupId) errs.push(`duplicate species id: ${s.id}`);
    speciesIds.add(s.id);
    if (!s.names.en || !s.names.es) errs.push(`species ${s.id}: missing en or es name`);
    if (s.names.es.length > 24) errs.push(`species ${s.id}: es name longer than 24 characters`);
    for (const k of STAT_KEYS)
      if (s.base[k] <= 0) errs.push(`species ${s.id}: base.${k} must be > 0`);
    for (const mid of s.moves)
      if (!moveIds.has(mid)) errs.push(`species ${s.id}: unknown move id ${mid}`);
    if (!dupId && artKeys.has(s.art.key)) errs.push(`species ${s.id}: duplicate art key ${s.art.key}`);
    artKeys.add(s.art.key);
  }
  return errs;
}
