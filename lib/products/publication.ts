import {getProductStockAllocations} from './stock-summary';
import {publicPublicationSnapshot} from './publication-view';
import {commandReceipt,type CommandContext} from '../workflows/contracts';
import {staffMutationGuard} from '../db/repositories/staff-mutation-guard';
import {operationalBusinessNotificationStatements} from '../operations/business-notifications';
import {offerAuthority,offerGuard,offerReason,OfferError,productReadGuardConflict} from './offer-support';
import {headGuard,offerHead,offerIdentityStatements} from './offers';
import {publicationHead,publicationHeadGuard} from './publication-candidates';
import {getCategoryDetailGroups} from './category-contracts';
import {detailText} from './category-fields';
import {compileProductPublication,type ProductPublication} from './publication-contract';
import {approvedPriceReference} from './price-references';
import {orderablePriceObservations} from './orderable-price-history';
import {physicalOfferIdentity} from './offer-contracts';
import {prepareDiscountPublicationStatements} from './discount-advisory-store';
import {publicationSellerEligibility} from './eligibility';
import {productAvailabilityState,availabilityStateGuard} from './availability-state';
import {mediaGuard,type IntakeSnapshot} from './intake-workspace';
export {rebaseProductWorkspace} from './publication-candidates';
export {submitProductPriceRevision,getRetainedProductPriceRequests} from './price-revision';

