import {isCurrentTeamNotice} from './team-notice-sources';
import {isCurrentIncidentNotice} from './incident-review';
import type {CurrentOperationalNotice} from './financial-notice-sources';

/** A copied event URL grants no access. Resolve only an actually issued, current notice. */
export async function resolveGovernanceNoticeDestination(db:D1Database,userId:string,type:string,id:string,now=Date.now()):Promise<string|null>{
 if(type==='review_task_assignment')return(await import('./review-task-assignment-destination')).resolveReviewAssignmentDestination(db,userId,id,now);
 if(!['team_governance_event','service_incident_event'].includes(type)||!/^[a-zA-Z0-9_-]{1,160}$/.test(id))return null;
 const notices=await db.prepare("SELECT template_key template,related_id relatedId,related_type relatedType,recipient_user_id userId,audience_role audience,channel,request_id requestId,required_permission requiredPermission FROM notification_messages WHERE recipient_user_id=? AND audience_role='staff' AND related_type=? AND related_id=? AND channel='in_app' AND business_event_key=template_key AND template_key IN('business.team.governance','business.team.handoff','business.system.incident') ORDER BY created_at DESC,id DESC LIMIT 3").bind(userId,type,id).all<CurrentOperationalNotice>();
 for(const notice of notices.results){
  const isCurrent=()=>type==='team_governance_event'?['business.team.governance','business.team.handoff'].includes(notice.template)&&isCurrentTeamNotice(db,notice,now):notice.template==='business.system.incident'?isCurrentIncidentNotice(db,notice,now):false;
  if(!await isCurrent())continue;
  let destination:string|null=null;
  if(type==='service_incident_event'){
   const event=await db.prepare('SELECT incident_id incidentId FROM service_incident_events WHERE id=?').bind(id).first<{incidentId:string}>();
   if(event)destination='/admin/system-health/incidents?incident='+encodeURIComponent(event.incidentId);
  }else{
   const event=await db.prepare('SELECT source_type sourceType,source_id sourceId,details_json details FROM team_governance_events WHERE id=?').bind(id).first<{sourceType:string;sourceId:string;details:string}>();
   if(event){
    const details=JSON.parse(event.details) as {procedureId?:string};let tab='coverage',anchor='duty-'+event.sourceId;
    if(event.sourceType==='handoff')anchor='handoff-'+event.sourceId;
    else if(event.sourceType.startsWith('procedure')){tab='policies';anchor=details.procedureId?'procedure-'+details.procedureId:'policies';}
    else if(event.sourceType==='checkpoint'){tab='calendar';anchor='checkpoint-'+event.sourceId;}
    else if(['availability','access_review','staff','invitation','access_changed'].includes(event.sourceType)){tab='people';anchor='person-'+event.sourceId;}
    destination='/admin/team?tab='+tab+'#'+encodeURIComponent(anchor);
   }
  }
  // Recheck after asynchronous lookup; the destination reauthorizes the source again.
  if(destination&&await isCurrent())return destination;
 }
 return null;
}
