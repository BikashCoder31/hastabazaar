import {COMMISSION_NOTICE_MS,commissionFeeScheduleText} from './rates';
import {getRegisteredSellerTerms} from '../db/repositories/marketplace-settings';
import {resolveCommissionConsent} from '../db/repositories/commission-continuity-proof';
import {staffMutationGuard} from '../db/repositories/staff-mutation-guard';
import {commandReceipt,type CommandContext} from '../workflows/contracts';
import {digestFormRequest} from '../forms/submission';
import {operationalBusinessNotificationStatements} from '../operations/business-notifications';
import {checkoutCommitClock} from '../checkout/commit-policy-guards';
import {FRESH_PASSWORD_MS,type AccountSecurity,type SessionProof} from '../security/model';
import type {SecuritySnapshot} from '../security/store';
export const commonFeeKeys=['independent_seller_commission_bps','managed_sale_linked_platform_retention_bps'] as const;
const initialFeeAction='commission.common.initialized';
const noPriorPublication=`NOT EXISTS(SELECT 1 FROM business_setting_versions WHERE setting_key IN (?,?)
  AND (status IN ('published','cancelled') OR published_at IS NOT NULL OR published_by IS NOT NULL))
  AND NOT EXISTS(SELECT 1 FROM commission_rate_changes)
  AND NOT EXISTS(SELECT 1 FROM commission_common_policies)
  AND NOT EXISTS(SELECT 1 FROM audit_logs WHERE action IN ('commission.launch.initialized','${initialFeeAction}'))`;
