import { env } from 'cloudflare:workers';
import { requireSellerPage } from '@/lib/auth/seller';
import { requireDatabase } from '@/lib/db/d1';
import { SellerReturnDetail } from '../../return-detail';

export const dynamic = 'force-dynamic';

export default async function SellerReturnCasePage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ historyAt?: string; historyId?: string }>;
}) {
  const { id } = await params;
  const [seller, query] = await Promise.all([requireSellerPage(`/seller/cases/returns/${id}`), searchParams]);
  const db = requireDatabase(env as unknown as { DB?: D1Database });
  return SellerReturnDetail({ id, seller, db, query });
}
