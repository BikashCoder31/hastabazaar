import { env } from 'cloudflare:workers';
import {protectedRegistrationFields} from '@/lib/sellers/registration-protection';
import {assertCustomerIntent} from '@/lib/auth/customer-intent';
import { requireSellerCenterApi, SellerCenterAuthorizationError } from '@/lib/auth/seller-center';
import { requireExistingCustomerApi, CustomerAuthorizationError } from '@/lib/auth/customer';
import { ContactVerificationError } from '@/lib/auth/contact-verification';
import { requireDatabase, requireMediaBucket } from '@/lib/db/d1';
import { isTrustedMutationRequest } from '@/lib/http/request-security';
import { readBoundedForm, BodyTooLargeError } from '@/lib/http/bounded-body';
import { consumePublicRequestRateLimit, rateLimitJson } from '@/lib/http/rate-limit';
import { resolvePublishedForm, FormRuntimeError } from '@/lib/forms/runtime';
import { FormValidationError } from '@/lib/forms/validation';
import { configuredMultipartAnswers, digestMultipartRequest, formRequestReplay, validateSellerFormSubmission, FormRequestConflictError } from '@/lib/forms/submission';
import { readOptionalRegistration, optionalRegistrationInput, registrationFileKinds } from '@/lib/sellers/registration-intake';
import { readRegistration, saveRegistration, RegistrationError, readRegistrationOwnerState, readRegistrationProgress } from '@/lib/sellers/registration-store';
import { sellerDocumentsForApplication, validateSellerDocument, type SellerApplicationDocument } from '@/lib/sellers/application';
import { CommissionRateUnavailableError } from '@/lib/db/repositories/business-settings';
import { getRegisteredSellerTerms } from '@/lib/db/repositories/marketplace-settings';
import { getManagedMakerApplicationTerms } from '@/lib/db/repositories/managed-maker-details';
import { MANAGED_SUPPLIER_AGREEMENT_VERSION } from '@/lib/sellers/managed-identity';
import { validateSellerDocumentContent } from '@/lib/documents/document-content';
import {
  hasVerifiedRegistrationEmail, normalizeSellerRegistrationEmail, savedSellerRegistrationEmail,
} from '@/lib/sellers/registration-email';

