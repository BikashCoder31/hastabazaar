import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {productPublicationFixture} from './helpers/product-publication-fixture';
const fixture={db:null as D1Database|null,actorId:'customer',subject:'customer'};
(globalThis as typeof globalThis&{notificationIntentFixture:typeof fixture}).notificationIntentFixture=fixture;
registerHooks({resolve(specifier,context,next){const modules:Record<string,string>={
 'cloudflare:workers':'export const env={get DB(){return globalThis.notificationIntentFixture.db}};',
 'next/navigation':'export function redirect(url){throw Error(url)}',
 '@/app/auth':'export async function getAuthenticatedUser(){return{userId:globalThis.notificationIntentFixture.subject}};export const requireAuthenticatedUser=getAuthenticatedUser;',
 };return modules[specifier]?{url:'data:text/javascript,'+encodeURIComponent(modules[specifier]),shortCircuit:true}:next(specifier,context);}});

void test('native notification reads and read acknowledgements reject a former rendered actor across all three workspaces',async t=>{
 const f=await productPublicationFixture();fixture.db=f.db;try{
  const {GET}=await import('../app/api/notifications/route');
  const {POST:personalRead}=await import('../app/api/notifications/[id]/read/route');
  const {POST:staffRead}=await import('../app/api/admin/notifications/[id]/read/route');
  for(const [audience,former,current] of [['customer','customer','foreign'],['seller','maker-user','registered-owner'],['staff','reviewer','delegate']] as const){
   const original=audience==='staff'?f.sqlite.prepare("SELECT id FROM notification_messages WHERE recipient_user_id='delegate' AND audience_role='staff' AND channel='in_app' AND related_id=? LIMIT 1").get(f.sent.caseId):null;
   if(audience==='staff')assert.ok(original,'Use the actual pending product notification delivered to its permitted reviewer.');
   const id=original?String(original.id):'intent-'+audience;
   if(audience!=='staff')f.sqlite.prepare("INSERT INTO notification_messages(id,recipient_user_id,audience_role,channel,template_key,subject_en,subject_ne,body_en,body_ne,status,request_id,created_at) VALUES(?,?,?,'in_app','fixture.notice','Current private message','Current private message','PRIVATE-CURRENT-BODY','PRIVATE-CURRENT-BODY','sent',?,1)").run(id,current,audience,id);
   fixture.actorId=current;
   fixture.subject='external-auth-'+current;f.sqlite.prepare('UPDATE users SET auth_subject=? WHERE id=?').run(fixture.subject,current);
   await t.test(audience+' panel',async()=>{
    const request=(actor?:string)=>new Request('http://localhost:3018/api/notifications?audience='+audience,{headers:actor?{'X-Hastabazaar-Actor':actor}:{}});
    const legacy=await GET(request());assert.equal(legacy.status,200,'The actual current recipient must be eligible before testing actor intent.');
    const denied=await GET(request(former));assert.equal(denied.status,403);assert.doesNotMatch(await denied.text(),/PRIVATE-CURRENT-BODY|intent-/);
    const accepted=await GET(request(current));assert.equal(accepted.status,200);assert.ok((await accepted.json() as {items:{id:string}[]}).items.some(item=>item.id===id));
   });
   await t.test(audience+' acknowledgement',async()=>{
    const post=audience==='staff'?staffRead:personalRead;
    const read=(actor:string)=>post(new Request('http://localhost:3018/api/notifications/'+id+'/read',{method:'POST',headers:{origin:'http://localhost:3018','X-Hastabazaar-Actor':actor}}),{params:Promise.resolve({id})});
    assert.equal((await read(former)).status,403);assert.equal(f.sqlite.prepare('SELECT read_at FROM notification_messages WHERE id=?').get(id)!.read_at,null);
    assert.equal((await read(current)).status,200);const saved=f.sqlite.prepare('SELECT read_at FROM notification_messages WHERE id=?').get(id)!.read_at;
    assert.equal((await read(current)).status,200);assert.equal(f.sqlite.prepare('SELECT read_at FROM notification_messages WHERE id=?').get(id)!.read_at,saved);
   });
  }
 }finally{fixture.db=null;f.dispose();}
});
