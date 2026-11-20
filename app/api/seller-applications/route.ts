import { validateSellerDocumentContent } from '@/lib/documents/document-content';
import { requireSellerTermsApi, SellerTermsAuthorizationError } from '@/lib/auth/seller-commercial-access';
import { parseCurrentSellerApplication, pendingPayoutReference } from '@/lib/sellers/onboarding';
import { getContactVerificationStatus } from '@/lib/auth/contact-verification';
import { getRegisteredSellerTerms, SellerCommissionTermsChangedError } from '@/lib/db/repositories/marketplace-settings';
import { getManagedMakerApplicationTerms, ManagedMakerTermsChangedError } from '@/lib/db/repositories/managed-maker-details';
import { CommissionRateUnavailableError } from '@/lib/db/repositories/business-settings';
import { MANAGED_SUPPLIER_AGREEMENT_VERSION } from '@/lib/sellers/managed-identity';
import { readBoundedForm, BodyTooLargeError } from '@/lib/http/bounded-body';
import { env } from 'cloudflare:workers';
import { getCustomerUser, CustomerAuthorizationError } from '@/lib/auth/customer';

import { requireDatabase, requireMediaBucket } from '@/lib/db/d1';
import { createCurrentSellerApplication as createSellerApplication } from '@/lib/db/repositories/seller-applications';
import { isTrustedMutationRequest } from '@/lib/http/request-security';
import { configuredMultipartAnswers, digestMultipartRequest, FormRequestConflictError,
  formRequestReplay, validateSellerFormSubmission, validateSellerMultipartStructure } from '@/lib/forms/submission';
import { FormRuntimeError, resolvePublishedForm } from '@/lib/forms/runtime';
import { FormValidationError } from '@/lib/forms/validation';
import { consumePublicRequestRateLimit as consumeRequestRateLimit, rateLimitJson } from '@/lib/http/rate-limit';
import { validateProductVideo } from '@/lib/media/product-video';
import {
  validateProductImage,
  validateProductImageContent,
} from '@/lib/products/submission';
import {
  createSellerApplicationReference,
  maximumApplicationBytes,
  parseSellerApplication,
  sellerDocumentsForApplication,
  type SellerApplicationDocument,
  type SellerProfileMediaUpload,
  validateSellerDocument,

} from '@/lib/sellers/application';

export const dynamic = 'force-dynamic';

