import assert from 'node:assert/strict';
import test from 'node:test';
import {payoutTransferFixture} from './helpers/payout-transfer-fixture';
import {operatePayout} from '../lib/db/repositories/payouts';
import {requestDocumentChange} from '../lib/sellers/document-review';
import {approvePayoutTransfer,preparePayoutTransfer,recordPayoutTransferOutcome,startPayoutTransfer,voidUnsentPayoutTransfer} from '../lib/payments/payout-transfers';
import {addModernPayoutRegistration} from './helpers/modern-payout-registration';

void test('registration blocks fresh decisions without blocking retirement or a sent payout outcome',async()=>{
 const f=await payoutTransferFixture();try{
  addModernPayoutRegistration(f.sqlite,f.sellerId,'registered');
  f.sqlite.exec("UPDATE seller_profiles SET settlement_terms_reference='Fictional reviewed terms' WHERE id='payout-seller'");
  const setReady=f.sqlite.prepare("UPDATE seller_registration_intakes SET review_ready=? WHERE seller_id='payout-seller'");
  const preparation={model:'registered' as const,payoutId:f.payoutId,accountVersionId:f.accountVersionId,reason:'Review the original independently verified earned balance.'};
  await assert.rejects(preparePayoutTransfer(f.db,f.ctx('modern-prepare-blocked'),preparation),/registration/i);
  setReady.run(1);
  const packet=await preparePayoutTransfer(f.db,f.ctx('modern-prepare'),preparation);
  const decision={packetId:packet.id,reason:'Review the complete original instruction and independently verified destination.'};
  setReady.run(0);
  await assert.rejects(approvePayoutTransfer(f.db,f.ctx('modern-approve-blocked','0'),decision),/registration/i);
  setReady.run(1);
  await approvePayoutTransfer(f.db,f.ctx('modern-approved','0'),decision);
  setReady.run(0);
  await assert.rejects(startPayoutTransfer(f.db,f.ctx('modern-start-blocked','1'),decision),/registration/i);
  await voidUnsentPayoutTransfer(f.db,f.ctx('modern-void','1'),{...decision,notSentConfirmed:true,evidenceReference:'FICTIONAL-NO-INSTRUCTION'});
  setReady.run(1);
  const replacement=await preparePayoutTransfer(f.db,f.ctx('modern-fresh-preparation'),preparation);
  const instruction={...decision,packetId:replacement.id};
  await approvePayoutTransfer(f.db,f.ctx('modern-fresh-approved','0'),instruction);
  await startPayoutTransfer(f.db,f.ctx('modern-sent','1'),instruction);
  setReady.run(0);
  await recordPayoutTransferOutcome(f.db,f.ctx('modern-uncertain','2'),{...instruction,outcome:'uncertain',evidenceReference:'FICTIONAL-PENDING-INSTRUCTION'});
  await recordPayoutTransferOutcome(f.db,f.ctx('modern-paid','3'),{...instruction,outcome:'paid',amountPaisa:20000,bankAt:Date.now()-1,transactionIdentity:'FICTIONAL-MODERN-PAYOUT-DEBIT',completedTransferConfirmed:true,exactBeneficiaryConfirmed:true,evidenceReference:'FICTIONAL-EXACT-PAID-INSTRUCTION'});
  assert.equal(f.sqlite.prepare('SELECT status FROM payouts WHERE id=?').get(f.payoutId)!.status,'paid');
 }finally{f.dispose();}
});

void test('the legacy payout action cannot start or mark money paid using only a typed reference',async()=>{const f=await payoutTransferFixture();try{
 await assert.rejects(operatePayout(f.db,{payoutId:f.payoutId,actorId:'reviewer',actorRole:'super_admin',action:'start_processing',note:'A typed instruction is not a funding reservation or verified packet.',requestId:'unsafe-legacy-start',now:Date.now()}));
 assert.equal(f.sqlite.prepare('SELECT status FROM payouts WHERE id=?').get(f.payoutId)!.status,'approved');
 }finally{f.dispose();}});

