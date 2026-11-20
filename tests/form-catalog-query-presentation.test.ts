import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ConfiguredField, PublishedFormConfig } from '../lib/forms/types';

const fixtures = { configs: {} as Record<string, PublishedFormConfig>, failed: new Set<string>(),
  productQueries: [] as unknown[], sellerProducts: [] as Record<string, unknown>[] };
(globalThis as unknown as { React: typeof React; queryFixtures: typeof fixtures }).React = React;
(globalThis as unknown as { queryFixtures: typeof fixtures }).queryFixtures = fixtures;
const shopQueryUrl = new URL('../lib/catalog/shop-query.ts', import.meta.url).href;
registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier === '../forms/runtime' && context.parentURL !== shopQueryUrl) {
    return nextResolve(specifier, context);
  }
  const mocks: Record<string, string> = {
    './site-header.module.css': 'export default {}',
    './rewards-shortcut.module.css': 'export default {}',
    'cloudflare:workers': `export const env={DB:{prepare(sql){return {bind(id){return {async all(){
      if(!/FROM order_items i JOIN orders o|FROM product_intake_drafts d|FROM products WHERE products.seller_id/.test(sql)) throw Error('Unexpected product read');
      return {results:[]};
    },async first(){
      if(globalThis.queryFixtures.failed.has(id))throw Error('Configuration read failed');
      return globalThis.queryFixtures.configs[id]?{found:1}:null;
    }}}}}}}`,
    '@/app/auth': 'export async function requireAuthenticatedUser(){throw Error("Unexpected provider authentication")};export async function getAuthenticatedUser(){return null};export function signInPath(path){return "/login?next="+path}',
    '@/lib/auth/staff': 'export async function requireStaffPage(){return {id:"staff",role:"super_admin",permissions:[]}}',
    '@/lib/auth/seller-center': 'export async function requireSellerCenterPage(){return {sellerId:"seller",userId:"owner",approvedSeller:true}}',
    '@/lib/auth/seller': 'export async function requireSellerPage(){return {sellerId:"seller",id:"owner"}}',
    '../forms/runtime': `export async function resolvePublishedForm(db,id){return globalThis.queryFixtures.configs[id]}`,
    'next/link': 'export default function Link({href,children,...props}){return globalThis.React.createElement("a",{href,...props},children)}',
    'next/image': 'export default function Image(){return null}',
    'next/navigation': 'export function redirect(){throw Error("Unexpected redirect")};export function notFound(){throw Error("Not found")};export function useRouter(){return {refresh(){}}};export function usePathname(){return "/"}',
    '@/components/layout/mobile-navigation': 'export function MobileNavigation(){return null}',
    '@/components/layout/mobile-product-search': 'export function MobileProductSearch({children}){return children}',
    '@/components/layout/site-header': 'export function SiteHeader(){return globalThis.React.createElement("header",null,"Navigation remains")}',
    '@/components/layout/site-footer': 'export function SiteFooter(){return null}',
    '@/components/admin/recorded-progress': 'export function RecordedProgressSection(){return null}',
    '@/components/admin/homepage-hero-manager': 'export function HomepageHeroManager(){return globalThis.React.createElement("section",null,"Hero controls remain")}',
    '@/components/admin/homepage-occasion-manager': 'export function HomepageOccasionManager(){return null}',
    '@/lib/db/repositories/customers': 'export async function getPublicMakerProfile(){return null}',
    '@/lib/db/repositories/products': `export async function listPublicDiscoveryCategories(){return []};export async function listActiveOccasions(){return []};
      export async function countPublishedProducts(db,filters){globalThis.queryFixtures.productQueries.push(filters);return 0};
      export async function listPublishedProducts(db,filters){globalThis.queryFixtures.productQueries.push(filters);return []};
      export async function listSellerProducts(db,id,filters){globalThis.queryFixtures.productQueries.push({id,...filters});return globalThis.queryFixtures.sellerProducts};
      export async function listHomepageProductControls(db,filters){globalThis.queryFixtures.productQueries.push(filters);return {items:[],total:0,pageSize:30}}`,
    '@/lib/db/repositories/business-settings': 'export async function getEffectiveBusinessSetting(){return {value:[]}};export async function listBusinessSettingHistory(){return []}',
    '@/lib/db/repositories/homepage-hero': 'export async function listHomepageHeroMediaForAdmin(){return []}',
    '@/lib/db/repositories/admin-workspace': 'export async function getAdminWorkSummary(){return {sellers:0,products:0,readyOrders:0,returns:0,complaints:0,payoutRequests:0}}',
    '@/lib/db/repositories/admin-marketplace-summary': 'export async function getSuperAdminMarketplaceSummary(){return null}',
    '@/lib/db/repositories/business-activity': `export async function listBusinessActivity(){return []};export function auditDestination(){return null};
      export async function getRecordedProgress(){return {from:1720000000000,to:1720100000000,groups:[],events:[]}}`,
  };
  const mock = mocks[specifier];
  return mock ? { url: `data:text/javascript,${encodeURIComponent(mock)}`, shortCircuit: true } : nextResolve(specifier, context);
} });

