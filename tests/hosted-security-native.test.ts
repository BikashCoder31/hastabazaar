import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import mysql, { type Pool } from 'mysql2/promise';
import { env } from '../lib/runtime/node-bindings';
import { stagingNativeFixture } from './helpers/staging-native-fixture';
import { seedIncentiveCustomer } from './helpers/incentive-db';
import {
  createHostedSecurityPolicy,
  inspectHostedSecurityReadiness,
} from '../lib/security/hosted-policy';
import { buildHostedSecurityCli } from '../scripts/build-hosted-security-cli.mjs';
import {
  readSecurityInitialization,
  markSecurityInitialized,
} from '../lib/security/runtime-policy';
import { SecurityStore } from '../lib/security/store';
import { MfaService } from '../lib/security/mfa';
import { totpAtCounter } from '../lib/security/crypto';

const enabled = process.env.HATSKALA_STAGING_NATIVE === '1';
const pools: Pool[] = [],
  originalCreatePool = mysql.createPool;
if (enabled) {
  await stagingNativeFixture();
  mysql.createPool = ((...args: Parameters<typeof originalCreatePool>) => {
    const pool = originalCreatePool(...args);
    pools.push(pool);
    return pool;
  }) as typeof originalCreatePool;
}
after(async () => {
  mysql.createPool = originalCreatePool;
  for (const pool of pools) await pool.end();
});

