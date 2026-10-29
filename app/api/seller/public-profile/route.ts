import { env } from 'cloudflare:workers';
import { requireExistingCustomerApi, CustomerAuthorizationError } from '@/lib/auth/customer';
import { requireDatabase, requireMediaBucket } from '@/lib/db/d1';
import { getSellerParticipationForUser, updateSellerParticipationPublicProfile, SellerParticipationConflictError } from '@/lib/db/repositories/seller-applications';
import { isTrustedMutationRequest } from '@/lib/http/request-security';
import { readBoundedForm, BodyTooLargeError } from '@/lib/http/bounded-body';
import { configuredMultipartAnswers, digestMultipartRequest, formRequestReplay, validateSellerFormSubmission, FormRequestConflictError } from '@/lib/forms/submission';
import { resolvePublishedForm, FormRuntimeError } from '@/lib/forms/runtime';
import { FormValidationError } from '@/lib/forms/validation';
import { parseCraftExperience, parseMakerSocialLinks } from '@/lib/sellers/participation';
import { validateProductImage, validateProductImageContent } from '@/lib/products/submission';
import { validateProductVideo } from '@/lib/media/product-video';
import { publicProfileEditableAt } from '@/lib/sellers/public-profile';
import { consumePublicRequestRateLimit, rateLimitJson } from '@/lib/http/rate-limit';
import type { SellerProfileMediaUpload } from '@/lib/sellers/application';

export const dynamic = 'force-dynamic';
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
export async function POST(request: Request) {
  if (!isTrustedMutationRequest(request)) return reply({ error: 'Cross-site requests are not allowed.' }, 403);
  try {
    const actor = await requireExistingCustomerApi(); const bindings = env as unknown as { DB?: D1Database; MEDIA?: R2Bucket };
    const db = requireDatabase(bindings); const profile = await getSellerParticipationForUser(db, actor.userId);
    if (!profile) return reply({ error: 'Seller application not found.' }, 404);
    const rate = await consumePublicRequestRateLimit(db, request, { scope: `maker-public-profile:${actor.userId}`, limit: 12, windowMs: 60 * 60_000 });
    if (!rate.allowed) return rateLimitJson(rate);
    const data = await readBoundedForm(request, 27 * 1024 * 1024);
    const allowed = new Set(['publicName', 'publicCity', 'experienceCraft', 'experienceBand', 'facebookUrl', 'instagramUrl', 'linkedinUrl', 'tiktokUrl', 'xUrl', 'youtubeUrl', 'expectedVersion', 'requestId', 'formVersion', 'profileImage', 'makerVideo']);
    for (const [key, value] of data) {
      if (!allowed.has(key) && !key.startsWith('custom.') || !key.startsWith('custom.') && data.getAll(key).length !== 1 ||
        value instanceof File && !['profileImage', 'makerVideo'].includes(key)) return reply({ error: 'Invalid public profile field.' }, 400);
    }
    const text = (key: string) => typeof data.get(key) === 'string' ? data.get(key) as string : '';
    const requestId = text('requestId');
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(requestId)) return reply({ error: 'A profile request reference is required.' }, 400);
    const digest = await digestMultipartRequest(data);
    if (await formRequestReplay(db, { formId: 'seller.maker-profile', requestId, actorId: actor.userId, action: 'seller.participation_profile.updated', subjectId: profile.sellerId, digest })) return reply({ ok: true });
    if (Date.now() < await publicProfileEditableAt(db, profile.sellerId)) return reply({ error: 'Your public maker profile can be edited again 7 days after its last save.', code: 'profile_cooldown' }, 409);
    const config = await resolvePublishedForm(db, 'seller.maker-profile'); const submitted = configuredMultipartAnswers(data, config);
    const form = await validateSellerFormSubmission(db, 'seller.maker-profile', submitted.version, submitted.customAnswers, undefined, { publicName: text('publicName'), publicCity: text('publicCity') });
    const craftExperience = parseCraftExperience(text('experienceCraft'), text('experienceBand'));
    const socialLinks = parseMakerSocialLinks({ facebook: text('facebookUrl'), instagram: text('instagramUrl'), linkedin: text('linkedinUrl'), tiktok: text('tiktokUrl'), x: text('xUrl'), youtube: text('youtubeUrl') });
    const uploads: { file: File; kind: SellerProfileMediaUpload['kind'] }[] = [];
    for (const [name, kind] of [['profileImage', 'profile_image'], ['makerVideo', 'maker_video']] as const) {
      const file = data.get(name); if (!(file instanceof File) || !file.size) continue;
      const error = name === 'profileImage' ? validateProductImage(file) ?? await validateProductImageContent(file) : await validateProductVideo(file);
      if (error) return reply({ error }, 400); uploads.push({ file, kind });
    }
    const media: SellerProfileMediaUpload[] = [];
    for (const { file, kind } of uploads) {
      const id = crypto.randomUUID(), objectKey = `private/seller-profile/${profile.sellerId}/${id}`;
      await requireMediaBucket(bindings).put(objectKey, file.stream(), { httpMetadata: { contentType: file.type }, customMetadata: { sellerId: profile.sellerId, mediaKind: kind } });
      media.push({ id, kind, objectKey, originalName: file.name.slice(0, 180), mimeType: file.type, sizeBytes: file.size });
    }
    await updateSellerParticipationPublicProfile(db, { sellerId: profile.sellerId, actorId: actor.userId, expectedVersion: Number(text('expectedVersion')),
      publicName: text('publicName'), publicCity: text('publicCity'), craftExperience, socialLinks, requestId, now: Date.now(), profileMedia: media,
      form: { requestId, versionId: form.versionId, answers: form.answers, digest } });
    return reply({ ok: true });
  } catch (error) {
    if (error instanceof CustomerAuthorizationError) return reply({ error: error.message }, error.status);
    if (error instanceof BodyTooLargeError) return reply({ error: 'Profile media is too large.' }, 413);
    if (error instanceof FormRuntimeError) return reply({ error: error.message, code: error.code }, error.code === 'stale_version' ? 409 : 503);
    if (error instanceof FormRequestConflictError) return reply({ error: error.message, code: 'request_id_conflict' }, 409);
    if (error instanceof FormValidationError || error instanceof SellerParticipationConflictError) return reply({ error: error.message }, 409);
    return reply({ error: 'Public profile could not be saved. Check the fields, or reload to confirm a previous save.' }, 400);
  }
}
