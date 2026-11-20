import {env} from 'cloudflare:workers';
import {requireSellerCenterApi,SellerCenterAuthorizationError} from '@/lib/auth/seller-center';
import {requireDatabase,requireMediaBucket} from '@/lib/db/d1';
import {readBoundedForm} from '@/lib/http/bounded-body';
import {isTrustedMutationRequest} from '@/lib/http/request-security';
import {consumePublicRequestRateLimit,rateLimitJson} from '@/lib/http/rate-limit';
import {CategoryContractError} from '@/lib/products/category-contracts';
import {intakeFailure,intakeId,intakeReply} from '@/lib/products/intake-http';
import {uploadProductIntakeMedia} from '@/lib/products/intake-media';
export async function POST(request:Request){
 if(!isTrustedMutationRequest(request))return intakeReply({error:'Cross-site requests are not allowed.'},403);
 try{const owner=await requireSellerCenterApi(),bindings=env as unknown as {DB?:D1Database;MEDIA?:R2Bucket},db=requireDatabase(bindings);
  const rate=await consumePublicRequestRateLimit(db,request,{scope:`product-intake-media:${owner.userId}`,limit:100,windowMs:60*60_000});if(!rate.allowed)return rateLimitJson(rate);
  const body=await readBoundedForm(request,21*1024*1024);if([...body.keys()].some(key=>!['draftId','requestId','file'].includes(key)||body.getAll(key).length!==1))throw new CategoryContractError('Use one file and its original upload reference.',400);
  const draftId=body.get('draftId'),requestId=body.get('requestId'),file=body.get('file');if(!intakeId(draftId)||typeof requestId!=='string'||!(file instanceof File))throw new CategoryContractError('Select a supported file for the saved private draft.',400);
  return intakeReply(await uploadProductIntakeMedia(db,requireMediaBucket(bindings),{actorId:owner.userId,requestId,expectedRevision:null,now:Date.now()},{draftId,file}));
 }catch(error){return error instanceof SellerCenterAuthorizationError?intakeReply({error:error.message},error.status):intakeFailure(error);}
}
