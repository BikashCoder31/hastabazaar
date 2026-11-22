import assert from 'node:assert/strict';
import type {completeVersionFixture} from './complete-version-fixture';
import {saveFormDraft,publishFormDraft} from '../../lib/db/repositories/form-catalog';
export async function publishAccountForms(f:Pick<Awaited<ReturnType<typeof completeVersionFixture>>,'db'|'sqlite'>,ids:readonly('account.profile'|'account.address'|'account.privacy-request'|'account.review')[]){
 assert.ok(f.sqlite.prepare('PRAGMA database_list').all().every(row=>row.file===''),'Only isolated memory forms may be published.');
 for(const formId of ids){const published=Number((await f.db.prepare("SELECT COALESCE(MAX(version),0) AS n FROM form_config_versions WHERE form_id=? AND status='published'").bind(formId).first<{n:number}>())!.n);
  const draft=await saveFormDraft(f.db,{formId,actorId:'reviewer',actorRole:'super_admin',expectedPublishedVersion:published,config:{formId,fields:[]},reason:'Publish the actual supported account form in an isolated native fixture.',requestId:crypto.randomUUID(),now:Date.now()});
  await publishFormDraft(f.db,{formId,draftId:draft.id,actorId:'reviewer',actorRole:'super_admin',expectedDraftRevision:draft.revision,expectedPublishedVersion:published,reason:'Use the approved core account contract for genuine native command testing.',requestId:crypto.randomUUID(),now:Date.now()});
 }
}

