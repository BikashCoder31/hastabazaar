import assert from 'node:assert/strict';
import test from 'node:test';
import {registerHooks} from 'node:module';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {completeVersionFixture} from './helpers/complete-version-fixture';
import {staffMutationGuard} from '../lib/db/repositories/staff-mutation-guard';
import {executeTeamGovernance} from '../lib/operations/team-governance';
import {ensureReviewTask} from '../lib/workflows/review-tasks';
import {createIncident} from '../lib/operations/incident-review';

declare global {
 var areaContextDb:D1Database;
 var areaContextActor:string;
 var areaContextAuthority:(permission?:string)=>Promise<{id:string;role:string;permissions?:string[]}>;
 var areaContextElement:typeof createElement;
 var areaContextRedirect:string;
}
globalThis.areaContextElement=createElement;
registerHooks({resolve(specifier,context,next){
 if(specifier==='cloudflare:workers')return{url:'data:text/javascript,export const env={get DB(){return globalThis.areaContextDb},HASTABAZAAR_RUNTIME_ENV:"test",HASTABAZAAR_RELEASE_ID:"fictional-area-context"}',shortCircuit:true};
 if(specifier==='@/lib/auth/staff')return{url:'data:text/javascript,export class StaffAuthorizationError extends Error{};export async function requireStaffPage(path,permission){return globalThis.areaContextAuthority(permission)};export async function getStaffUser(){return globalThis.areaContextAuthority()}',shortCircuit:true};
 if(specifier==='next/link')return{url:'data:text/javascript,export default function Link({children,...props}){return globalThis.areaContextElement("a",props,children)}',shortCircuit:true};
 if(specifier==='next/navigation')return{url:'data:text/javascript,export function redirect(url){globalThis.areaContextRedirect=url;throw new Error("Fixture redirect")};export function notFound(){throw new Error("Not found")};export function useRouter(){return{refresh(){},push(){}}};export function usePathname(){return "/admin/team"};export function useSearchParams(){return new URLSearchParams()}',shortCircuit:true};
 return next(specifier,context);
}});
const upstream='/admin?reviewView=assigned&reviewDepartment=operations&reviewSelected=original-task&reviewPage=3#seller-review-queue';
function bind(db:D1Database,actor='reviewer'){
 globalThis.areaContextDb=db;globalThis.areaContextActor=actor;
 globalThis.areaContextAuthority=async(permission='account.self.manage')=>{const proof=await staffMutationGuard(db,globalThis.areaContextActor,permission as never,Error);return{id:globalThis.areaContextActor,role:proof.role,permissions:proof.permissions};};
}
const urls=(html:string)=>[...html.matchAll(/href="([^"]+)"/g)].map(match=>new URL(match[1].replaceAll('&amp;','&'),'https://fixture.invalid'));

