import { parseManagedMakerIdentity, MANAGED_SUPPLIER_AGREEMENT_VERSION } from '@/lib/sellers/managed-identity';
import { managedAgreementVersionForSeller } from '@/lib/db/repositories/managed-maker-details';
import { parseSellerOnboardingForm, pendingPayoutReference } from '@/lib/sellers/onboarding';
import { maximumApplicationBytes, validateSellerDocument, validateSellerDocumentContent, type SellerApplicationDocument } from '@/lib/sellers/application';
import { ManagedMakerTermsChangedError } from '@/lib/db/repositories/managed-maker-details';
import { resolvePublishedForm } from '@/lib/forms/runtime';
import { configuredMultipartAnswers, digestMultipartRequest, formRequestReplay } from '@/lib/forms/submission';
import { readBoundedJsonObject } from '@/lib/http/form-json-body';
import { env } from 'cloudflare:workers';

import { CustomerAuthorizationError, requireCustomerApi } from '@/lib/auth/customer';
import { requireDatabase, requireMediaBucket } from '@/lib/db/d1';
import {
  getSellerParticipationForUser,
  SellerParticipationConflictError,
  updateSellerParticipationPublicProfile,
} from '@/lib/db/repositories/seller-applications';
import { BodyTooLargeError, readBoundedForm } from '@/lib/http/bounded-body';
import { isTrustedMutationRequest } from '@/lib/http/request-security';
import { parseCraftExperience, parseMakerSocialLinks } from '@/lib/sellers/participation';
import { FormRequestConflictError, validateSellerFormSubmission } from '@/lib/forms/submission';
import { FormRuntimeError } from '@/lib/forms/runtime';
import { FormValidationError } from '@/lib/forms/validation';

export const dynamic = 'force-dynamic';

const reply = (body: unknown, status = 200) => Response.json(body, {
  status,
  headers: { 'Cache-Control': 'no-store' },
});

export async function PATCH(request: Request): Promise<Response> {
  if (!isTrustedMutationRequest(request)) return reply({ error: 'Cross-site requests are not allowed.' }, 403);
  try {
    const customer = await requireCustomerApi();
    const database = requireDatabase(env as unknown as { DB?: D1Database });
    const participation = await getSellerParticipationForUser(database, customer.userId);
    if (!participation) return reply({ error: 'Seller or maker application not found.' }, 404);
    const raw = await readBoundedJsonObject(request) as Record<string, unknown>;
    if (!raw || Array.isArray(raw)) return reply({ error: 'Invalid profile request.' }, 400);
    const allowed = new Set(['publicName', 'publicCity', 'experienceCraft', 'experienceBand',
      'facebookUrl', 'instagramUrl', 'linkedinUrl', 'tiktokUrl', 'xUrl', 'youtubeUrl',
      'expectedVersion', 'requestId', 'formVersion', 'customAnswers']);
    if (Object.keys(raw).some((key) => !allowed.has(key)) ||
      typeof raw.requestId !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(raw.requestId) ||
      !Number.isSafeInteger(raw.formVersion) || !Array.isArray(raw.customAnswers))
      return reply({ error: 'Invalid maker profile form request.' }, 400);
    const text = (key: string) => typeof raw[key] === 'string' ? raw[key] as string : '';
    const form = await validateSellerFormSubmission(database, 'seller.maker-profile', raw.formVersion,
      raw.customAnswers, raw.requestId, { publicName: text('publicName'), publicCity: text('publicCity') });
    const craftExperience = parseCraftExperience(text('experienceCraft'), text('experienceBand'));
    const socialLinks = parseMakerSocialLinks({
      facebook: text('facebookUrl'),
      instagram: text('instagramUrl'),
      linkedin: text('linkedinUrl'),
      tiktok: text('tiktokUrl'),
      x: text('xUrl'),
      youtube: text('youtubeUrl'),
    });
    await updateSellerParticipationPublicProfile(database, {
      sellerId: participation.sellerId,
      actorId: customer.userId,
      expectedVersion: Number(raw.expectedVersion),
      publicName: text('publicName'),
      publicCity: text('publicCity'),
      craftExperience,
      socialLinks,
      requestId: text('requestId'),
      now: Date.now(),
      form: { requestId: text('requestId'), versionId: form.versionId, answers: form.answers },
    });
    return reply({ ok: true });
  } catch (error) {
    if (error instanceof CustomerAuthorizationError) return reply({ error: error.message }, error.status);
    if (error instanceof BodyTooLargeError) return reply({ error: error.message }, 413);
    if (error instanceof SellerParticipationConflictError) return reply({ error: error.message }, 409);
    if (error instanceof FormRequestConflictError) return reply({ error: error.message, code: 'request_id_conflict' }, 409);
    if (error instanceof FormRuntimeError) return reply({ error: error.message, code: error.code }, error.code === 'stale_version' ? 409 : 503);
    if (error instanceof FormValidationError) return reply({ error: error.message, fieldId: error.fieldId }, 400);
    return reply({ error: error instanceof Error ? error.message : 'The maker profile could not be saved.' }, 400);
  }
}

