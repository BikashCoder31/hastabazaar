import type {PreparedHeroMedia} from './hero-media';
export const HERO_UPLOAD_ID_HEADER='X-Hastabazaar-Upload-Id';
export function homepageHeroUploadId(value:unknown):string{if(typeof value!=='string'||!/^[A-Za-z0-9][A-Za-z0-9_-]{15,79}$/.test(value))throw new RangeError('Upload reference must contain 16–80 safe characters.');return value;}
export async function homepageHeroUploadIdentity(uploadId:string,actorId:string,prepared:PreparedHeroMedia){
 const id=homepageHeroUploadId(uploadId),hex=(bytes:ArrayBuffer)=>Array.from(new Uint8Array(bytes),n=>n.toString(16).padStart(2,'0')).join('');
 const content=hex(await crypto.subtle.digest('SHA-256',new Uint8Array(prepared.bytes)));
 const fingerprint=hex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify([id,actorId,content,prepared.originalName,prepared.mimeType,prepared.bytes.byteLength,prepared.width,prepared.height,prepared.durationSeconds]))));
 return{id,objectKey:`private/homepage-hero/${id}/${fingerprint}`,originalName:prepared.originalName,mimeType:prepared.mimeType,sizeBytes:prepared.bytes.byteLength,width:prepared.width,height:prepared.height,durationSeconds:prepared.durationSeconds,createdBy:actorId};
}
