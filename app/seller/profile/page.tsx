import { env } from 'cloudflare:workers';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { LockKeyhole } from 'lucide-react';
import { SellerProfileForm } from '@/components/seller/seller-profile-form';
import { SellerHeading } from '@/components/seller/workspace-ui';
import { requireSellerPage } from '@/lib/auth/seller';
import { requireDatabase } from '@/lib/db/d1';
import { getEditableSellerProfile } from '@/lib/db/repositories/seller-profile';
export const dynamic = 'force-dynamic';

export default async function SellerProfilePage() {
  const seller = await requireSellerPage('/seller/profile');
  const profile = await getEditableSellerProfile(
    requireDatabase(env as unknown as { DB?: D1Database }),
    seller.sellerId,
  );
  if (!profile) notFound();
  return (
    <div>
      <SellerHeading
        eyebrow="Maker presence"
        title="Shop profile"
        description="Tell customers about your craft and keep your public support details current."
      >
        <Link href={'/makers/' + seller.sellerId} className="section-link">
          View public shop →
        </Link>
      </SellerHeading>
      <div className="mt-6 flex items-start gap-3 rounded-xl border bg-secondary/70 p-4 text-sm leading-6">
        <LockKeyhole className="mt-1 size-5 shrink-0 text-primary" />
        <p>
          Registration, tax, and payout details remain locked to your reviewed
          application. Changes need verification by HastaBazaar operations.
        </p>
      </div>
      <SellerProfileForm profile={profile} />
    </div>
  );
}