void test('one eligible Super Admin can execute the original payout, sharing cash with refunds and retaining an uncertain instruction through a later hold',async()=>{const f=await payoutTransferFixture();try{
 const path='../lib/payments/payout-transfers';const m=await import(path);
 const packet=await m.preparePayoutTransfer(f.db,f.ctx('transfer-prepare'),{model:'registered',payoutId:f.payoutId,accountVersionId:f.accountVersionId,reason:'Bind actual original earnings, identity, beneficiary and company funds.'});
 assert.equal((await f.m.getRefundFundingAvailability(f.db,f.accountVersionId)).availablePaisa,f.cashPaisa);
 await m.approvePayoutTransfer(f.db,f.ctx('transfer-approved','0'),{packetId:packet.id,reason:'Approve the exact verified original packet as an eligible Super Admin.'});
 assert.equal((await f.m.getRefundFundingAvailability(f.db,f.accountVersionId)).availablePaisa,f.cashPaisa-20000);
 const refund=await f.m.prepareRefundPacket(f.db,f.ctx('competing-refund','0'),{obligationId:f.obligationId,fundingStatementId:f.fundingId,destinationVersionId:f.destinationId,reason:'Prepare the original competing refund for the same actual company funds.'});
 assert.equal((await f.m.approveRefundPacket(f.db,f.ctx('competing-refund-approve','0'),{packetId:refund.id,reason:'Cannot spend the funds already reserved by the actual payout.'})).blocked,true);
 await m.startPayoutTransfer(f.db,f.ctx('transfer-started','1'),{packetId:packet.id,reason:'Record the original approved manual instruction as now sent for processing.'});
 await m.recordPayoutTransferOutcome(f.db,f.ctx('transfer-uncertain','2'),{packetId:packet.id,outcome:'uncertain',reason:'The fictional bank cannot yet confirm this original instruction outcome.',evidenceReference:'FICTIONAL-PENDING-BANK-RESULT'});
 await assert.rejects(m.preparePayoutTransfer(f.db,f.ctx('duplicate-uncertain'),{model:'registered',payoutId:f.payoutId,accountVersionId:f.accountVersionId,reason:'An uncertain instruction must never create another payable packet.'}));
 await requestDocumentChange(f.db,{sellerId:f.sellerId,documentId:'payout-identity',actorId:'payout-owner',reason:'A later identity evidence change must not erase an actual sent payment.',commandId:'later-identity-change',now:Date.now()});
 const input={packetId:packet.id,outcome:'paid',reason:'Independent bank evidence confirms the exact original actual completed debit.',evidenceReference:'FICTIONAL-COMPLETED-PAYOUT-PROOF',transactionIdentity:'FICTIONAL-ACTUAL-PAYOUT-001',bankAt:Date.now()-1,amountPaisa:20000,completedTransferConfirmed:true,exactBeneficiaryConfirmed:true};
 const paid=await m.recordPayoutTransferOutcome(f.db,f.ctx('transfer-paid','3'),input);assert.deepEqual(await m.recordPayoutTransferOutcome(f.db,f.ctx('transfer-paid','3'),input),paid);
 await assert.rejects(m.recordPayoutTransferOutcome(f.db,f.ctx('transfer-paid','3'),{...input,amountPaisa:1}));
 assert.equal(f.sqlite.prepare('SELECT status FROM payouts WHERE id=?').get(f.payoutId)!.status,'paid');
 assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM seller_ledger_entries WHERE payout_id=? AND type='payout'").get(f.payoutId)!.n,1);
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM company_outgoing_bank_identities').get()!.n,1);
 }finally{f.dispose();}});

