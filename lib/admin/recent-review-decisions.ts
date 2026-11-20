import {recordedActionMatrix} from '../db/repositories/business-activity';
import {staffMutationGuard} from '../db/repositories/staff-mutation-guard';
import {reviewTaskReadProof} from '../workflows/review-tasks';
import type {NativeReviewTask as ReviewQueueTask} from './review-queue-view';
import {reviewTaskHref} from './review-task-links';

export interface RecentReviewDecision {id:string;actorId:string|null;actorName:string|null;createdAt:number;outcome:string;sourceType:string;sourceId:string;href:string;}
type Rule={namespace:string;from:string;source:string;actions:Record<string,string>;where?:string};
const publication:Rule={namespace:'product_publication_decision',from:'product_publication_decisions e JOIN product_publication_candidates c ON c.id=e.version_id',source:'c.case_id',actions:{approve_only:'Product approval recorded; publication remains separate',approve_and_publish:'Product publication decision recorded',publish_approved:'Approved product publication recorded',request_changes:'Product changes requested',reject:'Product rejection recorded'}};
const profile:Rule={namespace:'public_profile_event',from:'seller_public_profile_events e JOIN seller_public_profile_revisions c ON c.id=e.revision_id',source:'c.case_id',actions:{approved:'Public profile approved; publication remains separate',published:'Public profile publication recorded',changes_requested:'Public profile changes requested',rejected:'Public profile rejection recorded'}};
const rules:Partial<Record<ReviewQueueTask['sourceType'],Rule>>={
 product_intake_review:publication,product_intake_help:publication,public_profile:profile,
 public_profile_correction:{namespace:'public_profile_event',from:'seller_public_profile_events e',source:'e.correction_id',actions:{correction_authorized:'Profile correction authorized',correction_applied:'Profile correction applied',correction_declined:'Profile correction declined',correction_clarification:'Profile clarification requested'}},
 protected_change:{namespace:'protected_change_event',from:'seller_protected_change_events e',source:'e.case_id',actions:{permit:'Protected change permission recorded',reject:'Protected change rejection recorded',clarify:'Protected change clarification requested',identity_verified:'Identity verification recorded',bank_revalidated:'Bank revalidation recorded',evidence_only_classified:'Evidence-only classification recorded',holds_released:'Protected change holds released',holds_retained:'Protected change holds retained',packet_retired:'Protected change packet retired'}},
 seller_document:{namespace:'audit',from:'audit_logs e',source:'e.subject_id',where:"e.subject_type='seller_document'",actions:{'seller.document.verified':'Document verification recorded','seller.document.rejected':'Document rejection recorded','seller.document.correction_requested':'Document correction requested'}},
 document_change:{namespace:'audit',from:'audit_logs e',source:'e.subject_id',where:"e.subject_type='seller_document_change_request'",actions:{'seller.document.change_reviewed':'Document change review recorded'}},
};
for(const [sourceType,subjectType] of [['seller_application','seller'],['product_review','product'],['return_request','return_request'],['complaint','complaint']] as const){
 rules[sourceType]={namespace:'audit',from:'audit_logs e',source:'e.subject_id',where:`e.subject_type='${subjectType}'`,actions:Object.fromEntries(recordedActionMatrix.filter(row=>row.type===subjectType&&row.completed).map(row=>[row.action,row.outcome]))};
}

/** Minimal saved outcomes, scoped through the original review authority. Never a broad audit feed. */
export async function readRecentReviewDecisions(db:D1Database,actorId:string,tasks:readonly ReviewQueueTask[],returnTo='/admin',limit=8):Promise<RecentReviewDecision[]>{
 const reader=await staffMutationGuard(db,actorId,'account.self.manage',Error),size=Math.max(1,Math.min(20,Math.trunc(limit)||8));
 type Candidate={id:string;actorId:string|null;actorName:string|null;createdAt:number;action:string;sourceId:string;task:ReviewQueueTask;rule:Rule};
 const candidates:Candidate[]=[];
 for(const sourceType of new Set(tasks.map(task=>task.sourceType))){
  const rule=rules[sourceType];if(!rule)continue;
  const sources=new Map(tasks.filter(task=>task.sourceType===sourceType).map(task=>[task.sourceId,task])),ids=[...sources.keys()],actions=Object.keys(rule.actions);
  // Keep each native query within the D1 parameter limit; output is bounded, source scanning is not.
  for(let offset=0;offset<ids.length;offset+=40){
   const chunk=ids.slice(offset,offset+40);
   const rows=await db.prepare(`SELECT e.id,e.actor_id AS actorId,u.display_name AS actorName,e.created_at AS createdAt,e.action,${rule.source} AS sourceId FROM ${rule.from} LEFT JOIN users u ON u.id=e.actor_id WHERE ${rule.source} IN (${chunk.map(()=>'?').join(',')}) AND e.action IN (${actions.map(()=>'?').join(',')}) ${rule.where?'AND '+rule.where:''} ORDER BY e.created_at DESC,e.id DESC LIMIT ?`).bind(...chunk,...actions,size).all<Omit<Candidate,'task'|'rule'>>();
   for(const row of rows.results)candidates.push({...row,task:sources.get(row.sourceId)!,rule});
  }
 }
 const unique=new Map<string,Candidate>();
 for(const row of candidates.sort((a,b)=>b.createdAt-a.createdAt||a.id.localeCompare(b.id))){const key=row.rule.namespace+':'+row.id;if(!unique.has(key))unique.set(key,row);if(unique.size===size)break;}
 const selected=[...unique.values()],statements=[...reader.statements];
 for(const task of new Map(selected.map(row=>[row.task.id,row.task])).values()){
  const proof=await reviewTaskReadProof(db,actorId,task.id);
  if(proof.task.sourceType!==task.sourceType||proof.task.sourceId!==task.sourceId)throw new Error('The original review source changed.');
  statements.push(...proof.statements);
 }
 await db.batch(statements);
 return selected.map(row=>({id:row.rule.namespace+':'+row.id,actorId:row.actorId,actorName:row.actorName,createdAt:row.createdAt,outcome:row.rule.actions[row.action],sourceType:row.task.sourceType,sourceId:row.sourceId,href:reviewTaskHref(row.task,returnTo)}));
}
