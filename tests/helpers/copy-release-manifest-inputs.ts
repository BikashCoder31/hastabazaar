import { copyFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const project = new URL('../../', import.meta.url);

// SQL assets stay caller-owned so each test can select or mutate its fixture.
export async function copyReleaseManifestInputs(root: string) {
  for (const path of [
    'scripts/generate-release-manifest.mjs',
    'lib/operations/fee-schema-readiness.mjs',
    'lib/operations/sql-schema-inventory.mjs',
    'lib/operations/bootstrap-completion-contract.json',
    'lib/operations/check-parity-contract.json',
    'lib/operations/text-length-parity-contract.json',
  ]) {
    const target = join(root, path);
    await mkdir(dirname(target), { recursive: true });
    await copyFile(new URL(path, project), target);
  }
}
