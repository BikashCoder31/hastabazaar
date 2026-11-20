import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { createHostedSessionForUser, getHostedIdentity } from '../lib/auth/hosted-session';
import { securityDatabase } from './helpers/security-database';

const start=1_800_000_000_000;
function account(f:ReturnType<typeof securityDatabase>,role:string) {
  f.sqlite.prepare('INSERT INTO users VALUES (?,?,?,?,?,?)').run('user','subject','fictional@example.test','Fictional','active',start);
  f.sqlite.prepare('INSERT INTO user_roles VALUES (?,?)').run('user',role);
}
function session(f:ReturnType<typeof securityDatabase>,lastSeen=start) {
  const token='fictional-session';
  f.sqlite.prepare('INSERT INTO user_sessions VALUES (?,?,?,?,?)').run(createHash('sha256').update(token).digest('hex'),'user',start+30*86400000,start,lastSeen);
  return new Headers({cookie:'hastabazaar_session='+token});
}
for(const role of ['admin','super_admin']) {
  void test(`${role} sessions expire at the 30-minute idle boundary on the server`,async()=>{
    const f=securityDatabase();try{account(f,role);const headers=session(f);
      assert.equal(await getHostedIdentity(f.db,headers,start+30*60000),null);
    }finally{f.dispose();}
  });
  void test(`${role} activity cannot extend the 8-hour absolute deadline`,async()=>{
    const f=securityDatabase();try{account(f,role);const headers=session(f,start+8*3600000-1000);
      assert.equal(await getHostedIdentity(f.db,headers,start+8*3600000),null);
    }finally{f.dispose();}
  });
  void test(`new ${role} hosted session expires in eight hours`,async()=>{
    const f=securityDatabase();try{account(f,role);const token=await createHostedSessionForUser(f.db,'user',start);
      const row=f.sqlite.prepare('SELECT expires_at FROM user_sessions WHERE token_hash=?').get(createHash('sha256').update(token).digest('hex'))!;
      assert.equal(row.expires_at,start+8*3600000);
    }finally{f.dispose();}
  });
}
void test('ordinary customer sessions retain their existing lifetime',async()=>{
  const f=securityDatabase();try{account(f,'customer');const headers=session(f);
    assert.equal((await getHostedIdentity(f.db,headers,start+24*3600000))?.userId,'subject');
  }finally{f.dispose();}
});
void test('staff activity refreshes before an idle timeout and never moves backwards',async()=>{
  const f=securityDatabase();try{account(f,'admin');const headers=session(f);
    assert.ok(await getHostedIdentity(f.db,headers,start+10*60000));
    assert.equal(f.sqlite.prepare('SELECT last_seen_at FROM user_sessions').get()!.last_seen_at,start+10*60000);
    assert.equal(await getHostedIdentity(f.db,headers,start+5*60000),null,'A request with a time before the recorded activity fails closed');
    assert.equal(f.sqlite.prepare('SELECT last_seen_at FROM user_sessions').get()!.last_seen_at,start+10*60000,'A delayed request cannot move the saved activity time backwards');
    assert.ok(await getHostedIdentity(f.db,headers,start+35*60000));
  }finally{f.dispose();}
});
