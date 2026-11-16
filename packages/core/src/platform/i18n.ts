import type { MoveDef, SpeciesDef } from '../content';
import type { NodeType, RunEvent } from '../sim/run/types';
import type { BattleEvent, Side } from '../sim/state';
import { STRINGS, type Lang, type StringKey } from './strings';

export type { Lang, StringKey } from './strings';
export { STRINGS } from './strings';

/** Storage key of the saved language choice. */
export const LANG_STORAGE_KEY = 'webgames.lang';

/** Synchronous key-value storage for the language choice; failures are swallowed by the caller. */
export interface LangStorage {
  get(key: string): string | null;
  set(key: string, value: string): void;
}

/** Platform adapters; every one is optional and none is required to translate. */
export interface I18nOptions {
  /** Where the choice is saved; a valid saved value wins over `detect`. */
  storage?: LangStorage;
  /** The platform's preferred language (browser or device); English when absent or throwing. */
  detect?: () => Lang;
  /** Called after `setLang` changes the language (not on a no-op set), e.g. to update `<html lang>`. */
  onChange?: (lang: Lang) => void;
}

export interface I18n {
  getLang(): Lang;
  /** Saves the choice (storage failures are swallowed) and calls `onChange` when the language changed. */
  setLang(lang: Lang): void;
  t(key: StringKey, params?: Record<string, string | number>): string;
}

export function isLang(value: unknown): value is Lang {
  return value === 'en' || value === 'es';
}

function startLang({ storage, detect }: I18nOptions): Lang {
  try {
    const saved = storage?.get(LANG_STORAGE_KEY) ?? null;
    if (isLang(saved)) return saved;
  } catch {
    // storage unavailable: fall through to the platform language
  }
  try {
    const detected = detect?.();
    if (isLang(detected)) return detected;
  } catch {
    // detection failed: fall back to English
  }
  return 'en';
}

function translate(lang: Lang, key: StringKey, params?: Record<string, string | number>): string {
  const template = STRINGS[lang][key];
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (whole, name: string) => (name in params ? String(params[name]) : whole));
}

/** A language state bound to platform adapters. Never touches globals itself. */
export function createI18n(options: I18nOptions = {}): I18n {
  let current = startLang(options);
  return {
    getLang: () => current,
    setLang(lang: Lang): void {
      const changed = lang !== current;
      current = lang;
      try {
        options.storage?.set(LANG_STORAGE_KEY, lang);
      } catch {
        // storage unavailable or full: the choice just won't persist
      }
      if (changed) options.onChange?.(lang);
    },
    t: (key, params) => translate(current, key, params),
  };
}

// The shared instance every helper below reads. English and adapter-free until the app calls
// configureI18n at startup, before rendering any text.
let active: I18n = createI18n();

/** Replaces the shared instance with one bound to `options` and returns it. */
export function configureI18n(options: I18nOptions): I18n {
  active = createI18n(options);
  return active;
}

export function getLang(): Lang {
  return active.getLang();
}

export function setLang(lang: Lang): void {
  active.setLang(lang);
}

export function t(key: StringKey, params?: Record<string, string | number>): string {
  return active.t(key, params);
}

export function moveName(move: MoveDef): string {
  return move.names[active.getLang()];
}

export function speciesName(s: SpeciesDef): string {
  return s.names[active.getLang()];
}

export interface EventContext {
  species: (side: Side) => string;
  move: (id: string) => string;
}

/** Localised battle-log line for an event, or null when the event has no text. */
export function eventLine(event: BattleEvent, ctx: EventContext): string | null {
  switch (event.type) {
    case 'turnStart':
      return null;
    case 'move':
      return t(event.hit ? 'log.move' : 'log.miss', { species: ctx.species(event.side), move: ctx.move(event.moveId) });
    case 'damage': {
      if (event.source === 'scorch') return t('log.scorch', { species: ctx.species(event.side), amount: event.amount });
      const base = t('log.damage', { species: ctx.species(event.side), amount: event.amount });
      if (event.effectiveness >= 200) return `${base} ${t('effect.very')}`;
      if (event.effectiveness <= 50) return `${base} ${t('effect.not')}`;
      return base;
    }
    case 'heal':
      return t('log.heal', { species: ctx.species(event.side), amount: event.amount });
    case 'status':
      return t('log.status', { species: ctx.species(event.side), status: t(`status.${event.status}`) });
    case 'skip':
      return t('log.skip', { species: ctx.species(event.side) });
    case 'swap':
      return t('log.swap', { species: ctx.species(event.side) });
    case 'fainted':
      return t('log.fainted', { species: ctx.species(event.side) });
    case 'rejected':
      return t(`log.rejected.${event.reason}`);
    case 'end':
      return t(event.winner === 'player' ? 'log.end.win' : 'log.end.lose');
  }
}

export function nodeTypeLabel(type: NodeType): string {
  return t(`node.${type}`);
}

export interface RunEventContext {
  species: (id: string) => string;
  /** Localised label of a map node, or null when the id is unknown. */
  node: (id: string) => string | null;
}

/**
 * Localised run-log line for a run event, or null for events with no text of their own:
 * `battle` (the battle log renders those) and `rejected`. The switch is exhaustive.
 */
export function runEventLine(event: RunEvent, ctx: RunEventContext): string | null {
  switch (event.type) {
    case 'battle':
    case 'rejected':
      return null;
    case 'enter':
      return t('runlog.enter', { node: ctx.node(event.nodeId) ?? nodeTypeLabel(event.nodeType) });
    case 'soul':
      return t(`runlog.soul.${event.reason}`, { amount: event.amount });
    case 'lost':
      return t('runlog.lost', { species: ctx.species(event.speciesId) });
    case 'recruited':
      return event.replaced === undefined
        ? t('runlog.recruited', { species: ctx.species(event.speciesId) })
        : t('runlog.recruitedReplace', { species: ctx.species(event.speciesId), replaced: ctx.species(event.replaced) });
    case 'declined':
      return t('runlog.declined', { species: ctx.species(event.speciesId) });
    case 'evolved':
      return t('runlog.evolved', { from: ctx.species(event.from), to: ctx.species(event.to) });
    case 'healed':
      return t('runlog.healed', { n: event.memberIndex + 1, amount: event.amount });
    case 'hurt':
      return t('runlog.hurt', { n: event.memberIndex + 1, amount: event.amount });
    case 'zoneCleared': {
      const zone = event.zone >= 0 && event.zone <= 2 ? t(`zone.${event.zone as 0 | 1 | 2}`) : String(event.zone + 1);
      return t('runlog.zoneCleared', { zone });
    }
    case 'ended':
      return t(event.result === 'won' ? 'runlog.ended.won' : 'runlog.ended.lost');
    default: {
      const unreachable: never = event;
      return unreachable;
    }
  }
}
