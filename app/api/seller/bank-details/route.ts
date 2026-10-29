import { env } from 'cloudflare:workers';
import { requireExistingCustomerApi, CustomerAuthorizationError } from '@/lib/auth/customer';
import { requireDatabase, requireMediaBucket } from '@/lib/db/d1';
import { getSellerParticipationForUser } from '@/lib/db/repositories/seller-applications';
import { isTrustedMutationRequest } from '@/lib/http/request-security';
import { readBoundedForm, BodyTooLargeError } from '@/lib/http/bounded-body';
import { validateSellerDocument } from '@/lib/sellers/application';
import { validateSellerDocumentContent } from '@/lib/uploads/document-content';
import { parseBankDetails, sellerBankState, submitSellerBankDetails, SellerBankError } from '@/lib/sellers/bank-details';
import { PENDING_PAYOUT_PREFIX } from '@/lib/sellers/onboarding';
import { consumePublicRequestRateLimit, rateLimitJson } from '@/lib/http/rate-limit';

export const dynamic = 'force-dynamic';
const bindings = env as unknown as { DB?: D1Database; MEDIA?: R2Bucket };
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
async function owner() {
  const actor = await requireExistingCustomerApi(); const db = requireDatabase(bindings);
  const profile = await getSellerParticipationForUser(db, actor.userId);
  if (!profile) throw new SellerBankError('Submit your seller application before adding bank details.', 404);
  return { actor, db, profile };
}
function failure(error: unknown) {
  if (error instanceof SellerBankError || error instanceof CustomerAuthorizationError) return reply({ error: error.message }, error.status);
  if (error instanceof BodyTooLargeError) return reply({ error: 'Bank evidence must be no larger than 5 MB.' }, 413);
  return reply({ error: 'Bank details could not be confirmed saved. Reload to check their status before retrying.' }, 503);
}
export async function GET() {
  try { const { db, profile } = await owner(); const { status, revision } = await sellerBankState(db, profile.sellerId); return reply({ status, revision }); }
  catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  if (!isTrustedMutationRequest(request)) return reply({ error: 'Cross-site requests are not allowed.' }, 403);
  try {
    const { actor, db, profile } = await owner();
    const rate = await consumePublicRequestRateLimit(db, request, { scope: `seller-bank:${actor.userId}`, limit: 10, windowMs: 60 * 60_000 });
    if (!rate.allowed) return rateLimitJson(rate);
    const data = await readBoundedForm(request, 6 * 1024 * 1024);
    const allowed = new Set(['revision', 'payoutBeneficiary', 'bankName', 'bankBranch', 'bankAccountNumber', 'bankVerification']);
    if ([...data.keys()].some(key => !allowed.has(key) || data.getAll(key).length !== 1)) throw new SellerBankError('Invalid bank details form.', 400);
    const revision = data.get('revision');
    if (typeof revision !== 'string' || !/^[a-f0-9]{64}$/.test(revision)) throw new SellerBankError('Reload the bank details form.', 400);
    const details = parseBankDetails(Object.fromEntries(data));
    const file = data.get('bankVerification');
    if (!(file instanceof File) || !file.size) throw new SellerBankError('Attach bank evidence showing the beneficiary and account.', 400);
    const error = validateSellerDocument(file) ?? await validateSellerDocumentContent(file);
    if (error) throw new SellerBankError(error, 400);
    const current = await sellerBankState(db, profile.sellerId);
    if (current.revision !== revision || current.status === 'verified') throw new SellerBankError('Bank details changed or are already reviewed. Reload to check their status.');
    const id = crypto.randomUUID(), objectKey = `private/seller-documents/${profile.sellerId}/${id}`;
    await requireMediaBucket(bindings).put(objectKey, file.stream(), { httpMetadata: { contentType: file.type },
      customMetadata: { sellerId: profile.sellerId, documentKind: 'bank_verification', submittedPayout: PENDING_PAYOUT_PREFIX + JSON.stringify(details) } });
    await submitSellerBankDetails(db, { sellerId: profile.sellerId, actorId: actor.userId, revision, details, now: Date.now(),
      document: { id, objectKey, kind: 'bank_verification', originalName: file.name.slice(0, 180), mimeType: file.type, sizeBytes: file.size } });
    return reply({ ok: true });
  } catch (error) { return failure(error); }
}
