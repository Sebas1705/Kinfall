import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseAst } from 'vite';
import { describe, expect, it } from 'vitest';

/** Repository root: paths below are relative to it. */
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const SCANNED_DIRS = ['packages/core/src/sim', 'packages/core/src/content', 'packages/core/src/art', 'packages/core/src/models'];
/** Individual determinism-critical files outside those directories (the web app's demo team picker). */
const SCANNED_FILES = ['apps/web/src/view/demo.ts'];
const MIN_FILES = 6;

/** Math members that are exact on every engine (integer-valued results only). */
const MATH_ALLOWED = new Set(['floor', 'min', 'max', 'abs', 'trunc', 'sign', 'imul', 'clz32']);
/** Identifiers that must never be referenced (clocks, locale, entropy, global aliases). */
const BANNED_IDENTIFIERS = new Set(['Date', 'performance', 'Intl', 'globalThis', 'window', 'crypto']);
/** Member names whose output depends on locale or float formatting. */
const BANNED_MEMBERS = new Set([
  'toLocaleString',
  'toLocaleLowerCase',
  'toLocaleUpperCase',
  'toLocaleDateString',
  'toLocaleTimeString',
  'localeCompare',
  'toFixed',
  'toPrecision',
  'toExponential',
]);
/** Syntax-tree keys that hold type annotations only (erased at runtime); never scanned. */
const TYPE_KEYS = new Set([
  'typeAnnotation',
  'returnType',
  'typeParameters',
  'typeArguments',
  'superTypeArguments',
  'superTypeParameters',
  'implements',
]);
const TYPE_DECLARATIONS = new Set(['TSInterfaceDeclaration', 'TSTypeAliasDeclaration']);

interface Node {
  type: string;
  [key: string]: unknown;
}

function isNode(v: unknown): v is Node {
  return typeof v === 'object' && v !== null && typeof (v as { type?: unknown }).type === 'string';
}

function identName(n: unknown): string | null {
  return isNode(n) && n.type === 'Identifier' ? String(n.name) : null;
}

function stringLiteral(n: unknown): string | null {
  return isNode(n) && n.type === 'Literal' && typeof n.value === 'string' ? n.value : null;
}

/**
 * Parses `src` as TypeScript (Vite's bundled parser, a real AST: no regex or comment
 * heuristics) and returns a description of every banned construct. Comments, string,
 * template and regex literal text, and type annotations are never reported because only
 * expression nodes are inspected. Throws if the source does not parse.
 */
export function findViolations(src: string): string[] {
  const program = parseAst(src, { lang: 'ts' }) as unknown as Node;
  const found: string[] = [];

  const visitChild = (v: unknown): void => {
    if (isNode(v)) visit(v);
  };

  const visitEntry = (key: string, v: unknown): void => {
    if (TYPE_KEYS.has(key)) return;
    if (Array.isArray(v)) for (const item of v) visitChild(item);
    else visitChild(v);
  };

  const visit = (node: Node): void => {
    if (TYPE_DECLARATIONS.has(node.type)) return;

    if (node.type === 'MemberExpression') {
      const computed = node.computed === true;
      const obj = identName(node.object);
      const prop = computed ? stringLiteral(node.property) : identName(node.property);
      if (obj === 'Math') {
        if (computed) found.push('Math[...] bracket access');
        else if (prop !== null && !MATH_ALLOWED.has(prop)) found.push(`Math.${prop}`);
        // Math itself is not visited: an allowed Math.<name> is not a bare use of Math.
      } else {
        visitChild(node.object);
      }
      if (prop !== null && BANNED_MEMBERS.has(prop)) found.push(`.${prop}`);
      if (computed) visitChild(node.property);
      return;
    }

    if (node.type === 'Property' || node.type === 'MethodDefinition' || node.type === 'PropertyDefinition') {
      const computed = node.computed === true;
      const key = computed ? stringLiteral(node.key) : (identName(node.key) ?? stringLiteral(node.key));
      if (key !== null && BANNED_MEMBERS.has(key)) found.push(`.${key}`);
      if (computed) visitChild(node.key);
      for (const [k, v] of Object.entries(node)) if (k !== 'key') visitEntry(k, v);
      return;
    }

    if (node.type === 'Identifier') {
      const name = String(node.name);
      if (name === 'Math') found.push('Math used as a value');
      else if (BANNED_IDENTIFIERS.has(name)) found.push(name);
      return;
    }

    if (node.type === 'BinaryExpression' && node.operator === '**') found.push('** operator');
    if (node.type === 'AssignmentExpression' && node.operator === '**=') found.push('**= operator');

    for (const [k, v] of Object.entries(node)) visitEntry(k, v);
  };

  visit(program);
  return found;
}

function listTs(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...listTs(p));
    else if (p.endsWith('.ts')) out.push(p);
  }
  return out;
}

