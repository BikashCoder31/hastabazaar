import { ACTOR_INTENT_HEADER } from '@/lib/http/actor-intent';
import { BodyTooLargeError, readBoundedBody } from '@/lib/http/bounded-body';
import { isTrustedMutationRequest } from '@/lib/http/request-security';
import { createPayoutBankFile } from '@/lib/payments/payout-bank-file';
import { requirePayoutBankFileActor } from '@/lib/payments/payout-bank-file-access';
import { payoutRunIdPattern } from '@/lib/payments/payout-bank-file-scope';
import { privateHeaders, securityBindings, securityFailure, SecurityRequestError } from '@/lib/security/request';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    if (!request.headers.get('origin') || !isTrustedMutationRequest(request, securityBindings().APP_ORIGIN))
      throw new SecurityRequestError('Cross-site requests are not allowed.');
    if (!request.headers.get(ACTOR_INTENT_HEADER)) throw new SecurityRequestError('Refresh the current payout run.');

    const body: unknown = JSON.parse(new TextDecoder().decode(await readBoundedBody(request, 1024)));
    if (!body || typeof body !== 'object' || Object.keys(body).length !== 1 ||
        !('runId' in body) || typeof body.runId !== 'string' || !payoutRunIdPattern.test(body.runId))
      throw new SecurityRequestError('Choose the current payout run.', 400);

    const access = await requirePayoutBankFileActor(request);
    const csv = await createPayoutBankFile(access.db, access, body.runId);
    return new Response(csv, { headers: {
      ...privateHeaders,
      Vary: 'Cookie',
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="hastabazaar-payout-run-' + body.runId + '.csv"',
      'X-Content-Type-Options': 'nosniff',
    } });
  } catch (error) {
    if (error instanceof BodyTooLargeError) return securityFailure(new SecurityRequestError('Request too large.', 413));
    if (error instanceof SyntaxError) return securityFailure(new SecurityRequestError('Choose the current payout run.', 400));
    return securityFailure(error);
  }
}
