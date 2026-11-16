import type { Content } from './schema';

const STAT_KEYS = ['health', 'power', 'guard', 'speed', 'focus'] as const;

type Obj = Record<string, unknown>;

function isObj(v: unknown): v is Obj {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
function obj(v: unknown): Obj {
  return isObj(v) ? v : {};
}
function list(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}
function strs(v: unknown): string[] {
  return list(v).map((x) => String(x));
}
function nonEmpty(v: unknown): boolean {
  return typeof v === 'string' && v.length > 0;
}
function tooLong(v: unknown): boolean {
  return typeof v === 'string' && v.length > 24;
}
function num(v: unknown): number {
  return typeof v === 'number' ? v : Number.NaN;
}

/**
 * Returns one message per problem; an empty array means the content is valid.
 * Total: never throws, whatever shape `c` has (malformed data yields messages).
 */
export function validateContent(c: Content): string[] {
  const errs: string[] = [];
  const root = obj(c);
  const moveIds = new Set<string>();
  const movesById = new Map<string, Obj>();
  list(root.moves).forEach((raw, i) => {
    if (!isObj(raw)) {
      errs.push(`moves[${i}]: not an object`);
      return;
    }
    const m = raw;
    const id = String(m.id);
    if (moveIds.has(id)) errs.push(`duplicate move id: ${id}`);
    moveIds.add(id);
    if (!movesById.has(id)) movesById.set(id, m);
    const names = obj(m.names);
    if (!nonEmpty(names.en) || !nonEmpty(names.es)) errs.push(`move ${id}: missing en or es name`);
    if (tooLong(names.es)) errs.push(`move ${id}: es name longer than 24 characters`);
    const acc = num(m.accuracy);
    if (!Number.isInteger(acc) || acc < 1 || acc > 100) errs.push(`move ${id}: accuracy must be 1..100`);
    if (m.kind === 'damage' && !(num(m.power) > 0)) errs.push(`move ${id}: damage power must be > 0`);
    if (m.kind === 'status' && !m.status) errs.push(`move ${id}: status move needs a status`);
    if (num(m.focusCost) < 0) errs.push(`move ${id}: negative focus cost`);
  });

  const speciesIds = new Set<string>();
  const byId = new Map<string, Obj>();
  const artKeys = new Set<string>();
  list(root.species).forEach((raw, i) => {
    if (!isObj(raw)) {
      errs.push(`species[${i}]: not an object`);
      return;
    }
    const s = raw;
    const id = String(s.id);
    const dupId = speciesIds.has(id);
    if (dupId) errs.push(`duplicate species id: ${id}`);
    speciesIds.add(id);
    if (!byId.has(id)) byId.set(id, s);
    const names = obj(s.names);
    if (!nonEmpty(names.en) || !nonEmpty(names.es)) errs.push(`species ${id}: missing en or es name`);
    if (tooLong(names.es)) errs.push(`species ${id}: es name longer than 24 characters`);
    const base = obj(s.base);
    for (const k of STAT_KEYS)
      if (!(num(base[k]) > 0)) errs.push(`species ${id}: base.${k} must be > 0`);
    if (!Array.isArray(s.moves)) errs.push(`species ${id}: moves must be a list`);
    for (const mid of strs(s.moves))
      if (!moveIds.has(mid)) errs.push(`species ${id}: unknown move id ${mid}`);
    const key = String(obj(s.art).key);
    if (!dupId && artKeys.has(key)) errs.push(`species ${id}: duplicate art key ${key}`);
    artKeys.add(key);
  });

  validateRun(root, speciesIds, byId, movesById, errs);
  return errs;
}

function validateEvolutions(speciesIds: Set<string>, byId: Map<string, Obj>, errs: string[]): void {
  for (const [id, s] of byId) {
    if (s.evolvesTo === undefined) {
      if (s.evolveCost !== undefined) errs.push(`species ${id}: evolveCost is set without evolvesTo`);
      continue;
    }
    const target = String(s.evolvesTo);
    if (!speciesIds.has(target)) errs.push(`species ${id}: evolution target ${target} does not exist`);
    const cost = num(s.evolveCost);
    if (!Number.isInteger(cost) || cost < 1)
      errs.push(`species ${id}: evolveCost must be an integer >= 1 when evolvesTo is set`);
    // Walk the chain from `id`. A cycle that returns to `id` is reported once, by its
    // alphabetically first member, listing members in chain order.
    const seen = new Set<string>([id]);
    let next = byId.get(target);
    while (next) {
      const nid = String(next.id);
      if (nid === id) {
        if ([...seen].sort()[0] === id)
          errs.push(`species ${id}: evolution cycle (${[...seen, id].join(' -> ')})`);
        break;
      }
      if (seen.has(nid)) break;
      seen.add(nid);
      next = next.evolvesTo === undefined ? undefined : byId.get(String(next.evolvesTo));
    }
  }
}

/** Evolution, zone, boss and starter rules; tolerant of missing or malformed fields. */
function validateRun(
  root: Obj,
  speciesIds: Set<string>,
  byId: Map<string, Obj>,
  movesById: Map<string, Obj>,
  errs: string[],
): void {
  validateEvolutions(speciesIds, byId, errs);

  const zones = list(root.zones);
  if (!Array.isArray(root.zones) || zones.length !== 3)
    errs.push(`zones: expected 3, found ${zones.length}`);
  zones.forEach((raw, i) => {
    const z = obj(raw);
    for (const pool of ['wild', 'elite'] as const) {
      const ids = strs(z[pool]);
      if (ids.length === 0) errs.push(`zone ${i}: ${pool} pool is empty`);
      for (const id of ids)
        if (!speciesIds.has(id)) errs.push(`zone ${i}: ${pool} pool has unknown species ${id}`);
    }
  });

  const bosses = list(root.bosses);
  if (!Array.isArray(root.bosses) || bosses.length !== 3)
    errs.push(`bosses: expected 3, found ${bosses.length}`);
  else {
    const zs = bosses.map((b) => obj(b).zone);
    if (new Set(zs).size !== 3 || zs.some((z) => z !== 0 && z !== 1 && z !== 2)) {
      const dup = bosses.filter((b, i) => zs.indexOf(obj(b).zone) !== i).map((b) => String(obj(b).id));
      const tail = dup.length ? ` (duplicate zone: ${dup.join(', ')})` : '';
      errs.push(`bosses: expected exactly one per zone 0, 1 and 2${tail}`);
    }
  }
  bosses.forEach((raw, i) => {
    if (!isObj(raw)) {
      errs.push(`bosses[${i}]: not an object`);
      return;
    }
    const b = raw;
    const bid = String(b.id);
    const sid = String(b.speciesId);
    const sp = byId.get(sid);
    if (!sp) errs.push(`boss ${bid}: unknown species ${sid}`);
    const script = list(b.script);
    if (script.length === 0) errs.push(`boss ${bid}: script is empty`);
    else if (sp) {
      const moves = strs(sp.moves);
      for (const idx of script)
        if (!Number.isInteger(idx) || (idx as number) < 0 || (idx as number) >= moves.length)
          errs.push(`boss ${bid}: script index ${String(idx)} is outside the moves of ${sid}`);
      // The last entry must be the strongest damage move of the species.
      const last = script[script.length - 1];
      if (Number.isInteger(last) && (last as number) >= 0 && (last as number) < moves.length) {
        const powers = moves
          .map((mid) => movesById.get(mid))
          .filter((m): m is Obj => m !== undefined && m.kind === 'damage')
          .map((m) => num(m.power));
        const lastMove = movesById.get(moves[last as number]!);
        const best = powers.length ? Math.max(...powers) : Number.NaN;
        if (!lastMove || lastMove.kind !== 'damage' || !(num(lastMove.power) >= best))
          errs.push(`boss ${bid}: last script entry must be the strongest damage move of ${sid}`);
      }
    }
    const hp = num(b.hpPercent);
    if (!Number.isInteger(hp) || hp < 100 || hp > 500) errs.push(`boss ${bid}: hpPercent must be 100..500`);
  });

  const starters = list(root.starters);
  if (!Array.isArray(root.starters) || starters.length !== 3)
    errs.push(`starters: expected 3, found ${starters.length}`);
  for (const id of strs(starters))
    if (!speciesIds.has(id)) errs.push(`starters: unknown species ${id}`);
}
