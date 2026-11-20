import {env} from 'cloudflare:workers';
import {requireStaffApi,StaffAuthorizationError} from '@/lib/auth/staff';
import {requireDatabase} from '@/lib/db/d1';
import {readBoundedJsonObject} from '@/lib/http/form-json-body';
import {BodyTooLargeError} from '@/lib/http/bounded-body';
import {isTrustedMutationRequest} from '@/lib/http/request-security';
import {CompanyAccountError,getCompanyAccountWorkspace,saveCompanyAccountDraft,submitCompanyAccountForReview,verifyCompanyAccount,publishCompanyReceivingAccount,retireCompanyAccount,type CompanyAccountDetails} from '@/lib/payments/company-accounts';
const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
function failure(error:unknown){if(error instanceof CompanyAccountError||error instanceof StaffAuthorizationError)return reply({error:error.message},error.status);if(error instanceof BodyTooLargeError)return reply({error:error.message},413);if(error instanceof SyntaxError)return reply({error:'Invalid company account command.'},400);return reply({error:'The company account outcome could not be confirmed. Keep this request and retry it before starting another.'},503);}
export async function GET(){try{const staff=await requireStaffApi('business_settings.view');if(staff.role!=='super_admin')return reply({error:'Company banking evidence requires current Super Admin access.'},403);return reply(await getCompanyAccountWorkspace(requireDatabase(env as unknown as {DB?:D1Database}),staff.id));}catch(error){return failure(error);}}
export async function POST(request:Request){
 if(!isTrustedMutationRequest(request))return reply({error:'Cross-site requests are not allowed.'},403);
 try{
  const staff=await requireStaffApi('business_settings.manage');if(staff.role!=='super_admin')return reply({error:'An eligible Super Admin must manage company account versions.'},403);
  const body=await readBoundedJsonObject(request),actions:Record<string,string[]>={save_draft:['accountId','basedOnVersionId','details','evidenceReference','conflictUserIds'],submit:[],verify:['ownershipConfirmed','currencyConfirmed','verificationReference'],publish:['expectedReceivingRevision'],retire:[]};
  if(typeof body.action!=='string'||!Object.hasOwn(actions,body.action)||Object.keys(body).some(key=>!['action','requestId','expectedRevision','reason',...(body.action==='save_draft'?[]:['versionId']),...actions[body.action as string]].includes(key))||typeof body.requestId!=='string'||!/^[A-Za-z0-9_-]{8,160}$/.test(body.requestId)||!(body.expectedRevision===null||typeof body.expectedRevision==='string'&&/^\d{1,15}$/.test(body.expectedRevision))||typeof body.reason!=='string')throw new CompanyAccountError('Invalid company account command.',400);
  const context={actorId:staff.id,requestId:body.requestId,expectedRevision:body.expectedRevision,now:Date.now()},db=requireDatabase(env as unknown as {DB?:D1Database});
  if(body.action==='save_draft'){
   if(!(body.accountId===null||typeof body.accountId==='string'&&body.accountId.length<=160)||!(body.basedOnVersionId===null||typeof body.basedOnVersionId==='string'&&body.basedOnVersionId.length<=160)||typeof body.evidenceReference!=='string'||!Array.isArray(body.conflictUserIds))throw new CompanyAccountError('Invalid private account draft.',400);
   return reply({ok:true,result:await saveCompanyAccountDraft(db,context,{accountId:body.accountId,basedOnVersionId:body.basedOnVersionId,details:body.details as CompanyAccountDetails,evidenceReference:body.evidenceReference,conflictUserIds:body.conflictUserIds as string[],reason:body.reason})});
  }
  if(typeof body.versionId!=='string'||!/^[A-Za-z0-9_-]{1,160}$/.test(body.versionId))throw new CompanyAccountError('Select the exact current account version.',400);
  const input={versionId:body.versionId,reason:body.reason};
  if(body.action==='submit')await submitCompanyAccountForReview(db,context,input);
  else if(body.action==='verify')await verifyCompanyAccount(db,context,{...input,ownershipConfirmed:body.ownershipConfirmed===true,currencyConfirmed:body.currencyConfirmed===true,verificationReference:body.verificationReference as string});
  else if(body.action==='publish')await publishCompanyReceivingAccount(db,context,{...input,expectedReceivingRevision:body.expectedReceivingRevision as number});
  else await retireCompanyAccount(db,context,input);
  return reply({ok:true});
 }catch(error){return failure(error);}
}
