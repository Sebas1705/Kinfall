import type { Content } from '../../content';
import { effectiveness } from '../../content';
import { lookup } from '../../content/lookup';
import { createRng } from '../rng';
import type { Rng } from '../rng';
import { maxHpOf } from './party';
import { applyRunAction, availableNodes, legalRunActions, startRun } from './run';
import type { NodeType, RunAction, RunState } from './types';

const NODE_ORDER: NodeType[] = ['shrine', 'cache', 'wild', 'mystery', 'elite', 'boss'];
const HEAL_BELOW_PERCENT = 35;
const REST_BELOW_PERCENT = 70;
/** Healing is skipped after this battle turn: two healing sides can otherwise stall a battle forever. */
const HEAL_UNTIL_TURN = 12;

function sameAction(a: RunAction, b: RunAction): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Picks one of `items` (non-empty) with the rng, drawing only when there is a real tie. */
function tieBreak<T>(items: T[], rng: Rng): T {
  return items.length === 1 ? items[0]! : items[rng.nextInt(items.length)]!;
}

function pickNode(run: RunState, rng: Rng): RunAction | undefined {
  const nodes = availableNodes(run);
  for (const type of NODE_ORDER) {
    const ofType = nodes.filter((n) => n.type === type);
    if (ofType.length > 0) return { type: 'node', nodeId: tieBreak(ofType, rng).id };
  }
  return undefined;
}

function pickBattle(run: RunState, content: Content, rng: Rng, legal: RunAction[]): RunAction | undefined {
  if (run.phase.kind !== 'battle') return undefined;
  const battle = run.phase.battle;
  const l = lookup(content);
  const me = battle.teams.player[battle.active.player];
  const foe = battle.teams.enemy[battle.active.enemy];
  const swaps = legal.filter((a) => a.type === 'battle' && a.action.type === 'swap');
  const moves = legal.filter((a) => a.type === 'battle' && a.action.type === 'move');
  if (!me || me.fainted || moves.length === 0) {
    if (swaps.length === 0) return undefined;
    // Healthiest living member by hp fraction (cross-multiplied, integers only).
    let best: RunAction[] = [];
    let bestMember: { hp: number; maxHp: number } | undefined;
    for (const a of swaps) {
      if (a.type !== 'battle' || a.action.type !== 'swap') continue;
      const m = battle.teams.player[a.action.toIndex]!;
      const cmp = bestMember ? m.hp * bestMember.maxHp - bestMember.hp * m.maxHp : 1;
      if (cmp > 0) {
        best = [a];
        bestMember = m;
      } else if (cmp === 0) best.push(a);
    }
    return tieBreak(best, rng);
  }
  const mySp = l.species(me.speciesId);
  if (battle.turn <= HEAL_UNTIL_TURN && me.hp * 100 < me.maxHp * HEAL_BELOW_PERCENT) {
    const heals = moves.filter(
      (a) => a.type === 'battle' && a.action.type === 'move' && l.move(mySp.moves[a.action.moveIndex]!).kind === 'heal',
    );
    if (heals.length > 0) return heals[0];
  }
  const foeSp = foe ? l.species(foe.speciesId) : undefined;
  let bestScore = -1;
  let tied: RunAction[] = [];
  for (const a of moves) {
    if (a.type !== 'battle' || a.action.type !== 'move') continue;
    const def = l.move(mySp.moves[a.action.moveIndex]!);
    const score = def.kind === 'damage' && foeSp ? def.power * effectiveness(def.element, foeSp.elements) : 0;
    if (score > bestScore) {
      bestScore = score;
      tied = [a];
    } else if (score === bestScore) tied.push(a);
  }
  return tied.length > 0 ? tieBreak(tied, rng) : undefined;
}