/** Evidence corrections use the existing owned maker-profile flow and form publication. */
export async function POST(request: Request): Promise<Response> {
  if (!isTrustedMutationRequest(request)) return reply({ error: 'Cross-site requests are not allowed.' },403);
  const uploaded: string[] = [];
  let bucket: R2Bucket | undefined;
  let mutationCompleted = false;
  let mutationAttempted = false;
  try {
    const customer = await requireCustomerApi();
    const bindings = env as unknown as { DB?: D1Database; MEDIA?: R2Bucket };
    const database = requireDatabase(bindings);
    const participation = await getSellerParticipationForUser(database,customer.userId);
    if (!participation || participation.participationRoute !== 'managed_maker') return reply({ error:'Managed Maker application not found.' },404);
    const data = await readBoundedForm(request, maximumApplicationBytes);
    const allowed = new Set(['publicName','publicCity','experienceCraft','experienceBand','facebookUrl','instagramUrl','linkedinUrl',
      'tiktokUrl','xUrl','youtubeUrl','requestId','expectedVersion','formVersion','governmentIdType','governmentIdDescription',
      'personalPan','managedAgreementAccepted','managedAgreementVersion','managedAgreementContext','representativeIdentity','personalPanCertificate',
      'bankVerification','payoutBeneficiary','bankName','bankBranch','bankAccountNumber','pickupAddress','returnAddress']);
    const seen = new Set<string>();
    for (const [key,value] of data) {
      if (!allowed.has(key) && !key.startsWith('custom.')) throw new Error('Unknown maker correction control.');
      if (seen.has(key) && !key.startsWith('custom.')) throw new Error('Duplicate maker correction control.');
      seen.add(key);
      if (!key.startsWith('custom.')) {
        const isFile = key==='representativeIdentity'||key==='personalPanCertificate'||key==='bankVerification';
        if (isFile ? !(value instanceof File) && value!=='' : value instanceof File) throw new Error('Invalid maker correction control value.');
      }
    }
    const text = (key: string) => { const value = data.get(key); return typeof value === 'string' ? value.trim() : ''; };
    const requestId = text('requestId');
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(requestId)) throw new Error('A stable correction request reference is required.');
    const digest = await digestMultipartRequest(data);
    if (await formRequestReplay(database,{formId:'seller.maker-profile',requestId,actorId:customer.userId,
      action:'seller.participation_profile.updated',subjectId:participation.sellerId,digest})) return reply({ok:true});
    if (participation.applicationStage !== 'changes_requested') return reply({error:'Evidence corrections require a changes-requested application.'},409);
    const identity = parseManagedMakerIdentity(data);
    const contractVersion = await managedAgreementVersionForSeller(database,participation.sellerId);
    if (contractVersion===MANAGED_SUPPLIER_AGREEMENT_VERSION && (identity.managedAgreementVersion!==contractVersion || !/^\d{9}$/.test(identity.personalPan)))
      throw new Error('Keep the current supplier agreement and required personal PAN when correcting this application.');
    const onboarding = contractVersion===MANAGED_SUPPLIER_AGREEMENT_VERSION ? parseSellerOnboardingForm(data) : undefined;
    const config = await resolvePublishedForm(database,'seller.maker-profile');
    const submitted = configuredMultipartAnswers(data,config);
    const form = await validateSellerFormSubmission(database,'seller.maker-profile',submitted.version,submitted.customAnswers,requestId,
      {publicName:text('publicName'),publicCity:text('publicCity')});
    const files: Array<{file: File;kind: SellerApplicationDocument['kind']}> = [];
    for (const [field,kind] of [['representativeIdentity','representative_identity'],['personalPanCertificate','pan_certificate'],...(onboarding ? [['bankVerification','bank_verification']] as const : [])] as const) {
      const file=data.get(field);
      if (!(file instanceof File)||file.size===0) {
        if (field==='representativeIdentity'||contractVersion===MANAGED_SUPPLIER_AGREEMENT_VERSION) throw new Error('Government ID and the required personal PAN certificate must be supplied.');
        continue;
      }
      const error=validateSellerDocument(file) ?? await validateSellerDocumentContent(file);
      if (error) throw new Error(error);
      files.push({file,kind});
    }
    bucket=requireMediaBucket(bindings);
    const documents: SellerApplicationDocument[]=[];
    for (const {file,kind} of files) {
      const id=crypto.randomUUID(),objectKey=`private/seller-documents/${participation.sellerId}/${id}`;
      await bucket.put(objectKey,file.stream(),{httpMetadata:{contentType:file.type},customMetadata:{sellerId:participation.sellerId,documentKind:kind,
        ...(kind==='bank_verification'&&onboarding ? {submittedPayout:pendingPayoutReference(onboarding)} : {})}});
      uploaded.push(objectKey);
      documents.push({id,kind,objectKey,originalName:file.name.slice(0,180),mimeType:file.type,sizeBytes:file.size});
    }
    mutationAttempted=true;
    await updateSellerParticipationPublicProfile(database,{sellerId:participation.sellerId,actorId:customer.userId,
      expectedVersion:Number(text('expectedVersion')),publicName:text('publicName'),publicCity:text('publicCity'),
      craftExperience:parseCraftExperience(text('experienceCraft'),text('experienceBand')),
      socialLinks:parseMakerSocialLinks({facebook:text('facebookUrl'),instagram:text('instagramUrl'),linkedin:text('linkedinUrl'),
        tiktok:text('tiktokUrl'),x:text('xUrl'),youtube:text('youtubeUrl')}),requestId,now:Date.now(),
      managedCorrection:{identity,documents,onboarding},form:{requestId,versionId:form.versionId,answers:form.answers,digest}});
    mutationCompleted = true;
    for (const document of documents) {
      const saved=await database.prepare('SELECT id FROM seller_documents WHERE id=? AND seller_id=?').bind(document.id,participation.sellerId).first();
      if (!saved) await bucket.delete(document.objectKey);
    }
    return reply({ok:true});
  } catch(error) {
    // The repository has confirmed the durable action (or its exact replay).
    // A later read/temporary-object cleanup failure must never remove committed evidence.
    if (mutationCompleted) return reply({ok:true});
    // An uncertain commit may already reference the new private evidence. Preserve it for exact replay.
    if (bucket && !mutationAttempted) await Promise.allSettled(uploaded.map(key=>bucket!.delete(key)));
    if (error instanceof CustomerAuthorizationError) return reply({error:error.message},error.status);
    if (error instanceof BodyTooLargeError) return reply({error:error.message},413);
    if (error instanceof FormRuntimeError) return reply({error:error.message,code:error.code},error.code==='stale_version'?409:503);
    if (error instanceof FormRequestConflictError) return reply({error:error.message,code:'request_id_conflict'},409);
    if (error instanceof ManagedMakerTermsChangedError || error instanceof SellerParticipationConflictError) return reply({error:error.message},409);
    return reply({error:error instanceof Error?error.message:'The maker correction could not be saved.'},400);
  }
}
