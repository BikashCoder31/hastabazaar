import { env } from 'cloudflare:workers';
import { redirect } from 'next/navigation';
import { getAuthenticatedUser, requireAuthenticatedUser } from '@/app/auth';
import { requireDatabase } from '@/lib/db/d1';
import { getSellerCommercialAccess } from '@/lib/db/repositories/seller-commercial-access';

export class SellerTermsAuthorizationError extends Error {
  constructor(message: string, readonly status: 401 | 403) { super(message); }
}
export async function getSellerTermsViewer() {
  const identity=await getAuthenticatedUser();
  if (!identity) return null;
  return getSellerCommercialAccess(requireDatabase(env as unknown as { DB?: D1Database }),identity.userId);
}
export async function requireSellerTermsPage(returnTo: string) {
  const identity=await requireAuthenticatedUser(returnTo);
  const viewer=await getSellerCommercialAccess(requireDatabase(env as unknown as { DB?: D1Database }),identity.userId);
  if (!viewer) redirect('/sell');
  return { ...viewer,identity };
}
export async function requireSellerTermsApi() {
  const identity=await getAuthenticatedUser();
  if (!identity) throw new SellerTermsAuthorizationError('Sign in and start seller registration to read seller terms.',401);
  const viewer=await getSellerCommercialAccess(requireDatabase(env as unknown as { DB?: D1Database }),identity.userId);
  if (!viewer) throw new SellerTermsAuthorizationError('Start seller registration to read seller terms.',403);
  return viewer;
}
