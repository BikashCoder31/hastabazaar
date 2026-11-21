import { env } from 'cloudflare:workers';
import { requireDatabase } from '@/lib/db/d1';
import { readOrderCustomerIntent } from '@/lib/orders/customer-intent';
import { CustomerDelayAnswerError, keepCustomerDelayProposal } from '@/lib/orders/customer-delay-answer';
import { isTrustedMutationRequest } from '@/lib/http/request-security';
import { readBoundedJsonObject } from '@/lib/http/form-json-body';
import { BodyTooLargeError } from '@/lib/http/bounded-body';

export const dynamic = 'force-dynamic';
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isTrustedMutationRequest(request)) return json({ error: 'Request origin was not accepted.' }, 403);
  try {
    const intent = await readOrderCustomerIntent(request);
    if (!intent.ok) return json({ error: intent.error }, intent.status);
    if (!intent.customer) return json({ error: 'Sign in to answer the seller’s question.' }, 401);
    const { id } = await params;
    const input = await readBoundedJsonObject(request);
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(id) || Object.keys(input).some(key => key !== 'revision' && key !== 'proposedReadyAt') ||
        typeof input.revision !== 'number' || !Number.isSafeInteger(input.revision) || input.revision < 0 ||
        typeof input.proposedReadyAt !== 'number' || !Number.isSafeInteger(input.proposedReadyAt) || input.proposedReadyAt <= 0) {
      return json({ error: 'Open the current seller question and review its date.' }, 400);
    }
    return json(await keepCustomerDelayProposal(requireDatabase(env as unknown as { DB?: D1Database }),
      { id: intent.customer.userId, authSubject: intent.customer.authSubject },
      { caseId: id, proposedReadyAt: input.proposedReadyAt, revision: input.revision }));
  } catch (error) {
    if (error instanceof BodyTooLargeError) return json({ error: 'Request too large.' }, 413);
    if (error instanceof SyntaxError) return json({ error: 'Review the current seller question.' }, 400);
    if (error instanceof CustomerDelayAnswerError) return json({ error: error.message }, error.status);
    return json({ error: 'Your answer couldn’t be confirmed. Retry the same choice to check it.' }, 503);
  }
}
