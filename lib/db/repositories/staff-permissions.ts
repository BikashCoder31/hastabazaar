import { recordStaffAuthorizationOutcome } from '../../operations/authorization-audit';
import { operationalBusinessNotificationStatements } from '../../operations/business-notifications';
import {
  can,
  configurableAdminPermissions,
  validateAdminPermissions,
  type Permission,
} from '../../marketplace/permissions';

export class StaffPermissionConflictError extends Error {}
export interface StaffPermissionProfile {
  userId: string;
  permissions: readonly Permission[];
  version: number;
  updatedBy: string | null;
  updatedAt: number | null;
}
export interface StaffPermissionRequest {
  id: string;
  userId: string;
  permissionsJson: string;
  expectedVersion: number;
  presetName: string | null;
  reason: string;
  proposedBy: string;
  proposedAt: number;
  status: string;
  decidedBy: string | null;
  decisionNote: string | null;
}
export interface StaffPermissionPreset {
  id: string;
  name: string;
  permissionsJson: string;
}
const activeSuper =
  "EXISTS(SELECT 1 FROM users u JOIN user_roles r ON r.user_id=u.id WHERE u.id=? AND u.status='active' AND r.role='super_admin')";
const activeAdmin =
  "EXISTS(SELECT 1 FROM users u JOIN user_roles r ON r.user_id=u.id WHERE u.id=? AND u.status='active' AND r.role='admin') AND NOT EXISTS(SELECT 1 FROM user_roles WHERE user_id=? AND role='super_admin')";
