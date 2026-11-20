import {CONTINUOUS_CALENDAR_VERSION} from '../workflows/service-clock';
/** Insert with the source case: notification or worker failure cannot strand an unqueued case. */
export function preparationReviewTask(db:D1Database,caseId:string){
 return db.prepare(`INSERT OR IGNORE INTO review_tasks(id,source_type,source_id,source_revision,started_at,due_at,calendar_version,updated_at,owner_id,has_deadline)
 SELECT ?,'order_response',id,id,created_at,first_due_at,?,created_at,owner_id,1 FROM order_response_cases WHERE id=?`)
 .bind(crypto.randomUUID(),CONTINUOUS_CALENDAR_VERSION,caseId);
}
