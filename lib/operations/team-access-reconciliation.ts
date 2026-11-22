import {readTeamDutyCoverage,teamGuard} from './team-governance';

type Journal={id:string;revision:number;kind:string;subjectId:string;reference:string};
type Reference={type:string;snapshotKind:string;userId:string;actorId:string;requestId:string;action:string;parentImpactId?:string;taskId?:string;dutyId?:string;sourceType?:string;sourceId?:string;sourceRevision?:string;startedAt?:number;dueAt?:number;calendarVersion?:string};
const family='team.access-reconciliation';

/** Internal aggregate for the protected reserved root source; never an ordinary-staff preview. */
export async function readStaffAccessReconciliationSummary(db:D1Database,impactId:string){
 const extract=(db as D1Database&{dialect?:string}).dialect==='mariadb'?'JSON_VALUE':'json_extract';
 const row=await db.prepare(`SELECT COUNT(*) AS pendingSources,COALESCE(SUM(CASE WHEN ${extract}(source_reference_json,'$.snapshotKind')='review_task' THEN 1 ELSE 0 END),0) AS pendingTasks,COALESCE(SUM(CASE WHEN ${extract}(source_reference_json,'$.snapshotKind')='duty' THEN 1 ELSE 0 END),0) AS pendingDuties FROM team_governance_tasks WHERE kind='access_reconciliation' AND state='open' AND ${extract}(source_reference_json,'$.parentImpactId')=?`).bind(impactId).first<{pendingSources:number;pendingTasks:number;pendingDuties:number}>();
 return {pendingSources:Number(row?.pendingSources??0),pendingTasks:Number(row?.pendingTasks??0),pendingDuties:Number(row?.pendingDuties??0)};
}

/** Historical journal authority permits examining a source, never assigning it without
 * today's native source, party, permission and availability checks in the shared adapter. */
