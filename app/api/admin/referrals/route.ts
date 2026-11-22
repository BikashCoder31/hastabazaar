import {hasActorIntentMismatch} from '@/lib/http/actor-intent';
import { env } from 'cloudflare:workers';
import { requireStaffApi, StaffAuthorizationError } from '@/lib/auth/staff';
import { requireDatabase } from '@/lib/db/d1';
import { isTrustedMutationRequest } from '@/lib/http/request-security';
import { getReferralCampaignForManagement as getReferralCampaign } from '@/lib/db/repositories/wallet';
import { buildFormAnswerInsert } from '@/lib/db/repositories/form-answers';
import { isValidatedFormVersionStale, validateSellerFormSubmission } from '@/lib/forms/submission';
import { FormRuntimeError } from '@/lib/forms/runtime';
import { FormValidationError } from '@/lib/forms/validation';
import { readBoundedBody, BodyTooLargeError } from '@/lib/http/bounded-body';

export async function PUT(request: Request) {
  let validatedVersionId: string | undefined;
  if (!isTrustedMutationRequest(request))
    return Response.json(
      { error: 'Cross-site requests are not allowed.' },
      { status: 403 },
    );
  try {
    const staff = await requireStaffApi('commercial_policy.manage');
    if(hasActorIntentMismatch(request,staff.id))throw new StaffAuthorizationError('The signed-in account changed. Refresh this commercial view before using its retained fields.',403);
    if (staff.role !== 'super_admin')
      return Response.json(
        { error: 'Only the Super Admin can change this offer.' },
        { status: 403 },
      );
    let b: Record<string, unknown>;
    try { b = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await readBoundedBody(request, 256 * 1024))); }
    catch (error) { if (error instanceof BodyTooLargeError) throw error;
      return Response.json({ error: 'Invalid referral request.' }, { status: 400 }); }
    if (!b || typeof b !== 'object' || Array.isArray(b) ||
      typeof b.requestId !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(b.requestId))
      return Response.json({ error: 'A valid referral-change request reference is required.' }, { status: 400 });
    const {
      friendDiscountPaisa: d,
      rewardPaisa: r,
      minimumSubtotalPaisa: m,
      returnWindowDays: w,
    } = b;
    if (
      typeof b.enabled !== 'boolean' ||
      typeof b.reason !== 'string' ||
      b.reason.trim().length < 10 ||
      b.reason.length > 300 ||
      ![d, r, m, w].every(
        (n) => typeof n === 'number' && Number.isSafeInteger(n),
      ) ||
      Number(d) < 100 ||
      Number(d) > 1000000 ||
      Number(r) < 100 ||
      Number(r) > 1000000 ||
      Number(m) <= Number(d) ||
      Number(m) > 100000000 ||
      Number(w) < 7 ||
      Number(w) > 90
    )
      return Response.json(
        {
          error:
            'Enter valid amounts, a minimum greater than the discount, a 7–90 day wait, and a reason.',
        },
        { status: 400 },
      );
    if(!Number.isSafeInteger(b.expectedUpdatedAt)||Number(b.expectedUpdatedAt)<0)return Response.json({error:'Review the original current offer before saving.',code:'source_changed'},{status:409});
    const db = requireDatabase(env as unknown as { DB?: D1Database });
    const configured = await validateSellerFormSubmission(db, 'staff.referral-settings',
      b.formVersion, b.customAnswers, b.requestId);
    validatedVersionId = configured.versionId;
    if (!await db.prepare("SELECT 1 FROM users u JOIN user_roles r ON r.user_id=u.id WHERE u.id=? AND u.status='active' AND r.role='super_admin' LIMIT 1").bind(staff.id).first())
      return Response.json({ error: 'Current Super Admin authority is required.' }, { status: 403 });
    const next = { enabled: b.enabled, friendDiscountPaisa: d, rewardPaisa: r,
      minimumSubtotalPaisa: m, returnWindowDays: w };
    const replay = await db.prepare(`SELECT a.actor_id AS actorId,a.subject_type AS subjectType,
      a.subject_id AS subjectId,a.config_version_id AS versionId,a.answers_json AS answersJson,
      l.reason,l.next_json AS nextJson,l.previous_json AS previousJson FROM form_answer_sets a JOIN audit_logs l
      ON l.request_id=a.request_id AND l.action='referral.offer.updated'
      WHERE a.form_id='staff.referral-settings' AND a.request_id=? LIMIT 1`)
      .bind(b.requestId).first<{ actorId: string; subjectType: string; subjectId: string;
        versionId: string; answersJson: string; reason: string; nextJson: string;previousJson:string }>();
    if (replay) {
      if (replay.actorId !== staff.id || replay.subjectType !== 'referral_campaign' ||
        replay.subjectId !== 'default' || replay.versionId !== configured.versionId ||
        replay.answersJson !== JSON.stringify(configured.answers) ||
        replay.reason !== b.reason.trim() || replay.nextJson !== JSON.stringify(next)||JSON.parse(replay.previousJson)?.updatedAt!==b.expectedUpdatedAt)
        return Response.json({ error: 'Referral request reference was already used for different work.' }, { status: 409 });
      return Response.json({ saved: true }, { headers: { 'Cache-Control': 'no-store' } });
    }
    const previous = await getReferralCampaign(db);
    const now = Date.now();
    if(!Number.isSafeInteger(previous.updatedAt)||previous.updatedAt!==b.expectedUpdatedAt)return Response.json({error:'The current offer changed. Your draft is retained; review the original source before a new attempt.',code:'source_changed'},{status:409});
    const current={updatedAt:previous.updatedAt!};
    const updatedAt = Math.max(now, current.updatedAt + 1);
    if(!Number.isSafeInteger(updatedAt))return Response.json({error:'The source version requires reconciliation.'},{status:409});
    const guardId = crypto.randomUUID();
    const nativeEventId=crypto.randomUUID();
    await db.batch([
      db.prepare(`INSERT INTO staff_permission_guards(id,valid) SELECT ?,CASE WHEN
        EXISTS(SELECT 1 FROM referral_campaign WHERE id='default' AND updated_at=?)
        THEN 1 ELSE 0 END`).bind(guardId, current.updatedAt),
      db.prepare('DELETE FROM staff_permission_guards WHERE id=?').bind(guardId),
      db
        .prepare(
          `UPDATE referral_campaign SET enabled=?,friend_discount_paisa=?,reward_paisa=?,minimum_subtotal_paisa=?,return_window_days=?,updated_at=? WHERE id='default' AND updated_at=?`,
        )
        .bind(b.enabled ? 1 : 0, d, r, m, w, updatedAt, current.updatedAt),
      db.prepare(`INSERT INTO staff_permission_guards(id,valid) SELECT ?,CASE WHEN
        EXISTS(SELECT 1 FROM users u JOIN user_roles roles ON roles.user_id=u.id
          WHERE u.id=? AND u.status='active' AND roles.role='super_admin')
        AND EXISTS(SELECT 1 FROM referral_campaign WHERE id='default' AND updated_at=?)
        THEN 1 ELSE 0 END`).bind(guardId, staff.id, updatedAt),
      db.prepare('DELETE FROM staff_permission_guards WHERE id=?').bind(guardId),
      db
        .prepare(`INSERT INTO audit_logs(id,actor_id,action,subject_type,subject_id,reason,previous_json,next_json,request_id,ip_hash,created_at)
     VALUES (?,?,'referral.offer.updated','referral_campaign','default',?,?,?,?,NULL,?)`)
        .bind(
          nativeEventId,
          staff.id,
          b.reason.trim(),
          JSON.stringify(previous),
          JSON.stringify(next),
          b.requestId,
          now,
        ),
      buildFormAnswerInsert(db, { formId: 'staff.referral-settings', requestId: b.requestId,
        versionId: configured.versionId, subjectType: 'referral_campaign', subjectId: 'default',
        actorId: staff.id, answers: configured.answers, now }),
      ...await(await import('@/lib/operations/programme-notice-sources')).programmeNoticeStatements(db,{actorId:staff.id,requestId:b.requestId,now},{type:'referral',sourceId:'default',eventId:nativeEventId,status:'referral_updated'}),
    ]);
    return Response.json(
      { saved: true },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    if (validatedVersionId && await isValidatedFormVersionStale(requireDatabase(env as unknown as { DB?: D1Database }), 'staff.referral-settings', validatedVersionId))
      return Response.json({ error: 'This form changed. Refresh it and review your answers.', code: 'stale_version' }, { status: 409 });
    if (error instanceof FormRuntimeError)
      return Response.json({ error: error.message, code: error.code }, { status: error.code === 'stale_version' ? 409 : 503 });
    if (error instanceof FormValidationError)
      return Response.json({ error: error.message, fieldId: error.fieldId }, { status: 400 });
    if (error instanceof BodyTooLargeError)
      return Response.json({ error: error.message }, { status: 413 });
    if (error instanceof SyntaxError)
      return Response.json({ error: 'Invalid referral request.' }, { status: 400 });
    if (error instanceof StaffAuthorizationError)
      return Response.json({ error: error.message }, { status: error.status });
    return Response.json(
      { error: 'The offer could not be saved.' },
      { status: validatedVersionId ? 409 : 500 },
    );
  }
}
