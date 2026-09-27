import {
  createHash,
  randomInt,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import { operationalBusinessNotificationStatements } from '../operations/business-notifications';
import { staffMutationGuard } from '../db/repositories/staff-mutation-guard';
import { buildFormAnswerInsert } from '../db/repositories/form-answers';
import type { FormAnswerSnapshot } from '../forms/types';
import { normalizeDistrict } from '../checkout/nepal-address';
import {
  can,
  validateAdminPermissions,
  type Permission,
} from '../marketplace/permissions';
export class RiderError extends Error {}
export class RiderReplayConflictError extends RiderError {}
export class RiderStorageError extends Error {}
export function riderText(value: unknown, min = 2, max = 160) {
  if (
    typeof value !== 'string' ||
    value.trim().length < min ||
    value.length > max
  )
    throw new RiderError(
      'Complete required rider details within the displayed limits.',
    );
  return value.trim();
}
export function riderApplicationInput(form: FormData) {
  const legalName = riderText(form.get('legalName')),
    phone = riderText(form.get('phone'), 10, 20),
    district = normalizeDistrict(riderText(form.get('district'))),
    identityType = riderText(form.get('identityType')),
    identityNumber = riderText(form.get('identityNumber'), 3, 80);
  if (
    !district ||
    !/^\+?[0-9 ()-]{10,20}$/.test(phone) ||
    !['citizenship', 'national_id', 'passport', 'driving_licence'].includes(
      identityType,
    )
  )
    throw new RiderError(
      'Use a listed district, valid phone and identity type.',
    );
  return { legalName, phone, district, identityType, identityNumber };
}
export function riderGuard(
  db: D1Database,
  predicate: string,
  values: unknown[] = [],
) {
  const id = crypto.randomUUID();
  return [
    db
      .prepare(
        'INSERT INTO operation_transaction_guards(id,valid) SELECT ?,CASE WHEN ' +
          predicate +
          ' THEN 1 ELSE 0 END',
      )
      .bind(id, ...values),
    db.prepare('DELETE FROM operation_transaction_guards WHERE id=?').bind(id),
  ];
}
export const approvedRiderSql =
  "EXISTS(SELECT 1 FROM rider_profiles rp JOIN users ru ON ru.id=rp.user_id WHERE rp.user_id=? AND rp.status='approved' AND ru.status='active')";
export async function approvedRider(db: D1Database, userId: string) {
  return !!(await db
    .prepare('SELECT 1 WHERE ' + approvedRiderSql)
    .bind(userId)
    .first());
}

export async function submitRiderRemittance(
  db: D1Database,
  o: {
    riderId: string;
    jobId: string;
    requestId: string;
    amountPaisa: number;
    reference: string;
    now: number;
    form?: { requestId: string; versionId: string; answers: FormAnswerSnapshot; digest: string };
  },
) {
  const requestId = riderText(o.requestId, 8, 150),
    reference = riderText(o.reference, 4, 120);
  if (!Number.isSafeInteger(o.amountPaisa) || o.amountPaisa < 1)
    throw new RiderError('Enter a positive remittance amount in paisa.');
  const existing = await db
    .prepare(
      "SELECT id,shipping_job_id AS jobId,amount_paisa AS amountPaisa,evidence_reference AS reference,status,created_by AS riderId FROM parcel_cash_records WHERE id=? AND kind='remittance'",
    )
    .bind(requestId)
    .first<{
      id: string;
      jobId: string;
      amountPaisa: number;
      reference: string;
      status: string;
      riderId: string;
    }>();
  if (existing) {
    if (
      existing.riderId !== o.riderId ||
      existing.jobId !== o.jobId ||
      existing.amountPaisa !== o.amountPaisa ||
      existing.reference !== reference
    )
      throw new RiderError(
        'This remittance request reference was already used for different details.',
      );
    if (o.form) {
      const answer = await db.prepare(`SELECT subject_id AS subjectId,actor_id AS actorId,
        config_version_id AS versionId FROM form_answer_sets
        WHERE form_id='rider.remittance' AND request_id=? LIMIT 1`)
        .bind(requestId).first<{ subjectId: string; actorId: string; versionId: string }>();
      const audits = await db.prepare(`SELECT actor_id AS actorId,subject_id AS subjectId,next_json AS nextJson
        FROM audit_logs WHERE request_id=? LIMIT 2`)
        .bind(`rider.remittance:${requestId}`)
        .all<{ actorId: string; subjectId: string; nextJson: string | null }>();
      let digest: unknown;
      try { digest = audits.results.length === 1 && JSON.parse(audits.results[0].nextJson ?? '').catalogDigest; }
      catch { /* Invalid prior audit cannot authorize replay. */ }
      if (o.form.requestId !== requestId || answer?.subjectId !== existing.id ||
        answer.actorId !== o.riderId || answer.versionId !== o.form.versionId ||
        audits.results[0]?.actorId !== o.riderId || audits.results[0]?.subjectId !== existing.id ||
        digest !== o.form.digest)
        throw new RiderError('This remittance request reference was already used for different details.');
    }
    return Object.freeze({ id: existing.id, status: existing.status });
  }
  const position = await db
    .prepare(
      `SELECT p.rider_user_id AS riderId,
        COALESCE((SELECT SUM(o2.amount_paisa-COALESCE((SELECT SUM(a.amount_paisa) FROM rider_remittance_allocations a WHERE a.obligation_id=o2.id),0)) FROM rider_cash_obligations o2 WHERE o2.shipping_job_id=p.shipping_job_id AND o2.rider_user_id=?),0)
        -COALESCE((SELECT SUM(c.amount_paisa) FROM parcel_cash_records c WHERE c.shipping_job_id=p.shipping_job_id AND c.rider_user_id=? AND c.kind='remittance' AND c.status='pending'),0) AS availablePaisa
        FROM shipping_parcels p WHERE p.shipping_job_id=? AND p.method='own_rider' AND p.rider_user_id=?`,
    )
    .bind(o.riderId, o.riderId, o.jobId, o.riderId)
    .first<{ riderId: string; availablePaisa: number }>();
  if (!position || !(await approvedRider(db, o.riderId)))
    throw new RiderError('Current approved rider access is required.');
  if (o.amountPaisa > Number(position.availablePaisa ?? 0))
    throw new RiderError(
      'The amount exceeds outstanding rider cash after pending remittances.',
    );
  const guardAvailable = `EXISTS(SELECT 1 FROM shipping_parcels p WHERE p.shipping_job_id=? AND p.method='own_rider' AND p.rider_user_id=? AND ?>0 AND ?<=COALESCE((SELECT SUM(o2.amount_paisa-COALESCE((SELECT SUM(a.amount_paisa) FROM rider_remittance_allocations a WHERE a.obligation_id=o2.id),0)) FROM rider_cash_obligations o2 WHERE o2.shipping_job_id=p.shipping_job_id AND o2.rider_user_id=?),0)-COALESCE((SELECT SUM(c.amount_paisa) FROM parcel_cash_records c WHERE c.shipping_job_id=p.shipping_job_id AND c.rider_user_id=? AND c.kind='remittance' AND c.status='pending'),0))`;
  try {
    await db.batch([
      db
        .prepare('UPDATE shipping_parcels SET version=version WHERE shipping_job_id=?')
        .bind(o.jobId),
      ...riderGuard(db, approvedRiderSql, [o.riderId]),
      ...riderGuard(db, guardAvailable, [
        o.jobId,
        o.riderId,
        o.amountPaisa,
        o.amountPaisa,
        o.riderId,
        o.riderId,
      ]),
      db
        .prepare(
          "INSERT INTO parcel_cash_records(id,shipping_job_id,kind,amount_paisa,evidence_reference,status,created_by,created_at,rider_user_id) VALUES (?,?,'remittance',?,?,'pending',?,?,?)",
        )
        .bind(
          requestId,
          o.jobId,
          o.amountPaisa,
          reference,
          o.riderId,
          o.now,
          o.riderId,
        ),
      ...(o.form ? [buildFormAnswerInsert(db, {
        formId: 'rider.remittance', requestId, versionId: o.form.versionId,
        subjectType: 'parcel_cash_record', subjectId: requestId,
        actorId: o.riderId, answers: o.form.answers, now: o.now,
      }), db.prepare(`INSERT INTO audit_logs
        (id,actor_id,action,subject_type,subject_id,reason,next_json,request_id,created_at)
        VALUES (?,?, 'rider.remittance.submitted','parcel_cash_record',?,
          'Configured rider remittance submitted',?,?,?)`)
        .bind(crypto.randomUUID(), o.riderId, requestId,
          JSON.stringify({ catalogDigest: o.form.digest }), `rider.remittance:${requestId}`, o.now)] : []),
      db
        .prepare(
          "INSERT INTO parcel_operation_events(id,order_id,shipping_job_id,actor_id,action,payload_json,note,created_at) SELECT ?,j.order_id,j.id,?,'rider_remittance_submitted',?,'Rider-submitted cash handover awaits separate finance verification',? FROM shipping_jobs j WHERE j.id=?",
        )
        .bind(
          requestId,
          o.riderId,
          JSON.stringify({ amountPaisa: o.amountPaisa, reference }),
          o.now,
          o.jobId,
        ),
      ...audit(
        db,
        o.riderId,
        o.riderId,
        'remittance_submitted',
        'Cash handover awaits separate finance verification.',
        o.now,
      ),
    ]);
  } catch {
    throw new RiderError(
      'The outstanding rider cash changed or this reference was already used. Refresh and try again.',
    );
  }
  return Object.freeze({ id: requestId, status: 'pending' as const });
}
export async function riderProfile(db: D1Database, userId: string) {
  return db
    .prepare(
      'SELECT p.status,p.version,p.review_note AS reviewNote,p.application_id AS applicationId,p.open_box_eligible AS openBoxEligible,a.legal_name AS legalName,a.phone,a.district FROM rider_profiles p JOIN rider_applications a ON a.id=p.application_id WHERE p.user_id=?',
    )
    .bind(userId)
    .first<{
      status: string;
      version: number;
      reviewNote: string | null;
      applicationId: string;
      openBoxEligible: number;
      legalName: string;
      phone: string;
      district: string;
    }>();
}
function audit(
  db: D1Database,
  actor: string,
  user: string,
  action: string,
  note: string,
  now: number,
  reportId: string | null = null,
  eventId: string = crypto.randomUUID(),
) {
  return [
    db
      .prepare(
        'INSERT INTO rider_events(id,user_id,actor_id,action,report_id,note,created_at) VALUES (?,?,?,?,?,?,?)',
      )
      .bind(eventId, user, actor, action, reportId, note, now),
    db
      .prepare(
        "INSERT INTO audit_logs(id,actor_id,action,subject_type,subject_id,reason,created_at) VALUES (?,?,?,'rider',?,'Rider workflow updated',?)",
      )
      .bind(crypto.randomUUID(), actor, 'rider.' + action, user, now),
  ];
}
export async function riderNotifications(
  db: D1Database,
  eventId: string,
  type: 'rider_profile' | 'rider_report' | 'rider_assignment',
  id: string,
  owner: string,
  staffPermission: 'admin.invite' | 'order.manage' | null,
  now: number,
  subject: string,
) {
  const rows: {
    id: string;
    audience: string;
    permission: string | null;
    role?: string;
    profile?: string | null;
  }[] = [{ id: owner, audience: 'customer', permission: null }];
  if (staffPermission) {
    const staff = await db
      .prepare(
        "SELECT u.id,CASE WHEN EXISTS(SELECT 1 FROM user_roles r WHERE r.user_id=u.id AND r.role='super_admin') THEN 'super_admin' ELSE 'admin' END AS role,p.permissions_json AS profile FROM users u LEFT JOIN staff_permission_profiles p ON p.user_id=u.id WHERE u.status='active' AND EXISTS(SELECT 1 FROM user_roles r WHERE r.user_id=u.id AND r.role IN ('admin','super_admin'))",
      )
      .all<{
        id: string;
        role: 'admin' | 'super_admin';
        profile: string | null;
      }>();
    for (const person of staff.results) {
      let permissions: Permission[] | undefined;
      if (person.profile !== null) {
        try {
          permissions = validateAdminPermissions(JSON.parse(person.profile));
        } catch {
          permissions = [];
        }
      }
      if (
        person.id !== owner &&
        can({ role: person.role, permissions }, staffPermission)
      )
        rows.push({
          ...person,
          audience: 'staff',
          permission: staffPermission,
        });
    }
  }
  const statements: D1PreparedStatement[] = [];
  for (const row of rows) {
    const predicates: string[] = [];
    const values: unknown[] = [];
    if (row.role) {
      predicates.push(
        'EXISTS(SELECT 1 FROM user_roles r WHERE r.user_id=users.id AND r.role=?)',
      );
      values.push(row.role);
      if (row.role === 'admin') {
        predicates.push(
          row.profile === null
            ? 'NOT EXISTS(SELECT 1 FROM staff_permission_profiles p WHERE p.user_id=users.id)'
            : 'EXISTS(SELECT 1 FROM staff_permission_profiles p WHERE p.user_id=users.id AND p.permissions_json=?)',
        );
        if (row.profile !== null) values.push(row.profile);
      }
    }
    for (const channel of ['in_app', 'email'])
      statements.push(
        db
          .prepare(
            "INSERT OR IGNORE INTO notification_messages(id,recipient_user_id,audience_role,channel,template_key,subject_en,subject_ne,body_en,body_ne,related_type,related_id,status,request_id,created_at,business_event_key,required_permission) SELECT ?,id,?,?,'business.rider.update',?,?,?, ?,?,?,'queued',?,?,'business.rider.update',? FROM users WHERE id=? AND status='active'" +
              (predicates.length ? ' AND ' + predicates.join(' AND ') : ''),
          )
          .bind(
            crypto.randomUUID(),
            row.audience,
            channel,
            subject,
            subject,
            'Open the authorized rider record for the result and next action.',
            'Open the authorized rider record for the result and next action.',
            type,
            id,
            'rider:' + eventId + ':' + row.id + ':' + channel,
            now,
            row.permission,
            row.id,
            ...values,
          ),
      );
  }
  return statements;
}
export async function riderApplicationReplay(db: D1Database, input: {
  userId: string; requestId: string; versionId: string; digest: string;
}): Promise<string | null> {
  const audits = await db.prepare(`SELECT actor_id AS actorId,subject_id AS subjectId,next_json AS nextJson
    FROM audit_logs WHERE request_id=? AND action='rider.application.submitted' LIMIT 2`)
    .bind(`rider.application:${input.requestId}`).all<{
      actorId: string; subjectId: string; nextJson: string | null;
    }>();
  if (!audits.results.length) {
    const answer = await db.prepare(`SELECT id FROM form_answer_sets
      WHERE form_id='rider.application' AND request_id=? LIMIT 1`)
      .bind(input.requestId).first();
    if (answer) throw new RiderError('Application request reference is already used.');
    return null;
  }
  if (audits.results.length !== 1) throw new RiderError('Application request reference is already used.');
  const audit = audits.results[0];
  const linked = await db.prepare(`SELECT a.id FROM rider_applications a
    JOIN form_answer_sets f ON f.subject_type='rider_application' AND f.subject_id=a.id
      AND f.form_id='rider.application' AND f.request_id=? AND f.config_version_id=?
    WHERE a.id=? AND a.user_id=? AND f.actor_id=? LIMIT 1`)
    .bind(input.requestId, input.versionId, audit.subjectId, input.userId, input.userId)
    .first<{ id: string }>();
  let recorded: unknown;
  try { recorded = JSON.parse(audit.nextJson ?? '').catalogDigest; }
  catch { /* Invalid audit data cannot authorize a replay. */ }
  if (audit.actorId !== input.userId || recorded !== input.digest || !linked)
    throw new RiderError('Application request reference is already used for different details.');
  return linked.id;
}

export async function submitRiderApplication(
  db: D1Database,
  o: ReturnType<typeof riderApplicationInput> & {
    userId: string;
    key: string;
    mime: string;
    now: number;
    form?: { requestId: string; versionId: string; answers: FormAnswerSnapshot; digest: string };
  },
) {
  if (o.form) {
    const prior = await riderApplicationReplay(db, { userId: o.userId,
      requestId: o.form.requestId, versionId: o.form.versionId, digest: o.form.digest });
    if (prior) return prior;
  }
  const current = await riderProfile(db, o.userId);
  if (
    current &&
    ['approved', 'submitted', 'suspended'].includes(current.status)
  )
    throw new RiderError(
      'Your existing rider application needs staff review before another submission.',
    );
  const id = crypto.randomUUID();
  const checks = riderGuard(
    db,
    "EXISTS(SELECT 1 FROM users WHERE id=? AND status='active')",
    [o.userId],
  );
  checks.push(
    ...riderGuard(
      db,
      current
        ? "EXISTS(SELECT 1 FROM rider_profiles WHERE user_id=? AND version=? AND status='rejected')"
        : 'NOT EXISTS(SELECT 1 FROM rider_profiles WHERE user_id=?)',
      current ? [o.userId, current.version] : [o.userId],
    ),
  );
  await db.batch([
    db.prepare('UPDATE users SET status=status WHERE id=?').bind(o.userId),
    ...checks,
    db
      .prepare(
        'INSERT INTO rider_applications(id,user_id,legal_name,phone,district,identity_type,identity_number,object_key,mime_type,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
      )
      .bind(
        id,
        o.userId,
        o.legalName,
        o.phone,
        o.district,
        o.identityType,
        o.identityNumber,
        o.key,
        o.mime,
        o.now,
      ),
    ...(o.form ? [buildFormAnswerInsert(db, {
      formId: 'rider.application', requestId: o.form.requestId,
      versionId: o.form.versionId, subjectType: 'rider_application',
      subjectId: id, actorId: o.userId, answers: o.form.answers, now: o.now,
    })] : []),
    ...(o.form ? [db.prepare(`INSERT INTO audit_logs
      (id,actor_id,action,subject_type,subject_id,reason,next_json,request_id,created_at)
      VALUES (?,?, 'rider.application.submitted','rider_application',?,
        'Configured rider application submitted',?,?,?)`)
      .bind(crypto.randomUUID(), o.userId, id,
        JSON.stringify({ catalogDigest: o.form.digest }), `rider.application:${o.form.requestId}`, o.now)] : []),
    current
      ? db
          .prepare(
            "UPDATE rider_profiles SET status='submitted',application_id=?,version=version+1,reviewed_by=NULL,review_note=NULL,updated_at=? WHERE user_id=?",
          )
          .bind(id, o.now, o.userId)
      : db
          .prepare(
            "INSERT INTO rider_profiles(user_id,status,application_id,updated_at) VALUES (?,'submitted',?,?)",
          )
          .bind(o.userId, id, o.now),
    ...audit(
      db,
      o.userId,
      o.userId,
      'application_submitted',
      'Identity evidence submitted for Super Admin review.',
      o.now,
    ),
    ...(await riderNotifications(
      db,
      id,
      'rider_profile',
      o.userId,
      o.userId,
      'admin.invite',
      o.now,
      'Rider application submitted',
    )),
  ]);
  return id;
}
export async function reviewRider(
  db: D1Database,
  o: {
    actorId: string;
    userId: string;
    version: number;
    status: string;
    note: string;
    now: number;
  },
) {
  const authority = await staffMutationGuard(
    db,
    o.actorId,
    'admin.invite',
    RiderError,
    'super_admin',
  );
  if (
    !['approved', 'rejected', 'suspended'].includes(o.status) ||
    !Number.isSafeInteger(o.version)
  )
    throw new RiderError('Choose approval, rejection or suspension.');
  const note = riderText(o.note, 8, 500);
  await db.batch([
    db
      .prepare('UPDATE rider_profiles SET version=version WHERE user_id=?')
      .bind(o.userId),
    ...riderGuard(
      db,
      'EXISTS(SELECT 1 FROM rider_profiles WHERE user_id=? AND version=?)',
      [o.userId, o.version],
    ),
    db
      .prepare(
        'UPDATE rider_profiles SET status=?,version=version+1,reviewed_by=?,review_note=?,updated_at=? WHERE user_id=?',
      )
      .bind(o.status, o.actorId, note, o.now, o.userId),
    db
      .prepare(
        "UPDATE shipping_parcels SET latitude=NULL,longitude=NULL,accuracy=NULL,position_at=NULL WHERE rider_user_id=? AND ?<>'approved'",
      )
      .bind(o.userId, o.status),
    db
      .prepare(
        "UPDATE delivery_assignments SET latitude=NULL,longitude=NULL,accuracy=NULL,position_at=NULL WHERE rider_user_id=? AND ?<>'approved'",
      )
      .bind(o.userId, o.status),
    ...audit(db, o.actorId, o.userId, o.status, note, o.now),
    ...(await riderNotifications(
      db,
      crypto.randomUUID(),
      'rider_profile',
      o.userId,
      o.userId,
      null,
      o.now,
      'Rider application ' + o.status,
    )),
    ...authority.statements,
  ]);
}
export async function setRiderOpenBoxEligibility(
  db: D1Database,
  o: {
    actorId: string;
    userId: string;
    version: number;
    eligible: boolean;
    note: string;
    now: number;
  },
) {
  const authority = await staffMutationGuard(
    db,
    o.actorId,
    'admin.invite',
    RiderError,
    'super_admin',
  );
  const note = riderText(o.note, 8, 500);
  if (!Number.isSafeInteger(o.version))
    throw new RiderError('Refresh the rider record.');
  await db.batch([
    db
      .prepare('UPDATE rider_profiles SET version=version WHERE user_id=?')
      .bind(o.userId),
    ...riderGuard(
      db,
      "EXISTS(SELECT 1 FROM rider_profiles WHERE user_id=? AND version=? AND status='approved')",
      [o.userId, o.version],
    ),
    db
      .prepare(
        'UPDATE rider_profiles SET open_box_eligible=?,open_box_reviewed_by=?,open_box_reviewed_at=?,version=version+1,updated_at=? WHERE user_id=?',
      )
      .bind(o.eligible ? 1 : 0, o.actorId, o.now, o.now, o.userId),
    ...audit(
      db,
      o.actorId,
      o.userId,
      o.eligible ? 'open_box_approved' : 'open_box_removed',
      note,
      o.now,
    ),
    ...authority.statements,
  ]);
}
export interface RiderPolicy {
  version: number;
  openBox: number;
  otpScope: string;
}
export async function riderPolicy(db: D1Database) {
  const row = await db
    .prepare(
      "SELECT version,open_box AS openBox,otp_scope AS otpScope FROM rider_policy WHERE id='current'",
    )
    .first<RiderPolicy>();
  if (!row) throw new RiderError('Rider settings unavailable.');
  return row;
}
export async function saveRiderPolicy(
  db: D1Database,
  o: {
    actorId: string;
    version: number;
    openBox: boolean;
    otpScope: string;
    now: number;
  },
) {
  const authority = await staffMutationGuard(
    db,
    o.actorId,
    'admin.invite',
    RiderError,
    'super_admin',
  );
  if (
    !['off', 'prepaid_only'].includes(o.otpScope) ||
    !Number.isSafeInteger(o.version)
  )
    throw new RiderError(
      'Select a supported OTP scope. COD never requires OTP.',
    );
  await db.batch([
    db.prepare("UPDATE rider_policy SET version=version WHERE id='current'"),
    ...riderGuard(
      db,
      "EXISTS(SELECT 1 FROM rider_policy WHERE id='current' AND version=?)",
      [o.version],
    ),
    db
      .prepare(
        "UPDATE rider_policy SET open_box=?,otp_scope=?,version=version+1,updated_by=?,updated_at=? WHERE id='current'",
      )
      .bind(0, o.otpScope, o.actorId, o.now),
    db
      .prepare(
        'INSERT INTO rider_policy_versions(version,proof_required,open_box,otp_scope,created_by,created_at) VALUES (?,1,?,?,?,?)',
      )
      .bind(o.version + 1, 0, o.otpScope, o.actorId, o.now),
    ...audit(
      db,
      o.actorId,
      o.actorId,
      'policy_updated',
      'Delivery proof remains required; updated optional prepaid OTP settings. Open-box uses Business Settings and rider eligibility snapshots.',
      o.now,
    ),
    ...authority.statements,
  ]);
}
export interface RiderReport {
  id: string;
  jobId: string;
  riderId: string;
  assignmentVersion: number;
  kind: string;
  note: string;
  mime: string | null;
  cashPaisa: number;
  openBoxOutcome: string;
  status: string;
  reviewNote: string | null;
  createdAt: number;
  orderNumber: string;
  orderId: string;
  currentRider: string | null;
  currentVersion: number;
}
export const reportSelect =
  'SELECT r.id,r.shipping_job_id AS jobId,r.rider_user_id AS riderId,r.assignment_version AS assignmentVersion,r.kind,r.note,r.mime_type AS mime,r.cash_paisa AS cashPaisa,r.open_box_outcome AS openBoxOutcome,r.status,r.review_note AS reviewNote,r.created_at AS createdAt,j.order_id AS orderId,o.order_number AS orderNumber,p.rider_user_id AS currentRider,p.version AS currentVersion FROM rider_reports r JOIN shipping_jobs j ON j.id=r.shipping_job_id JOIN orders o ON o.id=j.order_id JOIN shipping_parcels p ON p.shipping_job_id=j.id';
export async function listRiderReports(db: D1Database, riderId?: string) {
  return (
    await db
      .prepare(
        reportSelect +
          (riderId ? ' WHERE r.rider_user_id=? AND p.rider_user_id=?' : '') +
          ' ORDER BY r.created_at DESC LIMIT 100',
      )
      .bind(...(riderId ? [riderId, riderId] : []))
      .all<RiderReport>()
  ).results;
}
export async function submitRiderReport(
  db: D1Database,
  o: {
    riderId: string;
    jobId: string;
    version: number;
    kind: string;
    note: string;
    cashPaisa: number;
    key: string | null;
    mime: string | null;
    requestId: string;
    openBox?: boolean;
    openBoxOutcome?: string;
    now: number;
    form?: { requestId: string; versionId: string; answers: FormAnswerSnapshot; digest: string };
  },
) {
  if (o.form) {
    if (o.form.requestId !== o.requestId || !/^[a-f0-9]{64}$/.test(o.form.digest) &&
      !/^[a-zA-Z0-9_-]{8,100}$/.test(o.form.digest))
      throw new RiderError('Report request reference is invalid.');
    const previous = await db.prepare(`SELECT id,shipping_job_id AS jobId,rider_user_id AS riderId,
      assignment_version AS version,kind,note,cash_paisa AS cashPaisa,open_box_outcome AS openBoxOutcome
      FROM rider_reports WHERE request_id=? LIMIT 1`).bind(o.requestId).first<{
        id: string; jobId: string; riderId: string; version: number; kind: string;
        note: string; cashPaisa: number; openBoxOutcome: string;
      }>();
    if (previous) {
      const auditRows = await db.prepare(`SELECT actor_id AS actorId,subject_id AS subjectId,next_json AS nextJson
        FROM audit_logs WHERE request_id=? LIMIT 2`).bind(`rider.report:${o.requestId}`)
        .all<{ actorId: string; subjectId: string; nextJson: string | null }>();
      const answer = await db.prepare(`SELECT subject_id AS subjectId,actor_id AS actorId,
        config_version_id AS versionId FROM form_answer_sets
        WHERE form_id='rider.report' AND request_id=? LIMIT 1`).bind(o.requestId)
        .first<{ subjectId: string; actorId: string; versionId: string }>();
      let digest: unknown;
      try { digest = auditRows.results.length === 1 && JSON.parse(auditRows.results[0].nextJson ?? '').catalogDigest; }
      catch { /* A malformed prior audit cannot authorize replay. */ }
      if (previous.jobId === o.jobId && previous.riderId === o.riderId &&
        previous.version === o.version && previous.kind === o.kind &&
        previous.note === o.note.trim() && previous.cashPaisa === o.cashPaisa &&
        previous.openBoxOutcome === (o.openBoxOutcome ?? 'not_applicable') &&
        auditRows.results[0]?.actorId === o.riderId && auditRows.results[0]?.subjectId === previous.id &&
        digest === o.form.digest && answer?.subjectId === previous.id &&
        answer.actorId === o.riderId && answer.versionId === o.form.versionId) return previous.id;
      throw new RiderError('This report request reference was already used for different details.');
    }
  }
  if (
    !['delivered', 'failed_delivery', 'customer_unavailable'].includes(
      o.kind,
    ) ||
    !Number.isSafeInteger(o.version) ||
    !Number.isSafeInteger(o.cashPaisa) ||
    o.cashPaisa < 0
  )
    throw new RiderError('Use a valid handover report and cash amount.');
  const note = riderText(o.note, 8, 500);
  riderText(o.requestId, 1, 150);
  if (o.kind === 'delivered' && !o.key)
    throw new RiderError('Add one photo or video as delivery proof.');
  if (o.kind !== 'delivered' && o.cashPaisa !== 0)
    throw new RiderError(
      'Report cash only with a handover; staff handles discrepancies.',
    );
  const policy = await riderPolicy(db);
  const job = await db
    .prepare(
      'SELECT o.payment_mode AS paymentMode,p.cod_due_paisa-p.collected_paisa AS remaining,p.open_box_required AS openBoxRequired,EXISTS(SELECT 1 FROM order_items mi JOIN managed_commercial_snapshots ms ON ms.order_item_id=mi.id WHERE mi.order_id=o.id) AS managedOrder FROM shipping_parcels p JOIN shipping_jobs j ON j.id=p.shipping_job_id JOIN orders o ON o.id=j.order_id WHERE p.shipping_job_id=?',
    )
    .bind(o.jobId)
    .first<{
      paymentMode: string;
      remaining: number;
      openBoxRequired: number;
      managedOrder: number;
    }>();
  if (!job || o.cashPaisa > job.remaining)
    throw new RiderError('Reported cash exceeds the remaining parcel COD.');
  const outcome =
    o.openBoxOutcome ??
    (o.openBox ? 'accepted_after_inspection' : 'not_applicable');
  const deliveredOutcomes = [
      'accepted_after_inspection',
      'accepted_outer_packaging_inner_seal_intact',
      'inspection_declined',
    ],
    refusalOutcomes = [
      'refused_whole_parcel_wrong_item',
      'refused_whole_parcel_damage',
      'refused_whole_parcel_other',
    ];
  if (job.openBoxRequired) {
    if (o.kind === 'delivered' && !deliveredOutcomes.includes(outcome))
      throw new RiderError(
        'Record the configured whole-parcel open-box outcome.',
      );
    if (o.kind === 'failed_delivery' && !refusalOutcomes.includes(outcome))
      throw new RiderError('Record the whole-parcel refusal reason.');
    if (o.kind === 'customer_unavailable' && outcome !== 'not_applicable')
      throw new RiderError(
        'Open-box inspection did not occur for an unavailable recipient.',
      );
    if (
      o.kind === 'failed_delivery' &&
      refusalOutcomes.includes(outcome) &&
      !o.key
    )
      throw new RiderError(
        'Add one photo or video for an open-box whole-parcel refusal.',
      );
  } else if (outcome !== 'not_applicable')
    throw new RiderError(
      'This assignment was not configured for open-box inspection.',
    );
  if (
    o.kind === 'delivered' &&
    job.paymentMode === 'cod' &&
    o.cashPaisa !== job.remaining
  )
    throw new RiderError(
      'Record the full parcel COD payment before requesting handover confirmation.',
    );
  const id = crypto.randomUUID();
  const checks = [
    ...riderGuard(db, approvedRiderSql, [o.riderId]),
    ...riderGuard(
      db,
      "EXISTS(SELECT 1 FROM shipping_parcels p JOIN shipping_jobs j ON j.id=p.shipping_job_id WHERE p.shipping_job_id=? AND p.rider_user_id=? AND p.version=? AND p.method='own_rider' AND j.status='dispatched' AND EXISTS(SELECT 1 FROM orders active_order WHERE active_order.id=j.order_id AND active_order.status IN ('confirmed','packing','ready_for_pickup','dispatched')))",
      [o.jobId, o.riderId, o.version],
    ),
    ...riderGuard(
      db,
      "NOT EXISTS(SELECT 1 FROM rider_reports WHERE shipping_job_id=? AND status='pending')",
      [o.jobId],
    ),
    ...riderGuard(
      db,
      "EXISTS(SELECT 1 FROM rider_policy WHERE id='current' AND version=?)",
      [policy.version],
    ),
  ];
  if (
    o.kind === 'delivered' &&
    ((policy.otpScope === 'prepaid_only' && job.paymentMode !== 'cod') ||
      Boolean(job.managedOrder))
  )
    checks.push(
      ...riderGuard(
        db,
        'EXISTS(SELECT 1 FROM rider_otp_challenges WHERE shipping_job_id=? AND rider_user_id=? AND assignment_version=? AND consumed_at IS NOT NULL AND expires_at>?)',
        [o.jobId, o.riderId, o.version, o.now],
      ),
    );
  await db.batch([
    db
      .prepare(
        'UPDATE shipping_parcels SET version=version WHERE shipping_job_id=?',
      )
      .bind(o.jobId),
    ...checks,
    db
      .prepare(
        'INSERT INTO rider_reports(id,shipping_job_id,rider_user_id,assignment_version,kind,note,object_key,mime_type,cash_paisa,request_id,created_at,policy_version,open_box,open_box_outcome) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
      )
      .bind(
        id,
        o.jobId,
        o.riderId,
        o.version,
        o.kind,
        note,
        o.key,
        o.mime,
        o.cashPaisa,
        o.requestId,
        o.now,
        policy.version,
        job.openBoxRequired ? 1 : 0,
        outcome,
      ),
    ...(o.form ? [buildFormAnswerInsert(db, {
      formId: 'rider.report', requestId: o.form.requestId, versionId: o.form.versionId,
      subjectType: 'rider_report', subjectId: id, actorId: o.riderId,
      answers: o.form.answers, now: o.now,
    })] : []),
    ...(o.form ? [db.prepare(`INSERT INTO audit_logs
      (id,actor_id,action,subject_type,subject_id,reason,next_json,request_id,created_at)
      VALUES (?,?, 'rider.report.submitted','rider_report',?,
        'Configured rider report submitted',?,?,?)`)
      .bind(crypto.randomUUID(), o.riderId, id, JSON.stringify({ catalogDigest: o.form.digest }),
        `rider.report:${o.requestId}`, o.now)] : []),
    ...audit(
      db,
      o.riderId,
      o.riderId,
      'report_submitted',
      'Rider report awaits staff verification.',
      o.now,
      id,
    ),
    ...(await riderNotifications(
      db,
      id,
      'rider_report',
      id,
      o.riderId,
      'order.manage',
      o.now,
      'Rider report needs staff confirmation',
    )),
  ]);
  return id;
}
export async function rejectRiderReport(
  db: D1Database,
  o: { actorId: string; reportId: string; note: string; now: number },
) {
  const authority = await staffMutationGuard(
    db,
    o.actorId,
    'order.manage',
    RiderError,
  );
  const report = await db
    .prepare(reportSelect + ' WHERE r.id=?')
    .bind(o.reportId)
    .first<RiderReport>();
  if (!report || report.status !== 'pending')
    throw new RiderError('This report is no longer pending.');
  const note = riderText(o.note, 8, 500);
  await db.batch([
    db
      .prepare('UPDATE rider_reports SET status=status WHERE id=?')
      .bind(report.id),
    ...riderGuard(
      db,
      "EXISTS(SELECT 1 FROM rider_reports WHERE id=? AND status='pending')",
      [report.id],
    ),
    db
      .prepare(
        "UPDATE rider_reports SET status='rejected',reviewed_by=?,review_note=?,reviewed_at=? WHERE id=?",
      )
      .bind(o.actorId, note, o.now, report.id),
    ...audit(
      db,
      o.actorId,
      report.riderId,
      'report_rejected',
      note,
      o.now,
      report.id,
    ),
    ...(await riderNotifications(
      db,
      report.id + ':rejected',
      'rider_report',
      report.id,
      report.riderId,
      null,
      o.now,
      'Rider proof/report rejected: review and resubmit',
    )),
    ...authority.statements,
  ]);
}
export async function riderReportAcceptance(
  db: D1Database,
  o: {
    reportId: string;
    jobId: string;
    actorId: string;
    version: number;
    requestId: string;
    now: number;
  },
) {
  const authority = await staffMutationGuard(
    db,
    o.actorId,
    'order.manage',
    RiderError,
  );
  const report = await db
    .prepare(reportSelect + ' WHERE r.id=?')
    .bind(o.reportId)
    .first<RiderReport>();
  if (
    !report ||
    report.jobId !== o.jobId ||
    report.status !== 'pending' ||
    report.currentRider !== report.riderId ||
    report.currentVersion !== report.assignmentVersion ||
    report.currentVersion !== o.version
  )
    throw new RiderError(
      'The report or rider assignment changed. Review the current parcel.',
    );
  return {
    report,
    statements: [
      ...authority.statements,
      ...riderGuard(
        db,
        "EXISTS(SELECT 1 FROM shipping_parcels p JOIN shipping_jobs j ON j.id=p.shipping_job_id WHERE p.shipping_job_id=? AND p.rider_user_id=? AND p.version=? AND p.operation_request_id=? AND p.method='own_rider' AND j.status='dispatched' AND EXISTS(SELECT 1 FROM orders active_order WHERE active_order.id=j.order_id AND active_order.status IN ('confirmed','packing','ready_for_pickup','dispatched')))",
        [o.jobId, report.riderId, o.version + 1, o.requestId],
      ),
      ...riderGuard(db, approvedRiderSql, [report.riderId]),
      ...riderGuard(
        db,
        "EXISTS(SELECT 1 FROM rider_reports WHERE id=? AND status='pending')",
        [report.id],
      ),
      db
        .prepare(
          "UPDATE rider_reports SET status='accepted',reviewed_by=?,review_note='Staff verified the handover evidence and reported amount.',reviewed_at=? WHERE id=?",
        )
        .bind(o.actorId, o.now, report.id),
      ...audit(
        db,
        o.actorId,
        report.riderId,
        'report_accepted',
        'Staff confirmed the recorded rider evidence.',
        o.now,
        report.id,
      ),
      ...(await riderFailureFollowup(db, report, o.actorId, o.now)),
      ...(await riderNotifications(
        db,
        report.id + ':accepted',
        'rider_report',
        report.id,
        report.riderId,
        null,
        o.now,
        'Rider report confirmed by staff',
      )),
    ],
  };
}

async function riderFailureFollowup(
  db: D1Database,
  report: RiderReport,
  actorId: string,
  now: number,
) {
  if (report.kind === 'delivered') return [];
  const existing = await db
    .prepare(
      "SELECT id FROM exception_work_items WHERE shipping_job_id=? AND kind=? AND status='open' LIMIT 1",
    )
    .bind(report.jobId, report.kind)
    .first<{ id: string }>();
  const id = existing?.id ?? crypto.randomUUID(),
    event = 'rider-report:' + report.id;
  const next =
    'Contact the customer and review the failed attempt; arrange the authorized next step in the order workflow.';
  const statements: D1PreparedStatement[] = [];
  if (!existing)
    statements.push(
      db
        .prepare(
          "INSERT INTO exception_work_items(id,source_key,order_id,shipping_job_id,kind,status,owner_id,next_action,version,created_by,created_at,updated_at) VALUES (?,?,?,?,?,'open',?,?,0,?,?,?)",
        )
        .bind(
          id,
          event,
          report.orderId,
          report.jobId,
          report.kind,
          actorId,
          next,
          actorId,
          now,
          now,
        ),
    );
  else
    statements.push(
      ...riderGuard(
        db,
        "EXISTS(SELECT 1 FROM exception_work_items WHERE id=? AND status='open')",
        [id],
      ),
    );
  statements.push(
    db
      .prepare(
        'INSERT INTO exception_work_events(id,work_id,actor_id,action,owner_id,next_action,note,evidence,payload_json,created_at) SELECT ?,id,?,?,?,next_action,?,?,?,? FROM exception_work_items WHERE id=?',
      )
      .bind(
        event,
        actorId,
        existing ? 'rider_report_linked' : 'created',
        existing ? null : actorId,
        'Staff confirmed a rider failure report; fulfillment and cash are handled only by the order workflow.',
        report.id,
        JSON.stringify({ riderReportId: report.id }),
        now,
        id,
      ),
    db
      .prepare(
        "INSERT INTO audit_logs(id,actor_id,action,subject_type,subject_id,reason,created_at) VALUES (?,?,'exception.rider_report_linked','order',?,'Confirmed rider report linked to exception follow-up',?)",
      )
      .bind(crypto.randomUUID(), actorId, report.orderId, now),
  );
  if (!existing)
    statements.push(
      ...(await operationalBusinessNotificationStatements(db, {
        kind: 'exception.assigned',
        sourceId: id,
        eventId: event,
        actorId,
        now,
        status: report.kind,
      })),
    );
  return statements;
}
function otpHash(salt: string, code: string) {
  return createHash('sha256')
    .update(salt + '\n' + code)
    .digest('hex');
}
/** Returns a code only to the authenticated order owner, never to a rider or email sender. */
export async function issueRiderOtp(
  db: D1Database,
  o: {
    jobId: string;
    customerId: string | null;
    receiptTokenHash?: string | null;
    now: number;
  },
) {
  const policy = await riderPolicy(db);
  const ownership =
    "((o.customer_id IS NOT NULL AND o.customer_id=? AND EXISTS(SELECT 1 FROM users u WHERE u.id=o.customer_id AND u.status='active')) OR (? IS NOT NULL AND o.receipt_token_hash=?))";
  const job = await db
    .prepare(
      'SELECT p.rider_user_id AS riderId,p.version,o.id AS orderId,o.customer_id AS orderCustomerId,o.customer_email AS customerEmail,o.recipient_email AS recipientEmail,EXISTS(SELECT 1 FROM order_items mi JOIN managed_commercial_snapshots ms ON ms.order_item_id=mi.id WHERE mi.order_id=o.id) AS managedOrder FROM shipping_parcels p JOIN shipping_jobs j ON j.id=p.shipping_job_id JOIN orders o ON o.id=j.order_id WHERE j.id=? AND ' +
        ownership +
        " AND ((o.payment_mode<>'cod' AND EXISTS(SELECT 1 FROM rider_policy WHERE id='current' AND otp_scope='prepaid_only')) OR EXISTS(SELECT 1 FROM order_items mi JOIN managed_commercial_snapshots ms ON ms.order_item_id=mi.id WHERE mi.order_id=o.id)) AND j.status='dispatched' AND EXISTS(SELECT 1 FROM orders active_order WHERE active_order.id=j.order_id AND active_order.status IN ('confirmed','packing','ready_for_pickup','dispatched')) AND p.method='own_rider'",
    )
    .bind(
      o.jobId,
      o.customerId,
      o.receiptTokenHash ?? null,
      o.receiptTokenHash ?? null,
    )
    .first<{
      riderId: string;
      version: number;
      orderId: string;
      orderCustomerId: string | null;
      customerEmail: string;
      recipientEmail: string | null;
      managedOrder: number;
    }>();
  if (!job)
    throw new RiderError(
      'This parcel is not eligible for a delivery authorization code.',
    );
  const code = String(randomInt(0, 1000000)).padStart(6, '0'),
    salt = Buffer.from(randomBytes(24)).toString('hex'),
    hash = salt + ':' + otpHash(salt, code),
    expiresAt = o.now + 600000;
  await db.batch([
    db
      .prepare(
        'UPDATE shipping_parcels SET version=version WHERE shipping_job_id=?',
      )
      .bind(o.jobId),
    ...riderGuard(db, approvedRiderSql, [job.riderId]),
    ...riderGuard(
      db,
      'EXISTS(SELECT 1 FROM shipping_parcels p JOIN shipping_jobs j ON j.id=p.shipping_job_id JOIN orders o ON o.id=j.order_id WHERE j.id=? AND ' +
        ownership +
        " AND ((o.payment_mode<>'cod' AND EXISTS(SELECT 1 FROM rider_policy WHERE id='current' AND version=? AND otp_scope='prepaid_only')) OR EXISTS(SELECT 1 FROM order_items mi JOIN managed_commercial_snapshots ms ON ms.order_item_id=mi.id WHERE mi.order_id=o.id)) AND j.status='dispatched' AND EXISTS(SELECT 1 FROM orders active_order WHERE active_order.id=j.order_id AND active_order.status IN ('confirmed','packing','ready_for_pickup','dispatched')) AND p.method='own_rider' AND p.rider_user_id=? AND p.version=?)",
      [
        o.jobId,
        o.customerId,
        o.receiptTokenHash ?? null,
        o.receiptTokenHash ?? null,
        policy.version,
        job.riderId,
        job.version,
      ],
    ),
    ...riderGuard(
      db,
      'NOT EXISTS(SELECT 1 FROM rider_otp_challenges WHERE shipping_job_id=? AND expires_at>?)',
      [o.jobId, o.now],
    ),
    db
      .prepare('DELETE FROM rider_otp_challenges WHERE shipping_job_id=?')
      .bind(o.jobId),
    db
      .prepare(
        'INSERT INTO rider_otp_challenges(shipping_job_id,rider_user_id,assignment_version,code_hash,expires_at) VALUES (?,?,?,?,?)',
      )
      .bind(o.jobId, job.riderId, job.version, hash, expiresAt),
    db
      .prepare(
        `INSERT INTO notification_messages(id,recipient_user_id,audience_role,channel,template_key,subject_en,subject_ne,body_en,body_ne,related_type,related_id,status,request_id,created_at,business_event_key,guest_email,guest_order_id) VALUES (?,?, 'customer','email','delivery.authorization','Parcel delivery code','पार्सल डेलिभरी कोड',?,?, 'order',?,'queued',?,?, 'delivery.authorization',?,?)`,
      )
      .bind(
        crypto.randomUUID(),
        job.recipientEmail ? null : job.orderCustomerId,
        `Your parcel-specific code is ${code}. It expires in 10 minutes. Payment, inspection and rider proof are still required.`,
        `तपाईंको पार्सल कोड ${code} हो। यो १० मिनेटमा समाप्त हुन्छ। भुक्तानी, निरीक्षण र राइडर प्रमाण अझै आवश्यक छन्।`,
        job.orderId,
        `delivery-otp:${o.jobId}:${expiresAt}`,
        o.now,
        job.recipientEmail ?? (job.orderCustomerId ? null : job.customerEmail),
        job.orderId,
      ),
    db
      .prepare(
        "INSERT INTO audit_logs(id,actor_id,action,subject_type,subject_id,reason,created_at) VALUES (?,?,'rider.otp_issued','rider',?,'Parcel-specific delivery authorization queued by email; code excluded from audit records',?)",
      )
      .bind(crypto.randomUUID(), o.customerId, job.riderId, o.now),
  ]);
  return {
    code,
    expiresAt,
    deliveryMode: job.managedOrder ? 'managed_cod' : 'prepaid',
  };
}
export async function verifyRiderOtp(
  db: D1Database,
  o: {
    jobId: string;
    riderId: string;
    version: number;
    code: string;
    now: number;
    form?: { requestId: string; versionId: string; answers: FormAnswerSnapshot };
  },
) {
  if (!/^\d{6}$/.test(o.code)) return false;
  const replay = async (): Promise<boolean | null> => {
    if (!o.form) return null;
    const answer = await db.prepare(`SELECT subject_id AS subjectId,actor_id AS actorId,
      config_version_id AS versionId,answers_json AS answersJson FROM form_answer_sets
      WHERE form_id='rider.code-verify' AND request_id=? LIMIT 1`)
      .bind(o.form.requestId).first<{ subjectId: string; actorId: string;
        versionId: string; answersJson: string }>();
    if (!answer) return null;
    const event = await db.prepare(`SELECT user_id AS userId,actor_id AS actorId,action,note
      FROM rider_events WHERE id=? LIMIT 1`).bind(o.form.requestId)
      .first<{ userId: string; actorId: string; action: string; note: string }>();
    let originalJobId: string | null = null;
    let originalVersion: number | null = null;
    try {
      const provenance = JSON.parse(event?.note ?? 'null') as unknown;
      if (provenance && typeof provenance === 'object' && !Array.isArray(provenance) &&
        'shippingJobId' in provenance && typeof provenance.shippingJobId === 'string' &&
        'assignmentVersion' in provenance && Number.isSafeInteger(provenance.assignmentVersion)) {
        originalJobId = provenance.shippingJobId;
        originalVersion = provenance.assignmentVersion as number;
      }
    } catch { /* Missing or malformed immutable provenance cannot authorize replay. */ }
    const challenge = await db.prepare(`SELECT rider_user_id AS riderId,
      assignment_version AS assignmentVersion,code_hash AS hash,consumed_at AS consumedAt
      FROM rider_otp_challenges WHERE shipping_job_id=? LIMIT 1`).bind(o.jobId)
      .first<{ riderId: string; assignmentVersion: number;
        hash: string; consumedAt: number | null }>();
    const assignment = await db.prepare(`SELECT 1 AS valid FROM shipping_parcels
      WHERE shipping_job_id=? AND rider_user_id=? AND version=? AND method='own_rider' LIMIT 1`)
      .bind(o.jobId, o.riderId, o.version).first<{ valid: number }>();
    const [salt, hash] = challenge?.hash.split(':') ?? [];
    const codeMatches = Boolean(salt && hash && /^[a-f0-9]{64}$/.test(hash) &&
      timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(otpHash(salt, o.code), 'hex')));
    if (answer.subjectId !== o.form.requestId || answer.actorId !== o.riderId ||
      answer.versionId !== o.form.versionId ||
      answer.answersJson !== JSON.stringify(o.form.answers) ||
      event?.userId !== o.riderId || event.actorId !== o.riderId ||
      event.action !== 'otp_verified' || originalJobId !== o.jobId ||
      originalVersion !== o.version || !assignment ||
      challenge?.riderId !== o.riderId || challenge.assignmentVersion !== o.version ||
      challenge.consumedAt === null || !codeMatches || !(await approvedRider(db, o.riderId)))
      throw new RiderReplayConflictError('This verification request reference was already used for different details.');
    return true;
  };
  if (await replay()) return true;
  const current = await db
    .prepare(
      'SELECT code_hash AS hash,attempts,expires_at AS expiresAt,consumed_at AS consumedAt FROM rider_otp_challenges WHERE shipping_job_id=? AND rider_user_id=? AND assignment_version=?',
    )
    .bind(o.jobId, o.riderId, o.version)
    .first<{
      hash: string;
      attempts: number;
      expiresAt: number;
      consumedAt: number | null;
    }>();
  if (
    !current ||
    current.attempts >= 5 ||
    current.expiresAt <= o.now ||
    current.consumedAt !== null
  )
    return false;
  const [salt, hash] = current.hash.split(':');
  if (!salt || !hash || !/^[a-f0-9]{64}$/.test(hash)) return false;
  const computed = otpHash(salt, o.code),
    matched = timingSafeEqual(
      Buffer.from(hash, 'hex'),
      Buffer.from(computed, 'hex'),
    );
  try {
    await db.batch([
      db
        .prepare(
          'UPDATE shipping_parcels SET version=version WHERE shipping_job_id=?',
        )
        .bind(o.jobId),
      ...riderGuard(db, approvedRiderSql, [o.riderId]),
      ...riderGuard(
        db,
        "EXISTS(SELECT 1 FROM shipping_parcels p JOIN shipping_jobs j ON j.id=p.shipping_job_id JOIN orders o ON o.id=j.order_id WHERE j.id=? AND j.status='dispatched' AND EXISTS(SELECT 1 FROM orders active_order WHERE active_order.id=j.order_id AND active_order.status IN ('confirmed','packing','ready_for_pickup','dispatched')) AND p.rider_user_id=? AND p.version=? AND p.method='own_rider' AND ((o.payment_mode<>'cod' AND EXISTS(SELECT 1 FROM rider_policy WHERE id='current' AND otp_scope='prepaid_only')) OR EXISTS(SELECT 1 FROM order_items mi JOIN managed_commercial_snapshots ms ON ms.order_item_id=mi.id WHERE mi.order_id=o.id)))",
        [o.jobId, o.riderId, o.version],
      ),
      ...riderGuard(
        db,
        'EXISTS(SELECT 1 FROM rider_otp_challenges WHERE shipping_job_id=? AND code_hash=? AND attempts=? AND expires_at>? AND consumed_at IS NULL)',
        [o.jobId, current.hash, current.attempts, o.now],
      ),
      db
        .prepare(
          'UPDATE rider_otp_challenges SET attempts=attempts+1,consumed_at=? WHERE shipping_job_id=?',
        )
        .bind(matched ? o.now : null, o.jobId),
      ...audit(
        db,
        o.riderId,
        o.riderId,
        matched ? 'otp_verified' : 'otp_rejected',
        matched && o.form ? JSON.stringify({
          message: 'Parcel delivery code verification recorded; no delivery or cash transition.',
          shippingJobId: o.jobId, assignmentVersion: o.version,
        }) : 'Parcel delivery code verification recorded; no delivery or cash transition.',
        o.now,
        null,
        matched && o.form ? o.form.requestId : crypto.randomUUID(),
      ),
      ...(matched && o.form ? [buildFormAnswerInsert(db, {
        formId: 'rider.code-verify', requestId: o.form.requestId,
        versionId: o.form.versionId, subjectType: 'rider_event',
        subjectId: o.form.requestId, actorId: o.riderId,
        answers: o.form.answers, now: o.now,
      })] : []),
    ]);
    return matched;
  } catch (error) {
    if (error instanceof RiderReplayConflictError) throw error;
    if (matched && o.form && await replay()) return true;
    if (matched && o.form)
      throw new RiderStorageError('Code verification could not be saved. Please retry.');
    return false;
  }
}
