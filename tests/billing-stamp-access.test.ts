import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {runInNewContext} from 'node:vm';
import test from 'node:test';
import {build} from 'esbuild';
import {securityDatabase} from './helpers/security-database';
import {getOrderDocument} from '../lib/db/repositories/orders';
import {hashOpaqueToken,RECEIPT_COOKIE,receiptCookie} from '../lib/cart/session';
import {billingPreviewSnapshot} from '../lib/staging/billing-preview';

void test('actual stamp GET protects stored issued company receipts for customer and guest capability owners',async()=>{
  const f=securityDatabase();
  try{
    f.sqlite.exec(`CREATE TABLE orders(id TEXT PRIMARY KEY,order_number TEXT,receipt_token_hash TEXT,customer_id TEXT);
      CREATE TABLE order_documents(id TEXT PRIMARY KEY,order_id TEXT,kind TEXT,document_number TEXT,status TEXT,issued_at INTEGER,snapshot_json TEXT);`);
    const token='fixture-receipt-capability';
    f.sqlite.prepare('INSERT INTO orders VALUES (?,?,?,?)').run('order','SAMPLE-ORDER-001',await hashOpaqueToken(token),'buyer');
    const snapshot=billingPreviewSnapshot('mixed',1);
    const original=JSON.stringify(snapshot);
    f.sqlite.prepare("INSERT INTO order_documents VALUES ('doc','order','payment_receipt','RCPT','issued',1,?)").run(original);
    const state={customer:null as {userId:string}|null,db:f.db,load:getOrderDocument};
    const result=await build({entryPoints:['app/api/orders/[orderNumber]/documents/[id]/stamp/route.ts'],bundle:true,write:false,platform:'node',format:'cjs',plugins:[{name:'stamp-fixture',setup(b){
      b.onResolve({filter:/^(cloudflare:workers|@\/lib\/auth\/customer|@\/lib\/db\/repositories\/orders)$/},a=>({path:a.path,namespace:'fixture'}));
      b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:a.path==='cloudflare:workers'?'exports.env={DB:__state.db};':a.path.endsWith('/customer')?'exports.getCustomerUser=async()=>__state.customer;':'exports.getOrderDocument=(...args)=>__state.load(...args);',loader:'js'}));
    }}]});
    const compiled={exports:{} as {GET(request:Request,context:{params:Promise<{orderNumber:string;id:string}>}):Promise<Response>}};
    runInNewContext(result.outputFiles[0].text,{module:compiled,exports:compiled.exports,require:createRequire(import.meta.url),__state:state,process,Request,Response,URL,Uint8Array,atob,crypto,TextEncoder});
    const key=snapshot.billing!.receiptGroups!.find(g=>g.issuer.kind==='company')!.key;
    const path='/orders/SAMPLE-ORDER-001/documents/doc/stamp';
    assert.match(receiptCookie(new Request('http://localhost:3018'+path),token),/Path=\/orders;/);
    const call=(cookie?:string,receipt=key,orderNumber='SAMPLE-ORDER-001',id='doc')=>compiled.exports.GET(new Request('http://localhost:3018'+path+'?receipt='+encodeURIComponent(receipt),{headers:cookie?{cookie:`${RECEIPT_COOKIE}=${cookie}`}:{}}),{params:Promise.resolve({orderNumber,id})});
    for(const [cookie,receipt,order,id] of [[undefined,key,'SAMPLE-ORDER-001','doc'],['wrong',key,'SAMPLE-ORDER-001','doc'],[token,'wrong','SAMPLE-ORDER-001','doc'],[token,key,'other','doc'],[token,key,'SAMPLE-ORDER-001','other'],[token,'fixture-shop-b','SAMPLE-ORDER-001','doc']] as const){
      const response=await call(cookie,receipt,order,id);assert.equal(response.status,404);assert.equal((await response.arrayBuffer()).byteLength,0);
    }
    const allowed=await call(token);assert.equal(allowed.status,200);assert.match(allowed.headers.get('cache-control')??'',/private, no-store/);
    assert.equal(allowed.headers.get('x-content-type-options'),'nosniff');assert.equal(allowed.headers.get('content-type'),'image/png');
    assert.ok((await allowed.arrayBuffer()).byteLength>100);
    state.customer={userId:'buyer'};assert.equal((await call()).status,200);
    state.customer={userId:'other'};assert.equal((await call()).status,404);state.customer=null;
    for(const edit of [(s:typeof snapshot)=>{s.paymentStatus='pending';},(s:typeof snapshot)=>{s.billing!.receiptIssuance='pending_clearance';},(s:typeof snapshot)=>{delete s.billing;},
      (s:typeof snapshot)=>{delete s.billing!.receiptGroups!.find(g=>g.key===key)!.billSequence;},(s:typeof snapshot)=>{s.billing!.receiptGroups!.find(g=>g.key===key)!.issuer.pan='111111111';}]){
      const altered=JSON.parse(original) as typeof snapshot;edit(altered);
      f.sqlite.prepare('UPDATE order_documents SET snapshot_json=?').run(JSON.stringify(altered));assert.equal((await call(token)).status,404);
    }
    f.sqlite.prepare("UPDATE order_documents SET snapshot_json=?,status='void'").run(original);assert.equal((await call(token)).status,404);
  }finally{f.dispose();}
});
