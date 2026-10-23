import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

void test('release generators include category schema, hash inventory, checks and safe parent ordering', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hb-category-deployment-'));
  const project = fileURLToPath(new URL('../', import.meta.url));
  try {
    const sqlRoot = join(project, 'deployment/babal');
    const names = (await readdir(sqlRoot, { recursive: true }))
      .map((n) => n.split(sep).join('/'))
      .filter((n) => n.endsWith('.sql'));
    for (const name of names) {
      const target = join(root, 'deployment/babal', name);
      await mkdir(dirname(target), { recursive: true });
      await copyFile(join(sqlRoot, name), target);
    }
    for (const name of [
      'scripts/generate-release-manifest.mjs',
      'scripts/generate-mariadb-schema.mjs',
      'lib/operations/fee-schema-readiness.mjs',
      'drizzle/meta/0020_snapshot.json',
    ]) {
      const target = join(root, name);
      await mkdir(dirname(target), { recursive: true });
      await copyFile(join(project, name), target);
    }
    const run = (name: string) =>
      promisify(execFile)(process.execPath, [join(root, 'scripts', name)], {
        cwd: root,
        env: {
          ...process.env,
          HASTABAZAAR_RELEASE_ID: 'fixture-category-deployment',
        },
      });
    await run('generate-mariadb-schema.mjs');
    await run('generate-release-manifest.mjs');
    const schema = await readFile(
      join(root, 'deployment/babal/mariadb-schema.sql'),
      'utf8',
    );
    const recovery = await readFile(
      join(root, 'deployment/babal/mariadb-reset-empty-import.sql'),
      'utf8',
    );
    const manifestSource = await readFile(
      join(root, 'deployment/babal/release-manifest.json'),
      'utf8',
    );
    const manifest = JSON.parse(manifestSource) as {
      release: string;
      migrations: { path: string; sha256: string; usage: string }[];
      requiredTables: Record<string, string[]>;
      requiredChecks: Record<string, string[]>;
    };
    const expected: Record<string, string[]> = {
      category_media: [
        'id',
        'category_id',
        'object_key',
        'original_name',
        'mime_type',
        'size_bytes',
        'width',
        'height',
        'content_hash',
        'created_by',
        'request_id',
        'created_at',
      ],
      category_image_assignments: [
        'category_id',
        'media_id',
        'updated_by',
        'updated_at',
      ],
    };
    for (const [table, columns] of Object.entries(expected)) {
      assert.deepEqual(
        manifest.requiredTables[table],
        [...columns].sort((a, b) => a.localeCompare(b)),
        table + ' must expose required schema',
      );
      const pos = schema.indexOf('CREATE TABLE IF NOT EXISTS `' + table + '`');
      assert.ok(
        pos > schema.indexOf('CREATE TABLE IF NOT EXISTS `categories`'),
      );
      assert.ok(pos > schema.indexOf('CREATE TABLE IF NOT EXISTS `users`'));
      assert.ok(
        recovery.indexOf('DROP TABLE IF EXISTS `' + table + '`;') <
          recovery.indexOf('-- Production-safe discovery taxonomy.'),
      );
    }
    const companionPath = 'deployment/babal/mariadb-category-images.sql';
    const items = manifest.migrations.filter((m) => m.path === companionPath);
    assert.equal(items.length, 1);
    assert.equal(items[0].usage, 'additive-maintenance');
    const companion = await readFile(join(root, companionPath), 'utf8');
    assert.equal(
      items[0].sha256,
      createHash('sha256').update(companion).digest('hex'),
    );
    assert.ok(
      schema.includes(companion.trim()),
      'Bootstrap must embed maintained companion verbatim',
    );
    assert.ok(
      recovery.endsWith(schema),
      'Recovery must contain the exact generated schema',
    );
    for (const check of [
      'category_media.category_media_size',
      'category_media.category_media_dimensions',
      'category_media.category_media_mime',
      'category_media.category_media_hash',
    ])
      assert.ok(
        Array.isArray(manifest.requiredChecks[check]) &&
          manifest.requiredChecks[check].length > 0,
        check + ' must be checked during release readiness',
      );
    assert.equal(manifest.release, 'fixture-category-deployment');
    await run('generate-mariadb-schema.mjs');
    await run('generate-release-manifest.mjs');
    assert.equal(
      await readFile(join(root, 'deployment/babal/mariadb-schema.sql'), 'utf8'),
      schema,
    );
    assert.equal(
      await readFile(
        join(root, 'deployment/babal/mariadb-reset-empty-import.sql'),
        'utf8',
      ),
      recovery,
    );
    assert.equal(
      await readFile(
        join(root, 'deployment/babal/release-manifest.json'),
        'utf8',
      ),
      manifestSource,
    );
  } finally {
    const rel = relative(resolve(tmpdir()), resolve(root));
    assert.ok(rel && !rel.startsWith('..') && !rel.includes(':'));
    await rm(root, { recursive: true, force: true });
  }
});
