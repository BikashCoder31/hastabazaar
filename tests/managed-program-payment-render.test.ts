import assert from 'node:assert/strict';
import test from 'node:test';
import {compileFunction} from 'node:vm';
import {createRequire} from 'node:module';
import {build} from 'esbuild';
import * as React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {sessionAttemptKey} from '../lib/forms/client-attempt';
import type {ManagedProgramWorkspace} from '../lib/managed-commerce/program-workspace';
import {can} from '../lib/marketplace/permissions';

const requestId='11111111-2222-4333-8444-555555555555';
const sellerId='maker original';
const paymentId='payment/original';
const key=(action:string)=>sessionAttemptKey('staff.managed-payment-action',`${sellerId}:${paymentId}:${action}`);
function workspace(status:string):ManagedProgramWorkspace {
 return {participationRoute:'managed_maker',applicationStage:'active',commercialModel:'managed_fixed_supplier_price_v1',products:[],transitions:[],supplies:[{
  id:'supply-original',productName:'Original supplied goods',quantityProposed:2,quantityAccepted:2,agreedUnitPaisa:50000,acceptedTotalPaisa:100000,status:'accepted',
  possessionStatus:'received',qualityStatus:'accepted',evidenceReference:'SIM-GRN',paymentId,paymentStatus:status,originalOwedPaisa:100000,adjustedPaisa:-10000,paidPaisa:status==='paid'?90000:0,recoveryCreditsPaisa:2000,createdAt:100,
 }]};
}

// Bounded component harness: real React markup and submission code, simulated hooks and browser storage.
// No browser, network, database or payment command runs here.
async function harness(status:string,canReviewPaymentTransfers?:boolean,storedAction?:string,canReviewPaymentHistory?:boolean) {
 const storage=new Map(storedAction?[[key(storedAction),requestId]]:[]);
 const state:unknown[]=[],effects:(()=>unknown)[]=[],timers:(()=>void)[]=[];
 let cursor=0;
 const hooks={...React,useState(initial:unknown){const index=cursor++;if(!(index in state))state[index]=initial;return [state[index],(value:unknown)=>{state[index]=typeof value==='function'?value(state[index]):value;}];},useEffect(effect:()=>unknown){effects.push(effect);}};
 const modules:Record<string,string>={
  'next/navigation':'export function useRouter(){return{refresh(){}}}',
  'next/link':`import React from 'react';export default function Link(props){return React.createElement('a',props)}`,
  '@/components/forms/form-guide':'export function FormGuide(){return null}',
  '@/components/ui/button':`import React from 'react';export function Button({variant,...props}){return React.createElement('button',props)}`,
  '@/components/forms/form-config-client':`export function usePublishedFormConfig(formId){return {config:{formId,version:1,publishedAt:1,fields:[{id:'context_note',key:'context_note',type:'short_text',label:'Staff context',required:true,order:0,status:'active'}]},status:'ready',canSubmit:true,message:'',refresh(){},handleSubmissionResponse(){return true}}}`,
 };
 const code=(await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`export {ManagedProgramReview} from './components/admin/managed-program-review'`},bundle:true,write:false,platform:'node',format:'cjs',external:['react','react/jsx-runtime'],plugins:[{name:'managed-review-render',setup(b){b.onResolve({filter:/.*/},args=>modules[args.path]?{path:args.path,namespace:'fixture'}:null);b.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:modules[args.path],loader:'js'}));}}]})).outputFiles[0].text;
 const loaded={exports:{} as {ManagedProgramReview:(props:unknown)=>React.ReactNode}};
 const require=createRequire(import.meta.url);
 compileFunction(code,['require','module','exports'])( (id:string)=>id==='react'?hooks:require(id),loaded,loaded.exports);
 const previous={sessionStorage:globalThis.sessionStorage,window:globalThis.window};
 Object.assign(globalThis,{sessionStorage:{getItem:(name:string)=>storage.get(name)??null,setItem:(name:string,value:string)=>storage.set(name,value),removeItem:(name:string)=>storage.delete(name)},window:{setTimeout:(callback:()=>void)=>{timers.push(callback);return 1;},clearTimeout(){}}});
 const render=()=>{cursor=0;return loaded.exports.ManagedProgramReview({sellerId,workspace:workspace(status),...(canReviewPaymentTransfers===undefined?{}:{canReviewPaymentTransfers}),...(canReviewPaymentHistory===undefined?{}:{canReviewPaymentHistory})});};
 const html=()=>renderToStaticMarkup(render());
 const flush=()=>{for(const effect of effects.splice(0))effect();for(const timer of timers.splice(0))timer();};
 return {render,html,flush,storage,dispose:()=>Object.assign(globalThis,previous)};
}

