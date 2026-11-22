import {bankSatisfiedReceiptReturnSql} from './receipt-return-bank-satisfaction';
import {actualManualReceiptUseSql} from './receipt-use-accounting';
import {actualRecoveryAllocationSql} from './recovery-receipt-accounting';
import {staffReadGuard} from '../db/repositories/staff-mutation-guard';
import {responseScopeContains} from '../orders/response-sql';
import {checkoutCommitClock} from '../checkout/commit-policy-guards';
import {fundingAvailableSql} from './refund-funding';
import {RefundObligationError} from './refund-obligations';
import {refundEventValueSql} from './refund-current-progress';
import {effectiveRefundBindingDeadlineSql} from './refund-deadlines';
import {linkedOriginalRefundConflictSql} from './refund-party-scope';
import type {RefundBankDetails} from './refund-destinations';
class AccessError extends RefundObligationError{constructor(message:string){super(message,403);}}
const moneyColumns=`r.id,r.source_kind AS sourceKind,r.source_id AS sourceId,r.order_id AS orderId,r.customer_id AS customerId,r.cash_paisa AS originalCashPaisa,${bankSatisfiedReceiptReturnSql('r')} AS bankSatisfiedPaisa,r.cash_paisa-${bankSatisfiedReceiptReturnSql('r')} AS cashPaisa,r.wallet_paisa AS walletPaisa,COALESCE((SELECT c.wallet_restored_paisa FROM cancellation_refund_sources c WHERE r.source_kind='cancellation' AND c.id=r.source_id),0) AS alreadyRestoredWalletPaisa,r.state,r.revision,r.authorized_at AS authorizedAt,r.first_finance_due_at AS firstFinanceDueAt,r.next_update_at AS nextUpdateAt,(SELECT d.initiation_due_at FROM refund_obligation_deadlines d WHERE d.obligation_id=r.id) AS initiationDueAt,${effectiveRefundBindingDeadlineSql('r')} AS bindingDueAt,(SELECT d.revision FROM refund_obligation_deadlines d WHERE d.obligation_id=r.id) AS deadlineRevision`;
export interface RefundWorkspaceRow{id:string;sourceKind:string;sourceId:string;orderId:string|null;customerId:string;cashPaisa:number;originalCashPaisa:number;bankSatisfiedPaisa:number;walletPaisa:number;alreadyRestoredWalletPaisa:number;state:string;revision:number;authorizedAt:number;firstFinanceDueAt:number;nextUpdateAt:number;initiationDueAt:number|null;bindingDueAt:number|null;deadlineRevision:number|null;orderNumber:string|null;customerName:string;ownerName:string;}
type RefundPacketActor = { id: string; displayName: string };
type RefundPacketReview = {
  preparedBy: RefundPacketActor;
  approvedBy: RefundPacketActor | null;
  approvedAt: number | null;
  startedBy: RefundPacketActor | null;
  startedAt: number | null;
  recordedBy: RefundPacketActor | null;
  recordedAt: number | null;
  evidenceReference: string | null;
  submission?: { acknowledgedAt: number; recordedBy: RefundPacketActor; evidenceReference: string };
  settlement?: { bankAt: number; transactionIdentity: string };
};
export interface RefundPacketSummary {
  id: string;
  obligationId: string;
  state: string;
  revision: number;
  amountPaisa: number;
  destinationVersionId: string | null;
  fundingStatementId: string | null;
  preparedAt: number;
  route: 'manual_bank' | 'credit_restoration';
  privateReview?: RefundPacketReview;
}
type RefundAdminPacketRow = Omit<RefundPacketSummary, 'route' | 'privateReview'> & {
  preparedActorId: string | null;
  preparedActorName: string | null;
  approvedActorId: string | null;
  approvedActorName: string | null;
  approvedAt: number | null;
  startedActorId: string | null;
  startedActorName: string | null;
  startedAt: number | null;
  recordedActorId: string | null;
  recordedActorName: string | null;
  recordedAt: number | null;
  submittedActorId: string | null;
  submittedActorName: string | null;
  acknowledgedAt: number | string | null;
  submissionEvidenceReference: string | null;
  evidenceReference: string | null;
  bankAt: number | null;
  transactionIdentity: string | null;
};
type RefundAdminRow = RefundWorkspaceRow & {
  independentReviewer: number;
  sourceSnapshotJson: string;
  itemPaisa: number | null;
  deliveryPaisa: number | null;
};
type RefundReturnTender = { merchandisePaisa: number; deliveryPaisa: number; referralOffsetPaisa: number; promoOffsetPaisa: number };

