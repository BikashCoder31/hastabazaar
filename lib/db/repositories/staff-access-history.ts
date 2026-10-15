import type { Permission } from '../../marketplace/permissions';
import {
  compareStaffAccess,
  parseStaffAccessSnapshot,
  type StaffAccessComparison,
} from '../../staff/access';

export interface StaffAccessHistoryEntry {
  id: string;
  action:
    | 'staff.permissions.applied'
    | 'staff.permissions.approved'
    | 'staff.permissions.rejected';
  outcome: 'applied' | 'rejected' | 'incomplete';
  staffId: string | null;
  staffName: string | null;
  actorId: string | null;
  actorName: string | null;
  reason: string | null;
  createdAt: number;
  /** The original permission request, used as the form-history subject ID. */
  requestId: string | null;
  /** The audit operation ID; decisions may use a different ID from the original request. */
  formRequestId: string | null;
  formHistoryKind: 'staff-permission-proposal' | 'staff-permission-decision';
  beforePermissions: readonly Permission[] | null;
  /** For rejected requests this is the unchanged before snapshot, never the requested grant. */
  afterPermissions: readonly Permission[] | null;
  requestedPermissions: readonly Permission[] | null;
  changes: StaffAccessComparison | null;
}

interface StaffAccessAuditRow extends Pick<
  StaffAccessHistoryEntry,
  | 'id'
  | 'action'
  | 'staffId'
  | 'staffName'
  | 'actorId'
  | 'actorName'
  | 'reason'
  | 'createdAt'
  | 'formRequestId'
> {
  previousJson: string | null;
  nextJson: string | null;
}

function permissionRequestId(row: StaffAccessAuditRow): string | null {
  try {
    const snapshot: unknown = JSON.parse(row.nextJson ?? 'null');
    if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot))
      return null;
    const key = row.action === 'staff.permissions.applied' ? 'id' : 'requestId';
    const id: unknown = (snapshot as Record<string, unknown>)[key];
    return typeof id === 'string' && id.trim() ? id : null;
  } catch {
    return null;
  }
}

/** Reads audit snapshots only; current access is never substituted for missing history. */
export async function listStaffAccessHistory(
  db: D1Database,
  actorId: string,
): Promise<StaffAccessHistoryEntry[]> {
  const activeSuper = `EXISTS(SELECT 1 FROM users reader JOIN user_roles reader_role ON reader_role.user_id=reader.id
    WHERE reader.id=? AND reader.status='active' AND reader_role.role='super_admin')`;
  if (
    !(await db.prepare(`SELECT 1 WHERE ${activeSuper}`).bind(actorId).first())
  )
    throw new Error(
      'Current Super Admin authority is required to read staff access history.',
    );
  const result = await db
    .prepare(`SELECT a.id,a.action,a.subject_id AS staffId,staff.display_name AS staffName,
      a.actor_id AS actorId,actor.display_name AS actorName,a.reason,a.created_at AS createdAt,
      a.request_id AS formRequestId,a.previous_json AS previousJson,a.next_json AS nextJson
    FROM audit_logs a
    LEFT JOIN users staff ON staff.id=a.subject_id
    LEFT JOIN users actor ON actor.id=a.actor_id
    WHERE a.subject_type='staff_permissions'
      AND a.action IN ('staff.permissions.applied','staff.permissions.approved','staff.permissions.rejected')
      AND ${activeSuper}
    ORDER BY a.created_at DESC,a.id DESC LIMIT 100`)
    .bind(actorId)
    .all<StaffAccessAuditRow>();
  return result.results.map((row) => {
    const beforePermissions = parseStaffAccessSnapshot(row.previousJson);
    const requestedPermissions = parseStaffAccessSnapshot(row.nextJson);
    const rejected = row.action === 'staff.permissions.rejected';
    const afterPermissions = rejected
      ? beforePermissions
      : requestedPermissions;
    const changes = compareStaffAccess(beforePermissions, afterPermissions);
    return {
      id: row.id,
      action: row.action,
      outcome: rejected
        ? 'rejected'
        : changes === null
          ? 'incomplete'
          : 'applied',
      staffId: row.staffId,
      staffName: row.staffName,
      actorId: row.actorId,
      actorName: row.actorName,
      reason: row.reason,
      createdAt: row.createdAt,
      requestId: permissionRequestId(row),
      formRequestId: row.formRequestId,
      formHistoryKind:
        row.action === 'staff.permissions.applied'
          ? 'staff-permission-proposal'
          : 'staff-permission-decision',
      beforePermissions,
      afterPermissions,
      requestedPermissions,
      changes,
    };
  });
}
