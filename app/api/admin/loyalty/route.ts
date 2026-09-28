import { env } from 'cloudflare:workers';
import { requireStaffApi, StaffAuthorizationError } from '@/lib/auth/staff';
import { requireDatabase } from '@/lib/db/d1';
import { isTrustedMutationRequest } from '@/lib/http/request-security';
import { readBoundedJsonObject } from '@/lib/http/form-json-body';
import { BodyTooLargeError } from '@/lib/http/bounded-body';
import { consumeRequestRateLimit, rateLimitJson } from '@/lib/http/rate-limit';
import { validateSellerFormSubmission } from '@/lib/forms/submission';
import { FormRuntimeError } from '@/lib/forms/runtime';
import { FormValidationError } from '@/lib/forms/validation';
import { IncentiveError, type LoyaltyTerms, type LoyaltyMutationContext } from '@/lib/incentives/types';
import {
  saveLoyaltyDraft,
  publishLoyalty,
  pauseLoyalty,
  getLoyaltyState,
} from '@/lib/db/repositories/loyalty';
export const dynamic = 'force-dynamic';
const json = (body: unknown, status = 200) =>
  Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' },
  });
function failure(error: unknown) {
  if (error instanceof StaffAuthorizationError)
    return json({ error: error.message }, error.status);
  if (error instanceof BodyTooLargeError)
    return json({ error: 'Request is too large.' }, 413);
  if (error instanceof SyntaxError)
    return json({ error: 'Invalid incentive request.' }, 400);
  if (error instanceof IncentiveError)
    return json(
      { error: error.message, code: error.code },
      error.code === 'unauthorized'
        ? 403
        : error.code === 'invalid'
          ? 400
          : 409,
    );
  if (error instanceof FormRuntimeError)
    return json(
      { error: error.message, code: error.code },
      error.code === 'stale_version' ? 409 : 503,
    );
  if (error instanceof FormValidationError)
    return json({ error: error.message, fieldId: error.fieldId }, 400);
  return json({ error: 'The loyalty operation could not be completed.' }, 500);
}
export async function GET(request: Request) {
  try {
    const actor = await requireStaffApi('admin.invite');
    if (actor.role !== 'super_admin') throw new IncentiveError('unauthorized');
    if (new URL(request.url).search) throw new IncentiveError('invalid');
    return json(
      await getLoyaltyState(
        requireDatabase(env as unknown as { DB?: D1Database }),
        actor.id,
        Date.now(),
        actor.authSubject,
      ),
    );
  } catch (error) {
    return failure(error);
  }
}
export async function POST(request: Request) {
  if (!isTrustedMutationRequest(request))
    return json({ error: 'Cross-site requests are not allowed.' }, 403);
  try {
    const actor = await requireStaffApi('admin.invite');
    if (actor.role !== 'super_admin') throw new IncentiveError('unauthorized');
    const body = await readBoundedJsonObject(request);
    if (
      Object.keys(body).some(
        (key) =>
          ![
            'action',
            'terms',
            'expectedVersion',
            'requestId',
            'reason',
            'formVersion',
            'customAnswers',
          ].includes(key),
      ) ||
      typeof body.action !== 'string' ||
      !['draft', 'publish', 'pause'].includes(body.action) ||
      typeof body.requestId !== 'string' ||
      !/^[a-zA-Z0-9_-]{1,100}$/.test(body.requestId) ||
      typeof body.reason !== 'string' ||
      !Number.isSafeInteger(body.expectedVersion) ||
      Number(body.expectedVersion) < 1 ||
      (body.action === 'draft'
        ? !body.terms ||
          typeof body.terms !== 'object' ||
          Array.isArray(body.terms)
        : body.terms !== undefined)
    )
      throw new IncentiveError('invalid');
    const db = requireDatabase(env as unknown as { DB?: D1Database });
    const rate = await consumeRequestRateLimit(db, request, {
      scope: `loyalty-admin:${actor.id}`,
      limit: 40,
      windowMs: 60000,
    });
    if (!rate.allowed) return rateLimitJson(rate);
    const configured = await validateSellerFormSubmission(
      db,
      'staff.loyalty-settings',
      body.formVersion,
      body.customAnswers,
      body.requestId,
    );
    const context: LoyaltyMutationContext = {
      actorId: actor.id,
      authSubject: actor.authSubject,
      requestId: body.requestId,
      reason: body.reason,
      expectedVersion: Number(body.expectedVersion),
      now: Date.now(),
      form: {
        formId: 'staff.loyalty-settings',
        versionId: configured.versionId,
        answers: configured.answers,
      },
    };
    return json(
      body.action === 'draft'
        ? await saveLoyaltyDraft(db, context, body.terms as LoyaltyTerms)
        : body.action === 'publish'
          ? await publishLoyalty(db, context)
          : await pauseLoyalty(db, context),
    );
  } catch (error) {
    return failure(error);
  }
}
