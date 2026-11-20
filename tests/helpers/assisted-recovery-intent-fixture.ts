import assert from 'node:assert/strict';
import {createHash,randomBytes} from 'node:crypto';
import {securityDatabase} from './security-database';
import {SecurityStore} from '../../lib/security/store';
import {MfaService} from '../../lib/security/mfa';
import {totpAtCounter} from '../../lib/security/crypto';
import {passwordRecord,readHostedSession,verifyPassword} from '../../lib/auth/hosted-session';

/** Fresh actual credential/session/MFA proofs, never an authority-function stub. */
export async function assistedRecoveryIntentFixture(){
 const f=securityDatabase(),now=Date.now(),key=Buffer.from(randomBytes(32)).toString('base64url');
 const password='Fictional-native-assisted-recovery-password';const credential=await passwordRecord(password);
 const token=(id:string)=>`fictional-assisted-session-${id}`;const hash=(id:string)=>createHash('sha256').update(token(id)).digest('hex');
 try{
  assert.ok(f.sqlite.prepare('PRAGMA database_list').all().every(row=>row.file===''));
  f.sqlite.exec(`CREATE TABLE audit_logs(id TEXT PRIMARY KEY,actor_id TEXT,action TEXT,subject_type TEXT,subject_id TEXT,reason TEXT,previous_json TEXT,next_json TEXT,request_id TEXT,ip_hash TEXT,created_at INTEGER);
   CREATE TABLE password_reset_challenges(token_hash TEXT PRIMARY KEY,user_id TEXT);CREATE TABLE email_login_challenges(token_hash TEXT PRIMARY KEY,user_id TEXT);CREATE TABLE account_contact_challenges(token_hash TEXT PRIMARY KEY,user_id TEXT);CREATE TABLE local_contact_captures(id TEXT PRIMARY KEY,user_id TEXT);`);
  for(const[id,role]of [['assist-a','super_admin'],['assist-b','super_admin'],['target-a','seller'],['target-b','seller']] as const){
   f.sqlite.prepare('INSERT INTO users VALUES(?,?,?,?,?,?)').run(id,id,`${id}@local.hastabazaar.test`,`Fictional ${id}`,'active',now);
   f.sqlite.prepare('INSERT INTO user_roles VALUES(?,?)').run(id,role);f.sqlite.prepare('INSERT INTO user_credentials VALUES(?,?,?,1,?,?)').run(id,credential.hash,credential.salt,now,now);
   if(role==='super_admin')f.sqlite.prepare('INSERT INTO user_sessions VALUES(?,?,?,?,?)').run(hash(id),id,now+3600000,now,now);
  }
  const store=new SecurityStore(f.db,key);await store.initialize(['assist-a','assist-b','target-a','target-b'],now);
  for(const id of ['assist-a','assist-b']){
   assert.equal(await verifyPassword(password,credential.hash,credential.salt),true);
   const mfa=new MfaService(store),setup=await mfa.beginSetup({userId:id,sessionHash:hash(id),now});
   await mfa.confirmSetup({userId:id,sessionHash:hash(id),setupId:setup.setupId,code:totpAtCounter(setup.secret,Math.floor(now/30000)),now});
   await mfa.activateSetup({userId:id,sessionHash:hash(id),setupId:setup.setupId,recoverySaved:true,passwordVerifiedAt:now,now});
   assert.ok(await readHostedSession(f.db,new Headers({cookie:`hastabazaar_session=${token(id)}`}),now));
  }
  return{...f,key,store,token,password,now};
 }catch(error){f.dispose();throw error;}
}
