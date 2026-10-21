import assert from 'node:assert/strict';
import { randomBytes,createHash } from 'node:crypto';
import test from 'node:test';
import { getHostedIdentity } from '../lib/auth/hosted-session';
import { SecurityStore } from '../lib/security/store';
import { MfaService } from '../lib/security/mfa';
import { totpAtCounter } from '../lib/security/crypto';
import { securityDatabase } from './helpers/security-database';

const now=1_800_000_000_000;
async function enrolled() {
  const f=securityDatabase(),key=Buffer.from(randomBytes(32)).toString('base64url');
  f.sqlite.prepare('INSERT INTO users VALUES (?,?,?,?,?,?)').run('admin','admin-subject','staff@example.test','Fictional staff','active',now);
  f.sqlite.prepare('INSERT INTO user_roles VALUES (?,?)').run('admin','super_admin');
  const token='old-session',hash=createHash('sha256').update(token).digest('hex');
  f.sqlite.prepare('INSERT INTO user_sessions VALUES (?,?,?,?,?)').run(hash,'admin',now+8*3600000,now,now);
  const store=new SecurityStore(f.db,key);await store.initialize(['admin'],now);
  const mfa=new MfaService(store),setup=await mfa.beginSetup({userId:'admin',sessionHash:hash,now});
  const recovery=await mfa.confirmSetup({userId:'admin',sessionHash:hash,setupId:setup.setupId,code:totpAtCounter(setup.secret,Math.floor(now/30000)),now});
  await mfa.activateSetup({userId:'admin',sessionHash:hash,setupId:setup.setupId,recoverySaved:true,passwordVerifiedAt:now,now});
  return {...f,key,store,mfa,hash,codes:recovery.codes,headers:new Headers({cookie:'hastabazaar_session='+token})};
}
void test('an enrolled staff session requires matching current MFA proof',async()=>{
  const f=await enrolled();try{
    assert.ok(await getHostedIdentity(f.db,f.headers,now,{securityKey:f.key}));
    f.sqlite.prepare('DELETE FROM marketplace_settings WHERE `key`=?').run('auth-private:session:'+f.hash);
    assert.equal(await getHostedIdentity(f.db,f.headers,now,{securityKey:f.key}),null);
  }finally{f.dispose();}
});
void test('a failed combined recovery replacement cannot consume the final code or revoke its session',async()=>{
 const f=await enrolled();try{
  const account=await f.store.readAccount('admin');
  await f.store.checkedBatch(f.store.accountCas(account!,{...account!.value,recovery:{...account!.value.recovery!,hashes:[account!.value.recovery!.hashes[0]]}},now));
  const before=JSON.stringify(f.sqlite.prepare('SELECT * FROM marketplace_settings ORDER BY `key`').all());
  const linked=[f.db.prepare('DELETE FROM user_sessions'),f.db.prepare('INSERT INTO operation_transaction_guards(id,valid) VALUES (?,0)').bind('forced-failure')];
  await assert.rejects(()=>f.mfa.replaceRecovery({userId:'admin',sessionHash:f.hash,targetSessionHash:'f'.repeat(64),passwordVerifiedAt:now,code:f.codes[0],recovery:true,now,linkedStatements:linked}));
  assert.equal(JSON.stringify(f.sqlite.prepare('SELECT * FROM marketplace_settings ORDER BY `key`').all()),before);
  assert.equal(f.sqlite.prepare('SELECT count(*) n FROM user_sessions').get()!.n,1);
  const replaced=await f.mfa.replaceRecovery({userId:'admin',sessionHash:f.hash,passwordVerifiedAt:now,code:f.codes[0],recovery:true,now});
  assert.equal(replaced.codes.length,10);
 }finally{f.dispose();}
});
void test('missing key, corruption and revoked account fail closed after enrollment',async()=>{
  const f=await enrolled();try{
    await assert.rejects(()=>getHostedIdentity(f.db,f.headers,now,{securityKey:undefined}));
    await assert.rejects(()=>getHostedIdentity(f.db,f.headers,now,{securityKey:Buffer.from(randomBytes(32)).toString('base64url')}));
    f.sqlite.prepare("UPDATE users SET status='disabled'").run();
    assert.equal(await getHostedIdentity(f.db,f.headers,now,{securityKey:f.key}),null);
  }finally{f.dispose();}
});
void test('background reads do not keep an unattended verified session alive',async()=>{
  const f=await enrolled();try{
    assert.ok(await getHostedIdentity(f.db,f.headers,now+20*60000,{securityKey:f.key,activity:false}));
    assert.equal(await getHostedIdentity(f.db,f.headers,now+30*60000,{securityKey:f.key,activity:false}),null);
  }finally{f.dispose();}
});
