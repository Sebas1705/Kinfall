import type { Content } from '../../content';
import { lookup } from '../../content/lookup';
import { applyAction, createBattle, legalActions } from '../battle';
import { createRng } from '../rng';
import type { Action } from '../state';
import { buildEncounter } from './encounters';
import { generateZoneMap } from './map';
import type { MapNode, RunAction, RunEvent, RunPhase, RunState, RunStep } from './types';

const ZONES = 3;

/** Which phase each run action type belongs to. */
const ACTION_PHASE: Record<RunAction['type'], RunPhase['kind']> = {
  node: 'map',
  battle: 'battle',
  recruit: 'recruit',
  shrine: 'shrine',
  evolve: 'shrine',
  cache: 'cache',
  mystery: 'mystery',
};

/** A party member's max HP: the player side never scales (hpPercent 100). */
export function maxHpOf(speciesId: string, content: Content): number {
  return lookup(content).species(speciesId).base.health * 4;
}

export function startRun(seed: string, starterId: string, content: Content): RunState {
  if (!content.starters.includes(starterId)) {
    throw new Error(`unknown starter: ${starterId} (expected one of ${content.starters.join(', ')})`);
  }
  const maps = [];
  for (let z = 0; z < ZONES; z++) maps.push(generateZoneMap(seed, z));
  return {
    version: 1,
    seed,
    rng: createRng(seed).fork('run').getState(),
    maps,
    zone: 0,
    at: null,
    party: [{ speciesId: starterId, hp: maxHpOf(starterId, content) }],
    souls: 0,
    stats: { nodesCleared: 0, elitesBeaten: 0, bossesBeaten: 0, creaturesLost: 0 },
    phase: { kind: 'map' },
  };
}

function findNode(run: RunState, id: string): MapNode | undefined {
  const map = run.maps[run.zone];
  if (!map) return undefined;
  for (const layer of map.layers) for (const node of layer) if (node.id === id) return node;
  return undefined;
}

/** Nodes the player may enter next, in column order; empty outside the map phase. */
export function availableNodes(run: RunState): MapNode[] {
  if (run.phase.kind !== 'map') return [];
  const map = run.maps[run.zone];
  if (!map) return [];
  if (run.at === null) return [...(map.layers[0] ?? [])];
  const from = findNode(run, run.at);
  if (!from) return [];
  const out: MapNode[] = [];
  for (const id of from.next) {
    const n = findNode(run, id);
    if (n) out.push(n);
  }
  return out;
}

export function legalRunActions(run: RunState, content: Content): RunAction[] {
  const phase = run.phase;
  if (phase.kind === 'map') return availableNodes(run).map((n) => ({ type: 'node', nodeId: n.id }));
  if (phase.kind === 'battle') return legalActions(phase.battle, content).map((action) => ({ type: 'battle', action }));
  return [];
}

function reject(run: RunState, reason: 'illegal' | 'phase' | 'ended'): RunStep {
  return { run, events: [{ type: 'rejected', reason }] };
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function actionPhase(type: unknown): RunPhase['kind'] | undefined {
  return typeof type === 'string' && Object.prototype.hasOwnProperty.call(ACTION_PHASE, type)
    ? ACTION_PHASE[type as RunAction['type']]
    : undefined;
}

function enterNode(run: RunState, nodeId: unknown, content: Content): RunStep {
  if (typeof nodeId !== 'string') return reject(run, 'illegal');
  const node = availableNodes(run).find((n) => n.id === nodeId);
  if (!node) return reject(run, 'illegal');
  const events: RunEvent[] = [{ type: 'enter', nodeId: node.id, nodeType: node.type }];

  if (node.type === 'wild' || node.type === 'elite' || node.type === 'boss') {
    const encounter = buildEncounter(run, node, content);
    const battle = createBattle(
      encounter.seed,
      { speciesIds: run.party.map((m) => m.speciesId), hp: run.party.map((m) => m.hp) },
      encounter.enemy,
      content,
      { telegraph: encounter.telegraph, ...(encounter.script ? { script: encounter.script } : {}) },
    );
    run.phase = { kind: 'battle', nodeId: node.id, battle };
  } else {
    run.phase = { kind: node.type, nodeId: node.id };
  }
  return { run, events };
}

function battleStep(run: RunState, action: unknown, content: Content): RunStep {
  if (run.phase.kind !== 'battle' || !isObject(action)) return reject(run, 'illegal');
  const phase = run.phase;
  const result = applyAction(phase.battle, action as Action, content);
  if (result.events.some((e) => e.type === 'rejected')) return reject(run, 'illegal');
  run.phase = { kind: 'battle', nodeId: phase.nodeId, battle: result.state };
  return { run, events: result.events.map((event) => ({ type: 'battle', event })) };
}

/**
 * The single entry point of the run state machine. Pure: the input is cloned
 * and never mutated. Never throws for a malformed action: it is rejected with
 * the state unchanged.
 */
export function applyRunAction(run: RunState, action: RunAction, content: Content): RunStep {
  const next = structuredClone(run);
  if (next.phase.kind === 'ended') return reject(next, 'ended');

  const raw: unknown = action;
  if (!isObject(raw)) return reject(next, 'illegal');
  const wanted = actionPhase(raw['type']);
  if (wanted === undefined) return reject(next, 'illegal');
  if (wanted !== next.phase.kind) return reject(next, 'phase');

  if (raw['type'] === 'node') return enterNode(next, raw['nodeId'], content);
  if (raw['type'] === 'battle') return battleStep(next, raw['action'], content);
  // Recruit, shrine, evolve, cache and mystery handling arrives with node resolution.
  return reject(next, 'illegal');
}
