import assert from 'node:assert/strict';
import test from 'node:test';
import { createIncentiveDb, seedIncentiveCustomer, seedIncentiveInventory } from './helpers/incentive-db';
import { captureDatabaseHealthScope } from '../lib/db/health-context';
import { getProfileContactLocations, saveProfileSupport } from '../lib/sellers/profile-contact-locations';
import { ingestCommittedFormSaves } from '../lib/operations/form-health';
import { sweepCommittedFormSaves } from '../lib/operations/form-save-sweep';

void test('native D1 bounded form-health queue advances past real noops and atomically retains original save evidence', async () => {
  const fixture = await createIncentiveDb();
  const { db } = fixture;
  try {
    await seedIncentiveCustomer(db);
    await seedIncentiveInventory(db);
    await db.prepare("UPDATE seller_profiles SET support_email='',support_phone='' WHERE id='seller'").run();
    const now = Date.now(), releaseId = 'native-d1-queue-test';
    captureDatabaseHealthScope(db, { HASTABAZAAR_RUNTIME_ENV: 'test', APP_ORIGIN: 'http://localhost:3018', HASTABAZAAR_RELEASE_ID: releaseId, NODE_ENV: 'test' });
    const view = await getProfileContactLocations(db, 'seller', 'customer');
    const command = { sellerId: 'seller', actorId: 'customer', expectedRevision: view.support.revision, email: '', phoneCountry: 'NP', phone: '', publicDisclosureConfirmed: true, requestId: 'native-noop', now };
    await saveProfileSupport(db, command);
    await saveProfileSupport(db, { ...command, requestId: 'native-save', email: 'private-value@local.hastabazaar.test', now: now + 1 });
    const scope = { environment: 'test' as const, releaseId, now: now + 1000, limit: 1 };
    const originalReceipts = (await db.prepare('SELECT * FROM audit_logs WHERE command_key IS NOT NULL ORDER BY id').all()).results;
    const copied = async () => (await db.prepare("SELECT a.request_id FROM form_health_observations h JOIN audit_logs a ON a.id=h.evidence_id WHERE h.evidence_kind='native_command' ORDER BY h.observed_at,h.id").all<{ request_id: string }>()).results.map(row => row.request_id);
    const noop = await sweepCommittedFormSaves(db, scope);
    assert.equal(noop.scanned, 1);
    assert.equal(noop.recorded, 0);
    assert.equal(noop.budgetExhausted, true);
    assert.deepEqual(await copied(), []);
    const beforeCursor = (await db.prepare("SELECT * FROM operational_reminder_cursors WHERE family LIKE 'form-saves:%' ORDER BY family").all()).results;
    const interrupted = Object.create(db) as D1Database;
    interrupted.batch = (async (statements: D1PreparedStatement[]) => db.batch([...statements, db.prepare("INSERT INTO staff_permission_guards(id,valid) VALUES('abort-native-scan',0)")])) as D1Database['batch'];
    await assert.rejects(ingestCommittedFormSaves(interrupted, scope));
    assert.deepEqual(await copied(), [], 'failed native batch cannot retain an observation');
    // Lease acquisition/release may advance cursor revision, but not its consumed position.
    const afterCursor = (await db.prepare("SELECT * FROM operational_reminder_cursors WHERE family LIKE 'form-saves:%' ORDER BY family").all()).results;
    assert.deepEqual(afterCursor.map(row => ({ family: row.family, cursor: row.cursor })), beforeCursor.map(row => ({ family: row.family, cursor: row.cursor })));
    assert.equal(await ingestCommittedFormSaves(db, scope), 1);
    assert.deepEqual(await copied(), ['native-save']);
    assert.equal(await ingestCommittedFormSaves(db, scope), 0);
    assert.deepEqual((await db.prepare('SELECT * FROM audit_logs WHERE command_key IS NOT NULL ORDER BY id').all()).results, originalReceipts);
    const observation = await db.prepare("SELECT * FROM form_health_observations WHERE evidence_kind='native_command'").first<{ observed_at: number }>();
    assert.equal(observation!.observed_at, now + 1);
    assert.doesNotMatch(JSON.stringify(observation), /private-value/);
    await assert.rejects(db.prepare("UPDATE form_health_observations SET observed_at=observed_at+1 WHERE evidence_kind='native_command'").run(), /retained/);
    await assert.rejects(db.prepare("UPDATE audit_logs SET next_json='{}' WHERE request_id='native-save'").run(), /provenance_retained/);
    assert.equal((await db.prepare('PRAGMA foreign_keys').first<{ foreign_keys: number }>())!.foreign_keys, 1);
    assert.deepEqual((await db.prepare('PRAGMA foreign_key_check').all()).results, []);
  } finally { await fixture.dispose(); }
});