export async function reconcileStaffAccessCoverage(db:D1Database,options:{now?:number;limit?:number;deadlineMs?:number}={}){
 const now=options.now??Date.now(),limit=options.limit??20,deadline=options.deadlineMs??Date.now()+10000;
 if(!Number.isSafeInteger(now)||now<0||!Number.isInteger(limit)||limit<1||limit>100||!Number.isFinite(deadline))throw new Error('Choose a bounded access reconciliation run.');
 const result={scanned:0,settled:0,gaps:0,failures:0,busy:false,budgetExhausted:false};
 if(Date.now()>=deadline){result.budgetExhausted=true;return result;}
 await db.prepare('INSERT OR IGNORE INTO operational_reminder_cursors(family) VALUES(?)').bind(family).run();
 const token=crypto.randomUUID(),lease=await db.prepare('UPDATE operational_reminder_cursors SET lease_token=?,lease_until=?,revision=revision+1 WHERE family=? AND (lease_until IS NULL OR lease_until<=?)').bind(token,Date.now()+30000,family,Date.now()).run();
 if(!lease.meta.changes){result.busy=true;return result;}
 const seen=new Set<string>();
 try{
  while(result.scanned<limit){
   if(Date.now()>=deadline){result.budgetExhausted=true;break;}
   const marker=await db.prepare('SELECT `cursor` AS `cursor`,revision FROM operational_reminder_cursors WHERE family=? AND lease_token=?').bind(family,token).first<{cursor:string;revision:number}>();if(!marker)break;
   const select=(after:string)=>db.prepare("SELECT id,revision,kind,subject_user_id AS subjectId,source_reference_json AS reference FROM team_governance_tasks WHERE kind IN('access_change','access_reconciliation') AND state='open' AND id>? ORDER BY id LIMIT 1").bind(after).first<Journal>();
   const row=await select(marker.cursor)||await select('');if(!row||seen.has(row.id))break;seen.add(row.id);result.scanned++;
   let completion:D1PreparedStatement[]=[];
   try{
    const reference=JSON.parse(row.reference) as Reference;
    if(!reference||reference.userId!==row.subjectId||typeof reference.actorId!=='string'||typeof reference.requestId!=='string')throw new Error('Unmapped original access reference');
    const root=row.kind==='access_change'?row:await db.prepare("SELECT id,revision,kind,subject_user_id AS subjectId,source_reference_json AS reference FROM team_governance_tasks WHERE id=? AND kind='access_change'").bind(reference.parentImpactId??'').first<Journal>();
    if(!root||root.subjectId!==row.subjectId)throw new Error('Original access obligation is unavailable');
    const original=JSON.parse(root.reference) as Reference;
    if(original.type!=='staff_access_change'||original.snapshotKind!=='root'||original.actorId!==reference.actorId||original.requestId!==reference.requestId||original.action!==reference.action)throw new Error('Original access proof mismatch');
    const proof=original.action==='team.offboard_staff'?"EXISTS(SELECT 1 FROM audit_logs WHERE actor_id=? AND request_id=? AND action='team.offboard_staff' AND subject_id=?)":"EXISTS(SELECT 1 FROM staff_permission_requests WHERE id=? AND user_id=? AND decided_by=? AND status='approved')";
    const values=original.action==='team.offboard_staff'?[original.actorId,original.requestId,row.subjectId]:[original.requestId,row.subjectId,original.actorId];
    if(!await db.prepare('SELECT 1 WHERE '+proof).bind(...values).first())throw new Error('Original access decision unavailable');
    completion.push(...teamGuard(db,proof,values));
    let settled=false;
    if(row.kind==='access_change'){
     const extract=(db as D1Database&{dialect?:string}).dialect==='mariadb'?'JSON_VALUE':'json_extract';
     const pending="NOT EXISTS(SELECT 1 FROM team_governance_tasks WHERE kind='access_reconciliation' AND state='open' AND "+extract+"(source_reference_json,'$.parentImpactId')=?)";
     settled=!!await db.prepare('SELECT 1 WHERE '+pending).bind(row.id).first();completion.push(...teamGuard(db,pending,[row.id]));
    }else if(reference.type==='staff_access_reconciliation'&&reference.snapshotKind==='duty'&&typeof reference.dutyId==='string'){
     const coverage=await readTeamDutyCoverage(db,reference.dutyId,{now});settled=!!coverage.activeOwnerId;completion.push(...coverage.guards);
    }else if(reference.type==='staff_access_reconciliation'&&reference.snapshotKind==='review_task'&&typeof reference.taskId==='string'){
     if(typeof reference.sourceType!=='string'||typeof reference.sourceId!=='string'||typeof reference.sourceRevision!=='string'||typeof reference.calendarVersion!=='string'||!Number.isSafeInteger(reference.startedAt)||!Number.isSafeInteger(reference.dueAt))throw new Error('Incomplete original task snapshot');
     const outcome=await(await import('../workflows/review-tasks')).reconcileReviewTaskCoverage(db,{taskId:reference.taskId,formerOwnerId:row.subjectId,now,requestId:row.id,expectedSource:{sourceType:reference.sourceType,sourceId:reference.sourceId,sourceRevision:reference.sourceRevision,startedAt:reference.startedAt!,dueAt:reference.dueAt!,calendarVersion:reference.calendarVersion}});settled=outcome.state==='settled'||outcome.state==='stale';
    }else throw new Error('Unsupported internal access snapshot');
    if(settled){completion.push(db.prepare("UPDATE team_governance_tasks SET state='completed',completed_at=?,revision=revision+1 WHERE id=? AND revision=? AND state='open' AND source_reference_json=?").bind(now,row.id,row.revision,row.reference),...teamGuard(db,'changes()=1'));result.settled++;}
    else{completion=[];result.gaps++;}
   }catch{completion=[];result.failures++;}
   // Failed sources also advance, so one poison item cannot starve later original owners.
   const leaseGuard=()=>teamGuard(db,'EXISTS(SELECT 1 FROM operational_reminder_cursors WHERE family=? AND lease_token=? AND revision=? AND lease_until>?)',[family,token,marker.revision,Date.now()]);
   const checkpoint=()=>[db.prepare('UPDATE operational_reminder_cursors SET `cursor`=?,revision=revision+1 WHERE family=? AND lease_token=? AND revision=?').bind(row.id,family,token,marker.revision),...teamGuard(db,'changes()=1')];
   try{await db.batch([...leaseGuard(),...completion,...checkpoint()]);}
   catch(error){if(!completion.length)throw error;result.settled--;result.failures++;await db.batch([...leaseGuard(),...checkpoint()]);}
  }
  return result;
 }finally{await db.prepare('UPDATE operational_reminder_cursors SET lease_token=NULL,lease_until=NULL WHERE family=? AND lease_token=?').bind(family,token).run();}
}

/** A maintenance failure cannot turn a successfully committed revocation into a failed save. */
export async function attemptStaffAccessReconciliation(db:D1Database,now:number){try{await reconcileStaffAccessCoverage(db,{now,limit:10,deadlineMs:Date.now()+1500});}catch{/* Immutable children remain pending under the original owned obligation. */}}
