import { env } from 'cloudflare:workers';
import { getCustomerUser } from '@/lib/auth/customer';
import { RECEIPT_COOKIE, hashOpaqueToken, readCookieHeader } from '@/lib/cart/session';
import { requireDatabase } from '@/lib/db/d1';
import { getOrderDocument } from '@/lib/db/repositories/orders';
import { mayApplyCompanyStamp } from '@/lib/documents/company-stamp';
import { APPROVED_BILLING_VERSION } from '@/lib/documents/billing';
// This data is imported only by authenticated server routes and the gated local preview.
import stamp from '@/lib/documents/company-stamp-data.json';

export const dynamic='force-dynamic';
const privateHeaders={'cache-control':'private, no-store','x-content-type-options':'nosniff'};
const unavailable=()=>new Response(null,{status:404,headers:privateHeaders});

export async function GET(request:Request,{params}:{params:Promise<{orderNumber:string;id:string}>}) {
  const {orderNumber,id}=await params;
  const token=readCookieHeader(request.headers.get('cookie'),RECEIPT_COOKIE);
  const customer=await getCustomerUser();
  if(!token&&!customer)return unavailable();
  const document=await getOrderDocument(requireDatabase(env as unknown as {DB?:D1Database}),orderNumber,id,
    token?await hashOpaqueToken(token):null,customer?.userId??null);
  const key=new URL(request.url).searchParams.get('receipt');
  const group=document?.snapshot.billing?.receiptGroups?.find(item=>item.key===key);
  if(!document||document.kind!=='payment_receipt'||document.status!=='issued'||document.snapshot.paymentStatus!=='paid'||
    document.snapshot.billing?.version!==APPROVED_BILLING_VERSION||document.snapshot.billing.receiptIssuance!=='simulation'||
    !group||!group.billSequence||!mayApplyCompanyStamp(group))
    return unavailable();
  return new Response(Uint8Array.from(atob(stamp.base64),value=>value.charCodeAt(0)),{
    headers:{'content-type':stamp.mimeType,...privateHeaders},
  });
}
