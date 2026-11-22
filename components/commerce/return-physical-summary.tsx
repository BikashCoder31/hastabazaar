import type {PublicReturnHandling} from '@/lib/returns/handling';
import {aftercareMoney} from './customer-request-presentation';
const date=(value:number)=>new Date(value).toLocaleString('en-NP',{timeZone:'Asia/Kathmandu'});
export function ReturnPhysicalSummary({value,customer=false}:{value?:PublicReturnHandling;customer?:boolean}){
 if(!value)return null;
 if(customer)return <section className="min-w-0 space-y-3 rounded-2xl border border-[#E4DACA] bg-[#FDFAF5] p-5 text-sm text-[#46536F] sm:p-6" aria-label="Return handling">
  <h4 className="text-base font-semibold text-[#14213D]">Pickup and return details</h4>
  {value.instructions?<dl className="space-y-2.5">
    <div><dt className="font-semibold text-[#14213D]">Method</dt><dd className="break-words">{value.instructions.method}</dd></div>
    <div><dt className="font-semibold text-[#14213D]">Who pays</dt><dd>{value.instructions.fundedBy==='buyer'
      ? `You pay ${value.instructions.customerChargePaisa > 0 ? aftercareMoney(value.instructions.customerChargePaisa) + ' ' : ''}for this method under your original return terms.`
      : 'Hastabazaar funds this approved return method.'}</dd></div>
    <div><dt className="font-semibold text-[#14213D]">Destination</dt><dd className="break-words">{value.instructions.destination}</dd></div>
    <div><dt className="font-semibold text-[#14213D]">Packaging</dt><dd className="whitespace-pre-wrap break-words">{value.instructions.packaging}</dd></div>
    {value.instructions.reference?<div><dt className="font-semibold text-[#14213D]">Reference</dt><dd className="break-all">{value.instructions.reference}</dd></div>:null}
    {value.arrangement?<div><dt className="font-semibold text-[#14213D]">Agreed availability</dt><dd>{date(value.arrangement.availabilityAt)} · {value.arrangement.remainingQuantity} item(s). Collection and receipt are confirmed separately.</dd></div>:null}
  </dl>:null}
  {value.handoffDueAt&&value.instructions?<p>Original handoff target: {date(value.handoffDueAt)}. Contact the case team if another arrangement is needed. This target does not cancel a request sent on time.</p>:null}
  {value.receivedQuantity>0?<p>Received {value.receivedQuantity} of {value.quantity} · Checked {value.inspectedQuantity}.</p>:null}
  {value.waivedQuantity>0?<p>Under the recorded decision, {value.waivedQuantity} item(s) do not need to come back.</p>:null}
  {value.shipments.map(shipment=><p key={shipment.id}>Replacement: {shipment.state.replaceAll('_',' ')} · {shipment.quantity} item(s). Recorded delivery promise: {date(shipment.promisedAt)}.{shipment.deliveredAt?` Actual delivery: ${date(shipment.deliveredAt)}.`:''}</p>)}
  {!value.instructions&&!value.shipments.length&&!value.waivedQuantity&&!value.receivedQuantity?<p>Any approved return or pickup instructions will appear here.</p>:null}
 </section>;
 return <section className="space-y-2 rounded border p-3" aria-label="Return handling">
  <p>Return handling: {value.phase.replaceAll('_',' ')}. Received {value.receivedQuantity} of {value.quantity}; inspected {value.inspectedQuantity}.</p>
  {value.waivedQuantity>0?<p>Physical return waived for {value.waivedQuantity} under the recorded decision.</p>:null}
  {value.instructions?<><p>Case reference: {value.instructions.reference}. {value.instructions.fundedBy==='buyer'?'Under your original return terms, you pay for this return method':'Hastabazaar funds this approved return method'}: {value.instructions.method}.</p><p>Destination: {value.instructions.destination}</p><p>{value.instructions.packaging}</p>{value.handoffDueAt?<p>Original coordination target: {date(value.handoffDueAt)}. Make the goods available or agree a handoff with the case team. Contact them if another arrangement is needed; this target does not cancel a timely claim.</p>:null}</>:null}
  {value.arrangement?<p>Recorded agreed availability: {date(value.arrangement.availabilityAt)} for {value.arrangement.remainingQuantity} item(s). Collection and actual receipt are recorded separately.</p>:null}
  {value.shipments.map(shipment=><p key={shipment.id}>Replacement: {shipment.state.replaceAll('_',' ')} · {shipment.quantity} item(s). Recorded delivery promise: {date(shipment.promisedAt)}.{shipment.deliveredAt?` Actual delivery: ${date(shipment.deliveredAt)}.`:''}</p>)}
 </section>;
}
