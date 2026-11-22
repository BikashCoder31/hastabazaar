import {getAuthenticatedUser} from '@/app/auth';
import {hasActorIntentMismatch} from '@/lib/http/actor-intent';
import {readActionProof,prepareActionProof,type ActionReference} from '@/lib/orders/action-recovery';
import {readBoundedJsonObject} from '@/lib/http/form-json-body';
import { env } from 'cloudflare:workers';
import { sendPendingOrderUpdates } from '@/lib/email/send-order-updates';

import { requireSellerApi, SellerAuthorizationError, type SellerUser } from '@/lib/auth/seller';
import { requireDatabase } from '@/lib/db/d1';
import {
  FulfillmentConflictError,
  PackedParcelWeightError,
  transitionSellerFulfillment,
  type SellerFulfillmentAction,
} from '@/lib/db/repositories/fulfillment';
import { isTrustedMutationRequest } from '@/lib/http/request-security';

export const dynamic = 'force-dynamic';

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: { 'cache-control': 'no-store' } });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  if (!isTrustedMutationRequest(request)) return json({ error: 'Request origin was not accepted.' }, 403);
  let reference:ActionReference|undefined;
  let beforeWrite=true;
  let originalActor:SellerUser|undefined;
  try {
    const seller = request.headers.has('X-Hastabazaar-Actor')?await existingSeller(request):await requireSellerApi();
    originalActor=seller;
    if(hasActorIntentMismatch(request,seller.userId))throw new SellerAuthorizationError('The signed-in seller changed. Reopen this order.',403);
    const { id } = await context.params;
    const body = await readBoundedJsonObject(request);
    if(Object.keys(body).some(k=>!['action','note','requestId','itemIds','packedParcelWeightGrams'].includes(k))||typeof body.requestId!=='string'||!/^[a-zA-Z0-9:_-]{1,150}$/.test(body.requestId)||!Array.isArray(body.itemIds)||body.itemIds.some(id=>typeof id!=='string'))return json({error:'Refresh and keep the exact selected items and request reference.'},400);
    const action = body.action as SellerFulfillmentAction;
    if (!['start_packing', 'ready_for_pickup'].includes(action)) return json({ error: 'Invalid fulfilment action.' }, 400);
    const note = typeof body.note === 'string' ? body.note.trim() : '';
    if (note.length > 300) return json({ error: 'Note must be 300 characters or fewer.' }, 400);
    const db=requireDatabase(env as unknown as { DB?: D1Database });
    reference={actorId:seller.userId,sourceId:id,action,requestId:body.requestId};
    const original=await prepareActionProof(db,reference,seller.authSubject,body,Date.now(),seller.sellerId);
    if(original.replayed){await confirmActor(request,seller);return original.proof?json({ok:true,...original.proof}):json({error:'Original outcome remains unconfirmed.'},503);}
    beforeWrite=false;
    await transitionSellerFulfillment(
      db,
      {
        orderId: id,
        sellerId: seller.sellerId,
        actorId: seller.userId,
        action,
        note,
        requestId: body.requestId,
        itemIds:body.itemIds as string[],
        packedParcelWeightGrams: body.packedParcelWeightGrams,
        now: Date.now(), originalProof:original.atomic,
      },
    );
    await sendPendingOrderUpdates({ orderId: id });
    const proof=await readActionProof(db,reference,seller.authSubject);
    await confirmActor(request,seller);
    return proof?json({ok:true,...proof}):json({error:'Original outcome remains unconfirmed.'},503);
  } catch (error) {
    if(originalActor)try{await confirmActor(request,originalActor);}catch{ return json({error:'Seller access changed. Reopen this order.'},403);}
    if (error instanceof SellerAuthorizationError) return json({ error: error.message }, error.status);
    if (error instanceof PackedParcelWeightError) return json({ error: error.message, ...reference, recorded: false, phase: 'before_write' }, 400);
    if (error instanceof FulfillmentConflictError) return json({ error: error.message, ...(reference?{...reference,recorded:false,...(beforeWrite?{phase:'before_write'}:{})}:{}) }, 409);
    if(error instanceof Error&&(/constraint|order_.*held|Request reference was already used/.test(error.message)))return json({error:'The selected scope, hold or saved request changed. Keep your selection and refresh the current order.'},409);
    if (error instanceof SyntaxError) return json({ error: 'Invalid request.' }, 400);
    console.error('Seller fulfilment update failed', error);
    return json({ error: 'The fulfilment status could not be updated.' }, 500);
  }
}

async function confirmActor(request:Request,original:{userId:string;authSubject:string;sellerId:string}){
 const current=await existingSeller(request);
 if(current.userId!==original.userId||current.authSubject!==original.authSubject||current.sellerId!==original.sellerId||hasActorIntentMismatch(request,current.userId))throw new SellerAuthorizationError('Seller access changed. Reopen this order.',403);
}
export async function GET(request:Request,context:{params:Promise<{id:string}>}){
 let originalActor:SellerUser|undefined;
 try{
  const seller=await existingSeller(request);originalActor=seller;if(hasActorIntentMismatch(request,seller.userId))throw new SellerAuthorizationError('Seller access changed.',403);
  const sourceId=(await context.params).id,query=new URL(request.url).searchParams,requestId=query.get('requestId')??'',action=query.get('action')??'';
  if(!/^[a-zA-Z0-9:_-]{1,150}$/.test(requestId)||!['start_packing','ready_for_pickup'].includes(action))return json({error:'Invalid original reference.'},400);
  const db=requireDatabase(env as unknown as {DB?:D1Database});
  const owns=await db.prepare('SELECT 1 FROM order_items WHERE order_id=? AND seller_id=? LIMIT 1').bind(sourceId,seller.sellerId).first();
  const proof=owns?await readActionProof(db,{actorId:seller.userId,sourceId,requestId,action},seller.authSubject):null;
  await confirmActor(request,seller);return proof?json({ok:true,...proof}):json({error:'Original outcome remains unconfirmed.'},404);
 }catch(error){if(originalActor)try{await confirmActor(request,originalActor);}catch{return json({error:'Seller access changed. Reopen this order.'},403);}return json({error:error instanceof SellerAuthorizationError?error.message:'Original outcome remains unconfirmed.'},error instanceof SellerAuthorizationError?error.status:503);}
}

async function existingSeller(request:Request):Promise<SellerUser>{
 const identity=await getAuthenticatedUser({readOnly:true});if(!identity)throw new SellerAuthorizationError('Authentication is required.',401);
 const db=requireDatabase(env as unknown as {DB?:D1Database});
 const seller=await db.prepare(`SELECT u.id AS userId,u.auth_subject AS authSubject,s.id AS sellerId FROM users u JOIN seller_profiles s ON s.user_id=u.id JOIN user_roles r ON r.user_id=u.id AND r.role='seller' WHERE HEX(u.auth_subject)=HEX(?) AND u.status='active' AND s.status='approved' LIMIT 1`).bind(identity.userId).first<SellerUser>();
 if(!seller||hasActorIntentMismatch(request,seller.userId))throw new SellerAuthorizationError('Seller access changed. Reopen this order.',403);
 return seller;
}