function json(body: unknown, status: number): Response {
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

export async function POST(request: Request): Promise<Response> {
  if (!isTrustedMutationRequest(request))
    return json({ error: 'Cross-site requests are not allowed.' }, 403);
  let commercialActorId: string;
  try { commercialActorId=(await requireSellerTermsApi()).userId; }
  catch (error) {
    if (error instanceof SellerTermsAuthorizationError) return json({error:error.message},error.status);
    return json({error:'Seller registration access could not be verified.'},503);
  }
  const bindings = env as unknown as { DB?: D1Database; MEDIA?: R2Bucket };
  const database = requireDatabase(bindings);
  const rateLimit = await consumeRequestRateLimit(database, request, {
    scope: 'seller-application', limit: 5, windowMs: 60 * 60_000,
  });
  if (!rateLimit.allowed) return rateLimitJson(rateLimit);
  const contentLength = Number(request.headers.get('content-length') ?? 0);
  if (contentLength > maximumApplicationBytes) {
    return json({ error: 'The application upload is too large.' }, 413);
  }

  let formData: FormData;
  try {
    formData = await readBoundedForm(request, maximumApplicationBytes);
  } catch (error) {
    if (error instanceof BodyTooLargeError) return json({ error: error.message }, 413);
    return json({ error: 'The application form could not be read.' }, 400);
  }
  try { validateSellerMultipartStructure(formData, 'seller.application'); }
  catch (error) {
    if (error instanceof FormValidationError) return json({ error: error.message }, 400);
    throw error;
  }

  // Recover exact retained submissions before enforcing new application requirements.
  let parsed = parseSellerApplication(formData, { deferDashboardFields: true });
  if (!parsed.input) {
    return json({ error: parsed.errors[0], errors: parsed.errors }, 400);
  }

  let customer;
  try {
    customer = await getCustomerUser();
  } catch (error) {
    if (error instanceof CustomerAuthorizationError) return json({ error: error.message }, error.status);
    throw error;
  }
  if (!customer) return json({error:'Sign in before submitting a seller application.'},401);
  if (customer.userId!==commercialActorId) return json({error:'Seller registration account changed. Sign in again.'},403);
  if (customer && parsed.input.email.toLowerCase() !== customer.email.toLowerCase()) {
    return json({ error: 'Use your signed-in account email for this application. To apply with a different account, sign in to that account first.' }, 409);
  }
  const existing = !customer ? await database.prepare('SELECT id FROM users WHERE lower(email) = ? LIMIT 1')
    .bind(parsed.input.email.toLowerCase()).first<{ id: string }>() : null;
  const rawRequestId = formData.getAll('requestId');
  if (rawRequestId.length !== 1 || typeof rawRequestId[0] !== 'string' ||
    !/^[a-zA-Z0-9_-]{1,100}$/.test(rawRequestId[0]))
    return json({ error: 'A valid application request reference is required.' }, 400);
  const requestId = rawRequestId[0];
  let requestDigest: string;
  try {
    requestDigest = await digestMultipartRequest(formData);
    const replayActor = customer?.userId ?? existing?.id;
    if (replayActor) {
      const replay = await formRequestReplay(database, { formId: 'seller.application', requestId,
        actorId: replayActor, action: 'seller.application.submitted', digest: requestDigest });
      if (replay) {
        const prior = await database.prepare('SELECT application_reference AS reference FROM seller_profiles WHERE id=? AND user_id=? LIMIT 1')
          .bind(replay, replayActor).first<{ reference: string }>();
        if (!prior) return json({ error: 'Application replay state is unavailable.' }, 503);
        return json({ applicationReference: prior.reference, status: 'submitted',
          message: 'Your seller application has been received for review.' }, 201);
      }
    }
  } catch (error) {
    if (error instanceof ManagedMakerTermsChangedError) return json({ error: error.message }, 409);
    if (error instanceof FormRequestConflictError) return json({ error: error.message, code: 'request_id_conflict' }, 409);
    return json({ error: 'The application replay state is unavailable.' }, 503);
  }
  if (existing) return json({ error: 'Sign in with this email before applying to sell, then return to this form.' }, 409);
  parsed = parseCurrentSellerApplication(formData);
  if (!parsed.input) return json({ error: parsed.errors[0], errors: parsed.errors }, 400);
  if (parsed.input.participationRoute === 'registered_seller' &&
      formData.get('applicationAcknowledgement') !== 'yes') {
    return json({ error: 'Acknowledge the Prohibited & Restricted Products Policy before submitting.' }, 400);
  }
  const contacts = await getContactVerificationStatus(database, customer);
  if (!contacts.emailVerified)
    return json({ error: 'Verify your account email at /account/profile, then return here to submit. Your contact phone does not require OTP verification.', code: 'email_verification_required' }, 409);
  let registeredAgreementContext: string | undefined;
  try {
    if (parsed.input.participationRoute === 'registered_seller') {
      const shown=formData.getAll('sellerAgreementContext');
      if (shown.length!==1 || typeof shown[0]!=='string' || !/^[a-f0-9]{64}$/.test(shown[0])) return json({error:'Reload and review the current seller commission terms.'},400);
      registeredAgreementContext=shown[0];
      const current=await getRegisteredSellerTerms(database);
      if (registeredAgreementContext!==current.context) return json({error:'Seller commission terms have changed. Reload and review the current terms.'},409);
    } else {
      // Check only this route before private uploads. The repository still binds and
      // transactionally guards the exact displayed context and setting source IDs.
      await getManagedMakerApplicationTerms(database,Date.now(),MANAGED_SUPPLIER_AGREEMENT_VERSION);
    }
  } catch (error) {
    if (!(error instanceof CommissionRateUnavailableError)) throw error;
    return json({error:'The selected application route terms are unavailable. Please return when published terms are effective.'},503);
  }
  let form;
  try {
    const config = await resolvePublishedForm(database, 'seller.application');
    const submitted = configuredMultipartAnswers(formData, config);
    form = await validateSellerFormSubmission(database, 'seller.application', submitted.version,
      submitted.customAnswers, undefined, { tradingName: parsed.input.tradingName,
        businessDescription: parsed.input.businessDescription }, { deferRegistrationDescription: true });
  } catch (error) {
    if (error instanceof FormRuntimeError) return json({ error: error.message, code: error.code }, error.code === 'stale_version' ? 409 : 503);
    if (error instanceof FormValidationError) return json({ error: error.message, fieldId: error.fieldId }, 400);
    return json({ error: 'The application form configuration is unavailable.' }, 503);
  }

  const files: Array<{ file: File; kind: SellerApplicationDocument['kind'] }> =
    [];
  const fileErrors: string[] = [];

  for (const definition of sellerDocumentsForApplication(parsed.input)) {
    const value = formData.get(definition.field);
    if (!(value instanceof File) || value.size === 0) {
      if (definition.required)
        fileErrors.push(`${definition.label} is required.`);
      continue;
    }

    const validationError =
      validateSellerDocument(value) ??
      (await validateSellerDocumentContent(value));
    if (validationError) {
      fileErrors.push(`${definition.label}: ${validationError}`);
      continue;
    }

    const kind = definition.kind;
    files.push({ file: value, kind });
  }

  if (fileErrors.length > 0) {
    return json({ error: fileErrors[0], errors: fileErrors }, 400);
  }

  const profileMediaFiles: Array<{
    file: File;
    kind: SellerProfileMediaUpload['kind'];
  }> = [];
  const profileImage = formData.get('profileImage');
  if (profileImage instanceof File && profileImage.size || formData.get('makerVideo') instanceof File && (formData.get('makerVideo') as File).size)
    return json({ error: 'Add your photo and video from the public maker profile in your dashboard after registration.' }, 400);
  if (profileImage instanceof File && profileImage.size > 0) {
    const error = validateProductImage(profileImage) ?? await validateProductImageContent(profileImage);
    if (error) fileErrors.push(`Logo or maker photograph: ${error}`);
    else profileMediaFiles.push({ file: profileImage, kind: 'profile_image' });
  }
  const makerVideo = formData.get('makerVideo');
  if (makerVideo instanceof File && makerVideo.size > 0) {
    const error = await validateProductVideo(makerVideo);
    if (error) fileErrors.push(`Maker introduction video: ${error}`);
    else profileMediaFiles.push({ file: makerVideo, kind: 'maker_video' });
  }
  if (fileErrors.length > 0) return json({ error: fileErrors[0], errors: fileErrors }, 400);

  const bucket = files.length > 0 || profileMediaFiles.length > 0
    ? requireMediaBucket(bindings)
    : null;
  const userId = customer?.userId ?? crypto.randomUUID();
  const sellerId = crypto.randomUUID();
  const applicationReference = createSellerApplicationReference();
  let savedReference = applicationReference;
  const uploadedKeys: string[] = [];
  const documents: SellerApplicationDocument[] = [];
  const profileMedia: SellerProfileMediaUpload[] = [];
  let mutationAttempted=false;

  try {
    for (const { file, kind } of files) {
      const documentId = crypto.randomUUID();
      const objectKey = `private/seller-documents/${sellerId}/${documentId}`;
      await bucket!.put(objectKey, file.stream(), {
        httpMetadata: { contentType: file.type },
        customMetadata: { sellerId, documentKind: kind,
          ...(kind==='bank_verification' && parsed.input.onboarding ? { submittedPayout:pendingPayoutReference(parsed.input.onboarding) } : {}) },
      });
      uploadedKeys.push(objectKey);
      documents.push({
        id: documentId,
        kind,
        objectKey,
        originalName: file.name.slice(0, 180),
        mimeType: file.type,
        sizeBytes: file.size,
      });
    }

    for (const { file, kind } of profileMediaFiles) {
      const mediaId = crypto.randomUUID();
      const objectKey = `private/seller-profile/${sellerId}/${mediaId}`;
      await bucket!.put(objectKey, file.stream(), {
        httpMetadata: { contentType: file.type },
        customMetadata: { sellerId, makerProfileKind: kind },
      });
      uploadedKeys.push(objectKey);
      profileMedia.push({
        id: mediaId,
        kind,
        objectKey,
        originalName: file.name.slice(0, 180),
        mimeType: file.type,
        sizeBytes: file.size,
      });
    }

    mutationAttempted=true;
    const committedSellerId = await createSellerApplication(database, {
      userId,
      existingAccount: Boolean(customer),
      registeredAgreementContext,
      sellerId,
      applicationReference,
      input: parsed.input,
      documents,
      profileMedia,
      now: Date.now(),
      form: { requestId, versionId: form.versionId, answers: form.answers, digest: requestDigest! },
    });
    if (committedSellerId !== sellerId) {
      const winner = await database.prepare(`SELECT application_reference AS reference FROM seller_profiles
        WHERE id = ? AND lower(support_email) = ? LIMIT 1`)
        .bind(committedSellerId, parsed.input.email.trim().toLowerCase()).first<{ reference: string }>();
      if (!winner) throw new Error('Application replay state is unavailable.');
      if (bucket) await Promise.all(uploadedKeys.map((key) => bucket.delete(key)));
      savedReference = winner.reference;
    }
  } catch (error) {
    // A lost commit/replay response cannot prove that these private objects are unused.
    // Retain them for exact recovery once a database mutation has been attempted.
    if (bucket && !mutationAttempted) await Promise.allSettled(uploadedKeys.map((key) => bucket.delete(key)));
    if (error instanceof CommissionRateUnavailableError)
      return json({error:'The selected application route terms are unavailable. Please return when published terms are effective.'},503);
    if (error instanceof SellerCommissionTermsChangedError || registeredAgreementContext && (await getRegisteredSellerTerms(database)).context!==registeredAgreementContext)
      return json({error:'Seller commission terms have changed. Reload and review the current terms.'},409);
    const message = error instanceof Error ? error.message : '';
    if (/UNIQUE constraint failed|Duplicate entry/i.test(message)) {
      return json(
        {
          error:
            'An application already exists for this email, phone, registration, or tax number.',
        },
        409,
      );
    }
    if (error instanceof ManagedMakerTermsChangedError) return json({ error: error.message }, 409);
    if (error instanceof FormRequestConflictError) return json({ error: error.message, code: 'request_id_conflict' }, 409);
    return json(
      { error: 'The application could not be saved. Please try again.' },
      500,
    );
  }

  return json(
    {
      applicationReference: savedReference,
      status: 'submitted',
      message: 'Your seller application has been received for review.',
    },
    201,
  );
}
