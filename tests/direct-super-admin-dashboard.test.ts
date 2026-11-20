import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
import { renderToStaticMarkup } from 'react-dom/server';
import {commissionDatabase} from './helpers/commission-database';
registerHooks({resolve(specifier,context,nextResolve){
 const stubs: Record<string,string> = {
  'cloudflare:workers': 'export const env={};',
  'next/navigation': 'export function redirect(){throw new Error("Unexpected redirect")};export function usePathname(){return "/admin"};export function useSearchParams(){return new URLSearchParams()};export function useRouter(){return {refresh(){},replace(){}}}',
  'next/link': 'export default function Link({children}){return children}',
  '@/lib/auth/staff': 'export async function requireStaffPage(){return {id:globalThis.dashboardRole==="super_admin"?"owner":"staff",displayName:"Fictional",role:globalThis.dashboardRole}}',
  '@/lib/db/d1': 'export function requireDatabase(){return globalThis.dashboardDb}',
  '@/lib/db/repositories/admin-workspace': 'export async function getAdminWorkSummary(){return {sellers:0,products:0,readyOrders:0,returns:0,complaints:0,payoutRequests:0,approvals:globalThis.dashboardRole==="super_admin"?{payouts:1,highValueRefunds:1,promotions:1}:null}}',
  '@/lib/db/repositories/admin-marketplace-summary': 'export async function getSuperAdminMarketplaceSummary(){return null}',
 };
 if(stubs[specifier])return {url:'data:text/javascript,'+encodeURIComponent(stubs[specifier]),shortCircuit:true};
 return nextResolve(specifier,context);
}});
void test('dashboard explains direct Super Admin decisions and pending Admin confirmation', async()=>{
 const {default: Dashboard}=await import('../app/admin/page');
 const globals=globalThis as typeof globalThis & {dashboardRole?:string;dashboardDb?:D1Database};
 const fixture=await commissionDatabase({seedSellers:false});globals.dashboardDb=fixture.database;
 try{
  globals.dashboardRole='super_admin';const direct=renderToStaticMarkup(await Dashboard());
  assert.doesNotMatch(direct,/different authorized person|Independent approvals|Keep approvals independent|does not authorize you to approve/);
  assert.match(direct,/Your Super Admin decisions apply directly/);
  assert.match(direct,/Pending confirmations/);
  globals.dashboardRole='admin';const pending=renderToStaticMarkup(await Dashboard());
  assert.match(pending,/Submit requests for Super Admin confirmation/);
  assert.doesNotMatch(pending,/Your Super Admin decisions apply directly/);
  globals.dashboardRole='super_admin';fixture.sqlite.exec("UPDATE users SET status='disabled' WHERE id='owner'");
  await assert.rejects(Dashboard(),/Current staff permission/);
 }finally{delete globals.dashboardRole;delete globals.dashboardDb;await fixture.dispose();}
});
