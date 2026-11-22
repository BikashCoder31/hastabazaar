import {productMutationBoundary,intakeErrorReply} from './intake-http';
import {readBoundedJsonObject} from '../http/form-json-body';
import {isTrustedMutationRequest} from '../http/request-security';
import {CategoryContractError} from './category-contracts';
import {closedIntakeFields,intakeCommand,intakeFailure,intakeId,intakeQuery,intakeReply,intakeActor} from './intake-http';
import {getProductConcern,listProductConcerns,reportProductConcern,triageProductConcern} from './priority-concerns';
export async function readProductConcernHttp(db:D1Database,actorId:string,request:Request,scope:'seller'|'admin'){
 try{intakeActor(request,actorId);const query=intakeQuery(request,['caseId','productId']);if(query.size!==1)throw new CategoryContractError('Choose one exact product or priority case.',400);const caseId=query.get('caseId'),productId=query.get('productId');if(!intakeId(caseId??productId))throw new CategoryContractError('Use a supported product or case reference.',400);const result=caseId?await getProductConcern(db,actorId,caseId):await listProductConcerns(db,actorId,productId!);if(result.staff!==(scope==='admin'))throw new CategoryContractError('Use the workspace matching your current relationship to this product.',403);return intakeReply(result);}catch(error){return intakeFailure(error);}
}
export async function writeProductConcernHttp(db:D1Database,actorId:string,request:Request,scope:'seller'|'admin'){
 const boundary=productMutationBoundary();
 if(!isTrustedMutationRequest(request))return intakeErrorReply('Cross-site requests are not allowed.',403,'rejected_before_write');try{const body=await readBoundedJsonObject(request),ctx=intakeCommand(body,actorId,request);
 if(body.action==='report'){
  closedIntakeFields(body,['action','requestId','expectedRevision','productId','kind','publicVersionId','note']);if(!intakeId(body.productId)||!['price_error','safety','misleading'].includes(String(body.kind))||!(body.publicVersionId===null||intakeId(body.publicVersionId))||typeof body.note!=='string')throw new CategoryContractError('Identify the current published product and the actual concern.',400);const source=await listProductConcerns(db,actorId,body.productId);if(source.staff!==(scope==='admin'))throw new CategoryContractError('Use the authorized owner or staff product workspace.',403);boundary.begin();return intakeReply(await reportProductConcern(db,ctx,{productId:body.productId,kind:body.kind as 'price_error'|'safety'|'misleading',publicVersionId:body.publicVersionId as string|null,note:body.note}));
 }
 if(body.action==='triage'&&scope==='admin'){
  closedIntakeFields(body,['action','requestId','expectedRevision','caseId','state','ownerId','backupId','backupUnavailableReason','coverageConfirmed','nextUpdateAt','note']);if(!intakeId(body.caseId)||!intakeId(body.ownerId)||!(body.backupId===null||intakeId(body.backupId))||!['open','waiting_seller','resolved'].includes(String(body.state))||typeof body.backupUnavailableReason!=='string'||body.coverageConfirmed!==true||!(body.nextUpdateAt===null||typeof body.nextUpdateAt==='number'&&Number.isSafeInteger(body.nextUpdateAt))||typeof body.note!=='string')throw new CategoryContractError('Record actual coverage, a next update and the specific finding.',400);boundary.begin();return intakeReply(await triageProductConcern(db,ctx,{caseId:body.caseId,state:body.state as 'open'|'waiting_seller'|'resolved',ownerId:body.ownerId,backupId:body.backupId as string|null,backupUnavailableReason:body.backupUnavailableReason,coverageConfirmed:true,nextUpdateAt:body.nextUpdateAt as number|null,note:body.note}));
 }
 throw new CategoryContractError('Choose a supported priority case action.',400);
 }catch(error){return intakeFailure(error,boundary.phase);}
}
