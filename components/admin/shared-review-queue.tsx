'use client';
import Link from 'next/link';
import {usePathname,useRouter,useSearchParams} from 'next/navigation';
import {useEffect,useLayoutEffect,useRef,useState,useSyncExternalStore} from 'react';
import type {ReviewQueueTask,NativeReviewTask} from '@/lib/admin/review-queue-view';
import {reviewTaskHref as taskHref} from '@/lib/admin/review-task-links';
import {withAdminReturnTo} from '@/lib/admin/return-context';
import {RecordedDateRangeFields} from '@/components/admin/recorded-date-range-fields';
import {reviewTitle,reviewHasAssignment,reviewHasNextUpdate,filterReviewQueue,readReviewQueueFilters,reviewDepartments,reviewDueAt,reviewPriority,reviewQueueParams,reviewTaskLabels as names,reviewTaskOpen,reviewViews,selectedReviewView,type ReviewQueueFilters} from '@/lib/admin/review-queue-view';
type Task=ReviewQueueTask;
const filterChanged='hastabazaar:review-queue-filters';
const subscribeFilters=(changed:()=>void)=>{window.addEventListener('popstate',changed);window.addEventListener(filterChanged,changed);return()=>{window.removeEventListener('popstate',changed);window.removeEventListener(filterChanged,changed);};};
const currentSearch=()=>window.location.search.slice(1);
const queueTime=new Intl.DateTimeFormat('en-NP',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Kathmandu'});
const sellerDate=(value:number)=>queueTime.format(new Date(value));
function Ownership({task,actorId}:{task:NativeReviewTask;actorId:string}){
 const router=useRouter(),[reason,setReason]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[hasPending,setHasPending]=useState(false);
 const pending=useRef<null|{taskId:string;ownerId:string|null;expectedRevision:string;requestId:string;reason:string}>(null);
 const mounted=useRef(true),inFlight=useRef(false),uncertain=useRef(false);
 useLayoutEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 async function assign(ownerId:string|null){
  if(inFlight.current)return;inFlight.current=true;
  if(!pending.current)uncertain.current=false;
  const command=pending.current??{taskId:task.id,ownerId,expectedRevision:String(task.revision),requestId:crypto.randomUUID(),reason};
  pending.current=command;setHasPending(true);setBusy(true);setMessage('');
  try{const response=await fetch('/api/admin/review-tasks',{method:'POST',headers:{'Content-Type':'application/json','X-Hastabazaar-Actor':actorId},body:JSON.stringify(command)});const decoded:unknown=await response.json().catch(()=>null),result=decoded&&typeof decoded==='object'&&!Array.isArray(decoded)?decoded as Record<string,unknown>:null;
   if(!mounted.current)return;
   if(response.status===401||response.status===403){if(!uncertain.current){pending.current=null;setHasPending(false);}setReason('');setMessage('Current task access changed. Refreshing the permitted workspace.');router.refresh();return;}
   if(!response.ok){if(response.status>=500)uncertain.current=true;if(!uncertain.current){pending.current=null;setHasPending(false);}throw new Error(typeof result?.error==='string'?result.error:'Assignment could not be confirmed. Retry the same request.');}
   if(response.status!==200||result?.ok!==true){uncertain.current=true;throw new Error('Assignment could not be confirmed. Retry the same request.');}
   pending.current=null;setHasPending(false);uncertain.current=false;
   setReason('');setMessage('Assignment saved.');router.refresh();
  }catch(error){if(mounted.current){if(pending.current)uncertain.current=true;setMessage(error instanceof Error?error.message:'Assignment could not be confirmed. Retry the same request.');}}finally{inFlight.current=false;if(mounted.current)setBusy(false);}
 }
 return <details><summary className="cursor-pointer text-sm underline">Manage ownership</summary><div className="mt-3 space-y-2"><label className="block text-sm">Assignment reason<input className="mt-1 block w-full rounded border p-2" value={reason} onChange={event=>setReason(event.target.value)} maxLength={1000} disabled={busy||hasPending}/></label>
 {hasPending?<button disabled={busy} onClick={()=>{if(pending.current)void assign(pending.current.ownerId);}} className="rounded border px-3 py-2">Retry the same assignment</button>:<div className="flex gap-2"><button disabled={busy||reason.trim().length<10} onClick={()=>void assign(actorId)} className="rounded border px-3 py-2">Take ownership</button>{task.ownerId?<button disabled={busy||reason.trim().length<10} onClick={()=>void assign(null)} className="rounded border px-3 py-2">Release assignment</button>:null}</div>}
 {message?<output className="block">{message}</output>:null}<p className="text-xs text-muted-foreground">Assignment preserves the original case age. It does not approve evidence or grant decision authority.</p></div></details>;
}
type ReviewQueueProps={tasks:readonly Task[];actorId:string;unavailable?:boolean;observedAt?:number;partialSources?:readonly string[];sellerDirectoryAvailable?:boolean};
export function SharedReviewQueue(props:ReviewQueueProps){
 return <ReviewQueue key={props.actorId} {...props}/>;
}
function ReviewQueue({tasks,actorId,unavailable=false,observedAt:providedObservedAt,partialSources=[],sellerDirectoryAvailable=false}:ReviewQueueProps){
 const pathname=usePathname(),routeParams=useSearchParams(),query=useSyncExternalStore(subscribeFilters,currentSearch,()=>routeParams.toString()),params=new URLSearchParams(query),filters=readReviewQueueFilters(params);
 const [mountedAt]=useState(()=>Date.now()),observedAt=providedObservedAt??mountedAt;
 const active=tasks.filter(reviewTaskOpen),matching=filterReviewQueue(tasks,actorId,filters,observedAt),pageCount=Math.max(1,Math.ceil(matching.length/20)),currentPage=Math.min(filters.page,pageCount);
 const view=selectedReviewView(filters),search=filters.query.trim();
 const otherMatches=search&&view!=='all'&&!matching.length?filterReviewQueue(tasks,actorId,{...filters,view:'all'},observedAt).length:0;
 const currentParams=reviewQueueParams(new URLSearchParams(params.toString()),{...filters,page:currentPage}),returnTo=`${pathname}?${currentParams}`,positionKey=`hb.review-position:${actorId}:${pathname}`;
 const currentContext=useRef(returnTo);
 useLayoutEffect(()=>{currentContext.current=returnTo;},[returnTo]);

 useEffect(()=>{
  try{const raw=sessionStorage.getItem(positionKey);if(!raw)return;const saved=JSON.parse(raw)as{url?:string;y?:number;taskId?:string};if(saved.url!==currentContext.current||typeof saved.y!=='number'||!Number.isFinite(saved.y))return;sessionStorage.removeItem(positionKey);
   const frame=requestAnimationFrame(()=>{const row=typeof saved.taskId==='string'?document.getElementById('review-task-'+saved.taskId):null;const target=row?.querySelector<HTMLElement>('[data-review-open]')??document.getElementById('shared-review-heading');target?.focus({preventScroll:true});window.scrollTo({top:Math.max(0,saved.y!),behavior:'instant'});});return()=>cancelAnimationFrame(frame);
  }catch{/* Navigation remains usable when session storage is unavailable. */}
 },[positionKey]);
 function remember(task:Task){try{sessionStorage.setItem(positionKey,JSON.stringify({url:returnTo,y:window.scrollY,taskId:task.id}));}catch{}}
 function change(patch:Partial<ReviewQueueFilters>){const next={...filters,...patch,page:patch.page??1};window.history.replaceState(null,'',`${pathname}?${reviewQueueParams(new URLSearchParams(params.toString()),next)}`);window.dispatchEvent(new Event(filterChanged));}
 const control='mt-1 block min-h-11 w-full min-w-0 rounded border bg-background p-2';
 const owners=[...new Set(tasks.flatMap(task=>task.ownerId?[task.ownerId]:[]))].sort();
 return <section id="seller-review-queue" className="min-w-0 space-y-4 rounded-2xl border bg-card p-5" aria-labelledby="shared-review-heading">
  <h2 id="shared-review-heading" tabIndex={-1} className="font-heading text-2xl">Shared review queue</h2>
  {partialSources.length?<output className="block text-sm">Incomplete source coverage: {partialSources.join("; ")}. Counts below describe only the loaded permitted records. Open the original workspace for remaining work.</output>:null}
  {unavailable?<output className="block">Review queue unavailable. No counts or readiness conclusions can be drawn from this view. Refresh to retry, or open the individual record.</output>:<>
   <p className="text-sm">{active.length} open work items in your permitted records. These represent original review tasks and Finance sources, not unique sellers. Reading a notification does not complete them.</p>
   <div className="flex flex-wrap gap-2">{reviewViews.map(([value,label])=><button key={value} aria-pressed={view===value} onClick={()=>change({view:value})} className="min-h-11 rounded-full border px-4 focus-visible:outline-2 focus-visible:outline-primary aria-pressed:bg-muted">{label}</button>)}</div>
   <label className="block text-sm">Find a seller, order, record or review type<input id="review-search" value={filters.query} maxLength={200} onChange={event=>change({query:event.target.value})} className={control}/></label>
   {sellerDirectoryAvailable&&search?<a className="section-link inline-flex min-h-11 items-center text-sm" href={`/admin/sellers?${new URLSearchParams({workspace:'directory', q:search})}#seller-directory`}>Search seller directory →</a>:null}
   <p className="text-xs text-muted-foreground">Only an agreed current staff target can be overdue.</p>
   <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
    <label className="min-w-0 text-sm">Department<select value={filters.department} onChange={event=>change({department:event.target.value})} className={control}><option value="all">All permitted departments</option>{reviewDepartments.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
    <label className="min-w-0 text-sm">Type<select value={filters.type} onChange={event=>change({type:event.target.value})} className={control}><option value="all">All permitted types</option>{Object.entries(names).filter(([type])=>tasks.some(task=>task.sourceType===type)).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
    <label className="min-w-0 text-sm">Owner<select value={filters.owner} onChange={event=>change({owner:event.target.value})} className={control}><option value="all">All owners</option><option value="me">Assigned to me</option><option value="unassigned">Unassigned</option>{owners.filter(owner=>owner!==actorId).map(owner=><option key={owner} value={owner}>{owner}</option>)}</select></label>
    <label className="min-w-0 text-sm">Priority<select value={filters.priority} onChange={event=>change({priority:event.target.value})} className={control}><option value="all">All priorities</option><option value="urgent">Urgent</option><option value="overdue">Overdue staff action</option><option value="recorded">Recorded priority review</option><option value="routine">Routine or waiting</option></select></label>
   </div>
   <RecordedDateRangeFields
    idPrefix="review"
    from={filters.from}
    to={filters.to}
    initialCalendar="ad"
    fromField={{label:'Opened from'}}
    toField={{label:'Opened through'}}
    emptyDateHelp="No date limit for this field."
    onDateChange={(bound,value)=>{
     if(value!==filters[bound])change({[bound]:value});
    }}
   />
   <output className="block text-sm">{matching.length} matching tasks · Page {currentPage} of {pageCount}</output>
   {matching.length?<ul className="grid min-w-0 gap-3 lg:grid-cols-2">{matching.slice((currentPage-1)*20,currentPage*20).map(task=>{
    const priority=reviewPriority(task,observedAt),due=reviewDueAt(task),back=`${returnTo}#review-task-${encodeURIComponent(task.id)}`;
    return <li key={task.id} id={'review-task-'+task.id} className="min-w-0 space-y-2 rounded-xl border p-4 [overflow-wrap:anywhere]">
     <p className="text-xs font-semibold">{priority.label}</p><h3 className="font-semibold">{names[task.sourceType]} · {reviewTitle(task)}</h3>
     <p className="text-sm">{task.status.replaceAll('_',' ')} · {task.sourceStatus.replaceAll('_',' ')} · Next: {task.nextActor==='You'?'Seller':task.nextActor}</p>
     <p className="text-sm">Opened {sellerDate(task.startedAt)} · {due===null?'No current agreed response deadline':`${reviewHasNextUpdate(task)?'Recorded next update':'Original response target'} ${sellerDate(due)}`}</p>
     <p className="text-sm">{!reviewHasAssignment(task)?'Responsibility follows the original Finance workflow':task.ownerId===actorId?'Assigned to you':task.ownerId?`Assigned reviewer: ${task.ownerId}`:'Unassigned — ownership needed'}</p>
     <Link data-review-open className="section-link inline-flex min-h-11 items-center" href={taskHref(task,back)} onClick={()=>remember(task)}>Open review →</Link>{' '}
     {!('finance'in task)?<Link className="section-link inline-flex min-h-11 items-center" href={withAdminReturnTo('/admin/review-tasks/'+encodeURIComponent(task.id)+'/history',back)} onClick={()=>remember(task)}>Assignment history</Link>:null}
     {!('finance'in task)&&reviewTaskOpen(task)&&task.sourceType!=='product_priority'&&!task.assignmentLocked?<Ownership key={`${actorId}:${task.id}`} task={task} actorId={actorId}/>:null}
    </li>;
   })}</ul>:<div className="space-y-1"><p>No matching tasks in this permitted view.</p>
    {otherMatches>0?<button type="button" className="section-link min-h-11 text-left" onClick={()=>change({view:'all'})}>{`Show ${otherMatches} ${otherMatches===1?'match':'matches'} in All records`}</button>:null}
   </div>}
   {pageCount>1?<div className="flex gap-3"><button className="min-h-11 rounded border px-4 py-2" disabled={currentPage===1} onClick={()=>change({page:currentPage-1})}>Previous</button><button className="min-h-11 rounded border px-4 py-2" disabled={currentPage===pageCount} onClick={()=>change({page:currentPage+1})}>Next</button></div>:null}
  </>}
 </section>;
}
