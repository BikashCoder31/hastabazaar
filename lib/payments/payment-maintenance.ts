import {checkoutCommitClock} from '../checkout/commit-policy-guards';
import {expireManualPaymentOrder} from './manual-payment-lifecycle';
import {preparePaymentException} from './payment-exceptions';
import {operationalBusinessNotificationStatements} from '../operations/business-notifications';

function predicate(clock:string){return `w.paid_at IS NULL AND w.closed_at IS NULL AND w.deadline_at>${clock} AND w.deadline_at-21600000<=${clock} AND b.payable_paisa>b.received_paisa AND NOT EXISTS(SELECT 1 FROM manual_payment_claims c WHERE c.order_id=w.order_id AND c.current_state IN('submitted','clarified','needs_information'))`;}
export async function isCurrentPaymentReminder(db:D1Database,orderId:string,now:number){return Boolean(await db.prepare(`SELECT 1 FROM manual_payment_windows w JOIN manual_payment_balances b ON b.order_id=w.order_id JOIN manual_payment_reminders r ON r.order_id=w.order_id WHERE w.order_id=? AND w.last_event_id=r.event_id AND ${predicate('?')}`).bind(orderId,now,now).first());}
export async function processManualPaymentWindows(db:D1Database,limit=50,orderId?:string){
 if(!Number.isInteger(limit)||limit<1||limit>200)throw new Error('Choose a bounded payment maintenance batch.');
 const clock=checkoutCommitClock(db),exceptionKey=(db as D1Database&{dialect?:string}).dialect==='mariadb'?"CONCAT('window-processing:',w.order_id)":"'window-processing:'||w.order_id",now=Number((await db.prepare(`SELECT ${clock} AS now`).first<{now:number}>())!.now),result={expired:0,reminded:0,exceptions:0};
 const overdue=(await db.prepare(`SELECT order_id AS id FROM manual_payment_cutoffs w WHERE paid_at IS NULL AND closed_at IS NULL AND cutoff_at<=${clock} AND NOT EXISTS(SELECT 1 FROM manual_payment_exceptions e WHERE e.source_key=${exceptionKey} AND e.state<>'resolved') ${orderId?' AND w.order_id=?':''} ORDER BY cutoff_at,order_id LIMIT ?`).bind(...(orderId?[orderId]:[]),limit).all<{id:string}>()).results;
 for(const row of overdue){try{if((await expireManualPaymentOrder(db,row.id)).state==='expired')result.expired++;}catch{await db.batch(await preparePaymentException(db,{sourceKey:'window-processing:'+row.id,orderId:row.id,receiptId:null,kind:'window_processing',reason:'The original overdue order could not be reconciled automatically. Review its exact stock, wallet and money history; do not reopen its payment window.',ownerId:null,now}));result.exceptions++;}}
 const due=(await db.prepare(`SELECT w.order_id AS id,w.revision FROM manual_payment_windows w JOIN manual_payment_balances b ON b.order_id=w.order_id WHERE ${predicate(clock)} AND NOT EXISTS(SELECT 1 FROM manual_payment_reminders r WHERE r.order_id=w.order_id) ${orderId?' AND w.order_id=?':''} ORDER BY w.deadline_at,w.order_id LIMIT ?`).bind(...(orderId?[orderId]:[]),limit).all<{id:string;revision:number}>()).results;
 for(const row of due){const eventId=crypto.randomUUID(),guardId=crypto.randomUUID();try{await db.batch([
  db.prepare(`INSERT INTO manual_payment_reminders(order_id,event_id,created_at) SELECT w.order_id,?,${clock} FROM manual_payment_windows w JOIN manual_payment_balances b ON b.order_id=w.order_id WHERE w.order_id=? AND w.revision=? AND ${predicate(clock)}`).bind(eventId,row.id,row.revision),
  db.prepare('INSERT INTO operation_transaction_guards(id,valid) SELECT ?,CASE WHEN changes()=1 THEN 1 ELSE 0 END').bind(guardId),db.prepare('DELETE FROM operation_transaction_guards WHERE id=?').bind(guardId),
  db.prepare('UPDATE manual_payment_windows SET last_event_id=?,revision=revision+1 WHERE order_id=? AND revision=?').bind(eventId,row.id,row.revision),
  ...await operationalBusinessNotificationStatements(db,{kind:'payment.reminder',sourceId:row.id,eventId,actorId:'system',now,status:'due'})]);result.reminded++;}catch(error){if(!await db.prepare('SELECT 1 FROM manual_payment_reminders WHERE order_id=?').bind(row.id).first()&&await db.prepare(`SELECT 1 FROM manual_payment_windows w JOIN manual_payment_balances b ON b.order_id=w.order_id WHERE w.order_id=? AND w.revision=? AND ${predicate(clock)}`).bind(row.id,row.revision).first())throw error;}}
 return result;
}

