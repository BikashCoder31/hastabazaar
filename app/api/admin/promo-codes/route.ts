import {hasActorIntentMismatch} from '@/lib/http/actor-intent';
import { env } from 'cloudflare:workers';
import { requireStaffApi, StaffAuthorizationError } from '@/lib/auth/staff';
import { requireDatabase } from '@/lib/db/d1';
import { isTrustedMutationRequest } from '@/lib/http/request-security';
import { readBoundedJsonObject } from '@/lib/http/form-json-body';
import { BodyTooLargeError } from '@/lib/http/bounded-body';
import { consumeRequestRateLimit } from '@/lib/http/rate-limit';
import { validateSellerFormSubmission } from '@/lib/forms/submission';
import { FormRuntimeError } from '@/lib/forms/runtime';
import { FormValidationError } from '@/lib/forms/validation';
import { IncentiveError, type PromoTerms } from '@/lib/incentives/types';
import {
  savePromoDraft,
  publishPromo,
  pausePromo,
  listPromoCampaigns,
  getPromoCampaign,
  listPromoRedemptions,
} from '@/lib/db/repositories/promo-codes';
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
        : ['stale', 'conflict', 'exhausted', 'unavailable'].includes(error.code)
          ? 409
          : 400,
    );
  if (error instanceof FormRuntimeError)
    return json(
      { error: error.message, code: error.code },
      error.code === 'stale_version' ? 409 : 503,
    );
  if (error instanceof FormValidationError)
    return json({ error: error.message, fieldId: error.fieldId }, 400);
  return json({ error: 'The promo operation could not be completed.' }, 500);
}
export async function POST(request: Request) {
  if (!isTrustedMutationRequest(request))
    return json({ error: 'Cross-site requests are not allowed.' }, 403);
  try {
    const actor = await requireStaffApi('commercial_policy.manage');
    if(hasActorIntentMismatch(request,actor.id))throw new StaffAuthorizationError('The signed-in account changed. Refresh this commercial view before using its retained fields.',403);
    if (actor.role !== 'super_admin') throw new IncentiveError('unauthorized');
    const body = await readBoundedJsonObject(request);
    const allowed = [
      'action',
      'campaignId',
      'terms',
      'expectedVersion',
      'requestId',
      'reason',
      'formVersion',
      'customAnswers',
    ];
    if (
      Object.keys(body).some((key) => !allowed.includes(key)) ||
      typeof body.action !== 'string' ||
      !['draft', 'publish', 'pause'].includes(body.action) ||
      typeof body.requestId !== 'string' ||
      !/^[a-zA-Z0-9_-]{1,100}$/.test(body.requestId) ||
      typeof body.reason !== 'string' ||
      !Number.isSafeInteger(body.expectedVersion) ||
      Number(body.expectedVersion) < 0 ||
      (body.campaignId !== undefined &&
        (typeof body.campaignId !== 'string' ||
          !body.campaignId.trim() ||
          body.campaignId.length > 191)) ||
      (body.action !== 'draft' &&
        (!body.campaignId || body.terms !== undefined))
    )
      throw new IncentiveError('invalid');
    const db = requireDatabase(env as unknown as { DB?: D1Database });
    const limit = await consumeRequestRateLimit(db, request, {
      scope: `promo-admin:${actor.id}`,
      limit: 40,
      windowMs: 60000,
    });
    if (!limit.allowed)
      return json({ error: 'Please wait before trying again.' }, 429);
    const configured = await validateSellerFormSubmission(
      db,
      'staff.promo-code',
      body.formVersion,
      body.customAnswers,
      body.requestId,
    );
    const context = {
      actorId: actor.id,
      authSubject: actor.authSubject,
      requestId: body.requestId,
      reason: body.reason,
      expectedVersion: Number(body.expectedVersion),
      now: Date.now(),
      form: {
        formId: 'staff.promo-code',
        versionId: configured.versionId,
        answers: configured.answers,
      },
    };
    if (body.action === 'draft')
      return json(
        await savePromoDraft(
          db,
          context,
          body.terms as PromoTerms,
          body.campaignId as string | undefined,
        ),
      );
    if (body.action === 'publish')
      return json(await publishPromo(db, context, body.campaignId as string));
    return json(await pausePromo(db, context, body.campaignId as string));
  } catch (error) {
    return failure(error);
  }
}
export async function GET(request: Request) {
  try {
    const actor = await requireStaffApi('commercial_policy.manage');
    if(hasActorIntentMismatch(request,actor.id))throw new StaffAuthorizationError('The signed-in account changed. Refresh this commercial view before using its retained fields.',403);
    if (actor.role !== 'super_admin') throw new IncentiveError('unauthorized');
    const params = new URL(request.url).searchParams;
    if (
      [...params.keys()].some(
        (key) =>
          !['campaignId', 'view', 'cursor', 'limit'].includes(key) ||
          params.getAll(key).length !== 1,
      )
    )
      throw new IncentiveError('invalid');
    const campaignId = params.get('campaignId');
    const view = params.get('view');
    if (
      (view !== null && view !== 'history') ||
      (view === 'history' && !campaignId) ||
      (campaignId !== null && !campaignId.trim()) ||
      (campaignId &&
        view === null &&
        (params.has('cursor') || params.has('limit')))
    )
      throw new IncentiveError('invalid');
    const rawLimit = params.get('limit');
    if (rawLimit !== null && !/^[1-9]\d*$/.test(rawLimit))
      throw new IncentiveError('invalid');
    const input = {
      actorId: actor.id,
      authSubject: actor.authSubject,
      ...(params.has('cursor') ? { cursor: params.get('cursor')! } : {}),
      ...(rawLimit !== null ? { limit: Number(rawLimit) } : {}),
    };
    const db = requireDatabase(env as unknown as { DB?: D1Database });
    if (campaignId)
      return json(
        view === 'history'
          ? await listPromoRedemptions(db, { ...input, campaignId })
          : await getPromoCampaign(db, {
              actorId: actor.id,
              authSubject: actor.authSubject,
              campaignId,
            }),
      );
    return json(await listPromoCampaigns(db, input));
  } catch (error) {
    return failure(error);
  }
}
