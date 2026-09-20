import { can, permissions, type PermissionSubject, type Permission } from '../marketplace/permissions';
export type NotificationAudience = 'customer' | 'seller' | 'staff';
/** Navigation only; each destination still authorizes the requested record. */
export function notificationDestination(workspace:NotificationAudience,audience:string,type:string|null,id:string|null,context?:{orderNumber?:string|null;productStatus?:string|null}):string|null {
 if(workspace!==audience||!id||!/^[a-zA-Z0-9_-]{1,160}$/.test(id))return null;
 if(workspace==='customer'&&['rider_profile','rider_report','rider_assignment'].includes(type??''))return '/rider';
 if(workspace==='customer'&&type==='gift_card')return '/account/wallet#credit-activity';
 if(workspace==='customer')return ['order','return_request','complaint'].includes(type??'')?(context?.orderNumber&&/^[a-zA-Z0-9_-]{1,160}$/.test(context.orderNumber)?'/orders/'+encodeURIComponent(context.orderNumber)+(type==='order'?'':'#aftercare-title'):'/account/orders'):['seller_application','seller_restriction'].includes(type??'')?'/sell/application':['account_status','account_status_active','account_status_disabled'].includes(type??'')?'/help':null;
 if(workspace==='staff') {
 if(type==='rider_profile'||type==='rider_report')return '/admin/riders';
 if(type==='gift_card_issued')return '/admin/gift-cards';
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
 if(type==='exception_work'&&!can(staff,'order.manage'))return false;
 if(requiredPermission != null)return (staff.role==='admin'||staff.role==='super_admin')&&permissions.includes(requiredPermission as Permission)&&can(staff,requiredPermission as Permission);
 const required:Record<string,Permission>={exception_work:'order.manage',order:'order.manage',product:'product.review',seller_application:'seller.application.review',return_request:'support.manage',complaint:'support.manage',payout:'payout.prepare',payout_request:'payout.prepare'};
 return (staff.role==='admin'||staff.role==='super_admin')&&!!type&&!!required[type]&&can(staff,required[type]);
}
