// Size budgets, run after `npm run build`:
// 1. Initial load: the gzipped JS and CSS that index.html loads up front (scripts, stylesheets and
//    modulepreload links) must stay at or under BUDGET bytes.
// 2. Scene art: the lazy chunk of the run screens' art (screenArt-*.js) plus every chunk it
//    imports that is not already part of the initial load must stay at or under ART_BUDGET.
// The battle chunk (PixiJS + the battle scene) is reported for information.
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { dirname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

// Raised from 30_546 for the console layout (layout driver, sheets, HUD, rail screens and their CSS: +5.7 KB gzipped, measured 36_249).
const BUDGET = 37_000;
const ART_BUDGET = 60_000;
const dist = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const indexPath = join(dist, 'index.html');

if (!existsSync(indexPath)) {
  console.error('dist/index.html not found; run `npm run build` first');
  process.exit(2);
}

const gz = (file) => gzipSync(readFileSync(file), { level: 9 }).length;

const html = readFileSync(indexPath, 'utf8');
const refs = new Set();
for (const tag of html.match(/<(?:script|link)\b[^>]*>/gi) ?? []) {
  const attrs = Object.fromEntries(
    [...tag.matchAll(/([\w-]+)\s*=\s*"([^"]*)"/g)].map((m) => [m[1].toLowerCase(), m[2]]),
  );
  const url = attrs.src ?? attrs.href;
  const isScript = /^<script/i.test(tag);
  const rel = (attrs.rel ?? '').toLowerCase();
  if (!url || /^(?:[a-z]+:|\/\/)/i.test(url)) continue;
  if (isScript || rel === 'modulepreload' || (rel === 'stylesheet')) {
    if (/\.(?:m?js|css)$/i.test(url.split('?')[0])) refs.add(url.split('?')[0]);
  }
}

if (refs.size === 0) {
  console.error('no JS or CSS referenced by dist/index.html');
  process.exit(2);
}

let failed = false;
let total = 0;
const initial = new Set();
for (const ref of [...refs].sort()) {
  const file = normalize(join(dist, ref.replace(/^\.?\//, '')));
  initial.add(file);
  const size = gz(file);
  total += size;
  console.log(`${String(size).padStart(10)}  ${ref}`);
}
console.log(`${String(total).padStart(10)}  initial load, gzipped (budget ${BUDGET})`);
if (total > BUDGET) {
  console.error(`initial load over budget by ${total - BUDGET} bytes`);
  failed = true;
}

/** A lazy chunk and the chunks it imports statically, minus the initial load. */
function closure(entry) {
  const seen = new Set();
  const stack = [entry];
  while (stack.length > 0) {
    const file = stack.pop();
    if (seen.has(file) || initial.has(file)) continue;
    seen.add(file);
    const code = readFileSync(file, 'utf8');
    for (const m of code.matchAll(/(?:import|from)\s*["'`](\.\/[^"'`]+\.js)["'`]/g)) {
      stack.push(normalize(join(dirname(file), m[1])));
    }
  }
  return [...seen];
}

const assets = join(dist, 'assets');
const chunk = (prefix) => {
  const name = readdirSync(assets).find((f) => f.startsWith(`${prefix}-`) && f.endsWith('.js'));
  return name ? join(assets, name) : null;
};

const report = (label, entry, budget) => {
  if (!entry) {
    console.error(`${label}: chunk not found`);
    failed = true;
    return;
  }
  const files = closure(entry);
  const size = files.reduce((sum, f) => sum + gz(f), 0);
  console.log(`${String(size).padStart(10)}  ${label}, lazy, gzipped (${files.length} files${budget ? `, budget ${budget}` : ''})`);
  if (budget && size > budget) {
    console.error(`${label} over budget by ${size - budget} bytes`);
    failed = true;
  }
};

report('scene art (run screens)', chunk('screenArt'), ART_BUDGET);
report('battle scene (PixiJS + art)', chunk('battleView'), 0);

if (failed) process.exit(1);
console.log('within budget');
