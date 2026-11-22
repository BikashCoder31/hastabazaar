import type {NotificationAudience} from './notification-links';
export interface NotificationClientScope{accountId:string;workspace:NotificationAudience;}
export const NOTIFICATION_READ_EVENT='hastabazaar:notification-read';
export const NOTIFICATION_ACCESS_EVENT='hastabazaar:notification-access-denied';
export const CUSTOMER_ACCOUNT_ACCESS_EVENT='hb:account-access-denied';
export function matchingNotificationScope(event:Event,scope:NotificationClientScope){
 const detail=(event as CustomEvent<NotificationClientScope&{id?:string;all?:boolean}>).detail;
 return detail?.accountId===scope.accountId&&detail?.workspace===scope.workspace?detail:null;
}
export function matchingCustomerAccountDenial(event:Event,scope:NotificationClientScope){
 return scope.workspace==='customer'&&(event as CustomEvent<{actorId?:unknown}>).detail?.actorId===scope.accountId;
}
export function notificationAccessDenied(scope:NotificationClientScope){
 window.dispatchEvent(new CustomEvent(NOTIFICATION_ACCESS_EVENT,{detail:scope}));
 if(scope.workspace==='customer')window.dispatchEvent(new CustomEvent(CUSTOMER_ACCOUNT_ACCESS_EVENT,{detail:{actorId:scope.accountId}}));
}
