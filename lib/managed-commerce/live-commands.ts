import {activateManagedMakerLive} from './live-activation';
import {getManagedClearanceScope,reviewManagedClearance,revokeManagedClearance,type ManagedClearanceReviewInput} from './live-clearance';
import {recordManagedLiveFinancialScope} from './live-billing';
import {managedLiveAuthority,ManagedLiveError} from './live-activation-support';
import {staffMutationGuard} from '../db/repositories/staff-mutation-guard';
import {companyDetails} from '../content/company-details';

export const MANAGED_LIVE_FORM_ID='system.managed-live-activation';
const fields={
 activate:['readinessDigest','clearanceId','reason'],
 review_clearance:['scopeDigest','evidenceIds','financialScopeId','issuerModel','issuerScopeDigest','issuer','externalReference','issuedAt','effectiveFrom','validUntil','externalAuthenticityConfirmed','supplierRegistrationTaxAssessmentConfirmed','invoiceIssuerConfirmed','payoutBeneficiaryConfirmed','reason'],
 revoke_clearance:['clearanceId','reason'],
 financial_scope:['companyScopeDigest','issuerModel','taxMode','seriesPrefix','seriesVersion','openingNumber','evidenceReference','reason'],
} as const;
type Action=keyof typeof fields;
const reference=(value:unknown):value is string=>typeof value==='string'&&/^[A-Za-z0-9][A-Za-z0-9._:-]{2,190}$/.test(value);
const integer=(value:unknown):value is number=>typeof value==='number'&&Number.isSafeInteger(value)&&value>0;
function invalid():never{throw new ManagedLiveError('Use the current protected live-readiness form and its exact evidence fields.',400);}
export function parseManagedLiveCommand(body:Record<string,unknown>){
 if(body.sourceFormId!==MANAGED_LIVE_FORM_ID||typeof body.action!=='string'||!Object.hasOwn(fields,body.action)||!reference(body.requestId)||Object.keys(body).some(key=>!['sourceFormId','action','requestId','expectedRevision','input'].includes(key))||!body.input||typeof body.input!=='object'||Array.isArray(body.input))invalid();
 const action=body.action as Action,input=body.input as Record<string,unknown>,allowed:readonly string[]=fields[action];
 if(Object.keys(input).length!==allowed.length||Object.keys(input).some(key=>!allowed.includes(key)))invalid();
 if(action==='activate'||action==='revoke_clearance'){
  if(typeof body.expectedRevision!=='string'||!/^(0|[1-9]\d{0,15})$/.test(body.expectedRevision)||!Number.isSafeInteger(Number(body.expectedRevision)))invalid();
 }else if(body.expectedRevision!==null)invalid();
 for(const [key,value]of Object.entries(input)){
  if(key==='evidenceIds'){if(!Array.isArray(value)||!value.length||value.length>10||value.some(id=>!reference(id))||new Set(value).size!==value.length)invalid();}
  else if(key.endsWith('Confirmed')){if(typeof value!=='boolean')invalid();}
  else if(['issuedAt','effectiveFrom','openingNumber'].includes(key)){if(!integer(value))invalid();}
  else if(key==='validUntil'){if(value!==null&&!integer(value))invalid();}
  else if(typeof value!=='string'||!value.trim()||value.length>1500)invalid();
 }
 if(['scopeDigest','readinessDigest','issuerScopeDigest','companyScopeDigest'].some(key=>key in input&&!/^[a-f0-9]{64}$/.test(String(input[key]))))invalid();
 if('issuerModel'in input&&input.issuerModel!=='company_commercial_invoice_v1'||'taxMode'in input&&input.taxMode!=='PAN')invalid();
 return {action,input,requestId:body.requestId as string,expectedRevision:body.expectedRevision as string|null};
}
export async function runManagedLiveCommand(db:D1Database,actorId:string,sellerId:string,body:Record<string,unknown>){
 const command=parseManagedLiveCommand(body),authority=await managedLiveAuthority(db,actorId,sellerId),ctx={actorId,requestId:command.requestId,expectedRevision:command.expectedRevision,now:Date.now()},input=command.input;
 await db.batch(authority);
 if(command.action==='activate')return activateManagedMakerLive(db,ctx,{sellerId,...input} as Parameters<typeof activateManagedMakerLive>[2]);
 if(command.action==='review_clearance')return reviewManagedClearance(db,ctx,{sellerId,...input} as unknown as ManagedClearanceReviewInput);
 if(command.action==='revoke_clearance'){
  const source=await db.prepare('SELECT 1 FROM managed_live_clearances WHERE id=? AND seller_id=?').bind(input.clearanceId,sellerId).first();
  if(!source)throw new ManagedLiveError('Open this seller’s own retained clearance.',404);
  return revokeManagedClearance(db,ctx,input as Parameters<typeof revokeManagedClearance>[2]);
 }
 const scope=await getManagedClearanceScope(db,sellerId,ctx.now);
 if(scope.companyScopeDigest!==input.companyScopeDigest)throw new ManagedLiveError('The company identity changed. Refresh the actual issuer review.');
 return recordManagedLiveFinancialScope(db,ctx,{companyEntityReference:scope.companyEntityReference,companyScopeDigest:scope.companyScopeDigest,issuerModel:'company_commercial_invoice_v1',issuer:{legalName:companyDetails.legalName,taxMode:String(input.taxMode),taxRegistrationNumber:companyDetails.pan,address:companyDetails.registeredOffice,phone:scope.currentOffer.snapshot.companyAccount.contactPhone},seriesPrefix:String(input.seriesPrefix),seriesVersion:String(input.seriesVersion),openingNumber:Number(input.openingNumber),evidenceReference:String(input.evidenceReference),reason:String(input.reason)});
}
class LiveReadAuthorityError extends ManagedLiveError{constructor(message:string){super(message,403);}}
export async function recoverManagedLiveCommand(db:D1Database,actorId:string,sellerId:string,attempt:string){
 if(!reference(attempt))invalid();
 const authority=await managedLiveAuthority(db,actorId,sellerId);
 const saved=await db.prepare("SELECT action,subject_id subjectId,command_result_json result FROM audit_logs WHERE actor_id=? AND request_id=? AND command_key IS NOT NULL AND action IN('managed_maker.live.activated','managed_maker.live.clearance_reviewed','managed_maker.live.clearance_revoked','managed.live.financial_scope.recorded')").bind(actorId,attempt).first<{action:string;subjectId:string;result:string}>();
 if(!saved){await db.batch(authority);return null;}
 if(saved.action==='managed.live.financial_scope.recorded'){
  const finance=await staffMutationGuard(db,actorId,'business_settings.approve',LiveReadAuthorityError,'super_admin');authority.push(...finance.statements);
 }else if(saved.subjectId!==sellerId)return null;
 await db.batch(authority);
 return JSON.parse(saved.result) as {id:string;revision?:number};
}
export async function resolveManagedLiveNotice(db:D1Database,actorId:string,decisionId:string){
 if(!reference(decisionId))throw new ManagedLiveError('Open a retained live decision.',404);
 const row=await db.prepare('SELECT seller_id sellerId FROM managed_live_activation_decisions WHERE id=?').bind(decisionId).first<{sellerId:string}>();
 if(!row)throw new ManagedLiveError('The live decision is unavailable.',404);
 await db.batch(await managedLiveAuthority(db,actorId,row.sellerId));
 return row.sellerId;
}
