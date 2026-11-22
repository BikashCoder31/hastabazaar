import { emailRetryDelayMs } from './retry-policy';

export type DeliveryQueueKind = 'order' | 'business';
export type MailFailureCategory = 'temporary' | 'permanent_recipient' | 'configuration' | 'unknown';
export interface OutgoingMail { to: string; subject: string; text: string; html: string }
export function validMailRecipient(value:string):boolean{
  return /^[a-z0-9.!#$%&'+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(value.trim())&&!/[\r\n]/.test(value);
}
export interface DeliveryContext {
  deliveryId: string;
  attemptId: string;
  messageId: string;
  /** Must run immediately before external submission, after connection/authentication. */
  beforeHandoff: () => Promise<void>;
}
export interface MailDeliveryReceipt {
  outcome: 'accepted' | 'captured';
  transport: 'provider' | 'capture';
  receipt?: string;
}
export interface DeliveryMailService {
  readonly handoffAware?: boolean;
  readonly transport?: 'provider' | 'capture';
  readonly transportKey?: string;
  readonly configurationFingerprint?: string;
  readIsolatedCaptureOrigin?(): Promise<string | undefined>;
  probe?():Promise<{transport:'provider'|'capture';available:true}>;
  send(message: OutgoingMail, context?: DeliveryContext): Promise<MailDeliveryReceipt | void>;
}
/** Only allowlisted codes are persisted. Never persist raw SMTP responses/errors. */
const safeCodes = new Set(['delivery_failed','provider_unavailable','provider_rate_limited','recipient_rejected','configuration_invalid','authentication_rejected','outcome_uncertain','obsolete_or_access_changed']);
export class MailDeliveryError extends Error {
  readonly code: string;
  constructor(public readonly category: MailFailureCategory, code: string, public readonly options: { retryAfterMs?: number; providerWide?: boolean } = {}, displayMessage?: string) {
    super(displayMessage ?? (safeCodes.has(code) ? code : 'delivery_failed'));
    this.code=safeCodes.has(code) ? code : 'delivery_failed';
    this.name = 'MailDeliveryError';
  }
}
export class DeliveryObsolete extends Error {}
export interface DurableDeliveryOptions {
  queueKind: DeliveryQueueKind;
  queueId: string;
  claimToken: string;
  attemptNumber: number;
  now: () => number;
  validate: () => Promise<boolean>;
  random?: () => number;
}
export interface DeliveryAttempt {
  id: string; phase: string; transport: 'provider'|'capture'|null;
  failureCategory: MailFailureCategory|null; failureCode: string|null;
  retryAt: number|null; startedAt: number; handoffAt: number|null; completedAt: number|null;
  configFingerprint: string|null; recipientFingerprint: string|null;
}
export async function deliveryFingerprint(value: string): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
  return Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
}
export function eligibleDeliverySql(kind: DeliveryQueueKind, idSql: string): string {
  return `NOT EXISTS(SELECT 1 FROM email_delivery_attempts da WHERE da.queue_kind='${kind}' AND da.queue_id=${idSql} AND da.phase IN ('handoff_started','accepted','captured','uncertain'))`;
}
export function accountedDeliveryAttemptsSql(kind:DeliveryQueueKind,idSql:string,countSql:string):string{
  return `(${countSql}=0 OR ${countSql}=(SELECT COUNT(*) FROM email_delivery_attempts accounted WHERE accounted.queue_kind='${kind}' AND accounted.queue_id=${idSql}))`;
}
/** Legacy counters cannot establish rejection. This is an observation fence,
 * not an invented provider attempt, historical Message-ID or submission time. */
