import { AdminPageTitle } from '@/components/admin/page-help';
import { fieldDisplay } from '@/components/forms/configured-fields';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { env } from 'cloudflare:workers';
import { requireStaffPage } from '@/lib/auth/staff';
import { loadQueryPresentationConfig } from '@/lib/catalog/shop-query';
import { requireDatabase } from '@/lib/db/d1';
import { SupportedCaseIntake } from '@/components/admin/supported-case-intake';

export const dynamic = 'force-dynamic';

export default async function SupportedCaseIntakePage({
  searchParams,
}: {
  searchParams: Promise<{ order?: string }>;
}) {
  const staff = await requireStaffPage('/admin/cases/intake', 'support.manage');
  const { order } = await searchParams;
  const db = requireDatabase(env as unknown as { DB?: D1Database });
  const [lookup, found] = await Promise.all([
    loadQueryPresentationConfig(db, 'staff.case-intake-order'),
    order
      ? db
          .prepare(
            'SELECT id,order_number AS orderNumber FROM orders WHERE order_number=?',
          )
          .bind(order)
          .first<{ id: string; orderNumber: string }>()
      : null,
  ]);
  const display = fieldDisplay(lookup.config, 'order');
  const items = found
    ? (
        await db
          .prepare(`SELECT id,product_name_snapshot AS name,quantity,fulfillment_status AS status
    FROM order_items WHERE order_id=? ORDER BY created_at,id`)
          .bind(found.id)
          .all<{ id: string; name: string; quantity: number; status: string }>()
      ).results
    : [];

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <AdminPageTitle>
        <h1 className="section-title">Record a supported customer request</h1>
      </AdminPageTitle>
      <p>
        Retain the first email or help-channel receipt and its source evidence.
        A later staff entry does not replace the original request time.
      </p>
      <form
        data-form-id="staff.case-intake-order"
        method="get"
        action="/admin/cases/intake"
        className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end"
      >
        <label className="min-w-0 text-sm font-medium">
          {display?.label && display.label !== 'order'
            ? display.label
            : 'Original order number'}
          <Input
            name="order"
            required
            defaultValue={order ?? ''}
            placeholder={display?.placeholder}
            aria-describedby={display?.helpText ? 'case-order-help' : undefined}
            className="mt-1 min-h-11"
          />
        </label>
        <Button type="submit" variant="workspace-primary" size="workspace">
          Find order
        </Button>
        {display?.helpText ? (
          <p
            id="case-order-help"
            className="text-sm text-muted-foreground md:col-span-2"
          >
            {display.helpText}
          </p>
        ) : null}
      </form>
      {lookup.unavailable ? (
        <p className="text-sm text-muted-foreground">
          Saved lookup labels are unavailable. You can still search using the
          original order number.
        </p>
      ) : null}
      {found ? (
        <SupportedCaseIntake
          actorId={staff.id}
          orderNumber={found.orderNumber}
          items={items}
        />
      ) : order ? (
        <p>The original order was not found.</p>
      ) : null}
    </div>
  );
}
