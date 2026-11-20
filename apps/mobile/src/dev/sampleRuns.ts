// Dev and test aid: valid runs standing on each event, on both endings and on a battle in the later
// zones (to check each zone's battle scene), so QA (the dev tools'
// "Save sample run" buttons) and the screen tests can open those screens without playing up to
// them. Every sample passes core's full save validation (validateRun), so it loads like a real save.
// Nothing here changes game content or the engine: the samples are built from a seed's own maps.
import type { Content } from '@kinfall/core/content';
import { findNode } from '@kinfall/core/sim/run/map';
import { buildEncounter } from '@kinfall/core/sim/run/encounters';
import { applyRunAction, maxHpOf, startRun } from '@kinfall/core/sim/run/run';
import type { MapNode, NodeType, RunState } from '@kinfall/core/sim/run/types';

export const SAMPLE_KINDS = ['recruit', 'recruitFull', 'shrine', 'shrinePoor', 'cache', 'mystery', 'won', 'lost', 'battleZone2', 'battleZone3'] as const;
export type SampleKind = (typeof SAMPLE_KINDS)[number];

/** Seeds tried in order until one has the wanted node right after step 1. */
const SEED_TRIES = 500;

/** A fresh run of the first seed (SAMPLE0, SAMPLE1, ...) whose step-1 node `at` leads to a `type` node. */
function standBefore(type: NodeType, content: Content): { run: RunState; at: MapNode; node: MapNode } {
  const starter = content.starters[0]!;
  for (let i = 0; i < SEED_TRIES; i++) {
    const run = startRun(`SAMPLE${i}`, starter, content);
    const map = run.maps[0]!;
    for (const at of map.layers[0]!) {
      for (const id of at.next) {
        const node = findNode(map, id);
        if (node?.type === type) return { run, at, node };
      }
    }
  }
  throw new Error(`no sample seed has a ${type} node at step 2`);
}

function eventRun(kind: 'shrine' | 'cache' | 'mystery', content: Content, souls: number): RunState {
  const { run, at, node } = standBefore(kind, content);
  return { ...run, at: at.id, souls, stats: { ...run.stats, nodesCleared: 1 }, phase: { kind, nodeId: node.id } };
}

function recruitRun(content: Content, full: boolean): RunState {
  const starter = content.starters[0]!;
  for (let i = 0; i < SEED_TRIES; i++) {
    const fresh = startRun(`SAMPLE${i}`, starter, content);
    const at = fresh.maps[0]!.layers[0]!.find((n) => n.type === 'wild');
    if (!at) continue;
    const party = full ? content.starters.map((id) => ({ speciesId: id, hp: maxHpOf(id, content) })) : fresh.party;
    const base: RunState = { ...fresh, at: at.id, party, stats: { ...fresh.stats, nodesCleared: 1 } };
    const speciesId = buildEncounter(base, at, content).enemy.speciesIds[0]!;
    const hp = Math.max(1, Math.floor(maxHpOf(speciesId, content) / 2));
    return { ...base, phase: { kind: 'recruit', speciesId, hp } };
  }
  throw new Error('no sample seed starts with a wild node');
}

function endedRun(content: Content, result: 'won' | 'lost'): RunState {
  const fresh = startRun('SAMPLE0', content.starters[0]!, content);
  if (result === 'won') {
    const zone = fresh.maps.length - 1;
    const map = fresh.maps[zone]!;
    const boss = map.layers[map.layers.length - 1]![0]!;
    const cleared = fresh.maps.reduce((n, m) => n + m.layers.length, 0);
    return {
      ...fresh,
      zone,
      at: boss.id,
      souls: 7,
      stats: { nodesCleared: cleared, elitesBeaten: 2, bossesBeaten: fresh.maps.length, creaturesLost: 1 },
      phase: { kind: 'ended', result: 'won' },
    };
  }
  // Lost in zone 2 on its third step, with every creature gone.
  const map = fresh.maps[1]!;
  const at = map.layers[2]![0]!;
  return {
    ...fresh,
    zone: 1,
    at: at.id,
    party: [],
    souls: 4,
    stats: { nodesCleared: fresh.maps[0]!.layers.length + 3, elitesBeaten: 1, bossesBeaten: 1, creaturesLost: 2 },
    phase: { kind: 'ended', result: 'lost' },
  };
}

/**
 * A run that just entered the first wild battle of zone `zone` (0-based), with the three starters at
 * full HP and the earlier zones counted as cleared.
 */
function battleRun(content: Content, zone: number): RunState {
  const fresh = startRun('SAMPLE0', content.starters[0]!, content);
  const before = fresh.maps.slice(0, zone);
  const run: RunState = {
    ...fresh,
    zone,
    at: null,
    party: content.starters.map((id) => ({ speciesId: id, hp: maxHpOf(id, content) })),
    souls: 3,
    stats: { ...fresh.stats, nodesCleared: before.reduce((n, m) => n + m.layers.length, 0), bossesBeaten: zone },
  };
  const layer = run.maps[zone]!.layers[0]!;
  const node = layer.find((n) => n.type === 'wild') ?? layer[0]!;
  return applyRunAction(run, { type: 'node', nodeId: node.id }, content).run;
}

/**
 * A valid run for `kind`: a recruit offer (with room, or with a full party), a shrine with enough
 * souls to evolve (or none), a cache, a mystery, a won or lost end, or a battle in zone 2 or 3.
 */
export function sampleRun(kind: SampleKind, content: Content): RunState {
  switch (kind) {
    case 'recruit':
      return recruitRun(content, false);
    case 'recruitFull':
      return recruitRun(content, true);
    case 'shrine':
      return eventRun('shrine', content, 5);
    case 'shrinePoor':
      return eventRun('shrine', content, 0);
    case 'cache':
      return eventRun('cache', content, 0);
    case 'mystery':
      return eventRun('mystery', content, 0);
    case 'won':
      return endedRun(content, 'won');
    case 'lost':
      return endedRun(content, 'lost');
    case 'battleZone2':
      return battleRun(content, 1);
    case 'battleZone3':
      return battleRun(content, 2);
  }
}
