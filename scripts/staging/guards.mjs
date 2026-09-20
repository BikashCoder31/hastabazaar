import { readFile } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';

import {
  assertSimulationAllowed,
  resolveRuntimeEnvironment,
  SIMULATED_RECORD_LABEL,
} from '../../lib/staging/environment.ts';

export const STAGING_SCOPE_ID = 'hastabazaar-v1.2.1-local-staging';
export const RESET_CONFIRMATION = 'HASTABAZAAR-LOCAL-STAGING';

const forbiddenRemoteBindings = [
  'DB_HOST',
  'DB_NAME',
  'DB_USER',
  'DB_PASSWORD',
  'SMTP_HOST',
  'SMTP_USER',
  'SMTP_PASSWORD',
  'CLOUDFLARE_API_TOKEN',
  'CLOUDFLARE_ACCOUNT_ID',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'S3_ENDPOINT',
];

function value(environment, name) {
  const candidate = environment[name];
  return typeof candidate === 'string' ? candidate.trim() : '';
}

export function assertDisposableStagingContext(environment) {
  const runtime = resolveRuntimeEnvironment({
    runtimeEnvironment: value(environment, 'HASTABAZAAR_RUNTIME_ENV'),
    nodeEnvironment: value(environment, 'NODE_ENV'),
    appOrigin: value(environment, 'APP_ORIGIN'),
  });
  assertSimulationAllowed(runtime);
  if (runtime.kind !== 'local_staging') {
    throw new Error('Disposable staging commands require local_staging exactly.');
  }
  if (value(environment, 'HASTABAZAAR_MAIL_MODE') !== 'capture') {
    throw new Error('Disposable staging requires mail capture mode.');
  }
  if (value(environment, 'HASTABAZAAR_PAYMENT_MODE') !== 'simulated') {
    throw new Error('Disposable staging requires simulated payments.');
  }
  if (value(environment, 'HASTABAZAAR_RECIPIENT_DOMAIN') !== 'local.hastabazaar.test') {
    throw new Error('Disposable staging recipients must use local.hastabazaar.test.');
  }
  const configuredRemoteBinding = forbiddenRemoteBindings.find((name) => value(environment, name));
  if (configuredRemoteBinding) {
    throw new Error(`${configuredRemoteBinding} must be absent from disposable local staging.`);
  }
  return runtime;
}

function assertChild(root, target, label) {
  if (target === root || !target.startsWith(`${root}${sep}`)) {
    throw new Error(`${label} must remain inside the disposable staging root.`);
  }
}

export function resolveDisposableStagingPaths(projectRoot, environment) {
  const project = resolve(projectRoot);
  const expectedRoot = resolve(project, '.staging');
  const configuredRoot = value(environment, 'HASTABAZAAR_STAGING_ROOT');
  const root = configuredRoot ? resolve(project, configuredRoot) : expectedRoot;
  if (root !== expectedRoot) {
    throw new Error('HASTABAZAAR_STAGING_ROOT must resolve to this project\'s .staging directory.');
  }
  const paths = {
    project,
    root,
    marker: resolve(root, 'staging-environment.json'),
    state: resolve(root, 'state'),
    media: resolve(root, 'media'),
    mailCapture: resolve(root, 'mail-capture'),
    recovery: resolve(root, 'recovery'),
  };
  for (const [label, target] of Object.entries(paths)) {
    if (label !== 'project' && label !== 'root') assertChild(root, target, label);
  }
  return Object.freeze(paths);
}

export function stagingMarker(paths) {
  return Object.freeze({
    schemaVersion: 1,
    scopeId: STAGING_SCOPE_ID,
    recordLabel: SIMULATED_RECORD_LABEL,
    projectRelativeRoot: relative(paths.project, paths.root).replaceAll('\\', '/'),
    stateDirectory: 'state',
    mediaDirectory: 'media',
    mailCaptureDirectory: 'mail-capture',
  });
}

export async function readAndVerifyStagingMarker(paths) {
  let parsed;
  try {
    parsed = JSON.parse(await readFile(paths.marker, 'utf8'));
  } catch (error) {
    throw new Error('Disposable staging marker is missing or unreadable.', { cause: error });
  }
  const expected = stagingMarker(paths);
  for (const [key, expectedValue] of Object.entries(expected)) {
    if (parsed?.[key] !== expectedValue) {
      throw new Error(`Disposable staging marker mismatch for ${key}.`);
    }
  }
  return Object.freeze(parsed);
}

export function assertResetConfirmation(argumentsList) {
  if (!argumentsList.includes(`--confirm-reset=${RESET_CONFIRMATION}`)) {
    throw new Error(`Reset requires --confirm-reset=${RESET_CONFIRMATION}.`);
  }
}
