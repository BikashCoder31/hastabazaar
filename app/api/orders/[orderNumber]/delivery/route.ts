import {listParcels,customerParcel} from '@/lib/operations/parcels';
import {env} from 'cloudflare:workers';
import {getCustomerUser} from '@/lib/auth/customer';
import {requireDatabase} from '@/lib/db/d1';
import {getOrderReceipt} from '@/lib/db/repositories/orders';
import {getDelivery} from '@/lib/delivery/repository';
import {RECEIPT_COOKIE,hashOpaqueToken,readCookieHeader} from '@/lib/cart/session';
export const dynamic='force-dynamic';
export async function GET(request:Request,context:{params:Promise<{orderNumber:string}>}){
 const customer=await getCustomerUser();const token=readCookieHeader(request.headers.get('cookie'),RECEIPT_COOKIE);const {orderNumber}=await context.params;
 const db=requireDatabase(env as unknown as {DB?:D1Database});
 const receipt=await getOrderReceipt(db,orderNumber,token?await hashOpaqueToken(token):null,customer?.userId??null);
 if(!receipt)return Response.json({error:'Order not found.'},{status:404,headers:{'Cache-Control':'no-store'}});
 const order=await db.prepare('SELECT id FROM orders WHERE order_number=?').bind(orderNumber).first<{id:string}>();
 return Response.json({parcels:order?(await listParcels(db,order.id)).map(p=>customerParcel(p)):[],delivery:order?await getDelivery(db,order.id):null},{headers:{'Cache-Control':'private, no-store'}});
}
