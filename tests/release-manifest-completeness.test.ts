import assert from 'node:assert/strict';
import { copyReleaseManifestInputs } from './helpers/copy-release-manifest-inputs';
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
  ownerAppliedMigrations: {
    path: string; usage: string; sha256: string;
    d1: { path: string; sha256: string };
    requiresWriterPause: boolean;
    requiredChecks: Record<string, string>;
    requiredExactTriggerDefinitions: Record<string, string>;
    requiredTables: Record<string, string[]>;
    requiredTriggerShapes: Record<string, { timing: string; event: string; table: string }>;
  }[];
  requiredTables: Record<string, string[]>;
  requiredTriggers: Record<string, string[]>;
}

// The prospective bundle has its own exact inventory assertions in
// order-refund-migration-registration.test.mjs. Keep this historical oracle
// independent of either generator so an orphaned SQL file still fails.
const orderRefundOptIn = new Set([
  'mariadb-order-item-pricing-snapshots.sql',
  'mariadb-seller-shipment-delivery-allocations.sql',
  'mariadb-priced-return-effects.sql',
  'mariadb-seller-dispatch-evidence.sql',
  'mariadb-refund-route-reservations.sql',
  'mariadb-priced-order-acceptance-lock.sql',
]);
const ownerAppliedMigrations = [
  'mariadb-customer-cod-confirmation.sql',
  'mariadb-delivery-failure-reasons.sql',
  'mariadb-seller-staff-notes.sql',
  'mariadb-cancellation-cause.sql',
  'mariadb-packed-parcel-weight.sql',
  'mariadb-occasion-discovery.sql',
  'mariadb-occasion-images.sql',
  'mariadb-delivery-partners.sql',
];

