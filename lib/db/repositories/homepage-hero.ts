import { getEffectiveBusinessSetting } from './business-settings';
import {
  isNativeSellerRegistrationSlide,
  validateHomepageHeroDraft,
  type HomepageHeroSlides,
} from '../../homepage/hero-slides';

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

const staticAssets = new Map<string, { objectKey: string; path: string }>([
  [
    'system-nepal-craft-hero',
    {
      objectKey: 'public/homepage/nepal-craft-hero.webp',
      path: '/homepage/nepal-craft-hero.webp',
    },
  ],
  [
    'system-maker-hands-hero',
    {
      objectKey: 'public/homepage/maker-hands-hero.webp',
      path: '/homepage/maker-hands-hero.webp',
    },
  ],
  [
    'system-meaningful-gifts-hero',
    {
      objectKey: 'public/homepage/meaningful-gifts-hero.webp',
      path: '/homepage/meaningful-gifts-hero.webp',
    },
  ],
]);

function safeIdentifier(label: string, value: string): string {
  const normalized = value.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{3,79}$/.test(normalized)) {
    throw new RangeError(`${label} must be a safe identifier.`);
  }
  return normalized;
}

function positiveInteger(label: string, value: number, maximum: number): number {
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
    throw new RangeError('Uploaded media must use a private homepage hero object key.');
  }
  if (
    !/^private\/homepage-hero\/[A-Za-z0-9][A-Za-z0-9_-]{3,79}$/.test(
      input.objectKey,
    )
  ) {
    throw new RangeError('Uploaded media must use a private homepage hero object key.');
  }
  if (input.objectKey !== `private/homepage-hero/${id}`) {
    throw new RangeError('Hero media identity and object key must match.');
  }
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
  if (!input.createdBy) {
    throw new RangeError('Uploaded hero media requires its authenticated creator.');
  }
  const duration = input.durationSeconds;
  if (
    (input.mimeType === 'image/webp' && duration !== null) ||
    (input.mimeType === 'video/mp4' &&
      (duration === null || !Number.isFinite(duration) || duration <= 0 || duration > 15))
  ) {
    throw new RangeError('Hero media duration does not match its media type.');
  }
  return Object.freeze({
    id,
    objectKey: input.objectKey,
    originalName,
    mimeType: input.mimeType,
    sizeBytes: positiveInteger('Hero media size', input.sizeBytes, 20 * 1024 * 1024),
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
  return row ? parseRow(row) : null;
}

export function homepageHeroStaticAssetPath(
  media: HomepageHeroMediaRecord,
): string | null {
  const expected = staticAssets.get(media.id);
  return expected &&
    expected.objectKey === media.objectKey &&
    media.mimeType === 'image/webp'
    ? expected.path
    : null;
}

export async function createHomepageHeroMedia(
  database: D1Database,
  input: Omit<HomepageHeroMediaRecord, 'archivedAt'>,
): Promise<HomepageHeroMediaRecord> {
  const value = normalizeInput(input);
  try {
    await database
      .prepare(
        `INSERT INTO homepage_hero_media (
          id, object_key, original_name, mime_type, size_bytes,
          width, height, duration_seconds, created_by, created_at, archived_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
      )
      .bind(
        value.id,
        value.objectKey,
        value.originalName,
        value.mimeType,
        value.sizeBytes,
        value.width,
        value.height,
        value.durationSeconds,
        value.createdBy,
        value.createdAt,
      )
      .run();
  } catch {
    throw new Error('Homepage hero media conflicts with an existing upload.');
  }
  const created = await mediaById(database, value.id, true);
  if (!created) throw new Error('Homepage hero media creation could not be verified.');
  return created;
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
  const actorId = safeIdentifier('Archive actor', input.actorId);
  const archiveReason = reason(input.reason);
  const operationId = requestId(input.requestId);
  const now = positiveInteger('Archive time', input.now, Number.MAX_SAFE_INTEGER);
  const replay = await database
    .prepare(
      `SELECT id FROM audit_logs
       WHERE action='homepage_hero_media.archived' AND subject_id=? AND request_id=?`,
    )
    .bind(id, operationId)
    .first<{ id: string }>();
  if (replay) return;
  const media = await mediaById(database, id, true);
  if (!media) throw new Error('Homepage hero media was not found.');
  if (homepageHeroStaticAssetPath(media)) {
    throw new Error('Built-in homepage hero media cannot be archived.');
  }
  if (media.archivedAt !== null) return;

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
        throw new Error('Media referenced by a retained version cannot be archived.');
      }
      continue;
    }
    if (referencedMediaIds(slides).has(id)) {
      throw new Error('Media referenced by a retained version cannot be archived.');
    }
  }

  const guardId = crypto.randomUUID();
  try {
    await database.batch([
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
      database.prepare('DELETE FROM business_setting_guards WHERE id=?').bind(guardId),
    ]);
  } catch {
    throw new Error('Media referenced by a retained version cannot be archived.');
  }
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
    const requiredMime = slide.mediaType === 'video' ? 'video/mp4' : 'image/webp';
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
