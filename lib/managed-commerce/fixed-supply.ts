import type { RuntimeEnvironment } from '@/lib/staging/environment';
import { assertSimulationAllowed, SIMULATED_RECORD_LABEL } from '@/lib/staging/environment';
import { buildFormAnswerInsert } from '@/lib/db/repositories/form-answers';
import type { FormAnswerSnapshot } from '@/lib/forms/types';
import { digestFormRequest, formRequestReplay, FormRequestConflictError } from '@/lib/forms/submission';
import { decisionFormReplay } from './form-replay';
import { staffMutationGuard } from '@/lib/db/repositories/staff-mutation-guard';

export class FixedSupplyError extends Error {}

function text(label:string,value:string,min=3,max=191){const normalized=value.trim();if(normalized.length<min||normalized.length>max)throw new RangeError(`${label} must contain ${min}–${max} characters.`);return normalized;}
function money(label:string,value:number){if(!Number.isSafeInteger(value)||value<=0)throw new RangeError(`${label} must be positive whole paisa.`);return value;}
function quantity(value:number){if(!Number.isSafeInteger(value)||value<=0||value>100_000)throw new RangeError('Supply quantity must be from 1 through 100,000.');return value;}

export async function createFixedSupplyRecord(database:D1Database,options:{sellerId:string;productId:string;quantity:number;agreedUnitPaisa:number;createdBy:string;agreementVersion:string;agreementLanguage:'en'|'ne';payoutBeneficiaryReference:string;requestId:string;now:number;environment:RuntimeEnvironment;form?:{requestId:string;versionId:string;answers:FormAnswerSnapshot}}):Promise<string>{
 assertSimulationAllowed(options.environment);
 const catalogDigest=options.form?await digestFormRequest({sellerId:options.sellerId,productId:options.productId,
  quantity:options.quantity,agreedUnitPaisa:options.agreedUnitPaisa,agreementVersion:options.agreementVersion,
  agreementLanguage:options.agreementLanguage,payoutBeneficiaryReference:options.payoutBeneficiaryReference,
  versionId:options.form.versionId,answers:options.form.answers}):null;
 const replay=async()=>{
  const subject=await formRequestReplay(database,{formId:'seller.managed-supply-proposal',requestId:options.requestId,
   actorId:options.createdBy,action:'seller.managed_supply.proposed',digest:catalogDigest!});
  if(!subject)return null;
  const owned=await database.prepare(`SELECT 1 FROM managed_supply_records WHERE id=? AND seller_id=? AND created_by=? AND proposal_request_id=? LIMIT 1`)
   .bind(subject,options.sellerId,options.createdBy,options.requestId).first();
  if(!owned)throw new FormRequestConflictError('Request reference is already used for another supply.');
  return subject;
 };
 if(options.form){const prior=await replay();if(prior)return prior;}
 const existing=await database.prepare('SELECT id FROM managed_supply_records WHERE proposal_request_id=?').bind(options.requestId).first<{id:string}>();
 if(existing){if(options.form)throw new FormRequestConflictError('Request reference is already used.');return existing.id;}
 const eligibility=await database.prepare(`SELECT 1 FROM products JOIN seller_profiles ON seller_profiles.id=products.seller_id JOIN seller_participation_profiles participation ON participation.seller_id=seller_profiles.id
  WHERE products.id=? AND seller_profiles.id=? AND seller_profiles.user_id=? AND participation.participation_route='managed_maker' AND participation.application_stage='active' AND participation.commercial_model='managed_fixed_supplier_price_v1' LIMIT 1`).bind(options.productId,options.sellerId,options.createdBy).first();
 if(!eligibility)throw new FixedSupplyError('Only the active fixed-price Managed Maker may propose this supply.');
 const id=crypto.randomUUID();const insert=database.prepare(`INSERT INTO managed_supply_records(id,seller_id,product_id,quantity_proposed,quantity_accepted,agreed_unit_paisa,accepted_total_paisa,status,possession_status,quality_status,ownership_record_status,risk_record_status,evidence_reference,agreement_version,agreement_language,payout_beneficiary_reference,simulation_label,created_by,decided_by,decision_reason,proposal_request_id,decision_request_id,created_at,decided_at)
  VALUES (?,?,?,?,NULL,?,NULL,'proposed','not_received','not_inspected','not_recorded','not_recorded',NULL,?,?,?,?,?,NULL,NULL,?,NULL,?,NULL)`).bind(id,options.sellerId,options.productId,quantity(options.quantity),money('Agreed supplier unit amount',options.agreedUnitPaisa),text('Agreement version',options.agreementVersion),options.agreementLanguage,text('Payout beneficiary reference',options.payoutBeneficiaryReference),SIMULATED_RECORD_LABEL,options.createdBy,text('Request ID',options.requestId,1,191),options.now);
 if(!options.form){await insert.run();return id;}
 try{await database.batch([insert,database.prepare(`INSERT INTO audit_logs(id,actor_id,action,subject_type,subject_id,reason,next_json,request_id,created_at)
  VALUES (?,?,'seller.managed_supply.proposed','managed_supply',?,'Simulated documented supply proposal',?,?,?)`)
  .bind(crypto.randomUUID(),options.createdBy,id,JSON.stringify({catalogDigest}),options.requestId,options.now),
  buildFormAnswerInsert(database,{formId:'seller.managed-supply-proposal',requestId:options.requestId,
   versionId:options.form.versionId,subjectType:'managed_supply',subjectId:id,actorId:options.createdBy,
   answers:options.form.answers,now:options.now})]);}
 catch(error){const prior=await replay();if(prior)return prior;throw error;}
 return id;
}

