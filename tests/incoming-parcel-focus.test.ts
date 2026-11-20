import assert from 'node:assert/strict';
import test from 'node:test';
import {registerHooks} from 'node:module';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {manualOrderFixture} from './helpers/manual-payment-fixture';
import {getManualPaymentWorkspace} from '../lib/payments/manual-payment-workspace';
import {operateParcel,listParcels,parcelCashRecords} from '../lib/operations/parcels';
registerHooks({resolve(specifier,context,next){
 if(specifier==='next/navigation')return{url:'data:text/javascript,export function useRouter(){return{refresh(){}}}',shortCircuit:true};
 if(specifier==='next/link')return{url:'data:text/javascript,import React from '+JSON.stringify(import.meta.resolve('react'))+';export default function Link({children,...props}){return React.createElement("a",props,children)}',shortCircuit:true};
 return next(specifier,context);
}});
void test('pending parcel remittance hands off to its exact authorized Incoming source without approving money',async()=>{
 const f=await manualOrderFixture({method:'cod'});try{
  const now=Date.now(),jobId='fictional-focused-parcel',total=f.order.grandTotalPaisa,seller=f.sqlite.prepare('SELECT seller_id FROM order_items WHERE order_id=?').get(f.orderId)!;
  f.sqlite.prepare("UPDATE orders SET status='delivered',payment_status='paid' WHERE id=?").run(f.orderId);
  f.sqlite.prepare("INSERT INTO shipping_jobs(id,order_id,seller_id,direction,status,created_by,created_request_id,created_at,updated_at) VALUES(?,?,?,'outbound','delivered','reviewer','focus-original-job',?,?)").run(jobId,f.orderId,seller.seller_id,now,now);
  f.sqlite.prepare("INSERT INTO shipping_parcels(shipping_job_id,cod_due_paisa,collected_paisa,remitted_paisa,method,courier_name,delivered_at,created_at) VALUES(?,?,?,0,'courier','Fictional exact courier',?,?)").run(jobId,total,total,now,now);
  f.sqlite.prepare("INSERT INTO parcel_cash_records(id,shipping_job_id,kind,amount_paisa,evidence_reference,status,created_by,created_at) VALUES('focus-original-collection',?,'collection',?,'FICTIONAL-ACTUAL-FOCUS-COLLECTION','posted','reviewer',?)").run(jobId,total,now);
  await operateParcel(f.db,{jobId,actorId:'reviewer',action:'propose_remittance',version:0,requestId:'focus-proposed-remittance',now,note:'An original carrier report remains separate from actual verified company receipt.',amountPaisa:total,reference:'FICTIONAL-FOCUSED-REMITTANCE'});
  const claimId=String(f.sqlite.prepare("SELECT id FROM parcel_cash_records WHERE kind='remittance'").get()!.id),selection={parcelId:jobId,remittanceId:claimId};
  const model=await getManualPaymentWorkspace(f.db,'reviewer',f.orderId,selection);
  assert.deepEqual(model.focus,selection);assert.deepEqual(model.codParcels.map(row=>row.id),[jobId]);assert.deepEqual(model.codClaims.map(row=>row.id),[claimId]);
  for(const focus of [{parcelId:'unavailable'},{parcelId:jobId,remittanceId:'another-original-claim'}])await assert.rejects(getManualPaymentWorkspace(f.db,'reviewer',f.orderId,focus),error=>error instanceof Error&&'status'in error&&error.status===404);
  await assert.rejects(getManualPaymentWorkspace(f.db,'customer',f.orderId,selection),error=>error instanceof Error&&'status'in error&&error.status===403);
  const {ParcelControls}=await import('../components/admin/parcel-controls'),props={orderId:f.orderId,parcels:await listParcels(f.db,f.orderId),records:await parcelCashRecords(f.db,f.orderId),compensation:[],actorId:'reviewer',isSuperAdmin:true,canPrepare:false};
  const html=renderToStaticMarkup(React.createElement(ParcelControls,{...props,canReviewIncoming:true,returnTo:'/admin/orders/'+f.orderId+'?returnTo=%2Fadmin%2Fworkspace%3Ffilter%3Dfinance'}));
  assert.doesNotMatch(html,/>Approve remittance</);assert.match(html,/>Review exact remittance in Incoming payments</);
  const href=html.match(/href="([^"]+)"[^>]*>Review exact remittance/)![1].replaceAll('&amp;','&'),url=new URL(href,'https://fixture.invalid');
  assert.equal(url.pathname,'/admin/payments');assert.equal(url.searchParams.get('order'),f.orderId);assert.equal(url.searchParams.get('parcel'),jobId);assert.equal(url.searchParams.get('remittance'),claimId);assert.equal(url.hash,'#cod-parcel-'+jobId);assert.match(url.searchParams.get('returnTo')!,/returnTo=/);
  assert.doesNotMatch(renderToStaticMarkup(React.createElement(ParcelControls,{...props,canReviewIncoming:false})),/>Review exact remittance in Incoming payments</);
  await assert.rejects(operateParcel(f.db,{jobId,actorId:'reviewer',action:'approve_remittance',version:1,cashRecordId:claimId,requestId:'focus-no-old-approval',note:'The retired affordance must still reject fake receipt approval.',now:Date.now()}),/actual company receipt/);
  assert.equal(f.sqlite.prepare('SELECT status FROM parcel_cash_records WHERE id=?').get(claimId)!.status,'pending');assert.equal(f.sqlite.prepare('SELECT actual_cash_paisa n FROM cod_reconciliation_balances WHERE shipping_job_id=?').get(jobId)!.n,0);
 }finally{f.dispose();}
});
