import { AdminPageTitle } from '@/components/admin/page-help';
import { ReturnCaseQueue, caseQueueFilter } from '@/components/admin/return-case-queue';
import { env } from 'cloudflare:workers';
import Link from 'next/link';
import { requireStaffPage } from '@/lib/auth/staff';
import { requireDatabase } from '@/lib/db/d1';
import { listReturnsForOperations } from '@/lib/db/repositories/returns';
import { listComplaintsForOperations } from '@/lib/db/repositories/complaints';

export const dynamic = 'force-dynamic';

export default async function AdminCasesPage({ searchParams }: {
  searchParams?: Promise<{ view?: string }>;
}) {
  await requireStaffPage('/admin/cases', 'support.manage');
  const database = requireDatabase(env as unknown as { DB?: D1Database });
  const [returns, complaints, query] = await Promise.all([
    listReturnsForOperations(database),
    listComplaintsForOperations(database),
    searchParams,
  ]);

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <AdminPageTitle>
          <h1 className="font-heading text-3xl tracking-tight">Care</h1>
        </AdminPageTitle>
        <Link href="/admin/cases/intake" className="inline-flex min-h-11 items-center text-sm font-semibold text-primary underline underline-offset-4">
          Record an earlier email or support request
        </Link>
      </header>
      <div className="max-w-3xl">
        <ReturnCaseQueue returns={returns} complaints={complaints} filter={caseQueueFilter(query?.view)} />
      </div>
    </div>
  );
}