function independentRefundSql(db: D1Database, obligation: string, actor: string) {
  return `${obligation}.customer_id<>${actor}
    AND NOT EXISTS(SELECT 1 FROM order_items item JOIN seller_profiles seller ON seller.id=item.seller_id
      WHERE item.order_id=${obligation}.order_id AND seller.user_id=${actor})
    AND NOT EXISTS(SELECT 1 FROM company_receipt_conflicts conflict
      WHERE conflict.receipt_id=${obligation}.receipt_id AND conflict.user_id=${actor})
    AND NOT ${linkedOriginalRefundConflictSql(db, `${obligation}.receipt_id`, actor)}`;
}

function summarizeRefundObligation({
  independentReviewer, sourceSnapshotJson, itemPaisa, deliveryPaisa, ...row
}: RefundAdminRow): RefundWorkspaceRow & { independentReviewer: boolean; returnTender?: RefundReturnTender } {
  const base = { ...row, independentReviewer: Boolean(independentReviewer) };
  if (row.sourceKind !== 'return_refund') return base;
  const retained = JSON.parse(sourceSnapshotJson) as {
    amount?: unknown; wallet?: unknown; referral?: unknown; promo?: unknown;
  } | null;
  const paisa = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
  if (!paisa(itemPaisa) || !paisa(deliveryPaisa) || !paisa(retained?.amount) ||
      !paisa(retained.wallet) || !paisa(retained.referral) || !paisa(retained.promo) ||
      retained.amount !== itemPaisa + deliveryPaisa || retained.wallet !== row.walletPaisa ||
      row.originalCashPaisa !== retained.amount - retained.wallet - retained.referral - retained.promo) return base;
  return { ...base, returnTender: {
    merchandisePaisa: itemPaisa, deliveryPaisa, referralOffsetPaisa: retained.referral, promoOffsetPaisa: retained.promo,
  } };
}

