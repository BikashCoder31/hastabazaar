import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import mysql from 'mysql2/promise';
import { passwordRecord } from '../lib/auth/hosted-session.ts';
import { chromium } from 'file:///C:/Users/abinash/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import { env } from '../lib/runtime/node-bindings.ts';
import { createSellerApplication, reviewSellerApplication } from '../lib/db/repositories/seller-applications.ts';
const f=JSON.parse(await readFile('outputs/wallet-test-runtime/preview.json','utf8'));
assert.match(f.database,/^wallet_test_\d+$/);
Object.assign(process.env,{DB_HOST:'127.0.0.1',DB_PORT:'13316',DB_NAME:f.database,DB_USER:f.user,DB_PASSWORD:f.password});
const db=await mysql.createConnection({host:'127.0.0.1',port:13316,database:f.database,user:f.user,password:f.password});
const id=crypto.randomUUID(), sellerId=crypto.randomUUID(), email=id+'@example.test', now=Date.now();
try {
 await db.execute("INSERT INTO users(id,auth_subject,email,display_name,locale,status,created_at,updated_at) VALUES (?,?,?,'Existing customer','en-NP','active',?,?)",[id,'local:'+id,email,now,now]);
 await db.execute("INSERT INTO user_roles(user_id,role,assigned_at) VALUES (?,'customer',?)",[id,now]);
 await createSellerApplication(env.DB,{userId:id,existingAccount:true,sellerId,applicationReference:sellerId,input:{email,phone:'98'+String(now).slice(-8),representativeName:'Existing customer',legalName:'Local test business',tradingName:'Existing customer regression',registrationAuthority:'Test authority',registrationNumber:sellerId,taxMode:'PAN',taxRegistrationNumber:sellerId,businessDescription:'Disposable test only',productCategories:'Handmade',province:'Bagmati',district:'Kathmandu',municipality:'Kathmandu',ward:'1',locality:'Test'},documents:[],now});
 const [profiles]=await db.execute('SELECT user_id,status FROM seller_profiles WHERE id=?',[sellerId]);
 assert.equal(profiles[0]?.user_id,id); assert.equal(profiles[0]?.status,'submitted');
 const [before]=await db.execute("SELECT * FROM user_roles WHERE user_id=? AND role='seller'",[id]);assert.equal(before.length,0);
 for(const action of ['start_review','approve']) await reviewSellerApplication(env.DB,{sellerId,actorId:'referrer',action,reason:'Disposable existing-customer regression',now:Date.now()});
 const [after]=await db.execute("SELECT * FROM user_roles WHERE user_id=? AND role='seller'",[id]);assert.equal(after.length,1);
 // Exercise the deployed-style HTTP route with a second existing customer.
 const httpId=crypto.randomUUID(),httpEmail=httpId+'@example.test',password=crypto.randomUUID();
 await db.execute("INSERT INTO users(id,auth_subject,email,display_name,locale,status,created_at,updated_at) VALUES (?,?,?,'HTTP customer','en-NP','active',?,?)",[httpId,'local:'+httpId,httpEmail,now,now]);
 await db.execute("INSERT INTO user_roles(user_id,role,assigned_at) VALUES (?,'customer',?)",[httpId,now]);
 const credential=await passwordRecord(password);
 await db.execute('INSERT INTO user_credentials(user_id,password_hash,password_salt,created_at,updated_at) VALUES (?,?,?,?,?)',[httpId,credential.hash,credential.salt,now,now]);
 const origin='http://127.0.0.1:43872';
 const login=await fetch(origin+'/api/auth/login',{method:'POST',headers:{Origin:origin},body:new URLSearchParams({email:httpEmail,password}),redirect:'manual'});
 assert.equal(login.status,303);
 const cookie=login.headers.getSetCookie().find(c=>c.startsWith('hastabazaar_session='))?.split(';')[0];assert.ok(cookie);
 function form(emailValue=httpEmail) {
  const data=new FormData();
  for(const [key,value] of Object.entries({email:emailValue,phone:'97'+String(now).slice(-8),representativeName:'HTTP customer',legalName:'Local HTTP business',tradingName:'HTTP regression',registrationAuthority:'Test',registrationNumber:httpId,taxMode:'PAN',taxRegistrationNumber:String(now),businessDescription:'Test only',productCategories:'Handmade',province:'Bagmati',district:'Kathmandu',municipality:'Kathmandu',ward:'1',locality:'Test',acceptedTerms:'yes'}))data.set(key,value);
  for(const key of ['businessRegistration','taxCertificate','representativeIdentity'])data.set(key,new Blob(['%PDF-1.4 test fixture'],{type:'application/pdf'}),'fixture.pdf');
  return data;
 }
 async function submit(data,session=cookie){return fetch(origin+'/api/seller-applications',{method:'POST',headers:{Origin:origin,...(session?{Cookie:session}:{})},body:data});}
 const anonymous=await submit(form(),'');assert.equal(anonymous.status,409);assert.match((await anonymous.json()).error,/Sign in/);
 const mismatch=await submit(form('unrelated@example.test'));assert.equal(mismatch.status,409);
 assert.equal((await fetch(origin+'/seller',{headers:{Cookie:cookie},redirect:'manual'})).status,307);
 const submitted=await submit(form());const payload=await submitted.json();assert.equal(submitted.status,201,JSON.stringify(payload));assert.ok(payload.applicationReference);
 const [saved]=await db.execute('SELECT id,user_id FROM seller_profiles WHERE application_reference=?',[payload.applicationReference]);assert.equal(saved[0].user_id,httpId);
 const [docs]=await db.execute('SELECT id FROM seller_documents WHERE seller_id=?',[saved[0].id]);assert.equal(docs.length,3);
 const duplicate=await submit(form());assert.equal(duplicate.status,409);
 for(const action of ['start_review','approve'])await reviewSellerApplication(env.DB,{sellerId:saved[0].id,actorId:'referrer',action,reason:'HTTP regression approval',now:Date.now()});
 assert.equal((await fetch(origin+'/seller',{headers:{Cookie:cookie},redirect:'manual'})).status,200);
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try {
  const context=await browser.newContext();const [name,value]=cookie.split('=');await context.addCookies([{name,value,url:origin}]);
  const page=await context.newPage();
  for(const width of [1440,390]){
   await page.setViewportSize({width,height:900});await page.goto(origin+'/sell');
   assert.equal(await page.locator('input[name=email]').inputValue(),httpEmail);
   assert.equal(await page.locator('input[name=email]').getAttribute('readonly'),'');
   assert.ok(await page.getByText('After Admin approval, this signed-in account will have seller access.').isVisible());
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  }
 }finally{await browser.close();}
 console.log('HTTP: authenticated ownership, anonymous/mismatched rejection, document upload, duplicate rejection, approval with same session, desktop/mobile email display passed.');
 console.log('Existing customer -> application saved on same account -> admin approval grants seller role: passed');
} catch(e) {console.log(e.message);process.exitCode=1;} finally {await db.end();process.exit(process.exitCode??0);}
