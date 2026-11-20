// Regenerates packages/core/tests/golden/art.golden.json (hashes of every generated scene asset
// for fixed seeds). Owner-run: npm run golden:art. The art golden test never rewrites that file;
// review the diff (and look at the preview page) before committing it. It never touches the
// battle or run goldens: art does not use the simulation's random numbers.
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { artSnapshot } from '../tests/support/artSnapshot';

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'tests', 'golden', 'art.golden.json');
const snap = artSnapshot();
writeFileSync(OUT, `${JSON.stringify(snap, null, 2)}\n`);
console.log(`wrote ${Object.keys(snap.hashes).length} art hashes to ${OUT}`);
