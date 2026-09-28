import { env } from 'cloudflare:workers';
import {
  requireExistingCustomerApi,
  CustomerAuthorizationError,
} from '@/lib/auth/customer';
import { requireDatabase } from '@/lib/db/d1';
import { isTrustedMutationRequest } from '@/lib/http/request-security';
import { readBoundedJsonObject } from '@/lib/http/form-json-body';
import { BodyTooLargeError } from '@/lib/http/bounded-body';
import { consumeRequestRateLimit, rateLimitJson } from '@/lib/http/rate-limit';
import { validateSellerFormSubmission } from '@/lib/forms/submission';
import { FormRuntimeError } from '@/lib/forms/runtime';
import { FormValidationError } from '@/lib/forms/validation';
import { redeemPoints } from '@/lib/db/repositories/loyalty';
import { IncentiveError } from '@/lib/incentives/types';
export const dynamic = 'force-dynamic';
const json = (body: unknown, status = 200) =>
  Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' },
  });
export async function POST(request: Request) {
  if (!isTrustedMutationRequest(request))
    return json({ error: 'Cross-site requests are not allowed.' }, 403);
  try {
    const body = await readBoundedJsonObject(request);
    if (
      Object.keys(body).some(
        (key) =>
          ![
            'points',
            'requestId',
            'expectedVersion',
            'formVersion',
            'customAnswers',
          ].includes(key),
      ) ||
      !Number.isSafeInteger(body.points) ||
      Number(body.points) < 1 ||
      typeof body.requestId !== 'string' ||
      !/^[a-zA-Z0-9_-]{1,100}$/.test(body.requestId) ||
      !Number.isSafeInteger(body.expectedVersion) ||
      Number(body.expectedVersion) < 1 ||
      !Number.isSafeInteger(body.formVersion) ||
      Number(body.formVersion) < 1 ||
      !Array.isArray(body.customAnswers) ||
      body.customAnswers.length
    )
      throw new IncentiveError('invalid');
    const customer = await requireExistingCustomerApi();
    const db = requireDatabase(env as unknown as { DB?: D1Database });
    const rate = await consumeRequestRateLimit(db, request, {
      scope: `points-redemption:${customer.userId}`,
      limit: 20,
      windowMs: 15 * 60000,
    });
    if (!rate.allowed) return rateLimitJson(rate);
    // Redemptions retain form version provenance without answer rows. An existing attempt uses its original historical version, then the repository validates the exact digest and current authority before replay.
    const prior = await db
      .prepare(
        'SELECT 1 FROM loyalty_redemptions WHERE user_id=? AND request_id=?',
      )
      .bind(customer.userId, body.requestId)
      .first();
    let versionId: string;
    if (prior) {
      const version = await db
        .prepare(
          "SELECT id FROM form_config_versions WHERE form_id='account.points-redemption' AND version=? AND status='published'",
        )
        .bind(body.formVersion)
        .first<{ id: string }>();
      if (!version) throw new IncentiveError('conflict');
      versionId = version.id;
    } else {
      const configured = await validateSellerFormSubmission(
        db,
        'account.points-redemption',
        body.formVersion,
        body.customAnswers,
      );
      versionId = configured.versionId;
    }
    return json(
      await redeemPoints(db, {
        points: Number(body.points),
        userId: customer.userId,
        authSubject: customer.authSubject,
        requestId: body.requestId,
        expectedVersion: Number(body.expectedVersion),
        now: Date.now(),
        formVersionId: versionId,
      }),
    );
  } catch (error) {
    if (error instanceof CustomerAuthorizationError)
      return json({ error: error.message }, error.status);
    if (error instanceof BodyTooLargeError)
      return json({ error: 'Request is too large.' }, 413);
    if (error instanceof SyntaxError || error instanceof FormValidationError)
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
    return json({ error: 'Points could not be redeemed.' }, 500);
  }
}
