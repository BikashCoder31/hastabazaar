import { can, type Permission, type PermissionSubject } from '../../marketplace/permissions';

export function auditDestination(type: string, id: string): string | null {
 if (!/^[a-zA-Z0-9_-]{1,160}$/.test(id)) return null;
 const queues:Record<string,string>={shipping_job:'/admin/shipping',data_rights_request:'/admin/privacy'};
 if(queues[type])return queues[type];
 if(type==='notification_queue'&&id==='order')return '/admin/order-emails';
 const roots: Record<string,string> = {order:'/admin/orders/',product:'/admin/products/',seller:'/admin/sellers/',seller_profile:'/admin/sellers/',payout:'/admin/payouts/',return_request:'/admin/cases/returns/',complaint:'/admin/cases/complaints/'};
 return roots[type] ? roots[type] + encodeURIComponent(id) : null;
}
export function auditFilters(input: Record<string,string|undefined>) {
 const clean=(key:string)=>{const value=(input[key]??'').trim();if(value.length>160)throw new Error('Filters must be at most 160 characters.');return value;};
 const day=(key:string)=>{const value=clean(key);if(!value)return undefined;if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||new Date(value+'T00:00:00Z').toISOString().slice(0,10)!==value)throw new Error('Enter a valid date.');return Date.parse(value+'T00:00:00+05:45');};
 const from=day('from'), end=day('to');if(from!==undefined&&end!==undefined&&from>end)throw new Error('The end date must be on or after the start date.');
 return {action:clean('action'),actor:clean('actor'),type:clean('type'),from,to:end===undefined?undefined:end+86400000};
}
export interface BusinessActivity {id:string; actorId:string|null; actorName:string|null; action:string; subjectType:string; subjectId:string; createdAt:number;}
export async function listBusinessActivity(db:D1Database,staff:PermissionSubject,input:Record<string,string|undefined>):Promise<BusinessActivity[]> {
 if(staff.role!=='super_admin')throw new Error('Super Admin access required.');
 const f=auditFilters(input);const where:string[]=[];const values:(string|number)[]=[];
 for(const [column,value] of [['a.action',f.action],['a.actor_id',f.actor],['a.subject_type',f.type]] as const)if(value){where.push(column+' = ?');values.push(value);}
 if(f.from!==undefined){where.push('a.created_at >= ?');values.push(f.from);}if(f.to!==undefined){where.push('a.created_at < ?');values.push(f.to);}
 const rows=await db.prepare('SELECT a.id,a.actor_id AS actorId,u.display_name AS actorName,a.action,a.subject_type AS subjectType,a.subject_id AS subjectId,a.created_at AS createdAt FROM audit_logs a LEFT JOIN users u ON u.id=a.actor_id'+(where.length?' WHERE '+where.join(' AND '):'')+' ORDER BY a.created_at DESC,a.id DESC LIMIT 100').bind(...values).all<BusinessActivity>();return rows.results;
}

