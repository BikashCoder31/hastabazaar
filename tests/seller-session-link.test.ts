import assert from 'node:assert/strict';
import test from 'node:test';
import { getHostedIdentity } from '../lib/auth/hosted-session';
function fixture(subject: string | null, finalSubject: string | null = 'local:account-1', authenticated = true) {
 const writes: Array<{sql:string; values:unknown[]}> = [];
 const db = { prepare(sql:string) { let values:unknown[]=[]; return {
  bind(...args:unknown[]) {values=args;return this;},
  async first() {return sql.includes('FROM user_sessions') ? (authenticated ? {accountId:'account-1',userId:subject,email:'seller@example.test',displayName:'Seller',fullName:'Seller',lastSeenAt:1000} : null) : {userId:finalSubject};},
  async run() {writes.push({sql,values});return {meta:{changes:1}};}
 };} } as unknown as D1Database;
 return {db,writes};
}
const headers=new Headers({cookie:'hastabazaar_session=test-session'});
void test('application-created account receives a stable subject through its valid session',async()=>{
 const f=fixture(null); const identity=await getHostedIdentity(f.db,headers,1000);
 assert.equal(identity?.userId,'local:account-1');
 assert.equal(f.writes.length,1);
 assert.match(f.writes[0].sql,/WHERE id = \? AND auth_subject IS NULL/);
 assert.deepEqual(f.writes[0].values,['local:account-1',1000,'account-1']);
});
void test('existing provider identities are preserved without relinking',async()=>{
 const f=fixture('google:existing');
 assert.equal((await getHostedIdentity(f.db,headers,1000))?.userId,'google:existing');
 assert.equal(f.writes.length,0);
});
void test('concurrent linking uses the stored identity rather than overwriting it',async()=>{
 const f=fixture(null,'google:concurrent');
 assert.equal((await getHostedIdentity(f.db,headers,1000))?.userId,'google:concurrent');
});
void test('missing or invalid sessions never establish an identity link',async()=>{
 const f=fixture(null,null,false);
 assert.equal(await getHostedIdentity(f.db,headers,1000),null);
 assert.equal(await getHostedIdentity(f.db,new Headers(),1000),null);
 assert.equal(f.writes.length,0);
});
