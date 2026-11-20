'use client';
import {formText} from '@/lib/forms/form-text';
import {useRef,type SyntheticEvent} from 'react';
import {ConfiguredFields} from '@/components/forms/configured-fields';
import {usePublishedFormConfig} from '@/components/forms/form-config-client';
import {configuredJsonPayload,readConfiguredSubmission} from '@/lib/forms/client-submission';
import {useCaseCommand} from './use-case-command';
import {useOwnedFormScope} from '@/components/forms/use-owned-form-scope';
import type {AftercareSource,aftercareFollowup} from '@/lib/returns/followup';
const baseKeys=['sourceType','sourceId','ownerId','backupId','waitingFor','nextUpdateAt','nextAction','publicMessage','privateNote','newClarification','requestId','expectedRevision','formVersion','customAnswers','action','decision','outcome','responsibility','itemRefundPaisa','deliveryRefundPaisa','reference','restockQuantity','note','publicMessageEn','publicMessageNe','returnRequestId','refundId','amountPaisa','resolutionEn','resolutionNe','complaintId'];
type Props={sourceType:AftercareSource;source:NonNullable<Awaited<ReturnType<typeof aftercareFollowup>>>;actorId:string};
export function AftercareFollowupActions(props:Props){
 const scope=useOwnedFormScope(JSON.stringify([props.actorId,props.sourceType,props.source.id]));
 return <ScopedAftercareFollowupActions key={scope.key} {...props}/>;
}
function ScopedAftercareFollowupActions({sourceType,source,actorId}:Props){
 const formId=sourceType==='return_request'?'staff.return-case-action':'staff.complaint-case-action',catalog=usePublishedFormConfig(formId),ref=useRef<HTMLFormElement>(null),command=useCaseCommand(formId,actorId,sourceType+'-followup',source.id,`/api/admin/cases/followup?sourceType=${sourceType}&sourceId=${encodeURIComponent(source.id)}`,{onResponse:(response,code)=>catalog.handleSubmissionResponse(response,code)});
 const time=(value:number)=>new Date(value).toLocaleString('en-NP',{timeZone:'Asia/Kathmandu'});
 async function submit(event:SyntheticEvent){event.preventDefault();if(!ref.current||!catalog.config)return;try{const data=new FormData(ref.current),configured=readConfiguredSubmission(ref.current,catalog.config,baseKeys);await command.submit({sourceType,sourceId:source.id,ownerId:actorId,backupId:source.backupId,expectedRevision:String(source.revision),waitingFor:data.get('waitingFor'),nextUpdateAt:Date.parse(formText(data, 'nextUpdateAt')+'+05:45'),nextAction:data.get('nextAction'),publicMessage:data.get('publicMessage'),privateNote:data.get('privateNote'),newClarification:data.get('newClarification')==='on',...configuredJsonPayload(catalog.config,configured.answers,baseKeys)});}catch(error){command.setMessage(error instanceof Error?error.message:'Review the current form.');}}
 if(command.accessDenied)return <section role="alert" className="rounded border p-4"><p>Current account or case access changed. Private follow-up fields are hidden.</p><button type="button" onClick={()=>void command.recover()}>Check original saved follow-up</button><button type="button" onClick={()=>window.location.reload()}>Reload current case</button></section>;
 return <section className="mt-4 min-w-0 space-y-3 rounded border p-4"><h2 className="text-xl font-semibold">Owned next action</h2><p>First received: {time(source.firstReceivedAt)}. First review target: {time(source.firstDueAt)}.</p><p>{source.ownerId?'An owner is recorded.':'A named owner is still needed.'} {source.nextUpdateAt?`Promised update: ${time(source.nextUpdateAt)}.`:'No next update has been promised.'}</p>
  {command.saved?<div className="flex flex-wrap gap-2"><button disabled={command.busy} onClick={()=>void command.recover()}>Check saved follow-up</button>{command.canRetry?<button disabled={command.busy} onClick={()=>void command.retry()}>Retry unchanged follow-up</button>:null}{command.unrecorded?<button disabled={command.busy} onClick={command.restart}>Start a new attempt after review</button>:null}</div>:null}
  {!['resolved','closed','rejected'].includes(source.status)?<form ref={ref} data-form-id={sourceType==='return_request'?'staff.return-case-action':'staff.complaint-case-action'} aria-label="Owned case follow-up" onSubmit={submit}><fieldset disabled={command.busy||command.saved} className="min-w-0 space-y-3">
   <label className="block"><input type="checkbox" required/> I own this next action and customer update.</label>
   <label className="block">Waiting for<select name="waitingFor" defaultValue={source.waitingFor} className="block min-w-0 w-full max-w-full rounded border p-2"><option value="none">Action can proceed</option><option value="platform">Hastabazaar action</option><option value="carrier">Carrier evidence or action</option><option value="customer">Specific customer information</option><option value="seller">Specific seller information</option></select></label>
   <label className="block">Next promised update (Nepal)<input type="datetime-local" name="nextUpdateAt" required className="block min-w-0 w-full max-w-full rounded border p-2"/></label>
   <p>Keep an unresolved staff or carrier update within 24 elapsed hours. Specific clarification uses its separate 24/48-hour sequence.</p>
   <label className="block">Exact next action or specific information needed<textarea name="nextAction" required minLength={10} maxLength={1500} className="block min-w-0 w-full max-w-full rounded border p-2"/></label>
   <label className="block"><input type="checkbox" name="newClarification"/> This is a new specific question; retain the original overall case age.</label>
   <label className="block">Factual customer update<textarea name="publicMessage" required minLength={10} maxLength={1500} className="block min-w-0 w-full max-w-full rounded border p-2"/></label>
   <label className="block">Private evidence and reasoning<textarea name="privateNote" required minLength={10} maxLength={3000} className="block min-w-0 w-full max-w-full rounded border p-2"/></label>
   {catalog.config?<ConfiguredFields config={catalog.config} baseKeys={baseKeys}/>:null}<button disabled={!catalog.canSubmit} className="rounded border p-2">Save owned follow-up</button>
  </fieldset></form>:null}{catalog.message?<p>{catalog.message}</p>:null}{command.message?<output>{command.message}</output>:null}
 </section>;
}
