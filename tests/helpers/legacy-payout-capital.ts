import assert from 'node:assert/strict';
import {saveCompanyAccountDraft,submitCompanyAccountForReview,verifyCompanyAccount} from '../../lib/payments/company-accounts';
import {recordRefundFundingStatement} from '../../lib/payments/refund-funding';
import {checkoutCommitClock} from '../../lib/checkout/commit-policy-guards';
import {companyDetails} from '../../lib/content/company-details';
/** Original fictional company capital; never inferred from seller earnings or customer claims. */
export async function legacyPayoutCapital(db:D1Database){
 assert.ok((await db.prepare('PRAGMA database_list').all<{file:string}>()).results.every(row=>row.file===''));
 const prefix=crypto.randomUUID(),ctx=(suffix:string,expectedRevision:string|null=null)=>({actorId:'super-1',requestId:prefix+'-'+suffix,expectedRevision,now:Date.now()});
 const draft=await saveCompanyAccountDraft(db,ctx('source'),{accountId:null,basedOnVersionId:null,details:{holder:companyDetails.legalName,bank:'Fictional independent company bank',branch:'Fictional branch',accountNumber:'TEST-LEGACY-PAYOUT-CAPITAL',currency:'NPR',purpose:'payment_source'},evidenceReference:'FICTIONAL-COMPANY-OWNERSHIP-EVIDENCE',conflictUserIds:[],reason:'Record actual fictional company capital ownership independently from seller earnings.'});
 await submitCompanyAccountForReview(db,ctx('submit','0'),{versionId:draft.versionId,reason:'Submit this exact original fictional company capital account for review.'});
 await verifyCompanyAccount(db,ctx('verified','1'),{versionId:draft.versionId,ownershipConfirmed:true,currencyConfirmed:true,verificationReference:'FICTIONAL-INDEPENDENT-COMPANY-OWNERSHIP',reason:'Independently verify the exact original fictional company source ownership.'});
 const now=(await db.prepare(`SELECT ${checkoutCommitClock(db)} AS now`).first<{now:number}>())!.now;
 await recordRefundFundingStatement(db,ctx('funds'),{accountVersionId:draft.versionId,statementIdentity:'FICTIONAL-ORIGINAL-COMPANY-CAPITAL-'+prefix,asOf:now,cashPaisa:10_000_000,restrictedPaisa:0,evidenceReference:'FICTIONAL-ACTUAL-COMPANY-CAPITAL-STATEMENT',restrictionsReference:'FICTIONAL-RECONCILED-EXCLUDED-OTHER-PEOPLES-MONEY',availableFundsConfirmed:true,reason:'Verify actual fictional free company capital independently from incoming and seller ledgers.'});
 return{accountVersionId:draft.versionId,ctx};
}
