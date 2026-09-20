import assert from 'node:assert/strict';
import test from 'node:test';

import {
  SIMULATED_RECORD_LABEL,
  assertSimulationAllowed,
  resolveRuntimeEnvironment,
} from '../lib/staging/environment';

void test('local staging is explicit, immutable, and visibly simulated', () => {
  const environment = resolveRuntimeEnvironment({
    runtimeEnvironment: 'local_staging',
    nodeEnvironment: 'production',
    appOrigin: 'http://127.0.0.1:3000',
  });

  assert.equal(environment.kind, 'local_staging');
  assert.equal(environment.simulationAllowed, true);
  assert.equal(environment.recordLabel, SIMULATED_RECORD_LABEL);
  assert.equal(Object.isFrozen(environment), true);
  assert.doesNotThrow(() => assertSimulationAllowed(environment));
});

void test('production is the fail-closed default and can never create simulated records', () => {
  const environment = resolveRuntimeEnvironment({
    nodeEnvironment: 'production',
    appOrigin: 'https://hastabazaar.com',
  });

  assert.equal(environment.kind, 'production');
  assert.equal(environment.simulationAllowed, false);
  assert.throws(() => assertSimulationAllowed(environment), /production/i);
});

void test('a staging label cannot override an official production origin', () => {
  assert.throws(
    () =>
      resolveRuntimeEnvironment({
        runtimeEnvironment: 'local_staging',
        nodeEnvironment: 'production',
        appOrigin: 'https://www.hastabazaar.com',
      }),
    /official production origin/i,
  );
});

void test('local staging rejects remote, malformed, and credential-bearing origins', () => {
  for (const appOrigin of [
    'https://staging.example.com',
    'not-a-url',
    'http://user:pass@localhost:3000',
  ]) {
    assert.throws(
      () =>
        resolveRuntimeEnvironment({
          runtimeEnvironment: 'local_staging',
          nodeEnvironment: 'development',
          appOrigin,
        }),
      /local staging origin/i,
    );
  }
});

void test('test mode is unavailable in a production Node runtime', () => {
  assert.throws(
    () =>
      resolveRuntimeEnvironment({
        runtimeEnvironment: 'test',
        nodeEnvironment: 'production',
        appOrigin: 'http://localhost:3000',
      }),
    /test environment/i,
  );
});

void test('unknown environment values fail instead of degrading to a permissive mode', () => {
  assert.throws(
    () =>
      resolveRuntimeEnvironment({
        runtimeEnvironment: 'staging-with-production-data',
        nodeEnvironment: 'development',
        appOrigin: 'http://localhost:3000',
      }),
    /unknown runtime environment/i,
  );
});
