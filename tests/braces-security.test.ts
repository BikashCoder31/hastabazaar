import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
type Options = Record<string, unknown>;
type Braces = {
  (input: string | string[], options?: Options): string[];
  parse(input: string, options?: Options): unknown;
  create(input: string, options?: Options): unknown;
  compile(input: unknown, options?: Options): string;
  stringify(input: unknown, options?: Options): string;
  expand(input: unknown, options?: Options): string[];
};
const braces = require('braces') as Braces;
const depthError = /exceeds max depth/;
const nested = (open: string, close: string, depth = 101) =>
  open.repeat(depth) + 'a' + close.repeat(depth);

void test('brace matching retains normal ranges, alternatives, escapes and options', () => {
  assert.deepEqual(braces.expand('src/{app,lib}/file.{ts,tsx}'), [
    'src/app/file.ts',
    'src/app/file.tsx',
    'src/lib/file.ts',
    'src/lib/file.tsx',
  ]);
  assert.deepEqual(braces.expand('photo-{01..03}.webp'), [
    'photo-01.webp',
    'photo-02.webp',
    'photo-03.webp',
  ]);
  assert.deepEqual(braces.expand('x/{a,{b,c}}'), ['x/a', 'x/b', 'x/c']);
  assert.deepEqual(braces.expand('x/\\{literal\\}'), ['x/{literal}']);
  assert.deepEqual(braces.expand('"{a,b}"'), ['{a,b}']);
  assert.deepEqual(braces(['x/{a,b}', 'y/{c,d}'], { expand: true }), [
    'x/a',
    'x/b',
    'y/c',
    'y/d',
  ]);
  assert.deepEqual(
    braces.expand('{a,a,,b}', { nodupes: true, noempty: true }),
    ['a', 'b'],
  );
  assert.equal(braces.compile('file.{ts,tsx}'), 'file.(ts|tsx)');
  assert.equal(braces.stringify(braces.parse('a/{b,c}')), 'a/{b,c}');
  assert.throws(() => braces.expand('{1..10000}'), /range limit/);
});

void test('every string entry point rejects excessive brace and parenthesis nesting', () => {
  for (const pattern of [
    nested('{', '}'),
    nested('(', ')'),
    '{('.repeat(51) + 'a' + ')}'.repeat(51),
  ]) {
    for (const invoke of [
      () => braces(pattern),
      () => braces.create(pattern),
      () => braces.parse(pattern),
      () => braces.compile(pattern),
      () => braces.expand(pattern),
      () => braces.stringify(pattern),
    ])
      assert.throws(invoke, depthError);
  }
  assert.doesNotThrow(() => braces.compile(nested('(', ')', 100)));
});

void test('caller options cannot bypass hard depth or input-length limits', () => {
  for (const limit of [Infinity, NaN, 100000, '100000'])
    assert.throws(
      () => braces.parse(nested('{', '}'), { maxDepth: limit }),
      depthError,
    );
  for (const limit of [Infinity, 100000, '100000'])
    assert.throws(
      () => braces.parse('a'.repeat(10001), { maxLength: limit }),
      /exceeds max characters/,
    );
  assert.throws(
    () => braces.parse('a', { maxLength: NaN }),
    /non-negative number/,
  );
  assert.throws(() => braces.parse('((a))', { maxDepth: 1 }), depthError);
  // Quoted and escaped delimiters are literals, not nesting.
  assert.deepEqual(braces.expand('"' + '{'.repeat(101) + '"'), [
    '{'.repeat(101),
  ]);
  assert.deepEqual(braces.expand('\\{'.repeat(101)), ['{'.repeat(101)]);
});

void test('compile, stringify and expand bound caller-supplied recursive ASTs', () => {
  type Ast = { type: string; nodes: Ast[]; value?: string };
  for (const method of ['compile', 'stringify', 'expand'] as const) {
    const root: Ast = { type: 'root', nodes: [] };
    let cursor = root;
    for (let i = 0; i < 101; i++) {
      const child: Ast = { type: 'paren', nodes: [] };
      cursor.nodes.push(child);
      cursor = child;
    }
    assert.throws(() => braces[method](root), depthError);
    const cycle: Ast = { type: 'root', nodes: [] };
    cycle.nodes.push(cycle);
    assert.throws(() => braces[method](cycle), depthError);
  }
});

void test('direct AST walkers bound total visits including wide leaf arrays', () => {
  for (const method of ['compile', 'stringify', 'expand'] as const) {
    const root = {
      type: 'root',
      nodes: Array.from({ length: 20001 }, () => ({
        type: 'text',
        value: 'a',
      })),
    };
    assert.throws(() => braces[method](root), /AST node limit/);
  }
});

void test('range AST children are bounded before reduction and argument spreading', () => {
  const guarded = require('../vendor/braces-guard') as Braces;
  for (const method of ['compile', 'expand'] as const) {
    const root = {
      type: 'root',
      ranges: 1,
      nodes: Array.from({ length: 200001 }, () => ({
        type: 'text',
        value: '1',
      })),
    };
    assert.throws(() => guarded[method](root), /AST node limit/);
  }
});

void test('expansion bounds both cyclic and long acyclic parent chains', () => {
  type Parent = { type: string; parent?: Parent; queue: string[] };
  const root: Parent = { type: 'root', queue: [] };
  let chain: Parent = root;
  for (let i = 0; i < 101; i++)
    chain = { type: 'paren', parent: chain, queue: [] };
  const ast = {
    type: 'root',
    nodes: [{ type: 'paren', nodes: [], parent: chain }],
  };
  assert.throws(() => braces.expand(ast), /parent chain.*depth/);
  const cycle: Parent = { type: 'paren', queue: [] };
  cycle.parent = cycle;
  assert.throws(
    () =>
      braces.expand({
        type: 'root',
        nodes: [{ type: 'paren', nodes: [], parent: cycle }],
      }),
    /parent chain.*cycle/,
  );
});

void test('transitive micromatch consumers resolve the reviewed local parser', () => {
  const metadata = require('braces/package.json') as {
    name: string;
    upstream: { version: string };
  };
  assert.equal(metadata.name, '@hastabazaar/braces-guard');
  assert.equal(metadata.upstream.version, '3.0.3-pn.3');
  const consumer = createRequire(require.resolve('micromatch/package.json'));
  assert.equal(consumer.resolve('braces'), require.resolve('braces'));
  const micromatch = consumer('micromatch') as {
    braces: (pattern: string) => unknown;
  };
  assert.throws(() => micromatch.braces(nested('{', '}')), depthError);
});
