import { copyFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

/** Run the unchanged module-relative recovery guards in an owned temporary project. */
export async function hostedAuthProjectFixture() {
  const project = await mkdtemp(join(tmpdir(), 'hastabazaar-hosted-auth-fixture-'));
  try {
    for (const path of [
      'scripts/staging/hosted-auth-readiness.mjs',
      'scripts/staging/guards.mjs',
      'scripts/staging/form-catalog-qa-guards.mjs',
      'scripts/staging/local-d1.mjs',
      'lib/staging/environment.ts',
    ]) {
      const destination = join(project, path);
      await mkdir(dirname(destination), { recursive: true });
      await copyFile(new URL('../../' + path, import.meta.url), destination);
    }
    const recovery = join(project, '.staging', 'recovery');
    await mkdir(recovery, { recursive: true });
    const moduleUrl = pathToFileURL(join(project, 'scripts/staging/hosted-auth-readiness.mjs'));
    const readiness = await import(moduleUrl.href) as typeof import('../../scripts/staging/hosted-auth-readiness.mjs');
    return { project, recovery, moduleUrl, ...readiness,
      dispose: () => rm(project, { recursive: true, force: true }) };
  } catch (error) {
    await rm(project, { recursive: true, force: true });
    throw error;
  }
}
