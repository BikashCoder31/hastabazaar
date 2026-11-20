'use client';
import {useRef,type SubmitEvent} from 'react';
import {useRouter} from 'next/navigation';
import {safeAdminReturnTo,withAdminReturnTo} from '@/lib/admin/return-context';
import Link from 'next/link';
import {FinanceEvidenceUpload} from '@/components/commerce/finance-evidence-upload';
import {useCaseCommand} from './use-case-command';
import {FinanceAccessNotice} from './finance-access-notice';
import type {getRefundFinanceWorkspace,RefundPacketSummary} from '@/lib/payments/refund-workspace';
import type {CustomerRefundDelayReason} from '@/lib/payments/refund-current-progress';
type Field={name:string;label:string;type?:'text'|'textarea'|'checkbox'|'money'|'date'|'select';options?:{value:string;label:string}[];group?:'trigger'};
type FinancialActionProps={actorId:string;scope:string;action:string;label:string;revision:string|null;input:Record<string,unknown>;fields?:Field[];onRecorded?:(id:string)=>void};
export type RefundFinanceQuery={case?:string;obligation?:string;returnLoss?:string;returnSatisfaction?:string;search?:string;cursor?:string;sourceCursor?:string;pageSize?:string};
const money=(n:number)=>new Intl.NumberFormat('en-NP',{style:'currency',currency:'NPR'}).format(n/100);
const date=(n:number)=>new Date(n).toLocaleString('en-NP',{timeZone:'Asia/Kathmandu'});
const reason:Field={name:'reason',label:'Decision and evidence-based reason',type:'textarea'},evidence:Field={name:'evidenceReference',label:'Restricted evidence reference'};

function RefundPacketHistory({packet}:{packet:RefundPacketSummary}) {
 const review=packet.privateReview;
 if (!review) return null;
 const steps=[
  {label:'Prepared',actor:review.preparedBy,at:packet.preparedAt},
  {label:'Approved',actor:review.approvedBy,at:review.approvedAt},
  {label:'Processing started',actor:review.startedBy,at:review.startedAt},
  {label:'Outcome recorded',actor:review.recordedBy,at:review.recordedAt},
 ];
 return <details>
  <summary className="cursor-pointer font-medium">Packet history and evidence</summary>
  <dl className="mt-2 space-y-2 text-sm">
   {steps.map(({label,actor,at})=>actor&&at!==null?<div key={label}>
    <dt className="font-medium">{label}</dt>
    <dd>{actor.displayName} · {date(at)}</dd>
   </div>:null)}
   {review.submission?<div>
    <dt className="font-medium">Bank acknowledgment</dt>
    <dd>{date(review.submission.acknowledgedAt)} · Recorded by {review.submission.recordedBy.displayName}</dd>
    <dd><a className="underline" target="_blank" rel="noreferrer"
      href={'/api/admin/finance-evidence?file='+encodeURIComponent(review.submission.evidenceReference)}>Read restricted bank acknowledgment</a></dd>
   </div>:null}
   {review.settlement?<div>
    <dt className="font-medium">Confirmed bank transaction</dt>
    <dd>{review.settlement.transactionIdentity} · {date(review.settlement.bankAt)}</dd>
   </div>:null}
   {review.evidenceReference?<div>
    <dt className="font-medium">Recorded outcome evidence</dt>
    <dd>{review.evidenceReference.startsWith('fin-file-')
      ?<a className="underline" target="_blank" rel="noreferrer"
        href={'/api/admin/finance-evidence?file='+encodeURIComponent(review.evidenceReference)}>Read restricted outcome evidence</a>
      :review.evidenceReference}</dd>
   </div>:null}
  </dl>
 </details>;
}

