export async function emailQueueSummary(db:D1Database,now=Date.now()){
 const row=await db.prepare(`SELECT COUNT(*) AS pending,
 COALESCE(SUM(CASE WHEN status='retry' THEN 1 ELSE 0 END),0) AS failures,
 COALESCE(SUM(CASE WHEN status='retry' AND attempts>=5 THEN 1 ELSE 0 END),0) AS exhausted,
 COALESCE(SUM(CASE WHEN status='sending' AND lease_until<=? THEN 1 ELSE 0 END),0) AS expiredLeases,
 COALESCE(SUM(CASE WHEN attempts<5 AND next_attempt_at<=? AND lease_until<=? THEN 1 ELSE 0 END),0) AS due,
 MIN(created_at) AS oldestAt FROM order_email_jobs WHERE status IN ('queued','retry','sending')`).bind(now,now,now).first<{pending:number;failures:number;exhausted:number;expiredLeases:number;due:number;oldestAt:number|null}>();
 return {...row,oldestAgeMinutes:row?.oldestAt==null?0:Math.max(0,Math.floor((now-row.oldestAt)/60000))};
}
