// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { STRINGS, type StringKey } from '../../src/platform/strings';
import { detectLang, eventLine, getLang, moveName, setLang, speciesName, t } from '../../src/platform/i18n';
import type { BattleEvent } from '../../src/sim/state';
import { CONTENT } from '../../src/content';

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!).sort();
const keys = Object.keys(STRINGS.en) as StringKey[];

afterEach(() => {
  vi.restoreAllMocks();
  setLang('en');
  localStorage.clear();
});

describe('strings', () => {
  it('has identical key sets', () => {
    expect(Object.keys(STRINGS.es).sort()).toEqual(Object.keys(STRINGS.en).sort());
  });
  it('has no empty values', () => {
    for (const lang of ['en', 'es'] as const) {
      for (const k of keys) expect(STRINGS[lang][k].trim(), `${lang}.${k}`).not.toBe('');
    }
  });
  it('uses the same placeholders in both languages', () => {
    for (const k of keys) expect(placeholders(STRINGS.es[k]), k).toEqual(placeholders(STRINGS.en[k]));
  });
});

describe('t', () => {
  it('replaces all occurrences and leaves unknown placeholders', () => {
    const table = STRINGS.en as Record<string, string>;
    const orig = table['log.move']!;
    table['log.move'] = '{species} {species} {other}';
    try {
      expect(t('log.move', { species: 'X' })).toBe('X X {other}');
    } finally {
      table['log.move'] = orig;
    }
  });
  it('uses the current language', () => {
    setLang('es');
    expect(t('menu.fight')).toBe(STRINGS.es['menu.fight']);
  });
});

describe('language', () => {
  it('detects es and falls back to en', () => {
    vi.spyOn(navigator, 'language', 'get').mockReturnValue('es-ES');
    expect(detectLang()).toBe('es');
    vi.spyOn(navigator, 'language', 'get').mockReturnValue('fr');
    expect(detectLang()).toBe('en');
  });
  it('prefers the saved choice', () => {
    vi.spyOn(navigator, 'language', 'get').mockReturnValue('es-ES');
    localStorage.setItem('webgames.lang', 'en');
    expect(detectLang()).toBe('en');
  });
  it('setLang persists, sets html lang, and survives storage throwing', () => {
    setLang('es');
    expect(getLang()).toBe('es');
    expect(document.documentElement.lang).toBe('es');
    expect(localStorage.getItem('webgames.lang')).toBe('es');
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });
    expect(() => setLang('en')).not.toThrow();
    expect(getLang()).toBe('en');
  });
  it('names follow the current language', () => {
    const m = CONTENT.moves[0]!;
    const s = CONTENT.species[0]!;
    setLang('es');
    expect(moveName(m)).toBe(m.names.es);
    expect(speciesName(s)).toBe(s.names.es);
    setLang('en');
    expect(moveName(m)).toBe(m.names.en);
  });
});

describe('eventLine', () => {
  const ctx = { species: (side: string) => (side === 'player' ? 'Mine' : 'Theirs'), move: (id: string) => `M:${id}` };
  const events: BattleEvent[] = [
    { type: 'turnStart', turn: 1 },
    { type: 'move', side: 'player', moveId: 'a', hit: true },
    { type: 'move', side: 'player', moveId: 'a', hit: false },
    { type: 'damage', side: 'enemy', amount: 7, effectiveness: 100 },
    { type: 'heal', side: 'player', amount: 3 },
    { type: 'status', side: 'enemy', status: 'scorch' },
    { type: 'skip', side: 'enemy' },
    { type: 'swap', side: 'player', toIndex: 1 },
    { type: 'fainted', side: 'enemy' },
    { type: 'rejected', reason: 'illegal' },
    { type: 'rejected', reason: 'ended' },
    { type: 'rejected', reason: 'focus' },
    { type: 'end', winner: 'player' },
    { type: 'end', winner: 'enemy' },
  ];
  it('produces a line for every event type in both languages', () => {
    for (const lang of ['en', 'es'] as const) {
      setLang(lang);
      for (const e of events) {
        const line = eventLine(e, ctx);
        if (e.type === 'turnStart') expect(line).toBeNull();
        else {
          expect(line, `${lang} ${e.type}`).toBeTruthy();
          expect(line).not.toMatch(/\{\w+\}/);
        }
      }
    }
  });
  it('interpolates names and amounts', () => {
    expect(eventLine(events[3]!, ctx)).toBe('Theirs takes 7 damage.');
    expect(eventLine(events[1]!, ctx)).toBe('Mine uses M:a.');
  });
  it('appends effectiveness messages', () => {
    const very = eventLine({ type: 'damage', side: 'enemy', amount: 9, effectiveness: 200 }, ctx)!;
    const not = eventLine({ type: 'damage', side: 'enemy', amount: 2, effectiveness: 50 }, ctx)!;
    expect(very.endsWith(STRINGS.en['effect.very'])).toBe(true);
    expect(not.endsWith(STRINGS.en['effect.not'])).toBe(true);
    expect(eventLine(events[3]!, ctx)).not.toMatch(/effective/);
  });
});
