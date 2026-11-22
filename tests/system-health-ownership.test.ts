import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { serviceHealthFixture } from './helpers/service-health-fixture';
import * as health from '../lib/operations/service-health-repository';
import { captureDatabaseHealthScope } from '../lib/db/health-context';
import { registerHooks } from 'node:module';
declare global {
  var incidentApiDb: D1Database;
  var incidentApiActor: {
    id: string;
    role: string;
    permissions: string[];
  } | null;
}
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === 'cloudflare:workers')
      return {
        url: 'data:text/javascript,export const env={get DB(){return globalThis.incidentApiDb},HASTABAZAAR_RUNTIME_ENV:"test",APP_ORIGIN:"https://incident-fixture.test",HASTABAZAAR_RELEASE_ID:"release-one"}',
        shortCircuit: true,
      };
    if (specifier === '@/lib/auth/staff')
      return {
        url: 'data:text/javascript,export class StaffAuthorizationError extends Error{constructor(message,status=403){super(message);this.status=status}};export async function requireStaffApi(permission){const actor=globalThis.incidentApiActor;if(!actor||actor.role!=="super_admin"&&!actor.permissions.includes(permission))throw new StaffAuthorizationError("Current staff permission is required.");return {...actor,authSubject:actor.id}}',
        shortCircuit: true,
      };
    return next(specifier, context);
  },
});

const path = '../lib/operations/incident-review';
const now = 2_000_000_000_000;
function fixture() {
  const f = serviceHealthFixture();
  assert.ok(f.sqlite.prepare('PRAGMA database_list').all().every(row=>row.file===''));
  f.sqlite.exec('PRAGMA foreign_keys=ON');
  assert.equal(f.sqlite.prepare('PRAGMA foreign_keys').get()!.foreign_keys,1);

  captureDatabaseHealthScope(f.db, {
    HASTABAZAAR_RUNTIME_ENV: 'test',
    APP_ORIGIN: 'https://incident-fixture.test',
    HASTABAZAAR_RELEASE_ID: 'release-one',
    NODE_ENV: 'development',
  });
  f.sqlite.exec(readFileSync('drizzle/0149_team_governance.sql', 'utf8'));
  f.sqlite.exec(
    `CREATE TABLE audit_logs(id TEXT PRIMARY KEY,actor_id TEXT,action TEXT,subject_type TEXT,subject_id TEXT,request_id TEXT,created_at INTEGER,command_key TEXT UNIQUE,command_digest TEXT,command_result_json TEXT);CREATE TABLE operation_transaction_guards(id TEXT PRIMARY KEY,valid INTEGER CHECK(valid=1));CREATE TABLE operational_incidents(id TEXT PRIMARY KEY,reference_number TEXT,severity TEXT,status TEXT,title TEXT,detail TEXT,resolution TEXT,owner_id TEXT,request_id TEXT,created_at INTEGER,updated_at INTEGER,resolved_at INTEGER);CREATE TABLE notification_messages(id TEXT PRIMARY KEY,recipient_user_id TEXT,audience_role TEXT,channel TEXT,template_key TEXT,subject_en TEXT,subject_ne TEXT,body_en TEXT,body_ne TEXT,related_type TEXT,related_id TEXT,status TEXT,request_id TEXT UNIQUE,created_at INTEGER,business_event_key TEXT,required_permission TEXT);INSERT INTO staff_permission_profiles VALUES('admin','["system.health.view","system.incidents.manage"]');`,
  );
  return f;
}
const ctx = (
  actorId: string,
  requestId: string,
  revision: string | null,
  at = now,
) => ({ actorId, requestId, expectedRevision: revision, now: at });
const input = {
  environment: 'test',
  serviceKey: 'forms.product',
  failureSignature: 'product-save-blocked',
  title: 'Product saving blocked',
  impactSummary: 'Product submissions cannot be saved in the supported form.',
  impactClass: 'ordinary',
  severity: 'high',
};
async function opened(f: ReturnType<typeof fixture>, extra = {}) {
  const m = await import(path);
  return m.createIncident(f.db, ctx('sa', 'create', null), {
    ...input,
    ...extra,
  });
}
async function proof(
  f: ReturnType<typeof fixture>,
  scope = 'release-one',
  at = now + 120_000,
) {
  for (const [index, time] of [at, at + 60_000].entries())
    await health.recordServiceHealthObservation(f.db, {
      environment: 'test',
      serviceKey: 'forms.product',
      runKey: `proof-${scope}-${index}`,
      observedAt: time,
      successful: true,
      functionalSuccess: true,
      eligibleBacklog: 0,
      oldestEligibleAt: null,
      progressCount: 1,
      failureCategory: null,
      sourceKind: 'evaluator',
      evidenceScope: scope,
    });
}