export async function decideFixedSupplyRecord(database:D1Database,options:{recordId:string;actorId:string;action:'accept'|'reject'|'cancel';quantityAccepted:number;possessionStatus:'not_received'|'received'|'returned';qualityStatus:'not_inspected'|'accepted'|'rejected';ownershipRecordStatus:'not_recorded'|'simulated_terms_recorded';riskRecordStatus:'not_recorded'|'simulated_terms_recorded';evidenceReference:string;reason:string;requestId:string;now:number;environment:RuntimeEnvironment;form?:{requestId:string;versionId:string;answers:FormAnswerSnapshot}}):Promise<void>{
 assertSimulationAllowed(options.environment);
 const authority=options.form?await staffMutationGuard(database,options.actorId,'seller.application.review',FixedSupplyError,'super_admin'):null;
 const catalogDigest=options.form?await digestFormRequest({recordId:options.recordId,action:options.action,quantityAccepted:options.quantityAccepted,possessionStatus:options.possessionStatus,qualityStatus:options.qualityStatus,ownershipRecordStatus:options.ownershipRecordStatus,riskRecordStatus:options.riskRecordStatus,evidenceReference:options.evidenceReference,reason:options.reason,versionId:options.form.versionId,answers:options.form.answers}):null;
 if(options.form){if(await decisionFormReplay(database,{formId:'staff.managed-supply-decision',requestId:options.requestId,actorId:options.actorId,action:`managed_supply.${options.action}`,subjectType:'managed_supply',subjectId:options.recordId,versionId:options.form.versionId,digest:catalogDigest!}))return;}
 else if(await database.prepare('SELECT 1 FROM managed_supply_records WHERE decision_request_id=?').bind(options.requestId).first())return;
 const row=await database.prepare(`SELECT r.status,r.quantity_proposed AS quantityProposed,r.agreed_unit_paisa AS unitPaisa,r.created_by AS createdBy,r.seller_id AS sellerId,r.agreement_version AS agreementVersion,r.agreement_language AS agreementLanguage,r.payout_beneficiary_reference AS beneficiary,
  EXISTS(SELECT 1 FROM users JOIN user_roles ON user_roles.user_id=users.id WHERE users.id=? AND users.status='active' AND user_roles.role='super_admin') AS authorized FROM managed_supply_records r WHERE r.id=?`).bind(options.actorId,options.recordId).first<{status:string;quantityProposed:number;unitPaisa:number;createdBy:string;sellerId:string;agreementVersion:string;agreementLanguage:'en'|'ne';beneficiary:string;authorized:number}>();
 if(!row||row.status!=='proposed')throw new FixedSupplyError('Only a current proposed supply can be decided.');if(!row.authorized||row.createdBy===options.actorId)throw new FixedSupplyError('A different active Super Admin must record the supply decision.');
 const reason=text('Decision reason',options.reason,10,1000),evidence=text('Evidence reference',options.evidenceReference,3,191);
 if(options.action==='accept'&&(options.quantityAccepted<1||options.quantityAccepted>row.quantityProposed||options.possessionStatus!=='received'||options.qualityStatus!=='accepted'))throw new FixedSupplyError('Acceptance requires received possession, accepted quality, and a valid accepted quantity.');
 if(options.action!=='accept'&&options.quantityAccepted!==0)throw new FixedSupplyError('Rejected or cancelled supply cannot record an accepted quantity.');
 const accepted=options.action==='accept',total=accepted?Number(row.unitPaisa)*options.quantityAccepted:null;if(total!==null&&!Number.isSafeInteger(total))throw new FixedSupplyError('Accepted supplier amount exceeds the safe money range.');
 const statements:D1PreparedStatement[]=[database.prepare(`UPDATE managed_supply_records SET quantity_accepted=?,accepted_total_paisa=?,status=?,possession_status=?,quality_status=?,ownership_record_status=?,risk_record_status=?,evidence_reference=?,decided_by=?,decision_reason=?,decision_request_id=?,decided_at=? WHERE id=? AND status='proposed'`).bind(accepted?options.quantityAccepted:0,total,accepted?'accepted':options.action==='reject'?'rejected':'cancelled',options.possessionStatus,options.qualityStatus,options.ownershipRecordStatus,options.riskRecordStatus,evidence,options.actorId,reason,options.requestId,options.now,options.recordId)];
 if(accepted)statements.push(database.prepare(`INSERT INTO managed_supplier_obligations(id,seller_id,original_amount_paisa,payout_beneficiary_reference,agreement_version,agreement_language,status,owed_at,eligible_at,created_at) VALUES (?,?,?,?,?,?,'owed',?,?,?)`).bind(options.recordId,row.sellerId,total,row.beneficiary,row.agreementVersion,row.agreementLanguage,options.now,options.now,options.now));
 statements.push(database.prepare(`INSERT INTO audit_logs(id,actor_id,action,subject_type,subject_id,reason,previous_json,next_json,request_id,ip_hash,created_at) VALUES (?,?,?,'managed_supply',?,?,NULL,CASE WHEN EXISTS(SELECT 1 FROM managed_supply_records WHERE id=? AND decision_request_id=? AND decided_by=?) THEN ? ELSE json_extract('invalid','$') END,?,NULL,?)`).bind(crypto.randomUUID(),options.actorId,`managed_supply.${options.action}`,options.recordId,reason,options.recordId,options.requestId,options.actorId,JSON.stringify({status:accepted?'accepted':options.action,quantityAccepted:accepted?options.quantityAccepted:0,possessionStatus:options.possessionStatus,qualityStatus:options.qualityStatus,ownershipRecordStatus:options.ownershipRecordStatus,riskRecordStatus:options.riskRecordStatus,legalAllocationConfirmed:false,simulationLabel:SIMULATED_RECORD_LABEL,...(options.form?{catalogDigest}:{})}),options.requestId,options.now));
 if(options.form)statements.push(buildFormAnswerInsert(database,{formId:'staff.managed-supply-decision',requestId:options.requestId,versionId:options.form.versionId,subjectType:'managed_supply',subjectId:options.recordId,actorId:options.actorId,answers:options.form.answers,now:options.now}));
 statements.push(...(authority?.statements??[]));
 const results=await database.batch(statements);if((results[0].meta.changes??0)!==1)throw new FixedSupplyError('Supply changed before the decision was recorded.');
}

