import { readBoundedJsonObject } from '@/lib/http/form-json-body';
import { env } from 'cloudflare:workers';
import { requireDatabase } from '@/lib/db/d1';
import { BodyTooLargeError } from '@/lib/http/bounded-body';
import { isTrustedMutationRequest } from '@/lib/http/request-security';
import {
  GiftCardConflictError,
  GiftCardAccessError,
  GiftCardUnconfirmedError,
  issueGiftCard,
  parseGiftAmount,
} from '@/lib/db/repositories/gift-cards';
import { requireStaffApi, StaffAuthorizationError } from '@/lib/auth/staff';
import {hasActorIntentMismatch} from '@/lib/http/actor-intent';
import { CustomerAuthorizationError } from '@/lib/auth/customer';
import { validateSellerFormSubmission } from '@/lib/forms/submission';
import { FormRuntimeError } from '@/lib/forms/runtime';
import { FormValidationError } from '@/lib/forms/validation';
import {GiftCardOutcomeError,readGiftCardCommandOutcome} from '@/lib/gift-cards/command-outcomes';
export const dynamic = 'force-dynamic';
const json = (body: unknown, status: number) =>
  Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' },
  });
export async function GET(request:Request){try{const actor=await requireStaffApi('admin.invite');if(hasActorIntentMismatch(request,actor.id))throw new StaffAuthorizationError('Your signed-in staff account changed. Reopen Gift cards.',403);const query=new URL(request.url).searchParams;if([...query.keys()].some(key=>key!=='requestId')||query.getAll('requestId').length!==1)return json({error:'Identify the original gift card request.'},400);return json(await readGiftCardCommandOutcome(requireDatabase(env as unknown as{DB?:D1Database}),actor.id,'issue',query.get('requestId')),200);}catch(error){if(error instanceof StaffAuthorizationError||error instanceof CustomerAuthorizationError||error instanceof GiftCardOutcomeError)return json({error:error.message},error.status);return json({error:'The original gift card result is temporarily unavailable.'},503);}}
export async function POST(request: Request) {
  if (!isTrustedMutationRequest(request))
    return json({ error: 'Cross-site requests are not allowed.' }, 403);
  try {
    const actor = await requireStaffApi('admin.invite');
    if(hasActorIntentMismatch(request,actor.id))throw new StaffAuthorizationError('Your signed-in staff account changed. Reopen Gift cards before continuing.',403);
    const body = await readBoundedJsonObject(request);
    if (
      !body ||
      Array.isArray(body) ||
      typeof body !== 'object' ||
      typeof body.requestId !== 'string' ||
      !Number.isSafeInteger(body.formVersion) || !Array.isArray(body.customAnswers)
    )
      return json({ error: 'Invalid request.' }, 400);
    const db = requireDatabase(env as unknown as { DB?: D1Database });
    const form = await validateSellerFormSubmission(db, 'commerce.gift-card-issue',
      body.formVersion, body.customAnswers, body.requestId);
    return json(
      await issueGiftCard(db, {
        actorId: actor.id,
        amountPaisa: parseGiftAmount(body.amount),
        requestId: body.requestId,
        now: Date.now(),
        form: { versionId: form.versionId, answers: form.answers },
      }),
      201,
    );
  } catch (error) {
    if (
      error instanceof StaffAuthorizationError ||
      error instanceof CustomerAuthorizationError
    )
      return json({ error: error.message,code:'access_denied_before_write' }, error.status);
    if (error instanceof BodyTooLargeError)
      return json({ error: 'Request is too large.' }, 413);
    if(error instanceof GiftCardAccessError)return json({error:error.message,code:error.beforeWrite?'access_denied_before_write':'outcome_unconfirmed'},403);
    if(error instanceof GiftCardUnconfirmedError)return json({error:error.message,code:error.code},503);
    if (error instanceof GiftCardConflictError)
      return json({ error: error.message,code:'command_rejected' }, 409);
    if (error instanceof FormRuntimeError)
      return json({ error: error.message, code: error.code }, error.code === 'stale_version' ? 409 : 503);
    if (error instanceof FormValidationError)
      return json({ error: error.message, fieldId: error.fieldId }, 400);
    if(error instanceof SyntaxError)return json({error:'Invalid gift card request.'},400);
    return json({error:'The gift card outcome could not be confirmed. Check its saved result before starting another issuance.',code:'outcome_unconfirmed'},503);
  }
}
