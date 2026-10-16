import { env } from 'cloudflare:workers';
import { getCustomerUser, CustomerAuthorizationError } from '@/lib/auth/customer';
import { requireDatabase } from '@/lib/db/d1';
import { startSellerRegistration, SellerCommercialAccessError } from '@/lib/db/repositories/seller-commercial-access';
import { isTrustedMutationRequest } from '@/lib/http/request-security';
export const dynamic='force-dynamic';
const json=(body: unknown,status: number)=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store','Vary':'Cookie'}});
export async function POST(request: Request) {
  if (!isTrustedMutationRequest(request)) return json({error:'Cross-site requests are not allowed.'},403);
  try {
    const customer=await getCustomerUser();
    if (!customer) return json({error:'Sign in before starting seller registration.'},401);
    await startSellerRegistration(requireDatabase(env as unknown as {DB?: D1Database}),{userId:customer.userId,requestId:crypto.randomUUID(),now:Date.now()});
    return json({started:true},200);
  } catch (error) {
    if (error instanceof CustomerAuthorizationError) return json({error:error.message},error.status);
    if (error instanceof SellerCommercialAccessError) return json({error:error.message},403);
    return json({error:'Seller registration could not be started.'},503);
  }
}
