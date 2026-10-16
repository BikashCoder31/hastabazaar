import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { FORM_REGISTRY } from '../lib/forms/registry';
import { isFormCatalogEditable } from '../lib/forms/catalog-presentation';
import { FEATURE_MANAGED_BASELINE_FORM_IDS } from '../lib/db/repositories/form-catalog';
import { inspectFormPreviewReadiness, REQUIRED_PREVIEW_FORM_IDS } from '../scripts/staging/form-preview-readiness.mjs';

const catalogIds = Object.values(FORM_REGISTRY).filter(isFormCatalogEditable).map(form => form.id);
function fixture(formIds: readonly string[]) {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE users(id TEXT PRIMARY KEY NOT NULL);
    CREATE TABLE form_config_versions(form_id TEXT, version INTEGER, status TEXT, config_json TEXT, published_at INTEGER);`);
  for (const formId of formIds) db.prepare('INSERT INTO form_config_versions VALUES(?,1,\'published\',?,1)')
    .run(formId, JSON.stringify({ formId, fields: [] }));
  return db;
}

void test('preview readiness covers every catalog form and every required feature-managed form', () => {
  const expected = new Set([...catalogIds, ...FEATURE_MANAGED_BASELINE_FORM_IDS]);
  for (const formId of expected) assert.ok(REQUIRED_PREVIEW_FORM_IDS.includes(formId), `Missing preview check for ${formId}`);
});

void test('a complete catalog alone still reports the missing feature-managed settings and sign-in tables', () => {
  const db = fixture(catalogIds);
  try {
    const before = db.prepare('SELECT * FROM form_config_versions ORDER BY form_id').all();
    const result = inspectFormPreviewReadiness(db);
    assert.equal(result.ready, false);
    assert.equal(result.readyForms, catalogIds.length);
    assert.deepEqual(result.missingForms.toSorted(), [...FEATURE_MANAGED_BASELINE_FORM_IDS].sort());
    assert.ok(result.errors.some((error: string) => error.includes('user_sessions')));
    assert.deepEqual(db.prepare('SELECT * FROM form_config_versions ORDER BY form_id').all(), before);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name='user_sessions'").get()?.n, 0);
  } finally { db.close(); }
});

void test('a malformed publication is reported even when every required form has a published row', () => {
  const db = fixture(REQUIRED_PREVIEW_FORM_IDS);
  try {
    db.prepare('UPDATE form_config_versions SET config_json=? WHERE form_id=?')
      .run(JSON.stringify({ formId: 'wrong-form', fields: [] }), 'staff.staff-invitation');
    const result = inspectFormPreviewReadiness(db);
    assert.equal(result.ready, false);
    assert.deepEqual(result.missingForms, []);
    assert.deepEqual(result.invalidForms, ['staff.staff-invitation']);
    assert.equal(result.readyForms, REQUIRED_PREVIEW_FORM_IDS.length - 1);
  } finally { db.close(); }
});