/** Exact source-emitted action/type pairs. Completion means the named step was recorded, never all related settlement. */
export const recordedActionMatrix:readonly {action:string;type:string;outcome:string;permissions:readonly Permission[];completed:boolean}[]=[
 {action:'product.review.started',type:'product',outcome:'Review started',permissions:['product.review'],completed:false},
 {action:'product.changes.requested',type:'product',outcome:'Revision requested',permissions:['product.review'],completed:true},
 {action:'product.approved',type:'product',outcome:'Product approval recorded',permissions:['product.review'],completed:true},
 {action:'product.rejected',type:'product',outcome:'Product rejection recorded',permissions:['product.review'],completed:true},
 {action:'product.published',type:'product',outcome:'Publication recorded',permissions:['product.review','product.publish'],completed:true},
 {action:'seller.application.review_started',type:'seller',outcome:'Application review started',permissions:['seller.application.review'],completed:false},
 {action:'seller.application.changes_requested',type:'seller',outcome:'Application revision requested',permissions:['seller.application.review'],completed:true},
 {action:'seller.application.approved',type:'seller',outcome:'Seller approval recorded',permissions:['seller.application.review'],completed:true},
 {action:'seller.application.rejected',type:'seller',outcome:'Seller rejection recorded',permissions:['seller.application.review'],completed:true},
 {action:'complaint.admin.resolve',type:'complaint',outcome:'Complaint resolution recorded',permissions:['support.manage'],completed:true},
 {action:'complaint.admin.close',type:'complaint',outcome:'Complaint closure recorded',permissions:['support.manage'],completed:true},
 {action:'return.admin.reject',type:'return_request',outcome:'Return rejection recorded',permissions:['support.manage','refund.approve.standard'],completed:true},
 {action:'return.operations.resolve_replacement',type:'return_request',outcome:'Replacement resolution recorded',permissions:['support.manage','refund.approve.standard'],completed:true},
 {action:'return.operations.resolve_return_to_origin',type:'return_request',outcome:'Return-to-origin resolution recorded',permissions:['support.manage','refund.approve.standard'],completed:true},
 {action:'return.operations.complete_refund',type:'return_request',outcome:'Refund completion recorded',permissions:['support.manage','refund.approve.standard'],completed:true},
 {action:'payout.prepared',type:'payout',outcome:'Payout preparation recorded',permissions:['payout.prepare'],completed:true},
 {action:'payout.approve',type:'payout',outcome:'Independent payout approval recorded',permissions:['payout.prepare','payout.approve'],completed:true},
 {action:'payout.reject',type:'payout',outcome:'Payout rejection recorded',permissions:['payout.prepare','payout.approve'],completed:true},
 {action:'payout.mark_paid',type:'payout',outcome:'Payout payment recorded',permissions:['payout.prepare','payout.mark_paid'],completed:true},
 {action:'order.dispatch',type:'order',outcome:'Dispatch recorded',permissions:['order.manage'],completed:true},
 {action:'order.deliver',type:'order',outcome:'Delivery recorded',permissions:['order.manage'],completed:true},
 {action:'cancellation.review_requested',type:'order',outcome:'Production cancellation review requested',permissions:['order.manage'],completed:false},
 {action:'cancellation.review_rejected',type:'order',outcome:'Production cancellation rejected with reason',permissions:['order.manage'],completed:true},
 {action:'order.parcel_cancelled',type:'order',outcome:'Reviewed cancellation and financial adjustment recorded',permissions:['order.manage'],completed:true},
 {action:'order.cancelled',type:'order',outcome:'Order cancellation recorded',permissions:['order.manage'],completed:true},
 {action:'parcel.dispatch',type:'order',outcome:'Parcel dispatch recorded',permissions:['order.manage'],completed:true},
 {action:'parcel.deliver',type:'order',outcome:'Parcel delivery recorded',permissions:['order.manage'],completed:true},
 {action:'parcel.cancel',type:'order',outcome:'Parcel cancellation recorded',permissions:['order.manage'],completed:true},
 {action:'shipping.delivered',type:'shipping_job',outcome:'Legacy shipment delivery recorded',permissions:['order.manage'],completed:true},
 {action:'shipping.resolve_claim',type:'shipping_job',outcome:'Shipping claim resolution recorded',permissions:['order.manage'],completed:true},
 {action:'privacy.complete',type:'data_rights_request',outcome:'Privacy request completion recorded',permissions:['support.manage'],completed:true},
 {action:'privacy.reject',type:'data_rights_request',outcome:'Privacy request rejection recorded',permissions:['support.manage'],completed:true},
 {action:'exception.resolved',type:'order',outcome:'Exception follow-up resolution recorded',permissions:['order.manage'],completed:true},
];
export interface RecordedProgressGroup {actorId:string;actorName:string|null;action:string;subjectType:string;count:number;outcome:string;}
export interface RecordedProgress {from:number;to:number;groups:RecordedProgressGroup[];groupsTruncated:boolean;events:(BusinessActivity&{outcome:string;completed:boolean})[];}
export async function getRecordedProgress(db:D1Database,staff:PermissionSubject&{id:string},input:Record<string,string|undefined>,now=Date.now()):Promise<RecordedProgress>{
 if(staff.role!=='admin'&&staff.role!=='super_admin')throw new Error('Staff access required.');
 if(!can(staff,'audit_log.view'))throw new Error('Current audit permission required.');
 const filters=auditFilters(input);
 if(staff.role==='admin'&&filters.actor&&filters.actor!==staff.id)throw new Error('Admins can view only their own recorded work.');
 const today=Math.floor((now+20700000)/86400000)*86400000-20700000;
 const to=filters.to??today+86400000,from=filters.from??to-30*86400000;
 if(to<=from||to-from>366*86400000)throw new Error('Choose a date range of at most 366 days.');
 const matrix=recordedActionMatrix.filter(m=>m.permissions.every(p=>can(staff,p))&&(!filters.action||m.action===filters.action)&&(!filters.type||m.type===filters.type));
 const empty:RecordedProgress={from,to,groups:[],groupsTruncated:false,events:[]};if(!matrix.length)return empty;
 const where=['a.created_at >= ?','a.created_at < ?','a.actor_id IS NOT NULL'];const values:(string|number)[]=[from,to];const actor=staff.role==='admin'?staff.id:filters.actor;
 if(actor){where.push('a.actor_id = ?');values.push(actor);}
 const predicate=(rows:typeof matrix)=>rows.map(()=>'(a.action = ? AND a.subject_type = ?)').join(' OR ');
 const binds=(rows:typeof matrix)=>rows.flatMap(m=>[m.action,m.type]);
 const base=' FROM audit_logs a LEFT JOIN users u ON u.id=a.actor_id WHERE '+where.join(' AND ');
 const completed=matrix.filter(m=>m.completed);
 const groups=completed.length?(await db.prepare('SELECT a.actor_id AS actorId,u.display_name AS actorName,a.action,a.subject_type AS subjectType,COUNT(*) AS count'+base+' AND ('+predicate(completed)+') GROUP BY a.actor_id,u.display_name,a.action,a.subject_type ORDER BY a.actor_id,a.action LIMIT 501').bind(...values,...binds(completed)).all<Omit<RecordedProgressGroup,'outcome'>>()).results:[];
 const events=(await db.prepare('SELECT a.id,a.actor_id AS actorId,u.display_name AS actorName,a.action,a.subject_type AS subjectType,a.subject_id AS subjectId,a.created_at AS createdAt'+base+' AND ('+predicate(matrix)+') ORDER BY a.created_at DESC,a.id DESC LIMIT 100').bind(...values,...binds(matrix)).all<BusinessActivity>()).results;
 return {from,to,groupsTruncated:groups.length>500,groups:groups.slice(0,500).map(g=>({...g,count:Number(g.count),outcome:matrix.find(m=>m.action===g.action&&m.type===g.subjectType)!.outcome})),events:events.map(e=>{const m=matrix.find(m=>m.action===e.action&&m.type===e.subjectType)!;return {...e,outcome:m.outcome,completed:m.completed};})};
}