void test('changed funding retires only an unsent instruction and fresh approval retains the original native earnings',async()=>{const f=await payoutTransferFixture();try{
 const path='../lib/payments/payout-transfers';const m=await import(path);
 const packet=await m.preparePayoutTransfer(f.db,f.ctx('changed-source-prepare'),{model:'registered',payoutId:f.payoutId,accountVersionId:f.accountVersionId,reason:'Bind the original native economic payout and verified funding.'});
 await m.approvePayoutTransfer(f.db,f.ctx('changed-source-approve','0'),{packetId:packet.id,reason:'Approve the original exact source and amount for this instruction.'});
 const head=await f.m.getRefundFundingAvailability(f.db,f.accountVersionId);
 const statement=await f.m.recordRefundFundingStatement(f.db,f.ctx('later-actual-statement',String(head.revision)),{accountVersionId:f.accountVersionId,statementIdentity:'FICTIONAL-LATER-CAPITAL',asOf:Date.now(),cashPaisa:150000,restrictedPaisa:50000,evidenceReference:'FICTIONAL-LATER-ACTUAL-STATEMENT',restrictionsReference:'FICTIONAL-INDEPENDENT-RESTRICTED-MONEY',availableFundsConfirmed:true,reason:'A later actual fictional balance changes the exact reviewed source.'});
 await assert.rejects(m.startPayoutTransfer(f.db,f.ctx('stale-start','1'),{packetId:packet.id,reason:'The older source must not authorize a stale new bank instruction.'}));
 await m.voidUnsentPayoutTransfer(f.db,f.ctx('retire-unsent-source','1'),{packetId:packet.id,notSentConfirmed:true,evidenceReference:'FICTIONAL-NO-INSTRUCTION-SENT',reason:'Independently confirm no original instruction was sent before retirement.'});
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM payout_entries WHERE payout_id=? AND released_at IS NULL').get(f.payoutId)!.n,1);
 const fresh=await m.preparePayoutTransfer(f.db,f.ctx('fresh-funding-source'),{model:'registered',payoutId:f.payoutId,accountVersionId:f.accountVersionId,reason:'Review the same original earned balance with a fresh funding statement.'});
 assert.equal(f.sqlite.prepare('SELECT funding_statement_id FROM payout_transfer_packets WHERE id=?').get(fresh.id)!.funding_statement_id,statement.id);
 await m.approvePayoutTransfer(f.db,f.ctx('fresh-source-approved','0'),{packetId:fresh.id,reason:'Approve the new original source without requiring another administrator.'});
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM payouts').get()!.n,1);
 assert.equal((await f.m.getRefundFundingAvailability(f.db,f.accountVersionId)).availablePaisa,80000);
 }finally{f.dispose();}});

void test('unknown and partial returned debits keep reservations; confirmed no debit permits a freshly approved attempt',async()=>{const f=await payoutTransferFixture();try{
 const path='../lib/payments/payout-transfers';const m=await import(path);
 const packet=await m.preparePayoutTransfer(f.db,f.ctx('failure-prepare'),{model:'registered',payoutId:f.payoutId,accountVersionId:f.accountVersionId,reason:'Review original earnings and actual funds before sending.'});
 await m.approvePayoutTransfer(f.db,f.ctx('failure-approve','0'),{packetId:packet.id,reason:'Approve original exact source and destination without personal conflict.'});
 await m.startPayoutTransfer(f.db,f.ctx('failure-start','1'),{packetId:packet.id,reason:'Record the original manual payment instruction as processing.'});
 const failure={packetId:packet.id,outcome:'failed',reason:'Inspect the independent original bank instruction outcome evidence.',evidenceReference:'FICTIONAL-FAILURE-BANK-EVIDENCE'};
 await assert.rejects(m.recordPayoutTransferOutcome(f.db,f.ctx('unknown-is-not-failure','2'),failure));
 await assert.rejects(m.recordPayoutTransferOutcome(f.db,f.ctx('partial-is-not-failure','2'),{...failure,failureBasis:'debit_returned',returnedDebitConfirmed:true,returnedAmountPaisa:10000}));
 await assert.rejects(m.voidUnsentPayoutTransfer(f.db,f.ctx('initiated-is-not-unsent','2'),{packetId:packet.id,notSentConfirmed:true,evidenceReference:'FICTIONAL-CONTRADICTORY-ASSERTION',reason:'An initiated instruction may not be retired as merely unsent.'}));
 assert.equal((await f.m.getRefundFundingAvailability(f.db,f.accountVersionId)).availablePaisa,f.cashPaisa-20000);
 await m.recordPayoutTransferOutcome(f.db,f.ctx('confirmed-no-debit','2'),{...failure,failureBasis:'no_debit',noDebitConfirmed:true});
 assert.equal((await f.m.getRefundFundingAvailability(f.db,f.accountVersionId)).availablePaisa,f.cashPaisa);
 const retry=await m.preparePayoutTransfer(f.db,f.ctx('fresh-after-failure'),{model:'registered',payoutId:f.payoutId,accountVersionId:f.accountVersionId,reason:'Freshly review the same original earnings after proven no debit.'});
 await m.approvePayoutTransfer(f.db,f.ctx('approve-after-failure','0'),{packetId:retry.id,reason:'A new exact approval is required after a confirmed failed attempt.'});
 assert.equal(f.sqlite.prepare('SELECT status FROM payouts WHERE id=?').get(f.payoutId)!.status,'approved');
 assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM seller_ledger_entries WHERE type='payout'").get()!.n,0);
 }finally{f.dispose();}});

