import type {PublicReturnHandling} from '@/lib/returns/handling';
const date=(value:number)=>new Date(value).toLocaleString('en-NP',{timeZone:'Asia/Kathmandu'});
export function ReturnPhysicalSummary({value}:{value?:PublicReturnHandling}){
 if(!value)return null;
 return <section className="space-y-2 rounded border p-3" aria-label="Return handling">
  <p>Return handling: {value.phase.replaceAll('_',' ')}. Received {value.receivedQuantity} of {value.quantity}; inspected {value.inspectedQuantity}.</p>
  {value.waivedQuantity>0?<p>Physical return waived for {value.waivedQuantity} under the recorded decision.</p>:null}
  {value.instructions?<><p>Case reference: {value.instructions.reference}. {value.instructions.fundedBy==='buyer'?'Under your original return terms, you pay for this return method':'Hastabazaar funds this approved return method'}: {value.instructions.method}.</p><p>Destination: {value.instructions.destination}</p><p>{value.instructions.packaging}</p>{value.handoffDueAt?<p>Original coordination target: {date(value.handoffDueAt)}. Make the goods available or agree a handoff with the case team. Contact them if another arrangement is needed; this target does not cancel a timely claim.</p>:null}</>:null}
  {value.arrangement?<p>Recorded agreed availability: {date(value.arrangement.availabilityAt)} for {value.arrangement.remainingQuantity} item(s). Collection and actual receipt are recorded separately.</p>:null}
  {value.shipments.map(shipment=><p key={shipment.id}>Replacement: {shipment.state.replaceAll('_',' ')} · {shipment.quantity} item(s). Recorded delivery promise: {date(shipment.promisedAt)}.{shipment.deliveredAt?` Actual delivery: ${date(shipment.deliveredAt)}.`:''}</p>)}
 </section>;
}
