import { copyFile, mkdir, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const project = new URL('../../', import.meta.url);

// The caller stages the MariaDB SQL separately so it can inspect or mutate its own copy.
export async function copyMariaDbGeneratorInputs(root: string) {
  const migrations = await readdir(new URL('drizzle/', project));
  for (const path of [
    'scripts/generate-mariadb-schema.mjs',
    'drizzle/meta/0020_snapshot.json',
    'lib/forms/public-feedback-schema.mjs',
    'lib/homepage/hero-slides.ts',
    'lib/checkout/delivery-rates.ts',
    'lib/operations/fee-schema-readiness.mjs',
    'lib/operations/bootstrap-prerequisites.mjs',
    'lib/operations/bootstrap-completion.mjs',
    'lib/operations/bootstrap-completion-contract.json',
    'lib/operations/fresh-bootstrap-defaults.mjs',
    'lib/operations/check-parity.mjs',
    'lib/operations/check-parity-contract.json',
    'lib/operations/text-length-parity.mjs',
    'lib/operations/text-length-parity-contract.json',
    'lib/operations/sql-schema-inventory.mjs',
    ...migrations.filter((name) => /^\d{4}.*\.sql$/.test(name)).map((name) => `drizzle/${name}`),
  ]) {
    const target = join(root, path);
    await mkdir(dirname(target), { recursive: true });
    await copyFile(new URL(path, project), target);
  }
}