void test(
  'native MariaDB hosted provisioning, enrollment and restarted recovery preserve one-use protection',
  { skip: !enabled },
  async () => {
    const temporary = await mkdtemp(join(tmpdir(), 'hosted-native-security-'));
    try {
      const db = env.DB;
      await assert.rejects(
        env.EMAIL.send({
          to: 'fixture@local.hastabazaar.test',
          subject: 'Native isolation check',
          text: 'Must never be captured.',
          html: '<p>Must never be captured.</p>',
        }),
        /Native verification cannot dispatch/,
      );
      const config = {
        HASTABAZAAR_RUNTIME_ENV: 'production',
        APP_ORIGIN: 'https://native-security.example.test',
        HASTABAZAAR_SECURITY_KEY: process.env.HASTABAZAAR_NATIVE_SECURITY_KEY,
        HASTABAZAAR_SECURITY_POLICY_ROOT: join(temporary, 'policy'),
      };
      await seedIncentiveCustomer(db, 'native-security-owner');
      await db
        .prepare(
          "INSERT INTO user_roles(user_id,role,assigned_at) VALUES('native-security-owner','super_admin',1)",
        )
        .run();
      const application = join(temporary, 'application');
      await mkdir(application);
      await buildHostedSecurityCli(application);
      const operatorEnvironment = {
        PATH: process.env.PATH,
        SYSTEMROOT: process.env.SYSTEMROOT,
        TEMP: process.env.TEMP,
        TMPDIR: process.env.TMPDIR,
        DB_HOST: process.env.DB_HOST,
        DB_PORT: process.env.DB_PORT,
        DB_NAME: process.env.DB_NAME,
        DB_USER: process.env.DB_USER,
        DB_PASSWORD: process.env.DB_PASSWORD,
        ...config,
      };
      const runOperator = (
        action: string,
        changes: Record<string, string | undefined> = {},
      ) =>
        spawnSync(process.execPath, ['hosted-security.mjs', action], {
          cwd: application,
          env: { ...operatorEnvironment, ...changes, NODE_ENV: 'production' },
          encoding: 'utf8',
          timeout: 20_000,
        });
      assert.equal(runOperator('--provision-new-host').status, 0);
      assert.equal(runOperator('--check-readiness').status, 2);
      const bindings = () => ({
        ...config,
        SECURITY_POLICY: createHostedSecurityPolicy(config),
      });
      const store = new SecurityStore(
        db,
        config.HASTABAZAAR_SECURITY_KEY!,
        await readSecurityInitialization(bindings()),
      );
      const rows = await db
        .prepare(
          "SELECT DISTINCT u.id FROM users u JOIN user_roles r ON r.user_id=u.id WHERE u.status='active' AND r.role IN ('admin','super_admin') ORDER BY u.id",
        )
        .all<{ id: string }>();
      await store.initialize(
        rows.results.map((row) => row.id),
        60_000,
      );
      let index = 0;
      for (const { id } of rows.results) {
        const sessionHash = (++index).toString(16).padStart(64, '0'),
          service = new MfaService(store);
        const setup = await service.beginSetup({
          userId: id,
          sessionHash,
          now: 60_000,
        });
        const confirmation = await service.confirmSetup({
          userId: id,
          sessionHash,
          setupId: setup.setupId,
          code: totpAtCounter(setup.secret, 2),
          now: 60_000,
        });
        await markSecurityInitialized(bindings());
        await service.activateSetup({
          userId: id,
          sessionHash,
          setupId: setup.setupId,
          recoverySaved: true,
          passwordVerifiedAt: 60_000,
          now: 60_000,
        });
        const restarted = new MfaService(
          new SecurityStore(
            db,
            config.HASTABAZAAR_SECURITY_KEY!,
            await readSecurityInitialization(bindings()),
          ),
        );
        await restarted.verifyRecovery({
          userId: id,
          sessionHash,
          code: confirmation.codes[0],
          passwordVerifiedAt: 61_000,
          now: 61_000,
        });
        await assert.rejects(
          restarted.verifyRecovery({
            userId: id,
            sessionHash,
            code: confirmation.codes[0],
            passwordVerifiedAt: 61_000,
            now: 61_000,
          }),
        );
        assert.equal(
          (await restarted.store.readAccount(id))?.value.recovery?.hashes
            .length,
          9,
        );
        if (id === 'native-security-owner') {
          const before = (await restarted.store.readAccount(id))!;
          await assert.rejects(
            restarted.disable({
              userId: id,
              sessionHash,
              code: confirmation.codes[1],
              recovery: true,
              passwordVerifiedAt: 61_000,
              now: 61_000,
              linkedStatements: [
                db.prepare(
                  "INSERT INTO operation_transaction_guards(id,valid) VALUES('native-disable-rollback',0)",
                ),
              ],
            }),
          );
          assert.equal(
            (await restarted.store.readAccount(id))!.raw,
            before.raw,
            'Failed linked authorization must roll back the native disable',
          );
          await restarted.disable({
            userId: id,
            sessionHash,
            code: confirmation.codes[1],
            recovery: true,
            passwordVerifiedAt: 61_000,
            now: 61_000,
          });
          assert.equal(
            (await restarted.store.readAccount(id))!.value.status,
            'disabled',
          );
          assert.equal(
            await restarted
              .hasFreshProof({ userId: id, sessionHash, now: 61_000 })
              .catch(() => false),
            false,
          );
          await assert.rejects(
            restarted.verifyRecovery({
              userId: id,
              sessionHash,
              code: confirmation.codes[2],
              passwordVerifiedAt: 61_000,
              now: 61_000,
            }),
          );
          const replacement = await restarted.beginSetup({
            userId: id,
            sessionHash,
            now: 90_000,
          });
          const codes = await restarted.confirmSetup({
            userId: id,
            sessionHash,
            setupId: replacement.setupId,
            code: totpAtCounter(replacement.secret, 3),
            now: 90_000,
          });
          await restarted.activateSetup({
            userId: id,
            sessionHash,
            setupId: replacement.setupId,
            recoverySaved: true,
            passwordVerifiedAt: 90_000,
            now: 90_000,
          });
          await restarted.verifyRecovery({
            userId: id,
            sessionHash,
            code: codes.codes[0],
            passwordVerifiedAt: 91_000,
            now: 91_000,
          });
          assert.equal(
            (await restarted.store.readAccount(id))!.value.generation,
            before.value.generation + 2,
          );
        }
      }
      assert.equal(
        (await inspectHostedSecurityReadiness(bindings(), db)).ready,
        true,
      );
      const readiness = runOperator('--check-readiness');
      assert.equal(readiness.status, 0);
      assert.equal(JSON.parse(readiness.stdout).ready, true);
      assert.equal(
        runOperator('--provision-new-host').status,
        1,
        'Existing protected data cannot be reprovisioned',
      );
      const recovered = {
        HASTABAZAAR_SECURITY_POLICY_ROOT: join(temporary, 'recovered-policy'),
      };
      assert.equal(
        runOperator('--recover-existing-host', {
          ...recovered,
          HASTABAZAAR_SECURITY_KEY: Buffer.alloc(32, 91).toString('base64url'),
        }).status,
        1,
      );
      assert.equal(runOperator('--recover-existing-host', recovered).status, 0);
      assert.equal(runOperator('--check-readiness', recovered).status, 0);
      assert.equal(
        runOperator('--recover-existing-host', recovered).status,
        1,
        'An existing policy directory cannot be replaced',
      );
      for (const { id } of rows.results)
        assert.equal(
          (await store.readAccount(id))?.value.recovery?.hashes.length,
          9,
          'CLI recovery must preserve consumed recovery codes',
        );
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  },
);
