import {calculateServiceDueAt,CONTINUOUS_CALENDAR_VERSION} from '../workflows/service-clock';
import {checkoutCommitClock} from '../checkout/commit-policy-guards';
import type {CommandContext} from '../workflows/contracts';
import {paymentGuard} from './manual-receipts';
import {financeEvidenceReferenceGuards} from './refund-evidence';
import {getRefundObligation,refundCommand,refundEvent,refundIndependence,refundText,RefundObligationError} from './refund-obligations';

/** An actual bank return carries its original deadline, even after an earlier correction. */
export function effectiveRefundBindingDeadlineSql(alias = 'r'): string {
 if (!/^[a-z_]{1,32}$/.test(alias)) throw new TypeError('Use an internal refund obligation alias.');
 const retry = `${alias}_binding_retry`;
 const reversal = `${alias}_binding_reversal`;
 const original = `${alias}_binding_original`;
 const originalDeadline = `${alias}_original_deadline`;
 const retryDeadline = `${alias}_retry_deadline`;
 return `COALESCE((
  SELECT ${originalDeadline}.binding_due_at
  FROM refund_obligations ${retry}
  JOIN customer_refund_reversals ${reversal} ON ${reversal}.receipt_id=${retry}.receipt_id
  JOIN refund_obligations ${original} ON ${original}.id=${reversal}.obligation_id
  JOIN refund_obligation_deadlines ${originalDeadline} ON ${originalDeadline}.obligation_id=${original}.id
  LEFT JOIN refund_obligation_deadlines ${retryDeadline} ON ${retryDeadline}.obligation_id=${retry}.id
  WHERE ${retry}.id=${alias}.id AND ${retry}.source_kind='receipt_return' AND ${reversal}.receipt_id=${retry}.source_id
    AND ${reversal}.amount_paisa=${retry}.cash_paisa
    AND ${original}.source_kind='return_refund' AND ${original}.state='completed'
    AND ${original}.customer_id=${retry}.customer_id
    AND (${retryDeadline}.binding_due_at IS NULL OR ${originalDeadline}.binding_due_at<${retryDeadline}.binding_due_at)
 ), (SELECT ${retryDeadline}.binding_due_at FROM refund_obligation_deadlines ${retryDeadline}
      WHERE ${retryDeadline}.obligation_id=${alias}.id))`;
}

export async function prepareOriginalRefundDeadline(db:D1Database,input:{obligationId:string;kind:string;sourceId:string;orderId:string|null;authorizedAt:number}){
 if (input.kind === 'receipt_return') {
  // The linked retry is inserted earlier in this same batch. An unrelated bank
  // credit has no original binding date. Finance keeps its own follow-up target.
  return [db.prepare(`INSERT INTO refund_obligation_deadlines
   (obligation_id,initiation_due_at,binding_due_at,calendar_version,policy_snapshot_json,created_at)
   SELECT retry.id,NULL,${effectiveRefundBindingDeadlineSql('retry')},NULL,?,${checkoutCommitClock(db)}
   FROM refund_obligations retry WHERE retry.id=? AND retry.source_kind='receipt_return'`)
   .bind(JSON.stringify({original:{},completionCalendarDays:null}),input.obligationId)];
 }
 let policy:Record<string,unknown>={},calendar:string|null=null,receivedAt:number|null=null,waived=false;const guards:D1PreparedStatement[]=[];
 if(input.kind==='return_refund'){
  const source=await db.prepare('SELECT c.policy_snapshot_json AS policy,h.calendar_version AS calendar,h.received_at AS received,h.waived_quantity AS waived FROM refunds r JOIN return_requests c ON c.id=r.return_request_id LEFT JOIN return_handling h ON h.case_id=c.id WHERE r.id=?').bind(input.sourceId).first<{policy:string;calendar:string|null;received:number|null;waived:number}>();
  if(source){policy=JSON.parse(source.policy);calendar=source.calendar;receivedAt=source.received;waived=source.waived>0;
   guards.push(...paymentGuard(db,`EXISTS(SELECT 1 FROM refunds r JOIN return_requests c ON c.id=r.return_request_id LEFT JOIN return_handling h ON h.case_id=c.id WHERE r.id=? AND c.policy_snapshot_json=? AND COALESCE(h.calendar_version,'')=COALESCE(?,'') AND COALESCE(h.received_at,-1)=COALESCE(?,-1) AND COALESCE(h.waived_quantity,0)=COALESCE(?,0))`,[input.sourceId,source.policy,source.calendar,source.received,source.waived]));
  }
 }else if(input.orderId){
  const source=await db.prepare('SELECT return_policy_snapshot_json AS policy FROM orders WHERE id=?').bind(input.orderId).first<{policy:string}>();
  if(source){policy=JSON.parse(source.policy);calendar=CONTINUOUS_CALENDAR_VERSION;waived=true;}
 }
 const days=policy.refundInitiationBusinessDays,completion=policy.refundCompletionCalendarDays;
 const initiation=calendar===CONTINUOUS_CALENDAR_VERSION&&typeof days==='number'&&Number.isSafeInteger(days)&&days>0?calculateServiceDueAt({startedAt:input.authorizedAt,amount:days,unit:'service_day',calendarVersion:calendar}):null;
 const completionDays=typeof completion==='number'&&Number.isSafeInteger(completion)&&completion>0?completion:null;
 const started=waived?input.authorizedAt:receivedAt,binding=started!==null&&completionDays!==null?started+completionDays*86400000:null;
 if(binding!==null&&!Number.isSafeInteger(binding))throw new RefundObligationError('Reconcile the original saved refund deadline.');
 return [...guards,db.prepare(`INSERT INTO refund_obligation_deadlines(obligation_id,initiation_due_at,binding_due_at,calendar_version,policy_snapshot_json,created_at) VALUES(?,?,?,?,?,${checkoutCommitClock(db)})`).bind(input.obligationId,initiation,binding,calendar,JSON.stringify({original:policy,completionCalendarDays:completionDays}))];
}

