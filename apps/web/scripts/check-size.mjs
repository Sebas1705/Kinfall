// Size budget: the gzipped JS and CSS that index.html loads up front (scripts, stylesheets and
// modulepreload links) must stay at or under BUDGET bytes. Run after `npm run build`.
import { readFileSync, existsSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { dirname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const BUDGET = 2_000_000;
const dist = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const indexPath = join(dist, 'index.html');

if (!existsSync(indexPath)) {
  console.error('dist/index.html not found; run `npm run build` first');
  process.exit(2);
}

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

let total = 0;
for (const ref of [...refs].sort()) {
  const file = normalize(join(dist, ref.replace(/^\.?\//, '')));
  const gz = gzipSync(readFileSync(file), { level: 9 }).length;
  total += gz;
  console.log(`${String(gz).padStart(10)}  ${ref}`);
}
console.log(`${String(total).padStart(10)}  total gzipped (budget ${BUDGET})`);
if (total > BUDGET) {
  console.error(`over budget by ${total - BUDGET} bytes`);
  process.exit(1);
}
console.log('within budget');
