import assert from 'node:assert/strict';
import test from 'node:test';
import {registerHooks} from 'node:module';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {completeVersionFixture} from './helpers/complete-version-fixture';

declare global {var sellerPageDb:D1Database;var sellerPageUserId:string;var sellerPageElement:typeof createElement;}
globalThis.sellerPageElement=createElement;
registerHooks({resolve(specifier,context,next){
 if(specifier.endsWith('.css'))return{url:'data:text/javascript,export default {}',shortCircuit:true};
 if(specifier==='cloudflare:workers')return{url:'data:text/javascript,export const env={get DB(){return globalThis.sellerPageDb}}',shortCircuit:true};
 if(specifier==='@/app/auth')return{url:'data:text/javascript,export async function getAuthenticatedUser(){return{userId:globalThis.sellerPageUserId}};export async function requireAuthenticatedUser(){return{userId:globalThis.sellerPageUserId}};export function signInPath(path){return "/sign-in?returnTo="+encodeURIComponent(path)};export function signOutPath(path="/"){return "/sign-out?returnTo="+encodeURIComponent(path)}',shortCircuit:true};
 if(specifier==='next/link')return{url:'data:text/javascript,export default function Link({children,...props}){return globalThis.sellerPageElement("a",props,children)}',shortCircuit:true};
 if(specifier==='next/image')return{url:'data:text/javascript,export default function Image({fill,priority,unoptimized,...props}){return globalThis.sellerPageElement("img",props)}',shortCircuit:true};
 if(specifier==='next/navigation')return{url:'data:text/javascript,export function redirect(url){throw new Error("Fixture redirect: "+url)};export function notFound(){throw new Error("Fixture not found")};export function useRouter(){return{refresh(){}}};export function usePathname(){return "/seller"};export function useSearchParams(){return new URLSearchParams()}',shortCircuit:true};
 return next(specifier,context);
}});

void test('actual Seller Home, Requests and Finance mount one original payout identity and truthful native destination',async()=>{
 const f=await completeVersionFixture(Date.now());try{globalThis.sellerPageDb=f.db;globalThis.sellerPageUserId='registered-owner';
  const home=await import('../app/seller/page'),requests=await import('../app/seller/requests/page'),finance=await import('../app/seller/finance/page');
  const homeHtml=renderToStaticMarkup(await home.default()),requestHtml=renderToStaticMarkup(await requests.default({searchParams:Promise.resolve({view:'all'})})),financeHtml=renderToStaticMarkup(await finance.default());
  for(const html of [homeHtml,requestHtml]){assert.match(html,/legacy-payout/);assert.match(html,/href="\/seller\/finance#payout-request-legacy-payout"/);assert.doesNotMatch(html,/private_reason|processingNote|evidence_reference/);}
  assert.match(homeHtml,/With Hastabazaar/);assert.match(homeHtml,/Do these next/);assert.match(requestHtml,/Waiting for Hastabazaar/);assert.match(requestHtml,/Current work/);assert.match(requestHtml,/All records/);assert.match(financeHtml,/id="payout-request-legacy-payout"/);
 }finally{f.dispose();}
});

void test('actual Home rejects an offboard during its last private product and earnings reads',async()=>{
 const f=await completeVersionFixture(Date.now());try{globalThis.sellerPageUserId='registered-owner';let changed=false;const db=Object.create(f.db)as D1Database;
  db.prepare=(sql:string)=>{if(!changed&&sql.includes('ORDER BY quantity, products.updated_at DESC LIMIT 4')){changed=true;f.sqlite.prepare("UPDATE users SET status='disabled' WHERE id='registered-owner'").run();}return f.db.prepare(sql);};globalThis.sellerPageDb=db;
  const home=await import('../app/seller/page');await assert.rejects(home.default(),/access|changed|owner|viewer/i);assert.equal(changed,true);
 }finally{f.dispose();}
});

void test('Earnings terms show the saved payout weekday and the next eligible run', async () => {
 const f = await completeVersionFixture(Date.now());
 try {
  globalThis.sellerPageDb = f.db;
  globalThis.sellerPageUserId = 'registered-owner';
  const publish = f.sqlite.prepare(`INSERT INTO business_setting_versions
    (id, setting_key, version, value_json, status, revision, change_control, effective_from, reason, created_by, created_at, last_request_id)
    VALUES (?, ?, 1, ?, 'published', 1, 'controlled', 1, 'Disposable payout schedule', 'reviewer', 1, ?)`);
  publish.run('earnings-weekday', 'payout_processing_weekday', JSON.stringify('thursday'), 'earnings-weekday');
  publish.run('earnings-cutoff', 'payout_cutoff_local_time', JSON.stringify('16:00'), 'earnings-cutoff');

  const finance = await import('../app/seller/finance/page');
  const html = renderToStaticMarkup(await finance.default());
  const terms = html.match(/<section[^>]*aria-labelledby="earning-example"[^>]*>.*?<\/section>/)?.[0];
  assert.ok(terms);
  assert.match(terms, /Payouts are sent every Thursday\./);
  assert.match(terms, /The next run for eligible payouts is <strong>Thursday \d{1,2} [A-Z][a-z]{2}<\/strong>/);

  const { readEarningsOverview } = await import('../app/seller/finance/overview-data');
  const [beforeCutoff, atCutoff] = await Promise.all([
   readEarningsOverview(f.db, 'registered', 'registered-owner', Date.parse('2026-11-19T15:59:00+05:45')),
   readEarningsOverview(f.db, 'registered', 'registered-owner', Date.parse('2026-11-19T16:00:00+05:45')),
  ]);
  assert.equal(beforeCutoff.payoutCalendar.runDay, 'Thursday 19 Nov');
  assert.equal(atCutoff.payoutCalendar.runDay, 'Thursday 26 Nov');
 } finally {
  f.dispose();
 }
});

void test('seller order tabs follow individual item stages and retain the bookmarked detail', async () => {
 const { actionableOrderFixture } = await import('./helpers/order-response-fixture');
 const fixture = await actionableOrderFixture({ secondOffer: true });
 try {
  globalThis.sellerPageDb = fixture.db;
  globalThis.sellerPageUserId = 'registered-owner';
  const confirmed = String(fixture.rows[0].id), packing = String(fixture.rows[1].id);
  fixture.sqlite.prepare("UPDATE order_items SET fulfillment_status='packing' WHERE id=?").run(packing);
  const { readSellerOrderQueue, isSellerOrderTurn } = await import('../app/seller/orders/order-queue');
  const rows = await readSellerOrderQueue(fixture.db, String(fixture.rows[0].sellerId));
  const order = rows.find(row => row.id === fixture.orderId);
  assert.ok(order);
  assert.equal(order.sellerStatus, 'mixed');
  assert.ok(order.items.some(item => item.id === confirmed && item.status === 'confirmed'));
  assert.ok(order.items.some(item => item.id === packing && item.status === 'packing'));
  assert.equal(isSellerOrderTurn(order, 'confirmed'), true);
  assert.equal(isSellerOrderTurn(order, 'packing'), true);
  const Detail = (await import('../app/seller/orders/[id]/page')).default;
  const html = renderToStaticMarkup(await Detail({ params: Promise.resolve({ id: fixture.orderId }) }));
  assert.match(html, /Your turn: mark ready for pickup/);
  assert.match(html, /Mark ready for pickup/);
  assert.match(html, /Running late\?/);
  assert.match(html, /You receive/);
  assert.doesNotMatch(html, /accept within 24 hours/i);
 } finally {
  fixture.dispose();
 }
});
