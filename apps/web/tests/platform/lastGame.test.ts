import { describe, expect, it } from 'vitest';
import { LAST_GAME_KEY } from '@kinfall/core/games/registry';
import { readLastGame, writeLastGame } from '../../src/platform/lastGame';

function fakeStorage(): Storage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  } as unknown as Storage & { data: Map<string, string> };
}

const throwing = {
  getItem: () => {
    throw new Error('blocked');
  },
  setItem: () => {
    throw new Error('quota');
  },
  removeItem: () => {},
};

describe('lastGame', () => {
  it('round-trips the game id under the registry key', () => {
    const s = fakeStorage();
    writeLastGame(s, 'kinfall');
    expect(s.data.get(LAST_GAME_KEY)).toBe('kinfall');
    expect(readLastGame(s)).toBe('kinfall');
  });

  it('reads undefined when nothing is stored', () => {
    expect(readLastGame(fakeStorage())).toBeUndefined();
  });

  it('never throws with null storage', () => {
    expect(readLastGame(null)).toBeUndefined();
    expect(() => writeLastGame(null, 'kinfall')).not.toThrow();
  });

  it('never throws when the storage throws', () => {
    expect(readLastGame(throwing)).toBeUndefined();
    expect(() => writeLastGame(throwing, 'kinfall')).not.toThrow();
  });
});
