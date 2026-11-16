import type { Content } from '../content';
import { lookup } from '../content/lookup';
import { STATUS_TURNS } from './battle';
import { hasOwn, isInt, isRecord, isUint32Quad, unknownKey } from './guards';
import type { BattleState, Side } from './state';

/** JSON text with object keys sorted by UTF-16 code unit order and no whitespace. */
export function canonicalize(value: unknown): string {
  if (value === null) return 'null';
  switch (typeof value) {
    case 'string':
      return JSON.stringify(value);
    case 'number':
      return Number.isFinite(value) ? String(value) : 'null';
    case 'boolean':
      return value ? 'true' : 'false';
    case 'object': {
      if (Array.isArray(value)) return `[${value.map((v) => canonicalize(v === undefined ? null : v)).join(',')}]`;
      const rec = value as Record<string, unknown>;
      // Default sort() compares UTF-16 code units, never the locale.
      const keys = Object.keys(rec).sort();
      const parts: string[] = [];
      for (const k of keys) {
        if (rec[k] === undefined) continue;
        parts.push(`${JSON.stringify(k)}:${canonicalize(rec[k])}`);
      }
      return `{${parts.join(',')}}`;
    }
    default:
      return 'null';
  }
}

const HEX = '0123456789abcdef';

function hex32(n: number): string {
  let out = '';
  for (let shift = 28; shift >= 0; shift -= 4) out += HEX.charAt((n >>> shift) & 15);
  return out;
}

/**
 * FNV-1a 64-bit over UTF-16 code units, as 16 hex chars. The 64-bit value is two uint32
 * words (no BigInt, no floating point): the prime 0x100000001b3 splits into hi 0x100, lo 0x1b3.
 */
export function fnv1a64(text: string): string {
  let hi = 0xcbf29ce4;
  let lo = 0x84222325;
  for (let i = 0; i < text.length; i++) {
    lo = (lo ^ text.charCodeAt(i)) >>> 0;
    // (hi:lo) * (0x100:0x1b3) mod 2^64; lo * 0x1b3 < 2^41, so the carry split is exact.
    const p = lo * 0x1b3;
    const carry = Math.floor(p / 4294967296);
    const newLo = (p - carry * 4294967296) >>> 0;
    const newHi = (Math.imul(hi, 0x1b3) + Math.imul(lo, 0x100) + carry) >>> 0;
    hi = newHi;
    lo = newLo;
  }
  return hex32(hi) + hex32(lo);
}

export function hashState(state: BattleState): string {
  return fnv1a64(canonicalize(state));
}

export function serializeState(state: BattleState): string {
  return canonicalize({ version: 1, checksum: hashState(state), state });
}

export type DeserializeResult = { ok: true; state: BattleState } | { ok: false; error: string };

const STATE_KEYS = ['version', 'seed', 'rng', 'teams', 'active', 'turn', 'winner', 'telegraph', 'intent', 'script'] as const;
const SIDE_KEYS = ['player', 'enemy'] as const;
const COMBATANT_KEYS = ['speciesId', 'hp', 'maxHp', 'focus', 'maxFocus', 'status', 'fainted'] as const;
const STATUS_KEYS = ['id', 'turns'] as const;

function validateCombatant(c: unknown, where: string, side: Side, content: Content | undefined): string | null {
  if (!isRecord(c)) return `${where} is not an object`;
  const extra = unknownKey(c, COMBATANT_KEYS, where);
  if (extra) return extra;
  if (typeof c.speciesId !== 'string') return `${where}.speciesId must be a string`;
  if (content && !lookup(content).hasSpecies(c.speciesId)) return `${where} has unknown species "${c.speciesId}"`;
  const { hp, maxHp, focus, maxFocus } = c;
  if (!isInt(maxHp) || maxHp < 1) return `${where}.maxHp must be a positive integer`;
  if (!isInt(hp) || hp < 0 || hp > maxHp) return `${where}.hp must be an integer between 0 and maxHp`;
  if (!isInt(maxFocus) || maxFocus < 0) return `${where}.maxFocus must be a non-negative integer`;
  if (!isInt(focus) || focus < 0 || focus > maxFocus) return `${where}.focus must be an integer between 0 and maxFocus`;
  if (typeof c.fainted !== 'boolean') return `${where}.fainted must be a boolean`;
  if (c.fainted !== (hp === 0)) return `${where}.fainted is inconsistent with hp`;
  const st = c.status;
  if (st !== null) {
    if (!isRecord(st)) return `${where}.status must be null or an object`;
    const stExtra = unknownKey(st, STATUS_KEYS, `${where}.status`);
    if (stExtra) return stExtra;
    if (st.id !== 'scorch' && st.id !== 'stun') return `${where}.status.id is unknown`;
    if (!isInt(st.turns) || st.turns < 1 || st.turns > STATUS_TURNS[st.id]) {
      return `${where}.status.turns must be an integer between 1 and ${STATUS_TURNS[st.id]}`;
    }
    if (c.fainted) return `${where}.status must be null on a fainted combatant`;
  }
  if (content) {
    const { base } = lookup(content).species(c.speciesId);
    if (maxFocus !== Math.max(1, Math.floor(base.focus / 10))) return `${where}.maxFocus does not match its species`;
    // Enemy max HP may be scaled by hpPercent; the player side never is.
    if (side === 'player' && maxHp !== base.health * 4) return `${where}.maxHp does not match its species`;
  }
  return null;
}

