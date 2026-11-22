/** Native immutable journals commit with revocation; rerouting is a separate bounded worker. */
export async function staffAccessGovernanceStatements(db:D1Database,input:{userId:string;actorId:string;requestId:string;now:number;grantVersion:number;action?:'staff.permissions.applied'|'staff.permissions.approved'|'team.offboard_staff'}){
 const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(['staff-access-impact',input.actorId,input.requestId,input.userId]))),id=Array.from(new Uint8Array(bytes),byte=>byte.toString(16).padStart(2,'0')).join('');
 const reference={type:'staff_access_change',actorId:input.actorId,requestId:input.requestId,action:input.action??'staff.permissions.applied',grantVersion:input.grantVersion,userId:input.userId,snapshotKind:'root'};
 const child=JSON.stringify({...reference,type:'staff_access_reconciliation',parentImpactId:id});
 // Generated keys are32 ASCII bytes on both databases; opaque source IDs stay complete in JSON.
 // No aggregation, group_concat limit, concatenated ID or list truncation can lose later owners.
 const key=(db as D1Database&{dialect?:string}).dialect==='mariadb'?"REPLACE(UUID(),'-','')":"lower(hex(randomblob(16)))";
 const statements=[
  db.prepare("INSERT OR IGNORE INTO team_governance_tasks(id,kind,source_id,duty_id,subject_user_id,created_at,due_at,state,source_reference_json) VALUES(?,'access_change',?,(SELECT id FROM team_duties WHERE id='team_governance'),?,?,?,'open',?)").bind(id,id,input.userId,input.now,input.now,JSON.stringify(reference)),
  db.prepare(`INSERT INTO team_governance_tasks(id,kind,source_id,subject_user_id,created_at,due_at,state,source_reference_json)
   SELECT ${key},'access_reconciliation',${key},?,?,?,'open',json_set(?,'$.snapshotKind','review_task','$.taskId',t.id,'$.sourceType',t.source_type,'$.sourceId',t.source_id,'$.sourceRevision',t.source_revision,'$.taskRevision',t.revision,'$.startedAt',t.started_at,'$.dueAt',t.due_at,'$.calendarVersion',t.calendar_version,'$.formerOwnerId',t.owner_id)
   FROM review_tasks t WHERE t.owner_id=?`).bind(input.userId,input.now,input.now,child,input.userId),
  db.prepare(`INSERT INTO team_governance_tasks(id,kind,source_id,subject_user_id,created_at,due_at,state,source_reference_json)
   SELECT ${key},'access_reconciliation',${key},?,?,?,'open',json_set(?,'$.snapshotKind','duty','$.dutyId',d.id,'$.dutyRevision',d.revision,'$.primaryId',d.primary_user_id,'$.requiredPermission',d.required_permission,'$.reserved',d.reserved_super_admin)
   FROM team_duties d WHERE d.primary_user_id=? OR EXISTS(SELECT 1 FROM team_duty_backups b WHERE b.duty_id=d.id AND b.user_id=?) OR EXISTS(SELECT 1 FROM team_handoffs h WHERE h.duty_id=d.id AND h.to_user_id=? AND h.state='accepted')`).bind(input.userId,input.now,input.now,child,input.userId,input.userId,input.userId),
  db.prepare('UPDATE review_tasks SET owner_id=NULL,revision=revision+1,updated_at=? WHERE owner_id=?').bind(input.now,input.userId),
 ];
 if(input.action==='team.offboard_staff')return statements;
 const eventId=crypto.randomUUID(),status='access_changed:team_governance',head=await db.prepare("SELECT revision FROM operational_notice_states WHERE family='team.staff' AND source_id=?").bind(input.userId).first<{revision:number}>();
 statements.push(db.prepare("INSERT INTO team_governance_events(id,source_type,source_id,action,actor_id,created_at,reason,details_json,request_id) VALUES(?,'staff',?,'access_changed',?,?,'Work access changed; review the current permitted responsibilities.',?,?)").bind(eventId,input.userId,input.actorId,input.now,JSON.stringify({dutyId:'team_governance',recipientId:input.userId,grantVersion:input.grantVersion,grantRequestId:input.requestId,decisionAction:reference.action}),input.requestId));
 if(head)statements.push(db.prepare("UPDATE operational_notice_states SET current_event_id=?,current_status=?,revision=revision+1 WHERE family='team.staff' AND source_id=? AND revision=?").bind(eventId,status,input.userId,head.revision),...(await import('./team-governance')).teamGuard(db,'changes()=1'));
 else statements.push(db.prepare("INSERT INTO operational_notice_states(family,source_id,current_event_id,current_status) VALUES('team.staff',?,?,?)").bind(input.userId,eventId,status));
 statements.push(...await(await import('./business-notifications')).operationalBusinessNotificationStatements(db,{kind:'team.governance',sourceId:eventId,eventId,status,actorId:input.actorId,now:input.now,detail:'Staff work access changed. Open the protected current responsibilities; assignment does not grant permission.'}));
 return statements;
}
