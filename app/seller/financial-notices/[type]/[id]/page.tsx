import { env } from 'cloudflare:workers';
import { notFound } from 'next/navigation';
import { requireDatabase } from '@/lib/db/d1';
import { requireSellerCenterPage } from '@/lib/auth/seller-center';
import { FinancialNoticeRecord } from '@/components/commerce/financial-notice-record';
import {
  readFinancialNoticeDestination,
  FinancialNoticeAccessError,
} from '@/lib/operations/financial-notice-destination';
export const dynamic = 'force-dynamic';
export default async function FinancialNoticePage({
  params,
}: {
  params: Promise<{ type: string; id: string }>;
}) {
  const { type, id } = await params,
    path =
      '/seller/financial-notices/' +
      encodeURIComponent(type) +
      '/' +
      encodeURIComponent(id),
    actor = await requireSellerCenterPage(path);
  let record: Awaited<ReturnType<typeof readFinancialNoticeDestination>>;
  try {
    record = await readFinancialNoticeDestination(
      requireDatabase(env as unknown as { DB?: D1Database }),
      { actorId: actor.userId, audience: 'seller', type, id },
    );
    if (!record) notFound();
  } catch (error) {
    if (error instanceof FinancialNoticeAccessError) notFound();
    throw error;
  }
  return <FinancialNoticeRecord record={record} />;
}
