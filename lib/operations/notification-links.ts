import {financialNotificationDestination} from './financial-notice-links';
import { isRiderPortalEnabled } from '../riders/availability';
import { can, permissions, type PermissionSubject, type Permission } from '../marketplace/permissions';
export type NotificationAudience = 'customer' | 'seller' | 'staff';
/** Navigation only; each destination still authorizes the requested record. */
export function notificationDestination(workspace:NotificationAudience,audience:string,type:string|null,id:string|null,context?:{orderNumber?:string|null;productStatus?:string|null;requiredPermission?:string|null}):string|null {
 if(workspace==='staff'&&audience==='staff'&&type==='form_configuration'&&id&&/^[a-z][a-z0-9_-]*(\.[a-z0-9_-]+){1,3}$/.test(id))return '/admin/forms/'+encodeURIComponent(id);
 if(type==='order_response_event'&&workspace===audience&&id&&/^[a-zA-Z0-9:_-]{1,240}$/.test(id))return '/'+(workspace==='staff'?'admin':workspace==='seller'?'seller':'account')+'/order-responses/'+encodeURIComponent(id);
 if(workspace!==audience||!id||!/^[a-zA-Z0-9_-]{1,160}$/.test(id))return null;
 if(type==='email_service_health')return workspace==='staff'?'/admin/system-health/incidents?incident='+encodeURIComponent(id):null;
 if(type==='team_governance_event'||type==='service_incident_event'||type==='review_task_assignment')return workspace==='staff'?'/admin/operational-notices/'+type+'/'+encodeURIComponent(id):null;
 if(type==='operational_reminder')return '/'+(workspace==='staff'?'admin':workspace==='customer'?'account':'seller')+'/reminders/'+encodeURIComponent(id);
 const financial=type?financialNotificationDestination(workspace,type,id):undefined;if(financial!==undefined)return financial;
 if(type==='managed_live_activation')return workspace==='staff'?'/admin/sellers?liveActivation='+encodeURIComponent(id):workspace==='seller'?'/seller':null;
 if(type==='receipt_return_bank_loss'||type==='receipt_return_bank_satisfaction')return workspace==='staff'?'/admin/payments/refunds?'+(type==='receipt_return_bank_loss'?'returnLoss=':'returnSatisfaction=')+encodeURIComponent(id):workspace==='customer'?'/account/refunds':null;
 if(type==='payment_exception')return workspace==='staff'?'/admin/payments/exceptions/'+encodeURIComponent(id):null;
 if(type==='seller_recovery_claim')return workspace==='staff'?'/admin/payments/recoveries/claims/'+encodeURIComponent(id):workspace==='seller'?'/seller/finance/recoveries/claims/'+encodeURIComponent(id):null;
 if(type==='seller_recovery')return workspace==='staff'?'/admin/payments/recoveries/'+encodeURIComponent(id):workspace==='seller'?'/seller/finance/recoveries/'+encodeURIComponent(id):null;
 if(type==='order_payment')return workspace==='staff'?'/admin/payments/orders/'+encodeURIComponent(id):workspace==='customer'?'/account/payments/'+encodeURIComponent(id):null;
 if(type==='commission_policy')return workspace==='staff'?'/admin/commission#rate-management':null;
 if(type==='product_priority')return workspace==='staff'?'/admin/products/concerns/'+encodeURIComponent(id):workspace==='seller'?'/seller/products/concerns/'+encodeURIComponent(id):null;
 if(type==='product_availability')return workspace==='staff'?'/admin/products/'+encodeURIComponent(id)+'/availability':workspace==='seller'?'/seller/products/'+encodeURIComponent(id)+'/availability':null;
 if(type==='product_intake')return workspace==='staff'?(context?.requiredPermission==='product.publish'?'/admin/products/publications/':'/admin/products/intakes/')+encodeURIComponent(id):workspace==='seller'?'/seller/products/intakes/'+encodeURIComponent(id):null;
 if(type==='product_discount_advisory')return workspace==='staff'?'/admin/products?pricingSuggestion='+encodeURIComponent(id):workspace==='seller'?'/seller/products?pricingSuggestion='+encodeURIComponent(id):null;
 if(type==='commission_terms_event')return workspace==='staff'?'/admin/commission/terms':workspace==='seller'?'/seller#selling-fee-terms':null;
 if(type==='commission_terms_batch')return workspace==='staff'?'/admin/commission/terms':null;
 if(type==='category_policy')return workspace==='staff'?'/admin/catalog?category='+encodeURIComponent(id)+'#category-policy':null;
 if(type==='company_payment_account')return workspace==='staff'?'/admin/business-settings#company-account-'+encodeURIComponent(id):null;
 if(type==='seller_public_profile'||type==='seller_support_contact')return workspace==='staff'?'/admin/sellers/'+encodeURIComponent(id)+'#public-profile':workspace==='seller'?'/seller/profile':null;
 if(type==='seller_profile_correction')return workspace==='staff'?'/admin/seller-profile-corrections/'+encodeURIComponent(id):workspace==='seller'?'/seller/profile':null;
 if(type==='seller_payout_fix')return workspace==='seller'?'/seller/registration#seller-payout-fixes':null;
 if(type==='seller_document_change')return workspace==='staff'?'/admin/seller-document-change-requests/'+encodeURIComponent(id):workspace==='seller'?'/seller/registration#request-'+encodeURIComponent(id):null;
 if(type==='seller_protected_change')return workspace==='staff'?'/admin/seller-protected-changes/'+encodeURIComponent(id):workspace==='seller'?'/seller/requests/changes/'+encodeURIComponent(id):null;
 if(type==='seller_document')return workspace==='staff'?'/admin/seller-documents/'+encodeURIComponent(id)+'/review':workspace==='seller'?'/seller/registration#document-'+encodeURIComponent(id):null;
 if(type==='seller_bank_document')return workspace==='seller'?'/seller/finance#seller-bank-evidence':null;
 if(type==='seller_registered_payout_fixes')return workspace==='seller'?'/seller/registration#seller-payout-fixes':null;
 if(type==='seller_registered_application')return workspace==='seller'?'/seller/products/new':null;
 if(workspace==='customer'&&['rider_profile','rider_report','rider_assignment'].includes(type??''))return isRiderPortalEnabled() ? '/rider' : null;
 if(workspace==='customer'&&type==='gift_card')return '/account/wallet?giftId='+encodeURIComponent(id)+'#gift-record-'+encodeURIComponent(id);
 if(workspace==='customer')return ['order','return_request','complaint'].includes(type??'')?(context?.orderNumber&&/^[a-zA-Z0-9_-]{1,160}$/.test(context.orderNumber)?'/orders/'+encodeURIComponent(context.orderNumber)+(type==='order'?'':'#aftercare-title'):'/account/orders'):['seller_application','seller_restriction'].includes(type??'')?'/sell/application':['account_status','account_status_active','account_status_disabled'].includes(type??'')?'/help':null;
 if(workspace==='staff') {
 if(type==='account_status_active'||type==='account_status_disabled')return '/admin/team';
 if(type==='rider_profile'||type==='rider_report')return '/admin/riders';
 if(type==='gift_card_issued'||type==='gift_card')return '/admin/gift-cards?giftId='+encodeURIComponent(id)+'#gift-record-'+encodeURIComponent(id);
 if(type==='promotion'||type==='operational_incident')return '/admin/governance';
 if(type==='exception_work')return '/admin/exceptions';
 if(type==='staff_permission')return '/admin';
 if(type==='staff_permission_request')return '/admin/team';
 if(type==='delivery_rate_version')return '/admin/orders';
 if(type==='payout_request')return '/admin/payouts';
 const staffRoots:Record<string,string>={order:'/admin/orders/',product:'/admin/products/',seller_application:'/admin/sellers/',return_request:'/admin/cases/returns/',complaint:'/admin/cases/complaints/',payout:'/admin/payouts/'};
 return type&&staffRoots[type]?staffRoots[type]+encodeURIComponent(id):null;
 }
 const roots:Record<string,string>={order:'/seller/orders/',product:'/seller/products/',return_request:'/seller/cases/returns/',complaint:'/seller/cases/complaints/'};
 if(type==='product')return context?.productStatus==='needs_changes'?'/seller/products/'+encodeURIComponent(id)+'/edit':'/seller/products#product-'+encodeURIComponent(id);
 if(type==='payout'||type==='payout_request')return '/seller/finance';
 return type&&roots[type]?roots[type]+encodeURIComponent(id)+(type==='product'?'/edit':''):null;
}

