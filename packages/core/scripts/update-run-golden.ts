// Regenerates packages/core/tests/golden/run.golden.json. Owner-run: npm run golden:runs
// The golden test never rewrites that file; review the diff before committing it.
// Seeds are the fixed list golden-0 .. golden-499, tried with every starter, so the output is deterministic.
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONTENT } from '../src/content';
import { runTags, simulateRun } from '../src/sim/run/bot';
import { hashRun } from '../src/sim/run/codec';
import { runScore } from '../src/sim/run/score';
import type { RunAction } from '../src/sim/run/types';

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'tests', 'golden', 'run.golden.json');
const SEEDS = 500;
const MIN_ENTRIES = 4;

interface RunGolden {
  seed: string;
  starterId: string;
  actions: RunAction[];
  finalHash: string;
  result: 'won' | 'lost';
  score: number;
  tags: string[];
}

const candidates: RunGolden[] = [];
for (let i = 0; i < SEEDS; i++) {
  for (const starterId of CONTENT.starters) {
    const seed = `golden-${i}`;
    const { run, actions } = simulateRun(seed, starterId, CONTENT);
    if (run.phase.kind !== 'ended') throw new Error(`run ${seed}/${starterId} did not end`);
    candidates.push({
      seed,
      starterId,
      actions,
      finalHash: hashRun(run),
      result: run.phase.result,
      score: runScore(run, CONTENT),
      tags: runTags(run, actions),
    });
  }
}

const chosen: RunGolden[] = [];
const missing: string[] = [];
function take(label: string, match: (e: RunGolden) => boolean): void {
  const hit = candidates.find((e) => !chosen.some((c) => c.finalHash === e.finalHash) && match(e));
  if (hit) chosen.push(hit);
  else missing.push(label);
}

// Preferred outcomes first; whatever the bot never reaches is reported and replaced by losses.
take('a won run', (e) => e.tags.includes('result:won'));
take('a loss in zone 2', (e) => e.tags.includes('result:lost') && e.tags.includes('zone:2'));
take('a loss in zone 1', (e) => e.tags.includes('result:lost') && e.tags.includes('zone:1'));
take('a run with an evolution', (e) => e.tags.includes('evolved'));
for (const starterId of CONTENT.starters) {
  take(`a loss in zone 0 with starter ${starterId}`, (e) => e.starterId === starterId && e.tags.includes('zone:0') && e.result === 'lost');
}
take('a loss in zone 0 that evolved', (e) => e.tags.includes('zone:0') && e.tags.includes('evolved'));

// Only the first four labels are requirements; the zone-0 fillers are fallbacks and not reported as missing.
const required = ['a won run', 'a loss in zone 2', 'a loss in zone 1', 'a run with an evolution'];
const gaps = missing.filter((m) => required.includes(m));
if (chosen.length < MIN_ENTRIES) throw new Error(`only ${chosen.length} distinct golden runs found in ${SEEDS} seeds`);

writeFileSync(OUT, `${JSON.stringify(chosen, null, 2)}\n`);
console.log(`wrote ${chosen.length} golden run entries to ${OUT}`);
for (const e of chosen) {
  console.log(`  ${e.seed}/${e.starterId}: actions=${e.actions.length} result=${e.result} score=${e.score} tags=${e.tags.join(',')} hash=${e.finalHash}`);
}
if (gaps.length > 0) {
  console.log(`WARNING: not found within ${SEEDS} seeds x ${CONTENT.starters.length} starters: ${gaps.join('; ')}.`);
  console.log('The bot cannot reach these outcomes with the current balance; fill the gap with a balance fix, not by hiding it.');
}
