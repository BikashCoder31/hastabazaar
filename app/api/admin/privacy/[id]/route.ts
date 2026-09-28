import { collectIncentivePrivacyData } from '@/lib/incentives/privacy';
import { readBoundedJsonObject } from '@/lib/http/form-json-body';
import { env } from 'cloudflare:workers';
import { requireStaffApi, StaffAuthorizationError } from '@/lib/auth/staff';
import { requireDatabase } from '@/lib/db/d1';
import {
  operateDataRightsRequest,
  OperationsConflictError,
} from '@/lib/db/repositories/operations';
import { isTrustedMutationRequest } from '@/lib/http/request-security';
import { BodyTooLargeError } from '@/lib/http/bounded-body';
import { can, validateAdminPermissions } from '@/lib/marketplace/permissions';
import { collectFormAnswersForPrivacy, eraseFormAnswersForPrivacy, FormPrivacyError } from '@/lib/forms/privacy';
import { isValidatedFormVersionStale, validateSellerFormSubmission } from '@/lib/forms/submission';
import { FormRuntimeError } from '@/lib/forms/runtime';
import { FormValidationError } from '@/lib/forms/validation';
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  let validatedVersionId: string | undefined;
  if (!isTrustedMutationRequest(request))
    return Response.json(
      { error: 'Cross-site requests are not allowed.' },
      { status: 403 },
    );
  try {
    const staff = await requireStaffApi('support.manage');
    let body: {
      action?:
        | 'assign'
        | 'request_information'
        | 'approve'
        | 'reject'
        | 'complete'
        | 'export_answers'
        | 'erase_answers';
      note?: string;
      requestId?: string;
      formVersion?: unknown;
      customAnswers?: unknown;
    };
    try { body = await readBoundedJsonObject(request); }
    catch (error) {
      if (error instanceof BodyTooLargeError) return Response.json({ error: 'Request is too large.' }, { status: 413 });
      return Response.json({ error: 'Valid JSON is required.' }, { status: 400 });
    }
    if (!body || typeof body !== 'object' || Array.isArray(body) ||
      typeof body.action !== 'string' || typeof body.requestId !== 'string' ||
      !body.action || !body.requestId || body.requestId.length > 100)
      return Response.json(
        { error: 'Action and request identifier are required.' },
        { status: 400 },
      );
    const { id } = await context.params;
    const db = requireDatabase(env as unknown as { DB?: D1Database });
    if (body.action === 'export_answers' || body.action === 'erase_answers') {
      if (!can(staff, 'support.manage'))
        return Response.json({ error: 'Staff access is not permitted.' }, { status: 403 });
      if (body.action === 'erase_answers' && staff.role !== 'super_admin')
        return Response.json({ error: 'A Super Admin must erase form answers.' }, { status: 403 });
      const requestRow = await db.prepare(`SELECT customer_id AS customerId,request_type AS requestType,
        status,assigned_to AS assignedTo FROM data_rights_requests WHERE id=? LIMIT 1`)
        .bind(id).first<{ customerId: string; requestType: string; status: string; assignedTo: string | null }>();
      if (!requestRow || requestRow.assignedTo !== staff.id || requestRow.status !== 'approved' ||
        requestRow.requestType !== (body.action === 'export_answers' ? 'access' : 'deletion'))
        return Response.json({ error: 'This approved request is not assigned to you.' }, { status: 403 });
      if (body.action === 'erase_answers') {
        const result = await eraseFormAnswersForPrivacy(db, { userId: requestRow.customerId,
          dataRightsRequestId: id, actorId: staff.id, requestId: body.requestId });
        return Response.json({ ok: true, scope: 'account.profile', deletedCount: result.deletedCount },
          { headers: { 'Cache-Control': 'no-store' } });
      }
      const auditKey = `form-answer-export:${body.requestId}`;
      const prior = await db.prepare(`SELECT id FROM audit_logs WHERE request_id=? LIMIT 1`)
        .bind(auditKey).first();
      if (prior) return Response.json({ error: 'This export request ID was already used. Start a new export to obtain current data.' }, { status: 409 });
      const [answers, incentives] = await Promise.all([
        collectFormAnswersForPrivacy(db, requestRow.customerId),
        collectIncentivePrivacyData(db, requestRow.customerId),
      ]);
      const incentiveRecordCount = Object.values(incentives).reduce((total, rows) => total + rows.length, 0);
      const permissionProfile = staff.role === 'admin'
        ? await db.prepare(`SELECT permissions_json AS permissionsJson,version
          FROM staff_permission_profiles WHERE user_id=? LIMIT 1`)
          .bind(staff.id).first<{ permissionsJson: string; version: number }>()
        : null;
      if (permissionProfile) {
        try {
          if (!can({ role: 'admin', permissions: validateAdminPermissions(JSON.parse(permissionProfile.permissionsJson)) }, 'support.manage'))
            return Response.json({ error: 'Staff access changed. Retry.' }, { status: 409 });
        } catch {
          return Response.json({ error: 'Staff access changed. Retry.' }, { status: 409 });
        }
      }
      const audit = await db.prepare(`INSERT INTO audit_logs(id,actor_id,action,subject_type,subject_id,
        reason,previous_json,next_json,request_id,created_at)
        SELECT ?,?,'form.answers.exported','data_rights_request',?,
          'Approved form-answer and incentive access export generated',NULL,?,?,?
        FROM data_rights_requests WHERE id=? AND customer_id=? AND assigned_to=?
          AND request_type='access' AND status='approved'
          AND NOT EXISTS(SELECT 1 FROM audit_logs WHERE request_id=?)
          AND EXISTS(SELECT 1 FROM users u JOIN user_roles r ON r.user_id=u.id
            WHERE u.id=? AND u.status='active' AND r.role=?)
          AND (?='super_admin' OR
            (?=0 AND NOT EXISTS(SELECT 1 FROM staff_permission_profiles WHERE user_id=?)) OR
            (?=1 AND EXISTS(SELECT 1 FROM staff_permission_profiles
              WHERE user_id=? AND version=? AND permissions_json=?)))`)
        .bind(crypto.randomUUID(), staff.id, id, JSON.stringify({ answerCount: answers.length, incentivesIncluded: true, incentiveRecordCount }), auditKey, Date.now(),
          id, requestRow.customerId, staff.id, auditKey, staff.id, staff.role,
          staff.role, permissionProfile ? 1 : 0, staff.id,
          permissionProfile ? 1 : 0, staff.id, permissionProfile?.version ?? -1,
          permissionProfile?.permissionsJson ?? '').run();
      if ((audit.meta.changes ?? 0) !== 1) {
        const claimed = await db.prepare('SELECT 1 AS claimed FROM audit_logs WHERE request_id=? LIMIT 1')
          .bind(auditKey).first();
        if (claimed) return Response.json({ error: 'This export request ID was already used. Start a new export to obtain current data.' }, { status: 409 });
        return Response.json({ error: 'Request assignment or staff access changed. Retry.' }, { status: 409 });
      }
      return Response.json({ incentives, answers: answers.map((answer) => ({ id: answer.id,
        formId: answer.formId, createdAt: answer.createdAt,
        answers: answer.answers, historicalFieldIds: answer.historicalFieldIds })) },
      { headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
    }
    const form=await validateSellerFormSubmission(db,'staff.privacy-action',
      body.formVersion,body.customAnswers,body.requestId);
    validatedVersionId=form.versionId;
    await operateDataRightsRequest(
      db,
      {
        id,
        actorId: staff.id,
        actorRole: staff.role,
        action: body.action,
        note: body.note ?? '',
        requestId: body.requestId,
        now: Date.now(),
        form:{requestId:body.requestId,versionId:form.versionId,answers:form.answers},
      },
    );
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof BodyTooLargeError) return Response.json({ error: error.message }, { status: 413, headers: { 'Cache-Control': 'no-store' } });
    if (error instanceof SyntaxError) return Response.json({ error: 'Invalid JSON request.' }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
    if (error instanceof StaffAuthorizationError)
      return Response.json({ error: error.message }, { status: error.status });
    if (error instanceof OperationsConflictError)
      return Response.json({ error: error.message }, { status: 409 });
    if (error instanceof FormPrivacyError)
      return Response.json({ error: error.message }, { status: 409 });
    if (error instanceof FormRuntimeError)
      return Response.json({error:error.message,code:error.code},{status:error.code==='stale_version'?409:503});
    if (error instanceof FormValidationError)
      return Response.json({error:error.message,fieldId:error.fieldId},{status:400});
    if (validatedVersionId && await isValidatedFormVersionStale(requireDatabase(env as unknown as { DB?: D1Database }),
      'staff.privacy-action',validatedVersionId))
      return Response.json({error:'This form changed. Refresh it and review your answers.',code:'stale_version'},{status:409});
    return Response.json(
      { error: 'Privacy request could not be updated.' },
      { status: 500 },
    );
  }
}
