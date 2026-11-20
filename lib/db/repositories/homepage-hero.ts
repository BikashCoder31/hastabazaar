import {staffMutationGuard} from './staff-mutation-guard';
import { getEffectiveBusinessSetting } from './business-settings';
import {
  isNativeSellerRegistrationSlide,
  validateHomepageHeroDraft,
  type HomepageHeroSlides,
} from '../../homepage/hero-slides';
import { homepageHeroStaticAssetPath } from '../../homepage/hero-static-assets';

export {
  homepageHeroStaticAssetPath,
  homepageHeroStaticAssets,
} from '../../homepage/hero-static-assets';

export class HomepageHeroMediaAuthorizationError extends Error{readonly status=403;}
export class HomepageHeroMediaConflictError extends Error{readonly status=409;}
export class HomepageHeroMediaWriteUncertainError extends Error{readonly status=503;}

export type HomepageHeroMediaRecord = Readonly<{
  id: string;
  objectKey: string;
  originalName: string;
  mimeType: 'image/webp' | 'video/mp4';
  sizeBytes: number;
  width: number;
  height: number;
  durationSeconds: number | null;
  createdBy: string | null;
  createdAt: number;
  archivedAt: number | null;
}>;

type MediaRow = {
  id: string;
  objectKey: string;
  originalName: string;
  mimeType: 'image/webp' | 'video/mp4';
  sizeBytes: number;
  width: number;
  height: number;
  durationSeconds: number | null;
  createdBy: string | null;
  createdAt: number;
  archivedAt: number | null;
};

const columns = `
  id, object_key AS objectKey, original_name AS originalName,
  mime_type AS mimeType, size_bytes AS sizeBytes, width, height,
  duration_seconds AS durationSeconds, created_by AS createdBy,
  created_at AS createdAt, archived_at AS archivedAt`;

function safeIdentifier(label: string, value: string): string {
  const normalized = value.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{3,79}$/.test(normalized)) {
    throw new RangeError(`${label} must be a safe identifier.`);
  }
  return normalized;
}

function positiveInteger(
  label: string,
  value: number,
  maximum: number,
): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
    throw new RangeError(`${label} must be a positive bounded integer.`);
  }
  return value;
}

function parseRow(row: MediaRow): HomepageHeroMediaRecord {
  return Object.freeze({
    ...row,
    sizeBytes: Number(row.sizeBytes),
    width: Number(row.width),
    height: Number(row.height),
    durationSeconds:
      row.durationSeconds === null ? null : Number(row.durationSeconds),
    createdAt: Number(row.createdAt),
    archivedAt: row.archivedAt === null ? null : Number(row.archivedAt),
  });
}

function normalizeInput(
  input: Omit<HomepageHeroMediaRecord, 'archivedAt'>,
): Omit<HomepageHeroMediaRecord, 'archivedAt'> {
  const id = safeIdentifier('Hero media ID', input.id);
  if (!input.objectKey.startsWith('private/homepage-hero/')) {
    throw new RangeError(
      'Uploaded media must use a private homepage hero object key.',
    );
  }
  // Legacy retained keys remain readable; new uploads bind a sanitized-byte identity.
  const prefix=`private/homepage-hero/${id}`;
  if(input.objectKey!==prefix&&!(input.objectKey.startsWith(prefix+'/')&&/^[a-f0-9]{64}$/.test(input.objectKey.slice(prefix.length+1))))throw new RangeError('Hero media identity and private object key must match.');
  const originalName = input.originalName.trim();
  if (
    !originalName ||
    originalName.length > 255 ||
    /[\p{Cc}<>/\\]/u.test(originalName)
  ) {
    throw new RangeError('Original media name is invalid.');
  }
  if (input.mimeType !== 'image/webp' && input.mimeType !== 'video/mp4') {
    throw new RangeError('Hero media type must be WebP or MP4.');
  }
  if (!input.createdBy||input.createdBy.length>191||input.createdBy!==input.createdBy.trim()) {
    throw new RangeError(
      'Uploaded hero media requires its authenticated creator.',
    );
  }
  const duration = input.durationSeconds;
  if (
    (input.mimeType === 'image/webp' && duration !== null) ||
    (input.mimeType === 'video/mp4' &&
      (duration === null ||
        !Number.isFinite(duration) ||
        duration <= 0 ||
        duration > 15))
  ) {
    throw new RangeError('Hero media duration does not match its media type.');
  }
  return Object.freeze({
    id,
    objectKey: input.objectKey,
    originalName,
    mimeType: input.mimeType,
    sizeBytes: positiveInteger(
      'Hero media size',
      input.sizeBytes,
      20 * 1024 * 1024,
    ),
    width: positiveInteger('Hero media width', input.width, 10_000),
    height: positiveInteger('Hero media height', input.height, 10_000),
    durationSeconds: duration,
    createdBy: safeIdentifier('Hero media creator', input.createdBy),
    createdAt: positiveInteger(
      'Hero media creation time',
      input.createdAt,
      Number.MAX_SAFE_INTEGER,
    ),
  });
}

