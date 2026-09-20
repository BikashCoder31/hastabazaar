import { lstat, mkdir, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
  assertDisposableStagingContext,
  assertResetConfirmation,
  readAndVerifyStagingMarker,
  resolveDisposableStagingPaths,
} from './guards.mjs';

assertDisposableStagingContext(process.env);
assertResetConfirmation(process.argv.slice(2));
const paths = resolveDisposableStagingPaths(process.cwd(), process.env);
await readAndVerifyStagingMarker(paths);

try {
  const response = await fetch(new URL('/health/live', process.env.APP_ORIGIN), {
    signal: AbortSignal.timeout(800),
  });
  if (response.ok) throw new Error('Stop the local staging server before resetting its state.');
} catch (error) {
  if (error instanceof Error && error.message.startsWith('Stop the local staging server')) throw error;
}

for (const target of [paths.root, paths.state, paths.media, paths.mailCapture, paths.recovery]) {
  try {
    if ((await lstat(target)).isSymbolicLink()) {
      throw new Error(`Refusing to reset a symbolic-link path: ${target}`);
    }
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') continue;
    throw error;
  }
}

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const recovery = join(paths.recovery, timestamp);
await mkdir(recovery, { recursive: true });
const moved = [];
for (const [name, target] of [
  ['state', paths.state],
  ['media', paths.media],
  ['mail-capture', paths.mailCapture],
]) {
  try {
    await rename(target, join(recovery, name));
    moved.push(name);
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') continue;
    throw error;
  }
}
await writeFile(
  join(recovery, 'reset-receipt.json'),
  `${JSON.stringify({ scopeId: 'hastabazaar-v1.2.1-local-staging', resetAt: new Date().toISOString(), moved }, null, 2)}\n`,
  { flag: 'wx' },
);
console.log(`Moved disposable local staging data to ${recovery}.`);
console.log('The next local staging start will create clean state; the recovery copy was not deleted.');
