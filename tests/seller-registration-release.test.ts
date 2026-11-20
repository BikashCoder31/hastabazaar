import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, mkdirSync, copyFileSync, cpSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

void test('hosted release checks require all seller registration tables and additive upgrades', () => {
  const root = mkdtempSync(join(tmpdir(), 'seller-release-'));
  try {
    mkdirSync(join(root, 'scripts'), { recursive: true });
    mkdirSync(join(root, 'lib/operations'), { recursive: true });
    copyFileSync('scripts/generate-release-manifest.mjs', join(root, 'scripts/generate-release-manifest.mjs'));
    for (const name of [
      'fee-schema-readiness.mjs',
      'sql-schema-inventory.mjs',
      'bootstrap-completion-contract.json',
      'check-parity-contract.json',
      'text-length-parity-contract.json',
    ]) {
      const path = `lib/operations/${name}`;
      copyFileSync(path, join(root, path));
    }
    cpSync('deployment/babal', join(root, 'deployment/babal'), { recursive: true });
    execFileSync(process.execPath, ['scripts/generate-release-manifest.mjs'], { cwd: root, stdio: 'pipe' });
    const manifest = JSON.parse(readFileSync(join(root, 'deployment/babal/release-manifest.json'), 'utf8'));
    for (const table of ['seller_application_drafts', 'seller_application_draft_uploads', 'seller_registration_intakes']) {
      assert.ok(manifest.requiredTables[table]?.length > 0, `Missing release schema check: ${table}`);
    }
    for (const file of ['mariadb-seller-application-drafts.sql', 'mariadb-seller-registration-intakes.sql']) {
      assert.equal(manifest.migrations.find((m: { path: string }) => m.path === `deployment/babal/${file}`)?.usage, 'additive-maintenance');
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
});
