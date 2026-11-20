import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {productPublicationFixture} from './helpers/product-publication-fixture';
import {getProductPublicationReview,reviewProductPublication} from '../lib/products/publication';
import {reportProductConcern} from '../lib/products/priority-concerns';
import {listReviewTasks,selectReviewOwner} from '../lib/workflows/review-tasks';
const fixture={db:null as D1Database|null};
(globalThis as typeof globalThis&{legacyProductReaderFixture:typeof fixture}).legacyProductReaderFixture=fixture;
registerHooks({resolve(specifier,context,next){const modules:Record<string,string>={
 'cloudflare:workers':'export const env={get DB(){return globalThis.legacyProductReaderFixture.db}};',
 'next/navigation':'export function redirect(url){throw Error("REDIRECT:"+url)};export function notFound(){throw Error("NOT_FOUND")};export function useRouter(){return{refresh(){}}};export function usePathname(){return "/admin/products"};export function useSearchParams(){return new URLSearchParams()};',
 'next/link':'export default function Link(){return null}',
 'next/image':'export default function Image(){return null}',
 '@/lib/auth/staff':'export async function requireStaffPage(){return{id:"delegate",role:"admin",permissions:["product.review"]}}',
 };return modules[specifier]?{url:'data:text/javascript,'+encodeURIComponent(modules[specifier]),shortCircuit:true}:next(specifier,context);}});
async function concerned(){const f=await productPublicationFixture();try{const view=await getProductPublicationReview(f.db,'reviewer',f.sent.caseId),published=await reviewProductPublication(f.db,{actorId:'reviewer',requestId:'queue-concern-publish',expectedRevision:String(view.revision),now:f.now+4},{caseId:f.sent.caseId,versionId:view.candidate.versionId,expectedCaseRevision:String(view.caseRevision),action:'approve_and_publish',reason:'Publish this exact fictional cup before recording a supported concern.',checks:{sameItem:true,accurateCover:true,eligibilityEvidence:[]}});const concern=await reportProductConcern(f.db,{actorId:'registered-owner',requestId:'queue-concern-report',expectedRevision:null,now:f.now+5},{productId:view.productId,kind:'price_error',publicVersionId:published.versionId,note:'Please review the displayed price for this original fictional product.'});return{...f,concern,productId:view.productId};}catch(error){f.dispose();throw error;}}

void test('priority queue and trusted assignee selection exclude the exact retained Product party',async()=>{
 const f=await concerned();try{
  f.sqlite.exec("UPDATE seller_profiles SET user_id='foreign' WHERE id='registered';INSERT INTO user_roles(user_id,role,assigned_at) VALUES('registered-owner','super_admin',1)");
  assert.equal((await listReviewTasks(f.db,'registered-owner')).some(row=>row.sourceType==='product_priority'&&row.sourceId===f.concern.id),false);
  assert.equal(await selectReviewOwner(f.db,{sourceType:'product_priority',sourceId:f.concern.id},[{userId:'registered-owner',available:true},{userId:'reviewer',available:true}]),'reviewer');
 }finally{f.dispose();}
});

void test('priority queue final source proof rejects a newly personal shop owner after its read',async()=>{
 const f=await concerned();try{
  // Keep the original intake tasks out of this focused read so their stronger guard cannot mask the priority source.
  const task=f.sqlite.prepare("SELECT id FROM review_tasks WHERE source_type='product_priority' AND source_id=?").get(f.concern.id)!;
  const batch=f.db.batch.bind(f.db);let changed=false;f.db.batch=async statements=>{if(!changed){changed=true;f.sqlite.exec("UPDATE seller_profiles SET user_id='reviewer' WHERE id='registered'");}return batch(statements);};
  await assert.rejects(()=>listReviewTasks(f.db,'reviewer',undefined,{reference:String(task.id)}));assert.equal(changed,true);
 }finally{f.dispose();}
});

void test('legacy Product bookmark cannot disclose its retained destination after permission loss in its final query',async()=>{
 const f=await productPublicationFixture();fixture.db=f.db;try{
  const id=String(f.sqlite.prepare('SELECT product_id FROM product_publication_links WHERE draft_id=?').get(f.attached.id)!.product_id),{default:Page}=await import('../app/admin/products/[id]/page');
  await assert.rejects(()=>Page({params:Promise.resolve({id})}),/REDIRECT:.*products\/intakes/);
  const prepare=f.db.prepare.bind(f.db);let changed=false;
  f.db.prepare=(sql:string)=>{const statement=prepare(sql);if(!sql.startsWith('SELECT l.draft_id AS draftId,c.id AS caseId'))return statement;const bound=statement.bind.bind(statement);statement.bind=(...values:unknown[])=>{const result=bound(...values),first=result.first.bind(result);result.first=(async(column?:string)=>{const value=column===undefined?await first():await first(column);if(!changed){changed=true;f.sqlite.exec("UPDATE staff_permission_profiles SET permissions_json='[]',version=version+1 WHERE user_id='delegate'");}return value;})as typeof result.first;return result;};return statement;};
  await assert.rejects(()=>Page({params:Promise.resolve({id})}),/permission|permitted|authority/i);assert.equal(changed,true);
 }finally{fixture.db=null;f.dispose();}
});