async function mediaById(
  database: D1Database,
  id: string,
  includeArchived: boolean,
): Promise<HomepageHeroMediaRecord | null> {
  const row = await database
    .prepare(
      `SELECT ${columns} FROM homepage_hero_media
       WHERE id=?${includeArchived ? '' : ' AND archived_at IS NULL'}`,
    )
    .bind(id)
    .first<MediaRow>();
  return row&&row.id===id ? parseRow(row) : null;
}

export function sameHomepageHeroUpload(media:HomepageHeroMediaRecord,input:Omit<HomepageHeroMediaRecord,'archivedAt'|'createdAt'>):boolean{
 return media.id===input.id&&media.objectKey===input.objectKey&&media.originalName===input.originalName&&media.mimeType===input.mimeType&&media.sizeBytes===input.sizeBytes&&media.width===input.width&&media.height===input.height&&media.durationSeconds===input.durationSeconds&&media.createdBy===input.createdBy;
}
export async function createHomepageHeroMedia(database:D1Database,input:Omit<HomepageHeroMediaRecord,'archivedAt'>):Promise<HomepageHeroMediaRecord>{
 const value=normalizeInput(input),authority=await staffMutationGuard(database,value.createdBy!,'business_settings.manage',HomepageHeroMediaAuthorizationError);
 const existing=await mediaById(database,value.id,true);
 if(existing){if(!sameHomepageHeroUpload(existing,value))throw new HomepageHeroMediaConflictError('This upload reference is already bound to another exact actor or file.');await staffMutationGuard(database,value.createdBy!,'business_settings.manage',HomepageHeroMediaAuthorizationError);return existing;}
 try{await database.batch([...authority.statements,
  database.prepare(`INSERT INTO homepage_hero_media(id,object_key,original_name,mime_type,size_bytes,width,height,duration_seconds,created_by,created_at,archived_at)VALUES(?,?,?,?,?,?,?,?,?,?,NULL)`).bind(value.id,value.objectKey,value.originalName,value.mimeType,value.sizeBytes,value.width,value.height,value.durationSeconds,value.createdBy,value.createdAt),
  database.prepare(`INSERT INTO audit_logs(id,actor_id,action,subject_type,subject_id,reason,previous_json,next_json,request_id,ip_hash,created_at)VALUES(?,?,'homepage_hero_media.created','homepage_hero_media',?,'Private homepage media upload recorded.',NULL,?,?,NULL,?)`).bind(crypto.randomUUID(),value.createdBy,value.id,JSON.stringify(value),value.id,value.createdAt),
 ]);}catch{
  let stored:HomepageHeroMediaRecord|null;try{stored=await mediaById(database,value.id,true);}catch{throw new HomepageHeroMediaWriteUncertainError('The original upload outcome could not be confirmed.');}
  if(stored){if(!sameHomepageHeroUpload(stored,value))throw new HomepageHeroMediaConflictError('This upload reference is already bound to another exact actor or file.');await staffMutationGuard(database,value.createdBy!,'business_settings.manage',HomepageHeroMediaAuthorizationError);return stored;}
  await staffMutationGuard(database,value.createdBy!,'business_settings.manage',HomepageHeroMediaAuthorizationError);
  throw new HomepageHeroMediaWriteUncertainError('The original upload outcome could not be confirmed.');
 }
 let created:HomepageHeroMediaRecord|null;try{created=await mediaById(database,value.id,true);}catch{throw new HomepageHeroMediaWriteUncertainError('The original upload outcome could not be confirmed.');}
 await staffMutationGuard(database,value.createdBy!,'business_settings.manage',HomepageHeroMediaAuthorizationError);
 if(!created||!sameHomepageHeroUpload(created,value))throw new HomepageHeroMediaWriteUncertainError('The original upload outcome could not be confirmed.');return created;
}

