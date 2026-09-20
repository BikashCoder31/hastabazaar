import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import mysql from 'mysql2/promise';
import {createEmailOtpChallenge} from '../lib/auth/email-otp.ts';
import {chromium} from 'file:///C:/Users/abinash/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const f=JSON.parse(await readFile('outputs/wallet-test-runtime/preview.json','utf8'));assert.match(f.database,/^wallet_test_\d+$/);
const db=await mysql.createConnection({host:'127.0.0.1',port:13316,database:f.database,user:f.user,password:f.password});
const origin='http://127.0.0.1:43872';const browser=await chromium.launch({channel:'chrome',headless:true});let product; let originalRoles;
try {
 await db.query(await readFile('deployment/babal/mariadb-product-deletions.sql','utf8'));
 const [roles]=await db.execute("SELECT role FROM user_roles WHERE user_id='referrer'");originalRoles=roles.map(r=>r.role);
 const [rows]=await db.execute("SELECT p.id,p.name_en,p.slug,p.status,p.updated_at,p.review_request_id,p.published_at,p.review_note,p.reviewed_by FROM products p JOIN seller_profiles s ON s.id=p.seller_id WHERE s.user_id='friend' AND p.status='published' LIMIT 1");product=rows[0];assert.ok(product,'Need published fixture product');
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
 // Delete the archived listing through its confirmed seller action.
 await card.getByRole('button',{name:'Delete product',exact:true}).click();
 await page.getByRole('alertdialog').waitFor({state:'visible'});
 await page.screenshot({path:'outputs/delete-confirmation-390.png',fullPage:true});
 await page.getByRole('button',{name:'Go back',exact:true}).click();await page.getByRole('alertdialog').waitFor({state:'hidden'});
 await card.getByRole('button',{name:'Delete product',exact:true}).click();
 const deleted=page.waitForResponse(r=>r.url().endsWith('/delete')&&r.request().method()==='POST');
 await page.getByRole('button',{name:'Confirm decision',exact:true}).click();assert.equal((await deleted).status(),200);
 await card.waitFor({state:'hidden'});
 // Reset only the disposable test product for the separate unpublish scenario.
 await db.execute('DELETE FROM product_deletions WHERE product_id=?',[product.id]);
 await db.execute("UPDATE products SET status='published' WHERE id=?",[product.id]);
 const ac=createEmailOtpChallenge({userId:'referrer'}),ar=ac.record;
 await db.execute('INSERT INTO email_login_challenges(token_hash,code_hash,user_id,attempts,expires_at,created_at,consumed_at) VALUES (?,?,?,?,?,?,NULL)',[ar.tokenHash,ar.codeHash,ar.userId,0,ar.expiresAt,ar.createdAt]);
 const adminContext=await browser.newContext();await adminContext.addCookies([{name:'hastabazaar_email_otp',value:ac.token,url:origin}]);
 const adminLogin=await adminContext.request.post(origin+'/api/auth/email-code/verify',{headers:{Origin:origin},form:{code:ac.code,return_to:'/admin'},maxRedirects:0});
 assert.equal(adminLogin.headers().location,'/admin','Admin fixture login must succeed');
 await db.execute("UPDATE user_roles SET role='admin' WHERE user_id='referrer' AND role='super_admin'");
 const endpoint=origin+'/api/admin/products/'+product.id+'/review';
 const ap=await adminContext.newPage();await ap.goto(origin+'/admin');
 assert.equal(await ap.evaluate(async endpoint => (await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'unpublish',reason:'Testing admin permission restriction'})})).status,endpoint),403);
 await db.execute("UPDATE user_roles SET role='super_admin' WHERE user_id='referrer' AND role='admin'");
 await ap.goto(origin+'/admin/products?view=published');
 const listing=ap.locator('[data-slot="card"]').filter({has:ap.getByRole('heading',{name:product.name_en,exact:true})});
 await listing.getByRole('link',{name:'Review listing'}).click();
 await ap.getByRole('button',{name:'Unpublish product',exact:true}).waitFor({state:'visible'});
 await ap.getByLabel('Review note').fill('Test product needs another review before sale.');
 await ap.getByRole('button',{name:'Unpublish product',exact:true}).click();
 await ap.getByRole('alertdialog').waitFor({state:'visible'});await ap.screenshot({path:'outputs/unpublish-confirmation.png',fullPage:true});
 const unpublished=ap.waitForResponse(r=>r.url().endsWith('/review')&&r.request().method()==='POST');
 await ap.getByRole('alertdialog').getByRole('button',{name:'Unpublish product',exact:true}).click();assert.equal((await unpublished).status(),200);
 const [finalRows]=await db.execute('SELECT status FROM products WHERE id=?',[product.id]);assert.equal(finalRows[0].status,'under_review');
 console.log('Local MariaDB/browser: seller archive and delete, cancel/confirm, hidden deleted listing, published admin view, admin denial and Super Admin unpublish passed.');
 // console.log('Local MariaDB/browser: desktop/mobile confirmation and cancel, archive API, archived badge, hidden action and cross-site rejection passed.');
} finally {
 if(product) {await db.execute('DELETE FROM product_deletions WHERE product_id=?',[product.id]);await db.execute('UPDATE products SET status=?,updated_at=?,review_request_id=?,published_at=?,review_note=?,reviewed_by=? WHERE id=?',[product.status,product.updated_at,product.review_request_id,product.published_at,product.review_note,product.reviewed_by,product.id]);}
 if(originalRoles?.includes('super_admin'))await db.execute("UPDATE user_roles SET role='super_admin' WHERE user_id='referrer' AND role='admin'");
 await browser.close();await db.end();
}




