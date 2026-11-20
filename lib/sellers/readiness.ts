import type {SellerCapabilities} from '../workflows/contracts';
import {protectedCapabilityState,verifiedIdentitySql} from './protected-change-policy';
import {currentBankReadiness} from './bank-readiness';
import {CommissionRateUnavailableError,getEffectiveBusinessSetting} from '../db/repositories/business-settings';
import {getCommissionSetting} from '../db/repositories/marketplace-settings';
import {getCommissionCheckoutAcceptance} from '../db/repositories/commission-rates';
import {getAcceptedManagedTerms} from '../managed-commerce/accepted-terms';
import {getSellerFinanceSummary} from '../db/repositories/payouts';
import {getLiveManagedFinanceSummary} from '../managed-commerce/live-payout-operations';
import {getFixedSupplyBalance} from '../managed-commerce/fixed-supply';
import {publicProductVisibility} from '../products/eligibility';
import {managedMakerModelIsLiveSelectable} from '../configuration/capabilities';
import type {ManagedMakerCommercialModel} from '../configuration/types';
import {makerOwnerPredicate} from '../managed-commerce/maker-authority';
import {readManagedLiveEligibility} from '../managed-commerce/live-activation';

type Capability='dashboard'|'submitProducts'|'publicListings'|'newOrders'|'payouts';
export interface SellerReadinessCheck {id:string;label:string;status:'ready'|'action_needed'|'waiting_review'|'unavailable';detail:string;nextActor:string;ownerHref:string;staffHref:string;sourceId:string;reviewedAt:number|null;reviewedBy:string|null;}
export interface SellerReadiness extends SellerCapabilities {sellerId:string;displayName:string;observedAt:number;route:string;stage:string;checks:SellerReadinessCheck[];publicProductCount:number;bankStatus:'missing'|'pending'|'verified'|'needs_recheck'|'legacy_review_required';simulationRecorded:boolean;}
type Seller={ownerId:string;accountStatus:string;ownerRole:number;status:string;stage:string|null;route:string|null;model:ManagedMakerCommercialModel|null;bankReference:string|null;identityRevision:number;managedAgreementVersion:string|null;managedAcceptedAt:number|null;legalReference:string|null;invoiceReference:string|null;beneficiaryReference:string|null;displayName:string;};
function rateUnavailable(error:unknown):null{if(error instanceof CommissionRateUnavailableError)return null;throw error;}

