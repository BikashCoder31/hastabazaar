import { BodyTooLargeError, readBoundedBody } from '../http/bounded-body';
import { isTrustedMutationRequest } from '../http/request-security';
import { LegalDraftAccessError, LegalDraftConflictError, LegalDraftStoreError, LegalDraftValidationError } from './model';

export const legalJson = (body: unknown, status = 200) => Response.json(body,
  { status, headers: { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
export function legalFailure(error: unknown) {
  if (error instanceof LegalDraftAccessError) return legalJson({ error: error.message }, error.status);
  if (error instanceof LegalDraftValidationError) return legalJson({ error: error.message }, 400);
  if (error instanceof LegalDraftConflictError) return legalJson({ error: error.message }, 409);
  if (error instanceof BodyTooLargeError) return legalJson({ error: 'The procedure action exceeds 16 KiB.' }, 413);
  if (error instanceof LegalDraftStoreError) return legalJson({ error: error.message }, 503);
  return legalJson({ error: 'Procedure storage is unavailable. No replacement state has been assumed.' }, 503);
}
export async function readLegalAction(request: Request) {
  if (!request.headers.get('origin') || !isTrustedMutationRequest(request)) throw new LegalDraftAccessError('Cross-site or missing-origin actions are not allowed.');
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json')
    throw new LegalDraftValidationError('Send this action as JSON.');
  const bytes = await readBoundedBody(request, 16 * 1024);
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown; }
  catch { throw new LegalDraftValidationError('The procedure action is not valid JSON.'); }
}
export function legalQueryNumber(params: URLSearchParams, key: string) {
  const value = params.get(key);
  if (value === null) return undefined;
  if (params.getAll(key).length !== 1 || !/^[1-9]\d{0,6}$/.test(value) || Number(value) > 1_000_000)
    throw new LegalDraftValidationError('Select a valid recorded procedure action.');
  return Number(value);
}
