import { teamGuard, TeamGovernanceConflict } from './team-governance';
import {nextFinanceCheckpoint} from '../workflows/service-clock';
const DAY=86400000,OFFSET=20700000,phases=['checkpoints','access','procedures','ensure'] as const;
async function digest(value:unknown){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value)));return Array.from(new Uint8Array(bytes),byte=>byte.toString(16).padStart(2,'0')).join('');}
type Cursor={cursor:string;revision:number};
async function readCursor(db:D1Database,family:string){await db.prepare('INSERT OR IGNORE INTO operational_reminder_cursors(family) VALUES(?)').bind(family).run();return (await db.prepare('SELECT `cursor` AS `cursor`,revision FROM operational_reminder_cursors WHERE family=?').bind(family).first<Cursor>())!;}
function parsed(cursor:string):Record<string,string>{if(!cursor)return {};try{const value=JSON.parse(cursor);if(value&&typeof value==='object'&&!Array.isArray(value)&&Object.values(value).every(item=>typeof item==='string'))return value;}catch{/* Fail closed rather than reset an unknown scan marker. */}throw new TeamGovernanceConflict('The governance scan cursor needs review.');}
type Source={key:Record<string,string>;run:()=>Promise<number>};
export async function processTeamGovernanceDue(db:D1Database,options:{now?:number;limit?:number;deadlineMs?:number}={}){
 const now=options.now??Date.now(),limit=options.limit??50,deadline=options.deadlineMs??Date.now()+15000;
 if(!Number.isSafeInteger(limit)||limit<1||limit>200||!Number.isSafeInteger(now)||now<0||!Number.isFinite(deadline))throw new TeamGovernanceConflict('Choose a bounded governance scan and valid observation time.');
 const result={scanned:0,created:0,failures:[] as {family:string;sourceId:string|null;code:string}[],budgetExhausted:false,busy:false,cursor:{} as Record<string,string>};
 if(Date.now()>=deadline){result.budgetExhausted=true;return result;}
 const control='team.dispatch',token=crypto.randomUUID();await readCursor(db,control);
 const lease=await db.prepare('UPDATE operational_reminder_cursors SET lease_token=?,lease_until=?,revision=revision+1 WHERE family=? AND (lease_until IS NULL OR lease_until<=?)').bind(token,Date.now()+30000,control,Date.now()).run();
 if(!lease.meta.changes){result.busy=true;return result;}
 let empty=0;
 try{
  const current=await readCursor(db,control),state=parsed(current.cursor);let phase=Math.max(0,phases.indexOf(state.phase as typeof phases[number]));
  while(result.scanned<limit&&empty<phases.length){
   if(Date.now()>=deadline){result.budgetExhausted=true;break;}
   const name=phases[phase],family='team.scan.'+name,marker=await readCursor(db,family);let position=parsed(marker.cursor),source=await selectSource(db,name,position,now);
   if(!source&&marker.cursor){position={};source=await selectSource(db,name,position,now);}
   if(!source){empty++;phase=(phase+1)%phases.length;await db.prepare('UPDATE operational_reminder_cursors SET `cursor`=?,revision=revision+1 WHERE family=? AND lease_token=?').bind(JSON.stringify({phase:phases[phase]}),control,token).run();continue;}
   empty=0;result.scanned++;
   if(Date.now()>=deadline){result.budgetExhausted=true;break;}
   try{result.created+=await source.run();}catch(error){if(error instanceof TeamGovernanceConflict||(error instanceof Error&&error.constructor.name==='ReviewTaskConflict'))result.failures.push({family:name,sourceId:source.key.id??source.key.userId??null,code:'source_changed'});else throw error;}
   phase=(phase+1)%phases.length;
   const cursor=JSON.stringify(source.key);
   await db.batch([db.prepare('UPDATE operational_reminder_cursors SET `cursor`=?,revision=revision+1 WHERE family=? AND revision=?').bind(cursor,family,marker.revision),...teamGuard(db,'changes()=1'),db.prepare('UPDATE operational_reminder_cursors SET `cursor`=?,revision=revision+1 WHERE family=? AND lease_token=?').bind(JSON.stringify({phase:phases[phase]}),control,token),...teamGuard(db,'changes()=1')]);
   result.cursor[name]=cursor;
  }
  result.cursor.phase=phases[phase];if(Date.now()>=deadline)result.budgetExhausted=true;return result;
 }finally{await db.prepare('UPDATE operational_reminder_cursors SET lease_token=NULL,lease_until=NULL WHERE family=? AND lease_token=?').bind(control,token).run();}
}

