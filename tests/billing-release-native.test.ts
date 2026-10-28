import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import mysql, { type Pool } from 'mysql2/promise';
import { stagingNativeFixture } from './helpers/staging-native-fixture';
import { historicalCommissionDatabase } from './helpers/commission-database';
import { assertBillingProductWorkflow } from './helpers/billing-workflow-scenario';

const enabled=process.env.HATSKALA_STAGING_NATIVE==='1';
const pools:Pool[]=[], originalCreatePool=mysql.createPool;
if(enabled) {
  await stagingNativeFixture();
  mysql.createPool=((...args:Parameters<typeof originalCreatePool>)=>{const pool=originalCreatePool(...args);pools.push(pool);return pool;}) as typeof originalCreatePool;
}
after(async()=>{mysql.createPool=originalCreatePool;for(const pool of pools)await pool.end();});

void test('native MariaDB product revision, checkout and delivery preserve captured billing identities, totals and populated accounting', {skip:!enabled}, async()=>{
  const {env}=await import('../lib/runtime/node-bindings'); const db=env.DB;
  // The release runner creates an empty, owned schema for this test file.
  // Copy only this test's explicit synthetic baseline, never retained local data.
  assert.equal(Number((await db.prepare('SELECT COUNT(*) AS n FROM users').first<{n:number}>())!.n),0);
  const fixture=await historicalCommissionDatabase(true);
  try {
    for(const table of ['users','user_roles','seller_profiles','business_setting_versions','seller_agreement_acceptance_history']) {
      for(const row of fixture.sqlite.prepare(`SELECT * FROM ${table}`).all()) {
        const columns=Object.keys(row);
        await db.prepare(`INSERT INTO ${table} (${columns.map(column=>'`'+column+'`').join(',')}) VALUES (${columns.map(()=>'?').join(',')})`).bind(...Object.values(row)).run();
      }
    }
  } finally {await fixture.dispose();}
  await assertBillingProductWorkflow(db);
  assert.equal(Number((await db.prepare("SELECT COUNT(*) AS n FROM order_documents WHERE kind='payment_receipt'").first<{n:number}>())!.n),1);
});
