import assert from 'node:assert/strict';
import test from 'node:test';
import {registerHooks} from 'node:module';
import {build} from 'esbuild';
import {readyMaker} from './helpers/company-store-lifecycle-fixture';
import {listReviewTasks} from '../lib/workflows/review-tasks';
declare global{var readinessBrowserDb:D1Database;var readinessBrowserActor:string;}
registerHooks({resolve(specifier,context,next){
 if(specifier==='cloudflare:workers')return{url:'data:text/javascript,export const env={get DB(){return globalThis.readinessBrowserDb}}',shortCircuit:true};
 if(specifier==='@/lib/auth/staff')return{url:'data:text/javascript,export class StaffAuthorizationError extends Error{constructor(message,status=403){super(message);this.status=status}};export async function requireStaffApi(){return{id:globalThis.readinessBrowserActor,role:"super_admin"}}',shortCircuit:true};
 return next(specifier,context);
}});
const origin='https://readiness.test';
void test('shared queue preserves filters and exact assignment across a lost acknowledgement while role and origin boundaries hold',async()=>{
 const f=await readyMaker();try{
  globalThis.readinessBrowserDb=f.db;globalThis.readinessBrowserActor='reviewer';
  const tasks=(await listReviewTasks(f.db,'reviewer','maker')).filter(task=>['seller_application','seller_document'].includes(task.sourceType));
  const task=tasks.find(row=>row.sourceType==='seller_document')!;assert.ok(task);
  const api=await import('../app/api/admin/review-tasks/route');
  const request=(body:unknown,from=origin)=>new Request(origin+'/api/admin/review-tasks',{method:'POST',headers:{origin:from,'Content-Type':'application/json'},body:JSON.stringify(body)});
  const command={taskId:task.id,ownerId:'reviewer',expectedRevision:'0',requestId:'boundary-test',reason:'Assign the fictional government evidence review'};
  assert.equal((await api.POST(request(command,'https://foreign.test'))).status,403);
  globalThis.readinessBrowserActor='maker-user';assert.equal((await api.POST(request(command))).status,409);globalThis.readinessBrowserActor='reviewer';
  const bundle=await build({stdin:{sourcefile:'readiness-browser.tsx',resolveDir:process.cwd(),loader:'tsx',contents:`import React from 'react';import{createRoot}from'react-dom/client';import{SharedReviewQueue}from'./components/admin/shared-review-queue';createRoot(document.getElementById('root')!).render(<SharedReviewQueue tasks={${JSON.stringify(tasks)}} actorId="reviewer"/>);`},bundle:true,write:false,platform:'browser',format:'iife',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'fixture-navigation',setup(builder){builder.onResolve({filter:/^next\/(navigation|link)$/},args=>({path:args.path,namespace:'fixture'}));builder.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:args.path==='next/link'?`import React from 'react';export default function Link(props){return React.createElement('a',props)}`:`export function useRouter(){return{refresh(){}}};export function usePathname(){return location.pathname};export function useSearchParams(){return new URLSearchParams(location.search)}`,loader:'js',resolveDir:process.cwd()}));}}]});
  const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??'file:///C:/Users/abinash/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH??'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  try{const page=await browser.newPage(),bodies:string[]=[];
   await page.route('**/*',async(route:{request():{url():string;postData():string|null};fulfill(response:unknown):Promise<void>;abort():Promise<void>})=>{
    const incoming=route.request(),url=new URL(incoming.url());if(url.origin!==origin)return route.abort();
    if(url.pathname==='/admin/sellers')return route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><html><body><div id="root"></div></body></html>'});
    if(url.pathname==='/api/admin/review-tasks'){bodies.push(incoming.postData()!);const result=await api.POST(request(JSON.parse(incoming.postData()!)));return route.fulfill({status:bodies.length===1?503:result.status,contentType:'application/json',body:bodies.length===1?'{"error":"Fictional lost assignment acknowledgement"}':await result.text()});}return route.abort();
   });
   await page.goto(origin+'/admin/sellers');await page.addScriptTag({content:bundle.outputFiles[0].text});
   await page.getByRole('button',{name:'All records',exact:true}).click();assert.match(page.url(),/reviewView=all/);
   await page.getByRole('button',{name:'Needs attention',exact:true}).click();
   assert.match(await page.getByRole('link',{name:'Open review →',exact:true}).getAttribute('href'),/returnTo=.*reviewView/);
   await page.getByText('Manage ownership',{exact:true}).click();await page.getByRole('textbox',{name:'Assignment reason',exact:true}).fill(command.reason);
   await page.getByRole('button',{name:'Take ownership',exact:true}).click();await page.getByText('Fictional lost assignment acknowledgement',{exact:true}).waitFor();
   assert.equal(await page.getByRole('textbox',{name:'Assignment reason',exact:true}).isDisabled(),true);
   await page.getByRole('button',{name:'Retry the same assignment',exact:true}).click();await page.getByText('Assignment saved.',{exact:true}).waitFor();
   assert.equal(bodies.length,2);assert.equal(bodies[0],bodies[1]);
   const saved=(await listReviewTasks(f.db,'reviewer','maker')).find(row=>row.id===task.id)!;assert.equal(saved.revision,1);assert.equal(saved.ownerId,'reviewer');assert.equal(saved.dueAt,null);
  }finally{await browser.close();}
 }finally{f.dispose();}
});
