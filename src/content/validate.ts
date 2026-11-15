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
  validateRun(c, speciesIds, errs);
  return errs;
}

function arr<T>(v: T[] | undefined): T[] {
  return Array.isArray(v) ? v : [];
}

/** Evolution, zone, boss and starter rules; tolerant of missing or malformed fields. */
function validateRun(c: Content, speciesIds: Set<string>, errs: string[]): void {
  const byId = new Map(arr(c.species).map((s) => [s.id, s]));
  for (const s of arr(c.species)) {
    if (s.evolvesTo === undefined) continue;
    if (!speciesIds.has(s.evolvesTo))
      errs.push(`species ${s.id}: evolution target ${s.evolvesTo} does not exist`);
    if (!Number.isInteger(s.evolveCost) || (s.evolveCost as number) < 1)
      errs.push(`species ${s.id}: evolveCost must be an integer >= 1 when evolvesTo is set`);
    // Walk the chain; report the cycle once, on the species where the walk started repeating.
    const seen = new Set<string>([s.id]);
    let next = byId.get(s.evolvesTo);
    while (next) {
      if (next.id === s.id) {
        errs.push(`species ${s.id}: evolution cycle`);
        break;
      }
      if (seen.has(next.id)) break;
      seen.add(next.id);
      next = next.evolvesTo === undefined ? undefined : byId.get(next.evolvesTo);
    }
  }

  const zones = arr(c.zones);
  if (zones.length !== 3) errs.push(`zones: expected 3, found ${zones.length}`);
  zones.forEach((z, i) => {
    for (const pool of ['wild', 'elite'] as const) {
      const ids = arr(z?.[pool]);
      if (ids.length === 0) errs.push(`zone ${i}: ${pool} pool is empty`);
      for (const id of ids)
        if (!speciesIds.has(id)) errs.push(`zone ${i}: ${pool} pool has unknown species ${id}`);
    }
  });

  const bosses = arr(c.bosses);
  if (bosses.length !== 3) errs.push(`bosses: expected 3, found ${bosses.length}`);
  else if (new Set(bosses.map((b) => b?.zone)).size !== 3 || bosses.some((b) => ![0, 1, 2].includes(b?.zone)))
    errs.push('bosses: expected exactly one per zone 0, 1 and 2');
  for (const b of bosses) {
    const sp = byId.get(b.speciesId);
    if (!sp) errs.push(`boss ${b.id}: unknown species ${b.speciesId}`);
    const script = arr(b.script);
    if (script.length === 0) errs.push(`boss ${b.id}: script is empty`);
    else if (sp) {
      const n = arr(sp.moves).length;
      for (const i of script)
        if (!Number.isInteger(i) || i < 0 || i >= n)
          errs.push(`boss ${b.id}: script index ${i} is outside the moves of ${sp.id}`);
    }
    if (!Number.isInteger(b.hpPercent) || b.hpPercent < 100 || b.hpPercent > 500)
      errs.push(`boss ${b.id}: hpPercent must be 100..500`);
  }

  const starters = arr(c.starters);
  if (starters.length !== 3) errs.push(`starters: expected 3, found ${starters.length}`);
  for (const id of starters)
    if (!speciesIds.has(id)) errs.push(`starters: unknown species ${id}`);
}
