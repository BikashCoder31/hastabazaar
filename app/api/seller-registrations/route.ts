import { env } from 'cloudflare:workers';
import { requireSellerTermsApi, SellerTermsAuthorizationError } from '@/lib/auth/seller-commercial-access';
import { requireExistingCustomerApi, CustomerAuthorizationError } from '@/lib/auth/customer';
import { getContactVerificationStatus, ContactVerificationError } from '@/lib/auth/contact-verification';
import { requireDatabase, requireMediaBucket } from '@/lib/db/d1';
import { isTrustedMutationRequest } from '@/lib/http/request-security';
import { readBoundedForm, BodyTooLargeError } from '@/lib/http/bounded-body';
import { consumePublicRequestRateLimit, rateLimitJson } from '@/lib/http/rate-limit';
import { resolvePublishedForm, FormRuntimeError } from '@/lib/forms/runtime';
import { FormValidationError } from '@/lib/forms/validation';
import { configuredMultipartAnswers, digestMultipartRequest, formRequestReplay, validateSellerFormSubmission, FormRequestConflictError } from '@/lib/forms/submission';
import { readOptionalRegistration, optionalRegistrationInput, registrationFileKinds } from '@/lib/sellers/registration-intake';
import { readRegistration, saveRegistration, RegistrationError, registrationReadiness } from '@/lib/sellers/registration-store';
import { sellerDocumentsForApplication, validateSellerDocument, type SellerApplicationDocument } from '@/lib/sellers/application';
import { validateSellerDocumentContent } from '@/lib/uploads/document-content';

