import assert from 'node:assert/strict';
import test from 'node:test';
import { createIncentiveDb } from './helpers/incentive-db';
import {
  mariaStatements,
  seedCompatibility,
  conservation,
  jsonGuards,
  promoImmutable,
  walletFailure,
  concurrency,
  malformedClaimSnapshots,
  seedLegacy,
  legacySnapshot,
  typedEmptyFields,
  promoLimitRaces,
} from '../scripts/test-incentives-mariadb';

void test('DELIMITER parser retains trigger bodies and consumes client directives', () => {
  const sql =
    '-- fixture\nCREATE TABLE x(id INT);\nDELIMITER $$\nCREATE TRIGGER t BEFORE INSERT ON x FOR EACH ROW BEGIN\nSET NEW.id=1;\nEND$$\nDELIMITER ;\nINSERT INTO x VALUES(1);\n';
  const parsed = mariaStatements(sql);
  assert.equal(parsed.length, 3);
  assert.match(parsed[1], /SET NEW.id=1;\nEND$/);
  assert.ok(parsed.every((s) => !s.includes('DELIMITER')));
  assert.throws(
    () => mariaStatements('CREATE TABLE broken(id INT)'),
    /Unterminated/,
  );
});
void test('each database conserves linked points redemption', async () => {
  const f = await createIncentiveDb();
  try {
    await seedCompatibility(f.db);
    await jsonGuards(f.db);
    await typedEmptyFields(f.db);
    await conservation(f.db);
    await walletFailure(
      f.db,
      () =>
        f.db
          .prepare(
            "CREATE TRIGGER task12_wallet_fail BEFORE INSERT ON wallet_entries WHEN NEW.kind='loyalty_redemption' BEGIN SELECT RAISE(ABORT,'task12_injected_wallet_failure'); END",
          )
          .run(),
      () => f.db.prepare('DROP TRIGGER task12_wallet_fail').run(),
    );
    await concurrency(f.db);
    await malformedClaimSnapshots(f.db);
    await promoImmutable(f.db);
    await promoLimitRaces(f.db);
  } finally {
    await f.dispose();
  }
});
void test('pre-feature gift order cancellation and referral history survive both incentive migrations', async () => {
  let before: unknown;
  const f = await createIncentiveDb({
    beforePromo: async (db) => {
      await seedLegacy(db);
      before = await legacySnapshot(db);
    },
  });
  try {
    assert.deepEqual(await legacySnapshot(f.db), before);
  } finally {
    await f.dispose();
  }
});
