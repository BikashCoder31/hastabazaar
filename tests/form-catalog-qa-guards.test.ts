import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertApprovedFormCatalogCheckout, assertUnusedProfileQaRun, assertPublishedMatrixVersion } from '../scripts/staging/form-catalog-qa-guards.mjs';

const approved=resolve(fileURLToPath(new URL('../', import.meta.url)));
void test('mutating catalog QA refuses an original or copied checkout even if cwd matches it', () => {
  assert.doesNotThrow(()=>assertApprovedFormCatalogCheckout(approved,approved));
  for(const other of [resolve(approved,'rejected-checkout'),resolve(approved,'copied-checkout')]) {
    assert.throws(()=>assertApprovedFormCatalogCheckout(other,other),/approved isolated checkout/);
    assert.throws(()=>assertApprovedFormCatalogCheckout(approved,other),/approved isolated checkout/);
  }
});
void test('profile QA refuses a committed run before any mutation, including another actor with the same field', () => {
  const db=new DatabaseSync(':memory:');
  try {
    db.exec('CREATE TABLE form_answer_sets(form_id TEXT,actor_id TEXT,answers_json TEXT)');
    assert.doesNotThrow(()=>assertUnusedProfileQaRun(db,'qa_context_1234abcd'));
    db.prepare('INSERT INTO form_answer_sets VALUES (?,?,?)').run('account.profile','other-actor',JSON.stringify({formId:'account.profile',version:1,answers:[{fieldId:'qa_context_1234abcd',label:'Saved QA',type:'short_text',value:'saved'}]}));
    assert.throws(()=>assertUnusedProfileQaRun(db,'qa_context_1234abcd'),/already has a saved answer/);
    assert.doesNotThrow(()=>assertUnusedProfileQaRun(db,'qa_context_ffffffff'));
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM form_answer_sets').get()?.n,1);
    assert.throws(()=>assertUnusedProfileQaRun(db,'unscoped'),/Invalid QA field/);
  } finally {db.close();}
});
void test('matrix version must be a positive integer matching the current publication',()=>{
 const db=new DatabaseSync(':memory:');
 try {
  db.exec("CREATE TABLE form_config_versions(form_id TEXT,status TEXT,version INTEGER);INSERT INTO form_config_versions VALUES ('account.profile','published',2),('account.profile','draft',3)");
  assert.doesNotThrow(()=>assertPublishedMatrixVersion(db,'account.profile','2'));
  for(const value of ['', '0', '-1', '1', '3', '2.5','NaN']) assert.throws(()=>assertPublishedMatrixVersion(db,'account.profile',value),/published form version/);
  assert.throws(()=>assertPublishedMatrixVersion(db,'unknown.form','2'),/published form version/);
 }finally{db.close();}
});
