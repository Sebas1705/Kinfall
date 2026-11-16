import type { Content } from '../../content';
import { lookup } from '../../content/lookup';
import { createBattle } from '../battle';
import { canonicalize, validateState } from '../codec';
import { isInt, isRecord, isUint32Quad, unknownKey } from '../guards';
import { buildEncounter } from './encounters';
import { findNode, generateZoneMap } from './map';
import { maxHpOf } from './party';
import type { MapNode, PartyMember, RunState, ZoneMap } from './types';

const ZONES = 3;
const MAX_PARTY = 3;
const RUN_KEYS = ['version', 'seed', 'rng', 'maps', 'zone', 'at', 'party', 'souls', 'stats', 'phase'] as const;
const STAT_KEYS = ['nodesCleared', 'elitesBeaten', 'bossesBeaten', 'creaturesLost'] as const;
const MEMBER_KEYS = ['speciesId', 'hp'] as const;
const PHASE_KEYS: Record<string, readonly string[]> = {
  map: ['kind'],
  battle: ['kind', 'nodeId', 'battle'],
  recruit: ['kind', 'speciesId', 'hp'],
  shrine: ['kind', 'nodeId'],
  cache: ['kind', 'nodeId'],
  mystery: ['kind', 'nodeId'],
  ended: ['kind', 'result'],
};

function validateParty(party: unknown, content: Content): string | null {
  if (!Array.isArray(party) || party.length > MAX_PARTY) return 'run.party must be an array of at most 3 members';
  for (let i = 0; i < party.length; i++) {
    const m: unknown = party[i];
    const where = `run.party[${i}]`;
    if (!isRecord(m)) return `${where} is not an object`;
    const extra = unknownKey(m, MEMBER_KEYS, where);
    if (extra) return extra;
    if (typeof m.speciesId !== 'string' || !lookup(content).hasSpecies(m.speciesId)) return `${where} has an unknown species`;
    const max = maxHpOf(m.speciesId, content);
    if (!isInt(m.hp) || m.hp < 1 || m.hp > max) return `${where}.hp must be an integer between 1 and ${max}`;
  }
  return null;
}

/** Structure of every field except the phase payload; maps must equal the generated ones. */
function validateShape(r: Record<string, unknown>, content: Content): string | null {
  const extra = unknownKey(r, RUN_KEYS, 'run');
  if (extra) return extra;
  if (r.version !== 1) return 'run.version must be 1';
  if (typeof r.seed !== 'string') return 'run.seed must be a string';
  if (!isUint32Quad(r.rng)) return 'run.rng must be four uint32 numbers';
  if (!isInt(r.zone) || r.zone < 0 || r.zone >= ZONES) return 'run.zone must be an integer in 0..2';
  if (!Array.isArray(r.maps) || r.maps.length !== ZONES) return 'run.maps must hold 3 zone maps';
  const seed = r.seed;
  const expected = Array.from({ length: ZONES }, (_, z) => generateZoneMap(seed, z));
  // Maps are derived data: any difference from the seed's maps is tampering.
  if (canonicalize(r.maps) !== canonicalize(expected)) return 'run.maps do not match the maps generated from the seed';
  if (!isInt(r.souls) || r.souls < 0) return 'run.souls must be a non-negative integer';
  if (!isRecord(r.stats)) return 'run.stats must be an object';
  const statsExtra = unknownKey(r.stats, STAT_KEYS, 'run.stats');
  if (statsExtra) return statsExtra;
  for (const k of STAT_KEYS) {
    const v = r.stats[k];
    if (!isInt(v) || v < 0) return `run.stats.${k} must be a non-negative integer`;
  }
  const partyErr = validateParty(r.party, content);
  if (partyErr) return partyErr;
  if (r.at !== null && typeof r.at !== 'string') return 'run.at must be null or a node id';
  if (!isRecord(r.phase) || typeof r.phase.kind !== 'string' || !Object.prototype.hasOwnProperty.call(PHASE_KEYS, r.phase.kind)) {
    return 'run.phase has an unknown kind';
  }
  return unknownKey(r.phase, PHASE_KEYS[r.phase.kind]!, `run.phase (${r.phase.kind})`);
}

