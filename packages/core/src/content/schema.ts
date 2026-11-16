export type ElementId = 'ember' | 'thorn' | 'tide' | 'gale' | 'umbra';
export type StatusId = 'scorch' | 'stun';

export interface Stats {
  health: number;
  power: number;
  guard: number;
  speed: number;
  focus: number;
}

export interface ArtParams {
  body: 'blob' | 'tall' | 'wide' | 'serpent';
  limbs: 0 | 1 | 2 | 3 | 4;
  pattern: 'plain' | 'stripes' | 'spots';
  eyes: 1 | 2 | 3;
  key: string;
}

export interface SpeciesDef {
  id: string;
  names: { en: string; es: string };
  elements: [ElementId] | [ElementId, ElementId];
  base: Stats;
  moves: string[];
  art: ArtParams;
  /** Species this one evolves into; evolved forms have none. */
  evolvesTo?: string;
  /** Evolution cost in run currency; required (>= 1) when `evolvesTo` is set. */
  evolveCost?: number;
}

export interface MoveDef {
  id: string;
  names: { en: string; es: string };
  element: ElementId;
  kind: 'damage' | 'heal' | 'status';
  power: number;
  focusCost: number;
  accuracy: number;
  status?: StatusId;
  target: 'enemy' | 'self';
}

export interface BossDef {
  id: string;
  zone: number;
  speciesId: string;
  names: { en: string; es: string };
  /** Boss health as a percentage of the species' normal health (100..500). */
  hpPercent: number;
  /** Repeating cycle of indices into the species' own `moves`. */
  script: number[];
}

export interface ZoneDef {
  wild: string[];
  elite: string[];
}

export interface Content {
  species: SpeciesDef[];
  moves: MoveDef[];
  zones: ZoneDef[];
  bosses: BossDef[];
  starters: string[];
}
