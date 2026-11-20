import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {giftCardWorkspaceFixture} from './helpers/gift-card-workspace-fixture';
import {readGiftCardViewScope,assertGiftCardViewScope} from '../lib/gift-cards/view-scope';
const fixture={db:null as D1Database|null,actor:'reviewer'};
(globalThis as typeof globalThis&{giftPageFixture:typeof fixture}).giftPageFixture=fixture;
registerHooks({resolve(specifier,context,next){const modules:Record<string,string>={
 'cloudflare:workers':'export const env={get DB(){return globalThis.giftPageFixture.db}}',
 'next/navigation':'export function redirect(path){throw Error(path)};export function useRouter(){return{refresh(){}}}',
 'next/link':'export default function Link(){return null}',
 '@/app/auth':'export async function getAuthenticatedUser(){const id=globalThis.giftPageFixture.actor;return{userId:id,email:id+"@local.hastabazaar.test",fullName:"Fictional gift history reader"}};export const requireAuthenticatedUser=getAuthenticatedUser;',
 };return modules[specifier]?{url:'data:text/javascript,'+encodeURIComponent(modules[specifier]),shortCircuit:true}:next(specifier,context);}});
void test('actual gift history has a real exact safe record beyond its latest100 and a final current-authority fence',async()=>{
 const f=await giftCardWorkspaceFixture();try{fixture.db=f.db;const original=await f.issue('gift-old-exact-page-record');for(let i=0;i<101;i++)await f.issue('gift-current-page-'+String(i).padStart(3,'0'));const {default:Page}=await import('../app/admin/gift-cards/page');const view=await Page({searchParams:Promise.resolve({giftId:original.id})});const sections:Record<string,unknown>[]=[];function walk(value:unknown){if(!value||typeof value!=='object')return;if(Array.isArray(value)){value.forEach(walk);return;}if('props'in value){const props=value.props as Record<string,unknown>;if(props.id==='gift-record-'+original.id)sections.push(props);walk(props.children);}}walk(view);assert.equal(sections.length,1);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM gift_cards').get()?.n,102);
  let changed=false;fixture.db={prepare(sql:string){if(sql.includes('/* gift_page_final */')&&!changed){changed=true;f.sqlite.prepare("UPDATE users SET status='inactive' WHERE id='reviewer'").run();}return f.db.prepare(sql);}}as D1Database;await assert.rejects(()=>Page({searchParams:Promise.resolve({giftId:original.id})}),(e:unknown)=>e instanceof Error&&'status'in e&&e.status===403);assert.equal(changed,true);
 }finally{fixture.db=null;f.dispose();}
});
void test('customer history rejects an unowned gift source and current-role change after capture',async()=>{
 const f=await giftCardWorkspaceFixture();try{const scope=await readGiftCardViewScope(f.db,'customer','customer');await assertGiftCardViewScope(f.db,scope);const gift=await f.issue('gift-unowned-current-view');await assert.rejects(()=>assertGiftCardViewScope(f.db,scope,{id:gift.id,owner:'redeemed_by'}),(e:unknown)=>e instanceof Error&&'status'in e&&e.status===403);f.sqlite.prepare("DELETE FROM user_roles WHERE user_id='customer' AND role='customer'").run();await assert.rejects(()=>assertGiftCardViewScope(f.db,scope),(e:unknown)=>e instanceof Error&&'status'in e&&e.status===403);
 }finally{f.dispose();}
});
