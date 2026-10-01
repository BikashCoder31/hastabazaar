import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import mysql from 'mysql2/promise';
import {createEmailOtpChallenge} from '../lib/auth/email-otp.ts';
import {chromium} from 'file:///C:/Users/abinash/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const f=JSON.parse(await readFile('outputs/wallet-test-runtime/preview.json','utf8'));assert.match(f.database,/^wallet_test_\d+$/);
const db=await mysql.createConnection({host:'127.0.0.1',port:13316,database:f.database,user:f.user,password:f.password});
const origin='http://127.0.0.1:43872';const browser=await chromium.launch({channel:'chrome',headless:true});let product;
try {
 const [rows]=await db.execute("SELECT p.id,p.name_en,p.slug,p.status,p.updated_at,p.review_request_id FROM products p JOIN seller_profiles s ON s.id=p.seller_id WHERE s.user_id='friend' AND p.status='published' LIMIT 1");product=rows[0];assert.ok(product,'Need published fixture product');
 const c=createEmailOtpChallenge({userId:'friend'}),r=c.record;
 await db.execute('INSERT INTO email_login_challenges(token_hash,code_hash,user_id,attempts,expires_at,created_at,consumed_at) VALUES (?,?,?,?,?,?,NULL)',[r.tokenHash,r.codeHash,r.userId,0,r.expiresAt,r.createdAt]);
 const context=await browser.newContext();await context.addCookies([{name:'hastabazaar_email_otp',value:c.token,url:origin}]);
 const login=await context.request.post(origin+'/api/auth/email-code/verify',{headers:{Origin:origin},form:{code:c.code,return_to:'/seller/products'}});assert.ok(login.ok());
 const page=await context.newPage();
 for(const width of [1440,390]){
  await page.setViewportSize({width,height:900});await page.goto(origin+'/seller/products');
  const card=page.locator('article').filter({has:page.getByRole('heading',{name:product.name_en,exact:true})});
  await card.getByRole('button',{name:'Archive product',exact:true}).click();
  assert.ok(await page.getByRole('alertdialog').isVisible());
  assert.ok(await page.getByText(/Existing orders, reviews and product records are kept/).isVisible());
  await page.screenshot({path:'outputs/archive-confirmation-'+width+'.png',fullPage:true});
  await page.getByRole('button',{name:'Go back',exact:true}).click();
  await page.getByRole('alertdialog').waitFor({state:'hidden'});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 }
 const card=page.locator('article').filter({has:page.getByRole('heading',{name:product.name_en,exact:true})});
 await card.getByRole('button',{name:'Archive product',exact:true}).click();
 const response=page.waitForResponse(r=>r.url().endsWith('/archive')&&r.request().method()==='POST');
 await page.getByRole('button',{name:'Confirm decision',exact:true}).click();assert.equal((await response).status(),200);
 await page.reload();await card.getByText(/^archived$/i).waitFor({state:'visible'});assert.equal(await card.getByRole('button',{name:'Archive product'}).count(),0);
 const [archived]=await db.execute('SELECT status FROM products WHERE id=?',[product.id]);assert.equal(archived[0].status,'archived');
 assert.equal((await context.request.post(origin+'/api/seller/products/'+product.id+'/archive',{headers:{Origin:'https://untrusted.example'}})).status(),403);
 console.log('Local MariaDB/browser: desktop/mobile confirmation and cancel, archive API, archived badge, hidden action and cross-site rejection passed.');
} finally {
 if(product) await db.execute('UPDATE products SET status=?,updated_at=?,review_request_id=? WHERE id=?',[product.status,product.updated_at,product.review_request_id,product.id]);
 await browser.close();await db.end();
}




