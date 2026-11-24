import {staffMutationGuard} from '../db/repositories/staff-mutation-guard';
import {getBusinessSettingDefinition,parseBusinessSettingKey} from '../configuration/definitions';
import {businessSettingFormId} from '../db/repositories/business-settings';
export type CommercialOutcomeKind='waiver'|'promo'|'loyalty'|'referral'|'common-fee'|'business-setting';
export class CommercialOutcomeError extends Error{constructor(message:string,readonly status:400|403|409=403){super(message);}}
export interface CommercialOutcome{sourceId:string;action:string;recordedAt:number;requestId:string;kind:CommercialOutcomeKind;actorId:string;}
/** Original native own receipt only; no private request, answer or audit payload projection. */
export async function readCommercialOutcome(db:D1Database,actor:{id:string;authSubject:string},kind:CommercialOutcomeKind,attempt:string):Promise<CommercialOutcome|null>{
 if(!/^[A-Za-z0-9_-]{1,100}$/.test(attempt))throw new CommercialOutcomeError('Use the original saved action reference.',400);
 const hint=kind==='business-setting'?await db.prepare("SELECT actor_id AS actorId,action FROM audit_logs WHERE request_id=? AND HEX(request_id)=HEX(?) AND subject_type='business_setting' LIMIT 2").bind(attempt,attempt).all<{actorId:string;action:string}>():null;
 const approval=hint?.results.length===1&&hint.results[0].actorId===actor.id&&['business_setting.approved','business_setting.rejected'].includes(hint.results[0].action);
 const permission=kind==='business-setting'?(approval?'business_settings.approve':'business_settings.manage'):'commercial_policy.manage';
 const proof=await staffMutationGuard(db,actor.id,permission,CommercialOutcomeError);if(kind!=='business-setting'&&proof.role!=='super_admin')throw new CommercialOutcomeError('Current Super Admin commercial authority is required.');
 const identity=await db.prepare('SELECT auth_subject AS subject FROM users WHERE id=?').bind(actor.id).first<{subject:string}>();if(identity?.subject!==actor.authSubject)throw new CommercialOutcomeError('Current authenticated account is required.');
 let outcome:Omit<CommercialOutcome,'requestId'|'kind'|'actorId'>|null=null;
 if(kind==='waiver'){
  const row=await db.prepare(`SELECT request_id AS requestId,actor_id AS actorId,auth_subject AS authSubject,created_at AS recordedAt,response_json AS response FROM customer_fee_waiver_requests WHERE request_id=? AND HEX(request_id)=HEX(?)`).bind(attempt,attempt).first<{requestId:string;actorId:string;authSubject:string;recordedAt:number;response:string}>();
  if(row){if(row.actorId!==actor.id||row.authSubject!==actor.authSubject)throw new CommercialOutcomeError('This action belongs to its original actor.');if(row.requestId!==attempt)throw new CommercialOutcomeError('Use the exact original reference.',409);const result=JSON.parse(row.response) as {id?:unknown};if(typeof result.id!=='string'||!result.id||result.id.length>191||!await db.prepare('SELECT 1 FROM customer_fee_waiver_campaigns WHERE id=?').bind(result.id).first())throw new CommercialOutcomeError('The original source requires reconciliation.',409);outcome={sourceId:result.id,action:'customer.service-fee-waiver',recordedAt:row.recordedAt};}
 }else if(kind==='common-fee'){
  const rows=await db.prepare(`SELECT request_id AS requestId,actor_id AS actorId,action,created_at AS recordedAt,command_result_json AS response
   FROM audit_logs WHERE request_id=? AND HEX(request_id)=HEX(?) AND command_key IS NOT NULL AND action IN('commission.common.published','commission.common.cancelled','commission.common.initialized') LIMIT 2`).bind(attempt,attempt).all<{requestId:string;actorId:string;action:string;recordedAt:number;response:string}>();
  if(rows.results.length){
   const row=rows.results[0];
   if(rows.results.length!==1||row.actorId!==actor.id)throw new CommercialOutcomeError('This action belongs to its original actor.');
   if(row.requestId!==attempt)throw new CommercialOutcomeError('Use the exact original reference.',409);
   const result=JSON.parse(row.response) as {id?:unknown;managedSettingId?:unknown};
   if(typeof result.id!=='string'||!result.id||result.id.length>191)throw new CommercialOutcomeError('The original common policy requires reconciliation.',409);
   const source=row.action==='commission.common.initialized'
    ? typeof result.managedSettingId==='string'&&await db.prepare(`SELECT 1 FROM business_setting_versions registered JOIN business_setting_versions managed
      ON managed.id=? AND managed.setting_key='managed_sale_linked_platform_retention_bps'
      WHERE registered.id=? AND registered.setting_key='independent_seller_commission_bps'
      AND registered.published_at=? AND managed.published_at=?`).bind(result.managedSettingId,result.id,row.recordedAt,row.recordedAt).first()
    : await db.prepare('SELECT 1 FROM commission_common_policies WHERE id=?').bind(result.id).first();
   if(!source)throw new CommercialOutcomeError('The original common policy requires reconciliation.',409);
   outcome={sourceId:result.id,action:row.action,recordedAt:row.recordedAt};
  }
 }else if(kind==='business-setting'){
  const rows=await db.prepare(`SELECT l.actor_id AS actorId,l.action,l.created_at AS recordedAt,l.subject_id AS sourceId,v.setting_key AS settingKey,
   a.actor_id AS answerActor,a.subject_id AS answerSource,a.form_id AS answerForm,a.subject_type AS answerType FROM audit_logs l LEFT JOIN business_setting_versions v ON v.id=l.subject_id
   LEFT JOIN form_answer_sets a ON a.request_id=l.request_id AND HEX(a.request_id)=HEX(l.request_id)
   WHERE l.request_id=? AND HEX(l.request_id)=HEX(?) AND l.subject_type='business_setting' LIMIT 2`).bind(attempt,attempt).all<{actorId:string;action:string;recordedAt:number;sourceId:string;settingKey:string|null;answerActor:string|null;answerSource:string|null;answerForm:string|null;answerType:string|null}>();
  if(rows.results.length){const row=rows.results[0];if(rows.results.length!==1||row.actorId!==actor.id)throw new CommercialOutcomeError('This action belongs to its original actor.');if(!row.settingKey||!row.action.startsWith('business_setting.')||row.answerActor!==actor.id||row.answerSource!==row.sourceId||row.answerType!=='business_setting')throw new CommercialOutcomeError('The original setting receipt requires reconciliation.',409);const key=parseBusinessSettingKey(row.settingKey);try{businessSettingFormId(key,row.answerForm);}catch{throw new CommercialOutcomeError('The original setting form requires reconciliation.',409);}const definition=getBusinessSettingDefinition(key);if(proof.role!=='super_admin'&&definition.affectedSurfaces.includes('rider'))throw new CommercialOutcomeError('Current source authority is required.');outcome={sourceId:row.sourceId,action:row.action,recordedAt:row.recordedAt};}
 }else{
  const config={promo:{form:'staff.promo-code',subject:'promo_campaign',actions:['promo.draft','promo.publish','promo.pause']},loyalty:{form:'staff.loyalty-settings',subject:'loyalty_config',actions:['loyalty.draft','loyalty.publish','loyalty.pause','loyalty.cancel_schedule']},referral:{form:'staff.referral-settings',subject:'referral_campaign',actions:['referral.offer.updated']}}[kind];
  const rows=await db.prepare(`SELECT l.id,l.actor_id AS actorId,l.action,l.subject_type AS subjectType,l.subject_id AS sourceId,l.created_at AS recordedAt,
   a.actor_id AS answerActor,a.subject_type AS answerType,a.subject_id AS answerSource
   FROM audit_logs l LEFT JOIN form_answer_sets a ON a.request_id=l.request_id AND HEX(a.request_id)=HEX(l.request_id) AND a.form_id=? WHERE l.request_id=? AND HEX(l.request_id)=HEX(?) LIMIT 2`).bind(config.form,attempt,attempt).all<{id:string;actorId:string;action:string;subjectType:string;sourceId:string;recordedAt:number;answerActor:string|null;answerType:string|null;answerSource:string|null}>();
  if(rows.results.length){const row=rows.results[0];if(rows.results.length!==1||row.actorId!==actor.id)throw new CommercialOutcomeError('This action belongs to its original actor.');if(row.subjectType!==config.subject||!config.actions.includes(row.action)||row.answerActor!==actor.id||row.answerType!==row.subjectType||row.answerSource!==row.sourceId)throw new CommercialOutcomeError('The original command receipt requires reconciliation.',409);outcome={sourceId:row.sourceId,action:row.action,recordedAt:row.recordedAt};}
 }
 const final=await staffMutationGuard(db,actor.id,permission,CommercialOutcomeError);if(kind!=='business-setting'&&final.role!=='super_admin')throw new CommercialOutcomeError('Current Super Admin authority is required.');const identityGuard=crypto.randomUUID();await db.batch([...proof.statements,...final.statements,db.prepare("INSERT INTO staff_permission_guards(id,valid) SELECT ?,CASE WHEN EXISTS(SELECT 1 FROM users WHERE id=? AND HEX(id)=HEX(?) AND HEX(auth_subject)=HEX(?)) THEN 1 ELSE 0 END").bind(identityGuard,actor.id,actor.id,actor.authSubject),db.prepare('DELETE FROM staff_permission_guards WHERE id=?').bind(identityGuard)]);return outcome?{...outcome,requestId:attempt,kind,actorId:actor.id}:null;
}
