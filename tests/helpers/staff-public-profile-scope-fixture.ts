import assert from 'node:assert/strict';
import {sellerProfileScopeFixture} from './seller-profile-scope-fixture';
/** Two fictional, independently authorized reviewers; real native Staff resolution and guards. */
export async function staffPublicProfileScopeFixture(){const f=await sellerProfileScopeFixture();try{
 f.sqlite.prepare("UPDATE users SET auth_subject='external-profile-reviewer-a' WHERE id='reviewer'").run();
 f.sqlite.prepare("INSERT INTO users(id,auth_subject,email,display_name,status,created_at,updated_at) VALUES('profile-reviewer-b','external-profile-reviewer-b','profile-reviewer-b@local.hastabazaar.test','Fictional independent reviewer B','active',?,?)").run(Date.now(),Date.now());
 f.sqlite.prepare("INSERT INTO user_roles(user_id,role,assigned_at) VALUES('profile-reviewer-b','super_admin',?)").run(Date.now());
 const select=(id:'reviewer'|'profile-reviewer-b')=>{const row=f.sqlite.prepare('SELECT auth_subject,email FROM users WHERE id=?').get(id)!;globalThis.registrationScopeIdentity={userId:String(row.auth_subject),email:String(row.email),mailboxVerified:true};};
 const {requireStaffApi}=await import('../../lib/auth/staff');for(const id of ['reviewer','profile-reviewer-b']as const){select(id);assert.equal((await requireStaffApi('seller.application.review')).id,id);}
 const api=await import('../../app/api/admin/sellers/[id]/public-profile/route'),{getPublicProfileWorkspace}=await import('../../lib/sellers/public-profile-workflow');
 const workspace=await getPublicProfileWorkspace(f.db,'registered','profile-reviewer-b','staff',Date.now());
 const payload=()=>({action:'request_correction',baseVersion:workspace.state.version,fields:['publicCity'],reason:'Inspect the exact current public city and request a factual correction only.',nextUpdateAt:Date.now()+3600000,requestId:crypto.randomUUID()});
 return{...f,api,select,workspace,payload};
 }catch(error){f.dispose();throw error;}}
