import type {OfferCartChoice} from './offer-cart';

export interface PendingOfferCartAction {input:OfferCartChoice;buyNow:boolean;label:string;}

/** Retains the existing public cart recovery format; the native route validates the command. */
export function readPendingOfferCartAction(raw:string|null|undefined,productId:string):PendingOfferCartAction|null{
 try{
  const saved=JSON.parse(raw??'null') as PendingOfferCartAction|null;
  return saved?.input?.productId===productId&&typeof saved.input.requestId==='string'&&typeof saved.buyNow==='boolean'&&typeof saved.label==='string'?saved:null;
 }catch{return null;}
}
