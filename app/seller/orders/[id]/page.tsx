import { env } from 'cloudflare:workers';
import { requireSellerCenterPage } from '@/lib/auth/seller-center';
import { requireDatabase } from '@/lib/db/d1';
import { SellerOrderDetail } from '../order-detail';

export const dynamic = 'force-dynamic';

export default async function SellerOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const seller = await requireSellerCenterPage(`/seller/orders/${id}`);
  const db = requireDatabase(env as unknown as { DB?: D1Database });
  return SellerOrderDetail({ id, seller, db });
}
