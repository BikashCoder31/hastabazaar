import { spawnSync } from 'node:child_process';
import { copyFileSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildHostedSecurityCli } from './build-hosted-security-cli.mjs';
import { copyReleaseAssets } from './release-schema-assets.mjs';
import { orderRefundSchemaMarker } from '../lib/operations/order-refund-maria-migrations.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const options = process.argv.slice(2);
const schemaPrefix = '--schema-input=';
const orderRefundOption = '--include-order-refund-migrations';
const schemaArgs = options.filter(option => option.startsWith(schemaPrefix));
const orderRefundArgs = options.filter(option => option === orderRefundOption);
if (schemaArgs.length !== 1 || !schemaArgs[0].slice(schemaPrefix.length) ||
    orderRefundArgs.length > 1 || options.length !== schemaArgs.length + orderRefundArgs.length) {
  throw new Error('Build requires an explicit --schema-input=<reviewed-complete-schema.sql> with optional --include-order-refund-migrations.');
}
const schemaInput = resolve(schemaArgs[0].slice(schemaPrefix.length));
// The local candidate runner supplies a single, independently hashed schema input.
// The manifest generator still verifies the entire prospective schema before writing.
if (!orderRefundArgs.length && (await readFile(schemaInput, 'utf8')).includes(orderRefundSchemaMarker)) {
  orderRefundArgs.push(orderRefundOption);
}
const temporary = await mkdtemp(join(tmpdir(), 'hastabazaar-build-schema-'));
try {
  const bundle = join(temporary, 'assets');

  const cli = fileURLToPath(
    new URL('../node_modules/vinext/dist/cli.js', import.meta.url),
  );
  const manifestResult = spawnSync(process.execPath, [
    fileURLToPath(new URL('./generate-release-manifest.mjs', import.meta.url)),
    `${schemaPrefix}${schemaInput}`, `--asset-root=${bundle}`, ...orderRefundArgs,
  ], { cwd: root, stdio: 'inherit' });
  if (manifestResult.status !== 0) throw new Error('Release manifest generation failed.');

  const assetsResult = spawnSync(process.execPath, [fileURLToPath(new URL('./prepare-brand-assets.mjs', import.meta.url))], { cwd: root, stdio: 'inherit' });
  if (assetsResult.status !== 0) throw new Error('Brand asset preparation failed.');

  const result = spawnSync(process.execPath, [cli, 'build'], {
    env: { ...process.env, DEPLOY_TARGET: 'babal', HASTABAZAAR_BUILD_RELEASE_MANIFEST: join(bundle, 'deployment/babal/release-manifest.json') },
    cwd: root,
    stdio: 'inherit',
  });

  if (result.error) throw result.error;
  if (result.status === 0) {
    copyFileSync(
      new URL('../deployment/babal/app.cjs', import.meta.url),
      new URL('../dist/standalone/app.cjs', import.meta.url),
    );
    await buildHostedSecurityCli(fileURLToPath(new URL('../dist/standalone/', import.meta.url)));
    await copyReleaseAssets(bundle, fileURLToPath(new URL('../dist/standalone/', import.meta.url)), (process.env.HASTABAZAAR_RELEASE_ID ?? 'local-unversioned-candidate').trim());
  }
  process.exitCode = result.status ?? 1;
} finally {
  // Only the private directory created above is removed, never the input schema.
  await rm(temporary, { recursive: true, force: true });
}
