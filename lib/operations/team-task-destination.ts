import {staffMutationGuard} from '../db/repositories/staff-mutation-guard';
import {TeamGovernanceConflict,readTeamDutyCoverage} from './team-governance';
import {teamReviewSource} from './team-governance-tasks';
/** Accept a native governance source or its shared review-task identity. No second queue. */
export async function getTeamTaskDestination(db:D1Database,actorId:string,taskId:string){
 const row=await db.prepare("SELECT id,kind,source_id AS sourceId,subject_user_id AS subjectId,duty_id AS dutyId FROM team_governance_tasks WHERE id=? OR id=(SELECT source_id FROM review_tasks WHERE id=? AND source_type='team_governance') LIMIT 1").bind(taskId,taskId).first<{id:string;kind:string;sourceId:string;subjectId:string|null;dutyId:string|null}>();if(!row)throw new TeamGovernanceConflict('The exact original Team task is unavailable.');
 const source=await teamReviewSource(db,row.id),authority=await staffMutationGuard(db,actorId,source.permission,TeamGovernanceConflict,source.reserved?'super_admin':undefined);
 if(authority.role!=='super_admin'){
  if(['procedure_ack','policy_review'].includes(row.kind)&&row.subjectId!==actorId)throw new TeamGovernanceConflict('This procedure or review belongs to its assigned staff member.');
  if(row.kind==='checkpoint'&&row.dutyId){const coverage=await readTeamDutyCoverage(db,row.dutyId);if(coverage.primaryId!==actorId&&!coverage.backups.some(backup=>backup.userId===actorId)&&coverage.activeOwnerId!==actorId)throw new TeamGovernanceConflict('This appointment is outside your recorded current responsibility.');}
 }
 let tab='coverage',anchor='responsibilities';
 if(['access_review','access_change'].includes(row.kind)){tab='people';anchor='person-'+row.subjectId;}
 if(row.kind==='checkpoint'){tab='calendar';anchor='checkpoint-'+row.sourceId;}
 if(row.kind==='procedure_ack'){tab='policies';anchor='procedure-'+row.sourceId.slice(0,-((row.subjectId?.length??0)+1));}
 if(row.kind==='policy_review'){tab='policies';anchor='policy-review-'+row.id;}
 return {taskId:row.id,kind:row.kind,href:'/admin/team?tab='+tab+'&task='+encodeURIComponent(row.id)+'#'+encodeURIComponent(anchor)};
}
