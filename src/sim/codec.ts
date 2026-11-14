import type { Content } from '../content';
import type { BattleState } from './state';

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

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isInt(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v);
}

function validateCombatant(c: unknown, where: string, content: Content | undefined): string | null {
  if (!isRecord(c)) return `${where} is not an object`;
  if (typeof c.speciesId !== 'string') return `${where}.speciesId must be a string`;
  if (content && !content.species.some((s) => s.id === c.speciesId)) {
    return `${where} has unknown species "${c.speciesId}"`;
  }
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
    if (st.id !== 'scorch' && st.id !== 'stun') return `${where}.status.id is unknown`;
    if (!isInt(st.turns) || st.turns < 1) return `${where}.status.turns must be a positive integer`;
  }
  return null;
}

function validateState(s: unknown, content: Content | undefined): string | null {
  if (!isRecord(s)) return 'state must be an object';
  if (s.version !== 1) return 'state.version must be 1';
  if (typeof s.seed !== 'string') return 'state.seed must be a string';
  const rng = s.rng;
  if (!Array.isArray(rng) || rng.length !== 4 || !rng.every((w) => isInt(w) && w >= 0 && w <= 0xffffffff)) {
    return 'state.rng must be four uint32 numbers';
  }
  if (!isRecord(s.teams) || !isRecord(s.active)) return 'state.teams and state.active must be objects';
  for (const side of ['player', 'enemy'] as const) {
    const team = s.teams[side];
    if (!Array.isArray(team) || team.length < 1 || team.length > 3) return `teams.${side} must have 1 to 3 combatants`;
    for (let i = 0; i < team.length; i++) {
      const err = validateCombatant(team[i], `teams.${side}[${i}]`, content);
      if (err) return err;
    }
    const a = s.active[side];
    if (!isInt(a) || a < 0 || a >= team.length) return `active.${side} is out of range`;
  }
  if (!isInt(s.turn) || s.turn < 0) return 'state.turn must be a non-negative integer';
  if (s.winner !== null && s.winner !== 'player' && s.winner !== 'enemy') return 'state.winner is invalid';
  if (s.intent !== null) {
    if (!isRecord(s.intent) || !isInt(s.intent.moveIndex) || s.intent.moveIndex < 0) return 'state.intent is invalid';
  }
  if (typeof s.telegraph !== 'boolean') return 'state.telegraph must be a boolean';
  return null;
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
