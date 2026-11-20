import {calculateServiceDueAt} from '../workflows/service-clock';
import {buildFormAnswerInsert} from '../db/repositories/form-answers';
import type {CommerceForm} from '../db/repositories/commerce-form-replay';
import {checkoutCommitClock} from '../checkout/commit-policy-guards';
import {staffMutationGuard} from '../db/repositories/staff-mutation-guard';
import {commandReceipt,type CommandContext} from '../workflows/contracts';
import {digestFormRequest} from '../forms/client-submission';
import {caseBusinessNotificationStatements} from '../operations/business-notifications';
import {prepareDamagedReturnDispositionGuard,readQuarantinedReturnObservation} from './damaged-stock-custody';
import {originalReverseReturnFunding} from './priced-return-policy';

export class ReturnHandlingError extends Error {}
export type HandlingAction='instructions'|'arrange'|'handoff'|'receive'|'inspect'|'waive_return'|'sufficient_evidence'|'prepare_replacement'|'dispatch_replacement'|'deliver_replacement'|'cancel_replacement'|'lost_replacement';
export interface HandlingInput {
 caseId:string;action:HandlingAction;occurredAt:number;publicMessage:string;privateNote:string;evidenceReference:string;
 quantity?:number;disposition?:'restock'|'quarantine'|'scrap';
 instructions?:{destination:string;method:string;packaging:string;safeHandlingConfirmed:boolean};
 shipmentId?:string;carrierReference?:string;customerAgreementReference?:string;promisedAt?:number;availabilityAt?:number;
}
interface HandlingRow {
 caseId:string;calendarVersion:string|null;referenceNumber:string;revision:number;phase:string;ownerId:string|null;firstReceivedAt:number;firstDueAt:number;firstActionAt:number|null;
 instructionsJson:string|null;instructionsAt:number|null;handoffDueAt:number|null;handedAt:number|null;receivedAt:number|null;sufficientEvidenceAt:number|null;inspectionDueAt:number|null;
 receivedQuantity:number;inspectedQuantity:number;restockedQuantity:number;waivedQuantity:number;
 caseStatus:string;quantity:number;requestedResolution:string;outcome:string|null;orderId:string;itemId:string;customerId:string|null;sellerOwner:string;productId:string|null;offerId:string|null;now:number;
}
export async function getReturnHandling(db:D1Database,caseId:string){
 return db.prepare(`SELECT h.case_id AS caseId,h.calendar_version AS calendarVersion,r.reference_number AS referenceNumber,h.revision,h.phase,h.owner_id AS ownerId,h.first_received_at AS firstReceivedAt,h.first_due_at AS firstDueAt,h.first_action_at AS firstActionAt,
 h.instructions_json AS instructionsJson,h.instructions_at AS instructionsAt,h.handoff_due_at AS handoffDueAt,h.handed_at AS handedAt,h.received_at AS receivedAt,h.sufficient_evidence_at AS sufficientEvidenceAt,h.inspection_due_at AS inspectionDueAt,
 h.received_quantity AS receivedQuantity,h.inspected_quantity AS inspectedQuantity,h.restocked_quantity AS restockedQuantity,h.waived_quantity AS waivedQuantity,
 r.status AS caseStatus,r.quantity,r.requested_resolution AS requestedResolution,r.resolution_outcome AS outcome,i.order_id AS orderId,i.id AS itemId,o.customer_id AS customerId,s.user_id AS sellerOwner,i.product_id AS productId,snap.offer_id AS offerId,${checkoutCommitClock(db)} AS now
 FROM return_handling h JOIN return_requests r ON r.id=h.case_id JOIN order_items i ON i.id=r.order_item_id JOIN orders o ON o.id=i.order_id JOIN seller_profiles s ON s.id=i.seller_id LEFT JOIN order_item_offer_snapshots snap ON snap.order_item_id=i.id WHERE h.case_id=?`).bind(caseId).first<HandlingRow>();
}
function guard(db:D1Database,predicate:string,values:unknown[]=[]){
 const id=crypto.randomUUID();return [db.prepare(`INSERT INTO operation_transaction_guards(id,valid) SELECT ?,CASE WHEN ${predicate} THEN 1 ELSE 0 END`).bind(id,...values),db.prepare('DELETE FROM operation_transaction_guards WHERE id=?').bind(id)];
}
function requiredText(value:unknown,label:string,min=8,max=2000){
 if(typeof value!=='string'||value.trim().length<min||value.length>max)throw new ReturnHandlingError(`${label} must contain ${min}–${max} characters.`);return value.trim();
}
async function stockStatements(db:D1Database,row:HandlingRow,ctx:CommandContext,kind:'restock'|'replacement_reserve'|'replacement_dispatch'|'replacement_release',quantity:number,shipmentId:string|null){
 const clock=checkoutCommitClock(db),available=kind==='replacement_reserve'?-quantity:kind==='replacement_dispatch'?0:quantity,reserved=kind==='replacement_reserve'?quantity:kind==='restock'?0:-quantity;
 const statements:D1PreparedStatement[]=[];
 if(row.offerId){
  const current=await db.prepare('SELECT revision,available,reserved,paused,needs_reconfirmation AS reconfirm FROM offer_stock WHERE offer_id=?').bind(row.offerId).first<{revision:number;available:number;reserved:number;paused:number;reconfirm:number}>();
  if(!current||current.available+available<0||current.available+available>1000000000||current.reserved+reserved<0||current.reserved+reserved>1000000000||kind==='replacement_reserve'&&(current.paused||current.reconfirm))throw new ReturnHandlingError('The exact original offer needs sufficient confirmed stock.');
  statements.push(db.prepare(`UPDATE offer_stock SET available=available+?,reserved=reserved+?,revision=revision+1,updated_at=${clock} WHERE offer_id=? AND revision=? AND available+? BETWEEN 0 AND 1000000000 AND reserved+? BETWEEN 0 AND 1000000000 ${kind==='replacement_reserve'?'AND paused=0 AND needs_reconfirmation=0':''}`).bind(available,reserved,row.offerId,current.revision,available,reserved),...guard(db,'changes()=1'),
   db.prepare(`INSERT INTO offer_stock_events(id,offer_id,kind,available_delta,reserved_delta,reason,actor_id,request_id,created_at) VALUES(?,?,?,?,?,?,?,?,${clock})`).bind(crypto.randomUUID(),row.offerId,kind,available,reserved,'Actual return handling for '+row.caseId,ctx.actorId,ctx.requestId));
 }else{
  if(!row.productId)throw new ReturnHandlingError('The original inventory source needs reconciliation.');
  statements.push(...guard(db,'NOT EXISTS(SELECT 1 FROM product_offer_heads WHERE product_id=? AND inventory_mapped=1)',[row.productId]));
  if(available)statements.push(db.prepare(`UPDATE products SET inventory_quantity=inventory_quantity+?,updated_at=${clock} WHERE id=? AND inventory_quantity+? BETWEEN 0 AND 1000000000`).bind(available,row.productId,available),...guard(db,'changes()=1'));
 }
 statements.push(db.prepare(`INSERT INTO return_stock_actions(id,case_id,shipment_id,offer_id,product_id,kind,quantity,actor_id,request_id,created_at) VALUES(?,?,?,?,?,?,?,?,?,${clock})`).bind(crypto.randomUUID(),row.caseId,shipmentId,row.offerId,row.productId,kind,quantity,ctx.actorId,ctx.requestId));return statements;
}

