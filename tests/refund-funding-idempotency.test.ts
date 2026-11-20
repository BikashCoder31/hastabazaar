import {recordReturnHandling,getReturnHandling} from '../lib/returns/handling';
import assert from 'node:assert/strict';
import test from 'node:test';
import {refundFundingFixture as fixture,refundPacketFixture as packetFixture} from './helpers/refund-funding-fixture';


import { advanceReturnAsAdmin } from '../lib/db/repositories/returns';

async function refunds(){const path='../lib/payments/refund-obligations',m=await import(path).catch(()=>null);assert.equal(typeof m?.openRefundObligation,'function','One existing entitlement must own the outgoing refund and its original cash/credit caps.');return m!;}

void test('native refund obligation retains original tender and exact replay without refunding unallocated receipt money twice',async()=>{
 const m=await refunds(),f=await fixture(20000);try{
 const input={kind:'return_refund',sourceId:f.refundId,reason:'Open the original authorized refund without a second economic obligation.'};
 const result=await m.openRefundObligation(f.db,f.ctx('open-native-refund'),input);
 assert.deepEqual(await m.openRefundObligation(f.db,f.ctx('open-native-refund'),input),result);
 const row=f.sqlite.prepare('SELECT cash_paisa,wallet_paisa FROM refund_obligations WHERE id=?').get(result.id)!;
 assert.equal(row.wallet_paisa,20000);assert.equal(row.cash_paisa,60000);
 const excess=await m.openRefundObligation(f.db,f.ctx('open-excess-refund'),{kind:'receipt_return',sourceId:f.receiptId,reason:'Return only the independently identified original payer excess.'});
 assert.equal(f.sqlite.prepare('SELECT cash_paisa FROM refund_obligations WHERE id=?').get(excess.id)!.cash_paisa,500);
 assert.equal(f.sqlite.prepare("SELECT SUM(amount_minor) n FROM manual_receipt_uses WHERE receipt_id=? AND state IN ('allocated','reserved','returned')").get(f.receiptId)!.n,f.order.grandTotalPaisa+500);
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM refund_obligations').get()!.n,2);
 await assert.rejects(m.openRefundObligation(f.db,{...f.ctx('foreign-open'),actorId:'customer'},input));
 await assert.rejects(m.openRefundObligation(f.db,f.ctx('open-native-refund'),{...input,reason:'Changed replay content must be rejected even for the same obligation.'}));
 }finally{f.dispose();}
});



void test('refund destination requires fresh owner authentication and an eligible verification; changed versions remain distinct',async()=>{
 const m=await refunds(),f=await fixture();try{
 const obligation=await m.openRefundObligation(f.db,f.ctx('destination-obligation'),{kind:'return_refund',sourceId:f.refundId,reason:'Retain the original approved refund for secure beneficiary verification.'});
 assert.ok(f.sqlite.prepare('PRAGMA database_list').all().every(row=>row.file===''));
 f.sqlite.exec('CREATE TABLE user_sessions(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),expires_at INTEGER NOT NULL,created_at INTEGER NOT NULL,last_seen_at INTEGER NOT NULL)');
 const sessionHash='FICTIONAL-FRESH-CUSTOMER-SESSION';f.sqlite.prepare('INSERT INTO user_sessions(token_hash,user_id,expires_at,created_at,last_seen_at) VALUES(?,?,?,?,?)').run(sessionHash,'customer',Date.now()+3600000,Date.now()-1000,Date.now());
 const input={obligationId:obligation.id,details:{holder:'Fictional Buyer',bank:'Fictional Customer Bank',branch:'Fictional Branch',accountNumber:'TEST-CUSTOMER-001',currency:'NPR'},relationship:'own_account',authorization:'I authorize return of this original refund to my named account.',evidenceReference:'FICTIONAL-PROTECTED-ACCOUNT-HOLDER-EVIDENCE',reason:'Securely record the actual original customer refund destination.'};
 const customer={...f.ctx('destination-submitted'),actorId:'customer',sessionHash};
 await assert.rejects(m.submitRefundDestination(f.db,{...customer,sessionHash:'missing'},input));
 const destination=await m.submitRefundDestination(f.db,customer,input);assert.deepEqual(await m.submitRefundDestination(f.db,customer,input),destination);
 await assert.rejects(m.verifyRefundDestination(f.db,{...f.ctx('ordinary-destination-check','0'),actorId:'delegate'},{versionId:destination.id,ownershipConfirmed:true,relationshipConfirmed:true,verificationReference:'FICTIONAL-INDEPENDENT-BENEFICIARY-VERIFICATION',reason:'Check original customer ownership and authorized relationship.'}));
 await m.verifyRefundDestination(f.db,f.ctx('eligible-destination-check','0'),{versionId:destination.id,ownershipConfirmed:true,relationshipConfirmed:true,verificationReference:'FICTIONAL-INDEPENDENT-BENEFICIARY-VERIFICATION',reason:'Check original customer ownership and authorized relationship.'});
 assert.equal(f.sqlite.prepare('SELECT status FROM refund_destination_versions WHERE id=?').get(destination.id)!.status,'verified');
 f.sqlite.prepare('UPDATE user_sessions SET created_at=? WHERE token_hash=?').run(Date.now()-3600000,sessionHash);
 await assert.rejects(m.submitRefundDestination(f.db,{...customer,requestId:'stale-destination-change',expectedRevision:'1'},{...input,details:{...input.details,accountNumber:'TEST-CUSTOMER-002'}}));
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM refund_destination_versions').get()!.n,1);
 }finally{f.dispose();}
});