function guard(db: D1Database, predicate: string, values: unknown[]) {
  const id = crypto.randomUUID();
  return [
    db
      .prepare(
        'INSERT INTO staff_permission_guards(id,valid) SELECT ?,CASE WHEN ' +
          predicate +
          ' THEN 1 ELSE 0 END',
      )
      .bind(id, ...values),
    db.prepare('DELETE FROM staff_permission_guards WHERE id=?').bind(id),
  ];
}
async function atomic(
  db: D1Database,
  statements: D1PreparedStatement[],
  context?: { actorId: string; subjectId: string },
) {
  try {
    await db.batch(statements);
  } catch {
    if (context)
      await recordStaffAuthorizationOutcome(db, {
        ...context,
        permission: 'admin.permissions.manage',
        outcome: 'failed',
      });
    throw new StaffPermissionConflictError(
      'Access or request changed. Refresh and review the current permissions before trying again.',
    );
  }
}
function note(value: string) {
  const result = value.trim();
  if (result.length < 8 || result.length > 1000)
    throw new StaffPermissionConflictError(
      'Add a reason of 8–1000 characters.',
    );
  return result;
}
function audit(
  db: D1Database,
  actor: string,
  action: string,
  user: string,
  reason: string,
  before: unknown,
  after: unknown,
  now: number,
) {
  return db
    .prepare(
      "INSERT INTO audit_logs(id,actor_id,action,subject_type,subject_id,reason,previous_json,next_json,request_id,ip_hash,created_at) VALUES (?,?,?,'staff_permissions',?,?,?,?,?,NULL,?)",
    )
    .bind(
      crypto.randomUUID(),
      actor,
      action,
      user,
      reason,
      JSON.stringify(before),
      JSON.stringify(after),
      crypto.randomUUID(),
      now,
    );
}
export async function getStaffPermissionProfile(
  db: D1Database,
  userId: string,
): Promise<StaffPermissionProfile> {
  const row = await db
    .prepare(
      'SELECT permissions_json AS permissionsJson,version,updated_by AS updatedBy,updated_at AS updatedAt FROM staff_permission_profiles WHERE user_id=?',
    )
    .bind(userId)
    .first<{
      permissionsJson: string;
      version: number;
      updatedBy: string;
      updatedAt: number;
    }>();
  // Invalid persisted data fails closed, never restores broad legacy access.
  let permissions: readonly Permission[] = configurableAdminPermissions;
  if (row) {
    try {
      permissions = validateAdminPermissions(JSON.parse(row.permissionsJson));
    } catch {
      permissions = [];
    }
  }
  return {
    userId,
    permissions,
    version: row?.version ?? 0,
    updatedBy: row?.updatedBy ?? null,
    updatedAt: row?.updatedAt ?? null,
  };
}
export async function listStaffPermissionChanges(db: D1Database) {
  const [requests, presets] = await Promise.all([
    db
      .prepare(
        'SELECT id,user_id AS userId,permissions_json AS permissionsJson,expected_version AS expectedVersion,preset_name AS presetName,reason,proposed_by AS proposedBy,proposed_at AS proposedAt,status,decided_by AS decidedBy,decision_note AS decisionNote FROM staff_permission_requests ORDER BY proposed_at DESC LIMIT 100',
      )
      .all<StaffPermissionRequest>(),
    db
      .prepare(
        'SELECT id,name,permissions_json AS permissionsJson FROM staff_permission_presets ORDER BY created_at DESC LIMIT 100',
      )
      .all<StaffPermissionPreset>(),
  ]);
  return { requests: requests.results, presets: presets.results };
}
export async function proposeStaffPermissions(
  db: D1Database,
  options: {
    actorId: string;
    userId: string;
    permissions: unknown;
    version: number;
    reason: string;
    presetName?: string;
    now: number;
  },
) {
  const reason = note(options.reason);
  const permissions = validateAdminPermissions(options.permissions);
  if (options.actorId === options.userId)
    throw new StaffPermissionConflictError(
      'You cannot change your own permissions.',
    );
  if (!Number.isSafeInteger(options.version) || options.version < 0)
    throw new StaffPermissionConflictError(
      'Refresh the current access version.',
    );
  const presetName = options.presetName?.trim() || null;
  if (presetName && presetName.length > 80)
    throw new StaffPermissionConflictError(
      'Preset names must be at most 80 characters.',
    );
  const id = crypto.randomUUID();
  await atomic(
    db,
    [
      ...guard(db, activeSuper + ' AND ' + activeAdmin, [
        options.actorId,
        options.userId,
        options.userId,
      ]),
      db
        .prepare(
          'INSERT OR IGNORE INTO staff_permission_profiles(user_id,permissions_json,version,updated_by,updated_at) VALUES (?,?,0,?,?)',
        )
        .bind(
          options.userId,
          JSON.stringify(configurableAdminPermissions),
          options.actorId,
          options.now,
        ),
      ...guard(
        db,
        'EXISTS(SELECT 1 FROM staff_permission_profiles WHERE user_id=? AND version=?)',
        [options.userId, options.version],
      ),
      db
        .prepare(
          'INSERT INTO staff_permission_requests(id,user_id,permissions_json,expected_version,preset_name,reason,proposed_by,proposed_at) VALUES (?,?,?,?,?,?,?,?)',
        )
        .bind(
          id,
          options.userId,
          JSON.stringify(permissions),
          options.version,
          presetName,
          reason,
          options.actorId,
          options.now,
        ),
      audit(
        db,
        options.actorId,
        'staff.permissions.proposed',
        options.userId,
        reason,
        { version: options.version },
        { id, permissions, presetName },
        options.now,
      ),
      ...(await operationalBusinessNotificationStatements(db, {
        kind: 'permissions.proposed',
        sourceId: id,
        eventId: id,
        actorId: options.actorId,
        now: options.now,
      })),
    ],
    { actorId: options.actorId, subjectId: options.userId },
  );
  return id;
}
export async function decideStaffPermissions(
  db: D1Database,
  options: {
    actorId: string;
    requestId: string;
    decision: 'approve' | 'reject';
    reason: string;
    now: number;
  },
) {
  const reason = note(options.reason);
  const request = await db
    .prepare(
      'SELECT id,user_id AS userId,permissions_json AS permissionsJson,expected_version AS expectedVersion,preset_name AS presetName,reason,proposed_by AS proposedBy,proposed_at AS proposedAt,status,decided_by AS decidedBy,decision_note AS decisionNote FROM staff_permission_requests WHERE id=?',
    )
    .bind(options.requestId)
    .first<StaffPermissionRequest>();
  if (
    !request ||
    request.status !== 'pending' ||
    request.proposedBy === options.actorId ||
    request.userId === options.actorId
  ) {
    await recordStaffAuthorizationOutcome(db, {
      actorId: options.actorId,
      subjectId: request?.userId,
      permission: 'admin.permissions.manage',
      outcome: 'denied',
    });
    throw new StaffPermissionConflictError(
      'A different active Super Admin must decide a pending request.',
    );
  }
  const permissions = validateAdminPermissions(
    JSON.parse(request.permissionsJson),
  );
  const previous = await getStaffPermissionProfile(db, request.userId);
  const decisionToken = crypto.randomUUID();
  const statements = [
    ...guard(db, activeSuper + ' AND ' + activeSuper + ' AND ' + activeAdmin, [
      options.actorId,
      request.proposedBy,
      request.userId,
      request.userId,
    ]),
    db
      .prepare(
        "UPDATE staff_permission_requests SET status=?,decided_by=?,decided_at=?,decision_note=?,decision_token=? WHERE id=? AND status='pending' AND proposed_by<>?",
      )
      .bind(
        options.decision === 'approve' ? 'approved' : 'rejected',
        options.actorId,
        options.now,
        reason,
        decisionToken,
        request.id,
        options.actorId,
      ),
    ...guard(
      db,
      'EXISTS(SELECT 1 FROM staff_permission_requests WHERE id=? AND decision_token=?)',
      [request.id, decisionToken],
    ),
  ];
  if (options.decision === 'approve') {
    statements.push(
      db
        .prepare(
          'UPDATE staff_permission_profiles SET permissions_json=?,version=version+1,last_request_id=?,updated_by=?,updated_at=? WHERE user_id=? AND version=?',
        )
        .bind(
          JSON.stringify(permissions),
          request.id,
          options.actorId,
          options.now,
          request.userId,
          request.expectedVersion,
        ),
      ...guard(
        db,
        'EXISTS(SELECT 1 FROM staff_permission_profiles WHERE user_id=? AND version=? AND last_request_id=?)',
        [request.userId, request.expectedVersion + 1, request.id],
      ),
    );
    if (request.presetName)
      statements.push(
        db
          .prepare(
            'INSERT INTO staff_permission_presets(id,name,permissions_json,created_by,created_at) VALUES (?,?,?,?,?)',
          )
          .bind(
            request.id,
            request.presetName,
            JSON.stringify(permissions),
            options.actorId,
            options.now,
          ),
      );
  }
  statements.push(
    audit(
      db,
      options.actorId,
      'staff.permissions.' +
        (options.decision === 'approve' ? 'approved' : 'rejected'),
      request.userId,
      reason,
      previous,
      { requestId: request.id, permissions, proposedBy: request.proposedBy },
      options.now,
    ),
  );
  if (options.decision === 'approve')
    statements.push(
      ...(await operationalBusinessNotificationStatements(db, {
        kind: 'permissions.changed',
        sourceId: request.userId,
        eventId: request.id,
        actorId: options.actorId,
        now: options.now,
      })),
    );
  if (options.decision === 'reject')
    statements.push(
      ...(await operationalBusinessNotificationStatements(db, {
        kind: 'permissions.rejected',
        sourceId: request.id,
        eventId: request.id,
        actorId: options.actorId,
        now: options.now,
      })),
    );
  await atomic(db, statements, {
    actorId: options.actorId,
    subjectId: request.userId,
  });
}

/** Fresh active role and permission lookup for private media and other identity-based paths. */
export async function hasStaffPermissionBySubject(
  db: D1Database,
  authSubject: string,
  permission: Permission,
): Promise<boolean> {
  const row = await db
    .prepare(
      "SELECT u.id,r.role FROM users u JOIN user_roles r ON r.user_id=u.id WHERE u.auth_subject=? AND u.status='active' AND r.role IN ('admin','super_admin') ORDER BY CASE r.role WHEN 'super_admin' THEN 0 ELSE 1 END LIMIT 1",
    )
    .bind(authSubject)
    .first<{ id: string; role: 'admin' | 'super_admin' }>();
  if (!row) return false;
  return can(
    {
      role: row.role,
      permissions:
        row.role === 'admin'
          ? (await getStaffPermissionProfile(db, row.id)).permissions
          : undefined,
    },
    permission,
  );
}
