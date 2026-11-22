import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync, type SQLInputValue, type StatementSync } from 'node:sqlite';
import test from 'node:test';

import {
  createFixedSupplyRecord,
  decideFixedSupplyRecord,
  addFixedSupplyAdjustment,
  getFixedSupplyBalance,
  prepareFixedSupplierPayment,
  transitionFixedSupplierPayment,
} from '../lib/managed-commerce/fixed-supply';
import { resolveRuntimeEnvironment } from '../lib/staging/environment';

class Statement {
  private values: SQLInputValue[]=[];
  constructor(private readonly statement:StatementSync){}
  bind(...values:SQLInputValue[]){this.values=values;return this;}
  async first<T>(){return (this.statement.get(...this.values) as T|undefined)??null;}
  async all<T>(){return {results:this.statement.all(...this.values) as T[]};}
  async run(){const value=this.statement.run(...this.values);return {success:true,meta:{changes:Number(value.changes)},results:[]};}
}
class Database { constructor(private readonly sqlite:DatabaseSync){} prepare(sql:string){return new Statement(this.sqlite.prepare(sql));} async batch(rows:readonly Statement[]){this.sqlite.exec('BEGIN');try{const result=[];for(const row of rows)result.push(await row.run());this.sqlite.exec('COMMIT');return result;}catch(error){this.sqlite.exec('ROLLBACK');throw error;}}}