// Omitting a maintained companion must fail even if the checked-in manifest
// and the generator omit the same file. Expectations come from the SQL inventory.
void test('historical release generation covers its maintained non-reset SQL inventory', async (t) => {
  const sqlRoot = fileURLToPath(
    new URL('../deployment/babal/', import.meta.url),
  );
  const sqlNames = (await readdir(sqlRoot, { recursive: true }))
    .map((name) => name.split(sep).join('/'))
    .filter((name) => name.endsWith('.sql') && name !== 'check-production-schema.sql')
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
    await copyReleaseManifestInputs(root);
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
      .filter((name) => name !== 'mariadb-reset-empty-import.sql' && !orderRefundOptIn.has(name) && !ownerAppliedMigrations.includes(name))
      .map((name) => 'deployment/babal/' + name);

    await t.test(
      'each companion is included exactly once with its actual hash and usage',
      async () => {
        assert.deepEqual(
          [...names].sort(),
          expectedPaths,
          'Every historical non-reset SQL file must be discoverable for release preparation',
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
            // Defaults activate only a fresh database, never a populated upgrade.
            ['deployment/babal/mariadb-schema.sql', 'deployment/babal/mariadb-fresh-bootstrap-defaults.sql'].includes(migration.path)
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

    await t.test('owner-applied SQL is retained without adding it to automated release maintenance', async () => {
      for (const name of ownerAppliedMigrations) {
        assert.ok(sqlNames.includes(name), `${name} must be available for the owner`);
        assert.ok(!names.includes('deployment/babal/' + name), `${name} requires owner application`);
      }
      const entries = manifest.ownerAppliedMigrations;
      assert.deepEqual(entries.map(entry => entry.path), ownerAppliedMigrations.map(name => 'deployment/babal/' + name));
      const tracked = JSON.parse(await readFile(new URL('../deployment/babal/release-manifest.json', import.meta.url), 'utf8'));
      assert.deepEqual(tracked.ownerAppliedMigrations, entries);
      const required = [
        { first_cod_reviews: ['hold_source'], users: ['cod_confirmation_required'] },
        { shipping_jobs: ['delivery_failure_reason'] },
        { seller_staff_notes: ['id', 'seller_id', 'author_user_id', 'body', 'created_at', 'pinned'] },
        { order_cancellation_events: ['cause'], order_cancellation_reviews: ['cause'] },
        { products: ['packed_weight_grams'], seller_parcel_weights: ['order_id', 'seller_id', 'weight_grams', 'item_count', 'recorded_by', 'request_id', 'recorded_at'] },
        { occasion_discovery: ['occasion_id', 'group_name', 'group_sort_order', 'season_starts_at', 'season_ends_at'] },
        { occasion_media: ['id', 'occasion_id', 'object_key', 'original_name', 'mime_type', 'size_bytes', 'width', 'height', 'content_hash', 'created_by', 'request_id', 'created_at'],
          occasion_image_assignments: ['occasion_id', 'media_id', 'updated_by', 'updated_at'] },
        { delivery_partners: ['id', 'name', 'status', 'booking_mode', 'collects_cod', 'tracking_pattern', 'default_slot', 'revision', 'created_at', 'updated_at'],
          shipping_parcels: ['delivery_partner_id'] },
      ];
      for (const [index, entry] of entries.entries()) {
        assert.equal(entry.usage, 'owner-applied');
        assert.equal(entry.requiresWriterPause, index === 0);
        const slug = ownerAppliedMigrations[index].slice('mariadb-'.length).replaceAll('-', '_');
        assert.equal(entry.d1.path, 'drizzle/0' + (164 + index) + '_' + slug);
        for (const { path, sha256 } of [entry, entry.d1]) {
          const bytes = await readFile(join(root, path));
          assert.equal(sha256, createHash('sha256').update(bytes).digest('hex'), path);
        }
        assert.equal(Object.keys(entry.requiredChecks).length, [2, 1, 0, 2, 1, 1, 4, 6][index]);
        assert.deepEqual(Object.keys(entry.requiredExactTriggerDefinitions), Object.keys(entry.requiredTriggerShapes));
        if (index === 0) {
          assert.deepEqual(entry.requiredChecks, {
            'first_cod_reviews.chk_first_cod_hold_source': "HEX(hold_source) IN (HEX('first_order'), HEX('customer_flag'))",
            'first_cod_reviews.chk_first_cod_hold_total': "total_paisa BETWEEN 0 AND 9007199254740991 AND (hold_source='customer_flag' OR total_paisa>=500000)",
          });
          const sql = await readFile(join(root, entry.path), 'utf8');
          const body = sql.slice(sql.indexOf('FOR EACH ROW ') + 'FOR EACH ROW '.length, sql.indexOf('END$$') + 3);
          assert.equal(entry.requiredExactTriggerDefinitions.first_cod_review_immutable, body);
        }
        assert.deepEqual(entry.requiredTables, required[index]);
        assert.deepEqual(entry.requiredTriggerShapes, index === 0 ? {
          first_cod_review_immutable: { timing: 'BEFORE', event: 'UPDATE', table: 'first_cod_reviews' },
        } : {});
      }
    });

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
          marketplace_fee_waiver_control: ['id', 'revision'],
          marketplace_fee_waiver_campaigns: ['id', 'revision', 'created_at', 'updated_at'],
          marketplace_fee_waiver_revisions: ['campaign_id', 'revision', 'state', 'name', 'description', 'starts_at', 'ends_at', 'created_by', 'request_id', 'created_at'],
          marketplace_fee_waiver_requests: ['request_id', 'actor_id', 'auth_subject', 'command_json', 'response_json', 'created_at'],
          order_item_marketplace_fees: ['order_item_id', 'standard_bps', 'base_paisa', 'standard_paisa', 'waived_paisa', 'net_paisa', 'campaign_id', 'campaign_revision', 'created_at'],
          loyalty_config: ['scheduled_revision', 'scheduled_for', 'scheduled_unpause'],
          loyalty_revisions: ['weekly_points_json', 'grace_enabled'],
          loyalty_daily_claims: ['cycle_day', 'cycle_number', 'grace_used', 'grace_applied', 'cycle_reset_reason'],
          managed_maker_application_details: ['agreement_language', 'agreement_form_version_id'],
          seller_participation_profiles: ['accepted_managed_detail_id'],
          managed_commercial_snapshots: ['accepted_managed_detail_id', 'maker_name_snapshot', 'company_store_name_snapshot', 'company_legal_name_snapshot'],
          seller_route_transition_applications: ['registered_terms_snapshot_json'],
          managed_payout_allocations: ['payout_id', 'entitlement_id', 'amount_paisa', 'disposition', 'created_at', 'terminal_at', 'request_id', 'actor_id', 'reserved_entitlement_key'],
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
          'loyalty_schedule_insert_guard', 'loyalty_schedule_update_guard', 'loyalty_schedule_claim_guard',
          'managed_allocation_preserve_identity', 'managed_allocation_no_delete',
          'managed_payout_preserve_identity', 'managed_payout_no_delete', 'managed_payout_preserve_terminal',
          'managed_legacy_payout_link_no_update', 'managed_legacy_payout_link_no_delete',
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
