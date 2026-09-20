import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
  assertDisposableStagingContext,
  readAndVerifyStagingMarker,
  resolveDisposableStagingPaths,
} from './guards.mjs';
import { runManagedMakerDemo } from './managed-maker-demo-fixture.mjs';

assertDisposableStagingContext(process.env);
const paths = resolveDisposableStagingPaths(process.cwd(), process.env);
await readAndVerifyStagingMarker(paths);

const result = await runManagedMakerDemo();
const outputPath = join(paths.root, 'managed-maker-demo-result.json');
await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');

console.log('PASS: disposable Managed Maker journey completed.');
console.log(`Eligible base: NPR ${(result.eligibleBasePaisa / 100).toFixed(2)}`);
console.log(`Platform retained (9%): NPR ${(result.platformRetainedPaisa / 100).toFixed(2)}`);
console.log(`Maker entitlement (91%): NPR ${(result.makerEntitlementPaisa / 100).toFixed(2)}`);
console.log(`Payout: ${result.payout.status}; invoice groups: ${result.invoiceCount}`);
console.log(`Evidence: ${outputPath}`);
console.log(result.simulationLabel);
