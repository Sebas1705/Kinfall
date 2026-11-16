import type { MoveDef } from './schema';

export const MOVES: MoveDef[] = [
  { id: 'ember_lash', names: { en: 'Ember Lash', es: 'Latigazo de Brasa' }, element: 'ember', kind: 'damage', power: 40, focusCost: 0, accuracy: 100, target: 'enemy' },
  { id: 'cinder_burst', names: { en: 'Cinder Burst', es: 'Estallido de Ceniza' }, element: 'ember', kind: 'damage', power: 55, focusCost: 1, accuracy: 90, target: 'enemy' },
  { id: 'bramble_whip', names: { en: 'Bramble Whip', es: 'Azote de Zarza' }, element: 'thorn', kind: 'damage', power: 40, focusCost: 0, accuracy: 100, target: 'enemy' },
  { id: 'thorn_volley', names: { en: 'Thorn Volley', es: 'Salva de Espinas' }, element: 'thorn', kind: 'damage', power: 55, focusCost: 1, accuracy: 90, target: 'enemy' },
  { id: 'brine_jet', names: { en: 'Brine Jet', es: 'Chorro Salobre' }, element: 'tide', kind: 'damage', power: 40, focusCost: 0, accuracy: 100, target: 'enemy' },
  { id: 'undertow', names: { en: 'Undertow', es: 'Resaca' }, element: 'tide', kind: 'damage', power: 55, focusCost: 1, accuracy: 90, target: 'enemy' },
  { id: 'gust_slice', names: { en: 'Gust Slice', es: 'Corte de Ráfaga' }, element: 'gale', kind: 'damage', power: 40, focusCost: 0, accuracy: 100, target: 'enemy' },
  { id: 'squall_crash', names: { en: 'Squall Crash', es: 'Embate de Chubasco' }, element: 'gale', kind: 'damage', power: 55, focusCost: 1, accuracy: 90, target: 'enemy' },
  { id: 'dusk_claw', names: { en: 'Dusk Claw', es: 'Garra del Ocaso' }, element: 'umbra', kind: 'damage', power: 45, focusCost: 0, accuracy: 100, target: 'enemy' },
  { id: 'mending_moss', names: { en: 'Mending Moss', es: 'Musgo Sanador' }, element: 'thorn', kind: 'heal', power: 30, focusCost: 1, accuracy: 100, target: 'self' },
  { id: 'smoulder_hex', names: { en: 'Smoulder Hex', es: 'Maleficio de Rescoldo' }, element: 'ember', kind: 'status', power: 0, focusCost: 1, accuracy: 85, status: 'scorch', target: 'enemy' },
  { id: 'static_hush', names: { en: 'Static Hush', es: 'Silencio Estático' }, element: 'gale', kind: 'status', power: 0, focusCost: 1, accuracy: 80, status: 'stun', target: 'enemy' },
];
