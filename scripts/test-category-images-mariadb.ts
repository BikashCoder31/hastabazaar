import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID, createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import mysql, { type Connection, type RowDataPacket } from 'mysql2/promise';
import { env } from '../lib/runtime/node-bindings';
import { listPublicDiscoveryCategories } from '../lib/db/repositories/products';
import { saveTaxonomy } from '../lib/db/repositories/catalog-admin';
import {
  saveFormDraft,
  publishFormDraft,
} from '../lib/db/repositories/form-catalog';
import {
  seedIncentiveCustomer,
  seedIncentiveInventory,
} from '../tests/helpers/incentive-db';
import { categoryMediaDb } from '../tests/helpers/category-media-db';
const evidence =
  'C:/Users/abinash/Desktop/Hatskala/deployment-20260929/category-images';
assert.equal(
  resolve(process.cwd()),
  resolve(
    'C:/Users/abinash/.codex/worktrees/hastabazaar-v1-2-1-staging/Hatskala',
  ),
);
assert.equal(process.argv.length, 2, 'No remote/reused database options');
const context = JSON.parse(
  execFileSync('docker', ['context', 'inspect'], { encoding: 'utf8' }),
)[0];
assert.match(context.Endpoints.docker.Host, /^(npipe|unix):\/\//);
const secret = JSON.parse(
  await readFile('.staging/form-catalog-mariadb-private.json', 'utf8'),
);
assert.equal(secret.host, '127.0.0.1');
assert.equal(secret.port, 13316);
assert.equal(secret.name, 'hastabazaar-form-catalog-qa-0928');
const container = JSON.parse(
  execFileSync('docker', ['inspect', secret.name], { encoding: 'utf8' }),
)[0];
assert.equal(container.Id, secret.id);
assert.equal(container.State.Running, true);
assert.equal(container.Config.Image, 'mariadb:10.11');
assert.equal(
  container.Config.Labels['hastabazaar.scope'],
  'form-catalog-task22-disposable',
);
assert.deepEqual(container.HostConfig.PortBindings['3306/tcp'], [
  { HostIp: '127.0.0.1', HostPort: '13316' },
]);
assert.ok(container.HostConfig.Tmpfs['/var/lib/mysql']);
const control = await mysql.createConnection({
  host: secret.host,
  port: secret.port,
  user: secret.user,
  password: secret.password,
});
const prefix = 'category_deploy_' + Date.now(),
  database = prefix + '_existing';
assert.match(database, /^category_deploy_\d+_existing$/);
const loadedSourceHashes = Object.fromEntries(
  await Promise.all(
    [
      'lib/runtime/node-bindings.ts',
      'lib/db/repositories/form-catalog.ts',
      'lib/db/repositories/form-answers.ts',
      'lib/db/repositories/catalog-admin.ts',
    ].map(async (path) => [
      path,
      createHash('sha256')
        .update(await readFile(path))
        .digest('hex'),
    ]),
  ),
);
const observations: {
  name: string;
  status: string;
  code?: string;
  message?: string;
}[] = [];
async function stage(name: string, action: () => Promise<void>) {
  try {
    await action();
    observations.push({ name, status: 'PASS' });
  } catch (error) {
    const e = error as Error & { code?: string; cause?: { code?: string } };
    observations.push({
      name,
      status: 'FAIL',
      code: e.cause?.code ?? e.code ?? e.name,
      message: e.message.slice(0, 500),
    });
  }
  console.log(JSON.stringify(observations.at(-1)));
}
function statements(sql: string) {
  let delimiter = ';',
    buffer = '';
  const result: string[] = [];
  for (const line of sql.split(/\r?\n/)) {
    const directive = /^\s*DELIMITER\s+(\S+)\s*$/i.exec(line);
    if (directive) {
      assert.ok(
        !buffer.trim() ||
          buffer
            .split('\n')
            .every((l) => !l.trim() || l.trim().startsWith('--')),
      );
      buffer = '';
      delimiter = directive[1];
      continue;
    }
    buffer += line + '\n';
    if (buffer.trimEnd().endsWith(delimiter)) {
      const statement = buffer.trimEnd().slice(0, -delimiter.length);
      buffer = '';
      if (statement.trim()) result.push(statement);
    }
  }
  assert.ok(
    !buffer.trim() ||
      buffer.split('\n').every((l) => !l.trim() || l.trim().startsWith('--')),
  );
  return result;
}
async function load(connection: Connection, sql: string) {
  for (const statement of statements(sql)) await connection.query(statement);
}
let companion: string | undefined;
try {
  const [engine] = await control.query<RowDataPacket[]>(
    'SELECT VERSION() version',
  );
  assert.match(String(engine[0].version), /^10\.11\./);
  await control.query(
    'CREATE DATABASE `' +
      database +
      '` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci',
  );
  await control.query('USE `' + database + '`');
  const baseline = await readFile(
    evidence + '/baseline-mariadb-schema.sql',
    'utf8',
  );
  assert.ok(!baseline.includes('CREATE TABLE IF NOT EXISTS `category_media`'));
  assert.ok(
    !baseline.includes(
      'CREATE TABLE IF NOT EXISTS `category_image_assignments`',
    ),
  );
  await load(control, baseline);
  const password = randomUUID();
  await control.query('CREATE USER ?@? IDENTIFIED BY ?', [
    database,
    '%',
    password,
  ]);
  await control.query('GRANT ALL ON `' + database + '`.* TO ?@?', [
    database,
    '%',
  ]);
  Object.assign(process.env, {
    DB_HOST: '127.0.0.1',
    DB_PORT: '13316',
    DB_NAME: database,
    DB_USER: database,
    DB_PASSWORD: password,
  });
  const db = new Proxy(env.DB, {
    get(target, key) {
      if (key === 'batch')
        return async (statements: D1PreparedStatement[]) => {
          try {
            return await target.batch(statements);
          } catch (error) {
            const e = error as Error & { code?: string };
            console.log(
              JSON.stringify({
                name: 'actual adapter rejection',
                code: e.code ?? e.name,
                message: e.message.slice(0, 350),
              }),
            );
            throw error;
          }
        };
      return Reflect.get(target, key);
    },
  });
  await seedIncentiveCustomer(db);
  await seedIncentiveInventory(db);
  await seedIncentiveCustomer(db, 'other');
  await db
    .prepare(
      "INSERT INTO user_roles(user_id,role,assigned_at) VALUES ('customer','super_admin',1),('other','super_admin',1)",
    )
    .run();
  const draft = await saveFormDraft(db, {
    formId: 'staff.catalog',
    actorId: 'customer',
    actorRole: 'super_admin',
    expectedPublishedVersion: 0,
    config: { formId: 'staff.catalog', fields: [] },
    reason: 'Actual category fixture publication',
    requestId: 'category-form-draft',
    now: 1,
  });
  const published = await publishFormDraft(db, {
    formId: 'staff.catalog',
    draftId: draft.id,
    actorId: 'customer',
    actorRole: 'super_admin',
    expectedDraftRevision: 1,
    expectedPublishedVersion: 0,
    reason: 'Actual category fixture publication',
    requestId: 'category-form-publish',
    now: 2,
  });
  const snapshot = async () => {
    const result: Record<string, unknown> = {};
    for (const table of [
      'users',
      'categories',
      'products',
      'form_config_versions',
      'form_answer_sets',
      'audit_logs',
    ]) {
      const [rows] = await control.query(
        'SELECT * FROM `' + table + '` ORDER BY id',
      );
      result[table] = rows;
    }
    return result;
  };
  const before = await snapshot();
  await stage(
    'actual current public category repository works on upgraded schema',
    async () => {
      try {
        companion = await readFile(
          'deployment/babal/mariadb-category-images.sql',
          'utf8',
        );
        await load(control, companion);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
      const rows = await listPublicDiscoveryCategories(db);
      assert.ok(rows.some((r) => r.id === 'category'));
      assert.ok(rows.every((r) => r.imageId === null));
    },
  );
  await stage(
    'additive companion preserves canonical category product user form audit history',
    async () => {
      assert.ok(companion, 'Maintained category companion must exist');
      assert.deepEqual(await snapshot(), before);
      await load(control, companion);
      assert.deepEqual(await snapshot(), before);
    },
  );
  if (companion) {
    const insert = async (
      id: string,
      category: string | null,
      actor = 'customer',
      patch: Record<string, unknown> = {},
    ) => {
      const row = {
        object: 'private/category-images/' + id,
        name: 'fixture.webp',
        mime: 'image/webp',
        size: 100,
        width: 100,
        height: 100,
        hash: 'a'.repeat(64),
        request: 'upload-' + id,
        ...patch,
      };
      await db
        .prepare(
          'INSERT INTO category_media(id,category_id,object_key,original_name,mime_type,size_bytes,width,height,content_hash,created_by,request_id,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,1)',
        )
        .bind(
          id,
          category,
          row.object as string,
          row.name as string,
          row.mime as string,
          row.size as number,
          row.width as number,
          row.height as number,
          row.hash as string,
          actor,
          row.request as string,
        )
        .run();
    };
    await insert('image-one', null);
    await insert('image-two', null);
    await insert('foreign-image', null, 'other');
    await insert('other-image', 'cat-gifts');
    const save = (
      requestId: string,
      imageId: string | null,
      expectedImageId: string | null,
      category = 'category',
      target: D1Database = db,
    ) =>
      saveTaxonomy(target, {
        kind: 'category',
        id: category,
        actorId: 'customer',
        input: {
          slug:
            category === 'category'
              ? 'fixture-category'
              : category === 'cat-home-decor'
                ? 'home-decor'
                : 'gifts',
          nameEn: category === 'category' ? 'Fixture' : 'Gifts',
          nameNe: category === 'category' ? 'परीक्षण' : 'उपहार',
          isActive: true,
          sortOrder: 1,
          imageId,
          expectedImageId,
        },
        requestId,
        now: 10,
        form: {
          requestId,
          versionId: published.id,
          answers: { formId: 'staff.catalog', version: 1, answers: [] },
        },
      });
    const imageState = async () => {
      const [assignments] = await control.query(
        'SELECT * FROM category_image_assignments ORDER BY category_id',
      );
      const [media] = await control.query(
        'SELECT * FROM category_media ORDER BY id',
      );
      const [categories] = await control.query(
        'SELECT * FROM categories ORDER BY id',
      );
      const [audits] = await control.query(
        'SELECT * FROM audit_logs ORDER BY id',
      );
      const [answers] = await control.query(
        'SELECT * FROM form_answer_sets ORDER BY id',
      );
      return { assignments, media, categories, audits, answers };
    };
    await stage(
      'actual configured category assigns replaces removes and exact replay preserves history',
      async () => {
        await save('category-attach', 'image-one', null);
        assert.equal(
          (await listPublicDiscoveryCategories(db)).find(
            (r) => r.id === 'category',
          )?.imageId,
          'image-one',
        );
        const attached = await imageState();
        await save('category-attach', 'image-one', null);
        assert.deepEqual(await imageState(), attached);
        await save('category-replace', 'image-two', 'image-one');
        assert.equal(
          (await listPublicDiscoveryCategories(db)).find(
            (r) => r.id === 'category',
          )?.imageId,
          'image-two',
        );
        await save('category-remove', null, 'image-two');
        assert.equal(
          (await listPublicDiscoveryCategories(db)).find(
            (r) => r.id === 'category',
          )?.imageId,
          null,
        );
        const state = await imageState();
        assert.equal((state.media as unknown[]).length, 4);
        assert.equal((state.answers as unknown[]).length, 3);
        const [audit] = await control.query<RowDataPacket[]>(
          "SELECT previous_json previousJson,next_json nextJson FROM audit_logs WHERE request_id='category-replace'",
        );
        assert.equal(JSON.parse(audit[0].previousJson).imageId, 'image-one');
        assert.equal(JSON.parse(audit[0].nextJson).imageId, 'image-two');
        await assert.rejects(save('category-attach', 'image-two', null));
        assert.deepEqual(await imageState(), state);
      },
    );
    await stage(
      'category ownership cross-category and stale baseline reject without parent audit or answers',
      async () => {
        const state = await imageState();
        for (const [name, id] of [
          ['foreign', 'foreign-image'],
          ['cross-category', 'other-image'],
        ]) {
          await assert.rejects(save('category-' + name, id, null));
          assert.deepEqual(await imageState(), state);
        }
        await save('category-final-attach', 'image-one', null);
        const attached = await imageState();
        await assert.rejects(save('category-stale', 'image-two', null));
        assert.deepEqual(await imageState(), attached);
      },
    );

    await stage(
      'current image baseline and ownership drift after read reject the real batch atomically',
      async () => {
        for (const mode of ['baseline', 'ownership'] as const) {
          let changed: Awaited<ReturnType<typeof imageState>> | undefined;
          const racing = new Proxy(db, {
            get(target, key) {
              if (key === 'batch')
                return async (statements: D1PreparedStatement[]) => {
                  if (mode === 'baseline')
                    await control.query(
                      "UPDATE category_image_assignments SET media_id='image-two' WHERE category_id='category'",
                    );
                  else
                    await control.query(
                      "UPDATE category_media SET category_id='cat-gifts' WHERE id='image-two'",
                    );
                  changed = await imageState();
                  return target.batch(statements);
                };
              return Reflect.get(target, key);
            },
          });
          try {
            await assert.rejects(
              save(
                'category-race-' + mode,
                'image-two',
                'image-one',
                'category',
                racing,
              ),
            );
            assert.ok(changed, 'Race must reach actual repository batch');
            assert.deepEqual(
              await imageState(),
              changed,
              'Only the external winning change remains',
            );
          } finally {
            if (mode === 'baseline')
              await control.query(
                "UPDATE category_image_assignments SET media_id='image-one' WHERE category_id='category'",
              );
            else
              await control.query(
                "UPDATE category_media SET category_id='category' WHERE id='image-two'",
              );
          }
        }
      },
    );
    await stage(
      'same media UNIQUE conflict cannot update a different category',
      async () => {
        await insert('collision-image', 'cat-home-decor');
        await control.query(
          "INSERT INTO category_image_assignments(category_id,media_id,updated_by,updated_at) VALUES ('cat-gifts','collision-image','customer',1)",
        );
        const before = await imageState();
        await assert.rejects(
          save(
            'category-media-unique-collision',
            'collision-image',
            null,
            'cat-home-decor',
          ),
        );
        assert.deepEqual(await imageState(), before);
      },
    );
    await stage(
      'all five restrictive foreign keys and media safety checks match native canonical migration',
      async () => {
        const native = await categoryMediaDb();
        try {
          await native.db
            .prepare(
              "INSERT INTO users(id,email,display_name,status,created_at,updated_at) VALUES ('customer','fixture@example.test','Fixture','active',1,1)",
            )
            .run();
          await native.db
            .prepare(
              "INSERT INTO categories(id,slug,name_en,is_active,sort_order,created_at,updated_at) VALUES ('category','fixture-category','Fixture',1,1,1,1)",
            )
            .run();
          const invalid: [string, Record<string, unknown>][] = [
            ['mime', { mime: 'image/png' }],
            ['mime-case', { mime: 'image/WEBP' }],
            ['size-zero', { size: 0 }],
            ['size-max', { size: 5242881 }],
            ['width-zero', { width: 0 }],
            ['width-max', { width: 2401 }],
            ['height-zero', { height: 0 }],
            ['height-max', { height: 1601 }],
            ['hash-short', { hash: 'a'.repeat(63) }],
          ];
          for (const [name, patch] of invalid) {
            const before = await imageState();
            await assert.rejects(
              insert('invalid-' + name, null, 'customer', patch),
              name + ' Maria',
            );
            const r = {
              mime: 'image/webp',
              size: 100,
              width: 100,
              height: 100,
              hash: 'a'.repeat(64),
              ...patch,
            };
            await assert.rejects(
              native.db
                .prepare(
                  "INSERT INTO category_media(id,category_id,object_key,original_name,mime_type,size_bytes,width,height,content_hash,created_by,request_id,created_at) VALUES (?,NULL,?,'fixture.webp',?,?,?,?,?,'customer',?,1)",
                )
                .bind(
                  'invalid-' + name,
                  'native/' + name,
                  r.mime as string,
                  r.size as number,
                  r.width as number,
                  r.height as number,
                  r.hash as string,
                  name,
                )
                .run(),
              name + ' native',
            );
            assert.deepEqual(await imageState(), before);
          }
          for (const [name, sql, args] of [
            [
              'media-category',
              "INSERT INTO category_media(id,category_id,object_key,original_name,mime_type,size_bytes,width,height,content_hash,created_by,request_id,created_at) VALUES ('bad-category',?,'bad-category','bad.webp','image/webp',1,1,1,?,'customer','bad-category',1)",
              ['missing', 'a'.repeat(64)],
            ],
            [
              'media-actor',
              "INSERT INTO category_media(id,object_key,original_name,mime_type,size_bytes,width,height,content_hash,created_by,request_id,created_at) VALUES ('bad-actor','bad-actor','bad.webp','image/webp',1,1,1,?, ?,'bad-actor',1)",
              ['a'.repeat(64), 'missing'],
            ],
            [
              'assignment-category',
              "INSERT INTO category_image_assignments VALUES (?,NULL,'customer',1)",
              ['missing'],
            ],
            [
              'assignment-media',
              "INSERT INTO category_image_assignments VALUES ('cat-pottery',?,'customer',1)",
              ['missing'],
            ],
            [
              'assignment-actor',
              "INSERT INTO category_image_assignments VALUES ('cat-pottery',NULL,?,1)",
              ['missing'],
            ],
          ] as [string, string, (string | number)[]][]) {
            const before = await imageState();
            await assert.rejects(
              db
                .prepare(sql)
                .bind(...args)
                .run(),
              name,
            );
            assert.deepEqual(await imageState(), before);
          }
          for (const sql of [
            "DELETE FROM category_media WHERE id='image-one'",
            "DELETE FROM categories WHERE id='category'",
            "DELETE FROM users WHERE id='customer'",
          ]) {
            const before = await imageState();
            await assert.rejects(db.prepare(sql).run());
            assert.deepEqual(await imageState(), before);
          }
          const [fks] = await control.query<RowDataPacket[]>(
            "SELECT TABLE_NAME tableName,CONSTRAINT_NAME name,DELETE_RULE deleteRule FROM information_schema.REFERENTIAL_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=? AND TABLE_NAME IN ('category_media','category_image_assignments') ORDER BY TABLE_NAME,CONSTRAINT_NAME",
            [database],
          );
          assert.equal(fks.length, 5);
          assert.ok(fks.every((r) => r.deleteRule === 'RESTRICT'));
          await writeFile(
            evidence + '/fk-metadata-' + prefix + '.json',
            JSON.stringify(fks, null, 2),
          );
        } finally {
          native.dispose();
        }
      },
    );
    await stage(
      'repeat additive import preserves assigned media catalogue and form audit rows',
      async () => {
        const state = await imageState();
        await load(control, companion!);
        await load(control, companion!);
        assert.deepEqual(await imageState(), state);
      },
    );
    await stage(
      'fresh full generated bootstrap includes usable category image parents and checks',
      async () => {
        const full = prefix + '_fullbase';
        assert.match(full, /^category_deploy_\d+_fullbase$/);
        await control.query(
          'CREATE DATABASE `' +
            full +
            '` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci',
        );
        await control.query('USE `' + full + '`');
        await load(
          control,
          await readFile('deployment/babal/mariadb-schema.sql', 'utf8'),
        );
        const [rows] = await control.query<RowDataPacket[]>(
          'SELECT COUNT(*) n FROM categories c LEFT JOIN category_image_assignments a ON a.category_id=c.id LEFT JOIN category_media m ON m.id=a.media_id',
        );
        assert.equal(Number(rows[0].n), 10);
        const [fks] = await control.query<RowDataPacket[]>(
          "SELECT CONSTRAINT_NAME FROM information_schema.REFERENTIAL_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=? AND TABLE_NAME IN ('category_media','category_image_assignments')",
          [full],
        );
        assert.equal(fks.length, 5);
        await control.query('USE `' + database + '`');
      },
    );
  }
} finally {
  await control.end();
  await mkdir(evidence, { recursive: true });
  await writeFile(
    evidence + '/' + prefix + '.json',
    JSON.stringify(
      {
        database,
        loadedSourceHashes,
        baselineSha256: createHash('sha256')
          .update(await readFile(evidence + '/baseline-mariadb-schema.sql'))
          .digest('hex'),
        observations,
      },
      null,
      2,
    ),
  );
}
process.exit(observations.every((o) => o.status === 'PASS') ? 0 : 1);
