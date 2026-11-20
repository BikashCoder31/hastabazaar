import assert from 'node:assert/strict';
import test from 'node:test';
import { readdirSync, readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { build } from 'esbuild';
import {
  stubFixtureImage,
  stubFixtureLink,
} from './helpers/browser-fixture-link';

function clientEntries(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory()
      ? clientEntries(path)
      : /\.tsx?$/.test(path) &&
          readFileSync(path, 'utf8').includes('@/lib/forms/client-submission')
        ? [path]
        : [];
  });
}
void test('all actual form-helper client entries bundle without server health, provider bindings or Node builtin shims', async () => {
  const entries = [...clientEntries('components'), ...clientEntries('hooks')];
  assert.ok(entries.length >= 62);
  const result = await build({
    entryPoints: entries,
    bundle: true,
    write: false,
    outdir: resolve('.test-artifacts/t30/form-client-bundles'),
    platform: 'browser',
    format: 'esm',
    metafile: true,
    loader: {
      '.png': 'dataurl',
      '.svg': 'dataurl',
      '.jpg': 'dataurl',
      '.webp': 'dataurl',
    },
    plugins: [
      {
        name: 'framework-only-fixture-shims',
        setup(builder) {
          stubFixtureLink(builder);
          stubFixtureImage(builder);
          builder.onResolve({ filter: /^next\/navigation$/ }, () => ({
            path: 'navigation',
            namespace: 'form-boundary',
          }));
          builder.onResolve({ filter: /^next\/dynamic$/ }, () => ({
            path: 'dynamic',
            namespace: 'form-boundary',
          }));
          builder.onLoad(
            { filter: /.*/, namespace: 'form-boundary' },
            (args) => ({
              loader: 'js',
              contents:
                args.path === 'dynamic'
                  ? 'export default function dynamic(){return function FixtureDynamic(){return null}}'
                  : "export function useRouter(){return{push(){},replace(){},refresh(){}}}export function usePathname(){return'/fixture'}export function useSearchParams(){return new URLSearchParams()}export function useParams(){return{}}export function redirect(){throw Error('Fixture redirect')}export function notFound(){throw Error('Fixture not found')}",
            }),
          );
        },
      },
    ],
  });
  const inputs = Object.keys(result.metafile.inputs);
  assert.equal(
    inputs.some((path) =>
      /(?:lib\/forms\/runtime\.ts|lib\/operations\/form-health\.ts|lib\/runtime\/node-bindings\.ts|node_modules\/sharp\/)/.test(
        path.replaceAll('\\', '/'),
      ),
    ),
    false,
    'Server runtime must remain outside the client graph.',
  );
  await mkdir('.test-artifacts/t30', { recursive: true });
  await writeFile(
    '.test-artifacts/t30/form-client-bundles.json',
    JSON.stringify(
      {
        entries,
        entryCount: entries.length,
        inputCount: inputs.length,
        outputs: result.outputFiles.map((file) => ({
          path: file.path,
          bytes: file.contents.length,
        })),
        nodeBuiltinShims: false,
      },
      null,
      2,
    ),
  );
});
