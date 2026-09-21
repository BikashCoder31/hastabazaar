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
 CREATE TABLE seller_profiles(id TEXT PRIMARY KEY,user_id TEXT NOT NULL);
 CREATE TABLE seller_participation_profiles(seller_id TEXT PRIMARY KEY,participation_route TEXT,application_stage TEXT,commercial_model TEXT,payout_beneficiary_reference TEXT,managed_agreement_version TEXT,managed_agreement_language TEXT,managed_agreement_accepted_at INTEGER);
 CREATE TABLE products(id TEXT PRIMARY KEY,seller_id TEXT NOT NULL);
 CREATE TABLE business_setting_versions(id TEXT PRIMARY KEY);
 CREATE TABLE audit_logs(id TEXT PRIMARY KEY,actor_id TEXT,action TEXT,subject_type TEXT,subject_id TEXT,reason TEXT,previous_json TEXT,next_json TEXT,request_id TEXT UNIQUE,ip_hash TEXT,created_at INTEGER);
 INSERT INTO users VALUES('maker','active'),('reviewer','active'),('finance','active');
 INSERT INTO user_roles VALUES('reviewer','super_admin'),('finance','super_admin');
 INSERT INTO seller_profiles VALUES('seller','maker');
 INSERT INTO seller_participation_profiles VALUES('seller','managed_maker','active','managed_fixed_supplier_price_v1','SIM-MAKER-ACCOUNT','SIM-FIXED-V1','ne',1);
 INSERT INTO products VALUES('product','seller');`);
 sqlite.exec((await readFile(new URL('../drizzle/0054_managed_fixed_supply.sql',import.meta.url),'utf8')).replaceAll('--> statement-breakpoint',''));
 return {sqlite,database:new Database(sqlite) as unknown as D1Database};
}

void test('documented acceptance creates the exact supplier obligation with no 9% deduction',async()=>{
 const f=await fixture();try{
  const id=await createFixedSupplyRecord(f.database,{sellerId:'seller',productId:'product',quantity:2,agreedUnitPaisa:50_000,createdBy:'maker',agreementVersion:'SIM-FIXED-V1',agreementLanguage:'ne',payoutBeneficiaryReference:'SIM-MAKER-ACCOUNT',requestId:'propose-1',now:100,environment});
  await decideFixedSupplyRecord(f.database,{recordId:id,actorId:'reviewer',action:'accept',quantityAccepted:2,possessionStatus:'received',qualityStatus:'accepted',ownershipRecordStatus:'simulated_terms_recorded',riskRecordStatus:'simulated_terms_recorded',evidenceReference:'SIM-GRN-001',reason:'SIMULATED quantity and quality acceptance',requestId:'accept-1',now:200,environment});
  assert.deepEqual(await getFixedSupplyBalance(f.database,id),{originalOwedPaisa:100_000,adjustmentsPaisa:0,paidPaisa:0,balancePaisa:100_000,recoverablePaisa:0,status:'owed'});
  const row=f.sqlite.prepare('SELECT original_amount_paisa AS amount,owed_at AS owedAt FROM managed_supplier_obligations').get() as {amount:number;owedAt:number};
  assert.deepEqual({...row},{amount:100_000,owedAt:200});
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

void test('fixed supplier payment is idempotent and requires a different approver',async()=>{
 const f=await fixture();try{
  const id=await createFixedSupplyRecord(f.database,{sellerId:'seller',productId:'product',quantity:1,agreedUnitPaisa:75_000,createdBy:'maker',agreementVersion:'SIM-FIXED-V1',agreementLanguage:'ne',payoutBeneficiaryReference:'SIM-MAKER-ACCOUNT',requestId:'proposal-pay',now:100,environment});
  await decideFixedSupplyRecord(f.database,{recordId:id,actorId:'reviewer',action:'accept',quantityAccepted:1,possessionStatus:'received',qualityStatus:'accepted',ownershipRecordStatus:'simulated_terms_recorded',riskRecordStatus:'simulated_terms_recorded',evidenceReference:'SIM-GRN-PAY',reason:'SIMULATED supply acceptance',requestId:'accept-pay',now:200,environment});
  const payment=await prepareFixedSupplierPayment(f.database,{recordId:id,actorId:'reviewer',destinationReference:'SIM-MAKER-ACCOUNT',requestId:'prepare-pay',now:300,environment});
  assert.equal(await prepareFixedSupplierPayment(f.database,{recordId:id,actorId:'reviewer',destinationReference:'SIM-MAKER-ACCOUNT',requestId:'prepare-pay',now:300,environment}),payment);
  await assert.rejects(transitionFixedSupplierPayment(f.database,{paymentId:payment,actorId:'reviewer',action:'approve',requestId:'self-approve',now:400,environment}),/different Super Admin/i);
  await transitionFixedSupplierPayment(f.database,{paymentId:payment,actorId:'finance',action:'approve',requestId:'approve-pay',now:400,environment});
  await transitionFixedSupplierPayment(f.database,{paymentId:payment,actorId:'finance',action:'mark_paid',requestId:'complete-pay',now:500,environment});
  assert.deepEqual(await getFixedSupplyBalance(f.database,id),{originalOwedPaisa:75_000,adjustmentsPaisa:0,paidPaisa:75_000,balancePaisa:0,recoverablePaisa:0,status:'paid'});
 }finally{f.sqlite.close();}
});
