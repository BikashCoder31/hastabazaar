import { env } from 'cloudflare:workers';
import { requireSellerApi, SellerAuthorizationError } from '@/lib/auth/seller';
import { requireDatabase } from '@/lib/db/d1';
import { saveSellerReply } from '@/lib/db/repositories/review-extras';
import { CustomerDataConflictError } from '@/lib/db/repositories/customers';
import { isTrustedMutationRequest } from '@/lib/http/request-security';
import { consumePublicRequestRateLimit as consumeRequestRateLimit, rateLimitJson } from '@/lib/http/rate-limit';
import { BodyTooLargeError, readBoundedBody } from '@/lib/http/bounded-body';
import { FormRequestConflictError, validateSellerFormSubmission } from '@/lib/forms/submission';
import { FormRuntimeError } from '@/lib/forms/runtime';
import { FormValidationError } from '@/lib/forms/validation';
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isTrustedMutationRequest(request))
    return Response.json(
      { error: 'Cross-site requests are not allowed.' },
      { status: 403 },
    );
  try {
    const seller = await requireSellerApi();
    const db = requireDatabase(env as unknown as { DB?: D1Database });
    const limit = await consumeRequestRateLimit(db, request, {
      scope: `seller-reply:${seller.sellerId}`,
      limit: 30,
      windowMs: 3600000,
    });
    if (!limit.allowed) return rateLimitJson(limit);
    const { id } = await params;
    const body = JSON.parse(new TextDecoder().decode(await readBoundedBody(request, 131_072))) as Record<string, unknown> | null;
    if (
      !body || Array.isArray(body) || Object.keys(body).some((key) =>
        !['body', 'idempotencyKey', 'version', 'formVersion', 'customAnswers'].includes(key)) ||
      typeof body.body !== 'string' ||
      typeof body.idempotencyKey !== 'string' ||
      !body.idempotencyKey ||
      body.idempotencyKey.length > 100 ||
      !Number.isInteger(body.version) || !Number.isSafeInteger(body.formVersion) ||
      !Array.isArray(body.customAnswers)
    )
      return Response.json({ error: 'Invalid reply.' }, { status: 400 });
    const form = await validateSellerFormSubmission(db, 'seller.review-reply', body.formVersion,
      body.customAnswers, body.idempotencyKey);
    await saveSellerReply(db, {
      reviewId: id,
      sellerId: seller.sellerId,
      actorId: seller.userId,
      body: body.body,
      version: body.version as number,
      requestId: body.idempotencyKey,
      now: Date.now(),
      form: { requestId: body.idempotencyKey, versionId: form.versionId, answers: form.answers },
    });
    return Response.json(
      { ok: true },
      { headers: { 'cache-control': 'no-store' } },
    );
  } catch (e) {
    if (e instanceof FormValidationError)
      return Response.json({ error: e.message, fieldId: e.fieldId }, { status: 400 });
    if (e instanceof FormRuntimeError)
      return Response.json({ error: e.message, code: e.code },
        { status: e.code === 'stale_version' ? 409 : 503 });
    return Response.json(
      {
        error:
          e instanceof CustomerDataConflictError || e instanceof FormRequestConflictError ||
          e instanceof SellerAuthorizationError
            ? e.message
            : 'Reply could not be saved.',
      },
      {
        status:
          e instanceof SellerAuthorizationError
            ? e.status
            : e instanceof CustomerDataConflictError || e instanceof FormRequestConflictError
              ? 409
              : e instanceof SyntaxError ? 400
              : e instanceof BodyTooLargeError ? 413
              : 500,
      },
    );
  }
}
