import test from 'node:test';
import assert from 'node:assert/strict';
import {completeVersionFixture} from './helpers/complete-version-fixture';
import {executeTeamGovernance} from '../lib/operations/team-governance';
import {isCurrentTeamNotice,teamOperationalSource} from '../lib/operations/team-notice-sources';
void test('native Maria Team notice descriptor uses a portable procedure alias',()=>{
 const source=teamOperationalSource({dialect:'mariadb'} as unknown as D1Database,{kind:'team.governance',sourceId:'native-event',eventId:'native-event',status:'access_changed:team_governance'});
 assert.ok(source);assert.match(source.staffGuard!,/FROM team_procedures team_procedure JOIN/);assert.doesNotMatch(source.staffGuard!,/\bprocedure\./);assert.match(source.staffGuard!,/team_procedure\.id/);assert.match(source.staffGuard!,/team_procedure\.retired_at/);
});
void test('personal availability and assigned reserved-family training notify the exact ordinary reader without granting decision authority',async()=>{
 const f=await completeVersionFixture(Date.now());try{
 const cases:Array<[string,Parameters<typeof executeTeamGovernance>[2],string|null]>=[
  ['notice-own-availability',{action:'availability',sourceId:'delegate',available:false,startsAt:f.now+3600000,endsAt:f.now+7200000,reason:'PRIVATE Record the actual known interval; this notice must reach only its staff subject and eligible Super Admin.'},null],
  ['notice-reserved-training',{action:'publish_procedure',sourceId:'identity_bank',title:'Current identity handling instruction',body:'Read this exact current instruction; assignment does not authorize verification or a bank decision.',userIds:['delegate'],reason:'PRIVATE Assign an actual applicable work instruction without granting reserved decision authority.'},null],
  ['notice-own-review',{action:'complete_access_review',sourceId:'delegate',reason:'PRIVATE Reviewed this actual staff subject and exact current profile, without exposing the reviewer reasoning.'},'1'],
 ];for(const [requestId,input,expectedRevision] of cases){
  await executeTeamGovernance(f.db,{actorId:'reviewer',requestId,expectedRevision,now:f.now},input);
  const rows=f.sqlite.prepare("SELECT n.recipient_user_id AS userId,n.channel,n.body_en AS body,n.template_key AS template,n.related_id AS relatedId,n.related_type AS relatedType,n.audience_role AS audience,n.request_id AS requestId FROM notification_messages n JOIN team_governance_events e ON e.id=n.related_id WHERE e.request_id=?").all(requestId);
  assert.deepEqual(rows.map(row=>row.userId+':'+row.channel).sort(),['delegate:email','delegate:in_app','reviewer:email','reviewer:in_app']);
  assert.ok(!JSON.stringify(rows).includes('PRIVATE'));for(const row of rows)assert.equal(await isCurrentTeamNotice(f.db,row as never,f.now),true);
 }
 assert.equal(f.sqlite.prepare("SELECT 1 FROM user_roles WHERE user_id='delegate' AND role='super_admin'").get(),undefined);
 }finally{f.dispose();}
});
void test('actual duty/handoff facts enqueue exact eligible target and actor-SA once per channel, suppress superseded work and private reasons',async()=>{
 const f=await completeVersionFixture(Date.now());try{
 const ctx=(requestId:string,expectedRevision:string|null=null,actorId='reviewer')=>({actorId,requestId,expectedRevision,now:f.now});
 const input={action:'save_duty',sourceId:'products',primaryId:'delegate',backupIds:['reviewer'],reason:'PRIVATE original absence and restricted roster explanation.'};
 const saved=await executeTeamGovernance(f.db,ctx('notice-duty'),input);await executeTeamGovernance(f.db,ctx('notice-duty'),input);
 const rows=f.sqlite.prepare("SELECT recipient_user_id AS userId,channel,body_en AS body,template_key AS template,related_id AS relatedId,related_type AS relatedType,audience_role AS audience,request_id AS requestId FROM notification_messages WHERE template_key='business.team.governance'").all();
 assert.equal(rows.length,4);assert.deepEqual(rows.map(row=>row.userId+':'+row.channel).sort(),['delegate:email','delegate:in_app','reviewer:email','reviewer:in_app']);assert.ok(!JSON.stringify(rows).includes('PRIVATE'));
 await executeTeamGovernance(f.db,ctx('notice-duty-change',String((saved as {revision:number}).revision)),{...input,primaryId:'reviewer',backupIds:['delegate'],reason:'Replace the active accountable owner using the exact roster revision.'});
 for(const row of rows)assert.equal(await isCurrentTeamNotice(f.db,row as never,f.now),false);
 const released=f.sqlite.prepare("SELECT n.recipient_user_id AS userId,n.channel,n.template_key AS template,n.related_id AS relatedId,n.related_type AS relatedType,n.audience_role AS audience,n.request_id AS requestId FROM notification_messages n JOIN team_governance_events e ON e.id=n.related_id WHERE e.request_id='notice-duty-change' AND n.recipient_user_id='delegate'").all();assert.equal(released.length,2);for(const row of released)assert.equal(await isCurrentTeamNotice(f.db,row as never,f.now),true);
 await executeTeamGovernance(f.db,ctx('notice-later-roster','1'),{...input,primaryId:'reviewer',backupIds:['delegate'],reason:'Retain the genuine current owner; a later roster observation must not lose the former owner release fact.'});for(const row of released)assert.equal(await isCurrentTeamNotice(f.db,row as never,f.now),true);
 const h=await executeTeamGovernance(f.db,ctx('notice-handoff','2'),{action:'propose_handoff',sourceId:'products',toUserId:'delegate',startsAt:f.now,endsAt:f.now+86400000,reason:'PRIVATE specific absence details must not enter notification snippets.'}) as {id:string};
 const old=f.sqlite.prepare("SELECT recipient_user_id AS userId,channel,template_key AS template,related_id AS relatedId,related_type AS relatedType,audience_role AS audience,request_id AS requestId FROM notification_messages WHERE template_key='business.team.handoff'").all();assert.equal(old.length,4);
 await executeTeamGovernance(f.db,ctx('notice-accept','0','delegate'),{action:'accept_handoff',sourceId:h.id,reason:'I confirm receipt of the actual permitted product review responsibility.'});
 for(const row of old)assert.equal(await isCurrentTeamNotice(f.db,row as never,f.now),false);
 const latest=f.sqlite.prepare("SELECT recipient_user_id AS userId,channel,template_key AS template,related_id AS relatedId,related_type AS relatedType,audience_role AS audience,request_id AS requestId FROM notification_messages WHERE template_key='business.team.handoff' AND related_id NOT IN(SELECT id FROM team_governance_events WHERE action='propose_handoff') AND recipient_user_id='delegate'").all();assert.equal(latest.length,2);
 f.sqlite.prepare("UPDATE staff_permission_profiles SET permissions_json='[]',version=version+1 WHERE user_id='delegate'").run();for(const row of latest)assert.equal(await isCurrentTeamNotice(f.db,row as never,f.now),false);
 }finally{f.dispose();}
});
