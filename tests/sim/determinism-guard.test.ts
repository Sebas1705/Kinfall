import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const FORBIDDEN =
  /Math\.(random|sin|cos|tan|pow|exp|log|sqrt)|Date\.|performance\.now|new Date/;

function listTs(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...listTs(p));
    else if (p.endsWith('.ts')) out.push(p);
  }
  return out;
}

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

describe('determinism guard', () => {
  it('src/sim and src/content avoid non-deterministic APIs', () => {
    const files = ['src/sim', 'src/content'].flatMap((d) => {
      try {
        return listTs(d);
      } catch {
        return [];
      }
    });
    const offenders = files.filter((f) => FORBIDDEN.test(stripComments(readFileSync(f, 'utf8'))));
    expect(offenders).toEqual([]);
  });
});
