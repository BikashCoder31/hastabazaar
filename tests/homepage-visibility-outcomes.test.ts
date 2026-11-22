import test from 'node:test';
import assert from 'node:assert/strict';
import {homepageVisibilityFixture} from './helpers/homepage-visibility-fixture';
import {readHomepageVisibilityOutcome} from '../lib/admin/homepage-visibility-outcomes';

void test('original homepage product decisions recover exact actor/product/form receipts read-only after a later decision',async()=>{
 const f=await homepageVisibilityFixture();try{const requestId=crypto.randomUUID();await f.decide(requestId);await f.decide(crypto.randomUUID(),false,1);const changes=f.sqlite.prepare('SELECT total_changes() n').get()?.n,outcome=await readHomepageVisibilityOutcome(f.db,f.actor,f.productId,requestId);assert.equal(outcome.status,'recorded');if(outcome.status!=='recorded')throw Error('Original native receipt required.');assert.equal(outcome.record.hidden,true);assert.equal(outcome.record.version,1);assert.equal(JSON.stringify(outcome).includes('private homepage decision'),false);assert.equal((await readHomepageVisibilityOutcome(f.db,{id:'foreign',authSubject:'foreign'},f.productId,requestId)).status,'unconfirmed');assert.equal(f.sqlite.prepare('SELECT total_changes() n').get()?.n,changes);
 }finally{f.dispose();}
});

void test('homepage outcome reading denies current role loss during the final proof',async()=>{
 const f=await homepageVisibilityFixture();try{const requestId=crypto.randomUUID();await f.decide(requestId);let changed=false;const raced=new Proxy(f.db,{get(target,key){if(key==='prepare')return(sql:string)=>{if(sql.includes('homepage_outcome_authority')&&!changed){changed=true;f.sqlite.prepare("DELETE FROM user_roles WHERE user_id='reviewer' AND role='super_admin'").run();}return target.prepare(sql);};const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;}});await assert.rejects(()=>readHomepageVisibilityOutcome(raced,f.actor,f.productId,requestId),(error:unknown)=>error instanceof Error&&'status'in error&&error.status===403);assert.equal(changed,true);assert.equal(f.sqlite.prepare('SELECT version FROM homepage_product_controls WHERE product_id=?').get(f.productId)?.version,1);
 }finally{f.dispose();}
});
void test('an original native homepage receipt cannot be recovered under another genuinely published product source',async()=>{
 const f=await homepageVisibilityFixture();try{const second=await f.secondProduct(),requestId=crypto.randomUUID();await f.decide(requestId);const changes=f.sqlite.prepare('SELECT total_changes() n').get()?.n;assert.equal((await readHomepageVisibilityOutcome(f.db,f.actor,second,requestId)).status,'unconfirmed');assert.equal((await readHomepageVisibilityOutcome(f.db,f.actor,f.productId,requestId)).status,'recorded');assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM homepage_product_controls WHERE product_id=?').get(second)?.n,0);assert.equal(f.sqlite.prepare('SELECT total_changes() n').get()?.n,changes);
 }finally{f.dispose();}
});