describe('determinism guard', () => {
  it('core sim, content, art and models and the web demo.ts avoid non-deterministic APIs', () => {
    // A moved or renamed path must fail here, never shrink the scan silently.
    for (const p of [...SCANNED_DIRS, ...SCANNED_FILES]) expect(existsSync(join(ROOT, p)), p).toBe(true);
    for (const d of SCANNED_DIRS) expect(listTs(join(ROOT, d)).length, d).toBeGreaterThan(0);
    const files = [
      ...SCANNED_DIRS.flatMap((d) => listTs(join(ROOT, d))),
      ...SCANNED_FILES.map((f) => join(ROOT, f)),
    ];
    expect(files.length).toBeGreaterThanOrEqual(MIN_FILES);
    const offenders = files
      .map((f) => ({ f: f.slice(ROOT.length + 1), v: findViolations(readFileSync(f, 'utf8')) }))
      .filter((x) => x.v.length > 0);
    expect(offenders).toEqual([]);
  });

  describe('scanner self-test', () => {
    const banned: [string, string][] = [
      // The four review samples that a heuristic scanner missed.
      ['non-null assertion before division', 'const h = Math.floor(stats[i]! / 2) + Math.round(x);'],
      ['postfix ++ before division', 'let i = 0; i++ / 2; Math.random();'],
      ['regex after return with quote', "function f(s: string) { return /'/.test(s) && Math.random() > 0; }"],
      ['regex with backtick then later call', 'const r = /`/;\nconst z = 1;\nMath.random();'],
      // Math
      ['random', 'const x = Math.random();'],
      ['sin', 'Math.sin(1)'],
      ['pow', 'Math.pow(2, 3)'],
      ['sqrt', 'Math.sqrt(4)'],
      ['round', 'Math.round(2.5)'],
      ['hypot', 'Math.hypot(3, 4)'],
      ['spaced access', 'Math . random ()'],
      ['optional chain', 'Math?.random()'],
      ['bracket', "Math['random']()"],
      ['computed bracket', 'const k = "ra"; Math[k + "ndom"]();'],
      ['aliased Math', 'const M = Math; M.random();'],
      ['destructured Math', 'const { random } = Math;'],
      ['Math passed as value', 'use(Math);'],
      // operators
      ['exponent operator', 'const y = a ** 2;'],
      ['exponent assignment', 'let a = 1; a **= 2;'],
      // identifiers
      ['Date.now', 'Date.now()'],
      ['new Date', 'const d = new Date();'],
      ['Date()', 'const s = Date();'],
      ['performance', 'performance.now()'],
      ['Intl', "new Intl.NumberFormat('en')"],
      ['globalThis alias', 'globalThis.Math.random();'],
      ['window alias', 'window.Math.random();'],
      ['crypto', 'crypto.getRandomValues(new Uint8Array(1));'],
      // members
      ['toLocaleString', 'n.toLocaleString()'],
      ['toLocaleLowerCase', 's.toLocaleLowerCase()'],
      ['toLocaleUpperCase', 's.toLocaleUpperCase()'],
      ['localeCompare', 'a.localeCompare(b)'],
      ['toFixed', 'n.toFixed(2)'],
      ['toPrecision', 'n.toPrecision(3)'],
      ['toExponential', 'n.toExponential(1)'],
      ['bracket toFixed', "n['toFixed'](2)"],
      // scanner-evasion shapes
      ['URL string before call', 'const u = "http://x"; Math.random();'],
      ['block-comment text in string', "const s = '/*'; Math.random(); const t = '*/';"],
      ['call after line comment', '// note\nMath.random();'],
      ['call inside template expression', 'const s = `a ${Math.random()} b`;'],
      ['call after template', 'const s = `a`; Math.random();'],
      ['call in TS assertion chain', 'const v = (arr[0] as number)! / 2; Math.round(v);'],
      ['call in arrow body', 'const f = (x: number) => Math.round(x);'],
      ['call in class method', 'class A { m() { return Math.random(); } }'],
    ];
    for (const [name, sample] of banned) {
      it(`flags: ${name}`, () => {
        expect(findViolations(sample)).not.toEqual([]);
      });
    }

    const allowed: [string, string][] = [
      ['floor division', 'const h = Math.floor(x / 2);'],
      ['non-null assertion before division', 'const h = Math.floor(stats[i]! / 2);'],
      ['postfix ++ before division', 'let i = 0; i++ / 2;'],
      ['all allowed members', 'Math.min(Math.max(Math.abs(Math.trunc(Math.sign(Math.imul(a, b)))), Math.clz32(c)), 1)'],
      ['line comment', '// never call Math.random() here\nconst a = 1;'],
      ['block comment', '/* Math.random() and Date.now() are banned */ const a = 1;'],
      ['doc comment with **', '/**\n * uses ** nowhere\n */\nconst a = 1;'],
      ['string with Math.random', "const s = 'Math.random()';"],
      ['double-quote string with Date', 'const s = "Date.now";'],
      ['template with Math.random', 'const s = `Math.random() ${1 + 1}`;'],
      ['string with //', "const u = 'http://x'; const v = Math.floor(2);"],
      ['regex with quote', "const r = /'/; const v = Math.floor(2);"],
      ['regex with backtick', 'const r = /`/; const v = Math.floor(2);'],
      ['regex mentioning Math.random', 'const r = /Math.random|Date/;'],
      ['regex after return', "function f(s: string) { return /'/.test(s); }"],
      ['identifier containing Date', 'const updateDate = 1; const dateOf = 2;'],
      ['property named like a banned identifier', 'const o = { Date: 1, crypto: 2 }; o.performance;'],
      ['type annotation mentioning Date', 'let t: Date | null = null; type X = Intl.Collator;'],
      ['interface with toFixed', 'interface I { toFixed(n: number): string }'],
    ];
    for (const [name, sample] of allowed) {
      it(`allows: ${name}`, () => {
        expect(findViolations(sample)).toEqual([]);
      });
    }
  });
});
