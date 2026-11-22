import {commandReceipt,type CommandContext} from '../workflows/contracts';
import {digestFormRequest} from '../forms/submission';
import {OfferError,offerGuard} from './offer-support';
import {pricingSubjectAuthority} from './private-price-inputs';
import {uploadProductIntakeMedia} from './intake-media';
import type {LegacyObservation} from './legacy-observation';
type CopiedFile=Awaited<ReturnType<typeof uploadProductIntakeMedia>>;
/** Explicit owner action. Original references and bytes remain untouched; actual bytes get a new validated immutable upload. */
export async function reuseLegacyProductMedia(db:D1Database,bucket:Pick<R2Bucket,'get'|'head'|'put'>,ctx:CommandContext,input:{draftId:string;mediaId:string}):Promise<CopiedFile>{
 if(!input||Object.keys(input).some(key=>!['draftId','mediaId'].includes(key))||typeof input.draftId!=='string'||typeof input.mediaId!=='string'||ctx.expectedRevision!==null)throw new OfferError('Choose one retained file from your existing product.',400);
 const authority=await pricingSubjectAuthority(db,ctx.actorId,{kind:'intake',id:input.draftId,offerId:'base'}),event={action:'product.legacy.media_reused',subjectType:'product_intake',subjectId:input.draftId},receipt=await commandReceipt(db,ctx,event,input);if(receipt.replayed)return receipt.result as CopiedFile;
 const observed=await db.prepare('SELECT observed_json AS snapshot FROM product_legacy_observations WHERE draft_id=?').bind(input.draftId).first<{snapshot:string}>(),source=observed?JSON.parse(observed.snapshot) as LegacyObservation:null,original=source?.media.find(file=>file.id===input.mediaId);if(!original||!source)throw new OfferError('This file does not belong to the retained product observation.',403);
 const existing=await db.prepare("SELECT n.id,n.draft_id AS draftId,n.mime_type AS mimeType,n.size_bytes AS sizeBytes,n.original_name AS originalName,n.state,n.completed_at AS completedAt FROM product_legacy_media_copies c JOIN product_intake_media n ON n.id=c.intake_media_id WHERE c.draft_id=? AND c.source_media_id=? AND n.owner_id=? AND n.state='ready'").bind(input.draftId,input.mediaId,ctx.actorId).first<CopiedFile>();
 let copied=existing;
 if(!copied){
  const record=await db.prepare('SELECT object_key AS objectKey FROM product_media WHERE id=? AND product_id=?').bind(input.mediaId,source.product.id).first<{objectKey:string}>();if(!record||record.objectKey!==original.object_key)throw new OfferError('The retained file reference changed. Keep the observation and request assistance.');
  let object;try{object=await bucket.get(record.objectKey);}catch{throw new OfferError('The original file could not be read. Keep its reference and retry.',503);}if(!object)throw new OfferError('The original file is unavailable. Its reference remains retained; upload a replacement explicitly.',503);
  if(!Number.isSafeInteger(object.size)||object.size<1||object.size>20*1024*1024)throw new OfferError('The original file exceeds the supported upload size. Its reference remains retained.',400);
  const bytes=await new Response(object.body).arrayBuffer();if(bytes.byteLength!==object.size)throw new OfferError('The original file read was incomplete. Retry without replacing its reference.',503);
  copied=await uploadProductIntakeMedia(db,bucket,{...ctx,requestId:await digestFormRequest(['legacy-file-copy',ctx.requestId,input])},{draftId:input.draftId,file:new File([bytes],String(original.original_name??input.mediaId),{type:String(original.mime_type??'')})});
 }
 const current=await pricingSubjectAuthority(db,ctx.actorId,{kind:'intake',id:input.draftId,offerId:'base'});
 try{await db.batch([...authority.statements,...current.statements,...offerGuard(db,'EXISTS(SELECT 1 FROM product_media WHERE id=? AND product_id=? AND HEX(object_key)=HEX(?))',[input.mediaId,source.product.id,original.object_key]),...(!existing?[db.prepare('INSERT INTO product_legacy_media_copies(draft_id,source_media_id,source_object_key,intake_media_id,created_by,created_at) VALUES(?,?,?,?,?,?)').bind(input.draftId,input.mediaId,original.object_key,copied.id,ctx.actorId,ctx.now)]:[]),receipt.insert(copied)]);}catch(error){const retry=await commandReceipt(db,ctx,event,input);if(retry.replayed)return retry.result as CopiedFile;throw new OfferError(/constraint|guard|legacy_/i.test(String(error))?'The file or current ownership changed. The original and any private upload remain retained.':'The copy outcome is uncertain. Retry this exact request.',/constraint|guard|legacy_/i.test(String(error))?409:503);}return copied;
}
