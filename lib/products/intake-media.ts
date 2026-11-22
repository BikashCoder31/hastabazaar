import {getProductPublicationReview} from './publication';
import type {CommandContext} from '../workflows/contracts';
import {validateProductVideo} from '../media/product-video';
import {CategoryContractError} from './category-contracts';
import {getProductIntakeReview} from './intake-assistance';
import type {IntakeSnapshot} from './intake-workspace';
import {offerGuard} from './offer-support';
import {pricingSubjectAuthority} from './private-price-inputs';
import {validateProductImage,validateProductImageContent} from './submission';

type ObjectStore=Pick<R2Bucket,'head'|'put'|'get'>;
interface MediaRow {id:string;draftId:string;ownerId:string;requestId:string;objectKey:string;mimeType:string;sizeBytes:number;originalName:string;digest:string;state:'uploading'|'ready';completedAt:number|null}
const columns='id,draft_id AS draftId,owner_id AS ownerId,request_id AS requestId,object_key AS objectKey,mime_type AS mimeType,size_bytes AS sizeBytes,original_name AS originalName,content_digest AS digest,state,completed_at AS completedAt';
const publicReference=(row:MediaRow)=>({id:row.id,draftId:row.draftId,mimeType:row.mimeType,sizeBytes:row.sizeBytes,originalName:row.originalName,state:row.state,completedAt:row.completedAt});
const ownerAuthority=(db:D1Database,actorId:string,draftId:string)=>pricingSubjectAuthority(db,actorId,{kind:'intake',id:draftId,offerId:'base'});
/** Reserve an immutable private reference before object I/O; uncertain writes never delete retained bytes. */
export async function uploadProductIntakeMedia(db:D1Database,bucket:ObjectStore,ctx:CommandContext,input:{draftId:string;file:File}){
 const authority=await ownerAuthority(db,ctx.actorId,input.draftId),file=input.file;
 if(!/^[A-Za-z0-9_-]{8,160}$/.test(ctx.requestId)||!Number.isSafeInteger(ctx.now)||ctx.now<0||!(file instanceof File))throw new CategoryContractError('Keep a stable upload reference and the original selected file.',400);
 const invalid=file.type==='video/mp4'?await validateProductVideo(file):validateProductImage(file)??await validateProductImageContent(file);
 if(invalid)throw new CategoryContractError(invalid,400);
 const bytes=await file.arrayBuffer(),digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),byte=>byte.toString(16).padStart(2,'0')).join(''),originalName=file.name.slice(0,180);
 const read=()=>db.prepare(`SELECT ${columns} FROM product_intake_media WHERE owner_id=? AND request_id=?`).bind(ctx.actorId,ctx.requestId).first<MediaRow>();
 let row=await read();
 if(!row){
  const id=crypto.randomUUID(),objectKey=`private/product-intakes/${input.draftId}/${id}`;
  try{await db.batch([...authority.statements,db.prepare("INSERT INTO product_intake_media(id,draft_id,owner_id,request_id,object_key,mime_type,size_bytes,original_name,content_digest,state,created_at) VALUES(?,?,?,?,?,?,?,?,?,'uploading',?)")
   .bind(id,input.draftId,ctx.actorId,ctx.requestId,objectKey,file.type,file.size,originalName,digest,ctx.now)]);}
  catch(error){row=await read();if(!row)throw new CategoryContractError(/constraint|guard/i.test(String(error))?'Current upload authority changed. Keep your file and reopen the draft.':'The upload reference is not confirmed. Retry the same file and request.',/constraint|guard/i.test(String(error))?409:503);}
  row??=await read();
 }
 if(!row)throw new CategoryContractError('The upload reference could not be recovered. Retain the original file and request.',503);
 if(row.draftId!==input.draftId||row.digest!==digest||row.mimeType!==file.type||row.sizeBytes!==file.size||row.originalName!==originalName)throw new CategoryContractError('This upload reference was used for a different file. Retain the original request or choose a new upload.');
 const matches=(head:{size:number;customMetadata?:Record<string,string>}|null)=>!!head&&head.size===row!.sizeBytes&&head.customMetadata?.contentDigest===row!.digest&&head.customMetadata?.uploadId===row!.id;
 let head;
 try{
  head=await bucket.head(row.objectKey);
  if(head&&!matches(head))throw new CategoryContractError('The stored file differs from its retained reference. Keep the file and request assistance.',503);
  if(!head){
   try{await bucket.put(row.objectKey,bytes,{httpMetadata:{contentType:row.mimeType},customMetadata:{draftId:row.draftId,ownerId:row.ownerId,uploadId:row.id,contentDigest:row.digest}});}
   catch{ /* A lost object response is reconciled against the same immutable key below. */ }
   head=await bucket.head(row.objectKey);
  }
 }catch(error){if(error instanceof CategoryContractError)throw error;throw new CategoryContractError('The file upload is not confirmed. Retain and retry the same file and request.',503);}
 if(!matches(head))throw new CategoryContractError('The file upload is not confirmed. Retain and retry the same file and request.',503);
 const currentAuthority=await ownerAuthority(db,ctx.actorId,row.draftId);
 if(row.state==='ready')return publicReference(row);
 try{await db.batch([...currentAuthority.statements,...offerGuard(db,"EXISTS(SELECT 1 FROM product_intake_media WHERE id=? AND owner_id=? AND content_digest=? AND state IN ('uploading','ready'))",[row.id,ctx.actorId,row.digest]),
  db.prepare("UPDATE product_intake_media SET state='ready',completed_at=COALESCE(completed_at,?) WHERE id=? AND state='uploading'").bind(ctx.now,row.id)]);}
 catch{
  await ownerAuthority(db,ctx.actorId,row.draftId);const recovered=await read();if(recovered?.state==='ready')return publicReference(recovered);
  throw new CategoryContractError('The file is retained, but its completed reference is not confirmed. Retry this same upload.',503);
 }
 const completed=await read();if(!completed||completed.state!=='ready')throw new CategoryContractError('Keep the file and reconcile this upload before attaching it.',503);return publicReference(completed);
}
/** Staff may read only media in a candidate that this owner actually shared with this exact case. */
export async function readProductIntakeMedia(db:D1Database,bucket:ObjectStore,actorId:string,mediaId:string,caseId:string|null){
 const row=await db.prepare(`SELECT ${columns} FROM product_intake_media WHERE id=? AND state='ready'`).bind(mediaId).first<MediaRow>();
 if(!row)throw new CategoryContractError('This completed product upload is unavailable.',404);
 const authorize=async()=>{
  if(actorId===row.ownerId){await ownerAuthority(db,actorId,row.draftId);return;}
  if(!caseId)throw new CategoryContractError('This private upload needs its owner or the exact shared assistance case.',403);
  let work:Awaited<ReturnType<typeof getProductIntakeReview>>;
  try{work=await getProductIntakeReview(db,actorId,caseId);}catch(error){
   if(!(error instanceof CategoryContractError)||error.status!==403)throw error;
   const publication=await getProductPublicationReview(db,actorId,caseId);
   if(publication.draftId!==row.draftId||!publication.candidate.snapshot.mediaIds.includes(row.id))throw new CategoryContractError('This file is outside the exact approved publication.',403);
   return;
  }
  if(work.draftId!==row.draftId)throw new CategoryContractError('This upload is outside the shared case.',403);
  const versions=(await db.prepare('SELECT DISTINCT v.snapshot_json AS snapshot FROM product_intake_workspace_versions v JOIN product_intake_events e ON e.version_id=v.id WHERE e.case_id=? AND v.draft_id=?').bind(caseId,row.draftId).all<{snapshot:string}>()).results;
  if(!versions.some(version=>(JSON.parse(version.snapshot) as IntakeSnapshot).mediaIds.includes(row.id)))throw new CategoryContractError('This file has not been shared in a submitted candidate.',403);
 };
 await authorize();const object=await bucket.get(row.objectKey);
 if(!object||object.size!==row.sizeBytes||object.customMetadata?.contentDigest!==row.digest||object.customMetadata?.uploadId!==row.id)throw new CategoryContractError('The retained file is temporarily unavailable. Keep its reference and retry.',503);
 await authorize();return {body:object.body,mimeType:row.mimeType,sizeBytes:row.sizeBytes,originalName:row.originalName};
}