export async function fenceLegacyDeliveryGap(db:D1Database,kind:DeliveryQueueKind,queueId:string,attempts:number,observedAt:number,requireExpiredQueue=false):Promise<boolean>{
  if(attempts<=0)return false;
  const ledger=await db.prepare('SELECT COUNT(*) AS total FROM email_delivery_attempts WHERE queue_kind=? AND queue_id=?').bind(kind,queueId).first<{total:number}>();
  if(Number(ledger?.total??0)>=attempts)return false;
  const existingFence=await db.prepare("SELECT 1 FROM email_delivery_attempts WHERE queue_kind=? AND queue_id=? AND phase IN ('handoff_started','accepted','captured','uncertain') LIMIT 1").bind(kind,queueId).first();
  if(existingFence)return true;
  const business=kind==='business',table=business?'notification_messages':'order_email_jobs',counter=business?'delivery_attempts':'attempts',lease=business?'delivery_lease_until':'lease_until';
  const statuses=business?"('queued','failed')":"('queued','retry','sending')";
  const queueGuard=requireExpiredQueue?` AND EXISTS(SELECT 1 FROM ${table} q WHERE q.id=? AND q.${counter}=? AND q.${lease}<=? AND q.status IN ${statuses}${business?" AND q.channel='email' AND q.business_event_key=q.template_key":''})`:'';
  const marker=`<legacy-unverified-observation-${await deliveryFingerprint(`${kind}:${queueId}`)}@mail.hastabazaar.invalid>`;
  const inserted=await db.prepare(`INSERT OR IGNORE INTO email_delivery_attempts(id,queue_kind,queue_id,claim_token,attempt_number,phase,message_id,started_at,failure_category,failure_code) SELECT ?,?,?,?,?,'uncertain',?,?,'unknown','legacy_outcome_unverified' WHERE (SELECT COUNT(*) FROM email_delivery_attempts existing WHERE existing.queue_kind=? AND existing.queue_id=?)<?${queueGuard}`).bind(crypto.randomUUID(),kind,queueId,crypto.randomUUID(),attempts,marker,observedAt,kind,queueId,attempts,...(requireExpiredQueue?[queueId,attempts,observedAt]:[])).run();
  return !!inserted.meta.changes;
}
export async function fenceLegacyDeliveryQueue(db:D1Database,kind:DeliveryQueueKind,now:number,limit=40):Promise<number>{
  const business=kind==='business',table=business?'notification_messages':'order_email_jobs',counter=business?'delivery_attempts':'attempts',lease=business?'delivery_lease_until':'lease_until';
  const statuses=business?"('queued','failed')":"('queued','retry','sending')";
  const rows=await db.prepare(`SELECT q.id,q.${counter} AS attempts FROM ${table} q WHERE q.status IN ${statuses}${business?" AND q.channel='email' AND q.business_event_key=q.template_key":''} AND q.${counter}>0 AND q.${lease}<=? AND NOT ${accountedDeliveryAttemptsSql(kind,'q.id',`q.${counter}`)} AND ${eligibleDeliverySql(kind,'q.id')} ORDER BY q.created_at,q.id LIMIT ?`).bind(now,Math.max(1,Math.min(limit,100))).all<{id:string;attempts:number}>();
  let fenced=0;for(const row of rows.results)if(await fenceLegacyDeliveryGap(db,kind,row.id,row.attempts,now,true))fenced++;
  return fenced;
}
/** Preserve evidence for a current claim that is known never to have invoked a
 * transport. Existing rows (including acceptance/uncertainty) are untouched. */