function pickRecruit(run: RunState, content: Content, rng: Rng): RunAction | undefined {
  if (run.phase.kind !== 'recruit') return undefined;
  if (run.party.length < 3) return { type: 'recruit', take: true };
  const offered = run.phase.speciesId;
  if (run.party.some((m) => m.speciesId === offered)) return { type: 'recruit', take: false };
  // Replace the lowest-HP member (by hp fraction, cross-multiplied).
  let worst: number[] = [];
  let worstHp = 0;
  let worstMax = 1;
  run.party.forEach((m, i) => {
    const max = maxHpOf(m.speciesId, content);
    const cmp = worst.length === 0 ? -1 : m.hp * worstMax - worstHp * max;
    if (cmp < 0) {
      worst = [i];
      worstHp = m.hp;
      worstMax = max;
    } else if (cmp === 0) worst.push(i);
  });
  return { type: 'recruit', take: true, replaceIndex: tieBreak(worst, rng) };
}

function pickEvent(run: RunState, content: Content, legal: RunAction[]): RunAction | undefined {
  switch (run.phase.kind) {
    case 'shrine': {
      const evolve = legal.find((a) => a.type === 'evolve');
      if (evolve) return evolve;
      const hurt = run.party.some((m) => m.hp * 100 < maxHpOf(m.speciesId, content) * REST_BELOW_PERCENT);
      return { type: 'shrine', choice: hurt ? 'rest' : 'leave' };
    }
    case 'cache':
      return { type: 'cache' };
    case 'mystery':
      return { type: 'mystery', choice: 'open' };
    default:
      return undefined;
  }
}

/**
 * A simple heuristic player. Always returns a legal action (a random legal one when the heuristic
 * target is not legal); the rng is only used to break ties. Throws when there is nothing to play
 * (an ended run).
 */
export function chooseBotAction(run: RunState, content: Content, rng: Rng): RunAction {
  const legal = legalRunActions(run, content);
  if (legal.length === 0) throw new Error(`no legal action in phase ${run.phase.kind}`);
  let wanted: RunAction | undefined;
  switch (run.phase.kind) {
    case 'map':
      wanted = pickNode(run, rng);
      break;
    case 'battle':
      wanted = pickBattle(run, content, rng, legal);
      break;
    case 'recruit':
      wanted = pickRecruit(run, content, rng);
      break;
    default:
      wanted = pickEvent(run, content, legal);
  }
  if (wanted && legal.some((a) => sameAction(a, wanted))) return wanted;
  return tieBreak(legal, rng);
}

/** Plays a whole run with the bot; throws a descriptive error when `maxSteps` is exceeded. */
export function simulateRun(
  seed: string,
  starterId: string,
  content: Content,
  options?: { maxSteps?: number },
): { run: RunState; actions: RunAction[] } {
  const maxSteps = options?.maxSteps ?? 3000;
  const rng = createRng(seed).fork('bot');
  let run = startRun(seed, starterId, content);
  const actions: RunAction[] = [];
  while (run.phase.kind !== 'ended') {
    if (actions.length >= maxSteps) {
      throw new Error(
        `simulateRun exceeded ${maxSteps} steps (seed ${seed}, starter ${starterId}, phase ${run.phase.kind}, zone ${run.zone})`,
      );
    }
    const action = chooseBotAction(run, content, rng);
    actions.push(action);
    run = applyRunAction(run, action, content).run;
  }
  return { run, actions };
}

/** Applies `actions` to a fresh run; rejected actions leave the state unchanged and are counted. */
export function replayRun(
  seed: string,
  starterId: string,
  actions: RunAction[],
  content: Content,
): { run: RunState; rejected: number } {
  let run = startRun(seed, starterId, content);
  let rejected = 0;
  for (const action of actions) {
    const step = applyRunAction(run, action, content);
    if (step.events.some((e) => e.type === 'rejected')) rejected++;
    run = step.run;
  }
  return { run, rejected };
}

/** Descriptive tags of a run: result, final zone and whether it evolved a member. */
export function runTags(run: RunState, actions: RunAction[]): string[] {
  const tags = [run.phase.kind === 'ended' ? `result:${run.phase.result}` : 'result:running', `zone:${run.zone}`];
  if (actions.some((a) => a.type === 'evolve')) tags.push('evolved');
  return tags;
}
