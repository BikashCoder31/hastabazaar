import {getSellerReadiness} from './readiness';
import {verifiedIdentitySql,noProtectedHoldSql} from './protected-change-policy';
import {getCommissionSetting} from '../db/repositories/marketplace-settings';
import {getSellerCommissionTerms,getCommissionCheckoutAcceptance,commissionCheckoutGuards} from '../db/repositories/commission-rates';
import {getEffectiveBusinessSetting} from '../db/repositories/business-settings';
import {getAcceptedManagedTerms,acceptedManagedTermsGuards} from '../managed-commerce/accepted-terms';
import {offerGuard,OfferError} from '../products/offer-support';
import {readManagedLiveEligibility,managedLiveEligibilityGuards} from '../managed-commerce/live-activation';
/** Explicit resume uses the same current evidence/terms, then guards their source in its transaction. */
export async function sellerOrderReadinessGuards(db:D1Database,sellerId:string,now:number){
 const readiness=await getSellerReadiness(db,sellerId,now);
 if(!readiness.newOrders)throw new OfferError('Current order readiness needs action: '+readiness.blockers.filter(row=>row.capability==='newOrders').map(row=>row.reason).join(' '));
 const managed=readiness.route==='managed_maker';
 const statements=offerGuard(db,`EXISTS(SELECT 1 FROM seller_profiles s JOIN users u ON u.id=s.user_id
   LEFT JOIN seller_participation_profiles route ON route.seller_id=s.id
   WHERE s.id=? AND u.status='active'
   AND EXISTS(SELECT 1 FROM user_roles r WHERE r.user_id=u.id AND r.role IN ('seller','customer'))
   AND COALESCE(route.participation_route,'registered_seller')=?
   ${managed?`AND ${verifiedIdentitySql('s.id',now)}`:''}
   AND ${noProtectedHoldSql('s.id','new_orders')})`,[sellerId,readiness.route]);
 if(!managed){
  const setting=await getCommissionSetting(db,now),terms=await getSellerCommissionTerms(db,sellerId,now),acceptance=await getCommissionCheckoutAcceptance(db,sellerId,setting,now);
  if(!acceptance)throw new OfferError('Current owner terms acceptance is required before resuming orders.');
  return [...statements,...commissionCheckoutGuards(db,{[sellerId]:terms},setting,{[sellerId]:acceptance},now)];
 }
 const live=await readManagedLiveEligibility(db,sellerId,now);
 if(!live.enabled||!live.proof)throw new OfferError('Current live commercial clearance and activation are required before accepting this order.');
 statements.push(...await managedLiveEligibilityGuards(db,live.proof,now));
 const [program,model,company]=await Promise.all([getEffectiveBusinessSetting(db,'managed_maker_program_mode',now),getEffectiveBusinessSetting(db,'managed_maker_active_model',now),getEffectiveBusinessSetting(db,'managed_maker_company_account',now)]);
 if(program.value!=='activation_enabled'||!model.value||!company.versionId)throw new OfferError('Current commercial configuration is not ready for new orders.');
 statements.push(...offerGuard(db,"EXISTS(SELECT 1 FROM seller_participation_profiles p WHERE p.seller_id=? AND p.participation_route='managed_maker' AND p.application_stage='active' AND p.commercial_model=? AND p.legal_seller_reference=? AND p.invoice_issuer_reference=?)",[sellerId,model.value,company.value.entityReference,company.value.entityReference]));
 for(const [key,value] of [['managed_maker_program_mode',program],['managed_maker_active_model',model],['managed_maker_company_account',company]] as const)statements.push(...offerGuard(db,"COALESCE((SELECT id FROM business_setting_versions WHERE setting_key=? AND status='published' AND effective_from<=? AND (effective_until IS NULL OR effective_until>?) ORDER BY effective_from DESC,version DESC LIMIT 1),'')=?",[key,now,now,value.versionId??'']));
 if(model.value==='managed_fixed_supplier_price_v1')statements.push(...offerGuard(db,'EXISTS(SELECT 1 FROM seller_participation_profiles p JOIN seller_profiles s ON s.id=p.seller_id JOIN managed_maker_application_details d ON d.seller_id=s.id WHERE s.id=? AND d.agreement_accepted_by=s.user_id AND d.agreement_version=p.managed_agreement_version AND d.agreement_accepted_at=p.managed_agreement_accepted_at AND d.agreement_accepted_at<=?)',[sellerId,now]));
 else {const terms=await getAcceptedManagedTerms(db,sellerId,now);if(!terms)throw new OfferError('Current managed terms need owner acceptance before resuming orders.');statements.push(...acceptedManagedTermsGuards(db,terms,now));}
 return statements;
}