export async function recordUnstartedDeliveryAttempt(db:D1Database,input:{queueKind:DeliveryQueueKind;queueId:string;claimToken:string;attemptNumber:number;now:number;cancelled?:boolean;retryAt?:number}):Promise<void>{
  const messageId=`<${await deliveryFingerprint(`${input.queueKind}:${input.queueId}`)}@mail.hastabazaar.invalid>`;
  await db.prepare('INSERT OR IGNORE INTO email_delivery_attempts(id,queue_kind,queue_id,claim_token,attempt_number,phase,message_id,started_at,completed_at,failure_category,failure_code,retry_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(),input.queueKind,input.queueId,input.claimToken,input.attemptNumber,input.cancelled?'cancelled':'not_accepted',messageId,input.now,input.now,input.cancelled?null:'temporary',input.cancelled?'obsolete_or_access_changed':'delivery_failed',input.retryAt??null).run();
}
export async function readDeliveryAttempt(db: D1Database, kind: DeliveryQueueKind, queueId: string): Promise<DeliveryAttempt|null> {
  return db.prepare(`SELECT id,phase,transport,failure_category AS failureCategory,failure_code AS failureCode,retry_at AS retryAt,started_at AS startedAt,handoff_at AS handoffAt,completed_at AS completedAt,config_fingerprint AS configFingerprint,recipient_fingerprint AS recipientFingerprint FROM email_delivery_attempts WHERE queue_kind=? AND queue_id=? ORDER BY attempt_number DESC LIMIT 1`).bind(kind,queueId).first<DeliveryAttempt>();
}
export async function readDeliveryStatus(db: D1Database, kind: DeliveryQueueKind, queueId: string) {
  const attempt=await readDeliveryAttempt(db,kind,queueId);
  const status = !attempt ? 'queued' : attempt.phase==='handoff_started'||attempt.phase==='uncertain' ? 'uncertain' : attempt.phase==='claimed' ? 'sending' : attempt.phase==='not_accepted' ? attempt.failureCategory==='temporary' ? 'retrying' : 'intervention' : attempt.phase;
  return {status,attempt};
}
/** Repair only queue projections from retained terminal receipts. This does not
 * release uncertain work, reset history, or call an external transport. */
export async function recoverDeliveryReceipts(db:D1Database,kind:DeliveryQueueKind,limit=40):Promise<number>{
  const business=kind==='business';
  const table=business?'notification_messages':'order_email_jobs';
  const statuses=business?"('queued','failed')":"('queued','retry','sending')";
  const rows=await db.prepare(`SELECT a.queue_id AS queueId,a.completed_at AS completedAt,a.transport FROM email_delivery_attempts a JOIN ${table} q ON q.id=a.queue_id WHERE a.queue_kind=? AND a.phase IN ('accepted','captured') AND a.completed_at IS NOT NULL AND q.status IN ${statuses} ORDER BY a.completed_at,a.id LIMIT ?`).bind(kind,Math.max(1,Math.min(limit,100))).all<{queueId:string;completedAt:number;transport:'provider'|'capture'}>();
  let repaired=0;
  for(const row of rows.results){
    const changed=business
      ?await db.prepare(`UPDATE notification_messages SET status='sent',sent_at=?,delivery_transport=?,failure_reason=NULL,delivery_claim_token=NULL,delivery_lease_until=0 WHERE id=? AND status IN ${statuses}`).bind(row.completedAt,row.transport,row.queueId).run()
      :await db.prepare(`UPDATE order_email_jobs SET status='sent',sent_at=?,failure_code=NULL,claim_token=NULL,lease_until=0 WHERE id=? AND status IN ${statuses}`).bind(row.completedAt,row.queueId).run();
    repaired+=Number(changed.meta.changes??0);
  }
  return repaired;
}
export type DurableDeliveryResult = { outcome: 'accepted'|'captured'|'uncertain'|'cancelled'|'held'|'intervention'|'retry'; retryAt?: number; failureCode?: string; transport?: 'provider'|'capture' };

export interface DeliveryReconciliationEvidence {
  attemptId:string;messageId:string;transportKey:string|null;
  outcome:'accepted'|'not_accepted';receipt:string;now:number;
}
/** Internal evidence seam, not a user-supplied outcome toggle. The authorized
 * caller must obtain and verify correlated provider evidence. A Message-ID or
 * an operator's retry request alone is insufficient and cannot release a fence. */
export async function reconcileUncertainDelivery(db:D1Database,evidence:DeliveryReconciliationEvidence,verifyEvidence:(evidence:DeliveryReconciliationEvidence)=>Promise<boolean>):Promise<boolean>{
  const attempt=await db.prepare("SELECT message_id AS messageId,transport_key AS transportKey FROM email_delivery_attempts WHERE id=? AND phase IN ('handoff_started','uncertain')").bind(evidence.attemptId).first<{messageId:string;transportKey:string|null}>();
  if(!attempt||attempt.messageId!==evidence.messageId||attempt.transportKey!==evidence.transportKey||!evidence.receipt.trim()||!await verifyEvidence(evidence))return false;
  const receipt=await deliveryFingerprint(evidence.receipt);
  const changed=await db.prepare("UPDATE email_delivery_attempts SET phase=?,transport=?,provider_receipt=?,failure_category=?,failure_code=?,completed_at=?,retry_at=? WHERE id=? AND phase IN ('handoff_started','uncertain') AND message_id=?").bind(evidence.outcome==='accepted'?'accepted':'not_accepted',evidence.outcome==='accepted'?'provider':null,receipt,evidence.outcome==='accepted'?null:'temporary',evidence.outcome==='accepted'?null:'delivery_failed',evidence.now,evidence.outcome==='accepted'?null:evidence.now,evidence.attemptId,evidence.messageId).run();
  return !!changed.meta.changes;
}

/** A durable fence is written before submission. An interrupted fence is held,
 * never interpreted as proof of non-acceptance. Message-ID is correlation only. */
export async function deliverDurably(db: D1Database, mail: DeliveryMailService, message: OutgoingMail, options: DurableDeliveryOptions): Promise<DurableDeliveryResult> {
  if(await fenceLegacyDeliveryGap(db,options.queueKind,options.queueId,options.attemptNumber-1,options.now()))return{outcome:'held',failureCode:'legacy_outcome_unverified'};
  const previous=await readDeliveryAttempt(db,options.queueKind,options.queueId);
  const recipientFingerprint=await deliveryFingerprint(message.to.trim().toLowerCase());
  const configFingerprint=mail.configurationFingerprint ?? null;
  if(previous && ['handoff_started','accepted','captured','uncertain'].includes(previous.phase)) return {outcome:'held'};
  if(previous?.phase==='not_accepted') {
    if(previous.failureCategory==='permanent_recipient' && previous.recipientFingerprint===recipientFingerprint) return {outcome:'held',retryAt:options.now()+60_000};
    if(previous.failureCategory==='configuration' && (!configFingerprint || previous.configFingerprint===configFingerprint)) return {outcome:'held',retryAt:options.now()+60_000};
    if(previous.failureCategory==='temporary' && (previous.retryAt??0)>options.now()) return {outcome:'held',retryAt:previous.retryAt!};
  }
  const transportKey=mail.transportKey??null;
  if(transportKey) {
    const backoff=await db.prepare('SELECT blocked_until AS untilAt,config_fingerprint AS fingerprint FROM email_transport_backoff WHERE transport_key=?').bind(transportKey).first<{untilAt:number;fingerprint:string|null}>();
    if(backoff && backoff.fingerprint===configFingerprint && backoff.untilAt>options.now()) return {outcome:'held',retryAt:backoff.untilAt};
  }
  const id=crypto.randomUUID();
  const messageId=`<${await deliveryFingerprint(`${options.queueKind}:${options.queueId}`)}@mail.hastabazaar.invalid>`;
  await db.prepare(`INSERT INTO email_delivery_attempts(id,queue_kind,queue_id,claim_token,attempt_number,phase,transport,transport_key,message_id,config_fingerprint,recipient_fingerprint,started_at) VALUES(?,?,?,?,?,'claimed',?,?,?,?,?,?)`).bind(id,options.queueKind,options.queueId,options.claimToken,options.attemptNumber,mail.transport??null,transportKey,messageId,configFingerprint,recipientFingerprint,options.now()).run();
  let handedOff=false;
  const beforeHandoff=async()=>{
    if(!await options.validate()) throw new DeliveryObsolete();
    if(handedOff) return;
    const changed=await db.prepare("UPDATE email_delivery_attempts SET phase='handoff_started',handoff_at=? WHERE id=? AND phase='claimed'").bind(options.now(),id).run();
    if(!changed.meta.changes) throw new Error('Delivery claim unavailable');
    handedOff=true;
  };
  let receipt: MailDeliveryReceipt|void;
  try {
    if(!validMailRecipient(message.to))throw new MailDeliveryError('permanent_recipient','recipient_rejected');
    // Fence every adapter before invocation, including an adapter that forgets
    // its protocol. Aware transports repeat current-state validation immediately
    // before body submission after connection/authentication has completed.
    await beforeHandoff();
    receipt=await mail.send(message,{deliveryId:`${options.queueKind}:${options.queueId}`,attemptId:id,messageId,beforeHandoff});
  } catch(error) {
    if(error instanceof DeliveryObsolete) {
      await db.prepare("UPDATE email_delivery_attempts SET phase='cancelled',failure_code='obsolete_or_access_changed',completed_at=? WHERE id=?").bind(options.now(),id).run();
      return {outcome:'cancelled',failureCode:'obsolete_or_access_changed'};
    }
    const classified=error instanceof MailDeliveryError ? error : new MailDeliveryError(handedOff?'unknown':'temporary',handedOff?'outcome_uncertain':'delivery_failed');
    const uncertain=classified.category==='unknown';
    const retryAt=classified.category==='temporary' ? options.now()+emailRetryDelayMs(options.attemptNumber,{random:options.random??Math.random,retryAfterMs:classified.options.retryAfterMs}) : null;
    await db.prepare('UPDATE email_delivery_attempts SET phase=?,failure_category=?,failure_code=?,completed_at=?,retry_at=? WHERE id=?').bind(uncertain?'uncertain':'not_accepted',classified.category,classified.code,options.now(),retryAt,id).run();
    const blockedUntil=retryAt??(classified.category==='configuration'?Number.MAX_SAFE_INTEGER:null);
    if(transportKey && classified.options.providerWide && blockedUntil) {
      // Portable SQLite/MariaDB statements; concurrent failures cannot shorten
      // an existing backoff for the same configuration.
      await db.prepare('INSERT OR IGNORE INTO email_transport_backoff(transport_key,config_fingerprint,blocked_until,failure_category,failure_code,updated_at) VALUES(?,?,?,?,?,?)').bind(transportKey,configFingerprint,blockedUntil,classified.category,classified.code,options.now()).run();
      await db.prepare('UPDATE email_transport_backoff SET blocked_until=CASE WHEN (config_fingerprint=? OR (config_fingerprint IS NULL AND ? IS NULL)) AND blocked_until>? THEN blocked_until ELSE ? END,config_fingerprint=?,failure_category=?,failure_code=?,updated_at=? WHERE transport_key=?').bind(configFingerprint,configFingerprint,blockedUntil,blockedUntil,configFingerprint,classified.category,classified.code,options.now(),transportKey).run();
    }
    return {outcome:uncertain?'uncertain':classified.category==='temporary'?'retry':'intervention',failureCode:classified.code,...(retryAt?{retryAt}:{})};
  }
  // Old void transports do not establish provider acceptance or local capture.
  if(!receipt || !['accepted','captured'].includes(receipt.outcome) || (receipt.outcome==='accepted' && receipt.transport!=='provider') || (receipt.outcome==='captured'&&receipt.transport!=='capture')) {
    await db.prepare("UPDATE email_delivery_attempts SET phase='uncertain',failure_category='unknown',failure_code='outcome_uncertain',completed_at=? WHERE id=?").bind(options.now(),id).run();
    return {outcome:'uncertain',failureCode:'outcome_uncertain'};
  }
  // A handoff-aware adapter that forgot its callback cannot establish a safe
  // claim. Still retain its known acceptance and never send it again.
  try {
    await db.prepare(`UPDATE email_delivery_attempts SET phase='${receipt.outcome}',transport=?,provider_receipt=?,completed_at=? WHERE id=?`).bind(receipt.transport,receipt.receipt?.slice(0,256)??null,options.now(),id).run();
  } catch {
    // The pre-submission fence survives. A restart holds it for reconciliation.
  }
  return {outcome:receipt.outcome,transport:receipt.transport};
}
