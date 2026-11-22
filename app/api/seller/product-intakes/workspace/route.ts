import {env} from 'cloudflare:workers';
import {requireSellerCenterApi,SellerCenterAuthorizationError} from '@/lib/auth/seller-center';
import {requireDatabase} from '@/lib/db/d1';
import {readBoundedJsonObject} from '@/lib/http/form-json-body';
import {isTrustedMutationRequest} from '@/lib/http/request-security';
import {CategoryContractError,getCategoryDetailGroups} from '@/lib/products/category-contracts';
import {confirmProductIntakeProposal,getProductWorkspace,saveProductWorkspace,submitProductIntake} from '@/lib/products/intake-workspace';
import {copySellerIntakeProduct} from '@/lib/products/intake-starter';
import {closedIntakeFields,intakeCommand,intakeFailure,intakeId,intakeQuery,intakeReply,intakeActor} from '@/lib/products/intake-http';
const failure=(error:unknown)=>error instanceof SellerCenterAuthorizationError?intakeReply({error:error.message},error.status):intakeFailure(error);
export async function GET(request:Request){try{
 const owner=await requireSellerCenterApi();intakeActor(request,owner.userId);const query=intakeQuery(request,['draftId','caseId','categoryId']),db=requireDatabase(env as unknown as {DB?:D1Database});
 if(query.has('categoryId')){if(query.size!==1)throw new CategoryContractError('Choose one category guidance request.',400);return intakeReply(await getCategoryDetailGroups(db,query.get('categoryId')||null));}
 if(query.size>1)throw new CategoryContractError('Choose one saved draft or assistance reference.',400);
 let id=query.get('draftId');const caseId=query.get('caseId');
 if(caseId){if(!intakeId(caseId))throw new CategoryContractError('Invalid assistance reference.',400);const work=await db.prepare('SELECT c.draft_id AS draftId FROM product_intake_cases c JOIN product_intake_drafts d ON d.id=c.draft_id WHERE c.id=? AND d.owner_id=?').bind(caseId,owner.userId).first<{draftId:string}>();if(!work)throw new CategoryContractError('This assistance case is unavailable to this account.',403);id=work.draftId;}
 if(id){if(!intakeId(id))throw new CategoryContractError('Invalid draft reference.',400);const workspace=await getProductWorkspace(db,owner.userId,id);if(caseId&&workspace.case?.caseId!==caseId)return intakeReply({error:'This earlier case is read-only. Open its review history or the current product workspace.',historyHref:'/seller/products/intakes/'+encodeURIComponent(caseId),workspaceHref:'/seller/products/new?draftId='+encodeURIComponent(id)},409);return intakeReply(workspace);}
 const drafts=(await db.prepare('SELECT d.id,d.revision,d.updated_at AS updatedAt,d.answers_json AS answers FROM product_intake_drafts d JOIN seller_profiles s ON s.id=d.seller_id AND s.user_id=d.owner_id WHERE d.owner_id=? AND d.seller_id=? ORDER BY d.updated_at DESC,d.id DESC LIMIT 100').bind(owner.userId,owner.sellerId??'').all<{id:string;revision:number;updatedAt:number;answers:string}>()).results;
 return intakeReply({drafts:drafts.map(draft=>({...draft,answers:undefined,title:(JSON.parse(draft.answers) as {nameEn?:string}).nameEn||'Product details not yet entered'}))});
 }catch(error){return failure(error);}}
export async function POST(request:Request){
 if(!isTrustedMutationRequest(request))return intakeReply({error:'Cross-site requests are not allowed.'},403);
 try{const owner=await requireSellerCenterApi();if(!owner.sellerId)throw new CategoryContractError('Save the registration information you have first so this private draft has its owner reference.');
 const body=await readBoundedJsonObject(request),ctx=intakeCommand(body,owner.userId,request),db=requireDatabase(env as unknown as {DB?:D1Database});
 if(body.action==='copy'){
  closedIntakeFields(body,['action','requestId','expectedRevision','productId']);
  if(!intakeId(body.productId))throw new CategoryContractError('Choose a published product from your own shop.',400);
  return intakeReply(await copySellerIntakeProduct(db,ctx,owner.sellerId,body.productId));
 }
 if(body.action==='save'){
  closedIntakeFields(body,['action','requestId','expectedRevision','draftId','categoryId','answers','offers','mediaIds','privateReview','formContext','packedWeightGrams']);
  if(!(body.draftId===null||intakeId(body.draftId))||!(body.categoryId===null||typeof body.categoryId==='string'&&body.categoryId.length<=160)||!Array.isArray(body.mediaIds))throw new CategoryContractError('Use the saved draft and supported category/media references.',400);
  return intakeReply(await saveProductWorkspace(db,ctx,{draftId:body.draftId,sellerId:owner.sellerId,categoryId:body.categoryId,answers:body.answers,offers:body.offers,mediaIds:body.mediaIds as string[],privateReview:body.privateReview,...(body.formContext!==undefined?{formContext:body.formContext}:{}),...(body.packedWeightGrams!==undefined?{packedWeightGrams:body.packedWeightGrams}:{})}));
 }
 if(body.action==='send'){
  closedIntakeFields(body,['action','requestId','expectedRevision','draftId','versionId','intent','note','replaceVersionId','expectedCaseRevision','expectedCaseId']);
  if(!intakeId(body.draftId)||!intakeId(body.versionId)||!['help','review'].includes(String(body.intent))||typeof body.note!=='string'||body.replaceVersionId!==undefined&&body.replaceVersionId!==null&&!intakeId(body.replaceVersionId)||body.expectedCaseId!==undefined&&body.expectedCaseId!==null&&!intakeId(body.expectedCaseId)||body.expectedCaseRevision!==undefined&&body.expectedCaseRevision!==null&&(typeof body.expectedCaseRevision!=='string'||!/^\d{1,16}$/.test(body.expectedCaseRevision)))throw new CategoryContractError('Compare and send the exact saved candidate.',400);
  return intakeReply(await submitProductIntake(db,ctx,{draftId:body.draftId,versionId:body.versionId,intent:body.intent as 'help'|'review',note:body.note,...(body.replaceVersionId!==undefined?{replaceVersionId:body.replaceVersionId as string|null}:{}),...(body.expectedCaseRevision!==undefined?{expectedCaseRevision:body.expectedCaseRevision as string|null}:{}),...(body.expectedCaseId!==undefined?{expectedCaseId:body.expectedCaseId as string|null}:{})}));
 }
 if(body.action==='proposal'){
  closedIntakeFields(body,['action','requestId','expectedRevision','caseId','proposalId','expectedDraftRevision','decision']);
  if(!intakeId(body.caseId)||!intakeId(body.proposalId)||typeof body.expectedDraftRevision!=='string'||!/^\d{1,16}$/.test(body.expectedDraftRevision)||!['accept','decline'].includes(String(body.decision)))throw new CategoryContractError('Compare the proposal and current draft before choosing.',400);
  return intakeReply(await confirmProductIntakeProposal(db,ctx,{caseId:body.caseId,proposalId:body.proposalId,expectedDraftRevision:body.expectedDraftRevision,decision:body.decision as 'accept'|'decline'}));
 }
 throw new CategoryContractError('Choose a supported product workspace action.',400);
 }catch(error){return failure(error);}
}
