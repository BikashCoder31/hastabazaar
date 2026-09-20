import { redirect } from 'next/navigation';
import { requireAuthenticatedUser } from '@/app/auth';
import { getStaffUser } from '@/lib/auth/staff';
import { getSellerUser } from '@/lib/auth/seller';
import { defaultSignInDestination } from '@/lib/auth/sign-in-destination';

export const dynamic = 'force-dynamic';

export default async function ContinueSignInPage() {
  await requireAuthenticatedUser('/auth/continue');
  redirect(
    await defaultSignInDestination(
      async () => Boolean(await getStaffUser()),
      async () => Boolean(await getSellerUser()),
    ),
  );
}
