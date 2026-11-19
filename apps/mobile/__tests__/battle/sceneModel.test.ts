import { describe, expect, it } from '@jest/globals';
import { CONTENT } from '@kinfall/core/content';
import { createBattle } from '@kinfall/core/sim/battle';
import type { BattleState } from '@kinfall/core/sim/state';

import { applyShownEvent, shownSides } from '../../src/battle/sceneModel';

function battle(): BattleState {
  return createBattle('scene', { speciesIds: ['cindermite', 'tidewisp'] }, { speciesIds: ['brambleback'] }, CONTENT, { telegraph: true });
}

describe('scene model', () => {
  it('shows the active creature of each side as the state has it', () => {
    const s = battle();
    const shown = shownSides(s);
    expect(shown.player).toMatchObject({ speciesId: 'cindermite', hp: s.teams.player[0]!.hp, fainted: false, status: null });
    expect(shown.enemy).toMatchObject({ speciesId: 'brambleback', maxHp: s.teams.enemy[0]!.maxHp });
  });

  it('moves HP down on damage and up on heal, clamped to 0..max', () => {
    const s = battle();
    const start = shownSides(s);
    const max = start.enemy!.maxHp;
    const hit = applyShownEvent(start, { type: 'damage', side: 'enemy', amount: 7, effectiveness: 1 }, s);
    expect(hit.enemy!.hp).toBe(max - 7);
    expect(hit.player).toBe(start.player);
    expect(applyShownEvent(hit, { type: 'heal', side: 'enemy', amount: 999 }, s).enemy!.hp).toBe(max);
    expect(applyShownEvent(hit, { type: 'damage', side: 'enemy', amount: 999, effectiveness: 2 }, s).enemy!.hp).toBe(0);
  });

  it('adds a status, clears stun on a skipped turn, and clears everything on a faint', () => {
    const s = battle();
    const stunned = applyShownEvent(shownSides(s), { type: 'status', side: 'player', status: 'stun' }, s);
    expect(stunned.player!.status).toBe('stun');
    expect(applyShownEvent(stunned, { type: 'skip', side: 'player' }, s).player!.status).toBeNull();
    const scorched = applyShownEvent(stunned, { type: 'status', side: 'player', status: 'scorch' }, s);
    expect(applyShownEvent(scorched, { type: 'skip', side: 'player' }, s)).toBe(scorched);
    const fallen = applyShownEvent(scorched, { type: 'fainted', side: 'player' }, s);
    expect(fallen.player).toMatchObject({ hp: 0, fainted: true, status: null });
  });

  it('brings in the rendered state creature on a swap, and ignores events without a side', () => {
    const s = battle();
    const start = shownSides(s);
    const swapped = applyShownEvent(start, { type: 'swap', side: 'player', toIndex: 1 }, s);
    expect(swapped.player!.speciesId).toBe('tidewisp');
    expect(applyShownEvent(start, { type: 'swap', side: 'player', toIndex: 5 }, s)).toBe(start);
    expect(applyShownEvent(start, { type: 'turnStart', turn: 2 }, s)).toBe(start);
    expect(applyShownEvent(start, { type: 'end', winner: 'player' }, s)).toBe(start);
    expect(applyShownEvent(start, { type: 'move', side: 'enemy', moveId: 'x', hit: true }, s)).toBe(start);
  });
});
