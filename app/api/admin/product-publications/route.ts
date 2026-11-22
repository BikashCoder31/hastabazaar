import {productMutationBoundary,intakeErrorReply,type ProductMutationPhase} from '@/lib/products/intake-http';
import {mapLegacyProductOffer} from '@/lib/products/offer-inventory';
import {validOfferId} from '@/lib/products/offer-contracts';
import {reviewPriceReference,type PriceReferenceEvidence} from '@/lib/products/price-references';
import {captureOrderablePriceObservation} from '@/lib/products/orderable-price-history';
import {offerMoney,physicalOfferIdentity} from '@/lib/products/offer-contracts';
import {env} from 'cloudflare:workers';
import {requireStaffApi,StaffAuthorizationError} from '@/lib/auth/staff';
import {requireDatabase} from '@/lib/db/d1';
import {readBoundedJsonObject} from '@/lib/http/form-json-body';
import {isTrustedMutationRequest} from '@/lib/http/request-security';
import {CategoryContractError} from '@/lib/products/category-contracts';
import {getProductPublicationReview,reviewProductPublication,type PublicationDecisionInput} from '@/lib/products/publication';
import {closedIntakeFields,intakeCommand,intakeFailure,intakeId,intakeQuery,intakeReply,intakeActor} from '@/lib/products/intake-http';
const failure=(error:unknown,phase?:ProductMutationPhase)=>error instanceof StaffAuthorizationError?intakeErrorReply(error.message,error.status,phase):intakeFailure(error,phase);
async function reader(){try{return await requireStaffApi('product.review');}catch(error){if(!(error instanceof StaffAuthorizationError)||error.status!==403)throw error;return requireStaffApi('product.publish');}}
export async function GET(request:Request){try{const actor=await reader();intakeActor(request,actor.id);const query=intakeQuery(request,['caseId']),caseId=query.get('caseId');if(!intakeId(caseId))throw new CategoryContractError('Choose the exact product case.',400);return intakeReply(await getProductPublicationReview(requireDatabase(env as unknown as {DB?:D1Database}),actor.id,caseId));}catch(error){return failure(error);}}
export async function POST(request:Request){const boundary=productMutationBoundary();
 if(!isTrustedMutationRequest(request))return intakeErrorReply('Cross-site requests are not allowed.',403,'rejected_before_write');
 try{
  const body=await readBoundedJsonObject(request);
  if(body.action==='map_legacy_stock'){
   closedIntakeFields(body,['action','requestId','expectedRevision','caseId','versionId','expectedCaseRevision','physicalMapping','reason']);
   if(!intakeId(body.caseId)||!intakeId(body.versionId)||typeof body.expectedCaseRevision!=='string'||!/^\d{1,16}$/.test(body.expectedCaseRevision)||typeof body.reason!=='string'||!body.physicalMapping||typeof body.physicalMapping!=='object'||Array.isArray(body.physicalMapping))throw new CategoryContractError('Compare the retained physical stock and exact current candidate.',400);
   const mapping=body.physicalMapping as Record<string,unknown>;closedIntakeFields(mapping,['baseUnit','unitsPerOffer','stockFamilyKey']);
   if(!['piece','gram','millilitre'].includes(String(mapping.baseUnit))||typeof mapping.unitsPerOffer!=='number'||typeof mapping.stockFamilyKey!=='string')throw new CategoryContractError('Record the actual physical unit, quantity per sold item and same-goods stock family.',400);
   const actor=await requireStaffApi('product.review'),ctx=intakeCommand(body,actor.id,request),db=requireDatabase(env as unknown as {DB?:D1Database}),view=await getProductPublicationReview(db,actor.id,body.caseId);
   if(!view.canReview||view.candidate.versionId!==body.versionId||String(view.caseRevision)!==body.expectedCaseRevision)throw new CategoryContractError('Refresh the current submitted candidate before reconciling its retained stock.');
   boundary.begin();return intakeReply(await mapLegacyProductOffer(db,ctx,{productId:view.productId,reason:body.reason,physicalMapping:{baseUnit:mapping.baseUnit as 'piece'|'gram'|'millilitre',unitsPerOffer:mapping.unitsPerOffer,stockFamilyKey:mapping.stockFamilyKey}}));
  }
  if(body.action==='observe_price'){
   closedIntakeFields(body,['action','requestId','expectedRevision','caseId','versionId','expectedCaseRevision','offerId','publicVersionId','reason']);
   if(!intakeId(body.caseId)||!intakeId(body.versionId)||!intakeId(body.publicVersionId)||!validOfferId(body.offerId)||typeof body.expectedCaseRevision!=='string'||typeof body.reason!=='string')throw new CategoryContractError('Identify the exact current public offer to observe.',400);
   const actor=await requireStaffApi('product.review'),ctx=intakeCommand(body,actor.id,request),db=requireDatabase(env as unknown as {DB?:D1Database}),view=await getProductPublicationReview(db,actor.id,body.caseId);
   if(!view.canReview||view.candidate.versionId!==body.versionId||String(view.caseRevision)!==body.expectedCaseRevision||view.currentVersionId!==body.publicVersionId)throw new CategoryContractError('Compare the exact current product and public version before observing its price.');
   boundary.begin();return intakeReply(await captureOrderablePriceObservation(db,ctx,{productId:view.productId,offerId:body.offerId,publicVersionId:body.publicVersionId,caseId:body.caseId,versionId:body.versionId,expectedCaseRevision:body.expectedCaseRevision,reason:body.reason}));
  }
  if(body.action==='price_reference'){
   closedIntakeFields(body,['action','requestId','expectedRevision','caseId','versionId','expectedCaseRevision','offerId','decision','evidence','reason']);
   if(!intakeId(body.caseId)||!intakeId(body.versionId)||!validOfferId(body.offerId)||typeof body.expectedCaseRevision!=='string'||!/^\d{1,16}$/.test(body.expectedCaseRevision)||!['approved','suppressed'].includes(String(body.decision))||typeof body.reason!=='string'||!body.evidence||typeof body.evidence!=='object'||Array.isArray(body.evidence))throw new CategoryContractError('Identify the exact offer and actual reference-price evidence.',400);
   const evidence=body.evidence as Record<string,unknown>;closedIntakeFields(evidence,['kind','reference','offeredFrom','offeredTo','checkedSameSellerOffer','checkedPriceHistory','historyBasis','historyThroughId','historyCount']);
   const actor=await requireStaffApi('product.review'),ctx=intakeCommand(body,actor.id,request),db=requireDatabase(env as unknown as {DB?:D1Database}),view=await getProductPublicationReview(db,actor.id,body.caseId);
   if(!view.canReview||view.candidate.versionId!==body.versionId||String(view.caseRevision)!==body.expectedCaseRevision)throw new CategoryContractError('Compare the exact current submitted product before recording its evidence.');
   const row=view.candidate.snapshot.offers.offers.find(offer=>offer.id===body.offerId&&offer.included),original=row?offerMoney(row.compareAt):null;if(!row||original===null)throw new CategoryContractError('Choose an included offer that actually claims an original price.',400);
   boundary.begin();return intakeReply(await reviewPriceReference(db,ctx,{productId:view.productId,versionId:view.candidate.offerVersionId,offerId:row.id,decision:body.decision as 'approved'|'suppressed',evidence:{...evidence,sellerId:view.sellerId,offerId:row.id,physicalIdentity:physicalOfferIdentity(row),originalPaisa:original} as PriceReferenceEvidence,reason:body.reason}));
  }
  closedIntakeFields(body,['action','requestId','expectedRevision','caseId','versionId','expectedCaseRevision','reason','checks']);
  if(!['approve_only','approve_and_publish','publish_approved','request_changes','reject'].includes(String(body.action))||!intakeId(body.caseId)||!intakeId(body.versionId)||typeof body.expectedCaseRevision!=='string'||!/^\d{1,16}$/.test(body.expectedCaseRevision)||typeof body.reason!=='string'||!(body.checks===null||typeof body.checks==='object'&&!Array.isArray(body.checks)))throw new CategoryContractError('Use an exact submitted version, case revision and supported publication decision.',400);
  const actor=await requireStaffApi(body.action==='publish_approved'?'product.publish':'product.review');
  if(body.action==='approve_and_publish'&&(await requireStaffApi('product.publish')).id!==actor.id)throw new StaffAuthorizationError('The signed-in staff account changed. Reload this exact candidate.',403);
  const ctx=intakeCommand(body,actor.id,request),{requestId,expectedRevision,...input}=body;void requestId;void expectedRevision;
  boundary.begin();return intakeReply(await reviewProductPublication(requireDatabase(env as unknown as {DB?:D1Database}),ctx,input as unknown as PublicationDecisionInput));
 }catch(error){return failure(error,boundary.phase);}
}
