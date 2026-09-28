import { readBoundedJsonObject } from '@/lib/http/form-json-body';
import { env } from 'cloudflare:workers';
import { requireStaffApi, StaffAuthorizationError } from '@/lib/auth/staff';
import { requireDatabase } from '@/lib/db/d1';
import {
  OperationsConflictError,
  performGovernanceAction,
} from '@/lib/db/repositories/operations';
import { isTrustedMutationRequest } from '@/lib/http/request-security';
import { BodyTooLargeError } from '@/lib/http/bounded-body';
import { isValidatedFormVersionStale, validateSellerFormSubmission } from '@/lib/forms/submission';
import { FormRuntimeError } from '@/lib/forms/runtime';
import { FormValidationError } from '@/lib/forms/validation';

const formForAction = {
  'rule.create': 'staff.governance-rule-create',
  'promotion.create': 'staff.governance-promotion-create',
  'incident.create': 'staff.governance-incident-create',
  'incident.update': 'staff.governance-incident-update',
  'backup.verify': 'staff.governance-backup-verify',
} as const;

export async function POST(request: Request) {
  let validatedFormId: (typeof formForAction)[keyof typeof formForAction] | null = null;
  let validatedVersionId: string | null = null;
  if (!isTrustedMutationRequest(request))
    return Response.json(
      { error: 'Cross-site requests are not allowed.' },
      { status: 403 },
    );
  try {
    const staff = await requireStaffApi('catalog.manage');
    let body: {
      action?: string;
      requestId?: string;
      data?: Record<string, unknown>;
      formVersion?: unknown;
      customAnswers?: unknown;
    };
    try {
      body = await readBoundedJsonObject(request) as typeof body;
    } catch (error) {
      if (error instanceof BodyTooLargeError) throw error;
      return Response.json({ error: 'Valid JSON is required.' }, { status: 400 });
    }
    if (!body || typeof body !== 'object' || Array.isArray(body) ||
      typeof body.action !== 'string' ||
      typeof body.requestId !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(body.requestId) ||
      !body.data || typeof body.data !== 'object' || Array.isArray(body.data))
      return Response.json(
        { error: 'Action, data and request identifier are required.' },
        { status: 400 },
      );
    if (['action', 'requestId', 'formVersion', 'customAnswers'].some((key) => Object.hasOwn(body.data!, key)))
      return Response.json({ error: 'Protected governance fields must be submitted separately.' }, { status: 400 });
    const db = requireDatabase(env as unknown as { DB?: D1Database });
    const formId = formForAction[body.action as keyof typeof formForAction];
    if (!formId && (body.formVersion !== undefined || body.customAnswers !== undefined))
      return Response.json({ error: 'This protected decision has no configurable form.' }, { status: 400 });
    if (formId && (typeof body.formVersion !== 'number' || !Array.isArray(body.customAnswers)))
      return Response.json({ error: 'Published form version and answers are required.' }, { status: 400 });
    const configured = formId
      ? await validateSellerFormSubmission(db, formId, body.formVersion, body.customAnswers, body.requestId)
      : null;
    if (configured && formId) { validatedFormId = formId; validatedVersionId = configured.versionId; }
    await performGovernanceAction(
      db,
      {
        actorId: staff.id,
        actorRole: staff.role,
        action: body.action,
        requestId: body.requestId,
        data: body.data,
        now: Date.now(),
        ...(configured && formId ? { form: {
          formId, requestId: body.requestId, versionId: configured.versionId,
          answers: configured.answers,
        } } : {}),
      },
    );
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof SyntaxError) return Response.json({ error: 'Invalid JSON request.' }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
    if (error instanceof BodyTooLargeError)
      return Response.json({ error: 'Governance request is too large.' }, { status: 413 });
    if (error instanceof StaffAuthorizationError)
      return Response.json({ error: error.message }, { status: error.status });
    if (error instanceof OperationsConflictError)
      return Response.json({ error: error.message }, { status: 409 });
    if (error instanceof FormRuntimeError)
      return Response.json({ error: error.message, code: error.code }, { status: error.code === 'stale_version' ? 409 : 503 });
    if (error instanceof FormValidationError)
      return Response.json({ error: error.message, fieldId: error.fieldId }, { status: 400 });
    if (validatedFormId && validatedVersionId &&
      await isValidatedFormVersionStale(requireDatabase(env as unknown as { DB?: D1Database }),
        validatedFormId, validatedVersionId))
      return Response.json({ error: 'This form changed. Refresh it and review your answers.',
        code: 'stale_version' }, { status: 409 });
    return Response.json(
      { error: 'Governance operation failed.' },
      { status: 500 },
    );
  }
}