export const dynamic = 'force-dynamic';
const bindings = env as unknown as { DB?: D1Database; MEDIA?: R2Bucket };
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
function failure(error: unknown) {
  if (error instanceof RegistrationError || error instanceof CustomerAuthorizationError || error instanceof SellerCenterAuthorizationError || error instanceof ContactVerificationError) return reply({ error: error.message }, error.status);
  if (error instanceof FormRuntimeError) return reply({ error: error.message, code: error.code }, error.code === 'stale_version' ? 409 : 503);
  if (error instanceof CommissionRateUnavailableError) return reply({ error: 'Current agreement terms are unavailable. Save your progress and try again later.' }, 503);
  if (error instanceof FormRequestConflictError) return reply({ error: error.message, code: 'request_id_conflict' }, 409);
  if (error instanceof FormValidationError) return reply({ error: error.message }, 400);
  if (error instanceof BodyTooLargeError) return reply({ error: 'Registration documents are too large.' }, 413);
  return reply({ error: 'Registration could not be confirmed saved. Keep this page open and retry, or check your dashboard.' }, 503);
}
async function actor(request?:Request) {
  const [viewer, customer] = await Promise.all([requireSellerCenterApi(), requireExistingCustomerApi()]);
  if (viewer.userId !== customer.userId) throw new RegistrationError('The signed-in account changed.', 403);
  if(request)assertCustomerIntent(request,customer.userId);
  return customer;
}
export async function GET(request?:Request) {
  try {
    const customer = await actor(request), db = requireDatabase(bindings);
    const record = await readRegistration(db, customer.userId);
    if (!record) return reply({ registration: null });
    const [profile, { missing, lockedKinds }] = await Promise.all([
      readRegistrationOwnerState(db, record.sellerId, customer.userId),
      readRegistrationProgress(db, record, customer.email, Date.now()),
    ]);
    const current = await actor(request);
    if (current.userId !== customer.userId || current.email !== customer.email || !profile) throw new RegistrationError('The signed-in account changed. Reload before reading your registration.',403);
    return reply({ registration: { version: record.version, answers: record.answers,
      editable: profile.editable, approvedCompletion: profile.approved || profile.approvedManaged,
      lockedFields: protectedRegistrationFields(lockedKinds), lockedDocumentKinds: lockedKinds,
      documents: Object.fromEntries(Object.entries(record.documents).map(([key, value]) => [key, { name: value.originalName }])), missing } });
  } catch (error) { return failure(error); }
}
async function save(request: Request, update: boolean) {
  if (!isTrustedMutationRequest(request)) return reply({ error: 'Cross-site requests are not allowed.' }, 403);
  try {
    const customer = await actor(request), db = requireDatabase(bindings);
    const rate = await consumePublicRequestRateLimit(db, request, { scope: `seller-registration:${customer.userId}`, limit: 20, windowMs: 60 * 60_000 });
    if (!rate.allowed) return rateLimitJson(rate);
    const form = await readBoundedForm(request, 26 * 1024 * 1024);
    const verificationEmail = normalizeSellerRegistrationEmail(form.get('email'));
    if (!verificationEmail) return reply({ error: 'Enter a valid seller registration email.' }, 400);
    const previous = await readRegistration(db, customer.userId);
    if (!await hasVerifiedRegistrationEmail(db, customer, verificationEmail, savedSellerRegistrationEmail(previous?.answers))) {
      return reply({ error: 'Verify the selected seller registration email before submitting. Phone OTP is not required.', code: 'email_verification_required' }, 409);
    }
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
    if (update && (!previous || Number(form.get('revision')) !== previous.version)) return reply({ error: 'Your saved details changed. Reload and review them before saving.' }, 409);
    const profile = previous && update ? await readRegistrationOwnerState(db, previous.sellerId, customer.userId) : null;
    if (update && !profile?.editable) return reply({ error: 'Current registration access is required to save these details.' }, 403);
    if (!update && await db.prepare('SELECT 1 FROM seller_profiles WHERE user_id=?').bind(customer.userId).first()) return reply({ error: 'You already have a seller application. Open your dashboard to update it.', dashboard: '/sell/application' }, 409);
    let answers;
    try { answers = readOptionalRegistration(form); } catch (error) { return reply({ error: error instanceof Error ? error.message : 'Check the details you entered.' }, 400); }
    const input = optionalRegistrationInput(answers, customer.email);
    const now = Date.now();
    if (!update) {
      const registered = input.participationRoute === 'registered_seller';
      const acceptanceField = registered ? 'acceptedTerms' : 'managedAgreementAccepted';
      const contextField = registered ? 'sellerAgreementContext' : 'managedAgreementContext';
      if (form.get(acceptanceField) !== 'yes' || form.get('applicationAcknowledgement') !== 'yes') {
        const error = registered
          ? 'Accept the Seller Marketplace Agreement and the Prohibited & Restricted Products Policy before submitting.'
          : 'Accept the Managed Supplier/Maker Agreement and confirm the commercial review acknowledgement before submitting.';
        return reply({ error }, 400);
      }
      const terms = await (registered
        ? getRegisteredSellerTerms(db, now)
        : getManagedMakerApplicationTerms(db, now, MANAGED_SUPPLIER_AGREEMENT_VERSION));
      if (form.get(contextField) !== terms.context ||
          (!registered && form.get('managedAgreementVersion') !== MANAGED_SUPPLIER_AGREEMENT_VERSION)) {
        return reply({ error: 'Reload and accept the current agreement terms before submitting.' }, 409);
      }
    }
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
    const current = await actor(request);
    if (current.userId !== customer.userId || current.email !== customer.email || current.authSubject !== customer.authSubject) throw new RegistrationError('The signed-in account changed. Reload before saving your registration.', 403);
    const result = await saveRegistration(db, { userId: customer.userId, email: customer.email, sellerId, previous: update ? previous : null,
      verificationEmail, answers, documents, newDocuments, now: update ? Date.now() : now, requestId, digest, form: { versionId: validated.versionId, answers: validated.answers } });
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
