import { env } from 'cloudflare:workers';
import { requireDatabase } from '@/lib/db/d1';
import { getManagedMakerAuthority, ManagedMakerAuthorizationError } from '@/lib/managed-commerce/maker-authority';
export { ManagedMakerAuthorizationError };

async function resolveMaker(userId: string, authSubject: string) {
  const db = requireDatabase(env as unknown as { DB?: D1Database });
  return { ...await getManagedMakerAuthority(db, userId, Date.now()), authSubject };
}
export async function requireManagedMakerApi() {
  const { requireCustomerApi, CustomerAuthorizationError } = await import('@/lib/auth/customer');
  try {
    const customer = await requireCustomerApi();
    return await resolveMaker(customer.userId, customer.authSubject);
  } catch (error) {
    if (error instanceof CustomerAuthorizationError) throw new ManagedMakerAuthorizationError(error.message, error.status);
    throw error;
  }
}
export async function requireManagedMakerPage(returnTo: string) {
  const [{ requireCustomerPage }, { redirect }] = await Promise.all([import('@/lib/auth/customer'), import('next/navigation')]);
  const customer = await requireCustomerPage(returnTo);
  try { return await resolveMaker(customer.userId, customer.authSubject); }
  catch (error) { if (error instanceof ManagedMakerAuthorizationError) redirect('/sell/application'); throw error; }
}
