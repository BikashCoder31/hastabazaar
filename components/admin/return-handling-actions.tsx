'use client';
import {useRef,useState,type SyntheticEvent} from 'react';
import {ConfiguredFields} from '@/components/forms/configured-fields';
import {usePublishedFormConfig} from '@/components/forms/form-config-client';
import {configuredJsonPayload,readConfiguredSubmission} from '@/lib/forms/client-submission';
import {useCaseCommand} from './use-case-command';
import {useOwnedFormScope} from '@/components/forms/use-owned-form-scope';
import type {ReturnHandlingWorkspace,HandlingAction} from '@/lib/returns/handling';

const formId='staff.return-case-action';
const baseKeys=['decision','outcome','responsibility','itemRefundPaisa','deliveryRefundPaisa','reference','restockQuantity','note','publicMessageEn','publicMessageNe','returnRequestId','refundId','amountPaisa','action','requestId','expectedRevision','occurredAt','publicMessage','privateNote','evidenceReference','quantity','disposition','destination','method','packaging','safeHandlingConfirmed','shipmentId','carrierReference','customerAgreementReference','promisedAt','availabilityAt','amendInstructions','formVersion','customAnswers'];
const labels:Record<HandlingAction,string>={arrange:'Record an agreed collection or amended arrangement',instructions:'Issue usable return instructions',handoff:'Record actual customer handoff',receive:'Record actual receipt',inspect:'Record inspection and disposition',waive_return:'Authorize return without physical collection',sufficient_evidence:'Record sufficient evidence for an outcome',prepare_replacement:'Reserve the agreed replacement',dispatch_replacement:'Record replacement handoff',deliver_replacement:'Record actual replacement delivery',cancel_replacement:'Cancel an unhanded replacement',lost_replacement:'Record confirmed replacement loss'};
const nepalInput=(time:number)=>new Date(time+20700000).toISOString().slice(0,16);
const parseNepal=(value:FormDataEntryValue|null)=>typeof value==='string'?Date.parse(value+'+05:45'):NaN;
type Props={workspace:NonNullable<ReturnHandlingWorkspace>;actorId:string;superAdmin:boolean};
export function ReturnHandlingActions(props:Props){
 const scope=useOwnedFormScope(JSON.stringify([props.actorId,props.workspace.state.caseId]));
 return <ScopedReturnHandlingActions key={scope.key} {...props}/>;
}
function ScopedReturnHandlingActions({workspace,actorId,superAdmin}:Props){
 const {state,shipments}=workspace,catalog=usePublishedFormConfig(formId),formRef=useRef<HTMLFormElement>(null);
 const [action,setAction]=useState<HandlingAction>('instructions'),[amendInstructions,setAmendInstructions]=useState(false),command=useCaseCommand(formId,actorId,'physical-return',state.caseId,`/api/admin/returns/${encodeURIComponent(state.caseId)}/handling`,{onResponse:(response,code)=>catalog.handleSubmissionResponse(response,code)}),{busy,saved,message}=command;
 async function submit(event:SyntheticEvent<HTMLFormElement>){
  event.preventDefault();if(!catalog.config||!catalog.canSubmit||!formRef.current)return;
  try{
   const data=new FormData(formRef.current),configured=readConfiguredSubmission(formRef.current,catalog.config,baseKeys);
   await command.submit({action,expectedRevision:String(state.revision),occurredAt:parseNepal(data.get('occurredAt')),publicMessage:data.get('publicMessage'),privateNote:data.get('privateNote'),evidenceReference:data.get('evidenceReference'),
    ...(['receive','inspect','waive_return'].includes(action)?{quantity:Number(data.get('quantity'))}:{}),...(action==='inspect'?{disposition:data.get('disposition')}:{}),
    ...(action==='instructions'||action==='arrange'&&amendInstructions?{instructions:{destination:data.get('destination'),method:data.get('method'),packaging:data.get('packaging'),safeHandlingConfirmed:data.get('safeHandlingConfirmed')==='on'}}:{}),
    ...(action==='arrange'?{availabilityAt:parseNepal(data.get('availabilityAt')),customerAgreementReference:data.get('customerAgreementReference')}:{}),
    ...(action==='prepare_replacement'?{customerAgreementReference:data.get('customerAgreementReference'),promisedAt:parseNepal(data.get('promisedAt'))}:{}),
    ...(['dispatch_replacement','deliver_replacement','cancel_replacement','lost_replacement'].includes(action)?{shipmentId:data.get('shipmentId')}:{}),...(action==='dispatch_replacement'?{carrierReference:data.get('carrierReference')}:{}),
    ...configuredJsonPayload(catalog.config,configured.answers,baseKeys)});
  }catch(error){command.setMessage(error instanceof Error?error.message:'Review the current action form.');}
 }
 if(command.accessDenied)return <section role="alert" className="rounded border p-4"><p>Current account or case access changed. Private action fields are hidden.</p><button type="button" onClick={()=>void command.recover()}>Check original saved action</button><button type="button" onClick={()=>window.location.reload()}>Reload current case</button></section>;
 const field=(name:string,label:string,type='text',required=true)=><label className="block" key={name}>{label}<input name={name} type={type} required={required} className="mt-1 block w-full rounded border p-2" {...(type==='datetime-local'?{defaultValue:name==='occurredAt'?nepalInput(state.now):undefined}:{})}/></label>;
 return <section className="mt-5 space-y-3 rounded border p-4"><h2 className="text-xl font-semibold">Physical return and replacement</h2>
  <p>Received {state.receivedQuantity}/{state.quantity}; inspected {state.inspectedQuantity}; saleable stock restored {state.restockedQuantity}. Hastabazaar funds the approved return method.</p>
  {saved?<div className='flex flex-wrap gap-2'><button type='button' disabled={busy} onClick={()=>void command.recover()}>Check saved action outcome</button>{command.canRetry?<button type='button' disabled={busy} onClick={()=>void command.retry()}>Retry unchanged action</button>:null}{command.unrecorded?<button type='button' disabled={busy} onClick={command.restart}>Start a new attempt after review</button>:null}</div>:null}
  {!['resolved','rejected'].includes(state.caseStatus)?<form ref={formRef} aria-label="Physical return action" data-form-id={formId} onSubmit={submit} className="min-w-0 space-y-3"><fieldset disabled={busy||saved} className="min-w-0 space-y-3">
   <label className="block">Actual action<select className="block min-w-0 w-full max-w-full rounded border p-2" value={action} onChange={event=>setAction(event.target.value as HandlingAction)}>{Object.entries(labels).filter(([key])=>key!=='waive_return'||superAdmin).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
   {field('occurredAt','Actual event time (Nepal)','datetime-local')}
   {action==='arrange'?<>{field('availabilityAt','Agreed customer availability (Nepal)','datetime-local')}{field('customerAgreementReference','Retained customer agreement to this arrangement')}<label className='block'><input type='checkbox' checked={amendInstructions} onChange={event=>setAmendInstructions(event.target.checked)}/> Explicitly amend the destination or method before handoff.</label></>:null}
   {action==='instructions'||action==='arrange'&&amendInstructions?<>{field('destination','Exact approved receiving destination')}{field('method','Company-funded return method')}{field('packaging','Safe packaging and handling instructions')}<label className="block"><input name="safeHandlingConfirmed" type="checkbox" required/> The proposed method is safe for these actual goods.</label></>:null}
   {['receive','inspect','waive_return'].includes(action)?<label className="block">Actual quantity<input name="quantity" type="number" min={1} max={state.quantity} required className="block min-w-0 w-full max-w-full rounded border p-2"/></label>:null}
   {action==='inspect'?<label className="block">Condition-based disposition<select name="disposition" className="block min-w-0 w-full max-w-full rounded border p-2"><option value="quarantine">Quarantine</option><option value="scrap">Scrap</option><option value="restock">Inspected and saleable — restock</option></select></label>:null}
   {action==='prepare_replacement'?<>{field('customerAgreementReference','Retained customer agreement to this exact replacement')}{field('promisedAt','Agreed replacement delivery promise (Nepal)','datetime-local')}</>:null}
   {['dispatch_replacement','deliver_replacement','cancel_replacement','lost_replacement'].includes(action)?<label className="block">Exact replacement shipment<select name="shipmentId" className="block min-w-0 w-full max-w-full rounded border p-2" required>{shipments.map(s=><option value={s.id} key={s.id}>{s.id} — {s.state}</option>)}</select></label>:null}
   {action==='dispatch_replacement'?field('carrierReference','Actual carrier or handoff reference'):null}
   {field('evidenceReference','Retained evidence reference')}
   <label className="block">Factual customer update<textarea name="publicMessage" required minLength={10} maxLength={1500} className="block min-w-0 w-full max-w-full rounded border p-2"/></label>
   <label className="block">Private staff evidence and reasoning<textarea name="privateNote" required minLength={10} maxLength={3000} className="block min-w-0 w-full max-w-full rounded border p-2"/></label>
   {catalog.config?<ConfiguredFields config={catalog.config} baseKeys={baseKeys}/>:null}<button disabled={!catalog.canSubmit} className="rounded border px-4 py-2">Record this action</button>
  </fieldset>{catalog.message?<p>{catalog.message}</p>:null}</form>:null}
  {message?<output className="block">{message}</output>:null}
 </section>;
}
