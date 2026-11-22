import { prepareCategoryImage, CategoryImageError } from './category-image-upload';
import { staffMutationGuard } from '../db/repositories/staff-mutation-guard';
import { hasOccasionImageStorage, taxonomyImageStorage, type TaxonomyKind } from './taxonomy-image-storage';

export { prepareCategoryImage, CategoryImageError } from './category-image-upload';
interface TaxonomyMedia {
  id: string;
  parentId: string | null;
  objectKey: string;
  originalName: string;
  mimeType: 'image/webp';
  sizeBytes: number;
  width: number;
  height: number;
  contentHash: string;
  createdBy: string;
  requestId: string;
  createdAt: number;
}
const columns = (parent: string) => `m.id,m.${parent} AS parentId,m.object_key AS objectKey,m.original_name AS originalName,
  m.mime_type AS mimeType,m.size_bytes AS sizeBytes,m.width,m.height,m.content_hash AS contentHash,
  m.created_by AS createdBy,m.request_id AS requestId,m.created_at AS createdAt`;

function requestReference(value: string) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{3,119}$/.test(value)) throw new CategoryImageError('A valid upload request reference is required.');
  return value;
}

export async function uploadTaxonomyImage(db: D1Database, bucket: R2Bucket, options: {
  kind: TaxonomyKind; file: File; actorId: string; requestId: string; now: number;
}): Promise<TaxonomyMedia> {
  const { kind } = options;
  if (kind === 'occasion' && !await hasOccasionImageStorage(db))
    throw new CategoryImageError('Occasion images will be available after the database update.');
  const { media, parent } = taxonomyImageStorage[kind];
  const requestId = requestReference(options.requestId);
  const authority = await staffMutationGuard(db, options.actorId, 'catalog.manage', CategoryImageError);
  const prepared = await prepareCategoryImage(options.file).catch((error: unknown) => {
    if (kind === 'occasion' && error instanceof CategoryImageError)
      throw new CategoryImageError(error.message.replace(/category/gi, kind));
    throw error;
  });
  const prior = () => db.prepare(`SELECT ${columns(parent)} FROM ${media} m WHERE m.created_by=? AND m.request_id=?`)
    .bind(options.actorId, requestId).first<TaxonomyMedia>();
  const replay = (media: TaxonomyMedia) => {
    if (media.contentHash !== prepared.contentHash || media.originalName !== prepared.originalName)
      throw new CategoryImageError('Upload request reference was already used for a different image.');
    return media;
  };
  const existing = await prior();
  if (existing) return replay(existing);
  const id = crypto.randomUUID();
  const objectKey = `private/${kind}-images/${id}`;
  await bucket.put(objectKey, prepared.bytes, { httpMetadata: { contentType: 'image/webp' }, customMetadata: { purpose: `${kind}-image`, mediaId: id } });
  try {
    await db.batch([
      ...authority.statements,
      db.prepare(`INSERT INTO ${media}(id,${parent},object_key,original_name,mime_type,size_bytes,width,height,content_hash,created_by,request_id,created_at)
        VALUES (?,NULL,?,?,'image/webp',?,?,?,?,?,?,?)`).bind(id, objectKey, prepared.originalName, prepared.bytes.byteLength,
        prepared.width, prepared.height, prepared.contentHash, options.actorId, requestId, options.now),
      db.prepare(`INSERT INTO audit_logs(id,actor_id,action,subject_type,subject_id,reason,next_json,request_id,created_at)
        VALUES (?,?,?,?,?,?,?,?,?)`)
        .bind(crypto.randomUUID(), options.actorId, `catalog.${kind}.image_uploaded`, media, id,
          `Uploaded ${kind} image awaiting catalogue save`, JSON.stringify({ mimeType: 'image/webp', contentHash: prepared.contentHash }),
          `${kind}-media-upload:${options.actorId}:${requestId}`, options.now),
    ]);
    return { id, parentId: null, objectKey, originalName: prepared.originalName, mimeType: 'image/webp', sizeBytes: prepared.bytes.byteLength,
      width: prepared.width, height: prepared.height, contentHash: prepared.contentHash, createdBy: options.actorId, requestId, createdAt: options.now };
  } catch (error) {
    await bucket.delete(objectKey);
    const concurrent = await prior();
    if (concurrent) return replay(concurrent);
    throw error;
  }
}

export async function taxonomyMediaForAdmin(db: D1Database, kind: TaxonomyKind, id: string, actorId: string) {
  if (kind === 'occasion' && !await hasOccasionImageStorage(db)) return null;
  const { media, parent } = taxonomyImageStorage[kind];
  return db.prepare(`SELECT ${columns(parent)} FROM ${media} m WHERE m.id=? AND (m.created_by=? OR m.${parent} IS NOT NULL)`)
    .bind(id, actorId).first<TaxonomyMedia>();
}

export async function publishedTaxonomyMedia(db: D1Database, kind: TaxonomyKind, id: string) {
  if (kind === 'occasion' && !await hasOccasionImageStorage(db)) return null;
  const { media, parent, table, assignments } = taxonomyImageStorage[kind];
  return db.prepare(`SELECT ${columns(parent)} FROM ${media} m
    JOIN ${assignments} a ON a.media_id=m.id AND a.${parent}=m.${parent}
    JOIN ${table} t ON t.id=a.${parent} WHERE m.id=? AND t.is_active=1`).bind(id).first<TaxonomyMedia>();
}

export function taxonomyImageNotFound(kind: TaxonomyKind) {
  const label = kind === 'category' ? 'Category' : 'Occasion';
  return Response.json({ error: `${label} image was not found.` }, { status: 404, headers: { 'Cache-Control': 'no-store' } });
}

export async function taxonomyImageResponse(media: TaxonomyMedia | null, bucket: R2Bucket, kind: TaxonomyKind): Promise<Response> {
  if (!media || media.mimeType !== 'image/webp' || media.objectKey !== `private/${kind}-images/${media.id}`)
    return taxonomyImageNotFound(kind);
  const object = await bucket.get(media.objectKey);
  if (!object) return taxonomyImageNotFound(kind);
  return new Response(object.body, { headers: { 'Content-Type': 'image/webp', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store', ETag: object.httpEtag } });
}
