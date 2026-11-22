import {FORM_REGISTRY} from '../forms/registry';
import {checkoutCommitClock} from '../checkout/commit-policy-guards';
import {currentNativeSourceHashes,nativeFormContract,validateNativeReceipt} from './native-form-health';
import type {FormHealthScope} from './form-health';

type Candidate={id:string;formId:string;version:number;observedAt:number;kind:string};
type Key=[number,string,string];
type Position={after:Key;through:Key;sourceCount?:number};
function key(row:Candidate):Key{return [Number(row.observedAt),row.kind,row.id];}
function position(value:string):Position|null{
 if(!value)return null;
 const parsed=JSON.parse(value) as Position;
 const valid=(v:unknown):v is Key=>Array.isArray(v)&&v.length===3&&Number.isSafeInteger(v[0])&&v[0]>=0&&['native_command','core_receipt','form_answer_set'].includes(v[1])&&typeof v[2]==='string'&&v[2].length>0&&v[2].length<=191;
 if(!parsed||!valid(parsed.after)||!valid(parsed.through)||parsed.sourceCount!==undefined&&(!Number.isSafeInteger(parsed.sourceCount)||parsed.sourceCount<0))throw new Error('Form save scan progress is invalid.');
 return parsed;
}
async function fingerprint(value:unknown){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value)))),v=>v.toString(16).padStart(2,'0')).join('');}

/** A cursor is progress, never successful-save evidence. Revisit rejected originals on
 * the next finite sweep, so recovered evidence and backdated arrivals cannot be lost. */
