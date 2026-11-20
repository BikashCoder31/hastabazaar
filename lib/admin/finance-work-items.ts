import {staffMutationGuard} from '../db/repositories/staff-mutation-guard';
import {listPayoutRequests,type PayoutRequestRow} from '../db/repositories/payouts';
import {getPayoutFinanceWorkspace,payoutFinanceScopeGuards,type PayoutPacketSummary} from '../payments/payout-workspace';
import {getRefundFinanceWorkspace} from '../payments/refund-workspace';
import {getRefundObligation,refundIndependence} from '../payments/refund-obligations';
import {effectiveRefundBindingDeadlineSql} from '../payments/refund-deadlines';
import {readRefundCurrentProgress} from '../payments/refund-current-progress';
import {paymentGuard} from '../payments/manual-receipts';
import type {PayoutModel} from '../payments/payout-transfer-types';
import type {RuntimeEnvironment} from '../staging/environment';
import {withAdminReturnTo} from './return-context';

export type FinanceWorkFamily='payout_request'|'payout_candidate'|'payout_packet'|'refund_obligation'|'refund_source';
export interface FinanceWorkItem{
 family:FinanceWorkFamily;id:string;title:string;nativeRevision:number|null;sourceKind:string;recordKind:'live'|'simulation';status:string;
 startedAt:number;dueAt:number|null;nextUpdateAt:number|null;nextActor:string;ownerId:string|null;blocked:boolean;actionRequired:boolean;completed:boolean;href:string;
 origin:{requestId?:string;payoutId?:string;packetId?:string;obligationId?:string;sourceId?:string;sourceKind?:string;model?:PayoutModel};
}
export interface FinanceFamilyCoverage{family:FinanceWorkFamily;state:'available'|'partial'|'unavailable';nextCursor?:string;reason?:string;}
export interface FinanceRecentDecision{id:string;action:string;actorId:string;createdAt:number;family:'refund_obligation'|'payout_packet'|'payout_request';sourceId:string;sourceKind?:string;recordKind?:'live'|'simulation';label?:string;href:string;}
export interface FinanceWorkSourceKey{family:FinanceWorkFamily;id:string;sourceKind?:string;}
export interface FinanceWorkSourceState{family:FinanceWorkFamily;id:string;sourceKind:string;status:string;completed:boolean;blocked:boolean;actionRequired:boolean;nextActor:string;href:string;followUpHref?:string;followUp?:FinanceWorkSourceKey;}
class FinanceScopeError extends Error{status=403;}
const families:FinanceWorkFamily[]=['payout_request','payout_candidate','payout_packet','refund_obligation','refund_source'];
const exact=(db:D1Database,column:string,value:string)=>((db as D1Database&{dialect?:string}).dialect==='mariadb'?`BINARY ${column}=BINARY ${value}`:`${column} COLLATE BINARY=${value}`);
const originalRequestEvent=(db:D1Database)=>`SELECT original.id FROM audit_logs original WHERE ${exact(db,'original.action',"'payout.seller.requested'")} AND ${exact(db,'original.subject_type',"'payout_request'")} AND ${exact(db,'original.subject_id','r.id')} AND ${exact(db,'original.request_id','r.created_request_id')} AND original.command_key IS NULL ORDER BY original.created_at,original.id LIMIT 1`;
type RequestSource={id:string;sellerId:string;status:string;payoutId:string|null;createdAt:number;updatedAt:number;originalEventId:string;originalOwnerId:string;currentOwnerId:string;};

/** Existing native request reader, with current staff and retained original-party scope.
 * The private request text is available only to the protected native detail page;
 * Overview projects none of it. */
