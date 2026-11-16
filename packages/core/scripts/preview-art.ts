// Writes packages/core/art-preview.html (git-ignored): every species sprite and element icon as a scaled-up
// pixel grid on a dark and a light background. Owner-run: npm run art:preview
// With --ascii it also prints one character per palette index for each species.
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateCreature } from '../src/art/creatureGen';
import { elementIcon } from '../src/art/elementIcon';
import type { PixelGrid } from '../src/art/palette';
import { CONTENT, ELEMENTS } from '../src/content';

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'art-preview.html');

function svg(grid: PixelGrid, scale: number): string {
  const rects: string[] = [];
  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      const idx = grid.pixels[y * grid.width + x] ?? 0;
      if (idx === 0) continue;
      rects.push(`<rect x="${x}" y="${y}" width="1" height="1" fill="${grid.palette[idx]}"/>`);
    }
  }
  const w = grid.width * scale;
  const h = grid.height * scale;
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${grid.width} ${grid.height}" shape-rendering="crispEdges">${rects.join('')}</svg>`;
}

function panel(bg: string, fg: string, cells: string): string {
  return `<div class="panel" style="background:${bg};color:${fg}">${cells}</div>`;
}

function cell(label: string, grid: PixelGrid, scale: number): string {
  return `<figure><div>${svg(grid, scale)}</div><figcaption>${label}</figcaption></figure>`;
}

const creatures = CONTENT.species.map((sp) => cell(sp.id, generateCreature(sp), 12)).join('');
const icons = ELEMENTS.map((el) => cell(el, elementIcon(el), 16)).join('');
const body = [
  panel('#0e0e13', '#e8e8ee', `<h2>Species (dark)</h2><section>${creatures}</section><h2>Elements (dark)</h2><section>${icons}</section>`),
  panel('#f6f6fa', '#1a1a22', `<h2>Species (light)</h2><section>${creatures}</section><h2>Elements (light)</h2><section>${icons}</section>`),
].join('');

writeFileSync(
  OUT,
  `<!doctype html><meta charset="utf-8"><title>Art preview</title>
<style>body{margin:0;font:14px system-ui}.panel{padding:16px}section{display:flex;flex-wrap:wrap;gap:16px}figure{margin:0;text-align:center}</style>
${body}`,
);
console.log(`wrote ${OUT}`);

if (process.argv.includes('--ascii')) {
  const chars = ' #oxe.';
  for (const sp of CONTENT.species) {
    const g = generateCreature(sp);
    console.log(`\n${sp.id} (${sp.art.body}, limbs ${sp.art.limbs}, ${sp.art.pattern}, eyes ${sp.art.eyes})`);
    for (let y = 0; y < g.height; y++) {
      let line = '';
      for (let x = 0; x < g.width; x++) line += chars[g.pixels[y * g.width + x] ?? 0] ?? '?';
      console.log(line);
    }
  }
}