void test('one eligible Super Admin verifies actual free company funds; receipts and seller ledgers are not a balance',async()=>{
 const m=await refunds(),f=await fixture();try{
 const input={accountVersionId:f.accountVersionId,statementIdentity:'FICTIONAL-COMPANY-STATEMENT-001',asOf:Date.now(),cashPaisa:200000,restrictedPaisa:50000,evidenceReference:'FICTIONAL-INDEPENDENT-COMPANY-STATEMENT',restrictionsReference:'FICTIONAL-CUSTOMER-AND-SELLER-MONEY-RECONCILIATION',availableFundsConfirmed:true,reason:'Verify actual company funds after excluding third-party and unrelated reserved money.'};
 await assert.rejects(m.recordRefundFundingStatement(f.db,{...f.ctx('ordinary-funds'),actorId:'delegate'},input));
 await assert.rejects(m.recordRefundFundingStatement(f.db,f.ctx('false-funds'),{...input,availableFundsConfirmed:false}));
 const saved=await m.recordRefundFundingStatement(f.db,f.ctx('verified-funds'),input);assert.deepEqual(await m.recordRefundFundingStatement(f.db,f.ctx('verified-funds'),input),saved);
 assert.equal((await m.getRefundFundingAvailability(f.db,f.accountVersionId)).availablePaisa,150000);
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM company_funding_statements').get()!.n,1);
 }finally{f.dispose();}
});


void test('one eligible Super Admin prepares approves and reconciles an uncertain refund without a second transfer or duplicate credit',async()=>{
 const f=await packetFixture();try{const m=f.m;
 const packet=await m.prepareRefundPacket(f.db,f.ctx('packet-prepare','0'),{obligationId:f.obligationId,destinationVersionId:f.destinationId,fundingStatementId:f.fundingId,reason:'Prepare one exact original cash obligation, verified beneficiary and actual funding.'});
 await m.approveRefundPacket(f.db,f.ctx('packet-approve','0'),{packetId:packet.id,reason:'The same eligible Super Admin verifies this exact outgoing packet.'});
 assert.equal((await m.getRefundFundingAvailability(f.db,f.accountVersionId)).availablePaisa,0);
 await m.startRefundPacket(f.db,f.ctx('packet-start','1'),{packetId:packet.id,reason:'Reserve the exact instruction before the manual external transfer.'});
 const uncertain={packetId:packet.id,outcome:'uncertain',reason:'The bank acknowledgement is missing; keep the original attempt reserved.',evidenceReference:'FICTIONAL-UNKNOWN-BANK-OUTCOME'};
 await m.recordRefundPacketOutcome(f.db,f.ctx('packet-uncertain','2'),uncertain);
 assert.equal(f.sqlite.prepare('SELECT status FROM refunds WHERE id=?').get(f.refundId)!.status,'processing');
 assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM wallet_entries WHERE order_id=? AND kind='refund'").get(f.orderId)!.n,0);
 await assert.rejects(m.prepareRefundPacket(f.db,f.ctx('duplicate-packet','0'),{obligationId:f.obligationId,destinationVersionId:f.destinationId,fundingStatementId:f.fundingId,reason:'Attempt another payment while the original bank outcome is unknown.'}));
 const paid={packetId:packet.id,outcome:'paid',completedTransferConfirmed:true,exactBeneficiaryConfirmed:true,transactionIdentity:'FICTIONAL-COMPLETED-BANK-REFUND-001',bankAt:Date.now(),amountPaisa:60000,evidenceReference:'FICTIONAL-INDEPENDENT-COMPLETED-TRANSFER',reason:'Reconcile the actual completed original transfer without executing another.'};
 const result=await m.recordRefundPacketOutcome(f.db,f.ctx('packet-paid','3'),paid);assert.deepEqual(await m.recordRefundPacketOutcome(f.db,f.ctx('packet-paid','3'),paid),result);
 assert.equal(f.sqlite.prepare('SELECT status FROM refunds WHERE id=?').get(f.refundId)!.status,'paid');
 assert.equal(f.sqlite.prepare("SELECT SUM(amount_paisa) n FROM wallet_entries WHERE order_id=? AND kind='refund'").get(f.orderId)!.n,20000);
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM outgoing_payment_packets WHERE obligation_id=?').get(f.obligationId)!.n,1);
 assert.notEqual(f.sqlite.prepare('SELECT status FROM return_requests WHERE id=?').get(f.caseId)!.status,'resolved');
 const handling=(await getReturnHandling(f.db,f.caseId))!;
 await recordReturnHandling(f.db,f.ctx('paid-physical-waiver',String(handling.revision)),{caseId:f.caseId,action:'waive_return',quantity:1,occurredAt:handling.now,publicMessage:'The physical return is waived under the recorded evidence-based decision.',privateNote:'The eligible Super Admin verified the actual no-return basis after the refund.',evidenceReference:'FICTIONAL-EXPLICIT-NO-RETURN-EVIDENCE'});
 await advanceReturnAsAdmin(f.db,{returnRequestId:f.caseId,actorId:'reviewer',actorRole:'super_admin',action:'close_paid_refund' as never,note:'Both the original actual refund and physical disposition are complete.',publicMessageEn:'Your refund case is complete.',publicMessageNe:'फिर्ता रकमको केस पूरा भयो।',requestId:'close-after-physical',now:Date.now()});
 assert.equal(f.sqlite.prepare('SELECT status FROM return_requests WHERE id=?').get(f.caseId)!.status,'resolved');
 assert.equal(f.sqlite.prepare("SELECT SUM(amount_paisa) n FROM wallet_entries WHERE order_id=? AND kind='refund'").get(f.orderId)!.n,20000);

 }finally{f.dispose();}
});

