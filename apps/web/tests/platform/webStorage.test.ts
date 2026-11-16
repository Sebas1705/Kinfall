import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultStorage } from '../../src/platform/webStorage';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('defaultStorage', () => {
  it('is null where localStorage does not exist (node)', () => {
    expect(defaultStorage()).toBeNull();
  });

  it('returns localStorage when it exists', () => {
    const fake = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
    vi.stubGlobal('localStorage', fake);
    expect(defaultStorage()).toBe(fake);
  });

  it('is null when accessing localStorage throws (blocked storage)', () => {
    const desc = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('SecurityError');
      },
    });
    try {
      expect(defaultStorage()).toBeNull();
    } finally {
      if (desc) Object.defineProperty(globalThis, 'localStorage', desc);
      else delete (globalThis as { localStorage?: unknown }).localStorage;
    }
  });
});