/** Read-only capability projection. It never approves evidence, releases a hold or enables a live model. */
export async function getSellerReadiness(db:D1Database,sellerId:string,now:number=Date.now()):Promise<SellerReadiness>{
 if(!sellerId||!Number.isSafeInteger(now)||now<0)throw new Error('A seller reference and authoritative observation time are required.');
 const seller=await db.prepare(`SELECT s.user_id AS ownerId,u.status AS accountStatus,
 EXISTS(SELECT 1 FROM user_roles WHERE user_id=u.id AND role IN ('customer','seller')) AS ownerRole,s.status,
 p.application_stage AS stage,p.participation_route AS route,p.commercial_model AS model,s.payout_account_reference AS bankReference,
 v.identity_revision AS identityRevision,p.managed_agreement_version AS managedAgreementVersion,p.managed_agreement_accepted_at AS managedAcceptedAt,
 p.legal_seller_reference AS legalReference,p.invoice_issuer_reference AS invoiceReference,p.payout_beneficiary_reference AS beneficiaryReference,
 presentation.display_name AS displayName FROM seller_profiles s JOIN users u ON u.id=s.user_id
 LEFT JOIN seller_participation_profiles p ON p.seller_id=s.id JOIN seller_protected_revisions v ON v.seller_id=s.id
 JOIN seller_public_profile_states presentation ON presentation.seller_id=s.id WHERE s.id=?`).bind(sellerId).first<Seller>();
 if(!seller)throw new Error('Seller readiness is unavailable: the linked owner or required current state is missing.');
 const managed=seller.route==='managed_maker',stage=seller.stage??seller.status,staffRoot=`/admin/sellers/${encodeURIComponent(sellerId)}`;
 const [holds,restriction,identity,bankReadiness,documents,products,simulation,registeredMoney,managedMoney,fixedRows]=await Promise.all([
  protectedCapabilityState(db,sellerId),
  db.prepare("SELECT mode FROM seller_restrictions WHERE seller_id=? AND (mode='disabled' OR mode='suspended' AND suspended_until>?)").bind(sellerId,now).first<{mode:string}>(),
  db.prepare(`SELECT ${verifiedIdentitySql('s.id',now)} AS ready FROM seller_profiles s WHERE s.id=?`).bind(sellerId).first<{ready:number}>(),
  currentBankReadiness(db,sellerId,seller.bankReference,seller.identityRevision,seller.ownerId,now),
  db.prepare(`SELECT d.id,d.kind,d.status,d.reviewed_by AS reviewedBy,d.reviewed_at AS reviewedAt,d.valid_until AS validUntil FROM seller_documents d WHERE d.seller_id=?
   AND NOT EXISTS(SELECT 1 FROM seller_documents newer WHERE newer.seller_id=d.seller_id AND newer.kind=d.kind AND (newer.uploaded_at>d.uploaded_at OR newer.uploaded_at=d.uploaded_at AND newer.id>d.id)) ORDER BY d.kind`).bind(sellerId).all<{id:string;kind:string;status:string;reviewedBy:string|null;reviewedAt:number|null;validUntil:number|null}>(),
  db.prepare(`SELECT COUNT(*) AS count FROM products WHERE products.seller_id=? AND ${publicProductVisibility('products',now)}`).bind(sellerId).first<{count:number}>(),
  db.prepare("SELECT 1 FROM audit_logs WHERE subject_id=? AND action='managed_maker.simulation_activated' LIMIT 1").bind(sellerId).first(),
  getSellerFinanceSummary(db,sellerId,now),getLiveManagedFinanceSummary(db,sellerId,now),
  db.prepare("SELECT o.id FROM managed_supplier_obligations o WHERE o.seller_id=? AND NOT EXISTS(SELECT 1 FROM managed_supplier_payments p WHERE p.obligation_id=o.id AND p.status IN ('prepared','approved','failed'))").bind(sellerId).all<{id:string}>()
 ]);
 const fixedBalances=await Promise.all(fixedRows.results.map(row=>getFixedSupplyBalance(db,row.id)));
 const accountReady=seller.accountStatus==='active'&&Boolean(seller.ownerRole);
 const submissionReady=managed?Boolean(await db.prepare(`SELECT 1 WHERE ${makerOwnerPredicate}`).bind(sellerId,seller.ownerId,now).first()):accountReady&&!restriction&&seller.status==='approved'&&Boolean(await db.prepare("SELECT 1 FROM user_roles WHERE user_id=? AND role='seller'").bind(seller.ownerId).first());
 const {status:bankStatus,bank}=bankReadiness;
 const checks:SellerReadinessCheck[]=[],blockers:SellerCapabilities['blockers'][number][]=[];
 const add=(id:string,label:string,ready:boolean,detail:string,nextActor:string,ownerHref:string,staffHref:string,capabilities:Capability[],sourceId=id,reviewedAt:number|null=null,reviewedBy:string|null=null,status?:SellerReadinessCheck['status'])=>{
  checks.push({id,label,status:ready?'ready':status??'action_needed',detail,nextActor,ownerHref,staffHref,sourceId,reviewedAt,reviewedBy});
  if(!ready)for(const capability of capabilities)blockers.push({capability,sourceId,reason:detail,nextActor,href:ownerHref});
 };
 add('account','Owning account',accountReady,accountReady?'The linked active account retains Seller Center access.':'The linked account or its owner role needs authorized account recovery.','Account owner / account support','/seller',staffRoot,['dashboard','submitProducts','publicListings','newOrders','payouts']);
 add('submission','Product preparation and submission',submissionReady,submissionReady?'Product preparation and review submission are available independently of bank and commercial activation.':'Resolve the recorded application or access restriction before submitting a new product.','Seller / Seller Operations','/seller/registration',staffRoot+'#seller-decision',['submitProducts']);
 add('restriction','Access restriction',!restriction,restriction?`A current ${restriction.mode} restriction affects public/new commercial activity; existing responsibilities and permitted dashboard access remain separate.`:'No current seller restriction is recorded.','Eligible Super Admin','/seller/requests',staffRoot+'#seller-readiness',['publicListings','newOrders','payouts']);
 add('application','Application review',managed?['approved_for_activation','active'].includes(stage):seller.status==='approved',`Recorded application stage: ${stage.replaceAll('_',' ')}. Approval is separate from order acceptance.`,'Seller Operations / eligible Super Admin','/seller/registration',staffRoot+'#seller-decision',['newOrders']);
 const identityPending=documents.results.some(document=>['representative_identity','pan_certificate','business_registration'].includes(document.kind)
   && document.status==='pending'&&(document.validUntil===null||document.validUntil>now));
 add('identity','Current identity and applicable registration evidence',Boolean(identity?.ready),identity?.ready?'The applicable current evidence has recorded verification.'
   :identityPending?'Review the current submitted identity or registration evidence.':'Provide any missing or outdated identity and applicable registration evidence.',
   identity?.ready||identityPending?'Eligible independent Super Admin':'Seller','/seller/registration',staffRoot+'#seller-evidence',['newOrders','payouts'],
   `identity:${seller.identityRevision}`,null,null,identityPending?'waiting_review':'action_needed');
 for(const document of documents.results.filter(item=>item.kind!=='bank_verification')){
  const ready=document.status==='verified'&&document.reviewedBy!==null&&document.reviewedAt!==null&&(document.validUntil===null||document.validUntil>now);
  add(`document:${document.id}`,document.kind.replaceAll('_',' '),ready,ready?'This exact evidence version has recorded verification.':`Current evidence: ${document.status.replaceAll('_',' ')}${document.validUntil!==null&&document.validUntil<=now?' — validity has ended':''}.`,document.status==='pending'?'Eligible reviewer':'Seller / eligible reviewer','/seller/registration',staffRoot+'#seller-evidence',[],document.id,document.reviewedAt,document.reviewedBy,'waiting_review');
 }
 add('bank','Payout beneficiary',bankStatus==='verified',bankStatus==='verified'?'The current beneficiary version has independent verification against the current identity.':bankStatus==='legacy_review_required'?'A legacy receiving reference needs evidence reconciliation; a nonempty reference is not current verification.':`Payout beneficiary ${bankStatus.replaceAll('_',' ')}. Product submission remains separate.`,bankStatus==='missing'?'Seller':'Eligible independent Super Admin','/seller/finance',staffRoot+'#seller-bank',['payouts'],bank?.id??'bank',bank?.reviewedAt??null,bank?.reviewedBy??null,'waiting_review');
 let termsReady=false,termsUnavailable=false;
 if(managed&&seller.model==='managed_fixed_supplier_price_v1'){
  termsReady=Boolean(await db.prepare(`SELECT 1 FROM managed_maker_application_details WHERE seller_id=? AND agreement_accepted_by=? AND agreement_version=? AND agreement_accepted_at=? AND agreement_accepted_at<=?`).bind(sellerId,seller.ownerId,seller.managedAgreementVersion,seller.managedAcceptedAt,now).first());
 }else if(managed){const accepted=await getAcceptedManagedTerms(db,sellerId,now).catch(rateUnavailable);termsReady=Boolean(accepted);if(!accepted){const rate=await getEffectiveBusinessSetting(db,'managed_sale_linked_platform_retention_bps',now).catch(rateUnavailable);termsUnavailable=!rate;}}
 else {const terms=await getCommissionSetting(db,now).catch(rateUnavailable);termsUnavailable=!terms;termsReady=terms!==null&&!!await getCommissionCheckoutAcceptance(db,sellerId,terms,now);}
 add('terms','Current effective terms',termsReady,termsReady?'The owner has accepted the applicable current terms.':termsUnavailable?'The current commercial terms are unavailable; platform staff must restore the authoritative source.':'The owner must accept the applicable effective terms. This does not freeze otherwise eligible historical payouts.',termsUnavailable?'Platform operations':'Seller',managed?'/seller/registration':'/seller','/admin/commission',['newOrders'],'terms',null,null,termsUnavailable?'unavailable':'action_needed');
 if(managed){
  const [program,model,company]=await Promise.all([getEffectiveBusinessSetting(db,'managed_maker_program_mode',now),getEffectiveBusinessSetting(db,'managed_maker_active_model',now),getEffectiveBusinessSetting(db,'managed_maker_company_account',now)]);
  const configured=program.value==='activation_enabled'&&model.value!==null&&model.value===seller.model&&Boolean(company.versionId)&&seller.legalReference===company.value.entityReference&&seller.invoiceReference===company.value.entityReference;
  add('commercial','Company and commercial configuration',configured,configured?'The recorded model, legal seller and invoice issuer match the current company setting.':'Hastabazaar must complete or review the model, company seller and invoice issuer configuration.','Hastabazaar operations',managed?'/seller/registration':'/seller','/admin/programs',['newOrders']);
  const live=seller.model==='managed_fixed_supplier_price_v1'?null:await readManagedLiveEligibility(db,sellerId,now);
  const liveReady=stage==='active'&&seller.model!==null&&managedMakerModelIsLiveSelectable(seller.model)&&live?.enabled===true;
  add('activation','Live order acceptance',liveReady,liveReady?'The recorded live decision and current evidence permit new orders; each exact offer is checked again at checkout.':live?.decision?'The live decision is retained. Resolve the current requirements below before accepting new orders.':simulation?'A local simulation activation is recorded. Separate verified clearance and a live activation decision are still required.':'Explicit live activation and its evidence-bound commercial checks remain outstanding.','Eligible Super Admin / Hastabazaar operations','/seller/registration',staffRoot+'#seller-readiness',['newOrders'],live?.decision?.id??'activation',live?.decision?.createdAt??null);
  if(live){
   add('live-clearance','External commercial clearance',Boolean(live.clearance),live.clearance?'A current independently reviewed external clearance is recorded for this material commercial scope.':'Hastabazaar must retain and review actual external legal/accounting clearance for the current commercial scope.','Eligible Super Admin / Hastabazaar operations','/seller/requests',staffRoot+'#seller-readiness',['newOrders'],live.clearance?.id??'live-clearance',live.clearance?.reviewedAt??null);
   for(const blocker of live.blockers)add('live:'+blocker.id,'Live readiness: '+blocker.id.replaceAll('_',' '),false,blocker.detail,blocker.nextActor,blocker.href.startsWith('/seller')?blocker.href:'/seller/requests',blocker.href.startsWith('/admin')?blocker.href:staffRoot+'#seller-readiness',['newOrders']);
  }
 }
 for(const hold of holds.holds)add(`hold:${hold.id}`,hold.capability==='payouts'?'Payout hold':'New-order hold',false,hold.reason,'Eligible Super Admin','/seller/requests',staffRoot+'#seller-readiness',[hold.capability==='payouts'?'payouts':'newOrders'],`hold:${hold.id}`);
 const moneyReady=registeredMoney.availablePaisa>0||managedMoney.payablePaisa>0||fixedBalances.some(balance=>balance.balancePaisa>0&&balance.recoverablePaisa===0);
 add('balance','Eligible unpaid balance',moneyReady,moneyReady?'An existing ledger has a positive eligible balance for record-specific payout review.':'No positive eligible unreserved balance is currently available for a new payout.','Finance / eligible Super Admin','/seller/finance',managed?`/admin/programs?sellerId=${encodeURIComponent(sellerId)}#maker-payments`:`/admin/payouts?sellerId=${encodeURIComponent(sellerId)}`,['payouts']);
 const publicProductCount=Number(products?.count??0);
 add('listings','Public products',publicProductCount>0,publicProductCount?`${publicProductCount} product listing(s) are currently public; each product has separate purchase checks.`:'No product is currently public. Prepare or follow the exact product review.','Seller / product reviewer','/seller/products',`/admin/products?seller=${encodeURIComponent(sellerId)}`,['publicListings']);
 const allowed=(capability:Capability)=>!blockers.some(blocker=>blocker.capability===capability);
 return {sellerId,displayName:seller.displayName,observedAt:now,route:seller.route??'registered_seller',stage,checks,blockers,publicProductCount,bankStatus,simulationRecorded:Boolean(simulation),dashboard:allowed('dashboard'),submitProducts:allowed('submitProducts'),publicListings:allowed('publicListings'),newOrders:allowed('newOrders'),payouts:allowed('payouts')};
}
