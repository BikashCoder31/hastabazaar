import type {PublicAftercareFollowup} from '@/lib/returns/followup';
export function AftercareFollowupSummary({value,audience='customer',customerCard=false}:{value?:PublicAftercareFollowup;audience?:'customer'|'seller';customerCard?:boolean}){
 if(!value)return null;const time=(at:number)=>new Date(at).toLocaleString('en-NP',{timeZone:'Asia/Kathmandu'});
 const closed=['resolved','closed','rejected'].includes(value.status);
 if(customerCard)return <div className="space-y-1 border-t border-[#E7DCCB] pt-3 text-sm text-[#46536F]">
  {value.firstActionAt?<p>Hastabazaar first reviewed it on {time(value.firstActionAt)}.</p>:!closed?<p>First review target: {time(value.firstDueAt)}.</p>:null}
  {!closed&&value.nextUpdateAt?<p>Promised update: {time(value.nextUpdateAt)}.</p>:null}
 </div>;
 const waiting:Record<string,string>={none:'Hastabazaar is handling the next action.',platform:'The next action is with Hastabazaar.',carrier:'Hastabazaar is following up with the carrier.',customer:audience==='customer'?'A specific information request is waiting for your reply.':'Hastabazaar is waiting for specific customer information.',seller:audience==='seller'?'A specific information request is waiting for your reply.':'Hastabazaar is waiting for specific seller information.'};
 return <div className="mt-3 space-y-1 rounded border p-3 text-sm"><p>First received: {time(value.firstReceivedAt)}.</p><p>{value.firstActionAt?`First staff review recorded: ${time(value.firstActionAt)}.`:`First staff review target: ${time(value.firstDueAt)}.`}</p>{closed?<p>This case is {value.status}. Earlier commitments remain in its history.</p>:value.waitingFor==='none'?null:<p>{waiting[value.waitingFor]??waiting.platform}</p>}{!closed&&value.nextUpdateAt?<p>Promised update: {time(value.nextUpdateAt)}.</p>:null}{!closed&&value.ownershipMissing?<p>Staff ownership still needs to be confirmed.</p>:null}</div>;
}
