import {productMutationBoundary,intakeErrorReply,type ProductMutationPhase} from '@/lib/products/intake-http';
import {validOfferId} from '@/lib/products/offer-contracts';
import {env} from 'cloudflare:workers';
import {requireSellerCenterApi,SellerCenterAuthorizationError} from '@/lib/auth/seller-center';
import {requireDatabase} from '@/lib/db/d1';
import {readBoundedJsonObject} from '@/lib/http/form-json-body';
import {isTrustedMutationRequest} from '@/lib/http/request-security';
import {CategoryContractError} from '@/lib/products/category-contracts';
import {getProductWorkspace} from '@/lib/products/intake-workspace';
import {getRetainedProductPriceRequests,rebaseProductWorkspace,submitProductPriceRevision} from '@/lib/products/publication';
import type {ProductPriceRevisionInput} from '@/lib/products/price-revision';
import {closedIntakeFields,intakeCommand,intakeFailure,intakeId,intakeQuery,intakeReply,intakeActor} from '@/lib/products/intake-http';
const failure=(error:unknown,phase?:ProductMutationPhase)=>error instanceof SellerCenterAuthorizationError?intakeErrorReply(error.message,error.status,phase):intakeFailure(error,phase);
const revision=(value:unknown)=>typeof value==='string'&&/^\d{1,16}$/.test(value);
export async function GET(request:Request){try{const owner=await requireSellerCenterApi();intakeActor(request,owner.userId);const query=intakeQuery(request,['draftId']),draftId=query.get('draftId');if(!intakeId(draftId))throw new CategoryContractError('Choose your exact saved product reference.',400);const db=requireDatabase(env as unknown as {DB?:D1Database}),workspace=await getProductWorkspace(db,owner.userId,draftId),retainedPriceRequests=await getRetainedProductPriceRequests(db,owner.userId,draftId);return intakeReply({workspace,retainedPriceRequests});}catch(error){return failure(error);}}
export async function POST(request:Request){const boundary=productMutationBoundary();
 if(!isTrustedMutationRequest(request))return intakeErrorReply('Cross-site requests are not allowed.',403,'rejected_before_write');
 try{const owner=await requireSellerCenterApi(),body=await readBoundedJsonObject(request),ctx=intakeCommand(body,owner.userId,request),db=requireDatabase(env as unknown as {DB?:D1Database});
  if(!intakeId(body.draftId)||!revision(body.expectedDraftRevision))throw new CategoryContractError('Keep the exact saved product and private-draft revision.',400);
  if(body.action==='rebase'){
   closedIntakeFields(body,['action','requestId','expectedRevision','draftId','publicVersionId','expectedDraftRevision','retainDraft']);if(!intakeId(body.publicVersionId)||body.retainDraft!==true)throw new CategoryContractError('Compare the current public facts and explicitly retain this private draft.',400);
   boundary.begin();return intakeReply(await rebaseProductWorkspace(db,ctx,{draftId:body.draftId,publicVersionId:body.publicVersionId,expectedDraftRevision:body.expectedDraftRevision as string,retainDraft:true}));
  }
  if(body.action==='price_only'){
   closedIntakeFields(body,['action','requestId','expectedRevision','draftId','baseVersionId','expectedDraftRevision','expectedCaseId','expectedCaseRevision','replaceVersionId','offerId','price','compareAt','note']);
   if(!intakeId(body.baseVersionId)||!intakeId(body.expectedCaseId)||!revision(body.expectedCaseRevision)||!intakeId(body.replaceVersionId)||!validOfferId(body.offerId))throw new CategoryContractError('Keep the selected public offer and exact review-case references.',400);
   const {action,requestId,expectedRevision,...input}=body;void action;void requestId;void expectedRevision;
   boundary.begin();return intakeReply(await submitProductPriceRevision(db,ctx,input as unknown as ProductPriceRevisionInput));
  }
  throw new CategoryContractError('Choose a supported owner publication action.',400);
 }catch(error){return failure(error,boundary.phase);}
}