export async function sweepCommittedFormSaves(db:D1Database,input:FormHealthScope){
 const result={recorded:0,scanned:0,busy:false,budgetExhausted:false,completedThrough:null as number|null};
 const expired=()=>input.deadlineMs!==undefined&&Date.now()>=input.deadlineMs;
 if(input.environment==='unknown')return result;
 if(expired()){result.budgetExhausted=true;return result;}
 const hashes=await currentNativeSourceHashes(),limit=input.limit??100;
 const scalar=(column:string,path:string)=>`${(db as D1Database&{dialect?:string}).dialect==='mariadb'?'JSON_VALUE':'json_extract'}(CASE WHEN json_valid(${column}) THEN ${column} ELSE NULL END,'$.${path}')`;
 const sources=`SELECT id,form_id formId,${scalar('answers_json','version')} version,created_at observedAt,'form_answer_set' kind FROM form_answer_sets WHERE health_environment=? AND health_release_id=?
 UNION ALL SELECT id,${scalar('next_json','formId')} formId,${scalar('next_json','version')} version,created_at observedAt,'core_receipt' kind FROM audit_logs WHERE action='form.core_answers' AND ${scalar('next_json','healthScope.environment')}=? AND ${scalar('next_json','healthScope.releaseId')}=?
 UNION ALL SELECT id,${scalar('next_json','nativeFormHealth.formId')} formId,${scalar('next_json','nativeFormHealth.version')} version,created_at observedAt,'native_command' kind FROM audit_logs WHERE ${scalar('next_json','nativeFormHealth.environment')}=? AND ${scalar('next_json','nativeFormHealth.releaseId')}=? AND ${scalar('next_json','nativeFormHealth.sourceHash')} IN(${hashes.map(()=>'?').join(',')})`;
 const values=[input.environment,input.releaseId,input.environment,input.releaseId,input.environment,input.releaseId,...hashes,input.now,...(input.formId?[input.formId]:[])];
 const scopedSources=`FROM (${sources}) saved WHERE observedAt<=? ${input.formId?'AND formId=?':''}`;
 const candidates=`SELECT * ${scopedSources} AND NOT EXISTS(SELECT 1 FROM form_health_observations o WHERE o.evidence_kind=saved.kind AND o.evidence_id=saved.id)`;
 // The namespace is private to this consumer and bounded independently of release ID length.
 const family='form-saves:'+await fingerprint([input.environment,input.releaseId,input.formId??null,hashes]);
 const token=crypto.randomUUID(),clock=checkoutCommitClock(db);
 await db.prepare('INSERT OR IGNORE INTO operational_reminder_cursors(family) VALUES(?)').bind(family).run();
 const claim=await db.prepare(`UPDATE operational_reminder_cursors SET lease_token=?,lease_until=${clock}+60000,revision=revision+1 WHERE family=? AND (lease_token IS NULL OR lease_until<=${clock})`).bind(token,family).run();
 if(!claim.meta.changes){result.busy=true;return result;}
 try{
  const marker=await db.prepare('SELECT `cursor` AS `cursor`,revision FROM operational_reminder_cursors WHERE family=? AND lease_token=?').bind(family,token).first<{cursor:string;revision:number}>();
  if(!marker)throw new Error('Form save scan lease changed.');
  const previous=position(marker.cursor);let revision=marker.revision;
  const upper=previous?.through??await (async()=>{const last=await db.prepare(candidates+' ORDER BY observedAt DESC,kind DESC,id DESC LIMIT 1').bind(...values).first<Candidate>();return last?key(last):null;})();
  if(!upper){result.budgetExhausted=expired();if(!result.budgetExhausted)result.completedThrough=input.now;return result;}
  // Count originals, including already copied saves: another consumer delivering
  // evidence does not change this window, while a new backdated receipt does.
  const countSources=async()=>Number((await db.prepare('SELECT COUNT(*) total '+scopedSources+' AND (observedAt,kind,id)<=(?,?,?)').bind(...values,...upper).first<{total:number}>())!.total);
  const sourceCount=previous?previous.sourceCount??null:await countSources();
  // One lookahead distinguishes a full page from an exhausted sweep; no validation of it occurs.
  const rows=(await db.prepare(candidates+` AND (observedAt,kind,id)<=(?,?,?) ${previous?'AND (observedAt,kind,id)>(?,?,?)':''} ORDER BY observedAt,kind,id LIMIT ?`).bind(...values,...upper,...(previous?previous.after:[]),limit+1).all<Candidate>()).results;
  const checkpoint=async(value:string,observation?:D1PreparedStatement)=>{
   const guard=crypto.randomUUID();
   const statements=[db.prepare(`UPDATE operational_reminder_cursors SET \`cursor\`=?,revision=revision+1 WHERE family=? AND lease_token=? AND revision=? AND lease_until>${clock}`).bind(value,family,token,revision),
    db.prepare('INSERT INTO staff_permission_guards(id,valid) SELECT ?,CASE WHEN changes()=1 THEN 1 ELSE 0 END').bind(guard),db.prepare('DELETE FROM staff_permission_guards WHERE id=?').bind(guard),...(observation?[observation]:[])];
   const committed=await db.batch(statements);revision++;
   if(observation)result.recorded+=committed[committed.length-1].meta.changes??0;
  };
  for(let index=0;index<Math.min(limit,rows.length);index++){
   if(expired()){result.budgetExhausted=true;break;}
   const row=rows[index];let source:{formId:string;version:number}|null=null;
   if(row.kind==='native_command'){
    const receipt=await db.prepare('SELECT id,action,subject_type subjectType,subject_id subjectId,actor_id actorId,request_id requestId,command_result_json result,next_json metadata,created_at observedAt,command_key commandKey,command_digest commandDigest FROM audit_logs WHERE id=?').bind(row.id).first<Parameters<typeof validateNativeReceipt>[1]>();
    if(receipt)source=await validateNativeReceipt(db,{...receipt,observedAt:Number(receipt.observedAt)},input.environment,input.releaseId);
   }else if(FORM_REGISTRY[row.formId]&&!await nativeFormContract(row.formId)&&Number.isSafeInteger(Number(row.version))&&Number(row.version)>0){source={formId:row.formId,version:Number(row.version)};}
   const id=crypto.randomUUID(),observation=source?db.prepare("INSERT OR IGNORE INTO form_health_observations(id,support_reference,environment,release_id,form_id,form_version,journey,phase,outcome,category,evidence_kind,evidence_id,observed_at) VALUES(?,?,?,?,?,?,?,'save','saved','durable_submission',?,?,?)").bind(id,'form-health-'+id,input.environment,input.releaseId,source.formId,source.version,FORM_REGISTRY[source.formId].adapterId,row.kind,row.id,Number(row.observedAt)):undefined;
   await checkpoint(index===rows.length-1?'':JSON.stringify({after:key(row),through:upper,...(sourceCount===null?{}:{sourceCount})}),observation);
   result.scanned++;
  }
  if(!rows.length)await checkpoint('');
  result.budgetExhausted||=rows.length>limit||expired();
  if(!result.budgetExhausted){
   // The fixed upper key guarantees finite progress through retained invalid
   // originals. New forward receipts belong to the next sweep, but must not be
   // mistaken for a completed recovery check in this invocation.
   const pending=await db.prepare(candidates+' AND (observedAt,kind,id)>(?,?,?) LIMIT 1').bind(...values,...upper).first<Candidate>();
   result.budgetExhausted=!!pending||expired();
   // Legacy progress without a window count finishes safely, then obtains a
   // fresh snapshot on the next sweep. Counts are progress, never save proof.
   if(!result.budgetExhausted)result.budgetExhausted=sourceCount===null||await countSources()!==sourceCount||expired();
   // With no forward receipt left through this invocation's horizon, newly
   // delivered failures can be evaluated too; an old sweep start time must not
   // indefinitely hide a continuing outage with fresh blocked observations.
   if(!result.budgetExhausted)result.completedThrough=input.now;
  }
  return result;
 }finally{await db.prepare('UPDATE operational_reminder_cursors SET lease_token=NULL,lease_until=NULL WHERE family=? AND lease_token=?').bind(family,token).run();}
}
