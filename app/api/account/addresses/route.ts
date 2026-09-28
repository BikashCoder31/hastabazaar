import { readBoundedJsonObject } from '@/lib/http/form-json-body';
import { env } from 'cloudflare:workers';

import { CustomerAuthorizationError, requireCustomerApi } from '@/lib/auth/customer';
import { requireDatabase } from '@/lib/db/d1';
import { CustomerDataConflictError, customerAddressRequestStatus, saveCustomerAddress, validateAddressFormSubmission, type CustomerAddressInput } from '@/lib/db/repositories/customers';
import { BodyTooLargeError } from '@/lib/http/bounded-body';
import { FormRuntimeError } from '@/lib/forms/runtime';
import { FormValidationError } from '@/lib/forms/validation';
import { isTrustedMutationRequest } from '@/lib/http/request-security';

export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  if (!isTrustedMutationRequest(request)) return Response.json({ error: 'Cross-site requests are not allowed.' }, { status: 403 });
  try {
    const customer = await requireCustomerApi();
    const body = await readBoundedJsonObject(request) as { address?: CustomerAddressInput; idempotencyKey?: string; formVersion?: number; customAnswers?: unknown };
    if (!body?.address || typeof body.address !== 'object' || Array.isArray(body.address) || typeof body.idempotencyKey !== 'string' ||
      !body.idempotencyKey || body.idempotencyKey.length > 100 || !Number.isSafeInteger(body.formVersion) || !Array.isArray(body.customAnswers))
      return Response.json({ error: 'Address, form version, answers and idempotency key are required.' }, { status: 400 });
    const db = requireDatabase(env as unknown as { DB?: D1Database });
    const replay = await customerAddressRequestStatus(db, { userId: customer.userId, input: body.address,
      requestId: body.idempotencyKey, formVersion: body.formVersion!, customAnswers: body.customAnswers });
    if (replay.status === 'same') return Response.json({ id: replay.id }, { status: 201 });
    if (replay.status === 'conflict') throw new CustomerDataConflictError('This request ID was already used for different address values.');
    const form = await validateAddressFormSubmission(db, body.address, body.formVersion!, body.customAnswers);
    const id = await saveCustomerAddress(db, { userId: customer.userId, input: body.address, requestId: body.idempotencyKey, now: Date.now(), form });
    return Response.json({ id }, { status: 201 });
  } catch (error) {
    if (error instanceof CustomerAuthorizationError) return Response.json({ error: error.message }, { status: error.status });
    if (error instanceof BodyTooLargeError) return Response.json({ error: 'Address submission is too large.' }, { status: 413 });
    if (error instanceof SyntaxError) return Response.json({ error: 'Invalid address request.' }, { status: 400 });
    if (error instanceof FormRuntimeError) return Response.json({ error: error.code === 'stale_version' ? error.message : 'Form configuration is unavailable.', code: error.code }, { status: error.code === 'stale_version' ? 409 : 503 });
    if (error instanceof FormValidationError) return Response.json({ error: error.message, ...(error.fieldId ? { fieldId: error.fieldId } : {}) }, { status: 400 });
    if (error instanceof CustomerDataConflictError) return Response.json({ error: error.message }, { status: 409 });
    return Response.json({ error: 'The address could not be saved.' }, { status: 500 });
  }
}
