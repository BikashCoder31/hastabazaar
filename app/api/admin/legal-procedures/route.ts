import { requireLegalDraftApi } from '@/lib/legal-procedures/access';
import { getLegalDraftRevision, getLegalDraftWorkspace, saveLegalDraft } from '@/lib/legal-procedures/repository';
import { LegalDraftAccessError, LegalDraftConflictError, LegalDraftStoreError, LegalDraftValidationError } from '@/lib/legal-procedures/model';
import { BodyTooLargeError, readBoundedBody } from '@/lib/http/bounded-body';
import { isTrustedMutationRequest } from '@/lib/http/request-security';

export const dynamic = 'force-dynamic';
const json = (body: unknown, status = 200) => Response.json(body,
  { status, headers: { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });

function failure(error: unknown) {
  if (error instanceof LegalDraftAccessError) return json({ error: error.message }, error.status);
  if (error instanceof LegalDraftValidationError) return json({ error: error.message }, 400);
  if (error instanceof LegalDraftConflictError) return json({ error: error.message }, 409);
  if (error instanceof BodyTooLargeError) return json({ error: 'The draft request exceeds 192 KiB.' }, 413);
  if (error instanceof LegalDraftStoreError) return json({ error: error.message }, 503);
  return json({ error: 'Legal draft storage is unavailable. Your edits have not been replaced.' }, 503);
}
function queryNumber(params: URLSearchParams, key: string, minimum: number) {
  const raw = params.get(key);
  if (raw === null) return undefined;
  if (params.getAll(key).length !== 1 || !/^(0|[1-9]\d{0,6})$/.test(raw) || Number(raw) < minimum || Number(raw) > 1_000_000)
    throw new LegalDraftValidationError('Select a valid saved revision.');
  return Number(raw);
}
export async function GET(request: Request): Promise<Response> {
  try {
    const { db } = await requireLegalDraftApi();
    const params = new URL(request.url).searchParams;
    if ([...params.keys()].some(key => !['revision', 'beforeRevision'].includes(key)) ||
      (params.has('revision') && params.has('beforeRevision'))) throw new LegalDraftValidationError('Unsupported history query.');
    const revision = queryNumber(params, 'revision', 0);
    if (revision !== undefined) {
      const version = await getLegalDraftRevision(db, revision);
      return version ? json({ version }) : json({ error: 'That saved draft version was not found.' }, 404);
    }
    return json(await getLegalDraftWorkspace(db, queryNumber(params, 'beforeRevision', 1)));
  } catch (error) { return failure(error); }
}
export async function POST(request: Request): Promise<Response> {
  try {
    const { db, actor } = await requireLegalDraftApi();
    // Browser draft saves always supply Origin; reject missing Origin on this new endpoint.
    if (!request.headers.get('origin') || !isTrustedMutationRequest(request))
      return json({ error: 'Cross-site or missing-origin draft requests are not allowed.' }, 403);
    if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json')
      return json({ error: 'Send this draft as JSON.' }, 415);
    const bytes = await readBoundedBody(request, 192 * 1024);
    let input: unknown;
    try { input = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
    catch { throw new LegalDraftValidationError('The draft request is not valid JSON.'); }
    return json({ saved: await saveLegalDraft(db, actor, input, Date.now()) });
  } catch (error) { return failure(error); }
}
