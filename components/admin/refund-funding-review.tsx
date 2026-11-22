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
import {RefundQueueRow,RefundRecoveryHeader,refundColumns,refundLink,refundPanel} from './refund-recovery-layout';
import {RefundReviewSummary,refundDate as date,refundDestination,refundMoney as money,refundReason,refundStatus} from './refund-review-summary';
type Field={name:string;label:string;type?:'text'|'textarea'|'checkbox'|'money'|'date'|'select';options?:{value:string;label:string}[];group?:'trigger'};
type FinancialActionProps={id?:string;actorId:string;scope:string;action:string;label:string;revision:string|null;input:Record<string,unknown>;fields?:Field[];onRecorded?:(id:string)=>void};
export type RefundFinanceQuery={case?:string;obligation?:string;returnLoss?:string;returnSatisfaction?:string;search?:string;cursor?:string;sourceCursor?:string;pageSize?:string};
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
export function FinancialAction({id,actorId,scope,action,label,revision,input,fields=[],onRecorded}:FinancialActionProps){
 return <FinancialActionScope id={id} key={JSON.stringify([actorId,scope,action])} actorId={actorId} scope={scope} action={action} label={label} revision={revision} input={input} fields={fields} onRecorded={onRecorded}/>;
}
function FinancialActionScope({id,actorId,scope,action,label,revision,input,fields=[],onRecorded}:FinancialActionProps){
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
 return <details id={id} className="min-w-0 scroll-mt-20 rounded-lg border border-[#E4DACA] px-3"><summary className="min-h-11 cursor-pointer py-2.5 font-medium">{label}</summary>{command.saved?<div className="my-3 flex flex-wrap gap-3 [&_button]:min-h-11"><button disabled={command.busy} onClick={()=>void command.recover()}>Check saved outcome</button>{command.canRetry?<button disabled={command.busy} onClick={()=>void command.retry()}>Retry unchanged action</button>:null}{command.unrecorded?<button disabled={command.busy} onClick={command.restart}>Start a new reviewed attempt</button>:null}</div>:null}<form ref={ref} data-form-id="system.refund-finance" aria-label={label} onSubmit={submit}><fieldset disabled={command.busy||command.saved} className="my-3 grid min-w-0 gap-3">{fields.map(field=><label key={field.name} className="block">{field.label}{field.type==='checkbox'?<input name={field.name} type="checkbox" required className="ml-2"/>:field.type==='select'?<select name={field.name} required className="block min-h-11 w-full rounded border p-2"><option value="">Choose a verified record</option>{field.options?.map(option=><option key={option.value} value={option.value}>{option.label}</option>)}</select>:field.type==='textarea'?<textarea name={field.name} required minLength={10} maxLength={1500} className="block min-h-11 w-full rounded border p-2"/>:<input name={field.name} required type={field.type==='date'?'datetime-local':'text'} inputMode={field.type==='money'?'decimal':undefined} step={field.type==='date'?1:undefined} className="block min-h-11 w-full rounded border p-2"/>}</label>)}<button className="min-h-11 rounded-lg bg-[#14213D] px-3 py-2 font-semibold text-white">{label}</button></fieldset></form>{command.message?<output className="mt-2 block" aria-live="polite">{command.message}</output>:null}</details>;
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
export function RefundFundingReview({workspace,actorId,query={},returnTo,canReviewRecoveries=false,canOpenOrder=false,canVerifyIncoming=false,canManageRefunds=true}:{
 workspace:Awaited<ReturnType<typeof getRefundFinanceWorkspace>>;
 actorId:string;
 query?:RefundFinanceQuery;
 returnTo?:string;
 canManageRefunds?:boolean;
 canReviewRecoveries?:boolean;
 canOpenOrder?:boolean;
 canVerifyIncoming?:boolean;
}){
 const router=useRouter(),params=new URLSearchParams();
 for(const key of ['case','obligation','returnLoss','returnSatisfaction','search','cursor','sourceCursor','pageSize'] as const)if(query[key])params.set(key,query[key]!);
 const currentHref=withAdminReturnTo('/admin/payments/refunds'+(params.size?'?'+params.toString():''),returnTo);
 function pageHref(change:Partial<Record<'cursor'|'sourceCursor',string|null>>){const next=new URLSearchParams(params);for(const [key,value]of Object.entries(change))if(value)next.set(key,value);else next.delete(key);return withAdminReturnTo('/admin/payments/refunds'+(next.size?'?'+next.toString():''),returnTo);}
 function opened(id:string){router.push(withAdminReturnTo('/admin/payments/refunds?obligation='+encodeURIComponent(id),currentHref));}
 const selected = workspace.obligations[0];
 const exact = Boolean(query.obligation || query.returnLoss || query.returnSatisfaction);
 return <div className="space-y-5 text-[#14213D]">
  <RefundRecoveryHeader view="refunds" returnTo={returnTo}
   otherHref={canReviewRecoveries?withAdminReturnTo('/admin/payments/recoveries',returnTo):undefined}/>
  <div className={selected?refundColumns:undefined}>
   <section className={refundPanel} aria-labelledby="refund-queue-title">
    <div className="px-4 py-3.5">
     <h2 id="refund-queue-title" className="font-semibold">Refunds to customers</h2>
     <p className="mt-1 text-sm text-[#46536F]">Review approved returns, cancellations and other authorized payments to customers.</p>
    </div>
    {workspace.obligations.length ? <ul>
     {workspace.obligations.map(row => {
      const destination=workspace.destinations.find(item=>item.obligationId===row.id&&item.current);
      const href=withAdminReturnTo('/admin/payments/refunds?obligation='+encodeURIComponent(row.id),currentHref);
      return <RefundQueueRow key={row.id} id={row.id===selected?.id?undefined:'refund-obligation-'+row.id}
       reference={row.orderNumber??row.id} title={refundReason(row.sourceKind)+' · '+row.customerName}
       description={refundDestination(row,destination)} amount={money(row.originalCashPaisa+row.walletPaisa)}
       status={refundStatus(row)} href={exact?'#refund-obligation-'+row.id:href} selected={row.id===selected?.id}
       linkLabel={!exact&&workspace.obligations.length===1?'Open exact original obligation':undefined}/>;
     })}
    </ul> : <p className="border-t border-[#E4DACA] px-4 py-4 text-sm text-[#46536F]">No refund obligations in this view.</p>}
    {workspace.pages.obligations.nextCursor?<Link rel="next" className={refundLink+' m-2'} href={pageHref({cursor:workspace.pages.obligations.nextCursor})}>Next refund obligations</Link>:null}
   </section>
   {selected ? <section id={'refund-obligation-'+selected.id} aria-label="Refund details" className={refundPanel+' scroll-mt-20 space-y-4 p-4 sm:p-5'}>
    <RefundReviewSummary row={selected} destinations={workspace.destinations.filter(item=>item.obligationId===selected.id)}
     live={workspace.packets.find(item=>item.obligationId===selected.id&&!['failed','void'].includes(item.state))}
     funding={workspace.funding} canOpenOrder={canOpenOrder} superAdmin={workspace.superAdmin} canManageRefunds={canManageRefunds} currentHref={currentHref}/>
   </section> : null}
  </div>
  <section className={refundPanel+' space-y-4 p-4 sm:p-5'}>
   <div>
    <h2 className="font-heading text-xl font-semibold">Refunds &amp; funding</h2>
    <p className="mt-1 text-sm text-[#46536F]">Find the original payment and review its destination, funding and outcome.{canManageRefunds ? ' Send approved manual bank transfers through the bank.' : null}</p>
   </div>
   <form data-form-id="staff.refund-funding-filter" method="get" className="flex min-w-0 flex-wrap items-end gap-3">
    {(['case','obligation','returnLoss','returnSatisfaction'] as const).map(key=>query[key]?<input key={key} type="hidden" name={key} value={query[key]}/>:null)}
    <input type="hidden" name="returnTo" value={safeAdminReturnTo(returnTo)}/>
    <label className="min-w-0 flex-[1_1_16rem] text-sm font-medium">Find an original order, bank transaction or source reference
     <input name="search" maxLength={160} defaultValue={workspace.pages.search} className="mt-1 block min-h-11 w-full rounded-lg border border-[#D3C5AD] px-3"/>
    </label>
    <label className="text-sm font-medium">Records per queue page
     <input name="pageSize" type="number" min={1} max={100} defaultValue={workspace.pages.limit} className="mt-1 block min-h-11 w-24 rounded-lg border border-[#D3C5AD] px-3"/>
    </label>
    <button className="min-h-11 rounded-lg border border-[#D3C5AD] px-3 py-2 text-sm font-semibold">Search original references</button>
    {query.cursor||query.sourceCursor?<Link className={refundLink+' text-sm'} href={pageHref({cursor:null,sourceCursor:null})}>First page</Link>:null}
   </form>
   {canVerifyIncoming?<Link className={refundLink+' text-sm'} href={withAdminReturnTo('/admin/payments?view=incoming',currentHref)}>Incoming payments and owned Finance exceptions</Link>:null}
  </section>
  <section className={refundPanel+' space-y-3 p-4 sm:p-5'}><h2 className="font-heading text-xl font-semibold">Authorized sources awaiting Finance</h2>{workspace.sources.length?workspace.sources.map(source=><article id={"refund-source-"+source.sourceId} key={source.kind+source.sourceId} className="rounded border p-4"><p>{source.label} · {refundReason(source.kind)} · Cash {money(source.cashPaisa)}</p>{canManageRefunds?<FinancialAction actorId={actorId} scope={source.sourceId} action="open" label="Open original refund obligation" onRecorded={opened} revision={null} input={{kind:source.kind,sourceId:source.sourceId}} fields={[reason]}/>:null}</article>):<p>No additional authorized sources in this view.</p>}{workspace.pages.sources.nextCursor?<Link rel="next" className={refundLink} href={pageHref({sourceCursor:workspace.pages.sources.nextCursor})}>Next authorized sources</Link>:null}</section>
  <details id="refund-company-funding" className={refundPanel+' scroll-mt-20 px-4 sm:px-5'}><summary className="min-h-11 cursor-pointer py-3 font-semibold">Company funding evidence</summary><section className="space-y-3 pb-4">{!workspace.funding.length?<p className="text-sm text-[#46536F]">No verified company funding account is available.</p>:null}{workspace.funding.map(account=><article key={account.versionId} className="rounded border p-4"><p>{account.label} · {account.availablePaisa===null?'Available funds need verification':money(account.availablePaisa)+' available after recorded restrictions and reservations'}{account.asOf!==null?' · Statement as of '+date(account.asOf):''}</p>{workspace.superAdmin?<FinanceEvidenceUpload actorId={actorId} mode="staff" scope={{kind:'company_account',id:account.versionId}}/>:null}{workspace.superAdmin?<FinancialAction actorId={actorId} scope={account.versionId} action="verify_funding" label="Verify actual company funds" revision={account.revision===null?null:String(account.revision)} input={{accountVersionId:account.versionId}} fields={[{name:'statementIdentity',label:'Unique actual bank statement identity'},{name:'asOf',label:'Actual statement time (Nepal)',type:'date'},{name:'cashPaisa',label:'Actual bank cash balance (NPR)',type:'money'},{name:'restrictedPaisa',label:'Customer, seller and unrelated restricted money (NPR)',type:'money'},evidence,{name:'restrictionsReference',label:'Restricted-money reconciliation reference'},{name:'availableFundsConfirmed',label:'I verified actual available company funds and excluded money belonging to others.',type:'checkbox'},reason]}/>:null}</article>)}</section></details>
  {selected ? <section className={refundPanel+' space-y-4 p-4 sm:p-5'}><h2 className="font-heading text-xl font-semibold">Original refund record</h2>{[selected].map(row=>{
   const destinations=workspace.destinations.filter(item=>item.obligationId===row.id),packets=workspace.packets.filter(item=>item.obligationId===row.id),live=packets.find(item=>!['failed','void'].includes(item.state));
   const delayReason=refundDelayReason(row.state,row.cashPaisa,destinations.find(item=>item.current)?.status,live);
   const canReviewDeadline=canManageRefunds&&row.independentReviewer&&row.deadlineRevision!==null&&(row.state!=='completed'||
    workspace.customerRefundReversals.some(item=>item.obligationId===row.id));
   return <article key={row.id} className="space-y-3 break-words [&_summary]:min-h-11 [&_summary]:py-2.5 [&_a]:min-h-11"><h3 className="text-lg font-semibold">{row.orderNumber??'Identified payer receipt'} · {row.customerName}</h3><p className="break-all text-sm text-[#46536F]">Refund reference {row.id}</p><p>Cash {money(row.cashPaisa)} · Original wallet credit {money(row.walletPaisa)}{row.alreadyRestoredWalletPaisa>0?` · Wallet credit already restored by cancellation ${money(row.alreadyRestoredWalletPaisa)}`:''} · {row.state}</p>{row.bankSatisfiedPaisa>0?<p>Originally authorized cash: {money(row.originalCashPaisa)}. The bank already returned {money(row.bankSatisfiedPaisa)} directly to the original payer; this is excluded from the separate cash transfer above.</p>:null}{canManageRefunds?<FinancialOutcomeRecovery actorId={actorId} action="open" scope={row.sourceId}/>:null}<p>Owner: {row.ownerName}. Authorized {date(row.authorizedAt)} · First Finance target {date(row.firstFinanceDueAt)}{row.state!=='completed'?' · Next update '+date(row.nextUpdateAt):''}</p>
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
    {canManageRefunds&&row.independentReviewer&&delayReason?<FinancialAction actorId={actorId} scope={row.id+':delay'} action="record_delay"
     label={'Send refund update · '+delayLabels[delayReason]} revision={String(row.revision)}
     input={{obligationId:row.id,reasonCode:delayReason}} fields={[{name:'nextUpdateAt',label:'Next update time (Nepal)',type:'date'},reason]}/>:null}
    {workspace.superAdmin&&row.independentReviewer?<FinanceEvidenceUpload actorId={actorId} mode="staff" scope={{kind:'obligation',id:row.id}}/>:null}
    {destinations.map(destination=><div key={destination.id} className="rounded border p-3"><p>{destination.label} · {destination.status}{destination.current?' · Current':' · Retained prior version'}</p>{destination.privateReview?<details><summary>Restricted beneficiary verification</summary><p>Holder: {destination.privateReview.details.holder} · Bank: {destination.privateReview.details.bank} · Branch: {destination.privateReview.details.branch} · Account: {destination.privateReview.details.accountNumber}</p><p>Customer authorization: {destination.privateReview.authorization}</p><p>Evidence: {destination.privateReview.evidenceReference}</p>{destination.privateReview.evidenceReference.startsWith('fin-file-')?<a className="underline" target="_blank" rel="noreferrer" href={'/api/admin/finance-evidence?file='+encodeURIComponent(destination.privateReview.evidenceReference)}>Read restricted ownership evidence</a>:null}</details>:null}{workspace.superAdmin&&destination.current&&destination.status==='submitted'?<FinancialAction actorId={actorId} id={'refund-action-'+destination.id+'-verify'} scope={destination.id} action="verify_destination" label="Verify exact beneficiary" revision={String(destination.revision)} input={{versionId:destination.id}} fields={[{name:'ownershipConfirmed',label:'I independently verified the named account holder against appropriate evidence.',type:'checkbox'},{name:'relationshipConfirmed',label:'I verified the original payer or the authenticated customer’s specific authorized relationship.',type:'checkbox'},{name:'verificationReference',label:'Independent verification record'},reason]}/>:null}</div>)}
    {canManageRefunds&&!live&&row.state==='open'?<FinancialAction actorId={actorId} id={'refund-action-'+row.id+'-prepare'} scope={row.id} action="prepare" label={row.cashPaisa?'Prepare exact refund packet':'Prepare original credit restoration'} revision={String(row.revision)} input={{obligationId:row.id,...row.cashPaisa===0?{destinationVersionId:null,fundingStatementId:null}:{}}} fields={[...(row.cashPaisa?[{name:'destinationVersionId',label:'Current verified destination',type:'select' as const,options:destinations.filter(d=>d.current&&d.status==='verified').map(d=>({value:d.id,label:d.label}))},{name:'fundingStatementId',label:'Verified company funding source',type:'select' as const,options:workspace.funding.filter(f=>f.statementId).map(f=>({value:f.statementId!,label:f.label+' · '+(f.availablePaisa===null?'Funds need verification':money(f.availablePaisa))}))}]:[]),reason]}/>:null}
    {packets.map(packet=><div key={packet.id} className="space-y-2 rounded border p-3"><p>{packet.route==='manual_bank'?'Manual bank transfer':'Original credit restoration'} · {packet.state==='processing'&&packet.privateReview?.submission?'Submitted':packet.state} · Cash {money(packet.amountPaisa)} · Prepared {date(packet.preparedAt)}</p>
     <RefundPacketHistory packet={packet}/>
     {packet.privateReview&&!packet.privateReview.submission&&['processing','uncertain'].includes(packet.state)&&packet.amountPaisa>0
       ?<FinancialAction actorId={actorId} id={'refund-action-'+packet.id+'-submission'} scope={packet.id+':submission'} action="record_submission"
         label="Record bank acknowledgment" revision={String(packet.revision)} input={{packetId:packet.id}}
         fields={[
           {name:'acknowledgedAt',label:'Actual bank acknowledgment time (Nepal)',type:'date'},
           {name:'evidenceReference',label:'Retained private bank acknowledgment file reference'},
           {name:'actualAcknowledgmentConfirmed',label:'I verified that the bank accepted this exact instruction.',type:'checkbox'},
           reason,
         ]}/>:null}{workspace.superAdmin&&packet.state==='prepared'?<FinancialAction actorId={actorId} id={'refund-action-'+packet.id+'-approve'} scope={packet.id} action="approve" label="Approve exact amount and source" revision={String(packet.revision)} input={{packetId:packet.id}} fields={[reason]}/>:null}{workspace.superAdmin&&packet.state==='approved'?<FinancialAction actorId={actorId} id={'refund-action-'+packet.id+'-start'} scope={packet.id} action="start" label={packet.amountPaisa?'Begin one manual instruction':'Begin original credit restoration'} revision={String(packet.revision)} input={{packetId:packet.id}} fields={[reason]}/>:null}{workspace.superAdmin&&['prepared','approved'].includes(packet.state)?<FinancialAction actorId={actorId} scope={packet.id} action="void" label="Retire a provably unsent packet" revision={String(packet.revision)} input={{packetId:packet.id}} fields={[{name:'notSentConfirmed',label:'I checked that no bank instruction was sent.',type:'checkbox'},evidence,reason]}/>:null}
     {packet.privateReview&&['processing','uncertain'].includes(packet.state)?<div id={'refund-action-'+packet.id+'-outcomes'} tabIndex={-1} className="scroll-mt-20 space-y-2"><FinancialAction actorId={actorId} scope={packet.id+':uncertain'} action="outcome" label="Record an uncertain outcome" revision={String(packet.revision)} input={{packetId:packet.id,outcome:'uncertain'}} fields={[evidence,reason]}/><FinancialAction actorId={actorId} id={'refund-action-'+packet.id+'-paid'} scope={packet.id+':paid'} action="outcome" label={packet.amountPaisa?'Confirm actual completed transfer':'Confirm original credit restoration'} revision={String(packet.revision)} input={{packetId:packet.id,outcome:'paid',amountPaisa:packet.amountPaisa}} fields={[...(packet.amountPaisa?[{name:'transactionIdentity',label:'Actual independent bank transaction identity'},{name:'bankAt',label:'Actual bank transaction time (Nepal)',type:'date' as const},{name:'completedTransferConfirmed',label:'I independently confirmed the completed debit and the exact displayed cash amount.',type:'checkbox' as const},{name:'exactBeneficiaryConfirmed',label:'I matched the completed transfer to this packet’s exact retained beneficiary.',type:'checkbox' as const}]:[{name:'creditRestorationConfirmed',label:'Restore only the original recorded wallet credit.',type:'checkbox' as const}]),evidence,reason]}/><RefundFailureReview actorId={actorId} packet={packet}/></div>:null}</div>)}
    {workspace.customerRefundReversals.filter(item=>item.obligationId===row.id).map(item=><div key={item.id}><output className="block" aria-live="polite">Actual bank return {money(item.amountPaisa)} recorded {date(item.createdAt)}. {item.dispositionKind==='retain'?'Original obligation retained; its returned cash has a separate customer reissue.':item.dispositionKind==='restore'?'Original seller responsibility corrected with retained restoration history.':'Continuing obligation awaits explicit Finance disposition; seller collection is paused.'}</output>{item.retryObligationId?<Link className="mr-3 underline" href={withAdminReturnTo("/admin/payments/refunds?obligation="+encodeURIComponent(item.retryObligationId),currentHref)}>Open linked continuing refund</Link>:null}{canManageRefunds?<FinancialOutcomeRecovery actorId={actorId} action="customer_reversal" scope={item.packetId+':return:'+item.receiptId}/>:null}</div>)}
    {workspace.superAdmin&&row.sourceKind==='return_refund'?packets.filter(packet=>packet.state==='paid'&&packet.amountPaisa>0).map(packet=><section key={packet.id+':return'} className="space-y-3 rounded border p-3"><h4 className="font-semibold">Actual bank return of this paid customer refund</h4><p>Keep the original paid packet and its original charge. Match a separate actual returned bank credit to the original customer and company account before recording it.</p>{workspace.returnedCredits.filter(receipt=>receipt.packetId===packet.id).map(receipt=><FinancialAction key={receipt.id} actorId={actorId} scope={packet.id+':return:'+receipt.id} action="customer_reversal" label={'Record returned customer credit '+money(receipt.amountPaisa)+' · '+receipt.label} revision={String(packet.revision)} input={{packetId:packet.id,receiptId:receipt.id,receiptRevision:receipt.revision,amountPaisa:receipt.amountPaisa}} fields={[{name:'actualReversalConfirmed',label:'I matched this actual returned credit to the original paid customer refund, its original customer and company account.',type:'checkbox'},evidence,reason]}/>)}{!workspace.returnedCredits.some(receipt=>receipt.packetId===packet.id)?<p>No unused verified returned credit matches this packet. Verify the actual credit in Incoming payments first.</p>:null}{canReviewRecoveries?<Link href={withAdminReturnTo("/admin/payments/recoveries",currentHref)} className={refundLink}>Review continuing seller responsibility and disposition</Link>:null}</section>):null}
   </article>;
  })}</section> : null}
  <p className="text-sm text-[#46536F]">Each queue shows up to {workspace.pages.limit} records per page, with continuing obligations first. Older records are available through search and pagination. Customer refunds proceed independently of seller recovery.</p>
 </div>;
}