/** Records evidence-backed physical facts; it never transfers money or invents a courier booking. */
export async function recordReturnHandling(db:D1Database,ctx:CommandContext,input:HandlingInput,form?:CommerceForm){
 if(form&&form.answers.formId!=='staff.return-case-action')throw new ReturnHandlingError('Use the current return action form.');
 const payload=form?{...input,form}:input;
 const authority=await staffMutationGuard(db,ctx.actorId,'order.manage',ReturnHandlingError,input.action==='waive_return'?'super_admin':undefined);
 const row=await getReturnHandling(db,input.caseId);if(!row)throw new ReturnHandlingError('The original handling source needs reconciliation.');
 if(row.customerId===ctx.actorId||row.sellerOwner===ctx.actorId)throw new ReturnHandlingError('An operator without a personal customer or supplier interest is required.');
 const receipt=await commandReceipt(db,ctx,{action:'return.handling.'+input.action,subjectType:'return_request',subjectId:input.caseId},payload);
 if(receipt.replayed)return receipt.result as {id:string;revision:number;shipmentId:string|null};
 if(ctx.expectedRevision!==String(row.revision)||['rejected','resolved'].includes(row.caseStatus))throw new ReturnHandlingError('Refresh the open return case before recording this action.');
 const publicMessage=requiredText(input.publicMessage,'Customer update',10,1500),note=requiredText(input.privateNote,'Private evidence note',10,3000),evidence=requiredText(input.evidenceReference,'Evidence reference',8,500);
 if(!Number.isSafeInteger(input.occurredAt)||input.occurredAt<=0||input.occurredAt>row.now)throw new ReturnHandlingError('Record the actual non-future event time.');
 const eventDetails:Record<string,unknown>={...input};
 const clock=checkoutCommitClock(db),eventId=crypto.randomUUID(),nextRevision=row.revision+1,updates:Record<string,unknown>={first_action_at:row.firstActionAt??row.now,owner_id:row.ownerId??ctx.actorId,last_event_id:eventId};
 let caseStatus=row.caseStatus,shipmentId:string|null=null;
 const statements=[db.prepare('UPDATE orders SET updated_at=updated_at WHERE id=?').bind(row.orderId),...authority.statements,
  ...guard(db,`EXISTS(SELECT 1 FROM return_handling WHERE case_id=? AND revision=?) AND EXISTS(SELECT 1 FROM return_requests r JOIN order_items i ON i.id=r.order_item_id JOIN orders o ON o.id=i.order_id JOIN seller_profiles s ON s.id=i.seller_id WHERE r.id=? AND r.status=? AND (o.customer_id IS NULL OR o.customer_id<>?) AND s.user_id<>?) AND ?<=${clock}`,[row.caseId,row.revision,row.caseId,row.caseStatus,ctx.actorId,ctx.actorId,input.occurredAt])];
 const quantity=()=>{if(!Number.isSafeInteger(input.quantity)||input.quantity!<1||input.quantity!>row.quantity)throw new ReturnHandlingError('Choose an actual quantity within this case.');return input.quantity!;};
 if(input.action==='instructions'){
  if(row.instructionsAt!==null||!['approved','pending_high_value_approval'].includes(row.caseStatus))throw new ReturnHandlingError('Instructions need an approved case and their first saved destination; an in-flight destination cannot be replaced.');
  const details=input.instructions;if(!details?.safeHandlingConfirmed)throw new ReturnHandlingError('Confirm that the proposed handling is safe for these actual goods.');
  const snapshot={reference:row.referenceNumber,destination:requiredText(details.destination,'Return destination',10),method:requiredText(details.method,'Return method',4,200),packaging:requiredText(details.packaging,'Safe packaging instructions',10,1500),fundedBy:await originalReverseReturnFunding(db,row.caseId),customerChargePaisa:0};
  Object.assign(updates,{phase:'instructions',instructions_json:JSON.stringify(snapshot),instructions_at:row.now,handoff_due_at:row.now+5*86400000});
 }else if(input.action==='arrange'){
  if(row.instructionsAt===null||row.handedAt!==null||row.receivedQuantity+row.waivedQuantity>=row.quantity)throw new ReturnHandlingError('Arrange only outstanding collection before actual handoff; an in-flight return cannot be redirected.');
  requiredText(input.customerAgreementReference,'Customer agreement reference');
  if(!Number.isSafeInteger(input.availabilityAt)||input.availabilityAt!<=row.now)throw new ReturnHandlingError('Retain the actual agreed future availability time.');
  if(input.instructions){const details=input.instructions;if(!details.safeHandlingConfirmed)throw new ReturnHandlingError('Confirm the safety of the explicitly amended method.');const fundedBy=row.instructionsJson&&JSON.parse(row.instructionsJson).fundedBy==='buyer'?'buyer':'company';eventDetails.instructions={reference:row.referenceNumber,destination:requiredText(details.destination,'Return destination',10),method:requiredText(details.method,'Return method',4,200),packaging:requiredText(details.packaging,'Safe packaging instructions',10,1500),fundedBy,customerChargePaisa:0};}
  eventDetails.remainingQuantity=row.quantity-row.receivedQuantity-row.waivedQuantity;
 }else if(input.action==='handoff'){
  if(!row.instructionsAt||row.handedAt!==null)throw new ReturnHandlingError('Retain usable instructions and record this actual handoff once.');
  Object.assign(updates,{phase:row.receivedQuantity>0?row.phase:'in_transit',handed_at:input.occurredAt});if(row.caseStatus==='approved'&&row.receivedQuantity===0)caseStatus='in_transit';
 }else if(input.action==='receive'){
  const q=quantity();if(row.receivedQuantity+row.waivedQuantity+q>row.quantity||row.handedAt!==null&&input.occurredAt<row.handedAt)throw new ReturnHandlingError('Receipt must match the actual outstanding returned quantity and custody.');
  // Preserve the saved service-calendar version; historical unknown calendars require reconciliation.
  Object.assign(updates,{phase:'received',received_at:row.receivedAt??input.occurredAt,received_quantity:row.receivedQuantity+q,inspection_due_at:row.calendarVersion?Math.min(row.inspectionDueAt??Infinity,calculateServiceDueAt({startedAt:input.occurredAt,amount:3,unit:'service_day',calendarVersion:row.calendarVersion})):row.inspectionDueAt});if(['approved','in_transit','received'].includes(row.caseStatus))caseStatus='received';
 }else if(input.action==='inspect'){
  const q=quantity();if(row.receivedAt===null||input.occurredAt<row.receivedAt||row.inspectedQuantity+q>row.receivedQuantity||!['restock','quarantine','scrap'].includes(input.disposition??''))throw new ReturnHandlingError('Inspect only actually received, uninspected quantities and record their disposition.');
  if(input.disposition==='quarantine'){
   const observation=await readQuarantinedReturnObservation(db,form);
   if(observation)eventDetails.custodyObservation=observation;
  }else{
   const custody=await prepareDamagedReturnDispositionGuard(db,row.orderId,row.itemId);
   if(custody.blocker)throw new ReturnHandlingError(custody.blocker);
   statements.push(...custody.guards);
  }
  Object.assign(updates,{phase:'inspected',inspected_quantity:row.inspectedQuantity+q});
  if(input.disposition==='restock'){statements.push(...await stockStatements(db,row,ctx,'restock',q,null));updates.restocked_quantity=row.restockedQuantity+q;}
 }else if(input.action==='waive_return'){
  const q=quantity();if(row.receivedQuantity+row.waivedQuantity+q>row.quantity)throw new ReturnHandlingError('Waive only the still-unreceived quantity with its actual evidence and reason.');
  Object.assign(updates,{phase:'waived',waived_quantity:row.waivedQuantity+q});
 }else if(input.action==='sufficient_evidence'){
  if(row.sufficientEvidenceAt!==null)throw new ReturnHandlingError('The original sufficient-evidence clock is already retained.');
  Object.assign(updates,{sufficient_evidence_at:input.occurredAt,inspection_due_at:row.calendarVersion?Math.min(row.inspectionDueAt??Infinity,calculateServiceDueAt({startedAt:input.occurredAt,amount:3,unit:'service_day',calendarVersion:row.calendarVersion})):row.inspectionDueAt});
 }else if(input.action==='prepare_replacement'){
  if(row.outcome!=='replacement'||!['approved','received'].includes(row.caseStatus))throw new ReturnHandlingError('Retain the customer-agreed replacement outcome first.');
  const agreement=requiredText(input.customerAgreementReference,'Customer agreement reference');
  if(!Number.isSafeInteger(input.promisedAt)||input.promisedAt!<=0)throw new ReturnHandlingError('Record the actual supported replacement promise.');
  shipmentId=crypto.randomUUID();
  statements.push(db.prepare(`INSERT INTO return_replacement_shipments(id,case_id,quantity,offer_id,state,customer_agreement_reference,promised_at,created_at) VALUES(?,?,?,?,'reserved',?,?,${clock})`).bind(shipmentId,row.caseId,row.quantity,row.offerId,agreement,input.promisedAt));
  statements.push(...await stockStatements(db,row,ctx,'replacement_reserve',row.quantity,shipmentId));
 }else if(['dispatch_replacement','deliver_replacement','cancel_replacement','lost_replacement'].includes(input.action)){
  shipmentId=requiredText(input.shipmentId,'Replacement shipment',1,191);
  const shipment=await db.prepare('SELECT state,revision,quantity,dispatched_at AS dispatchedAt,carrier_reference AS carrierReference FROM return_replacement_shipments WHERE id=? AND case_id=?').bind(shipmentId,row.caseId).first<{state:string;revision:number;quantity:number;dispatchedAt:number|null;carrierReference:string|null}>();
  const dispatch=input.action==='dispatch_replacement',cancel=input.action==='cancel_replacement',deliver=input.action==='deliver_replacement';
  if(!shipment||shipment.state!==(dispatch||cancel?'reserved':'dispatched')||shipment.dispatchedAt!==null&&input.occurredAt<shipment.dispatchedAt)throw new ReturnHandlingError('Use the exact current replacement custody; uncertain delivery must be reconciled before another shipment.');
  if(dispatch)statements.push(...await stockStatements(db,row,ctx,'replacement_dispatch',shipment.quantity,shipmentId));
  if(cancel)statements.push(...await stockStatements(db,row,ctx,'replacement_release',shipment.quantity,shipmentId));
  const reference=dispatch?requiredText(input.carrierReference,'Actual carrier reference',4,200):shipment.carrierReference;
  statements.push(db.prepare(`UPDATE return_replacement_shipments SET state=?,revision=revision+1,carrier_reference=?,dispatched_at=CASE WHEN ? THEN ? ELSE dispatched_at END,delivered_at=CASE WHEN ? THEN ? ELSE delivered_at END,closed_at=CASE WHEN ? THEN ? ELSE closed_at END WHERE id=? AND revision=?`).bind(dispatch?'dispatched':cancel?'cancelled':deliver?'delivered':'lost',reference,dispatch?1:0,input.occurredAt,deliver?1:0,input.occurredAt,cancel||!dispatch?1:0,input.occurredAt,shipmentId,shipment.revision),...guard(db,'changes()=1'));
 }else throw new ReturnHandlingError('Unknown physical return action.');
 const nativeColumns:Record<string,string>={first_action_at:`COALESCE(first_action_at,${clock})`};
 if(input.action==='instructions'){nativeColumns.instructions_at=clock;nativeColumns.handoff_due_at=`${clock}+432000000`;}
 const entries=Object.entries(updates),authoredNow=['instructions','prepare_replacement'].includes(input.action);
 statements.push(db.prepare(`UPDATE return_handling SET ${entries.map(([key])=>key+'='+(nativeColumns[key]??'?')).join(',')},revision=revision+1 WHERE case_id=? AND revision=?`).bind(...entries.filter(([key])=>!nativeColumns[key]).map(([,value])=>value),row.caseId,row.revision),...guard(db,'changes()=1'),
  db.prepare(`INSERT INTO return_handling_events(id,case_id,revision,action,actor_id,occurred_at,recorded_at,public_message,private_note,evidence_reference,details_json,request_id) VALUES(?,?,?,?,?,${authoredNow?clock:'?'},${clock},?,?,?,?,?)`).bind(eventId,row.caseId,nextRevision,input.action,ctx.actorId,...(authoredNow?[]:[input.occurredAt]),publicMessage,note,evidence,JSON.stringify(eventDetails),ctx.requestId),
  db.prepare(`UPDATE return_requests SET status=?,operation_request_id=?,updated_at=${clock} WHERE id=? AND status=?`).bind(caseStatus,ctx.requestId,row.caseId,row.caseStatus),...guard(db,'changes()=1'),
  db.prepare(`INSERT INTO return_request_events(id,return_request_id,from_status,to_status,action,actor_id,actor_type,public_message_en,public_message_ne,internal_note,request_id,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,${clock})`).bind(eventId,row.caseId,row.caseStatus,caseStatus,'handling_'+input.action,ctx.actorId,authority.role,publicMessage,publicMessage,note,ctx.requestId),
  ...await caseBusinessNotificationStatements(db,{sourceType:'return_request',sourceId:row.caseId,eventId:ctx.requestId,actorId:ctx.actorId,action:'handling_'+input.action,now:row.now}),...authority.statements);
 if(form)statements.push(buildFormAnswerInsert(db,{formId:'staff.return-case-action',requestId:ctx.requestId,versionId:form.versionId,subjectType:'return_request',subjectId:row.caseId,actorId:ctx.actorId,answers:form.answers,now:row.now}));
 const result={id:row.caseId,revision:nextRevision,shipmentId,...(form?{formContextDigest:await digestFormRequest({versionId:form.versionId,answers:form.answers})}:{})};statements.push(receipt.insert(result));
 try{await db.batch(statements);}catch(error){const saved=await commandReceipt(db,ctx,{action:'return.handling.'+input.action,subjectType:'return_request',subjectId:input.caseId},payload);if(saved.replayed)return saved.result as typeof result;throw error;}
 return result;
}