export async function listHomepageHeroMediaForAdmin(
  database: D1Database,
): Promise<readonly HomepageHeroMediaRecord[]> {
  const rows = await database
    .prepare(
      `SELECT ${columns} FROM homepage_hero_media
       ORDER BY created_at DESC, id ASC`,
    )
    .all<MediaRow>();
  return Object.freeze(rows.results.map(parseRow));
}

export async function getHomepageHeroMediaForAdmin(
  database: D1Database,
  id: string,
): Promise<HomepageHeroMediaRecord | null> {
  return mediaById(database, safeIdentifier('Hero media ID', id), true);
}

function referencedMediaIds(slides: HomepageHeroSlides): Set<string> {
  const ids = new Set<string>();
  for (const slide of slides) {
    if (!slide.enabled || isNativeSellerRegistrationSlide(slide)) continue;
    if (slide.mediaId) ids.add(slide.mediaId);
    if (slide.mediaType === 'video' && slide.posterMediaId) {
      ids.add(slide.posterMediaId);
    }
  }
  return ids;
}

export async function getPublishedHomepageHeroMedia(
  database: D1Database,
  id: string,
  at: number,
): Promise<HomepageHeroMediaRecord | null> {
  const mediaId = safeIdentifier('Hero media ID', id);
  const effective = await getEffectiveBusinessSetting(
    database,
    'homepage_hero_slides',
    at,
  );
  if (!referencedMediaIds(effective.value).has(mediaId)) return null;
  return mediaById(database, mediaId, false);
}

function reason(value: string): string {
  const normalized = value.trim();
  if (normalized.length < 8 || normalized.length > 1_000) {
    throw new RangeError('Archive reason must contain 8–1,000 characters.');
  }
  return normalized;
}

function requestId(value: string): string {
  const normalized = value.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{3,119}$/.test(normalized)) {
    throw new RangeError('Request ID must contain 4–120 safe characters.');
  }
  return normalized;
}

