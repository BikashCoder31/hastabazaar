import { redirect } from 'next/navigation';
import { requireAuthenticatedUser } from '@/app/auth';
import { getStaffUser } from '@/lib/auth/staff';
import { getSellerUser } from '@/lib/auth/seller';
import { defaultSignInDestination, safeSignInReturnPath } from '@/lib/auth/sign-in-destination';

export const dynamic = 'force-dynamic';

export default async function ContinueSignInPage({
  searchParams = Promise.resolve({}),
}: {
  searchParams?: Promise<{ return_to?: string | string[] }>;
} = {}) {
  const query = await searchParams;
  const requested = safeSignInReturnPath(typeof query.return_to === 'string' ? query.return_to : undefined);
  const returnTo = new URL(requested, 'https://app.local').pathname.replace(/\/+$/, '') === '/auth/continue'
    ? '/auth/continue' : requested;
  await requireAuthenticatedUser(returnTo);
  if (returnTo !== '/auth/continue') redirect(returnTo);
  redirect(
    await defaultSignInDestination(
      async () => Boolean(await getStaffUser()),
      async () => Boolean(await getSellerUser()),
    ),
  );
}
