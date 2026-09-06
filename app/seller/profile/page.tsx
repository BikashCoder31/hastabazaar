import { env } from 'cloudflare:workers';
import { notFound } from 'next/navigation';

import { SellerProfileForm } from '@/components/seller/seller-profile-form';
import { requireSellerPage } from '@/lib/auth/seller';
import { requireDatabase } from '@/lib/db/d1';
import { getEditableSellerProfile } from '@/lib/db/repositories/seller-profile';

export default async function SellerProfilePage() { const seller = await requireSellerPage('/seller/profile'); const profile = await getEditableSellerProfile(requireDatabase(env as unknown as { DB?: D1Database }), seller.sellerId); if (!profile) notFound(); return <div><p className="eyebrow">Public maker presence</p><h1 className="mt-2 font-heading text-4xl">Seller profile</h1><p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">Keep your public maker story and customer-support contact current without changing reviewed legal or payout records.</p><SellerProfileForm profile={profile} /></div>; }
