import type { Permission } from '../marketplace/permissions';
/** Safe security outcome, restricted to an identified active staff actor. Logging never changes denial. */
export async function recordStaffAuthorizationOutcome(
  db: D1Database,
  options: {
    actorId: string;
    permission: Permission;
    subjectId?: string;
    outcome: 'denied' | 'failed';
    now?: number;
  },
): Promise<void> {
  try {
    await db
      .prepare(
        "INSERT INTO audit_logs(id,actor_id,action,subject_type,subject_id,reason,previous_json,next_json,request_id,ip_hash,created_at) SELECT ?,u.id,?,'staff_authorization',?, ?,NULL,?,NULL,NULL,? FROM users u WHERE u.id=? AND u.status='active' AND EXISTS(SELECT 1 FROM user_roles r WHERE r.user_id=u.id AND r.role IN ('admin','super_admin'))",
      )
      .bind(
        crypto.randomUUID(),
        'staff.authorization.' + options.outcome,
        options.subjectId ?? options.actorId,
        options.outcome === 'denied'
          ? 'Staff capability or independent-approval boundary denied this action.'
          : 'Sensitive staff mutation failed its current-state or authority check.',
        JSON.stringify({
          permission: options.permission,
          outcome: options.outcome,
        }),
        options.now ?? Date.now(),
        options.actorId,
      )
      .run();
  } catch {
    /* Fail closed even when audit storage is unavailable. */
  }
}