export async function returnHandlingWorkspace(db:D1Database,caseId:string){
 const state=await getReturnHandling(db,caseId);if(!state)return null;
 const shipments=(await db.prepare('SELECT id,state,quantity,promised_at AS promisedAt,carrier_reference AS carrierReference,dispatched_at AS dispatchedAt,delivered_at AS deliveredAt FROM return_replacement_shipments WHERE case_id=? ORDER BY created_at,id').bind(caseId).all<{id:string;state:string;quantity:number;promisedAt:number;carrierReference:string|null;dispatchedAt:number|null;deliveredAt:number|null}>()).results;
 return {state,shipments};
}
export async function publicReturnHandling(db:D1Database,caseId:string){
 const workspace=await returnHandlingWorkspace(db,caseId);if(!workspace)return null;const h=workspace.state;
 const arrangements=(await db.prepare("SELECT details_json AS details FROM return_handling_events WHERE case_id=? AND action='arrange' ORDER BY revision DESC").bind(caseId).all<{details:string}>()).results.map(row=>JSON.parse(row.details) as {availabilityAt:number;remainingQuantity:number;instructions?:{reference:string;destination:string;method:string;packaging:string;fundedBy:string;customerChargePaisa:number}});
 const currentInstructions=arrangements.find(row=>row.instructions)?.instructions??(h.instructionsJson?JSON.parse(h.instructionsJson) as {reference?:string;destination:string;method:string;packaging:string;fundedBy:string;customerChargePaisa:number}:null);
 return {phase:h.caseStatus==='resolved'&&h.receivedQuantity+h.waivedQuantity<h.quantity?'unreconciled':h.phase,quantity:h.quantity,receivedQuantity:h.receivedQuantity,inspectedQuantity:h.inspectedQuantity,waivedQuantity:h.waivedQuantity,instructions:currentInstructions,arrangement:arrangements[0]?{availabilityAt:arrangements[0].availabilityAt,remainingQuantity:arrangements[0].remainingQuantity}:null,handoffDueAt:h.handoffDueAt,receivedAt:h.receivedAt,shipments:workspace.shipments};
}
export type ReturnHandlingWorkspace=Awaited<ReturnType<typeof returnHandlingWorkspace>>;
export type PublicReturnHandling=Awaited<ReturnType<typeof publicReturnHandling>>;
