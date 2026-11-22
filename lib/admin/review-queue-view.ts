import type {listReviewTasks} from '../workflows/review-tasks';
import type {FinanceWorkItem} from './finance-work-items';

export type NativeReviewTask=Awaited<ReturnType<typeof listReviewTasks>>[number];
/** Finance keeps its native source identity and controls; it never acquires a review-task revision. */
export function financeQueueItem(finance:FinanceWorkItem){return {finance,id:`finance:${finance.family}:${encodeURIComponent(finance.sourceKind)}:${encodeURIComponent(finance.id)}`,sourceType:finance.family,sourceId:finance.id,startedAt:finance.startedAt,dueAt:finance.dueAt,nextUpdateAt:finance.nextUpdateAt,ownerId:finance.ownerId,status:finance.completed?'completed' as const:finance.actionRequired?'awaiting_review' as const:'waiting_on_prerequisite' as const,sourceStatus:finance.status,nextActor:finance.nextActor};}
export type ReviewQueueTask=NativeReviewTask|ReturnType<typeof financeQueueItem>;
export function reviewTitle(task:ReviewQueueTask){return 'finance'in task?task.finance.title:task.recordTitle?[task.recordTitle,task.sellerName].filter(Boolean).join(' · '):task.sellerName??task.sellerId??task.sourceId;}
export function reviewHasAssignment(task:ReviewQueueTask){return !('finance'in task)||task.finance.family==='refund_obligation';}
export function reviewHasNextUpdate(task:ReviewQueueTask){return 'finance'in task?task.nextUpdateAt!==null:task.triagedAt!==null;}
export const reviewTaskLabels:Record<ReviewQueueTask['sourceType'],string>={payout_request:'Payout request',payout_candidate:'Payout preparation',payout_packet:'Payout transfer',refund_obligation:'Refund obligation',refund_source:'Authorized refund source',system_incident:'System incident',team_governance:'Team responsibility',recovery_claim:'Seller repayment claim',recovery_review:'Recovery liability or dispute',recovery_contact:'Recovery contact or response',return_request:'Return or replacement',complaint:'Customer complaint',cancellation_review:'Cancellation or delivery concern',ncm_action:'Nepal Can Move follow-up',order_response:'Order preparation follow-up',payment_claim:'Payment claim',payment_exception:'Payment exception',product_priority:'Priority product concern',product_intake_help:'Product assistance',product_intake_review:'Product candidate review',commission_terms:'Selling fee terms',company_account:'Company account ownership',seller_application:'Application',seller_document:'Identity or PAN evidence',document_change:'Document change',protected_change:'Protected identity or bank change',product_review:'Product review',public_profile:'Public profile',public_profile_correction:'Profile correction'};
export const workSummaryCategories=[['sellers','Seller & document reviews'],['products','Product reviews'],['orders','Order follow-up'],['finance','Payment & payout reviews'],['system','System issues']]as const;
export const reviewDepartments=[...workSummaryCategories,['team','Team responsibilities']]as const;
export const reviewViews=[['attention','Needs attention'],['assigned','Assigned to me'],['unassigned','Unassigned'],['waiting','Waiting'],['completed','Completed'],['all','All records']]as const;
export type ReviewQueueView=typeof reviewViews[number][0];
export type ReviewCategory=typeof reviewDepartments[number][0];
export function reviewCategory(task:ReviewQueueTask):ReviewCategory{
 if('finance'in task)return 'finance';
 if(task.sourceType==='system_incident')return 'system';
 if(task.sourceType==='team_governance')return 'team';
 if(task.sourceType.startsWith('product_'))return 'products';
 if(['return_request','complaint','cancellation_review','order_response','ncm_action'].includes(task.sourceType))return 'orders';
 if(task.sourceType.startsWith('payment_')||task.sourceType.startsWith('recovery_')||task.sourceType==='company_account')return 'finance';
 return 'sellers';
}
export function reviewTaskOpen(task:ReviewQueueTask){return ['awaiting_review','waiting_on_seller','waiting_on_customer','waiting_on_prerequisite'].includes(task.status);}
/** An answered first-response target is not an overdue follow-up. Only its recorded next update can be late. */
export function reviewDueAt(task:ReviewQueueTask){return reviewHasNextUpdate(task)?task.nextUpdateAt:task.dueAt;}
export function reviewPriority(task:ReviewQueueTask,now:number){
 const actionable=task.status==='awaiting_review',due=reviewDueAt(task);
 if(actionable&&!('finance'in task)&&task.priority&&['system_incident','payment_exception','product_priority'].includes(task.sourceType))return {rank:0,key:'urgent',label:'Urgent — recorded incident or priority concern'};
 if(actionable&&due!==null&&due<=now)return {rank:reviewCategory(task)==='orders'?1:2,key:'overdue',label:reviewHasNextUpdate(task)?'Overdue — recorded next update':'Overdue — original response target'};
 if(actionable&&!('finance'in task)&&task.priority)return {rank:3,key:'recorded',label:'Priority review — recorded by the source'};
 return {rank:actionable?4:5,key:'routine',label:actionable?'Routine — oldest submitted first':reviewTaskOpen(task)?'Waiting — next action belongs to the named party':'Recorded outcome'};
}
export interface ReviewQueueFilters{view:ReviewQueueView|undefined;query:string;department:string;type:string;owner:string;priority:string;from:string;to:string;page:number;}
function calendarDay(value:string){if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return null;const time=Date.parse(value+'T00:00:00+05:45');return Number.isFinite(time)&&new Date(time+20700000).toISOString().slice(0,10)===value?time:null;}
export function readReviewQueueFilters(params:Pick<URLSearchParams,'get'>):ReviewQueueFilters{
 const requestedView=params.get('reviewView');
 const view=reviewViews.find(([key])=>key===requestedView)?.[0],department=params.get('reviewDepartment')??'',type=params.get('reviewType')??'',priority=params.get('reviewPriority')??'',page=Number(params.get('reviewPage')),from=params.get('reviewFrom')??'',to=params.get('reviewTo')??'';
 return {view,query:(params.get('reviewQ')??'').slice(0,200),department:reviewDepartments.some(([value])=>value===department)?department:'all',type:Object.hasOwn(reviewTaskLabels,type)?type:'all',owner:params.get('reviewOwner')??'all',priority:['urgent','overdue','recorded','routine'].includes(priority)?priority:'all',from:calendarDay(from)!==null?from:'',to:calendarDay(to)!==null?to:'',page:Number.isSafeInteger(page)&&page>0?page:1};
}
export function reviewQueueParams(original:URLSearchParams,filters:ReviewQueueFilters){
 const params=new URLSearchParams(original);
 for(const [key,value]of Object.entries({reviewView:filters.view,reviewQ:filters.query,reviewDepartment:filters.department,reviewType:filters.type,reviewOwner:filters.owner,reviewPriority:filters.priority,reviewFrom:filters.from,reviewTo:filters.to,reviewPage:String(filters.page)}))if(value&&(value!=='all'||key==='reviewView'||key==='reviewQ'))params.set(key,value);else params.delete(key);
 return params;
}
export function selectedReviewView({view,query}:Pick<ReviewQueueFilters,'view'|'query'>):ReviewQueueView{
 return view??(query.trim()?'all':'attention');
}
export function filterReviewQueue(tasks:readonly ReviewQueueTask[],actorId:string,filters:ReviewQueueFilters,now:number){
 const from=calendarDay(filters.from),to=calendarDay(filters.to),query=filters.query.trim().toLowerCase(),view=selectedReviewView(filters);
 return tasks.filter(task=>{
  const open=reviewTaskOpen(task);
  if(!(view==='all'||view==='attention'&&task.status==='awaiting_review'||view==='assigned'&&open&&task.ownerId===actorId||view==='unassigned'&&open&&reviewHasAssignment(task)&&!task.ownerId||view==='waiting'&&open&&task.status!=='awaiting_review'||view==='completed'&&task.status==='completed'))return false;
  const references='finance'in task?Object.values(task.finance.origin).join(' '):`${task.sellerId??''} ${task.orderId??''}`;
  return (filters.department==='all'||reviewCategory(task)===filters.department)&&(filters.type==='all'||task.sourceType===filters.type)&&(filters.owner==='all'||filters.owner==='me'&&task.ownerId===actorId||filters.owner==='unassigned'&&reviewHasAssignment(task)&&!task.ownerId||task.ownerId===filters.owner)&&(filters.priority==='all'||reviewPriority(task,now).key===filters.priority)&&(from===null||task.startedAt>=from)&&(to===null||task.startedAt<to+86400000)&&`${reviewTitle(task)} ${references} ${task.sourceId} ${reviewTaskLabels[task.sourceType]}`.toLowerCase().includes(query);
 }).sort((a,b)=>{const ap=reviewPriority(a,now),bp=reviewPriority(b,now);return ap.rank-bp.rank||(ap.key==='overdue'&&bp.key==='overdue'?(reviewDueAt(a)??0)-(reviewDueAt(b)??0):0)||a.startedAt-b.startedAt||a.id.localeCompare(b.id);});
}
