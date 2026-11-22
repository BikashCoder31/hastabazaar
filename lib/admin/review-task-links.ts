import type {ReviewQueueTask} from './review-queue-view';
import {withAdminReturnTo} from './return-context';

export function reviewTaskHref(task:ReviewQueueTask,returnTo:string){
 if('finance'in task)return withAdminReturnTo(task.finance.href,returnTo);
 let destination:string;
 if(task.sourceType==='system_incident')destination='/admin/system-health/incidents?incident='+encodeURIComponent(task.sourceId);
 else if(task.sourceType==='team_governance')destination='/admin/team/tasks/'+encodeURIComponent(task.sourceId);
 else if(task.sourceType==='recovery_claim')destination='/admin/payments/recoveries/claims/'+encodeURIComponent(task.sourceId);
 else if(task.sourceType==='recovery_contact'||task.sourceType==='recovery_review')destination='/admin/payments/recoveries/'+encodeURIComponent(task.sourceId);
 else if(task.sourceType==='return_request')destination='/admin/cases/returns/'+encodeURIComponent(task.sourceId);
 else if(task.sourceType==='complaint')destination='/admin/cases/complaints/'+encodeURIComponent(task.sourceId);
 else if(task.sourceType==='cancellation_review')destination='/admin/orders/'+encodeURIComponent(task.orderId!);
 else if(task.sourceType==='ncm_action')destination='/admin/orders/'+encodeURIComponent(task.orderId!)+'#ncm-timeline';
 else if(task.sourceType==='order_response')destination='/admin/order-responses/'+encodeURIComponent(task.sourceId);
 else if(task.sourceType==='payment_exception')destination='/admin/payments/exceptions/'+encodeURIComponent(task.sourceId);
 else if(task.sourceType==='payment_claim')destination='/admin/payments'+(task.orderId?'?order='+encodeURIComponent(task.orderId):'')+'#'+encodeURIComponent(task.sourceId);
 else if(task.sourceType==='product_priority')destination='/admin/products/concerns/'+encodeURIComponent(task.sourceId);
 else if(task.sourceType==='product_intake_review'&&['ready_for_decision','resolved'].includes(task.sourceStatus))destination='/admin/products/publications/'+encodeURIComponent(task.sourceId);
 else if(task.sourceType.startsWith('product_intake_'))destination='/admin/products/intakes/'+encodeURIComponent(task.sourceId);
 else if(task.sourceType==='commission_terms')destination='/admin/commission/terms#case-'+encodeURIComponent(task.sourceId);
 else if(task.sourceType==='company_account')destination='/admin/business-settings#company-bank-accounts';
 else{
  const base=task.sourceType==='product_review'?'/admin/products/'+encodeURIComponent(task.sourceId):task.sellerId?'/admin/sellers/'+encodeURIComponent(task.sellerId):'/admin/sellers';
  const anchor=task.sourceType==='seller_document'?'seller-evidence':task.sourceType==='seller_application'?'seller-decision':task.sourceType.startsWith('public_profile')?'public-profile':'seller-review-queue';
  destination=base+'#'+anchor;
 }
 return withAdminReturnTo(destination,returnTo);
}
