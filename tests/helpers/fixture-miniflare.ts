import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import Module, { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const runtimePool = 'this.#runtimeDispatcher = new import_undici7.Pool(this.#runtimeEntryURL, {';
const expectedEntryHash = '141080338caec736dd681d442ed6d00b28406dbb68a10e4acaad5265acc41482';

type FixtureMiniflare = typeof import('miniflare');
let fixtureMiniflare: FixtureMiniflare | undefined;

export function loadFixtureMiniflare(): FixtureMiniflare {
  if (process.platform !== 'win32') return require('miniflare');
  if (fixtureMiniflare) return fixtureMiniflare;

  const entry = require.resolve('miniflare');
  const packageMetadata = require('miniflare/package.json');
  const code = readFileSync(entry, 'utf8');
  if (
    packageMetadata.version !== '5.20261006.1-alpha' ||
    entry !== join(dirname(require.resolve('miniflare/package.json')), 'dist', 'src', 'index.js') ||
    createHash('sha256').update(code, 'utf8').digest('hex') !== expectedEntryHash ||
    code.split(runtimePool).length !== 2
  ) {
    throw new Error('Review the Windows disposable D1 transport workaround for the installed Miniflare version.');
  }

  // workerd can close an idle loopback connection before Node services the close
  // event on Windows. Disable reuse before sending a request that may write to D1.
  // This private copy preserves the package path for bundled workers and leaves the
  // regular Miniflare export and dispatcher available to other test code.
  const fixtureModule = new Module(entry) as Module & {
    _compile(source: string, filename: string): void;
  };
  fixtureModule.filename = entry;
  fixtureModule.paths = createRequire(entry).resolve.paths('undici') ?? [];
  fixtureModule._compile(code.replace(runtimePool, runtimePool + ' pipelining: 0,'), entry);
  fixtureMiniflare = fixtureModule.exports as FixtureMiniflare;
  return fixtureMiniflare;
}