export function canViewStaffNotification(staff:PermissionSubject,type:string|null,requiredPermission?:string|null):boolean {
 if(type==='managed_live_activation'&&staff.role!=='super_admin')return false;
 if(type==='receipt_return_bank_loss'||type==='receipt_return_bank_satisfaction')return (staff.role==='admin'||staff.role==='super_admin')&&can(staff,'refund.approve.standard');
 if(type==='seller_recovery'||type==='seller_recovery_claim')return (staff.role==='admin'||staff.role==='super_admin')&&can(staff,'payout.prepare');
 if(['company_payment_account','product_availability'].includes(type??'')&&staff.role!=='super_admin')return false;
 if(['seller_document','seller_document_change','seller_protected_change','seller_public_profile','seller_profile_correction'].includes(type??'') && staff.role!=='super_admin')return false;
 if(['rider_profile','rider_report','rider_assignment'].includes(type??'') && staff.role!=='super_admin')return false;

 if(type==='exception_work'&&!can(staff,'order.manage'))return false;
 if(requiredPermission != null)return (staff.role==='admin'||staff.role==='super_admin')&&permissions.includes(requiredPermission as Permission)&&can(staff,requiredPermission as Permission);
 const required:Record<string,Permission>={exception_work:'order.manage',order:'order.manage',product:'product.review',seller_application:'seller.application.review',return_request:'support.manage',complaint:'support.manage',payout:'payout.prepare',payout_request:'payout.prepare'};
 return (staff.role==='admin'||staff.role==='super_admin')&&!!type&&!!required[type]&&can(staff,required[type]);
}
