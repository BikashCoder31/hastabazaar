import test from 'node:test';
import assert from 'node:assert/strict';
import {giftCardWorkspaceFixture} from './helpers/gift-card-workspace-fixture';
import {redeemGiftCard} from '../lib/db/repositories/gift-cards';
import {validateSellerFormSubmission} from '../lib/forms/submission';
import {readGiftCardCommandOutcome} from '../lib/gift-cards/command-outcomes';

void test('original gift issue and redemption outcomes are read-only, actor-bound and never reveal the bearer code or its hash',async()=>{
 const f=await giftCardWorkspaceFixture();try{const issued=await f.issue('gift-owned-original-issue');assert.ok(issued.code);const before=f.sqlite.prepare('SELECT total_changes() n').get()?.n;
  assert.deepEqual(await readGiftCardCommandOutcome(f.db,'reviewer','issue','gift-owned-original-issue'),{requestId:'gift-owned-original-issue',status:'recorded',record:{id:issued.id,amountPaisa:10000}});
  assert.deepEqual(await readGiftCardCommandOutcome(f.db,'second-staff','issue','gift-owned-original-issue'),{requestId:'gift-owned-original-issue',status:'unconfirmed'});assert.equal(f.sqlite.prepare('SELECT total_changes() n').get()?.n,before);
  const form=await validateSellerFormSubmission(f.db,'commerce.gift-card-redeem',f.redeemConfig.version,[],'gift-owned-original-redeem');await redeemGiftCard(f.db,{userId:'customer',code:issued.code,requestId:'gift-owned-original-redeem',now:Date.now(),form:{versionId:form.versionId,answers:form.answers}});
  const response=await readGiftCardCommandOutcome(f.db,'customer','redeem','gift-owned-original-redeem');assert.deepEqual(response,{requestId:'gift-owned-original-redeem',status:'recorded',record:{id:issued.id,amountPaisa:10000}});assert.equal(JSON.stringify(response).includes(issued.code),false);assert.equal(JSON.stringify(response).includes('hash'),false);
  f.sqlite.prepare("UPDATE users SET status='inactive' WHERE id='customer'").run();await assert.rejects(()=>readGiftCardCommandOutcome(f.db,'customer','redeem','gift-owned-original-redeem'),(e:unknown)=>e instanceof Error&&'status'in e&&e.status===403);
 }finally{f.dispose();}
});

void test('gift recovery final current-authority fence denies a permission revocation during the read',async()=>{
 const f=await giftCardWorkspaceFixture();try{await f.issue('gift-final-recovery-role');let changed=false;const raced={prepare(sql:string){if(sql.startsWith('SELECT CASE WHEN')&&!changed){changed=true;f.sqlite.prepare("DELETE FROM user_roles WHERE user_id='reviewer' AND role='super_admin'").run();}return f.db.prepare(sql);}}as D1Database;
  await assert.rejects(()=>readGiftCardCommandOutcome(raced,'reviewer','issue','gift-final-recovery-role'),(e:unknown)=>e instanceof Error&&'status'in e&&e.status===403);assert.equal(changed,true);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM gift_cards').get()?.n,1);
 }finally{f.dispose();}
});
