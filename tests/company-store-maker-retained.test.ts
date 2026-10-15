import assert from 'node:assert/strict';
import test from 'node:test';
import { createManagedFinanceAttempt, financeAttemptKey, readManagedFinanceAttempts, retainManagedFinanceAttempt, verifiedManagedFinanceReceipt } from '../components/admin/managed-finance-attempt';

void test('financial retry retains the original preview, private answers and publication together', async () => {
  const config = { formId: 'staff.managed-payout-preparation', version: 7, publishedAt: 1,
    fields: [{ id: 'review_note', key: 'review_note', type: 'short_text' as const, label: 'Review context', required: true, order: 0, status: 'active' as const }] };
  const operation = await createManagedFinanceAttempt({ ownerId: 'reviewer', sellerId: 'maker', action: 'prepare_sale_linked_payout' }, {
    reason: 'Review completed paid sales for this maker.', destinationReference: 'SIM-REVIEWED-ACCOUNT', scheduledFor: 1800000000000,
    expectedAmountPaisa: 91000, expectedSnapshot: 'a'.repeat(64), customAnswers: [{ fieldId: 'review_note', value: 'Original private review context' }],
  }, config);
  assert.equal(operation.body.expectedAmountPaisa, 91000);
  assert.deepEqual(operation.body.customAnswers, [{ fieldId: 'review_note', value: 'Original private review context' }]);
  assert.equal(operation.config.version, 7);
  assert.equal(operation.body.formVersion, 7);
  assert.match(operation.requestId, /^[a-f0-9-]{36}$/);
  assert.match(operation.digest, /^[a-f0-9]{64}$/);
  const data = new Map<string,string>();
  const storage = { get length(){return data.size;},key(index:number){return [...data.keys()][index]??null;},getItem(key:string){return data.get(key)??null;},setItem(key:string,value:string){data.set(key,value);},removeItem(key:string){data.delete(key);},clear(){data.clear();} } satisfies Storage;
  retainManagedFinanceAttempt(storage,operation);
  assert.throws(()=>retainManagedFinanceAttempt(storage,operation),/Retry the recorded/);
  assert.deepEqual(await readManagedFinanceAttempts(storage,{ownerId:'reviewer',sellerId:'maker'}),[operation]);
  assert.deepEqual(await readManagedFinanceAttempts(storage,{ownerId:'different-user',sellerId:'maker'}),[]);
  assert.deepEqual(await readManagedFinanceAttempts(storage,{ownerId:'reviewer',sellerId:'other-maker'}),[]);
  assert.equal(verifiedManagedFinanceReceipt(operation,{ok:true}),false);
  const receipt = {ok:true,action:operation.action,requestId:operation.requestId,sellerId:'maker',payoutId:'payment',status:'approved',amountPaisa:91000,simulation:true};
  assert.equal(verifiedManagedFinanceReceipt(operation,receipt),true);
  for(const changed of [{requestId:'other'},{sellerId:'other'},{amountPaisa:90000},{simulation:false},{status:'paid'}]) assert.equal(verifiedManagedFinanceReceipt(operation,{...receipt,...changed}),false);
  storage.setItem(financeAttemptKey(operation),JSON.stringify({...operation,body:{...operation.body,expectedAmountPaisa:90000}}));
  await assert.rejects(readManagedFinanceAttempts(storage,{ownerId:'reviewer',sellerId:'maker'}),/changed/);
});