interface EarlierDeadlineInput {
 obligationId: string;
 dueAt: number;
 evidenceReference: string;
 reason: string;
 trigger?: { kind: 'reviewed_legal_trigger'; occurredAt: number; authorityReference: string };
}

export async function recordEarlierRefundDeadline(db:D1Database,ctx:CommandContext,input:EarlierDeadlineInput){
 const row = await getRefundObligation(db,input.obligationId);
 if (!row) throw new RefundObligationError('Open the original refund obligation.');
 const hasReviewedTrigger = input.trigger !== undefined;
 const cmd = await refundCommand(db,ctx,'earlier_deadline_retained',row.id,input,hasReviewedTrigger);
 if (cmd.receipt.replayed) return cmd.receipt.result as {id:string;revision:number};
 const evidenceReference = refundText(input.evidenceReference,'original binding deadline evidence');
 refundText(input.reason,'original policy or binding-date basis',20);
 const effectiveBinding = effectiveRefundBindingDeadlineSql('obligation');
 const dates = await db.prepare(`SELECT d.revision,${effectiveBinding} AS binding,${checkoutCommitClock(db)} AS now
  FROM refund_obligations obligation JOIN refund_obligation_deadlines d ON d.obligation_id=obligation.id
  WHERE obligation.id=?`).bind(row.id).first<{revision:number;binding:number|null;now:number}>();
 if (!dates || ctx.expectedRevision!==String(dates.revision) || !Number.isSafeInteger(input.dueAt) ||
     input.dueAt<=0 || input.dueAt>8_640_000_000_000_000 || dates.binding!==null&&input.dueAt>=dates.binding) {
  throw new RefundObligationError('Retain an evidenced earlier binding deadline. Internal handoff cannot extend it.');
 }
 if (dates.binding === null && !hasReviewedTrigger) {
  throw new RefundObligationError('A verified trigger and retained private Finance evidence are required to establish the binding deadline.');
 }
 const triggerGuards: D1PreparedStatement[] = [];
 if (hasReviewedTrigger) {
  const trigger = input.trigger;
  if (!trigger || trigger.kind!=='reviewed_legal_trigger' ||
      Object.keys(trigger).some(key => !['kind','occurredAt','authorityReference'].includes(key)) ||
      !Number.isSafeInteger(trigger.occurredAt) || trigger.occurredAt<=0 ||
      trigger.occurredAt>dates.now || trigger.occurredAt>input.dueAt) {
   throw new RefundObligationError('Record the actual reviewed trigger time and due date.');
  }
  refundText(trigger.authorityReference,'reviewed authority reference',8,191);
  const staffProof = `EXISTS(SELECT 1 FROM finance_evidence_intents intent
   JOIN finance_evidence_files file ON file.id=intent.id
   WHERE intent.id=? AND intent.scope_kind='obligation' AND intent.scope_id=? AND intent.uploaded_by<>?)`;
  const staffProofArgs = [evidenceReference,row.id,row.customerId];
  if (!/^fin-file-[a-f0-9]{64}$/.test(evidenceReference) ||
      !await db.prepare('SELECT 1 WHERE '+staffProof).bind(...staffProofArgs).first()) {
   throw new RefundObligationError('Use retained private evidence for the exact refund, reviewed by Finance.');
  }
  triggerGuards.push(...paymentGuard(db,staffProof,staffProofArgs));
 }
 const earlierBinding = hasReviewedTrigger
  ? `COALESCE((${effectiveBinding})>?,1)=1`
  : `(${effectiveBinding})>?`;
 return cmd.commit([
  ...await refundIndependence(db,ctx.actorId,row.customerId,row.orderId,row.receiptId),
  ...await financeEvidenceReferenceGuards(db,evidenceReference,{kind:'obligation',id:row.id}),
  ...triggerGuards,
  ...paymentGuard(db,`EXISTS(SELECT 1 FROM refund_obligations obligation WHERE obligation.id=? AND
   ${earlierBinding})`,[row.id,input.dueAt]),
  db.prepare('UPDATE refund_obligation_deadlines SET binding_due_at=?,revision=revision+1 WHERE obligation_id=? AND revision=?')
   .bind(input.dueAt,row.id,dates.revision),
  ...paymentGuard(db,'changes()=1'),
  await refundEvent(db,ctx,row.id,'earlier_deadline_retained','The earlier applicable refund due date has been retained. Internal processing does not restart it.',input),
 ],{id:row.id,revision:dates.revision+1});
}

