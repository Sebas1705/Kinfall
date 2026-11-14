import type { SpeciesDef } from './schema';

export const SPECIES: SpeciesDef[] = [
  {
    id: 'cindermite',
    names: { en: 'Cindermite', es: 'Cenizón' },
    elements: ['ember'],
    base: { health: 48, power: 44, guard: 30, speed: 40, focus: 34 },
    moves: ['ember_lash', 'cinder_burst', 'smoulder_hex', 'dusk_claw'],
    art: { body: 'blob', limbs: 4, pattern: 'spots', eyes: 2, key: 'cindermite' },
  },
  {
    id: 'brambleback',
    names: { en: 'Brambleback', es: 'Zarzalomo' },
    elements: ['thorn'],
    base: { health: 56, power: 38, guard: 52, speed: 24, focus: 30 },
    moves: ['bramble_whip', 'thorn_volley', 'mending_moss', 'brine_jet'],
    art: { body: 'wide', limbs: 4, pattern: 'stripes', eyes: 2, key: 'brambleback' },
  },
  {
    id: 'tidewisp',
    names: { en: 'Tidewisp', es: 'Marejilla' },
    elements: ['tide'],
    base: { health: 44, power: 42, guard: 34, speed: 46, focus: 50 },
    moves: ['brine_jet', 'undertow', 'mending_moss', 'static_hush'],
    art: { body: 'serpent', limbs: 0, pattern: 'plain', eyes: 1, key: 'tidewisp' },
  },
  {
    id: 'skirrow',
    names: { en: 'Skirrow', es: 'Rafaguito' },
    elements: ['gale'],
    base: { health: 36, power: 40, guard: 24, speed: 60, focus: 44 },
    moves: ['gust_slice', 'squall_crash', 'static_hush', 'ember_lash'],
    art: { body: 'tall', limbs: 2, pattern: 'plain', eyes: 3, key: 'skirrow' },
  },
  {
    id: 'dusklurk',
    names: { en: 'Dusklurk', es: 'Penumbrín' },
    elements: ['umbra'],
    base: { health: 42, power: 54, guard: 28, speed: 50, focus: 38 },
    moves: ['dusk_claw', 'bramble_whip', 'smoulder_hex', 'undertow'],
    art: { body: 'tall', limbs: 3, pattern: 'stripes', eyes: 1, key: 'dusklurk' },
  },
  {
    id: 'emberveil',
    names: { en: 'Emberveil', es: 'Brasavelo' },
    elements: ['ember', 'umbra'],
    base: { health: 50, power: 52, guard: 36, speed: 42, focus: 40 },
    moves: ['ember_lash', 'cinder_burst', 'dusk_claw', 'smoulder_hex'],
    art: { body: 'blob', limbs: 1, pattern: 'plain', eyes: 3, key: 'emberveil' },
  },
];
