import {getCart} from '../db/repositories/cart';
import {getVerifiedCompanyReceivingAccount} from '../payments/company-accounts';

export interface CheckoutPaymentCapabilities{
 readonly cod:boolean;
 readonly manual_bank:boolean;
 readonly state:'ready'|'empty'|'cart_unavailable'|'unknown';
}
const unavailable=(state:CheckoutPaymentCapabilities['state']):CheckoutPaymentCapabilities=>({cod:false,manual_bank:false,state});

/** Actual current public cart eligibility; this never activates a seller or approves money.
 * Native checkout still rechecks contacts, prices, stock, holds, terms and bank source atomically.
 * An unavailable new-order method does not invalidate an already committed exact request replay.
 */
export async function readCheckoutPaymentCapabilities(db:D1Database,input:{cartHash:string|null;now?:number}):Promise<CheckoutPaymentCapabilities>{
 if(!input.cartHash)return unavailable('empty');
 let cart;try{cart=await getCart(db,input.cartHash);}catch{return unavailable('unknown');}
 if(!cart.items.length)return unavailable('empty');
 if(cart.hasUnavailableItems)return unavailable('cart_unavailable');
 // Validate the installed native lifecycle without reading or leaking customer/bank rows.
 const supported=async(sql:string)=>{try{await db.prepare(sql).all();return true;}catch{return false;}};
 const [cod,bankSchema]=await Promise.all([
  supported('SELECT f.order_id,p.collected_paisa,a.receipt_id FROM first_cod_reviews f LEFT JOIN shipping_parcels p ON 1=0 LEFT JOIN cod_company_receipt_allocations a ON 1=0 WHERE 1=0'),
  supported('SELECT i.account_version_id,w.deadline_at,c.order_id,a.receipt_use_id FROM company_payment_instructions i LEFT JOIN manual_payment_windows w ON 1=0 LEFT JOIN manual_payment_claims c ON 1=0 LEFT JOIN manual_payment_allocations a ON 1=0 WHERE 1=0'),
 ]);
 let manual_bank=false;
 if(bankSchema)try{manual_bank=Boolean(await getVerifiedCompanyReceivingAccount(db,input.now??Date.now()));}catch{ /* Unknown account state cannot enable bank instructions. */ }
 return{cod,manual_bank,state:cod||manual_bank?'ready':'unknown'};
}
