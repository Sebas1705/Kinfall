import { describe, expect, it } from 'vitest';
import {
  findGame,
  GAMES,
  gameFromSearch,
  initialFocus,
  isGameId,
  isPlayable,
  LAST_GAME_KEY,
} from '../../src/games/registry';
import { STRINGS } from '../../src/platform/strings';

describe('registry', () => {
  it('lists kinfall, simulator and survival in order', () => {
    expect(GAMES.map((g) => g.id)).toEqual(['kinfall', 'simulator', 'survival']);
    expect(new Set(GAMES.map((g) => g.id)).size).toBe(GAMES.length);
    expect(LAST_GAME_KEY).toBe('kinfall.lastGame');
  });

  it('has name and tagline strings in both languages', () => {
    for (const g of GAMES) {
      for (const lang of ['en', 'es'] as const) {
        expect(STRINGS[lang][g.nameKey], `${lang} ${g.nameKey}`).toBeTruthy();
        expect(STRINGS[lang][g.taglineKey], `${lang} ${g.taglineKey}`).toBeTruthy();
      }
    }
  });

  it('knows ids and playability', () => {
    expect(isGameId('kinfall')).toBe(true);
    expect(isGameId('nope')).toBe(false);
    expect(isGameId(42)).toBe(false);
    expect(findGame('survival').id).toBe('survival');
    expect(isPlayable('kinfall')).toBe(true);
    expect(isPlayable('simulator')).toBe(false);
  });
});

describe('initialFocus', () => {
  it.each([undefined, 'nope', 42, 'simulator', null])('falls back to kinfall for %s', (v) => {
    expect(initialFocus(v)).toBe('kinfall');
  });
  it('keeps a playable last game', () => {
    expect(initialFocus('kinfall')).toBe('kinfall');
  });
});

describe('gameFromSearch', () => {
  it.each(['?game=kinfall', '?mode=battle', '?seed=ABC'])('%s is kinfall', (s) => {
    expect(gameFromSearch(s)).toBe('kinfall');
  });
  it.each(['?game=unknown', '?game=simulator', ''])('%s is null', (s) => {
    expect(gameFromSearch(s)).toBeNull();
  });
});