export const dynamic = 'force-dynamic';
const bindings = env as unknown as { DB?: D1Database; MEDIA?: R2Bucket };
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
function failure(error: unknown) {
  if (error instanceof RegistrationError || error instanceof CustomerAuthorizationError || error instanceof SellerTermsAuthorizationError || error instanceof ContactVerificationError) return reply({ error: error.message }, error.status);
  if (error instanceof FormRuntimeError) return reply({ error: error.message, code: error.code }, error.code === 'stale_version' ? 409 : 503);
  if (error instanceof FormRequestConflictError) return reply({ error: error.message, code: 'request_id_conflict' }, 409);
  if (error instanceof FormValidationError) return reply({ error: error.message }, 400);
  if (error instanceof BodyTooLargeError) return reply({ error: 'Registration documents are too large.' }, 413);
  return reply({ error: 'Registration could not be confirmed saved. Keep this page open and retry, or check your dashboard.' }, 503);
}
async function actor() {
  const [viewer, customer] = await Promise.all([requireSellerTermsApi(), requireExistingCustomerApi()]);
  if (viewer.userId !== customer.userId) throw new RegistrationError('The signed-in account changed.', 403);
  return customer;
}
export async function GET() {
  try {
    const customer = await actor(), db = requireDatabase(bindings);
    const record = await readRegistration(db, customer.userId);
    if (!record) return reply({ registration: null });
    const { missing } = await registrationReadiness(db, record.answers, customer.email, record.documents, Date.now());
    return reply({ registration: { version: record.version, answers: record.answers,
      documents: Object.fromEntries(Object.entries(record.documents).map(([key, value]) => [key, { name: value.originalName }])), missing } });
  } catch (error) { return failure(error); }
}
async function save(request: Request, update: boolean) {
  if (!isTrustedMutationRequest(request)) return reply({ error: 'Cross-site requests are not allowed.' }, 403);
  try {
    const customer = await actor(), db = requireDatabase(bindings);
    if (!(await getContactVerificationStatus(db, customer)).emailVerified) return reply({ error: 'Verify your signed-in account email at /account/profile before submitting. Phone OTP is not required.', code: 'email_verification_required' }, 409);
    const rate = await consumePublicRequestRateLimit(db, request, { scope: `seller-registration:${customer.userId}`, limit: 20, windowMs: 60 * 60_000 });
    if (!rate.allowed) return rateLimitJson(rate);
    const form = await readBoundedForm(request, 26 * 1024 * 1024);
    if (form.get('email') !== customer.email) return reply({ error: 'Your signed-in account changed. Reload before submitting these details.' }, 403);
    const requestId = form.get('requestId');
    if (typeof requestId !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(requestId)) return reply({ error: 'A registration request reference is required.' }, 400);
    if (form.get('website')) return reply({ error: 'The application could not be accepted.' }, 400);
    const digest = await digestMultipartRequest(form);
    const replay = await formRequestReplay(db, { formId: 'seller.application', requestId, actorId: customer.userId,
      action: update ? 'seller.registration.updated' : 'seller.application.submitted', digest });
    if (replay) {
      const saved = await db.prepare('SELECT application_reference AS reference FROM seller_profiles WHERE id=? AND user_id=?').bind(replay, customer.userId).first<{ reference: string }>();
      return reply({ applicationReference: saved!.reference, dashboard: '/sell/application' });
    }
    const previous = await readRegistration(db, customer.userId);
    if (update && (!previous || Number(form.get('revision')) !== previous.version)) return reply({ error: 'Your saved details changed. Reload and review them before saving.' }, 409);
    if (!update && await db.prepare('SELECT 1 FROM seller_profiles WHERE user_id=?').bind(customer.userId).first()) return reply({ error: 'You already have a seller application. Open your dashboard to update it.', dashboard: '/sell/application' }, 409);
    let answers;
    try { answers = readOptionalRegistration(form); } catch (error) { return reply({ error: error instanceof Error ? error.message : 'Check the details you entered.' }, 400); }
    const input = optionalRegistrationInput(answers, customer.email);
    const config = await resolvePublishedForm(db, 'seller.application');
    const submitted = configuredMultipartAnswers(form, config);
    const validated = await validateSellerFormSubmission(db, 'seller.application', submitted.version, submitted.customAnswers, undefined,
      { tradingName: input.tradingName }, { deferRegistrationDescription: true, optionalRegistration: true });
    const sellerId = previous?.sellerId ?? crypto.randomUUID();
    const documents = { ...previous?.documents };
    const newDocuments: SellerApplicationDocument[] = [];
    const definitions = sellerDocumentsForApplication(input);
    const uploads: { field: string; kind: SellerApplicationDocument['kind']; file: File }[] = [];
    for (const [field, kind] of Object.entries(registrationFileKinds)) {
      const file = form.get(field);
      if (!(file instanceof File) || !file.size) continue;
      if (!definitions.some(definition => definition.field === field)) return reply({ error: 'Choose the document fields for your selected registration route.' }, 400);
      const error = validateSellerDocument(file) ?? await validateSellerDocumentContent(file);
      if (error) return reply({ error: `${field}: ${error}` }, 400);
      uploads.push({ field, kind, file });
    }
    for (const { field, kind, file } of uploads) {
      const id = crypto.randomUUID(), objectKey = `private/seller-documents/${sellerId}/${id}`;
      await requireMediaBucket(bindings).put(objectKey, file.stream(), { httpMetadata: { contentType: file.type }, customMetadata: { sellerId, documentKind: kind } });
      const document = { id, kind, objectKey, originalName: file.name.slice(0, 180), mimeType: file.type, sizeBytes: file.size };
      documents[field] = document; newDocuments.push(document);
    }
    const result = await saveRegistration(db, { userId: customer.userId, email: customer.email, sellerId, previous: update ? previous : null,
      answers, documents, newDocuments, now: Date.now(), requestId, digest, form: { versionId: validated.versionId, answers: validated.answers } });
    // A concurrent initial submission can win with another generated seller ID.
    // Delete only this attempt's bytes after confirming the persisted winner.
    if (!update && newDocuments.length) {
      const winner = await db.prepare('SELECT id FROM seller_profiles WHERE user_id=? AND application_reference=?').bind(customer.userId, result.reference).first<{ id: string }>();
      if (winner && winner.id !== sellerId) await Promise.allSettled(newDocuments.map(document => requireMediaBucket(bindings).delete(document.objectKey)));
    }
    return reply({ applicationReference: result.reference, missing: result.missing, dashboard: '/sell/application' }, update ? 200 : 201);
  } catch (error) { return failure(error); }
}
export const POST = (request: Request) => save(request, false);
export const PUT = (request: Request) => save(request, true);
