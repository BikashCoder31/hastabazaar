import {calculateServiceDueAt,CONTINUOUS_CALENDAR_VERSION} from '../workflows/service-clock';

/** Internal retained proposal/decision facts; callers project their own authorized audience. */
export async function readRecoveryArrangement(db:D1Database,caseId:string){
 const proposal=await db.prepare('SELECT id,case_revision AS caseRevision,accepted_at AS acceptedAt,next_review_at AS nextReviewAt,amount_paisa AS amount,installments_json AS installmentsJson FROM seller_recovery_proposals WHERE case_id=? ORDER BY case_revision DESC LIMIT 1').bind(caseId).first<{id:string;caseRevision:number;acceptedAt:number;nextReviewAt:number;amount:number;installmentsJson:string}>();
 if(!proposal)return null;
 const events=(await db.prepare("SELECT id,revision,action,details_json AS details,created_at AS createdAt FROM seller_recovery_events WHERE case_id=? AND action IN('plan_approved','plan_reviewed','arrangement_reviewed','liability_corrected') ORDER BY revision").bind(caseId).all<{id:string;revision:number;action:string;details:string;createdAt:number}>()).results;
 const approved=events.find(event=>event.action==='plan_approved'&&JSON.parse(event.details).proposalId===proposal.id);
 const superseded=events.some(event=>event.action==='liability_corrected'&&event.revision>proposal.caseRevision);
 const decision=events.find(event=>event.action==='plan_reviewed'&&JSON.parse(event.details).proposalId===proposal.id);
 const reviewed=decision?{...decision,...JSON.parse(decision.details) as {proposalId:string;decision:'changes_requested'|'rejected';nextReviewAt:number;publicMessage:string}}:null;
 const followup=events.filter(event=>event.action==='arrangement_reviewed'&&JSON.parse(event.details).proposalId===proposal.id).at(-1);
 return {proposal,approved,reviewed,followup:followup?{...followup,...JSON.parse(followup.details) as {nextReviewAt:number;publicMessage:string}}:null,
  status:superseded?'superseded':approved?'approved':reviewed?.decision??'pending'};
}

export async function recoveryArrangementReviewWork(db:D1Database,caseId:string,remaining:number,scope:{planJson:string|null;disputed:number;blocker:string|null}){
 if(remaining<=0)return null;
 const arrangement=await readRecoveryArrangement(db,caseId);if(!arrangement||arrangement.status==='superseded')return null;
 if(arrangement.status==='approved'){
  if(!scope.planJson||JSON.parse(scope.planJson).proposalId!==arrangement.proposal.id)return null;
  const {proposal,approved,followup}=arrangement,startedAt=followup?.createdAt??approved!.createdAt;
  const next={key:'arrangement-review:'+(followup?.id??approved!.id),startedAt,dueAt:followup?.nextReviewAt??proposal.nextReviewAt,status:'arrangement_review'};
  let settled=Math.max(0,proposal.amount-remaining),paused=scope.blocker?remaining:Math.min(remaining,scope.disputed);
  for(const [index,item] of (JSON.parse(proposal.installmentsJson) as {amountPaisa:number;dueAt:number}[]).entries()){
   const covered=Math.min(settled,item.amountPaisa);settled-=covered;const outstanding=item.amountPaisa-covered,protectedAmount=Math.min(paused,outstanding);paused-=protectedAmount;
   // A reviewed overdue amount keeps its original due date in history. Its next owned action
   // follows the explicit review promise; a newly due installment still creates earlier work.
   if(outstanding>protectedAmount&&(!followup||item.dueAt>followup.createdAt)&&item.dueAt<=next.dueAt)
    return {key:'arrangement-installment:'+proposal.id+':'+index,startedAt:item.dueAt,dueAt:item.dueAt,status:'installment_followup'};
  }
  return next;
 }
 if(arrangement.reviewed){const review=arrangement.followup??arrangement.reviewed;return {key:'arrangement-response:'+review.id,startedAt:review.createdAt,dueAt:review.nextReviewAt,status:'arrangement_'+arrangement.reviewed.decision};}
 const proposal=arrangement.proposal;
 return {key:'proposal:'+proposal.id,startedAt:proposal.acceptedAt,dueAt:calculateServiceDueAt({startedAt:proposal.acceptedAt,amount:1,unit:'service_day',calendarVersion:CONTINUOUS_CALENDAR_VERSION}),status:'proposal_review'};
}
