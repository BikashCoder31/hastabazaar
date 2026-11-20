import { fixtureWithOverrides } from './helpers/fixture-delegation';
import assert from 'node:assert/strict';
import test from 'node:test';
import * as repo from '../lib/operations/service-health-repository';
import { serviceHealthFixture } from './helpers/service-health-fixture';
const now = 2_000_000_000_000;
const observation = (
  runKey: string,
  observedAt: number,
  successful = true,
  eligibleBacklog = 0,
  progressCount = 0,
) => ({
  environment: 'test' as const,
  serviceKey: 'email.sender',
  runKey,
  observedAt,
  successful,
  functionalSuccess: successful,
  eligibleBacklog,
  oldestEligibleAt: null,
  progressCount,
  failureCategory: successful ? null : ('worker' as const),
  sourceKind: 'sender' as const,
});
void test('one continuing incident and distinct recovery survive repeated scans, read state and concurrent source races', async () => {
  const f = serviceHealthFixture();
  try {
    const hook = async (db: D1Database, t: repo.HealthTransition) => [
      db
        .prepare('INSERT OR IGNORE INTO transition_notices VALUES(?,?,?)')
        .bind(t.incidentId + ':' + t.transition, t.transition, t.incidentId),
    ];
    const evaluate = (at: number) =>
      repo.evaluateServiceHealth(
        f.db,
        {
          environment: 'test',
          serviceKey: 'email.sender',
          expectedSince: now - 400000,
          now: at,
        },
        hook,
      );
    await evaluate(now);
    await evaluate(now + 1);
    assert.equal(
      f.sqlite.prepare('SELECT COUNT(*) n FROM service_health_incidents').get()
        ?.n,
      1,
    );
    assert.equal(
      f.sqlite.prepare('SELECT COUNT(*) n FROM transition_notices').get()?.n,
      1,
    );
    await repo.recordServiceHealthObservation(
      f.db,
      observation('one', now + 10),
    );
    assert.equal((await evaluate(now + 10)).incident?.state, 'monitoring');
    await repo.recordServiceHealthObservation(
      f.db,
      observation('two', now + 60010),
    );
    assert.equal((await evaluate(now + 60010)).incident?.state, 'resolved');
    await evaluate(now + 60011);
    assert.equal(
      f.sqlite.prepare('SELECT COUNT(*) n FROM transition_notices').get()?.n,
      2,
    );
    assert.equal(
      f.sqlite
        .prepare(
          'SELECT transition FROM transition_notices ORDER BY rowid DESC LIMIT 1',
        )
        .get()?.transition,
      'recovery',
    );
    await evaluate(now + 400011);
    assert.equal(
      f.sqlite.prepare('SELECT COUNT(*) n FROM service_health_incidents').get()
        ?.n,
      2,
    );
  } finally {
    f.sqlite.close();
  }
});
void test('recorded run identity is immutable and environments cannot share observations or episodes', async () => {
  const f = serviceHealthFixture();
  try {
    await repo.recordServiceHealthObservation(f.db, observation('same', now));
    await repo.recordServiceHealthObservation(f.db, observation('same', now));
    await assert.rejects(
      repo.recordServiceHealthObservation(f.db, {
        ...observation('same', now),
        successful: false,
        failureCategory: 'worker',
      }),
    );
    assert.equal(
      f.sqlite
        .prepare('SELECT COUNT(*) n FROM service_health_observations')
        .get()?.n,
      1,
    );
    const other = await repo.evaluateServiceHealth(f.db, {
      environment: 'production',
      serviceKey: 'email.sender',
      expectedSince: null,
      now,
    });
    assert.equal(other.state, 'unknown');
    assert.equal(other.lastSuccessfulAt, null);
    assert.equal(other.incident, null);
  } finally {
    f.sqlite.close();
  }
});
void test('a new failed observation at the atomic recovery boundary prevents closure and keeps the same incident', async () => {
  const f = serviceHealthFixture();
  try {
    const scope = {
      environment: 'test' as const,
      serviceKey: 'email.sender',
      expectedSince: now - 400000,
      now,
    };
    await repo.evaluateServiceHealth(f.db, scope);
    await repo.recordServiceHealthObservation(
      f.db,
      observation('first', now + 1),
    );
    await repo.recordServiceHealthObservation(
      f.db,
      observation('second', now + 60001),
    );
    const batch = f.db.batch.bind(f.db);
    let raced = false;
    f.db.batch = async (statements) => {
      if (!raced) {
        raced = true;
        await repo.recordServiceHealthObservation(
          fixtureWithOverrides(f.db, {batch}) as D1Database,
          {
            ...observation('failure', now + 60002, false),
            failureCategory: 'provider',
          },
        );
      }
      return batch(statements);
    };
    await assert.rejects(
      repo.evaluateServiceHealth(f.db, { ...scope, now: now + 60001 }),
    );
    assert.equal(raced, true);
    assert.equal(
      f.sqlite.prepare('SELECT state FROM service_health_incidents').get()
        ?.state,
      'detected',
    );
    assert.equal(
      f.sqlite.prepare('SELECT COUNT(*) n FROM service_health_incidents').get()
        ?.n,
      1,
    );
    assert.equal(
      f.sqlite.prepare('SELECT COUNT(*) n FROM service_health_guards').get()?.n,
      0,
    );
  } finally {
    f.sqlite.close();
  }
});
void test('empty worker observations persist no functional success and cannot resolve an episode', async () => {
  const f = serviceHealthFixture();
  try {
    const scope = {
      environment: 'test' as const,
      serviceKey: 'email.sender',
      expectedSince: now - 400000,
      now,
    };
    await repo.evaluateServiceHealth(f.db, scope);
    for (const [runKey, at] of [
      ['empty-one', now + 1],
      ['empty-two', now + 60001],
    ] as const) {
      const { functionalSuccess: _functionalSuccess, ...input } = observation(runKey, at);
      await repo.recordServiceHealthObservation(f.db, input);
    }
    const result = await repo.evaluateServiceHealth(f.db, {
      ...scope,
      now: now + 60001,
    });
    assert.equal(result.state, 'unknown');
    assert.notEqual(result.incident?.state, 'resolved');
    assert.equal(
      f.sqlite
        .prepare(
          'SELECT SUM(functional_success) n FROM service_health_observations',
        )
        .get()?.n,
      0,
    );
    await assert.rejects(
      repo.recordServiceHealthObservation(f.db, {
        ...observation('empty-two', now + 60001),
        functionalSuccess: true,
      }),
    );
  } finally {
    f.sqlite.close();
  }
});
void test('recipient faults with verified functional probes persist degraded evidence rather than a provider outage', async () => {
  const f = serviceHealthFixture();
  try {
    await repo.recordServiceHealthObservation(f.db, {
      ...observation('recipient', now, false),
      functionalSuccess: true,
      failureCategory: 'recipient',
    });
    const result = await repo.evaluateServiceHealth(f.db, {
      environment: 'test',
      serviceKey: 'email.sender',
      expectedSince: now - 900000,
      now,
    });
    assert.equal(result.state, 'degraded');
    assert.equal(result.incident, null);
  } finally {
    f.sqlite.close();
  }
});
