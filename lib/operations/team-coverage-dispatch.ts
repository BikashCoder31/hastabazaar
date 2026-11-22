import {checkoutCommitClock} from '../checkout/commit-policy-guards';
import {reconcileReviewTaskCoverage} from '../workflows/review-tasks';
import {teamGuard} from './team-governance';

/** Original review records are the durable work list, including future availability transitions. */
export async function reconcileTeamTaskCoverage(db:D1Database,options:{now?:number;limit?:number;deadlineMs?:number;userId?:string}={}){
 const now=options.now??Date.now(),limit=options.limit??20,deadline=options.deadlineMs??Date.now()+10000;
 if(!Number.isSafeInteger(now)||now<0||!Number.isInteger(limit)||limit<1||limit>100||!Number.isFinite(deadline))throw new Error('Use bounded current coverage observation.');
 const result={scanned:0,changed:0,gaps:0,failures:[]as {sourceId:string;code:string}[],busy:false,budgetExhausted:false};
 if(Date.now()>=deadline){result.budgetExhausted=true;return result;}
 const digest=options.userId?Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(options.userId))),byte=>byte.toString(16).padStart(2,'0')).join(''):null;
 const family='team.coverage'+(digest?':'+digest:''),token=crypto.randomUUID(),clock=checkoutCommitClock(db);
 await db.prepare('INSERT OR IGNORE INTO operational_reminder_cursors(family) VALUES(?)').bind(family).run();
 const lease=await db.prepare(`UPDATE operational_reminder_cursors SET lease_token=?,lease_until=${clock}+30000 WHERE family=? AND (lease_token IS NULL OR lease_until<=${clock})`).bind(token,family).run();
 if(!lease.meta.changes){result.busy=true;return result;}
 const seen=new Set<string>();
 try{
  while(result.scanned<limit&&Date.now()<deadline){
   const marker=await db.prepare(`SELECT \`cursor\` AS \`cursor\`,revision FROM operational_reminder_cursors WHERE family=? AND lease_token=? AND lease_until>${clock}`).bind(family,token).first<{cursor:string;revision:number}>();if(!marker){result.busy=true;break;}
   const select=(after:string)=>db.prepare("SELECT id,owner_id AS ownerId FROM review_tasks WHERE id>?"+(options.userId?' AND owner_id=?':'')+' ORDER BY id LIMIT 1').bind(after,...(options.userId?[options.userId]:[])).first<{id:string;ownerId:string|null}>();
   const row=await select(marker.cursor)||await select('');if(!row||seen.has(row.id))break;seen.add(row.id);result.scanned++;
   try{const outcome=await reconcileReviewTaskCoverage(db,{taskId:row.id,formerOwnerId:row.ownerId??'',now});if(outcome.changed)result.changed++;if(outcome.state==='gap')result.gaps++;}
   catch{result.failures.push({sourceId:row.id,code:'current_coverage_requires_review'});}
   await db.batch([...teamGuard(db,`EXISTS(SELECT 1 FROM operational_reminder_cursors WHERE family=? AND lease_token=? AND revision=? AND lease_until>${clock})`,[family,token,marker.revision]),db.prepare('UPDATE operational_reminder_cursors SET `cursor`=?,revision=revision+1 WHERE family=? AND lease_token=? AND revision=?').bind(row.id,family,token,marker.revision),...teamGuard(db,'changes()=1')]);
  }
  result.budgetExhausted=Date.now()>=deadline;return result;
 }finally{await db.prepare('UPDATE operational_reminder_cursors SET lease_token=NULL,lease_until=NULL WHERE family=? AND lease_token=?').bind(family,token).run();}
}

/** A saved absence/handoff stays saved even if follow-up maintenance is interrupted. */
export async function attemptTeamTaskCoverage(db:D1Database,now:number,userId?:string){try{await reconcileTeamTaskCoverage(db,{now,userId,limit:10,deadlineMs:Date.now()+1500});}catch{/* The scheduled original-task scan resumes independently. */}}
