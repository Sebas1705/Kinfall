// Plays N seeded runs per starter with the heuristic bot and prints aggregate statistics.
// Usage: npm run bots -- 500   (no assertions; floats are printed with toFixed, never fed back into the sim)
import { CONTENT } from '../src/content';
import { simulateRun } from '../src/sim/run/bot';
import { runScore } from '../src/sim/run/score';

const n = Number.parseInt(process.argv[3] ?? '500', 10);
if (!Number.isInteger(n) || n <= 0) throw new Error(`usage: npm run bots -- <positive seed count>, got ${process.argv[3]}`);

let runs = 0;
let wins = 0;
let score = 0;
let steps = 0;
let evolved = 0;
const losses = new Map<string, number>();
const bump = (k: string): void => void losses.set(k, (losses.get(k) ?? 0) + 1);

for (let i = 0; i < n; i++) {
  for (const starter of CONTENT.starters) {
    const { run, actions } = simulateRun(`bot-${i}`, starter, CONTENT);
    runs++;
    score += runScore(run, CONTENT);
    steps += actions.length;
    if (actions.some((a) => a.type === 'evolve')) evolved++;
    if (run.phase.kind === 'ended' && run.phase.result === 'won') {
      wins++;
    } else {
      // A lost run ends inside a battle, so the node being fought is the one that was entered last.
      const last = [...actions].reverse().find((a) => a.type === 'node');
      const node = last && last.type === 'node' ? run.maps[run.zone]?.layers.flat().find((x) => x.id === last.nodeId) : undefined;
      bump(`zone ${run.zone}, lost at ${node ? node.type : 'start'}`);
    }
  }
}

const pct = (x: number): string => ((100 * x) / runs).toFixed(2);
console.log(`runs: ${runs} (${n} seeds x ${CONTENT.starters.length} starters)`);
console.log(`win rate: ${pct(wins)}% (${wins}/${runs})`);
console.log(`average score: ${(score / runs).toFixed(1)}`);
console.log(`average steps: ${(steps / runs).toFixed(1)}`);
console.log(`runs with an evolution: ${pct(evolved)}% (${evolved}/${runs})`);
console.log('losses by zone and node type:');
for (const [k, v] of [...losses].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))) console.log(`  ${k}: ${v}`);