void test('one actual company bank debit cannot be reused across a payout and a customer refund',async()=>{const f=await payoutTransferFixture();try{
 const path='../lib/payments/payout-transfers';const m=await import(path);
 const packet=await m.preparePayoutTransfer(f.db,f.ctx('identity-prepare'),{model:'registered',payoutId:f.payoutId,accountVersionId:f.accountVersionId,reason:'Prepare actual original payout without inventing company capital.'});
 await m.approvePayoutTransfer(f.db,f.ctx('identity-approve','0'),{packetId:packet.id,reason:'Approve original exact source and destination without personal conflict.'});
 await m.startPayoutTransfer(f.db,f.ctx('identity-start','1'),{packetId:packet.id,reason:'Record original manual payment instruction as processing.'});
 const transaction='FICTIONAL-SINGLE-BANK-DEBIT';
 await m.recordPayoutTransferOutcome(f.db,f.ctx('identity-paid','2'),{packetId:packet.id,outcome:'paid',reason:'Actual independent evidence confirms one exact completed bank debit.',evidenceReference:'FICTIONAL-ONE-COMPLETED-DEBIT',amountPaisa:20000,bankAt:Date.now()-1,transactionIdentity:transaction,completedTransferConfirmed:true,exactBeneficiaryConfirmed:true});
 const head=await f.m.getRefundFundingAvailability(f.db,f.accountVersionId);
 const statement=await f.m.recordRefundFundingStatement(f.db,f.ctx('identity-later-funds',String(head.revision)),{accountVersionId:f.accountVersionId,statementIdentity:'FICTIONAL-ADDITIONAL-CAPITAL',asOf:Date.now(),cashPaisa:150000,restrictedPaisa:50000,evidenceReference:'FICTIONAL-ACTUAL-ADDITIONAL-CAPITAL',restrictionsReference:'FICTIONAL-RESTRICTED-MONEY-UNCHANGED',availableFundsConfirmed:true,reason:'Record a later independently evidenced fictional company balance.'});
 const refund=await f.m.prepareRefundPacket(f.db,f.ctx('identity-refund-prepare','0'),{obligationId:f.obligationId,destinationVersionId:f.destinationId,fundingStatementId:statement.id,reason:'Prepare the separate original customer refund against real free funds.'});
 await f.m.approveRefundPacket(f.db,f.ctx('identity-refund-approve','0'),{packetId:refund.id,reason:'Approve this separate actual customer entitlement for manual transfer.'});
 await f.m.startRefundPacket(f.db,f.ctx('identity-refund-start','1'),{packetId:refund.id,reason:'Record the separate original customer instruction as processing.'});
 await assert.rejects(f.m.recordRefundPacketOutcome(f.db,f.ctx('identity-refund-duplicate','2'),{packetId:refund.id,outcome:'paid',reason:'The same actual debit cannot count as another customer payment.',evidenceReference:'FICTIONAL-DUPLICATE-BANK-EVIDENCE',transactionIdentity:transaction.toLowerCase(),bankAt:Date.now()-1,amountPaisa:f.cashPaisa,completedTransferConfirmed:true,exactBeneficiaryConfirmed:true}));
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM company_outgoing_bank_identities').get()!.n,1);
 assert.equal(f.sqlite.prepare('SELECT status FROM refunds WHERE id=?').get(f.refundId)!.status,'processing');
 }finally{f.dispose();}});
