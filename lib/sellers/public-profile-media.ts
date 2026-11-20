import {staffMutationGuard} from '../db/repositories/staff-mutation-guard';
import {validateProductImage,validateProductImageContent} from '../products/submission';
import {validateProductVideo} from '../media/product-video';
import {digestFormRequest} from '../forms/submission';
import {PublicProfileError,PublicProfileAuthorityError,type ProfileCommand,type PublicProfileValues} from './public-profile-types';
import {profileWorkflowInternals as workflow,publicProfileEligibility} from './public-profile-workflow';
export async function savePublicProfileMedia(db:D1Database,bucket:R2Bucket,input:ProfileCommand&{kind:'profile_image'|'maker_video';file:File}):Promise<string>{
 await workflow.owner(db,input.sellerId,input.actorId);
 if(!['profile_image','maker_video'].includes(input.kind)||!(input.file instanceof File)||!input.file.size)throw new PublicProfileError('Choose one optional profile photo or video.',400);
 const invalid=input.kind==='profile_image'?validateProductImage(input.file)??await validateProductImageContent(input.file):await validateProductVideo(input.file);
 if(invalid)throw new PublicProfileError(invalid,400);
 const bytes=await input.file.arrayBuffer(),digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),byte=>byte.toString(16).padStart(2,'0')).join('');
 const metadata={kind:input.kind,name:input.file.name.slice(0,180),mimeType:input.file.type,sizeBytes:bytes.byteLength,digest};
 const intent=await workflow.command(db,input,'media_uploaded',input.sellerId,null,metadata);if(intent.receipt.replayed)return intent.receipt.result as string;
 // Content-bound identity makes a retry deterministic without overwriting different bytes after an uncertain response.
 const id=await digestFormRequest([input.sellerId,input.actorId,input.requestId,metadata]),objectKey=`private/seller-profile/${input.sellerId}/${id}`;
 await bucket.put(objectKey,bytes,{httpMetadata:{contentType:input.file.type},customMetadata:{sellerId:input.sellerId,mediaKind:input.kind,contentDigest:digest}});
 await intent.commit([...workflow.guard(db,workflow.ownerSql,[input.sellerId,input.actorId]),db.prepare(`INSERT INTO seller_profile_media(id,seller_id,kind,object_key,original_name,mime_type,size_bytes,moderation_status,uploaded_at) VALUES(?,?,?,?,?,?,?,'pending',?)`)
  .bind(id,input.sellerId,input.kind,objectKey,metadata.name,metadata.mimeType,metadata.sizeBytes,input.now)],id);return id;
}
type Media={objectKey:string;mimeType:string;sizeBytes:number;kind:string};
const columns='m.object_key AS objectKey,m.mime_type AS mimeType,m.size_bytes AS sizeBytes,m.kind';
export async function getPrivateProfileMedia(db:D1Database,sellerId:string,id:string,actorId:string,audience:'owner'|'staff'){
 if(audience==='owner')await workflow.owner(db,sellerId,actorId);else await staffMutationGuard(db,actorId,'seller.application.review',PublicProfileAuthorityError);
 return db.prepare(`SELECT ${columns} FROM seller_profile_media m WHERE m.id=? AND m.seller_id=? AND instr(m.object_key,?)=1`).bind(id,sellerId,`private/seller-profile/${sellerId}/`).first<Media>();
}
export async function getPublishedProfileMedia(db:D1Database,id:string,now=Date.now()){
 return db.prepare(`SELECT ${columns} FROM seller_profile_media m JOIN seller_public_profile_revision_media link ON link.media_id=m.id
  JOIN seller_public_profile_states p ON p.current_revision_id=link.revision_id AND p.seller_id=m.seller_id JOIN seller_profiles s ON s.id=p.seller_id
  WHERE m.id=? AND m.moderation_status<>'rejected' AND instr(m.object_key,'private/seller-profile/'||s.id||'/')=1 AND ${publicProfileEligibility('s.id',now)}`)
  .bind(id).first<Media>();
}
export async function getReviewedPublicProfileExtras(db:D1Database,sellerId:string,now=Date.now()){
 const row=await db.prepare(`SELECT p.current_json AS json FROM seller_public_profile_states p JOIN seller_profiles s ON s.id=p.seller_id
  WHERE p.seller_id=? AND p.provenance IN ('reviewed_publication','reviewed_correction') AND ${publicProfileEligibility('s.id',now)}`).bind(sellerId).first<{json:string}>();
 if(!row)return null;
 const current=JSON.parse(row.json) as PublicProfileValues,media=await db.prepare(`SELECT m.id,m.kind,link.caption FROM seller_profile_media m JOIN seller_public_profile_revision_media link ON link.media_id=m.id
  JOIN seller_public_profile_states p ON p.current_revision_id=link.revision_id AND p.seller_id=m.seller_id WHERE p.seller_id=? AND m.moderation_status<>'rejected'`).bind(sellerId).all<{id:string;kind:string;caption:string}>();
 return{specialties:current.specialties,craftExperience:current.craftExperience,socialLinks:current.socialLinks,media:media.results};
}
export async function profileMediaResponse(bucket:R2Bucket,media:Media|null){
 if(!media)return new Response(null,{status:404,headers:{'Cache-Control':'no-store'}});
 if(!['image/png','image/jpeg','image/webp','video/mp4','video/webm','video/quicktime'].includes(media.mimeType))return new Response(null,{status:404});
 const object=await bucket.get(media.objectKey);if(!object)return new Response(null,{status:404,headers:{'Cache-Control':'no-store'}});
 return new Response(object.body,{headers:{'Content-Type':media.mimeType,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Disposition':'inline','Content-Security-Policy':"default-src 'none'; sandbox",'Referrer-Policy':'no-referrer'}});
}
