import assert from 'node:assert/strict';
import { evaluateFormHealth, recordFormLoadObservation } from '../../lib/operations/form-health';
import type { HealthTransitionStatements } from '../../lib/operations/service-health-repository';

/** Shared real-adapter scenarios; callers must supply a fresh, inspected isolated database. */
export async function formHealthNativeScenario(db: D1Database, scenario: 'catchup' | 'rollback' | 'repair') {
  const scope = { environment: 'test' as const, releaseId: 'native-health-links', now: 1980000, limit: 1 };
  await db.prepare('CREATE TABLE fixture_health_notices(id VARCHAR(64) PRIMARY KEY,transition TEXT,incident_id TEXT)').run();
  const transitions: HealthTransitionStatements = async (database, transition) => [database.prepare(
    'INSERT INTO fixture_health_notices(id,transition,incident_id) VALUES(?,?,?)',
  ).bind(crypto.randomUUID(), transition.transition, transition.incidentId)];
  const count = async (table: 'service_health_incidents' | 'service_health_observations' | 'fixture_health_notices') =>
    Number((await db.prepare(`SELECT COUNT(*) n FROM ${table}`).first<{ n: number }>())!.n);
  const links = async () => (await db.prepare('SELECT observation_id id FROM form_health_incident_links ORDER BY observation_id').all<{ id: string }>()).results.map(row => row.id);
  const blocked = async (now: number) => {
    const reference = await recordFormLoadObservation(db, { ...scope, now, formId: 'seller.inventory', version: 1, outcome: 'blocked', category: 'definition_unavailable' });
    return (await db.prepare('SELECT id FROM form_health_observations WHERE support_reference=?').bind(reference).first<{ id: string }>())!.id;
  };
  const scan = (database = db, extra: Partial<Parameters<typeof evaluateFormHealth>[1]> = {}) => evaluateFormHealth(database, { ...scope, ...extra }, transitions);
  const original = [await blocked(1800000), await blocked(1860000)].sort();
  if (scenario === 'rollback') {
    let rejectedLinkReached = false;
    const failing = Object.create(db) as D1Database;
    failing.prepare = ((sql: string) => {
      const statement = db.prepare(sql);
      if (!sql.trim().startsWith('INSERT OR IGNORE INTO form_health_incident_links')) return statement;
      rejectedLinkReached = true;
      const guard = db.prepare("INSERT INTO staff_permission_guards(id,valid) VALUES('fixture-health-reject',0)");
      return { bind: () => guard } as unknown as D1PreparedStatement;
    }) as D1Database['prepare'];
    await assert.rejects(scan(failing, { limit: 100 }), /CHECK constraint failed:.*valid|CONSTRAINT.*staff_permission_guards/i);
    assert.equal(rejectedLinkReached, true, 'Failure must occur in actual evidence preparation, not earlier setup');
    assert.equal(await count('service_health_incidents'), 0);
    assert.equal(await count('fixture_health_notices'), 0);
    assert.deepEqual(await links(), []);
    await scan(); await scan();
  } else {
    for (const now of [1600000, 1610000, 1620000, 1630000]) {
      await db.prepare("INSERT INTO audit_logs(id,action,subject_type,next_json,created_at) VALUES(?,'form.core_answers','form',?,?)")
        .bind('fixture-invalid-' + now, JSON.stringify({ formId: 'unmapped', version: 1, healthScope: { environment: scope.environment, releaseId: scope.releaseId } }), now).run();
    }
    await scan(); await scan();
    assert.equal(await count('service_health_observations'), 2);
    assert.equal(await count('service_health_incidents'), 0);
    if (scenario === 'repair') {
      // Historical deployment fixture: incident/notice survived, but original links were missing.
      await db.prepare("INSERT INTO service_health_incidents(id,environment,service_key,episode,state,severity,first_seen_at,last_seen_at,resolved_at,failure_category,revision) VALUES('fixture-prior','test','form.seller.inventory',1,'detected','high',1980000,1980000,NULL,'worker',0)").run();
      await db.prepare("INSERT INTO fixture_health_notices VALUES('fixture-prior-notice','outage','fixture-prior')").run();
      for (let i = 0; i < 105; i++) await blocked(2000000 + i);
      await scan(db, { limit: 200, now: 2100000 });
      await scan(db, { limit: 200, now: 2100000 });
      for (const id of original) assert.ok((await links()).includes(id), 'Bounded opening query must retain displaced original evidence');
    } else {
      await scan();
      assert.equal(await count('service_health_incidents'), 0);
      const completed = await scan();
      assert.equal(completed.scanned, 0);
    }
  }
  assert.equal(await count('service_health_incidents'), 1);
  if (scenario !== 'repair') assert.deepEqual(await links(), original);
  const before = await links();
  for (let i = 0; i < 4; i++) await scan(db, scenario === 'repair' ? { limit: 200, now: 2100000 } : {});
  assert.deepEqual(await links(), before);
  assert.equal(await count('fixture_health_notices'), 1);
}
