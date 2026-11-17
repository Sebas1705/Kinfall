import { afterEach, describe, expect, it, vi } from 'vitest';
import { STRINGS, type StringKey } from '../../src/platform/strings';
import {
  configureI18n,
  createI18n,
  eventLine,
  getLang,
  isLang,
  LANG_STORAGE_KEY,
  moveName,
  nodeTypeLabel,
  runEventLine,
  setLang,
  speciesName,
  t,
} from '../../src/platform/i18n';
import type { NodeType, RunEvent } from '../../src/sim/run/types';
import type { BattleEvent } from '../../src/sim/state';
import { CONTENT } from '../../src/content';

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!).sort();
const keys = Object.keys(STRINGS.en) as StringKey[];

afterEach(() => {
  vi.restoreAllMocks();
  configureI18n({});
  setLang('en');
});

/** In-memory language storage that records writes. */
function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  const writes: [string, string][] = [];
  return {
    data,
    writes,
    get: (key: string) => data.get(key) ?? null,
    set: (key: string, value: string) => {
      writes.push([key, value]);
      data.set(key, value);
    },
  };
}

const throwingStorage = {
  get: (): string | null => {
    throw new Error('denied');
  },
  set: (): void => {
    throw new Error('denied');
  },
};

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
    expect(createI18n({ detect: () => 'es' }).getLang()).toBe('es');
    expect(createI18n({ detect: () => 'en' }).getLang()).toBe('en');
  });
  it('is English without adapters, or when detection throws or returns junk', () => {
    expect(createI18n().getLang()).toBe('en');
    expect(
      createI18n({
        detect: () => {
          throw new Error('no platform');
        },
      }).getLang(),
    ).toBe('en');
    expect(createI18n({ detect: () => 'fr' as never }).getLang()).toBe('en');
  });
  it('prefers the saved choice', () => {
    const storage = memoryStorage({ [LANG_STORAGE_KEY]: 'en' });
    expect(createI18n({ storage, detect: () => 'es' }).getLang()).toBe('en');
    storage.data.set(LANG_STORAGE_KEY, 'es');
    expect(createI18n({ storage, detect: () => 'en' }).getLang()).toBe('es');
  });
  it.each(['fr', 'ES', '', ' es', 'null'])('ignores an invalid saved value (%j)', (saved) => {
    const storage = memoryStorage({ [LANG_STORAGE_KEY]: saved });
    expect(createI18n({ storage, detect: () => 'es' }).getLang()).toBe('es');
  });
  it('uses the webgames.lang key', () => {
    expect(LANG_STORAGE_KEY).toBe('webgames.lang');
  });
  it('setLang persists, notifies, and survives storage throwing', () => {
    const storage = memoryStorage();
    const changes: string[] = [];
    const i18n = createI18n({ storage, onChange: (l) => changes.push(l) });
    i18n.setLang('es');
    expect(i18n.getLang()).toBe('es');
    expect(storage.data.get(LANG_STORAGE_KEY)).toBe('es');
    expect(changes).toEqual(['es']);
    const blocked = createI18n({ storage: throwingStorage, detect: () => 'es', onChange: (l) => changes.push(l) });
    expect(blocked.getLang()).toBe('es');
    expect(() => blocked.setLang('en')).not.toThrow();
    expect(blocked.getLang()).toBe('en');
    expect(changes).toEqual(['es', 'en']);
  });
  it('calls onChange only when the language changes, but still saves a no-op set', () => {
    const storage = memoryStorage();
    const onChange = vi.fn();
    const i18n = createI18n({ storage, detect: () => 'es', onChange });
    i18n.setLang('es');
    expect(onChange).not.toHaveBeenCalled();
    expect(storage.writes).toEqual([[LANG_STORAGE_KEY, 'es']]);
    i18n.setLang('en');
    i18n.setLang('en');
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('en');
  });
  it('never reads the saved value again after start', () => {
    const storage = memoryStorage({ [LANG_STORAGE_KEY]: 'es' });
    const i18n = createI18n({ storage });
    storage.data.set(LANG_STORAGE_KEY, 'en');
    expect(i18n.getLang()).toBe('es');
  });
  it('instances are independent and translate in their own language', () => {
    const a = createI18n({ detect: () => 'es' });
    const b = createI18n();
    expect(a.t('menu.fight')).toBe(STRINGS.es['menu.fight']);
    expect(b.t('menu.fight')).toBe(STRINGS.en['menu.fight']);
    expect(a.t('battle.seed', { seed: 'x' })).toBe(STRINGS.es['battle.seed'].replace('{seed}', 'x'));
  });
  it('configureI18n rebinds the shared helpers', () => {
    const storage = memoryStorage({ [LANG_STORAGE_KEY]: 'es' });
    const onChange = vi.fn();
    const i18n = configureI18n({ storage, onChange });
    expect(getLang()).toBe('es');
    expect(t('menu.fight')).toBe(STRINGS.es['menu.fight']);
    setLang('en');
    expect(i18n.getLang()).toBe('en');
    expect(storage.data.get(LANG_STORAGE_KEY)).toBe('en');
    expect(onChange).toHaveBeenCalledWith('en');
  });
  it('isLang accepts only the supported languages', () => {
    expect(isLang('en')).toBe(true);
    expect(isLang('es')).toBe(true);
    for (const v of ['EN', 'fr', '', null, undefined, 1]) expect(isLang(v)).toBe(false);
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

describe('t edge cases', () => {
  const table = STRINGS as Record<string, Record<string, string>>;
  it.each(['en', 'es'] as const)('substitutes params literally in a single pass (%s)', (lang) => {
    const orig = table[lang]!['log.move']!;
    table[lang]!['log.move'] = '[{species}|{move}]';
    setLang(lang);
    try {
      expect(t('log.move', { species: '$&{move}', move: 'Z' })).toBe('[$&{move}|Z]');
      expect(t('log.move', { species: '$1', move: '$$' })).toBe('[$1|$$]');
      expect(t('log.move', { species: '{move}', move: '{species}' })).toBe('[{move}|{species}]');
    } finally {
      table[lang]!['log.move'] = orig;
    }
  });
});

describe('gender-neutral Spanish', () => {
  // Deny-list approximation: no word ending in -ado/-ada/-ido/-ida in any Spanish string that
  // names a creature (or the stunned label), since such an adjective would have to agree with
  // the creature's gender. Accented participles ('ha caído') do not agree and are not matched.
  const gendered = /(?<!\p{L})\p{L}*(ado|ada|ido|ida)(?!\p{L})/u;
  it('has no agreeing adjectives next to {species}', () => {
    for (const k of keys) {
      const v = STRINGS.es[k];
      if (/{(species|from|to|replaced)}/.test(v) || k === 'intent.stunned') expect(v, k).not.toMatch(gendered);
    }
  });
});

describe('eventLine', () => {
  const ctx = { species: (side: string) => (side === 'player' ? 'Mine' : 'Theirs'), move: (id: string) => `M:${id}` };
  const events: BattleEvent[] = [
    { type: 'turnStart', turn: 1 },
    { type: 'move', side: 'player', moveId: 'a', hit: true },
    { type: 'move', side: 'player', moveId: 'a', hit: false },
    { type: 'damage', side: 'enemy', amount: 7, effectiveness: 100 },
    { type: 'damage', side: 'enemy', amount: 5, effectiveness: 100, source: 'scorch' },
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
  it('names burn damage in both languages', () => {
    const burn: BattleEvent = { type: 'damage', side: 'enemy', amount: 5, effectiveness: 100, source: 'scorch' };
    setLang('en');
    expect(eventLine(burn, ctx)).toBe('Theirs takes 5 burn damage.');
    setLang('es');
    expect(eventLine(burn, ctx)).toBe('Theirs sufre 5 de daño por quemadura.');
    setLang('en');
  });
  it('appends effectiveness messages', () => {
    const very = eventLine({ type: 'damage', side: 'enemy', amount: 9, effectiveness: 200 }, ctx)!;
    const not = eventLine({ type: 'damage', side: 'enemy', amount: 2, effectiveness: 50 }, ctx)!;
    expect(very.endsWith(STRINGS.en['effect.very'])).toBe(true);
    expect(not.endsWith(STRINGS.en['effect.not'])).toBe(true);
    expect(eventLine(events[3]!, ctx)).not.toMatch(/effective/);
  });
});

describe('run strings', () => {
  const nodeTypes: NodeType[] = ['wild', 'elite', 'shrine', 'cache', 'mystery', 'boss'];
  const nodeKey = (n: NodeType) => `node.${n}` as StringKey;
  const buttonKeys: StringKey[] = [
    'title.newRun',
    'title.continue',
    'title.discard',
    'title.discardCancel',
    'map.abandon',
    'map.abandonYes',
    'map.abandonNo',
    'node.action.fight',
    'node.action.enter',
    'event.recruit.take',
    'event.recruit.replace',
    'event.recruit.decline',
    'event.shrine.rest',
    'event.shrine.evolve',
    'event.shrine.leave',
    'event.cache.open',
    'event.mystery.open',
    'event.mystery.leave',
    'end.newRun',
    'save.dismiss',
  ];
  const labelKeys: StringKey[] = [
    ...nodeTypes.map(nodeKey),
    'zone.0',
    'zone.1',
    'zone.2',
    'map.available',
    'map.cleared',
    'map.locked',
    'map.current',
    ...buttonKeys,
  ];
  it('has the title, map, event, end and save keys', () => {
    for (const k of ['title.savesNote', 'title.corrupt', 'save.failed', 'map.step', 'end.canRestart', 'map.partyMember'] as const) {
      expect(STRINGS.en[k]).toBeTruthy();
    }
    expect(STRINGS.en['save.failed']).toBe('Could not save your run: {reason}. You can keep playing.');
    expect(t('map.step', { n: 3 })).toBe('Step 3');
  });
  it('labels every node type in both languages', () => {
    for (const lang of ['en', 'es'] as const) {
      setLang(lang);
      for (const n of nodeTypes) expect(nodeTypeLabel(n), `${lang} ${n}`).toBe(STRINGS[lang][nodeKey(n)]);
    }
    setLang('en');
    expect(nodeTypeLabel('boss')).toBe('Boss');
    setLang('es');
    expect(nodeTypeLabel('boss')).toBe('Jefe');
  });
  it('keeps labels, zone names and button texts at 28 characters or fewer in both languages', () => {
    for (const lang of ['en', 'es'] as const) {
      for (const k of labelKeys) expect(STRINGS[lang][k].length, `${lang}.${k}`).toBeLessThanOrEqual(28);
    }
  });
  it('has device wording of the save notes for the mobile app, without "browser"', () => {
    for (const lang of ['en', 'es'] as const) {
      for (const k of ['title.savesNoteDevice', 'title.savesUnavailableDevice', 'run.placeholder'] as const) {
        expect(STRINGS[lang][k], `${lang}.${k}`).toBeTruthy();
        expect(STRINGS[lang][k], `${lang}.${k}`).not.toMatch(/browser|navegador/i);
      }
    }
    expect(STRINGS.en['title.savesNoteDevice']).toMatch(/this device/);
    expect(STRINGS.es['title.savesNoteDevice']).toMatch(/este dispositivo/);
    // The web wording stays as it was.
    expect(STRINGS.en['title.savesNote']).toMatch(/browser/);
  });
  it('has three distinct zone names per language', () => {
    for (const lang of ['en', 'es'] as const) {
      expect(new Set(([0, 1, 2] as const).map((n) => STRINGS[lang][`zone.${n}`])).size).toBe(3);
    }
  });
});

describe('runEventLine', () => {
  const names: Record<string, string> = { cindermite: 'Cindermite', cindermaw: 'Cindermaw', skirrow: 'Skirrow' };
  const ctx = {
    species: (id: string) => names[id] ?? id,
    node: (id: string) => (id === 'z0-l0-c0' ? 'Wild creature' : null),
  };
  const all: RunEvent[] = [
    { type: 'enter', nodeId: 'z0-l0-c0', nodeType: 'wild' },
    { type: 'enter', nodeId: 'z0-l1-c9', nodeType: 'shrine' },
    { type: 'soul', amount: 1, reason: 'fallen' },
    { type: 'soul', amount: 1, reason: 'elite' },
    { type: 'soul', amount: 2, reason: 'boss' },
    { type: 'soul', amount: 2, reason: 'cache' },
    { type: 'soul', amount: 3, reason: 'mystery' },
    { type: 'lost', speciesId: 'cindermite' },
    { type: 'recruited', speciesId: 'skirrow' },
    { type: 'recruited', speciesId: 'skirrow', replaced: 'cindermite' },
    { type: 'declined', speciesId: 'skirrow' },
    { type: 'evolved', from: 'cindermite', to: 'cindermaw' },
    { type: 'healed', memberIndex: 0, amount: 12 },
    { type: 'hurt', memberIndex: 1, amount: 8 },
    { type: 'zoneCleared', zone: 0 },
    { type: 'zoneCleared', zone: 7 },
    { type: 'ended', result: 'won' },
    { type: 'ended', result: 'lost' },
  ];
  it('returns a clean, non-empty line for every run event in both languages', () => {
    for (const lang of ['en', 'es'] as const) {
      setLang(lang);
      for (const e of all) {
        const line = runEventLine(e, ctx);
        expect(line, `${lang} ${e.type}`).toBeTruthy();
        expect(line).not.toMatch(/\{\w+\}/);
      }
    }
  });
  it('returns null for battle and rejected events', () => {
    expect(runEventLine({ type: 'battle', event: { type: 'turnStart', turn: 1 } }, ctx)).toBeNull();
    expect(runEventLine({ type: 'rejected', reason: 'phase' }, ctx)).toBeNull();
  });
  it('pins the English text of literal cases', () => {
    setLang('en');
    expect(runEventLine({ type: 'lost', speciesId: 'cindermite' }, ctx)).toBe('Cindermite is lost.');
    expect(runEventLine({ type: 'evolved', from: 'cindermite', to: 'cindermaw' }, ctx)).toBe(
      'Cindermite evolves into Cindermaw!',
    );
    expect(runEventLine({ type: 'soul', amount: 1, reason: 'fallen' }, ctx)).toBe('Souls +1: a creature fell.');
    expect(runEventLine(all[0]!, ctx)).toBe('You head to: Wild creature.');
  });
  it('falls back to the node type label when the node is unknown', () => {
    setLang('en');
    expect(runEventLine(all[1]!, ctx)).toBe('You head to: Shrine.');
  });
  it('pins a Spanish line', () => {
    setLang('es');
    expect(runEventLine({ type: 'lost', speciesId: 'cindermite' }, ctx)).toBe('Pierdes a Cindermite.');
  });
});

describe('map.nodeLabel', () => {
  it('has the exact "label: state" shape for every node type and state in both languages', () => {
    const types: NodeType[] = ['wild', 'elite', 'shrine', 'cache', 'mystery', 'boss'];
    const states = ['available', 'cleared', 'locked'] as const;
    for (const lang of ['en', 'es'] as const) {
      setLang(lang);
      for (const type of types) {
        for (const state of states) {
          const label = nodeTypeLabel(type);
          const stateText = t(`map.${state}`);
          expect(t('map.nodeLabel', { label, state: stateText }), `${lang} ${type} ${state}`).toBe(`${label}: ${stateText}`);
        }
      }
    }
  });
});
