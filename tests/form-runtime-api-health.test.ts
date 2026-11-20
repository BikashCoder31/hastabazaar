import { compileFunction } from 'node:vm';
import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {build} from 'esbuild';
import {serviceHealthFixture} from './helpers/service-health-fixture';
void test('actual form API preserves safe runtime reference and rechecks native audience after asynchronous load',async()=>{
 const f=serviceHealthFixture();f.sqlite.exec("ALTER TABLE users ADD auth_subject TEXT;UPDATE users SET auth_subject=id;CREATE TABLE form_answer_sets(id TEXT PRIMARY KEY);CREATE TABLE form_config_versions(form_id TEXT,version INTEGER,config_json TEXT,published_at INTEGER,status TEXT)");f.sqlite.exec(readFileSync('drizzle/0151_form_health_records.sql','utf8'));f.sqlite.prepare("INSERT INTO form_config_versions VALUES('staff.catalog',1,?,1,'published')").run('{PRIVATE_INVALID_JSON');
 const globals=globalThis as typeof globalThis&{formHealthRouteDb?:D1Database};globals.formHealthRouteDb=f.db;
 try{
  const output=await build({stdin:{loader:'ts',resolveDir:process.cwd(),contents:"export{GET}from'./app/api/forms/[formId]/route';"},bundle:true,write:false,platform:'node',format:'cjs',plugins:[{name:'framework',setup(b){b.onResolve({filter:/^cloudflare:workers$|^@\/app\/auth$|^next\/navigation$/},a=>({path:a.path,namespace:'test'}));b.onLoad({filter:/.*/,namespace:'test'},a=>({loader:'ts',contents:a.path==='cloudflare:workers'?"export const env={get DB(){return globalThis.formHealthRouteDb},HASTABAZAAR_RUNTIME_ENV:'test',APP_ORIGIN:'https://fictional.test',HASTABAZAAR_RELEASE_ID:'fictional-route'};":a.path==='next/navigation'?"export function redirect(){throw new Error('Unexpected test navigation')} export function notFound(){throw new Error('Unexpected test navigation')}":"export async function getAuthenticatedUser(){return {userId:'sa'}} export async function requireAuthenticatedUser(){return getAuthenticatedUser()}"}));}}]});
  const loadedFixtureModule={exports:{} as {GET:(r:Request,c:{params:Promise<{formId:string}>})=>Promise<Response>}};compileFunction(output.outputFiles[0].text, ['require', 'module', 'exports'])(createRequire(import.meta.url),loadedFixtureModule,loadedFixtureModule.exports);const read=()=>loadedFixtureModule.exports.GET(new Request('https://fictional.test/api/forms/staff.catalog'),{params:Promise.resolve({formId:'staff.catalog'})});
  const failed=await read();assert.equal(failed.status,503);const body=await failed.json() as {code:string;category:string;supportReference:string};assert.equal(body.code,'config_unavailable');assert.equal(body.category,'definition_invalid');assert.match(body.supportReference,/^form-health-/);assert.doesNotMatch(JSON.stringify(body),/PRIVATE_INVALID_JSON/);
  f.sqlite.prepare('UPDATE form_config_versions SET config_json=?').run(JSON.stringify({formId:'staff.catalog',fields:[]}));
  const prepare=f.db.prepare.bind(f.db);let revoked=false;f.db.prepare=((sql:string)=>{const statement=prepare(sql);if(sql.startsWith('SELECT version, config_json')){const first=statement.first.bind(statement);statement.first=(async()=>{const row=await first();revoked=true;f.sqlite.prepare('DELETE FROM user_roles WHERE user_id=?').run('sa');return row;}) as D1PreparedStatement['first'];}return statement;}) as D1Database['prepare'];
  assert.equal((await read()).status,404);assert.equal(revoked,true);const blocked=f.sqlite.prepare("SELECT COUNT(*) n FROM form_health_observations WHERE outcome='blocked'").get()!.n;assert.equal((await read()).status,404);assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM form_health_observations WHERE outcome='blocked'").get()!.n,blocked,'Expected authorization denial never invokes blocked-form observation.');
 }finally{delete globals.formHealthRouteDb;f.sqlite.close();}
});




