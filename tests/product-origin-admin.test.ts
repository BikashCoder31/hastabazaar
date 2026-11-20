import assert from 'node:assert/strict';
import test from 'node:test';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {runInNewContext} from 'node:vm';
import {renderToStaticMarkup} from 'react-dom/server';
import {categoryMediaDb} from './helpers/category-media-db';
import {createProductSubmission,getProductForReview} from '../lib/db/repositories/products';
import {parseProductSubmission} from '../lib/products/submission';
import {stubFixtureImage,stubFixtureLink} from './helpers/browser-fixture-link';
import type {ReactNode} from 'react';

void test('protected product review renders actual stored origin, evidence status and private reference',async()=>{
  const f=await categoryMediaDb();
  try {
    f.sqlite.exec("INSERT INTO users(id,auth_subject,email,display_name,locale,status,created_at,updated_at) VALUES('seller-user','seller-user','seller@example.invalid','Seller','en-NP','active',1,1)");
    f.sqlite.exec("INSERT INTO seller_profiles(id,user_id,legal_name,trading_name,registration_authority,registration_number,tax_mode,tax_registration_number,representative_name,support_phone,support_email,province,district,municipality,locality,payout_account_reference,status,approved_at,created_at,updated_at) VALUES('seller','seller-user','Seller','Seller','Local','REG-1','PAN','PAN-1','Seller','0000000000','seller@example.invalid','Province','District','Town','Ward','ACCOUNT','approved',1,1,1)");
    f.sqlite.exec("INSERT INTO categories(id,slug,name_en,is_active,sort_order,created_at,updated_at) VALUES('cat','review-origin','Decor',1,1,1,1)");
    const form=new FormData();Object.entries({categoryId:'cat',nameEn:'Decorative hanging',descriptionEn:'A decorative hanging for an entrance.',price:'824',compareAtPrice:'1648',inventoryQuantity:'10',preparationDays:'3',returnEligible:'no',occasionIds:'hastabazaar-occasion-others'}).forEach(([key,value])=>form.set(key,value));
    const parsed=parseProductSubmission(form);assert.deepEqual(parsed.errors,[]);
    await createProductSubmission(f.db,{productId:'product',sellerId:'seller',actorId:'seller-user',slug:'review-origin',input:parsed.input!,images:[],now:2});
    f.sqlite.exec(`INSERT INTO users(id,auth_subject,email,display_name,locale,status,created_at,updated_at)
      VALUES('staff','staff','staff@local.hastabazaar.test','Fictional product reviewer','en-NP','active',1,1);
      INSERT INTO user_roles(user_id,role,assigned_at) VALUES('staff','admin',1);
      INSERT INTO staff_permission_profiles(user_id,permissions_json,version,updated_by,updated_at)
      VALUES('staff','["product.review"]',1,'staff',1);`);
    const bridge={db:f.db,product:await getProductForReview(f.db,'product')};
    const stubs:Record<string,string>={
      'cloudflare:workers':'exports.env={};',
      'next/navigation':'exports.notFound=()=>{throw Error("Unexpected missing product")};',
      '@/lib/auth/staff':'exports.requireStaffPage=async()=>({id:"staff",role:"admin",permissions:["product.review"]});',
      '@/lib/db/d1':'exports.requireDatabase=()=>originFixture.db;',
      '@/lib/db/repositories/products':'exports.getProductForReview=async()=>originFixture.product;exports.listActiveCategories=async()=>[];exports.listActiveOccasions=async()=>[];',
      '@/components/admin/staff-form-history-links':'exports.StaffFormHistoryLinks=()=>null;',
      '@/components/admin/product-review-actions':'exports.ProductReviewActions=()=>null;',
      '@/components/admin/homepage-visibility-control':'exports.HomepageVisibilityControl=()=>null;',
      '@/components/admin/product-classification-form':'exports.ProductClassificationForm=()=>null;',
    };
    const compiled=await build({entryPoints:['app/admin/products/[id]/page.tsx'],jsx:'automatic',bundle:true,write:false,platform:'node',format:'cjs',external:['react','react/*','react-dom','react-dom/*'],plugins:[{name:'origin-review-fixture',setup(b){stubFixtureLink(b);stubFixtureImage(b);b.onResolve({filter:/.*/},({path})=>path in stubs?{path,namespace:'origin-stub'}:undefined);b.onLoad({filter:/.*/,namespace:'origin-stub'},({path})=>({contents:stubs[path],loader:'js'}));}}]});
    const renderedModule={exports:{} as {default:(props:{params:Promise<{id:string}>})=>Promise<ReactNode>}};
    runInNewContext(compiled.outputFiles[0].text,{require:createRequire(import.meta.url),module:renderedModule,exports:renderedModule.exports,process,URL,crypto,originFixture:bridge});
    for(const [country,status,reference,wantOrigin,wantStatus] of [
      ['India','seller_declared','Private supplier REF-42','India','Seller declared; unverified'],
      ['','unverified',null,'Unknown','Unverified stored value'],
      ['NP','unverified',null,'NP','Unverified stored value'],
    ] as const){
      f.sqlite.prepare("UPDATE products SET country_of_origin=?,origin_evidence_status=?,origin_evidence_reference=? WHERE id='product'").run(country,status,reference);
      bridge.product=await getProductForReview(f.db,'product');
      const html=renderToStaticMarkup(await renderedModule.exports.default({params:Promise.resolve({id:'product'})}));
      const details=html.match(/<dt\b[^>]*>[\s\S]*?<\/dt>\s*<dd\b[^>]*>[\s\S]*?<\/dd>/g)??[];
      const origin=details.find(detail=>/>Origin<\/dt>/.test(detail));assert.ok(origin);assert.match(origin,new RegExp('>'+wantOrigin+'<'));
      assert.match(html,new RegExp(wantStatus));
      if(country!=='NP')assert.doesNotMatch(origin,/\bNepal\b/);
      if(reference){assert.match(html,/Origin evidence reference \(private\)/);assert.match(html,/Private supplier REF-42/);}
      assert.match(html,/Review decision/);assert.match(html,/Return conditions/);
    }
  } finally {f.dispose();}
});


