import type { MoveDef, SpeciesDef } from '../content';
import type { BattleEvent, Side } from '../sim/state';
import { STRINGS, type Lang, type StringKey } from './strings';

export type { Lang, StringKey } from './strings';
export { STRINGS } from './strings';

const STORAGE_KEY = 'webgames.lang';

export function detectLang(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'en' || saved === 'es') return saved;
  } catch {
    // storage unavailable: fall through to the browser language
  }
  try {
    if (typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('es')) return 'es';
  } catch {
    // ignore
  }
  return 'en';
}

let current: Lang = detectLang();

export function getLang(): Lang {
  return current;
}

export function setLang(lang: Lang): void {
  current = lang;
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // storage unavailable or full: the choice just won't persist
  }
  try {
    document.documentElement.lang = lang;
  } catch {
    // no document (tests, workers)
  }
}

export function t(key: StringKey, params?: Record<string, string | number>): string {
  const template = STRINGS[current][key];
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (whole, name: string) => (name in params ? String(params[name]) : whole));
}

export function moveName(move: MoveDef): string {
  return move.names[current];
}

export function speciesName(s: SpeciesDef): string {
  return s.names[current];
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
