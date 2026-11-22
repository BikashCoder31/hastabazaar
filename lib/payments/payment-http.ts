import type {PaymentAttemptReference} from './claim-release-client';
import {claimReleaseHttp,claimReleasePrincipal,recheckClaimReleasePrincipal} from './claim-release-http';
import {ClaimReleaseAuthorityError,ClaimReleaseProofError} from './claim-release-authority';
import {ManualPaymentNotAppliedError} from './manual-receipts';
import {env} from 'cloudflare:workers';
import {requireExistingCustomerApi,CustomerAuthorizationError} from '../auth/customer';
import {StaffAuthorizationError} from '../auth/staff';
import {requireExistingStaffIntentApi,requireStaffIntentApi} from '../auth/staff-intent';
import {probeIncomingCommandOutcome,readIncomingCommandOutcome} from './incoming-command-outcomes';
import {requireDatabase,requireMediaBucket} from '../db/d1';
import {readBoundedJsonObject} from '../http/form-json-body';
import {BodyTooLargeError,readBoundedForm} from '../http/bounded-body';
import {isTrustedMutationRequest} from '../http/request-security';
import {hasActorIntentMismatch} from '../http/actor-intent';
import {getCustomerManualPayment,recordBankReceipt,allocateBankReceipt,reviewPaymentClaim,releasePaidManualOrder,closeExpiredBankOrder,ManualPaymentError,type BankReceiptInput,type AllocateReceiptInput} from './manual-receipts';
import {isIncomingAction} from './incoming-outcome-contract';
import {triagePaymentException} from './exception-review';
import {reconcileCodReceipt} from './cod-reconciliation';
import {recordCompanyCashReceipt} from './cash-receipts';
import {recordReceiptReversal} from './receipt-corrections';
import {getManualPaymentWorkspace} from './manual-payment-workspace';
import {uploadPaymentClaimFile,recoverPaymentClaimFile,readPaymentClaimFile} from './payment-claim-files';

const bindings=()=>env as unknown as {DB?:D1Database;MEDIA?:R2Bucket};
function financeActorIntent(request:Request,actorId:string){if(hasActorIntentMismatch(request,actorId))throw new StaffAuthorizationError('The signed-in account changed. Refresh this Finance view before using its retained fields.',403);}
const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store, max-age=0',Vary:'Cookie'}});
function failure(error:unknown){if(error instanceof Error&&error.message==='Request reference was already used for different command content.')return reply({error:error.message},409);if(error instanceof ManualPaymentError||error instanceof CustomerAuthorizationError||error instanceof StaffAuthorizationError)return reply({error:error.message},error.status);if(error instanceof BodyTooLargeError)return reply({error:'This request exceeds the allowed size.'},413);if(error instanceof SyntaxError||error instanceof TypeError)return reply({error:'The payment request is incomplete or invalid.'},400);return reply({error:'The outcome could not be confirmed. Keep this exact request and retry before starting another.'},503);}
function object(value:unknown):Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value))throw new ManualPaymentError('Use a complete payment command.',400);return value as Record<string,unknown>;}
function keys(value:Record<string,unknown>,allowed:readonly string[]){if(Object.keys(value).some(key=>!allowed.includes(key)))throw new ManualPaymentError('This command contains unsupported fields.',400);}
function command(body:Record<string,unknown>,actorId:string){if(typeof body.requestId!=='string'||!/^[A-Za-z0-9_-]{8,160}$/.test(body.requestId)||!(body.expectedRevision===null||typeof body.expectedRevision==='string'&&/^\d{1,12}$/.test(body.expectedRevision)))throw new ManualPaymentError('Use the original request reference and current revision.',400);return {actorId,requestId:body.requestId,expectedRevision:body.expectedRevision,now:Date.now()};}
export async function customerPaymentRead(_request:Request,orderId:string){try{const viewer=await requireExistingCustomerApi(),data=await getCustomerManualPayment(requireDatabase(bindings()),viewer.userId,orderId);return data?reply(data):reply({error:'This order has no manual bank payment instructions.'},404);}catch(error){return failure(error);}}
export async function customerPaymentClaim(request:Request,orderId:string){return claimReleaseHttp(request,orderId,'claim');}
export async function customerPaymentUpload(request:Request,orderId:string){
 if(!isTrustedMutationRequest(request))return reply({error:'Cross-site requests are not allowed.'},403);
 let reference:PaymentAttemptReference|undefined,principal:{actorId:string;authSubject:string}|undefined;
 try{
  principal=await claimReleasePrincipal(request,'upload');
  const form=await readBoundedForm(request,6*1024*1024);if([...form.keys()].some(key=>!['file','requestId'].includes(key))||(form.has('file')&&!(form.get('file') instanceof File))||typeof form.get('requestId')!=='string')throw new ManualPaymentError('Choose one PDF, JPG or PNG and keep its upload request reference.',400);
  const context={...command({requestId:form.get('requestId'),expectedRevision:null},principal.actorId),authSubject:principal.authSubject};reference={version:1,actorId:principal.actorId,sourceId:orderId,action:'upload',requestId:context.requestId};
  await recheckClaimReleasePrincipal(request,'upload',principal);
  const result=form.has('file')?await uploadPaymentClaimFile(requireDatabase(bindings()),requireMediaBucket(bindings()),context,orderId,form.get('file') as File):await recoverPaymentClaimFile(requireDatabase(bindings()),requireMediaBucket(bindings()),context,orderId);
  await recheckClaimReleasePrincipal(request,'upload',principal);return reply(result);
 }catch(caught){let error=caught;
  if(principal){try{await recheckClaimReleasePrincipal(request,'upload',principal);}catch(denial){error=denial;}}
  if(error instanceof ClaimReleaseAuthorityError||error instanceof ClaimReleaseProofError)return reply({error:error.message},error.status);
  if(reference&&error instanceof ManualPaymentNotAppliedError)return reply({error:error.message,notApplied:true,reference},error.status);
  return failure(error);
 }
}
export async function paymentFileRead(request:Request,fileId:string,mode:'customer'|'finance'){try{const actorId=mode==='customer'?(await requireExistingCustomerApi()).userId:(await requireExistingStaffIntentApi(request,'payment.receipt.verify')).id;return await readPaymentClaimFile(requireDatabase(bindings()),requireMediaBucket(bindings()),actorId,fileId,mode);}catch(error){return failure(error);}}
export async function financePaymentsRead(request:Request){try{
 const query=new URL(request.url).searchParams,viewer=await requireExistingStaffIntentApi(request,query.has('attempt')?'account.self.manage':'payment.receipt.verify');financeActorIntent(request,viewer.id);const db=requireDatabase(bindings());
 if(query.has('attempt')){const result=query.get('probe')==='1'?{recovery:await probeIncomingCommandOutcome(db,viewer.id,query.get('attempt')??'')}:{outcome:await readIncomingCommandOutcome(db,viewer.id,{version:1,actorId:viewer.id,requestId:query.get('attempt'),action:query.get('action'),sourceId:query.get('source')})};const current=await requireExistingStaffIntentApi(request,'account.self.manage');if(current.id!==viewer.id)throw new StaffAuthorizationError('Refresh the original Incoming view.',403);return reply(result);}
 const focus=query.has('parcel')||query.has('remittance')?{parcelId:query.get('parcel')??'',...(query.has('remittance')?{remittanceId:query.get('remittance')!}:{})}:undefined;
 const workspace=await getManualPaymentWorkspace(db,viewer.id,query.get('order'),focus);const current=await requireExistingStaffIntentApi(request,'payment.receipt.verify');if(current.id!==viewer.id)throw new StaffAuthorizationError('Refresh the original Incoming view.',403);return reply(workspace);
 }catch(error){return failure(error);}}