async function requestScope(db:D1Database,actorId:string,limit:number,requestId?:string){
 const authority=await staffMutationGuard(db,actorId,'payout.prepare',FinanceScopeError);
 const sources=await db.prepare(`SELECT r.id,r.seller_id sellerId,r.status,r.payout_id payoutId,r.created_at createdAt,r.updated_at updatedAt,a.id originalEventId,a.actor_id originalOwnerId,s.user_id currentOwnerId
  FROM payout_requests r JOIN seller_profiles s ON s.id=r.seller_id JOIN audit_logs a ON a.id=(${originalRequestEvent(db)})
  WHERE s.user_id<>? AND a.actor_id IS NOT NULL AND a.actor_id<>? ${requestId?'AND r.id=?':"AND r.status='submitted'"} ORDER BY r.created_at,r.id LIMIT ?`)
  .bind(actorId,actorId,...requestId?[requestId]:[],limit+1).all<RequestSource>();
 const complete=sources.results.length<=limit,selected=sources.results.slice(0,limit),guards=[...authority.statements];
 const rows:PayoutRequestRow[]=[];
 for(const source of selected){
  const row=(await listPayoutRequests(db,source.sellerId,{requestId:source.id,limit:1}))[0];if(!row||row.id!==source.id)throw new FinanceScopeError('Refresh the original payout request.');
  rows.push(row);guards.push(...paymentGuard(db,`EXISTS(SELECT 1 FROM payout_requests r JOIN seller_profiles s ON s.id=r.seller_id JOIN audit_logs a ON a.id=(${originalRequestEvent(db)}) WHERE r.id=? AND r.seller_id=? AND r.status=? AND COALESCE(r.payout_id,'')=? AND r.created_at=? AND r.updated_at=? AND a.id=? AND a.actor_id=? AND s.user_id=? AND a.actor_id<>? AND s.user_id<>?)`,[source.id,source.sellerId,source.status,source.payoutId??'',source.createdAt,source.updatedAt,source.originalEventId,source.originalOwnerId,source.currentOwnerId,actorId,actorId]));
 }
 const legacy=!!await db.prepare(`SELECT 1 FROM payout_requests r JOIN seller_profiles s ON s.id=r.seller_id WHERE r.status='submitted' AND s.user_id<>? AND NOT EXISTS(${originalRequestEvent(db)}) LIMIT 1`).bind(actorId).first();
 await db.batch(guards);
 return{rows,guards,complete:complete&&!legacy,authority};
}
export async function readPayoutRequestFinanceScope(db:D1Database,actorId:string,requestId:string):Promise<PayoutRequestRow|null>{
 if(typeof requestId!=='string'||!requestId||requestId.length>191)return null;
 return(await requestScope(db,actorId,1,requestId)).rows[0]??null;
}

function nativeTable(model:PayoutModel){return model==='registered'?'payouts':model==='managed'?'managed_payouts':'managed_supplier_payments';}
async function payoutOrigin(db:D1Database,model:PayoutModel,payoutId:string){
 const native=await db.prepare(`SELECT created_at createdAt FROM ${nativeTable(model)} WHERE id=?`).bind(payoutId).first<{createdAt:number}>();
 const request=model==='registered'?await db.prepare('SELECT id,created_at createdAt,first_finance_due_at dueAt FROM payout_requests WHERE payout_id=? ORDER BY created_at,id LIMIT 1').bind(payoutId).first<{id:string;createdAt:number;dueAt:number|null}>():null;
 return{startedAt:request?.createdAt??native?.createdAt??null,requestId:request?.id,dueAt:request?.dueAt??null};
}
async function refundScope(db:D1Database,actorId:string,id:string){
 const row=await getRefundObligation(db,id);if(!row)throw new FinanceScopeError('Refresh the original refund.');
 const guards=await refundIndependence(db,actorId,row.customerId,row.orderId,row.receiptId);
 if(row.orderId){const own=await db.prepare('SELECT 1 FROM orders WHERE id=? AND customer_id=?').bind(row.orderId,actorId).first();if(own)throw new FinanceScopeError('An independent Finance reader must review this original refund.');guards.push(...paymentGuard(db,'NOT EXISTS(SELECT 1 FROM orders WHERE id=? AND customer_id=?)',[row.orderId,actorId]));}
 const events=(await db.prepare('SELECT COUNT(*) total FROM refund_obligation_events WHERE obligation_id=?').bind(id).first<{total:number}>())!.total;
 guards.push(...paymentGuard(db,'EXISTS(SELECT 1 FROM refund_obligations WHERE id=? AND state=? AND revision=? AND customer_id=? AND owner_id=?) AND (SELECT COUNT(*) FROM refund_obligation_events WHERE obligation_id=?)=?',[id,row.state,row.revision,row.customerId,row.ownerId,id,events]));
 return{row,guards};
}