void test('incident authority and Critical clocks persist original detection through assignment and acknowledgment', async () => {
  const f = fixture(),
    m = await import(path);
  try {
    const created = await opened(f, { severity: 'critical' });
    let row = await m.readIncident(f.db, 'sa', created.incidentId, 'test', now);
    assert.equal(row.acknowledgeDueAt, now + 900_000);
    assert.equal(row.planDueAt, now + 3_600_000);
    await m.executeIncidentCommand(
      f.db,
      ctx('sa', 'assign', row.version, now + 1000),
      {
        incidentId: row.id,
        action: 'assign',
        ownerId: 'admin',
        backupId: 'sa',
        reason: 'Assign the authorized technical responder',
      },
    );
    row = await m.readIncident(f.db, 'admin', row.id, 'test', now + 2000);
    await m.executeIncidentCommand(
      f.db,
      ctx('admin', 'ack', row.version, now + 2000),
      {
        incidentId: row.id,
        action: 'acknowledge',
        reason: 'I have received this incident',
      },
    );
    row = await m.readIncident(f.db, 'admin', row.id, 'test', now + 2000);
    assert.equal(row.firstSeenAt, now);
    assert.equal(row.state, 'working');
    assert.equal(row.acknowledgedAt, now + 2000);
    assert.equal(row.resolvedAt, null);
    assert.equal(
      (await m.incidentFollowupFacts(f.db, row.id, now + 3_600_001))
        .planOverdue,
      true,
    );
  } finally {
    f.sqlite.close();
  }
});
void test('manual closure requires two actual matching-scope observations and current revision, acknowledgment is not repair', async () => {
  const f = fixture(),
    m = await import(path);
  try {
    const created = await opened(f);
    await m.executeIncidentCommand(f.db, ctx('sa', 'assign-recovery', '0:0'), {
      incidentId: created.incidentId,
      action: 'assign',
      ownerId: 'admin',
      reason: 'Assign the eligible recovery responder',
    });
    let row = await m.readIncident(f.db, 'sa', created.incidentId, 'test', now);
    await assert.rejects(
      m.executeIncidentCommand(f.db, ctx('sa', 'false-close', row.version), {
        incidentId: row.id,
        action: 'resolve',
        reason: 'Acknowledged but no recovery proof',
        cause: 'unknown',
      }),
    );
    await proof(f, 'release-one');
    await health.recordServiceHealthObservation(f.db, {
      environment: 'test',
      serviceKey: 'forms.product',
      runKey: 'new-release-only',
      observedAt: now + 240_000,
      successful: true,
      functionalSuccess: true,
      eligibleBacklog: 0,
      oldestEligibleAt: null,
      progressCount: 1,
      failureCategory: null,
      sourceKind: 'evaluator',
      evidenceScope: 'release-two',
    });
    await assert.rejects(
      m.executeIncidentCommand(
        f.db,
        ctx('sa', 'mixed-proof', row.version, now + 240_000),
        {
          incidentId: row.id,
          action: 'resolve',
          reason: 'Mixed releases cannot establish recovery',
          cause: 'unknown',
        },
      ),
    );
    captureDatabaseHealthScope(f.db, {
      HASTABAZAAR_RUNTIME_ENV: 'test',
      APP_ORIGIN: 'https://incident-fixture.test',
      HASTABAZAAR_RELEASE_ID: 'release-two',
      NODE_ENV: 'development',
    });
    await proof(f, 'release-two', now + 300_000);
    row = await m.readIncident(f.db, 'sa', row.id, 'test', now + 360_000);
    const result = await m.executeIncidentCommand(
      f.db,
      ctx('admin', 'close-valid', row.version, now + 360_000),
      {
        incidentId: row.id,
        action: 'resolve',
        reason: 'The current save flow has two successful observations',
        cause: 'Validated current compatible save flow',
      },
    );
    assert.equal(result.state, 'resolved');
    assert.equal(
      (await m.readIncident(f.db, 'sa', row.id, 'test', now + 360_000))
        .resolvedAt,
      now + 360_000,
    );
  } finally {
    f.sqlite.close();
  }
});
void test('sensitive incidents cannot auto-close or be closed/lowered by an ordinary responder', async () => {
  const f = fixture(),
    m = await import(path);
  try {
    const created = await opened(f, {
      impactClass: 'financial_integrity',
      severity: 'critical',
    });
    await m.executeIncidentCommand(f.db, ctx('sa', 'assign-sensitive', '0:0'), {
      incidentId: created.incidentId,
      action: 'assign',
      ownerId: 'admin',
      reason: 'Assign the actual scoped technical responder',
    });
    await proof(f);
    const evaluated = await health.evaluateServiceHealth(f.db, {
      environment: 'test',
      serviceKey: 'forms.product',
      expectedSince: now,
      now: now + 180_000,
    });
    assert.notEqual(evaluated.incident?.state, 'resolved');
    const row = await m.readIncident(
      f.db,
      'sa',
      created.incidentId,
      'test',
      now + 180_000,
    );
    await assert.rejects(
      m.executeIncidentCommand(
        f.db,
        ctx('admin', 'close-sensitive', row.version, now + 180_000),
        {
          incidentId: row.id,
          action: 'resolve',
          reason: 'An ordinary responder cannot confirm financial closure',
          cause: 'unknown',
        },
      ),
    );
    await assert.rejects(
      m.executeIncidentCommand(
        f.db,
        ctx('admin', 'lower-sensitive', row.version, now + 180_000),
        {
          incidentId: row.id,
          action: 'severity',
          severity: 'routine',
          reason: 'Lower severity without Super Admin',
        },
      ),
    );
    await m.executeIncidentCommand(
      f.db,
      ctx('sa', 'close-sensitive-sa', row.version, now + 180_000),
      {
        incidentId: row.id,
        action: 'resolve',
        reason: 'Super Admin confirmed the scoped financial recovery evidence',
        cause: 'Verified matching current evidence',
      },
    );
  } finally {
    f.sqlite.close();
  }
});
void test('commands recheck revocation at commit and replay exactly one attributable event', async () => {
  const f = fixture(),
    m = await import(path);
  try {
    const created = await opened(f);
    await m.executeIncidentCommand(f.db, ctx('sa', 'assign-race', '0:0'), {
      incidentId: created.incidentId,
      action: 'assign',
      ownerId: 'admin',
      reason: 'Assign the scoped command race responder',
    });
    const row = await m.readIncident(
      f.db,
      'sa',
      created.incidentId,
      'test',
      now,
    );
    const command = {
      incidentId: row.id,
      action: 'plan',
      plan: 'Contain the affected form while preserving submitted answers.',
      nextAction: 'Validate the current save path',
      nextUpdateAt: now + 600_000,
      reason: 'Record a concrete containment plan',
    };
    const original = f.db.batch.bind(f.db);
    let revoke = true;
    const raced = {
      prepare: f.db.prepare.bind(f.db),
      batch: async (statements: D1PreparedStatement[]) => {
        if (revoke) {
          revoke = false;
          f.sqlite.exec("UPDATE users SET status='disabled' WHERE id='admin'");
        }
        return original(statements);
      },
    } as D1Database;
    await assert.rejects(
      m.executeIncidentCommand(
        raced,
        ctx('admin', 'raced-plan', row.version),
        command,
      ),
    );
    assert.equal(
      f.sqlite
        .prepare(
          "SELECT COUNT(*) n FROM service_incident_events WHERE actor_id='admin'",
        )
        .get()?.n,
      0,
    );
    const commandContext = ctx('sa', 'plan', row.version);
    const first = await m.executeIncidentCommand(f.db, commandContext, command);
    assert.deepEqual(
      await m.executeIncidentCommand(f.db, commandContext, command),
      first,
    );
    await assert.rejects(
      m.executeIncidentCommand(f.db, commandContext, {
        ...command,
        nextAction: 'Different request content',
      }),
    );
    assert.equal(
      f.sqlite
        .prepare(
          "SELECT COUNT(*) n FROM service_incident_events WHERE action='plan'",
        )
        .get()?.n,
      1,
    );
  } finally {
    f.sqlite.close();
  }
});
void test('legacy incident mapping retains original detection and old resolution without certifying recovery', async () => {
  const f = fixture(),
    m = await import(path);
  try {
    f.sqlite
      .prepare(
        "INSERT INTO operational_incidents VALUES('old','INC-OLD','critical','resolved','Old incident','Retained original detail','Old unverified resolution','sa','old-create',?,?,?)",
      )
      .run(now - 86_400_000, now - 1000, now - 1000);
    const before = f.sqlite
      .prepare('SELECT * FROM operational_incidents')
      .get();
    const result = await m.importLegacyOperationalIncident(
      f.db,
      ctx('sa', 'map-legacy', null),
      { ...input, legacyId: 'old', expectedLegacyUpdatedAt: now - 1000 },
    );
    const row = await m.readIncident(
      f.db,
      'sa',
      result.incidentId,
      'test',
      now,
    );
    assert.equal(row.firstSeenAt, now - 86_400_000);
    assert.equal(row.resolvedAt, null);
    assert.equal(row.legacyIncidentId, 'old');
    assert.deepEqual(
      f.sqlite.prepare('SELECT * FROM operational_incidents').get(),
      before,
    );
    assert.equal(
      f.sqlite
        .prepare(
          "SELECT COUNT(*) n FROM service_incident_legacy_links WHERE legacy_incident_id='old'",
        )
        .get()?.n,
      1,
    );
  } finally {
    f.sqlite.close();
  }
});
void test('revoked owner is rerouted to an actual eligible backup in the parent access-change batch without resetting clocks', async () => {
  const f = fixture(),
    m = await import(path);
  try {
    const created = await opened(f);
    let row = await m.readIncident(f.db, 'sa', created.incidentId, 'test', now);
    await m.executeIncidentCommand(
      f.db,
      ctx('sa', 'assign-before-revoke', row.version),
      {
        incidentId: row.id,
        action: 'assign',
        ownerId: 'admin',
        backupId: 'sa',
        reason: 'Assign the actual responder with eligible backup',
      },
    );
    row = await m.readIncident(f.db, 'sa', row.id, 'test', now);
    const before = {
      firstSeen: row.firstSeenAt,
      ackDue: row.acknowledgeDueAt,
      planDue: row.planDueAt,
      next: row.nextUpdateAt,
    };
    const statements = await m.prepareIncidentOwnerChangeStatements(
      f.db,
      ctx('sa', 'access-change', row.version, now + 1000),
      {
        incidentId: row.id,
        ownerId: 'sa',
        excludedUserIds: ['admin'],
        reason: 'The former owner lost incident authority',
      },
    );
    await f.db.batch([
      f.db.prepare(
        "UPDATE staff_permission_profiles SET permissions_json='[]' WHERE user_id='admin'",
      ),
      ...statements,
    ]);
    row = await m.readIncident(f.db, 'sa', row.id, 'test', now + 1000);
    assert.equal(row.ownerId, 'sa');
    assert.equal(row.backupId, null);
    assert.deepEqual(
      {
        firstSeen: row.firstSeenAt,
        ackDue: row.acknowledgeDueAt,
        planDue: row.planDueAt,
        next: row.nextUpdateAt,
      },
      before,
    );
    await assert.rejects(
      m.executeIncidentCommand(
        f.db,
        ctx('admin', 'old-tab', row.version, now + 1000),
        {
          incidentId: row.id,
          action: 'acknowledge',
          reason: 'A revoked old tab cannot acknowledge',
        },
      ),
    );
  } finally {
    f.sqlite.close();
  }
});
void test('incident links enforce source authority and recurrence retains the preceding resolved episode', async () => {
  const f = fixture(),
    m = await import(path);
  try {
    f.sqlite.exec(
      "CREATE TABLE refund_obligations(id TEXT PRIMARY KEY);INSERT INTO refund_obligations VALUES('private-refund')",
    );
    const created = await opened(f);
    let row = await m.readIncident(f.db, 'sa', created.incidentId, 'test', now);
    await assert.rejects(
      m.executeIncidentCommand(
        f.db,
        ctx('admin', 'link-private', row.version),
        {
          incidentId: row.id,
          action: 'link',
          sourceType: 'refund',
          sourceId: 'private-refund',
          reason: 'A technical grant is not refund evidence access',
        },
      ),
    );
    await proof(f);
    await m.executeIncidentCommand(
      f.db,
      ctx('sa', 'resolve-first', row.version, now + 180_000),
      {
        incidentId: row.id,
        action: 'resolve',
        reason: 'Two matching functional observations confirmed recovery',
        cause: 'Compatible current form repaired',
      },
    );
    const second = await m.createIncident(
      f.db,
      ctx('sa', 'new-episode', null, now + 240_000),
      input,
    );
    row = await m.readIncident(
      f.db,
      'sa',
      second.incidentId,
      'test',
      now + 240_000,
    );
    assert.equal(row.episode, 2);
    assert.equal(row.priorIncidentId, created.incidentId);
  } finally {
    f.sqlite.close();
  }
});
void test('native incident events atomically notify only assigned eligible staff and Super Admin with no private payload or duplicate replay', async () => {
  const f = fixture(),
    m = await import(path);
  try {
    f.sqlite.exec(
      "INSERT INTO users VALUES('other-tech','active');INSERT INTO user_roles VALUES('other-tech','admin');INSERT INTO staff_permission_profiles VALUES('other-tech','[\"system.health.view\",\"system.incidents.manage\"]')",
    );
    const created = await opened(f);
    assert.equal(
      f.sqlite.prepare('SELECT COUNT(*) n FROM notification_messages').get()?.n,
      2,
    );
    const row = await m.readIncident(f.db, 'sa', created.incidentId, 'test', now);
    const context = ctx('sa', 'assign-notice', row.version),
      input = {
        incidentId: row.id,
        action: 'assign',
        ownerId: 'admin',
        backupId: 'sa',
        reason: 'Assign the actual eligible technical owner',
      };
    const assigned = await m.executeIncidentCommand(f.db, context, input);
    await m.executeIncidentCommand(f.db, context, input);
    const notices = f.sqlite
      .prepare(
        'SELECT recipient_user_id AS userId,channel,body_en AS body,related_id AS eventId,request_id AS requestId,required_permission AS requiredPermission FROM notification_messages WHERE related_id=?',
      )
      .all(assigned.eventId);
    assert.equal(notices.length, 4);
    assert.deepEqual(
      [...new Set(notices.map((value) => value.userId))].sort((first,second)=>String(first)<String(second)?-1:String(first)>String(second)?1:0),
      ['admin', 'sa'],
    );
    assert.ok(
      notices.every(
        (value) =>
          !String(value.body).includes(input.reason) &&
          !String(value.body).includes('Product submissions cannot'),
      ),
    );
    const old = f.sqlite
      .prepare(
        'SELECT * FROM notification_messages WHERE related_id<>? LIMIT 1',
      )
      .get(assigned.eventId)!;
    assert.equal(
      await m.isCurrentIncidentNotice(
        f.db,
        {
          template: old.template_key,
          relatedId: old.related_id,
          relatedType: old.related_type,
          userId: old.recipient_user_id,
          audience: 'staff',
          channel: old.channel,
          requestId: old.request_id,
        },
        now,
      ),
      false,
    );
  } finally {
    f.sqlite.close();
  }
});
void test('a real non-email detector creates one governed critical incident and routes actual duty coverage in the same batch', async () => {
  const f = fixture(),
    m = await import(path);
  try {
    f.sqlite
      .prepare(
        "INSERT INTO team_duties(id,department,label,required_permission,reserved_super_admin,primary_user_id,updated_at,updated_by) VALUES('system_incidents','Systems','Scoped incidents','system.incidents.manage',0,'admin',?,'sa')",
      )
      .run(now);
    f.sqlite.exec(
      "INSERT INTO team_duty_backups VALUES('system_incidents','sa',0)",
    );
    for (let n = 0; n < 2; n++)
      await health.recordServiceHealthObservation(f.db, {
        environment: 'test',
        serviceKey: 'application.availability',
        runKey: 'unavailable-' + n,
        observedAt: now + n,
        successful: false,
        functionalSuccess: false,
        eligibleBacklog: 0,
        oldestEligibleAt: null,
        progressCount: 0,
        failureCategory: 'worker',
        sourceKind: 'watchdog',
        evidenceScope: 'release-one',
      });
    const state = await health.evaluateServiceHealth(
      f.db,
      {
        environment: 'test',
        serviceKey: 'application.availability',
        expectedSince: now,
        now: now + 1,
        evidenceScope: 'release-one',
      },
      m.incidentHealthTransitionStatements,
    );
    assert.equal(state.incident?.severity, 'critical');
    const row = await m.readIncident(
      f.db,
      'sa',
      state.incident!.id,
      'test',
      now + 1,
    );
    assert.equal(row.ownerId, 'admin');
    assert.equal(row.backupId, 'sa');
    assert.equal(row.acknowledgeDueAt, now + 1 + 900_000);
    assert.equal(
      f.sqlite.prepare('SELECT COUNT(*) n FROM notification_messages').get()?.n,
      4,
    );
  } finally {
    f.sqlite.close();
  }
});
function apiFormFixture(f: ReturnType<typeof fixture>) {
  f.sqlite.exec('ALTER TABLE users ADD COLUMN auth_subject TEXT;UPDATE users SET auth_subject=id');
  f.sqlite.exec(
    `CREATE TABLE form_config_versions(id TEXT PRIMARY KEY,form_id TEXT,version INTEGER,status TEXT,config_json TEXT,published_at INTEGER);CREATE TABLE form_answer_sets(id TEXT PRIMARY KEY,form_id TEXT,request_id TEXT,config_version_id TEXT,subject_type TEXT,subject_id TEXT,actor_id TEXT,answers_json TEXT,created_at INTEGER,UNIQUE(form_id,request_id));ALTER TABLE audit_logs ADD COLUMN next_json TEXT;`,
  );
  f.sqlite.exec(readFileSync('drizzle/0151_form_health_records.sql', 'utf8'));
  f.sqlite
    .prepare(
      "INSERT INTO form_config_versions VALUES('incident-form-1','staff.incident-review',1,'published',?,1)",
    )
    .run(JSON.stringify({ formId: 'staff.incident-review', fields: [] }));
  globalThis.incidentApiDb = f.db;
  globalThis.incidentApiActor = {
    id: 'sa',
    role: 'super_admin',
    permissions: [],
  };
}
void test('protected incident API uses the registered current form, fixed runtime scope and domain permission instead of client claims', async () => {
  const f = fixture();
  apiFormFixture(f);
  const routePath = '../app/api/admin/system-health/incidents/route';
  const api = await import(routePath);
  try {
    const payload = {
      ...input,
      action: 'create',
      expectedRevision: null,
      requestId: 'api-create',
      formVersion: 1,
      customAnswers: [],
    };
    delete (payload as Partial<typeof payload>).environment;
    const request = (body: unknown, cross = false) =>
      new Request(
        'https://incident-fixture.test/api/admin/system-health/incidents',
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'sec-fetch-site': cross ? 'cross-site' : 'same-origin',
          },
          body: JSON.stringify(body),
        },
      );
    assert.equal((await api.POST(request(payload, true))).status, 403);
    globalThis.incidentApiActor = {
      id: 'admin',
      role: 'admin',
      permissions: ['system.health.view'],
    };
    assert.equal((await api.POST(request(payload))).status, 403);
    globalThis.incidentApiActor = {
      id: 'sa',
      role: 'super_admin',
      permissions: [],
    };
    assert.equal(
      (await api.POST(request({ ...payload, environment: 'production' })))
        .status,
      409,
    );
    assert.equal(
      (await api.POST(request({ ...payload, formVersion: 99 }))).status,
      409,
    );
    const saved = await api.POST(request(payload));
    assert.equal(saved.status, 200);
    assert.equal((await saved.json()).environment, 'test');
    assert.equal(
      f.sqlite.prepare('SELECT COUNT(*) n FROM form_answer_sets').get()?.n,
      1,
    );
    assert.equal((await api.POST(request(payload))).status, 200);
    assert.equal(
      f.sqlite.prepare('SELECT COUNT(*) n FROM service_health_incidents').get()
        ?.n,
      1,
    );
  } finally {
    f.sqlite.close();
    globalThis.incidentApiActor = null;
  }
});
void test('email transition enrichment preserves the original notice family while adding real ownership and ordinary automatic recovery', async () => {
  const f = fixture(),
    m = await import(path);
  try {
    f.sqlite
      .prepare(
        "INSERT INTO team_duties(id,department,label,required_permission,reserved_super_admin,primary_user_id,updated_at,updated_by) VALUES('system_incidents','Systems','Scoped incidents','system.incidents.manage',0,'admin',?,'sa')",
      )
      .run(now);
    f.sqlite.exec(
      "INSERT INTO team_duty_backups VALUES('system_incidents','sa',0)",
    );
    const scope = {
      environment: 'test' as const,
      serviceKey: 'email.sender',
      expectedSince: now - 400_000,
      now,
      evidenceScope: 'release-one',
    };
    const opened = await health.evaluateServiceHealth(
      f.db,
      scope,
      m.incidentHealthTransitionStatements,
    );
    const row = await m.readIncident(
      f.db,
      'sa',
      opened.incident!.id,
      'test',
      now,
    );
    assert.equal(row.ownerId, 'admin');
    assert.equal(row.closureRequired, 0);
    assert.equal(
      f.sqlite
        .prepare(
          "SELECT COUNT(*) n FROM notification_messages WHERE template_key='business.system.email_health'",
        )
        .get()?.n,
      4,
    );
    assert.equal(
      f.sqlite
        .prepare(
          "SELECT COUNT(*) n FROM notification_messages WHERE template_key='business.system.incident'",
        )
        .get()?.n,
      0,
    );
    for (const at of [now + 1, now + 60_001])
      await health.recordServiceHealthObservation(f.db, {
        environment: 'test',
        serviceKey: 'email.sender',
        runKey: 'email-recovery-' + at,
        observedAt: at,
        successful: true,
        functionalSuccess: true,
        eligibleBacklog: 0,
        oldestEligibleAt: null,
        progressCount: 0,
        failureCategory: null,
        sourceKind: 'sender',
        evidenceScope: 'release-one',
      });
    const recovered = await health.evaluateServiceHealth(
      f.db,
      { ...scope, now: now + 60_001 },
      m.incidentHealthTransitionStatements,
    );
    assert.equal(recovered.incident?.state, 'resolved');
    assert.equal(
      f.sqlite
        .prepare(
          "SELECT COUNT(*) n FROM notification_messages WHERE template_key='business.system.email_health'",
        )
        .get()?.n,
      8,
    );
    assert.equal(
      f.sqlite
        .prepare(
          "SELECT COUNT(*) n FROM notification_messages WHERE template_key='business.system.incident'",
        )
        .get()?.n,
      0,
    );
  } finally {
    f.sqlite.close();
  }
});
void test('sensitive email closure requires Super Admin and retains one recovery notice family', async () => {
  const f = fixture(),
    m = await import(path);
  try {
    const scope = {
        environment: 'test' as const,
        serviceKey: 'email.sender',
        expectedSince: now - 400_000,
        now,
        evidenceScope: 'release-one',
      },
      opened = await health.evaluateServiceHealth(
        f.db,
        scope,
        m.incidentHealthTransitionStatements,
      ),
      id = opened.incident!.id;
    await m.executeIncidentCommand(f.db, ctx('admin', 'claim-email', '0:0'), {
      incidentId: id,
      action: 'assign',
      ownerId: 'admin',
      reason: 'Explicitly claim the unassigned email incident',
    });
    await m.executeIncidentCommand(
      f.db,
      ctx('admin', 'sensitive-email', '1:1'),
      {
        incidentId: id,
        action: 'impact',
        impactClass: 'security',
        impactSummary: 'Credential configuration requires security review',
        reason: 'Verified sensitive operational impact',
      },
    );
    for (const at of [now + 1, now + 60_001])
      await health.recordServiceHealthObservation(f.db, {
        environment: 'test',
        serviceKey: 'email.sender',
        runKey: 'sensitive-email-' + at,
        observedAt: at,
        successful: true,
        functionalSuccess: true,
        eligibleBacklog: 0,
        oldestEligibleAt: null,
        progressCount: 0,
        failureCategory: null,
        sourceKind: 'sender',
        evidenceScope: 'release-one',
      });
    await health.evaluateServiceHealth(
      f.db,
      { ...scope, now: now + 60_001 },
      m.incidentHealthTransitionStatements,
    );
    const row = await m.readIncident(f.db, 'sa', id, 'test', now + 60_001);
    assert.notEqual(row.state, 'resolved');
    const command = {
      incidentId: id,
      action: 'resolve' as const,
      reason: 'Verified current functional evidence and cleared affected work',
      cause: 'Configuration corrected and functional recovery verified',
    };
    await assert.rejects(
      m.executeIncidentCommand(
        f.db,
        {
          ...ctx('admin', 'sensitive-email-denied', row.version),
          now: now + 60_001,
        },
        command,
      ),
      /Super Admin/,
    );
    const before = f.sqlite
      .prepare(
        "SELECT COUNT(*) n FROM notification_messages WHERE template_key='business.system.incident'",
      )
      .get()?.n;
    await m.executeIncidentCommand(
      f.db,
      {
        ...ctx('sa', 'sensitive-email-closed', row.version),
        now: now + 60_001,
      },
      command,
    );
    assert.equal(
      f.sqlite
        .prepare(
          "SELECT COUNT(*) n FROM notification_messages WHERE template_key='business.system.incident'",
        )
        .get()?.n,
      before,
    );
    assert.equal(
      f.sqlite
        .prepare(
          "SELECT COUNT(*) n FROM notification_messages WHERE template_key='business.system.email_health' AND subject_en LIKE '%recovered%'",
        )
        .get()?.n,
      4,
    );
  } finally {
    f.sqlite.close();
  }
});
void test('manage-only responder reads assigned incidents without gaining the global health view', async () => {
  const f = fixture(),
    m = await import(path);
  apiFormFixture(f);
  try {
    const own = await opened(f),
      other = await m.createIncident(f.db, ctx('sa', 'other-scope', null), {
        ...input,
        serviceKey: 'files.private',
      });
    await m.executeIncidentCommand(f.db, ctx('sa', 'own-assignment', '0:0'), {
      incidentId: own.incidentId,
      action: 'assign',
      ownerId: 'admin',
      reason: 'Assign the eligible scoped responder',
    });
    f.sqlite
      .prepare(
        'UPDATE staff_permission_profiles SET permissions_json=? WHERE user_id=?',
      )
      .run('["system.incidents.manage"]', 'admin');
    assert.equal(
      (await m.readIncident(f.db, 'admin', own.incidentId, 'test', now)).id,
      own.incidentId,
    );
    assert.deepEqual(
      (await m.listIncidents(f.db, 'admin', 'test', now)).map(
        (row: { id: string }) => row.id,
      ),
      [own.incidentId],
    );
    await assert.rejects(
      m.readIncident(f.db, 'admin', other.incidentId, 'test', now),
      /assigned|scope/,
    );
    assert.deepEqual(await m.listLegacyIncidentMappings(f.db, 'admin'), []);
    globalThis.incidentApiActor = {
      id: 'admin',
      role: 'admin',
      permissions: ['system.incidents.manage'],
    };
    const routePath = '../app/api/admin/system-health/incidents/route',
      api = await import(routePath);
    const response = await api.GET();
    assert.equal(response.status, 200);
    assert.equal((await response.json()).incidents.length, 1);
  } finally {
    f.sqlite.close();
    globalThis.incidentApiActor = null;
  }
});
void test('competing identical command returns the committed receipt instead of repeating its native event', async () => {
  const f = fixture(),
    m = await import(path);
  try {
    const created = await opened(f),
      context = ctx('sa', 'competing-plan', '0:0'),
      command = {
        incidentId: created.incidentId,
        action: 'plan' as const,
        plan: 'Contain the affected supported workflow',
        nextAction: 'Verify the scoped functional path',
        nextUpdateAt: now + 600_000,
        reason: 'Record a current containment commitment',
      };
    const original = f.db.batch.bind(f.db);
    let winner: unknown;
    const raced = {
      prepare: f.db.prepare.bind(f.db),
      batch: async (statements: D1PreparedStatement[]) => {
        winner = await m.executeIncidentCommand(f.db, context, command);
        return original(statements);
      },
    } as D1Database;
    assert.deepEqual(
      await m.executeIncidentCommand(raced, context, command),
      winner,
    );
    assert.equal(
      f.sqlite
        .prepare(
          "SELECT COUNT(*) n FROM service_incident_events WHERE action='plan'",
        )
        .get()?.n,
      1,
    );
  } finally {
    f.sqlite.close();
  }
});
void test('incident API rejects a publication race atomically and preserves all entered request data', async () => {
  const f = fixture();
  apiFormFixture(f);
  const routePath = '../app/api/admin/system-health/incidents/route',
    api = await import(routePath);
  try {
    const original = f.db.batch.bind(f.db);
    let publish = true;
    globalThis.incidentApiDb = {
      prepare: f.db.prepare.bind(f.db),
      batch: async (statements: D1PreparedStatement[]) => {
        if (publish) {
          publish = false;
          f.sqlite
            .prepare(
              "INSERT INTO form_config_versions VALUES('incident-form-2','staff.incident-review',2,'published',?,2)",
            )
            .run(
              JSON.stringify({ formId: 'staff.incident-review', fields: [] }),
            );
        }
        return original(statements);
      },
    } as D1Database;
    const payload = {
      ...input,
      action: 'create',
      expectedRevision: null,
      requestId: 'publication-race',
      formVersion: 1,
      customAnswers: [],
    };
    delete (payload as Partial<typeof payload>).environment;
    const response = await api.POST(
      new Request(
        'https://incident-fixture.test/api/admin/system-health/incidents',
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'sec-fetch-site': 'same-origin',
          },
          body: JSON.stringify(payload),
        },
      ),
    );
    assert.equal(response.status, 409);
    assert.equal(
      f.sqlite.prepare('SELECT COUNT(*) n FROM service_health_incidents').get()
        ?.n,
      0,
    );
    assert.equal(
      f.sqlite.prepare('SELECT COUNT(*) n FROM form_answer_sets').get()?.n,
      0,
    );
  } finally {
    f.sqlite.close();
    globalThis.incidentApiActor = null;
  }
});
void test('responders cannot mutate a forged assigned incident and a concurrent owner change aborts their own action', async () => {
  const f = fixture(),
    m = await import(path);
  try {
    const created = await opened(f);
    await m.executeIncidentCommand(
      f.db,
      ctx('sa', 'assign-super-admin', '0:0'),
      {
        incidentId: created.incidentId,
        action: 'assign',
        ownerId: 'sa',
        reason: 'Keep this incident with its current owner',
      },
    );
    const command = {
      incidentId: created.incidentId,
      action: 'plan' as const,
      plan: 'Contain the affected supported workflow',
      nextAction: 'Verify the scoped functional path',
      nextUpdateAt: now + 600_000,
      reason: 'Record a current containment commitment',
    };
    await assert.rejects(
      m.executeIncidentCommand(
        f.db,
        ctx('admin', 'forged-plan', '1:1'),
        command,
      ),
      /assigned|owner|scope/,
    );
    await assert.rejects(
      m.executeIncidentCommand(f.db, ctx('admin', 'forged-takeover', '1:1'), {
        incidentId: created.incidentId,
        action: 'assign',
        ownerId: 'admin',
        reason: 'Attempt takeover using another valid incident identifier',
      }),
      /assigned|owner|scope/,
    );
    const other = await m.createIncident(f.db, ctx('sa', 'claimable', null), {
      ...input,
      serviceKey: 'files.public',
    });
    await m.executeIncidentCommand(
      f.db,
      ctx('admin', 'explicit-claim', '0:0'),
      {
        incidentId: other.incidentId,
        action: 'assign',
        ownerId: 'admin',
        reason: 'Explicitly claim this unassigned incident',
      },
    );
    const original = f.db.batch.bind(f.db);
    const raced = {
      prepare: f.db.prepare.bind(f.db),
      batch: async (statements: D1PreparedStatement[]) => {
        await m.executeIncidentCommand(
          f.db,
          ctx('sa', 'owner-wins-race', '1:1'),
          {
            incidentId: other.incidentId,
            action: 'assign',
            ownerId: 'sa',
            reason:
              'Reassign responsibility before the competing command commits',
          },
        );
        return original(statements);
      },
    } as D1Database;
    await assert.rejects(
      m.executeIncidentCommand(raced, ctx('admin', 'lost-owner-race', '1:1'), {
        ...command,
        incidentId: other.incidentId,
      }),
    );
    assert.equal(
      f.sqlite
        .prepare(
          "SELECT COUNT(*) n FROM service_incident_events WHERE action='plan'",
        )
        .get()?.n,
      0,
    );
  } finally {
    f.sqlite.close();
  }
});
void test('current and commit-time unavailability prevent responder actions and new assignment', async () => {
  const f = fixture(),
    m = await import(path);
  try {
    const created = await opened(f);
    await m.executeIncidentCommand(
      f.db,
      ctx('sa', 'available-assignment', '0:0'),
      {
        incidentId: created.incidentId,
        action: 'assign',
        ownerId: 'admin',
        reason: 'Assign the presently available responder',
      },
    );
    const command = {
        incidentId: created.incidentId,
        action: 'plan' as const,
        plan: 'Contain the supported workflow failure',
        nextAction: 'Verify actual current functional evidence',
        nextUpdateAt: now + 600_000,
        reason: 'Record scoped available responder work',
      },
      original = f.db.batch.bind(f.db);
    const raced = {
      prepare: f.db.prepare.bind(f.db),
      batch: async (statements: D1PreparedStatement[]) => {
        f.sqlite
          .prepare(
            "INSERT INTO team_availability VALUES('absence','admin',0,?,0,'Verified unavailable',0,'sa',?)",
          )
          .run(Number.MAX_SAFE_INTEGER, now);
        return original(statements);
      },
    } as D1Database;
    await assert.rejects(
      m.executeIncidentCommand(
        raced,
        ctx('admin', 'availability-race', '1:1'),
        command,
      ),
    );
    assert.equal(
      f.sqlite
        .prepare(
          "SELECT COUNT(*) n FROM service_incident_events WHERE action='plan'",
        )
        .get()?.n,
      0,
    );
    await assert.rejects(
      m.executeIncidentCommand(
        f.db,
        ctx('admin', 'absent-action', '1:1'),
        command,
      ),
      /available/,
    );
    await assert.rejects(
      m.executeIncidentCommand(f.db, ctx('sa', 'absent-assignment', '1:1'), {
        incidentId: created.incidentId,
        action: 'assign',
        ownerId: 'admin',
        reason: 'An absent responder cannot receive new work',
      }),
      /unavailable/,
    );
  } finally {
    f.sqlite.close();
  }
});
void test('duplicate mapping requires the oldest equally protected canonical episode and preserves both source clocks', async () => {
  const f = fixture(),
    m = await import(path);
  try {
    const original = await opened(f, { severity: 'critical' }),
      later = await m.createIncident(
        f.db,
        ctx('sa', 'later-duplicate', null, now + 100_000),
        { ...input, serviceKey: 'files.private' },
      );
    await assert.rejects(
      m.executeIncidentCommand(
        f.db,
        ctx('sa', 'wrong-canonical', '0:0', now + 110_000),
        {
          incidentId: original.incidentId,
          action: 'merge',
          targetIncidentId: later.incidentId,
          reason: 'Verified duplicate of the same scoped failure',
        },
      ),
      /oldest|canonical|severity/,
    );
    await m.executeIncidentCommand(
      f.db,
      ctx('sa', 'correct-canonical', '0:0', now + 110_000),
      {
        incidentId: later.incidentId,
        action: 'merge',
        targetIncidentId: original.incidentId,
        reason:
          'Verified duplicate retains the oldest protected response episode',
      },
    );
    const canonical = await m.readIncident(
        f.db,
        'sa',
        original.incidentId,
        'test',
        now + 110_000,
      ),
      report = await m.readIncident(
        f.db,
        'sa',
        later.incidentId,
        'test',
        now + 110_000,
      );
    assert.equal(canonical.firstSeenAt, now);
    assert.equal(canonical.acknowledgeDueAt, now + 900_000);
    assert.equal(report.firstSeenAt, now + 100_000);
    assert.equal(report.mergedInto, canonical.id);
    assert.equal(report.resolvedAt, null);
    assert.equal(canonical.links[0]?.sourceId, report.id);
  } finally {
    f.sqlite.close();
  }
});
void test('a manage-only technical reporter explicitly claims the new incident without global read authority', async () => {
  const f = fixture(),
    m = await import(path);
  try {
    f.sqlite
      .prepare(
        'UPDATE staff_permission_profiles SET permissions_json=? WHERE user_id=?',
      )
      .run('["system.incidents.manage"]', 'admin');
    const result = await m.createIncident(
      f.db,
      ctx('admin', 'report-and-claim', null),
      input,
    );
    const row = await m.readIncident(
      f.db,
      'admin',
      result.incidentId,
      'test',
      now,
    );
    assert.equal(row.ownerId, 'admin');
    assert.equal(row.acknowledgedAt, null);
    assert.equal(row.resolvedAt, null);
  } finally {
    f.sqlite.close();
  }
});
function raceIncidentRead(
  f: ReturnType<typeof fixture>,
  match: string,
  change: () => Promise<unknown> | void,
) {
  let fired = false;
  return {
    prepare(sql: string) {
      const statement = f.db.prepare(sql),
        original = statement.all.bind(statement);
      statement.all = async () => {
        if (!fired && sql.includes(match)) {
          fired = true;
          await change();
        }
        return original();
      };
      return statement;
    },
    batch: f.db.batch.bind(f.db),
  } as D1Database;
}
void test('incident reads reprove current permission and exact assigned source after asynchronous projection races', async () => {
  const m = await import(path);
  for (const mode of ['reassigned', 'revoked'] as const) {
    const f = fixture();
    try {
      const created = await opened(f);
      await m.executeIncidentCommand(
        f.db,
        ctx('sa', 'read-race-assignment', '0:0'),
        {
          incidentId: created.incidentId,
          action: 'assign',
          ownerId: 'admin',
          reason: 'Assign the read race scoped responder',
        },
      );
      if (mode === 'reassigned') {
        f.sqlite
          .prepare(
            'UPDATE staff_permission_profiles SET permissions_json=? WHERE user_id=?',
          )
          .run('["system.incidents.manage"]', 'admin');
        const raced = raceIncidentRead(
          f,
          'FROM service_incident_events WHERE incident_id',
          () =>
            m.executeIncidentCommand(
              f.db,
              ctx('sa', 'read-reassignment', '1:1'),
              {
                incidentId: created.incidentId,
                action: 'assign',
                ownerId: 'sa',
                reason: 'Reassign while the old detail projection is pending',
              },
            ),
        );
        await assert.rejects(
          m.readIncident(raced, 'admin', created.incidentId, 'test', now),
          /permission|scope|changed/,
        );
      } else {
        const raced = raceIncidentRead(
          f,
          'FROM service_health_observations',
          () => {
            f.sqlite
              .prepare(
                'UPDATE staff_permission_profiles SET permissions_json=? WHERE user_id=?',
              )
              .run('[]', 'admin');
          },
        );
        await assert.rejects(
          m.listIncidents(raced, 'admin', 'test', now),
          /permission|scope|changed/,
        );
      }
    } finally {
      f.sqlite.close();
    }
  }
});
void test('durable incident ownership scan rotates past twenty valid old owners to repair the next revoked owner', async () => {
  const f = fixture(),
    m = await import(path);
  try {
    for (let i = 0; i < 21; i++) {
      const id = 'incident-' + String(i).padStart(2, '0'),
        at = now + i;
      f.sqlite
        .prepare(
          "INSERT INTO service_health_incidents(id,environment,service_key,episode,state,severity,first_seen_at,last_seen_at,failure_category,revision) VALUES(?,'test',?,1,'detected','high',?,?,'worker',0)",
        )
        .run(id, 'fixture.' + i, at, at);
      f.sqlite
        .prepare(
          'INSERT INTO service_incident_governance(incident_id,failure_signature,owner_id,backup_id,acknowledge_due_at,plan_due_at,update_interval_ms,next_update_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)',
        )
        .run(
          id,
          'fixture.' + i,
          i < 20 ? 'sa' : 'admin',
          i < 20 ? null : 'sa',
          at + 3_600_000,
          at + 14_400_000,
          14_400_000,
          at + 14_400_000,
          at,
        );
    }
    f.sqlite.exec("UPDATE users SET status='disabled' WHERE id='admin'");
    assert.equal(
      (
        await m.reconcileIncidentOwnership(f.db, {
          environment: 'test',
          now,
          limit: 20,
        })
      ).changed,
      0,
    );
    assert.equal(
      (
        await m.reconcileIncidentOwnership(f.db, {
          environment: 'test',
          now: now + 1,
          limit: 20,
        })
      ).changed,
      1,
    );
    const row = await m.readIncident(
      f.db,
      'sa',
      'incident-20',
      'test',
      now + 1,
    );
    assert.equal(row.ownerId, 'sa');
    assert.equal(row.firstSeenAt, now + 20);
    assert.equal(row.acknowledgeDueAt, now + 20 + 3_600_000);
  } finally {
    f.sqlite.close();
  }
});
