import {hasActorIntentMismatch} from '@/lib/http/actor-intent';
import {env} from 'cloudflare:workers';
import {requireSellerCenterApi,SellerCenterAuthorizationError} from '@/lib/auth/seller-center';
import {requireDatabase,requireMediaBucket} from '@/lib/db/d1';
import {isTrustedMutationRequest} from '@/lib/http/request-security';
import {readBoundedForm,BodyTooLargeError} from '@/lib/http/bounded-body';
import {consumePublicRequestRateLimit,rateLimitJson} from '@/lib/http/rate-limit';
import {savePublicProfileMedia} from '@/lib/sellers/public-profile-media';
import {PublicProfileError} from '@/lib/sellers/public-profile-types';
const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
export async function POST(request:Request){
 if(!isTrustedMutationRequest(request))return reply({error:'Cross-site requests are not allowed.'},403);
 try{const owner=await requireSellerCenterApi();if(hasActorIntentMismatch(request,owner.userId))throw new SellerCenterAuthorizationError('The signed-in account changed. Reopen this private upload.',403);if(!owner.sellerId)return reply({error:'Seller application not found.'},404);
  const bindings=env as unknown as {DB?:D1Database;MEDIA?:R2Bucket},db=requireDatabase(bindings),rate=await consumePublicRequestRateLimit(db,request,{scope:`profile-media:${owner.userId}`,limit:20,windowMs:60*60_000});if(!rate.allowed)return rateLimitJson(rate);
  const body=await readBoundedForm(request,27*1024*1024),allowed=['sellerId','ownerId','requestId','kind','file'];
  if([...body.keys()].some(key=>!allowed.includes(key)||body.getAll(key).length!==1))return reply({error:'Invalid profile media fields.'},400);
  if(body.get('sellerId')!==owner.sellerId||body.get('ownerId')!==owner.userId)return reply({error:'Return to the owner of this upload before retrying.'},403);
  const requestId=body.get('requestId'),kind=body.get('kind'),file=body.get('file');
  if(typeof requestId!=='string'||!/^[A-Za-z0-9_-]{1,100}$/.test(requestId)||typeof kind!=='string'||!['profile_image','maker_video'].includes(kind)||!(file instanceof File))return reply({error:'Select a valid optional profile file.'},400);
  const id=await savePublicProfileMedia(db,requireMediaBucket(bindings),{sellerId:owner.sellerId,actorId:owner.userId,requestId,now:Date.now(),kind:kind as 'profile_image'|'maker_video',file});return reply({ok:true,id});
 }catch(error){if(error instanceof SellerCenterAuthorizationError||error instanceof PublicProfileError)return reply({error:error.message},error.status);if(error instanceof BodyTooLargeError)return reply({error:error.message},413);return reply({error:'Upload result is uncertain. Keep the selected file and retry the same upload.'},503);}
}
