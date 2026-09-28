import { readBoundedJsonObject } from '@/lib/http/form-json-body';
import { env } from 'cloudflare:workers';

import { requireSellerApi, SellerAuthorizationError } from '@/lib/auth/seller';
import { requireDatabase } from '@/lib/db/d1';
import { SellerProfileConflictError, updateSellerProfile, type EditableSellerProfile } from '@/lib/db/repositories/seller-profile';
import { isTrustedMutationRequest } from '@/lib/http/request-security';
import { BodyTooLargeError } from '@/lib/http/bounded-body';
import { FormRequestConflictError, validateSellerFormSubmission } from '@/lib/forms/submission';
import { FormRuntimeError } from '@/lib/forms/runtime';
import { FormValidationError } from '@/lib/forms/validation';

export const dynamic = 'force-dynamic';

export async function PATCH(request: Request): Promise<Response> {
  if (!isTrustedMutationRequest(request)) return Response.json({ error: 'Cross-site requests are not allowed.' }, { status: 403 });
  try {
    const seller = await requireSellerApi();
    const body = await readBoundedJsonObject(request) as {
      profile?: EditableSellerProfile; idempotencyKey?: string; formVersion?: number; customAnswers?: unknown };
    const profileKeys = new Set(['tradingName', 'businessDescription', 'productCategories', 'supportPhone',
      'supportEmail', 'province', 'district', 'municipality', 'ward', 'locality']);
    if (!body || Array.isArray(body) || Object.keys(body).some((key) =>
      !['profile', 'idempotencyKey', 'formVersion', 'customAnswers'].includes(key)) ||
      !body.profile || typeof body.profile !== 'object' || Array.isArray(body.profile) ||
      Object.keys(body.profile).some((key) => !profileKeys.has(key)) ||
      !body.idempotencyKey || !/^[a-zA-Z0-9_-]{1,100}$/.test(body.idempotencyKey) ||
      !Number.isSafeInteger(body.formVersion) || !Array.isArray(body.customAnswers))
      return Response.json({ error: 'Profile and form request are required.' }, { status: 400 });
    const database = requireDatabase(env as unknown as { DB?: D1Database });
    const form = await validateSellerFormSubmission(database, 'seller.profile', body.formVersion,
      body.customAnswers, body.idempotencyKey, { tradingName: body.profile.tradingName,
        businessDescription: body.profile.businessDescription });
    await updateSellerProfile(database, { sellerId: seller.sellerId, actorId: seller.userId, input: body.profile,
      requestId: body.idempotencyKey, now: Date.now(),
      form: { requestId: body.idempotencyKey, versionId: form.versionId, answers: form.answers } });
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof SellerAuthorizationError) return Response.json({ error: error.message }, { status: error.status });
    if (error instanceof SyntaxError) return Response.json({ error: 'The seller profile request is invalid.' }, { status: 400 });
    if (error instanceof SellerProfileConflictError) return Response.json({ error: error.message }, { status: 409 });
    if (error instanceof FormRequestConflictError) return Response.json({ error: error.message, code: 'request_id_conflict' }, { status: 409 });
    if (error instanceof FormRuntimeError) return Response.json({ error: error.message, code: error.code }, { status: error.code === 'stale_version' ? 409 : 503 });
    if (error instanceof FormValidationError) return Response.json({ error: error.message, fieldId: error.fieldId }, { status: 400 });
    if (error instanceof BodyTooLargeError) return Response.json({ error: error.message }, { status: 413 });
    return Response.json({ error: 'The seller profile could not be updated.' }, { status: 500 });
  }
}
