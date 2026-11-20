import type {CommandContext} from '../workflows/contracts';
import type {evaluateManagedLiveEligibility} from './live-readiness';
import {managedLiveScopeGuards,managedClearanceGuards} from './live-clearance';
import {ManagedLiveError,MANAGED_LIVE_MODEL} from './live-activation-support';
import {paymentGuard} from '../payments/manual-receipts';
import {checkoutCommitClock} from '../checkout/commit-policy-guards';
export function prepareManagedLiveActivationDecision(db:D1Database,ctx:CommandContext,input:{sellerId:string;clearanceId:string;reason:string},current:Awaited<ReturnType<typeof evaluateManagedLiveEligibility>>){
 if(!current.readyForActivation||!current.clearance||!current.scope.acceptedTerms||current.clearance.id!==input.clearanceId)throw new ManagedLiveError('Complete every current authoritative prerequisite before enabling this exact live scope.');
 const scope=current.scope,terms=scope.acceptedTerms;
 if(!terms)throw new ManagedLiveError('The owner must accept the exact current terms before the activation decision.');
 const id=crypto.randomUUID(),revision=(current.decision?.revision??0)+1,clock=checkoutCommitClock(db);
 const source={acceptedManagedDetailId:terms.detailId,agreementVersion:terms.agreementVersion,agreementAcceptedAt:terms.acceptedAt,sources:scope.sources,materialScopeDigest:scope.materialScopeDigest,companyEntityReference:scope.companyEntityReference,product:current.products};
 const statements=[...managedLiveScopeGuards(db,scope,ctx.now),...managedClearanceGuards(db,current.clearance,ctx.now),...current.financial.guards,
  ...paymentGuard(db,"EXISTS(SELECT 1 FROM products p WHERE p.id=? AND p.seller_id=? AND p.status IN('approved','published') AND NOT EXISTS(SELECT 1 FROM product_deletions d WHERE d.product_id=p.id))",[current.products!.id,input.sellerId]),
  db.prepare(`UPDATE seller_participation_profiles SET application_stage='active',commercial_model=?,legal_seller_reference=?,invoice_issuer_reference=?,payout_beneficiary_reference=?,managed_agreement_version=?,managed_agreement_language=?,managed_agreement_accepted_at=?,accepted_managed_detail_id=?,version=version+1,updated_at=${clock} WHERE seller_id=? AND version=? AND application_stage IN('approved_for_activation','active')`).bind(MANAGED_LIVE_MODEL,scope.companyEntityReference,scope.companyEntityReference,scope.seller.bankReference,terms.agreementVersion,terms.language,terms.acceptedAt,terms.detailId,input.sellerId,scope.seller.participationVersion),...paymentGuard(db,'changes()=1'),
  db.prepare(`INSERT INTO managed_live_activation_decisions(id,seller_id,owner_id,model,clearance_id,material_scope_digest,company_scope_digest,financial_scope_id,issuer_model,issuer_scope_digest,source_json,revision,previous_decision_id,actor_id,created_at,request_id,reason) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,${clock},?,?)`).bind(id,input.sellerId,scope.ownerId,MANAGED_LIVE_MODEL,current.clearance.id,scope.materialScopeDigest,scope.companyScopeDigest,current.clearance.financialScopeId,current.clearance.issuerModel,current.clearance.issuerScopeDigest,JSON.stringify(source),revision,current.decision?.id??null,ctx.actorId,ctx.requestId,input.reason),
  db.prepare(`INSERT INTO audit_logs(id,actor_id,action,subject_type,subject_id,reason,next_json,request_id,created_at) VALUES(?,?,'managed_maker.live.activated','seller',?,?,?,?,${clock})`).bind(crypto.randomUUID(),ctx.actorId,input.sellerId,input.reason,JSON.stringify({activationDecisionId:id,clearanceId:current.clearance.id,materialScopeDigest:scope.materialScopeDigest,financialScopeId:current.clearance.financialScopeId,acceptedManagedDetailId:terms.detailId}),ctx.requestId+':activation'),
 ];
 return {id,statements,result:{id,sellerId:input.sellerId,revision:scope.seller.participationVersion+1,decisionRevision:revision}};
}