export async function archiveHomepageHeroMedia(
  database: D1Database,
  input: {
    id: string;
    actorId: string;
    reason: string;
    requestId: string;
    now: number;
  },
): Promise<void> {
  const id = safeIdentifier('Hero media ID', input.id);
  const actorId=input.actorId;if(typeof actorId!=='string'||!actorId||actorId.length>191||actorId!==actorId.trim())throw new RangeError('Archive actor is invalid.');
  const authority=await staffMutationGuard(database,actorId,'business_settings.manage',HomepageHeroMediaAuthorizationError);
  const archiveReason = reason(input.reason);
  const operationId = requestId(input.requestId);
  const now = positiveInteger(
    'Archive time',
    input.now,
    Number.MAX_SAFE_INTEGER,
  );
  const replay=async()=>{const receipt=await database.prepare(`SELECT id,actor_id AS actorId,reason FROM audit_logs WHERE action='homepage_hero_media.archived' AND subject_id=? AND request_id=?`).bind(id,operationId).first<{id:string;actorId:string|null;reason:string|null}>();if(receipt&&(receipt.actorId!==actorId||receipt.reason!==archiveReason))throw new HomepageHeroMediaConflictError('This archive reference already records a different original command.');return receipt;};
  if(await replay()){await staffMutationGuard(database,actorId,'business_settings.manage',HomepageHeroMediaAuthorizationError);return;}
  const media = await mediaById(database, id, true);
  if (!media) throw new Error('Homepage hero media was not found.');
  if (homepageHeroStaticAssetPath(media)) {
    throw new Error('Built-in homepage hero media cannot be archived.');
  }
  if(media.archivedAt!==null){await staffMutationGuard(database,actorId,'business_settings.manage',HomepageHeroMediaAuthorizationError);return;}

  const versions = await database
    .prepare(
      `SELECT value_json AS valueJson FROM business_setting_versions
       WHERE setting_key='homepage_hero_slides'`,
    )
    .all<{ valueJson: string }>();
  for (const version of versions.results) {
    let slides: HomepageHeroSlides;
    try {
      slides = validateHomepageHeroDraft(JSON.parse(version.valueJson));
    } catch {
      if (version.valueJson.includes(`"${id}"`)) {
        throw new Error(
          'Media referenced by a retained version cannot be archived.',
        );
      }
      continue;
    }
    if (referencedMediaIds(slides).has(id)) {
      throw new Error(
        'Media referenced by a retained version cannot be archived.',
      );
    }
  }

  const guardId = crypto.randomUUID();
  try {
    await database.batch([...authority.statements,
      database
        .prepare(
          `INSERT INTO business_setting_guards (id, valid)
           SELECT ?, CASE WHEN NOT EXISTS (
             SELECT 1 FROM business_setting_versions
             WHERE setting_key='homepage_hero_slides' AND value_json LIKE ?
           ) THEN 1 ELSE 0 END`,
        )
        .bind(guardId, `%"${id}"%`),
      database
        .prepare(
          `UPDATE homepage_hero_media SET archived_at=?
           WHERE id=? AND archived_at IS NULL`,
        )
        .bind(now, id),
      database
        .prepare(
          `INSERT INTO audit_logs (
            id, actor_id, action, subject_type, subject_id, reason,
            previous_json, next_json, request_id, ip_hash, created_at
          ) VALUES (?, ?, 'homepage_hero_media.archived', 'homepage_hero_media',
            ?, ?, ?, ?, ?, NULL, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          actorId,
          id,
          archiveReason,
          JSON.stringify(media),
          JSON.stringify({ archivedAt: now }),
          operationId,
          now,
        ),
      database
        .prepare('DELETE FROM business_setting_guards WHERE id=?')
        .bind(guardId),
    ]);
  }catch{
    try{if(await replay()){await staffMutationGuard(database,actorId,'business_settings.manage',HomepageHeroMediaAuthorizationError);return;}}catch(proof){if(proof instanceof HomepageHeroMediaAuthorizationError||proof instanceof HomepageHeroMediaConflictError)throw proof;throw new HomepageHeroMediaWriteUncertainError('The original archive outcome could not be confirmed.');}
    await staffMutationGuard(database,actorId,'business_settings.manage',HomepageHeroMediaAuthorizationError);
    const referenced=await database.prepare("SELECT 1 FROM business_setting_versions WHERE setting_key='homepage_hero_slides' AND value_json LIKE ? LIMIT 1").bind(`%"${id}"%`).first();
    if(referenced)throw new HomepageHeroMediaConflictError('Media referenced by a retained version cannot be archived.');
    throw new HomepageHeroMediaWriteUncertainError('The original archive outcome could not be confirmed.');
  }
  await staffMutationGuard(database,actorId,'business_settings.manage',HomepageHeroMediaAuthorizationError);
}

export async function assertHomepageHeroMediaReady(
  database: D1Database,
  slides: HomepageHeroSlides,
): Promise<void> {
  for (const slide of slides) {
    // A code-rendered panel has no uploaded bytes. Only this exact built-in
    // slide identity bypasses image lookup; all other media stays validated.
    if (!slide.enabled || isNativeSellerRegistrationSlide(slide)) continue;
    const media = await mediaById(database, slide.mediaId, false);
    const requiredMime =
      slide.mediaType === 'video' ? 'video/mp4' : 'image/webp';
    if (!media || media.mimeType !== requiredMime) {
      throw new RangeError(
        `Homepage hero media ${slide.mediaId} is missing, archived, or has the wrong type.`,
      );
    }
    if (slide.mediaType === 'video' && slide.posterMediaId) {
      const poster = await mediaById(database, slide.posterMediaId, false);
      if (!poster || poster.mimeType !== 'image/webp') {
        throw new RangeError(
          `Homepage hero media ${slide.posterMediaId} is missing, archived, or not a poster image.`,
        );
      }
    }
  }
}
