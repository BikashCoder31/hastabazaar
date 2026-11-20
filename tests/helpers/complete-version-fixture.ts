import assert from 'node:assert/strict';
import { companyStoreMakerFixture } from './company-store-maker-fixture';

/** No connection/path argument: this fixture can only allocate a new in-memory database. */
export async function completeVersionFixture(now = 1_793_491_200_000) {
  const f = await companyStoreMakerFixture(now);
  try {
    assert.ok(f.sqlite.prepare('PRAGMA database_list').all().every(row => row.file === ''), 'Only disposable in-memory fixtures are permitted.');
    f.sqlite.exec("UPDATE users SET auth_subject='reviewer' WHERE id='reviewer'");
    for (const [id, role] of [['applicant', 'customer'], ['registered-owner', 'seller'], ['customer', 'customer'], ['foreign', 'customer'], ['delegate', 'admin']] as const) {
      f.sqlite.prepare("INSERT INTO users(id,auth_subject,email,display_name,status,created_at,updated_at) VALUES(?,?,?,?,'active',?,?)")
        .run(id, id, `${id}@local.hastabazaar.test`, `Fictional ${id}`, now, now);
      f.sqlite.prepare('INSERT INTO user_roles(user_id,role,assigned_at) VALUES(?,?,?)').run(id, role, now);
    }
    f.sqlite.exec(`INSERT INTO staff_permission_profiles(user_id,permissions_json,version,updated_by,updated_at)
      VALUES('delegate','["product.review"]',1,'reviewer',1);
      INSERT INTO seller_profiles(id,user_id,legal_name,trading_name,registration_authority,registration_number,tax_mode,tax_registration_number,representative_name,
      support_phone,support_email,province,district,municipality,locality,payout_account_reference,status,created_at,updated_at)
      SELECT 'registered','registered-owner','Fictional Registered','Fictional Shop','Local','FIX-REG','PAN','FIX-PAN','Fictional Owner',
      support_phone,'registered-owner@local.hastabazaar.test',province,district,municipality,locality,'FIX-BANK','approved',created_at,updated_at FROM seller_profiles WHERE id='maker';
      INSERT INTO seller_application_drafts(user_id,revision,attempt_id,form_version,answers_json,files_json,updated_at,expires_at)
      VALUES('applicant','draft-v1','attempt-v1',1,'{"legalName":"Unsaved completion"}','[]',1,9999999999999);
      INSERT INTO seller_restrictions(seller_id,mode,obligation_mode,reason_code,private_reason,version,applied_by,applied_at,updated_at)
      VALUES('registered','disabled','allow_existing','fixture','Fictional restriction',1,'reviewer',1,1);
      INSERT INTO orders(id,order_number,customer_id,customer_email,customer_phone,status,locale,policy_version,shipping_address_json,item_subtotal_paisa,delivery_charge_paisa,grand_total_paisa,payment_mode,payment_status,created_at,updated_at)
      VALUES('legacy-order','FIX-LEGACY','customer','customer@local.hastabazaar.test','9800000000','placed','en-NP','old-terms','{"locality":"Original address"}',12550,500,13050,'cod','unpaid',1,1);
      INSERT INTO payout_requests(id,seller_id,status,seller_note,available_amount_snapshot_paisa,created_request_id,created_at,updated_at)
      VALUES('legacy-payout','registered','submitted','Fictional old request',12000,'legacy-payout',1,1);
      INSERT INTO commission_rate_changes(id,basis_points,effective_at,agreement_version,terms_text,reason,created_by,created_at)
      VALUES('future-fixture',1200,9999999999999,'fictional-future','Fixture only','Future fixture terms','reviewer',1);`);
    return { ...f, roles: { applicant: 'applicant', registered: 'registered-owner', maker: 'maker-user', superAdmin: 'reviewer', staff: 'delegate', customer: 'customer', foreign: 'foreign' } };
  } catch (error) { f.dispose(); throw error; }
}