function config(formId: string, keys: readonly string[]): PublishedFormConfig {
  return { formId, version: 1, publishedAt: 1, fields: keys.map((key, order): ConfiguredField => ({
    id: key, key, label: `Edited ${key}`, helpText: `Help ${key}`, placeholder: `Hint ${key}`,
    type: key === 'from' || key === 'to' ? 'date' : key === 'email' ? 'email' : key === 'sort' || key === 'visibility' ? 'single_choice' : 'short_text',
    ...(key === 'sort' ? { choices: [{value:'newest',label:'Newest'}, {value:'price-low',label:'Price: low to high'},
      {value:'price-high',label:'Price: high to low'}, {value:'name',label:'Name'}] } :
      key === 'visibility' ? { choices: [{value:'all',label:'All products'}, {value:'visible',label:'Homepage eligible'},
        {value:'hidden',label:'Hidden from homepage'}] } : {}),
    required: formId === 'commerce.order-tracking', order, status: 'active',
  })) };
}

void test('shop builtin presentation is not mistaken for an unsupported custom query criterion', async () => {
  const { parseShopQueryCriteria } = await import('../lib/catalog/shop-query');
  const snapshot = config('catalog.filters', ['q', 'sort', 'category', 'occasion']);
  assert.deepEqual(parseShopQueryCriteria(snapshot, { q: 'craft', sort: 'price-low', category: 'gifts' }), {});
  assert.throws(() => parseShopQueryCriteria(snapshot, {'custom.unsupported':'1'}), /unsupported/i);
});

void test('shop filters use edited builtin text and keep exact GET names and option values', async () => {
  const { CatalogueFilters } = await import('../components/catalog/catalog-filters');
  const html = renderToStaticMarkup(React.createElement(CatalogueFilters, {
    query: 'craft', categories: [], occasions: [], selectedCategories: [], selectedOccasions: [],
    sort: 'price-low', config: config('catalog.filters', ['q','sort','category','occasion']),
  }));
  for (const key of ['q','sort','category','occasion']) {
    assert.ok(html.includes(`Edited ${key}`), key);
    assert.ok(html.includes(`Help ${key}`), key);
  }
  assert.match(html.match(/<input[^>]*name="q"[^>]*>/)?.[0] ?? '', /placeholder="Hint q"/);
  assert.match(html, /value="price-low" selected=""/);
  assert.doesNotMatch(html, /formVersion|customAnswers/);
});

void test('both header searches use published text and a failed read retains navigation and original GET semantics', async () => {
  fixtures.configs['catalog.header-search'] = config('catalog.header-search', ['q']);
  const { SiteHeader } = await import('../components/layout/site-header');
  const html = renderToStaticMarkup(await SiteHeader());
  assert.equal((html.match(/Edited q/g) ?? []).length, 2);
  assert.equal((html.match(/placeholder="Hint q"/g) ?? []).length, 2);
  assert.match(html, /id="header-product-search"/);
  assert.match(html, /id="mobile-product-search"/);
  fixtures.failed.add('catalog.header-search');
  try {
    const failed = renderToStaticMarkup(await SiteHeader());
    assert.match(failed, /Primary navigation/);
    assert.equal((failed.match(/name="q"/g) ?? []).length, 2);
    assert.match(failed, /Search presentation is unavailable/i);
  } finally { fixtures.failed.delete('catalog.header-search'); }
});

