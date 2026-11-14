import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCANNED_DIRS = ['src/sim', 'src/content'];
const MIN_FILES = 6;

/** Math members that are exact on every engine (integer-valued results only). */
const MATH_ALLOWED = new Set(['floor', 'min', 'max', 'abs', 'trunc', 'sign', 'imul', 'clz32']);

function listTs(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...listTs(p));
    else if (p.endsWith('.ts')) out.push(p);
  }
  return out;
}

const REGEX_PREV = new Set(['(', ',', '=', ':', '[', '!', '&', '|', '?', '{', '}', ';', '+', '-', '*', '%', '<', '>', '~', '^']);

/**
 * Returns the source with comments removed and the contents of string, template and
 * regex literals blanked (quotes kept). It understands string literals, so a `//` inside
 * a string is not a comment and a `/*` inside a string cannot swallow code. `${...}` inside
 * a template literal is scanned as code. Limitation: regex-literal detection is heuristic.
 */
export function stripComments(src: string): string {
  let out = '';
  let i = 0;
  // Stack of open template literals: brace depth of the `${` expression being scanned.
  const templates: number[] = [];
  let prevSig = '';

  const scanString = (quote: string): void => {
    out += quote;
    i++;
    while (i < src.length) {
      const c = src.charAt(i);
      if (c === '\\') {
        i += 2;
        continue;
      }
      if (c === quote || (quote !== '`' && c === '\n')) {
        out += c === quote ? quote : '';
        i++;
        return;
      }
      if (quote === '`' && c === '$' && src.charAt(i + 1) === '{') {
        out += '${';
        i += 2;
        templates.push(0);
        return;
      }
      i++;
    }
  };

  while (i < src.length) {
    const c = src.charAt(i);
    const n = src.charAt(i + 1);
    if (c === '/' && n === '/') {
      while (i < src.length && src.charAt(i) !== '\n') i++;
    } else if (c === '/' && n === '*') {
      const end = src.indexOf('*/', i + 2);
      i = end === -1 ? src.length : end + 2;
      out += ' ';
    } else if (c === "'" || c === '"' || c === '`') {
      scanString(c);
      prevSig = c;
    } else if (c === '/' && (prevSig === '' || REGEX_PREV.has(prevSig))) {
      // Regex literal: skip to the closing slash, honouring classes and escapes.
      out += '/';
      i++;
      let inClass = false;
      while (i < src.length && src.charAt(i) !== '\n') {
        const r = src.charAt(i);
        if (r === '\\') i += 2;
        else if (r === '[') (inClass = true), i++;
        else if (r === ']') (inClass = false), i++;
        else if (r === '/' && !inClass) break;
        else i++;
      }
      out += '/';
      i++;
      prevSig = '/';
    } else {
      if (templates.length > 0) {
        if (c === '{') templates[templates.length - 1] = (templates[templates.length - 1] ?? 0) + 1;
        else if (c === '}') {
          const depth = templates[templates.length - 1] ?? 0;
          if (depth === 0) {
            templates.pop();
            out += '}';
            i++;
            scanString('`');
            prevSig = '`';
            continue;
          }
          templates[templates.length - 1] = depth - 1;
        }
      }
      out += c;
      i++;
      if (!/\s/.test(c)) prevSig = c;
    }
  }
  return out;
}