const environment=resolveRuntimeEnvironment({runtimeEnvironment:'local_staging',appOrigin:'http://127.0.0.1:4173'});
async function fixture(){
 const sqlite=new DatabaseSync(':memory:');sqlite.exec(`PRAGMA foreign_keys=ON;
 CREATE TABLE users(id TEXT PRIMARY KEY,status TEXT NOT NULL);
 CREATE TABLE user_roles(user_id TEXT NOT NULL,role TEXT NOT NULL,PRIMARY KEY(user_id,role));
 CREATE TABLE staff_permission_profiles(user_id TEXT PRIMARY KEY,permissions_json TEXT NOT NULL);
 CREATE TABLE staff_permission_guards(id TEXT PRIMARY KEY,valid INTEGER NOT NULL CHECK(valid=1));
 CREATE TABLE operation_transaction_guards(id TEXT PRIMARY KEY,valid INTEGER NOT NULL CHECK(valid=1));
 CREATE TABLE seller_capability_holds(seller_id TEXT,capability TEXT,released_at INTEGER);
 CREATE TABLE seller_payout_review_blocks(payout_model TEXT,payout_id TEXT);
 CREATE TABLE seller_payout_packet_dispositions(id TEXT PRIMARY KEY,payout_model TEXT,seller_id TEXT,old_payout_id TEXT);
 CREATE TABLE seller_payout_packet_replacements(disposition_id TEXT PRIMARY KEY,new_payout_id TEXT,actor_id TEXT,created_at INTEGER);
 CREATE TABLE seller_profiles(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,status TEXT DEFAULT 'approved',legal_name TEXT,applicant_type TEXT,tax_mode TEXT,payout_account_reference TEXT,updated_at INTEGER);
 CREATE TABLE seller_participation_profiles(seller_id TEXT PRIMARY KEY,participation_route TEXT,application_stage TEXT,commercial_model TEXT,payout_beneficiary_reference TEXT,managed_agreement_version TEXT,managed_agreement_language TEXT,managed_agreement_accepted_at INTEGER);
 CREATE TABLE products(id TEXT PRIMARY KEY,seller_id TEXT NOT NULL);
 CREATE TABLE business_setting_versions(id TEXT PRIMARY KEY);
 CREATE TABLE audit_logs(id TEXT PRIMARY KEY,actor_id TEXT,action TEXT,subject_type TEXT,subject_id TEXT,reason TEXT,previous_json TEXT,next_json TEXT,request_id TEXT UNIQUE,ip_hash TEXT,created_at INTEGER);
 INSERT INTO users VALUES('maker','active'),('reviewer','active');
 INSERT INTO user_roles VALUES('reviewer','super_admin');
 INSERT INTO seller_profiles(id,user_id) VALUES('seller','maker');
 INSERT INTO seller_participation_profiles VALUES('seller','managed_maker','active','managed_fixed_supplier_price_v1','SIM-MAKER-ACCOUNT','SIM-FIXED-V1','ne',1);
 INSERT INTO products VALUES('product','seller');`);
 sqlite.exec((await readFile(new URL('../drizzle/0054_managed_fixed_supply.sql',import.meta.url),'utf8')).replaceAll('--> statement-breakpoint',''));
 // This focused legacy fixture reads the new payout policy's real recovery/receipt tables.
 // It never fabricates a recovery decision or accesses a persisted database.
 const receipts=await readFile(new URL('../drizzle/0098_manual_payment_allocations.sql',import.meta.url),'utf8');
 for(const table of ['company_money_receipts','company_receipt_reversals','manual_receipt_uses']){
  const source=receipts.match(new RegExp('CREATE TABLE '+table+'\\([\\s\\S]*?\\);'));
  assert.ok(source);sqlite.exec(source[0]);
 }
 const upgrade=await readFile(new URL('../drizzle/0062_single_super_admin_approvals.sql',import.meta.url),'utf8');
 sqlite.exec('PRAGMA foreign_keys=OFF;'+upgrade.split('-- BEGIN managed_supplier_payments')[1].split('-- END managed_supplier_payments')[0].replaceAll('--> statement-breakpoint','')+'PRAGMA foreign_keys=ON;');
 const recoveryCredits=(await readFile(new URL('../drizzle/0119_recovery_model_settlements.sql',import.meta.url),'utf8')).match(/CREATE TABLE managed_supplier_recovery_credits\s*\([\s\S]*?\);/);
 assert.ok(recoveryCredits);sqlite.exec(recoveryCredits[0]);
 for(const name of ['0116_seller_recovery_cases.sql','0117_seller_recovery_allocations.sql'])sqlite.exec((await readFile(new URL('../drizzle/'+name,import.meta.url),'utf8')).replaceAll('--> statement-breakpoint',''));
 // These scenarios use no recovery decisions. Load the authoritative DDL for
 // the empty relations read by the balance and protected preparation queries.
 const recoverySources=[
  ['0123_recovery_liability_corrections.sql',['seller_recovery_liability_corrections']],
  ['0125_recovery_historical_attributions.sql',['seller_recovery_historical_attributions']],
  ['0129_recovery_unpaid_corrections.sql',['seller_recovery_unpaid_corrections']],
  ['0130_recovery_carrier_reimbursements.sql',['seller_recovery_carrier_reviews','seller_recovery_carrier_restorations']],
  ['0133_recovery_payout_returns.sql',['seller_recovery_payout_return_reviews','seller_recovery_payout_return_restorations']],
  ['0134_recovery_carrier_unpaid.sql',['seller_recovery_carrier_unpaid_reviews']],
  ['0139_recovery_receipt_dispositions.sql',['seller_recovery_receipt_reversal_reviews','seller_recovery_receipt_reversal_parts','seller_recovery_reversed_allocations']],
 ] as const;
 for(const [name,relations] of recoverySources){
  const migration=await readFile(new URL('../drizzle/'+name,import.meta.url),'utf8');
  const statements=migration.split('--> statement-breakpoint');
  for(const relation of relations){
   const definition=statements.find(statement=>new RegExp('^CREATE (?:TABLE|VIEW) '+relation+'\\b','m').test(statement));
   assert.ok(definition,'Missing recovery relation: '+relation);
   sqlite.exec(definition);
  }
  if(name==='0123_recovery_liability_corrections.sql'){
   const column=statements.find(statement=>/^ALTER TABLE seller_recovery_cases ADD COLUMN restored_paisa /m.test(statement));
   assert.ok(column,'Missing restored recovery amount');
   sqlite.exec(column);
  }
 }
 // Preparation checks for unlinked legacy requests even when there are none.
 const legacyProtectedSources=[
  ['0000_clear_lizard.sql','`seller_documents`'],
  ['0077_seller_registration_intakes.sql','seller_registration_intakes'],
  ['0078_seller_document_change_requests.sql','seller_document_change_requests'],
  ['0083_protected_change_holds.sql','seller_protected_change_cases'],
  ['0083_protected_change_holds.sql','seller_protected_revisions'],
  ['0083_protected_change_holds.sql','seller_beneficiary_versions'],
 ] as const;
 for(const [name,table] of legacyProtectedSources){
  const migration=await readFile(new URL('../drizzle/'+name,import.meta.url),'utf8');
  const definition=migration.match(new RegExp('^CREATE TABLE '+table+' \\(\\r?\\n[\\s\\S]*?^\\);','m'));
  assert.ok(definition,'Missing legacy protected table: '+table);
  sqlite.exec(definition[0]);
 }
 sqlite.exec('ALTER TABLE seller_documents ADD COLUMN valid_until INTEGER;');
 return {sqlite,database:new Database(sqlite) as unknown as D1Database};
}

