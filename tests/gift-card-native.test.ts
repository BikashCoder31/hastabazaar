import assert from 'node:assert/strict';
import test from 'node:test';
import {giftCardWorkspaceFixture} from './helpers/gift-card-workspace-fixture';
import {nativeFinanceClone} from './helpers/native-finance-clone';
import {issueGiftCard,redeemGiftCard} from '../lib/db/repositories/gift-cards';
import {validateSellerFormSubmission} from '../lib/forms/submission';
import {readGiftCardCommandOutcome} from '../lib/gift-cards/command-outcomes';
void test('native disposable D1 retains one original gift liability, one redemption winner and exact current native notices',{timeout:180000},async()=>{
 const f=await giftCardWorkspaceFixture();let target:Awaited<ReturnType<typeof nativeFinanceClone>>|undefined;try{
  // All source paths are inspected memory; helper uses d1Persist:false and restores every native trigger.
  assert.ok(f.sqlite.prepare('PRAGMA database_list').all().every(row=>row.file===''));target=await nativeFinanceClone(f.sqlite);const db=target.db,issueId='gift-native-original-issue',form=await validateSellerFormSubmission(db,'commerce.gift-card-issue',f.issueConfig.version,[],issueId);
  const gift=await issueGiftCard(db,{actorId:'reviewer',requestId:issueId,amountPaisa:10000,now:Date.now(),form:{versionId:form.versionId,answers:form.answers}});assert.ok(gift.code);assert.deepEqual(await readGiftCardCommandOutcome(db,'reviewer','issue',issueId),{requestId:issueId,status:'recorded',record:{id:gift.id,amountPaisa:10000}});
  const outcomes=await Promise.allSettled(['customer','foreign'].map(async(userId)=>{const requestId='gift-native-redeem-'+userId,form=await validateSellerFormSubmission(db,'commerce.gift-card-redeem',f.redeemConfig.version,[],requestId);return redeemGiftCard(db,{userId,code:gift.code!,requestId,now:Date.now(),form:{versionId:form.versionId,answers:form.answers}});}));assert.equal(outcomes.filter(row=>row.status==='fulfilled').length,1);
  const card=await db.prepare('SELECT redeemed_by ownerId,redemption_request_id requestId FROM gift_cards WHERE id=?').bind(gift.id).first<{ownerId:string;requestId:string}>();assert.ok(card);assert.deepEqual(await readGiftCardCommandOutcome(db,card.ownerId,'redeem',card.requestId),{requestId:card.requestId,status:'recorded',record:{id:gift.id,amountPaisa:10000}});assert.equal((await db.prepare('SELECT COUNT(*) n FROM wallet_entries WHERE gift_card_id=?').bind(gift.id).first<{n:number}>())?.n,1);
  assert.equal((await db.prepare('SELECT COUNT(*) n FROM notification_messages WHERE related_id=?').bind(gift.id).first<{n:number}>())?.n,10);assert.equal((await db.prepare('PRAGMA foreign_key_check').all()).results.length,0);
 }finally{await target?.dispose();f.dispose();}
});
