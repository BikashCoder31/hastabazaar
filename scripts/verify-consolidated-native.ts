import mysql from 'mysql2/promise';
import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {env as runtime} from '../lib/runtime/node-bindings';
import {inspectReadiness} from '../lib/operations/readiness';
import {proposeStaffPermissions,decideStaffPermissions,hasStaffPermissionBySubject} from '../lib/db/repositories/staff-permissions';
import {getDeliveryRates,saveDeliveryRates} from '../lib/db/repositories/delivery-rates';
const out='outputs/consolidated-local-20260913-042936';
const root=await mysql.createConnection({host:'127.0.0.1',port:13316,user:'root',multipleStatements:true});
const name='consolidated_'+Date.now();
const password=crypto.randomUUID();
const checks:string[]=[];
function pass(label:string){checks.push(label);console.log('PASS '+label);}
async function migrate(path:string){let delimiter=';',buffer='';for(const line of (await readFile(path,'utf8')).split('\n')){if(line.startsWith('DELIMITER ')){delimiter=line.slice(10).trim();continue;}buffer+=line+'\n';if(buffer.trimEnd().endsWith(delimiter)){const statement=buffer.trimEnd().slice(0,-delimiter.length);buffer='';if(statement.trim())await root.query(statement);}}if(buffer.trim())await root.query(buffer);}
try{
 await root.query('CREATE DATABASE '+name);await root.query('USE '+name);
 await root.query('CREATE USER ?@? IDENTIFIED BY ?',[name,'127.0.0.1',password]);await root.query('GRANT ALL ON '+name+'.* TO ?@?',[name,'127.0.0.1']);
 const manifest=JSON.parse(await readFile('deployment/babal/release-manifest.json','utf8'));
 for(const migration of manifest.migrations)await migrate(migration.path);
 for(const migration of manifest.migrations.filter((m: {path:string})=>/product-identity|staff-permissions|delivery-rates-costs|business-notifications|exception-work|guest-business-notifications/.test(m.path)))await migrate(migration.path);
 pass('all historical prerequisites applied only to a fresh empty synthetic database; new additive migrations repeat');
 Object.assign(process.env,{DB_HOST:'127.0.0.1',DB_PORT:'13316',DB_NAME:name,DB_USER:name,DB_PASSWORD:password});
 const db=runtime.DB as unknown as D1Database;
 const readiness=await inspectReadiness(db);assert.equal(readiness.ready,true);pass('release readiness includes new tables and triggers');
 const now=Date.now();for(const [id,role] of [['sa1','super_admin'],['sa2','super_admin'],['admin1','admin'],['admin2','admin']]){
 await root.execute("INSERT INTO users(id,auth_subject,email,display_name,locale,status,created_at,updated_at) VALUES (?,?,?,?,'en-NP','active',?,?)",[id,id,id+'@example.test','Synthetic '+id,now,now]);await root.execute('INSERT INTO user_roles(user_id,role,assigned_at) VALUES (?,?,?)',[id,role,now]);}
 const request=await proposeStaffPermissions(db,{actorId:'sa1',userId:'admin1',permissions:['order.manage'],version:0,reason:'Synthetic restricted operations access',presetName:'Synthetic operations',now});
 await assert.rejects(()=>decideStaffPermissions(db,{actorId:'sa1',requestId:request,decision:'approve',reason:'Self approval denied',now}));
 const raced=await Promise.allSettled([1,2].map(()=>decideStaffPermissions(db,{actorId:'sa2',requestId:request,decision:'approve',reason:'Independent reviewer approval',now})));
 assert.equal(raced.filter(r=>r.status==='fulfilled').length,1);
 assert.equal(await hasStaffPermissionBySubject(db,'admin1','order.manage'),true);assert.equal(await hasStaffPermissionBySubject(db,'admin1','product.review'),false);assert.equal(await hasStaffPermissionBySubject(db,'admin2','product.review'),true);
 pass('native independent approval, concurrent single decision, restricted and legacy Admin permissions');
 const initial=await getDeliveryRates(db);const rates={zones:{valley:19000,terai:18000,nationwide:25000},districts:{}};
 await assert.rejects(()=>saveDeliveryRates(db,{actorId:'admin1',expectedVersion:initial.version,rates,reason:'Unauthorized price update',now}));
 const saves=await Promise.allSettled([1,2].map(()=>saveDeliveryRates(db,{actorId:'sa1',expectedVersion:initial.version,rates,reason:'Synthetic future tariff update',now})));
 assert.equal(saves.filter(r=>r.status==='fulfilled').length,1);assert.equal((await getDeliveryRates(db)).zones.valley,19000);pass('native rate authorization and concurrent stale-version rollback');
 await assert.rejects(()=>root.query("UPDATE delivery_rate_versions SET reason='rewrite'"));pass('native rate history immutable');
 await writeFile(out+'/native-current.json',JSON.stringify({localOnly:true,fakeAccounts:true,emailDisabled:true,checks},null,2));
}catch(error){await writeFile(out+'/native-failure.txt',error instanceof Error?error.stack??error.message:String(error));console.error('Native verification failed; private synthetic diagnostic saved.');process.exitCode=1;}finally{await root.end();setTimeout(()=>process.exit(process.exitCode??0),100).unref();}
