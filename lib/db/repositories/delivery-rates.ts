import { recordStaffAuthorizationOutcome } from '../../operations/authorization-audit';
import { operationalBusinessNotificationStatements } from '../../operations/business-notifications';
import {validateDeliveryRates,type DeliveryRates} from '../../checkout/delivery-rates';
export class DeliveryRateConflictError extends Error {}
export async function getDeliveryRates(db:D1Database):Promise<DeliveryRates>{
 const row=await db.prepare("SELECT v.id,v.config_json AS config FROM delivery_rate_current c JOIN delivery_rate_versions v ON v.id=c.version_id WHERE c.id='default'").first<{id:string;config:string}>();
 if(!row)throw new DeliveryRateConflictError('Delivery settings are unavailable.');
 return {...validateDeliveryRates(JSON.parse(row.config)),version:row.id};
}
export function rateVersionGuard(db:D1Database,version:string){const id=crypto.randomUUID();return [db.prepare("INSERT INTO operation_transaction_guards(id,valid) SELECT ?,CASE WHEN EXISTS(SELECT 1 FROM delivery_rate_current WHERE id='default' AND version_id=?) THEN 1 ELSE 0 END").bind(id,version),db.prepare('DELETE FROM operation_transaction_guards WHERE id=?').bind(id)];}
export async function saveDeliveryRates(db:D1Database,o:{actorId:string;expectedVersion:string;rates:unknown;reason:string;now:number}){
 const config=validateDeliveryRates(o.rates);if(typeof o.reason!=='string'||o.reason.trim().length<10||o.reason.length>500)throw new DeliveryRateConflictError('Add a reason of 10–500 characters.');
 const id=crypto.randomUUID(),guard=crypto.randomUUID();
 try{await db.batch([
 db.prepare("UPDATE delivery_rate_current SET version_id=version_id WHERE id='default'"),
 ...rateVersionGuard(db,o.expectedVersion),
 db.prepare("INSERT INTO operation_transaction_guards(id,valid) SELECT ?,CASE WHEN EXISTS(SELECT 1 FROM users u JOIN user_roles r ON r.user_id=u.id WHERE u.id=? AND u.status='active' AND r.role='super_admin') THEN 1 ELSE 0 END").bind(guard,o.actorId),
 db.prepare('DELETE FROM operation_transaction_guards WHERE id=?').bind(guard),
 db.prepare('INSERT INTO delivery_rate_versions(id,config_json,created_by,reason,created_at) VALUES (?,?,?,?,?)').bind(id,JSON.stringify(config),o.actorId,o.reason.trim(),o.now),
 db.prepare("UPDATE delivery_rate_current SET version_id=? WHERE id='default'").bind(id),
 db.prepare("INSERT INTO audit_logs(id,actor_id,action,subject_type,subject_id,reason,previous_json,next_json,request_id,created_at) VALUES (?,?,'delivery.rates.updated','delivery_rate_version',?,?,?,?,?,?)").bind(crypto.randomUUID(),o.actorId,id,o.reason.trim(),JSON.stringify({version:o.expectedVersion}),JSON.stringify({version:id}),id+':audit',o.now),
 ...await operationalBusinessNotificationStatements(db,{kind:'delivery.rates.changed',sourceId:id,eventId:id,actorId:o.actorId,now:o.now})
 ]);}catch{await recordStaffAuthorizationOutcome(db,{actorId:o.actorId,subjectId:o.expectedVersion,permission:'admin.invite',outcome:'failed'});throw new DeliveryRateConflictError('Only an active Super Admin can save the current version. Refresh settings and try again.');}
}