function refundDelayReason(
 state:string, cashPaisa:number, destinationStatus:string|undefined, packet:RefundPacketSummary|undefined,
):CustomerRefundDelayReason|null {
 if (cashPaisa<=0) return null;
 const bankPacket=packet?.route==='manual_bank'&&packet.destinationVersionId!==null&&packet.fundingStatementId!==null;
 if (bankPacket && state==='uncertain' && packet.state==='uncertain') return 'bank_outcome_reconciliation';
 if (bankPacket && state==='processing' && packet.state==='processing') return 'bank_processing';
 if (state==='blocked') return 'company_funding_review';
 if (state==='open' && destinationStatus==='submitted') return 'payment_details_verification';
 if (state==='open' && (!destinationStatus || destinationStatus==='rejected')) return 'payment_details_needed';
 return null;
}

const delayLabels:Record<CustomerRefundDelayReason,string>={
 payment_details_needed:'Payment details needed',
 payment_details_verification:'Payment details verification',
 company_funding_review:'Company funding review',
 bank_processing:'Bank processing',
 bank_outcome_reconciliation:'Bank outcome reconciliation',
};
export function FinancialOutcomeRecovery({actorId,action,scope}:{actorId:string;action:string;scope:string}){
 const command=useCaseCommand('system.refund-finance',actorId,action,scope,'/api/admin/refunds',{created:true});
 return command.saved||command.message?<div className="space-y-2"><button type="button" disabled={command.busy} onClick={()=>void command.recover()}>Check saved outcome</button>{command.message?<output className="block" aria-live="polite">{command.message}</output>:null}</div>:null;
}
function paisa(value:string){if(!/^\d+(?:\.\d{1,2})?$/.test(value))throw new Error('Enter an exact nonnegative NPR amount with at most two decimal places.');const [whole,fraction='']=value.split('.'),result=BigInt(whole)*BigInt(100)+BigInt(fraction.padEnd(2,'0'));if(result>BigInt(Number.MAX_SAFE_INTEGER))throw new Error('The amount is outside the supported range.');return Number(result);}
export function FinancialAction({actorId,scope,action,label,revision,input,fields=[],onRecorded}:FinancialActionProps){
 return <FinancialActionScope key={JSON.stringify([actorId,scope,action])} actorId={actorId} scope={scope} action={action} label={label} revision={revision} input={input} fields={fields} onRecorded={onRecorded}/>;
}
function FinancialActionScope({actorId,scope,action,label,revision,input,fields=[],onRecorded}:FinancialActionProps){
 const ref=useRef<HTMLFormElement>(null),command=useCaseCommand('system.refund-finance',actorId,action,scope,'/api/admin/refunds',{created:true,onSuccess:onRecorded});
 async function submit(event:SubmitEvent<HTMLFormElement>){
  event.preventDefault();
  if (!ref.current) return;
  try {
   const data=new FormData(ref.current),values={...input};
   for (const field of fields) {
    const value=data.get(field.name);
    if (value!==null&&typeof value!=='string') throw new Error('Use a text value for '+field.label+'.');
    const raw=value??'';
    const parsed=field.type==='checkbox'?value==='on':field.type==='money'?paisa(raw):field.type==='date'?Date.parse(raw+'+05:45'):raw;
    if (field.group==='trigger') {
     values.trigger={...values.trigger as Record<string,unknown>,[field.name]:parsed};
    } else {
     values[field.name]=parsed;
    }
   }
   await command.submit({sourceFormId:'system.refund-finance',action,expectedRevision:revision,input:values});
  } catch(error) {
   command.setMessage((error as Error).message);
  }
 }
 if(command.accessDenied)return <FinanceAccessNotice message={command.message} busy={command.busy} onCheck={()=>void command.recover()}/>;
 return <details className="rounded border p-3"><summary className="cursor-pointer font-medium">{label}</summary>{command.saved?<div className="my-3 flex gap-3"><button disabled={command.busy} onClick={()=>void command.recover()}>Check saved outcome</button>{command.canRetry?<button disabled={command.busy} onClick={()=>void command.retry()}>Retry unchanged action</button>:null}{command.unrecorded?<button disabled={command.busy} onClick={command.restart}>Start a new reviewed attempt</button>:null}</div>:null}<form ref={ref} data-form-id="system.refund-finance" aria-label={label} onSubmit={submit}><fieldset disabled={command.busy||command.saved} className="mt-3 grid gap-3">{fields.map(field=><label key={field.name} className="block">{field.label}{field.type==='checkbox'?<input name={field.name} type="checkbox" required className="ml-2"/>:field.type==='select'?<select name={field.name} required className="block w-full rounded border p-2"><option value="">Choose a verified record</option>{field.options?.map(option=><option key={option.value} value={option.value}>{option.label}</option>)}</select>:field.type==='textarea'?<textarea name={field.name} required minLength={10} maxLength={1500} className="block w-full rounded border p-2"/>:<input name={field.name} required type={field.type==='date'?'datetime-local':'text'} inputMode={field.type==='money'?'decimal':undefined} step={field.type==='date'?1:undefined} className="block w-full rounded border p-2"/>}</label>)}<button className="rounded bg-primary px-3 py-2 text-primary-foreground">{label}</button></fieldset></form>{command.message?<output className="mt-2 block" aria-live="polite">{command.message}</output>:null}</details>;
}

