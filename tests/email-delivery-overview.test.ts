import { fixtureWithOverrides } from './helpers/fixture-delegation';
import assert from 'node:assert/strict';
import test from 'node:test';
import * as overview from '../lib/operations/email-delivery-overview';
import { serviceHealthFixture } from './helpers/service-health-fixture';
import {captureDatabaseHealthScope} from '../lib/db/health-context';
const now = 2_000_000_000_000;
void test('health runtime expectations are explicit and invalid or future setup never turns green', () => {
  const config = Reflect.get(overview, 'readEmailHealthRuntimeConfig');
  assert.equal(typeof config, 'function');
  assert.deepEqual(config({}, now), { environment: null, expectedSince: null });
  assert.deepEqual(
    config(
      {
        HASTABAZAAR_RUNTIME_ENV: 'local_staging',
        APP_ORIGIN: 'http://localhost:3018',
        EMAIL_AUTOMATION_EXPECTED_SINCE: String(now - 10),
      },
      now,
    ),
    { environment: 'local_staging', expectedSince: now - 10 },
  );
  assert.equal(
    config(
      {
        HASTABAZAAR_RUNTIME_ENV: 'production',
        EMAIL_AUTOMATION_EXPECTED_SINCE: String(now + 1),
      },
      now,
    ).expectedSince,
    null,
  );
  assert.equal(
    config(
      { HASTABAZAAR_RUNTIME_ENV: 'oops', EMAIL_AUTOMATION_EXPECTED_SINCE: '1' },
      now,
    ).environment,
    null,
  );
});
void test('global delivery overview denies ordinary staff and revoked sessions before reading private queue data', async () => {
  const f = serviceHealthFixture();
  try {
    const read = Reflect.get(overview, 'readEmailDeliveryOverview');
    assert.equal(typeof read, 'function');
    await assert.rejects(
      read(f.db, {
        actorId: 'admin',
        environment: 'test',
        expectedSince: null,
        now,
      }),
      (e) => (e as { status: number }).status === 403,
    );
    await assert.rejects(
      read(f.db, {
        actorId: 'customer',
        environment: 'test',
        expectedSince: null,
        now,
      }),
      (e) => (e as { status: number }).status === 403,
    );
    f.sqlite.prepare("UPDATE users SET status='disabled' WHERE id='sa'").run();
    await assert.rejects(
      read(f.db, {
        actorId: 'sa',
        environment: 'test',
        expectedSince: null,
        now,
      }),
      (e) => (e as { status: number }).status === 403,
    );
  } finally {
    f.sqlite.close();
  }
});
void test('authorized overview keeps environments and sender/evaluator evidence separate without exposing observation internals', async () => {
  const f = serviceHealthFixture();
  try {
    captureDatabaseHealthScope(f.db,{HASTABAZAAR_RUNTIME_ENV:'test',NODE_ENV:'test',APP_ORIGIN:'http://localhost:3018',HASTABAZAAR_RELEASE_ID:'overview-fixture'});
    await f.db
      .prepare(
        "INSERT INTO service_health_observations(id,environment,service_key,run_key,observed_at,successful,functional_success,eligible_backlog,oldest_eligible_at,progress_count,failure_category,source_kind,evidence_scope) VALUES('run','test','email.sender','private-run',?,1,1,2,NULL,1,NULL,'sender','overview-fixture')",
      )
      .bind(now)
      .run();
    const result = await overview.readEmailDeliveryOverview(f.db, {
      actorId: 'sa',
      environment: 'test',
      expectedSince: now - 60000,
      now,
    });
    assert.equal(result.services[0].state, 'healthy');
    assert.equal(result.services[1].state, 'unknown');
    assert.equal(result.services[0].eligibleBacklog, 2);
    assert.equal(result.services[1].eligibleBacklog, null);
    assert.doesNotMatch(
      JSON.stringify(result),
      /private-run|observations|configFingerprint|recipientFingerprint/,
    );
    assert.equal(result.independentContactConfigured, false);
    assert.equal(
      f.sqlite.prepare('SELECT COUNT(*) n FROM service_health_incidents').get()
        ?.n,
      0,
      'page projection never opens or resolves incidents',
    );
  } finally {
    f.sqlite.close();
  }
});
void test('revocation while health is being read denies the completed projection', async () => {
  const f = serviceHealthFixture();
  try {
    const prepare = f.db.prepare.bind(f.db);
    let revoked = false;
    const db = fixtureWithOverrides(f.db, {prepare(sql: string) {
        if (sql.includes('FROM service_health_observations') && !revoked) {
          revoked = true;
          f.sqlite
            .prepare("UPDATE users SET status='disabled' WHERE id='sa'")
            .run();
        }
        return prepare(sql);
      }}) as D1Database;
    await assert.rejects(
      overview.readEmailDeliveryOverview(db, {
        actorId: 'sa',
        environment: 'test',
        expectedSince: now - 1000,
        now,
      }),
      (e) => (e as { status: number }).status === 403,
    );
    assert.equal(revoked, true);
  } finally {
    f.sqlite.close();
  }
});