export class FeePolicyError extends Error{constructor(message:string,readonly status=409){super(message);}}
class FeePermissionError extends FeePolicyError{constructor(message:string){super(message,403);}}
type Source={id:string;key:string;version:number;value:string;revision:number;effectiveFrom:number;effectiveUntil:number|null;publishedAt:number|null};
type Policy={id:string;registeredSettingId:string;managedSettingId:string;basisPoints:number;effectiveAt:number;publishedAt:number;reason:string;termsText:string;replacesId:string|null;cancelledAt:number|null;replacementId:string|null};
function guard(db:D1Database,predicate:string,values:unknown[]){const id=crypto.randomUUID();return [db.prepare(`INSERT INTO operation_transaction_guards(id,valid) SELECT ?,CASE WHEN ${predicate} THEN 1 ELSE 0 END`).bind(id,...values),db.prepare('DELETE FROM operation_transaction_guards WHERE id=?').bind(id)];}
const reasonText=(reason:string)=>{if(typeof reason!=='string'||reason.trim().length<10||reason.length>1000)throw new FeePolicyError('Describe the publication or replacement reason in 10–1,000 characters.',400);return reason.trim();};
export async function getCommonFeeState(db:D1Database,now:number){
 if(!Number.isSafeInteger(now)||now<0)throw new FeePolicyError('Use the authoritative policy time.',400);
 const rows=(await db.prepare('SELECT id,setting_key AS `key`,version,value_json AS value,revision,effective_from AS effectiveFrom,effective_until AS effectiveUntil,published_at AS publishedAt FROM business_setting_versions WHERE setting_key IN (?,?) AND status=\'published\' ORDER BY setting_key,effective_from,version').bind(...commonFeeKeys).all<Source>()).results.map(row=>({...row}));
 const maximums=(await db.prepare('SELECT setting_key AS `key`,MAX(version) AS version FROM business_setting_versions WHERE setting_key IN (?,?) GROUP BY setting_key ORDER BY setting_key').bind(...commonFeeKeys).all<{key:string;version:number}>()).results.map(row=>({...row}));
 const control=await db.prepare("SELECT revision FROM commission_control WHERE id='default'").first<{revision:number}>();if(!control)throw new FeePolicyError('The authoritative fee control is unavailable.',503);
 const history=(await db.prepare('SELECT p.id,p.registered_setting_id AS registeredSettingId,p.managed_setting_id AS managedSettingId,p.basis_points AS basisPoints,p.effective_at AS effectiveAt,p.published_at AS publishedAt,p.reason,p.terms_text AS termsText,p.replaces_id AS replacesId,c.created_at AS cancelledAt,c.replacement_id AS replacementId FROM commission_common_policies p LEFT JOIN commission_common_cancellations c ON c.policy_id=p.id ORDER BY p.published_at DESC,p.id DESC').all<Policy>()).results.map(row=>({...row}));
 const legacyFuture=(await db.prepare("SELECT r.id,r.basis_points AS basisPoints,r.effective_at AS effectiveAt FROM commission_rate_changes r LEFT JOIN commission_rate_cancellations c ON c.rate_id=r.id WHERE c.rate_id IS NULL AND (r.effective_at>? OR r.effective_at>COALESCE((SELECT MAX(effective_from) FROM business_setting_versions WHERE setting_key=? AND status='published' AND effective_from<=? AND (effective_until IS NULL OR effective_until>?)),-1)) ORDER BY r.effective_at").bind(now,commonFeeKeys[0],now,now).all<{id:string;basisPoints:number;effectiveAt:number}>()).results.map(row=>({...row}));
 const latest=(key:string)=>rows.filter(row=>row.key===key&&row.effectiveFrom<=now&&(row.effectiveUntil===null||row.effectiveUntil>now)).at(-1)??null,registered=latest(commonFeeKeys[0]),managed=latest(commonFeeKeys[1]),future=rows.filter(row=>row.effectiveFrom>now),upcoming=history.find(row=>row.cancelledAt===null&&row.effectiveAt>now&&future.some(source=>source.id===row.registeredSettingId)&&future.some(source=>source.id===row.managedSettingId))??null,issues:string[]=[];
 if(!registered||!managed)issues.push('Both actual current route settings are required; no rate is guessed.');if(registered&&managed&&(registered.value!==managed.value||registered.effectiveFrom!==managed.effectiveFrom))issues.push('The covered route rates or common start differ and require source reconciliation.');if(future.length>0&&(!upcoming||future.length!==2))issues.push('The future source versions do not form one reviewed common schedule.');if(upcoming&&future.some(row=>Number(row.value)!==upcoming.basisPoints||row.effectiveFrom!==upcoming.effectiveAt||row.publishedAt!==upcoming.publishedAt))issues.push('The future sources differ from the exact published common policy.');if(legacyFuture.length)issues.push('A separate legacy fee supplement requires reconciliation before a common publication.');
 const view=(row:Source|null)=>row?{versionId:row.id,basisPoints:Number(JSON.parse(row.value)),effectiveAt:row.effectiveFrom}:null;
 for(const row of rows)if(!/^\d+$/.test(row.value)||!Number.isInteger(Number(row.value))||Number(row.value)>10000)throw new FeePolicyError('A recorded fee value is invalid; staff must reconcile its source.',503);
 const initialPublicationAvailable=Boolean(await db.prepare('SELECT 1 WHERE '+noPriorPublication).bind(...commonFeeKeys).first());
 return {asOf:now,revision:control.revision,context:await digestFormRequest({rows,maximums,revision:control.revision,history,legacyFuture,initialPublicationAvailable}),current:{registered:view(registered),managed:view(managed)},upcoming,issues,history,sources:rows,maximums,legacyFuture,initialPublicationAvailable};
}

type InitialFeeVerification={
 authSubject:string;
 sessionHash:string;
 account:SecuritySnapshot<AccountSecurity>;
 proof:SecuritySnapshot<SessionProof>;
};