export async function addFixedSupplyAdjustment(database:D1Database,options:{recordId:string;actorId:string;kind:'cancellation'|'rejection'|'defect';amountPaisa:number;reason:string;requestId:string;now:number;environment:RuntimeEnvironment;form?:{requestId:string;versionId:string;answers:FormAnswerSnapshot}}):Promise<void>{
 assertSimulationAllowed(options.environment);
 const authority=options.form?await staffMutationGuard(database,options.actorId,'refund.approve.high_value',FixedSupplyError,'super_admin'):null;
 const catalogDigest=options.form?await digestFormRequest({recordId:options.recordId,kind:options.kind,amountPaisa:options.amountPaisa,reason:options.reason,versionId:options.form.versionId,answers:options.form.answers}):null;
 if(options.form){if(await decisionFormReplay(database,{formId:'staff.managed-adjustment',requestId:options.requestId,auditRequestId:`${options.requestId}:audit`,actorId:options.actorId,action:'managed_supply.adjusted',subjectType:'managed_supply',subjectId:options.recordId,versionId:options.form.versionId,digest:catalogDigest!}))return;}
 else if(await database.prepare('SELECT 1 FROM managed_supplier_adjustments WHERE request_id=?').bind(options.requestId).first())return;
 money('Adjustment amount',options.amountPaisa);
 const authorized=await database.prepare("SELECT 1 FROM users JOIN user_roles ON user_roles.user_id=users.id WHERE users.id=? AND users.status='active' AND user_roles.role='super_admin'").bind(options.actorId).first();
 if(!authorized)throw new FixedSupplyError('An active Super Admin must record a supplier adjustment.');
 const row=await database.prepare(`SELECT o.original_amount_paisa AS originalAmount,COALESCE(SUM(a.amount_paisa),0) AS adjusted FROM managed_supplier_obligations o LEFT JOIN managed_supplier_adjustments a ON a.obligation_id=o.id WHERE o.id=? GROUP BY o.id`).bind(options.recordId).first<{originalAmount:number;adjusted:number}>();
 if(!row)throw new FixedSupplyError('Accepted supply obligation not found.');
 if(Number(row.adjusted)+options.amountPaisa>Number(row.originalAmount))throw new FixedSupplyError('Supplier adjustments cannot exceed the accepted amount.');
 const reason=text('Adjustment reason',options.reason,10,1000);
 const statements:D1PreparedStatement[]=[database.prepare(`INSERT INTO managed_supplier_adjustments(id,obligation_id,kind,amount_paisa,reason,request_id,created_by,created_at)
  SELECT ?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM managed_supplier_obligations o WHERE o.id=? AND o.original_amount_paisa >= ? + COALESCE((SELECT SUM(amount_paisa) FROM managed_supplier_adjustments WHERE obligation_id=o.id),0))`).bind(crypto.randomUUID(),options.recordId,options.kind,options.amountPaisa,reason,options.requestId,options.actorId,options.now,options.recordId,options.amountPaisa),
  database.prepare(`INSERT INTO audit_logs(id,actor_id,action,subject_type,subject_id,reason,previous_json,next_json,request_id,ip_hash,created_at) VALUES (?,?,'managed_supply.adjusted','managed_supply',?,?,NULL,CASE WHEN EXISTS(SELECT 1 FROM managed_supplier_adjustments WHERE obligation_id=? AND request_id=? AND created_by=?) THEN ? ELSE json_extract('invalid','$') END,?,NULL,?)`).bind(crypto.randomUUID(),options.actorId,options.recordId,reason,options.recordId,options.requestId,options.actorId,JSON.stringify({kind:options.kind,amountPaisa:options.amountPaisa,simulationLabel:SIMULATED_RECORD_LABEL,...(options.form?{catalogDigest}:{})}),`${options.requestId}:audit`,options.now)];
 if(options.form)statements.push(buildFormAnswerInsert(database,{formId:'staff.managed-adjustment',requestId:options.requestId,versionId:options.form.versionId,subjectType:'managed_supply',subjectId:options.recordId,actorId:options.actorId,answers:options.form.answers,now:options.now}));
 statements.push(...(authority?.statements??[]));
 await database.batch(statements);
}

