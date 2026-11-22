import type {ProductCommandSource} from './command-outcome-contract';
const object=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
const id=(value:unknown):value is string=>typeof value==='string'&&/^[A-Za-z0-9_.:-]{1,191}$/.test(value);
const revision=(value:unknown):value is number=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=0;
/** Native POST result contracts, not an inferred receipt or a current-state claim. */
export function validProductCommandResult(source:ProductCommandSource,payload:Record<string,unknown>,value:unknown):boolean{
 if(!object(value))return false;
 switch(source.kind){
  case 'publication_review':
   if(payload.action==='observe_price')return id(value.id)&&revision(value.observedAt)&&value.caseId===source.sourceId;
   return payload.action==='price_reference'?id(value.id)&&revision(value.revision)&&typeof value.approved==='boolean':id(value.productId)&&value.versionId===payload.versionId&&id(value.versionId)&&revision(value.revision)&&revision(value.caseRevision)&&typeof value.outcome==='string'&&value.outcome.length>0;
  case 'intake_review':return value.caseId===source.sourceId&&revision(value.revision)&&(payload.action!=='propose'||id(value.proposalId));
  case 'availability':
   if(payload.action==='move_stock')return revision(value.fromRevision)&&revision(value.toRevision);
   if(payload.action==='confirm_stock')return value.offerId===payload.offerId&&id(value.offerId)&&revision(value.revision)&&revision(value.available)&&revision(value.reserved);
   if(payload.action==='pause_offer')return value.offerId===payload.offerId&&id(value.offerId)&&revision(value.revision)&&typeof value.paused==='boolean';
   return value.productId===source.sourceId&&revision(value.revision)&&id(value.eventId)&&value.action===payload.action;
  case 'concern_report':return id(value.id)&&revision(value.revision)&&['open','waiting_seller','resolved'].includes(String(value.state));
  case 'concern_case':return value.id===source.sourceId&&revision(value.revision)&&['open','waiting_seller','resolved'].includes(String(value.state));
  case 'publication_owner':return payload.action==='rebase'?value.draftId===source.sourceId&&id(value.baseVersionId)&&revision(value.publicationRevision)&&revision(value.draftRevision):id(value.caseId)&&id(value.versionId)&&revision(value.revision)&&typeof value.state==='string';
  case 'legacy_product':return value.productId===source.sourceId&&id(value.id)&&id(value.versionId)&&revision(value.revision);
  case 'legacy_media':return id(value.id)&&value.draftId===source.sourceId&&typeof value.mimeType==='string'&&revision(value.sizeBytes)&&value.sizeBytes>0&&value.state==='ready'&&revision(value.completedAt);
  case 'legacy_stock':return id(value.versionId)&&revision(value.revision);
 }
}
