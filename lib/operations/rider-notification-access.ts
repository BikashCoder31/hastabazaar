/** Current source ownership for rider notifications. Apply on list, read mutation, and immediately before email. */
export function riderNotificationSourceSql(
  alias: 'n' | 'notification_messages' = 'n',
): string {
  const n = alias;
  return `(${n}.related_type IS NULL OR ${n}.related_type NOT IN ('rider_profile','rider_report','rider_assignment')
 OR (${n}.related_type='rider_profile' AND EXISTS(SELECT 1 FROM rider_profiles rp JOIN users ru ON ru.id=rp.user_id WHERE rp.user_id=${n}.related_id AND ru.status='active' AND ((${n}.audience_role='customer' AND rp.user_id=${n}.recipient_user_id) OR (${n}.audience_role='staff' AND rp.status='submitted'))))
 OR (${n}.related_type='rider_report' AND EXISTS(SELECT 1 FROM rider_reports rr JOIN shipping_parcels p ON p.shipping_job_id=rr.shipping_job_id JOIN shipping_jobs j ON j.id=p.shipping_job_id JOIN rider_profiles rp ON rp.user_id=rr.rider_user_id JOIN users ru ON ru.id=rp.user_id WHERE rr.id=${n}.related_id AND p.rider_user_id=rr.rider_user_id AND p.method='own_rider' AND rp.status='approved' AND ru.status='active' AND ((${n}.audience_role='customer' AND rr.rider_user_id=${n}.recipient_user_id) OR (${n}.audience_role='staff' AND rr.status='pending' AND p.version=rr.assignment_version AND j.status='dispatched'))))
 OR (${n}.related_type='rider_assignment' AND ${n}.audience_role='customer' AND EXISTS(SELECT 1 FROM shipping_parcels p JOIN shipping_jobs j ON j.id=p.shipping_job_id JOIN rider_profiles rp ON rp.user_id=p.rider_user_id JOIN users ru ON ru.id=rp.user_id WHERE p.shipping_job_id=${n}.related_id AND p.rider_user_id=${n}.recipient_user_id AND p.method='own_rider' AND rp.status='approved' AND ru.status='active' AND j.status NOT IN ('delivered','returned','cancelled'))))`;
}
