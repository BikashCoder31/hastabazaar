import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync, type SQLInputValue, type StatementSync } from 'node:sqlite';
import test from 'node:test';

import {
  archiveHomepageHeroMedia,
  assertHomepageHeroMediaReady,
  createHomepageHeroMedia,
  getHomepageHeroMediaForAdmin,
  getPublishedHomepageHeroMedia,
  homepageHeroStaticAssetPath,
  listHomepageHeroMediaForAdmin,
} from '../lib/db/repositories/homepage-hero';
import type { HomepageHeroSlide } from '../lib/homepage/hero-slides';

class PreparedStatement {
  private values: SQLInputValue[] = [];
  constructor(private readonly statement: StatementSync) {}
  bind(...values: SQLInputValue[]) {
    this.values = values;
    return this;
  }
  async first<T>() {
    return (this.statement.get(...this.values) as T | undefined) ?? null;
  }
  async all<T>() {
    return { results: this.statement.all(...this.values) as T[] };
  }
  async run() {
    const result = this.statement.run(...this.values);
    return {
      success: true,
      meta: { changes: Number(result.changes) },
      results: [],
    };
  }
}

class TestDatabase {
  constructor(private readonly sqlite: DatabaseSync) {}
  prepare(sql: string) {
    return new PreparedStatement(this.sqlite.prepare(sql));
  }
  async batch(statements: readonly PreparedStatement[]) {
    this.sqlite.exec('BEGIN');
    try {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      this.sqlite.exec('COMMIT');
      return results;
    } catch (error) {
      this.sqlite.exec('ROLLBACK');
      throw error;
    }
  }
}