function RefundFailureReview({actorId,packet}:{actorId:string;packet:RefundPacketSummary}) {
 const acknowledged=Boolean(packet.privateReview?.submission);
 const failureOptions=[
  ...(!acknowledged?[{value:'not_sent',label:'Instruction was not sent'}]:[]),
  {value:'no_debit',label:'Bank confirms no completed debit'},
  {value:'debit_returned',label:'Actual debit was returned'},
 ];
 const finality:Field[] = acknowledged ? [{
  name:'bankFinalityConfirmed',
  label:'I independently confirmed the final bank outcome and verified that this instruction cannot debit again.',
  type:'checkbox',
 }] : [];
 return <>
  {acknowledged?<p className="text-sm">The bank has acknowledged this instruction. Verify its final bank outcome before releasing the reservation.</p>:null}
  <FinancialAction actorId={actorId} scope={packet.id+':failed'} action="outcome"
   label="Record confirmed failure before retry" revision={String(packet.revision)}
   input={{packetId:packet.id,outcome:'failed'}}
   fields={[
    {name:'failureBasis',label:'Actual reconciled failure',type:'select',options:failureOptions},
    ...finality,
    acknowledged?{name:'evidenceReference',label:'Retained private file confirming the final bank outcome for this instruction'}:evidence,
    reason,
   ]}/>
 </>;
}
export function RefundFundingReview({workspace,actorId,query={},returnTo='/admin'}:{workspace:Awaited<ReturnType<typeof getRefundFinanceWorkspace>>;actorId:string;query?:RefundFinanceQuery;returnTo?:string}){
 const router=useRouter(),params=new URLSearchParams();
 for(const key of ['case','obligation','returnLoss','returnSatisfaction','search','cursor','sourceCursor','pageSize'] as const)if(query[key])params.set(key,query[key]!);
 const currentHref=withAdminReturnTo('/admin/payments/refunds'+(params.size?'?'+params.toString():''),returnTo);
 function pageHref(change:Partial<Record<'cursor'|'sourceCursor',string|null>>){const next=new URLSearchParams(params);for(const [key,value]of Object.entries(change))if(value)next.set(key,value);else next.delete(key);return withAdminReturnTo('/admin/payments/refunds'+(next.size?'?'+next.toString():''),returnTo);}
 function opened(id:string){router.push(withAdminReturnTo('/admin/payments/refunds?obligation='+encodeURIComponent(id),currentHref));}
 return <div className="space-y-7"><h1 className="font-heading text-4xl">Refunds &amp; funding</h1><p>Keep the original entitlement, verified destination, company funding and actual bank outcome separate. Bank transfers are performed manually outside this website.</p><Link className="underline" href={safeAdminReturnTo(returnTo)}>Back to previous view</Link><br/><Link className="underline" href={withAdminReturnTo("/admin/payments",currentHref)}>Incoming payments and owned Finance exceptions</Link><form data-form-id="staff.refund-funding-filter" method="get" className="flex flex-wrap items-end gap-3">{(["case","obligation","returnLoss","returnSatisfaction"] as const).map(key=>query[key]?<input key={key} type="hidden" name={key} value={query[key]}/>:null)}<input type="hidden" name="returnTo" value={safeAdminReturnTo(returnTo)}/><label>Find an original order, bank transaction or source reference<input name="search" maxLength={160} defaultValue={workspace.pages.search} className="mt-1 block rounded border p-2"/></label><label>Records per queue page<input name="pageSize" type="number" min={1} max={100} defaultValue={workspace.pages.limit} className="mt-1 block w-24 rounded border p-2"/></label><button className="rounded border p-2">Search original references</button><Link className="underline" href={pageHref({cursor:null,sourceCursor:null})}>First page</Link></form>
  <section className="space-y-3"><h2 className="text-2xl">Authorized sources awaiting Finance</h2>{workspace.sources.length?workspace.sources.map(source=><article id={"refund-source-"+source.sourceId} key={source.kind+source.sourceId} className="rounded border p-4"><p>{source.label} · {source.kind==='receipt_return'?'Unused receipt return':source.kind==='service_fee'?'Legally authorized original fee':source.kind==='cancellation'?'Original cancellation cash':'Original return entitlement'} · Cash {money(source.cashPaisa)}</p><FinancialAction actorId={actorId} scope={source.sourceId} action="open" label="Open original refund obligation" onRecorded={opened} revision={null} input={{kind:source.kind,sourceId:source.sourceId}} fields={[reason]}/></article>):<p>No additional authorized sources in this view.</p>}{workspace.pages.sources.nextCursor?<Link rel="next" className="inline-block underline" href={pageHref({sourceCursor:workspace.pages.sources.nextCursor})}>Next authorized sources</Link>:null}</section>
  <section className="space-y-3"><h2 className="text-2xl">Company funding evidence</h2>{workspace.funding.map(account=><article key={account.versionId} className="rounded border p-4"><p>{account.label} · {account.availablePaisa===null?'Available funds need verification':money(account.availablePaisa)+' available after recorded restrictions and reservations'}{account.asOf!==null?' · Statement as of '+date(account.asOf):''}</p>{workspace.superAdmin?<FinanceEvidenceUpload actorId={actorId} mode="staff" scope={{kind:'company_account',id:account.versionId}}/>:null}{workspace.superAdmin?<FinancialAction actorId={actorId} scope={account.versionId} action="verify_funding" label="Verify actual company funds" revision={account.revision===null?null:String(account.revision)} input={{accountVersionId:account.versionId}} fields={[{name:'statementIdentity',label:'Unique actual bank statement identity'},{name:'asOf',label:'Actual statement time (Nepal)',type:'date'},{name:'cashPaisa',label:'Actual bank cash balance (NPR)',type:'money'},{name:'restrictedPaisa',label:'Customer, seller and unrelated restricted money (NPR)',type:'money'},evidence,{name:'restrictionsReference',label:'Restricted-money reconciliation reference'},{name:'availableFundsConfirmed',label:'I verified actual available company funds and excluded money belonging to others.',type:'checkbox'},reason]}/>:null}</article>)}</section>
  <section className="space-y-4"><h2 className="text-2xl">Original refund obligations</h2>{workspace.obligations.map(row=>{
   const destinations=workspace.destinations.filter(item=>item.obligationId===row.id),packets=workspace.packets.filter(item=>item.obligationId===row.id),live=packets.find(item=>!['failed','void'].includes(item.state));
   const delayReason=refundDelayReason(row.state,row.cashPaisa,destinations.find(item=>item.current)?.status,live);
   const canReviewDeadline=row.independentReviewer&&row.deadlineRevision!==null&&(row.state!=='completed'||
    workspace.customerRefundReversals.some(item=>item.obligationId===row.id));
   return <article id={"refund-obligation-"+row.id} key={row.id} className="space-y-3 rounded-xl border p-5"><h3 className="text-xl font-semibold">{row.orderNumber??'Identified payer receipt'} · {row.customerName}</h3><p>Cash {money(row.cashPaisa)} · Original wallet credit {money(row.walletPaisa)}{row.alreadyRestoredWalletPaisa>0?` · Wallet credit already restored by cancellation ${money(row.alreadyRestoredWalletPaisa)}`:''} · {row.state}</p>{row.bankSatisfiedPaisa>0?<p>Originally authorized cash: {money(row.originalCashPaisa)}. The bank already returned {money(row.bankSatisfiedPaisa)} directly to the original payer; this is excluded from the separate cash transfer above.</p>:null}<Link className="underline" href={withAdminReturnTo("/admin/payments/refunds?obligation="+encodeURIComponent(row.id),currentHref)}>Open exact original obligation</Link><FinancialOutcomeRecovery actorId={actorId} action="open" scope={row.sourceId}/><p>Owner: {row.ownerName}. Authorized {date(row.authorizedAt)} · First Finance target {date(row.firstFinanceDueAt)}{row.state!=='completed'?' · Next update '+date(row.nextUpdateAt):''}</p>
    {row.returnTender?<dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
     <div><dt>Merchandise</dt><dd>{money(row.returnTender.merchandisePaisa)}</dd></div>
     <div><dt>Original delivery</dt><dd>{money(row.returnTender.deliveryPaisa)}</dd></div>
     <div><dt>Referral discount offset</dt><dd>{money(row.returnTender.referralOffsetPaisa)}</dd></div>
     <div><dt>Promotion discount offset</dt><dd>{money(row.returnTender.promoOffsetPaisa)}</dd></div>
    </dl>:null}
    {row.initiationDueAt!==null?<p>Original initiation target: {date(row.initiationDueAt)}</p>:<p>The original initiation calendar needs reconciliation; the Finance action target remains visible.</p>}{row.bindingDueAt!==null?<p>Earlier/binding policy due date: {date(row.bindingDueAt)}</p>:null}
    {canReviewDeadline&&row.bindingDueAt!==null?<FinancialAction actorId={actorId} scope={row.id+':deadline'} action="earlier_deadline" label="Retain an evidenced earlier binding date" revision={String(row.deadlineRevision)} input={{obligationId:row.id}} fields={[{name:'dueAt',label:'Original earlier due date (Nepal)',type:'date'},evidence,reason]}/>:null}
    {workspace.superAdmin&&canReviewDeadline
     ?<FinancialAction actorId={actorId} scope={row.id+':legal-deadline'} action="earlier_deadline"
      label="Retain earlier deadline from a reviewed legal trigger" revision={String(row.deadlineRevision)}
      input={{obligationId:row.id,trigger:{kind:'reviewed_legal_trigger'}}}
      fields={[
       {name:'dueAt',label:'Reviewed earlier binding due date (Nepal)',type:'date'},
       {name:'occurredAt',label:'Actual time of the qualifying event (Nepal)',type:'date',group:'trigger'},
       {name:'authorityReference',label:'Reviewed legal authority reference',group:'trigger'},
       {name:'evidenceReference',label:'Retained private trigger evidence file reference'},
       reason,
      ]}/>:null}
    {row.independentReviewer&&delayReason?<FinancialAction actorId={actorId} scope={row.id+':delay'} action="record_delay"
     label={'Send refund update · '+delayLabels[delayReason]} revision={String(row.revision)}
     input={{obligationId:row.id,reasonCode:delayReason}} fields={[{name:'nextUpdateAt',label:'Next update time (Nepal)',type:'date'},reason]}/>:null}
    {workspace.superAdmin&&row.independentReviewer?<FinanceEvidenceUpload actorId={actorId} mode="staff" scope={{kind:'obligation',id:row.id}}/>:null}
    {destinations.map(destination=><div key={destination.id} className="rounded border p-3"><p>{destination.label} · {destination.status}{destination.current?' · Current':' · Retained prior version'}</p>{destination.privateReview?<details><summary>Restricted beneficiary verification</summary><p>Holder: {destination.privateReview.details.holder} · Bank: {destination.privateReview.details.bank} · Branch: {destination.privateReview.details.branch} · Account: {destination.privateReview.details.accountNumber}</p><p>Customer authorization: {destination.privateReview.authorization}</p><p>Evidence: {destination.privateReview.evidenceReference}</p>{destination.privateReview.evidenceReference.startsWith('fin-file-')?<a className="underline" target="_blank" rel="noreferrer" href={'/api/admin/finance-evidence?file='+encodeURIComponent(destination.privateReview.evidenceReference)}>Read restricted ownership evidence</a>:null}</details>:null}{workspace.superAdmin&&destination.current&&destination.status==='submitted'?<FinancialAction actorId={actorId} scope={destination.id} action="verify_destination" label="Verify exact beneficiary" revision={String(destination.revision)} input={{versionId:destination.id}} fields={[{name:'ownershipConfirmed',label:'I independently verified the named account holder against appropriate evidence.',type:'checkbox'},{name:'relationshipConfirmed',label:'I verified the original payer or the authenticated customer’s specific authorized relationship.',type:'checkbox'},{name:'verificationReference',label:'Independent verification record'},reason]}/>:null}</div>)}
    {!live&&row.state==='open'?<FinancialAction actorId={actorId} scope={row.id} action="prepare" label={row.cashPaisa?'Prepare exact refund packet':'Prepare original credit restoration'} revision={String(row.revision)} input={{obligationId:row.id,...row.cashPaisa===0?{destinationVersionId:null,fundingStatementId:null}:{}}} fields={[...(row.cashPaisa?[{name:'destinationVersionId',label:'Current verified destination',type:'select' as const,options:destinations.filter(d=>d.current&&d.status==='verified').map(d=>({value:d.id,label:d.label}))},{name:'fundingStatementId',label:'Verified company funding source',type:'select' as const,options:workspace.funding.filter(f=>f.statementId).map(f=>({value:f.statementId!,label:f.label+' · '+money(f.availablePaisa??0)}))}]:[]),reason]}/>:null}
    {packets.map(packet=><div key={packet.id} className="space-y-2 rounded border p-3"><p>{packet.route==='manual_bank'?'Manual bank transfer':'Original credit restoration'} · {packet.state==='processing'&&packet.privateReview?.submission?'Submitted':packet.state} · Cash {money(packet.amountPaisa)} · Prepared {date(packet.preparedAt)}</p>
     <RefundPacketHistory packet={packet}/>
     {packet.privateReview&&!packet.privateReview.submission&&['processing','uncertain'].includes(packet.state)&&packet.amountPaisa>0
       ?<FinancialAction actorId={actorId} scope={packet.id+':submission'} action="record_submission"
         label="Record bank acknowledgment" revision={String(packet.revision)} input={{packetId:packet.id}}
         fields={[
           {name:'acknowledgedAt',label:'Actual bank acknowledgment time (Nepal)',type:'date'},
           {name:'evidenceReference',label:'Retained private bank acknowledgment file reference'},
           {name:'actualAcknowledgmentConfirmed',label:'I verified that the bank accepted this exact instruction.',type:'checkbox'},
           reason,
         ]}/>:null}{workspace.superAdmin&&packet.state==='prepared'?<FinancialAction actorId={actorId} scope={packet.id} action="approve" label="Approve exact amount and source" revision={String(packet.revision)} input={{packetId:packet.id}} fields={[reason]}/>:null}{workspace.superAdmin&&packet.state==='approved'?<FinancialAction actorId={actorId} scope={packet.id} action="start" label={packet.amountPaisa?'Begin one manual instruction':'Begin original credit restoration'} revision={String(packet.revision)} input={{packetId:packet.id}} fields={[reason]}/>:null}{workspace.superAdmin&&['prepared','approved'].includes(packet.state)?<FinancialAction actorId={actorId} scope={packet.id} action="void" label="Retire a provably unsent packet" revision={String(packet.revision)} input={{packetId:packet.id}} fields={[{name:'notSentConfirmed',label:'I checked that no bank instruction was sent.',type:'checkbox'},evidence,reason]}/>:null}
     {packet.privateReview&&['processing','uncertain'].includes(packet.state)?<><FinancialAction actorId={actorId} scope={packet.id+':uncertain'} action="outcome" label="Record an uncertain outcome" revision={String(packet.revision)} input={{packetId:packet.id,outcome:'uncertain'}} fields={[evidence,reason]}/><FinancialAction actorId={actorId} scope={packet.id+':paid'} action="outcome" label={packet.amountPaisa?'Confirm actual completed transfer':'Confirm original credit restoration'} revision={String(packet.revision)} input={{packetId:packet.id,outcome:'paid',amountPaisa:packet.amountPaisa}} fields={[...(packet.amountPaisa?[{name:'transactionIdentity',label:'Actual independent bank transaction identity'},{name:'bankAt',label:'Actual bank transaction time (Nepal)',type:'date' as const},{name:'completedTransferConfirmed',label:'I independently confirmed the completed debit and the exact displayed cash amount.',type:'checkbox' as const},{name:'exactBeneficiaryConfirmed',label:'I matched the completed transfer to this packet’s exact retained beneficiary.',type:'checkbox' as const}]:[{name:'creditRestorationConfirmed',label:'Restore only the original recorded wallet credit.',type:'checkbox' as const}]),evidence,reason]}/><RefundFailureReview actorId={actorId} packet={packet}/></>:null}</div>)}
    {workspace.customerRefundReversals.filter(item=>item.obligationId===row.id).map(item=><div key={item.id}><output className="block" aria-live="polite">Actual bank return {money(item.amountPaisa)} recorded {date(item.createdAt)}. {item.dispositionKind==='retain'?'Original obligation retained; its returned cash has a separate customer reissue.':item.dispositionKind==='restore'?'Original seller responsibility corrected with retained restoration history.':'Continuing obligation awaits explicit Finance disposition; seller collection is paused.'}</output>{item.retryObligationId?<Link className="mr-3 underline" href={withAdminReturnTo("/admin/payments/refunds?obligation="+encodeURIComponent(item.retryObligationId),currentHref)}>Open linked continuing refund</Link>:null}<FinancialOutcomeRecovery actorId={actorId} action="customer_reversal" scope={item.packetId+':return:'+item.receiptId}/></div>)}
    {workspace.superAdmin&&row.sourceKind==='return_refund'?packets.filter(packet=>packet.state==='paid'&&packet.amountPaisa>0).map(packet=><section key={packet.id+':return'} className="space-y-3 rounded border p-3"><h4 className="font-semibold">Actual bank return of this paid customer refund</h4><p>Keep the original paid packet and its original charge. Match a separate actual returned bank credit to the original customer and company account before recording it.</p>{workspace.returnedCredits.filter(receipt=>receipt.packetId===packet.id).map(receipt=><FinancialAction key={receipt.id} actorId={actorId} scope={packet.id+':return:'+receipt.id} action="customer_reversal" label={'Record returned customer credit '+money(receipt.amountPaisa)+' · '+receipt.label} revision={String(packet.revision)} input={{packetId:packet.id,receiptId:receipt.id,receiptRevision:receipt.revision,amountPaisa:receipt.amountPaisa}} fields={[{name:'actualReversalConfirmed',label:'I matched this actual returned credit to the original paid customer refund, its original customer and company account.',type:'checkbox'},evidence,reason]}/>)}{!workspace.returnedCredits.some(receipt=>receipt.packetId===packet.id)?<p>No unused verified returned credit matches this packet. Verify the actual credit in Incoming payments first.</p>:null}<Link href={withAdminReturnTo("/admin/payments/recoveries",currentHref)} className="underline">Review continuing seller responsibility and disposition</Link></section>):null}
   </article>;
  })}{workspace.pages.obligations.nextCursor?<Link rel="next" className="inline-block underline" href={pageHref({cursor:workspace.pages.obligations.nextCursor})}>Next refund obligations</Link>:null}</section><p className="text-sm text-muted-foreground">Each queue shows up to {workspace.pages.limit} records per page, with continuing obligations first. Use the next-page links or an original reference to find older records. Customer refunds do not wait for seller recovery.</p></div>;
}