void test('one active Super Admin can accept documented supply and an Admin or supplier cannot',async()=>{
 const f=await fixture();try{
  const id=await createFixedSupplyRecord(f.database,{sellerId:'seller',productId:'product',quantity:2,agreedUnitPaisa:50_000,createdBy:'maker',agreementVersion:'SIM-FIXED-V1',agreementLanguage:'ne',payoutBeneficiaryReference:'SIM-MAKER-ACCOUNT',requestId:'propose-1',now:100,environment});
  const decision={recordId:id,action:'accept',quantityAccepted:2,possessionStatus:'received',qualityStatus:'accepted',ownershipRecordStatus:'simulated_terms_recorded',riskRecordStatus:'simulated_terms_recorded',evidenceReference:'SIM-GRN-001',reason:'SIMULATED quantity and quality acceptance',requestId:'accept-1',now:200,environment} as const;
  f.sqlite.exec("INSERT INTO users VALUES('admin','active'); INSERT INTO user_roles VALUES('admin','admin'),('maker','super_admin');");
  await assert.rejects(decideFixedSupplyRecord(f.database,{...decision,actorId:'admin'}),/active Super Admin/i);
  await assert.rejects(decideFixedSupplyRecord(f.database,{...decision,actorId:'maker'}),/own supply proposal/i);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS count FROM audit_logs').get()?.count,0);
  f.sqlite.exec("DELETE FROM user_roles WHERE user_id='maker'");
  await decideFixedSupplyRecord(f.database,{...decision,actorId:'reviewer'});
  assert.deepEqual(await getFixedSupplyBalance(f.database,id),{originalOwedPaisa:100_000,adjustmentsPaisa:0,paidPaisa:0,balancePaisa:100_000,recoverablePaisa:0,status:'owed'});
  const row=f.sqlite.prepare('SELECT original_amount_paisa AS amount,owed_at AS owedAt FROM managed_supplier_obligations').get() as {amount:number;owedAt:number};
  assert.deepEqual({...row},{amount:100_000,owedAt:200});
  assert.equal(f.sqlite.prepare('SELECT decided_by FROM managed_supply_records WHERE id=?').get(id)?.decided_by,'reviewer');
  assert.equal(f.sqlite.prepare("SELECT actor_id FROM audit_logs WHERE action='managed_supply.accept' AND subject_id=?").get(id)?.actor_id,'reviewer');
 }finally{f.sqlite.close();}
});

void test('rejected or cancelled supplies create no obligation and duplicate decisions do not double-write',async()=>{
 const f=await fixture();try{
  for(const [index,action] of ['reject','cancel'].entries()){
   const id=await createFixedSupplyRecord(f.database,{sellerId:'seller',productId:'product',quantity:1,agreedUnitPaisa:40_000,createdBy:'maker',agreementVersion:'SIM-FIXED-V1',agreementLanguage:'en',payoutBeneficiaryReference:'SIM-MAKER-ACCOUNT',requestId:`proposal-${index}`,now:100+index,environment});
   await decideFixedSupplyRecord(f.database,{recordId:id,actorId:'reviewer',action:action as 'reject'|'cancel',quantityAccepted:0,possessionStatus:action==='reject'?'returned':'not_received',qualityStatus:action==='reject'?'rejected':'not_inspected',ownershipRecordStatus:'not_recorded',riskRecordStatus:'not_recorded',evidenceReference:`SIM-${action}`,reason:`SIMULATED ${action}`,requestId:`decision-${index}`,now:200+index,environment});
   await decideFixedSupplyRecord(f.database,{recordId:id,actorId:'reviewer',action:action as 'reject'|'cancel',quantityAccepted:0,possessionStatus:action==='reject'?'returned':'not_received',qualityStatus:action==='reject'?'rejected':'not_inspected',ownershipRecordStatus:'not_recorded',riskRecordStatus:'not_recorded',evidenceReference:`SIM-${action}`,reason:`SIMULATED ${action}`,requestId:`decision-${index}`,now:200+index,environment});
  }
  assert.equal((f.sqlite.prepare('SELECT COUNT(*) AS n FROM managed_supplier_obligations').get() as {n:number}).n,0);
 }finally{f.sqlite.close();}
});

