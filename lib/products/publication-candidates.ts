import {commandReceipt,type CommandContext} from '../workflows/contracts';
import {getCategoryDetailGroups,getProductIntakeDraft} from './category-contracts';
import {detailText} from './category-fields';
import {compileProductPublication} from './publication-contract';
import {offerGuard,OfferError} from './offer-support';
import {headGuard,offerHead,offerIdentityStatements} from './offers';
import {createProductSku} from './submission';
import type {IntakeSnapshot} from './intake-workspace';

export interface PublicationHead {revision:number;pendingVersionId:string|null;currentVersionId:string|null;approvedDecisionId:string|null;currentPublicationId:string|null}
export async function publicationHead(db:D1Database,productId:string){return db.prepare('SELECT revision,pending_version_id AS pendingVersionId,current_version_id AS currentVersionId,approved_decision_id AS approvedDecisionId,current_publication_id AS currentPublicationId FROM product_publication_heads WHERE product_id=?').bind(productId).first<PublicationHead>();}
export function publicationHeadGuard(db:D1Database,productId:string,head:PublicationHead|null){return offerGuard(db,head?'EXISTS(SELECT 1 FROM product_publication_heads WHERE product_id=? AND revision=?)':'NOT EXISTS(SELECT 1 FROM product_publication_heads WHERE product_id=?)',head?[productId,head.revision]:[productId]);}

/** Append to the owner's explicit intake submission batch, after its case update.
 * Only a coherent actual item gets a private product identity. No approval,
 * publication, stock confirmation or activation is inferred by this operation. */
export async function prepareProductPublicationCandidate(db:D1Database,ctx:CommandContext,input:{draftId:string;caseId:string;workspaceVersionId:string}){
 const source=await db.prepare('SELECT d.seller_id AS sellerId,d.owner_id AS ownerId,v.snapshot_json AS snapshot,v.kind,v.base_public_version_id AS basePublicVersionId FROM product_intake_drafts d JOIN product_intake_workspace_versions v ON v.draft_id=d.id WHERE d.id=? AND v.id=?').bind(input.draftId,input.workspaceVersionId).first<{sellerId:string;ownerId:string;snapshot:string;kind:'private'|'review_only';basePublicVersionId:string|null}>();
 if(!source||source.ownerId!==ctx.actorId)throw new OfferError('The current draft owner must explicitly submit this exact version.',403);
 const snapshot=JSON.parse(source.snapshot) as IntakeSnapshot,category=await getCategoryDetailGroups(db,snapshot.categoryId);
 const media=(await db.prepare("SELECT id,mime_type AS mimeType,state FROM product_intake_media WHERE draft_id=? AND owner_id=? AND state='ready'").bind(input.draftId,ctx.actorId).all<{id:string;mimeType:string;state:string}>()).results;
 // These references establish completeness for review only. Actual evidence is
 // independently reviewed and guarded by the publication decision.
 const facts=compileProductPublication({snapshot,category,media,confirmedEligibility:category.contract?.eligibilityRequirements??[]});
 const link=await db.prepare('SELECT product_id AS productId,base_version_id AS baseVersionId,revision FROM product_publication_links WHERE draft_id=?').bind(input.draftId).first<{productId:string;baseVersionId:string|null;revision:number}>();
 const productId=link?.productId??crypto.randomUUID(),head=await publicationHead(db,productId),offers=await offerHead(db,productId);
 const baseVersionId=source.kind==='review_only'?source.basePublicVersionId:link?.baseVersionId??null;
 if(source.kind==='review_only'&&!link)throw new OfferError('A price-only revision requires an actual accepted public base.');
 if(baseVersionId!==(head?.currentVersionId??null))throw new OfferError('The public version changed. Compare it with your preserved private draft and explicitly rebase before submitting.');
 const versionId=crypto.randomUUID(),offerVersionId=crypto.randomUUID(),sku=link?undefined:createProductSku(),revision=head?head.revision+1:0;
 const ownerSql="EXISTS(SELECT 1 FROM product_intake_drafts d JOIN seller_profiles s ON s.id=d.seller_id JOIN users u ON u.id=d.owner_id WHERE d.id=? AND d.owner_id=? AND s.user_id=u.id AND u.status='active' AND EXISTS(SELECT 1 FROM user_roles WHERE user_id=u.id AND role IN ('customer','seller')))";
 const statements:D1PreparedStatement[]=[...offerGuard(db,ownerSql,[input.draftId,ctx.actorId]),...publicationHeadGuard(db,productId,head)];
 if(!link)statements.push(db.prepare("INSERT INTO products(id,seller_id,category_id,slug,sku,name_en,description_en,price_paisa,inventory_quantity,producer,country_of_origin,materials,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,0,?,?,?,'submitted',?,?)").bind(productId,source.sellerId,facts.categoryId,'product-'+productId,sku!,detailText(facts.details,'nameEn'),detailText(facts.details,'descriptionEn'),facts.pricePaisa,detailText(facts.details,'producer'),detailText(facts.details,'countryOfOrigin'),detailText(facts.details,'materials'),ctx.now,ctx.now),db.prepare('INSERT INTO product_publication_links(draft_id,product_id,base_version_id,revision) VALUES(?,?,NULL,0)').bind(input.draftId,productId));
 else statements.push(...offerGuard(db,'EXISTS(SELECT 1 FROM product_publication_links l JOIN products p ON p.id=l.product_id WHERE l.draft_id=? AND l.product_id=? AND l.revision=? AND p.seller_id=?)',[input.draftId,productId,link.revision,source.sellerId]));
 statements.push(...headGuard(db,productId,offers),db.prepare('INSERT INTO product_offer_versions(id,product_id,matrix_json,created_by,created_at) VALUES(?,?,?,?,?)').bind(offerVersionId,productId,JSON.stringify(snapshot.offers),ctx.actorId,ctx.now),...await offerIdentityStatements(db,productId,snapshot.offers,ctx.now,true,sku));
 statements.push(offers?db.prepare('UPDATE product_offer_heads SET candidate_version_id=?,revision=revision+1,updated_at=? WHERE product_id=?').bind(offerVersionId,ctx.now,productId):db.prepare('INSERT INTO product_offer_heads(product_id,revision,candidate_version_id,current_version_id,inventory_mapped,updated_at) VALUES(?,0,?,NULL,?,?)').bind(productId,offerVersionId,link?0:1,ctx.now));
 statements.push(db.prepare('INSERT INTO product_publication_candidates(id,product_id,case_id,workspace_version_id,offer_version_id,category_version_id,base_version_id,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?)').bind(versionId,productId,input.caseId,input.workspaceVersionId,offerVersionId,category.versionId,baseVersionId,ctx.actorId,ctx.now));
 statements.push(head?db.prepare('UPDATE product_publication_heads SET pending_version_id=?,approved_decision_id=NULL,revision=?,last_event_id=?,updated_at=? WHERE product_id=?').bind(versionId,revision,versionId,ctx.now,productId):db.prepare('INSERT INTO product_publication_heads(product_id,revision,pending_version_id,last_event_id,updated_at) VALUES(?,0,?,?,?)').bind(productId,versionId,versionId,ctx.now));
 return {statements,result:{productId,versionId,revision}};
}

