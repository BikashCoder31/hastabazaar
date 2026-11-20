import assert from 'node:assert/strict';
import {sellerRecoveryFixture} from './seller-recovery-fixture';
import {prepareSellerPayout} from '../../lib/db/repositories/payouts';
import {recoveryPayoutReadySql} from '../../lib/payments/recovery-payout-policy';
import {getRefundFundingAvailability,recordRefundFundingStatement} from '../../lib/payments/refund-funding';
import * as transfers from '../../lib/payments/payout-transfers';

/** Fictional pre-recovery writer only during inspected memory setup. Every tested
 * operation gets the current adapter, with all source and native guards present. */
export async function historicalRegisteredRecoveryFixture(responsibility:'seller'|'platform'='seller'){
 const f=await sellerRecoveryFixture(true,responsibility);try{
 assert.ok(f.sqlite.prepare('PRAGMA database_list').all().every(row=>row.file===''));
 // Explicit fictional old wrong charge, before the historical payout; current guards remain active.
 if(responsibility==='platform')f.sqlite.prepare(`INSERT INTO seller_ledger_entries(id,seller_id,order_item_id,refund_id,type,amount_paisa,available_at,description,created_at) SELECT 'legacy-company-wrong-debit','registered',request.order_item_id,r.id,'refund',-r.amount_paisa,1,'Fictional legacy wrong company cost',1 FROM refunds r JOIN return_requests request ON request.id=r.return_request_id WHERE r.id=?`).run(f.refundId);
 f.sqlite.prepare("INSERT INTO seller_ledger_entries(id,seller_id,type,amount_paisa,available_at,description,created_at) VALUES('historical-unrelated-earnings','registered','sale',?,1,'Explicit fictional later eligible original earnings',1)").run(f.originalPaidPaisa+1000);
 const input={sellerId:'registered',actorId:'reviewer',actorRole:'super_admin' as const,note:'Retain the original historical payout containing the native refund deduction.',requestId:'historical-registered-payout',now:Date.now()};
 await assert.rejects(prepareSellerPayout(f.db,input));
 const gates=['s.id','source_seller.id'].map(alias=>recoveryPayoutReadySql(alias,'registered')),parameterGate=recoveryPayoutReadySql('?','registered');let calls=0;
 const guardPrefix='INSERT INTO operation_transaction_guards(id,valid) SELECT ?,CASE WHEN ',guardSuffix=' THEN 1 ELSE 0 END';
 const legacy={prepare(sql:string){
  // This inspected old writer lacks only the recovery gate, not today's
  // source, party, beneficiary, funding, physical-care or native money guards.
  if(sql===guardPrefix+parameterGate+guardSuffix){
   calls++;const count=(parameterGate.match(/\?/g)??[]).length;
   const statement=f.db.prepare(guardPrefix+Array.from({length:count},()=>'? IS NOT NULL').join(' AND ')+guardSuffix);
   return{bind(...values:unknown[]){assert.equal(values.length,count+1);assert.ok(typeof values[0]==='string'&&values[0].length>0);for(const value of values.slice(1))assert.equal(value,input.sellerId,'Only this exact fictional historical seller may use the old writer.');return statement.bind(...values);}};
  }
  for(const gate of gates)if(sql.includes(gate)){calls++;sql=sql.replaceAll(gate,'1=1');}return f.db.prepare(sql);
 },batch:f.db.batch.bind(f.db)} as D1Database;
 const funding=await getRefundFundingAvailability(f.db,f.accountVersionId);
 const fundingContext=f.ctx('historical-registered-capital',String(funding.revision));
 await recordRefundFundingStatement(f.db,fundingContext,{accountVersionId:f.accountVersionId,statementIdentity:'FICTIONAL-HISTORICAL-REGISTERED-CAPITAL',asOf:fundingContext.now,cashPaisa:200000,restrictedPaisa:50000,evidenceReference:'FICTIONAL-HISTORICAL-REGISTERED-STATEMENT',restrictionsReference:'FICTIONAL-HISTORICAL-REGISTERED-RESTRICTIONS',availableFundsConfirmed:true,reason:'Independently retain actual fictional company capital for the historical payout.'});
 const payout=await prepareSellerPayout(legacy,input);
 assert.equal(f.sqlite.prepare('SELECT amount_paisa FROM payouts WHERE id=?').get(payout.id)!.amount_paisa,1000);
 const packet=await transfers.preparePayoutTransfer(legacy,f.ctx('historical-registered-packet'),{model:'registered',payoutId:payout.id,accountVersionId:f.accountVersionId,reason:'Bind the exact historical deduction and remaining original earnings to the verified beneficiary.'});
 await transfers.approvePayoutTransfer(legacy,f.ctx('historical-registered-approved','0'),{packetId:packet.id,reason:'Independently verify the historical original source, actual funding and exact beneficiary.'});
 await transfers.startPayoutTransfer(legacy,f.ctx('historical-registered-started','1'),{packetId:packet.id,reason:'Retain the original fictional manual bank instruction for this historical payout.'});
 await transfers.recordPayoutTransferOutcome(legacy,f.ctx('historical-registered-paid','2'),{packetId:packet.id,outcome:'paid',amountPaisa:1000,bankAt:Date.now()-1,transactionIdentity:'FICTIONAL-HISTORICAL-REGISTERED-PAID',evidenceReference:'FICTIONAL-HISTORICAL-REGISTERED-BANK-PROOF',completedTransferConfirmed:true,exactBeneficiaryConfirmed:true,reason:'Confirm actual original fictional bank execution; this creates no new collection authority.'});
 assert.ok(calls>0);assert.equal(f.sqlite.prepare('PRAGMA foreign_key_check').all().length,0);
 return {...f,historicalPayoutId:payout.id};
 }catch(error){f.dispose();throw error;}
}