/** Position, party size and stats agree with how the engine advances a run. */
function validateProgress(run: RunState): string | null {
  const map = run.maps[run.zone]!;
  const phase = run.phase;
  const won = phase.kind === 'ended' && phase.result === 'won';
  if (phase.kind === 'ended' && phase.result !== 'won' && phase.result !== 'lost') return 'run.phase.result must be won or lost';
  const lost = phase.kind === 'ended' && phase.result === 'lost';
  if (!lost && run.party.length === 0) return 'run.party must not be empty unless the run was lost';

  const at = run.at === null ? undefined : findNode(map, run.at);
  if (run.at !== null && !at) return 'run.at is not a node of the current zone';
  const boss = map.layers[map.layers.length - 1]![0]!;
  if (won && (run.zone !== ZONES - 1 || run.at !== boss.id)) return 'a won run must end on the last zone boss';
  // Standing on a boss node is only the end of a won run; anything else would be a dead end.
  if (!won && at?.type === 'boss') return 'run.at is a boss node but the run is not won';

  const { stats } = run;
  if (stats.bossesBeaten !== (won ? ZONES : run.zone)) return 'run.stats.bossesBeaten does not match the zone reached';
  let cleared = 0;
  for (let z = 0; z < run.zone; z++) cleared += run.maps[z]!.layers.length;
  cleared += at ? at.layer + 1 : 0;
  // Exactly one node per layer is cleared on the way to `at`.
  if (stats.nodesCleared !== cleared) return 'run.stats.nodesCleared does not match the position on the map';
  if (stats.elitesBeaten + stats.bossesBeaten > stats.nodesCleared) return 'run.stats.elitesBeaten exceeds the nodes cleared';
  return null;
}

/** Nodes that may be entered from `run.at` (whatever the phase). */
function reachable(run: RunState): MapNode[] {
  const map: ZoneMap = run.maps[run.zone]!;
  if (run.at === null) return map.layers[0] ?? [];
  const from = findNode(map, run.at);
  return from ? from.next.map((id) => findNode(map, id)).filter((n): n is MapNode => n !== undefined) : [];
}

function enteredNode(run: RunState, nodeId: unknown, label: string): MapNode | string {
  if (typeof nodeId !== 'string') return `run.phase.nodeId must be a node id`;
  const node = findNode(run.maps[run.zone], nodeId);
  if (!node) return `${label} node ${JSON.stringify(nodeId)} is not a node of the current zone`;
  if (!reachable(run).some((n) => n.id === node.id)) return `${label} node ${node.id} is not available from run.at`;
  return node;
}