export async function getFixedSupplyBalance(database:D1Database,recordId:string){const row=await database.prepare(`SELECT o.original_amount_paisa AS originalOwedPaisa,o.status,COALESCE((SELECT SUM(amount_paisa) FROM managed_supplier_adjustments WHERE obligation_id=o.id),0) AS adjustmentsPaisa,COALESCE((SELECT SUM(amount_paisa) FROM managed_supplier_payments WHERE obligation_id=o.id AND status='paid'),0) AS paidPaisa FROM managed_supplier_obligations o WHERE o.id=?`).bind(recordId).first<{originalOwedPaisa:number;status:string;adjustmentsPaisa:number;paidPaisa:number}>();if(!row)throw new FixedSupplyError('Accepted supply obligation not found.');const payable=Number(row.originalOwedPaisa)-Number(row.adjustmentsPaisa),paid=Number(row.paidPaisa);return {originalOwedPaisa:Number(row.originalOwedPaisa),adjustmentsPaisa:Number(row.adjustmentsPaisa),paidPaisa:paid,balancePaisa:Math.max(0,payable-paid),recoverablePaisa:Math.max(0,paid-payable),status:paid>=Number(row.originalOwedPaisa)?'paid':row.status};}

export async function prepareFixedSupplierPayment(database:D1Database,options:{recordId:string;actorId:string;destinationReference:string;requestId:string;now:number;environment:RuntimeEnvironment;form?:{requestId:string;versionId:string;answers:FormAnswerSnapshot}}):Promise<string>{
 assertSimulationAllowed(options.environment);
 const authority=options.form?await staffMutationGuard(database,options.actorId,'payout.prepare',FixedSupplyError,'super_admin'):null;
 const catalogDigest=options.form?await digestFormRequest({recordId:options.recordId,destinationReference:options.destinationReference,versionId:options.form.versionId,answers:options.form.answers}):null;
 const existing=await database.prepare('SELECT id FROM managed_supplier_payments WHERE request_id=?').bind(options.requestId).first<{id:string}>();
 if(options.form){
  if(existing){if(await decisionFormReplay(database,{formId:'staff.managed-payment-preparation',requestId:options.requestId,actorId:options.actorId,action:'managed_supplier_payment.prepared',subjectType:'managed_supplier_payment',subjectId:existing.id,versionId:options.form.versionId,digest:catalogDigest!}))return existing.id;throw new FormRequestConflictError('Request reference is already used.');}
  if(await database.prepare('SELECT 1 FROM audit_logs WHERE request_id=?').bind(options.requestId).first())throw new FormRequestConflictError('Request reference is already used.');
 }else if(existing)return existing.id;
 const authorized=await database.prepare("SELECT 1 FROM users JOIN user_roles ON user_roles.user_id=users.id WHERE users.id=? AND users.status='active' AND user_roles.role='super_admin'").bind(options.actorId).first();if(!authorized)throw new FixedSupplyError('An active Super Admin must prepare a simulated supplier payment.');
 if(await database.prepare("SELECT 1 FROM managed_supplier_payments WHERE obligation_id=? AND status IN ('prepared','approved') LIMIT 1").bind(options.recordId).first())throw new FixedSupplyError('This obligation already has a payment awaiting completion.');
 const balance=await getFixedSupplyBalance(database,options.recordId);if(balance.balancePaisa<=0)throw new FixedSupplyError('A positive unpaid supplier balance is required.');
 const id=crypto.randomUUID(),destination=text('Destination reference',options.destinationReference);
 const insert=database.prepare(`INSERT INTO managed_supplier_payments(id,obligation_id,amount_paisa,status,destination_reference,simulation_label,prepared_by,approved_by,request_id,created_at,updated_at,paid_at)
  SELECT ?,o.id,?,'prepared',?,?,?,NULL,?,?,?,NULL FROM managed_supplier_obligations o WHERE o.id=?
   AND o.original_amount_paisa-COALESCE((SELECT SUM(amount_paisa) FROM managed_supplier_adjustments WHERE obligation_id=o.id),0)-COALESCE((SELECT SUM(amount_paisa) FROM managed_supplier_payments WHERE obligation_id=o.id AND status='paid'),0)=?
   AND NOT EXISTS(SELECT 1 FROM managed_supplier_payments WHERE obligation_id=o.id AND status IN ('prepared','approved'))`).bind(id,balance.balancePaisa,destination,SIMULATED_RECORD_LABEL,options.actorId,options.requestId,options.now,options.now,options.recordId,balance.balancePaisa);
 if(!options.form){const result=await insert.run();if((result.meta.changes??0)!==1)throw new FixedSupplyError('Supplier balance changed before payment preparation completed.');}
 else await database.batch([insert,database.prepare(`INSERT INTO audit_logs(id,actor_id,action,subject_type,subject_id,reason,next_json,request_id,created_at) VALUES (?,?,'managed_supplier_payment.prepared','managed_supplier_payment',?,'Simulated supplier payment prepared',CASE WHEN EXISTS(SELECT 1 FROM managed_supplier_payments WHERE id=? AND request_id=? AND prepared_by=?) THEN ? ELSE json_extract('invalid','$') END,?,?)`).bind(crypto.randomUUID(),options.actorId,id,id,options.requestId,options.actorId,JSON.stringify({status:'prepared',amountPaisa:balance.balancePaisa,destinationReference:destination,simulationLabel:SIMULATED_RECORD_LABEL,catalogDigest}),options.requestId,options.now),buildFormAnswerInsert(database,{formId:'staff.managed-payment-preparation',requestId:options.requestId,versionId:options.form.versionId,subjectType:'managed_supplier_payment',subjectId:id,actorId:options.actorId,answers:options.form.answers,now:options.now}),...(authority?.statements??[])]);
 return id;
}