void test('seller search presentation preserves the existing status and scoped search', async () => {
  fixtures.configs['seller.product-filter'] = config('seller.product-filter', ['q']);
  fixtures.productQueries = [];
  const Page = (await import('../app/seller/products/page')).default;
  const product = {sku:'CRAFT', slug:'craft', pricePaisa:1_000, inventoryQuantity:2, updatedAt:1, createdAt:1};
  fixtures.sellerProducts = [
    {...product,id:'pending-craft',nameEn:'Pending craft fixture',status:'under_review'},
    {...product,id:'live-craft',nameEn:'Live craft fixture',status:'published'},
  ];
  try {
    const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({q:'craft',status:'pending'}) }));
    assert.match(html, /Edited q/);
    assert.match(html, /Help q/);
    assert.match(html, /name="status" value="pending"/);
    assert.match(html, /Pending craft fixture/);
    assert.doesNotMatch(html, /Live craft fixture/);
    assert.deepEqual(fixtures.productQueries, [{id:'seller',search:'craft'}]);
  } finally { fixtures.sellerProducts = []; }
});

void test('homepage presentation keeps the fixed visibility choices and unrelated controls', async () => {
  fixtures.configs['staff.homepage-filter'] = config('staff.homepage-filter', ['q','visibility']);
  const Page = (await import('../app/admin/homepage/page')).default;
  const html = renderToStaticMarkup(await Page({searchParams:Promise.resolve({q:'craft',visibility:'hidden'})}));
  assert.match(html, /Edited q/);
  assert.match(html, /Help visibility/);
  assert.match(html, /value="hidden" selected=""/);
  assert.match(html, /Hero controls remain/);
});

void test('staff activity and recorded-progress present their exact existing date and action controls', async () => {
  fixtures.configs['staff.activity-filter'] = config('staff.activity-filter', ['action','actor','type','from','to']);
  fixtures.configs['staff.recorded-progress-filter'] = config('staff.recorded-progress-filter', ['from','to','action']);
  const Page = (await import('../app/admin/activity/page')).default;
  const html = renderToStaticMarkup(await Page({searchParams:Promise.resolve({action:'product.review'})}));
  for (const key of ['action','actor','type','from','to']) assert.ok(html.includes(`Edited ${key}`), key);
  const { RecordedProgressSection } = await import('../components/admin/recorded-progress');
  const { env } = await import('cloudflare:workers');
  const progress = renderToStaticMarkup(await RecordedProgressSection({db:(env as unknown as {DB:D1Database}).DB,
    staff:{id:'staff',role:'admin',permissions:[]},form:true,filters:{action:'product.review'}}));
  for (const key of ['from','to','action']) assert.ok(progress.includes(`Edited ${key}`), key);
  assert.match(progress.match(/<input[^>]*name="from"[^>]*>/)?.[0] ?? '', /type="date"/);
  assert.match(progress, /name="action"[^>]*value="product.review"/);
});

void test('tracking publication parser permits only its explicit protected identity-control baseline', async () => {
  const { parsePublishedFormConfig } = await import('../components/forms/form-config-client');
  const snapshot = config('commerce.order-tracking', ['orderNumber','email']);
  assert.deepEqual(parsePublishedFormConfig(snapshot.formId, {config:snapshot}), snapshot);
  for (const patch of [{required:false}, {type:'number'}, {status:'archived'}, {id:'order_number',key:'order_number'},
    {id:'lookupHint',key:'lookupHint'}, {id:'new_criterion',key:'new_criterion'}]) {
    const altered = {...snapshot,fields:[{...snapshot.fields[0],...patch},snapshot.fields[1]]};
    assert.equal(parsePublishedFormConfig(snapshot.formId,{config:altered}),null,JSON.stringify(patch));
  }
  assert.equal(parsePublishedFormConfig('catalog.header-search',{config:{...snapshot,formId:'catalog.header-search'}}),null);
});

