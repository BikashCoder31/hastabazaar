import assert from 'node:assert/strict';
import { incentiveReportDatabase } from './incentive-report-database';
import { managedIdentityDocument, managedIdentityFields } from './managed-identity-fixture';
import { parseSellerApplication } from '../../lib/sellers/application';
import { createSellerApplication } from '../../lib/db/repositories/seller-applications';

export const makerNow = Date.now() - 60_000;
export async function companyStoreMakerFixture() {
  const fixture = await incentiveReportDatabase();
  const { sqlite, db } = fixture;
  sqlite.exec(`INSERT INTO users(id,email,display_name,status,created_at,updated_at) VALUES
    ('reviewer','reviewer@local.hastabazaar.test','Fictional reviewer','active',1,1);
    INSERT INTO user_roles(user_id,role,assigned_at) VALUES ('reviewer','super_admin',1);`);
  const form = new FormData();
  for (const [key, value] of Object.entries({
    hasBusinessTaxRegistration: 'no', applicantType: 'individual', legalName: 'Fictional Maker',
    tradingName: 'Fictional Maker Studio', email: 'maker@local.hastabazaar.test', phone: '9800000000',
    province: 'Bagmati', district: 'Kathmandu', municipality: 'Kathmandu', locality: 'Fictional workshop',
    publicCity: 'Kathmandu', businessDescription: 'Fictional handmade products.', productCategories: 'Clay work',
    experienceCraft: 'Clay work', experienceBand: 'less_than_one_year', applicationAcknowledgement: 'yes',
    ...managedIdentityFields(),
  })) form.set(key, value);
  const parsed = parseSellerApplication(form);
  assert.ok(parsed.input, parsed.errors.join('\n'));
  await createSellerApplication(db, { sellerId: 'maker', userId: 'maker-user', input: parsed.input,
    applicationReference: 'APP-FICTIONAL-MAKER', documents: [managedIdentityDocument('maker')], now: makerNow });
  let beforeBatch: (() => void | Promise<void>) | undefined;
  const guardedDb = { prepare: db.prepare.bind(db), async batch(statements: D1PreparedStatement[]) {
    const callback = beforeBatch; beforeBatch = undefined; await callback?.();
    return db.batch(statements);
  } } as D1Database;
  return { ...fixture, db: guardedDb, sellerId: 'maker', actorId: 'maker-user', now: makerNow,
    setBeforeBatch(callback: () => void | Promise<void>) { beforeBatch = callback; } };
}
