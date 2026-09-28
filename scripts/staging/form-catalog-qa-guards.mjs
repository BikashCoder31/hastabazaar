import assert from 'node:assert/strict';
import { resolve } from 'node:path';

const approved = resolve('C:/Users/abinash/.codex/worktrees/hastabazaar-v1-2-1-staging/Hatskala');
export function assertApprovedFormCatalogCheckout(project, cwd) {
  assert.equal(resolve(project), approved, 'QA requires the approved isolated checkout.');
  assert.equal(resolve(cwd), approved, 'QA requires the approved isolated checkout.');
}

export function assertUnusedProfileQaRun(db, key) {
  assert.match(key, /^qa_context_[a-f0-9]{8}$/, 'Invalid QA field.');
  for (const row of db.prepare("SELECT answers_json FROM form_answer_sets WHERE form_id='account.profile'").all()) {
    const snapshot = JSON.parse(row.answers_json);
    assert.ok(snapshot?.formId === 'account.profile' && Number.isSafeInteger(snapshot.version) && snapshot.version > 0 && Array.isArray(snapshot.answers), 'Invalid stored answer data; inspect before retrying QA.');
    assert.ok(!snapshot.answers.some((answer) => answer?.fieldId === key),
      'This QA run already has a saved answer. Inspect and archive its exact field without resubmitting.');
  }
}

export function assertPublishedMatrixVersion(db, formId, rawVersion) {
  const version = Number(rawVersion);
  assert.ok(Number.isSafeInteger(version) && version > 0, 'Invalid published form version.');
  const current = db.prepare("SELECT version FROM form_config_versions WHERE form_id=? AND status='published' ORDER BY version DESC LIMIT 1").get(formId);
  assert.equal(current?.version, version, 'Expected the current published form version.');
}
