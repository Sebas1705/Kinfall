import type { Content } from '../../content';
import { createRng } from '../rng';
import type { TeamSpec } from '../state';
import type { MapNode, RunState } from './types';

/** Layers per zone, used to turn (zone, layer) into a global depth. */
const LAYERS_PER_ZONE = 7;

export interface Encounter {
  /** Battle seed: `${run.seed}:${node.id}`. */
  seed: string;
  enemy: TeamSpec;
  telegraph: boolean;
  script?: number[];
}

/** Enemy max-HP scaling for a normal (wild) encounter at global depth g. */
function basePercent(node: MapNode): number {
  return 100 + 8 * (node.zone * LAYERS_PER_ZONE + node.layer);
}

function pool(ids: string[] | undefined, label: string): string[] {
  if (!ids || ids.length === 0) throw new Error(`${label} pool is empty`);
  return ids;
}

/**
 * The fight behind a combat node. Depends only on `run.seed` and the node
 * (never on `run.rng` or the path taken), so a node always holds the same encounter.
 */
export function buildEncounter(run: RunState, node: MapNode, content: Content): Encounter {
  const rng = createRng(run.seed).fork('node:' + node.id);
  const seed = `${run.seed}:${node.id}`;
  const zone = content.zones[node.zone];

  if (node.type === 'wild') {
    const wild = pool(zone?.wild, `zone ${node.zone} wild`);
    return {
      seed,
      enemy: { speciesIds: [wild[rng.nextInt(wild.length)]!], hpPercent: basePercent(node) },
      telegraph: false,
    };
  }

  if (node.type === 'elite') {
    const elite = pool(zone?.elite, `zone ${node.zone} elite`);
    const first = elite[rng.nextInt(elite.length)]!;
    const rest = elite.filter((id) => id !== first);
    const second = rest.length > 0 ? rest[rng.nextInt(rest.length)]! : first;
    return {
      seed,
      enemy: { speciesIds: [first, second], hpPercent: Math.floor((130 * basePercent(node)) / 100) },
      telegraph: true,
    };
  }

  if (node.type === 'boss') {
    const boss = content.bosses.find((b) => b.zone === node.zone);
    if (!boss) throw new Error(`no boss for zone ${node.zone}`);
    return {
      seed,
      enemy: { speciesIds: [boss.speciesId], hpPercent: boss.hpPercent },
      telegraph: true,
      script: [...boss.script],
    };
  }

  throw new Error(`node ${node.id} (${node.type}) has no encounter`);
}
