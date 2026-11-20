import {productMutationBoundary,intakeErrorReply,type ProductMutationPhase} from '@/lib/products/intake-http';
import {env} from 'cloudflare:workers';
import {requireStaffApi,StaffAuthorizationError} from '@/lib/auth/staff';
import {requireDatabase} from '@/lib/db/d1';
import {readBoundedJsonObject} from '@/lib/http/form-json-body';
import {isTrustedMutationRequest} from '@/lib/http/request-security';
import {CategoryContractError} from '@/lib/products/category-contracts';
import {getProductIntakeReview,proposeProductIntakeChanges,triageProductIntake} from '@/lib/products/intake-assistance';
import {closedIntakeFields,intakeCommand,intakeFailure,intakeId,intakeQuery,intakeReply,intakeActor} from '@/lib/products/intake-http';
async function staff(){try{return await requireStaffApi('product.review');}catch(error){if(!(error instanceof StaffAuthorizationError)||error.status!==403)throw error;return requireStaffApi('support.manage');}}
const failure=(error:unknown,phase?:ProductMutationPhase)=>error instanceof StaffAuthorizationError?intakeErrorReply(error.message,error.status,phase):intakeFailure(error,phase);
export async function GET(request:Request){try{const actor=await staff();intakeActor(request,actor.id);const query=intakeQuery(request,['caseId']),caseId=query.get('caseId');if(!intakeId(caseId))throw new CategoryContractError('Choose an exact product assistance case.',400);return intakeReply(await getProductIntakeReview(requireDatabase(env as unknown as {DB?:D1Database}),actor.id,caseId));}catch(error){return failure(error);}}
export async function POST(request:Request){const boundary=productMutationBoundary();
 if(!isTrustedMutationRequest(request))return intakeErrorReply('Cross-site requests are not allowed.',403,'rejected_before_write');
 try{const actor=await staff(),body=await readBoundedJsonObject(request),ctx=intakeCommand(body,actor.id,request),db=requireDatabase(env as unknown as {DB?:D1Database});
 if(!intakeId(body.caseId)||!intakeId(body.versionId))throw new CategoryContractError('Use the exact case and submitted version.',400);
 if(body.action==='triage'){closedIntakeFields(body,['action','requestId','expectedRevision','caseId','versionId','outcome','sellerMessage']);if(!['needs_information','reviewing'].includes(String(body.outcome))||typeof body.sellerMessage!=='string')throw new CategoryContractError('Explain the next step to the seller.',400);boundary.begin();return intakeReply(await triageProductIntake(db,ctx,{caseId:body.caseId,versionId:body.versionId,outcome:body.outcome as 'needs_information'|'reviewing',sellerMessage:body.sellerMessage}));}
 if(body.action==='propose'){closedIntakeFields(body,['action','requestId','expectedRevision','caseId','versionId','patch','sourceNote','replaceProposalId']);if(typeof body.sourceNote!=='string'||body.replaceProposalId!==undefined&&body.replaceProposalId!==null&&!intakeId(body.replaceProposalId))throw new CategoryContractError('Identify the actual source of these proposed facts.',400);boundary.begin();return intakeReply(await proposeProductIntakeChanges(db,ctx,{caseId:body.caseId,versionId:body.versionId,patch:body.patch,sourceNote:body.sourceNote,...(body.replaceProposalId!==undefined?{replaceProposalId:body.replaceProposalId as string|null}:{})}));}
 throw new CategoryContractError('Choose a supported assistance action.',400);
 }catch(error){return failure(error,boundary.phase);}
}
