import {checkoutCommitClock} from '../checkout/commit-policy-guards';
import {protectedGuard,verifiedIdentityAtCommitSql,verifiedIdentitySql} from '../sellers/protected-change-policy';
import type {PayoutModel} from './payout-transfer-types';

const modernIntakeSql = 'EXISTS(SELECT 1 FROM seller_registration_intakes intake WHERE intake.seller_id=s.id)';
const completeIntakeSql = 'NOT EXISTS(SELECT 1 FROM seller_registration_intakes intake WHERE intake.seller_id=s.id AND intake.review_ready<>1)';
const settlementTermsSql = "length(trim(COALESCE(s.settlement_terms_reference,'')))>=4";

function currentEvidenceSql(kind:string,clock:string) {
 return `EXISTS(SELECT 1 FROM seller_documents proof WHERE proof.seller_id=s.id AND proof.kind='${kind}'
  AND proof.status='verified' AND proof.reviewed_at IS NOT NULL AND proof.reviewed_by IS NOT NULL AND proof.reviewed_by<>s.user_id
  AND (proof.valid_until IS NULL OR proof.valid_until>${clock})
  AND NOT EXISTS(SELECT 1 FROM seller_documents newer WHERE newer.seller_id=proof.seller_id AND newer.kind=proof.kind
    AND (newer.uploaded_at>proof.uploaded_at OR (newer.uploaded_at=proof.uploaded_at AND newer.id>proof.id))))`;
}

function registrationEvidenceSql(model:PayoutModel,clock:string) {
 const registered=model==='registered'?'1=1':`EXISTS(SELECT 1 FROM seller_participation_profiles route
  WHERE route.seller_id=s.id AND route.participation_route='registered_seller')`;
 return {
  identity:`${currentEvidenceSql('representative_identity',clock)} AND ${currentEvidenceSql('pan_certificate',clock)}`,
  business:`(NOT (${registered}) OR ${currentEvidenceSql('business_registration',clock)})`,
  vat:`(NOT (${registered}) OR s.tax_mode NOT IN ('VAT','BOTH') OR ${currentEvidenceSql('vat_certificate',clock)})`,
 };
}

function currentBeneficiarySql(model:PayoutModel,identity:string,clock:string,destination:string) {
 return `${model==='registered'?"s.status='approved' AND ":''}${destination} AND ${identity}
  AND substr(s.payout_account_reference,1,12)='BENEFICIARY:'
  AND EXISTS(SELECT 1 FROM seller_protected_revisions revision
    JOIN seller_beneficiary_versions beneficiary ON beneficiary.seller_id=revision.seller_id AND beneficiary.id=substr(s.payout_account_reference,13)
    JOIN seller_documents proof ON proof.id=beneficiary.document_id AND proof.seller_id=beneficiary.seller_id
    WHERE revision.seller_id=s.id AND beneficiary.identity_revision=revision.identity_revision
    AND beneficiary.verified_by IS NOT NULL AND beneficiary.verified_by<>s.user_id
    AND proof.status='verified' AND (proof.valid_until IS NULL OR proof.valid_until>${clock}))`;
}

export async function payoutRegistrationBlocker(db:D1Database,sellerId:string,model:PayoutModel,now:number,destination?:string) {
 const evidence=registrationEvidenceSql(model,String(now));
 const row=await db.prepare(`SELECT CASE
  WHEN NOT (${completeIntakeSql}) THEN 'Complete the remaining seller registration details before payouts.'
  ${model==='registered'?`WHEN NOT (${settlementTermsSql}) THEN 'Record the accepted settlement terms before payouts.'`:''}
  WHEN NOT (${evidence.identity}) THEN 'Review the current identity and PAN evidence before payouts.'
  WHEN NOT (${evidence.business}) THEN 'Review the current business registration evidence before payouts.'
  WHEN NOT (${evidence.vat}) THEN 'Review the current VAT evidence before payouts.'
  WHEN NOT COALESCE((${currentBeneficiarySql(model,verifiedIdentitySql('s.id',now),String(now),destination===undefined?'1=1':'s.payout_account_reference=?')}),0)
    THEN 'Review the verified beneficiary and current identity before payouts.'
 END AS blocker FROM seller_profiles s WHERE s.id=? AND ${modernIntakeSql}`)
  .bind(...(destination===undefined?[]:[destination]),sellerId).first<{blocker:string|null}>();
 return row?.blocker??null;
}

export function payoutRegistrationGuards(db:D1Database,sellerId:string,model:PayoutModel,destination?:string) {
 const clock=checkoutCommitClock(db);
 const evidence=registrationEvidenceSql(model,clock);
 return [
  db.prepare('UPDATE seller_profiles SET updated_at=updated_at WHERE id=?').bind(sellerId),
  ...protectedGuard(db,`EXISTS(SELECT 1 FROM seller_profiles s WHERE s.id=? AND ${completeIntakeSql}
   AND (NOT ${modernIntakeSql} OR (${model==='registered'?settlementTermsSql+' AND ':''}${evidence.identity} AND ${evidence.business} AND ${evidence.vat}
     AND ${currentBeneficiarySql(model,verifiedIdentityAtCommitSql(db,'s.id'),clock,destination===undefined?'1=1':'s.payout_account_reference=?')})))`,
   [sellerId,...(destination===undefined?[]:[destination])]),
 ];
}
