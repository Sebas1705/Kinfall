import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CONTENT } from '../../src/content';
import { applyAction, createBattle } from '../../src/sim/battle';
import { replayBattle } from '../../src/sim/golden';
import type { GoldenEntry } from '../../src/sim/golden';

const FILE = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'golden', 'battle.golden.json');
const entries = JSON.parse(readFileSync(FILE, 'utf8')) as GoldenEntry[];

describe('golden battles', () => {
  it('has at least 3 entries with distinct seeds, a loss, telegraph, a status move and a swap', () => {
    expect(entries.length).toBeGreaterThanOrEqual(3);
    expect(new Set(entries.map((e) => e.seed)).size).toBe(entries.length);
    expect(entries.some((e) => e.winner === 'enemy')).toBe(true);
    expect(entries.some((e) => e.telegraph)).toBe(true);
    expect(entries.some((e) => e.actions.some((a) => a.type === 'swap'))).toBe(true);
  });

  it('the status-and-swap entry really plays a status move and a swap', () => {
    const e = entries.find((x) => x.name.includes('status') && x.name.includes('swap'))!;
    expect(e).toBeDefined();
    let s = createBattle(e.seed, e.player, e.enemy, CONTENT, { telegraph: e.telegraph });
    let statusMoves = 0;
    let swaps = 0;
    for (const a of e.actions) {
      const r = applyAction(s, a, CONTENT);
      if (!r.events.some((ev) => ev.type === 'rejected')) {
        if (a.type === 'swap') swaps++;
        else {
          const sp = CONTENT.species.find((x) => x.id === s.teams.player[s.active.player]!.speciesId)!;
          const mv = CONTENT.moves.find((m) => m.id === sp.moves[a.moveIndex])!;
          if (mv.kind === 'status') statusMoves++;
        }
      }
      s = r.state;
    }
    expect(statusMoves).toBeGreaterThanOrEqual(1);
    expect(swaps).toBeGreaterThanOrEqual(1);
  });

  for (const e of entries) {
    it(`replays ${e.name} to the recorded hash and winner`, () => {
      const r = replayBattle(e.seed, e.player, e.enemy, e.actions, CONTENT, { telegraph: e.telegraph });
      expect(r.finalHash).toBe(e.finalHash);
      expect(r.winner).toBe(e.winner);
    });
  }
});