/** Checks `intent` against telegraph, winner, stun, the enemy's legal moves and the boss script. */
function validateIntent(s: Record<string, unknown>, state: BattleState, content: Content | undefined): string | null {
  const intent = s.intent;
  if (intent !== null) {
    if (!isRecord(intent)) return 'state.intent is invalid';
    const extra = unknownKey(intent, ['moveIndex'], 'state.intent');
    if (extra) return extra;
    if (!isInt(intent.moveIndex) || intent.moveIndex < 0) return 'state.intent is invalid';
  }
  const enemy = state.teams.enemy[state.active.enemy]!;
  // The engine shows an intent exactly when the battle is live, telegraphed and the active enemy is not stunned.
  const shown = state.telegraph && state.winner === null && enemy.status?.id !== 'stun';
  if (state.intent !== null && !shown) {
    return 'state.intent must be null unless the battle is live, telegraphed and the active enemy is not stunned';
  }
  if (!content) return null;
  const l = lookup(content);
  const moves = l.species(enemy.speciesId).moves;
  const legal = (i: number): boolean => i < moves.length && l.move(moves[i]!).focusCost <= enemy.focus;
  if (state.intent !== null && !legal(state.intent.moveIndex)) return 'state.intent is not a legal move for the active enemy';
  if (!shown) return null;
  if (state.intent === null) {
    return moves.some((_, i) => legal(i)) ? 'state.intent is missing for a telegraphed enemy' : null;
  }
  if (state.script !== undefined) {
    const scripted = state.script[(state.turn - 1) % state.script.length]!;
    if (legal(scripted) && state.intent.moveIndex !== scripted) return 'state.intent must be the scripted move';
  }
  return null;
}

/**
 * Structural and consistency checks for a battle state from untrusted data (a save).
 * With `content` it also checks species ids, derived stats and the enemy intent.
 * Returns a message for the first problem, or null when the state is valid.
 */
export function validateState(s: unknown, content: Content | undefined): string | null {
  if (!isRecord(s)) return 'state must be an object';
  const extra = unknownKey(s, STATE_KEYS, 'state');
  if (extra) return extra;
  if (s.version !== 1) return 'state.version must be 1';
  if (typeof s.seed !== 'string') return 'state.seed must be a string';
  if (!isUint32Quad(s.rng)) return 'state.rng must be four uint32 numbers';
  if (!isRecord(s.teams) || !isRecord(s.active)) return 'state.teams and state.active must be objects';
  const teamsExtra = unknownKey(s.teams, SIDE_KEYS, 'state.teams') ?? unknownKey(s.active, SIDE_KEYS, 'state.active');
  if (teamsExtra) return teamsExtra;
  for (const side of SIDE_KEYS) {
    const team = s.teams[side];
    if (!Array.isArray(team) || team.length < 1 || team.length > 3) return `teams.${side} must have 1 to 3 combatants`;
    for (let i = 0; i < team.length; i++) {
      const err = validateCombatant(team[i], `teams.${side}[${i}]`, side, content);
      if (err) return err;
    }
    const a = s.active[side];
    if (!isInt(a) || a < 0 || a >= team.length) return `active.${side} is out of range`;
  }
  if (!isInt(s.turn) || s.turn < 1) return 'state.turn must be a positive integer';
  if (s.winner !== null && s.winner !== 'player' && s.winner !== 'enemy') return 'state.winner is invalid';
  if (typeof s.telegraph !== 'boolean') return 'state.telegraph must be a boolean';
  if (hasOwn(s, 'script')) {
    const sc = s.script;
    if (!Array.isArray(sc) || sc.length < 1 || !sc.every((n) => isInt(n) && n >= 0)) {
      return 'state.script must be a non-empty array of non-negative integers';
    }
  }
  const state = s as unknown as BattleState;
  // A mutual wipe counts as a loss, exactly as the engine decides it.
  const expected: Side | null = state.teams.player.every((c) => c.fainted)
    ? 'enemy'
    : state.teams.enemy.every((c) => c.fainted)
      ? 'player'
      : null;
  if (state.winner !== expected) return 'state.winner is inconsistent with the fainted flags';
  if (state.winner === null && state.teams.enemy[state.active.enemy]!.fainted) {
    return 'the active enemy must be conscious while the battle is live';
  }
  return validateIntent(s, state, content);
}

/** Never throws; any parse, version, checksum or structure failure returns `{ ok: false }`. */
export function deserializeState(text: string, content?: Content): DeserializeResult {
  try {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return { ok: false, error: 'Save data is not valid JSON.' };
    }
    if (!isRecord(parsed)) return { ok: false, error: 'Save data has an unexpected shape.' };
    if (parsed.version !== 1) return { ok: false, error: `Unsupported save version: ${canonicalize(parsed.version)}.` };
    if (typeof parsed.checksum !== 'string') return { ok: false, error: 'Save data has no checksum.' };
    if (fnv1a64(canonicalize(parsed.state)) !== parsed.checksum) {
      return { ok: false, error: 'Save data checksum does not match (the data is corrupted).' };
    }
    const problem = validateState(parsed.state, content);
    if (problem) return { ok: false, error: `Save data is invalid: ${problem}.` };
    return { ok: true, state: parsed.state as BattleState };
  } catch (e) {
    return { ok: false, error: `Save data could not be read: ${e instanceof Error ? e.message : 'unknown error'}.` };
  }
}