void test('integer-only price criterion rejects fractional NPR even with builtin presentation fields', async () => {
  const { parseShopQueryCriteria } = await import('../lib/catalog/shop-query');
  const snapshot = config('catalog.filters', ['q']);
  const integerPrice: PublishedFormConfig = {...snapshot,fields:[...snapshot.fields,{
    id:'minimum_price_npr',key:'minimum_price_npr',label:'Minimum price',type:'number',required:true,
    status:'active',order:1,min:0,max:1000,integerOnly:true,
  }]};
  assert.throws(()=>parseShopQueryCriteria(integerPrice,{'custom.minimum_price_npr':'10.50'}),/minimum price/i);
  assert.throws(()=>parseShopQueryCriteria(integerPrice,{}),/required/i);
  assert.deepEqual(parseShopQueryCriteria(integerPrice,{'custom.minimum_price_npr':'10.00'}),{minimumPricePaisa:1000,minimumPriceNpr:'10.00'});
});

void test('shop configuration failure renders its controls but does not query unfiltered results', async () => {
  fixtures.failed.add('catalog.filters'); fixtures.productQueries=[];
  try {
    const Page = (await import('../app/shop/page')).default;
    const html = renderToStaticMarkup(await Page({searchParams:Promise.resolve({'custom.minimum_price_npr':'10'})}));
    assert.match(html, /Shop filters are unavailable/i);
    assert.match(html, /Navigation remains/);
    assert.match(html, /name="q"/);
    assert.deepEqual(fixtures.productQueries, []);
  } finally { fixtures.failed.delete('catalog.filters'); }
});

void test('tracking builtin presentation retains required identity controls and their length/type constraints', async () => {
  const { OrderTracker } = await import('../components/commerce/order-tracker');
  const props = { initialOrder:'HK-FICTIONAL', presentationConfig:config('commerce.order-tracking',['orderNumber','email']) };
  const html = renderToStaticMarkup(React.createElement(OrderTracker, props));
  assert.match(html, /Edited orderNumber/);
  assert.match(html, /Edited email/);
  const orderInput = html.match(/<input[^>]*name="orderNumber"[^>]*>/)?.[0] ?? '';
  const emailInput = html.match(/<input[^>]*name="email"[^>]*>/)?.[0] ?? '';
  assert.match(orderInput, /required=""/); assert.match(orderInput, /maxLength="80"/);
  assert.match(emailInput, /type="email"/); assert.match(emailInput, /required=""/); assert.match(emailInput, /maxLength="254"/);
  assert.doesNotMatch(html, /customAnswers|formVersion/);
});

void test('dual calendar controls default to AD and submit the same canonical AD range in BS mode', async () => {
  const {RecordedDateRangeFields}=await import('../components/admin/recorded-date-range-fields');
  const props={from:'2026-09-15',to:'2026-10-14',fromField:{label:'From date'},toField:{label:'Through date'}};
  const ad=renderToStaticMarkup(React.createElement(RecordedDateRangeFields,props));
  assert.match(ad,/value="ad" selected=""/);
  assert.match(ad,/<input[^>]*type="date"[^>]*name="from"[^>]*value="2026-09-15"/);
  assert.match(ad,/३० भदौ २०८३ BS/);
  assert.match(ad,/२८ असोज २०८३ BS/);
  assert.match(ad,/Reporting timezone: Nepal time/);
  assert.doesNotMatch(ad,/From date \(Nepal\)/);
  const bs=renderToStaticMarkup(React.createElement(RecordedDateRangeFields,{...props,initialCalendar:'bs'}));
  assert.match(bs,/value="bs" selected=""/);
  assert.match(bs,/<input[^>]*type="hidden"[^>]*name="from"[^>]*value="2026-09-15"/);
  assert.match(bs,/<input[^>]*type="hidden"[^>]*name="to"[^>]*value="2026-10-14"/);
  assert.match(bs,/Gregorian equivalent: 2026-10-14 AD/);
  assert.match(bs,/value="2083" selected=""/);
  assert.match(bs,/value="5" selected=""/);
  assert.match(bs,/value="30" selected=""/);
  assert.doesNotMatch(bs,/type="date"/);
});

void test('recorded timestamps label both calendars on the same Nepal local day', async () => {
  const {RecordedTime}=await import('../components/admin/recorded-time');
  const html=renderToStaticMarkup(React.createElement(RecordedTime,{timestamp:Date.parse('2026-10-14T18:15:00Z')}));
  assert.match(html,/dateTime="2026-10-14T18:15:00.000Z"/);
  assert.match(html,/2026-10-15 AD/);
  assert.match(html,/२९ असोज २०८३ BS/);
  assert.match(html,/Nepal time/);
});
