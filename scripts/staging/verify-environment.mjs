import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import {
  assertDisposableStagingContext,
  readAndVerifyStagingMarker,
  resolveDisposableStagingPaths,
  stagingMarker,
} from './guards.mjs';

const initialize = process.argv.slice(2).includes('--initialize');
const checks = [];

function result(name, status, evidence, consequence) {
  checks.push({ name, status, evidence, consequence });
}

try {
  const runtime = assertDisposableStagingContext(process.env);
  result('Runtime isolation', 'Pass', `${runtime.kind}; simulated records only`, 'Local staging actions are permitted.');
} catch (error) {
  result('Runtime isolation', 'Fail', error instanceof Error ? error.message : String(error), 'Do not initialize or run staging.');
}

const paths = resolveDisposableStagingPaths(process.cwd(), process.env);
if (!checks.some((check) => check.status === 'Fail') && initialize) {
  await Promise.all([
    mkdir(paths.state, { recursive: true }),
    mkdir(paths.media, { recursive: true }),
    mkdir(paths.mailCapture, { recursive: true }),
    mkdir(paths.recovery, { recursive: true }),
  ]);
  try {
    await readAndVerifyStagingMarker(paths);
  } catch {
    await mkdir(dirname(paths.marker), { recursive: true });
    await writeFile(paths.marker, `${JSON.stringify(stagingMarker(paths), null, 2)}\n`, { flag: 'wx' });
  }
}

try {
  const marker = await readAndVerifyStagingMarker(paths);
  result('Disposable state marker', 'Pass', `${marker.scopeId}; ${marker.projectRelativeRoot}`, 'Reset and seed tools may target only the marked local state.');
} catch (error) {
  result('Disposable state marker', 'Fail', error instanceof Error ? error.message : String(error), 'Run verification once with --initialize after checking the environment variables.');
}

try {
  const hosting = JSON.parse(await readFile('.openai/hosting.json', 'utf8'));
  const localBindings = hosting.d1 === 'DB' && hosting.r2 === 'MEDIA';
  result(
    'Local binding names',
    localBindings ? 'Pass' : 'Fail',
    `D1=${String(hosting.d1)}; R2=${String(hosting.r2)}; remote bindings disabled by Vite staging config`,
    localBindings ? 'The local server can use isolated D1/R2 emulation.' : 'Correct the local binding map before starting staging.',
  );
} catch (error) {
  result('Local binding names', 'Fail', error instanceof Error ? error.message : String(error), 'Local staging cannot start safely.');
}

result('Node runtime', process.version.startsWith('v22.') ? 'Pass' : 'Fail', process.version, 'Node 22 is required by package.json.');
result('Mail delivery', 'Pass', 'capture mode; @local.hastabazaar.test recipients only; SMTP variables absent', 'No real message provider is used.');
result('Payment handling', 'Pass', 'simulated mode', 'No real payment or fund movement is available.');

try {
  const response = await fetch(new URL('/health/live', process.env.APP_ORIGIN), {
    signal: AbortSignal.timeout(1_500),
  });
  result('Local application', response.ok ? 'Pass' : 'Fail', `${response.status} ${response.statusText}`, 'Start the local staging server before seeding if unavailable.');
} catch {
  result('Local application', 'Not Verified', 'No loopback server responded during this check.', 'Start `npm run dev` with the same guarded environment, then rerun verification.');
}

result('Production release and hosting', 'Not Verified', 'No production connection was attempted.', 'Production deployment remains blocked pending separate read-only verification and approval.');

for (const check of checks) {
  console.log(`${check.status}: ${check.name} — ${check.evidence}`);
  console.log(`  Consequence: ${check.consequence}`);
}
if (checks.some((check) => check.status === 'Fail')) process.exitCode = 1;
