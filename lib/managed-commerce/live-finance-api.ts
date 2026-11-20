import {liveManagedEntitlementPartyAuthority} from './live-financial-parties';
import {staffMutationGuard} from '../db/repositories/staff-mutation-guard';
import {ManagedLiveFinancialError} from './live-billing';
import {getLiveManagedPayoutPartyAuthority,getLiveManagedFinanceSummary,getLiveManagedPayoutPreview,releaseLiveManagedEligibility,prepareLiveManagedPayout,cancelLiveManagedPayout} from './live-payout-operations';

export class LiveFinanceError extends Error {constructor(message:string,readonly status=409){super(message);}}
class LiveFinanceAuthorityError extends LiveFinanceError {constructor(message:string){super(message,403);}}
const reference=(value:unknown):value is string=>typeof value==='string'&&/^[A-Za-z0-9][A-Za-z0-9._:-]{2,190}$/.test(value);
type PartyScope={payoutId?:string;operation?:'prepare'|'release';originalEntitlementIds?:readonly string[]};
export interface LiveManagedFinanceReceipt{id:string;recordKind:'live';status?:string;released?:number;}
function originalReleaseScope(result:{released?:number;originalEntitlementIds?:string[]}):PartyScope{if(!Number.isSafeInteger(result.released)||Number(result.released)<0||Number(result.released)>0&&!Array.isArray(result.originalEntitlementIds))throw new LiveFinanceError('The original eligibility receipt needs source review.');return {originalEntitlementIds:result.originalEntitlementIds??[]};}
async function authority(db:D1Database,actorId:string,sellerId:string,scope:PartyScope={},now=Date.now()){
 const staff=await staffMutationGuard(db,actorId,'payout.prepare',LiveFinanceAuthorityError,'super_admin');
 const parties=scope.originalEntitlementIds?await liveManagedEntitlementPartyAuthority(db,{sellerId,actorId,entitlementIds:scope.originalEntitlementIds}):await getLiveManagedPayoutPartyAuthority(db,{sellerId,actorId,...scope},now);
 return [...staff.statements,...parties.guards];
}
export async function readLiveManagedFinance(db:D1Database,actorId:string,sellerId:string,now:number){
 const guards=await authority(db,actorId,sellerId,{},now);
 const [summary,preview,payments]=await Promise.all([getLiveManagedFinanceSummary(db,sellerId,now),getLiveManagedPayoutPreview(db,sellerId,now),db.prepare(`SELECT p.id,p.payout_number number,p.amount_paisa amountPaisa,p.status,p.scheduled_for scheduledFor,p.updated_at updatedAt,p.destination_reference destination,
 CASE WHEN p.status IN('prepared','approved') AND p.paid_at IS NULL AND p.provider_reference IS NULL AND NOT EXISTS(SELECT 1 FROM payout_transfer_packets packet WHERE packet.managed_payout_id=p.id AND packet.state NOT IN('void','failed')) AND NOT EXISTS(SELECT 1 FROM seller_payout_review_blocks block WHERE block.payout_model='managed' AND block.payout_id=p.id) THEN 1 ELSE 0 END canCancel
 FROM managed_payouts p WHERE p.seller_id=? AND p.record_kind='live' ORDER BY p.created_at DESC,p.id DESC LIMIT 50`).bind(sellerId).all<{id:string;number:string;amountPaisa:number;status:string;scheduledFor:number;updatedAt:number;destination:string;canCancel:number}>()]);
 await db.batch(guards);
 return {sellerId,asOf:now,recordKind:'live' as const,summary,preview,payments:payments.results.map(row=>({...row,canCancel:Boolean(row.canCancel)})),executionHref:'/admin/payments/payouts'};
}
export type LiveManagedFinanceSnapshot=Awaited<ReturnType<typeof readLiveManagedFinance>>;
type Action='release'|'prepare'|'cancel';
export function parseLiveManagedFinanceCommand(body:Record<string,unknown>){
 const fields={release:['reason'],prepare:['reason','scheduledFor','expectedAmountPaisa','expectedSnapshot'],cancel:['reason','payoutId']} as const;
 if(body.sourceFormId!=='system.managed-live-finance'||typeof body.action!=='string'||!Object.hasOwn(fields,body.action)||!reference(body.requestId)||Object.keys(body).some(key=>!['sourceFormId','action','requestId','expectedRevision','input'].includes(key))||!body.input||typeof body.input!=='object'||Array.isArray(body.input))throw new LiveFinanceError('Use the protected actual maker payment form.',400);
 const action=body.action as Action,input=body.input as Record<string,unknown>,allowed:readonly string[]=fields[action];
 if(Object.keys(input).length!==allowed.length||Object.keys(input).some(key=>!allowed.includes(key))||typeof input.reason!=='string'||input.reason.trim().length<10||input.reason.length>1000)throw new LiveFinanceError('Review the exact actual payment fields and reason.',400);
 if(action==='cancel'){if(!reference(input.payoutId)||typeof body.expectedRevision!=='string'||!/^\d{1,16}$/.test(body.expectedRevision)||!Number.isSafeInteger(Number(body.expectedRevision)))throw new LiveFinanceError('Reload the exact unsent payment revision.',400);}
 else if(body.expectedRevision!==null)throw new LiveFinanceError('Use a fresh original-source balance review.',400);
 if(action==='prepare'&&(!Number.isSafeInteger(input.scheduledFor)||Number(input.scheduledFor)<0||!Number.isSafeInteger(input.expectedAmountPaisa)||Number(input.expectedAmountPaisa)<=0||typeof input.expectedSnapshot!=='string'||!/^[a-f0-9]{64}$/.test(input.expectedSnapshot)))throw new LiveFinanceError('Review the current exact live balance and processing date.',400);
 return {action,input,requestId:body.requestId,expectedRevision:body.expectedRevision as string|null};
}
export async function runLiveManagedFinanceAction(db:D1Database,actorId:string,sellerId:string,body:Record<string,unknown>):Promise<LiveManagedFinanceReceipt>{
 const parsed=parseLiveManagedFinanceCommand(body),ctx={actorId,requestId:parsed.requestId,expectedRevision:parsed.expectedRevision,now:Date.now()};
 const saved=parsed.action!=='cancel'?await db.prepare("SELECT command_result_json result FROM audit_logs WHERE actor_id=? AND request_id=? AND action=? AND subject_type='seller' AND subject_id=? AND command_key IS NOT NULL").bind(actorId,parsed.requestId,parsed.action==='prepare'?'managed.live.payout.prepared':'managed.live.eligibility.released',sellerId).first<{result:string}>():null;
 const scope=parsed.action==='cancel'?{payoutId:String(parsed.input.payoutId)}:saved?(parsed.action==='prepare'?{payoutId:String((JSON.parse(saved.result) as {id:string}).id)}:originalReleaseScope(JSON.parse(saved.result))):{operation:parsed.action==='release'?'release' as const:'prepare' as const};
 const guards=await authority(db,actorId,sellerId,scope,ctx.now);
 const guarded=Object.assign(Object.create(db),{prepare:db.prepare.bind(db),async batch(statements:D1PreparedStatement[]){return db.batch([...guards,...statements,...guards]);}}) as D1Database;
 try{
  if(parsed.action==='release'){const result=await releaseLiveManagedEligibility(guarded,ctx,{sellerId,reason:String(parsed.input.reason)});return {id:sellerId,recordKind:'live' as const,...result};}
  if(parsed.action==='prepare')return await prepareLiveManagedPayout(guarded,ctx,{sellerId,...parsed.input} as Parameters<typeof prepareLiveManagedPayout>[2]);
  if(!await db.prepare("SELECT 1 FROM managed_payouts WHERE id=? AND seller_id=? AND record_kind='live'").bind(parsed.input.payoutId,sellerId).first())throw new LiveFinanceError('Open this maker’s own actual payment.',404);
  return {...await cancelLiveManagedPayout(guarded,ctx,parsed.input as Parameters<typeof cancelLiveManagedPayout>[2]),recordKind:'live' as const};
 }catch(error){await authority(db,actorId,sellerId,scope);if(error instanceof Error&&error.message==='Request reference was already used for different command content.')throw new LiveFinanceError(error.message,409);throw error;}
}
export async function recoverLiveManagedFinanceAction(db:D1Database,actorId:string,sellerId:string,requestId:string):Promise<LiveManagedFinanceReceipt|null>{
 if(!reference(requestId))throw new LiveFinanceError('Use the original protected action reference.',400);
 const staff=await staffMutationGuard(db,actorId,'payout.prepare',LiveFinanceAuthorityError,'super_admin');
 const saved=await db.prepare(`SELECT action,subject_type subjectType,subject_id subjectId,command_result_json result FROM audit_logs WHERE actor_id=? AND request_id=? AND command_key IS NOT NULL AND action IN('managed.live.eligibility.released','managed.live.payout.prepared','managed.live.payout.cancelled')`).bind(actorId,requestId).first<{action:string;subjectType:string;subjectId:string;result:string}>();
 if(!saved){await db.batch(await authority(db,actorId,sellerId,{originalEntitlementIds:[]}));return null;}
 if(saved.subjectType==='seller'&&saved.subjectId!==sellerId||saved.subjectType==='managed_payout'&&!await db.prepare("SELECT 1 FROM managed_payouts WHERE id=? AND seller_id=? AND record_kind='live'").bind(saved.subjectId,sellerId).first()){await db.batch(staff.statements);return null;}
 const result=JSON.parse(saved.result) as {id?:string;released?:number;status?:string;originalEntitlementIds?:string[]};
 const release=saved.action==='managed.live.eligibility.released';
 const scope=release?originalReleaseScope(result):{payoutId:result.id??saved.subjectId};
 await db.batch(await authority(db,actorId,sellerId,scope));
 if(release)return {id:sellerId,recordKind:'live',released:result.released};
 return {id:result.id??saved.subjectId,recordKind:'live',...(saved.action==='managed.live.payout.cancelled'?{status:result.status}:{})};
}
export {ManagedLiveFinancialError};