void test('defect adjustments append once and become recoverable after a completed simulated payment',async()=>{
 const f=await fixture();try{
  const id=await createFixedSupplyRecord(f.database,{sellerId:'seller',productId:'product',quantity:1,agreedUnitPaisa:100_000,createdBy:'maker',agreementVersion:'SIM-FIXED-V1',agreementLanguage:'ne',payoutBeneficiaryReference:'SIM-MAKER-ACCOUNT',requestId:'propose',now:100,environment});
  await decideFixedSupplyRecord(f.database,{recordId:id,actorId:'reviewer',action:'accept',quantityAccepted:1,possessionStatus:'received',qualityStatus:'accepted',ownershipRecordStatus:'simulated_terms_recorded',riskRecordStatus:'simulated_terms_recorded',evidenceReference:'SIM-GRN',reason:'SIMULATED acceptance',requestId:'accept',now:200,environment});
  f.sqlite.exec("INSERT INTO managed_supplier_payments(id,obligation_id,amount_paisa,status,destination_reference,simulation_label,prepared_by,approved_by,request_id,created_at,updated_at,paid_at) VALUES('pay','"+id+"',100000,'paid','SIM-ACCOUNT','SIMULATED — NOT VALID FOR PRODUCTION','reviewer','maker','paid-request',300,300,300)");
  await addFixedSupplyAdjustment(f.database,{recordId:id,actorId:'reviewer',kind:'defect',amountPaisa:20_000,reason:'SIMULATED latent defect adjustment',requestId:'defect-1',now:400,environment});
  await addFixedSupplyAdjustment(f.database,{recordId:id,actorId:'reviewer',kind:'defect',amountPaisa:20_000,reason:'SIMULATED latent defect adjustment',requestId:'defect-1',now:400,environment});
  assert.deepEqual(await getFixedSupplyBalance(f.database,id),{originalOwedPaisa:100_000,adjustmentsPaisa:20_000,paidPaisa:100_000,balancePaisa:0,recoverablePaisa:20_000,status:'paid'});
  assert.equal((f.sqlite.prepare('SELECT COUNT(*) AS n FROM managed_supplier_adjustments').get() as {n:number}).n,1);
 }finally{f.sqlite.close();}
});

void test('one active Super Admin prepares an approved supplier payment, while legacy payment completion requires an execution packet',async()=>{
 const f=await fixture();try{
  const id=await createFixedSupplyRecord(f.database,{sellerId:'seller',productId:'product',quantity:1,agreedUnitPaisa:75_000,createdBy:'maker',agreementVersion:'SIM-FIXED-V1',agreementLanguage:'ne',payoutBeneficiaryReference:'SIM-MAKER-ACCOUNT',requestId:'proposal-pay',now:100,environment});
  await decideFixedSupplyRecord(f.database,{recordId:id,actorId:'reviewer',action:'accept',quantityAccepted:1,possessionStatus:'received',qualityStatus:'accepted',ownershipRecordStatus:'simulated_terms_recorded',riskRecordStatus:'simulated_terms_recorded',evidenceReference:'SIM-GRN-PAY',reason:'SIMULATED supply acceptance',requestId:'accept-pay',now:200,environment});
  const payment=await prepareFixedSupplierPayment(f.database,{recordId:id,actorId:'reviewer',destinationReference:'SIM-MAKER-ACCOUNT',requestId:'prepare-pay',now:300,environment});
  assert.equal(await prepareFixedSupplierPayment(f.database,{recordId:id,actorId:'reviewer',destinationReference:'SIM-MAKER-ACCOUNT',requestId:'prepare-pay',now:300,environment}),payment);
  assert.equal((f.sqlite.prepare('SELECT status FROM managed_supplier_payments WHERE id=?').get(payment) as {status:string}).status,'approved');
  await assert.rejects(transitionFixedSupplierPayment(f.database,{paymentId:payment,actorId:'reviewer',action:'mark_paid',requestId:'complete-pay',now:500,environment}),/execution packet/);
  assert.deepEqual(await getFixedSupplyBalance(f.database,id),{originalOwedPaisa:75_000,adjustmentsPaisa:0,paidPaisa:0,balancePaisa:75_000,recoverablePaisa:0,status:'owed'});
  f.sqlite.exec("DELETE FROM user_roles WHERE user_id='reviewer'");
  await assert.rejects(transitionFixedSupplierPayment(f.database,{paymentId:payment,actorId:'reviewer',action:'approve',requestId:'approve-pay',now:400,environment}),/Super Admin/i);
 }finally{f.sqlite.close();}
});