/** Record the first effective pair using the ordinary version tables. Future schedules keep their own notice clock. */
export async function publishInitialCommonFeePolicy(db:D1Database,ctx:CommandContext,input:{
 expectedContext:string;registeredBasisPoints:number;managedBasisPoints:number;reason:string;
},verification:InitialFeeVerification){
 const authority=await staffMutationGuard(db,ctx.actorId,'commercial_policy.manage',FeePermissionError,'super_admin');
 const reason=reasonText(input.reason);
 const {registeredBasisPoints,managedBasisPoints}=input;
 if(![registeredBasisPoints,managedBasisPoints].every(value=>Number.isInteger(value)&&value>=0&&value<=10000))
  throw new FeePolicyError('Enter both rates from 0 to 100%, with up to two decimal places.',400);
 if(registeredBasisPoints!==managedBasisPoints)
  throw new FeePolicyError('Both routes use the same selling fee. Enter matching percentages.',400);

 const source={action:initialFeeAction,subjectType:'commission_policy',subjectId:'initial',auditReason:reason};
 const receipt=await commandReceipt(db,ctx,source,{...input,reason});
 if(receipt.replayed)return receipt.result;
 const state=await getCommonFeeState(db,ctx.now);
 if(!state.initialPublicationAvailable)throw new FeePolicyError('Initial selling rates are already recorded or have a publication history.');
 if(state.context!==input.expectedContext)throw new FeePolicyError('The policy sources changed. Review both rates again.');

 const {authSubject,sessionHash,account,proof}=verification;
 const clock=checkoutCommitClock(db);
 const verifiedFrom=Math.max(proof.value.verifiedAt,proof.value.passwordVerifiedAt);
 const verifiedUntil=Math.min(proof.value.verifiedAt,proof.value.passwordVerifiedAt)+FRESH_PASSWORD_MS;
 const statements=[db.prepare("UPDATE commission_control SET revision=revision WHERE id='default'")];
 if((db as D1Database&{dialect?:string}).dialect==='mariadb')statements.push(
  db.prepare('SELECT id FROM users WHERE id=? FOR UPDATE').bind(ctx.actorId),
  db.prepare('SELECT role FROM user_roles WHERE user_id=? FOR UPDATE').bind(ctx.actorId),
  db.prepare('SELECT token_hash FROM user_sessions WHERE token_hash=? FOR UPDATE').bind(sessionHash),
  db.prepare('SELECT `key` FROM marketplace_settings WHERE `key` IN (?,?) ORDER BY `key` FOR UPDATE').bind(account.key,proof.key),
 );
 statements.push(...authority.statements,...guard(db,`${noPriorPublication}
  AND EXISTS(SELECT 1 FROM commission_control WHERE id='default' AND revision=?)
  AND ${clock} BETWEEN ? AND ?
  AND EXISTS(SELECT 1 FROM user_sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND HEX(u.id)=HEX(?) AND HEX(u.auth_subject)=HEX(?) AND s.expires_at>${clock})
  AND EXISTS(SELECT 1 FROM marketplace_settings WHERE \`key\`=? AND HEX(value)=HEX(?))
  AND EXISTS(SELECT 1 FROM marketplace_settings WHERE \`key\`=? AND HEX(value)=HEX(?))`,
 [...commonFeeKeys,state.revision,verifiedFrom,verifiedUntil,sessionHash,ctx.actorId,authSubject,account.key,account.raw,proof.key,proof.raw]));

 const registeredSettingId=crypto.randomUUID(),managedSettingId=crypto.randomUUID();
 for(const [index,key] of commonFeeKeys.entries()){
  const version=(state.maximums.find(row=>row.key===key)?.version??0)+1;
  statements.push(db.prepare(`INSERT INTO business_setting_versions(id,setting_key,version,value_json,status,revision,change_control,
    effective_from,reason,created_by,created_at,published_by,published_at,last_request_id)
    VALUES(?,?,?,?,'published',1,'controlled',?,?,?,?,?,?,?)`).bind(
   index===0?registeredSettingId:managedSettingId,key,version,String(index===0?registeredBasisPoints:managedBasisPoints),
   ctx.now,reason,ctx.actorId,ctx.now,ctx.actorId,ctx.now,ctx.requestId+':'+key,
  ));
 }
 const result={id:registeredSettingId,registeredSettingId,managedSettingId,registeredBasisPoints,managedBasisPoints,effectiveAt:ctx.now};
 statements.push(db.prepare("UPDATE commission_control SET revision=revision+1 WHERE id='default'"),receipt.insert(result));
 try{await db.batch(statements);}catch(error){
  const retry=await commandReceipt(db,ctx,source,{...input,reason});
  if(retry.replayed)return retry.result;
  if(/constraint|conflict|guard|duplicate/i.test(String(error)))
   throw new FeePolicyError('Your verification or the fee history changed. Review the current settings and try again.');
  throw new FeePolicyError('The outcome is uncertain. Retry the same reviewed publication.',503);
 }
 return result;
}

