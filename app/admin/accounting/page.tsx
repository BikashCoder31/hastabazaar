import { env } from 'cloudflare:workers';
import {
  AccountingFilterError,
  AccountingWorkspaceView,
} from '@/components/admin/accounting-workspace';
import { requireAccountingPageReader } from '@/lib/accounting/access';
import {
  AccountingValidationError,
  parseAccountingQuery,
} from '@/lib/accounting/filters';
import { getAccountingWorkspace } from '@/lib/accounting/workspace';
import { accountingEnvironment } from '@/lib/accounting/environment';
import { requireDatabase } from '@/lib/db/d1';
import { getEffectiveBusinessSetting } from '@/lib/db/repositories/business-settings';
export const dynamic = 'force-dynamic';
export default async function AccountingPage({
  searchParams = Promise.resolve({}),
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
} = {}) {
  await requireAccountingPageReader();
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams))
    for (const v of Array.isArray(value)
      ? value
      : value === undefined
        ? []
        : [value])
      params.append(key, v);
  const now = new Date().getTime();
  let query;
  try {
    query = parseAccountingQuery(params, now);
  } catch (error) {
    if (error instanceof AccountingValidationError)
      return <AccountingFilterError message={error.message} />;
    throw error;
  }
  const db = requireDatabase(env as unknown as { DB?: D1Database });
  const rates = Promise.all([
    getEffectiveBusinessSetting(db, 'independent_seller_commission_bps', now),
    getEffectiveBusinessSetting(db, 'managed_sale_linked_platform_retention_bps', now),
  ]).then(([sellerRate,makerRate]) => ({sellerCommissionBps:sellerRate.value, managedRetentionBps:makerRate.value, observedAt:now}))
    .catch(() => null);
  const [workspace, currentRates] = await Promise.all([
    getAccountingWorkspace(
    db,
    query,
    now,
    accountingEnvironment(env),
    ),
    rates,
  ]);
  return <AccountingWorkspaceView workspace={workspace} currentRates={currentRates} />;
}
