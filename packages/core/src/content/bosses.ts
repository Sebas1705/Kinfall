import type { BossDef } from './schema';

/**
 * One boss per zone. `script` indexes the species' own `moves` and repeats:
 * weak, weak, setup or status, then the strongest damage move last.
 */
export const BOSSES: BossDef[] = [
  {
    id: 'boss_ashen_tyrant',
    zone: 0,
    speciesId: 'cindermaw',
    names: { en: 'Ashen Tyrant', es: 'Tirano Cinéreo' },
    hpPercent: 220,
    // ember_lash, dusk_claw, smoulder_hex, cinder_burst
    script: [0, 1, 2, 3],
  },
  {
    id: 'boss_thorn_sovereign',
    zone: 1,
    speciesId: 'bramblewarden',
    names: { en: 'Thorn Sovereign', es: 'Soberano de Espinas' },
    hpPercent: 260,
    // bramble_whip, brine_jet, mending_moss, thorn_volley
    script: [0, 1, 2, 3],
  },
  {
    id: 'boss_veil_of_embers',
    zone: 2,
    speciesId: 'emberveil',
    names: { en: 'Veil of Embers', es: 'Velo de Brasas' },
    hpPercent: 320,
    // ember_lash, dusk_claw, smoulder_hex, cinder_burst
    script: [0, 2, 3, 1],
  },
];