type Candidate={versionId:string;productId:string;caseId:string;workspaceVersionId:string;offerVersionId:string;categoryVersionId:string;baseVersionId:string|null;draftId:string;sellerId:string;ownerId:string;snapshotJson:string;caseRevision:number;caseState:string;caseVersionId:string};
async function candidateSource(db:D1Database,caseId:string,versionId?:string){
 return db.prepare(`SELECT c.id AS versionId,c.product_id AS productId,c.case_id AS caseId,c.workspace_version_id AS workspaceVersionId,c.offer_version_id AS offerVersionId,c.category_version_id AS categoryVersionId,c.base_version_id AS baseVersionId,ic.draft_id AS draftId,d.seller_id AS sellerId,d.owner_id AS ownerId,v.snapshot_json AS snapshotJson,ic.revision AS caseRevision,ic.state AS caseState,ic.version_id AS caseVersionId
 FROM product_publication_candidates c JOIN product_intake_cases ic ON ic.id=c.case_id JOIN product_intake_drafts d ON d.id=ic.draft_id JOIN product_intake_workspace_versions v ON v.id=c.workspace_version_id JOIN product_publication_heads h ON h.product_id=c.product_id
 WHERE c.case_id=? AND ${versionId?'c.id=?':'c.workspace_version_id=ic.version_id'} ORDER BY CASE WHEN c.id=h.pending_version_id THEN 2 WHEN c.id=h.current_version_id THEN 1 ELSE 0 END DESC,c.created_at DESC,c.id DESC LIMIT 1`).bind(...(versionId?[caseId,versionId]:[caseId])).first<Candidate>();
}
class PublicationPermissionError extends OfferError{constructor(message:string){super(message,403);}}
export async function getProductPublicationReview(db:D1Database,actorId:string,caseId:string){
 const candidate=await candidateSource(db,caseId);if(!candidate)throw new OfferError('This case does not yet have a complete submitted product candidate.',404);
 let canReview=true,readGuards:D1PreparedStatement[]=[];
 try{readGuards=await offerAuthority(db,actorId,candidate.productId,true);}catch(error){if(!(error instanceof OfferError)||error.status!==403)throw error;canReview=false;}
 if(candidate.ownerId===actorId)throw new PublicationPermissionError('An independent permitted member of staff must decide this product.');
 let canPublish=true;try{const publisher=await staffMutationGuard(db,actorId,'product.publish',PublicationPermissionError);if(!canReview)readGuards=publisher.statements;}catch(error){if(!(error instanceof PublicationPermissionError))throw error;canPublish=false;}
 if(!canReview&&!canPublish)throw new PublicationPermissionError('Current product review or publishing permission is required.');
 const head=(await publicationHead(db,candidate.productId))!,original=JSON.parse(candidate.snapshotJson) as IntakeSnapshot;
 const current=head.currentPublicationId?await db.prepare('SELECT public_json AS snapshot FROM product_publication_decisions WHERE id=?').bind(head.currentPublicationId).first<{snapshot:string}>():null;
 const approval=await db.prepare("SELECT id,public_json AS snapshot FROM product_publication_decisions WHERE version_id=? AND action IN ('approve_only','approve_and_publish') ORDER BY created_at DESC,id DESC LIMIT 1").bind(candidate.versionId).first<{id:string;snapshot:string}>();
 const currentValue=current?JSON.parse(current.snapshot) as ProductPublication:null;
 const currentUploads=(await db.prepare('SELECT id,mime_type AS mimeType,original_name AS originalName FROM product_media WHERE product_id=?').bind(candidate.productId).all<{id:string;mimeType:string;originalName:string}>()).results.filter(file=>currentValue?.mediaIds.includes(file.id));
 let snapshot=original;
 if(!canReview){
  if(!approval)throw new PublicationPermissionError('This candidate needs an exact recorded approval before a publishing-only account can inspect it.');
  snapshot=publicPublicationSnapshot(JSON.parse(approval.snapshot) as ProductPublication);
 }
 const category=await getCategoryDetailGroups(db,snapshot.categoryId),offer=await offerHead(db,candidate.productId);
 const uploads=(await db.prepare('SELECT id,mime_type AS mimeType,original_name AS originalName FROM product_intake_media WHERE draft_id=? AND state=\'ready\'').bind(candidate.draftId).all<{id:string;mimeType:string;originalName:string}>()).results.filter(file=>snapshot.mediaIds.includes(file.id));
 const priceReferences=(await db.prepare('SELECT r.id,r.offer_id AS offerId,r.decision,r.selling_paisa AS sellingPaisa,r.compare_paisa AS comparePaisa FROM product_price_reference_reviews r WHERE r.product_id=? AND r.version_id=? AND NOT EXISTS(SELECT 1 FROM product_price_reference_reviews newer WHERE newer.product_id=r.product_id AND newer.version_id=r.version_id AND newer.offer_id=r.offer_id AND newer.review_revision>r.review_revision)').bind(candidate.productId,candidate.offerVersionId).all<{id:string;offerId:string;decision:string;sellingPaisa:number;comparePaisa:number}>()).results;

 if(canReview)await offerAuthority(db,actorId,candidate.productId,true);else await staffMutationGuard(db,actorId,'product.publish',PublicationPermissionError);
 const availability=await productAvailabilityState(db,candidate.productId);let canManageAvailability=false;try{await staffMutationGuard(db,actorId,'product.review',PublicationPermissionError,'super_admin');canManageAvailability=true;}catch(error){if(!(error instanceof PublicationPermissionError))throw error;}
 const operationalStock=canReview?await getProductStockAllocations(db,candidate.productId):[];
 const legacyStock=canReview&&!offer!.inventoryMapped?await db.prepare('SELECT sku,inventory_quantity AS available FROM products WHERE id=?').bind(candidate.productId).first<{sku:string;available:number}>():null;
 const priceHistory=canReview?await orderablePriceObservations(db,candidate.productId,candidate.sellerId):[];
 const result={priceHistory,legacyStock,inventoryMapped:Boolean(offer!.inventoryMapped),operationalStock,availability,canManageAvailability,actorId,productId:candidate.productId,sellerId:candidate.sellerId,draftId:candidate.draftId,uploads,currentUploads,priceReferences,categoryChanged:category.versionId!==candidate.categoryVersionId,revision:head.revision,caseRevision:candidate.caseRevision,caseState:candidate.caseState,pendingVersionId:head.pendingVersionId,currentVersionId:head.currentVersionId,canReview,canPublish,offerRevision:offer!.revision,candidate:{versionId:candidate.versionId,workspaceVersionId:candidate.workspaceVersionId,offerVersionId:candidate.offerVersionId,snapshot},current:currentValue,approvedDecisionId:head.approvedDecisionId===approval?.id?approval.id:null,approvedRecordId:approval?.id??null,category};
 const originalSource='EXISTS(SELECT 1 FROM product_intake_cases c JOIN product_intake_drafts d ON d.id=c.draft_id JOIN seller_profiles s ON s.id=d.seller_id JOIN product_publication_candidates pc ON pc.case_id=c.id WHERE c.id=? AND c.revision=? AND c.version_id=? AND pc.id=? AND pc.product_id=? AND d.id=? AND d.owner_id=? AND d.owner_id<>? AND s.user_id<>?)',sourceValues=[candidate.caseId,candidate.caseRevision,candidate.workspaceVersionId,candidate.versionId,candidate.productId,candidate.draftId,candidate.ownerId,actorId,actorId];
 try{await db.batch([...readGuards,...offerGuard(db,originalSource,sourceValues),...publicationHeadGuard(db,candidate.productId,head),...headGuard(db,candidate.productId,offer!)]);}
 catch(error){
  if(!productReadGuardConflict(error))throw new OfferError('Current Product review could not be confirmed. Keep your entries and retry.',503);
  const current=await candidateSource(db,caseId);if(!current||current.ownerId===actorId)throw new PublicationPermissionError('The original Product source or current access changed.');
  const owner=await db.prepare('SELECT s.user_id AS id FROM products p JOIN seller_profiles s ON s.id=p.seller_id WHERE p.id=?').bind(candidate.productId).first<{id:string}>();if(!owner||owner.id===actorId)throw new PublicationPermissionError('An independent permitted reviewer must open this Product source.');
  if(canReview)await offerAuthority(db,actorId,candidate.productId,true);else await staffMutationGuard(db,actorId,'product.publish',PublicationPermissionError);
  throw new OfferError('The Product candidate or current source changed. Keep your entries and compare the recorded version.',409);
 }
 return result;
}
export interface PublicationChecks {sameItem:boolean;accurateCover:boolean;eligibilityEvidence:{requirement:string;reference:string}[]}
export interface PublicationDecisionInput {caseId:string;versionId:string;expectedCaseRevision:string;action:'approve_only'|'approve_and_publish'|'publish_approved'|'request_changes'|'reject';reason:string;checks:PublicationChecks|null}
function reviewedChecks(value:PublicationChecks|null,requirements:readonly string[]){
 if(!value||value.sameItem!==true||value.accurateCover!==true||Object.keys(value).some(key=>!['sameItem','accurateCover','eligibilityEvidence'].includes(key))||!Array.isArray(value.eligibilityEvidence)||value.eligibilityEvidence.length!==requirements.length)throw new OfferError('Confirm the same identifiable item, its accurate cover and each applicable category evidence requirement.',400);
 const seen=new Set<string>();for(const row of value.eligibilityEvidence){if(!row||Object.keys(row).some(key=>!['requirement','reference'].includes(key))||!requirements.includes(row.requirement)||seen.has(row.requirement)||typeof row.reference!=='string'||row.reference.trim().length<4||row.reference.length>2000)throw new OfferError('Record the actual reviewed source for each applicable evidence requirement.',400);seen.add(row.requirement);}
 return structuredClone(value);
}
function dateValue(raw:string){if(!raw)return null;const value=Date.parse(raw+'T00:00:00.000Z');if(!/^\d{4}-\d{2}-\d{2}$/.test(raw)||!Number.isFinite(value)||new Date(value).toISOString().slice(0,10)!==raw)throw new OfferError('Correct the actual supplied product date before publication.');return value;}
/** Stock, platform identity, URL, ownership and prior order values are deliberately absent. */
function publicProductUpdate(db:D1Database,productId:string,publicValue:ProductPublication,snapshot:IntakeSnapshot,ctx:CommandContext){
 const d=publicValue.details,text=(key:keyof typeof d)=>detailText(d,key),preparation=text('preparationDays');
 if(preparation&&(!/^\d+$/.test(preparation)||!Number.isSafeInteger(Number(preparation))))throw new OfferError('State a whole actual preparation period or leave an unknown ordering fact unresolved.');
 const materialValues=Array.isArray(d.materials)?d.materials:text('materials')?[text('materials')]:[];
 const warranty=text('warrantyOffered')==='yes'?[text('warrantyProvider'),text('warrantyDuration'),text('warrantyTerms')].join('\n'):null;
 const originReference=snapshot.privateReview.originEvidenceReference?.trim()||null;
 const columns:Record<string,string|number|null>={category_id:publicValue.categoryId,name_en:text('nameEn'),name_ne:text('nameNe')||null,description_en:text('descriptionEn'),description_ne:text('descriptionNe')||null,price_paisa:publicValue.pricePaisa,compare_at_price_paisa:publicValue.compareAtPricePaisa,producer:text('producer'),country_of_origin:text('countryOfOrigin'),origin_evidence_reference:originReference,materials:text('materials'),materials_json:JSON.stringify(materialValues),origin_story:text('originStory')||null,dimensions:text('dimensions')||null,size:text('size')||null,colour:text('colour')||null,variations:text('variations')||null,specifications:text('specifications')||null,care_instructions:text('careInstructions')||null,safety_information:text('safetyInformation')||null,return_conditions:text('returnConditions')||null,return_eligible:text('returnEligible')==='no'?0:1,warranty,made_to_order:text('madeToOrder')==='yes'?1:0,preparation_days:preparation?Number(preparation):0,manufactured_at:dateValue(text('manufacturedAt')),expires_at:dateValue(text('expiresAt')),licence_reference:snapshot.privateReview.licenceReference?.trim()||null,status:'published',reviewed_by:ctx.actorId,review_note:null,review_request_id:ctx.requestId,updated_at:ctx.now};
 return db.prepare(`UPDATE products SET origin_evidence_status=CASE WHEN country_of_origin=? AND producer=? AND origin_evidence_reference IS ? THEN origin_evidence_status WHEN ?<>'' THEN 'seller_declared' ELSE 'unverified' END,${Object.keys(columns).map(key=>key+'=?').join(',')},published_at=COALESCE(published_at,?) WHERE id=?`).bind(text('countryOfOrigin'),text('producer'),originReference,text('countryOfOrigin'),...Object.values(columns),ctx.now,productId);
}
export async function reviewProductPublication(db:D1Database,ctx:CommandContext,input:PublicationDecisionInput){
 if(!input||Object.keys(input).some(key=>!['caseId','versionId','expectedCaseRevision','action','reason','checks'].includes(key))||!['approve_only','approve_and_publish','publish_approved','request_changes','reject'].includes(input.action))throw new OfferError('Choose the exact submitted candidate and a supported review decision.',400);
 const candidate=await candidateSource(db,input.caseId,input.versionId);if(!candidate)throw new OfferError('The exact submitted product candidate is unavailable.',404);
 const publishing=['approve_and_publish','publish_approved'].includes(input.action),approving=['approve_only','approve_and_publish','publish_approved'].includes(input.action);
 const authority=input.action==='publish_approved'?(await staffMutationGuard(db,ctx.actorId,'product.publish',PublicationPermissionError)).statements:await offerAuthority(db,ctx.actorId,candidate.productId,true);
 const independent="NOT EXISTS(SELECT 1 FROM products p JOIN seller_profiles s ON s.id=p.seller_id WHERE p.id=? AND s.user_id=?)";
 if(!await db.prepare(`SELECT 1 WHERE ${independent}`).bind(candidate.productId,ctx.actorId).first())throw new OfferError('An independent permitted reviewer must decide this product.',403);
 const publisher=input.action==='approve_and_publish'?(await staffMutationGuard(db,ctx.actorId,'product.publish',PublicationPermissionError)).statements:[];
 const reason=offerReason(input.reason),source={action:'product.publication.'+input.action,subjectType:'product',subjectId:candidate.productId},receipt=await commandReceipt(db,ctx,source,input);
 if(receipt.replayed)return receipt.result as {productId:string;versionId:string;revision:number;caseRevision:number;outcome:string};
 const head=await publicationHead(db,candidate.productId),offer=await offerHead(db,candidate.productId);
 if(!head||!offer||ctx.expectedRevision!==String(head.revision)||head.pendingVersionId!==candidate.versionId||candidate.caseVersionId!==candidate.workspaceVersionId||input.expectedCaseRevision!==String(candidate.caseRevision)||!['submitted','in_review','ready_for_decision'].includes(candidate.caseState)||head.currentVersionId!==candidate.baseVersionId||offer.candidateVersionId!==candidate.offerVersionId)throw new OfferError('The candidate, public base or review state changed. Compare the current exact version before deciding.');
 const snapshot=JSON.parse(candidate.snapshotJson) as IntakeSnapshot,category=await getCategoryDetailGroups(db,snapshot.categoryId);
 const media=(await db.prepare('SELECT id,mime_type AS mimeType,state FROM product_intake_media WHERE draft_id=? AND owner_id=?').bind(candidate.draftId,candidate.ownerId).all<{id:string;mimeType:string;state:string}>()).results;
 const statements=[...authority,...publisher,...offerGuard(db,independent,[candidate.productId,ctx.actorId]),...publicationHeadGuard(db,candidate.productId,head),...headGuard(db,candidate.productId,offer),...offerGuard(db,'EXISTS(SELECT 1 FROM product_intake_cases WHERE id=? AND revision=? AND version_id=? AND state=?)',[candidate.caseId,candidate.caseRevision,candidate.workspaceVersionId,candidate.caseState])];
 let checks:PublicationChecks|null=null,publicValue:ProductPublication|null=null;
 const referenceIds:string[]=[];
 if(approving){
  if(category.versionId!==candidate.categoryVersionId)throw new OfferError('The applicable category policy changed. Preserve this draft and explicitly submit it against the current policy.');
  let prior:{review:string;publicValue:string}|null=null;
  if(input.action==='publish_approved'){
   if(!head.approvedDecisionId)throw new OfferError('This exact candidate needs a recorded approval before publishing.');
   prior=await db.prepare("SELECT review_json AS review,public_json AS publicValue FROM product_publication_decisions WHERE id=? AND version_id=? AND action='approve_only'").bind(head.approvedDecisionId,candidate.versionId).first();
   if(!prior)throw new OfferError('The saved approval does not belong to this exact candidate.');
  }
  checks=reviewedChecks(prior?JSON.parse(prior.review).checks:input.checks,category.contract?.eligibilityRequirements??[]);
  publicValue=compileProductPublication({snapshot,category,media,confirmedEligibility:checks.eligibilityEvidence.map(row=>row.requirement)});
  statements.push(...await mediaGuard(db,candidate.draftId,candidate.ownerId,snapshot.mediaIds),...offerGuard(db,'EXISTS(SELECT 1 FROM categories c JOIN category_template_states s ON s.category_id=c.id WHERE c.id=? AND c.is_active=1 AND s.version_id=?)',[category.categoryId,category.versionId]));
  for(const id of publicValue.occasionIds)statements.push(...offerGuard(db,'EXISTS(SELECT 1 FROM occasions WHERE id=? AND is_active=1)',[id]));
  for(const row of publicValue.offers.filter(row=>row.compareAt!=='')){
   const proof=await approvedPriceReference(db,candidate.productId,candidate.offerVersionId,row.id);
   if(!proof||proof.sellingPaisa!==row.pricePaisa||proof.comparePaisa!==row.compareAtPricePaisa||proof.physicalIdentity!==physicalOfferIdentity({...row,stockIntent:''}))throw new OfferError('Review genuine reference-price evidence for this exact included offer before approval.');
   referenceIds.push(proof.id);statements.push(...offerGuard(db,"EXISTS(SELECT 1 FROM product_price_reference_reviews r WHERE r.id=? AND r.decision='approved' AND NOT EXISTS(SELECT 1 FROM product_price_reference_reviews n WHERE n.product_id=r.product_id AND n.offer_id=r.offer_id AND n.version_id=r.version_id AND n.review_revision>r.review_revision))",[proof.id]));
  }
  if(prior&&(prior.publicValue!==JSON.stringify(publicValue)||JSON.stringify(JSON.parse(prior.review).referenceIds)!==JSON.stringify(referenceIds)))throw new OfferError('A reviewed dependency changed after approval. Review the exact current evidence before publication.');
 }
 const availability=await productAvailabilityState(db,candidate.productId),held=availability.ownerPaused||availability.ownerWithdrawn||availability.staffWithdrawn;
 if(publishing)statements.push(...availabilityStateGuard(db,candidate.productId,availability));
 const decisionId=crypto.randomUUID(),revision=head.revision+1,caseRevision=candidate.caseRevision+1,outcome=publishing?(held?'published_held':'published'):input.action==='approve_only'?'approved':input.action==='reject'?'rejected':'changes_requested',caseState=publishing||input.action==='reject'?'resolved':input.action==='approve_only'?'ready_for_decision':'waiting_seller';
 statements.push(db.prepare('INSERT INTO product_publication_decisions(id,version_id,action,review_json,public_json,ordering_facts_ready,actor_id,reason,created_at) VALUES(?,?,?,?,?,?,?,?,?)').bind(decisionId,candidate.versionId,input.action,JSON.stringify({checks,referenceIds,categoryVersionId:category.versionId}),publicValue?JSON.stringify(publicValue):null,publicValue?.orderingFactsReady?1:0,ctx.actorId,reason,ctx.now));
 if(publishing&&publicValue){
  const product=await db.prepare('SELECT status FROM products WHERE id=?').bind(candidate.productId).first<{status:string}>();
  if(!product||!['draft','submitted','under_review','needs_changes','rejected','approved','published','archived'].includes(product.status)||head.currentVersionId!==null&&product.status!=='published')throw new OfferError('This listing was withdrawn or stopped. Keep its approval separate and explicitly resolve the withdrawal before restoration.');
  if(head.currentVersionId===null){
   if(product.status==='archived'&&!availability.ownerWithdrawn)throw new OfferError('Carry the recorded owner stop into current availability before publishing a corrected version. Restoration remains separate.');
   if(product.status==='under_review'){
    const withdrawalSql="EXISTS(SELECT 1 FROM moderation_events WHERE subject_type='product' AND subject_id=? AND from_status='published' AND to_status='under_review')";
    const withdrawn=await db.prepare(`SELECT 1 WHERE ${withdrawalSql}`).bind(candidate.productId).first();
    if(withdrawn&&!availability.staffWithdrawn)throw new OfferError('Carry the recorded staff withdrawal into current availability before publishing the correction. Restoration remains separate.');
    statements.push(...offerGuard(db,`NOT (${withdrawalSql}) OR ?=1`,[candidate.productId,availability.staffWithdrawn?1:0]));
   }
  }
  statements.push(...offerGuard(db,'EXISTS(SELECT 1 FROM products WHERE id=? AND status=?)',[candidate.productId,product.status]));
  if(!offer.inventoryMapped)throw new OfferError('Explicitly reconcile the existing physical stock and orders before publishing real offers.');
  statements.push(...await offerIdentityStatements(db,candidate.productId,snapshot.offers,ctx.now,true));
  const current=(await db.prepare('SELECT offer_id AS id FROM product_offer_current WHERE product_id=?').bind(candidate.productId).all<{id:string}>()).results;
  for(const old of current)if(!publicValue.offers.some(row=>row.id===old.id))statements.push(db.prepare('UPDATE offer_stock SET needs_reconfirmation=1,revision=revision+1,updated_at=? WHERE offer_id=?').bind(ctx.now,old.id));
  statements.push(db.prepare('DELETE FROM product_offer_current WHERE product_id=?').bind(candidate.productId));
  for(const row of snapshot.offers.offers.filter(row=>row.included))statements.push(db.prepare('INSERT INTO product_offer_current(offer_id,product_id,version_id,offer_json) VALUES(?,?,?,?)').bind(row.id,candidate.productId,candidate.offerVersionId,JSON.stringify(row)));
  statements.push(db.prepare('UPDATE product_offer_heads SET current_version_id=?,revision=revision+1,updated_at=? WHERE product_id=?').bind(candidate.offerVersionId,ctx.now,candidate.productId),publicProductUpdate(db,candidate.productId,publicValue,snapshot,ctx));
  // Visibility checks run after the candidate row update inside the same atomic
  // batch; a blocked seller rolls back the entire approval/publication outcome.
  statements.push(...offerGuard(db,`EXISTS(SELECT 1 FROM products p WHERE p.id=? AND ${publicationSellerEligibility('p',ctx.now)})`,[candidate.productId]));
  for(const [index,id] of publicValue.mediaIds.entries())statements.push(db.prepare('INSERT OR IGNORE INTO product_media(id,product_id,object_key,original_name,mime_type,size_bytes,alt_en,sort_order,created_at) SELECT id,?,object_key,original_name,mime_type,size_bytes,?,?,? FROM product_intake_media WHERE id=? AND draft_id=? AND owner_id=? AND state=\'ready\'').bind(candidate.productId,detailText(publicValue.details,'nameEn'),index,ctx.now,id,candidate.draftId,candidate.ownerId),db.prepare('INSERT INTO product_publication_media(version_id,media_id,sort_order) VALUES(?,?,?)').bind(candidate.versionId,id,index));
  statements.push(db.prepare('DELETE FROM product_occasions WHERE product_id=?').bind(candidate.productId));for(const id of publicValue.occasionIds)statements.push(db.prepare('INSERT INTO product_occasions(product_id,occasion_id,created_at) VALUES(?,?,?)').bind(candidate.productId,id,ctx.now));
  statements.push(...await prepareDiscountPublicationStatements(db,candidate.productId,candidate.offerVersionId,ctx.now));
 }
 const approvedId=input.action==='approve_only'||input.action==='approve_and_publish'?decisionId:input.action==='publish_approved'?head.approvedDecisionId:null;
 statements.push(db.prepare('UPDATE product_publication_heads SET revision=?,pending_version_id=?,current_version_id=?,approved_decision_id=?,current_publication_id=?,last_event_id=?,updated_at=? WHERE product_id=?').bind(revision,publishing||input.action==='reject'?null:candidate.versionId,publishing?candidate.versionId:head.currentVersionId,approvedId,publishing?decisionId:head.currentPublicationId,decisionId,ctx.now,candidate.productId));
 statements.push(db.prepare('UPDATE product_intake_proposals SET state=\'superseded\' WHERE case_id=? AND state=\'pending\'').bind(candidate.caseId),db.prepare('UPDATE product_intake_cases SET revision=?,state=?,triaged_at=COALESCE(triaged_at,?),first_reviewed_at=COALESCE(first_reviewed_at,?),active_proposal_id=NULL,last_event_id=? WHERE id=?').bind(caseRevision,caseState,ctx.now,ctx.now,decisionId,candidate.caseId));
 const message=publishing?(held?'The exact reviewed version is recorded. Existing listing withdrawals or order pauses remain in effect until their separate authorized restoration.':'The exact reviewed product version is published. Current stock, pauses and purchase checks still apply.'):input.action==='approve_only'?'The exact version is approved and awaits publication.':reason;
 statements.push(db.prepare('INSERT INTO product_intake_events(id,case_id,version_id,event_key,kind,actor_id,detail_json,created_at) VALUES(?,?,?,?,?,?,?,?)').bind(decisionId,candidate.caseId,candidate.workspaceVersionId,decisionId,'publication.'+outcome,ctx.actorId,JSON.stringify({sellerMessage:message}),ctx.now));
 statements.push(...await operationalBusinessNotificationStatements(db,{kind:'product.intake',sourceId:candidate.caseId,eventId:decisionId,status:outcome,actorId:ctx.actorId,now:ctx.now,detail:message}));
 const result={productId:candidate.productId,versionId:candidate.versionId,revision,caseRevision,outcome};statements.push(receipt.insert(result));
 try{await db.batch(statements);}catch(error){const replay=await commandReceipt(db,ctx,source,input);if(replay.replayed)return replay.result as typeof result;throw new OfferError(/constraint|conflict|guard|publication_|offer_/i.test(String(error))?'Publication was not committed because the current source, eligibility or authority changed. Compare the recorded outcome.':'The publication response is uncertain. Retry this exact request.',/constraint|conflict|guard|publication_|offer_/i.test(String(error))?409:503);}return result;
}
