import type { Content } from '../../content';
import { applyAction, createBattle, legalActions } from '../battle';
import { clone } from '../clone';
import { createRng } from '../rng';
import type { Action } from '../state';
import { buildEncounter } from './encounters';
import { applyCache, applyEvolve, applyMystery, applyRecruit, applyShrine, legalEventActions } from './events';
import { findNode as findInMap, generateZoneMap } from './map';
import { maxHpOf } from './party';
import { resolveBattle } from './resolve';
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

export { maxHpOf };

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
  return findInMap(run.maps[run.zone], id);
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
  return legalEventActions(run, content);
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
  const events: RunEvent[] = result.events.map((event) => ({ type: 'battle', event }));
  if (result.state.winner !== null) {
    const resolved = resolveBattle(run, phase.nodeId, result.state, content);
    return { run: resolved.run, events: [...events, ...resolved.events] };
  }
  run.phase = { kind: 'battle', nodeId: phase.nodeId, battle: result.state };
  return { run, events };
}

/**
 * The single entry point of the run state machine. Pure: the input is cloned
 * and never mutated. Never throws for a malformed action: it is rejected with
 * the state unchanged.
 */
export function applyRunAction(run: RunState, action: RunAction, content: Content): RunStep {
  const next = clone(run);
  if (next.phase.kind === 'ended') return reject(next, 'ended');

  const raw: unknown = action;
  if (!isObject(raw)) return reject(next, 'illegal');
  const wanted = actionPhase(raw['type']);
  if (wanted === undefined) return reject(next, 'illegal');
  if (wanted !== next.phase.kind) return reject(next, 'phase');

  if (raw['type'] === 'node') return enterNode(next, raw['nodeId'], content);
  if (raw['type'] === 'battle') return battleStep(next, raw['action'], content);
  switch (action.type) {
    case 'recruit':
      return applyRecruit(next, action, content);
    case 'shrine':
      return applyShrine(next, action, content);
    case 'evolve':
      return applyEvolve(next, action, content);
    case 'cache':
      return applyCache(next, action, content);
    case 'mystery':
      return applyMystery(next, action, content);
    default:
      return reject(next, 'illegal');
  }
}
