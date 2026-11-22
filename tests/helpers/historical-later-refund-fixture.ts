import assert from 'node:assert/strict';
import {historicalManagedRecoveryFixture} from './historical-managed-recovery-fixture';
import {completeManagedRecoveryRefund} from './managed-recovery-fixture';
import {checkoutCommitClock} from '../../lib/checkout/commit-policy-guards';
import {getRefundFundingAvailability,recordRefundFundingStatement} from '../../lib/payments/refund-funding';

export async function historicalLaterRefundFixture(){
 const f=await historicalManagedRecoveryFixture({quantity:2});try{
  assert.ok(f.sqlite.prepare('PRAGMA database_list').all().every(row=>row.file===''));
  const accountVersionId=f.payoutSources.accountVersionId,funding=await getRefundFundingAvailability(f.db,accountVersionId),now=(await f.db.prepare(`SELECT ${checkoutCommitClock(f.db)} now`).first<{now:number}>())!.now;
  await recordRefundFundingStatement(f.db,{...f.ctx('later-refund-capital',String(funding.revision)),now},{accountVersionId,statementIdentity:'FICTIONAL-LATER-REFUND-CAPITAL',asOf:now,cashPaisa:500000,restrictedPaisa:50000,evidenceReference:'FICTIONAL-LATER-REFUND-FUNDS',restrictionsReference:'FICTIONAL-LATER-REFUND-RESERVES',availableFundsConfirmed:true,reason:'Independently verify fictional customer-refund funds without waiting for any seller collection.'});
  const fundingId=String(f.sqlite.prepare('SELECT statement_id FROM company_funding_accounts WHERE account_id=(SELECT account_id FROM company_payment_account_versions WHERE id=?)').get(accountVersionId)!.statement_id);
  const second=await completeManagedRecoveryRefund({...f,payoutSources:{...f.payoutSources,fundingId}},'seller','after-historical-payout',50000);
  return {...f,secondRefundId:second.refundId};
 }catch(error){f.dispose();throw error;}
}