export async function transitionFixedSupplierPayment(database:D1Database,options:{paymentId:string;actorId:string;action:'approve'|'mark_paid';requestId:string;now:number;environment:RuntimeEnvironment;form?:{requestId:string;versionId:string;answers:FormAnswerSnapshot}}):Promise<void>{
 assertSimulationAllowed(options.environment);
 const authority=options.form?await staffMutationGuard(database,options.actorId,options.action==='approve'?'payout.approve':'payout.mark_paid',FixedSupplyError,'super_admin'):null;
 const to=options.action==='approve'?'approved':'paid',from=options.action==='approve'?'prepared':'approved';
 const catalogDigest=options.form?await digestFormRequest({paymentId:options.paymentId,action:options.action,versionId:options.form.versionId,answers:options.form.answers}):null;
 if(options.form){if(await decisionFormReplay(database,{formId:'staff.managed-payment-action',requestId:options.requestId,actorId:options.actorId,action:`managed_supplier_payment.${to}`,subjectType:'managed_supplier_payment',subjectId:options.paymentId,versionId:options.form.versionId,digest:catalogDigest!}))return;}
 else if(await database.prepare('SELECT 1 FROM audit_logs WHERE request_id=?').bind(options.requestId).first())return;
 const row=await database.prepare(`SELECT p.status,p.prepared_by AS preparedBy,p.approved_by AS approvedBy,EXISTS(SELECT 1 FROM users JOIN user_roles ON user_roles.user_id=users.id WHERE users.id=? AND users.status='active' AND user_roles.role='super_admin') AS authorized FROM managed_supplier_payments p WHERE p.id=?`).bind(options.actorId,options.paymentId).first<{status:string;preparedBy:string;approvedBy:string|null;authorized:number}>();if(!row||!row.authorized)throw new FixedSupplyError('An active Super Admin must record this supplier payment action.');
 if(row.status!==from)throw new FixedSupplyError(`Only a ${from} supplier payment can be ${to}.`);if(options.action==='approve'&&row.preparedBy===options.actorId)throw new FixedSupplyError('A different Super Admin must approve the prepared supplier payment.');
 const statements:D1PreparedStatement[]=[database.prepare(`UPDATE managed_supplier_payments SET status=?,approved_by=CASE WHEN ?='approved' THEN ? ELSE approved_by END,paid_at=CASE WHEN ?='paid' THEN ? ELSE paid_at END,updated_at=? WHERE id=? AND status=?`).bind(to,to,options.actorId,to,options.now,options.now,options.paymentId,from),database.prepare(`INSERT INTO audit_logs(id,actor_id,action,subject_type,subject_id,reason,previous_json,next_json,request_id,ip_hash,created_at) VALUES (?,?,?,'managed_supplier_payment',?,'Simulated fixed-supplier payment transition',?,CASE WHEN EXISTS(SELECT 1 FROM managed_supplier_payments WHERE id=? AND status=?) THEN ? ELSE json_extract('invalid','$') END,?,NULL,?)`).bind(crypto.randomUUID(),options.actorId,`managed_supplier_payment.${to}`,options.paymentId,JSON.stringify({status:from}),options.paymentId,to,JSON.stringify({status:to,simulationLabel:SIMULATED_RECORD_LABEL,...(options.form?{catalogDigest}:{})}),options.requestId,options.now)];
 if(options.form)statements.push(buildFormAnswerInsert(database,{formId:'staff.managed-payment-action',requestId:options.requestId,versionId:options.form.versionId,subjectType:'managed_supplier_payment',subjectId:options.paymentId,actorId:options.actorId,answers:options.form.answers,now:options.now}));
 if(options.form){const guardId=crypto.randomUUID();statements.unshift(
  database.prepare(`INSERT INTO staff_permission_guards(id,valid) SELECT ?,CASE WHEN EXISTS(
   SELECT 1 FROM managed_supplier_payments WHERE id=? AND status=? AND prepared_by=?
   ${options.action==='approve'?'AND prepared_by<>?':''}) THEN 1 ELSE 0 END`)
   .bind(guardId,options.paymentId,from,row.preparedBy,...(options.action==='approve'?[options.actorId]:[])),
  database.prepare('DELETE FROM staff_permission_guards WHERE id=?').bind(guardId));}
 statements.push(...(authority?.statements??[]));
 const result=await database.batch(statements);if((result[options.form?2:0].meta.changes??0)!==1)throw new FixedSupplyError('Supplier payment changed before this action completed.');
}
