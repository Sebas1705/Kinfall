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

export interface Content {
  species: SpeciesDef[];
  moves: MoveDef[];
}
