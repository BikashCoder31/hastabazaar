import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import mysql from 'mysql2/promise';
import { env } from '../lib/runtime/node-bindings.ts';
import { createSellerApplication, reviewSellerApplication } from '../lib/db/repositories/seller-applications.ts';
import { passwordRecord, hostedSessionCookieName } from '../lib/auth/hosted-session.ts';
import { createEmailOtpChallenge } from '../lib/auth/email-otp.ts';
const f=JSON.parse(await readFile('outputs/wallet-test-runtime/preview.json','utf8'));
assert.match(f.database,/^wallet_test_\d+$/);
Object.assign(process.env,{DB_HOST:'127.0.0.1',DB_PORT:'13316',DB_NAME:f.database,DB_USER:f.user,DB_PASSWORD:f.password});
const db=await mysql.createConnection({host:'127.0.0.1',port:13316,database:f.database,user:f.user,password:f.password});
const origin='http://127.0.0.1:43872';
const id=crypto.randomUUID(), sellerId=crypto.randomUUID(), email=id+'@example.test';
let code=0;
try {
 await createSellerApplication(env.DB,{userId:id,sellerId,applicationReference:id,input:{email,phone:'98'+String(Date.now()).slice(-8),representativeName:'Fresh test seller',legalName:'Local test business',tradingName:'Fresh seller regression',registrationAuthority:'Test authority',registrationNumber:id,taxMode:'PAN',taxRegistrationNumber:id,businessDescription:'Disposable test only',productCategories:'Handmade',province:'Bagmati',district:'Kathmandu',municipality:'Kathmandu',ward:'1',locality:'Test'},documents:[],now:Date.now()});
 for(const action of ['start_review','approve']) await reviewSellerApplication(env.DB,{sellerId,actorId:'referrer',action,reason:'Disposable new-application regression',now:Date.now()});
 const challenge=createEmailOtpChallenge({userId:id}); const r=challenge.record;
 await db.execute('INSERT INTO email_login_challenges(token_hash,code_hash,user_id,attempts,expires_at,created_at,consumed_at) VALUES (?,?,?,?,?,?,NULL)',[r.tokenHash,r.codeHash,id,0,r.expiresAt,r.createdAt]);
 const response=await fetch(origin+'/api/auth/email-code/verify',{method:'POST',headers:{Origin:origin,Cookie:'hastabazaar_email_otp='+challenge.token},body:new URLSearchParams({code:challenge.code,return_to:'/seller'}),redirect:'manual'});
 assert.equal(response.status,303);
 const session=response.headers.getSetCookie().find(c=>c.startsWith(hostedSessionCookieName+'='))?.split(';')[0]; assert.ok(session);
 const dashboard=await fetch(origin+'/seller',{headers:{Cookie:session},redirect:'manual'});
 assert.equal(dashboard.status,200,'Fresh approved applicant must reach seller dashboard after email-code sign-in; actual redirect: '+dashboard.headers.get('location'));
 // Password reset can add credentials before the account has an identity link.
 await db.execute('UPDATE users SET auth_subject=NULL WHERE id=?',[id]);
 const password=crypto.randomUUID(); const record=await passwordRecord(password);
 await db.execute('INSERT INTO user_credentials(user_id,password_hash,password_salt,created_at,updated_at) VALUES (?,?,?,?,?)',[id,record.hash,record.salt,Date.now(),Date.now()]);
 const login=await fetch(origin+'/api/auth/login',{method:'POST',headers:{Origin:origin},body:new URLSearchParams({email,password,return_to:'/seller'}),redirect:'manual'});
 assert.equal(login.status,303,'Password login for an application-created account must succeed');
 const passwordSession=login.headers.getSetCookie().find(c=>c.startsWith(hostedSessionCookieName+'='))?.split(';')[0]; assert.ok(passwordSession);
 assert.equal((await fetch(origin+'/seller',{headers:{Cookie:passwordSession},redirect:'manual'})).status,200);
 console.log('Fresh application -> real Admin approval -> email-code and password login -> seller dashboard passed.');
} catch(e) {code=1;console.log(e.message);} finally {await db.end();}
process.exit(code);
