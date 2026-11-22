import {notificationAccessDenied} from '../operations/notification-client-events';

export const SELLER_ACCESS_EVENT='hb:seller-access-denied';
/** Conceal this Seller context only; customer/staff grants are independently checked. */
export function sellerAccessDenied(actorId:string){
 window.dispatchEvent(new CustomEvent(SELLER_ACCESS_EVENT,{detail:{actorId}}));
 notificationAccessDenied({accountId:actorId,workspace:'seller'});
}
