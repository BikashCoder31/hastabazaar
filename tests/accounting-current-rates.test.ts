import assert from 'node:assert/strict';
import test from 'node:test';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {runInNewContext} from 'node:vm';

async function renderPage(failRates:boolean){
 const result=await build({entryPoints:['app/admin/accounting/page.tsx'],bundle:true,write:false,platform:'node',format:'cjs',plugins:[{name:'accounting-page-reads',setup(b){
  b.onResolve({filter:/^(cloudflare:workers|@\/components\/admin\/accounting-workspace|@\/lib\/accounting\/access|@\/lib\/accounting\/workspace|@\/lib\/db\/repositories\/business-settings)$/},a=>({path:a.path,namespace:'accounting-rates-test'}));
  b.onLoad({filter:/.*/,namespace:'accounting-rates-test'},a=>({loader:'js',contents:{
   'cloudflare:workers':'exports.env={DB:{},HASTABAZAAR_RUNTIME_ENV:"local_staging"};',
   '@/components/admin/accounting-workspace':'exports.AccountingWorkspaceView=()=>null;exports.AccountingFilterError=()=>null;',
   '@/lib/accounting/access':'exports.requireAccountingPageReader=async()=>({id:"owner"});',
   '@/lib/accounting/workspace':'exports.getAccountingWorkspace=async()=>({metrics:[{amountPaisa:"9000"},{amountPaisa:"91000"}]});',
   '@/lib/db/repositories/business-settings':'exports.getEffectiveBusinessSetting=async(db,key)=>{if(__failRates)throw Error("Metadata source unavailable");return {value:key==="independent_seller_commission_bps"?1200:1250}};',
  }[a.path]??''}));
 }}]});
 const compiledModule={exports:{} as {default():Promise<{props:{workspace:{metrics:{amountPaisa:string}[]};currentRates:unknown}}>}};
 runInNewContext(result.outputFiles[0].text,{module:compiledModule,exports:compiledModule.exports,require:createRequire(import.meta.url),process,Date,URLSearchParams,Intl,__failRates:failRates});
 return compiledModule.exports.default();
}
void test('Accounting page reads current saved rates independently of original historical amounts',async()=>{
 const page=await renderPage(false);
 assert.deepEqual(Array.from(page.props.workspace.metrics,m=>m.amountPaisa),['9000','91000']);
 const rates=page.props.currentRates as {sellerCommissionBps:number;managedRetentionBps:number};
 assert.equal(rates.sellerCommissionBps,1200);assert.equal(rates.managedRetentionBps,1250);
});
void test('unavailable current-rate metadata does not hide readable historical accounting',async()=>{
 const page=await renderPage(true);
 assert.equal(page.props.currentRates,null);
 assert.deepEqual(Array.from(page.props.workspace.metrics,m=>m.amountPaisa),['9000','91000']);
});
