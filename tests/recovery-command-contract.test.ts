import assert from 'node:assert/strict';
import test from 'node:test';
import {approvedSellerRecoveryFixture} from './helpers/seller-recovery-fixture';
void test('protected recovery contract rejects injected runtime, unknown money and incomplete evidence before execution',async()=>{
 const path='../lib/payments/recovery-commands',m=await import(path);
 const base={sourceFormId:'system.recovery-finance',requestId:'fixture-request',expectedRevision:'1',action:'receipt',input:{caseId:'case',receiptId:'actual-receipt',receiptRevision:0,method:'cash',amountPaisa:1,evidenceReference:'FICTIONAL-EVIDENCE',reason:'Independently confirmed allocation.'}};
 assert.equal(m.parseRecoveryCommand(base,'staff').action,'receipt');
 for(const input of [{...base.input,environment:{runtime:'production'}},{...base.input,amountPaisa:'1'},{...base.input,amountPaisa:0.5},{...base.input,receiptRevision:-1},{...base.input,evidenceReference:null}])assert.throws(()=>m.parseRecoveryCommand({...base,input},'staff'));
 assert.throws(()=>m.parseRecoveryCommand(base,'seller'));
 assert.throws(()=>m.parseRecoveryCommand({...base,expectedRevision:null},'staff'));
 assert.throws(()=>m.parseRecoveryCommand({...base,actorId:'reviewer'},'staff'));
 const seller={sourceFormId:'system.recovery-seller',requestId:'fixture-dispute',expectedRevision:'1',action:'dispute',input:{caseId:'case',amountPaisa:1,reason:'Review my original calculation.',evidenceReference:null}};
 assert.equal(m.parseRecoveryCommand(seller,'seller').action,'dispute');
 assert.throws(()=>m.parseRecoveryCommand({...seller,input:{...seller.input,reviewDigest:'fake'}},'seller'));
 const {FORM_REGISTRY,IMPLEMENTED_FORM_ADAPTERS}=await import('../lib/forms/registry');
 for(const id of ['system.recovery-finance','system.recovery-seller']){assert.equal(FORM_REGISTRY[id].mode,'system');assert.deepEqual(FORM_REGISTRY[id].capabilities.customFieldTypes,[]);assert.equal(FORM_REGISTRY[id].capabilities.answerBehavior,'none');assert.ok(FORM_REGISTRY[id].baseFields.every(field=>field.capability==='protected'));assert.equal(IMPLEMENTED_FORM_ADAPTERS[id].route,FORM_REGISTRY[id].route);}
});
void test('saved financial command recovery rechecks current authority and personal ownership',async()=>{
 const f=await approvedSellerRecoveryFixture();try{
 const path='../lib/payments/recovery-commands',m=await import(path);
 assert.equal((await m.recoverRecoveryCommand(f.db,'reviewer','approved-fixture-decision','staff')).id,f.recoveryId);
 assert.equal(await m.recoverRecoveryCommand(f.db,'customer','approved-fixture-decision','seller'),null);
 f.sqlite.prepare("DELETE FROM user_roles WHERE user_id='reviewer' AND role='super_admin'").run();
 await assert.rejects(m.recoverRecoveryCommand(f.db,'reviewer','approved-fixture-decision','staff'),/permission|eligible|staff|access/i);
 }finally{f.dispose();}
});
