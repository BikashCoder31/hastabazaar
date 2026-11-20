import { readTeamDutyCoverage, TeamGovernanceConflict } from './team-governance';

import type {Permission} from '../marketplace/permissions';
import {staffMutationGuard} from '../db/repositories/staff-mutation-guard';
import {checkoutCommitClock} from '../checkout/commit-policy-guards';


async function hash(value:unknown){const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value)));return Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');}
export {processTeamGovernanceDue} from './team-governance-dispatch';

/** Source beneficiary remains empty: assigned staff are not economic counterparties. */
export async function teamReviewSource(db:D1Database,id:string,now=Date.now()){
 const row=await db.prepare('SELECT id,kind,source_id AS sourceId,duty_id AS dutyId,subject_user_id AS subjectId,created_at AS startedAt,due_at AS dueAt,state,revision,source_reference_json AS reference FROM team_governance_tasks WHERE id=?').bind(id).first<{id:string;kind:string;sourceId:string;dutyId:string|null;subjectId:string|null;startedAt:number;dueAt:number;state:string;revision:number;reference:string}>();if(!row)throw new TeamGovernanceConflict('The original governance task is unavailable.');
 if(!['access_review','access_change','checkpoint','procedure_ack','policy_review'].includes(row.kind))throw new TeamGovernanceConflict('This governance source kind needs reconciliation.');
 const own=row.kind==='procedure_ack',personal=own||row.kind==='policy_review',coverage=row.dutyId?await readTeamDutyCoverage(db,row.dutyId,{now}):null;
 const permission:Permission=personal?'account.self.manage':row.kind==='checkpoint'?coverage?.permission??'payout.prepare':'admin.permissions.manage',reserved=personal?false:row.kind==='checkpoint'?coverage?.reserved??false:true;
 let active=row.state==='open';
 const predicates=['EXISTS(SELECT 1 FROM team_governance_tasks WHERE id=? AND revision=? AND state=?)'],values:unknown[]=[row.id,row.revision,row.state];
 if(coverage){
  predicates.push(coverage.predicate);values.push(...coverage.values);
  const clock=checkoutCommitClock(db),activeHandoff="SELECT id FROM team_handoffs WHERE duty_id=? AND state='accepted' AND starts_at<="+clock+' AND ends_at>'+clock+' ORDER BY created_at DESC,id DESC LIMIT 1',handoff=coverage.activeHandoff;
  predicates.push(handoff?'('+activeHandoff+')=? AND EXISTS(SELECT 1 FROM team_handoffs WHERE id=? AND revision=?)':'NOT EXISTS('+activeHandoff+')');
  values.push(...(handoff?[row.dutyId,handoff.id,handoff.id,handoff.revision]:[row.dutyId]));
 }
 if(own){const procedureId=row.sourceId.slice(0,-((row.subjectId?.length??0)+1)),procedure=await db.prepare('SELECT p.retired_at AS retiredAt,p.native_source_id AS nativeId,p.native_source_sha256 AS nativeSha,a.acknowledged_at AS acknowledgedAt FROM team_procedures p JOIN team_procedure_assignments a ON a.procedure_id=p.id WHERE p.id=? AND a.user_id=?').bind(procedureId,row.subjectId).first<{retiredAt:number|null;nativeId:string|null;nativeSha:string|null;acknowledgedAt:number|null}>();active=active&&!!procedure&&procedure.retiredAt===null&&procedure.acknowledgedAt===null;
  if(active){predicates.push('EXISTS(SELECT 1 FROM team_procedures p JOIN team_procedure_assignments a ON a.procedure_id=p.id WHERE p.id=? AND a.user_id=? AND p.retired_at IS NULL AND a.acknowledged_at IS NULL)');values.push(procedureId,row.subjectId);}
  if(procedure?.nativeId){const proof=await(await import('../legal-procedures/lifecycle')).getActiveLegalProcedureProof(db,now);active=active&&!!proof&&proof.active.id===procedure.nativeId&&proof.active.document.sha256===procedure.nativeSha;if(proof){predicates.push(proof.predicate);values.push(...proof.values);}}
 }
 if(row.kind==='access_review'){
  const fact=await db.prepare("SELECT COALESCE(p.version,0) AS version,COALESCE(p.updated_at,0) AS grantAt,(SELECT MAX(assigned_at) FROM user_roles WHERE user_id=u.id AND role IN('admin','super_admin')) AS roleAt,(SELECT MAX(completed_at) FROM team_access_reviews a WHERE a.user_id=u.id AND a.grant_version=COALESCE(p.version,0) AND a.completed_at>=COALESCE(p.updated_at,0)) AS reviewedAt FROM users u LEFT JOIN staff_permission_profiles p ON p.user_id=u.id WHERE u.id=? AND u.status='active' AND EXISTS(SELECT 1 FROM user_roles WHERE user_id=u.id AND role IN('admin','super_admin'))").bind(row.subjectId).first<{version:number;grantAt:number;roleAt:number;reviewedAt:number|null}>();
  active=active&&!!fact&&row.sourceId===await hash([row.subjectId,fact.version,Math.max(fact.grantAt,fact.roleAt,fact.reviewedAt??0)]);
  if(fact){predicates.push('COALESCE((SELECT version FROM staff_permission_profiles WHERE user_id=?),0)=?');values.push(row.subjectId,fact.version);}
 }
 if(row.kind==='policy_review'||row.kind==='access_change'){
  let reference:Record<string,unknown>;try{reference=JSON.parse(row.reference);if(!reference||Array.isArray(reference))throw new Error();}catch{throw new TeamGovernanceConflict('The original governance source reference needs reconciliation.');}
  if(row.kind==='policy_review'){
   if(reference.type==='business_setting'){const native=await db.prepare('SELECT 1 FROM business_setting_versions WHERE id=? AND revision=? AND status=?').bind(reference.id,reference.revision,reference.status).first();active=active&&!!native;predicates.push('EXISTS(SELECT 1 FROM business_setting_versions WHERE id=? AND revision=? AND status=?)');values.push(reference.id,reference.revision,reference.status);}
   else if(reference.type==='internal_legal_procedure'){const proof=await(await import('../legal-procedures/lifecycle')).getActiveLegalProcedureProof(db,now);active=active&&!!proof&&proof.active.id===reference.id&&proof.active.document.sha256===reference.sha256;if(proof){predicates.push(proof.predicate);values.push(...proof.values);}}
   else if(reference.type!=='service_calendar'||reference.version!=='continuous-v1')throw new TeamGovernanceConflict('The exact original policy review reference is unsupported.');
  }else{
   if(reference.type!=='staff_access_change'||typeof reference.actorId!=='string'||typeof reference.requestId!=='string')throw new TeamGovernanceConflict('The original access-change source reference needs reconciliation.');
   const proof=reference.action==='team.offboard_staff'?"EXISTS(SELECT 1 FROM audit_logs WHERE actor_id=? AND request_id=? AND action='team.offboard_staff')":"EXISTS(SELECT 1 FROM staff_permission_requests WHERE id=? AND user_id=? AND decided_by=? AND status='approved')",bound=reference.action==='team.offboard_staff'?[reference.actorId,reference.requestId]:[reference.requestId,row.subjectId,reference.actorId];
   if(!await db.prepare('SELECT 1 WHERE '+proof).bind(...bound).first())throw new TeamGovernanceConflict('The original access-change decision requires reconciliation.');predicates.push(proof);values.push(...bound);
  }
 }
 const explicit=personal?row.subjectId:(await db.prepare("SELECT owner_id AS id FROM review_tasks WHERE source_type='team_governance' AND source_id=? AND source_revision=?").bind(row.id,row.id).first<{id:string|null}>())?.id??coverage?.activeOwnerId??null;
 let initialReviewerId=explicit;if(initialReviewerId)try{await staffMutationGuard(db,initialReviewerId,permission,TeamGovernanceConflict,reserved?'super_admin':undefined);}catch(error){if(error instanceof TeamGovernanceConflict)initialReviewerId=coverage?.activeOwnerId??null;else throw error;}
 let nextActor=own?'Assigned staff reader':'Eligible duty staff';
 if(row.kind==='access_change'){const summary=await(await import('./team-access-reconciliation')).readStaffAccessReconciliationSummary(db,row.id);nextActor='Eligible Super Admin — '+summary.pendingSources+' original sources awaiting coverage reconciliation';}
 return {revision:row.id,ownerId:'',assigneeOnlyId:own?row.subjectId:undefined,allowedStaffIds:personal&&row.subjectId?[row.subjectId]:row.kind==='checkpoint'&&coverage?[...new Set([coverage.primaryId,coverage.activeOwnerId,...coverage.backups.map(backup=>backup.userId)].filter((value):value is string=>!!value))]:undefined,startedAt:row.startedAt,dueAt:row.dueAt,hasDeadline:!own,status:active?row.state:row.state==='open'?'superseded':row.state,permission,reserved,needsAction:active,initialReviewerId,backupId:coverage?.backupId??null,nextActor,predicate:predicates.join(' AND '),values};
}

