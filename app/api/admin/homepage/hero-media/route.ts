import {env} from 'cloudflare:workers';
import {requireStaffApi,StaffAuthorizationError} from '@/lib/auth/staff';
import {requireDatabase,requireMediaBucket} from '@/lib/db/d1';
import {createHomepageHeroMedia,listHomepageHeroMediaForAdmin,getHomepageHeroMediaForAdmin,sameHomepageHeroUpload,HomepageHeroMediaAuthorizationError,HomepageHeroMediaConflictError} from '@/lib/db/repositories/homepage-hero';
import {HomepageHeroMediaError,prepareHomepageHeroUpload} from '@/lib/homepage/hero-media';
import {HERO_UPLOAD_ID_HEADER,homepageHeroUploadId,homepageHeroUploadIdentity} from '@/lib/homepage/hero-upload-identity';
import {BodyTooLargeError,readBoundedForm} from '@/lib/http/bounded-body';
import {isTrustedMutationRequest} from '@/lib/http/request-security';
import {hasActorIntentMismatch} from '@/lib/http/actor-intent';
export const dynamic='force-dynamic';
const json=(body:unknown,status:number)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
type HeroBindings={DB?:D1Database;MEDIA?:R2Bucket};
async function actor(request:Request|undefined,permission:'business_settings.view'|'business_settings.manage',expected?:string){const staff=await requireStaffApi(permission);if(request&&hasActorIntentMismatch(request,staff.id)||expected!==undefined&&staff.id!==expected)throw new StaffAuthorizationError('The signed-in staff account changed. Reopen the current homepage workspace.',403);return staff;}
export async function GET(request?:Request):Promise<Response>{try{
 const staff=await actor(request,'business_settings.view'),database=requireDatabase(env as unknown as HeroBindings),url=request?new URL(request.url):null;
 if(url?.searchParams.has('uploadId')){if(url.searchParams.getAll('uploadId').length!==1||[...url.searchParams.keys()].some(key=>key!=='uploadId'))throw new RangeError('Use one exact upload reference.');const uploadId=homepageHeroUploadId(url.searchParams.get('uploadId')),media=await getHomepageHeroMediaForAdmin(database,uploadId);await actor(request,'business_settings.view',staff.id);if(media&&media.createdBy!==staff.id)return json({uploadId,status:'conflict',code:'upload_identity_conflict',error:'This upload reference belongs to a different original actor.'},409);return json({uploadId,status:media?'recorded':'unconfirmed',media},200);}
 const media=await listHomepageHeroMediaForAdmin(database);await actor(request,'business_settings.view',staff.id);return json({media},200);
 }catch(error){if(error instanceof StaffAuthorizationError)return json({error:error.message,code:'access_denied_before_write'},error.status);if(error instanceof RangeError)return json({error:error.message},400);return json({error:'Homepage hero media could not be loaded.'},500);}}
export async function POST(request:Request):Promise<Response>{
 let uploadId:string|undefined,writeStarted=false;const header=request.headers.get(HERO_UPLOAD_ID_HEADER);if(header&&/^[A-Za-z0-9][A-Za-z0-9_-]{15,79}$/.test(header))uploadId=header;
 if(!isTrustedMutationRequest(request))return json({uploadId,error:'Cross-site requests are not allowed.',code:'access_denied_before_write',status:'rejected'},403);
 try{const staff=await actor(request,'business_settings.manage');if(header!==null)homepageHeroUploadId(header);
 const form=await readBoundedForm(request,22*1024*1024);if([...form.keys()].some(key=>!['file','uploadId'].includes(key))||form.getAll('file').length!==1||form.getAll('uploadId').length>1)throw new HomepageHeroMediaError('Use one file and one original upload reference.');const supplied=form.get('uploadId');if(supplied!==null&&typeof supplied!=='string')throw new RangeError('Upload reference is invalid.');if(header!==null&&supplied!==null&&header!==supplied)throw new RangeError('Upload references do not match.');uploadId=homepageHeroUploadId(header??supplied??crypto.randomUUID());
 const file=form.get('file');if(!(file instanceof File))throw new HomepageHeroMediaError('Choose an image or MP4 file to upload.');const prepared=await prepareHomepageHeroUpload(file),identity=await homepageHeroUploadIdentity(uploadId,staff.id,prepared),bindings=env as unknown as HeroBindings,database=requireDatabase(bindings);
 const existing=await getHomepageHeroMediaForAdmin(database,uploadId);if(existing){if(!sameHomepageHeroUpload(existing,identity))throw new HomepageHeroMediaConflictError('This upload reference is already bound to another exact actor or file.');await actor(request,'business_settings.manage',staff.id);return json({uploadId,status:'recorded',media:existing},201);}
 await actor(request,'business_settings.manage',staff.id);const bucket=requireMediaBucket(bindings);writeStarted=true;
 await bucket.put(identity.objectKey,prepared.bytes,{httpMetadata:{contentType:prepared.mimeType},customMetadata:{purpose:'homepage-hero',mediaId:uploadId}});
 const media=await createHomepageHeroMedia(database,{...identity,createdAt:Date.now()});await actor(request,'business_settings.manage',staff.id);return json({uploadId,status:'recorded',media},201);
 }catch(error){if(error instanceof StaffAuthorizationError||error instanceof HomepageHeroMediaAuthorizationError)return json({uploadId,error:error.message,status:writeStarted?'uncertain':'rejected',code:writeStarted?'outcome_unconfirmed':'access_denied_before_write'},error.status);if(error instanceof HomepageHeroMediaConflictError)return json({uploadId,error:error.message,status:'conflict',code:'upload_identity_conflict'},409);
 // A put or native batch may have committed before its acknowledgement disappeared.
 // Retain its content-addressed bytes; an absent/failed proof read never authorizes deletion.
 if(!writeStarted&&(error instanceof BodyTooLargeError||error instanceof HomepageHeroMediaError||error instanceof RangeError))return json({uploadId,error:error.message,status:'rejected',code:'invalid_upload_before_write'},error instanceof BodyTooLargeError?413:400);
 return json({uploadId,error:'The original upload outcome could not be confirmed. Check this upload reference before another submission.',status:'uncertain',code:'outcome_unconfirmed'},503);}
}