/** An explicit replacement with incomplete information revokes the old pending
 * decision while retaining the actual public version and all history. */
export async function prepareIncompleteProductCandidate(db:D1Database,input:{draftId:string;caseId:string;workspaceVersionId:string;eventId:string;now:number}){
 const link=await db.prepare('SELECT product_id AS productId FROM product_publication_links WHERE draft_id=?').bind(input.draftId).first<{productId:string}>();
 if(!link)return [];
 const head=await publicationHead(db,link.productId);if(!head?.pendingVersionId)return [];
 return [...publicationHeadGuard(db,link.productId,head),...offerGuard(db,'EXISTS(SELECT 1 FROM product_intake_cases WHERE id=? AND draft_id=? AND version_id=?)',[input.caseId,input.draftId,input.workspaceVersionId]),db.prepare('UPDATE product_publication_heads SET pending_version_id=NULL,approved_decision_id=NULL,revision=revision+1,last_event_id=?,updated_at=? WHERE product_id=?').bind(input.eventId,input.now,link.productId)];
}

export async function rebaseProductWorkspace(db:D1Database,ctx:CommandContext,input:{draftId:string;publicVersionId:string;expectedDraftRevision:string;retainDraft:boolean}){
 if(!input||Object.keys(input).some(key=>!['draftId','publicVersionId','expectedDraftRevision','retainDraft'].includes(key))||input.retainDraft!==true)throw new OfferError('Compare the current public version and explicitly choose to retain this private draft.',400);
 const draft=await getProductIntakeDraft(db,ctx.actorId,input.draftId),source={action:'product.workspace.rebased',subjectType:'product_intake',subjectId:input.draftId},receipt=await commandReceipt(db,ctx,source,input);
 if(receipt.replayed)return receipt.result as {draftId:string;baseVersionId:string;publicationRevision:number;draftRevision:number};
 const link=await db.prepare('SELECT product_id AS productId,revision FROM product_publication_links WHERE draft_id=?').bind(input.draftId).first<{productId:string;revision:number}>(),head=link?await publicationHead(db,link.productId):null;
 if(!link||!head||!head.currentVersionId||head.currentVersionId!==input.publicVersionId||ctx.expectedRevision!==String(head.revision)||input.expectedDraftRevision!==String(draft.revision))throw new OfferError('The public version or private draft changed. Keep your draft and compare the current versions again.');
 const result={draftId:input.draftId,baseVersionId:input.publicVersionId,publicationRevision:head.revision,draftRevision:draft.revision};
 const owner="EXISTS(SELECT 1 FROM product_intake_drafts d JOIN seller_profiles s ON s.id=d.seller_id JOIN users u ON u.id=d.owner_id WHERE d.id=? AND d.revision=? AND d.owner_id=? AND s.user_id=u.id AND u.status='active' AND EXISTS(SELECT 1 FROM user_roles WHERE user_id=u.id AND role IN ('customer','seller')))";
 try{await db.batch([...offerGuard(db,owner,[input.draftId,draft.revision,ctx.actorId]),...publicationHeadGuard(db,link.productId,head),...offerGuard(db,'EXISTS(SELECT 1 FROM product_publication_links WHERE draft_id=? AND revision=? AND product_id=?)',[input.draftId,link.revision,link.productId]),db.prepare('UPDATE product_publication_links SET base_version_id=?,revision=revision+1 WHERE draft_id=?').bind(input.publicVersionId,input.draftId),receipt.insert(result)]);}catch(error){const replay=await commandReceipt(db,ctx,source,input);if(replay.replayed)return replay.result as typeof result;throw new OfferError(/constraint|guard|conflict/i.test(String(error))?'The comparison changed before it was accepted. Your private draft is intact.':'The comparison response is uncertain. Retry this exact request.',/constraint|guard|conflict/i.test(String(error))?409:503);}
 return result;
}
