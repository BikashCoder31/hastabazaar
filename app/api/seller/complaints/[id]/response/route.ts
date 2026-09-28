import { readBoundedJsonObject } from '@/lib/http/form-json-body';
import { env } from 'cloudflare:workers';
import { requireSellerApi, SellerAuthorizationError } from '@/lib/auth/seller';
import { requireDatabase } from '@/lib/db/d1';
import { respondToComplaintAsSeller, ComplaintConflictError } from '@/lib/db/repositories/complaints';
import { isTrustedMutationRequest } from '@/lib/http/request-security';
import { BodyTooLargeError } from '@/lib/http/bounded-body';
import { validateSellerFormSubmission } from '@/lib/forms/submission';
import { FormRuntimeError } from '@/lib/forms/runtime';
import { FormValidationError } from '@/lib/forms/validation';

export const dynamic = 'force-dynamic';
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'cache-control': 'no-store' } });

export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  if (!isTrustedMutationRequest(request)) return json({ error: 'Request origin was not accepted.' }, 403);
  try {
    const seller = await requireSellerApi();
    const { id } = await context.params;
    const database = requireDatabase(env as unknown as { DB?: D1Database });
    const body = await readBoundedJsonObject(request) as Record<string, unknown>;
    if (!body || typeof body !== 'object' || Array.isArray(body) ||
        !Number.isSafeInteger(body.formVersion) || !Array.isArray(body.customAnswers))
      return json({ error: 'Form version and answers are required.' }, 400);
    const response = typeof body.response === 'string' ? body.response.trim() : '';
    const requestId = typeof body.idempotencyKey === 'string' ? body.idempotencyKey : '';
    if (response.length < 20 || response.length > 2_000) return json({ error: 'Add a response of 20–2,000 characters.' }, 400);
    if (requestId.length < 8 || requestId.length > 100) return json({ error: 'The request identifier is invalid.' }, 400);
    const configured = await validateSellerFormSubmission(database, 'seller.case-complaint-response',
      body.formVersion, body.customAnswers, requestId);
    await respondToComplaintAsSeller(database, { complaintId: id, sellerId: seller.sellerId,
      actorId: seller.userId, response, requestId, now: Date.now(),
      form: { versionId: configured.versionId, answers: configured.answers } });
    return json({ ok: true });
  } catch (error) {
    if (error instanceof SellerAuthorizationError) return json({ error: error.message }, error.status);
    if (error instanceof ComplaintConflictError) return json({ error: error.message }, 409);
    if (error instanceof BodyTooLargeError) return json({ error: 'The response is too large.' }, 413);
    if (error instanceof FormRuntimeError)
      return json({ error: error.message, code: error.code }, error.code === 'stale_version' ? 409 : 503);
    if (error instanceof FormValidationError)
      return json({ error: error.message, fieldId: error.fieldId }, 400);
    if (error instanceof SyntaxError) return json({ error: 'Invalid request.' }, 400);
    console.error('Seller complaint response failed', error);
    return json({ error: 'The response could not be saved.' }, 500);
  }
}
