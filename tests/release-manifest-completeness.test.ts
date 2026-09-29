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

interface Manifest {
  release: string;
  migrations: { path: string; usage: string; sha256: string }[];
  requiredTables: Record<string, string[]>;
  requiredTriggers: Record<string, string[]>;
}

// Omitting a maintained companion must fail even if the checked-in manifest
// and the generator omit the same file. Expectations come from the SQL inventory.
void test('release generator covers the maintained non-reset SQL inventory', async (t) => {
  const sqlRoot = fileURLToPath(
    new URL('../deployment/babal/', import.meta.url),
  );
  const sqlNames = (await readdir(sqlRoot, { recursive: true }))
    .map((name) => name.split(sep).join('/'))
    .filter((name) => name.endsWith('.sql'))
    .sort();
  const root = await mkdtemp(join(tmpdir(), 'hb-manifest-completeness-'));
  const release = 'fixture-manifest-completeness';
  const manifestPath = join(root, 'deployment/babal/release-manifest.json');
  const generate = () =>
    promisify(execFile)(
      process.execPath,
      [
        fileURLToPath(
          new URL('../scripts/generate-release-manifest.mjs', import.meta.url),
        ),
      ],
      { cwd: root, env: { ...process.env, HASTABAZAAR_RELEASE_ID: release } },
    );
  try {
    for (const name of sqlNames) {
      const destination = join(root, 'deployment/babal', name);
      await mkdir(dirname(destination), { recursive: true });
      await copyFile(join(sqlRoot, name), destination);
    }
    await generate();
    const first = await readFile(manifestPath, 'utf8');
    const manifest = JSON.parse(first) as Manifest;
    const names = manifest.migrations.map(({ path }) => path);
    const expectedPaths = sqlNames
      .filter((name) => name !== 'mariadb-reset-empty-import.sql')
      .map((name) => 'deployment/babal/' + name);

    await t.test(
      'each companion is included exactly once with its actual hash and usage',
      async () => {
        assert.deepEqual(
          [...names].sort(),
          expectedPaths,
          'Every maintained non-reset SQL file must be discoverable for release preparation',
        );
        assert.equal(
          new Set(names).size,
          names.length,
          'Duplicate migrations are unsafe',
        );
        assert.equal(names[0], 'deployment/babal/mariadb-schema.sql');
        assert.equal(
          names.includes('deployment/babal/mariadb-reset-empty-import.sql'),
          false,
        );
        for (const migration of manifest.migrations) {
          assert.equal(
            migration.usage,
            migration.path === 'deployment/babal/mariadb-schema.sql'
              ? 'empty-database-only'
              : 'additive-maintenance',
            migration.path,
          );
          const sql = await readFile(join(root, migration.path));
          assert.equal(
            migration.sha256,
            createHash('sha256').update(sql).digest('hex'),
            migration.path,
          );
        }
      },
    );

    await t.test('prerequisites precede their companions', () => {
      for (const [before, after] of [
        ['mariadb-form-catalog.sql', 'mariadb-feedback-delivery-jobs.sql'],
        ['mariadb-form-catalog.sql', 'mariadb-promo-codes.sql'],
        ['mariadb-form-catalog.sql', 'mariadb-loyalty-points.sql'],
        [
          'mariadb-first-cod-review.sql',
          'mariadb-first-cod-evidence-guards.sql',
        ],
      ]) {
        const beforeIndex = names.indexOf('deployment/babal/' + before);
        const afterIndex = names.indexOf('deployment/babal/' + after);
        assert.ok(
          beforeIndex >= 0 && afterIndex >= 0 && beforeIndex < afterIndex,
          `${before} must precede ${after}`,
        );
      }
    });

    await t.test(
      'form, privacy, contact, and COD readiness objects are discoverable',
      () => {
        const columns: Record<string, string[]> = {
          form_config_versions: [
            'id',
            'form_id',
            'config_json',
            'status',
            'published_by',
          ],
          form_answer_sets: [
            'id',
            'config_version_id',
            'subject_id',
            'actor_id',
            'answers_json',
          ],
          data_rights_legal_holds: [
            'user_id',
            'reason',
            'placed_at',
            'released_at',
          ],
          address_answer_owner_tombstones: [
            'address_id',
            'user_id',
            'deletion_request_id',
            'deleted_at',
          ],
          feedback_delivery_jobs: [
            'request_id',
            'config_version_id',
            'feedback_json',
            'status',
            'lease_token',
          ],
          account_email_verifications: ['user_id', 'email', 'verified_at'],
          account_phone_verifications: ['user_id', 'phone', 'verified_at'],
          account_contact_challenges: [
            'token_hash',
            'user_id',
            'channel',
            'code_hash',
            'consumed_at',
          ],
          local_contact_captures: [
            'token_hash',
            'user_id',
            'channel',
            'simulation_label',
          ],
          first_cod_reviews: [
            'order_id',
            'customer_id',
            'total_paisa',
            'status',
            'confirmed_by',
            'reason',
            'request_id',
          ],
        };
        for (const [table, requiredColumns] of Object.entries(columns)) {
          assert.ok(
            table in manifest.requiredTables,
            `${table} must be discoverable`,
          );
          for (const column of requiredColumns) {
            assert.ok(
              manifest.requiredTables[table].includes(column),
              `${table}.${column}`,
            );
          }
        }
        for (const trigger of [
          'trg_form_config_versions_published_update',
          'trg_form_config_versions_published_delete',
          'account_phone_change_revoke',
          'account_email_change_revoke',
          'first_cod_review_immutable',
          'first_cod_review_confirm_active',
          'first_cod_audit_no_update',
          'first_cod_audit_no_delete',
          'first_cod_orders_insert',
          'first_cod_items_insert',
          'first_cod_jobs_insert',
          'first_cod_parcels_insert',
          'first_cod_delivery_insert',
          'first_cod_shipments_insert',
          'first_cod_orders_update',
          'first_cod_items_update',
          'first_cod_jobs_update',
          'first_cod_parcels_update',
          'first_cod_delivery_update',
          'first_cod_shipments_update',
          'first_cod_evidence_complete_insert',
          'first_cod_evidence_complete_update',
          'first_cod_review_no_delete',
        ]) {
          assert.ok(
            trigger in manifest.requiredTriggers,
            `${trigger} must be discoverable`,
          );
        }
        assert.equal('IF' in manifest.requiredTriggers, false);
      },
    );

    await t.test(
      'fixed release input yields byte-identical repeated output',
      async () => {
        assert.equal(manifest.release, release);
        await generate();
        assert.equal(await readFile(manifestPath, 'utf8'), first);
      },
    );
  } finally {
    const fixtureRelative = relative(resolve(tmpdir()), resolve(root));
    assert.ok(
      fixtureRelative &&
        !fixtureRelative.startsWith('..') &&
        !fixtureRelative.includes(':'),
    );
    await rm(root, { recursive: true, force: true });
  }
});