void test('actual Team page retains the original queue through five tabs, people filters and own responsibilities',async()=>{
 const f=await completeVersionFixture(Date.now());try{bind(f.db);const page=await import('../app/admin/team/page');
  const html=renderToStaticMarkup(await page.default({searchParams:Promise.resolve({tab:'people',department:'Operations',status:'active',permission:'product.review',returnTo:upstream})}));
  const links=urls(html),tabs=links.filter(url=>url.pathname==='/admin/team'&&url.searchParams.has('tab'));
  assert.ok(tabs.length>=5);for(const tab of tabs){assert.equal(tab.searchParams.get('returnTo'),upstream,'A Team tab lost the original queue');assert.equal(tab.searchParams.get('department'),'Operations');assert.equal(tab.searchParams.get('status'),'active');assert.equal(tab.searchParams.get('permission'),'product.review');}
  assert.ok(links.some(url=>url.pathname+url.search+url.hash===upstream));
  assert.match(html,/name="returnTo" value="\/admin\?reviewView=assigned/);
  bind(f.db,'delegate');const own=renderToStaticMarkup(await page.default({searchParams:Promise.resolve({returnTo:upstream})}));
  assert.match(own,/My responsibilities/);assert.doesNotMatch(own,/Secure access controls and history/);assert.ok(urls(own).some(url=>url.pathname+url.search+url.hash===upstream));
  bind(f.db,'customer');await assert.rejects(page.default({searchParams:Promise.resolve({returnTo:upstream})}),/Current staff permission/);
 }finally{f.dispose();}
});

void test('actual protected Team task redirect retains the exact native control plus safe return context',async()=>{
 const f=await completeVersionFixture(Date.now());try{bind(f.db);
  const saved=await executeTeamGovernance(f.db,{actorId:'reviewer',requestId:'area-calendar-review',expectedRevision:null,now:f.now},{action:'schedule_policy_review',sourceId:'service_calendar',toUserId:'delegate',endsAt:f.now+86400000,reason:'Review the exact current calendar while retaining the original filtered queue.'});
  assert.ok(saved&&typeof saved==='object'&&'id'in saved&&typeof saved.id==='string');
  const taskId=await ensureReviewTask(f.db,{sourceType:'team_governance',sourceId:saved.id,now:f.now}),page=await import('../app/admin/team/tasks/[id]/page');
  await assert.rejects(page.default({params:Promise.resolve({id:taskId}),searchParams:Promise.resolve({returnTo:upstream})}),/Fixture redirect/);
  const destination=new URL(globalThis.areaContextRedirect,'https://fixture.invalid');assert.equal(destination.pathname,'/admin/team');assert.equal(destination.searchParams.get('tab'),'policies');assert.equal(destination.hash,'#policy-review-'+saved.id);assert.equal(destination.searchParams.get('returnTo'),upstream);
  await assert.rejects(page.default({params:Promise.resolve({id:taskId}),searchParams:Promise.resolve({returnTo:'https://attacker.invalid/private'})}),/Fixture redirect/);
  assert.equal(new URL(globalThis.areaContextRedirect,'https://fixture.invalid').searchParams.get('returnTo'),'/admin/team');
 }finally{f.dispose();}
});

void test('actual System Health and incident pages retain current source handoffs and safe Back links',async()=>{
 const f=await completeVersionFixture(Date.now()-1000);try{bind(f.db);
  const saved=await createIncident(f.db,{actorId:'reviewer',requestId:'area-incident',expectedRevision:null,now:f.now},{environment:'test',serviceKey:'email.sender',failureSignature:'fictional-area-handoff',title:'Fictional source handoff',impactSummary:'Review the current functional observation and retain the original work context.',impactClass:'ordinary',severity:'routine'});
  const health=await import('../app/admin/system-health/page'),incidents=await import('../app/admin/system-health/incidents/page');
  const overview=renderToStaticMarkup(await health.default({searchParams:Promise.resolve({returnTo:upstream})}));
  assert.ok(urls(overview).some(url=>url.pathname+url.search+url.hash===upstream));
  const incidentLink=urls(overview).find(url=>url.searchParams.get('incident')===saved.incidentId);assert.ok(incidentLink);const parent=new URL(incidentLink.searchParams.get('returnTo')??'','https://fixture.invalid');assert.equal(parent.pathname,'/admin/system-health');assert.equal(parent.searchParams.get('returnTo'),upstream);
  const detail=renderToStaticMarkup(await incidents.default({searchParams:Promise.resolve({incident:saved.incidentId,returnTo:upstream})}));
  assert.ok(urls(detail).some(url=>url.pathname+url.search+url.hash===upstream));
  for(const url of urls(detail).filter(url=>url.pathname==='/admin/system-health/incidents'&&url.searchParams.has('incident')))assert.equal(url.searchParams.get('returnTo'),upstream);
 }finally{f.dispose();}
});

void test('actual scoped Records search preserves exact filters through native source links and rejects external returns',async()=>{
 const f=await completeVersionFixture(Date.now());try{bind(f.db);const page=await import('../app/admin/system-health/records/page');
  const saved=await executeTeamGovernance(f.db,{actorId:'reviewer',requestId:'record-calendar-review',expectedRevision:null,now:f.now},{action:'schedule_policy_review',sourceId:'service_calendar',toUserId:'delegate',endsAt:f.now+86400000,reason:'Retain the original source and scoped audit search context.'});
  assert.ok(saved&&typeof saved==='object'&&'id'in saved&&typeof saved.id==='string');const taskId=await ensureReviewTask(f.db,{sourceType:'team_governance',sourceId:saved.id,now:f.now});
  const html=renderToStaticMarkup(await page.default({searchParams:Promise.resolve({type:'review',reference:taskId,status:'awaiting_review',returnTo:upstream})})),source=urls(html).find(url=>url.pathname==='/admin'&&url.searchParams.get('reviewQ')===saved.id);assert.ok(source,'The actual authorized source queue link must remain linked');
  const back=new URL(source.searchParams.get('returnTo')??'','https://fixture.invalid');assert.equal(back.pathname,'/admin/system-health/records');assert.equal(back.searchParams.get('reference'),taskId);assert.equal(back.searchParams.get('status'),'awaiting_review');assert.equal(back.searchParams.get('type'),'review');assert.equal(back.searchParams.get('returnTo'),upstream);
  assert.match(html,/name="returnTo"/);assert.ok(urls(html).some(url=>url.pathname+url.search+url.hash===upstream));
  const bad=renderToStaticMarkup(await page.default({searchParams:Promise.resolve({type:'review',reference:taskId,returnTo:'//attacker.invalid/private'})}));assert.doesNotMatch(bad,/attacker\.invalid/);
 }finally{f.dispose();}
});