type FeeState=Awaited<ReturnType<typeof getCommonFeeState>>;
function sourceGuards(db:D1Database,state:FeeState){const statements=[db.prepare("UPDATE commission_control SET revision=revision WHERE id='default'"),...guard(db,"EXISTS(SELECT 1 FROM commission_control WHERE id='default' AND revision=?) AND (SELECT COUNT(*) FROM business_setting_versions WHERE setting_key IN (?,?) AND status='published')=?",[state.revision,...commonFeeKeys,state.sources.length])];for(const row of state.sources)statements.push(db.prepare('UPDATE business_setting_versions SET revision=revision WHERE id=?').bind(row.id),...guard(db,"EXISTS(SELECT 1 FROM business_setting_versions WHERE id=? AND status='published' AND revision=? AND HEX(value_json)=HEX(?) AND effective_from=? AND (effective_until=? OR (effective_until IS NULL AND ? IS NULL)))",[row.id,row.revision,row.value,row.effectiveFrom,row.effectiveUntil,row.effectiveUntil]));return statements;}
export async function publishCommonFeePolicy(db:D1Database,ctx:CommandContext,input:{expectedContext:string;basisPoints:number;effectiveAt:number;reason:string;replacesId:string|null}){
 const authority=await staffMutationGuard(db,ctx.actorId,'commercial_policy.manage',FeePermissionError,'super_admin'),reason=reasonText(input.reason),payload={...input,reason},source={action:'commission.common.published',subjectType:'commission_policy',subjectId:input.replacesId??'new'},receipt=await commandReceipt(db,ctx,source,payload);if(receipt.replayed)return receipt.result as {id:string;registeredSettingId:string;managedSettingId:string};
 if(!Number.isInteger(input.basisPoints)||input.basisPoints<0||input.basisPoints>10000||!Number.isSafeInteger(input.effectiveAt))throw new FeePolicyError('Use a valid rate and exact effective time.',400);if(input.effectiveAt<ctx.now+COMMISSION_NOTICE_MS)throw new FeePolicyError('Allow at least 15 full elapsed days from this publication. Confirm a later date explicitly.',400);
 const state=await getCommonFeeState(db,ctx.now);if(state.context!==input.expectedContext)throw new FeePolicyError('The policy preview changed. Keep your draft and review the current sources.');if(state.issues.length)throw new FeePolicyError(state.issues.join(' '));if(state.upcoming?input.replacesId!==state.upcoming.id:input.replacesId!==null)throw new FeePolicyError('Select the exact announced future policy for replacement.');
 const id=crypto.randomUUID(),registeredSettingId=crypto.randomUUID(),managedSettingId=crypto.randomUUID(),result={id,registeredSettingId,managedSettingId},old=state.upcoming,statements=[...authority.statements,...sourceGuards(db,state)];
 if(old){statements.push(...guard(db,'EXISTS(SELECT 1 FROM commission_common_policies p WHERE p.id=? AND p.effective_at>? AND NOT EXISTS(SELECT 1 FROM commission_common_cancellations c WHERE c.policy_id=p.id))',[old.id,ctx.now]));for(const versionId of [old.registeredSettingId,old.managedSettingId])statements.push(db.prepare("UPDATE business_setting_versions SET status='cancelled',revision=revision+1,decision_note=?,last_request_id=? WHERE id=? AND status='published' AND effective_from>?").bind(reason,ctx.requestId+':cancel:'+versionId,versionId,ctx.now));}
 for(const [index,key]of commonFeeKeys.entries()){const current=state.sources.find(row=>row.id===(index===0?state.current.registered!.versionId:state.current.managed!.versionId))!,version=(state.maximums.find(row=>row.key===key)?.version??0)+1,versionId=index===0?registeredSettingId:managedSettingId;statements.push(db.prepare('UPDATE business_setting_versions SET effective_until=? WHERE id=?').bind(input.effectiveAt,current.id),db.prepare("INSERT INTO business_setting_versions(id,setting_key,version,value_json,status,revision,change_control,effective_from,reason,created_by,created_at,published_by,published_at,supersedes_id,last_request_id) VALUES(?,?,?,?,'published',1,'controlled',?,?,?,?,?,?,?,?)").bind(versionId,key,version,String(input.basisPoints),input.effectiveAt,reason,ctx.actorId,ctx.now,ctx.actorId,ctx.now,old?(index===0?old.registeredSettingId:old.managedSettingId):current.id,ctx.requestId+':'+key));}
 statements.push(db.prepare('INSERT INTO commission_common_policies(id,registered_setting_id,managed_setting_id,basis_points,effective_at,published_at,published_by,reason,terms_text,replaces_id) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(id,registeredSettingId,managedSettingId,input.basisPoints,input.effectiveAt,ctx.now,ctx.actorId,reason,commissionFeeScheduleText(input.basisPoints,input.effectiveAt),old?.id??null));if(old)statements.push(db.prepare('INSERT INTO commission_common_cancellations(policy_id,replacement_id,actor_id,reason,created_at,event_id) VALUES(?,?,?,?,?,?)').bind(old.id,id,ctx.actorId,reason,ctx.now,old.id+'-cancelled'));statements.push(db.prepare("UPDATE commission_control SET revision=revision+1 WHERE id='default'"),receipt.insert(result));
 statements.push(...await operationalBusinessNotificationStatements(db,{kind:'fee.policy',sourceId:id,eventId:id,actorId:ctx.actorId,now:ctx.now,status:old?'replaced':'published',detail:`A ${input.basisPoints/100}% selling fee has one common start for both covered routes. Review the exact date, acceptance and follow-up ownership in Commission.`}));
 try{await db.batch(statements);}catch(error){const retry=await commandReceipt(db,ctx,source,payload);if(retry.replayed)return retry.result as typeof result;throw new FeePolicyError(/constraint|conflict|guard/i.test(String(error))?'The sources or permission changed; neither route was partially published.':'The outcome is uncertain. Retry this exact publication request.',/constraint|conflict|guard/i.test(String(error))?409:503);}return result;
}
export async function cancelCommonFeePolicy(db:D1Database,ctx:CommandContext,input:{policyId:string;expectedContext:string;reason:string}){
 const authority=await staffMutationGuard(db,ctx.actorId,'commercial_policy.manage',FeePermissionError,'super_admin'),reason=reasonText(input.reason),payload={...input,reason},source={action:'commission.common.cancelled',subjectType:'commission_policy',subjectId:input.policyId},receipt=await commandReceipt(db,ctx,source,payload);if(receipt.replayed)return receipt.result;
 const state=await getCommonFeeState(db,ctx.now),policy=state.upcoming;if(state.context!==input.expectedContext||!policy||policy.id!==input.policyId||state.issues.length)throw new FeePolicyError('Only the exact current future common schedule may be cancelled.');
 const statements=[...authority.statements,...sourceGuards(db,state)];for(const versionId of [policy.registeredSettingId,policy.managedSettingId])statements.push(db.prepare("UPDATE business_setting_versions SET status='cancelled',revision=revision+1,decision_note=?,last_request_id=? WHERE id=? AND effective_from>?").bind(reason,ctx.requestId+':'+versionId,versionId,ctx.now));for(const current of [state.current.registered!,state.current.managed!])statements.push(db.prepare('UPDATE business_setting_versions SET effective_until=NULL WHERE id=?').bind(current.versionId));statements.push(db.prepare('INSERT INTO commission_common_cancellations(policy_id,replacement_id,actor_id,reason,created_at,event_id) VALUES(?,NULL,?,?,?,?)').bind(policy.id,ctx.actorId,reason,ctx.now,policy.id+'-cancelled'),db.prepare("UPDATE commission_control SET revision=revision+1 WHERE id='default'"),receipt.insert({id:policy.id}));statements.push(...await operationalBusinessNotificationStatements(db,{kind:'fee.policy',sourceId:policy.id,eventId:policy.id+'-cancelled',actorId:ctx.actorId,now:ctx.now,status:'cancelled',detail:'Both future route versions were cancelled. Current terms remain in force; review retained acceptance history and current follow-up work.'}));try{await db.batch(statements);}catch{const retry=await commandReceipt(db,ctx,source,payload);if(retry.replayed)return retry.result;throw new FeePolicyError('Cancellation could not be confirmed. Retry the same request before changing it.',503);}return {id:policy.id};
}
export async function getRegisteredFeeOffers(db:D1Database,sellerId:string,now:number){
 const current=await getRegisteredSellerTerms(db,now),versions=(await db.prepare("SELECT effective_from AS at FROM business_setting_versions WHERE setting_key=? AND status='published' AND effective_from>? AND created_at<=? ORDER BY effective_from").bind(commonFeeKeys[0],now,now).all<{at:number}>()).results;
 const accepted=async(offer:typeof current)=>!!await db.prepare("SELECT 1 FROM seller_agreement_acceptance_history h JOIN seller_profiles s ON s.id=h.seller_id JOIN users u ON u.id=s.user_id WHERE h.seller_id=? AND h.accepted_by=s.user_id AND u.status='active' AND h.agreement_version=? AND h.commission_setting_version_id=? AND h.commission_bps=? AND h.accepted_at<=?").bind(sellerId,offer.agreementVersion,offer.versionId,offer.basisPoints,now).first()||!!await resolveCommissionConsent(db,sellerId,offer,now),upcoming:(typeof current & {accepted:boolean})[]=[];for(const row of versions){const offer=await getRegisteredSellerTerms(db,row.at);if(!upcoming.some(existing=>existing.versionId===offer.versionId))upcoming.push({...offer,accepted:await accepted(offer)});}return {current:{...current,accepted:await accepted(current)},upcoming};
}
export async function acceptRegisteredFeeOffer(db:D1Database,ctx:CommandContext,input:{sellerId:string;versionId:string;context:string;accepted:boolean}){
 if(input.accepted!==true)throw new FeePolicyError('Explicitly accept the exact displayed fee terms.',400);const owner="EXISTS(SELECT 1 FROM seller_profiles s JOIN users u ON u.id=s.user_id WHERE s.id=? AND u.id=? AND u.status='active' AND s.status IN ('submitted','under_review','approved') AND NOT EXISTS(SELECT 1 FROM seller_participation_profiles p WHERE p.seller_id=s.id AND p.participation_route='managed_maker') AND EXISTS(SELECT 1 FROM user_roles r WHERE r.user_id=u.id AND r.role IN ('customer','seller')))";if(!await db.prepare(`SELECT 1 WHERE ${owner}`).bind(input.sellerId,ctx.actorId).first())throw new FeePermissionError('Only the current seller owner may accept these terms.');
 const reconcile=async()=>{await(await import('./terms-followup')).reconcileSellerFeeCases(db,input.sellerId,ctx.now);};const source={action:'commission.common.accepted',subjectType:'seller',subjectId:input.sellerId},receipt=await commandReceipt(db,ctx,source,input);if(receipt.replayed){await reconcile();return receipt.result;}
 const version=await db.prepare("SELECT effective_from AS at FROM business_setting_versions WHERE id=? AND setting_key=? AND status='published' AND created_at<=?").bind(input.versionId,commonFeeKeys[0],ctx.now).first<{at:number}>();if(!version)throw new FeePolicyError('This fee offer was cancelled or replaced. Review the current terms.');const offer=await getRegisteredSellerTerms(db,Math.max(version.at,ctx.now));if(offer.versionId!==input.versionId||offer.context!==input.context)throw new FeePolicyError('Review the exact current or announced future terms before accepting.');
 const target=Math.max(version.at,ctx.now),statements=[db.prepare("UPDATE commission_control SET revision=revision WHERE id='default'"),db.prepare('/* seller-commission-lock */ SELECT id FROM seller_profiles WHERE user_id=? AND id=?').bind(ctx.actorId,input.sellerId),...guard(db,owner,[input.sellerId,ctx.actorId]),...guard(db,"EXISTS(SELECT 1 FROM business_setting_versions v WHERE v.id=? AND v.status='published' AND v.effective_from=? AND v.value_json=? AND (v.effective_until IS NULL OR v.effective_until>?) AND NOT EXISTS(SELECT 1 FROM business_setting_versions newer WHERE newer.setting_key=v.setting_key AND newer.status='published' AND newer.effective_from<=? AND (newer.effective_until IS NULL OR newer.effective_until>?) AND (newer.effective_from>v.effective_from OR (newer.effective_from=v.effective_from AND newer.version>v.version))))",[offer.versionId,version.at,String(offer.basisPoints),target,target,target]),db.prepare("INSERT INTO seller_agreement_acceptance_history(id,seller_id,agreement_version,language_presented,commission_setting_version_id,commission_bps,acceptance_request_id,accepted_by,accepted_at) VALUES(?,?,?,'en',?,?,?,?,?)").bind(crypto.randomUUID(),input.sellerId,offer.agreementVersion,offer.versionId,offer.basisPoints,ctx.requestId,ctx.actorId,ctx.now),receipt.insert({versionId:offer.versionId,acceptedAt:ctx.now})];
 await reconcile();statements.push(db.prepare("UPDATE commission_terms_cases SET revision=revision+1 WHERE seller_id=? AND source_version_id=? AND state='open'").bind(input.sellerId,offer.versionId));try{await db.batch(statements);}catch{const retry=await commandReceipt(db,ctx,source,input);if(retry.replayed){await reconcile();return retry.result;}throw new FeePolicyError('The offer, ownership or saved outcome changed. Retain this request and review its recorded outcome.');}await reconcile();return {versionId:offer.versionId,acceptedAt:ctx.now};
}
