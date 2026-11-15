import type { Content } from '../../content';
import { canonicalize, fnv1a64 } from '../codec';
import { isRecord } from '../guards';
import type { RunState } from './types';
import { validateRun } from './validate';

export { validateRun };

export function hashRun(run: RunState): string {
  return fnv1a64(canonicalize(run));
}

/** Canonical JSON `{ version: 1, checksum, run }`, the same envelope as `serializeState`. */
export function serializeRun(run: RunState): string {
  return canonicalize({ version: 1, checksum: hashRun(run), run });
}

export type DeserializeRunResult = { ok: true; run: RunState } | { ok: false; error: string };

/** Never throws; any parse, version, checksum or consistency failure returns `{ ok: false }`. */
export function deserializeRun(text: string, content: Content): DeserializeRunResult {
  try {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return { ok: false, error: 'Run save is not valid JSON.' };
    }
    if (!isRecord(parsed)) return { ok: false, error: 'Run save has an unexpected shape.' };
    if (parsed.version !== 1) return { ok: false, error: `Unsupported run save version: ${canonicalize(parsed.version)}.` };
    if (typeof parsed.checksum !== 'string') return { ok: false, error: 'Run save has no checksum.' };
    if (fnv1a64(canonicalize(parsed.run)) !== parsed.checksum) {
      return { ok: false, error: 'Run save checksum does not match (the data is corrupted).' };
    }
    const problem = validateRun(parsed.run, content);
    if (problem) return { ok: false, error: `Run save is invalid: ${problem}.` };
    return { ok: true, run: parsed.run as RunState };
  } catch (e) {
    return { ok: false, error: `Run save could not be read: ${e instanceof Error ? e.message : 'unknown error'}.` };
  }
}
