import {offerGuard} from '../products/offer-support';

/** Use database execution time, including time spent waiting on transactional locks. */
export function checkoutCommitClock(db:D1Database):string {
 return (db as D1Database&{dialect?:string}).dialect==='mariadb'
  ? 'CAST(UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000 AS SIGNED)'
  : "(CAST(strftime('%s','now') AS INTEGER)*1000+CAST(substr(strftime('%f','now'),4,3) AS INTEGER))";
}
export function checkoutCurrentPolicyGuards(db:D1Database,settings:ReadonlyArray<readonly[string,string|null]>,commission:{settingVersionId:string|null;effectiveFrom:number|null;versions:readonly string[]}){
 const clock=checkoutCommitClock(db),statements:D1PreparedStatement[]=[];
 for(const [key,id] of new Map(settings))statements.push(...offerGuard(db,`COALESCE((SELECT id FROM business_setting_versions WHERE setting_key=? AND status='published' AND effective_from<=${clock} AND (effective_until IS NULL OR effective_until>${clock}) ORDER BY effective_from DESC,version DESC LIMIT 1),'')=?`,[key,id??'']));
 for(const version of new Set(commission.versions))statements.push(...offerGuard(db,`COALESCE((SELECT r.id FROM commission_rate_changes r LEFT JOIN commission_rate_cancellations c ON c.rate_id=r.id WHERE c.rate_id IS NULL AND r.effective_at<=${clock} AND r.effective_at>? ORDER BY r.effective_at DESC,r.created_at DESC,r.id DESC LIMIT 1),?)=?`,[commission.effectiveFrom??0,commission.settingVersionId??version,version]));
 return statements;
}
