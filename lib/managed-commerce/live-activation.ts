import {operationalBusinessNotificationStatements} from '../operations/business-notifications';
import type {CommandContext} from '../workflows/contracts';
import {managedLiveAuthority,managedLiveCommand,ManagedLiveError,liveText} from './live-activation-support';
import {evaluateManagedLiveEligibility} from './live-readiness';
import {prepareManagedLiveActivationDecision} from './live-activation-decision';
export {readManagedLiveEligibility,managedLiveEligibilityGuards,type ManagedLiveOrderProof,type ManagedLiveBlocker} from './live-readiness';
export async function getManagedLiveActivationReview(db:D1Database,actorId:string,sellerId:string,now=Date.now()){
 if(!Number.isSafeInteger(now)||now<0)throw new ManagedLiveError('Use a valid native observation time.',400);
 const authority=await managedLiveAuthority(db,actorId,sellerId),current=await evaluateManagedLiveEligibility(db,sellerId,now);
 const evidence=(await db.prepare(`SELECT clearance.id clearanceId,clearance.issuer,clearance.external_reference externalReference,clearance.evidence_ids_json evidenceIds,clearance.reason,clearance.state,clearance.revision FROM managed_live_clearances clearance WHERE clearance.seller_id=? ORDER BY clearance.reviewed_at DESC,clearance.id DESC LIMIT 20`).bind(sellerId).all<{clearanceId:string;issuer:string;externalReference:string;evidenceIds:string;reason:string;state:string;revision:number}>()).results;
 const uploads=(await db.prepare(`SELECT i.id,i.original_name originalName,i.mime_type mimeType,i.size_bytes sizeBytes,i.uploaded_by uploadedBy FROM managed_clearance_evidence_intents i JOIN managed_clearance_evidence_files f ON f.id=i.id WHERE i.seller_id=? AND i.material_scope_digest=? ORDER BY f.retained_at DESC,i.id LIMIT 100`).bind(sellerId,current.scope.materialScopeDigest).all<{id:string;originalName:string;mimeType:string;sizeBytes:number;uploadedBy:string}>()).results;
 await db.batch(authority);
 return {sellerId,enabled:current.enabled,readyForActivation:current.readyForActivation,participationVersion:current.scope.seller.participationVersion,readinessDigest:current.sourceDigest,blockers:current.blockers,clearance:current.clearance,decision:current.decision,scope:current.scope,evidence,uploads,financial:current.financial.scope};
}
export async function activateManagedMakerLive(db:D1Database,ctx:CommandContext,input:{sellerId:string;readinessDigest:string;clearanceId:string;reason:string}){
 if(!input||Object.keys(input).some(key=>!['sellerId','readinessDigest','clearanceId','reason'].includes(key)))throw new ManagedLiveError('Use only the current protected seller, clearance and readiness decision fields.',400);
 const command=await managedLiveCommand(db,ctx,'activated',input.sellerId,input);if(command.receipt.replayed)return command.receipt.result as {id:string;sellerId:string;revision:number;decisionRevision:number};
 const reason=liveText(input.reason,'live activation reason'),current=await evaluateManagedLiveEligibility(db,input.sellerId,ctx.now);
 if(ctx.expectedRevision!==String(current.scope.seller.participationVersion)||input.readinessDigest!==current.sourceDigest)throw new ManagedLiveError('The current evidence, accepted terms, settings or seller scope changed. Refresh the review and retain its context.');
 if(current.enabled)throw new ManagedLiveError('This exact current live scope is already enabled; review its retained activation outcome.');
 const decision=prepareManagedLiveActivationDecision(db,ctx,{...input,reason},current);
 const notices=await operationalBusinessNotificationStatements(db,{kind:'seller.live_activation',sourceId:decision.id,eventId:ctx.requestId,actorId:ctx.actorId,now:ctx.now,detail:'Your managed-maker activation decision was recorded. Open Seller Center to review current order acceptance, evidence and any next action.'});
 return command.commit([...decision.statements,...notices],decision.result);
}

export type ManagedLiveActivationReview=Awaited<ReturnType<typeof getManagedLiveActivationReview>>;