/** Bounded projections of original sources, not another task/assignment store. */
export async function readFinanceWorkItems(db:D1Database,actorId:string,environment:RuntimeEnvironment,options:{limit?:number;returnTo?:string}={}){
 const limit=options.limit??20;if(!Number.isSafeInteger(limit)||limit<1||limit>100)throw new Error('Use a Finance work limit of 1–100.');
 const perFamily=Math.max(1,Math.floor(limit/5)),items:FinanceWorkItem[]=[],recentDecisions:FinanceRecentDecision[]=[],guards:D1PreparedStatement[]=[];
 const coverage:FinanceFamilyCoverage[]=families.map(family=>({family,state:'unavailable',reason:'permission_or_source_unavailable'}));
 let decisionsCoverage:'available'|'partial'|'unavailable'='unavailable';
 const href=(path:string)=>withAdminReturnTo(path,options.returnTo),set=(family:FinanceWorkFamily,complete:boolean,nextCursor?:string)=>Object.assign(coverage.find(row=>row.family===family)!,{state:complete?'available':'partial',reason:complete?undefined:'bounded_or_unverified_native_sources',...(nextCursor?{nextCursor}:{})});
 const unavailable=(affected:FinanceWorkFamily[],guardStart:number)=>{guards.splice(guardStart);for(let index=items.length-1;index>=0;index--)if(affected.includes(items[index].family))items.splice(index,1);for(const family of affected)Object.assign(coverage.find(row=>row.family===family)!,{state:'unavailable',reason:'permission_or_source_unavailable',nextCursor:undefined});};
 const personalDenial=(error:unknown)=>error instanceof Error&&'status'in error&&error.status===403;
 const requestGuards=guards.length;
 try{
  const request=await requestScope(db,actorId,perFamily);guards.push(...request.guards);set('payout_request',request.complete);
  for(const row of request.rows)items.push({family:'payout_request',id:row.id,title:'Seller payout request — '+row.tradingName,nativeRevision:null,sourceKind:'seller_earnings_payout',recordKind:'live',status:row.status,startedAt:row.createdAt,dueAt:row.firstFinanceDueAt,nextUpdateAt:null,nextActor:'Finance reviewer',ownerId:null,blocked:false,actionRequired:true,completed:false,href:href('/admin/payouts?request='+encodeURIComponent(row.id)+'#payout-request-'+encodeURIComponent(row.id)),origin:{requestId:row.id}});
 }catch{unavailable(['payout_request'],requestGuards);}
 const payoutGuards=guards.length;
 try{
  const authority=await staffMutationGuard(db,actorId,'payout.prepare',FinanceScopeError),workspace=await getPayoutFinanceWorkspace(db,actorId,environment,{limit:perFamily});guards.push(...authority.statements);
  set('payout_candidate',workspace.coverage.candidatesComplete);set('payout_packet',workspace.coverage.packetsComplete);
  for(const row of workspace.candidates){
   const privacy=await payoutFinanceScopeGuards(db,actorId,row.model,row.id,row.sellerId);if(!privacy)continue;guards.push(...privacy);
   const origin=await payoutOrigin(db,row.model,row.id);if(origin.startedAt===null){set('payout_candidate',false);continue;}
   guards.push(...paymentGuard(db,`EXISTS(SELECT 1 FROM ${nativeTable(row.model)} WHERE id=? AND status=?) AND NOT EXISTS(SELECT 1 FROM payout_transfer_packets p WHERE p.payout_model=? AND COALESCE(p.registered_payout_id,p.managed_payout_id,p.supplier_payment_id)=? AND p.state NOT IN('failed','void'))`,[row.id,row.status,row.model,row.id]));
   items.push({family:'payout_candidate',id:row.id,title:(row.recordKind==='simulation'?'SIMULATION — ':'')+'Seller payout — '+row.sellerName,nativeRevision:null,sourceKind:row.model,recordKind:row.recordKind,status:row.status,startedAt:origin.startedAt,dueAt:null,nextUpdateAt:null,nextActor:row.blocker?'Original payout eligibility review':'Finance — prepare verified instruction',ownerId:null,blocked:!!row.blocker,actionRequired:!row.blocker,completed:false,href:href('/admin/payments/payouts?model='+row.model+'&payout='+encodeURIComponent(row.id)+'#payout-source-'+row.model+'-'+encodeURIComponent(row.id)),origin:{...(origin.requestId?{requestId:origin.requestId}:{}),model:row.model,payoutId:row.id}});
  }
  for(const row of workspace.packets){
   if(['paid','failed','void'].includes(row.state))continue;
   const retained=await db.prepare('SELECT source_snapshot_json snapshot FROM payout_transfer_packets WHERE id=?').bind(row.id).first<{snapshot:string}>();if(!retained){set('payout_packet',false);continue;}
   const privacy=await payoutFinanceScopeGuards(db,actorId,row.model,row.payoutId,row.sellerId,row.accountVersionId,{id:row.id,snapshot:retained.snapshot});if(!privacy)continue;guards.push(...privacy);
   const origin=await payoutOrigin(db,row.model,row.payoutId);if(origin.startedAt===null){set('payout_packet',false);continue;}
   guards.push(...paymentGuard(db,'EXISTS(SELECT 1 FROM payout_transfer_packets WHERE id=? AND state=? AND revision=? AND payout_model=? AND seller_id=?)',[row.id,row.state,row.revision,row.model,row.sellerId]));
   const next=row.state==='prepared'?'approve exact instruction':row.state==='approved'?'begin one manual instruction':'reconcile actual bank outcome';
   items.push({family:'payout_packet',id:row.id,title:(row.recordKind==='simulation'?'SIMULATION — ':'')+'Seller payout instruction — '+row.sellerName,nativeRevision:row.revision,sourceKind:row.model,recordKind:row.recordKind,status:row.state,startedAt:origin.startedAt,dueAt:null,nextUpdateAt:null,nextActor:'Eligible Super Admin — '+next,ownerId:null,blocked:!!row.blocker,actionRequired:workspace.superAdmin&&!row.blocker&&!row.personalConflict&&(row.recordKind==='live'||workspace.simulationAllowed),completed:false,href:href('/admin/payments/payouts?packet='+encodeURIComponent(row.id)+'#packet-'+encodeURIComponent(row.id)),origin:{...(origin.requestId?{requestId:origin.requestId}:{}),model:row.model,payoutId:row.payoutId,packetId:row.id}});
  }
 }catch{unavailable(['payout_candidate','payout_packet'],payoutGuards);}
 const refundGuards=guards.length;
 try{
  const authority=await staffMutationGuard(db,actorId,'refund.approve.standard',FinanceScopeError),workspace=await getRefundFinanceWorkspace(db,actorId,undefined,undefined,{limit:perFamily,workOnly:true});guards.push(...authority.statements);
  set('refund_obligation',!workspace.pages.obligations.nextCursor,workspace.pages.obligations.nextCursor??undefined);set('refund_source',!workspace.pages.sources.nextCursor,workspace.pages.sources.nextCursor??undefined);
  for(const row of workspace.obligations){
   let source;try{source=await refundScope(db,actorId,row.id);}catch(error){if(!personalDenial(error))set('refund_obligation',false);continue;}
   const progress=row.sourceKind==='return_refund'?await readRefundCurrentProgress(db,row.sourceId):null;
   const currentReview=!!progress&&(progress.pendingReview||progress.status==='needs_reconciliation');
   if(row.state==='completed'&&!currentReview)continue;
   guards.push(...source.guards);
   const packet=workspace.packets.find(value=>value.obligationId===row.id&&!['failed','void','paid'].includes(value.state)),destination=workspace.destinations.filter(value=>value.obligationId===row.id&&value.current),verified=destination.some(value=>value.status==='verified');
   let nextActor='Finance — review exact refund preparation',actionRequired=true,blocked=row.state==='blocked';
   if(currentReview){nextActor='Eligible Super Admin — review bank-returned refund';actionRequired=workspace.superAdmin;blocked=progress!.status==='needs_reconciliation';}
   else if(packet){nextActor='Eligible Super Admin — '+(packet.state==='prepared'?'approve exact refund':packet.state==='approved'?'begin one manual refund':'reconcile actual bank outcome');actionRequired=workspace.superAdmin;}
   else if(row.cashPaisa>0&&!verified){nextActor=destination.length?'Eligible Super Admin — verify original refund instructions':'Original customer — provide refund instructions';actionRequired=destination.length>0&&workspace.superAdmin;}
   else if(row.cashPaisa>0&&!workspace.funding.some(value=>value.availablePaisa!==null&&value.availablePaisa>=row.cashPaisa)){nextActor='Eligible Super Admin — verify actual company funding';actionRequired=workspace.superAdmin;blocked=true;}
   const initiationOutstanding=!currentReview&&(!packet||!['processing','uncertain'].includes(packet.state));
   const dueAt=row.bindingDueAt??(initiationOutstanding?row.initiationDueAt:null);
   guards.push(...paymentGuard(db,`EXISTS(SELECT 1 FROM refund_obligations obligation
     WHERE obligation.id=? AND COALESCE(${effectiveRefundBindingDeadlineSql('obligation')},-1)=COALESCE(?,-1))`,
     [row.id,row.bindingDueAt]));
   items.push({family:'refund_obligation',id:row.id,title:row.orderNumber?'Refund — '+row.orderNumber:'Original payer return',nativeRevision:row.revision,sourceKind:row.sourceKind,recordKind:'live',status:currentReview?progress!.status:row.state,startedAt:row.authorizedAt,dueAt,nextUpdateAt:row.nextUpdateAt,nextActor,ownerId:source.row.ownerId,blocked,actionRequired,completed:false,href:href('/admin/payments/refunds?obligation='+encodeURIComponent(row.id)+'#refund-obligation-'+encodeURIComponent(row.id)),origin:{obligationId:row.id,sourceKind:row.sourceKind,sourceId:row.sourceId}});
  }
  for(const row of workspace.sources){
   const sql=row.kind==='receipt_return'?'SELECT payer_user_id customerId,NULL orderId,id receiptId FROM company_money_receipts WHERE id=?':row.kind==='return_refund'?'SELECT o.customer_id customerId,r.order_id orderId,NULL receiptId FROM refunds r JOIN orders o ON o.id=r.order_id WHERE r.id=?':row.kind==='service_fee'?'SELECT customer_id customerId,order_id orderId,NULL receiptId FROM lawful_fee_refund_authorizations WHERE id=?':'SELECT customer_id customerId,order_id orderId,NULL receiptId FROM cancellation_refund_sources WHERE id=?';
   const party=await db.prepare(sql).bind(row.sourceId).first<{customerId:string;orderId:string|null;receiptId:string|null}>();if(!party?.customerId){set('refund_source',false);continue;}
   try{guards.push(...await refundIndependence(db,actorId,party.customerId,party.orderId,party.receiptId));}catch(error){if(!personalDenial(error))set('refund_source',false);continue;}
   guards.push(...paymentGuard(db,'NOT EXISTS(SELECT 1 FROM refund_obligations WHERE source_kind=? AND source_id=?)',[row.kind,row.sourceId]));
   items.push({family:'refund_source',id:row.sourceId,title:row.kind==='receipt_return'?'Unused original payer credit':'Authorized refund — '+row.label,nativeRevision:null,sourceKind:row.kind,recordKind:'live',status:'authorized_unregistered',startedAt:row.authorizedAt,dueAt:null,nextUpdateAt:null,nextActor:'Finance — open original authorized obligation',ownerId:null,blocked:false,actionRequired:row.kind!=='receipt_return'||workspace.superAdmin,completed:false,href:href('/admin/payments/refunds?search='+encodeURIComponent(row.sourceId)+'#refund-source-'+encodeURIComponent(row.sourceId)),origin:{sourceId:row.sourceId,sourceKind:row.kind}});
  }
  const events=await db.prepare(`SELECT id,obligation_id sourceId,action,actor_id actorId,created_at createdAt FROM refund_obligation_events WHERE actor_id=? AND action IN('opened','destination_verified','packet_prepared','packet_approved','packet_started','packet_paid','packet_failed','packet_uncertain','packet_voided','customer_refund_reversed','customer_reversal_retained') ORDER BY created_at DESC,id DESC LIMIT ?`).bind(actorId,perFamily+1).all<{id:string;sourceId:string;action:string;actorId:string;createdAt:number}>();
  // This is a bounded feature-scoped feed, not a complete audit log.
  decisionsCoverage='partial';
  for(const event of events.results.slice(0,perFamily)){try{const source=await refundScope(db,actorId,event.sourceId);guards.push(...source.guards);recentDecisions.push({...event,family:'refund_obligation',sourceKind:source.row.sourceKind,recordKind:'live',href:href('/admin/payments/refunds?obligation='+encodeURIComponent(event.sourceId))});}catch(error){if(!personalDenial(error))decisionsCoverage='partial';}}
 }catch{unavailable(['refund_obligation','refund_source'],refundGuards);recentDecisions.splice(0);decisionsCoverage='unavailable';}
 const historyGuards=guards.length,historyStart=recentDecisions.length;
 try{
  const authority=await staffMutationGuard(db,actorId,'payout.prepare',FinanceScopeError);guards.push(...authority.statements);decisionsCoverage='partial';
  const historyLimit=Math.min(10,perFamily),scalar=(db as D1Database&{dialect?:string}).dialect==='mariadb'?'JSON_VALUE':'json_extract';
  const events=await db.prepare(`SELECT a.id,a.actor_id actorId,a.subject_id sourceId,a.created_at createdAt,CASE WHEN a.reason='outcome' THEN ${scalar}(a.next_json,'$.input.outcome') ELSE a.reason END outcome
   FROM audit_logs a WHERE a.actor_id=? AND ${exact(db,'a.action',"'payout.transfer.event'")} AND ${exact(db,'a.subject_type',"'payout_transfer'")} AND a.command_key IS NULL ORDER BY a.created_at DESC,a.id DESC LIMIT ?`).bind(actorId,historyLimit).all<{id:string;actorId:string;sourceId:string;createdAt:number;outcome:string}>();
  const cache=new Map<string,{packet:PayoutPacketSummary;guards:D1PreparedStatement[]}|null>();
  for(const event of events.results){
   if(!['prepared','approved','started','voided','funding_blocked','paid','failed','uncertain'].includes(event.outcome)||authority.role!=='super_admin'&&event.outcome!=='prepared')continue;
   if(!cache.has(event.sourceId)){
    const workspace=await getPayoutFinanceWorkspace(db,actorId,environment,{packetId:event.sourceId}),packet=workspace.packets.find(row=>row.id===event.sourceId),snapshot=packet?await db.prepare('SELECT source_snapshot_json snapshot FROM payout_transfer_packets WHERE id=?').bind(packet.id).first<{snapshot:string}>():null;
    const privacy=packet&&snapshot?await payoutFinanceScopeGuards(db,actorId,packet.model,packet.payoutId,packet.sellerId,packet.accountVersionId,{id:packet.id,snapshot:snapshot.snapshot}):null;
    cache.set(event.sourceId,packet&&privacy?{packet,guards:[...privacy,...paymentGuard(db,'EXISTS(SELECT 1 FROM payout_transfer_packets WHERE id=? AND state=? AND revision=?)',[packet.id,packet.state,packet.revision])]}:null);
   }
   const source=cache.get(event.sourceId);if(!source)continue;
   guards.push(...source.guards,...paymentGuard(db,"EXISTS(SELECT 1 FROM audit_logs WHERE id=? AND actor_id=? AND action='payout.transfer.event' AND subject_type='payout_transfer' AND subject_id=?)",[event.id,actorId,source.packet.id]));
   recentDecisions.push({id:event.id,action:'payout.transfer.'+event.outcome,actorId:event.actorId,createdAt:event.createdAt,family:'payout_packet',sourceId:source.packet.id,sourceKind:source.packet.model,recordKind:source.packet.recordKind,label:(source.packet.recordKind==='simulation'?'SIMULATION — ':'')+'Payout instruction '+event.outcome.replaceAll('_',' '),href:href('/admin/payments/payouts?packet='+encodeURIComponent(source.packet.id))});
  }
  const requests=await db.prepare("SELECT id,actor_id actorId,subject_id sourceId,created_at createdAt,action FROM audit_logs WHERE actor_id=? AND subject_type='payout_request' AND action IN('payout.request.prepared','payout.request.rejected') AND command_key IS NULL ORDER BY created_at DESC,id DESC LIMIT ?").bind(actorId,historyLimit).all<{id:string;actorId:string;sourceId:string;createdAt:number;action:string}>();
  for(const event of requests.results){const source=await requestScope(db,actorId,1,event.sourceId);if(!source.rows.length)continue;guards.push(...source.guards);recentDecisions.push({...event,family:'payout_request',sourceKind:'seller_earnings_payout',recordKind:'live',href:href('/admin/payouts?request='+encodeURIComponent(event.sourceId))});}
 }catch{guards.splice(historyGuards);recentDecisions.splice(historyStart);}
 recentDecisions.sort((a,b)=>b.createdAt-a.createdAt||b.id.localeCompare(a.id));if(recentDecisions.length>limit)recentDecisions.splice(limit);
 if(items.length>limit){const removed=items.slice(limit);for(const row of removed)set(row.family,false);items.splice(limit);}
 try{if(guards.length)await db.batch(guards);}catch{return{items:[] as FinanceWorkItem[],coverage:families.map(family=>({family,state:'unavailable' as const,reason:'current_scope_changed'})),recentDecisions:[] as FinanceRecentDecision[],decisionsCoverage:'unavailable' as const};}
 return{items,coverage,recentDecisions,decisionsCoverage};
}

