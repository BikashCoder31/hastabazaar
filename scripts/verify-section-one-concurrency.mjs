import mysql from 'mysql2/promise';
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {env} from '../lib/runtime/node-bindings.ts';
import {createCodOrder} from '../lib/db/repositories/orders.ts';
const root=await mysql.createConnection({host:'127.0.0.1',port:13316,user:'root'});
const [schemas]=await root.query("SELECT SCHEMA_NAME AS name FROM information_schema.SCHEMATA WHERE SCHEMA_NAME LIKE 'wallet_test_%' ORDER BY SCHEMA_NAME DESC");const name=schemas[0]?.name;assert.match(name,/^wallet_test_\d+$/);await root.query(`USE ${name}`);
const user='race_'+Date.now(),password=crypto.randomUUID();await root.query('CREATE USER ?@? IDENTIFIED BY ?',[user,'127.0.0.1',password]);await root.query(`GRANT ALL ON ${name}.* TO ?@?`,[user,'127.0.0.1']);Object.assign(process.env,{DB_HOST:'127.0.0.1',DB_PORT:'13316',DB_NAME:name,DB_USER:user,DB_PASSWORD:password});
const actor=await mysql.createConnection({host:'127.0.0.1',port:13316,user,password,database:name});const db=env.DB;const checks=[];
try{
 for(const mode of ['seller','owner','product']){
  const id='race-'+mode,now=Date.now();await root.execute("INSERT INTO carts(id,anonymous_token_hash,currency,created_at,updated_at) VALUES (?,?,'NPR',?,?)",[id,id,now,now]);await root.execute("INSERT INTO cart_items(id,cart_id,product_id,quantity,created_at,updated_at) VALUES (?,?,'product',1,?,?)",[id,id,now,now]);
  const [[before]]=await root.execute("SELECT inventory_quantity AS stock FROM products WHERE id='product'");
  const [[counts]]=await root.execute('SELECT COUNT(*) AS count FROM orders');
  await actor.beginTransaction();
  if(mode==='seller')await actor.query("UPDATE seller_profiles SET status='suspended' WHERE id='seller'");
  if(mode==='owner')await actor.query("UPDATE users SET status='disabled' WHERE id=(SELECT user_id FROM seller_profiles WHERE id='seller')");
  if(mode==='product')await actor.query("UPDATE products SET status='archived' WHERE id='product'");
  let finished=false;
  const pending=createCodOrder(db,id,'synthetic-receipt-'+id,{customerEmail:'race@example.test',customerPhone:'9800000000',locale:'en-NP',termsAccepted:true,idempotencyKey:crypto.randomUUID(),address:{recipientName:'Synthetic race buyer',phone:'9800000000',province:'Bagmati',district:'Kathmandu',municipality:'Kathmandu',locality:'Fixture'}},now).then(()=>{finished=true;return 'committed';},()=>{finished=true;return 'rejected';});
  await new Promise(r=>setTimeout(r,350));assert.equal(finished,false,'Checkout must wait for status transaction');await actor.commit();assert.equal(await pending,'rejected');
  const [[after]]=await root.execute("SELECT inventory_quantity AS stock FROM products WHERE id='product'");assert.equal(after.stock,before.stock);const [[afterCounts]]=await root.execute('SELECT COUNT(*) AS count FROM orders');assert.equal(afterCounts.count,counts.count);
  await root.query("UPDATE seller_profiles SET status='approved' WHERE id='seller'");await root.query("UPDATE users SET status='active' WHERE id=(SELECT user_id FROM seller_profiles WHERE id='seller')");await root.query("UPDATE products SET status='published' WHERE id='product'");checks.push(mode+' closure races safely with checkout');
 }
 await writeFile('outputs/section-one-2026-09-12/concurrency.json',JSON.stringify({localOnly:true,checks},null,2));console.log(checks.join('\n'));
}catch(e){await actor.rollback();console.error(e instanceof Error?e.message:'Concurrency check failed');process.exitCode=1;}finally{await actor.end();await root.end();process.exit(process.exitCode??0);}