function summarizeRefundPacket({
  preparedActorId, preparedActorName, approvedActorId, approvedActorName, approvedAt,
  startedActorId, startedActorName, startedAt, recordedActorId, recordedActorName, recordedAt,
  submittedActorId, submittedActorName, acknowledgedAt, submissionEvidenceReference, evidenceReference,
  bankAt, transactionIdentity, ...packet
}: RefundAdminPacketRow): RefundPacketSummary {
  const route = packet.amountPaisa > 0 ? 'manual_bank' : 'credit_restoration';
  const actor = (id: string, name: string | null) => ({ id, displayName: name ?? id });
  const submittedAt = Number(acknowledgedAt);
  if (!preparedActorId) return { ...packet, route };
  return { ...packet, route, privateReview: {
    preparedBy: actor(preparedActorId, preparedActorName),
    approvedBy: approvedActorId ? actor(approvedActorId, approvedActorName) : null, approvedAt,
    startedBy: startedActorId ? actor(startedActorId, startedActorName) : null, startedAt,
    recordedBy: recordedActorId ? actor(recordedActorId, recordedActorName) : null, recordedAt,
    evidenceReference,
    ...(submittedActorId && Number.isSafeInteger(submittedAt) && submittedAt > 0 && submissionEvidenceReference
      ? { submission: { acknowledgedAt: submittedAt, recordedBy: actor(submittedActorId, submittedActorName), evidenceReference: submissionEvidenceReference } }
      : {}),
    ...(bankAt !== null && transactionIdentity ? { settlement: { bankAt, transactionIdentity } } : {}),
  } };
}
export interface RefundDestinationSummary{id:string;obligationId:string;revision:number;status:string;label:string;headRevision:number;current:boolean;relationship:string;privateReview?:{details:RefundBankDetails;authorization:string;evidenceReference:string};}
export interface RefundFundingSummary{versionId:string;accountId:string;label:string;statementId:string|null;revision:number|null;availablePaisa:number|null;asOf:number|null;}
export interface CustomerReturnedCreditSummary{packetId:string;id:string;revision:number;amountPaisa:number;bankAt:number;label:string;}
export interface CustomerRefundReversalSummary{id:string;obligationId:string;packetId:string;receiptId:string;amountPaisa:number;createdAt:number;dispositionKind:string|null;retryObligationId:string|null;correctionId:string|null;}
function masked(details:RefundBankDetails){return details.bank+' · •••• '+details.accountNumber.slice(-4);}
export interface RefundWorkspacePageOptions{limit?:number;search?:string;cursor?:string;sourceCursor?:string;workOnly?:boolean;}
type QueueCursor={at:number;id:string;rank?:number;kind?:string};
function readCursor(value:string|undefined,source=false):QueueCursor|null{
 if(value===undefined)return null;
 try{
  if(typeof value!=='string'||value.length>2048)throw new Error();
  const row=JSON.parse(decodeURIComponent(value)) as QueueCursor;
  if(!row||Array.isArray(row)||!Number.isSafeInteger(row.at)||row.at<0||typeof row.id!=='string'||!row.id||row.id.length>191||Object.keys(row).length!==3||
   (source?!['return_refund','receipt_return','service_fee','cancellation'].includes(row.kind??''):row.rank!==0&&row.rank!==1))throw new Error();
  return row;
 }catch{throw new RefundObligationError('Use a current refund queue page.',400);}
}
const writeCursor=(cursor:QueueCursor)=>encodeURIComponent(JSON.stringify(cursor));
export async function getRefundFinanceWorkspace(db:D1Database,actorId:string,caseId?:string,obligationId?:string,options:RefundWorkspacePageOptions={}){
 const authority=await staffReadGuard(db,actorId,['refund.approve.standard','refund.view'],AccessError),superAdmin=authority.role==='super_admin';
 const limit=options.limit??100;
 if(!Number.isSafeInteger(limit)||limit<1||limit>100||options.search!==undefined&&(typeof options.search!=='string'||options.search.length>160))throw new RefundObligationError('Use a search of up to 160 characters and a page of 1–100 records.',400);
 const search=options.search?.trim()??'',cursor=readCursor(options.cursor),sourceCursor=readCursor(options.sourceCursor,true);
 const caseScope=caseId?"AND EXISTS(SELECT 1 FROM refunds x WHERE x.id=r.source_id AND x.return_request_id=?)":'',values=caseId?[caseId]:[];
 const scope=caseScope+(obligationId?' AND r.id=?':'');
 const rank="CASE WHEN r.state='completed' THEN 1 ELSE 0 END";
 const searchSql=search?"AND (INSTR(LOWER(COALESCE(o.order_number,'')),LOWER(?))>0 OR r.id=? OR r.source_id=? OR EXISTS(SELECT 1 FROM company_money_receipts receipt WHERE r.source_kind='receipt_return' AND receipt.id=r.source_id AND INSTR(LOWER(receipt.transaction_identity),LOWER(?))>0))":'';
 const after=cursor&&!obligationId?`AND (${rank}>? OR ${rank}=? AND (r.authorized_at>? OR r.authorized_at=? AND r.id>?))`:'';
 const workOnly=options.workOnly?"AND (r.state<>'completed' OR EXISTS(SELECT 1 FROM customer_refund_reversals returned WHERE returned.obligation_id=r.id))":'';
 const rows=await db.prepare(`SELECT ${moneyColumns},o.order_number AS orderNumber,u.display_name AS customerName,owner.display_name AS ownerName,
   CASE WHEN ${independentRefundSql(db,'r','viewer.id')} THEN 1 ELSE 0 END AS independentReviewer,
   r.source_snapshot_json AS sourceSnapshotJson,original.item_amount_paisa AS itemPaisa,original.delivery_amount_paisa AS deliveryPaisa
   FROM refund_obligations r LEFT JOIN orders o ON o.id=r.order_id JOIN users u ON u.id=r.customer_id JOIN users owner ON owner.id=r.owner_id
   LEFT JOIN refunds original ON r.source_kind='return_refund' AND original.id=r.source_id AND original.order_id=r.order_id
   CROSS JOIN (SELECT ? AS id) viewer
   WHERE (r.state<>'completed' OR ?=1 OR r.source_kind='return_refund' AND EXISTS(
     SELECT 1 FROM outgoing_payment_packets packet WHERE packet.obligation_id=r.id AND packet.state='paid' AND packet.amount_paisa>0))
   ${scope} ${searchSql} ${after} ${workOnly} ORDER BY ${rank},r.authorized_at,r.id LIMIT ?`)
   .bind(actorId,caseId||obligationId?1:0,...values,...obligationId?[obligationId]:[],...search?[search,search,search,search]:[],
     ...after?[cursor!.rank,cursor!.rank,cursor!.at,cursor!.at,cursor!.id]:[],limit+1).all<RefundAdminRow>();
 const moreObligations=rows.results.length>limit;rows.results=rows.results.slice(0,limit);
 const ids=rows.results.map(row=>row.id),placeholders=ids.map(()=>'?').join(',')||'NULL';
 const submitted = (path: string) => refundEventValueSql(db, path);
 const packets=await db.prepare(`SELECT packet.id,packet.obligation_id AS obligationId,packet.state,packet.revision,packet.amount_paisa AS amountPaisa,
   packet.destination_version_id AS destinationVersionId,packet.funding_statement_id AS fundingStatementId,packet.prepared_at AS preparedAt,
   preparer.id AS preparedActorId,preparer.display_name AS preparedActorName,
   approver.id AS approvedActorId,approver.display_name AS approvedActorName,
   starter.id AS startedActorId,starter.display_name AS startedActorName,
   recorder.id AS recordedActorId,recorder.display_name AS recordedActorName,
   submitter.id AS submittedActorId,submitter.display_name AS submittedActorName,
   ${submitted('acknowledgedAt')} AS acknowledgedAt,${submitted('evidenceReference')} AS submissionEvidenceReference,
   CASE WHEN reviewer.id IS NOT NULL THEN packet.approved_at END AS approvedAt,
   CASE WHEN reviewer.id IS NOT NULL THEN packet.started_at END AS startedAt,
   CASE WHEN reviewer.id IS NOT NULL THEN packet.recorded_at END AS recordedAt,
   CASE WHEN reviewer.id IS NOT NULL THEN packet.evidence_reference END AS evidenceReference,
   bank.bank_at AS bankAt,bank.transaction_identity AS transactionIdentity
   FROM outgoing_payment_packets packet
   JOIN refund_obligations r ON r.id=packet.obligation_id
   CROSS JOIN (SELECT ? AS id,? AS super_admin) viewer
   LEFT JOIN company_payment_account_versions funding_account ON funding_account.id=packet.account_version_id
   LEFT JOIN users reviewer ON viewer.super_admin=1 AND reviewer.id=viewer.id AND ${independentRefundSql(db,'r','viewer.id')}
     AND (packet.account_version_id IS NULL OR (funding_account.id IS NOT NULL AND NOT ${responseScopeContains(db,'funding_account.conflicts_json','viewer.id')}))
   LEFT JOIN users preparer ON reviewer.id IS NOT NULL AND preparer.id=packet.prepared_by
   LEFT JOIN users approver ON reviewer.id IS NOT NULL AND approver.id=packet.approved_by
   LEFT JOIN users starter ON reviewer.id IS NOT NULL AND starter.id=packet.started_by
   LEFT JOIN users recorder ON reviewer.id IS NOT NULL AND recorder.id=packet.recorded_by
   LEFT JOIN refund_obligation_events native_event ON reviewer.id IS NOT NULL AND native_event.id=(
     SELECT native_event.id FROM refund_obligation_events native_event
     JOIN finance_evidence_intents intent ON intent.id=${submitted('evidenceReference')}
       AND intent.scope_kind='obligation' AND intent.scope_id=r.id AND intent.uploaded_by<>r.customer_id
     JOIN finance_evidence_files evidence ON evidence.id=intent.id
     WHERE native_event.obligation_id=r.id AND native_event.action='packet_submitted' AND packet.id=${submitted('packetId')}
       AND packet.amount_paisa=${submitted('amountPaisa')} AND packet.account_version_id=${submitted('accountVersionId')}
       AND packet.destination_version_id=${submitted('destinationVersionId')} AND packet.revision>=${submitted('packetRevision')}
       AND ${submitted('acknowledgedAt')} BETWEEN packet.started_at AND native_event.created_at
     ORDER BY native_event.created_at,native_event.id LIMIT 1)
   LEFT JOIN users submitter ON submitter.id=native_event.actor_id
   LEFT JOIN company_outgoing_bank_identities bank ON reviewer.id IS NOT NULL AND packet.state='paid' AND bank.packet_kind='refund'
     AND bank.packet_id=packet.id AND bank.identity_hash=packet.transaction_identity_hash AND bank.account_version_id=packet.account_version_id
     AND bank.amount_paisa=packet.amount_paisa AND bank.bank_at=packet.bank_at AND bank.transaction_identity=packet.transaction_identity
   WHERE packet.obligation_id IN(${placeholders}) ORDER BY packet.prepared_at,packet.id`)
   .bind(actorId,superAdmin?1:0,...ids).all<RefundAdminPacketRow>();
 const reversals=await db.prepare(`SELECT reversal.id,reversal.obligation_id obligationId,reversal.packet_id packetId,reversal.receipt_id receiptId,reversal.amount_paisa amountPaisa,reversal.created_at createdAt,d.kind dispositionKind,d.retry_obligation_id retryObligationId,d.correction_id correctionId FROM customer_refund_reversals reversal LEFT JOIN customer_refund_reversal_dispositions d ON d.reversal_id=reversal.id WHERE reversal.obligation_id IN(${placeholders}) ORDER BY reversal.created_at,reversal.id`).bind(...ids).all<CustomerRefundReversalSummary>();
 const returnedCredits=superAdmin?await db.prepare(`SELECT packet.id packetId,receipt.id,control.revision,receipt.amount_minor amountPaisa,receipt.bank_at bankAt,receipt.transaction_identity label FROM outgoing_payment_packets packet JOIN refund_obligations original ON original.id=packet.obligation_id JOIN company_money_receipts receipt ON receipt.payer_user_id=original.customer_id AND receipt.account_version_id=packet.account_version_id JOIN company_receipt_controls control ON control.receipt_id=receipt.id WHERE original.id IN(${placeholders}) AND original.source_kind='return_refund' AND packet.state='paid' AND packet.amount_paisa>0 AND receipt.kind='bank_credit' AND receipt.status='verified' AND receipt.currency='NPR' AND receipt.bank_at>packet.bank_at AND receipt.amount_minor<=packet.amount_paisa-COALESCE((SELECT SUM(prior.amount_paisa) FROM customer_refund_reversals prior WHERE prior.packet_id=packet.id),0) AND NOT EXISTS(SELECT 1 FROM customer_refund_reversals prior WHERE prior.receipt_id=receipt.id) AND NOT EXISTS(SELECT 1 FROM company_receipt_reversals reversed WHERE reversed.receipt_id=receipt.id) AND NOT EXISTS(SELECT 1 FROM manual_receipt_uses used WHERE used.receipt_id=receipt.id AND used.state<>'released') AND NOT EXISTS(SELECT 1 FROM seller_recovery_allocations used WHERE used.receipt_id=receipt.id) ORDER BY receipt.bank_at,receipt.id LIMIT 100`).bind(...ids).all<CustomerReturnedCreditSummary>():{results:[] as CustomerReturnedCreditSummary[]};
 const destinations=await db.prepare(`SELECT d.id,d.obligation_id AS obligationId,d.status,d.revision,d.details_json AS details,d.relationship,d.customer_authorization AS authorization,d.evidence_reference AS evidenceReference,h.revision AS headRevision,h.version_id=d.id AS current FROM refund_destination_versions d JOIN refund_destination_heads h ON h.obligation_id=d.obligation_id WHERE d.obligation_id IN(${placeholders}) ORDER BY d.number DESC`).bind(...ids).all<Omit<RefundDestinationSummary,'label'|'privateReview'|'current'>&{details:string;authorization:string;evidenceReference:string;current:number}>();
 const sourceSelects=[`SELECT r.id AS sourceId,'return_refund' AS kind,o.order_number AS label,r.amount_paisa-r.wallet_credit_paisa-r.referral_discount_paisa-r.promo_discount_paisa AS cashPaisa,r.approved_at AS authorizedAt FROM refunds r JOIN orders o ON o.id=r.order_id WHERE r.status IN('approved','failed') AND o.customer_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM refund_obligations x WHERE x.source_kind='return_refund' AND x.source_id=r.id) ${caseId?'AND r.return_request_id=?':''} ${obligationId?'AND 0':''}`];
 if(superAdmin&&!caseId&&!obligationId)sourceSelects.push(`SELECT r.id AS sourceId,'receipt_return' AS kind,r.transaction_identity AS label,r.amount_minor-(COALESCE((SELECT SUM(${actualManualReceiptUseSql('u')}) FROM manual_receipt_uses u WHERE u.receipt_id=r.id AND u.state<>'released'),0)+COALESCE((SELECT SUM(${actualRecoveryAllocationSql('recovery_use')}) FROM seller_recovery_allocations recovery_use WHERE recovery_use.receipt_id=r.id),0))-COALESCE((SELECT SUM(x.amount_minor) FROM company_receipt_reversals x WHERE x.receipt_id=r.id),0) AS cashPaisa,r.confirmed_at AS authorizedAt FROM company_money_receipts r WHERE r.status='verified' AND r.currency='NPR' AND r.payer_user_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM refund_obligations x WHERE x.source_kind='receipt_return' AND x.source_id=r.id)`);
 if(!caseId&&!obligationId){
  sourceSelects.push("SELECT c.id AS sourceId,'cancellation' AS kind,o.order_number AS label,c.cash_paisa AS cashPaisa,c.authorized_at AS authorizedAt FROM cancellation_refund_sources c JOIN orders o ON o.id=c.order_id WHERE c.state='authorized' AND c.customer_id IS NOT NULL AND c.cash_paisa>0 AND NOT EXISTS(SELECT 1 FROM refund_obligations r WHERE r.source_kind='cancellation' AND r.source_id=c.id)");
  sourceSelects.push("SELECT f.id AS sourceId,'service_fee' AS kind,o.order_number AS label,f.amount_paisa AS cashPaisa,f.authorized_at AS authorizedAt FROM lawful_fee_refund_authorizations f JOIN orders o ON o.id=f.order_id WHERE f.state='authorized' AND NOT EXISTS(SELECT 1 FROM refund_obligations r WHERE r.source_kind='service_fee' AND r.source_id=f.id)");
 }
 const sources=await db.prepare(`SELECT sourceId,kind,label,cashPaisa,authorizedAt FROM (${sourceSelects.join(' UNION ALL ')}) source_queue WHERE (kind<>'receipt_return' OR cashPaisa>0) ${search?'AND (INSTR(LOWER(label),LOWER(?))>0 OR sourceId=?)':''} ${sourceCursor?'AND (authorizedAt>? OR authorizedAt=? AND (kind>? OR kind=? AND sourceId>?))':''} ORDER BY authorizedAt,kind,sourceId LIMIT ?`).bind(...values,...search?[search,search]:[],...sourceCursor?[sourceCursor.at,sourceCursor.at,sourceCursor.kind,sourceCursor.kind,sourceCursor.id]:[],limit+1).all<{sourceId:string;kind:'return_refund'|'receipt_return'|'service_fee'|'cancellation';label:string;cashPaisa:number;authorizedAt:number}>();
 const moreSources=sources.results.length>limit;sources.results=sources.results.slice(0,limit);
 const accounts=await db.prepare(`SELECT v.id AS versionId,v.account_id AS accountId,v.details_json AS details,a.statement_id AS statementId,a.revision,s.as_of AS asOf,${fundingAvailableSql()} AS availablePaisa FROM company_payment_account_versions v JOIN company_payment_accounts h ON h.latest_version_id=v.id LEFT JOIN company_funding_accounts a ON a.account_id=v.account_id LEFT JOIN company_funding_statements s ON s.id=a.statement_id WHERE v.status='verified' ORDER BY v.created_at,v.id`).all<Omit<RefundFundingSummary,'label'>&{details:string}>();
 const funding=accounts.results.filter(row=>['both','payment_source'].includes(JSON.parse(row.details).purpose)).map(({details,...row})=>({...row,label:masked(JSON.parse(details))}));
 const independentObligations=new Set(superAdmin?rows.results.filter(row=>row.independentReviewer).map(row=>row.id):[]);
 const reviewableDestinations=destinations.results.map(({details,authorization,evidenceReference,current,...row}):RefundDestinationSummary=>{
  const bankDetails=JSON.parse(details) as RefundBankDetails;
  const basic={...row,current:Boolean(current),label:masked(bankDetails)};
  return independentObligations.has(row.obligationId)
   ?{...basic,privateReview:{details:bankDetails,authorization,evidenceReference}}
   :basic;
 });
 await db.batch([...authority.statements,...(reviewableDestinations.some(row=>row.privateReview)?[
  db.prepare(`INSERT INTO audit_logs(id,actor_id,action,subject_type,subject_id,created_at) VALUES(?,?,'refund.destination.private_review','refund_obligation','workspace',${checkoutCommitClock(db)})`)
   .bind(crypto.randomUUID(),actorId)
 ]:[])]);
 const lastObligation=rows.results.at(-1),lastSource=sources.results.at(-1);
 const pages={search,limit,obligations:{nextCursor:moreObligations&&lastObligation?writeCursor({rank:lastObligation.state==='completed'?1:0,at:lastObligation.authorizedAt,id:lastObligation.id}):null},sources:{nextCursor:moreSources&&lastSource?writeCursor({at:lastSource.authorizedAt,kind:lastSource.kind,id:lastSource.sourceId}):null}};
 return {pages,superAdmin,customerRefundReversals:reversals.results,returnedCredits:returnedCredits.results,
  obligations:rows.results.map(summarizeRefundObligation),packets:packets.results.map(summarizeRefundPacket),sources:sources.results,
  funding,destinations:reviewableDestinations};
}
export async function getCustomerRefundWorkspace(db:D1Database,actorId:string){
 if(!await db.prepare("SELECT 1 FROM users WHERE id=? AND status='active'").bind(actorId).first())throw new AccessError('Sign in to view your own refund instructions.');
 const {readRefundCurrentProgress,readCustomerRefundPaymentProgress}=await import('./refund-current-progress');
 const rows=await db.prepare(`SELECT ${moneyColumns},o.order_number AS orderNumber FROM refund_obligations r LEFT JOIN orders o ON o.id=r.order_id WHERE r.customer_id=? ORDER BY r.authorized_at DESC,r.id LIMIT 100`).bind(actorId).all<Omit<RefundWorkspaceRow,'customerName'|'ownerName'>>();
 return Promise.all(rows.results.map(async row=>{
  const [progress,destination,events,evidenceFiles]=await Promise.all([
   (async()=>{
    const currentProgress=row.sourceKind==='return_refund'?await readRefundCurrentProgress(db,row.sourceId):null;
    return {currentProgress,paymentProgress:currentProgress?null:await readCustomerRefundPaymentProgress(db,row.id)};
   })(),
   db.prepare('SELECT d.id,d.status,d.details_json AS details,h.revision FROM refund_destination_heads h JOIN refund_destination_versions d ON d.id=h.version_id WHERE h.obligation_id=?').bind(row.id).first<{id:string;status:string;details:string;revision:number}>(),
   db.prepare("SELECT id,public_message AS message,created_at AS createdAt FROM refund_obligation_events WHERE obligation_id=? AND action<>'customer_delay' ORDER BY created_at DESC,id LIMIT 12").bind(row.id).all<{id:string;message:string;createdAt:number}>(),
   db.prepare("SELECT i.id,i.original_name AS name FROM finance_evidence_intents i JOIN finance_evidence_files f ON f.id=i.id WHERE i.scope_kind='obligation' AND i.scope_id=? AND i.uploaded_by=? ORDER BY i.created_at DESC LIMIT 20").bind(row.id,actorId).all<{id:string;name:string}>(),
  ]);
  return {...progress,initiationDueAt:row.initiationDueAt,bindingDueAt:row.bindingDueAt,evidenceFiles:evidenceFiles.results,id:row.id,orderNumber:row.orderNumber,cashPaisa:row.cashPaisa,originalCashPaisa:row.originalCashPaisa,bankSatisfiedPaisa:row.bankSatisfiedPaisa,walletPaisa:row.walletPaisa,alreadyRestoredWalletPaisa:row.alreadyRestoredWalletPaisa,state:row.state,nextUpdateAt:progress.paymentProgress?.delay?.nextUpdateAt??null,destination:destination?{id:destination.id,status:destination.status,label:masked(JSON.parse(destination.details)),revision:destination.revision}:null,events:events.results};
 }));
}


/** Resolve only committed receipt-return notices after current Finance authority. */
export async function resolveReceiptReturnFinanceNotice(db:D1Database,actorId:string,kind:'loss'|'satisfaction',sourceId:string){
 const authority=await staffReadGuard(db,actorId,['refund.approve.standard','refund.view'],AccessError);
 if(!['loss','satisfaction'].includes(kind)||typeof sourceId!=='string'||!sourceId||sourceId.length>191)throw new RefundObligationError('Open the exact retained Finance notification.',400);
 const table=kind==='loss'?'receipt_return_bank_losses':'receipt_return_bank_satisfactions';
 const source=await db.prepare(`SELECT item.obligation_id obligationId FROM ${table} item JOIN seller_recovery_receipt_reversal_reviews review ON review.id=item.review_id WHERE item.id=? AND review.state='completed'`).bind(sourceId).first<{obligationId:string}>();
 await db.batch(authority.statements);
 return source?.obligationId??null;
}
