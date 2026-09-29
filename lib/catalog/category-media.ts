import { prepareCategoryImage, CategoryImageError } from './category-image-upload';
import { staffMutationGuard } from '../db/repositories/staff-mutation-guard';

export { prepareCategoryImage, CategoryImageError } from './category-image-upload';
export interface CategoryMedia {
  id: string;
  categoryId: string | null;
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
const columns = `m.id,m.category_id AS categoryId,m.object_key AS objectKey,m.original_name AS originalName,
  m.mime_type AS mimeType,m.size_bytes AS sizeBytes,m.width,m.height,m.content_hash AS contentHash,
  m.created_by AS createdBy,m.request_id AS requestId,m.created_at AS createdAt`;

function requestReference(value: string) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{3,119}$/.test(value)) throw new CategoryImageError('A valid upload request reference is required.');
  return value;
}

export async function uploadCategoryImage(db: D1Database, bucket: R2Bucket, options: {
  file: File; actorId: string; requestId: string; now: number;
}): Promise<CategoryMedia> {
  const requestId = requestReference(options.requestId);
  const authority = await staffMutationGuard(db, options.actorId, 'catalog.manage', CategoryImageError);
  const prepared = await prepareCategoryImage(options.file);
  const prior = () => db.prepare(`SELECT ${columns} FROM category_media m WHERE m.created_by=? AND m.request_id=?`)
    .bind(options.actorId, requestId).first<CategoryMedia>();
  const replay = (media: CategoryMedia) => {
    if (media.contentHash !== prepared.contentHash || media.originalName !== prepared.originalName)
      throw new CategoryImageError('Upload request reference was already used for a different image.');
    return media;
  };
  const existing = await prior();
  if (existing) return replay(existing);
  const id = crypto.randomUUID();
  const objectKey = `private/category-images/${id}`;
  await bucket.put(objectKey, prepared.bytes, { httpMetadata: { contentType: 'image/webp' }, customMetadata: { purpose: 'category-image', mediaId: id } });
  try {
    await db.batch([
      ...authority.statements,
      db.prepare(`INSERT INTO category_media(id,category_id,object_key,original_name,mime_type,size_bytes,width,height,content_hash,created_by,request_id,created_at)
        VALUES (?,NULL,?,?,'image/webp',?,?,?,?,?,?,?)`).bind(id, objectKey, prepared.originalName, prepared.bytes.byteLength,
        prepared.width, prepared.height, prepared.contentHash, options.actorId, requestId, options.now),
      db.prepare(`INSERT INTO audit_logs(id,actor_id,action,subject_type,subject_id,reason,next_json,request_id,created_at)
        VALUES (?,?,'catalog.category.image_uploaded','category_media',?,'Uploaded category image awaiting catalogue save',?,?,?)`)
        .bind(crypto.randomUUID(), options.actorId, id, JSON.stringify({ mimeType: 'image/webp', contentHash: prepared.contentHash }),
          `category-media-upload:${options.actorId}:${requestId}`, options.now),
    ]);
    return { id, categoryId: null, objectKey, originalName: prepared.originalName, mimeType: 'image/webp', sizeBytes: prepared.bytes.byteLength,
      width: prepared.width, height: prepared.height, contentHash: prepared.contentHash, createdBy: options.actorId, requestId, createdAt: options.now };
  } catch (error) {
    await bucket.delete(objectKey);
    const concurrent = await prior();
    if (concurrent) return replay(concurrent);
    throw error;
  }
}

export async function categoryMediaForAdmin(db: D1Database, id: string, actorId: string) {
  return db.prepare(`SELECT ${columns} FROM category_media m WHERE m.id=? AND (m.created_by=? OR m.category_id IS NOT NULL)`)
    .bind(id, actorId).first<CategoryMedia>();
}

export async function publishedCategoryMedia(db: D1Database, id: string) {
  return db.prepare(`SELECT ${columns} FROM category_media m
    JOIN category_image_assignments a ON a.media_id=m.id AND a.category_id=m.category_id
    JOIN categories c ON c.id=a.category_id WHERE m.id=? AND c.is_active=1`).bind(id).first<CategoryMedia>();
}

export async function categoryImageResponse(media: CategoryMedia | null, bucket: R2Bucket): Promise<Response> {
  if (!media || media.mimeType !== 'image/webp' || media.objectKey !== `private/category-images/${media.id}`)
    return Response.json({ error: 'Category image was not found.' }, { status: 404, headers: { 'Cache-Control': 'no-store' } });
  const object = await bucket.get(media.objectKey);
  if (!object) return Response.json({ error: 'Category image was not found.' }, { status: 404, headers: { 'Cache-Control': 'no-store' } });
  return new Response(object.body, { headers: { 'Content-Type': 'image/webp', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store', ETag: object.httpEtag } });
}
