import {manualOrderFixture} from './manual-payment-fixture';
import {operateParcel} from '../../lib/operations/parcels';

/** Fresh actual schema and original posted collection; the carrier claim is made by the real command. */
export async function incomingParcelFixture(){
 const f=await manualOrderFixture({method:'cod'});try{
  const now=Date.now(),jobId='fictional-focused-parcel',total=f.order.grandTotalPaisa,seller=f.sqlite.prepare('SELECT seller_id FROM order_items WHERE order_id=?').get(f.orderId)!;
  f.sqlite.prepare("UPDATE orders SET status='delivered',payment_status='paid' WHERE id=?").run(f.orderId);
  f.sqlite.prepare("INSERT INTO shipping_jobs(id,order_id,seller_id,direction,status,created_by,created_request_id,created_at,updated_at) VALUES(?,?,?,'outbound','delivered','reviewer','focus-original-job',?,?)").run(jobId,f.orderId,seller.seller_id,now,now);
  f.sqlite.prepare("INSERT INTO shipping_parcels(shipping_job_id,cod_due_paisa,collected_paisa,remitted_paisa,method,courier_name,delivered_at,created_at) VALUES(?,?,?,0,'courier','Fictional exact courier',?,?)").run(jobId,total,total,now,now);
  f.sqlite.prepare("INSERT INTO parcel_cash_records(id,shipping_job_id,kind,amount_paisa,evidence_reference,status,created_by,created_at) VALUES('focus-original-collection',?,'collection',?,'FICTIONAL-ACTUAL-FOCUS-COLLECTION','posted','reviewer',?)").run(jobId,total,now);
  await operateParcel(f.db,{jobId,actorId:'reviewer',action:'propose_remittance',version:0,requestId:'focus-proposed-remittance',now,note:'An original carrier report remains separate from actual verified company receipt.',amountPaisa:total,reference:'FICTIONAL-FOCUSED-REMITTANCE'});
  return {...f,jobId,claimId:String(f.sqlite.prepare("SELECT id FROM parcel_cash_records WHERE kind='remittance'").get()!.id)};
 }catch(error){f.dispose();throw error;}
}