/** Returns human-readable descriptions of every banned construct found in `src`. */
export function findViolations(src: string): string[] {
  const code = stripComments(src);
  const found: string[] = [];

  for (const m of code.matchAll(/\bMath\s*\.\s*([A-Za-z_$][\w$]*)/g)) {
    const name = m[1] ?? '';
    if (!MATH_ALLOWED.has(name)) found.push(`Math.${name}`);
  }
  if (/\bMath\s*\[/.test(code)) found.push('Math[...] bracket access');
  if (/\bMath\b(?!\s*\.)/.test(code)) found.push('Math used as a value');
  if (/\*\*/.test(code)) found.push('** or **= operator');
  const idents: [RegExp, string][] = [
    [/\bDate\b/, 'Date'],
    [/\bperformance\b/, 'performance'],
    [/\bIntl\b/, 'Intl'],
    [/\btoLocale\w*/, 'toLocale*'],
    [/\blocaleCompare\b/, 'localeCompare'],
    [/\.\s*(toFixed|toPrecision|toExponential)\s*\(/, 'Number formatting (toFixed/toPrecision/toExponential)'],
  ];
  for (const [re, label] of idents) if (re.test(code)) found.push(label);
  return found;
}

describe('determinism guard', () => {
  it('src/sim and src/content avoid non-deterministic APIs', () => {
    const files = SCANNED_DIRS.flatMap((d) => listTs(join(ROOT, d)));
    expect(files.length).toBeGreaterThanOrEqual(MIN_FILES);
    const offenders = files
      .map((f) => ({ f: f.slice(ROOT.length + 1), v: findViolations(readFileSync(f, 'utf8')) }))
      .filter((x) => x.v.length > 0);
    expect(offenders).toEqual([]);
  });

  describe('scanner self-test', () => {
    const banned: [string, string][] = [
      ['random', 'const x = Math.random();'],
      ['sin', 'Math.sin(1)'],
      ['pow', 'Math.pow(2, 3)'],
      ['sqrt', 'Math.sqrt(4)'],
      ['round', 'Math.round(2.5)'],
      ['hypot', 'Math.hypot(3, 4)'],
      ['spaced access', 'Math . random ()'],
      ['bracket', "Math['random']()"],
      ['double-quote bracket', 'Math["ra" + "ndom"]()'],
      ['aliased Math', 'const M = Math; M.random();'],
      ['exponent operator', 'const y = a ** 2;'],
      ['exponent assignment', 'a **= 2;'],
      ['Date.now', 'Date.now()'],
      ['new Date', 'const d = new Date();'],
      ['Date()', 'const s = Date();'],
      ['performance', 'performance.now()'],
      ['Intl', "new Intl.NumberFormat('en')"],
      ['toLocaleString', 'n.toLocaleString()'],
      ['toLocaleLowerCase', 's.toLocaleLowerCase()'],
      ['toLocaleUpperCase', 's.toLocaleUpperCase()'],
      ['localeCompare', "a.localeCompare(b)"],
      ['toFixed', 'n.toFixed(2)'],
      ['toPrecision', 'n.toPrecision(3)'],
      ['toExponential', 'n.toExponential(1)'],
      ['URL string before call', 'const u = "http://x"; Math.random();'],
      ['block-comment text in string', "const s = '/*'; Math.random(); const t = '*/';"],
      ['call after line comment', '// note\nMath.random();'],
      ['call inside template expr', 'const s = `a ${Math.random()} b`;'],
      ['call after template', 'const s = `a`; Math.random();'],
    ];
    for (const [name, sample] of banned) {
      it(`flags: ${name}`, () => {
        expect(findViolations(sample)).not.toEqual([]);
      });
    }

    const allowed: [string, string][] = [
      ['floor division', 'const h = Math.floor(x / 2);'],
      ['all allowed members', 'Math.min(Math.max(Math.abs(Math.trunc(Math.sign(Math.imul(a, b)))), Math.clz32(c)), 1)'],
      ['line comment', '// never call Math.random() here\nconst a = 1;'],
      ['block comment', '/* Math.random() and Date.now() are banned */ const a = 1;'],
      ['doc comment with **', '/**\n * uses ** nowhere\n */\nconst a = 1;'],
      ['string with Math.random', "const s = 'Math.random()';"],
      ['template with Math.random', 'const s = `Math.random() ${1 + 1}`;'],
      ['string with //', "const u = 'http://x'; const v = Math.floor(2);"],
      ['regex with quote', "const r = /'/; const v = Math.floor(2);"],
      ['identifier containing Date', 'const updateDate = 1; const dateOf = 2;'],
      ['Date inside string', 'const s = "Date.now";'],
    ];
    for (const [name, sample] of allowed) {
      it(`allows: ${name}`, () => {
        expect(findViolations(sample)).toEqual([]);
      });
    }
  });
});
