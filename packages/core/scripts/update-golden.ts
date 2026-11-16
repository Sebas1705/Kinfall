// Regenerates tests/golden/battle.golden.json. Owner-run: npm run golden:update
// The golden test never rewrites that file; review the diff before committing it.
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONTENT } from '../src/content';
import { applyAction, createBattle, legalActions } from '../src/sim/battle';
import { hashState } from '../src/sim/codec';
import type { GoldenEntry } from '../src/sim/golden';
import { createRng } from '../src/sim/rng';
import type { Action, BattleState, Side, TeamSpec } from '../src/sim/state';

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'tests', 'golden', 'battle.golden.json');
const MAX_ACTIONS = 200;

interface Scenario {
  name: string;
  seedBase: string;
  player: TeamSpec;
  enemy: TeamSpec;
  telegraph: boolean;
  /** The recorded run must satisfy this; the first seed (seedBase, seedBase-1, ...) that does is kept. */
  accept: (run: Run) => boolean;
}

interface Run {
  actions: Action[];
  winner: Side | null;
  usedStatusMove: boolean;
  usedSwap: boolean;
  final: BattleState;
}

function isStatusMove(state: BattleState, action: Action): boolean {
  if (action.type !== 'move') return false;
  const sp = CONTENT.species.find((s) => s.id === state.teams.player[state.active.player]?.speciesId);
  const id = sp?.moves[action.moveIndex];
  return CONTENT.moves.find((m) => m.id === id)?.kind === 'status';
}

/** Plays a battle choosing uniformly among legal actions with a seeded policy rng. */
function play(seed: string, sc: Scenario): Run {
  let state = createBattle(seed, sc.player, sc.enemy, CONTENT, { telegraph: sc.telegraph });
  const policy = createRng(`policy:${seed}`);
  const actions: Action[] = [];
  let usedStatusMove = false;
  let usedSwap = false;
  while (state.winner === null && actions.length < MAX_ACTIONS) {
    const legal = legalActions(state, CONTENT);
    const action = legal[policy.nextInt(legal.length)];
    if (!action) break;
    if (isStatusMove(state, action)) usedStatusMove = true;
    if (action.type === 'swap') usedSwap = true;
    actions.push(action);
    state = applyAction(state, action, CONTENT).state;
  }
  return { actions, winner: state.winner, usedStatusMove, usedSwap, final: state };
}

const SCENARIOS: Scenario[] = [
  {
    name: 'player-win-plain',
    seedBase: 'golden-win',
    player: { speciesIds: ['emberveil', 'brambleback'] },
    enemy: { speciesIds: ['skirrow'] },
    telegraph: false,
    accept: (r) => r.winner === 'player' && r.actions.length >= 5,
  },
  {
    name: 'player-loss-telegraph',
    seedBase: 'golden-loss',
    player: { speciesIds: ['skirrow'] },
    enemy: { speciesIds: ['emberveil', 'brambleback', 'dusklurk'] },
    telegraph: true,
    accept: (r) => r.winner === 'enemy' && r.actions.length >= 5,
  },
  {
    name: 'status-and-swap',
    seedBase: 'golden-status',
    player: { speciesIds: ['cindermite', 'tidewisp', 'dusklurk'] },
    enemy: { speciesIds: ['brambleback', 'skirrow'] },
    telegraph: false,
    accept: (r) => r.winner !== null && r.actions.length >= 5 && r.usedStatusMove && r.usedSwap,
  },
];

const entries: GoldenEntry[] = SCENARIOS.map((sc) => {
  for (let i = 0; i < 500; i++) {
    const seed = i === 0 ? sc.seedBase : `${sc.seedBase}-${i}`;
    const run = play(seed, sc);
    if (!sc.accept(run)) continue;
    return {
      name: sc.name,
      seed,
      player: sc.player,
      enemy: sc.enemy,
      telegraph: sc.telegraph,
      actions: run.actions,
      finalHash: hashState(run.final),
      winner: run.winner,
    };
  }
  throw new Error(`no seed satisfied scenario ${sc.name}`);
});

writeFileSync(OUT, `${JSON.stringify(entries, null, 2)}\n`);
console.log(`wrote ${entries.length} golden entries to ${OUT}`);
for (const e of entries) console.log(`  ${e.name}: seed=${e.seed} actions=${e.actions.length} winner=${e.winner} hash=${e.finalHash}`);
