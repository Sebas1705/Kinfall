import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseAst } from 'vite';
import { describe, expect, it } from 'vitest';

// Core runs in browsers, Node and React Native (Hermes), so its source must not reach for any
// platform global: the app injects storage, language detection and timers instead. tsc
// (packages/core/tsconfig.json, lib ES2022 only) already rejects most of these; this scan also
// catches names some lib or @types package could declare again, and globalThis/self aliases.

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'src');
const MIN_FILES = 20;

/** Platform globals core source must never reference. */
const FORBIDDEN = new Set([
  'document',
  'window',
  'self',
  'globalThis',
  'localStorage',
  'sessionStorage',
  'navigator',
  'location',
  'console',
  'structuredClone',
  'requestAnimationFrame',
  'setTimeout',
  'setInterval',
  'performance',
  'process',
  'require',
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
const TYPE_DECLARATIONS = new Set(['TSInterfaceDeclaration', 'TSTypeAliasDeclaration', 'TSDeclareFunction', 'TSModuleDeclaration']);
/** Nodes whose non-computed `key` is a property name. */
const KEYED = new Set(['Property', 'MethodDefinition', 'PropertyDefinition']);

interface Node {
  type: string;
  [key: string]: unknown;
}

function isNode(v: unknown): v is Node {
  return typeof v === 'object' && v !== null && typeof (v as { type?: unknown }).type === 'string';
}

/**
 * Forbidden global names referenced as runtime identifiers in `src` (parsed as TypeScript, so
 * comments, string and template text, property names and type annotations never count).
 */
export function findPlatformGlobals(src: string): string[] {
  const program = parseAst(src, { lang: 'ts' }) as unknown as Node;
  const found: string[] = [];

  const visitValue = (key: string, v: unknown): void => {
    if (TYPE_KEYS.has(key)) return;
    if (Array.isArray(v)) {
      for (const item of v) if (isNode(item)) visit(item);
    } else if (isNode(v)) {
      visit(v);
    }
  };

  const visit = (node: Node): void => {
    if (TYPE_DECLARATIONS.has(node.type)) return;
    if (node.type === 'Identifier') {
      const name = String(node.name);
      if (FORBIDDEN.has(name)) found.push(name);
      return;
    }
    // `a.document` and `{ window: 1 }` name properties, not globals. A shorthand `{ document }`
    // still reads the variable through its value, which is visited.
    let skip: string | null = null;
    if (node.computed !== true) {
      if (node.type === 'MemberExpression') skip = 'property';
      else if (KEYED.has(node.type)) skip = 'key';
    }
    for (const [k, v] of Object.entries(node)) if (k !== skip) visitValue(k, v);
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

describe('platform-neutral core', () => {
  it('core src references no DOM, Node or timer globals', () => {
    const files = listTs(SRC);
    expect(files.length).toBeGreaterThanOrEqual(MIN_FILES);
    const offenders = files
      .map((f) => ({ f: f.slice(SRC.length + 1), v: findPlatformGlobals(readFileSync(f, 'utf8')) }))
      .filter((x) => x.v.length > 0);
    expect(offenders).toEqual([]);
  });

  describe('scanner self-test', () => {
    const flagged: [string, string][] = [
      ['document write', "document.title = '';"],
      ['localStorage read', "localStorage.getItem('k');"],
      ['navigator language', 'const l = navigator.language;'],
      ['window alias', 'window.setTimeout(() => 0);'],
      ['globalThis alias', 'globalThis.localStorage;'],
      ['self alias', 'self.postMessage(1);'],
      ['console', "console.log('x');"],
      ['structuredClone', 'const c = structuredClone(x);'],
      ['timers', 'setTimeout(f, 1); setInterval(f, 1);'],
      ['requestAnimationFrame', 'requestAnimationFrame(f);'],
      ['performance.now', 'const t = performance.now();'],
      ['process.env', 'const e = process.env.X;'],
      ['require', "const m = require('fs');"],
      ['shorthand property value', 'const o = { document };'],
      ['computed member', "const o = x[window ? 'a' : 'b'];"],
      ['call argument', 'use(localStorage);'],
      ['inside a template expression', 'const s = `${location.href}`;'],
      ['in a class method', 'class A { m() { return document.body; } }'],
      ['typeof check', "if (typeof navigator !== 'undefined') f();"],
    ];
    for (const [name, sample] of flagged) {
      it(`flags: ${name}`, () => {
        expect(findPlatformGlobals(sample)).not.toEqual([]);
      });
    }

    const allowed: [string, string][] = [
      ['line comment', '// never touch document or localStorage here\nconst a = 1;'],
      ['block comment', '/* window.setTimeout */ const a = 1;'],
      ['string', "const s = 'document.title';"],
      ['template text', 'const s = `localStorage ${1}`;'],
      ['member property names', 'o.document; o.window.console; o.setTimeout(1);'],
      ['object keys', 'const o = { window: 1, console: 2, process: 3 };'],
      ['class members', 'class A { document = 1; console() {} }'],
      ['type annotations', 'let d: Document | null = null; function f(s: Storage): Window { return s as never; }'],
      ['interface members', 'interface I { navigator: string; setTimeout(n: number): void }'],
    ];
    for (const [name, sample] of allowed) {
      it(`allows: ${name}`, () => {
        expect(findPlatformGlobals(sample)).toEqual([]);
      });
    }
  });
});
