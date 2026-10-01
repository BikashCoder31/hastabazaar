import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import mysql, { type Connection, type Pool } from 'mysql2/promise';
import { env } from '../lib/runtime/node-bindings';
import { initializePublicIdentityForms, publishFormDraft, saveFormDraft } from '../lib/db/repositories/form-catalog';
import { buildFormAnswerInsert, listFormAnswersForSubject } from '../lib/db/repositories/form-answers';
import type { FormAnswerSnapshot } from '../lib/forms/types';
import { assertNativeFixtureScope } from './helpers/native-fixture-scope';

// Only the separate release harness's fictional freshly imported schema is used.
const enabled = process.env.HATSKALA_MARIADB_RELEASE === '1';
const pools: Pool[] = [];
const createPool = mysql.createPool;
let connection: Connection | undefined;
if (enabled) {
  const scope = await assertNativeFixtureScope();
  mysql.createPool = ((...args: Parameters<typeof createPool>) => {const pool = createPool(...args); pools.push(pool); return pool;}) as typeof createPool;
  connection = await mysql.createConnection(scope);
}
after(async () => {mysql.createPool = createPool; await connection?.end(); for (const pool of pools) await pool.end();});

void test('actual MariaDB adapter initializes protected auth, publishes historical draft fields and saves typed answers atomically', {skip: !enabled}, async () => {
  const db = env.DB as unknown as D1Database;
  assert.ok(connection);
  await connection.query("INSERT INTO users(id,email,display_name,created_at,updated_at) VALUES ('runtime-owner','fictional-owner@example.test','Fictional owner',17,17),('runtime-customer','fictional-customer@example.test','Fictional customer',17,17)");
  await connection.query("INSERT INTO user_roles(user_id,role,assigned_at) VALUES ('runtime-owner','super_admin',17),('runtime-customer','customer',17)");
  const input = {actorId: 'runtime-owner', actorRole: 'super_admin' as const, reason: 'Fictional local release verification', requestId: 'runtime-initialize', now: 18};
  const initialized = await initializePublicIdentityForms(db, input);
  assert.equal(initialized.created.length, 6);
  assert.deepEqual([...(await initializePublicIdentityForms(db, input)).preserved].sort((a, b) => a.formId.localeCompare(b.formId)),
    [...initialized.created].sort((a, b) => a.formId.localeCompare(b.formId)));
  const [audit] = await connection.query<mysql.RowDataPacket[]>("SELECT COUNT(*) count FROM audit_logs WHERE action='form_catalog.initialized'");
  assert.equal(audit[0].count, 6);
  await assert.rejects(() => initializePublicIdentityForms(db, {...input, actorId: 'runtime-customer', requestId: 'unauthorized-init'}));

  const formId = 'account.profile' as const;
  const field = {id: 'context_note', key: 'context_note', label: 'Fictional context', type: 'short_text' as const, required: true, order: 0, status: 'active' as const};
  const common = {...input, formId, expectedPublishedVersion: 0};
  const draft = await saveFormDraft(db, {...common, requestId: 'runtime-draft', config: {formId, fields: [field]}});
  const published = await publishFormDraft(db, {...common, requestId: 'runtime-publish', draftId: draft.id, expectedDraftRevision: 1});
  assert.equal(published.status, 'published');
  const answers: FormAnswerSnapshot = {formId, version: 1, answers: [{fieldId: field.id, label: field.label, type: field.type, value: 'Fictional answer'}]};
  const answerInput = {formId, requestId: 'runtime-answer', versionId: published.id, subjectType: 'user', subjectId: 'runtime-customer', actorId: 'runtime-customer', answers, now: 19};
  await db.batch([buildFormAnswerInsert(db, answerInput)]);
  const saved = await listFormAnswersForSubject(db, 'user', 'runtime-customer');
  assert.equal(saved.length, 1);
  assert.deepEqual(saved[0].answers, answers);
  const next = await saveFormDraft(db, {...common, expectedPublishedVersion: 1, requestId: 'runtime-next-draft', config: {formId, fields: [{...field, label: 'Updated fictional context'}]}});
  await publishFormDraft(db, {...common, expectedPublishedVersion: 1, requestId: 'runtime-next-publish', draftId: next.id, expectedDraftRevision: 1});
  await assert.rejects(() => db.batch([
    db.prepare("UPDATE users SET display_name='Forbidden stale write' WHERE id='runtime-customer'"),
    buildFormAnswerInsert(db, {...answerInput, requestId: 'runtime-stale-answer'}),
  ]));
  const [customer] = await connection.query<mysql.RowDataPacket[]>("SELECT display_name name FROM users WHERE id='runtime-customer'");
  assert.equal(customer[0].name, 'Fictional customer');
  assert.equal((await listFormAnswersForSubject(db, 'user', 'runtime-customer')).length, 1);
});

