import { compileFunction } from 'node:vm';
import assert from 'node:assert/strict';
import test from 'node:test';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {serviceHealthFixture} from './helpers/service-health-fixture';
import {recordFormLoadObservation} from '../lib/operations/form-health';
void test('actual records API scopes environment from trusted bindings and denies revoked or ungranted technical access',async()=>{
 const f=serviceHealthFixture();f.sqlite.exec('CREATE TABLE form_answer_sets(id TEXT PRIMARY KEY)');f.sqlite.exec(readFileSync(new URL('../drizzle/0151_form_health_records.sql',import.meta.url),'utf8'));
 const store=globalThis as typeof globalThis&{systemHealthTestDb?:D1Database;systemHealthTestActor?:string};store.systemHealthTestDb=f.db;store.systemHealthTestActor='sa';
 try{
  await recordFormLoadObservation(f.db,{environment:'test',releaseId:'fictional-release',now:1800000,formId:'seller.inventory',version:1,outcome:'blocked',category:'definition_unavailable'});
  const code=(await build({stdin:{loader:'ts',resolveDir:process.cwd(),contents:"export{GET}from'./app/api/admin/system-health/records/route';"},bundle:true,write:false,platform:'node',format:'cjs',plugins:[{name:'bindings',setup(b){b.onResolve({filter:/^cloudflare:workers$/},()=>({path:'env',namespace:'fixture'}));b.onResolve({filter:/^@\/lib\/auth\/staff$/},()=>({path:'auth',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:args.path==='env'?"export const env={DB:globalThis.systemHealthTestDb,HASTABAZAAR_RUNTIME_ENV:'test',APP_ORIGIN:'https://fictional.test',HASTABAZAAR_RELEASE_ID:'fictional-release'};":"export class StaffAuthorizationError extends Error{status=403};export async function requireStaffApi(){return{id:globalThis.systemHealthTestActor}}",loader:'ts'}));}}]})).outputFiles[0].text;
  const loadedFixtureModule={exports:{} as {GET:(r:Request)=>Promise<Response>}};compileFunction(code, ['require', 'module', 'exports'])(createRequire(import.meta.url),loadedFixtureModule,loadedFixtureModule.exports);
  const good=await loadedFixtureModule.exports.GET(new Request('https://fictional.test/api/admin/system-health/records?type=form'));assert.equal(good.status,200);const data=await good.json() as {records:unknown[]};assert.equal(data.records.length,1);assert.doesNotMatch(JSON.stringify(data),/answers_json|subject_id|bankAccount|password/);
  assert.equal((await loadedFixtureModule.exports.GET(new Request('https://fictional.test/api/admin/system-health/records?environment=production'))).status,400);
  store.systemHealthTestActor='admin';assert.equal((await loadedFixtureModule.exports.GET(new Request('https://fictional.test/api/admin/system-health/records?type=form'))).status,403);
  f.sqlite.prepare('INSERT INTO staff_permission_profiles(user_id,permissions_json) VALUES(?,?)').run('admin','["system.health.view"]');assert.equal((await loadedFixtureModule.exports.GET(new Request('https://fictional.test/api/admin/system-health/records?type=form'))).status,200);
  f.sqlite.prepare('UPDATE users SET status=? WHERE id=?').run('disabled','admin');const denied=await loadedFixtureModule.exports.GET(new Request('https://fictional.test/api/admin/system-health/records?reference=form-health'));assert.equal(denied.status,403);assert.doesNotMatch(await denied.text(),/records|form-health-/);
 }finally{delete store.systemHealthTestDb;delete store.systemHealthTestActor;f.sqlite.close();}
});
