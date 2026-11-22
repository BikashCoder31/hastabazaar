import { env } from 'cloudflare:workers';
import { redirect } from 'next/navigation';
import { getAuthenticatedUser, requireAuthenticatedUser } from '@/app/auth';
import { requireDatabase } from '@/lib/db/d1';
import { getSellerCenterAccess } from '@/lib/db/repositories/seller-center-access';
import { getSellerUser } from './seller';

export class SellerCenterAuthorizationError extends Error {
  constructor(message: string, readonly status: 401|403) { super(message); }
}
/** Exact existing owner only; no account provisioning or commercial permission grant. */
export async function requireSellerCenterApi() {
  const identity=await getAuthenticatedUser({readOnly:true});
  if(!identity) throw new SellerCenterAuthorizationError('Sign in to continue your registration.',401);
  const viewer=await getSellerCenterAccess(requireDatabase(env as unknown as {DB?:D1Database}),identity.userId);
  if(!viewer) throw new SellerCenterAuthorizationError('Current registration access is required.',403);
  return viewer;
}

/** Page-shell access only. Existing action handlers still require their own current authority. */
export async function requireSellerCenterPage(returnTo: string) {
  const identity = await requireAuthenticatedUser(returnTo);
  const db = requireDatabase(env as unknown as { DB?: D1Database });
  const viewer = await getSellerCenterAccess(db, identity.userId);
  if (viewer) return viewer;
  // Preserve the existing approved-account sign-in binding path, without extending it to applicants.
  const seller = await getSellerUser();
  if (seller) return { ...seller, approvedSeller: true };
  redirect('/sell');
}