function validateBattlePhase(run: RunState, content: Content): string | null {
  if (run.phase.kind !== 'battle') return null;
  const node = enteredNode(run, run.phase.nodeId, 'battle');
  if (typeof node === 'string') return node;
  if (node.type !== 'wild' && node.type !== 'elite' && node.type !== 'boss') return `battle node ${node.id} is not a combat node`;
  const stateErr = validateState(run.phase.battle, content);
  if (stateErr) return `run.phase.battle: ${stateErr}`;
  const battle = run.phase.battle;
  // A finished battle is resolved in the same step, so a stored one would have no legal action.
  if (battle.winner !== null) return 'run.phase.battle is finished but was not resolved (winner must be null)';
  const players = battle.teams.player;
  if (players.length !== run.party.length) return 'run.phase.battle player team size does not match the party';
  for (let i = 0; i < players.length; i++) {
    if (players[i]!.speciesId !== run.party[i]!.speciesId) return `run.phase.battle player ${i} species does not match the party`;
  }
  const enc = buildEncounter(run, node, content);
  if (battle.seed !== enc.seed) return 'run.phase.battle seed does not match the node';
  if (battle.telegraph !== enc.telegraph) return 'run.phase.battle telegraph does not match the node';
  if (canonicalize(battle.script ?? null) !== canonicalize(enc.script ?? null)) return 'run.phase.battle script does not match the node';
  const enemies = battle.teams.enemy;
  const pct = enc.enemy.hpPercent ?? 100;
  if (enemies.length !== enc.enemy.speciesIds.length) return 'run.phase.battle enemy team does not match the node';
  for (let i = 0; i < enemies.length; i++) {
    const id = enc.enemy.speciesIds[i]!;
    if (enemies[i]!.speciesId !== id) return `run.phase.battle enemy ${i} species does not match the node`;
    const maxHp = Math.max(1, Math.floor((lookup(content).species(id).base.health * 4 * pct) / 100));
    if (enemies[i]!.maxHp !== maxHp) return `run.phase.battle enemy ${i} maxHp does not match the node`;
  }
  if (battle.turn === 1) {
    // No turn has been played: the battle is exactly the one entering the node built.
    const fresh = createBattle(
      enc.seed,
      { speciesIds: run.party.map((m: PartyMember) => m.speciesId), hp: run.party.map((m) => m.hp) },
      enc.enemy,
      content,
      { telegraph: enc.telegraph, ...(enc.script ? { script: enc.script } : {}) },
    );
    if (canonicalize(battle) !== canonicalize(fresh)) return 'a battle at turn 1 must be the fresh battle for this node and party';
  }
  return null;
}

function validatePhase(run: RunState, content: Content): string | null {
  const phase = run.phase;
  switch (phase.kind) {
    case 'map':
    case 'ended':
      return null;
    case 'battle':
      return validateBattlePhase(run, content);
    case 'recruit': {
      if (typeof phase.speciesId !== 'string' || !lookup(content).hasSpecies(phase.speciesId)) {
        return 'run.phase (recruit) has an unknown species';
      }
      const max = maxHpOf(phase.speciesId, content);
      if (!isInt(phase.hp) || phase.hp < 1 || phase.hp > max) return `run.phase (recruit) hp must be an integer between 1 and ${max}`;
      // An offer follows a wild win: `at` is that wild node and the offer is its enemy at half hp.
      const at = run.at === null ? undefined : findNode(run.maps[run.zone], run.at);
      if (!at || at.type !== 'wild') return 'a recruit offer must follow a wild battle (run.at must be a wild node)';
      if (buildEncounter(run, at, content).enemy.speciesIds[0] !== phase.speciesId) {
        return 'run.phase (recruit) species is not the wild creature of run.at';
      }
      if (phase.hp !== Math.max(1, Math.floor(max / 2))) return 'run.phase (recruit) hp must be half the species max hp';
      return null;
    }
    case 'shrine':
    case 'cache':
    case 'mystery': {
      const node = enteredNode(run, phase.nodeId, phase.kind);
      if (typeof node === 'string') return node;
      return node.type === phase.kind ? null : `${phase.kind} node ${node.id} has type ${node.type}`;
    }
  }
}

/**
 * Full validation of a run from untrusted data (a save). Checks the structure,
 * that the maps are the seed's, and that position, party, stats and the phase
 * are consistent with how the engine advances a run, so an accepted run can
 * always be played on. Returns a message for the first problem, or null.
 * Never throws.
 */
export function validateRun(value: unknown, content: Content): string | null {
  try {
    if (!isRecord(value)) return 'run must be an object';
    const shape = validateShape(value, content);
    if (shape) return shape;
    const run = value as unknown as RunState;
    return validateProgress(run) ?? validatePhase(run, content);
  } catch (e) {
    return `run could not be validated: ${e instanceof Error ? e.message : 'unknown error'}`;
  }
}
