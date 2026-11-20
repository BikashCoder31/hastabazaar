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
import { copyMariaDbGeneratorInputs } from './helpers/copy-mariadb-generator-inputs';

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
    await copyMariaDbGeneratorInputs(root);
    await copyFile(
      join(project, 'scripts/generate-release-manifest.mjs'),
      join(root, 'scripts/generate-release-manifest.mjs'),
    );
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
    // The reviewed migration 156 prefix and reset are preserved byte for byte.
    const historicalSchema = Buffer.from(schema).subarray(0, 974_510);
    assert.equal(
      createHash('sha256').update(historicalSchema).digest('hex'),
      'eda83b438b617d1ef97e3d9fcbdf42bc30613995c0dd4adcc2e1f7905b618c52',
    );
    assert.equal(
      createHash('sha256').update(recovery).digest('hex'),
      'f71cbde53af46afe3156b2d4df3391c11a1c47590360c23faa41c0ea8b1ffdd3',
    );
    assert.ok(
      recovery.endsWith(historicalSchema.toString('utf8')),
      'Recovery must end with the exact historical schema',
    );
    const currentCompanions = await Promise.all(
      [
        'bootstrap-prerequisites',
        'bootstrap-completion',
        'fresh-bootstrap-defaults',
        'check-parity',
        'text-length-parity',
        'native-order-stock-governance',
      ].map(async (name) => {
        const sql = await readFile(join(root, `deployment/babal/mariadb-${name}.sql`), 'utf8');
        return sql.replace(/\r\n/g, '\n');
      }),
    );
    assert.ok(
      schema === [historicalSchema.toString('utf8'), ...currentCompanions].join('\n'),
      'Current bootstrap must append every reviewed companion in order',
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