void test('default host collation permits an eligible order item and retains seller reservation guards', {skip: !enabled}, async () => {
  assert.ok(connection);
  const [defaultCollation] = await connection.query<mysql.RowDataPacket[]>('SELECT @@collation_database value');
  assert.equal(defaultCollation[0].value, 'utf8mb4_general_ci');
  await connection.query("INSERT INTO users(id,email,display_name,created_at,updated_at) VALUES ('reservation-owner','fictional-seller@example.test','Fictional seller',17,17)");
  await connection.query(`INSERT INTO seller_profiles(id,user_id,legal_name,trading_name,registration_authority,registration_number,tax_mode,tax_registration_number,representative_name,support_phone,support_email,province,district,municipality,locality,payout_account_reference,status,created_at,updated_at)
    VALUES ('reservation-seller','reservation-owner','Fictional maker','Fictional shop','Local','FICTIONAL-REG','PAN','FICTIONAL-PAN','Fictional representative','9800000000','fictional-seller@example.test','Madhesh','Dhanusha','Janakpur','Ward 1','FICTIONAL-PAYOUT','approved',17,17)`);
  await connection.query("INSERT INTO categories(id,slug,name_en,is_active,sort_order,created_at,updated_at) VALUES ('reservation-category','fictional-reservation','Fictional',1,1,17,17)");
  await connection.query(`INSERT INTO products(id,seller_id,category_id,slug,sku,name_en,description_en,price_paisa,inventory_quantity,producer,country_of_origin,materials,return_eligible,status,created_at,updated_at)
    VALUES ('reservation-product','reservation-seller','reservation-category','fictional-reservation-product','FICTIONAL-SKU','Fictional item','Fictional fixture',10000,2,'Fictional maker','NP','Fictional material',1,'published',17,17)`);
  await connection.query(`INSERT INTO orders(id,order_number,customer_email,customer_phone,status,locale,policy_version,shipping_address_json,item_subtotal_paisa,delivery_charge_paisa,grand_total_paisa,payment_mode,payment_status,created_at,updated_at)
    VALUES ('reservation-order','FICTIONAL-RESERVATION','fictional-buyer@example.test','9800000000','confirmed','en-NP','fictional-policy','{}',10000,0,10000,'cod','unpaid',17,17)`);
  const insert = `INSERT INTO order_items(id,order_id,product_id,seller_id,seller_name_snapshot,product_name_snapshot,sku_snapshot,unit_price_paisa,quantity,commission_bps,commission_paisa,tax_paisa,line_total_paisa,return_eligible_snapshot,fulfillment_status,created_at)
    VALUES (?,'reservation-order','reservation-product','reservation-seller','Fictional shop','Fictional item','FICTIONAL-SKU',10000,1,900,900,0,10000,1,'pending',17)`;
  await connection.query(insert, ['reservation-item']);
  assert.equal((await connection.query<mysql.RowDataPacket[]>("SELECT inventory_quantity value FROM products WHERE id='reservation-product'"))[0][0].value, 1);
  await connection.query("UPDATE users SET status='suspended' WHERE id='reservation-owner'");
  await assert.rejects(() => connection!.query(insert, ['blocked-reservation-item']), /product_unavailable/);
  assert.equal((await connection.query<mysql.RowDataPacket[]>("SELECT inventory_quantity value FROM products WHERE id='reservation-product'"))[0][0].value, 1);
});
