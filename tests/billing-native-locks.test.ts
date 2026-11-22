import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import test from 'node:test';
import mysql,{type Pool} from 'mysql2/promise';
import {env} from '../lib/runtime/node-bindings';

void test('native batches lock sorted distinct billing issuers before SQL and release on commit or failure',async()=>{
  const keys=['DB_HOST','DB_NAME','DB_USER','DB_PASSWORD'];
  const original=Object.fromEntries(keys.map(key=>[key,process.env[key]])),createPool=mysql.createPool;
  const calls:{sql:string;values:unknown[]}[]=[];let fail=false;
  const connection={
    async execute(sql:string,values:unknown[]=[]){calls.push({sql,values});
      if(sql.includes('GET_LOCK'))return [[{acquired:fail?0:1}],[]];
      return [[{valid:1}],[]];},
    async query(sql:string){calls.push({sql,values:[]});},async beginTransaction(){calls.push({sql:'BEGIN',values:[]});},
    async commit(){calls.push({sql:'COMMIT',values:[]});},async rollback(){calls.push({sql:'ROLLBACK',values:[]});},
    release(){calls.push({sql:'RELEASE_CONNECTION',values:[]});},destroy(){calls.push({sql:'DESTROY',values:[]});},
  };
  mysql.createPool=(()=>({async getConnection(){return connection;}}) as unknown as Pool) as typeof createPool;
  Object.assign(process.env,{DB_HOST:'unused.invalid',DB_NAME:'billing_fixture',DB_USER:'fixture',DB_PASSWORD:'fictional-not-a-credential'});
  try{
    const statements=['z','a','z'].map(key=>env.DB.prepare('/* billing-issuer-lock */ SELECT ? AS issuer').bind(key));
    statements.push(env.DB.prepare('SELECT 1 AS reservation'));
    await env.DB.batch(statements);
    const acquired=calls.filter(call=>call.sql.includes('GET_LOCK'));
    assert.deepEqual(acquired.map(call=>call.values[0]),['a','z'].map(issuer=>'bill:'+createHash('sha256').update('billing_fixture\0'+issuer).digest('hex').slice(0,59)));
    assert.ok(calls.findIndex(call=>call.sql==='SELECT 1 AS reservation')>calls.findLastIndex(call=>call.sql.includes('GET_LOCK')));
    assert.ok(calls.findIndex(call=>call.sql==='COMMIT')<calls.findIndex(call=>call.sql.includes('RELEASE_LOCK')));
    assert.equal(calls.filter(call=>call.sql.includes('RELEASE_LOCK')).length,2);
    calls.length=0;fail=true;
    await assert.rejects(env.DB.batch(statements),/Billing issuer lock unavailable/);
    assert.ok(calls.some(call=>call.sql==='ROLLBACK'));assert.ok(!calls.some(call=>call.sql==='SELECT 1 AS reservation'));
  }finally{
    mysql.createPool=createPool;
    for(const key of keys){if(original[key]===undefined)delete process.env[key];else process.env[key]=original[key];}
  }
});