void test('approved supplier payment opens its exact protected simulated transfer workflow without a completion shortcut',async()=>{
 const h=await harness('approved',true);try{
  const html=h.html();assert.doesNotMatch(html,/value="mark_payment_paid"|Mark simulated paid|data-form-id="staff.managed-payment-action"/);
  const href=html.match(/href="([^"]*\/admin\/payments\/payouts[^"]*)"/)?.[1];assert.ok(href);
  const target=new URL(href.replaceAll('&amp;','&'),'https://fixture.invalid');
  assert.equal(target.searchParams.get('model'),'fixed');assert.equal(target.searchParams.get('payout'),paymentId);
  assert.equal(target.searchParams.get('returnTo'),'/admin/sellers/maker%20original#managed-program-records');
  assert.match(html,/original verified execution packet/i);assert.match(html,/simulation/i);
 }finally{h.dispose();}
});

void test('transfer navigation fails closed without caller authority and historical paid facts remain read-only',async()=>{
 for(const allowed of [false,undefined]){const h=await harness('approved',allowed);try{const html=h.html();assert.doesNotMatch(html,/href="[^"]*\/admin\/payments\/payouts/);assert.match(html,/authorized Finance|eligible.*operator/i);}finally{h.dispose();}}
 const h=await harness('paid',true);try{const html=h.html();assert.match(html,/Payment paid/);assert.match(html,/paid NPR 900\.00/);assert.match(html,/adjustments NPR -100\.00/);assert.match(html,/recovery settlements NPR 20\.00/);assert.doesNotMatch(html,/data-form-id="staff.managed-payment-action"|Mark simulated paid/);}finally{h.dispose();}
});

void test('retired completion request survives reload and is visible without retry or silent clearing',async()=>{
 for(const status of ['approved','paid']){const h=await harness(status,true,'mark_payment_paid');try{h.html();h.flush();const html=h.html();assert.match(html,new RegExp(requestId));assert.match(html,/does not prove.*paid|does not prove.*payment/i);assert.doesNotMatch(html,/value="mark_payment_paid"|Start a new attempt/);assert.equal(h.storage.get(key('mark_payment_paid')),requestId);}finally{h.dispose();}}
});

void test('Admin transfer preparation and Super Admin payment history remain separate and self-owner access stays closed',async()=>{
 for(const role of ['admin','super_admin'] as const)for(const isOwner of [false,true]){
  const actor={id:'reviewer',role},ownerId=isOwner?actor.id:'maker-owner';
  const h=await harness('approved',can(actor,'payout.prepare')&&ownerId!==actor.id,undefined,can(actor,'payout.approve')&&ownerId!==actor.id);
  try{
   const html=h.html();assert.equal(html.includes('Review original supplier payment transfer'),!isOwner);
   assert.equal(html.includes('Review original payment action history'),role==='super_admin'&&!isOwner);
   if(role==='super_admin'&&!isOwner){const raw=html.match(/href="([^"]*kind=managed-payment-action[^"]*id=[^"]*)"/)?.[1];assert.ok(raw);const history=new URL(raw.replaceAll('&amp;','&'),'https://fixture.invalid');assert.equal(history.searchParams.get('id'),paymentId);assert.equal(history.searchParams.get('returnTo'),'/admin/sellers/maker%20original#managed-program-records');}
  }finally{h.dispose();}
 }
});

function findForm(node:React.ReactNode):React.ReactElement<{onSubmit:(event:unknown)=>Promise<void>}>|undefined {
 if(!React.isValidElement(node))return;
 const props=node.props as Record<string,unknown>;
 if(node.type==='form'&&props['data-form-id']==='staff.managed-payment-action')return node as ReturnType<typeof findForm>;
 for(const child of React.Children.toArray(props.children as React.ReactNode)){const found=findForm(child);if(found)return found;}
}
void test('legacy prepared approval retains configured context and unchanged request on an uncertain response',async()=>{
 const h=await harness('prepared',true);const previous={FormData:globalThis.FormData,fetch:globalThis.fetch};
 const bodies:Record<string,unknown>[]=[];
 try{
  const values=[['action','approve_payment'],['paymentId',paymentId],['formVersion','1'],['custom.context_note','Original review context']];
  Object.assign(globalThis,{FormData:class {getAll(name:string){return values.filter(([key])=>key===name).map(([,value])=>value);}entries(){return values.values();}},fetch:async(_url:unknown,init:RequestInit)=>{bodies.push(JSON.parse((assert.equal(typeof init.body,'string'), init.body as string)));if(bodies.length===1)throw new Error('Connection lost after send');return Response.json({ok:true});}});
  const submit=async()=>{const form=findForm(h.render());assert.ok(form);await form.props.onSubmit({preventDefault(){},currentTarget:{dataset:{formId:'staff.managed-payment-action'}}});};
  await submit();const retained=h.storage.get(key('approve_payment'));assert.ok(retained);assert.match(h.html(),/previous decision may have succeeded/);
  await submit();assert.equal(bodies.length,2);assert.deepEqual(bodies[1],bodies[0]);assert.equal(bodies[0].requestId,retained);assert.equal(bodies[0].action,'approve_payment');assert.equal(bodies[0].formVersion,1);assert.deepEqual(bodies[0].customAnswers,[{fieldId:'context_note',value:'Original review context'}]);assert.equal(h.storage.has(key('approve_payment')),false);
 }finally{Object.assign(globalThis,previous);h.dispose();}
});