void test('a credit-only original refund restores wallet value once without inventing a bank destination or transfer',async()=>{
 const m=await refunds(),f=await fixture(80000);try{
 const obligation=await m.openRefundObligation(f.db,f.ctx('credit-obligation'),{kind:'return_refund',sourceId:f.refundId,reason:'Restore only the actual original wallet tender through its original route.'});
 const packet=await m.prepareRefundPacket(f.db,f.ctx('credit-prepare','0'),{obligationId:obligation.id,destinationVersionId:null,fundingStatementId:null,reason:'This exact obligation has no customer cash component or external transfer.'});
 await m.approveRefundPacket(f.db,f.ctx('credit-approve','0'),{packetId:packet.id,reason:'Verify the original credit allocation and approve its one restoration.'});
 await m.startRefundPacket(f.db,f.ctx('credit-start','1'),{packetId:packet.id,reason:'Process the original credit restoration without a bank instruction.'});
 const input={packetId:packet.id,outcome:'paid',amountPaisa:0,creditRestorationConfirmed:true,evidenceReference:'ORIGINAL-NATIVE-WALLET-ALLOCATION',reason:'Restore the original saved credit and retain the native wallet entry.'};
 await m.recordRefundPacketOutcome(f.db,f.ctx('credit-complete','2'),input);await m.recordRefundPacketOutcome(f.db,f.ctx('credit-complete','2'),input);
 const row=f.sqlite.prepare('SELECT bank_at,transaction_identity_hash,account_version_id,destination_version_id FROM outgoing_payment_packets WHERE id=?').get(packet.id)!;
 assert.ok(Object.values(row).every(value=>value===null));assert.equal(f.sqlite.prepare("SELECT SUM(amount_paisa) n FROM wallet_entries WHERE order_id=? AND kind='refund'").get(f.orderId)!.n,80000);
 }finally{f.dispose();}
});

void test('insufficient actual funds retain an owned urgent exception and the original customer obligation',async()=>{const f=await packetFixture();try{
 const {m}=f;const funding=await m.recordRefundFundingStatement(f.db,f.ctx('insufficient-statement','1'),{accountVersionId:f.accountVersionId,statementIdentity:'FICTIONAL-LATER-INSUFFICIENT-BALANCE',asOf:Date.now(),cashPaisa:50000,restrictedPaisa:10000,evidenceReference:'FICTIONAL-INDEPENDENT-INSUFFICIENT-FUNDS',restrictionsReference:'FICTIONAL-RESTRICTED-CLIENT-MONEY',availableFundsConfirmed:true,reason:'Record the actual later balance without reallocating held customer money.'});
 const packet=await m.prepareRefundPacket(f.db,f.ctx('insufficient-packet','0'),{obligationId:f.obligationId,destinationVersionId:f.destinationId,fundingStatementId:funding.id,reason:'Prepare the actual original refund for explicit funding review.'});
 const result=await m.approveRefundPacket(f.db,f.ctx('insufficient-approval','0'),{packetId:packet.id,reason:'Review the actual shortage and keep a named customer follow-up.'});
 assert.equal(result.blocked,true);assert.equal(f.sqlite.prepare('SELECT state FROM outgoing_payment_packets WHERE id=?').get(packet.id)!.state,'prepared');
 const issue=f.sqlite.prepare('SELECT owner_id,next_update_at,state,kind FROM manual_payment_exceptions WHERE source_key=?').get('refund:'+f.obligationId)!;
 assert.equal(issue.owner_id,'reviewer');assert.equal(issue.kind,'refund_funding');assert.equal(issue.state,'open');assert.ok(Number(issue.next_update_at)>Date.now());
 assert.equal(f.sqlite.prepare('SELECT state FROM refund_obligations WHERE id=?').get(f.obligationId)!.state,'blocked');
 }finally{f.dispose();}});
