import { env } from 'cloudflare:workers';
import { requireSellerCenterApi, SellerCenterAuthorizationError } from '@/lib/auth/seller-center';
import { requireExistingCustomerApi, CustomerAuthorizationError } from '@/lib/auth/customer';
import { requireDatabase, requireMediaBucket } from '@/lib/db/d1';
import { isTrustedMutationRequest } from '@/lib/http/request-security';
import { readBoundedForm, BodyTooLargeError } from '@/lib/http/bounded-body';
import { consumePublicRequestRateLimit, rateLimitJson } from '@/lib/http/rate-limit';
import { resolvePublishedForm } from '@/lib/forms/runtime';
import { draftFileNames, isDraftToken, parseDraftAnswers, SellerDraftError, type DraftSave } from '@/lib/sellers/draft-contract';
import { readSellerDraft, saveSellerDraft, deleteSellerDraft, readSellerDraftFile, cleanupSellerDrafts } from '@/lib/sellers/draft-store';
import { validateSellerDocument, maximumApplicationBytes } from '@/lib/sellers/application';
import { validateSellerDocumentContent } from '@/lib/documents/document-content';

export const dynamic = 'force-dynamic';
const bindings = env as unknown as { DB?: D1Database; MEDIA?: R2Bucket };
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
async function actor(request: Request) {
  const [owner, customer] = await Promise.all([requireSellerCenterApi(), requireExistingCustomerApi()]);
  if (owner.userId !== customer.userId || request.headers.get('X-Draft-Account') !== customer.userId)
    throw new SellerDraftError('Your signed-in account changed. Reload before continuing.', 403);
  return customer.userId;
}
function failure(error: unknown) {
  if (error instanceof SellerDraftError || error instanceof SellerCenterAuthorizationError || error instanceof CustomerAuthorizationError)
    return reply({ error: error.message }, error.status);
  if (error instanceof BodyTooLargeError) return reply({ error: 'The draft upload is too large.' }, 413);
  if (error instanceof SyntaxError) return reply({ error: 'The draft could not be read.' }, 400);
  return reply({ error: 'Draft saving is unavailable. Keep this page open; your latest changes have not been confirmed saved.' }, 503);
}
export async function GET(request: Request) {
  try {
    const userId = await actor(request);
    const db = requireDatabase(bindings);
    const id = new URL(request.url).searchParams.get('file');
    if (id) {
      if (!isDraftToken(id)) throw new SellerDraftError('Saved file is unavailable.', 404);
      const file = await readSellerDraftFile(db, userId, id);
      const object = await requireMediaBucket(bindings).get(file.objectKey);
      if (!object || object.size !== file.size) throw new SellerDraftError('Saved file is unavailable. Please attach it again.', 404);
      return new Response(object.body, { headers: { 'Cache-Control': 'no-store', 'Content-Type': 'application/octet-stream',
        'Content-Disposition': 'attachment', 'X-Content-Type-Options': 'nosniff' } });
    }
    return reply({ draft: await readSellerDraft(db, userId) });
  } catch (error) { return failure(error); }
}
export async function PUT(request: Request) {
  if (!isTrustedMutationRequest(request)) return reply({ error: 'Cross-site requests are not allowed.' }, 403);
  try {
    const userId = await actor(request);
    const db = requireDatabase(bindings);
    const rate = await consumePublicRequestRateLimit(db, request, { scope: `seller-draft:${userId}`, limit: 120, windowMs: 60_000 });
    if (!rate.allowed) return rateLimitJson(rate);
    const form = await readBoundedForm(request, maximumApplicationBytes);
    const values = form.getAll('payload');
    if (values.length !== 1 || typeof values[0] !== 'string' || values[0].length > 100_000) throw new SellerDraftError('Invalid draft.');
    const raw = JSON.parse(values[0]);
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) ||
      Object.keys(raw).some(key => !['revision', 'changeId', 'attemptId', 'formVersion', 'answers', 'files'].includes(key)) ||
      raw.revision !== null && !isDraftToken(raw.revision) || !isDraftToken(raw.changeId) || raw.changeId.length > 36 ||
      !isDraftToken(raw.attemptId) || !Number.isSafeInteger(raw.formVersion) || raw.formVersion < 1 ||
      !raw.files || typeof raw.files !== 'object' || Array.isArray(raw.files) ||
      Object.entries(raw.files).some(([key, id]) => !draftFileNames.has(key) || !isDraftToken(id)))
      throw new SellerDraftError('Invalid draft.');
    const config = await resolvePublishedForm(db, 'seller.application');
    const answers = parseDraftAnswers(raw.answers, config.fields.filter(field => field.status === 'active').map(field => field.key));
    const input: DraftSave = { ...raw, answers };
    const uploads: Record<string, File> = {};
    for (const [name, value] of form) {
      if (name === 'payload') continue;
      if (!draftFileNames.has(name) || form.getAll(name).length !== 1 || !(value instanceof File) || !value.size)
        throw new SellerDraftError('Invalid draft file.');
      const error = validateSellerDocument(value) ?? await validateSellerDocumentContent(value);
      if (error) throw new SellerDraftError(`${name}: ${error}`);
      uploads[name] = value;
    }
    const bucket = requireMediaBucket(bindings);
    const draft = await saveSellerDraft(db, bucket, userId, input, uploads);
    // Cleanup failure must not turn a committed save into a false failure.
    await cleanupSellerDrafts(db, bucket).catch(() => undefined);
    return reply({ draft });
  } catch (error) { return failure(error); }
}
export async function DELETE(request: Request) {
  if (!isTrustedMutationRequest(request)) return reply({ error: 'Cross-site requests are not allowed.' }, 403);
  try {
    const userId = await actor(request);
    const revision = request.headers.get('If-Match');
    if (!isDraftToken(revision)) throw new SellerDraftError('A saved draft revision is required.');
    await deleteSellerDraft(requireDatabase(bindings), userId, revision);
    return reply({ deleted: true });
  } catch (error) { return failure(error); }
}
