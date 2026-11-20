import {staffMutationGuard} from '../db/repositories/staff-mutation-guard';
export class WaiverHistoryError extends Error{constructor(message:string,readonly status=403){super(message);}}
type Cursor={at:number;id:string;revision:number};
export interface CustomerWaiverHistoryRow{campaignId:string;revision:number;name:string;state:string;startsAt:number;endsAt:number;recordedAt:number;actorId:string;reason:string|null;orders:number;waivedPaisa:number;}
/** Native immutable versions and once-per-order snapshots, never current-policy repricing. */
export async function readCustomerWaiverHistory(db:D1Database,actor:{id:string;authSubject:string},options:{limit?:number;cursor?:string}={}){
 const limit=options.limit??20;if(!Number.isInteger(limit)||limit<1||limit>100)throw new WaiverHistoryError('Use a bounded history page.',400);
 let cursor:Cursor|null=null;if(options.cursor){try{const c=JSON.parse(options.cursor) as Cursor;if(!c||!Number.isSafeInteger(c.at)||c.at<0||typeof c.id!=='string'||!c.id||c.id.length>191||!Number.isSafeInteger(c.revision)||c.revision<1)throw Error();cursor=c;}catch{throw new WaiverHistoryError('Use the original history continuation.',400);}}
 const proof=await staffMutationGuard(db,actor.id,'commercial_policy.manage',WaiverHistoryError);if(proof.role!=='super_admin')throw new WaiverHistoryError('Current Super Admin commercial authority is required.');
 const identity=await db.prepare('SELECT auth_subject AS subject FROM users WHERE id=?').bind(actor.id).first<{subject:string}>();if(identity?.subject!==actor.authSubject)throw new WaiverHistoryError('Current authenticated account is required.');
 const maria=(db as D1Database&{dialect?:string}).dialect==='mariadb',request=maria?"CONCAT('customer-fee-waiver:',r.request_id)":"'customer-fee-waiver:'||r.request_id";
 const values:unknown[]=cursor?[cursor.at,cursor.at,cursor.id,cursor.id,cursor.revision]:[];
 const result=await db.prepare(`SELECT r.campaign_id AS campaignId,r.revision,r.name,r.state,r.starts_at AS startsAt,r.ends_at AS endsAt,r.created_at AS recordedAt,r.created_by AS actorId,
 (SELECT a.reason FROM audit_logs a WHERE a.request_id=${request} AND a.action IN('customer.service-fee-waiver.create','customer.service-fee-waiver.revise','customer.service-fee-waiver.publish','customer.service-fee-waiver.pause','customer.service-fee-waiver.resume','customer.service-fee-waiver.end') AND a.subject_type='customer_fee_waiver' AND a.subject_id=r.campaign_id AND a.actor_id=r.created_by LIMIT 1) AS reason,
 (SELECT COUNT(*) FROM order_customer_service_fees f WHERE f.campaign_id=r.campaign_id AND f.campaign_revision=r.revision) AS orders,
 (SELECT COALESCE(SUM(f.waived_paisa),0) FROM order_customer_service_fees f WHERE f.campaign_id=r.campaign_id AND f.campaign_revision=r.revision) AS waivedPaisa
 FROM customer_fee_waiver_revisions r ${cursor?'WHERE (r.created_at<? OR (r.created_at=? AND (r.campaign_id<? OR (r.campaign_id=? AND r.revision<?))))':''}
 ORDER BY r.created_at DESC,r.campaign_id DESC,r.revision DESC LIMIT ?`).bind(...values,limit+1).all<CustomerWaiverHistoryRow>();
 for(const row of result.results)if(!Number.isSafeInteger(row.orders)||row.orders<0||!Number.isSafeInteger(row.waivedPaisa)||row.waivedPaisa<0)throw new WaiverHistoryError('Original usage totals require reconciliation.',409);
 const guard=crypto.randomUUID();await db.batch([...proof.statements,db.prepare(`INSERT INTO staff_permission_guards(id,valid) SELECT ?,CASE WHEN EXISTS(SELECT 1 FROM users WHERE id=? AND ${maria?'BINARY auth_subject=BINARY ?':'auth_subject COLLATE BINARY=?'}) THEN 1 ELSE 0 END`).bind(guard,actor.id,actor.authSubject),db.prepare('DELETE FROM staff_permission_guards WHERE id=?').bind(guard)]);
 const rows=result.results.slice(0,limit),last=rows.at(-1);return{rows,nextCursor:result.results.length>limit&&last?JSON.stringify({at:last.recordedAt,id:last.campaignId,revision:last.revision}):null};
}