async function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE users (id TEXT PRIMARY KEY, display_name TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'active');
    CREATE TABLE audit_logs (
      id TEXT PRIMARY KEY, actor_id TEXT, action TEXT, subject_type TEXT,
      subject_id TEXT, reason TEXT, previous_json TEXT, next_json TEXT,
      request_id TEXT, ip_hash TEXT, created_at INTEGER
    );
    INSERT INTO users(id,display_name) VALUES ('super-admin', 'Super Admin');
  `);
  const [businessSettings, heroMedia] = await Promise.all([
    readFile(
      new URL('../drizzle/0044_business_configuration.sql', import.meta.url),
      'utf8',
    ),
    readFile(
      new URL('../drizzle/0055_homepage_hero_carousel.sql', import.meta.url),
      'utf8',
    ),
  ]);
  // Actual native staff permission tables/guards, not a permissive authority mock.
  const baseSchema=await readFile(new URL('../drizzle/0000_clear_lizard.sql',import.meta.url),'utf8');
  const roles=baseSchema.match(/CREATE TABLE `user_roles` \([\s\S]*?\n\);/);assert.ok(roles);sqlite.exec(roles[0]);
  sqlite.exec(await readFile(new URL('../drizzle/0031_staff_permissions.sql',import.meta.url),'utf8'));
  sqlite.prepare("INSERT INTO user_roles(user_id,role,assigned_at)VALUES('super-admin','super_admin',1)").run();
  sqlite.exec(businessSettings);
  sqlite.exec(heroMedia);
  return {
    sqlite,
    database: new TestDatabase(sqlite) as unknown as D1Database,
  };
}

function imageSlide(position: number, mediaId: string): HomepageHeroSlide {
  return {
    id: `published-slide-${position}`,
    position,
    enabled: true,
    eyebrow: 'Handmade in Nepal',
    headingLead: `Featured craft ${position}`,
    highlightedPhrase: null,
    headingTail: null,
    body: 'A complete and accessible handmade product story from Nepal.',
    primaryActionLabel: 'Explore the collection',
    primaryActionHref: '/shop',
    secondaryActionLabel: null,
    secondaryActionHref: null,
    mediaType: 'image',
    mediaId,
    imageAlt: 'A warm editorial arrangement of handmade Nepali craft',
    posterMediaId: null,
    videoDescription: null,
    imageNote: null,
  };
}

async function addUpload(database: D1Database, id: string) {
  return createHomepageHeroMedia(database, {
    id,
    objectKey: `private/homepage-hero/${id}`,
    originalName: `${id}.png`,
    mimeType: 'image/webp',
    sizeBytes: 12_345,
    width: 1800,
    height: 1125,
    durationSeconds: null,
    createdBy: 'super-admin',
    createdAt: 1_000,
  });
}

void test('additive migration creates the media registry and stable current hero row', async () => {
  const { sqlite } = await fixture();
  try {
    assert.deepEqual(
      sqlite
        .prepare('PRAGMA table_info(homepage_hero_media)')
        .all()
        .map((column) => column.name),
      [
        'id',
        'object_key',
        'original_name',
        'mime_type',
        'size_bytes',
        'width',
        'height',
        'duration_seconds',
        'created_by',
        'created_at',
        'archived_at',
      ],
    );
    assert.deepEqual(
      {
        ...sqlite
          .prepare(
            `SELECT id, object_key AS objectKey, size_bytes AS sizeBytes,
                    width, height, created_by AS createdBy
             FROM homepage_hero_media WHERE id='system-nepal-craft-hero'`,
          )
          .get(),
      },
      {
        id: 'system-nepal-craft-hero',
        objectKey: 'public/homepage/nepal-craft-hero.webp',
        sizeBytes: 320_794,
        width: 1800,
        height: 1125,
        createdBy: null,
      },
    );
  } finally {
    sqlite.close();
  }
});

void test('admin media creation and listing preserve private server-owned metadata', async () => {
  const { sqlite, database } = await fixture();
  try {
    const created = await addUpload(database, 'upload-one');
    assert.equal(created.archivedAt, null);
    assert.equal(created.objectKey, 'private/homepage-hero/upload-one');
    assert.deepEqual(
      (await listHomepageHeroMediaForAdmin(database)).map((media) => media.id),
      [
        'upload-one',
        'system-maker-hands-hero',
        'system-meaningful-gifts-hero',
        'system-nepal-craft-hero',
      ],
    );
    assert.equal(
      (await getHomepageHeroMediaForAdmin(database, 'upload-one'))?.createdBy,
      'super-admin',
    );
    assert.equal(
      homepageHeroStaticAssetPath(
        (await getHomepageHeroMediaForAdmin(
          database,
          'system-nepal-craft-hero',
        ))!,
      ),
      '/homepage/nepal-craft-hero.webp',
    );
    assert.equal(homepageHeroStaticAssetPath(created), null);
    const { archivedAt: _archivedAt, ...unsafeInput } = created;
    await assert.rejects(
      createHomepageHeroMedia(database, {
        ...unsafeInput,
        id: 'unsafe-upload',
        objectKey: 'public/homepage/attacker.webp',
      }),
      /private homepage hero/i,
    );
  } finally {
    sqlite.close();
  }
});

void test('archive is idempotent but refuses media referenced by retained setting history', async () => {
  const { sqlite, database } = await fixture();
  try {
    await addUpload(database, 'retained-media');
    sqlite
      .prepare(
        `INSERT INTO business_setting_versions (
          id, setting_key, version, value_json, status, revision,
          change_control, reason, created_by, created_at, last_request_id
        ) VALUES (?, 'homepage_hero_slides', 1, ?, 'draft', 1,
          'simple', 'Retained draft media reference.', 'super-admin', 1000, 'draft-request')`,
      )
      .run(
        'hero-draft',
        JSON.stringify([imageSlide(1, 'retained-media')]),
      );
    await assert.rejects(
      archiveHomepageHeroMedia(database, {
        id: 'retained-media',
        actorId: 'super-admin',
        reason: 'Attempt to archive retained media safely.',
        requestId: 'archive-retained',
        now: 2_000,
      }),
      /retained version/i,
    );

    await addUpload(database, 'unused-media');
    const input = {
      id: 'unused-media',
      actorId: 'super-admin',
      reason: 'Archive an unused staging upload safely.',
      requestId: 'archive-unused',
      now: 2_100,
    };
    await archiveHomepageHeroMedia(database, input);
    await archiveHomepageHeroMedia(database, input);
    assert.equal(
      (await getHomepageHeroMediaForAdmin(database, 'unused-media'))?.archivedAt,
      2_100,
    );
    assert.equal(
      sqlite
        .prepare(
          `SELECT COUNT(*) AS total FROM audit_logs
           WHERE action='homepage_hero_media.archived'`,
        )
        .get()?.total,
      1,
    );
  } finally {
    sqlite.close();
  }
});

void test('public lookup serves only active media referenced by the effective published version', async () => {
  const { sqlite, database } = await fixture();
  try {
    await addUpload(database, 'published-one');
    await addUpload(database, 'published-two');
    await addUpload(database, 'published-three');
    await addUpload(database, 'orphaned-media');
    const slides = [
      imageSlide(1, 'published-one'),
      imageSlide(2, 'published-two'),
      imageSlide(3, 'published-three'),
    ];
    sqlite
      .prepare(
        `INSERT INTO business_setting_versions (
          id, setting_key, version, value_json, status, revision,
          change_control, effective_from, reason, created_by, created_at,
          published_by, published_at, last_request_id
        ) VALUES ('hero-published', 'homepage_hero_slides', 1, ?, 'published', 2,
          'simple', 2000, 'Published staging hero.', 'super-admin', 1000,
          'super-admin', 1500, 'publish-request')`,
      )
      .run(JSON.stringify(slides));

    assert.equal(
      await getPublishedHomepageHeroMedia(database, 'published-one', 1_999),
      null,
      'a future-effective version must not appear early',
    );
    assert.equal(
      (await getPublishedHomepageHeroMedia(database, 'published-one', 2_000))
        ?.id,
      'published-one',
    );
    assert.equal(
      await getPublishedHomepageHeroMedia(database, 'orphaned-media', 2_000),
      null,
    );
    await assertHomepageHeroMediaReady(database, slides);
    await assert.rejects(
      assertHomepageHeroMediaReady(database, [
        imageSlide(1, 'published-one'),
        imageSlide(2, 'published-two'),
        imageSlide(3, 'missing-media'),
      ]),
      /missing-media/i,
    );
  } finally {
    sqlite.close();
  }
});
