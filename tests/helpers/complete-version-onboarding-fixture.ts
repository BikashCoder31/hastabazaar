import assert from 'node:assert/strict';
import {incentiveReportDatabase} from './incentive-report-database';
import {historicalCommissionFixture} from './historical-commission-fixture';
import type {SellerApplicationDocument} from '../../lib/sellers/application';

/** Environment facts only: no applicant, seller, product, order or payment is pre-created. */
export async function completeVersionOnboardingFixture() {
  const f = await incentiveReportDatabase();
  try {
    assert.ok(f.sqlite.prepare('PRAGMA database_list').all().every(row => row.file === ''));
    const now = Date.now() - 60_000;
    for (const [id, role] of [['reviewer', 'super_admin'], ['applicant', 'customer'], ['customer', 'customer'], ['foreign', 'customer']] as const) {
      f.sqlite.prepare("INSERT INTO users(id,auth_subject,email,display_name,status,created_at,updated_at) VALUES(?,?,?,?,'active',?,?)")
        .run(id, id, `${id}@local.hastabazaar.test`, `Fictional ${id}`, now, now);
      f.sqlite.prepare('INSERT INTO user_roles(user_id,role,assigned_at) VALUES(?,?,?)').run(id, role, now);
      f.sqlite.prepare('INSERT INTO account_email_verifications(user_id,email,verified_at) VALUES(?,?,?)')
        .run(id, `${id}@local.hastabazaar.test`, now);
    }
    historicalCommissionFixture(f.sqlite, 'reviewer');
    // Fixed original fictional terms; native acceptance is exercised by the applicant.
    return {...f, now};
  } catch (error) { f.dispose(); throw error; }
}

/** Synthetic validated-object metadata, explicitly not file transport or real evidence. */
export function onboardingDocument(kind: SellerApplicationDocument['kind']): SellerApplicationDocument {
  return {id: `journey-${kind}`, kind, objectKey: `private/seller-documents/journey-seller/journey-${kind}`,
    originalName: 'fictional-evidence.pdf', mimeType: 'application/pdf', sizeBytes: 20};
}