export async function financePaymentCommand(request:Request){if(!isTrustedMutationRequest(request))return reply({error:'Cross-site requests are not allowed.'},403);try{const displayed=await requireStaffIntentApi(request,'account.self.manage');const body=await readBoundedJsonObject(request);keys(body,['action','requestId','expectedRevision','input']);const action=body.action;if(!isIncomingAction(action))throw new ManualPaymentError('Choose a supported payment action.',400);const viewer=await (action==='triage_exception'?(async()=>{try{return await requireStaffIntentApi(request,'payment.receipt.verify',displayed.id);}catch(error){if(!(error instanceof StaffAuthorizationError)||error.status!==403)throw error;return requireStaffIntentApi(request,'order.manage',displayed.id);}})():requireStaffIntentApi(request,action==='release'?'order.manage':'payment.receipt.verify',displayed.id));financeActorIntent(request,viewer.id);const context=command(body,viewer.id),db=requireDatabase(bindings()),input=object(body.input);
 if(action==='triage_exception'){keys(input,['exceptionId','ownerId','backupId','waiting','nextUpdateAt','note']);return reply(await triagePaymentException(db,context,input as unknown as Parameters<typeof triagePaymentException>[2]));}
 if(action==='reconcile_cod'){keys(input,['jobId','receiptId','expectedReceiptRevision','amountPaisa','cashRecordId','deductions','evidenceReference','reason']);return reply(await reconcileCodReceipt(db,context,input as unknown as Parameters<typeof reconcileCodReceipt>[2]));}
 if(action==='record_cash'){keys(input,['handoverIdentity','collectorName','collectorUserId','custodyReference','amountPaisa','occurredAt','evidenceReference','actualHandoverConfirmed','reason']);return reply(await recordCompanyCashReceipt(db,context,input as unknown as Parameters<typeof recordCompanyCashReceipt>[2]));}
 if(action==='record_reversal'){keys(input,['receiptId','amountMinor','transactionIdentity','bankAt','evidenceReference','reason']);return reply(await recordReceiptReversal(db,context,input as unknown as Parameters<typeof recordReceiptReversal>[2]));}
 if(action==='record_bank'){keys(input,['accountVersionId','transactionIdentity','bankAt','amountMinor','currency','payerReference','payerUserId','evidenceReference','completedCreditConfirmed','conflictUserIds','reason']);return reply(await recordBankReceipt(db,context,input as unknown as BankReceiptInput));}
 if(action==='allocate'){keys(input,['receiptId','orderId','amountPaisa','expectedWindowRevision','matchingBasis','exceptionApproval','deferRelease']);return reply(await allocateBankReceipt(db,context,input as unknown as AllocateReceiptInput));}
 if(action==='close_expired'){keys(input,['orderId','reason']);return reply(await closeExpiredBankOrder(db,context,input as unknown as Parameters<typeof closeExpiredBankOrder>[2]));}
 if(action==='review_claim'){keys(input,['orderId','action','reason','expectedWindowRevision']);if(input.action==='withdrawn')throw new ManualPaymentError('Only the order owner can withdraw their claim.',403);return reply(await reviewPaymentClaim(db,context,input as unknown as Parameters<typeof reviewPaymentClaim>[2]));}
 keys(input,['orderId','reason']);return reply(await releasePaidManualOrder(db,context,input as unknown as Parameters<typeof releasePaidManualOrder>[2]));
 }catch(error){return failure(error);}}
