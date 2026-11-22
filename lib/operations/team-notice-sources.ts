import {teamDutyCatalogue,TeamGovernanceConflict} from './team-governance';
import {staffMutationGuard} from '../db/repositories/staff-mutation-guard';
import {operationalNotificationRequestId} from './event-catalog';
import type {CurrentOperationalNotice,OperationalSourceDescriptor} from './financial-notice-sources';
import {currentNativeProcedureIdSql} from '../legal-procedures/lifecycle';
import {checkoutCommitClock} from '../checkout/commit-policy-guards';
const actions=new Set(['save_duty','availability','propose_handoff','accept_handoff','cancel_handoff','publish_procedure','assign_native_procedure','acknowledge_procedure','complete_access_review','complete_checkpoint','offboard_staff','task_due','access_changed','review_invitation_grant','schedule_policy_review','complete_policy_review']);
export function teamOperationalSource(db:D1Database,e:{kind:string;sourceId:string;eventId:string;status?:string}):OperationalSourceDescriptor|null{
 if(!['team.governance','team.handoff'].includes(e.kind))return null;
 const [action,dutyId]=String(e.status??'').split(':'),definition=teamDutyCatalogue.find(value=>value.id===dutyId);if(!actions.has(action)||!definition)return null;
 const json=(db as D1Database&{dialect?:string}).dialect==='mariadb'?'JSON_VALUE':'json_extract';
 const personal=['acknowledge_procedure','publish_procedure','assign_native_procedure','availability','access_changed','complete_access_review'].includes(action),permission=personal?'account.self.manage':definition.permission;
 const nativeGuard=['assign_native_procedure','acknowledge_procedure'].includes(action)?` AND (${json}(e.details_json,'$.nativeSourceId') IS NULL OR ${json}(e.details_json,'$.nativeSourceId')=(${currentNativeProcedureIdSql(db)}))`:'';
 const guard=`EXISTS(SELECT 1 FROM team_governance_events e WHERE e.id=? AND e.id=? AND e.action=? AND ${json}(e.details_json,'$.dutyId')=?${nativeGuard})`;
 const superSql="EXISTS(SELECT 1 FROM user_roles personal_super WHERE personal_super.user_id=u.id AND personal_super.role='super_admin')",clock=checkoutCommitClock(db);
 const staffGuard=`${definition.reserved&&!personal?superSql+' AND ':''}EXISTS(SELECT 1 FROM team_governance_events target WHERE target.id=? AND ((EXISTS(SELECT 1 FROM operational_notice_states marker WHERE marker.current_event_id=target.id AND marker.current_status=?) AND (${superSql} OR u.id=${json}(target.details_json,'$.recipientId') OR u.id=${json}(target.details_json,'$.formerOwnerId') OR EXISTS(SELECT 1 FROM team_procedures team_procedure JOIN team_procedure_assignments assignment ON assignment.procedure_id=team_procedure.id WHERE team_procedure.id=${json}(target.details_json,'$.procedureId') AND target.action IN('publish_procedure','assign_native_procedure') AND team_procedure.retired_at IS NULL AND assignment.user_id=u.id))) OR (target.source_type='duty' AND target.action='save_duty' AND u.id=${json}(target.details_json,'$.formerOwnerId') AND NOT EXISTS(SELECT 1 FROM team_duties current_duty WHERE current_duty.id=target.source_id AND current_duty.primary_user_id=u.id) AND NOT EXISTS(SELECT 1 FROM team_handoffs current_handoff WHERE current_handoff.duty_id=target.source_id AND current_handoff.to_user_id=u.id AND current_handoff.state='accepted' AND current_handoff.starts_at<=${clock} AND current_handoff.ends_at>${clock}))))`;
 return {guard,guardValues:[e.sourceId,e.eventId,action,dutyId],ownerSql:null,ownerValues:[],audience:'staff',staffPermission:permission,relatedType:'team_governance_event',subject:e.kind==='team.handoff'?'Duty handoff updated':'Team responsibility updated',staffGuard,staffGuardValues:[e.sourceId,e.status]};
}
export async function isCurrentTeamNotice(db:D1Database,notice:CurrentOperationalNotice,now=Date.now()){
 if(!['business.team.governance','business.team.handoff'].includes(notice.template))return true;
 if(!notice.userId||!notice.relatedId||notice.audience!=='staff'||notice.relatedType!=='team_governance_event')return false;
 const event=await db.prepare('SELECT action,source_id AS sourceId,details_json AS details FROM team_governance_events WHERE id=?').bind(notice.relatedId).first<{action:string;sourceId:string;details:string}>();if(!event)return false;
 let detail:Record<string,unknown>;try{detail=JSON.parse(event.details);}catch{return false;}
 if(!detail||typeof detail!=='object'||Array.isArray(detail)||typeof detail.dutyId!=='string')return false;
 const descriptor=teamOperationalSource(db,{kind:notice.template.slice(9),sourceId:notice.relatedId,eventId:notice.relatedId,status:event.action+':'+detail.dutyId});if(!descriptor)return false;
 try{await staffMutationGuard(db,notice.userId,descriptor.staffPermission!,TeamGovernanceConflict);}catch(error){if(error instanceof TeamGovernanceConflict)return false;throw error;}
 if(!await db.prepare('SELECT 1 WHERE '+descriptor.guard).bind(...descriptor.guardValues).first())return false;
 if(!await db.prepare('SELECT 1 FROM users u WHERE u.id=? AND '+descriptor.staffGuard).bind(notice.userId,...descriptor.staffGuardValues??[]).first())return false;
 if(['propose_handoff','accept_handoff'].includes(event.action)){
  const h=await db.prepare('SELECT state,ends_at AS endsAt FROM team_handoffs WHERE id=?').bind(event.sourceId).first<{state:string;endsAt:number}>();if(!h||h.endsAt<=now||h.state!==(event.action==='propose_handoff'?'pending':'accepted'))return false;
 }
 return notice.requestId===await operationalNotificationRequestId(notice.template,notice.relatedId,notice.userId,notice.channel);
}
