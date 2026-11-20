import test from 'node:test';
import assert from 'node:assert/strict';
import {completeVersionFixture} from './helpers/complete-version-fixture';
import {createStaffInvitation,revokeStaffInvitation} from '../lib/db/repositories/staff';
void test('invitation revocation rechecks actual Super Admin at commit rather than trust an old authorized tab',async()=>{
 const f=await completeVersionFixture(Date.now());try{
 const invite=await createStaffInvitation(f.db,{email:'applicant@local.hastabazaar.test',role:'admin',permissions:['product.review'],invitedBy:'reviewer',now:f.now});
 const wrapped=Object.create(f.db) as D1Database;let raced=false,inBatch=false;const revokeAuthority=()=>{if(!raced){raced=true;f.sqlite.prepare("DELETE FROM user_roles WHERE user_id='reviewer' AND role='super_admin'").run();}};
 wrapped.prepare=((sql:string)=>{const statement=f.db.prepare(sql);if(sql.includes('UPDATE staff_invitations')){const run=statement.run.bind(statement);statement.run=(async()=>{if(!inBatch)revokeAuthority();return run();}) as D1PreparedStatement['run'];}return statement;}) as D1Database['prepare'];
 wrapped.batch=(async(statements:D1PreparedStatement[])=>{inBatch=true;revokeAuthority();return f.db.batch(statements);}) as D1Database['batch'];
 await assert.rejects(revokeStaffInvitation(wrapped,{invitationId:invite.id,actorId:'reviewer',now:f.now+1}));assert.equal(raced,true);assert.equal(f.sqlite.prepare('SELECT status FROM staff_invitations WHERE id=?').get(invite.id)!.status,'pending');
 }finally{f.dispose();}
});
void test('revocation and its retained history commit together',async()=>{
 const f=await completeVersionFixture(Date.now());try{
 const invite=await createStaffInvitation(f.db,{email:'applicant@local.hastabazaar.test',role:'admin',permissions:[],invitedBy:'reviewer',now:f.now});
 f.sqlite.exec("CREATE TRIGGER fictional_revoke_history_failure BEFORE INSERT ON audit_logs WHEN NEW.action='staff.invitation.revoked' BEGIN SELECT RAISE(ABORT,'fictional_history_failure'); END;");
 await assert.rejects(revokeStaffInvitation(f.db,{invitationId:invite.id,actorId:'reviewer',now:f.now+1}));assert.equal(f.sqlite.prepare('SELECT status FROM staff_invitations WHERE id=?').get(invite.id)!.status,'pending');
 }finally{f.dispose();}
});