/** Exact native state for continuation. Null is unknown/denied, never proof of completion.
 * A completed preparation/admission step does not mean its underlying money was paid. */
export async function readFinanceWorkSourceState(db:D1Database,actorId:string,environment:RuntimeEnvironment,key:FinanceWorkSourceKey,options:{returnTo?:string}={}):Promise<FinanceWorkSourceState|null>{
 if(!families.includes(key.family)||typeof key.id!=='string'||!key.id||key.id.length>191)return null;
 const href=(path:string)=>withAdminReturnTo(path,options.returnTo);
 const result=(sourceKind:string,status:string,completed:boolean,blocked:boolean,actionRequired:boolean,nextActor:string,path:string,followUp?:string,followKey?:FinanceWorkSourceKey):FinanceWorkSourceState=>({family:key.family,id:key.id,sourceKind,status,completed,blocked,actionRequired,nextActor,href:href(path),...(followUp?{followUpHref:href(followUp)}:{}),...(followKey?{followUp:followKey}:{})});
 try{
  if(key.family==='payout_request'){
   if(key.sourceKind!==undefined&&key.sourceKind!=='seller_earnings_payout')return null;
   const row=await readPayoutRequestFinanceScope(db,actorId,key.id);if(!row)return null;
   return result('seller_earnings_payout',row.status,row.status!=='submitted',false,row.status==='submitted',row.status==='submitted'?'Finance reviewer':'Original request review recorded','/admin/payouts?request='+encodeURIComponent(row.id),row.payoutId?'/admin/payments/payouts?model=registered&payout='+encodeURIComponent(row.payoutId):undefined,row.payoutId?{family:'payout_candidate',id:row.payoutId,sourceKind:'registered'}:undefined);
  }
  if(key.family==='payout_candidate'||key.family==='payout_packet'){
   const authority=await staffMutationGuard(db,actorId,'payout.prepare',FinanceScopeError);
   let model:PayoutModel|undefined;
   if(key.family==='payout_candidate'){
    if(key.sourceKind!==undefined){if(!['registered','managed','fixed'].includes(key.sourceKind))return null;model=key.sourceKind as PayoutModel;}
    else{const matches=await db.prepare("SELECT 'registered' model FROM payouts WHERE id=? UNION ALL SELECT 'managed' model FROM managed_payouts WHERE id=? UNION ALL SELECT 'fixed' model FROM managed_supplier_payments WHERE id=?").bind(key.id,key.id,key.id).all<{model:PayoutModel}>();if(matches.results.length!==1)return null;model=matches.results[0].model;}
   }
   const workspace=await getPayoutFinanceWorkspace(db,actorId,environment,key.family==='payout_packet'?{packetId:key.id}:{model,payoutId:key.id});
   const candidate=workspace.candidates.find(row=>row.id===key.id&&row.model===model);
   if(candidate){
    const privacy=await payoutFinanceScopeGuards(db,actorId,candidate.model,candidate.id,candidate.sellerId);if(!privacy)return null;
    await db.batch([...authority.statements,...privacy,...paymentGuard(db,`EXISTS(SELECT 1 FROM ${nativeTable(candidate.model)} WHERE id=? AND status=?) AND NOT EXISTS(SELECT 1 FROM payout_transfer_packets p WHERE p.payout_model=? AND COALESCE(p.registered_payout_id,p.managed_payout_id,p.supplier_payment_id)=? AND p.state NOT IN('failed','void'))`,[candidate.id,candidate.status,candidate.model,candidate.id])]);
    return result(candidate.model,candidate.status,false,!!candidate.blocker,!candidate.blocker,candidate.blocker?'Original payout eligibility review':'Finance — prepare verified instruction','/admin/payments/payouts?model='+candidate.model+'&payout='+encodeURIComponent(candidate.id));
   }
   const packets=workspace.packets.filter(row=>key.family==='payout_packet'?row.id===key.id:row.payoutId===key.id&&row.model===model);
   const packet=packets.find(row=>!['failed','void','paid'].includes(row.state))??packets.find(row=>row.state==='paid')??(key.family==='payout_packet'?packets[0]:undefined);if(!packet||key.sourceKind!==undefined&&key.sourceKind!==packet.model)return null;
   const snapshot=await db.prepare('SELECT source_snapshot_json snapshot FROM payout_transfer_packets WHERE id=?').bind(packet.id).first<{snapshot:string}>();if(!snapshot)return null;
   const privacy=await payoutFinanceScopeGuards(db,actorId,packet.model,packet.payoutId,packet.sellerId,packet.accountVersionId,{id:packet.id,snapshot:snapshot.snapshot});if(!privacy)return null;
   const completed=key.family==='payout_packet'?['paid','failed','void'].includes(packet.state):packet.state==='paid';
   const nativePaid=key.family==='payout_candidate'&&completed?paymentGuard(db,`EXISTS(SELECT 1 FROM ${nativeTable(packet.model)} WHERE id=? AND status='paid')`,[packet.payoutId]):[];
   await db.batch([...authority.statements,...privacy,...paymentGuard(db,'EXISTS(SELECT 1 FROM payout_transfer_packets WHERE id=? AND payout_model=? AND state=? AND revision=?)',[packet.id,packet.model,packet.state,packet.revision]),...nativePaid]);
   const target='/admin/payments/payouts?packet='+encodeURIComponent(packet.id),followUp=key.family==='payout_candidate'&&!completed?target:key.family==='payout_packet'&&['failed','void'].includes(packet.state)?'/admin/payments/payouts?model='+packet.model+'&payout='+encodeURIComponent(packet.payoutId):undefined;
   const followKey:FinanceWorkSourceKey|undefined=followUp?(key.family==='payout_candidate'?{family:'payout_packet',id:packet.id,sourceKind:packet.model}:{family:'payout_candidate',id:packet.payoutId,sourceKind:packet.model}):undefined;
   return result(packet.model,packet.state,completed,!!packet.blocker,!completed&&workspace.superAdmin&&!packet.blocker&&!packet.personalConflict&&(packet.recordKind==='live'||workspace.simulationAllowed),completed?'Native instruction outcome recorded':'Eligible Super Admin — review current instruction',target,followUp,followKey);
  }
  const authority=await staffMutationGuard(db,actorId,'refund.approve.standard',FinanceScopeError);
  let obligationId=key.family==='refund_obligation'?key.id:undefined,sourceKind=key.sourceKind;
  if(key.family==='refund_source'){
   if(sourceKind!==undefined&&!['return_refund','receipt_return','service_fee','cancellation'].includes(sourceKind))return null;
   if(!sourceKind){const matches=await db.prepare("SELECT 'return_refund' kind FROM refunds WHERE id=? UNION ALL SELECT 'receipt_return' kind FROM company_money_receipts WHERE id=? UNION ALL SELECT 'service_fee' kind FROM lawful_fee_refund_authorizations WHERE id=? UNION ALL SELECT 'cancellation' kind FROM cancellation_refund_sources WHERE id=?").bind(key.id,key.id,key.id,key.id).all<{kind:string}>();if(matches.results.length!==1)return null;sourceKind=matches.results[0].kind;}
   const opened=await db.prepare('SELECT id FROM refund_obligations WHERE source_kind=? AND source_id=?').bind(sourceKind,key.id).first<{id:string}>();obligationId=opened?.id;
   if(!obligationId){
    const workspace=await getRefundFinanceWorkspace(db,actorId,undefined,undefined,{search:key.id}),source=workspace.sources.find(row=>row.sourceId===key.id&&row.kind===sourceKind);if(!source)return null;
    const sql=source.kind==='receipt_return'?'SELECT payer_user_id customerId,NULL orderId,id receiptId FROM company_money_receipts WHERE id=?':source.kind==='return_refund'?'SELECT o.customer_id customerId,r.order_id orderId,NULL receiptId FROM refunds r JOIN orders o ON o.id=r.order_id WHERE r.id=?':source.kind==='service_fee'?'SELECT customer_id customerId,order_id orderId,NULL receiptId FROM lawful_fee_refund_authorizations WHERE id=?':'SELECT customer_id customerId,order_id orderId,NULL receiptId FROM cancellation_refund_sources WHERE id=?';
    const party=await db.prepare(sql).bind(source.sourceId).first<{customerId:string;orderId:string|null;receiptId:string|null}>();if(!party?.customerId)return null;
    await db.batch([...authority.statements,...await refundIndependence(db,actorId,party.customerId,party.orderId,party.receiptId),...paymentGuard(db,'NOT EXISTS(SELECT 1 FROM refund_obligations WHERE source_kind=? AND source_id=?)',[sourceKind,key.id])]);
    return result(source.kind,'authorized_unregistered',false,false,source.kind!=='receipt_return'||workspace.superAdmin,'Finance — open original authorized obligation','/admin/payments/refunds?search='+encodeURIComponent(source.sourceId));
   }
  }
  if(!obligationId)return null;
  const workspace=await getRefundFinanceWorkspace(db,actorId,undefined,obligationId),row=workspace.obligations.find(value=>value.id===obligationId);if(!row||key.family==='refund_obligation'&&sourceKind!==undefined&&row.sourceKind!==sourceKind)return null;
  const scope=await refundScope(db,actorId,row.id),target='/admin/payments/refunds?obligation='+encodeURIComponent(row.id);
  if(key.family==='refund_source'){
   if(row.sourceKind!==sourceKind||row.sourceId!==key.id)return null;
   await db.batch([...authority.statements,...scope.guards]);return result(sourceKind!,'opened',true,false,false,'Original source admitted; continue its refund',target,target,{family:'refund_obligation',id:row.id,sourceKind:row.sourceKind});
  }
  const progress=row.sourceKind==='return_refund'?await readRefundCurrentProgress(db,row.sourceId):null,unsettled=!!progress&&(progress.pendingReview||progress.hasUnfinishedRetry||progress.status==='needs_reconciliation'),completed=row.state==='completed'&&!unsettled;
  const packet=workspace.packets.find(value=>value.obligationId===row.id&&!['paid','failed','void'].includes(value.state)),destination=workspace.destinations.filter(value=>value.obligationId===row.id&&value.current);
  let nextActor='Finance — review exact refund preparation',actionRequired=!completed,blocked=row.state==='blocked',followUp:string|undefined,followKey:FinanceWorkSourceKey|undefined;
  if(unsettled){nextActor='Eligible Super Admin — review continuing bank-returned refund';actionRequired=workspace.superAdmin;blocked=progress!.status==='needs_reconciliation'||progress!.status==='retry_uncertain';
   const retries=await db.prepare(`SELECT DISTINCT retry.id FROM customer_refund_reversals reversal JOIN customer_refund_reversal_dispositions disposition ON disposition.reversal_id=reversal.id AND disposition.kind='retain' JOIN refund_obligations retry ON retry.id=disposition.retry_obligation_id AND retry.source_kind='receipt_return' AND retry.source_id=reversal.receipt_id AND retry.receipt_id=reversal.receipt_id AND retry.customer_id=? WHERE reversal.obligation_id=? AND retry.state<>'completed' LIMIT 2`).bind(row.customerId,row.id).all<{id:string}>();if(retries.results.length===1){followUp='/admin/payments/refunds?obligation='+encodeURIComponent(retries.results[0].id);followKey={family:'refund_obligation',id:retries.results[0].id,sourceKind:'receipt_return'};}
  }else if(completed){nextActor='Current refund outcome recorded';actionRequired=false;}
  else if(packet){nextActor='Eligible Super Admin — review current refund instruction';actionRequired=workspace.superAdmin;}
  else if(row.cashPaisa>0&&!destination.some(value=>value.status==='verified')){nextActor=destination.length?'Eligible Super Admin — verify original refund instructions':'Original customer — provide refund instructions';actionRequired=workspace.superAdmin&&destination.length>0;}
  else if(row.cashPaisa>0&&!workspace.funding.some(value=>value.availablePaisa!==null&&value.availablePaisa>=row.cashPaisa)){nextActor='Eligible Super Admin — verify actual company funding';actionRequired=workspace.superAdmin;blocked=true;}
  await db.batch([...authority.statements,...scope.guards]);
  return result(row.sourceKind,progress?.status??row.state,completed,blocked,actionRequired,nextActor,target,followUp,followKey);
 }catch{return null;}
}
