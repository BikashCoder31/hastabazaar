import assert from 'node:assert/strict';
import test from 'node:test';
import mysql, { type Pool } from 'mysql2/promise';
import { stagingNativeFixture } from './helpers/staging-native-fixture';
import { formHealthNativeScenario } from './helpers/form-health-native-scenarios';

void test('Maria final form-health incident evidence', { skip: process.env.HATSKALA_STAGING_NATIVE !== '1' }, async () => {
  await stagingNativeFixture();
  const scenario = process.env.HASTABAZAAR_NATIVE_HEALTH_SCENARIO;
  assert.ok(scenario === 'catchup' || scenario === 'rollback' || scenario === 'repair');
  const original = mysql.createPool;
  const pools: Pool[] = [];
  mysql.createPool = ((...args: Parameters<typeof original>) => {
    const pool = Reflect.apply(original, mysql, args) as Pool;
    pools.push(pool);
    return pool;
  }) as typeof original;
  let primaryFailed = false;
  let primaryError: unknown;
  let cleanupErrors: unknown[] = [];
  try {
    const { env } = await import('../lib/runtime/node-bindings');
    const db = env.DB;
    const checks = async () => assert.deepEqual(await db.prepare('SELECT @@foreign_key_checks AS fk, @@check_constraint_checks AS ck').first(), { fk: 1, ck: 1 });
    await checks();
    for (const table of ['form_health_observations', 'form_health_incident_links', 'service_health_incidents', 'service_health_observations']) {
      assert.equal(Number((await db.prepare(`SELECT COUNT(*) n FROM ${table}`).first<{ n: number }>())!.n), 0, 'Fresh scenario database required: ' + table);
    }
    await formHealthNativeScenario(db, scenario);
    await checks();
    console.log('NATIVE HEALTH SCENARIO: ' + scenario);
  } catch (error) {
    primaryFailed = true;
    primaryError = error;
  } finally {
    mysql.createPool = original;
    const results = await Promise.allSettled(pools.map(pool => Promise.resolve().then(() => pool.end())));
    cleanupErrors = results.filter(result => result.status === 'rejected').map(result => result.reason);
  }
  if (cleanupErrors.length) throw new AggregateError(primaryFailed ? [primaryError, ...cleanupErrors] : cleanupErrors, 'Native health pool cleanup failed');
  if (primaryFailed) throw primaryError;
});
