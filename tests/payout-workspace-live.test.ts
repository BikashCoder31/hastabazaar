import { compileFunction } from 'node:vm';
import assert from 'node:assert/strict';
import test from 'node:test';
import {deliveredLiveFinancialFixture} from './helpers/live-financial-lifecycle-fixture';
import {getLiveManagedPayoutPreview,prepareLiveManagedPayout} from '../lib/managed-commerce/live-payout-operations';
import {preparePayoutTransfer} from '../lib/payments/payout-transfers';
import {getPayoutFinanceWorkspace} from '../lib/payments/payout-workspace';
import {resolveRuntimeEnvironment} from '../lib/staging/environment';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {saveCompanyAccountDraft,submitCompanyAccountForReview,verifyCompanyAccount} from '../lib/payments/company-accounts';
import {recordRefundFundingStatement} from '../lib/payments/refund-funding';
const production=resolveRuntimeEnvironment({runtimeEnvironment:'production',nodeEnvironment:'production',appOrigin:'https://hastabazaar.com'});
void test('actual managed candidates and packets remain available in production while current and retained parties see no private row',async()=>{
 const f=await deliveredLiveFinancialFixture();try{
  const preview=await getLiveManagedPayoutPreview(f.db,f.sellerId,Date.now());
  const payout=await prepareLiveManagedPayout(f.db,f.ctx('workspace-live'),{sellerId:f.sellerId,scheduledFor:Date.now(),expectedAmountPaisa:preview.amountPaisa,expectedSnapshot:preview.snapshotDigest,reason:'Review the actual original earning in the production workspace fixture.'});
  const work=await getPayoutFinanceWorkspace(f.db,'reviewer',production),candidate=work.candidates.find(r=>r.id===payout.id)!;
  assert.ok(candidate);assert.equal(candidate.blocker,null);assert.equal(candidate.recordKind,'live');
  f.sqlite.prepare("INSERT INTO user_roles(user_id,role,assigned_at) VALUES(?,'super_admin',1)").run(f.buyerId);
  assert.equal((await getPayoutFinanceWorkspace(f.db,f.buyerId,production)).candidates.some(r=>r.id===payout.id),false);
  const packet=await preparePayoutTransfer(f.db,f.ctx('workspace-live-packet'),{model:'managed',payoutId:payout.id,accountVersionId:f.sources.accountVersionId,reason:'Bind the actual original earning to independently verified source funding.'});
  const packets=(await getPayoutFinanceWorkspace(f.db,'reviewer',production)).packets;assert.equal(packets.find(r=>r.id===packet.id)?.recordKind,'live');
  const renderWork=await getPayoutFinanceWorkspace(f.db,'reviewer',production);
  const code=(await build({stdin:{loader:'tsx',resolveDir:process.cwd(),contents:`import React from'react';import{renderToStaticMarkup}from'react-dom/server';import{PayoutTransferReview}from'./components/admin/payout-transfer-review';export const html=renderToStaticMarkup(<PayoutTransferReview actorId="reviewer" workspace={${JSON.stringify(renderWork)}}/>);`},bundle:true,write:false,platform:'node',format:'cjs',external:['react','react-dom/server'],plugins:[{name:'framework',setup(b){b.onResolve({filter:/^next\/navigation$/},()=>({path:'navigation',namespace:'fixture'}));b.onResolve({filter:/^next\/link$/},()=>({path:'link',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:args.path==='link'?"import React from'react';export default function Link(p){return React.createElement('a',p,p.children)}":"export function useRouter(){return{refresh(){}}}",loader:'js'}));}}]})).outputFiles[0].text;
  const loadedFixtureModule={exports:{} as {html:string}};compileFunction(code, ['require', 'module', 'exports'])(createRequire(import.meta.url),loadedFixtureModule,loadedFixtureModule.exports);
  assert.match(loadedFixtureModule.exports.html,new RegExp('id="packet-'+packet.id+'"'));assert.match(loadedFixtureModule.exports.html,/Actual payout/);assert.match(loadedFixtureModule.exports.html,/Approve exact payout and source/);assert.doesNotMatch(loadedFixtureModule.exports.html,/SIMULATION ONLY/);
  assert.equal((await getPayoutFinanceWorkspace(f.db,f.buyerId,production)).packets.some(r=>r.id===packet.id),false);
  f.sqlite.prepare("UPDATE orders SET customer_id='reviewer' WHERE id=?").run(f.orderId);
  assert.equal((await getPayoutFinanceWorkspace(f.db,'reviewer',production)).packets.some(r=>r.id===packet.id),false);
  assert.equal((await getPayoutFinanceWorkspace(f.db,f.buyerId,production)).packets.some(r=>r.id===packet.id),false,'Original buyer remains excluded when current order customer changes.');
  f.sqlite.prepare('UPDATE orders SET customer_id=? WHERE id=?').run(f.buyerId,f.orderId);
  f.sqlite.prepare("INSERT INTO user_roles(user_id,role,assigned_at) VALUES(?,'super_admin',1)").run(f.ownerId);
  f.sqlite.prepare("UPDATE seller_profiles SET user_id='reviewer' WHERE id=?").run(f.sellerId);
  assert.equal((await getPayoutFinanceWorkspace(f.db,f.ownerId,production)).packets.some(r=>r.id===packet.id),false,'Original retained maker stays excluded after ownership changes.');
  f.sqlite.prepare('UPDATE seller_profiles SET user_id=? WHERE id=?').run(f.ownerId,f.sellerId);
  const originalBatch=f.db.batch.bind(f.db);let raced=false;
  f.db.batch=(async statements=>{if(!raced){raced=true;f.sqlite.prepare("UPDATE orders SET customer_id='reviewer' WHERE id=?").run(f.orderId);}return originalBatch(statements);}) as typeof f.db.batch;
  await assert.rejects(getPayoutFinanceWorkspace(f.db,'reviewer',production),/CHECK|guard/i,'A new personal interest before audited projection commit must reject the whole response.');
  f.db.batch=originalBatch;f.sqlite.prepare('UPDATE orders SET customer_id=? WHERE id=?').run(f.buyerId,f.orderId);
  f.sqlite.prepare('UPDATE seller_profiles SET user_id=? WHERE id=?').run('reviewer',f.sellerId);
  assert.equal((await getPayoutFinanceWorkspace(f.db,'reviewer',production)).packets.some(r=>r.id===packet.id),false);
 }finally{f.dispose();}
});
void test('retained company account conflict excludes a Super Admin reader without exposing packet details',async()=>{
 const f=await deliveredLiveFinancialFixture();try{
  f.sqlite.exec("INSERT INTO users(id,email,display_name,status,created_at,updated_at) VALUES('account-interested','account-interested@local.hastabazaar.test','Fictional Interested Operator','active',1,1); INSERT INTO user_roles(user_id,role,assigned_at) VALUES('account-interested','super_admin',1)");
  const details=JSON.parse(String(f.sqlite.prepare('SELECT details_json FROM company_payment_account_versions WHERE id=?').get(f.sources.accountVersionId)!.details_json));details.accountNumber='TEST-INTERESTED-COMPANY';
  const draft=await saveCompanyAccountDraft(f.db,f.ctx('interested-company-draft'),{accountId:null,basedOnVersionId:null,details,evidenceReference:'FICTIONAL-INTERESTED-ACCOUNT',conflictUserIds:['account-interested'],reason:'Retain a truthful unrelated operator interest in this fictional account.'});
  await submitCompanyAccountForReview(f.db,f.ctx('interested-company-submit','0'),{versionId:draft.versionId,reason:'Submit exact original company ownership evidence for independent verification.'});
  await verifyCompanyAccount(f.db,f.ctx('interested-company-verify','1'),{versionId:draft.versionId,ownershipConfirmed:true,currencyConfirmed:true,verificationReference:'FICTIONAL-INTERESTED-SOURCE-VERIFIED',reason:'Independently verify the fictional source with the operator conflict retained.'});
  await recordRefundFundingStatement(f.db,f.ctx('interested-funds'),{accountVersionId:draft.versionId,statementIdentity:'FICTIONAL-INTERESTED-STATEMENT',asOf:Date.now()-1,cashPaisa:2000000,restrictedPaisa:0,evidenceReference:'FICTIONAL-INTERESTED-FUNDS',restrictionsReference:'FICTIONAL-RESTRICTIONS',availableFundsConfirmed:true,reason:'Verify available fictional company funds without unrelated money.'});
  const preview=await getLiveManagedPayoutPreview(f.db,f.sellerId,Date.now()),payout=await prepareLiveManagedPayout(f.db,f.ctx('interested-payout'),{sellerId:f.sellerId,scheduledFor:Date.now(),expectedAmountPaisa:preview.amountPaisa,expectedSnapshot:preview.snapshotDigest,reason:'Retain the independently verified actual original maker earning.'});
  const packet=await preparePayoutTransfer(f.db,f.ctx('interested-packet'),{model:'managed',payoutId:payout.id,accountVersionId:draft.versionId,reason:'Bind the actual original payout to the independently verified retained source.'});
  assert.ok((await getPayoutFinanceWorkspace(f.db,'reviewer',production)).packets.some(r=>r.id===packet.id));
  const restricted=await getPayoutFinanceWorkspace(f.db,'account-interested',production);assert.equal(restricted.packets.some(r=>r.id===packet.id),false);assert.doesNotMatch(JSON.stringify(restricted.packets),/TEST-MANAGED-001|TEST-INTERESTED-COMPANY/);
 }finally{f.dispose();}
});
