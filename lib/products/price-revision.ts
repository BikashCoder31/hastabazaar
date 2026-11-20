import {commandReceipt,type CommandContext} from '../workflows/contracts';
import {digestFormRequest} from '../forms/submission';
import {getProductWorkspace,submitRetainedPriceIntake,type IntakeSnapshot} from './intake-workspace';
import {publicationHead,publicationHeadGuard} from './publication-candidates';
import {offerGuard,OfferError} from './offer-support';
import {offerMoney} from './offer-contracts';
import {getProductIntakeDraft} from './category-contracts';

export interface ProductPriceRevisionInput {draftId:string;baseVersionId:string;expectedDraftRevision:string;expectedCaseId:string;expectedCaseRevision:string;replaceVersionId:string;offerId:string;price:string;compareAt?:string;note:string}
/** Freeze the selected price against accepted facts. The independent private
 * editing head is never moved, even when it contains unfinished unrelated work.
 * Retention and explicit sending have separate recoverable receipts: an uncertain
 * send cannot lose the retained price proposal or create a second candidate. */
export async function submitProductPriceRevision(db:D1Database,ctx:CommandContext,input:ProductPriceRevisionInput){
 if(!input||Object.keys(input).some(key=>!['draftId','baseVersionId','expectedDraftRevision','expectedCaseId','expectedCaseRevision','replaceVersionId','offerId','price','compareAt','note'].includes(key))||typeof input.price!=='string'||offerMoney(input.price.trim())===null||input.compareAt!==undefined&&typeof input.compareAt!=='string'||typeof input.note!=='string'||input.note.length>4000)throw new OfferError('Propose a valid selling price for the selected current offer; comparison changes and a note are optional.',400);
 const work=await getProductWorkspace(db,ctx.actorId,input.draftId),preparedCtx={...ctx,requestId:await digestFormRequest(['product-price-retained',ctx.requestId])},source={action:'product.price.retained',subjectType:'product_intake',subjectId:input.draftId},receipt=await commandReceipt(db,preparedCtx,source,input);
 let retained:{versionId:string;draftRevision:number};
 if(receipt.replayed)retained=receipt.result as typeof retained;
 else{
  const publication=work.publication,head=publication?await publicationHead(db,publication.productId):null;
  if(!publication||!head||!head.currentVersionId||head.currentVersionId!==input.baseVersionId||String(head.revision)!==ctx.expectedRevision||String(work.revision)!==input.expectedDraftRevision)throw new OfferError('Compare the current public version and private draft before submitting this price request.');
  if(!work.case||input.expectedCaseId!==work.case.caseId||input.expectedCaseRevision!==String(work.case.revision)||input.replaceVersionId!==work.case.versionId)throw new OfferError('The current review case changed. Compare it before choosing which price proposal to submit.');
  const base=await db.prepare('SELECT v.snapshot_json AS snapshot FROM product_publication_candidates c JOIN product_intake_workspace_versions v ON v.id=c.workspace_version_id WHERE c.id=? AND c.product_id=?').bind(input.baseVersionId,publication.productId).first<{snapshot:string}>();
  if(!base)throw new OfferError('An exact accepted public baseline is required. Reconcile this legacy listing before requesting a price-only change.');
  const snapshot=JSON.parse(base.snapshot) as IntakeSnapshot,row=snapshot.offers.offers.find(offer=>offer.id===input.offerId&&offer.included);
  if(!row)throw new OfferError('Choose an included offer from the current public version.',400);
  const price=input.price.trim(),comparison=input.compareAt===undefined?row.compareAt:input.compareAt.trim();
  if(comparison!==''&&(offerMoney(comparison)===null||offerMoney(comparison)!<=offerMoney(price)!))throw new OfferError('The proposed original price must remain higher than the selling price; explicitly remove an inapplicable comparison.',400);
  if(row.price===price&&row.compareAt===comparison)throw new OfferError('Enter an actual selling or comparison price change.',400);
  row.price=price;row.compareAt=comparison;
  snapshot.priceRequest={requestId:ctx.requestId,expectedRevision:ctx.expectedRevision,input:structuredClone(input)};
  const versionId=crypto.randomUUID();retained={versionId,draftRevision:work.revision};
  const owner="EXISTS(SELECT 1 FROM product_intake_drafts d JOIN seller_profiles s ON s.id=d.seller_id JOIN users u ON u.id=d.owner_id WHERE d.id=? AND d.revision=? AND d.owner_id=? AND s.user_id=u.id AND u.status='active' AND EXISTS(SELECT 1 FROM user_roles WHERE user_id=u.id AND role IN ('customer','seller')))";
  try{await db.batch([...offerGuard(db,owner,[input.draftId,work.revision,ctx.actorId]),...publicationHeadGuard(db,publication.productId,head),db.prepare("INSERT INTO product_intake_workspace_versions(id,draft_id,revision,kind,base_public_version_id,snapshot_json,created_by,created_at) VALUES(?,?,?,'review_only',?,?,?,?)").bind(versionId,input.draftId,work.revision,input.baseVersionId,JSON.stringify(snapshot),ctx.actorId,ctx.now),receipt.insert(retained)]);}catch(error){const replay=await commandReceipt(db,preparedCtx,source,input);if(replay.replayed)retained=replay.result as typeof retained;else throw new OfferError(/constraint|guard|conflict/i.test(String(error))?'The price request base changed. Your independent private draft remains intact.':'Retaining the price request is uncertain. Retry this exact request.',/constraint|guard|conflict/i.test(String(error))?409:503);}
 }
 return submitRetainedPriceIntake(db,{...ctx,expectedRevision:input.expectedDraftRevision},{draftId:input.draftId,versionId:retained.versionId,intent:'review',note:input.note,expectedCaseId:input.expectedCaseId,expectedCaseRevision:input.expectedCaseRevision,replaceVersionId:input.replaceVersionId});
}

/** Owner recovery after retention succeeded but sending was not confirmed. A
 * superseded, previously received version is history, not an unsent request. */
export async function getRetainedProductPriceRequests(db:D1Database,actorId:string,draftId:string){
 await getProductIntakeDraft(db,actorId,draftId);
 const rows=(await db.prepare("SELECT v.id,v.created_at AS createdAt,v.snapshot_json AS snapshot FROM product_intake_workspace_versions v WHERE v.draft_id=? AND v.created_by=? AND v.kind='review_only' AND NOT EXISTS(SELECT 1 FROM product_intake_events e WHERE e.version_id=v.id AND e.kind='received') ORDER BY v.created_at DESC,v.id DESC LIMIT 20").bind(draftId,actorId).all<{id:string;createdAt:number;snapshot:string}>()).results;
 await getProductIntakeDraft(db,actorId,draftId);
 return rows.flatMap(row=>{const source=JSON.parse(row.snapshot) as IntakeSnapshot;return source.priceRequest?[{versionId:row.id,createdAt:row.createdAt,...source.priceRequest}]:[];});
}
