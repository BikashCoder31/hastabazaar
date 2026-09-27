import { env } from 'cloudflare:workers';
import { requireStaffApi, StaffAuthorizationError } from '@/lib/auth/staff';
import { requireDatabase } from '@/lib/db/d1';
import {
  operateDataRightsRequest,
  OperationsConflictError,
} from '@/lib/db/repositories/operations';
import { isTrustedMutationRequest } from '@/lib/http/request-security';
import { BodyTooLargeError, readBoundedBody } from '@/lib/http/bounded-body';
import { can } from '@/lib/marketplace/permissions';
import { collectFormAnswersForPrivacy, eraseFormAnswersForPrivacy, FormPrivacyError } from '@/lib/forms/privacy';
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
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
    };
    try { body = JSON.parse(new TextDecoder().decode(await readBoundedBody(request, 4096))); }
    catch (error) {
      if (error instanceof BodyTooLargeError) return Response.json({ error: 'Request is too large.' }, { status: 413 });
      return Response.json({ error: 'Valid JSON is required.' }, { status: 400 });
    }
    if (!body.action || !body.requestId || body.requestId.length > 100)
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
      const answers = await collectFormAnswersForPrivacy(db, requestRow.customerId);
      const audit = await db.prepare(`INSERT INTO audit_logs(id,actor_id,action,subject_type,subject_id,
        reason,previous_json,next_json,request_id,created_at)
        SELECT ?,?,'form.answers.exported','data_rights_request',?,
          'Approved form-answer access export generated',NULL,json_object('answerCount',?),?,?
        FROM data_rights_requests WHERE id=? AND customer_id=? AND assigned_to=?
          AND request_type='access' AND status='approved'
          AND EXISTS(SELECT 1 FROM users u JOIN user_roles r ON r.user_id=u.id
            WHERE u.id=? AND u.status='active' AND r.role IN ('admin','super_admin'))`)
        .bind(crypto.randomUUID(), staff.id, id, answers.length, auditKey, Date.now(),
          id, requestRow.customerId, staff.id, staff.id).run();
      if ((audit.meta.changes ?? 0) !== 1)
        return Response.json({ error: 'Request assignment changed. Retry.' }, { status: 409 });
      return Response.json({ answers: answers.map((answer) => ({ id: answer.id,
        formId: answer.formId, createdAt: answer.createdAt,
        answers: answer.answers, historicalFieldIds: answer.historicalFieldIds })) },
      { headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
    }
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
      },
    );
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof StaffAuthorizationError)
      return Response.json({ error: error.message }, { status: error.status });
    if (error instanceof OperationsConflictError)
      return Response.json({ error: error.message }, { status: 409 });
    if (error instanceof FormPrivacyError)
      return Response.json({ error: error.message }, { status: 409 });
    return Response.json(
      { error: 'Privacy request could not be updated.' },
      { status: 500 },
    );
  }
}
