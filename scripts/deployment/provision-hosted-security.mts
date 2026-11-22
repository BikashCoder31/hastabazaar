import { access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { provisionHostedSecurityPolicy, recoverHostedSecurityPolicy, validateHostedSecurityConfiguration, inspectHostedSecurityReadiness } from '../../lib/security/hosted-policy';

const action = process.argv.length === 3 ? process.argv[2] : '';
if (action === '--help') {
  process.stdout.write('Usage: node hosted-security.mjs --provision-new-host | --recover-existing-host | --check-readiness\nConfigure secrets through the reviewed private runtime environment; never pass them as command arguments.\nProvision/recover require a reviewed offline host. Readiness is read-only: exit 0 means ready, exit 2 means pending or unavailable.\n');
  process.exit(0);
}

// An operator runs this on an offline, reviewed host. No secrets are accepted in argv or printed.
try {
  if (!['--provision-new-host','--recover-existing-host','--check-readiness'].includes(action)) throw new Error();
  let localMarker = false;
  try { await access(resolve('.staging')); localMarker = true; } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  if (localMarker) throw new Error();
  const configuration = {
    HASTABAZAAR_RUNTIME_ENV: process.env.HASTABAZAAR_RUNTIME_ENV,
    HASTABAZAAR_SECURITY_KEY: process.env.HASTABAZAAR_SECURITY_KEY,
    HASTABAZAAR_SECURITY_POLICY_ROOT: process.env.HASTABAZAAR_SECURITY_POLICY_ROOT,
    APP_ORIGIN: process.env.APP_ORIGIN, MEDIA_ROOT: process.env.MEDIA_ROOT,
  };
  validateHostedSecurityConfiguration(configuration);
  const { env } = await import('../../lib/runtime/node-bindings');
  if (action === '--check-readiness') {
    const state = await inspectHostedSecurityReadiness(env, env.DB);
    process.stdout.write(JSON.stringify(state) + '\n');
    process.exit(state.ready ? 0 : 2);
  } else if (action === '--recover-existing-host') {
    await recoverHostedSecurityPolicy(configuration, env.DB);
    process.stdout.write('Existing protected records authenticated; a new initialized host policy was created. Verify enrollment and recovery before release acceptance.\n');
  } else {
    await provisionHostedSecurityPolicy(configuration, env.DB);
    process.stdout.write('Hosted security policy provisioned in pending setup state. Complete every active staff enrollment before release acceptance.\n');
  }
  process.exit(0);
} catch {
  if (action === '--check-readiness') {
    process.stdout.write(JSON.stringify({ ready: false, phase: 'unavailable', reasonCodes: ['SECURITY_STATE_UNAVAILABLE'], enrolled: 0, pending: 0 }) + '\n');
    process.exit(2);
  }
  process.stderr.write('Hosted security provisioning refused. Check the reviewed host configuration and existing policy/database state. No reset is available.\n');
  process.exit(1);
}
