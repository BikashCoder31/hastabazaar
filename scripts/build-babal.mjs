import { spawnSync } from 'node:child_process';
import { copyFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const cli = fileURLToPath(
  new URL('../node_modules/vinext/dist/cli.js', import.meta.url),
);
const manifestResult = spawnSync(process.execPath, [fileURLToPath(new URL('./generate-release-manifest.mjs', import.meta.url))], { stdio: 'inherit' });
if (manifestResult.status !== 0) throw new Error('Release manifest generation failed.');

const assetsResult = spawnSync(process.execPath, [fileURLToPath(new URL('./prepare-brand-assets.mjs', import.meta.url))], { stdio: 'inherit' });
if (assetsResult.status !== 0) throw new Error('Brand asset preparation failed.');

const result = spawnSync(process.execPath, [cli, 'build'], {
  env: { ...process.env, DEPLOY_TARGET: 'babal' },
  stdio: 'inherit',
});

if (result.error) throw result.error;
if (result.status === 0) {
  copyFileSync(
    new URL('../deployment/babal/app.cjs', import.meta.url),
    new URL('../dist/standalone/app.cjs', import.meta.url),
  );
}
process.exitCode = result.status ?? 1;
