import {withAdminReturnTo} from '../admin/return-context';

/** A navigation pointer only; Incoming rechecks current authority and exact native relationships. */
export function incomingParcelHref(orderId:string,parcelId:string,remittanceId?:string,returnTo:unknown='/admin'){
 const query=new URLSearchParams({order:orderId,parcel:parcelId});
 if(remittanceId)query.set('remittance',remittanceId);
 return withAdminReturnTo('/admin/payments?'+query.toString()+'#cod-parcel-'+encodeURIComponent(parcelId),returnTo);
}
