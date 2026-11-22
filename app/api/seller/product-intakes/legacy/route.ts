import {productMutationBoundary,intakeErrorReply,type ProductMutationPhase} from '@/lib/products/intake-http';
import {env} from 'cloudflare:workers';
import {requireSellerCenterApi,SellerCenterAuthorizationError} from '@/lib/auth/seller-center';
import {requireDatabase,requireMediaBucket} from '@/lib/db/d1';
import {readBoundedJsonObject} from '@/lib/http/form-json-body';
import {isTrustedMutationRequest} from '@/lib/http/request-security';
import {consumePublicRequestRateLimit,rateLimitJson} from '@/lib/http/rate-limit';
import {CategoryContractError} from '@/lib/products/category-contracts';
import {inspectLegacyProduct,openLegacyProductWorkspace,reuseLegacyProductMedia} from '@/lib/products/legacy-workspace';
import {closedIntakeFields,intakeCommand,intakeFailure,intakeId,intakeQuery,intakeReply,intakeActor} from '@/lib/products/intake-http';
const failure=(error:unknown,phase?:ProductMutationPhase)=>error instanceof SellerCenterAuthorizationError?intakeErrorReply(error.message,error.status,phase):intakeFailure(error,phase);
export async function GET(request:Request){try{const owner=await requireSellerCenterApi();intakeActor(request,owner.userId);const query=intakeQuery(request,['productId']),id=query.get('productId');if(!intakeId(id))throw new CategoryContractError('Choose the existing product reference.',400);return intakeReply(await inspectLegacyProduct(requireDatabase(env as unknown as {DB?:D1Database}),owner.userId,id));}catch(error){return failure(error);}}
export async function POST(request:Request){const boundary=productMutationBoundary();if(!isTrustedMutationRequest(request))return intakeErrorReply('Cross-site requests are not allowed.',403,'rejected_before_write');try{
 const owner=await requireSellerCenterApi(),body=await readBoundedJsonObject(request),ctx=intakeCommand(body,owner.userId,request),bindings=env as unknown as {DB?:D1Database;MEDIA?:R2Bucket},db=requireDatabase(bindings);
 if(body.action==='open_existing'){closedIntakeFields(body,['action','requestId','expectedRevision','productId','sourceFingerprint','retainObserved']);if(!intakeId(body.productId)||typeof body.sourceFingerprint!=='string'||body.retainObserved!==true)throw new CategoryContractError('Compare the existing product and explicitly retain its observation.',400);boundary.begin();return intakeReply(await openLegacyProductWorkspace(db,ctx,{productId:body.productId,sourceFingerprint:body.sourceFingerprint,retainObserved:true}));}
 if(body.action==='reuse_file'){closedIntakeFields(body,['action','requestId','expectedRevision','draftId','mediaId']);if(!intakeId(body.draftId)||!intakeId(body.mediaId))throw new CategoryContractError('Choose a file from the retained product observation.',400);const rate=await consumePublicRequestRateLimit(db,request,{scope:`product-intake-media:${owner.userId}`,limit:100,windowMs:60*60_000});if(!rate.allowed)return rateLimitJson(rate);boundary.begin();return intakeReply(await reuseLegacyProductMedia(db,requireMediaBucket(bindings),ctx,{draftId:body.draftId,mediaId:body.mediaId}));}
 throw new CategoryContractError('Choose a supported existing-product action.',400);
 }catch(error){return failure(error,boundary.phase);}}
