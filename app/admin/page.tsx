import { env } from 'cloudflare:workers';
import Link from 'next/link';
import { ArrowRight, CircleAlert, PackageCheck, Store, UserRoundCheck } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { requireStaffPage } from '@/lib/auth/staff';
import { requireDatabase } from '@/lib/db/d1';
import { getAdminDashboardStats } from '@/lib/db/repositories/seller-applications';

export const dynamic = 'force-dynamic';

export default async function AdminDashboardPage() {
  await requireStaffPage('/admin');
  const stats = await getAdminDashboardStats(
    requireDatabase(env as unknown as { DB?: D1Database }),
  );
  const cards = [
    { label: 'New seller applications', value: stats.submittedSellers, icon: Store },
    { label: 'Sellers under review', value: stats.sellersUnderReview, icon: UserRoundCheck },
    { label: 'Applications needing changes', value: stats.sellersNeedingChanges, icon: CircleAlert },
    { label: 'Approved sellers', value: stats.approvedSellers, icon: UserRoundCheck },
    { label: 'Products awaiting review', value: stats.pendingProducts, icon: PackageCheck },
    { label: 'Open support complaints', value: stats.openComplaints, icon: CircleAlert },
  ];

  return (
    <div className="space-y-8">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <p className="eyebrow">Today’s work</p>
          <h1 className="mt-2 font-heading text-4xl tracking-tight">Operations overview</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Review seller evidence, approve only complete applications, and keep every decision traceable.
          </p>
        </div>
        <Link href="/admin/sellers" className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline">
          Open seller queue <ArrowRight className="size-4" />
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map(({ label, value, icon: Icon }) => (
          <Card key={label}>
            <CardHeader className="grid grid-cols-[1fr_auto] items-center">
              <CardTitle className="font-sans text-sm text-muted-foreground">{label}</CardTitle>
              <Icon className="size-5 text-primary" />
            </CardHeader>
            <CardContent>
              <p className="font-heading text-4xl tabular-nums">{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Control principles</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 text-sm leading-6 text-muted-foreground md:grid-cols-3">
          <p><strong className="text-foreground">Verify first.</strong> Check registration, tax and representative identity documents before approval.</p>
          <p><strong className="text-foreground">Explain every decision.</strong> Review notes are retained in moderation and audit history.</p>
          <p><strong className="text-foreground">Separate authority.</strong> Only Super Admins can grant staff access or change major controls.</p>
        </CardContent>
      </Card>
    </div>
  );
}
