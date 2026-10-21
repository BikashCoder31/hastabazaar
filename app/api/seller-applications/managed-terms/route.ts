import { requireSellerTermsApi, SellerTermsAuthorizationError } from '@/lib/auth/seller-commercial-access';
import { env } from 'cloudflare:workers';
import { requireDatabase } from '@/lib/db/d1';
import { getManagedMakerApplicationTerms, managedAgreementVersionForSeller } from '@/lib/db/repositories/managed-maker-details';
import {
  MANAGED_SUPPLIER_AGREEMENT_VERSION,
  managedMakerAgreementTerms,
} from '@/lib/sellers/managed-identity';
import { companyDetails } from '@/lib/content/company-details';
import { requireCustomerApi, CustomerAuthorizationError } from '@/lib/auth/customer';
import { getSellerParticipationForUser } from '@/lib/db/repositories/seller-applications';
import { acceptManagedTerms, getManagedTermsOffers, managedTermsFormId } from '@/lib/managed-commerce/accepted-terms';
import { isTrustedMutationRequest } from '@/lib/http/request-security';
import { readBoundedJsonObject } from '@/lib/http/form-json-body';
import { BodyTooLargeError } from '@/lib/http/bounded-body';
import { validateSellerFormSubmission, FormRequestConflictError } from '@/lib/forms/submission';
import { FormRuntimeError } from '@/lib/forms/runtime';
import { FormValidationError } from '@/lib/forms/validation';
export const dynamic = 'force-dynamic';
const reply = (body: unknown, status = 200) => Response.json(body, {
  status, headers: { 'Cache-Control': 'private, no-store', 'Vary': 'Cookie' },
});
export async function GET(): Promise<Response> {
  let viewer;
  try { viewer = await requireSellerTermsApi(); }
  catch (error) {
    return Response.json({error:error instanceof SellerTermsAuthorizationError ? error.message : 'Seller terms access could not be verified.'},
      {status:error instanceof SellerTermsAuthorizationError ? error.status : 503,headers:{'Cache-Control':'private, no-store','Vary':'Cookie'}});
  }
  const db = requireDatabase(env as unknown as { DB?: D1Database });
  const participation = await getSellerParticipationForUser(db, viewer.userId);
  const version = participation?.participationRoute==='managed_maker'
    ? await managedAgreementVersionForSeller(db,participation.sellerId) : MANAGED_SUPPLIER_AGREEMENT_VERSION;
  const terms = await getManagedMakerApplicationTerms(db,Date.now(),version);
  const offers = participation?.participationRoute === 'managed_maker'
    ? await getManagedTermsOffers(db, participation.sellerId, Date.now()) : null;
  return Response.json(
    {
      ...terms,
      version,
      company: companyDetails,
      terms: managedMakerAgreementTerms(terms.platformRetentionBps,version),
      offers,
    },
    { headers: { 'Cache-Control': 'private, no-store', 'Vary': 'Cookie' } },
  );
}

export async function POST(request: Request): Promise<Response> {
  if (!isTrustedMutationRequest(request)) return reply({ error: 'Cross-site requests are not allowed.' }, 403);
  try {
    const owner = await requireCustomerApi();
    const db = requireDatabase(env as unknown as { DB?: D1Database });
    const participation = await getSellerParticipationForUser(db, owner.userId);
    if (participation?.participationRoute !== 'managed_maker') return reply({ error: 'Maker application not found.' }, 404);
    const raw = await readBoundedJsonObject(request);
    const allowed = new Set(['offerId', 'context', 'language', 'accepted', 'requestId', 'formVersion', 'customAnswers']);
    if (Object.keys(raw).some(key => !allowed.has(key)) || raw.accepted !== true || raw.language !== 'en' ||
      typeof raw.offerId !== 'string' || typeof raw.context !== 'string' || typeof raw.requestId !== 'string')
      return reply({ error: 'Review and explicitly accept the displayed English terms.' }, 400);
    const form = await validateSellerFormSubmission(db, managedTermsFormId, raw.formVersion, raw.customAnswers, raw.requestId);
    const receipt = await acceptManagedTerms(db, { sellerId: participation.sellerId, actorId: owner.userId,
      offerId: raw.offerId, context: raw.context, language: 'en', requestId: raw.requestId, now: Date.now(),
      form: { versionId: form.versionId, answers: form.answers } });
    return reply({ ok: true, ...receipt,requestId:raw.requestId,sellerId:participation.sellerId,formVersion:raw.formVersion });
  } catch (error) {
    if (error instanceof CustomerAuthorizationError) return reply({ error: error.message }, error.status);
    if (error instanceof BodyTooLargeError) return reply({ error: error.message }, 413);
    if (error instanceof FormRequestConflictError) return reply({ error: error.message, code: 'request_id_conflict' }, 409);
    if (error instanceof FormRuntimeError) return reply({ error: error.message, code: error.code }, error.code === 'stale_version' ? 409 : 503);
    if (error instanceof FormValidationError) return reply({ error: error.message, fieldId: error.fieldId }, 400);
    return reply({ error: 'The terms acceptance could not be saved. Keep the request reference and try again.' }, 503);
  }
}