async function selectSource(db:D1Database,phase:typeof phases[number],cursor:Record<string,string>,now:number):Promise<Source|null>{
 if(phase==='checkpoints'){
  const day=Math.floor((now+OFFSET)/DAY)*DAY-OFFSET,date=new Date(day+OFFSET).toISOString().slice(0,10),after=cursor.day===date?cursor.id??'':'';
  const row=await db.prepare("SELECT id,revision FROM team_duties WHERE id IN('finance_payout','finance_reconciliation') AND id>? ORDER BY id LIMIT 1").bind(after).first<{id:string;revision:number}>();if(!row)return null;
  return {key:{day:date,id:row.id},run:async()=>{
   const kind=row.id==='finance_payout'?'payout_queue':'reconciliation',id=await digest(['team-checkpoint',date,kind]),due=nextFinanceCheckpoint(day,kind==='payout_queue'?'payout_review':'reconciliation');
   const results=await db.batch([...teamGuard(db,'EXISTS(SELECT 1 FROM team_duties WHERE id=? AND revision=?)',[row.id,row.revision]),db.prepare('INSERT OR IGNORE INTO team_checkpoints(id,duty_id,nepal_date,kind,due_at) VALUES(?,?,?,?,?)').bind(id,row.id,date,kind,due),db.prepare("INSERT OR IGNORE INTO team_governance_tasks(id,kind,source_id,duty_id,created_at,due_at,state) SELECT ?,'checkpoint',id,duty_id,?,due_at,'open' FROM team_checkpoints WHERE id=? AND completed_at IS NULL").bind(id,day,id)]);return Number(results.at(-1)?.meta.changes??0);
  }};
 }
 if(phase==='access'){
  const row=await db.prepare("SELECT u.id,COALESCE(p.version,0) AS version,COALESCE(p.updated_at,0) AS grantAt,(SELECT MAX(r.assigned_at) FROM user_roles r WHERE r.user_id=u.id AND r.role IN('admin','super_admin')) AS roleAt,(SELECT MAX(a.completed_at) FROM team_access_reviews a WHERE a.user_id=u.id AND a.grant_version=COALESCE(p.version,0) AND a.completed_at>=COALESCE(p.updated_at,0) AND a.completed_at>=(SELECT MAX(r.assigned_at) FROM user_roles r WHERE r.user_id=u.id AND r.role IN('admin','super_admin'))) AS reviewedAt FROM users u LEFT JOIN staff_permission_profiles p ON p.user_id=u.id WHERE u.status='active' AND u.id>? AND EXISTS(SELECT 1 FROM user_roles r WHERE r.user_id=u.id AND r.role IN('admin','super_admin')) ORDER BY u.id LIMIT 1").bind(cursor.id??'').first<{id:string;version:number;grantAt:number;roleAt:number;reviewedAt:number|null}>();if(!row)return null;
  return {key:{id:row.id},run:async()=>{const start=Math.max(row.grantAt,row.roleAt,row.reviewedAt??0),id=await digest(['team-access-review',row.id,row.version,start]),sourceId=await digest([row.id,row.version,start]);
   const results=await db.batch([...teamGuard(db,"EXISTS(SELECT 1 FROM users u JOIN user_roles r ON r.user_id=u.id LEFT JOIN staff_permission_profiles p ON p.user_id=u.id WHERE u.id=? AND u.status='active' AND r.role IN('admin','super_admin') AND COALESCE(p.version,0)=?)",[row.id,row.version]),db.prepare("UPDATE team_governance_tasks SET state='superseded',revision=revision+1 WHERE kind='access_review' AND subject_user_id=? AND id<>? AND state='open'").bind(row.id,id),db.prepare("INSERT OR IGNORE INTO team_governance_tasks(id,kind,source_id,duty_id,subject_user_id,created_at,due_at,state) VALUES(?,'access_review',?,(SELECT id FROM team_duties WHERE id='team_governance'),?,?,?,'open')").bind(id,sourceId,row.id,start,start+30*DAY)]);return Number(results.at(-1)?.meta.changes??0);
  }};
 }
 if(phase==='procedures'){
  const row=await db.prepare("SELECT a.procedure_id AS id,a.user_id AS userId,a.assigned_at AS assignedAt FROM team_procedure_assignments a JOIN team_procedures p ON p.id=a.procedure_id WHERE p.retired_at IS NULL AND a.acknowledged_at IS NULL AND (a.procedure_id>? OR (a.procedure_id=? AND a.user_id>?)) ORDER BY a.procedure_id,a.user_id LIMIT 1").bind(cursor.id??'',cursor.id??'',cursor.userId??'').first<{id:string;userId:string;assignedAt:number}>();if(!row)return null;
  return {key:{id:row.id,userId:row.userId},run:async()=>{const id=await digest(['team-procedure',row.id,row.userId]),results=await db.batch([...teamGuard(db,'EXISTS(SELECT 1 FROM team_procedure_assignments a JOIN team_procedures p ON p.id=a.procedure_id WHERE a.procedure_id=? AND a.user_id=? AND a.acknowledged_at IS NULL AND p.retired_at IS NULL)',[row.id,row.userId]),db.prepare("INSERT OR IGNORE INTO team_governance_tasks(id,kind,source_id,subject_user_id,created_at,due_at,state) VALUES(?,'procedure_ack',?,?,?,?,'open')").bind(id,row.id+':'+row.userId,row.userId,row.assignedAt,row.assignedAt)]);return Number(results.at(-1)?.meta.changes??0);}};
 }
 const row=await db.prepare("SELECT id,revision FROM team_governance_tasks WHERE state='open' AND kind<>'access_reconciliation' AND id>? ORDER BY id LIMIT 1").bind(cursor.id??'').first<{id:string;revision:number}>();if(!row)return null;
 return {key:{id:row.id},run:async()=>{const domain=await import('./team-governance-tasks'),source=await domain.teamReviewSource(db,row.id,now);if(!source.needsAction){await db.prepare("UPDATE team_governance_tasks SET state='superseded',revision=revision+1 WHERE id=? AND revision=? AND state='open'").bind(row.id,row.revision).run();return 0;}const tasks=await import('../workflows/review-tasks'),existing=await db.prepare("SELECT id FROM review_tasks WHERE source_type='team_governance' AND source_id=? AND source_revision=?").bind(row.id,source.revision).first();await tasks.ensureReviewTask(db,{sourceType:'team_governance',sourceId:row.id,now});return existing?0:1;}};
}
