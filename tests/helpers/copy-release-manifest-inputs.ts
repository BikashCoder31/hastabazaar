import { copyFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const project = new URL('../../', import.meta.url);

const ownerCompanions = [
  '0164_customer_cod_confirmation',
  '0165_delivery_failure_reasons',
  '0166_seller_staff_notes',
  '0167_cancellation_cause',
  '0168_packed_parcel_weight',
  '0169_occasion_discovery',
  '0170_occasion_images',
  '0171_delivery_partners',
  '0172_ncm_api',
];

// SQL assets stay caller-owned so each test can select or mutate its fixture.
export async function copyReleaseManifestInputs(root: string) {
  for (const path of [
    ...ownerCompanions.map(name => 'drizzle/' + name + '.sql'),
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
