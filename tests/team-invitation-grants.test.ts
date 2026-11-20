import test from 'node:test';
import assert from 'node:assert/strict';
import {completeVersionFixture} from './helpers/complete-version-fixture';
import {createStaffInvitation} from '../lib/db/repositories/staff';
async function grants(){const path='../lib/operations/staff-invitation-grants',g=await import(path).catch(()=>null);assert.equal(typeof g?.staffInvitationAcceptanceStatements,'function','exact selected grant must precede role acceptance');return g!;}
void test('new narrow invitation installs only selected access in the same guarded acceptance transaction',async()=>{
 const g=await grants(),f=await completeVersionFixture(Date.now());try{
 const invitation=await createStaffInvitation(f.db,{email:'applicant@local.hastabazaar.test',role:'admin',permissions:['product.review'],invitedBy:'reviewer',now:f.now} as never);
 const statements=await g.staffInvitationAcceptanceStatements(f.db,{invitationId:invitation.id,userId:'applicant',authSubject:'applicant',email:'applicant@local.hastabazaar.test',now:f.now});assert.ok(statements);
 await f.db.batch(statements);
 assert.equal(f.sqlite.prepare("SELECT permissions_json FROM staff_permission_profiles WHERE user_id='applicant'").get()!.permissions_json,'["product.review"]');
 assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM user_roles WHERE user_id='applicant' AND role='admin'").get()!.n,1);
 assert.equal(f.sqlite.prepare('SELECT status FROM staff_invitations WHERE id=?').get(invitation.id)!.status,'accepted');
 }finally{f.dispose();}
});
void test('unreviewed pending legacy invitation cannot promote and revocation before acceptance rolls back the exact profile',async()=>{
 const g=await grants(),f=await completeVersionFixture(Date.now());try{
 f.sqlite.prepare("INSERT INTO staff_invitations(id,email,role,status,invited_by,expires_at,created_at) VALUES('old-pending','applicant@local.hastabazaar.test','admin','pending','reviewer',?,?)").run(f.now+86400000,f.now);
 assert.equal(await g.staffInvitationAcceptanceStatements(f.db,{invitationId:'old-pending',userId:'applicant',authSubject:'applicant',email:'applicant@local.hastabazaar.test',now:f.now}),null);
 f.sqlite.prepare("UPDATE staff_invitations SET status='revoked' WHERE id='old-pending'").run();
 const invite=await createStaffInvitation(f.db,{email:'applicant@local.hastabazaar.test',role:'admin',permissions:['product.review'],invitedBy:'reviewer',now:f.now} as never);
 const statements=await g.staffInvitationAcceptanceStatements(f.db,{invitationId:invite.id,userId:'applicant',authSubject:'applicant',email:'applicant@local.hastabazaar.test',now:f.now});
 f.setBeforeBatch(()=>{f.sqlite.prepare("UPDATE staff_invitations SET status='revoked' WHERE id=?").run(invite.id);});await assert.rejects(f.db.batch(statements));
 assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM staff_permission_profiles WHERE user_id='applicant'").get()!.n,0);
 assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM user_roles WHERE user_id='applicant' AND role='admin'").get()!.n,0);
 }finally{f.dispose();}
});
